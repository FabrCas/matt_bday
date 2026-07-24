// Import di modelli 3D esterni (.glb, .gltf, .obj) tramite SceneLoader.
// Vedi README.md in questa cartella per esempi d'uso e note sull'integrazione.

import { SceneLoader } from "@babylonjs/core";
// Registrano i plugin di import per i rispettivi formati (side-effect: si
// aggiungono al registro interno di SceneLoader, non esportano nulla).
import "@babylonjs/loaders/glTF";
import "@babylonjs/loaders/OBJ";

// Tutti i modelli vivono qui (vedi struttura in CLAUDE.md).
// `publicDir` di Vite è "./static", quindi a runtime la cartella è servita
// alla radice come "./assets/3d-models/".
export const MODELS_BASE_PATH = "./assets/3d-models/";

// Carica un modello e lo aggiunge alla scena. Ritorna meshes/skeletons/animationGroups
// così il chiamante può posizionare, scalare e ripulire il modello.
//
// options:
//   - fileName: nome file dentro MODELS_BASE_PATH (es. "coin.glb")
//   - scene: scena Babylon target
//   - position/rotation/scaling: Vector3 opzionali applicati alla mesh radice
//   - onProgress: callback(event) durante il download (utile per la loading screen)
export async function loadModel(scene, fileName, { position, rotation, scaling, onProgress } = {}) {
  const result = await SceneLoader.ImportMeshAsync(
    "", // importa tutte le mesh del file
    MODELS_BASE_PATH,
    fileName,
    scene,
    onProgress
  );

  const root = result.meshes[0] || null;
  if (root) {
    if (position) root.position.copyFrom(position);
    if (rotation) root.rotation.copyFrom(rotation);
    if (scaling) root.scaling.copyFrom(scaling);
  }

  return { root, meshes: result.meshes, skeletons: result.skeletons, animationGroups: result.animationGroups };
}

// Precarica un modello come AssetContainer scollegato dalla scena: utile per
// istanziare più copie (es. ostacoli/monete ripetuti) senza ricaricare il file
// da rete ogni volta. `container.instantiateModelsToScene()` clona in scena.
export async function loadModelContainer(scene, fileName, onProgress) {
  return SceneLoader.LoadAssetContainerAsync(MODELS_BASE_PATH, fileName, scene, onProgress);
}

// Rimuove dalla scena mesh/skeletons/animationGroups ottenuti da loadModel,
// liberando geometrie e materiali associati.
export function disposeModel({ meshes = [], skeletons = [], animationGroups = [] }) {
  for (const ag of animationGroups) ag.dispose();
  for (const sk of skeletons) sk.dispose();
  for (const m of meshes) m.dispose(false, true); // doNotRecurse=false, disposeMaterialAndTextures=true
}
