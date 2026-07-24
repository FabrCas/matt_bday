# Documento di Contesto – Progetto 3D Web Game

## Panoramica

Gioco 3D web-based sviluppato con **Babylon.js**, ospitato staticamente (nessun backend richiesto). L'obiettivo del gioco è permettere all'utente di giocare per vincere un importo fisso di denaro (dettagli da definire).

Il progetto segue un approccio **mobile-first** con design responsivo e calibrazione basata sulle dimensioni dello schermo (smartphone e desktop).

---

## Tech Stack

| Tecnologia | Ruolo | Note |
|---|---|---|
| Babylon.js | Engine 3D / rendering | CDN o bundled |
| Havok | Motore fisico | Plugin integrato in Babylon.js |
| HTML5 Canvas | Superficie di rendering | Singolo entry point HTML |
| CSS / JS | Layout responsivo | Adattamento mobile + desktop |

> **Nota:** Nessun framework frontend aggiuntivo è previsto al momento. Il progetto è interamente client-side.

---

## Struttura del Progetto

```
/
├── index.html              # Entry point unico
├── static/
│   └── assets/             # Modelli 3D, texture, audio, ecc.
└── src/
    ├── main.js             # Inizializzazione engine e scene manager
    ├── scenes/
    │   ├── menu.js         # Scena Menu
    │   ├── game.js         # Scena Game Rendering
    │   └── gameover.js     # Scena Game Over
    ├── physics/            # Configurazione Havok e utilities fisiche
    ├── ui/                 # Componenti UI overlay
    └── utils/              # Helpers, responsive calibration, ecc.
```

---

## Descrizione delle Scene

### 1. Menu

- **Tipo:** Scena iniziale / entry point
- **Funzione:** Presentazione del gioco, avvio partita
- **Elementi previsti:** Logo, pulsante "Gioca", eventuali impostazioni
- **Note:** Da definire stile grafico e animazioni

### 2. Game Rendering

- **Tipo:** Scena di gameplay principale
- **Funzione:** Rendering 3D del gioco, interazione utente, simulazione fisica
- **Elementi previsti:** Oggetti 3D interattivi, UI in-game, feedback visivi
- **Fisica:** Havok attivo per collisioni e dinamiche di gioco
- **Note:** Meccaniche di gioco da definire nel dettaglio

### 3. Game Over

- **Tipo:** Schermata finale
- **Funzione:** Mostrare il totale vinto dall'utente
- **Elementi previsti:** Importo totale, animazione di chiusura, pulsante per tornare al menu
- **Note:** Logica di calcolo vincita TBD

---

## Strategia Responsiva

| Aspetto | Strategia |
|---|---|
| Approccio | Mobile-first |
| Canvas | Ridimensionamento dinamico (`engine.resize()`) |
| Calibrazione | Basata su `window.innerWidth` / `window.innerHeight` |
| Breakpoint principali | Smartphone (< 768px), Desktop (≥ 768px) |
| Camera | Parametri (FOV, distanza) adattati al dispositivo |
| UI Overlay | Scalatura relativa alla viewport |
| Input | Touch (mobile) + Mouse/Keyboard (desktop) |

```javascript
// Esempio base di resize handling
window.addEventListener("resize", () => {
  engine.resize();
  // Ricalibra parametri camera e UI
});
```

---

## Gestione Asset

- **Percorso base:** `./static/assets/`
- **Tipologie previste:**
  - Modelli 3D (`.glb`, `.gltf`)
  - Texture (`.png`, `.jpg`, `.webp`)
  - Audio (`.mp3`, `.ogg`)
  - Font / sprite UI
- **Caricamento:** `AssetsManager` di Babylon.js o import diretto tramite `SceneLoader`
- **Ottimizzazione:** Compressione texture, LOD dove necessario, lazy loading per asset non critici

---

## Elementi Aperti / TBD

| Elemento | Stato | Note |
|---|---|---|
| Importo vincita fisso | Da definire | Meccanica e valore da stabilire |
| Meccaniche di gioco | Da definire | Tipo di interazione, regole, obiettivi |
| Stile grafico | Da definire | Palette colori, tema visivo |
| Audio / SFX | Da definire | Musica di sottofondo, effetti sonori |
| Bundler / Build tool | Da definire | Vite, Webpack, o semplice script tag |
| Analytics / Tracking | Da definire | Se necessario per monitoraggio |

---

## Changelog

| Data | Versione | Modifiche |
|---|---|---|
| 2024-01-XX | 0.1.0 | Creazione documento iniziale: overview, tech stack, struttura progetto, scene, strategia responsiva |

## Hosting

L'hosting del web game verra' fatto utilizzando le github pages. Nella file `./.github/workflows/deploy.yaml` e' definita la pipeline di deploy.
Dato questo tipo di soluzione, e le risorse limitate di hosting, tenere a mente nello sviluppo di limitare l'uso di risorse come qualita' asset, etc.

## Game Style

Lo stile del gioco deve ricalcare lo stile di giochi classici endless runner.

---

> *Questo documento è un living spec e verrà aggiornato incrementalmente con l'evoluzione del progetto.*