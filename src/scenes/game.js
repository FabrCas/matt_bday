import {
  Scene,
  FreeCamera,
  HemisphericLight,
  DirectionalLight,
  PointLight,
  MeshBuilder,
  Mesh,
  StandardMaterial,
  PBRMaterial,
  Texture,
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
const CHANDELIER_MODEL = "lamp.glb";

// Immagini dei cartelloni ai lati della strada (static/assets/imgs/), pescate
// a caso da CONFIG.billboards.images (vedi createBillboardImageBag più sotto).
const BILLBOARD_IMAGES = CONFIG.billboards.images.length ? CONFIG.billboards.images : ["billboard_0.jpg"];

// Sprite di nebbia (static/assets/imgs/), combinati su più piani per un banco
// di nebbia con movimento organico invece di una singola texture statica.
const FOG_TEXTURES = ["fog_0.png", "fog_1.png", "fog_2.png", "face_0.png", "ghost_max.png"];
// const FOG_TEXTURES = ["ghost_max.png"];
const JUMP_SOUNDS = [
  "salto base 1.mp3",
  "salto base 2.mp3",
  "salto forte 1.mp3",
  "salto forte 2.mp3",
  "salto greve 1.mp3",
  "salto greve 2.mp3"
]

// Set di texture PBR per pavimento/muri (static/assets/imgs/tiles/).
// "_gl" per la normal map: è la convenzione OpenGL (canale G verso l'alto),
// quella che Babylon/WebGL si aspetta di default — "_dx" (DirectX, G invertito)
// darebbe un bump map illuminato al contrario.
const TILE_BASECOLOR = "tiles/ground_tiles_03_basecolor_1k.png";
const TILE_NORMAL = "tiles/ground_tiles_03_normal_gl_1k.png";
const TILE_AO = "tiles/ground_tiles_03_ambient_occlusion_1k.png";
const TILE_ROUGHNESS = "tiles/ground_tiles_03_roughness_1k.png";

const TILE_BASECOLOR_1 = "tiles/ground_tiles_24_baseColo_1k.png";
const TILE_NORMAL_1 = "tiles/ground_tiles_24_normal_gl_1k.png";
const TILE_AO_1 = "tiles/ground_tiles_24_ambientOcclusion_1k.png";
const TILE_ROUGHNESS_1 = "tiles/ground_tiles_24_roughness_1k.png";
// Ogni GROUND_THEME_SWITCH_DISTANCE metri percorsi il pavimento alterna tra
// il set "03" (sopra) e il set "24" (qui sopra): 0-1000m set 03, 1000-2000m
// set 24, 2000-3000m di nuovo 03, e così via (vedi update()).
const GROUND_THEME_SWITCH_DISTANCE = 1000;
// La height map non è usata: richiederebbe parallax occlusion mapping
// (Babylon la legge dal canale alpha della normal map, che andrebbe
// ricomposta a runtime unendo le due immagini) per un costo GPU per-pixel
// non giustificato su hosting statico/mobile-first (vedi CLAUDE.md).

// ===== Costanti di gioco (da config statica) =====
const G = CONFIG.gameplay;
const MAX_LIVES = CONFIG.game.lives; // vite iniziali: un ostacolo colpito ne toglie una
const HIT_INVULN_TIME = 3; // secondi di invulnerabilità dopo un colpo, evita di perdere più vite sullo stesso ostacolo
const HIT_INVULN_ALPHA = 0.1; // trasparenza del player nella fase "trasparente" del lampeggio
const HIT_BLINK_INTERVAL = 0.15; // secondi tra un cambio di trasparenza e l'altro durante l'invulnerabilità
const LANES = G.lanes; // posizioni x delle 3 corsie
const LANE_LERP = G.laneChangeSpeed; // velocità di cambio corsia
const GRAVITY = G.gravity;
const JUMP_SPEED = G.jumpSpeed;
const MAX_JUMPS = G.maxJumps; // salti consentiti prima di ritoccare terra (2 = doppio salto)
const FAST_FALL_SPEED = G.fastFallSpeed; // velocità (positiva, applicata verso il basso) del comando "giù" in salto
const START_SPEED = G.startSpeed; // unità/s in avanti (mondo che scorre)
const MAX_SPEED = G.maxSpeed;
const ACCEL = G.acceleration; // incremento velocità nel tempo
const SPAWN_AHEAD = G.spawnAhead; // distanza a cui vengono generati gli oggetti
const DESPAWN_BEHIND = - 10; // dietro la camera -> riciclo/rimozione (interno)
const ROW_GAP = G.rowGap; // distanza tra le "righe" di ostacoli/monete
const FADE_DISTANCE = 16; // unità percorse per dissolvere in ostacoli/monete allo spawn
const DEBUG = CONFIG.debug; // se true, mostra la hitbox (bounding box) di ogni oggetto
const WALL_HEIGHT = 10;
// ---- Power-up temporanei (vedi CONFIG.powerups) ----
// magnete: raccoglie subito tutte le monete attive in pista.
// martello: distrugge subito tutti gli ostacoli attivi in pista.
// stella: invincibilità per POWERUP_STAR_DURATION secondi (ignora le collisioni).
const POWERUP_SPAWN_CHANCE = CONFIG.powerups.spawnChance;
const POWERUP_STAR_DURATION = CONFIG.powerups.starDuration;
const POWERUP_KINDS = ["magnet", "hammer", "star"];
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
const LAMP_INTENSITY = 10;
// Distanza (in unità di mondo, oltre DESPAWN_BEHIND) su cui l'intensità
// sfuma a 0 prima del riciclo: senza questa dissolvenza il lampadario
// veniva teletrasportato in avanti mentre la sua luce contribuiva ancora
// in modo visibile, dando l'effetto di "spegnimento di colpo".
const LAMP_FADE_DISTANCE = LAMP_GAP*0.25;
// Le point light dei lampadari, a differenza degli altri oggetti (ostacoli,
// monete, billboard: tutti riciclati a DESPAWN_BEHIND), vengono riciclate
// molto più indietro: DESPAWN_BEHIND è troppo vicino alla camera, quindi la
// luce si spegneva/teletrasportava mentre illuminava ancora in modo visibile
// oggetti non ancora scomparsi. Margine extra oltre LAMP_GAP per stare ben
// oltre la portata utile della luce.
const DESPAWN_POINT_LIGHT = -(LAMP_GAP + 5);
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
const FOG_WALL_Y = WALL_HEIGHT * 0.55;
const FOG_WALL_WIDTH = 10;
const FOG_WALL_HEIGHT = 10;
// Altezza massima che il velo può avere restando centrato su FOG_WALL_Y
// senza sporgere oltre il soffitto o sotto il pavimento della stanza.
const FOG_MAX_HEIGHT = 2 * Math.min(FOG_WALL_Y, WALL_HEIGHT - FOG_WALL_Y);
const FOG_CROSS_DURATION_MIN = 9; // secondi per attraversare tutto lo schermo
const FOG_CROSS_DURATION_MAX = 15;
const FOG_EDGE_FADE = 0.15; // frazione iniziale/finale del tragitto dedicata alla dissolvenza
const FOG_COOLDOWN_MIN = 1.5; // pausa tra un velo e il successivo
const FOG_COOLDOWN_MAX = 4;
const FOG_LINEAR_RANGE = 40;
// Dentro la zona di fog localizzata (SPAWN_AHEAD → +FOG_LINEAR_RANGE, vedi
// createGameScene), non prima: il velo deve attraversare mentre la nebbia
// è già presente, non nella zona nitida davanti al giocatore. La distanza
// viene scelta a caso (non più fissa) ad ogni nuovo passaggio, tra questi
// due estremi, così il velo non compare sempre alla stessa identica
// profondità (vedi spawnFogWisp()).
// const FOG_WALL_Z_MIN = SPAWN_AHEAD + 5;
// const FOG_WALL_Z_MAX = SPAWN_AHEAD + FOG_LINEAR_RANGE - 5;
const FOG_WALL_Z_MIN = 20;
const FOG_WALL_Z_MAX = SPAWN_AHEAD - 15;
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
const FRAME_MARGIN = 0.3; // sporgenza del bordo rispetto all'immagine
const FRAME_THICKNESS = 0.08;
const FRAME_OFFSET = FRAME_THICKNESS / 2 + 0.02; // dietro l'immagine, verso il muro

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
  direct.intensity = 1; // alzata: 0.5 rendeva il player poco reattivo alla luce
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
  function makeTiledPbrMaterial(name, repeatU, repeatV, files) {
    const {
      basecolor = TILE_BASECOLOR,
      normal: normalFile = TILE_NORMAL,
      ao: aoFile = TILE_AO,
      roughness: roughnessFile = TILE_ROUGHNESS,
    } = files || {};
    const mat = new PBRMaterial(name, scene);
    const albedo = loadTexture(scene, basecolor);
    const normal = loadTexture(scene, normalFile);
    const ao = loadTexture(scene, aoFile);
    const roughness = loadTexture(scene, roughnessFile);
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
  const repeat_factor = 6;
  const groundMatA = makeTiledPbrMaterial("groundMatA", TILE_LEN / repeat_factor, WALL_HEIGHT / repeat_factor);

  const wallMat = makeTiledPbrMaterial("wallMat", TILE_LEN / repeat_factor, WALL_HEIGHT / repeat_factor);
  wallMat.backFaceCulling = false;

  // Pool di materiali per il set di texture alternativo "24" (vedi update():
  // pavimento/muri/soffitto passano a questo set ogni
  // GROUND_THEME_SWITCH_DISTANCE metri, ma solo pezzo per pezzo man mano che
  // vengono riciclati — non tutti insieme, vedi commento nel loop di
  // scorrimento). Più istanze per superficie, ciascuna con la propria
  // rotazione UV casuale (wAng): altrimenti, essendo tutti i pezzi la stessa
  // immagine con lo stesso orientamento, il risultato è visivamente troppo
  // regolare. Ad ogni riciclo se ne pesca una a caso dal pool.
  function makeThemeBMatPool(namePrefix, count, repeatU, repeatV) {
    return Array.from({ length: count }, (_, i) => {
      const mat = makeTiledPbrMaterial(`${namePrefix}${i}`, repeatU, repeatV, {
        basecolor: TILE_BASECOLOR_1,
        normal: TILE_NORMAL_1,
        ao: TILE_AO_1,
        roughness: TILE_ROUGHNESS_1,
      });
      if (namePrefix !== "groundMatB") mat.backFaceCulling = false; // muri e soffitto vanno visti da entrambi i lati, come wallMat
      const wAng = Math.random() * Math.PI * 2;
      mat.albedoTexture.wAng = wAng;
      mat.bumpTexture.wAng = wAng;
      mat.ambientTexture.wAng = wAng;
      mat.metallicTexture.wAng = wAng;
      return mat;
    });
  }
  const groundMatsB = makeThemeBMatPool("groundMatB", NUM_TILES, TILE_LEN / repeat_factor, WALL_HEIGHT / repeat_factor);
  const wallMatsB = makeThemeBMatPool("wallMatB", NUM_TILES, TILE_LEN / repeat_factor, WALL_HEIGHT / repeat_factor);
  const ceilingMatsB = makeThemeBMatPool("ceilingMatB", NUM_TILES, TILE_LEN / repeat_factor, WALL_HEIGHT / repeat_factor);

  function pickRandom(pool) {
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Ostacoli e monete: LAMP_INTENSITY resta a 10 (voluto), quindi con il
  // colore diffuse "pieno" di prima (0.85-0.98) anche solo diffuse*intensità
  // andava in clipping a bianco non appena un lampadario era vicino.
  // disableLighting eliminava la reazione del tutto; qui invece si tiene
  // acceso l'illuminamento ma con un diffuseColor tenuto basso, così il
  // contributo delle luci resta un incremento moderato invece di saturare —
  // l'emissiveColor dà il colore "di base" sempre visibile, il diffuse
  // (ridotto) aggiunge la reazione più tenue alla luce vicina. Il muro non è
  // toccato: resta illuminato normalmente come richiesto.
  const obstacleMat = new StandardMaterial("obstacleMat", scene);
  obstacleMat.emissiveColor = new Color3(0.5, 0.12, 0.15);
  obstacleMat.diffuseColor = new Color3(0.2/3, 0.05/3, 0.06/3);
  obstacleMat.specularColor = new Color3(0, 0, 0);
  obstacleMat.maxSimultaneousLights = MAX_LIGHTS;

  const coinMat = new StandardMaterial("coinMat", scene);
  coinMat.emissiveColor = new Color3(0.55, 0.42, 0.06);
  coinMat.diffuseColor = new Color3(0.2/3, 0.15/3, 0.03/3);
  coinMat.specularColor = new Color3(0, 0, 0);
  coinMat.maxSimultaneousLights = MAX_LIGHTS;

  // Moneta bonus rara (vedi G.redCoinChance/redCoinValueMultiplier): stesso
  // mesh della moneta normale, solo materiale diverso e valore moltiplicato.
  const coinRedMat = new StandardMaterial("coinRedMat", scene);
  coinRedMat.emissiveColor = new Color3(0.5, 0.05, 0.06);
  coinRedMat.diffuseColor = new Color3(0.18, 0.02, 0.025);
  coinRedMat.specularColor = new Color3(0, 0, 0);
  coinRedMat.maxSimultaneousLights = MAX_LIGHTS;

  // Power-up (magnete/martello/stella): stesso schema di monete/ostacoli
  // (emissivo dominante, diffuse tenuto basso) per non reagire troppo alle
  // luci pur restando illuminati.
  const magnetMat = new StandardMaterial("magnetMat", scene);
  magnetMat.emissiveColor = new Color3(0.15, 0.35, 0.6);
  magnetMat.diffuseColor = new Color3(0.06, 0.13, 0.22);
  magnetMat.specularColor = new Color3(0, 0, 0);
  magnetMat.maxSimultaneousLights = MAX_LIGHTS;

  const hammerMat = new StandardMaterial("hammerMat", scene);
  hammerMat.emissiveColor = new Color3(0.42, 0.28, 0.12);
  hammerMat.diffuseColor = new Color3(0.15, 0.1, 0.04);
  hammerMat.specularColor = new Color3(0, 0, 0);
  hammerMat.maxSimultaneousLights = MAX_LIGHTS;

  const starMat = new StandardMaterial("starMat", scene);
  starMat.emissiveColor = new Color3(0.65, 0.55, 0.08);
  starMat.diffuseColor = new Color3(0.2, 0.17, 0.02);
  starMat.specularColor = new Color3(0, 0, 0);
  starMat.maxSimultaneousLights = MAX_LIGHTS;

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

  // Nessun asset audio dedicato ai power-up: riusa lo stesso sfx della
  // moneta rossa (già percepito come "bonus raro") per il pickup di
  // magnete/martello/stella.
  let powerupSfx = null;
  loadSound("coin_red.mp3", { volume: 0.9 }).then((s) => {
    powerupSfx = s;
  });

  let hurtsfx = null;
  loadSound("hurt.mp3", { volume: 0.8 }).then((s) => {
    hurtsfx = s;
  });

  let soundtrack = null;
  loadSound("soundtrack_game.mp3", { volume: 0.6 , loop: true}).then((s) => {
    soundtrack = s;
  });

  let soundghostmax = null;
  loadSound("crying_ghot_max.mp3", { volume: 0.7 , loop: false}).then((s) => {
    soundghostmax = s;
  });

  // Un suono di salto scelto a caso tra JUMP_SOUNDS ad ogni salto (vedi
  // jump() più sotto), invece di ripetere sempre lo stesso file.
  const jumpSfx = [];
  JUMP_SOUNDS.forEach((file) => {
    loadSound(file, { volume: 0.8 }).then((s) => {
      jumpSfx.push(s);
    });
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

  // Trasparenza del player durante l'invulnerabilità (vedi update()): serve
  // più di `mesh.visibility` da solo, perché fixImportedMaterials forza
  // `transparencyMode = OPAQUE` per correggere l'export glb — e con
  // transparencyMode impostato esplicitamente Babylon ignora del tutto
  // `visibility`/`alpha` nel decidere se applicare l'alpha blending
  // (Material.needAlphaBlendingForMesh ritorna in base al solo
  // transparencyMode quando è stato impostato). Va quindi commutato ad
  // ALPHABLEND mentre si vuole l'effetto, e riportato a OPAQUE altrimenti.
  function setPlayerAlpha(alpha) {
    const blend = alpha < 1;
    for (const m of playerMeshes) {
      const mat = m.material;
      if (!mat) continue;
      if (mat.transparencyMode !== undefined) {
        mat.transparencyMode = blend ? PBRMaterial.PBRMATERIAL_ALPHABLEND : PBRMaterial.PBRMATERIAL_OPAQUE;
      }
      if (mat.alpha !== undefined) mat.alpha = alpha;
    }
  }

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
    t.material = groundMatA;
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
  // fuori vista (o sempre dentro, "murando" il fondo). Dipende dalla
  // distanza (più lontano = schermo "più largo" in unità di mondo), quindi
  // va ricalcolata ad ogni spawn in base allo z scelto a caso in quel momento.
  const fogAspect = engine.getRenderWidth() / engine.getRenderHeight();
  const fogTanHalfV = Math.tan(cam.fov / 2);
  const fogTanHalfH = fogTanHalfV * fogAspect;
  function fogTravelHalfAt(z) {
    return (z + cam.distance) * fogTanHalfH * 0.92;
  }

  // Le immagini di nebbia hanno proporzioni diverse tra loro (alcune molto
  // larghe, altre molto strette) e non quadrate come il piano di riferimento
  // FOG_WALL_WIDTH×FOG_WALL_HEIGHT: senza correzione risultano stirate/
  // deformate. Le dimensioni reali si leggono una sola volta qui (non
  // deducibili dal nome file), prima di costruire i materiali, per calcolare
  // un fit "a contenimento" (come CSS background-size: contain): il piano
  // viene ridimensionato per immagine mantenendo l'aspect ratio, così
  // l'immagine è sempre visibile per intero, mai ritagliata. L'altezza è
  // inoltre limitata a FOG_MAX_HEIGHT per non sporgere oltre soffitto/
  // pavimento della stanza (altrimenti il velo veniva tagliato da essi).
  const fogImageSizes = new Map();
  await Promise.all(
    FOG_TEXTURES.map(async (file) => {
      try {
        const el = await loadHtmlImage(file);
        fogImageSizes.set(file, { width: el.naturalWidth, height: el.naturalHeight });
      } catch {
        fogImageSizes.set(file, { width: 1, height: 1 }); // fallback: quadrato, nessuna distorsione
      }
    })
  );

  function containFitSize(imgAspect) {
    let width = FOG_WALL_WIDTH;
    let height = width / imgAspect;
    if (height > FOG_MAX_HEIGHT) {
      height = FOG_MAX_HEIGHT;
      width = height * imgAspect;
    }
    return { width, height };
  }

  const fogMats = FOG_TEXTURES.map((file, idx) => {
    const mat = new StandardMaterial("fogMat" + idx, scene);
    const tex = loadTexture(scene, file);
    tex.hasAlpha = true;
    // CLAMP invece del wrap a ripetizione di default: con la deriva UV
    // animata in update() (oscilla oltre 0/1), il wrap farebbe ricomparire
    // l'immagine ripetuta ai bordi invece di fermarsi sull'ultimo pixel.
    tex.wrapU = Texture.CLAMP_ADDRESSMODE;
    tex.wrapV = Texture.CLAMP_ADDRESSMODE;
    const size = fogImageSizes.get(file);
    const planeSize = containFitSize(size.width / size.height);
    mat.diffuseTexture = tex;
    mat.useAlphaFromDiffuseTexture = true;
    mat.emissiveColor = new Color3(0.5, 0.5, 0.52); // grigio neutro: leggibile contro lo sfondo nero
    mat.specularColor = new Color3(0, 0, 0);
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    return {
      material: mat,
      texture: tex,
      uSpeed: 0.02 + idx * 0.01,
      vSpeed: 0.015 + idx * 0.008,
      file: file,
      planeWidth: planeSize.width,
      planeHeight: planeSize.height,
      // Nessun ritaglio: il piano combacia con l'aspect ratio dell'immagine,
      // quindi la texture copre l'intero UV senza offset/scale.
      baseUOffset: 0,
      baseVOffset: 0,
      uScale: 1,
      vScale: 1,
    };
  });

  const fogWisp = MeshBuilder.CreatePlane(
    "fogWisp",
    { width: FOG_WALL_WIDTH, height: FOG_WALL_HEIGHT },
    scene
  );
  fogWisp.position.set(0, FOG_WALL_Y, FOG_WALL_Z_MIN);
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

    if (fogState.mat.file == "ghost_max.png") {
      // L'Audio Engine v2 di Babylon non accetta i secondi come argomento
      // diretto di play(): il ritardo va passato nell'oggetto opzioni
      // (waitTime), programmato sul clock dell'AudioContext — a differenza
      // di setTimeout non rischia di restare "agganciato" a un Sound già
      // rilasciato se la scena cambia nel frattempo.
      soundghostmax?.play({ waitTime: 2 });
    }

    fogWisp.material = fogState.mat.material;
    // Piano ridimensionato per combaciare con l'aspect ratio (e il limite di
    // altezza) calcolati per questa immagine — vedi containFitSize più sopra.
    // Specchiato sull'asse Y (flip orizzontale) con probabilità 50%, per
    // variare l'aspetto del velo senza bisogno di texture aggiuntive
    // (backFaceCulling è già disattivato sul materiale, quindi resta visibile).
    const mirrorSign = Math.random() < 0.5 ? -1 : 1;
    fogWisp.scaling.x = mirrorSign * (fogState.mat.planeWidth / FOG_WALL_WIDTH);
    fogWisp.scaling.y = fogState.mat.planeHeight / FOG_WALL_HEIGHT;
    // Distanza casuale (non più fissa) tra FOG_WALL_Z_MIN e FOG_WALL_Z_MAX:
    // il tragitto orizzontale va ricalcolato di conseguenza, dato che dipende
    // dalla distanza dalla camera.
    const z = FOG_WALL_Z_MIN + Math.random() * (FOG_WALL_Z_MAX - FOG_WALL_Z_MIN);
    fogWisp.position.z = z;
    const travelHalf = fogTravelHalfAt(z);
    fogState.fromX = -dir * travelHalf;
    fogState.toX = dir * travelHalf;
    fogState.progress = 0;
    fogState.duration = FOG_CROSS_DURATION_MIN + Math.random() * (FOG_CROSS_DURATION_MAX - FOG_CROSS_DURATION_MIN);
    fogState.active = true;
    fogWisp.position.x = fogState.fromX;
    fogWisp.setEnabled(true);
  }

  
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
      const tex = loadTexture(scene, imgName);
      // Emissiva costante e non illuminata (disableLighting): la foto resta
      // sempre ugualmente leggibile, indipendente da spawn/despawn delle luci.
      mat.diffuseTexture = tex;
      mat.emissiveTexture = tex;
      mat.emissiveColor = new Color3(1, 1, 1);
      mat.disableLighting = true;
      mat.specularColor = new Color3(0, 0, 0);
      mat.backFaceCulling = false; // visibile da entrambi i lati del piano
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

  // ---- Tipologie di ostacoli ----
  // Ognuna definisce come costruire la mesh (i blocchi multi-corsia sono un
  // nodo radice "vuoto" con più cubi figli — non Mesh.MergeMeshes, che
  // ricentra i vertici sul primo elemento dell'array anziché conservarne le
  // posizioni assolute, spostando/affondando la geometria in modo
  // imprevedibile), quante corsie contigue occupa (laneSpan) e l'altezza
  // oltre la quale il salto lo supera. L'ingombro usato in collisione
  // (collisionHalfWidth) è calcolato da laneSpan, non specificato a mano:
  // così collisione e geometria visibile non possono mai disallinearsi.
  const OBSTACLE_CUBE_SIZE = 1.4;
  const OBSTACLE_BASE_Y = OBSTACLE_CUBE_SIZE / 2; // centro del cubo poggiato a terra
  const LANE_GAP = LANES[1] - LANES[0]; // distanza tra corsie adiacenti (uniforme)

  function makeCubeObstacleMesh(name) {
    const o = MeshBuilder.CreateBox(name, { size: OBSTACLE_CUBE_SIZE }, scene);
    o.material = obstacleMat;
    o.position.y = OBSTACLE_BASE_Y;
    return o;
  }

  // Nodo radice senza geometria propria: sposteremo solo lui (x/z) per far
  // scorrere/riposizionare l'ostacolo, i cubi figli restano fissi nelle loro
  // posizioni locali (root.position.y resta sempre 0).
  function makeCubeGroup(name, boxes) {
    const root = new Mesh(name, scene);
    boxes.forEach(({ width, height, depth, x, y, z }, i) => {
      const b = MeshBuilder.CreateBox(name + "_p" + i, { width, height, depth }, scene);
      b.material = obstacleMat;
      b.parent = root;
      b.position.set(x, y, z);
    });
    return root;
  }

  // Colonna verticale: 3 cubi impilati, troppo alta per saltarci sopra —
  // come un cubo singolo costringe a cambiare corsia, ma rompe la
  // monotonia visiva di vederne sempre e solo uno identico.
  function makeColumnVMesh(name) {
    return makeCubeGroup(
      name,
      [0, 1, 2].map((i) => ({
        width: OBSTACLE_CUBE_SIZE,
        height: OBSTACLE_CUBE_SIZE,
        depth: OBSTACLE_CUBE_SIZE,
        x: 0,
        y: OBSTACLE_BASE_Y + i * OBSTACLE_CUBE_SIZE,
        z: 0,
      }))
    );
  }

  // Blocco orizzontale di `laneSpan` corsie contigue, stessa altezza di un
  // cubo singolo (quindi saltabile): ogni segmento è largo esattamente
  // quanto una corsia (LANE_GAP, non OBSTACLE_CUBE_SIZE) così i segmenti si
  // toccano ai margini di corsia senza buchi e senza sporgere solo a metà
  // sulle corsie esterne — prima, con segmenti più stretti dei cubi
  // standard, il blocco non copriva davvero fino in fondo le corsie di
  // destra/sinistra.
  function makeHorizontalSpanMesh(name, laneSpan) {
    return makeCubeGroup(
      name,
      Array.from({ length: laneSpan }, (_, i) => ({
        width: LANE_GAP,
        height: OBSTACLE_CUBE_SIZE,
        depth: OBSTACLE_CUBE_SIZE,
        x: (i - (laneSpan - 1) / 2) * LANE_GAP,
        y: OBSTACLE_BASE_Y,
        z: 0,
      }))
    );
  }

  // "weight" pesa la probabilità di scelta in pickObstacleType(): il cubo
  // semplice resta il più comune, le varianti più larghe/alte sono rare, per
  // dare varietà senza rendere il percorso irriconoscibile o troppo punitivo.
  const OBSTACLE_TYPES = [
    { id: "cube", weight: 5, poolSize: 8, build: makeCubeObstacleMesh, laneSpan: 1, jumpClearY: 1.6 },
    { id: "columnV", weight: 1, poolSize: 3, build: makeColumnVMesh, laneSpan: 1, jumpClearY: WALL_HEIGHT },
    { id: "wall2", weight: 2, poolSize: 3, build: (name) => makeHorizontalSpanMesh(name, 2), laneSpan: 2, jumpClearY: 1.6 },
    { id: "wall3", weight: 1, poolSize: 3, build: (name) => makeHorizontalSpanMesh(name, 3), laneSpan: 3, jumpClearY: 1.6 },
  ].map((t) => ({ ...t, collisionHalfWidth: (t.laneSpan * LANE_GAP) / 2 }));

  function pickObstacleType() {
    const totalWeight = OBSTACLE_TYPES.reduce((sum, t) => sum + t.weight, 0);
    let r = Math.random() * totalWeight;
    for (const t of OBSTACLE_TYPES) {
      if (r < t.weight) return t;
      r -= t.weight;
    }
    return OBSTACLE_TYPES[0];
  }

  // ---- Pool ostacoli (uno per tipo, geometrie diverse non riassegnabili
  // come invece si fa col materiale delle monete) e monete ----
  const obstaclesByType = {};
  for (const t of OBSTACLE_TYPES) {
    obstaclesByType[t.id] = Array.from({ length: t.poolSize }, (_, i) => {
      const mesh = t.build(`obs_${t.id}${i}`);
      mesh.setEnabled(false);
      if (DEBUG) mesh.showBoundingBox = true;
      return { mesh, active: false, lane: 0, obstacleType: t };
    });
  }
  const obstacles = Object.values(obstaclesByType).flat(); // scorrimento/riciclo unico in update()

  function makeCoin(i) {
    const c = MeshBuilder.CreateCylinder("coin" + i, { diameter: 0.8, height: 0.12, tessellation: 16 }, scene);
    c.material = coinMat;
    c.rotation.z = Math.PI / 2;
    c.setEnabled(false);
    if (DEBUG) c.showBoundingBox = true;
    // Rotazione applicata nel loop delle monete attive in update() (una sola
    // callback per frame invece di una scene.onBeforeRenderObservable per
    // moneta): stesso incremento per frame di prima, ma senza il costo di 24
    // sottoscrizioni separate che scattavano anche sulle monete disattivate.
    return { mesh: c, active: false, lane: 0, type: "coin", value: 1 };
  }

  const coins = Array.from({ length: 24 }, (_, i) => makeCoin(i));

  // ---- Power-up (magnete/martello/stella) ----
  // Forme procedurali distintive (nessun asset dedicato disponibile): un
  // toroide per il magnete, un martello a due pezzi (manico+testa), un
  // dipiramide pentagonale sfaccettata per la stella. Pool piccoli (2 per
  // tipo): non ne serve mai più di uno in pista, i doppioni servono solo a
  // non dover aspettare il despawn del precedente per generarne un altro.
  function makePowerupCommon(mesh, kind) {
    mesh.setEnabled(false);
    if (DEBUG) mesh.showBoundingBox = true;
    return { mesh, active: false, lane: 0, kind };
  }
  function makeMagnet(i) {
    const m = MeshBuilder.CreateTorus(
      "magnet" + i,
      { diameter: 0.9, thickness: 0.28, tessellation: 20 },
      scene
    );
    m.material = magnetMat;
    return makePowerupCommon(m, "magnet");
  }
  function makeHammer(i) {
    const root = new Mesh("hammer" + i, scene);
    const handle = MeshBuilder.CreateCylinder(
      "hammer" + i + "_handle",
      { diameter: 0.14, height: 0.9, tessellation: 8 },
      scene
    );
    handle.material = hammerMat;
    handle.parent = root;
    handle.position.set(0, -0.15, 0);
    const head = MeshBuilder.CreateBox(
      "hammer" + i + "_head",
      { width: 0.6, height: 0.32, depth: 0.32 },
      scene
    );
    head.material = hammerMat;
    head.parent = root;
    head.position.set(0, 0.4, 0);
    return makePowerupCommon(root, "hammer");
  }
  function makeStar(i) {
    // type 11 = dipiramide pentagonale (J13): a punta su entrambi i lati,
    // la forma sfaccettata più vicina a una "gemma a stella" tra i
    // poliedri disponibili in Babylon senza costruire geometria custom.
    const m = MeshBuilder.CreatePolyhedron("star" + i, { type: 11, size: 0.5 }, scene);
    m.material = starMat;
    return makePowerupCommon(m, "star");
  }

  const powerupsByKind = {
    magnet: Array.from({ length: 2 }, (_, i) => makeMagnet(i)),
    hammer: Array.from({ length: 2 }, (_, i) => makeHammer(i)),
    star: Array.from({ length: 2 }, (_, i) => makeStar(i)),
  };
  const powerups = Object.values(powerupsByKind).flat(); // scorrimento/riciclo unico in update()

  function spawnFrom(pool) {
    return pool.find((e) => !e.active) || null;
  }

  // ===== Stato di gioco =====
  const state = {
    running: true,
    speed: START_SPEED,
    distance: 0,
    coins: 0,
    lives: MAX_LIVES,
    invulnerableTimer: 0, // >0 dopo un colpo: ignora altre collisioni per HIT_INVULN_TIME secondi
    starTimer: 0, // >0 dopo la stella: ignora le collisioni con gli ostacoli per POWERUP_STAR_DURATION secondi
    laneIndex: 1,
    targetX: LANES[1],
    velY: 0,
    grounded: true,
    jumpsUsed: 0, // salti già effettuati da quando si è lasciato il suolo (vedi jump()/MAX_JUMPS)
    nextSpawnZ: SPAWN_AHEAD,
    fogTime: 0, // orologio indipendente dalla velocità, per il moto dei banchi di nebbia
    quietRowsRemaining: 0, // >0: righe senza spawn ancora da consumare, vedi spawnRow()
    consecutiveWideBlocks: 0, // blocchi orizzontali (2-3 corsie) piazzati di fila senza interruzioni, vedi spawnRow()
  };
  // Ultimi valori effettivamente scritti nella HUD: distance/coins cambiano
  // in continuazione ma il valore mostrato (arrotondato) resta identico per
  // molti frame consecutivi. Scrivere nel DOM (textContent, ricostruzione
  // della stringa cuori) solo quando cambia davvero evita un costo per-frame
  // sprecato che contribuiva ai cali di frame.
  const lastHud = { coins: null, distance: null, lives: null, starTime: null };

  function spawnRow() {
    // Pause brevi e periodiche senza alcuno spawn: danno respiro al ritmo di
    // gioco invece di un flusso costante e ripetitivo di ostacoli/monete.
    if (state.quietRowsRemaining > 0) {
      state.quietRowsRemaining -= 1;
      state.consecutiveWideBlocks = 0;
      state.nextSpawnZ += ROW_GAP;
      return;
    }
    if (Math.random() < G.quietStretchChance) {
      state.quietRowsRemaining =
        G.quietStretchMinRows + Math.floor(Math.random() * (G.quietStretchMaxRows - G.quietStretchMinRows + 1));
      state.consecutiveWideBlocks = 0;
      state.nextSpawnZ += ROW_GAP;
      return;
    }

    // Tipo e corsia di partenza scelti comunque (servono a tenere le monete
    // fuori dalle corsie coperte anche nelle righe senza ostacolo attivo):
    // l'ostacolo stesso non è più garantito ad ogni riga, per rompere la
    // regolarità "uno ogni ROW_GAP". La corsia di partenza è vincolata a far
    // stare tutte le laneSpan corsie del blocco dentro 0..2 (es. laneSpan=2
    // può iniziare solo su corsia 0 o 1, laneSpan=3 solo su 0).
    const obsType = pickObstacleType();
    const maxStartLane = 3 - obsType.laneSpan;
    const startLane = Math.floor(Math.random() * (maxStartLane + 1));
    const coveredLanes = Array.from({ length: obsType.laneSpan }, (_, k) => startLane + k);
    const obsCenterX = (LANES[startLane] + LANES[startLane + obsType.laneSpan - 1]) / 2;

    if (Math.random() < G.obstacleSpawnChance) {
      const isWideBlock = obsType.laneSpan >= 2;
      if (isWideBlock) {
        if (state.consecutiveWideBlocks >= 2) {
          // Sarebbe il terzo blocco orizzontale consecutivo: nemmeno il
          // doppio salto basta a superarli così ravvicinati uno via l'altro.
          // Spazio extra prima di piazzarlo, poi si riconta da qui.
          state.nextSpawnZ += G.extraWideBlockGap;
          state.consecutiveWideBlocks = 0;
        }
        state.consecutiveWideBlocks += 1;
      } else {
        state.consecutiveWideBlocks = 0;
      }

      const ob = spawnFrom(obstaclesByType[obsType.id]);
      if (ob) {
        ob.active = true;
        ob.lane = startLane;
        ob.mesh.setEnabled(true);
        ob.mesh.visibility = 0; // dissolve in gradualmente, vedi update()
        ob.mesh.position.x = obsCenterX;
        ob.mesh.position.z = state.nextSpawnZ;
      }
    } else {
      state.consecutiveWideBlocks = 0; // riga senza ostacolo: la sequenza si interrompe
    }

    // Corsie libere (non coperte dall'ostacolo di questa riga): monete e
    // moneta bonus vanno sempre su una di queste, mai su una corsia bloccata.
    const freeLanes = [0, 1, 2].filter((l) => !coveredLanes.includes(l));
    function pickFreeLane() {
      return freeLanes.length
        ? freeLanes[Math.floor(Math.random() * freeLanes.length)]
        : Math.floor(Math.random() * 3); // blocco a 3 corsie: nessuna libera, va comunque saltato
    }

    // Fila di monete su una corsia libera (a volte), lunghezza variabile
    // (1..coinRowLength) invece di sempre la stessa, per varietà.
    let coinLane = null;
    let coinRowCount = 0;
    if (Math.random() < G.coinSpawnChance) {
      coinLane = pickFreeLane();
      coinRowCount = 1 + Math.floor(Math.random() * G.coinRowLength);
      for (let k = 0; k < coinRowCount; k++) {
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
    // Evita la corsia della fila gialla quando possibile, e in ogni caso
    // sposta la z se finisce comunque sulla stessa corsia: altrimenti la
    // moneta rossa nasce esattamente sopra la prima moneta gialla (k=0
    // condivide la stessa z di partenza state.nextSpawnZ).
    let redLane = null;
    if (Math.random() < G.redCoinChance) {
      const redFreeLanes = coinLane === null ? freeLanes : freeLanes.filter((l) => l !== coinLane);
      redLane = redFreeLanes.length
        ? redFreeLanes[Math.floor(Math.random() * redFreeLanes.length)]
        : pickFreeLane();
      const redZ = redLane === coinLane ? state.nextSpawnZ + coinRowCount * 1.6 : state.nextSpawnZ;
      const red = spawnFrom(coins);
      if (red) {
        red.active = true;
        red.lane = redLane;
        red.value = G.redCoinValueMultiplier;
        red.mesh.material = coinRedMat;
        red.mesh.setEnabled(true);
        red.mesh.visibility = 0; // dissolve in gradualmente, vedi update()
        red.mesh.position.set(LANES[redLane], 1.0, redZ);
      }
    }

    // Power-up raro (magnete/martello/stella): indipendente da monete/
    // ostacoli, una sola tipologia a riga (vedi CONFIG.powerups.spawnChance).
    // Stessa logica anti-sovrapposizione della moneta rossa: evita le
    // corsie già occupate da moneta gialla/rossa quando possibile, e
    // sposta la z se è comunque costretto a condividerne una.
    if (Math.random() < POWERUP_SPAWN_CHANCE) {
      const usedLanes = [coinLane, redLane].filter((l) => l !== null);
      const puFreeLanes = freeLanes.filter((l) => !usedLanes.includes(l));
      const puLane = puFreeLanes.length
        ? puFreeLanes[Math.floor(Math.random() * puFreeLanes.length)]
        : pickFreeLane();
      const puZ = usedLanes.includes(puLane)
        ? state.nextSpawnZ + Math.max(coinRowCount, 1) * 1.6
        : state.nextSpawnZ;
      const kind = POWERUP_KINDS[Math.floor(Math.random() * POWERUP_KINDS.length)];
      const pu = spawnFrom(powerupsByKind[kind]);
      if (pu) {
        pu.active = true;
        pu.lane = puLane;
        pu.mesh.setEnabled(true);
        pu.mesh.visibility = 0; // dissolve in gradualmente, vedi update()
        pu.mesh.position.set(LANES[puLane], 1.0, puZ);
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
  // Doppio salto: consentito anche a mezz'aria finché non si sono esauriti
  // MAX_JUMPS salti dall'ultimo contatto col suolo (azzerati all'atterraggio,
  // vedi update()). Ogni salto riparte da JUMP_SPEED, indipendentemente
  // dalla velocità verticale residua del salto precedente.
  function jump() {
    if (state.jumpsUsed < MAX_JUMPS) {
      state.velY = JUMP_SPEED;
      state.grounded = false;
      state.jumpsUsed += 1;
      if (jumpSfx.length) {
        jumpSfx[Math.floor(Math.random() * jumpSfx.length)]?.play();
      }
    }
  }
  // Discesa rapida: solo mentre si è in aria (in salto), forza una velocità
  // verticale negativa marcata così il player torna a terra molto più
  // velocemente di quanto farebbe la sola gravità. Da terra non ha effetto.
  function fastFall() {
    if (!state.grounded) {
      state.velY = -FAST_FALL_SPEED;
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
      case "ArrowDown":
      case "s":
      case "S":
        fastFall();
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
    } else {
      fastFall(); // swipe giù = discesa rapida (solo se già in salto)
    }
    touchStart = null;
  }
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);

  // Un ostacolo colpito toglie una vita invece di terminare subito la
  // partita: l'ostacolo viene disattivato (niente colpo doppio dallo stesso)
  // e per HIT_INVULN_TIME secondi le altre collisioni vengono ignorate,
  // altrimenti più frame consecutivi sulla stessa hitbox (o ostacoli molto
  // ravvicinati) farebbero perdere più vite per un singolo passaggio.
  function hitObstacle(ob) {
    ob.active = false;
    ob.mesh.setEnabled(false);
    state.invulnerableTimer = HIT_INVULN_TIME;
    hurtsfx?.play();
    state.lives -= 1;
    ui.flashHit();
    if (state.lives <= 0) {
      gameOver();
    }
  }

  // Effetto immediato al raccoglimento di un power-up (vedi loop dei
  // power-up in update()): magnete e martello agiscono una tantum su tutto
  // ciò che è attivo in pista in quel momento, la stella avvia/rinnova un
  // timer di invincibilità.
  function activatePowerup(kind) {
    powerupSfx?.play();
    if (kind === "magnet") {
      // Raccoglie tutte le monete (gialle e rosse) attualmente attive in
      // pista, come se il player le avesse toccate una per una.
      let collected = 0;
      for (const co of coins) {
        if (!co.active) continue;
        co.active = false;
        co.mesh.setEnabled(false);
        state.coins += co.value;
        collected += 1;
      }
      if (collected > 0) coinSfx?.play();
    } else if (kind === "hammer") {
      // Distrugge tutti gli ostacoli attualmente attivi in pista, senza
      // alcuna perdita di vite (non passa da hitObstacle()).
      for (const ob of obstacles) {
        if (!ob.active) continue;
        ob.active = false;
        ob.mesh.setEnabled(false);
      }
    } else if (kind === "star") {
      // Invincibilità per POWERUP_STAR_DURATION secondi: vedi il guard su
      // state.starTimer nel controllo di collisione ostacoli più sotto.
      // Non si somma a un timer già attivo (si rinnova alla durata piena),
      // così raccoglierne una seconda mentre la prima è ancora attiva non
      // dà un'invincibilità sproporzionatamente lunga.
      state.starTimer = POWERUP_STAR_DURATION;
    }
  }

  // ===== Fine partita =====
  function gameOver() {
    if (!state.running) return;
    state.running = false;
    let payout = computePayout(state.coins);
    const amount = payout[0];
    const diff_amount = CONFIG.economy.maxPayout - amount
    const gameover_message = payout[1] ? "Complimenti per la vincita, ma noi abbiamo solo questi ..." : `${amount}€...\ndavvero?\n ${diff_amount}€ te li offriamo noi.`
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
  ui.updateHud({ coins: 0, distance: 0, lives: state.lives, maxLives: MAX_LIVES, starTime: 0 });

  // ===== Loop =====
  function update(dt) {
    if (!state.running) return;

    // Velocità crescente nel tempo.
    state.speed = Math.min(MAX_SPEED, state.speed + ACCEL * dt);
    const move = state.speed * dt;
    state.distance += move;

    // Tema texture corrente per pavimento/muri/soffitto (vedi loop di
    // scorrimento più sotto): calcolato ogni frame da state.distance, ma
    // applicato SOLO ai pezzi che si riciclano in questo stesso frame — i
    // pezzi già visibili, renderizzati con il tema precedente, non vengono
    // ritinti retroattivamente. Il cambio si nota quindi gradualmente, pezzo
    // per pezzo, man mano che il corridoio scorre e ricicla.
    const groundTheme = Math.floor(state.distance / GROUND_THEME_SWITCH_DISTANCE) % 2;

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
        state.jumpsUsed = 0;
      }
    }

    // Scorrimento pista. Il materiale viene (ri)assegnato solo al riciclo,
    // in base al tema corrente in quel momento: così un pezzo mantiene la
    // texture con cui è stato visto finché non esce di scena e rientra.
    for (const t of tiles) {
      t.position.z -= move;
      if (t.position.z < -TILE_LEN) {
        t.position.z += TILE_LEN * NUM_TILES;
        t.material = groundTheme === 0 ? groundMatA : pickRandom(groundMatsB);
      }
    }
    for (const w of walls) {
      w.position.z -= move;
      if (w.position.z < -TILE_LEN) {
        w.position.z += TILE_LEN * NUM_TILES;
        w.material = groundTheme === 0 ? wallMat : pickRandom(wallMatsB);
      }
    }
    for (const c of ceilings) {
      c.position.z -= move;
      if (c.position.z < -TILE_LEN) {
        c.position.z += TILE_LEN * NUM_TILES;
        c.material = groundTheme === 0 ? wallMat : pickRandom(ceilingMatsB);
      }
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
      if (l.model.position.z < DESPAWN_POINT_LIGHT) {
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
      // non si vede più come uno spegnimento improvviso. Basata su
      // DESPAWN_POINT_LIGHT (non DESPAWN_BEHIND): la luce deve restare piena
      // ben oltre il punto in cui gli altri oggetti sono già stati riciclati.
      const distFromRecycle = l.model.position.z - DESPAWN_POINT_LIGHT;
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
        // per non mostrare la giuntura di una texture non seamless), attorno
        // all'offset base del ritaglio "a copertura" (non lo sovrascrive) e
        // scalata per uScale/vScale: così resta sempre dentro la finestra
        // dell'immagine effettivamente ritagliata, senza mai raggiungere il
        // bordo clampato (che si vedrebbe come un fermo immagine ai lati).
        const m = fogState.mat;
        m.texture.uOffset = m.baseUOffset + Math.sin(state.fogTime * m.uSpeed) * 0.1 * m.uScale;
        m.texture.vOffset = m.baseVOffset + Math.sin(state.fogTime * m.vSpeed) * 0.06 * m.vScale;
      }
    }

    // Invulnerabilità temporanea dopo un colpo (vedi hitObstacle()): il
    // player lampeggia tra opaco e semi-trasparente, feedback visivo che
    // rende evidente che i colpi in questa finestra non contano.
    if (state.invulnerableTimer > 0) {
      state.invulnerableTimer -= dt;
      if (state.invulnerableTimer > 0) {
        const blinkOn = Math.floor(state.invulnerableTimer / HIT_BLINK_INTERVAL) % 2 === 0;
        setPlayerAlpha(blinkOn ? 1 : HIT_INVULN_ALPHA);
      } else {
        setPlayerAlpha(1);
      }
    }

    // Invincibilità da power-up stella (vedi activatePowerup()): a
    // differenza dell'invulnerabilità da colpo, nessun lampeggio (non è un
    // segnale di "appena colpito"), solo il conto alla rovescia mostrato in
    // HUD più sotto.
    if (state.starTimer > 0) {
      state.starTimer = Math.max(0, state.starTimer - dt);
    }

    // Ostacoli e monete: scorrono verso il player.
    const px = player.position.x;
    const py = player.position.y;

    for (const ob of obstacles) {
      if (!ob.active) continue;
      ob.mesh.position.z -= move;
      // Dissolvenza in ingresso: appare gradualmente invece di comparire di scatto.
      ob.mesh.visibility = Math.min(1, Math.max(0, (SPAWN_AHEAD - ob.mesh.position.z) / FADE_DISTANCE));
      // Collisione: vicino in z, dentro la larghezza reale del blocco
      // (collisionHalfWidth, calcolata da laneSpan — combacia sempre con la
      // geometria visibile, vedi OBSTACLE_TYPES), player non abbastanza in
      // alto da superarla saltando (soglia specifica del tipo di ostacolo).
      const t = ob.obstacleType;
      if (
        state.invulnerableTimer <= 0 &&
        state.starTimer <= 0 &&
        Math.abs(ob.mesh.position.z) < 0.9 &&
        Math.abs(ob.mesh.position.x - px) < t.collisionHalfWidth &&
        py < t.jumpClearY
      ) {
        hitObstacle(ob);
        if (!state.running) return;
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
      co.mesh.rotation.y += 0.1; // rotazione secondaria, stesso incremento per frame di prima
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

    for (const pu of powerups) {
      if (!pu.active) continue;
      pu.mesh.position.z -= move;
      pu.mesh.rotation.y += dt * 2.5; // rotazione lenta, li rende riconoscibili senza confonderli con le monete
      // Dissolvenza in ingresso: appare gradualmente invece di comparire di scatto.
      pu.mesh.visibility = Math.min(1, Math.max(0, (SPAWN_AHEAD - pu.mesh.position.z) / FADE_DISTANCE));
      if (Math.abs(pu.mesh.position.z) < 0.9 && Math.abs(pu.mesh.position.x - px) < 0.9 && Math.abs(py - 1.0) < 1.1) {
        pu.active = false;
        pu.mesh.setEnabled(false);
        activatePowerup(pu.kind);
      }
      if (pu.mesh.position.z < DESPAWN_BEHIND) {
        pu.active = false;
        pu.mesh.setEnabled(false);
      }
    }

    // Genera nuove righe man mano che il "fronte" si avvicina.
    state.nextSpawnZ -= move;
    while (state.nextSpawnZ < SPAWN_AHEAD) spawnRow();

    const hudCoins = state.coins * CONFIG.economy.coinValue;
    const hudDistance = Math.floor(state.distance);
    const hudStarTime = Math.ceil(state.starTimer); // conto alla rovescia intero, es. 30,29,...,1,0
    if (
      hudCoins !== lastHud.coins ||
      hudDistance !== lastHud.distance ||
      state.lives !== lastHud.lives ||
      hudStarTime !== lastHud.starTime
    ) {
      lastHud.coins = hudCoins;
      lastHud.distance = hudDistance;
      lastHud.lives = state.lives;
      lastHud.starTime = hudStarTime;
      ui.updateHud({
        coins: hudCoins,
        distance: hudDistance,
        lives: state.lives,
        maxLives: MAX_LIVES,
        starTime: hudStarTime,
      });
    }
  }

  function dispose() {
    window.removeEventListener("keydown", onKey);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointerup", onPointerUp);
    disposeSound(coinSfx);
    disposeSound(coinredSfx);
    disposeSound(powerupSfx);
    disposeSound(soundtrack);
    jumpSfx.forEach(disposeSound);
    disposeModel({ meshes: playerMeshes, animationGroups: playerAnimationGroups });
    scene.dispose();
  }

  return { scene, update, dispose };
}
