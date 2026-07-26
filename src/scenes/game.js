import {
  Scene,
  FreeCamera,
  HemisphericLight,
  DirectionalLight,
  PointLight,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Color4,
  Vector3,
} from "@babylonjs/core";
import * as ui from "../ui/ui.js";
import { getCameraProfile } from "../utils/responsive.js";
import { CONFIG, computePayout } from "../config/index.js";
import { loadModel, disposeModel } from "../utils/modelLoader.js";
import { loadTexture } from "../utils/textureLoader.js";
import { loadSound, disposeSound } from "../utils/audioLoader.js";

// Modello del player: static/assets/3d-models/test.glb
const PLAYER_MODEL = "test.glb";

// Immagine dei cartelloni ai lati della strada: static/assets/imgs/billboard.png
const SIDE_SLIDING_IMAGE_1= "real_1.jpg";

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
const FADE_DISTANCE = 16; // unità percorse per dissolvere in ostacoli/monete allo spawn
const DEBUG = CONFIG.debug; // se true, mostra la hitbox (bounding box) di ogni oggetto

// ---- Dimensioni del corridoio (condivise da pavimento, muri, soffitto e billboard) ----
const TILE_LEN = 30;
const NUM_TILES = 4;
const CORRIDOR_HALF_WIDTH = 5.6; // muri/soffitto arrivano esattamente qui
const WALL_HEIGHT = 10;
export async function createGameScene({ engine, canvas, goto }) {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.53, 0.81, 0.92, 1); // cielo azzurro

  // Fog per dissolvere il fondo del corridoio infinito nella foschia del cielo,
  // nascondendo così il riciclo dei segmenti (muri/tile/billboard) in lontananza.
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogColor = new Color3(0.53, 0.81, 0.92);
  scene.fogDensity = 0.015;

  // ---- Camera (dietro il player, adattata al dispositivo) ----
  const cam = getCameraProfile();
  const camera = new FreeCamera("gameCam", new Vector3(0, cam.height, -cam.distance), scene);
  camera.fov = cam.fov;

  // ---- Luci (leggere: hemispheric di riempimento, niente ombre) ----
  // Le point light "vere" sono quelle dei lampadari più sotto, riciclate
  // lungo il corridoio insieme al resto della scena.
  const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.2;

  // ---- Materiali condivisi (riuso => meno draw call/allocazioni) ----
  const groundMat = new StandardMaterial("groundMat", scene);
  groundMat.diffuseColor = new Color3(0.5, 0.5, 0.5);
  groundMat.specularColor = new Color3(0, 0, 0);

  const wallMat = new StandardMaterial("wallMat", scene);
  wallMat.diffuseColor = new Color3(0.55, 0.55, 0.58);
  wallMat.specularColor = new Color3(0, 0, 0);
  wallMat.backFaceCulling = false;

  const obstacleMat = new StandardMaterial("obstacleMat", scene);
  obstacleMat.diffuseColor = new Color3(0.85, 0.2, 0.25);
  obstacleMat.specularColor = new Color3(0, 0, 0);

  const coinMat = new StandardMaterial("coinMat", scene);
  coinMat.diffuseColor = new Color3(0.98, 0.75, 0.15);
  coinMat.emissiveColor = new Color3(0.4, 0.3, 0.0);
  coinMat.specularColor = new Color3(1, 1, 1);
  
  // ---- Suoni ----
  // Non in `await`: un SFX non è critico per il gioco, quindi il suo
  // caricamento non deve bloccare l'avvio della scena (vedi audioLoader.js
  // per il perché di un eventuale caricamento lento/fallito).
  let coinSfx = null;
  loadSound("coin.mp3", { volume: 0.8 }).then((s) => {
    coinSfx = s;
  });


  // ---- Player (modello importato) ----
  // Nota: 0.8 come altezza da terra e le soglie di collisione più sotto
  // (py < 1.6, |py - 1.0| < 1.1) erano tarate sulla capsula placeholder;
  // vanno riverificate/aggiustate in base alle dimensioni reali del modello
  // (scaling, pivot) una volta importato character.glb.
  const { root: player, meshes: playerMeshes } = await loadModel(scene, PLAYER_MODEL, {
    position: new Vector3(0, 0.8, 0),
    // scaling: new Vector3(1, 1, 1), // tarare in base alle dimensioni reali del modello
  });
  if (DEBUG) playerMeshes.forEach((m) => (m.showBoundingBox = true));



  // ---- Pista: segmenti di terreno riciclati per effetto infinito ----
  // Larghezza pari alla distanza tra i due muri, così il pavimento li tocca
  // invece di lasciare uno spazio vuoto ai lati.
  const tiles = [];
  for (let i = 0; i < NUM_TILES; i++) {
    const t = MeshBuilder.CreateBox(
      "tile" + i,
      { width: CORRIDOR_HALF_WIDTH * 2, height: 0.5, depth: TILE_LEN },
      scene
    );
    t.material = groundMat;
    t.position.set(0, -0.25, i * TILE_LEN);
    tiles.push(t);
  }

  // ---- Muri laterali del corridoio (piani grigi, riciclati come i tile) ----
  // Stessa lunghezza/numero segmenti dei tile del terreno, così scorrono in sync.
  const walls = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < NUM_TILES; i++) {
      const w = MeshBuilder.CreatePlane(
        "wall" + side + "_" + i,
        { width: TILE_LEN, height: WALL_HEIGHT },
        scene
      );
      w.material = wallMat;
      // Specchiata in base al lato: altrimenti entrambi i muri avrebbero la
      // stessa normale "vera" (usata per l'illuminazione N·L), e quello con
      // la normale che punta lontano dal centro risulterebbe sempre buio con
      // point/directional light (backFaceCulling:false lo rende comunque
      // visibile, ma non illuminato correttamente).
      w.rotation.y = side === 1 ? Math.PI / 2 : -Math.PI / 2;
      w.position.set(side * CORRIDOR_HALF_WIDTH, WALL_HEIGHT / 2, i * TILE_LEN);
      walls.push(w);
    }
  }

  // ---- Soffitto del corridoio (stesso stile/materiale dei muri) ----
  const ceilings = [];
  for (let i = 0; i < NUM_TILES; i++) {
    const c = MeshBuilder.CreatePlane(
      "ceiling" + i,
      { width: CORRIDOR_HALF_WIDTH * 2, height: TILE_LEN },
      scene
    );
    c.material = wallMat;
    // Segno opposto rispetto a quello "naturale": con +PI/2 la normale vera
    // punta verso l'alto (lontano dall'interno del corridoio, dove sta la
    // luce), risultando sempre in ombra con point/directional light nonostante
    // sia visibile (backFaceCulling:false). Con -PI/2 punta verso il basso,
    // verso l'interno.
    c.rotation.x = -Math.PI / 2; // piano orizzontale, normale rivolta verso il basso
    c.position.set(0, WALL_HEIGHT, i * TILE_LEN);
    ceilings.push(c);
  }

  // ---- Lampadari del corridoio (box giallo + point light poco sotto) ----
  // Placeholder: in seguito il box verrà sostituito da un modello importato.
  // Riciclati come muri/tile/soffitto, ognuno porta con sé la propria luce
  // in modo che si sposti in sincrono (la posizione della luce viene
  // aggiornata a mano in update(), i Light di Babylon non seguono in modo
  // affidabile un parent come i mesh).
  const LAMP_GAP = 18; // distanza tra un lampadario e il successivo
  const LAMP_COUNT = 5; // numero di lampadari attivi contemporaneamente
  const LAMP_BOX_Y = WALL_HEIGHT - 1; // vicino al soffitto
  const LAMP_LIGHT_DROP = 0.7; // quanto la point light sta sotto il box
  const LAMP_BOX_SIZE = 0.8;
  const LAMP_INTENSITY = 0.6;
  // Distanza (in unità di mondo, oltre DESPAWN_BEHIND) su cui l'intensità
  // sfuma a 0 prima del riciclo: senza questa dissolvenza il lampadario
  // veniva teletrasportato in avanti mentre la sua luce contribuiva ancora
  // in modo visibile, dando l'effetto di "spegnimento di colpo".
  const LAMP_FADE_DISTANCE = 6;

  const lampMat = new StandardMaterial("lampMat", scene);
  lampMat.diffuseColor = new Color3(0.95, 0.85, 0.2);
  lampMat.emissiveColor = new Color3(0.6, 0.5, 0.05);
  lampMat.specularColor = new Color3(0, 0, 0);

  const lamps = [];
  for (let i = 0; i < LAMP_COUNT; i++) {
    const z = i * LAMP_GAP;
    const box = MeshBuilder.CreateBox("lampBox" + i, { size: LAMP_BOX_SIZE }, scene);
    box.material = lampMat;
    box.position.set(0, LAMP_BOX_Y, z);

    // Posizione iniziale della luce ricavata dal box (vedi update(): resta
    // sempre derivata da esso, non c'è uno stato separato che possa
    // disallinearsi).
    const light = new PointLight("lampLight" + i, Vector3.Zero(), scene);
    light.diffuse = new Color3(1, 0.95, 0.8);
    light.intensity = LAMP_INTENSITY;
    // Nota risorse (hosting statico su GitHub Pages, vedi CLAUDE.md): ogni
    // point light aggiuntiva ha un costo; LAMP_COUNT è tenuto basso perché
    // solo quelle vicine al player contribuiscono in modo visibile.
    lamps.push({ box, light });
  }

  // ---- Cartelloni ai lati della strada (stesso schema di riciclo delle strisce) ----
  const BILLBOARD_X = CORRIDOR_HALF_WIDTH - 0.05;
  const BILLBOARD_Y = WALL_HEIGHT/2; // altezza da terra
  const BILLBOARD_GAP = 14; // distanza tra un cartellone e il successivo (per lato)
  const BILLBOARD_COUNT = 8; // totale, alternati sui due lati
  const BILLBOARD_WIDTH = 3;
  const BILLBOARD_HEIGHT = 2;
  const billboardMat = new StandardMaterial("billboardMat", scene);
  billboardMat.diffuseTexture = loadTexture(scene, SIDE_SLIDING_IMAGE_1);
  billboardMat.specularColor = new Color3(0, 0, 0);
  billboardMat.backFaceCulling = false; // visibile da entrambi i lati del piano

  // Cornice bianca dietro ogni cartellone (effetto "quadro incorniciato").
  // Bianco puro e non influenzato dalle luci di scena (disableLighting),
  // così resta uniforme indipendentemente da normali/angolo della luce.
  const FRAME_MARGIN = 0.3; // sporgenza del bordo rispetto all'immagine
  const FRAME_THICKNESS = 0.08;
  const FRAME_OFFSET = FRAME_THICKNESS / 2 + 0.02; // dietro l'immagine, verso il muro
  const billboardFrameMat = new StandardMaterial("billboardFrameMat", scene);
  billboardFrameMat.diffuseColor = new Color3(1, 1, 1);
  // billboardFrameMat.emissiveColor = new Color3(1, 1, 1);
  billboardFrameMat.specularColor = new Color3(1, 1, 1); 
  billboardFrameMat.disableLighting = false;

  const billboards = [];
  for (let i = 0; i < BILLBOARD_COUNT; i++) {
    const b = MeshBuilder.CreatePlane(
      "billboard" + i,
      { width: BILLBOARD_WIDTH, height: BILLBOARD_HEIGHT },
      scene
    );
    b.material = billboardMat;
    const side = i % 2 === 0 ? -BILLBOARD_X : BILLBOARD_X;
    b.position.set(side, BILLBOARD_Y, i * BILLBOARD_GAP);
    // Stesso problema dei muri: senza specchiare in base al lato, entrambi i
    // cartelloni avrebbero la normale vera rivolta nella stessa direzione
    // mondiale, e quelli sul lato sinistro risulterebbero sempre in ombra.
    b.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2; // normale rivolta verso il centro strada

    // Piano figlio: segue automaticamente posizione/rotazione del cartellone
    // (compreso lo scorrimento nel loop di update), nessun codice aggiuntivo
    // necessario. Spostata lungo l'asse Z locale (= normale del cartellone),
    // che grazie alla rotazione già specchiata sopra punta sempre verso il
    // muro del proprio lato per entrambi i lati.
    const frame = MeshBuilder.CreateBox(
      "billboardFrame" + i,
      {
        width: BILLBOARD_WIDTH + FRAME_MARGIN,
        height: BILLBOARD_HEIGHT + FRAME_MARGIN,
        depth: FRAME_THICKNESS,
      },
      scene
    );
    frame.material = billboardFrameMat;
    frame.parent = b;
    frame.position.set(0, 0, FRAME_OFFSET);

    billboards.push(b);
  }

  // ---- Pool ostacoli e monete ----
  function makeObstacle(i) {
    const o = MeshBuilder.CreateBox("obs" + i, { width: 1.4, height: 1.4, depth: 1.4 }, scene);
    o.material = obstacleMat;
    o.setEnabled(false);
    if (DEBUG) o.showBoundingBox = true;
    return { mesh: o, active: false, lane: 0, type: "obstacle" };
  }
  function makeCoin(i) {
    const c = MeshBuilder.CreateCylinder("coin" + i, { diameter: 0.8, height: 0.12, tessellation: 16 }, scene);
    c.material = coinMat;
    c.rotation.z = Math.PI / 2;
    c.setEnabled(false);
    if (DEBUG) c.showBoundingBox = true;
    scene.onBeforeRenderObservable.add(() => {
        c.rotation.y += 0.1;
    });
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
      ob.mesh.visibility = 0; // dissolve in gradualmente, vedi update()
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
        co.mesh.visibility = 0; // dissolve in gradualmente, vedi update()
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
    let payout = computePayout(state.coins);
    const amount = payout[0];
    const diff_amount = CONFIG.economy.maxPayout - amount
    const gameover_message = payout[1] ? "Complimenti per la vincita, ma noi abbiamo solo questi ..." : `${amount}€...davvero?, ${diff_amount}€ te li offriamo noi.`
    console.log(amount);
    console.log(gameover_message);
    goto("gameover", { coins: state.coins, distance: state.distance, amount: CONFIG.economy.maxPayout, message: gameover_message});
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
    for (const w of walls) {
      w.position.z -= move;
      if (w.position.z < -TILE_LEN) w.position.z += TILE_LEN * NUM_TILES;
    }
    for (const c of ceilings) {
      c.position.z -= move;
      if (c.position.z < -TILE_LEN) c.position.z += TILE_LEN * NUM_TILES;
    }
    // for (const s of stripes) {
    //   s.position.z -= move;
    //   if (s.position.z < DESPAWN_BEHIND) s.position.z += 4 * stripes.length;
    // }
    for (const b of billboards) {
      b.position.z -= move;
      if (b.position.z < DESPAWN_BEHIND) b.position.z += BILLBOARD_GAP * billboards.length;
    }
    for (const l of lamps) {
      l.box.position.z -= move;
      if (l.box.position.z < DESPAWN_BEHIND) {
        l.box.position.z += LAMP_GAP * LAMP_COUNT;
      }
      // Luce sempre allineata al box: posizione ricavata da esso ogni frame
      // invece di un secondo stato aggiornato in parallelo.
      l.light.position.x = l.box.position.x;
      l.light.position.y = l.box.position.y - LAMP_LIGHT_DROP;
      l.light.position.z = l.box.position.z;

      // Dissolvenza vicino al bordo di riciclo: l'intensità scende a 0 prima
      // che il lampadario venga teletrasportato in avanti, così il "salto"
      // non si vede più come uno spegnimento improvviso.
      const distFromRecycle = l.box.position.z - DESPAWN_BEHIND;
      const fade = Math.min(1, Math.max(0, distFromRecycle / LAMP_FADE_DISTANCE));
      l.light.intensity = LAMP_INTENSITY * fade;
    }

    // Ostacoli e monete: scorrono verso il player.
    const px = player.position.x;
    const py = player.position.y;

    for (const ob of obstacles) {
      if (!ob.active) continue;
      ob.mesh.position.z -= move;
      // Dissolvenza in ingresso: appare gradualmente invece di comparire di scatto.
      ob.mesh.visibility = Math.min(1, Math.max(0, (SPAWN_AHEAD - ob.mesh.position.z) / FADE_DISTANCE));
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
      // Dissolvenza in ingresso: appare gradualmente invece di comparire di scatto.
      co.mesh.visibility = Math.min(1, Math.max(0, (SPAWN_AHEAD - co.mesh.position.z) / FADE_DISTANCE));
      if (Math.abs(co.mesh.position.z) < 0.9 && Math.abs(co.mesh.position.x - px) < 0.9 && Math.abs(py - 1.0) < 1.1) {
        co.active = false;
        co.mesh.setEnabled(false);
        state.coins += 1;
        coinSfx?.play();
      }
      if (co.mesh.position.z < DESPAWN_BEHIND) {
        co.active = false;
        co.mesh.setEnabled(false);
      }
    }

    // Genera nuove righe man mano che il "fronte" si avvicina.
    state.nextSpawnZ -= move;
    while (state.nextSpawnZ < SPAWN_AHEAD) spawnRow();

    ui.updateHud({ coins: state.coins * CONFIG.economy.coinValue, distance: state.distance });
  }

  function dispose() {
    window.removeEventListener("keydown", onKey);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointerup", onPointerUp);
    disposeSound(coinSfx);
    disposeModel({ meshes: playerMeshes });
    scene.dispose();
  }

  return { scene, update, dispose };
}
