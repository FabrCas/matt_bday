# src/utils

Helpers condivisi. Vedi anche `CLAUDE.md` nella root per il contesto generale del progetto.

## modelLoader.js — import di modelli 3D (.glb / .gltf / .obj)

Wrapper su `SceneLoader` di Babylon.js con i plugin `glTF` e `OBJ` già registrati.

### Setup

1. Installare la dipendenza (già presente in `package.json`, basta un install):
   ```
   npm install
   ```
2. Mettere i file dei modelli in `static/assets/3d-models/`. A runtime Vite li serve
   dalla root come `./assets/3d-models/<file>` (perché `publicDir` è `./static`).

### Uso base

```javascript
import { loadModel, disposeModel } from "../utils/modelLoader.js";

// dentro createGameScene({ engine, canvas, goto }) o simile
const { root, meshes } = await loadModel(scene, "coin.glb", {
  position: new Vector3(0, 1, 5),
  scaling: new Vector3(0.5, 0.5, 0.5),
});

// quando la scena viene smontata (dispose della scena):
disposeModel({ meshes });
```

Formati supportati tramite lo stesso file/funzione: `.glb`, `.gltf`, `.obj`.
Non serve specificare il tipo: il plugin corretto è scelto in base all'estensione del file.

### Istanziare più copie dello stesso modello (ostacoli, monete, ecc.)

Per oggetti ripetuti (come nel pattern già usato in `scenes/game.js` per ostacoli/monete),
evitare di richiamare `loadModel` per ogni istanza: caricare una volta come `AssetContainer`
e clonare in scena.

```javascript
import { loadModelContainer } from "../utils/modelLoader.js";

const container = await loadModelContainer(scene, "obstacle.glb");

function spawnObstacle(position) {
  const instance = container.instantiateModelsToScene();
  const root = instance.rootNodes[0];
  root.position.copyFrom(position);
  return root; // per rimuoverla: root.dispose()
}
```

### Note

- **Performance / hosting (GitHub Pages):** come da `CLAUDE.md`, tenere i modelli leggeri
  (poligoni e texture compresse). Preferire `.glb` a `.gltf` + asset separati: un solo file
  binario, meno richieste di rete.
- **Percorso:** `MODELS_BASE_PATH` è esportato dal modulo se serve costruire path
  manualmente altrove.
- **Cleanup:** chiamare sempre `disposeModel(...)` (o `.dispose()` sui nodi instanziati da un
  container) nella `dispose()` della scena, per evitare leak di geometrie/texture tra un
  cambio scena e l'altro (vedi il pattern `factory(...) -> { scene, update, dispose }` in
  `main.js`).
