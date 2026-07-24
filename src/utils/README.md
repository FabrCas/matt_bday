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

## textureLoader.js — import di immagini (.png / .jpg / .webp)

Wrapper su `Texture` di Babylon.js, più un helper per caricare immagini come `<img>` HTML
(per gli overlay UI, che sono DOM e non passano dal renderer 3D).

### Setup

Nessuna dipendenza aggiuntiva: `Texture` fa già parte di `@babylonjs/core`.
Mettere i file in `static/assets/imgs/`; a runtime sono serviti come `./assets/imgs/<file>`.

### Uso base

```javascript
import { loadTexture, applyTexture, disposeTexture } from "../utils/textureLoader.js";

// come Texture standalone
const tex = loadTexture(scene, "ground.webp");
groundMat.diffuseTexture = tex;

// oppure in una riga, direttamente su un materiale esistente
applyTexture(coinMat, scene, "coin-diffuse.png"); // di default su diffuseTexture
applyTexture(coinMat, scene, "coin-emissive.png", "emissiveTexture");

// cleanup nella dispose() della scena
disposeTexture(tex);
```

Per un logo/immagine negli overlay HTML (`menu`, `gameover`, ecc. in `index.html`):

```javascript
import { loadHtmlImage } from "../utils/textureLoader.js";

const logo = await loadHtmlImage("logo.png");
document.getElementById("menu").prepend(logo);
```

### Note

- **Formato consigliato:** `.webp` per texture di scena (dimensione minore a parità di
  qualità); `.png` per immagini con trasparenza usate negli overlay HTML.
- **Dimensioni:** tenere le texture piccole (potenze di 2 quando possibile, es. 512x512)
  per restare leggeri su hosting statico e su mobile, come indicato in `CLAUDE.md`.

## audioLoader.js — import di suoni (.mp3 / .ogg)

Wrapper sulla **Audio Engine v2** di Babylon.js (`CreateAudioEngineAsync` / `CreateSoundAsync`,
non la vecchia classe `Sound`), più un helper basato su `HTMLAudioElement` nativo per SFX di UI
che devono poter suonare anche fuori dal ciclo di vita di scena/engine audio (es. click nel menu).
L'audio engine v2 è unico per tutta l'app (non per singola scena): il modulo lo crea da sé al
primo utilizzo e lo riusa per ogni suono successivo.

### Setup

Nessuna dipendenza aggiuntiva: fa già parte di `@babylonjs/core`.
Mettere i file in `static/assets/sounds/`; a runtime sono serviti come `./assets/sounds/<file>`.

> **Nota (autoplay policy):** i browser sospendono l'`AudioContext` finché l'utente non
> interagisce con la pagina. Chiamare `unlockAudio()` dentro un handler di click/tap reale
> (es. il pulsante "GIOCA" — vedi `scenes/menu.js`) prima di riprodurre qualunque suono, altrimenti
> `.play()` può risultare silenzioso anche se il file si è caricato correttamente.

### Uso base

```javascript
import { loadSound, disposeSound, unlockAudio } from "../utils/audioLoader.js";

// in un handler di click (es. bindButtons({ onPlay }) in menu.js)
onPlay: () => {
  unlockAudio(); // sblocca l'audio per il resto della sessione
  goto("game");
};

// dentro createGameScene({ engine, canvas, goto }) o simile
const music = await loadSound("bgm.mp3", { loop: true, volume: 0.4 });
music.play();

const coinSfx = await loadSound("coin.mp3", { volume: 0.8 });
// ad ogni raccolta moneta:
coinSfx.play();

// cleanup nella dispose() della scena
disposeSound(music);
disposeSound(coinSfx);
```

Per un SFX di UI (fuori dal ciclo di vita di una scena 3D):

```javascript
import { loadHtmlAudio, playHtmlAudio } from "../utils/audioLoader.js";

const clickSfx = loadHtmlAudio("click.mp3", { volume: 0.6 });
document.getElementById("btn-play").addEventListener("click", () => playHtmlAudio(clickSfx));
```

### Note

- **Formato consigliato:** `.mp3` per compatibilità più ampia (incluso Safari/iOS, che non
  supporta `.ogg`/Vorbis); `.ogg` come alternativa più leggera dove supportata.
- **Performance / hosting (GitHub Pages):** come da `CLAUDE.md`, tenere i file audio brevi e
  compressi (bitrate contenuto) per non appesantire il caricamento iniziale.
- **Cleanup:** chiamare `disposeSound(...)` nella `dispose()` della scena per i suoni creati
  con `loadSound`, così da non accumulare buffer audio tra un cambio scena e l'altro.
