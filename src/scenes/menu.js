import {
  Scene,
  FreeCamera,
  HemisphericLight,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Color4,
  Vector3,
} from "@babylonjs/core";
import * as ui from "../ui/ui.js";
import { getCameraProfile_menu } from "../utils/responsive.js";
import { unlockAudio } from "../utils/audioLoader.js";
import { CONFIG } from "../config/index.js";

// Piano del logo: parte da sopra la vista e scende fino al centro, dove si
// ferma (vedi update()). Per ora materiale a tinta unita: la texture reale
// del logo verrà applicata in seguito (basta assegnarla a logoMat.diffuseTexture).
const LOGO_TARGET_Y = 1; // stessa altezza a cui puntava la camera/la vecchia gem
const LOGO_DROP_SPEED = 3; // unità/s

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
  const logoStartY = LOGO_TARGET_Y + logoHeight; // sopra la vista, fuori schermo

  const logoPlane = MeshBuilder.CreatePlane("logoPlane", { width: logoWidth, height: logoHeight }, scene);
  const logoMat = new StandardMaterial("logoMat", scene);
  logoMat.diffuseColor = new Color3(0.22, 0.74, 0.97);
  logoMat.emissiveColor = new Color3(0.1, 0.35, 0.55);
  logoMat.specularColor = new Color3(0, 0, 0);
  logoMat.backFaceCulling = false;
  logoPlane.material = logoMat;
  logoPlane.position.set(0, logoStartY, 0);

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
    if (logoPlane.position.y > LOGO_TARGET_Y) {
      logoPlane.position.y = Math.max(LOGO_TARGET_Y, logoPlane.position.y - LOGO_DROP_SPEED * dt);
    }
  }

  function dispose() {
    scene.dispose();
  }

  return { scene, update, dispose };
}
