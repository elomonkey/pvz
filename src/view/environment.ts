import * as THREE from 'three';
import { PALETTE, ROOM, STORAGE, STORAGE_DOOR } from '../data';
import { createPlant } from './props';
import {
  box,
  cone,
  contactShadow,
  cylinder,
  makeTextTexture,
  signPlane,
  sphere,
  woodTexture,
  fabricTexture,
} from './primitives';
import {
  mergeStaticMeshes,
  mergeStaticMeshesToVertexColor,
  roundedBox,
  VERTEX_COLOR_MATERIAL,
} from './kit';

const INK = '#26313a';
const CREAM = '#fff4e3';
const BLUE = '#7893a1';
const WALL_TRIM = '#d8cdbd';
const WOOD = '#c99766';
const WOOD_DARK = '#8b6446';

export type WindowPhase = 1 | 2 | 3;

export interface WindowVisual {
  setPhase: (phase: WindowPhase) => void;
  update: (time: number) => void;
}

export interface EnvironmentVisuals {
  clock: THREE.Mesh;
  clockSecondHand: THREE.Object3D;
  pvzSign: THREE.Mesh;
  clientRug: THREE.Mesh;
  walls: THREE.Mesh[];
  floors: THREE.Mesh[];
  neonSign: THREE.Group;
  neonGlowMaterial: THREE.MeshBasicMaterial;
  window: WindowVisual;
}

function makeTileTexture(
  baseColor: string,
  lineColor: string,
  rx: number,
  ry: number,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, 128, 128);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.045)';
    ctx.fillRect(6, 6, 116, 116);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(rx, ry);
  return texture;
}

function makeRugTexture(color = '#82949b', edge = '#526d76'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = ctx.createPattern(fabricTexture(color).image, 'repeat')!;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = edge;
  ctx.lineWidth = 8;
  ctx.strokeRect(6, 6, 244, 244);
  ctx.strokeStyle = '#cfc9aa';
  ctx.lineWidth = 2;
  ctx.strokeRect(17, 17, 222, 222);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function createFloor(scene: THREE.Scene): THREE.Mesh[] {
  const rightBase = box(6.7, 0.22, 5.7, '#9d8d72');
  rightBase.position.set(1.65, -0.11, 0.85);
  rightBase.raycast = () => {};
  scene.add(rightBase);

  const sw = STORAGE.maxX - STORAGE.minX;
  const sd = STORAGE.maxZ - STORAGE.minZ;
  const sx = (STORAGE.minX + STORAGE.maxX) / 2;
  const sz = (STORAGE.minZ + STORAGE.maxZ) / 2;
  const storageBase = box(sw + 0.1, 0.22, sd + 0.05, '#9d8d72');
  storageBase.position.set(sx, -0.11, sz);
  storageBase.raycast = () => {};
  scene.add(storageBase);

  const rightTexture = woodTexture(PALETTE.floor, 2, 3);
  const rightFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(6.6, 5.6),
    new THREE.MeshLambertMaterial({ map: rightTexture }),
  );
  rightFloor.rotation.x = -Math.PI / 2;
  rightFloor.position.set(1.65, 0.002, 0.85);
  rightFloor.userData = { type: 'floor' };
  scene.add(rightFloor);

  const storageTexture = makeTileTexture('#d1c2aa', '#bcae97', sw / 0.9, sd / 0.9);
  const storageFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(sw, sd),
    new THREE.MeshLambertMaterial({ map: storageTexture }),
  );
  storageFloor.rotation.x = -Math.PI / 2;
  storageFloor.position.set(sx, 0.002, sz);
  storageFloor.name = 'storage-floor';
  storageFloor.userData = { type: 'floor' };
  scene.add(storageFloor);

  const border1 = box(6.75, 0.1, 0.12, '#7d6d55');
  border1.position.set(1.65, 0.035, -2.04);
  border1.raycast = () => {};
  scene.add(border1);
  const border2 = box(sw + 0.15, 0.1, 0.12, '#7d6d55');
  border2.position.set(sx, 0.035, -2.04);
  border2.raycast = () => {};
  scene.add(border2);
  const border3 = box(0.12, 0.1, 5.7, '#7d6d55');
  border3.position.set(4.99, 0.035, 0.85);
  border3.raycast = () => {};
  scene.add(border3);
  const border4 = box(0.12, 0.1, sd + 0.05, '#7d6d55');
  border4.position.set(STORAGE.minX - 0.04, 0.035, sz);
  border4.raycast = () => {};
  scene.add(border4);

  return [rightFloor, storageFloor];
}

