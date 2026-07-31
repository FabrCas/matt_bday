import {
  Scene,
  FreeCamera,
  HemisphericLight,
  MeshBuilder,
  StandardMaterial,
  Mesh,
  Color3,
  Color4,
  Vector3,
} from "@babylonjs/core";
import * as ui from "../ui/ui.js";
import { getCameraProfile_menu } from "../utils/responsive.js";
import { loadTexture } from "../utils/textureLoader.js";
import { CONFIG } from "../config/index.js";

// Numero di piani quadrati che orbitano intorno al testo (configurabile in
// game.config.yaml, sezione `wishes.galleryPlaneCount`).
const GALLERY_PLANE_COUNT = CONFIG.wishes.galleryPlaneCount;
const FACE_KERMIT = "face_kermit.png";
const FACE_1 = "face_1.png";
const FACE_2 = "face_2.png";
const FACE_3 = "face_3.png";
const FACE_4 = "face_4.png";
const FACE_5 = "face_kermit.png";
const FACE_6 = "face_kermit.png";
const FACE_7 = "face_kermit.png";
const FACE_8 = "face_kermit.png";
const FACE_9 = "face_kermit.png";
const FACES = [
  FACE_KERMIT,
  FACE_1,
  FACE_2,
  FACE_3,
  FACE_4,
  FACE_5,
  FACE_6,
  FACE_7,
  FACE_8,
  FACE_9
]
// const FACE_1 = "face_kermit.png";
// const FACE_1 = "face_kermit.png";
// const FACE_1 = "face_kermit.png";
// const FACE_1 = "face_kermit.png";
// const FACE_1 = "face_kermit.png";

// Scena Auguri: raggiunta dal bottone "continua" del game over. Il testo di
// auguri resta al centro (overlay HTML, come prima). Intorno, allo stesso
// livello di profondità del centro (nessun avvicinamento/allontanamento
// dalla camera durante l'orbita, quindi nessuna sfocatura prospettica), N
// piani quadrati orbitano in cerchio senza mai attraversare il centro: il
// raggio è calcolato in base a FOV/distanza della camera così il cerchio
// resta sempre più largo della zona centrale occupata dal testo. Per ora
// piani grigi placeholder, in seguito verranno texturizzati con immagini
// (stesso approccio "placeholder poi texture" usato per i muri del corridoio
// di gioco).
//
// Nota implementativa: la posizione di ogni piano viene ricalcolata a mano
// ogni frame (niente TransformNode padre + billboard) perché in Babylon.js
// un mesh in billboardMode non eredita in modo affidabile la rotazione del
// genitore: l'orbita andrebbe persa (i piani resterebbero fermi).
export async function createWishesScene({ engine }) {
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

  // ---- Piani orbitanti intorno al centro (stesso punto dove è centrato il
  // testo HTML, in precedenza occupato dalla "gem" decorativa).
  const GALLERY_CENTER = new Vector3(0, 1, 0);
  // Raggio proporzionato al semi-campo visivo a quella distanza, con un
  // margine di sicurezza: il cerchio resta sempre più ampio della zona
  // centrale dove sta il testo, su qualunque device.
  const GALLERY_RADIUS = cam.distance * Math.tan(cam.fov / 2) * 0.75;
  const PLANE_SIZE = GALLERY_RADIUS * 0.5; // piani quadrati
  const GALLERY_ROTATION_SPEED = 0.4; // rad/s

  let galleryPlaneMatArray = [];
  for (let i = 0; i < GALLERY_PLANE_COUNT; i++) {
    const galleryPlaneMat = new StandardMaterial("wishesGalleryMat", scene);
    // galleryPlaneMat.diffuseColor = new Color3(0.75, 0.75, 0.8);
    const galleryTexture = loadTexture(scene, FACES[i]);
    galleryTexture.hasAlpha = true; // il png ha canale alpha: va dichiarato esplicitamente
    galleryPlaneMat.diffuseTexture = galleryTexture;
    galleryPlaneMat.useAlphaFromDiffuseTexture = true; // usa l'alpha della texture per la trasparenza
    galleryPlaneMat.emissiveColor = new Color3(0.75, 0.75, 0.8);
    galleryPlaneMat.specularColor = new Color3(0, 0, 0);
    galleryPlaneMat.backFaceCulling = true;
    galleryPlaneMat.disableLighting = true;
    galleryPlaneMatArray.push(galleryPlaneMat);
  }

  const galleryPlanes = [];
  for (let i = 0; i < GALLERY_PLANE_COUNT; i++) {
    const p = MeshBuilder.CreatePlane(
      "wishesPlane" + i,
      { width: PLANE_SIZE, height: PLANE_SIZE },
      scene
    );
    p.material = galleryPlaneMatArray[i];
    p.billboardMode = Mesh.BILLBOARDMODE_ALL; // sempre rivolto verso la camera
    galleryPlanes.push({ mesh: p, baseAngle: (i / GALLERY_PLANE_COUNT) * Math.PI * 2 });
  }

  let orbitAngle = 0;
  function positionGallery() {
    for (const { mesh, baseAngle } of galleryPlanes) {
      const a = orbitAngle + baseAngle;
      mesh.position.set(
        GALLERY_CENTER.x + Math.cos(a) * GALLERY_RADIUS,
        GALLERY_CENTER.y + Math.sin(a) * GALLERY_RADIUS,
        GALLERY_CENTER.z
      );
    }
  }
  positionGallery();

  // `goto()` in main.js mostra la schermata "loading" prima di chiamare questa
  // factory e la nasconde solo quando la promise ritornata si risolve: qui
  // aspettiamo che texture/materiali/mesh siano tutti pronti (incluse le
  // prossime texture che verranno aggiunte) prima di mostrare la scena, così
  // non si vedono i piani "vuoti"/grigi lampeggiare mentre caricano.
  await scene.whenReadyAsync(true);

  ui.show("wishes");
  ui.updateWishes();

  function update(dt) {
    orbitAngle += dt * GALLERY_ROTATION_SPEED;
    positionGallery();
  }

  function dispose() {
    scene.dispose();
  }

  return { scene, update, dispose };
}
