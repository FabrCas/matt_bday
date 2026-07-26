import { Engine } from "@babylonjs/core";
import * as ui from "./ui/ui.js";
import { onResize } from "./utils/responsive.js";
import { createMenuScene } from "./scenes/menu.js";
import { createGameScene } from "./scenes/game.js";
import { createGameOverScene } from "./scenes/gameover.js";
import { createWishesScene } from "./scenes/wishes.js";

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
  wishes: createWishesScene,
};

// Scena attiva: { scene, update(dt), dispose() }
let active = null;

// Cambio scena centralizzato. `payload` passa dati tra scene (es. punteggio).
// `async` perché alcune scene (es. game, che importa il modello del player)
// caricano asset prima di essere pronte: la scena precedente resta visibile
// (dietro all'overlay "loading") finché la nuova non è completamente costruita.
async function goto(name, payload) {
  const factory = factories[name];
  if (!factory) throw new Error(`Scena sconosciuta: ${name}`);

  ui.show("loading");
  let next;
  try {
    next = await factory({ engine, canvas, goto, payload });
  } catch (err) {
    // Es. asset mancante/non caricabile: non restare bloccati su "loading",
    // torna al menu (a meno che il fallimento non sia già nel menu stesso).
    console.error(`Impossibile caricare la scena "${name}":`, err);
    if (name !== "menu") return goto("menu");
    throw err;
  }

  const previous = active;
  active = next;
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
