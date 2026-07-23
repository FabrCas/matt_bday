# matt_bday

Web game for a funny birthday treat — un endless runner 3D in stile classico (a corsie).

Costruito con **Babylon.js** + **Havok** (fisica), **JavaScript (ES modules)** e bundlato con **Vite**. È interamente client-side (nessun backend) e ospitato staticamente su GitHub Pages.

## Panoramica

Il gioco è organizzato in tre scene:

- **Menu** — schermata iniziale e avvio partita
- **Game** — gameplay endless runner a 3 corsie (salto, monete, ostacoli)
- **Game Over** — riepilogo della partita e vincita

Design **mobile-first** con rendering 3D responsivo su smartphone e desktop.

## Prerequisiti

- [Node.js](https://nodejs.org/) v18+ (consigliato v20, come in CI)
- npm v9+

## Installazione

```bash
git clone <repository-url>
cd matt_bday
npm install
```

## Come lanciare il progetto

### Sviluppo (server locale con hot reload)

```bash
npm run dev
```

Apri il browser su **http://localhost:5173** (porta di default di Vite). Il server si ricarica automaticamente a ogni modifica.

> **Test su mobile nella stessa rete:** avvia con `npm run dev -- --host` e apri l'URL di rete mostrato in console dal tuo smartphone.

### Build di produzione

```bash
npm run build
```

L'output ottimizzato viene generato in **`./dist/`**.

### Anteprima della build

```bash
npm run preview
```

Serve localmente il contenuto di `./dist/` così com'è in produzione (utile per verificare prima del deploy).

## Script npm

| Script    | Comando        | Descrizione                          |
|-----------|----------------|--------------------------------------|
| `dev`     | `vite`         | Dev server con hot module replacement |
| `build`   | `vite build`   | Build di produzione ottimizzata      |
| `preview` | `vite preview` | Anteprima locale della build         |

## Deploy (GitHub Pages)

Il deploy è **automatico**: a ogni push su `main`, la pipeline in
[`.github/workflows/deploy.yaml`](.github/workflows/deploy.yaml) esegue
`npm ci` → `npm run build` e pubblica il contenuto di `./dist/` su GitHub Pages.

Requisiti lato repository:

- In **Settings → Pages**, impostare **Source: GitHub Actions**.
- `vite.config.ts` usa `base: "./"` (path relativi), quindi funziona anche sotto
  il sotto-percorso del project site (es. `utente.github.io/matt_bday/`).

## Struttura del progetto

```
.
├── index.html            # Entry point: canvas + overlay UI (HTML/CSS)
├── src/
│   ├── main.js           # Engine, render loop, scene manager
│   ├── style.css         # Stili mobile-first degli overlay
│   ├── ui/               # Gestione overlay DOM (menu, HUD, game over)
│   ├── utils/            # Helper responsive (device profile, resize)
│   └── scenes/           # menu.js, game.js, gameover.js
├── static/               # Asset statici (publicDir di Vite)
│   └── assets/           # Modelli 3D, immagini, suoni
├── vite.config.ts        # Configurazione Vite (base + publicDir)
├── package.json
└── README.md
```

> **Nota:** la cartella `./static/` è configurata come `publicDir` di Vite: i file
> qui dentro sono serviti alla root e copiati nella build senza processing.

## Tech Stack

| Tecnologia  | Ruolo                          |
|-------------|--------------------------------|
| JavaScript  | Linguaggio (ES modules)        |
| Babylon.js  | Engine 3D / rendering          |
| Havok       | Motore fisico                  |
| Vite        | Bundler & dev server           |
| GitHub Pages| Hosting statico                |


## Game config

In order to modify game configuration, refer to `./src/config/game.config.yaml` properties file. adapt values at your will.