function createRug(scene: THREE.Scene): THREE.Mesh {
  const rug = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.018, 1.85),
    new THREE.MeshLambertMaterial({ map: makeRugTexture() }),
  );
  rug.name = 'client-rug';
  rug.position.set(0.4, 0.012, 1.9);
  rug.userData = { type: 'floor' };
  scene.add(rug);

  const staffMat = new THREE.Mesh(
    new THREE.BoxGeometry(3.95, 0.018, 1.35),
    new THREE.MeshLambertMaterial({ map: makeRugTexture('#7f8b62', '#526343') }),
  );
  staffMat.name = 'staff-rug';
  staffMat.position.set(0.75, 0.012, -0.93);
  staffMat.userData = { type: 'floor' };
  scene.add(staffMat);

  // A single flat painted border, with rounded corners, leaves the aisle empty.
  const rounded = (path: THREE.Path, x: number, y: number, w: number, h: number, r: number): void => {
    path.moveTo(x + r, y);
    path.lineTo(x + w - r, y); path.quadraticCurveTo(x + w, y, x + w, y + r);
    path.lineTo(x + w, y + h - r); path.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    path.lineTo(x + r, y + h); path.quadraticCurveTo(x, y + h, x, y + h - r);
    path.lineTo(x, y + r); path.quadraticCurveTo(x, y, x + r, y);
  };
  const border = new THREE.Shape();
  rounded(border, -2.65, -0.45, 5.3, 0.9, 0.12);
  const inner = new THREE.Path();
  rounded(inner, -2.61, -0.41, 5.22, 0.82, 0.08);
  border.holes.push(inner);
  const aisle = new THREE.Mesh(new THREE.ShapeGeometry(border), new THREE.MeshLambertMaterial({ color: '#d5ac52' }));
  aisle.name = 'storage-clear-aisle';
  aisle.rotation.x = -Math.PI / 2;
  aisle.position.set(-4.95, 0.014, -1.05);
  aisle.raycast = () => {};
  scene.add(aisle);
  return rug;
}

function createEntranceMat(scene: THREE.Scene): void {
  const matMesh = box(1.0, 0.018, 0.7, '#6f8f7a');
  matMesh.position.set(1.8, 0.012, 3.3);
  matMesh.userData = { type: 'floor' };
  scene.add(matMesh);
}

function createNeonSign(scene: THREE.Scene): {
  group: THREE.Group;
  glowMaterial: THREE.MeshBasicMaterial;
} {
  const group = new THREE.Group();
  group.position.set(-1.57, 2.85, 1.0);
  group.rotation.y = Math.PI / 2;
  group.visible = false;

  const glowMaterial = new THREE.MeshBasicMaterial({
    color: '#3ee6ff',
    transparent: true,
    opacity: 0.12,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.8), glowMaterial);
  glow.position.z = 0.012;
  group.add(glow);

  const plate = roundedBox(1.5, 0.55, 0.06, '#1b2b33', { radius: 0.04 });
  group.add(plate);

  const text = signPlane('ПВЗ', 1.28, 0.4, {
    bg: '#1b2b33',
    color: '#69f7ff',
    fontSize: 92,
    border: '#69f7ff',
  });
  text.position.z = 0.04;
  group.add(text);

  const sub = signPlane('КРУГЛОСУТОЧНО', 1.1, 0.14, {
    bg: '#1b2b33',
    color: '#69f7ff',
    fontSize: 30,
    border: '#1b2b33',
  });
  sub.position.set(0, -0.22, 0.04);
  group.add(sub);

  const stripMaterial = new THREE.MeshBasicMaterial({ color: '#69f7ff' });
  for (const y of [-0.28, 0.28]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.022, 0.02), stripMaterial);
    strip.position.set(0, y, 0.045);
    group.add(strip);
  }

  scene.add(group);
  return { group, glowMaterial };
}

