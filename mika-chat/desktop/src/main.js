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
let pointerOrigin;
let moved = false;
let walkBones = [];

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
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
surface.prepend(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xfff0f3, 0x40364c, 2));
const keyLight = new THREE.DirectionalLight(0xffffff, 2);
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
}

async function loadAvatar() {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));

  const gltf = await loader.loadAsync("./models/Mika.vrm");
  vrm = gltf.userData.vrm;
  if (!vrm) throw new Error("Le fichier n'est pas un modèle VRM reconnu.");

  VRMUtils.rotateVRM0(vrm);
  vrm.scene.traverse((object) => {
    object.frustumCulled = false;
  });

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

  loading.remove();
  resize();
}

function render() {
  requestAnimationFrame(render);
  const delta = Math.min(clock.getDelta(), 0.05);

  if (vrm) {
    vrm.update(delta);
    const time = clock.elapsedTime;
    vrm.scene.position.y = Math.sin(time * (walking ? 11 : 2)) * (walking ? 0.018 : 0.006);
    vrm.scene.rotation.y = Math.sin(time * 0.65) * 0.035;

    for (const { bone, direction, baseX } of walkBones) {
      const amplitude = walking ? 0.22 : 0;
      bone.rotation.x =
        baseX + Math.sin(time * 9 + (direction < 0 ? Math.PI : 0)) * amplitude;
    }
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

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") window.mikaDesktop.quit();
});
