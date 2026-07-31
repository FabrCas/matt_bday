import {
  Scene,
  FreeCamera,
  HemisphericLight,
  DirectionalLight,
  PointLight,
  MeshBuilder,
  StandardMaterial,
  PBRMaterial,
  Color3,
  Color4,
  Vector3,
} from "@babylonjs/core";
import * as ui from "../ui/ui.js";
import { getCameraProfile } from "../utils/responsive.js";
import { CONFIG, computePayout } from "../config/index.js";
import { loadModel, loadModelContainer, disposeModel } from "../utils/modelLoader.js";
import { loadTexture, loadHtmlImage } from "../utils/textureLoader.js";
import { loadSound, disposeSound } from "../utils/audioLoader.js";

// Modello del player: static/assets/3d-models/test.glb
const PLAYER_MODEL = "matt.glb";
const CHANDELIER_MODEL = "lamp_2.glb";

// Immagini dei cartelloni ai lati della strada (static/assets/imgs/), pescate
// a caso da CONFIG.billboards.images (vedi createBillboardImageBag più sotto).
const BILLBOARD_IMAGES = CONFIG.billboards.images.length ? CONFIG.billboards.images : ["billboard_0.jpg"];

// Sprite di nebbia (static/assets/imgs/), combinati su più piani per un banco
// di nebbia con movimento organico invece di una singola texture statica.
const FOG_TEXTURES = ["fog_0.png", "fog_1.png", "fog_2.png", "face_0.png"];

// Set di texture PBR per pavimento/muri (static/assets/imgs/tiles/).
// "_gl" per la normal map: è la convenzione OpenGL (canale G verso l'alto),
// quella che Babylon/WebGL si aspetta di default — "_dx" (DirectX, G invertito)
// darebbe un bump map illuminato al contrario.
const TILE_BASECOLOR = "tiles/ground_tiles_03_basecolor_1k.png";
const TILE_NORMAL = "tiles/ground_tiles_03_normal_gl_1k.png";
const TILE_AO = "tiles/ground_tiles_03_ambient_occlusion_1k.png";
const TILE_ROUGHNESS = "tiles/ground_tiles_03_roughness_1k.png";
// La height map non è usata: richiederebbe parallax occlusion mapping
// (Babylon la legge dal canale alpha della normal map, che andrebbe
// ricomposta a runtime unendo le due immagini) per un costo GPU per-pixel
// non giustificato su hosting statico/mobile-first (vedi CLAUDE.md).

// ===== Costanti di gioco (da config statica) =====
const G = CONFIG.gameplay;
const LANES = G.lanes; // posizioni x delle 3 corsie
const LANE_LERP = G.laneChangeSpeed; // velocità di cambio corsia
const GRAVITY = G.gravity;
const JUMP_SPEED = G.jumpSpeed;
const START_SPEED = G.startSpeed; // unità/s in avanti (mondo che scorre)
const MAX_SPEED = G.maxSpeed;
const ACCEL = G.acceleration; // incremento velocità nel tempo
const SPAWN_AHEAD = G.spawnAhead; // distanza a cui vengono generati gli oggetti
const DESPAWN_BEHIND = -12; // dietro la camera -> riciclo/rimozione (interno)
const ROW_GAP = G.rowGap; // distanza tra le "righe" di ostacoli/monete
const FADE_DISTANCE = 16; // unità percorse per dissolvere in ostacoli/monete allo spawn
const DEBUG = CONFIG.debug; // se true, mostra la hitbox (bounding box) di ogni oggetto
const WALL_HEIGHT = 10;
// ---- Lampadari del corridoio (box giallo + point light poco sotto) ----
// Placeholder: in seguito il box verrà sostituito da un modello importato.
// Riciclati come muri/tile/soffitto, ognuno porta con sé la propria luce
// in modo che si sposti in sincrono (la posizione della luce viene
// aggiornata a mano in update(), i Light di Babylon non seguono in modo
// affidabile un parent come i mesh).
// LAMP_GAP*LAMP_COUNT determina anche dove "rientra" un lampadario riciclato
// (vedi update()): con 30 il punto più vicino di rientro era ~78 unità, ben
// dentro il raggio ancora visibile della fog attuale (causava un pop-in
// visibile). Con 40 rientra a ~108, oltre il punto in cui densityFog lo
// nasconde già quasi del tutto.
const LAMP_GAP = 40; // distanza tra un lampadario e il successivo
const LAMP_COUNT = 4; // numero di lampadari attivi contemporaneamente
const LAMP_BOX_Y = WALL_HEIGHT - 1; // vicino al soffitto
const LAMP_LIGHT_DROP = 0.3; // quanto la point light sta sotto il modello
const CHANDELIER_SCALE = 0.5; // tarare in base alle dimensioni reali del modello lamp.glb
const LAMP_INTENSITY = 1;
// Distanza (in unità di mondo, oltre DESPAWN_BEHIND) su cui l'intensità
// sfuma a 0 prima del riciclo: senza questa dissolvenza il lampadario
// veniva teletrasportato in avanti mentre la sua luce contribuiva ancora
// in modo visibile, dando l'effetto di "spegnimento di colpo".
const LAMP_FADE_DISTANCE = LAMP_GAP/2;
// StandardMaterial limita di default a 4 le luci che possono illuminare
// contemporaneamente una mesh (`maxSimultaneousLights`). Con hemi + N point
// light dei lampadari si supera facilmente quel budget, e Babylon ne scarta
// alcune in modo dipendente dalla configurazione del momento: sembra che
// "alcune luci non si accendano" anche se esistono e sono posizionate bene.
// Va impostato esplicitamente su ogni materiale illuminato dai lampadari.
// const MAX_LIGHTS = LAMP_COUNT + 2; // + direzionale + playerLight
const MAX_LIGHTS = LAMP_COUNT + 1; // + direzionale + playerLight
// ---- Velo di nebbia all'orizzonte (attraversa la vista uno alla volta) ----
// Posizionato esattamente a SPAWN_AHEAD: è lo stesso punto in cui
// compaiono ostacoli/monete, cioè il limite di ciò che è ancora
// visibile prima che la fog di scena diventi troppo densa — non oltre,
// altrimenti il velo viaggerebbe in una zona già invisibile e l'effetto
// andrebbe sprecato.
// Non c'è scorrimento/riciclo in Z: la camera non si muove mai in
// game.js, quindi restare a Z fissa equivale a restare "all'infinito"
// rispetto al giocatore.
// Un solo velo attivo alla volta (una mesh, materiale riassegnato ad ogni
// nuovo passaggio): sceglie a caso una delle 4 texture e una direzione
// (sinistra→destra o il contrario), attraversa lo schermo con una
// dissolvenza in entrata/uscita (mai un pop ai margini), poi dopo una
// pausa casuale ne parte un altro — imprevedibile, non un loop meccanico.
// Dentro la zona di fog localizzata (SPAWN_AHEAD → +FOG_LINEAR_RANGE, vedi
// createGameScene), non prima: il velo deve attraversare mentre la nebbia
// è già presente, non nella zona nitida davanti al giocatore.
const FOG_WALL_Z = SPAWN_AHEAD + 12;
const FOG_WALL_Y = WALL_HEIGHT * 0.55;
const FOG_WALL_WIDTH = 10;
const FOG_WALL_HEIGHT = 10;
const FOG_CROSS_DURATION_MIN = 9; // secondi per attraversare tutto lo schermo
const FOG_CROSS_DURATION_MAX = 15;
const FOG_EDGE_FADE = 0.15; // frazione iniziale/finale del tragitto dedicata alla dissolvenza
const FOG_COOLDOWN_MIN = 1.5; // pausa tra un velo e il successivo
const FOG_COOLDOWN_MAX = 4;


