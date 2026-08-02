import {
  Scene,
  FreeCamera,
  HemisphericLight,
  MeshBuilder,
  Mesh,
  StandardMaterial,
  Color3,
  Color4,
  Vector3,
} from "@babylonjs/core";
import * as ui from "../ui/ui.js";
import { getCameraProfile_menu } from "../utils/responsive.js";
import { unlockAudio } from "../utils/audioLoader.js";
import { loadTexture, loadHtmlImage } from "../utils/textureLoader.js";
import { CONFIG } from "../config/index.js";

// Piano del logo: parte da sopra la vista e scende fino al centro, dove si
// ferma (vedi update()). Per ora materiale a tinta unita: la texture reale
// del logo verrà applicata in seguito (basta assegnarla a logoMat.diffuseTexture).
const LOGO_TARGET_Y = 0.5; // stessa altezza a cui puntava la camera/la vecchia gem
const LOGO_DROP_SPEED = 4; // unità/s
const LOGO_SPIN_SPEED = 9; // rad/s, velocità delle due rotazioni (vedi update())
const TWO_PI = Math.PI * 2;

// Scena Menu: sfondo 3D leggero (il piano del logo che scende) + overlay HTML per i testi.
export function createMenuScene({ engine, goto }) {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.06, 0.09, 0.16, 1);

  const cam = getCameraProfile_menu();
  const camera = new FreeCamera("menuCam", new Vector3(0, cam.height, -cam.distance), scene);
  camera.setTarget(new Vector3(0, 1, 0));
  camera.fov = cam.fov;

  const light = new HemisphericLight("menuLight", new Vector3(0.4, 1, 0.2), scene);
  light.intensity = 0.9;

  // Altezza piena visuale = altezza visibile a schermo alla distanza del
  // piano (z=0, quindi a `cam.distance` dalla camera), dal FOV verticale
  // reale — non un valore fisso, altrimenti su device con FOV/distanza
  // diversi il piano non riempirebbe davvero tutta l'inquadratura.
  const logoFullViewHeight = 2 * cam.distance * Math.tan(cam.fov / 2);
  const logoWidth = CONFIG.menu.logoWidth;
  const logoHeight = logoFullViewHeight * CONFIG.menu.logoHeightScale;
  // Il piano va ancorato al bordo SUPERIORE dello schermo (non centrato sul
  // target della camera): sotto ci sono titolo/sottotitolo/bottone HTML
  // (vedi #menu in style.css, ancorato alla fascia inferiore), quindi
  // l'immagine deve occupare solo la fascia in alto, senza sovrapporsi.
  const screenTopY = LOGO_TARGET_Y + logoFullViewHeight / 2; // bordo superiore visibile a schermo
  const logoRestY = screenTopY - logoHeight / 2; // posizione finale, dopo la discesa
  const logoStartY = screenTopY + logoHeight; // sopra la vista, fuori schermo

  const image_logo = loadTexture(scene, "glanis_bday.png")
  image_logo.hasAlpha = true; // rispetta il canale alpha del PNG invece di renderlo opaco

  const logoPlane = MeshBuilder.CreatePlane("logoPlane", { width: logoWidth, height: logoHeight }, scene);
  const logoMat = new StandardMaterial("logoMat", scene);
  logoMat.diffuseTexture = image_logo;
  logoMat.useAlphaFromDiffuseTexture = true; // trasparenza guidata dall'alpha della texture stessa
  logoMat.emissiveColor = new Color3(0.1, 0.35, 0.55);
  logoMat.specularColor = new Color3(0, 0, 0);
  logoMat.backFaceCulling = false;
  logoPlane.material = logoMat;
  logoPlane.position.set(0, logoStartY, 0);
  // La camera del menu guarda dall'alto verso il basso con un'inclinazione
  // marcata (height ben sopra LOGO_TARGET_Y): un piano piatto senza
  // billboard mostrerebbe l'effetto prospettico "trapezio"/keystone tipico
  // di una superficie vista di sbieco. BILLBOARDMODE_ALL lo mantiene sempre
  // perfettamente frontale alla camera, qualunque sia l'angolo.
  logoPlane.billboardMode = Mesh.BILLBOARDMODE_ALL;


  // Rotazione del logo in due fasi (vedi update()): un giro completo (2π) in
  // un verso, poi un giro completo nel verso opposto (torna esattamente
  // all'orientamento di partenza), poi si ferma. spinProgress accumula i
  // radianti percorsi nella fase corrente, per sapere quando i 360° sono
  // completi indipendentemente dal framerate.
  let spinPhase = 0; // 0 = avanti, 1 = indietro, 2 = fermo
  let spinProgress = 0;

  ui.show("menu");

  // Se in debug si salta la schermata comandi (comodo durante lo sviluppo,
  // per non dover aspettare ad ogni riavvio della partita).
  function goToPlay() {
    unlockAudio();
    goto(CONFIG.debug ? "game" : "controls");
  }

  // Un solo binding dei pulsanti per l'intera vita dell'app.
  if (!createMenuScene._bound) {
    ui.bindButtons({
      onPlay: goToPlay,
      onRetry: goToPlay,
      onContinue: () => goto("wishes"),
      onMenu: () => goto("menu"),
    });
    createMenuScene._bound = true;
  }

  function update(dt) {
    if (logoPlane.position.y > logoRestY) {
      logoPlane.position.y = Math.max(logoRestY, logoPlane.position.y - LOGO_DROP_SPEED * dt);
    }
    // Essendo in BILLBOARDMODE_ALL (il piano resta sempre frontale alla
    // camera), solo l'asse z produce un effetto di rotazione visibile — x/y
    // verrebbero sovrascritti dal billboard ad ogni frame.
    if (spinPhase === 0 || spinPhase === 1) {
      let step;
      if (spinPhase==0){
        step  = LOGO_SPIN_SPEED * dt;
      }
      else{
        step = LOGO_SPIN_SPEED/2 * dt;
      }
      const dir = spinPhase === 0 ? 1 : -1;
      logoPlane.rotation.z += dir * step;
      spinProgress += step;
      if (spinProgress >= TWO_PI) {
        // Corregge l'eventuale sforamento oltre i 360° esatti (dt variabile),
        // così il giro di ritorno riparte/termina sempre allineato.
        logoPlane.rotation.z -= dir * (spinProgress - TWO_PI);
        spinProgress = 0;
        spinPhase += 1;
      }
    }
  }

  function dispose() {
    scene.dispose();
  }

  return { scene, update, dispose };
}
