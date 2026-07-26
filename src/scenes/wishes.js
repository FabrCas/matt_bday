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
import { getCameraProfile_menu } from "../utils/responsive.js";

// Scena Auguri: raggiunta dal bottone "continua" del game over, mostra il
// messaggio configurato in game.config.yaml e permette di tornare al menu.
export function createWishesScene({ engine }) {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.06, 0.09, 0.16, 1);

  const cam = getCameraProfile_menu();
  const camera = new FreeCamera("wishesCam", new Vector3(0, cam.height, -cam.distance), scene);
  camera.setTarget(new Vector3(0, 1, 0));
  camera.fov = cam.fov;

  const light = new HemisphericLight("wishesLight", new Vector3(0.2, 1, 0.3), scene);
  light.intensity = 0.9;

  // Forma decorativa che ruota, in tema con la scena menu.
  const gem = MeshBuilder.CreateIcoSphere("wishesGem", { radius: 1.4, subdivisions: 2 }, scene);
  const mat = new StandardMaterial("wishesGemMat", scene);
  mat.diffuseColor = new Color3(0.98, 0.75, 0.15);
  mat.emissiveColor = new Color3(0.4, 0.3, 0.0);
  gem.material = mat;
  gem.position.y = 1;

  ui.show("wishes");
  ui.updateWishes();

  function update(dt) {
    gem.rotation.y += dt * 0.6;
    gem.rotation.x += dt * 0.2;
  }

  function dispose() {
    scene.dispose();
  }

  return { scene, update, dispose };
}
