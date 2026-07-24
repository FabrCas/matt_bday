// Import di suoni (.mp3, .ogg) come Sound Babylon (audio 3D/scena) o come
// HTMLAudioElement (SFX di UI, riproducibili anche fuori da una scena attiva).
// Vedi README.md in questa cartella per esempi d'uso e note sull'integrazione.

import { Sound } from "@babylonjs/core";

// Tutti i suoni vivono qui (vedi struttura in CLAUDE.md).
// `publicDir` di Vite è "./static", quindi a runtime la cartella è servita
// alla radice come "./assets/sounds/".
export const SOUNDS_BASE_PATH = "./assets/sounds/";

// Carica un suono legato alla scena Babylon (colonna sonora, SFX 3D posizionali).
// Ritorna una Promise risolta quando il suono è pronto alla riproduzione.
//
// options: le stesse opzioni accettate da `Sound` (loop, volume, spatialSound, ecc.)
export function loadSound(scene, fileName, options = {}) {
  return new Promise((resolve, reject) => {
    const sound = new Sound(
      fileName,
      SOUNDS_BASE_PATH + fileName,
      scene,
      () => resolve(sound),
      { ...options, errorCallback: reject }
    );
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
