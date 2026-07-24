// Import di suoni (.mp3, .ogg) come Sound Babylon (audio 3D/scena) o come
// HTMLAudioElement (SFX di UI, riproducibili anche fuori da una scena attiva).
// Vedi README.md in questa cartella per esempi d'uso e note sull'integrazione.

import { Sound } from "@babylonjs/core";

// Tutti i suoni vivono qui (vedi struttura in CLAUDE.md).
// `publicDir` di Vite è "./static", quindi a runtime la cartella è servita
// alla radice come "./assets/sounds/".
export const SOUNDS_BASE_PATH = "./assets/sounds/";

// Oltre questo tempo la Promise si risolve comunque: `Sound` di Babylon non
// garantisce un callback di errore affidabile (file mancante/non decodificabile
// può non richiamare mai `readyToPlayCallback`), quindi senza un timeout un
// `await loadSound(...)` potrebbe restare appeso per sempre.
const SOUND_LOAD_TIMEOUT_MS = 8000;

// Carica un suono legato alla scena Babylon (colonna sonora, SFX 3D posizionali).
// Ritorna una Promise che si risolve quando il suono è pronto alla riproduzione,
// o comunque entro SOUND_LOAD_TIMEOUT_MS (vedi sopra).
//
// options: le stesse opzioni accettate da `Sound` (loop, volume, spatialSound, ecc.)
export function loadSound(scene, fileName, options = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const sound = new Sound(fileName, SOUNDS_BASE_PATH + fileName, scene, () => {
      settled = true;
      resolve(sound);
    }, options);

    setTimeout(() => {
      if (settled) return;
      console.warn(`[audioLoader] "${fileName}" non pronto dopo ${SOUND_LOAD_TIMEOUT_MS}ms, proseguo senza attendere oltre.`);
      resolve(sound);
    }, SOUND_LOAD_TIMEOUT_MS);
  });
}

// Rilascia un Sound Babylon (buffer audio e handler associati).
export function disposeSound(sound) {
  sound?.dispose();
}

// Carica un effetto sonoro come HTMLAudioElement nativo: utile per SFX di UI
// (click su pulsanti del menu) che devono poter suonare prima che una scena/Sound
// Babylon esista, o indipendentemente da essa.
export function loadHtmlAudio(fileName, { volume = 1, loop = false } = {}) {
  const audio = new Audio(SOUNDS_BASE_PATH + fileName);
  audio.volume = volume;
  audio.loop = loop;
  return audio;
}

// Riproduce un HTMLAudioElement dall'inizio (utile per SFX ripetuti rapidamente,
// es. più click consecutivi).
export function playHtmlAudio(audio) {
  audio.currentTime = 0;
  return audio.play();
}