// ---- Dimensioni del corridoio (condivise da pavimento, muri, soffitto e billboard) ----
const TILE_LEN = 30;
const NUM_TILES = 6;
const CORRIDOR_HALF_WIDTH = 5.6; // muri/soffitto arrivano esattamente qui

export async function createGameScene({ engine, canvas, goto }) {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0, 0, 0, 1); // sfondo nero: il vuoto oltre la fog

  // Fog LINEARE localizzata: nessuna foschia prima di SPAWN_AHEAD (tutto ciò
  // che è "in gioco" — pavimento/muri vicini, ostacoli, monete — resta
  // nitido), poi sfuma a piena opacità nera entro FOG_LINEAR_RANGE unità.
  // Copre così anche le distanze a cui muri/billboard/lampadari vengono
  // riciclati (~90-110), nascondendone il pop-in, e si fonde con lo sfondo
  // nero (fogColor = clearColor) invece di lasciare un "muro" visibile.
  const FOG_LINEAR_RANGE = 40;
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogColor = new Color3(0, 0, 0);
  scene.fogStart = SPAWN_AHEAD;
  scene.fogEnd = SPAWN_AHEAD + FOG_LINEAR_RANGE;

  // ---- Camera (dietro il player, adattata al dispositivo) ----
  const cam = getCameraProfile();
  const camera = new FreeCamera("gameCam", new Vector3(0, cam.height, -cam.distance), scene);
  camera.fov = cam.fov;

  // ---- Luci (leggere: hemispheric di riempimento, niente ombre) ----
  // Le point light "vere" sono quelle dei lampadari più sotto, riciclate
  // lungo il corridoio insieme al resto della scena.
  // const hemi = new HemisphericLight("hemi", new Vector3(0, 0, 1), scene);
  // hemi.intensity = 0.01;
  const direct = new DirectionalLight("directional", new Vector3(0,-1,1), scene);
  direct.intensity = 1.5; // alzata: 0.5 rendeva il player poco reattivo alla luce
  direct.specular = new Color3(1, 1, 1);

  // Luce dedicata che segue il player (aggiornata in update()): a differenza
  // dei lampadari, che lo illuminano solo quando è vicino, garantisce un
  // effetto luce sempre forte e costante sul modello durante tutta la corsa.
  // const playerLight = new PointLight("playerLight", new Vector3(0, 3, -1), scene);
  // playerLight.intensity = 1.2;
  // playerLight.diffuse = new Color3(1, 1, 1);
  // playerLight.specular = new Color3(1, 1, 1);


  // ---- Materiali condivisi (riuso => meno draw call/allocazioni) ----
  // Pavimento/muri (e soffitto, che riusa wallMat) in PBR con il set di
  // texture in static/assets/imgs/tiles/. `makeTiledPbrMaterial` carica le
  // 4 mappe e imposta la ripetizione UV in base alla dimensione reale della
  // superficie, così la texture non risulta stirata su pavimento/muri che
  // hanno proporzioni molto diverse tra loro.
  function makeTiledPbrMaterial(name, repeatU, repeatV) {
    const mat = new PBRMaterial(name, scene);
    const albedo = loadTexture(scene, TILE_BASECOLOR);
    const normal = loadTexture(scene, TILE_NORMAL);
    const ao = loadTexture(scene, TILE_AO);
    const roughness = loadTexture(scene, TILE_ROUGHNESS);
    for (const tex of [albedo, normal, ao, roughness]) {
      tex.uScale = repeatU;
      tex.vScale = repeatV;
    }

    mat.albedoTexture = albedo;
    mat.bumpTexture = normal;
    mat.ambientTexture = ao; // occlusione ambientale, indipendente dal canale usato sotto per la roughness

    // Niente texture metallica separata: queste superfici non sono
    // metalliche (metallic fisso a 0). Riusiamo lo slot `metallicTexture`
    // solo per leggere la roughness dal canale verde (un PNG in scala di
    // grigi ha R=G=B, quindi va bene qualunque canale) — l'alpha, letta di
    // default, sarebbe piatta/inutile su questi file.
    mat.metallic = 0;
    mat.metallicTexture = roughness;
    mat.useRoughnessFromMetallicTextureAlpha = false;
    mat.useRoughnessFromMetallicTextureGreen = true;
    mat.useAmbientOcclusionFromMetallicTextureRed = false;
    mat.useMetallnessFromMetallicTextureBlue = false;

    mat.maxSimultaneousLights = MAX_LIGHTS;
    return mat;
  }

  // Repeat tarato sulla dimensione reale delle superfici (pavimento: largo
  // CORRIDOR_HALF_WIDTH*2, lungo TILE_LEN; muri: larghi TILE_LEN, alti
  // WALL_HEIGHT) assumendo una tile ~2 unità di mondo per ripetizione:
  // aggiustare qui se la texture risulta troppo piccola/grande a schermo.
  const groundMat = makeTiledPbrMaterial("groundMat", TILE_LEN / 2, WALL_HEIGHT / 2);

  const wallMat = makeTiledPbrMaterial("wallMat", TILE_LEN / 2, WALL_HEIGHT / 2);
  wallMat.backFaceCulling = false;

  const obstacleMat = new StandardMaterial("obstacleMat", scene);
  obstacleMat.diffuseColor = new Color3(0.85, 0.2, 0.25);
  obstacleMat.specularColor = new Color3(0, 0, 0);
  obstacleMat.maxSimultaneousLights = MAX_LIGHTS;

  const coinMat = new StandardMaterial("coinMat", scene);
  coinMat.diffuseColor = new Color3(0.98, 0.75, 0.15);
  coinMat.emissiveColor = new Color3(0.4, 0.3, 0.0);
  coinMat.specularColor = new Color3(1, 1, 1);
  coinMat.maxSimultaneousLights = MAX_LIGHTS;

  // Moneta bonus rara (vedi G.redCoinChance/redCoinValueMultiplier): stesso
  // mesh della moneta normale, solo materiale diverso e valore moltiplicato.
  const coinRedMat = new StandardMaterial("coinRedMat", scene);
  coinRedMat.diffuseColor = new Color3(0.9, 0.1, 0.12);
  coinRedMat.emissiveColor = new Color3(0.55, 0.03, 0.03);
  coinRedMat.specularColor = new Color3(1, 1, 1);
  coinRedMat.maxSimultaneousLights = MAX_LIGHTS;

  // ---- Suoni ----
  // Non in `await`: un SFX non è critico per il gioco, quindi il suo
  // caricamento non deve bloccare l'avvio della scena (vedi audioLoader.js
  // per il perché di un eventuale caricamento lento/fallito).
  let coinSfx = null;
  loadSound("coin.mp3", { volume: 0.8 }).then((s) => {
    coinSfx = s;
  });

  let coinredSfx = null;
  loadSound("coin_red.mp3", { volume: 0.8 }).then((s) => {
    coinredSfx = s;
  });

  let soundtrack = null;
  loadSound("soundtrack_game.mp3", { volume: 0.6 , loop: true}).then((s) => {
    soundtrack = s;
  });

  // ---- Player (modello importato) ----
  // Nota: 0.8 come altezza da terra e le soglie di collisione più sotto
  // (py < 1.6, |py - 1.0| < 1.1) erano tarate sulla capsula placeholder;
  // vanno riverificate/aggiustate in base alle dimensioni reali del modello
  // (scaling, pivot) una volta importato character.glb.
  const { root: player, meshes: playerMeshes, animationGroups: playerAnimationGroups } = await loadModel(
    scene,
    PLAYER_MODEL,
    {
      position: new Vector3(0, 0.8, 0),
      scaling: new Vector3(2, 2, 2), // tarare in base alle dimensioni reali del modello
    }
  );
  if (DEBUG) playerMeshes.forEach((m) => (m.showBoundingBox = true));
  // 180°: il modello è importato rivolto verso la camera invece che in avanti.
  // L'import glTF spesso imposta rotationQuaternion sulla root: se presente,
  // .rotation viene silenziosamente ignorata da Babylon, quindi va azzerata.
  player.rotationQuaternion = null;
  player.rotation.y = 0;
  // Avviata subito (non lasciata al default, che con SceneLoader.ImportMeshAsync
  // non fa autoplay): senza questo il modello resta in T-pose finché qualcos'altro
  // non la avvia, ed è esattamente il "flash" in T-pose visto prima che l'animazione
  // parta. Avviarla qui, prima dello whenReadyAsync più sotto, garantisce che sia
  // già in corso quando la schermata di loading viene nascosta.
  playerAnimationGroups.forEach((ag) => ag.start(true));


  // ---- Modello lampadario (glb) ----
  // Caricato una sola volta come AssetContainer e istanziato LAMP_COUNT volte
  // (vedi il ciclo `lamps` più sotto), al posto del box giallo placeholder:
  // evita di scaricare/parsare il file una volta per ogni lampadario.
  const chandelierContainer = await loadModelContainer(scene, CHANDELIER_MODEL);

  // Fix per materiali importati da glb (player, lampadari, ecc.):
  // 1) stesso cap di luci degli altri materiali della scena (vedi MAX_LIGHTS
  //    più sopra) — senza questo, con directional + N point light dei
  //    lampadari si supera il default di 4 e Babylon ne scarta alcune sul
  //    modello, che risulta poco/non illuminato.
  // 2) forza opacità piena: alcuni export glb portano con sé un alphaMode/
  //    canale alpha residuo (anche se apparentemente opaco nel tool 3D),
  //    che Babylon applica come vera trasparenza via transparencyMode.
  function fixImportedMaterials(meshes) {
    for (const m of meshes) {
      const mat = m.material;
      if (!mat) continue;
      mat.maxSimultaneousLights = MAX_LIGHTS;
      if (mat.transparencyMode !== undefined) {
        mat.transparencyMode = PBRMaterial.PBRMATERIAL_OPAQUE;
      }
      if (mat.alpha !== undefined) mat.alpha = 1;
      if (mat.albedoColor) mat.albedoColor.a = 1;
    }
  }
  fixImportedMaterials(playerMeshes);



  // ---- Pista: segmenti di terreno riciclati per effetto infinito ----
  // Larghezza pari alla distanza tra i due muri, così il pavimento li tocca
  // invece di lasciare uno spazio vuoto ai lati.
  const tiles = [];
  for (let i = 0; i < NUM_TILES; i++) {
    const t = MeshBuilder.CreateBox(
      "tile" + i,
      { width: CORRIDOR_HALF_WIDTH * 2, height: 0.5, depth: TILE_LEN },
      scene
    );
    t.material = groundMat;
    t.position.set(0, -0.25, i * TILE_LEN);
    tiles.push(t);
  }

  // ---- Muri laterali del corridoio (piani grigi, riciclati come i tile) ----
  // Stessa lunghezza/numero segmenti dei tile del terreno, così scorrono in sync.
  const walls = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < NUM_TILES; i++) {
      const w = MeshBuilder.CreatePlane(
        "wall" + side + "_" + i,
        { width: TILE_LEN, height: WALL_HEIGHT },
        scene
      );
      w.material = wallMat;
      // Specchiata in base al lato: altrimenti entrambi i muri avrebbero la
      // stessa normale "vera" (usata per l'illuminazione N·L), e quello con
      // la normale che punta lontano dal centro risulterebbe sempre buio con
      // point/directional light (backFaceCulling:false lo rende comunque
      // visibile, ma non illuminato correttamente).
      w.rotation.y = side === 1 ? Math.PI / 2 : -Math.PI / 2;
      w.position.set(side * CORRIDOR_HALF_WIDTH, WALL_HEIGHT / 2, i * TILE_LEN);
      walls.push(w);
    }
  }

  // ---- Soffitto del corridoio (stesso stile/materiale dei muri) ----
  const ceilings = [];
  for (let i = 0; i < NUM_TILES; i++) {
    const c = MeshBuilder.CreatePlane(
      "ceiling" + i,
      { width: CORRIDOR_HALF_WIDTH * 2, height: TILE_LEN },
      scene
    );
    c.material = wallMat;
    // Segno opposto rispetto a quello "naturale": con +PI/2 la normale vera
    // punta verso l'alto (lontano dall'interno del corridoio, dove sta la
    // luce), risultando sempre in ombra con point/directional light nonostante
    // sia visibile (backFaceCulling:false). Con -PI/2 punta verso il basso,
    // verso l'interno.
    c.rotation.x = -Math.PI / 2; // piano orizzontale, normale rivolta verso il basso
    c.position.set(0, WALL_HEIGHT, i * TILE_LEN);
    ceilings.push(c);
  }


  const lamps = [];
  for (let i = 0; i < LAMP_COUNT; i++) {
    const z = i * LAMP_GAP;

    // Istanza del modello lampadario (vedi chandelierContainer più sopra) al
    // posto del vecchio box giallo placeholder. `instantiateModelsToScene`
    // clona la gerarchia di nodi ma riusa i materiali (cloneMaterials:
    // false), quindi tutte le istanze condividono le stesse texture/draw
    // call di materiale.
    const { rootNodes } = chandelierContainer.instantiateModelsToScene(
      (name) => `${name}_lamp${i}`,
      false
    );
    const model = rootNodes[0];
    model.position.set(0, LAMP_BOX_Y -1 , z);
    model.rotation.x= Math.PI;
    model.scaling.set(CHANDELIER_SCALE, CHANDELIER_SCALE, CHANDELIER_SCALE);
    if (DEBUG) model.getChildMeshes().forEach((m) => (m.showBoundingBox = true));
    fixImportedMaterials(model.getChildMeshes());

    // Posizione iniziale della luce ricavata dal modello (vedi update(): resta
    // sempre derivata da esso, non c'è uno stato separato che possa
    // disallinearsi).
    const light = new PointLight("lampLight" + i, Vector3.Zero(), scene);
    light.diffuse = new Color3(1, 1, 1);
    light.intensity = LAMP_INTENSITY;
    // Nota risorse (hosting statico su GitHub Pages, vedi CLAUDE.md): ogni
    // point light aggiuntiva ha un costo; LAMP_COUNT è tenuto basso perché
    // solo quelle vicine al player contribuiscono in modo visibile.

    // Marker di debug: sfera rossa esattamente sulla posizione della luce,
    // per verificare a video che resti sempre allineata al modello
    // (utile per confermare/escludere drift modello↔luce).
    let debugMarker = null;
    if (DEBUG) {
      debugMarker = MeshBuilder.CreateSphere("lampLightMarker" + i, { diameter: 0.2 }, scene);
      const debugMarkerMat = new StandardMaterial("lampLightMarkerMat" + i, scene);
      debugMarkerMat.diffuseColor = new Color3(1, 0, 0);
      debugMarkerMat.emissiveColor = new Color3(1, 0, 0);
      debugMarker.material = debugMarkerMat;
    }

    lamps.push({ model, light, debugMarker });
  }


  // Ampiezza del tragitto orizzontale = metà larghezza visibile a quella
  // distanza (dal FOV orizzontale reale, aspect ratio incluso), con un
  // margine di sicurezza: il velo nasce/muore appena dentro al bordo dello
  // schermo invece che a un X arbitrario che potrebbe restare sempre
  // fuori vista (o sempre dentro, "murando" il fondo).
  const fogAspect = engine.getRenderWidth() / engine.getRenderHeight();
  const fogTanHalfV = Math.tan(cam.fov / 2);
  const fogTanHalfH = fogTanHalfV * fogAspect;
  const fogDistanceFromCamera = FOG_WALL_Z + cam.distance;
  const FOG_TRAVEL_HALF = fogDistanceFromCamera * fogTanHalfH * 0.92;

  const fogMats = FOG_TEXTURES.map((file, idx) => {
    const mat = new StandardMaterial("fogMat" + idx, scene);
    const tex = loadTexture(scene, file);
    tex.hasAlpha = true;
    mat.diffuseTexture = tex;
    mat.useAlphaFromDiffuseTexture = true;
    mat.emissiveColor = new Color3(0.5, 0.5, 0.52); // grigio neutro: leggibile contro lo sfondo nero
    mat.specularColor = new Color3(0, 0, 0);
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    return { material: mat, texture: tex, uSpeed: 0.02 + idx * 0.01, vSpeed: 0.015 + idx * 0.008 };
  });

  const fogWisp = MeshBuilder.CreatePlane(
    "fogWisp",
    { width: FOG_WALL_WIDTH, height: FOG_WALL_HEIGHT },
    scene
  );
  fogWisp.position.set(0, FOG_WALL_Y, FOG_WALL_Z);
  fogWisp.setEnabled(false);

  // Stato del velo attivo/in pausa: gestito interamente in update() (vedi
  // spawnFogWisp / avanzamento più sotto), nessuna logica extra qui.
  const fogState = {
    active: false,
    progress: 0,
    duration: 0,
    fromX: 0,
    toX: 0,
    mat: null,
    cooldown: 1 + Math.random() * FOG_COOLDOWN_MAX,
  };
  function spawnFogWisp() {
    const dir = Math.random() < 0.5 ? 1 : -1; // sinistra→destra o il contrario, a caso
    fogState.mat = fogMats[Math.floor(Math.random() * fogMats.length)];
    fogWisp.material = fogState.mat.material;
    fogState.fromX = -dir * FOG_TRAVEL_HALF;
    fogState.toX = dir * FOG_TRAVEL_HALF;
    fogState.progress = 0;
    fogState.duration = FOG_CROSS_DURATION_MIN + Math.random() * (FOG_CROSS_DURATION_MAX - FOG_CROSS_DURATION_MIN);
    fogState.active = true;
    fogWisp.position.x = fogState.fromX;
    fogWisp.setEnabled(true);
  }

  // ---- Cartelloni ai lati della strada (stesso schema di riciclo delle strisce) ----
  // Ogni "coppia" (sx+dx) mostra sempre la stessa immagine, pescata a caso dal
  // pool di CONFIG.billboards.images con un sistema "bag" (stile Tetris): le
  // immagini non si ripetono finché non sono uscite tutte, poi il sacchetto
  // viene rimescolato e si ricomincia.
  const BILLBOARD_WALL_GAP = 0.05; // piccolo margine tra il bordo del cartellone e il muro
  const BILLBOARD_Y = WALL_HEIGHT/2; // altezza da terra
  const BILLBOARD_GAP = 70; // distanza tra una coppia di cartelloni e la successiva
  const BILLBOARD_PAIR_COUNT = CONFIG.billboards.count; // coppie sx/dx attive contemporaneamente
  // Dimensioni "landscape" (larghezza > altezza) di riferimento: per le
  // immagini portrait (più alte che larghe) vengono scambiate, vedi
  // billboardIsPortrait/billboardSize più sotto, così il cartellone non
  // risulta mai stirato rispetto alle proporzioni reali dell'immagine.
  const BILLBOARD_WIDTH = 5;
  const BILLBOARD_HEIGHT = 3;
  // Angolate leggermente verso chi arriva (come i cartelloni pubblicitari
  // veri lungo una strada), invece di stare di taglio a 90° rispetto al
  // corridoio: a 90° la faccia frontale è rivolta solo verso il centro
  // strada e risulta visibile quasi di striscio finché il player non è
  // praticamente affiancato. Riducendo l'angolo si guadagna un componente
  // rivolta all'indietro (verso la telecamera in arrivo), quindi il
  // cartellone si "apre" verso l'inquadratura molto prima, restando
  // leggibile per un tratto più lungo.
  const BILLBOARD_TILT = Math.PI / 6; // 30°

  // Orientamento reale di ciascuna immagine (portrait/landscape), letto una
  // sola volta all'avvio dalle dimensioni naturali del file — non deducibile
  // dal nome. Va risolto prima di creare i piani, perché determina se usare
  // BILLBOARD_WIDTH/HEIGHT dritte o scambiate.
  const billboardIsPortrait = new Map();
  await Promise.all(
    BILLBOARD_IMAGES.map(async (img) => {
      try {
        const el = await loadHtmlImage(img);
        billboardIsPortrait.set(img, el.naturalHeight > el.naturalWidth);
      } catch {
        billboardIsPortrait.set(img, false); // fallback landscape se l'immagine non carica
      }
    })
  );
  function billboardSize(imgName) {
    return billboardIsPortrait.get(imgName)
      ? { width: BILLBOARD_HEIGHT, height: BILLBOARD_WIDTH }
      : { width: BILLBOARD_WIDTH, height: BILLBOARD_HEIGHT };
  }

  // Un materiale per immagine, riusato da tutte le coppie che in un dato
  // momento mostrano quella stessa immagine (niente texture duplicate).
  const billboardMatCache = new Map();
  function getBillboardMaterial(imgName) {
    let mat = billboardMatCache.get(imgName);
    if (!mat) {
      mat = new StandardMaterial("billboardMat_" + imgName, scene);
      mat.diffuseTexture = loadTexture(scene, imgName);
      mat.specularColor = new Color3(0, 0, 0);
      mat.backFaceCulling = false; // visibile da entrambi i lati del piano
      mat.maxSimultaneousLights = MAX_LIGHTS;
      billboardMatCache.set(imgName, mat);
    }
    return mat;
  }

  // Sacchetto di indici: si svuota pescando senza reinserire, si rimescola
  // (Fisher-Yates) solo quando è vuoto — garantisce "nessuna ripetizione
  // finché le altre non sono già uscite", non una semplice scelta uniforme.
  let billboardBag = [];
  function drawBillboardImage() {
    if (billboardBag.length === 0) {
      billboardBag = Array.from({ length: BILLBOARD_IMAGES.length }, (_, i) => i);
      for (let i = billboardBag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [billboardBag[i], billboardBag[j]] = [billboardBag[j], billboardBag[i]];
      }
    }
    return BILLBOARD_IMAGES[billboardBag.pop()];
  }

  // Cornice bianca dietro ogni cartellone (effetto "quadro incorniciato").
  // Bianco puro e non influenzato dalle luci di scena (disableLighting),
  // così resta uniforme indipendentemente da normali/angolo della luce.
  const FRAME_MARGIN = 0.3; // sporgenza del bordo rispetto all'immagine
  const FRAME_THICKNESS = 0.08;
  const FRAME_OFFSET = FRAME_THICKNESS / 2 + 0.02; // dietro l'immagine, verso il muro
  const billboardFrameMat = new StandardMaterial("billboardFrameMat", scene);
  billboardFrameMat.diffuseColor = new Color3(1, 1, 1);
  billboardFrameMat.specularColor = new Color3(1, 1, 1);
  billboardFrameMat.disableLighting = false;
  billboardFrameMat.maxSimultaneousLights = MAX_LIGHTS;

  function makeBillboardFrame(name, parentPlane, width, height) {
    const frame = MeshBuilder.CreateBox(
      name,
      { width: width + FRAME_MARGIN, height: height + FRAME_MARGIN, depth: FRAME_THICKNESS },
      scene
    );
    frame.material = billboardFrameMat;
    frame.parent = parentPlane;
    // Piano figlio: segue automaticamente posizione/rotazione del cartellone
    // (compreso lo scorrimento nel loop di update). Spostata lungo l'asse Z
    // locale (= normale del cartellone), che grazie alla rotazione già
    // specchiata in base al lato punta sempre verso il muro del proprio lato.
    frame.position.set(0, 0, FRAME_OFFSET);
    return frame;
  }

  // Metà della larghezza mondiale che il piano proietta sull'asse X per
  // effetto del tilt (vedi BILLBOARD_TILT): un piano ruotato di
  // (90°-BILLBOARD_TILT) invece che di 90° netti non è più parallelo al
  // muro, quindi il suo bordo si allarga verso il muro proporzionalmente
  // alla propria larghezza — le immagini landscape/portrait (larghezze
  // diverse, vedi billboardSize) proiettano quantità diverse. Senza questo
  // calcolo il piano compenetrerebbe il muro (o ne resterebbe troppo
  // distante) a seconda di quale immagine gli viene assegnata.
  function billboardXProjection(width) {
    return (width / 2) * Math.sin(BILLBOARD_TILT);
  }

  function makeBillboardPlane(name, sign, width, height) {
    const b = MeshBuilder.CreatePlane(name, { width, height }, scene);
    const x = sign * (CORRIDOR_HALF_WIDTH - BILLBOARD_WALL_GAP - billboardXProjection(width));
    b.position.set(x, BILLBOARD_Y, 0);
    // Stesso problema dei muri: senza specchiare in base al lato, entrambi i
    // cartelloni avrebbero la normale vera rivolta nella stessa direzione
    // mondiale, e quelli sul lato sinistro risulterebbero sempre in ombra.
    // Il -/+ BILLBOARD_TILT (invece di un ±90° netto) apre entrambi verso la
    // telecamera in arrivo (vedi commento su BILLBOARD_TILT più sopra).
    b.rotation.y = sign > 0 ? Math.PI / 2 - BILLBOARD_TILT : -Math.PI / 2 + BILLBOARD_TILT;
    return b;
  }

  // Un cartellone (piano + cornice) viene ricreato ad ogni cambio immagine
  // (creazione iniziale e ogni riciclo): le dimensioni del piano dipendono
  // dall'orientamento dell'immagine e non possono essere cambiate su una
  // geometria già creata, quindi la mesh precedente va sostituita.
  function buildBillboardSide(prev, name, sign, z, imgName) {
    if (prev?.frame) prev.frame.dispose();
    if (prev?.plane) prev.plane.dispose();
    const { width, height } = billboardSize(imgName);
    const plane = makeBillboardPlane(name, sign, width, height);
    plane.position.z = z;
    plane.material = getBillboardMaterial(imgName);
    const frame = makeBillboardFrame(name + "Frame", plane, width, height);
    return { plane, frame };
  }

  const billboards = []; // { left, right } — stessa immagine su entrambi, sincronizzati in z
  for (let i = 0; i < BILLBOARD_PAIR_COUNT; i++) {
    const z = i * BILLBOARD_GAP;
    const img = drawBillboardImage();
    const left = buildBillboardSide(null, "billboardL" + i, -1, z, img);
    const right = buildBillboardSide(null, "billboardR" + i, 1, z, img);
    billboards.push({ left, right });
  }

  // ---- Pool ostacoli e monete ----
  function makeObstacle(i) {
    const o = MeshBuilder.CreateBox("obs" + i, { width: 1.4, height: 1.4, depth: 1.4 }, scene);
    o.material = obstacleMat;
    o.setEnabled(false);
    if (DEBUG) o.showBoundingBox = true;
    return { mesh: o, active: false, lane: 0, type: "obstacle" };
  }
  function makeCoin(i) {
    const c = MeshBuilder.CreateCylinder("coin" + i, { diameter: 0.8, height: 0.12, tessellation: 16 }, scene);
    c.material = coinMat;
    c.rotation.z = Math.PI / 2;
    c.setEnabled(false);
    if (DEBUG) c.showBoundingBox = true;
    scene.onBeforeRenderObservable.add(() => {
        c.rotation.y += 0.1;
    });
    return { mesh: c, active: false, lane: 0, type: "coin", value: 1 };
  }


  const obstacles = Array.from({ length: 12 }, (_, i) => makeObstacle(i));
  const coins = Array.from({ length: 24 }, (_, i) => makeCoin(i));

  function spawnFrom(pool) {
    return pool.find((e) => !e.active) || null;
  }

  // ===== Stato di gioco =====
  const state = {
    running: true,
    speed: START_SPEED,
    distance: 0,
    coins: 0,
    laneIndex: 1,
    targetX: LANES[1],
    velY: 0,
    grounded: true,
    nextSpawnZ: SPAWN_AHEAD,
    fogTime: 0, // orologio indipendente dalla velocità, per il moto dei banchi di nebbia
  };

  function spawnRow() {
    // Sceglie una corsia libera per l'ostacolo; monete su una corsia diversa.
    const obsLane = Math.floor(Math.random() * 3);
    const ob = spawnFrom(obstacles);
    if (ob) {
      ob.active = true;
      ob.lane = obsLane;
      ob.mesh.setEnabled(true);
      ob.mesh.visibility = 0; // dissolve in gradualmente, vedi update()
      ob.mesh.position.set(LANES[obsLane], 0.7, state.nextSpawnZ);
    }

    // Fila di monete su una corsia diversa (a volte).
    if (Math.random() < G.coinSpawnChance) {
      let coinLane = Math.floor(Math.random() * 3);
      if (coinLane === obsLane) coinLane = (coinLane + 1) % 3;
      const count = G.coinRowLength;
      for (let k = 0; k < count; k++) {
        const co = spawnFrom(coins);
        if (!co) break;
        co.active = true;
        co.lane = coinLane;
        co.value = 1;
        co.mesh.material = coinMat;
        co.mesh.setEnabled(true);
        co.mesh.visibility = 0; // dissolve in gradualmente, vedi update()
        co.mesh.position.set(LANES[coinLane], 1.0, state.nextSpawnZ + k * 1.6);
      }
    }

    // Moneta bonus rara, indipendente dalla fila di monete normali: bassa
    // probabilità, valore moltiplicato (vedi G.redCoinChance/redCoinValueMultiplier).
    if (Math.random() < G.redCoinChance) {
      let redLane = Math.floor(Math.random() * 3);
      if (redLane === obsLane) redLane = (redLane + 1) % 3;
      const red = spawnFrom(coins);
      if (red) {
        red.active = true;
        red.lane = redLane;
        red.value = G.redCoinValueMultiplier;
        red.mesh.material = coinRedMat;
        red.mesh.setEnabled(true);
        red.mesh.visibility = 0; // dissolve in gradualmente, vedi update()
        red.mesh.position.set(LANES[redLane], 1.0, state.nextSpawnZ);
      }
    }

    state.nextSpawnZ += ROW_GAP;
  }

  // Pre-popola qualche riga davanti al player.
  for (let i = 0; i < 6; i++) spawnRow();
  soundtrack?.play();

  // ===== Input =====
  function changeLane(dir) {
    state.laneIndex = Math.max(0, Math.min(2, state.laneIndex + dir));
    state.targetX = LANES[state.laneIndex];
  }
  function jump() {
    if (state.grounded) {
      state.velY = JUMP_SPEED;
      state.grounded = false;
    }
  }

  function onKey(e) {
    if (!state.running) return;
    switch (e.key) {
      case "ArrowLeft":
      case "a":
      case "A":
        changeLane(-1);
        break;
      case "ArrowRight":
      case "d":
      case "D":
        changeLane(1);
        break;
      case "ArrowUp":
      case "w":
      case "W":
      case " ":
        jump();
        break;
    }
  }
  window.addEventListener("keydown", onKey);

  // Touch/swipe
  let touchStart = null;
  const SWIPE_MIN = 30;
  function onPointerDown(e) {
    touchStart = { x: e.clientX, y: e.clientY };
  }
  function onPointerUp(e) {
    if (!touchStart || !state.running) {
      touchStart = null;
      return;
    }
    const dx = e.clientX - touchStart.x;
    const dy = e.clientY - touchStart.y;
    if (Math.abs(dx) < SWIPE_MIN && Math.abs(dy) < SWIPE_MIN) {
      jump(); // tap = salto
    } else if (Math.abs(dx) > Math.abs(dy)) {
      changeLane(dx > 0 ? 1 : -1);
    } else if (dy < 0) {
      jump(); // swipe su = salto
    }
    touchStart = null;
  }
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);

  // ===== Fine partita =====
  function gameOver() {
    if (!state.running) return;
    state.running = false;
    let payout = computePayout(state.coins);
    const amount = payout[0];
    const diff_amount = CONFIG.economy.maxPayout - amount
    const gameover_message = payout[1] ? "Complimenti per la vincita, ma noi abbiamo solo questi ..." : `${amount}€...davvero?, ${diff_amount}€ te li offriamo noi.`
    console.log(amount);
    console.log(gameover_message);
    goto("gameover", { coins: state.coins, distance: state.distance, amount: CONFIG.economy.maxPayout, message: gameover_message});
  }

  // Aspetta che tutte le texture/materiali (pavimento, muri, cartelloni,
  // lampadari, nebbia, ecc.) siano effettivamente pronti prima di far
  // rientrare la promise: `goto()` in main.js tiene la schermata di loading
  // finché questa funzione non ritorna, quindi senza questa attesa venivano
  // nascosta troppo presto, mentre molte texture caricavano ancora in
  // background (pop-in visibile).
  await scene.whenReadyAsync(true);

  ui.show("hud");
  ui.updateHud({ coins: 0, distance: 0 });

  // ===== Loop =====
  function update(dt) {
    if (!state.running) return;

    // Velocità crescente nel tempo.
    state.speed = Math.min(MAX_SPEED, state.speed + ACCEL * dt);
    const move = state.speed * dt;
    state.distance += move;

    // Movimento laterale (lerp verso la corsia target).
    player.position.x += (state.targetX - player.position.x) * Math.min(1, LANE_LERP * dt);

    // Luce dedicata sempre allineata al player (vedi dichiarazione più sopra).
    // playerLight.position.set(player.position.x, player.position.y + 2, player.position.z - 1);

    // Salto (integrazione verticale kinematica).
    if (!state.grounded) {
      state.velY += GRAVITY * dt;
      player.position.y += state.velY * dt;
      if (player.position.y <= 0.8) {
        player.position.y = 0.8;
        state.velY = 0;
        state.grounded = true;
      }
    }

    // Scorrimento pista.
    for (const t of tiles) {
      t.position.z -= move;
      if (t.position.z < -TILE_LEN) t.position.z += TILE_LEN * NUM_TILES;
    }
    for (const w of walls) {
      w.position.z -= move;
      if (w.position.z < -TILE_LEN) w.position.z += TILE_LEN * NUM_TILES;
    }
    for (const c of ceilings) {
      c.position.z -= move;
      if (c.position.z < -TILE_LEN) c.position.z += TILE_LEN * NUM_TILES;
    }
    // for (const s of stripes) {
    //   s.position.z -= move;
    //   if (s.position.z < DESPAWN_BEHIND) s.position.z += 4 * stripes.length;
    // }
    for (const bp of billboards) {
      bp.left.plane.position.z -= move;
      bp.right.plane.position.z -= move;
      if (bp.left.plane.position.z < DESPAWN_BEHIND) {
        const newZ = bp.left.plane.position.z + BILLBOARD_GAP * billboards.length;
        // Nuova immagine ad ogni riciclo, pescata dal sacchetto: stessa su
        // entrambi i lati della coppia. La mesh va ricreata (non solo il
        // materiale) perché la nuova immagine può avere un orientamento
        // diverso, quindi un piano/cornice di dimensioni diverse.
        const img = drawBillboardImage();
        bp.left = buildBillboardSide(bp.left, bp.left.plane.name, -1, newZ, img);
        bp.right = buildBillboardSide(bp.right, bp.right.plane.name, 1, newZ, img);
      }
    }
    for (const l of lamps) {
      l.model.position.z -= move;
      if (l.model.position.z < DESPAWN_BEHIND) {
        l.model.position.z += LAMP_GAP * LAMP_COUNT;
      }
      // Luce sempre allineata al modello: posizione ricavata da esso ogni
      // frame invece di un secondo stato aggiornato in parallelo.
      l.light.position.x = l.model.position.x;
      l.light.position.y = l.model.position.y - LAMP_LIGHT_DROP;
      l.light.position.z = l.model.position.z;
      if (l.debugMarker) l.debugMarker.position.copyFrom(l.light.position);

      // Dissolvenza vicino al bordo di riciclo: l'intensità scende a 0 prima
      // che il lampadario venga teletrasportato in avanti, così il "salto"
      // non si vede più come uno spegnimento improvviso.
      const distFromRecycle = l.model.position.z - DESPAWN_BEHIND;
      const fade = Math.min(1, Math.max(0, distFromRecycle / LAMP_FADE_DISTANCE));
      l.light.intensity = LAMP_INTENSITY * fade;
    }

    // Velo di nebbia all'orizzonte: nessuno scorrimento/riciclo in Z (resta
    // fisso a SPAWN_AHEAD, "all'infinito"), solo attraversamento orizzontale
    // di un velo alla volta. Orologio dedicato (state.fogTime), indipendente
    // dalla velocità di gioco, altrimenti la nebbia "correrebbe" sempre più
    // veloce insieme all'accelerazione del corridoio.
    state.fogTime += dt;
    if (!fogState.active) {
      fogState.cooldown -= dt;
      if (fogState.cooldown <= 0) spawnFogWisp();
    } else {
      fogState.progress += dt / fogState.duration;
      if (fogState.progress >= 1) {
        fogState.active = false;
        fogWisp.setEnabled(false);
        fogState.cooldown = FOG_COOLDOWN_MIN + Math.random() * (FOG_COOLDOWN_MAX - FOG_COOLDOWN_MIN);
      } else {
        fogWisp.position.x = fogState.fromX + (fogState.toX - fogState.fromX) * fogState.progress;
        // Dissolvenza in entrata/uscita: niente pop ai margini del percorso.
        const fadeIn = Math.min(1, fogState.progress / FOG_EDGE_FADE);
        const fadeOut = Math.min(1, (1 - fogState.progress) / FOG_EDGE_FADE);
        fogWisp.visibility = Math.min(fadeIn, fadeOut) * 0.6;
        // Deriva UV oscillante del materiale attivo (non uno scroll continuo,
        // per non mostrare la giuntura di una texture non seamless).
        const m = fogState.mat;
        m.texture.uOffset = Math.sin(state.fogTime * m.uSpeed) * 0.1;
        m.texture.vOffset = Math.sin(state.fogTime * m.vSpeed) * 0.06;
      }
    }

    // Ostacoli e monete: scorrono verso il player.
    const px = player.position.x;
    const py = player.position.y;

    for (const ob of obstacles) {
      if (!ob.active) continue;
      ob.mesh.position.z -= move;
      // Dissolvenza in ingresso: appare gradualmente invece di comparire di scatto.
      ob.mesh.visibility = Math.min(1, Math.max(0, (SPAWN_AHEAD - ob.mesh.position.z) / FADE_DISTANCE));
      // Collisione: vicino in z, stessa corsia, player non abbastanza in alto.
      if (Math.abs(ob.mesh.position.z) < 0.9 && Math.abs(ob.mesh.position.x - px) < 1.0 && py < 1.6) {
        gameOver();
        return;
      }
      if (ob.mesh.position.z < DESPAWN_BEHIND) {
        ob.active = false;
        ob.mesh.setEnabled(false);
      }
    }

    for (const co of coins) {
      if (!co.active) continue;
      co.mesh.position.z -= move;
      co.mesh.rotation.x += dt * 6; // rotazione moneta
      // Dissolvenza in ingresso: appare gradualmente invece di comparire di scatto.
      co.mesh.visibility = Math.min(1, Math.max(0, (SPAWN_AHEAD - co.mesh.position.z) / FADE_DISTANCE));
      if (Math.abs(co.mesh.position.z) < 0.9 && Math.abs(co.mesh.position.x - px) < 0.9 && Math.abs(py - 1.0) < 1.1) {
        co.active = false;
        co.mesh.setEnabled(false);
        state.coins += co.value;
        // if (co.value == G.redCoinValueMultiplier) {
        //   coinredSfx?.play();
        // }
        // else{coinSfx?.play();}
        co.value == G.redCoinValueMultiplier ? coinredSfx?.play() : coinSfx?.play();  
      }
      if (co.mesh.position.z < DESPAWN_BEHIND) {
        co.active = false;
        co.mesh.setEnabled(false);
      }
    }

    // Genera nuove righe man mano che il "fronte" si avvicina.
    state.nextSpawnZ -= move;
    while (state.nextSpawnZ < SPAWN_AHEAD) spawnRow();

    ui.updateHud({ coins: state.coins * CONFIG.economy.coinValue, distance: state.distance });
  }

  function dispose() {
    window.removeEventListener("keydown", onKey);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointerup", onPointerUp);
    disposeSound(coinSfx);
    disposeSound(coinredSfx);
    disposeSound(soundtrack);
    disposeModel({ meshes: playerMeshes, animationGroups: playerAnimationGroups });
    scene.dispose();
  }

  return { scene, update, dispose };
}
