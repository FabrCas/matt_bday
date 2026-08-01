import { Scene, FreeCamera, HemisphericLight, Color4, Vector3 } from "@babylonjs/core";
import * as ui from "../ui/ui.js";
import { getCameraProfile_menu } from "../utils/responsive.js";
import { CONFIG } from "../config/index.js";

const CONTROLS_DURATION = CONFIG.controls.duration;

// Scena intermedia tra menu e game: mostra i comandi di gioco (overlay HTML,
// vedi index.html/#controls) per una durata fissa, poi passa da sola al
// game senza bisogno di input. Saltata del tutto se debug: true (vedi
// menu.js, che decide se instradare qui o direttamente a "game").
export function createControlsScene({ engine, goto }) {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.06, 0.09, 0.16, 1);

  // Stesso profilo camera/luce del menu: sfondo 3D coerente, nessun
  // elemento aggiuntivo necessario dato che il contenuto è tutto overlay HTML.
  const cam = getCameraProfile_menu();
  const camera = new FreeCamera("controlsCam", new Vector3(0, cam.height, -cam.distance), scene);
  camera.setTarget(new Vector3(0, 1, 0));
  camera.fov = cam.fov;

  const light = new HemisphericLight("controlsLight", new Vector3(0.4, 1, 0.2), scene);
  light.intensity = 0.9;

  ui.show("controls");
  ui.updateControlsInfo();

  let elapsed = 0;
  let advancing = false; // guardia: evita chiamate goto() multiple se update() gira ancora un frame di troppo
  function goToGame() {
    if (advancing) return;
    advancing = true;
    goto("game");
  }

  // Bottone "salta": passa subito al gioco senza aspettare il countdown.
  // Listener locale a questa scena (non passa da ui.bindButtons, che è
  // pensato per binding unici sull'intera vita dell'app) — va quindi tolto
  // in dispose() per non accumularne uno nuovo ad ogni volta che si passa
  // di qui.
  const btnSkip = document.getElementById("btn-skip-controls");
  btnSkip.addEventListener("click", goToGame);

  function update(dt) {
    elapsed += dt;
    ui.updateControlsCountdown(Math.max(0, CONTROLS_DURATION - elapsed));
    if (elapsed >= CONTROLS_DURATION) goToGame();
  }

  function dispose() {
    btnSkip.removeEventListener("click", goToGame);
    scene.dispose();
  }

  return { scene, update, dispose };
}
