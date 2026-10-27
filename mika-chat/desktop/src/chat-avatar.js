import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";

const AVATAR_SELECTOR = ".avatar img";
const ICON_SIZE = 96;
const visibleCanvases = new Set();
const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (entry.isIntersecting) {
      visibleCanvases.add(entry.target);
    } else {
      visibleCanvases.delete(entry.target);
    }
  }
});

const renderer = new THREE.WebGLRenderer({
  alpha: true,
  antialias: true,
  powerPreference: "low-power",
  preserveDrawingBuffer: true,
});
renderer.setSize(ICON_SIZE, ICON_SIZE, false);
renderer.setPixelRatio(1);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xfff0f3, 0x40364c, 1));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
keyLight.position.set(-2, 4, 5);
scene.add(keyLight);

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
const clock = new THREE.Clock();
let vrm;
let nextBlinkAt = 0;
let blinkStartedAt = -Infinity;
let responding = false;
let talkingWeight = 0;

function installCanvas(image) {
  const canvas = document.createElement("canvas");
  canvas.className = "avatar-3d";
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  canvas.setAttribute("aria-hidden", "true");
  image.replaceWith(canvas);
  observer.observe(canvas);
}

function installPendingCanvases() {
  for (const image of document.querySelectorAll(AVATAR_SELECTOR)) {
    installCanvas(image);
  }
}

async function loadAvatar() {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const gltf = await loader.loadAsync("/models/Mika.vrm");
  vrm = gltf.userData.vrm;
  if (!vrm) throw new Error("Le modèle local n'est pas reconnu comme un VRM.");

  VRMUtils.rotateVRM0(vrm);
  const materialProperties =
    gltf.parser.json.extensions?.VRM?.materialProperties ?? [];
  const materialsByName = new Map(
    materialProperties.map((material) => [material.name, material]),
  );
  const texturesByName = new Map();

  for (const material of materialProperties) {
    const textureIndex = material.textureProperties?._MainTex;
    if (Number.isInteger(textureIndex)) {
      texturesByName.set(
        material.name,
        await gltf.parser.getDependency("texture", textureIndex),
      );
    }
  }

  vrm.scene.traverse((object) => {
    object.frustumCulled = false;
    if (!object.isMesh) return;

    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      const texture = materialsByName.has(material.name)
        ? texturesByName.get(material.name)
        : undefined;
      if (texture && material.map !== texture) {
        material.map = texture;
        material.needsUpdate = true;
      }
      if (material.map) {
        material.map.colorSpace = THREE.SRGBColorSpace;
        material.map.needsUpdate = true;
      }
    }
  });

  scene.add(vrm.scene);
  vrm.scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(vrm.scene);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const height = Math.max(size.y, 1);
  vrm.scene.position.x -= center.x;
  vrm.scene.position.y -= bounds.min.y;

  const target = new THREE.Vector3(0, height * 0.84, center.z);
  const head = vrm.humanoid.getNormalizedBoneNode("head");
  if (head) {
    head.getWorldPosition(target);
    target.y += height * 0.035;
  }
  const frameSize = height * 0.42;
  camera.left = -frameSize / 2;
  camera.right = frameSize / 2;
  camera.top = frameSize / 2;
  camera.bottom = -frameSize / 2;
  camera.position.set(target.x, target.y, target.z + height * 3);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  nextBlinkAt = clock.elapsedTime + 2 + Math.random() * 3;
  installPendingCanvases();
}

function render() {
  requestAnimationFrame(render);
  if (!vrm || visibleCanvases.size === 0) return;

  const delta = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;
  if (time >= nextBlinkAt) {
    blinkStartedAt = time;
    nextBlinkAt = time + 2.5 + Math.random() * 4;
  }

  vrm.scene.position.y = Math.sin(time * 2.1) * 0.008;
  vrm.scene.rotation.y = Math.sin(time * 0.8) * 0.035;
  talkingWeight = THREE.MathUtils.damp(
    talkingWeight,
    responding ? 1 : 0,
    5,
    delta,
  );
  vrm.expressionManager?.setValue(
    "aa",
    talkingWeight * (0.2 + Math.abs(Math.sin(time * 8)) * 0.3),
  );
  vrm.expressionManager?.setValue(
    "blink",
    THREE.MathUtils.clamp(1 - (time - blinkStartedAt) / 0.16, 0, 1),
  );
  vrm.update(delta);
  renderer.render(scene, camera);

  for (const canvas of visibleCanvases) {
    if (!canvas.isConnected) {
      visibleCanvases.delete(canvas);
      observer.unobserve(canvas);
      continue;
    }
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(renderer.domElement, 0, 0, canvas.width, canvas.height);
  }
}

new MutationObserver(installPendingCanvases).observe(document.body, {
  childList: true,
  subtree: true,
});

document.addEventListener("mika:waiting", (event) => {
  responding = event.detail === true;
});

loadAvatar().catch((error) => {
  console.error("L’avatar 3D du chat de Mika n’a pas pu être chargé.", error);
});
render();
