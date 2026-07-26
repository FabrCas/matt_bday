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

// Numero di piani della galleria che ruota sullo sfondo (in seguito riempiti
// con immagini/foto).
const GALLERY_PLANE_COUNT = 6;

// Scena Auguri: raggiunta dal bottone "continua" del game over. Il testo di
// auguri resta in foreground (overlay HTML, sempre sopra il canvas); dietro,
// nella scena 3D, un layer più arretrato di N piani ruota attorno al centro
// - per ora piani grigi placeholder, in seguito verranno texturizzati con
// immagini (stesso approccio "placeholder poi texture" usato per i muri del
// corridoio di gioco).
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

  // ---- Layer arretrato: N piani 2D disposti in cerchio, che ruotano intorno
  // al centro della scena. Billboard verso la camera, così restano sempre
  // leggibili (importante quando conterranno immagini) mentre orbitano.
  const GALLERY_Y = 1;
  const GALLERY_DEPTH = cam.distance * 0.55; // quanto più indietro rispetto al centro
  const GALLERY_RADIUS = cam.distance * 0.32;
  const PLANE_WIDTH = cam.distance * 0.16;
  const PLANE_HEIGHT = PLANE_WIDTH * 0.66;
  const GALLERY_ROTATION_SPEED = 0.3; // rad/s

  const galleryPlaneMat = new StandardMaterial("wishesGalleryMat", scene);
  galleryPlaneMat.diffuseColor = new Color3(0.55, 0.55, 0.6);
  galleryPlaneMat.specularColor = new Color3(0, 0, 0);

  const galleryPivot = new TransformNode("wishesGalleryPivot", scene);
  galleryPivot.position.set(0, GALLERY_Y, GALLERY_DEPTH);

  const galleryPlanes = [];
  for (let i = 0; i < GALLERY_PLANE_COUNT; i++) {
    const angle = (i / GALLERY_PLANE_COUNT) * Math.PI * 2;
    const p = MeshBuilder.CreatePlane(
      "wishesPlane" + i,
      { width: PLANE_WIDTH, height: PLANE_HEIGHT },
      scene
    );
    p.material = galleryPlaneMat;
    p.billboardMode = Mesh.BILLBOARDMODE_ALL;
    p.parent = galleryPivot;
    p.position.set(Math.cos(angle) * GALLERY_RADIUS, 0, Math.sin(angle) * GALLERY_RADIUS);
    galleryPlanes.push(p);
  }

  ui.show("wishes");
  ui.updateWishes();

  function update(dt) {
    galleryPivot.rotation.y += dt * GALLERY_ROTATION_SPEED;
  }

  function dispose() {
    scene.dispose();
  }

  return { scene, update, dispose };
}
