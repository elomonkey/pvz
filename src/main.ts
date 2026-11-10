import './style.css';
import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { CAMERA, PALETTE } from './data';
import { Game } from './game';
import { Sound } from './sound';
import { UI } from './ui';
import { initYandex } from './yandex';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
const app = document.getElementById('app');
const labelsLayer = document.getElementById('labels-layer');

if (!canvas || !app || !labelsLayer) {
  throw new Error('Не найдены элементы игры');
}

function targetPixelRatio(): number {
  // Ограничиваем плотность пикселей: на телефонах и retina-экранах
  // это заметно снижает нагрузку, а картинка остаётся чёткой.
  const dpr = window.devicePixelRatio || 1;
  return Math.min(dpr, 1.5);
}

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(targetPixelRatio());
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setClearColor(PALETTE.bg, 1);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.bg);

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
camera.position.set(CAMERA.pos.x, CAMERA.pos.y, CAMERA.pos.z);
camera.lookAt(new THREE.Vector3(CAMERA.target.x, CAMERA.target.y, CAMERA.target.z));

const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.left = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
labelsLayer.appendChild(labelRenderer.domElement);

const sound = new Sound();
const ui = new UI(sound);
const game = new Game(scene, camera, renderer, ui, sound);
ui.bind(game);
game.start();

// Удобно для отладки и проверки механик в консоли.
const debugWindow = window as unknown as {
  game: Game;
  labelRenderer: CSS2DRenderer;
  ui: UI;
};
debugWindow.game = game;
debugWindow.labelRenderer = labelRenderer;
debugWindow.ui = ui;

function resize(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setPixelRatio(targetPixelRatio());
  renderer.setSize(width, height);
  labelRenderer.setSize(width, height);

  const aspect = width / Math.max(1, height);
  const viewHeight = Math.max(CAMERA.viewHeight, CAMERA.minAspectWidth / aspect);
  const viewWidth = viewHeight * aspect;
  camera.left = -viewWidth / 2;
  camera.right = viewWidth / 2;
  camera.top = viewHeight / 2;
  camera.bottom = -viewHeight / 2;
  camera.updateProjectionMatrix();
}

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => {
  window.setTimeout(resize, 80);
});
resize();

renderer.domElement.addEventListener('contextmenu', (event) => {
  event.preventDefault();
});

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  game.update(dt);
  ui.update(dt);
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
});

void initYandex().then((best) => {
  if (best !== null) game.setBest(best);
});
