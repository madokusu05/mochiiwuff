import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import "./style.css";

const surface = document.querySelector("#drag-surface");
const loading = document.querySelector("#loading");
const loadError = document.querySelector("#load-error");
const chatButton = document.querySelector("#chat-button");
const roamButton = document.querySelector("#roam-button");
const quitButton = document.querySelector("#quit-button");
const clock = new THREE.Clock();

let vrm;
let facing = 1;
let walking = false;
let talking = false;
let talkingWeight = 0;
let pointerOrigin;
let moved = false;
let walkBones = [];
let idleBones = [];
let talkingBones = [];
let nextBlinkAt = 0;
let blinkStartedAt = -Infinity;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 100);
const renderer = new THREE.WebGLRenderer({
  alpha: true,
  antialias: true,
  powerPreference: "low-power",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
surface.prepend(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xfff0f3, 0x40364c, 0.9));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
keyLight.position.set(-2, 4, 5);
scene.add(keyLight);

function resize() {
  const width = surface.clientWidth;
  const height = surface.clientHeight;
  if (!width || !height) return;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

function setWalkingBones() {
  const names = [
    ["leftUpperLeg", 1],
    ["rightUpperLeg", -1],
    ["leftLowerLeg", -1],
    ["rightLowerLeg", 1],
    ["leftUpperArm", -1],
    ["rightUpperArm", 1],
  ];

  walkBones = names
    .map(([name, direction]) => {
      const bone = vrm.humanoid.getNormalizedBoneNode(name);
      if (!bone) return undefined;
      return {
        bone,
        direction,
        baseX: bone.rotation.x,
      };
    })
    .filter(Boolean);

  const idleBoneSettings = [
    ["spine", "x", 0.025],
    ["chest", "x", 0.018],
    ["neck", "z", 0.012],
    ["head", "z", 0.01],
    ["leftUpperArm", "z", 0.009],
    ["rightUpperArm", "z", -0.009],
  ];

  const talkingBoneSettings = [
    ["neck", "x", 0.035, 0],
    ["head", "x", 0.06, Math.PI / 2],
    ["leftUpperArm", "z", 0.04],
    ["rightUpperArm", "z", -0.035, Math.PI],
  ];

  idleBones = idleBoneSettings
    .map(([name, axis, amplitude]) => {
      const bone = vrm.humanoid.getNormalizedBoneNode(name);
      if (!bone) return undefined;
      return {
        bone,
        axis,
        amplitude,
        baseRotation: bone.rotation[axis],
      };
    })
    .filter(Boolean);

  talkingBones = talkingBoneSettings
    .map(([name, axis, amplitude, phase = 0]) => {
      const bone = vrm.humanoid.getNormalizedBoneNode(name);
      if (!bone) return undefined;
      return {
        bone,
        axis,
        amplitude,
        phase,
        baseRotation: bone.rotation[axis],
      };
    })
    .filter(Boolean);
}

async function loadAvatar() {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));

  const gltf = await loader.loadAsync("./models/Mika.vrm");
  vrm = gltf.userData.vrm;
  if (!vrm) throw new Error("Le fichier n'est pas un modèle VRM reconnu.");

  VRMUtils.rotateVRM0(vrm);
  const legacyMaterials =
    gltf.parser.json.extensions?.VRM?.materialProperties ?? [];
  const legacyMaterialByName = new Map(
    legacyMaterials.map((material) => [material.name, material]),
  );
  const loadedTextures = new Map();
  let restoredTextureCount = 0;

  for (const material of legacyMaterials) {
    const textureIndex = material.textureProperties?._MainTex;
    if (!Number.isInteger(textureIndex)) continue;
    loadedTextures.set(
      material.name,
      await gltf.parser.getDependency("texture", textureIndex),
    );
  }

  let restoredTextureCount = 0;
  vrm.scene.traverse((object) => {
    object.frustumCulled = false;
    if (!object.isMesh) return;

    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      const legacyTexture = legacyMaterialByName.has(material.name)
        ? loadedTextures.get(material.name)
        : undefined;
      if (legacyTexture && material.map !== legacyTexture) {
        material.map = legacyTexture;
        material.needsUpdate = true;
        restoredTextureCount += 1;
      }
      if (material.map) {
        material.map.colorSpace = THREE.SRGBColorSpace;
        material.map.needsUpdate = true;
      }
    }
  });
  if (restoredTextureCount > 0) {
    console.info(`Textures VRM 0 réappliquées : ${restoredTextureCount}.`);
  }

  scene.add(vrm.scene);
  vrm.scene.updateMatrixWorld(true);

  const bounds = new THREE.Box3().setFromObject(vrm.scene);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const modelHeight = Math.max(size.y, 1);

  vrm.scene.position.x -= center.x;
  vrm.scene.position.y -= bounds.min.y;
  camera.position.set(0, modelHeight * 0.48, modelHeight * 3.35);
  camera.lookAt(0, modelHeight * 0.48, 0);
  camera.updateProjectionMatrix();
  setWalkingBones();
  nextBlinkAt = clock.elapsedTime + 2 + Math.random() * 3;

  loading.remove();
  resize();
}

