import { Engine } from "@babylonjs/core";
import * as ui from "./ui/ui.js";
import { onResize } from "./utils/responsive.js";
import { createMenuScene } from "./scenes/menu.js";
import { createGameScene } from "./scenes/game.js";
import { createGameOverScene } from "./scenes/gameover.js";

const canvas = document.getElementById("renderCanvas");
const engine = new Engine(canvas, true, {
  preserveDrawingBuffer: false,
  stencil: false,
  // Limita il device pixel ratio: su schermi retina evita di renderizzare
  // troppi pixel (importante per performance su mobile / hosting leggero).
  adaptToDeviceRatio: true,
});

const factories = {
  menu: createMenuScene,
  game: createGameScene,
  gameover: createGameOverScene,
};

// Scena attiva: { scene, update(dt), dispose() }
let active = null;

// Cambio scena centralizzato. `payload` passa dati tra scene (es. punteggio).
function goto(name, payload) {
  const factory = factories[name];
  if (!factory) throw new Error(`Scena sconosciuta: ${name}`);

  const previous = active;
  active = factory({ engine, canvas, goto, payload });
  // Dispose della precedente solo dopo aver creato la nuova (transizione pulita).
  if (previous) previous.dispose();
}

const ctx = { ui };

engine.runRenderLoop(() => {
  if (!active) return;
  const dt = engine.getDeltaTime() / 1000; // secondi
  if (active.update) active.update(dt);
  active.scene.render();
});

onResize(() => engine.resize());

// Avvio
ui.applyBranding();
ui.show("menu");
goto("menu");

export { ctx };