function makeCourtyardBackdrop(phase: WindowPhase): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const evening = phase === 3;
    const day = phase === 2;
    const skyTop = evening ? '#3f3f6e' : day ? '#6fc3ee' : '#a6d4ea';
    const skyMid = evening ? '#b76b8e' : day ? '#c9e9fa' : '#dceff4';
    const skyBottom = evening ? '#ffd6a0' : day ? '#eef9ff' : '#ffe5c6';

    const gradient = ctx.createLinearGradient(0, 0, 0, 280);
    gradient.addColorStop(0, skyTop);
    gradient.addColorStop(0.58, skyMid);
    gradient.addColorStop(1, skyBottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 800, 280);

    // Солнце остаётся в левой части окна; дверь получает свой кусок панорамы.
    const sunX = evening ? 520 : day ? 470 : 280;
    const sunY = evening ? 176 : day ? 154 : 168;
    const sunRadius = evening ? 28 : day ? 24 : 26;
    const sunColor = evening ? '#ff9b62' : day ? '#fff3b0' : '#ffd48a';
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = sunColor;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunRadius * 2.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = sunColor;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
    ctx.fill();

    const cloudAlpha = evening ? 0.3 : 0.68;
    const drawCloud = (x: number, y: number, scale: number): void => {
      ctx.save();
      ctx.globalAlpha = cloudAlpha;
      ctx.fillStyle = evening ? '#ffd9d0' : '#ffffff';
      for (const [dx, dy, rx, ry] of [
        [-28, 4, 28, 11],
        [0, 0, 34, 14],
        [32, 5, 25, 10],
      ] as const) {
        ctx.beginPath();
        ctx.ellipse(x + dx * scale, y + dy * scale, rx * scale, ry * scale, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };
    drawCloud(120, 180, 0.8);
    drawCloud(360, 148, 0.85);
    drawCloud(560, 194, 0.75);
    drawCloud(700, 158, 0.7);

    if (evening) {
      ctx.fillStyle = 'rgba(255, 255, 235, 0.8)';
      for (const [x, y, r] of [
        [60, 118, 1.1],
        [186, 96, 0.9],
        [320, 122, 1.1],
        [458, 100, 1.0],
        [612, 116, 1.1],
        [742, 92, 1.0],
      ] as const) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Дальняя зелень на горизонте — плоский фон за 3D-кустами и дорогой.
    // Панорама шире окна, поэтому кусты и холмы продолжаются до двери.
    const farGreen = evening ? '#3f5e4d' : day ? '#5f8f63' : '#6f9f6a';
    const farGreenLight = evening ? '#4d6f59' : '#7fb27a';
    ctx.fillStyle = farGreen;
    ctx.beginPath();
    ctx.moveTo(0, 268);
    ctx.quadraticCurveTo(70, 238, 160, 262);
    ctx.quadraticCurveTo(260, 288, 360, 252);
    ctx.quadraticCurveTo(470, 224, 570, 256);
    ctx.quadraticCurveTo(670, 280, 800, 248);
    ctx.lineTo(800, 360);
    ctx.lineTo(0, 360);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = farGreenLight;
    for (const [x, y, r] of [
      [70, 270, 26],
      [168, 266, 21],
      [264, 274, 28],
      [370, 260, 24],
      [478, 268, 26],
      [588, 260, 22],
      [700, 270, 24],
      [772, 256, 19],
    ] as const) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

interface CourtyardVisual {
  setPhase: (phase: WindowPhase) => void;
  update: (time: number) => void;
}

function createCourtyard(scene: THREE.Scene): CourtyardVisual {
  const group = new THREE.Group();
  const bushes: THREE.Group[] = [];

  const addBox = (
    width: number,
    height: number,
    depth: number,
    color: string,
    x: number,
    y: number,
    z: number,
  ): void => {
    const mesh = box(width, height, depth, color);
    mesh.position.set(x, y, z);
    group.add(mesh);
  };

  // Боковая наружная стена: закрывает левый край фона.
  addBox(0.08, 2.6, 1.2, '#c9c1b3', -1.62, 1.3, 4.3);

  // Тротуар у фасада, дорога и подход к двери.
  addBox(4.8, 0.04, 0.36, '#d7d2c5', -0.35, 0.02, 4.1);
  addBox(4.8, 0.06, 0.04, '#b1aa9d', -0.35, 0.03, 4.3);
  addBox(4.8, 0.03, 0.48, '#5d6671', -0.35, 0.015, 4.56);
  addBox(1.1, 0.04, 0.82, '#d7d2c5', 1.8, 0.025, 4.03);
  for (const x of [-2.4, -1.6, -0.8, 0.0, 0.8, 1.6]) {
    addBox(0.24, 0.012, 0.04, '#f2e3b0', x, 0.04, 4.56);
  }

  const bushMaterial = new THREE.MeshLambertMaterial({ color: '#5f9b63' });
  const bushTopMaterial = new THREE.MeshLambertMaterial({ color: '#75ad72' });

  const addBush = (x: number, z: number, scale: number, phase: number): void => {
    const bush = new THREE.Group();
    bush.position.set(x, 0.02, z);
    bush.userData.phase = phase;

    const crown = sphere(0.3 * scale, '#5f9b63');
    crown.position.set(0, 0.28 * scale, 0);
    crown.scale.set(0.3 * scale, 0.24 * scale, 0.3 * scale);
    crown.material = bushMaterial;
    bush.add(crown);

    const top = sphere(0.2 * scale, '#75ad72');
    top.position.set(0.06 * scale, 0.44 * scale, -0.02 * scale);
    top.material = bushTopMaterial;
    bush.add(top);

    bushes.push(bush);
    group.add(bush);
  };

  addBush(-1.4, 4.72, 1.0, 0.2);
  addBush(0.55, 4.72, 0.85, 1.4);
  // Куст у входа: виден через дверной проём и не мешает маршруту клиентов.
  addBush(1.35, 4.86, 1.0, 2.6);

  const coloredParts = group.children.filter(
    (child): child is THREE.Mesh => child instanceof THREE.Mesh,
  );
  const courtyardMaterial = new THREE.MeshLambertMaterial({
    vertexColors: true,
    color: '#ffffff',
  });
  mergeStaticMeshesToVertexColor(coloredParts, group, courtyardMaterial);

  const backdropTextures: Record<WindowPhase, THREE.CanvasTexture> = {
    1: makeCourtyardBackdrop(1),
    2: makeCourtyardBackdrop(2),
    3: makeCourtyardBackdrop(3),
  };
  const backdropMaterial = new THREE.MeshBasicMaterial({
    map: backdropTextures[1],
  });
  const backdrop = new THREE.Mesh(
    // Панорама шире проёма: закрывает и окно, и вид через входную дверь.
    new THREE.PlaneGeometry(4.1, 1.85),
    backdropMaterial,
  );
  backdrop.position.set(-0.2, 0.925, 4.9);
  backdrop.rotation.y = Math.PI;
  group.add(backdrop);

  scene.add(group);

  const tints: Record<WindowPhase, string> = {
    1: '#fff0dc',
    2: '#ffffff',
    3: '#ffc196',
  };
  const bushTints: Record<WindowPhase, { main: string; top: string }> = {
    1: { main: '#6fae72', top: '#86c182' },
    2: { main: '#5f9b63', top: '#75ad72' },
    3: { main: '#4f7a5a', top: '#5f8b68' },
  };

  const setPhase = (phase: WindowPhase): void => {
    backdropMaterial.map = backdropTextures[phase];
    backdropMaterial.needsUpdate = true;
    courtyardMaterial.color.set(tints[phase]);
    bushMaterial.color.set(bushTints[phase].main);
    bushTopMaterial.color.set(bushTints[phase].top);
  };
  setPhase(1);

  const update = (time: number): void => {
    for (const bush of bushes) {
      const phase = Number(bush.userData.phase ?? 0);
      bush.rotation.z = Math.sin(time * 1.6 + phase) * 0.025;
      bush.rotation.x = Math.cos(time * 1.25 + phase) * 0.016;
    }
  };

  return { setPhase, update };
}

function createWindow(scene: THREE.Scene): WindowVisual {
  const courtyard = createCourtyard(scene);
  const group = new THREE.Group();
  group.position.set(-0.1, 1.91, 3.7);
  group.rotation.y = Math.PI;

  const glassMaterial = new THREE.MeshBasicMaterial({
    color: '#e8f4ff',
    transparent: true,
    opacity: 0.06,
    depthWrite: false,
  });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.34), glassMaterial);
  group.add(glass);

  for (const y of [-0.72, 0.72]) {
    const bar = box(2.65, 0.08, 0.08, WOOD);
    bar.position.set(0, y, 0.04);
    group.add(bar);
  }
  for (const x of [-1.3, 1.3]) {
    const bar = box(0.08, 1.46, 0.08, WOOD);
    bar.position.set(x, 0, 0.04);
    group.add(bar);
  }
  const centerBar = box(0.05, 1.4, 0.06, WOOD);
  centerBar.position.set(0, 0, 0.04);
  group.add(centerBar);

  const opaque = group.children.filter(
    (child): child is THREE.Mesh =>
      child instanceof THREE.Mesh &&
      !(child.material as THREE.Material).transparent &&
      !(child.material as THREE.MeshBasicMaterial).map,
  );
  mergeStaticMeshesToVertexColor(opaque, group, VERTEX_COLOR_MATERIAL);
  scene.add(group);

  const light = new THREE.PointLight(0xffd9a8, 0.18, 4.2, 2);
  light.position.set(-0.1, 1.9, 3.12);
  scene.add(light);

  const lightSettings: Record<WindowPhase, { color: string; intensity: number }> = {
    1: { color: '#ffd2a0', intensity: 0.26 },
    2: { color: '#fff4d6', intensity: 0.42 },
    3: { color: '#ff8f5e', intensity: 0.34 },
  };
  const glassTints: Record<WindowPhase, string> = {
    1: '#e8f4ff',
    2: '#eefaff',
    3: '#ffe3cf',
  };

  const setPhase = (phase: WindowPhase): void => {
    courtyard.setPhase(phase);
    glassMaterial.color.set(glassTints[phase]);
    light.color.set(lightSettings[phase].color);
    light.intensity = lightSettings[phase].intensity;
  };
  setPhase(1);

  return { setPhase, update: courtyard.update };
}

function createWalls(scene: THREE.Scene): {
  clock: THREE.Mesh;
  clockSecondHand: THREE.Object3D;
  pvzSign: THREE.Mesh;
  walls: THREE.Mesh[];
} {
  const wallMeshes: THREE.Mesh[] = [];
  const addWall = (w: number, h: number, d: number, x: number, y: number, z: number): void => {
    // Soft baked bounce falloff at the foot of the wall, without a screen-space pass.
    const geometry = new THREE.BoxGeometry(w, h, d, Math.max(1, Math.ceil(w / 0.35)), 12, Math.max(1, Math.ceil(d / 0.35)));
    const positions = geometry.getAttribute('position');
    const colors = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i++) {
      const worldY = positions.getY(i) + y;
      const corner = w < 0.3 && d > 1
        ? 0.1 * Math.exp(-Math.abs(positions.getZ(i) + z - 3.6) * 2.5) : 0;
      const shade = (1 - 0.25 * Math.exp(-Math.max(0, worldY) * 2.4)) * (1 - corner);
      colors.set([shade, shade * 0.99, shade * 0.975], i * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: PALETTE.wall, vertexColors: true }));
    mesh.position.set(x, y, z);
    scene.add(mesh);
    wallMeshes.push(mesh);
  };

  // Клиентская зона: фронтальная стена с проёмом под окно.
  addWall(0.34, 3.2, 0.2, -1.63, 1.6, 3.7);
  addWall(0.14, 3.2, 0.2, 1.33, 1.6, 3.7);
  addWall(2.72, 0.54, 0.2, -0.1, 2.93, 3.7);
  addWall(2.72, 1.16, 0.2, -0.1, 0.58, 3.7);
  addWall(0.2, 3.2, 0.2, 2.3, 1.6, 3.7);
  addWall(0.8, 0.6, 0.2, 1.8, 2.9, 3.7);

  // Откосы проёма и подоконник: дают окну толщину и мягкую тень.
  const revealColor = '#b9b1a4';
  const revealLeft = box(0.035, 1.5, 0.24, revealColor);
  revealLeft.position.set(-1.4425, 1.91, 3.7);
  scene.add(revealLeft);
  const revealRight = box(0.035, 1.5, 0.24, revealColor);
  revealRight.position.set(1.2425, 1.91, 3.7);
  scene.add(revealRight);
  const revealTop = box(2.72, 0.035, 0.24, revealColor);
  revealTop.position.set(-0.1, 2.6425, 3.7);
  scene.add(revealTop);
  const windowSill = box(2.8, 0.08, 0.34, WOOD);
  windowSill.position.set(-0.1, 1.15, 3.63);
  scene.add(windowSill);

  // Восточное расширение зала: теперь оно общее для клиентской зоны,
  // зоны сотрудника и примерочных.
  addWall(2.7, 3.2, 0.2, 3.75, 1.6, 3.7);
  addWall(0.2, 3.2, 5.6, 5.0, 1.6, 0.8);

  // Западная и северная стены склада.
  const sw = STORAGE.maxX - STORAGE.minX;
  const sd = STORAGE.maxZ - STORAGE.minZ;
  const sx = (STORAGE.minX + STORAGE.maxX) / 2;
  const sz = (STORAGE.minZ + STORAGE.maxZ) / 2;
  addWall(0.2, 3.2, sd - 0.1, STORAGE.minX, 1.6, sz - 0.05);
  addWall(sw, 3.2, 0.2, sx - 0.1, 1.6, STORAGE.maxZ);

  // Западная стена клиентской зоны (внешний угол).
  addWall(0.2, 3.2, 3.05, -1.7, 1.6, 2.075);

  // Wider open portal, derived from the same bounds as navigation.
  const doorStart = STORAGE_DOOR.z - STORAGE_DOOR.width / 2;
  const doorEnd = STORAGE_DOOR.z + STORAGE_DOOR.width / 2;
  addWall(0.2, 3.2, doorStart - STORAGE.minZ, -1.7, 1.6, (doorStart + STORAGE.minZ) / 2);
  addWall(0.2, 3.2, STORAGE.maxZ - doorEnd, -1.7, 1.6, (doorEnd + STORAGE.maxZ) / 2);
  addWall(0.2, 0.7, STORAGE_DOOR.width, -1.7, 2.85, STORAGE_DOOR.z);

  // Плинтусы.
  const base1 = box(3.0, 0.16, 0.05, WALL_TRIM);
  base1.position.set(-0.1, 0.08, 3.595);
  scene.add(base1);
  const base6 = box(2.6, 0.16, 0.05, WALL_TRIM);
  base6.position.set(3.7, 0.08, 3.595);
  scene.add(base6);
  const base7 = box(0.05, 0.16, 5.7, WALL_TRIM);
  base7.position.set(4.895, 0.08, 0.85);
  scene.add(base7);
  const base3 = box(0.05, 0.16, 3.05, WALL_TRIM);
  base3.position.set(-1.595, 0.08, 2.075);
  scene.add(base3);
  const base4 = box(sw, 0.16, 0.05, WALL_TRIM);
  base4.position.set(sx, 0.08, 0.545);
  scene.add(base4);
  const base5 = box(0.05, 0.16, sd, WALL_TRIM);
  base5.position.set(STORAGE.minX + 0.105, 0.08, sz);
  scene.add(base5);

  // Дверные рамы.
  const dark = '#2f3d4c';
  const frameFrontL = box(0.08, 2.6, 0.1, dark);
  frameFrontL.position.set(1.4, 1.3, 3.58);
  scene.add(frameFrontL);
  const frameFrontR = frameFrontL.clone();
  frameFrontR.position.x = 2.2;
  scene.add(frameFrontR);
  const frameFrontTop = box(0.8, 0.1, 0.1, dark);
  frameFrontTop.position.set(1.8, 2.6, 3.58);
  scene.add(frameFrontTop);

  const frameStoreS = box(0.1, 2.5, 0.08, dark);
  frameStoreS.position.set(-1.59, 1.25, doorStart);
  scene.add(frameStoreS);
  const frameStoreN = frameStoreS.clone();
  frameStoreN.position.z = doorEnd;
  scene.add(frameStoreN);
  const frameStoreTop = box(0.1, 0.1, STORAGE_DOOR.width, dark);
  frameStoreTop.position.set(-1.59, 2.5, STORAGE_DOOR.z);
  scene.add(frameStoreTop);

  const posterA = signPlane('ПВЗ', 1.1, 0.42, {
    bg: CREAM,
    color: BLUE,
    fontSize: 64,
    subtext: 'ПУНКТ ВЫДАЧИ',
    border: BLUE,
  });
  posterA.rotation.y = Math.PI;
  posterA.position.set(-0.1, 2.86, 3.585);
  scene.add(posterA);

  const storageSign = signPlane('СКЛАД', 1.35, 0.4, {
    bg: CREAM,
    color: '#2f3d4c',
    fontSize: 64,
    border: '#596b80',
  });
  storageSign.rotation.y = Math.PI;
  storageSign.position.set(-5.1, 2.9, 0.545);
  scene.add(storageSign);

  const clockTexture = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = CREAM;
      ctx.beginPath();
      ctx.arc(128, 128, 118, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 10;
      ctx.stroke();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(128 + Math.cos(a) * 92, 128 + Math.sin(a) * 92);
        ctx.lineTo(128 + Math.cos(a) * 104, 128 + Math.sin(a) * 104);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 6;
        ctx.stroke();
      }
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(128, 128, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  })();

  const clockGroup = new THREE.Group();
  clockGroup.position.set(-1.585, 2.32, 2.45);
  clockGroup.rotation.y = Math.PI / 2;

  const clockRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.37, 0.035, 6, 24),
    new THREE.MeshLambertMaterial({ color: WOOD, flatShading: true }),
  );
  clockGroup.add(clockRim);

  const clock = new THREE.Mesh(
    new THREE.CircleGeometry(0.35, 28),
    new THREE.MeshBasicMaterial({ map: clockTexture, transparent: true }),
  );
  clock.position.z = 0.01;
  clockGroup.add(clock);

  const handMaterial = new THREE.MeshBasicMaterial({ color: INK });
  const hourPivot = new THREE.Group();
  hourPivot.position.z = 0.025;
  hourPivot.rotation.z = -Math.PI * 0.4;
  const hourHand = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.012), handMaterial);
  hourHand.position.y = 0.08;
  hourPivot.add(hourHand);
  clockGroup.add(hourPivot);

  const minutePivot = new THREE.Group();
  minutePivot.position.z = 0.03;
  minutePivot.rotation.z = -Math.PI * 0.15;
  const minuteHand = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.24, 0.012), handMaterial);
  minuteHand.position.y = 0.12;
  minutePivot.add(minuteHand);
  clockGroup.add(minutePivot);

  const secondPivot = new THREE.Group();
  secondPivot.position.z = 0.035;
  secondPivot.rotation.z = -Math.PI * 0.7;
  const secondHand = new THREE.Mesh(
    new THREE.BoxGeometry(0.012, 0.27, 0.01),
    new THREE.MeshBasicMaterial({ color: '#d9776a' }),
  );
  secondHand.position.y = 0.135;
  secondPivot.add(secondHand);
  clockGroup.add(secondPivot);

  scene.add(clockGroup);

  return {
    clock,
    clockSecondHand: secondPivot,
    pvzSign: posterA,
    walls: wallMeshes,
  };
}

function makeGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
    gradient.addColorStop(0, 'rgba(255, 245, 210, 0.95)');
    gradient.addColorStop(0.35, 'rgba(255, 220, 150, 0.45)');
    gradient.addColorStop(1, 'rgba(255, 210, 130, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createLamps(scene: THREE.Scene): void {
  const glowTexture = makeGlowTexture();
  // Two small warm pendants in the customer zone; no extra runtime lights.
  for (const x of [-0.45, 1.25]) {
    const group = new THREE.Group();
    group.name = 'customer-pendant';
    group.position.set(x, 0, 2.35);
    const cord = cylinder(0.013, 0.013, 0.72, INK, 6);
    cord.position.y = 2.96;
    group.add(cord);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.29, 0.26, 12), new THREE.MeshLambertMaterial({ color: '#344047' }));
    shade.position.y = 2.47;
    group.add(shade);
    const bulb = new THREE.Mesh(new THREE.CircleGeometry(0.24, 12), new THREE.MeshBasicMaterial({ color: '#ffe2aa', side: THREE.DoubleSide }));
    bulb.rotation.x = -Math.PI / 2;
    bulb.position.y = 2.335;
    group.add(bulb);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), new THREE.MeshBasicMaterial({
      map: glowTexture, color: '#ffe0ad', transparent: true, opacity: 0.1, depthWrite: false,
    }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.04;
    pool.raycast = () => {};
    group.add(pool);
    mergeStaticMeshesToVertexColor([cord, shade], group, VERTEX_COLOR_MATERIAL);
    scene.add(group);
  }
  // Shallow wall bars and a subtle baked wash above A/B, no shadow maps.
  for (const x of [-3.8, -6.45]) {
    const group = new THREE.Group();
    group.name = 'storage-wall-light';
    group.position.set(x, 2.57, 0.43);
    const housing = roundedBox(1.18, 0.095, 0.14, INK, { radius: 0.02 });
    group.add(housing);
    const diffuser = new THREE.Mesh(new THREE.PlaneGeometry(1.08, 0.055), new THREE.MeshBasicMaterial({ color: '#ffe5b6' }));
    diffuser.position.set(0, -0.055, -0.075);
    diffuser.rotation.set(Math.PI * 0.18, Math.PI, 0);
    group.add(diffuser);
    const wash = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 0.8), new THREE.MeshBasicMaterial({
      map: glowTexture, color: '#ffd6a0', transparent: true, opacity: 0.2, depthWrite: false,
    }));
    wash.rotation.y = Math.PI;
    wash.position.set(0, -0.12, 0.1);
    wash.raycast = () => {};
    group.add(wash);
    scene.add(group);
  }
}

