import {
  Scene,
  FreeCamera,
  HemisphericLight,
  DirectionalLight,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Color4,
  Vector3,
} from "@babylonjs/core";
import * as ui from "../ui/ui.js";
import { getCameraProfile } from "../utils/responsive.js";
import { CONFIG, computePayout } from "../config/index.js";

// ===== Costanti di gioco (da config statica) =====
const G = CONFIG.gameplay;
const LANES = G.lanes; // posizioni x delle 3 corsie
const LANE_LERP = G.laneChangeSpeed; // velocità di cambio corsia
const GRAVITY = G.gravity;
const JUMP_SPEED = G.jumpSpeed;
const START_SPEED = G.startSpeed; // unità/s in avanti (mondo che scorre)
const MAX_SPEED = G.maxSpeed;
const ACCEL = G.acceleration; // incremento velocità nel tempo
const SPAWN_AHEAD = G.spawnAhead; // distanza a cui vengono generati gli oggetti
const DESPAWN_BEHIND = -12; // dietro la camera -> riciclo/rimozione (interno)
const ROW_GAP = G.rowGap; // distanza tra le "righe" di ostacoli/monete

export function createGameScene({ engine, canvas, goto }) {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.53, 0.81, 0.92, 1); // cielo azzurro

  // ---- Camera (dietro il player, adattata al dispositivo) ----
  const cam = getCameraProfile();
  const camera = new FreeCamera("gameCam", new Vector3(0, cam.height, -cam.distance), scene);
  camera.fov = cam.fov;

  // ---- Luci (leggere: hemispheric + una direzionale, niente ombre) ----
  const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.85;
  const sun = new DirectionalLight("sun", new Vector3(-0.4, -1, 0.6), scene);
  sun.intensity = 0.6;

  // ---- Materiali condivisi (riuso => meno draw call/allocazioni) ----
  const groundMat = new StandardMaterial("groundMat", scene);
  groundMat.diffuseColor = new Color3(0.36, 0.55, 0.32);
  groundMat.specularColor = new Color3(0, 0, 0);

  const stripeMat = new StandardMaterial("stripeMat", scene);
  stripeMat.diffuseColor = new Color3(0.9, 0.9, 0.9);
  stripeMat.specularColor = new Color3(0, 0, 0);

  const obstacleMat = new StandardMaterial("obstacleMat", scene);
  obstacleMat.diffuseColor = new Color3(0.85, 0.2, 0.25);
  obstacleMat.specularColor = new Color3(0, 0, 0);

  const coinMat = new StandardMaterial("coinMat", scene);
  coinMat.diffuseColor = new Color3(0.98, 0.75, 0.15);
  coinMat.emissiveColor = new Color3(0.4, 0.3, 0.0);
  coinMat.specularColor = new Color3(0, 0, 0);

  // ---- Player ----
  const player = MeshBuilder.CreateCapsule("player", { radius: 0.5, height: 1.6 }, scene);
  const playerMat = new StandardMaterial("playerMat", scene);
  playerMat.diffuseColor = new Color3(0.22, 0.5, 0.95);
  playerMat.specularColor = new Color3(0.1, 0.1, 0.1);
  player.material = playerMat;
  player.position.set(0, 0.8, 0);

  // ---- Pista: segmenti di terreno riciclati per effetto infinito ----
  const TILE_LEN = 30;
  const NUM_TILES = 4;
  const tiles = [];
  for (let i = 0; i < NUM_TILES; i++) {
    const t = MeshBuilder.CreateBox("tile" + i, { width: 8, height: 0.5, depth: TILE_LEN }, scene);
    t.material = groundMat;
    t.position.set(0, -0.25, i * TILE_LEN);
    tiles.push(t);
  }

  // ---- Strisce laterali in movimento (senso di velocità) ----
  const stripes = [];
  for (let i = 0; i < 20; i++) {
    const s = MeshBuilder.CreateBox("stripe" + i, { width: 0.15, height: 0.02, depth: 2 }, scene);
    s.material = stripeMat;
    const side = i % 2 === 0 ? -3.6 : 3.6;
    s.position.set(side, 0.02, i * 4);
    stripes.push(s);
  }

  // ---- Pool ostacoli e monete ----
  function makeObstacle(i) {
    const o = MeshBuilder.CreateBox("obs" + i, { width: 1.4, height: 1.4, depth: 1.4 }, scene);
    o.material = obstacleMat;
    o.setEnabled(false);
    return { mesh: o, active: false, lane: 0, type: "obstacle" };
  }
  function makeCoin(i) {
    const c = MeshBuilder.CreateCylinder("coin" + i, { diameter: 0.8, height: 0.12, tessellation: 16 }, scene);
    c.material = coinMat;
    c.rotation.z = Math.PI / 2;
    c.setEnabled(false);
    return { mesh: c, active: false, lane: 0, type: "coin" };
  }
  const obstacles = Array.from({ length: 12 }, (_, i) => makeObstacle(i));
  const coins = Array.from({ length: 24 }, (_, i) => makeCoin(i));

  function spawnFrom(pool) {
    return pool.find((e) => !e.active) || null;
  }

  // ===== Stato di gioco =====
  const state = {
    running: true,
    speed: START_SPEED,
    distance: 0,
    coins: 0,
    laneIndex: 1,
    targetX: LANES[1],
    velY: 0,
    grounded: true,
    nextSpawnZ: SPAWN_AHEAD,
  };

  function spawnRow() {
    // Sceglie una corsia libera per l'ostacolo; monete su una corsia diversa.
    const obsLane = Math.floor(Math.random() * 3);
    const ob = spawnFrom(obstacles);
    if (ob) {
      ob.active = true;
      ob.lane = obsLane;
      ob.mesh.setEnabled(true);
      ob.mesh.position.set(LANES[obsLane], 0.7, state.nextSpawnZ);
    }

    // Fila di monete su una corsia diversa (a volte).
    if (Math.random() < G.coinSpawnChance) {
      let coinLane = Math.floor(Math.random() * 3);
      if (coinLane === obsLane) coinLane = (coinLane + 1) % 3;
      const count = G.coinRowLength;
      for (let k = 0; k < count; k++) {
        const co = spawnFrom(coins);
        if (!co) break;
        co.active = true;
        co.lane = coinLane;
        co.mesh.setEnabled(true);
        co.mesh.position.set(LANES[coinLane], 1.0, state.nextSpawnZ + k * 1.6);
      }
    }

    state.nextSpawnZ += ROW_GAP;
  }

  // Pre-popola qualche riga davanti al player.
  for (let i = 0; i < 6; i++) spawnRow();

  // ===== Input =====
  function changeLane(dir) {
    state.laneIndex = Math.max(0, Math.min(2, state.laneIndex + dir));
    state.targetX = LANES[state.laneIndex];
  }
  function jump() {
    if (state.grounded) {
      state.velY = JUMP_SPEED;
      state.grounded = false;
    }
  }

  function onKey(e) {
    if (!state.running) return;
    switch (e.key) {
      case "ArrowLeft":
      case "a":
      case "A":
        changeLane(-1);
        break;
      case "ArrowRight":
      case "d":
      case "D":
        changeLane(1);
        break;
      case "ArrowUp":
      case "w":
      case "W":
      case " ":
        jump();
        break;
    }
  }
  window.addEventListener("keydown", onKey);

  // Touch/swipe
  let touchStart = null;
  const SWIPE_MIN = 30;
  function onPointerDown(e) {
    touchStart = { x: e.clientX, y: e.clientY };
  }
  function onPointerUp(e) {
    if (!touchStart || !state.running) {
      touchStart = null;
      return;
    }
    const dx = e.clientX - touchStart.x;
    const dy = e.clientY - touchStart.y;
    if (Math.abs(dx) < SWIPE_MIN && Math.abs(dy) < SWIPE_MIN) {
      jump(); // tap = salto
    } else if (Math.abs(dx) > Math.abs(dy)) {
      changeLane(dx > 0 ? 1 : -1);
    } else if (dy < 0) {
      jump(); // swipe su = salto
    }
    touchStart = null;
  }
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);

  // ===== Fine partita =====
  function gameOver() {
    if (!state.running) return;
    state.running = false;
    const amount = computePayout(state.coins);
    goto("gameover", { coins: state.coins, distance: state.distance, amount });
  }

  ui.show("hud");
  ui.updateHud({ coins: 0, distance: 0 });

  // ===== Loop =====
  function update(dt) {
    if (!state.running) return;

    // Velocità crescente nel tempo.
    state.speed = Math.min(MAX_SPEED, state.speed + ACCEL * dt);
    const move = state.speed * dt;
    state.distance += move;

    // Movimento laterale (lerp verso la corsia target).
    player.position.x += (state.targetX - player.position.x) * Math.min(1, LANE_LERP * dt);

    // Salto (integrazione verticale kinematica).
    if (!state.grounded) {
      state.velY += GRAVITY * dt;
      player.position.y += state.velY * dt;
      if (player.position.y <= 0.8) {
        player.position.y = 0.8;
        state.velY = 0;
        state.grounded = true;
      }
    }

    // Scorrimento pista.
    for (const t of tiles) {
      t.position.z -= move;
      if (t.position.z < -TILE_LEN) t.position.z += TILE_LEN * NUM_TILES;
    }
    for (const s of stripes) {
      s.position.z -= move;
      if (s.position.z < DESPAWN_BEHIND) s.position.z += 4 * stripes.length;
    }

    // Ostacoli e monete: scorrono verso il player.
    const px = player.position.x;
    const py = player.position.y;

    for (const ob of obstacles) {
      if (!ob.active) continue;
      ob.mesh.position.z -= move;
      // Collisione: vicino in z, stessa corsia, player non abbastanza in alto.
      if (Math.abs(ob.mesh.position.z) < 0.9 && Math.abs(ob.mesh.position.x - px) < 1.0 && py < 1.6) {
        gameOver();
        return;
      }
      if (ob.mesh.position.z < DESPAWN_BEHIND) {
        ob.active = false;
        ob.mesh.setEnabled(false);
      }
    }

    for (const co of coins) {
      if (!co.active) continue;
      co.mesh.position.z -= move;
      co.mesh.rotation.x += dt * 6; // rotazione moneta
      if (Math.abs(co.mesh.position.z) < 0.9 && Math.abs(co.mesh.position.x - px) < 0.9 && Math.abs(py - 1.0) < 1.1) {
        co.active = false;
        co.mesh.setEnabled(false);
        state.coins += 1;
      }
      if (co.mesh.position.z < DESPAWN_BEHIND) {
        co.active = false;
        co.mesh.setEnabled(false);
      }
    }

    // Genera nuove righe man mano che il "fronte" si avvicina.
    state.nextSpawnZ -= move;
    while (state.nextSpawnZ < SPAWN_AHEAD) spawnRow();

    ui.updateHud({ coins: state.coins, distance: state.distance });
  }

  function dispose() {
    window.removeEventListener("keydown", onKey);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointerup", onPointerUp);
    scene.dispose();
  }

  return { scene, update, dispose };
}
