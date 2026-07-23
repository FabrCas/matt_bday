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

// Scena Menu: sfondo 3D leggero (una forma che ruota) + overlay HTML per i testi.
export function createMenuScene({ engine, goto }) {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.06, 0.09, 0.16, 1);

  const cam = getCameraProfile();
  const camera = new FreeCamera("menuCam", new Vector3(0, cam.height, -cam.distance), scene);
  camera.setTarget(new Vector3(0, 1, 0));
  camera.fov = cam.fov;

  const light = new HemisphericLight("menuLight", new Vector3(0.4, 1, 0.2), scene);
  light.intensity = 0.9;

  // Forma decorativa che ruota lentamente.
  const gem = MeshBuilder.CreateIcoSphere("gem", { radius: 1.4, subdivisions: 2 }, scene);
  const mat = new StandardMaterial("gemMat", scene);
  mat.diffuseColor = new Color3(0.22, 0.74, 0.97);
  mat.emissiveColor = new Color3(0.1, 0.35, 0.55);
  gem.material = mat;
  gem.position.y = 1;

  ui.show("menu");

  // Un solo binding dei pulsanti per l'intera vita dell'app.
  if (!createMenuScene._bound) {
    ui.bindButtons({
      onPlay: () => goto("game"),
      onRetry: () => goto("game"),
      onMenu: () => goto("menu"),
    });
    createMenuScene._bound = true;
  }

  function update(dt) {
    gem.rotation.y += dt * 0.6;
    gem.rotation.x += dt * 0.2;
  }

  function dispose() {
    scene.dispose();
  }

  return { scene, update, dispose };
}