function createFittingRooms(scene: THREE.Scene): void {
  const cabin = new THREE.Group();
  cabin.name = 'fitting-room';
  cabin.position.set(3.55, 0, 2.95);
  cabin.rotation.y = -Math.PI / 2;
  const add = (w: number, h: number, d: number, color: string, x: number, y: number, z: number): THREE.Mesh => {
    const mesh = roundedBox(w, h, d, color, { radius: 0.018 });
    mesh.position.set(x, y, z); cabin.add(mesh); return mesh;
  };
  add(0.08, 2.25, 1.95, '#c5baa7', 0.62, 1.125, 0);
  for (const side of [-1, 1]) {
    add(1.3, 2.25, 0.07, '#c5baa7', 0, 1.125, side * 0.95);
    add(0.07, 2.25, 0.09, INK, -0.64, 1.125, side * 0.95);
  }
  add(1.42, 0.12, 2.06, '#344651', 0, 2.3, 0);
  add(0.05, 0.05, 1.94, '#d5cfc1', -0.65, 2.13, 0);
  // Shared folded curtain geometry: broad, soft folds rather than flat panels.
  const geometry = new THREE.BoxGeometry(0.035, 1.88, 0.69, 1, 1, 24);
  const positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    const z = positions.getZ(i);
    positions.setX(i, positions.getX(i) + Math.cos((z + 0.345) / 0.69 * Math.PI * 8) * 0.045);
  }
  geometry.computeVertexNormals();
  for (const side of [-1, 1]) {
    const curtain = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: '#a9adb2' }));
    curtain.position.set(-0.65, 1.13, side * 0.59);
    cabin.add(curtain);
    for (let i = 0; i < 5; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.009, 4, 8), new THREE.MeshLambertMaterial({ color: '#ded7c6' }));
      ring.rotation.y = Math.PI / 2;
      ring.position.set(-0.65, 2.13, side * 0.59 - 0.29 + i * 0.145);
      cabin.add(ring);
    }
  }
  // Warm framed mirror inside the opening; no stool in front of the cabin.
  add(0.04, 1.44, 0.5, '#9f764b', 0.56, 1.35, 0);
  add(0.025, 1.34, 0.42, '#f5db9a', 0.53, 1.35, 0);
  add(0.025, 1.22, 0.31, '#b5cbca', 0.51, 1.35, 0);
  mergeStaticMeshesToVertexColor(cabin.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh), cabin, VERTEX_COLOR_MATERIAL);
  scene.add(cabin);
  const sign = signPlane('ПРИМЕРОЧНАЯ', 2.15, 0.43, { bg: CREAM, color: INK, fontSize: 50, border: '#8b735a' });
  sign.rotation.y = Math.PI;
  sign.position.set(3.55, 2.73, 3.585);
  scene.add(sign);
  createPlant(scene, 4.65, 0.95, 0.55);
}

