import {
  Scene,
  FreeCamera,
  HemisphericLight,
  MeshBuilder,
  StandardMaterial,
  TransformNode,
  Mesh,
  Color3,
  Color4,
  Vector3,
} from "@babylonjs/core";
import * as ui from "../ui/ui.js";
import { getCameraProfile_menu } from "../utils/responsive.js";

// Numero di piani che orbitano intorno al testo (in seguito riempiti con
// immagini/foto).
const GALLERY_PLANE_COUNT = 6;

// Scena Auguri: raggiunta dal bottone "continua" del game over. Il testo di
// auguri resta al centro (overlay HTML, come prima). Intorno, allo stesso
// livello (nessuno spostamento in profondità, niente sfocatura), N piani
// orbitano in cerchio attorno al centro senza mai attraversarlo: il raggio
// è calcolato in base a FOV/distanza della camera così il cerchio resta
// sempre più largo della zona centrale occupata dal testo, che quindi non
// viene mai coperto dai piani. Per ora piani grigi placeholder, in seguito
// verranno texturizzati con immagini (stesso approccio "placeholder poi
// texture" usato per i muri del corridoio di gioco).
export function createWishesScene({ engine }) {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.06, 0.09, 0.16, 1);

  // Il profilo camera è già calibrato per mobile/desktop (fov, distanza,
  // altezza): la galleria viene dimensionata in proporzione ad esso, così
  // resta leggibile e centrata su qualunque schermo.
  const cam = getCameraProfile_menu();
  const camera = new FreeCamera("wishesCam", new Vector3(0, cam.height, -cam.distance), scene);
  camera.setTarget(new Vector3(0, 1, 0));
  camera.fov = cam.fov;

  const light = new HemisphericLight("wishesLight", new Vector3(0.2, 1, 0.3), scene);
  light.intensity = 0.9;

  // ---- Piani orbitanti intorno al centro (stesso punto occupato prima dalla
  // "gem" decorativa, dove il testo HTML è centrato). Il cerchio ruota nel
  // piano rivolto verso la camera (asse Z del pivot, non l'asse Y): nessun
  // piano si sposta mai in avanti/indietro verso il centro, quindi nessuno
  // passa "davanti" al testo, restano sempre disposti intorno ad esso.
  const GALLERY_CENTER = new Vector3(0, 1, 0);
  // Raggio proporzionato al semi-campo visivo a quella distanza, con un
  // margine di sicurezza: il cerchio resta sempre più ampio della zona
  // centrale dove sta il testo, su qualunque device.
  const GALLERY_RADIUS = cam.distance * Math.tan(cam.fov / 2) * 0.55;
  const PLANE_WIDTH = GALLERY_RADIUS * 0.5;
  const PLANE_HEIGHT = PLANE_WIDTH * 0.66;
  const GALLERY_ROTATION_SPEED = 0.3; // rad/s

  const galleryPlaneMat = new StandardMaterial("wishesGalleryMat", scene);
  galleryPlaneMat.diffuseColor = new Color3(0.55, 0.55, 0.6);
  galleryPlaneMat.specularColor = new Color3(0, 0, 0);

  const galleryPivot = new TransformNode("wishesGalleryPivot", scene);
  galleryPivot.position.copyFrom(GALLERY_CENTER);

  const galleryPlanes = [];
  for (let i = 0; i < GALLERY_PLANE_COUNT; i++) {
    const angle = (i / GALLERY_PLANE_COUNT) * Math.PI * 2;
    const p = MeshBuilder.CreatePlane(
      "wishesPlane" + i,
      { width: PLANE_WIDTH, height: PLANE_HEIGHT },
      scene
    );
    p.material = galleryPlaneMat;
    p.billboardMode = Mesh.BILLBOARDMODE_ALL; // sempre rivolto verso la camera
    p.parent = galleryPivot;
    // Cerchio nel piano XY locale: orbita "a schermo", nessuna componente Z.
    p.position.set(Math.cos(angle) * GALLERY_RADIUS, Math.sin(angle) * GALLERY_RADIUS, 0);
    galleryPlanes.push(p);
  }

  ui.show("wishes");
  ui.updateWishes();

  function update(dt) {
    galleryPivot.rotation.z += dt * GALLERY_ROTATION_SPEED;
  }

  function dispose() {
    scene.dispose();
  }

  return { scene, update, dispose };
}
