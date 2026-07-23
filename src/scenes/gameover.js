import {
  Scene,
  FreeCamera,
  HemisphericLight,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Color4,
  Vector3,
} from "@babylonjs/core";
import * as ui from "../ui/ui.js";
import { getCameraProfile } from "../utils/responsive.js";

// Scena Game Over: mostra la vincita (overlay HTML) su sfondo 3D sobrio.
export function createGameOverScene({ engine, payload = {} }) {
  const { coins = 0, distance = 0, amount = 0 } = payload;

  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.06, 0.09, 0.16, 1);

  const cam = getCameraProfile();
  const camera = new FreeCamera("goCam", new Vector3(0, cam.height, -cam.distance), scene);
  camera.setTarget(new Vector3(0, 1, 0));
  camera.fov = cam.fov;

  const light = new HemisphericLight("goLight", new Vector3(0.2, 1, 0.3), scene);
  light.intensity = 0.9;

  // Moneta gigante che ruota a celebrare la vincita.
  const coin = MeshBuilder.CreateCylinder("bigCoin", { diameter: 2.4, height: 0.3, tessellation: 24 }, scene);
  const mat = new StandardMaterial("bigCoinMat", scene);
  mat.diffuseColor = new Color3(0.98, 0.75, 0.15);
  mat.emissiveColor = new Color3(0.35, 0.25, 0.0);
  coin.material = mat;
  coin.position.y = 1;
  coin.rotation.x = Math.PI / 2;

  ui.show("gameover");
  ui.updateGameOver({ coins, distance, amount });

  function update(dt) {
    coin.rotation.y += dt * 1.5;
  }

  function dispose() {
    scene.dispose();
  }

  return { scene, update, dispose };
}