/** Вторая версия комнаты: L-образное помещение и статичная камера. */
export function createEnvironment(scene: THREE.Scene): EnvironmentVisuals {
  const floors = createFloor(scene);
  const walls = createWalls(scene);
  const clientRug = createRug(scene);
  const neon = createNeonSign(scene);
  createEntranceMat(scene);
  const windowVisual = createWindow(scene);
  createLamps(scene);
  createFittingRooms(scene);
  createPlant(scene, 2.15, 3.25, 0.85);


  const protectedObjects = new Set<THREE.Object3D>([
    ...walls.walls,
    walls.clock,
    walls.pvzSign,
    clientRug,
    ...floors,
  ]);
  const staticSceneMeshes = scene.children.filter(
    (child): child is THREE.Mesh =>
      child instanceof THREE.Mesh &&
      !protectedObjects.has(child) &&
      Object.keys(child.userData).length === 0,
  );
  const opaqueSceneMeshes = staticSceneMeshes.filter((mesh) => {
    const material = mesh.material as THREE.MeshLambertMaterial & {
      map?: THREE.Texture | null;
    };
    return !material.transparent && !material.map && material.opacity >= 1;
  });
  const otherSceneMeshes = staticSceneMeshes.filter(
    (mesh) => !opaqueSceneMeshes.includes(mesh),
  );
  mergeStaticMeshesToVertexColor(opaqueSceneMeshes, scene, VERTEX_COLOR_MATERIAL);
  mergeStaticMeshes(otherSceneMeshes, scene);

  return {
    clock: walls.clock,
    clockSecondHand: walls.clockSecondHand,
    pvzSign: walls.pvzSign,
    clientRug,
    walls: walls.walls,
    floors,
    neonSign: neon.group,
    neonGlowMaterial: neon.glowMaterial,
    window: windowVisual,
  };
}
