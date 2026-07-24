// Import di suoni (.mp3, .ogg) tramite l'Audio Engine v2 di Babylon.js
// (CreateAudioEngineAsync/CreateSoundAsync) o come HTMLAudioElement (SFX di UI,
// riproducibili anche fuori dal ciclo di vita di una scena/engine audio).
// Vedi README.md in questa cartella per esempi d'uso e note sull'integrazione.

import { CreateAudioEngineAsync, CreateSoundAsync } from "@babylonjs/core";

// Tutti i suoni vivono qui (vedi struttura in CLAUDE.md).
// `publicDir` di Vite è "./static", quindi a runtime la cartella è servita
// alla radice come "./assets/sounds/".
export const SOUNDS_BASE_PATH = "./assets/sounds/";

// L'Audio Engine v2 è unico per tutta l'app (non legato a una singola scena):
// lo creiamo una sola volta al primo utilizzo e lo riusiamo per ogni suono.
let audioEnginePromise = null;
function getAudioEngine() {
  if (!audioEnginePromise) audioEnginePromise = CreateAudioEngineAsync();
  return audioEnginePromise;
}

// Da chiamare dentro un handler di interazione utente (click/tap, es. il
// pulsante "GIOCA"): i browser sospendono l'AudioContext finché l'utente non
// interagisce con la pagina, `unlockAsync()` lo sblocca in quel momento.
export async function unlockAudio() {
  const engine = await getAudioEngine();
  if (engine.state !== "running") await engine.unlockAsync();
  return engine;
}

// Carica un suono (musica, SFX). Ritorna una Promise risolta con l'oggetto
// Sound, pronto per `.play()`.
//
// options: opzioni accettate da CreateSoundAsync (loop, volume, ecc.)
export async function loadSound(fileName, options = {}) {
  await getAudioEngine();
  return CreateSoundAsync(fileName, SOUNDS_BASE_PATH + fileName, options);
}

// Rilascia un Sound (buffer audio e handler associati).
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
