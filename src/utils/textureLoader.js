// Import di immagini (.png, .jpg, .webp) come texture Babylon o come <img> HTML.
// Vedi README.md in questa cartella per esempi d'uso e note sull'integrazione.

import { Texture } from "@babylonjs/core";

// Tutte le immagini vivono qui (vedi struttura in CLAUDE.md).
// `publicDir` di Vite è "./static", quindi a runtime la cartella è servita
// alla radice come "./assets/imgs/".
export const IMAGES_BASE_PATH = "./assets/imgs/";

// Crea una Texture Babylon (per materiali/sprite nella scena 3D).
//
// options:
//   - noMipmap, invertY, samplingMode: passati direttamente al costruttore Texture
//   - onLoad/onError: callback opzionali
export function loadTexture(scene, fileName, { noMipmap, invertY, samplingMode, onLoad, onError } = {}) {
  return new Texture(IMAGES_BASE_PATH + fileName, scene, noMipmap, invertY, samplingMode, onLoad, onError);
}

// Applica una texture come diffuseTexture (o la proprietà indicata) di un materiale esistente.
export function applyTexture(material, scene, fileName, property = "diffuseTexture") {
  material[property] = loadTexture(scene, fileName);
  return material;
}

// Carica un'immagine come elemento DOM (per overlay HTML/CSS: logo nel menu, badge, ecc.),
// utile perché quegli overlay non passano dal renderer Babylon.
export function loadHtmlImage(fileName) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = IMAGES_BASE_PATH + fileName;
  });
}

// Rilascia la texture e la memoria GPU associata.
export function disposeTexture(texture) {
  texture?.dispose();
}