function render() {
  requestAnimationFrame(render);
  const delta = Math.min(clock.getDelta(), 0.05);

  if (vrm) {
    const time = clock.elapsedTime;
    if (time >= nextBlinkAt) {
      blinkStartedAt = time;
      nextBlinkAt = time + 2.5 + Math.random() * 4;
    }
    vrm.scene.position.y =
      Math.sin(time * (walking ? 11 : 2.1)) * (walking ? 0.018 : 0.01);
    vrm.scene.rotation.y = Math.sin(time * 0.65) * 0.035;

    const breathing = Math.sin(time * 2.1);
    talkingWeight = THREE.MathUtils.damp(
      talkingWeight,
      talking ? 1 : 0,
      5,
      delta,
    );
    for (const { bone, axis, amplitude, baseRotation } of idleBones) {
      bone.rotation[axis] = baseRotation + breathing * amplitude;
    }

    const speechMotion = talkingWeight * Math.sin(time * 7);
    for (const { bone, axis, amplitude, phase, baseRotation } of talkingBones) {
      bone.rotation[axis] =
        baseRotation +
        speechMotion * amplitude * Math.sin(time * 2.3 + phase);
    }
    vrm.expressionManager?.setValue(
      "aa",
      talkingWeight * (0.2 + Math.abs(Math.sin(time * 8)) * 0.35),
    );

    for (const { bone, direction, baseX } of walkBones) {
      const amplitude = walking ? 0.22 : 0;
      bone.rotation.x =
        baseX + Math.sin(time * 9 + (direction < 0 ? Math.PI : 0)) * amplitude;
    }

    const blinkWeight = THREE.MathUtils.clamp(
      1 - (time - blinkStartedAt) / 0.16,
      0,
      1,
    );
    vrm.expressionManager?.setValue("blink", blinkWeight);
    vrm.update(delta);
  }

  renderer.render(scene, camera);
}

loadAvatar().catch((error) => {
  loading.hidden = true;
  loadError.hidden = false;
  console.error("Impossible de charger l'avatar VRM de Mika.", error);
});

new ResizeObserver(resize).observe(surface);
render();

chatButton.addEventListener("pointerdown", (event) => event.stopPropagation());
roamButton.addEventListener("pointerdown", (event) => event.stopPropagation());
quitButton.addEventListener("pointerdown", (event) => event.stopPropagation());

chatButton.addEventListener("click", () => window.mikaDesktop.openChat());
roamButton.addEventListener("click", async () => {
  const enabled = await window.mikaDesktop.toggleRoaming();
  roamButton.textContent = enabled ? "Pause" : "Reprendre";
  roamButton.title = enabled
    ? "Mettre en pause les déplacements"
    : "Reprendre les déplacements";
});
quitButton.addEventListener("click", () => window.mikaDesktop.quit());

surface.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  pointerOrigin = { x: event.screenX, y: event.screenY };
  moved = false;
  surface.setPointerCapture(event.pointerId);
  window.mikaDesktop.startDrag();
});

surface.addEventListener("pointermove", (event) => {
  if (!pointerOrigin) return;
  const deltaX = event.screenX - pointerOrigin.x;
  const deltaY = event.screenY - pointerOrigin.y;
  if (Math.abs(deltaX) + Math.abs(deltaY) > 3) moved = true;
  if (!moved) return;

  window.mikaDesktop.moveBy(deltaX, deltaY);
  pointerOrigin = { x: event.screenX, y: event.screenY };
});

function finishDrag(event) {
  if (!pointerOrigin) return;
  pointerOrigin = undefined;
  window.mikaDesktop.endDrag();
  if (surface.hasPointerCapture(event.pointerId)) {
    surface.releasePointerCapture(event.pointerId);
  }
}

surface.addEventListener("pointerup", finishDrag);
surface.addEventListener("pointercancel", finishDrag);

window.mikaDesktop.onMovement((isWalking, direction) => {
  walking = isWalking;
  if (direction) facing = direction;
  surface.classList.toggle("walking", walking);
  surface.classList.toggle("facing-left", facing < 0);
});

window.mikaDesktop.onFacing((direction) => {
  facing = direction;
  surface.classList.toggle("facing-left", facing < 0);
});

window.mikaDesktop.onConversationState((isSpeaking) => {
  talking = isSpeaking;
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") window.mikaDesktop.quit();
});
