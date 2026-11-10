import * as THREE from 'three';
import { PALETTE, ROOM } from '../data';
import { createPlant } from './props';
import {
  box,
  cone,
  contactShadow,
  cylinder,
  makeTextTexture,
  signPlane,
  sphere,
} from './primitives';
import {
  mergeStaticMeshes,
  mergeStaticMeshesToVertexColor,
  roundedBox,
  VERTEX_COLOR_MATERIAL,
} from './kit';

const INK = '#26313a';
const CREAM = '#fff4e3';
const BLUE = '#6f9fc4';
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

function makeRugTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#e8f0e8';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#b7c9c0';
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, 236, 236);
    ctx.lineWidth = 3;
    ctx.strokeRect(28, 28, 200, 200);
    ctx.beginPath();
    ctx.moveTo(128, 38);
    ctx.lineTo(218, 128);
    ctx.lineTo(128, 218);
    ctx.lineTo(38, 128);
    ctx.closePath();
    ctx.stroke();
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 8; i++) {
      const y = 44 + i * 24;
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(216, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
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

  const storageBase = box(6.5, 0.22, 2.25, '#918c80');
  storageBase.position.set(-4.85, -0.11, -0.475);
  storageBase.raycast = () => {};
  scene.add(storageBase);

  const rightTexture = makeTileTexture(PALETTE.floor, 'rgba(150, 128, 96, 0.32)', 6, 5);
  const rightFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(6.6, 5.6),
    new THREE.MeshLambertMaterial({ map: rightTexture }),
  );
  rightFloor.rotation.x = -Math.PI / 2;
  rightFloor.position.set(1.65, 0.002, 0.85);
  rightFloor.userData = { type: 'floor' };
  scene.add(rightFloor);

  const storageTexture = makeTileTexture(PALETTE.storageFloor, 'rgba(120, 116, 106, 0.38)', 6, 2);
  const storageFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(6.4, 2.15),
    new THREE.MeshLambertMaterial({ map: storageTexture }),
  );
  storageFloor.rotation.x = -Math.PI / 2;
  storageFloor.position.set(-4.85, 0.002, -0.475);
  storageFloor.userData = { type: 'floor' };
  scene.add(storageFloor);

  const border1 = box(6.75, 0.1, 0.12, '#7d6d55');
  border1.position.set(1.65, 0.035, -2.04);
  border1.raycast = () => {};
  scene.add(border1);
  const border2 = box(6.55, 0.1, 0.12, '#706b62');
  border2.position.set(-4.85, 0.035, -1.64);
  border2.raycast = () => {};
  scene.add(border2);
  const border3 = box(0.12, 0.1, 5.7, '#7d6d55');
  border3.position.set(4.99, 0.035, 0.85);
  border3.raycast = () => {};
  scene.add(border3);
  const border4 = box(0.12, 0.1, 2.25, '#706b62');
  border4.position.set(-8.14, 0.035, -0.475);
  border4.raycast = () => {};
  scene.add(border4);

  return [rightFloor, storageFloor];
}

function createRug(scene: THREE.Scene): THREE.Mesh {
  const rugBorder = box(2.86, 0.012, 2.5, '#d8cdbd');
  rugBorder.position.set(0.4, 0.003, 2.15);
  rugBorder.raycast = () => {};
  scene.add(rugBorder);

  const rug = new THREE.Mesh(
    new THREE.BoxGeometry(2.7, 0.018, 2.35),
    new THREE.MeshLambertMaterial({ map: makeRugTexture() }),
  );
  rug.position.set(0.4, 0.008, 2.15);
  rug.userData = { type: 'floor' };
  scene.add(rug);

  const stripe1 = box(2.45, 0.02, 0.14, '#e8f0e8');
  stripe1.position.set(0.4, 0.014, 1.25);
  stripe1.raycast = () => {};
  scene.add(stripe1);
  const stripe2 = stripe1.clone();
  stripe2.position.z = 3.05;
  scene.add(stripe2);

  const staffMat = box(4.8, 0.018, 1.75, '#7b8f7f');
  staffMat.position.set(1.3, 0.01, -0.62);
  staffMat.userData = { type: 'floor' };
  scene.add(staffMat);
  const matBorder = box(4.9, 0.014, 1.85, '#5f7265');
  matBorder.position.set(1.3, 0.006, -0.62);
  matBorder.raycast = () => {};
  scene.add(matBorder);

  const storageMat = box(6.25, 0.012, 1.9, '#aeb4a8');
  storageMat.position.set(-4.85, 0.007, -0.47);
  storageMat.userData = { type: 'floor' };
  scene.add(storageMat);

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

function createQueueLine(scene: THREE.Scene): void {
  for (let index = 0; index < 9; index++) {
    const dash = box(0.055, 0.012, 0.22, '#f0b44c');
    dash.position.set(0.85, 0.02, 0.9 + index * 0.3);
    dash.raycast = () => {};
    scene.add(dash);
  }
}

function createStorageProps(scene: THREE.Scene): void {
  const addFloorBox = (
    x: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    color: string,
    rotation = 0,
    baseY = 0,
  ): void => {
    const parcel = roundedBox(width, height, depth, color, { radius: 0.035 });
    parcel.position.set(x, baseY + height / 2 + 0.01, z);
    parcel.rotation.y = rotation;
    scene.add(parcel);

    const tape = box(width * 0.22, 0.012, depth * 0.82, CREAM);
    tape.position.set(x, baseY + height + 0.02, z);
    tape.rotation.y = rotation;
    tape.raycast = () => {};
    scene.add(tape);
  };

  const addBasket = (x: number, z: number): void => {
    const basket = new THREE.Group();
    basket.position.set(x, 0, z);
    const wire = '#6f8f7a';
    const metal = '#2f3d4c';

    for (const [wx, wz] of [
      [-0.26, -0.17],
      [0.26, -0.17],
      [-0.26, 0.17],
      [0.26, 0.17],
    ] as const) {
      const wheel = cylinder(0.06, 0.06, 0.05, metal, 8);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(wx, 0.07, wz);
      basket.add(wheel);
    }

    const base = box(0.72, 0.04, 0.54, wire);
    base.position.y = 0.12;
    basket.add(base);

    for (const [px, pz] of [
      [-0.32, -0.22],
      [0.32, -0.22],
      [-0.32, 0.22],
      [0.32, 0.22],
    ] as const) {
      const post = box(0.035, 0.5, 0.035, wire);
      post.position.set(px, 0.39, pz);
      basket.add(post);
    }

    for (const y of [0.24, 0.36]) {
      const front = box(0.68, 0.024, 0.024, wire);
      front.position.set(0, y, -0.22);
      basket.add(front);
      const back = front.clone();
      back.position.z = 0.22;
      basket.add(back);
      const left = box(0.024, 0.024, 0.48, wire);
      left.position.set(-0.32, y, 0);
      basket.add(left);
      const right = left.clone();
      right.position.x = 0.32;
      basket.add(right);
    }

    for (const x of [-0.24, -0.08, 0.08, 0.24]) {
      const frontWire = box(0.018, 0.5, 0.018, wire);
      frontWire.position.set(x, 0.39, -0.22);
      basket.add(frontWire);
      const backWire = frontWire.clone();
      backWire.position.z = 0.22;
      basket.add(backWire);
    }
    for (const z of [-0.14, 0, 0.14]) {
      const leftWire = box(0.018, 0.5, 0.018, wire);
      leftWire.position.set(-0.32, 0.39, z);
      basket.add(leftWire);
      const rightWire = leftWire.clone();
      rightWire.position.x = 0.32;
      basket.add(rightWire);
    }

    const rimFront = box(0.72, 0.04, 0.04, wire);
    rimFront.position.set(0, 0.64, -0.22);
    basket.add(rimFront);
    const rimBack = rimFront.clone();
    rimBack.position.z = 0.22;
    basket.add(rimBack);
    const rimLeft = box(0.04, 0.04, 0.48, wire);
    rimLeft.position.set(-0.32, 0.64, 0);
    basket.add(rimLeft);
    const rimRight = rimLeft.clone();
    rimRight.position.x = 0.32;
    basket.add(rimRight);

    for (const side of [-1, 1]) {
      const handlePost = box(0.035, 0.34, 0.035, wire);
      handlePost.position.set(side * 0.24, 0.79, 0.22);
      basket.add(handlePost);
    }
    const handle = box(0.55, 0.04, 0.04, wire);
    handle.position.set(0, 0.96, 0.22);
    basket.add(handle);

    const parcelColors = ['#d98b72', '#8fae9b', '#e0a36f'];
    const parcels: Array<[number, number, number, number, number, number]> = [
      [-0.15, 0.27, 0.0, 0.38, 0.28, 0.32],
      [0.17, 0.27, 0.05, 0.3, 0.24, 0.3],
      [0.0, 0.52, -0.02, 0.3, 0.22, 0.28],
    ];
    parcels.forEach(([px, py, pz, w, h, d], index) => {
      const parcel = roundedBox(w, h, d, parcelColors[index % parcelColors.length], {
        radius: 0.03,
      });
      parcel.position.set(px, py, pz);
      parcel.rotation.y = index * 0.12;
      basket.add(parcel);
      const tape = box(w * 0.24, 0.012, d * 0.82, CREAM);
      tape.position.set(px, py + h / 2 + 0.005, pz);
      basket.add(tape);
    });

    mergeStaticMeshesToVertexColor(
      basket.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh),
      basket,
      VERTEX_COLOR_MATERIAL,
    );
    scene.add(basket);
  };

  addBasket(-2.18, 0.05);
  addFloorBox(-2.9, -0.5, 0.42, 0.3, 0.38, '#d98b72', 0.08);
  addFloorBox(-2.9, -0.48, 0.34, 0.24, 0.32, '#8fae9b', -0.12, 0.3);
  addFloorBox(-3.35, -0.55, 0.36, 0.26, 0.34, '#e0a36f', 0.18);
}

function createWalls(scene: THREE.Scene): {
  clock: THREE.Mesh;
  clockSecondHand: THREE.Object3D;
  pvzSign: THREE.Mesh;
  walls: THREE.Mesh[];
} {
  const wallMeshes: THREE.Mesh[] = [];
  const addWall = (w: number, h: number, d: number, x: number, y: number, z: number): void => {
    const mesh = box(w, h, d, PALETTE.wall);
    mesh.position.set(x, y, z);
    scene.add(mesh);
    wallMeshes.push(mesh);
  };

  // Клиентская зона: фронтальная стена с проёмом под окно.
  addWall(0.14, 3.2, 0.2, -1.53, 1.6, 3.7);
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
  addWall(2.6, 3.2, 0.2, 3.7, 1.6, 3.7);
  addWall(0.2, 3.2, 5.7, 5.0, 1.6, 0.85);

  // Западная и северная стены склада.
  addWall(0.2, 3.2, 2.05, -8.1, 1.6, -0.475);
  addWall(6.4, 3.2, 0.2, -4.8, 1.6, 0.65);

  // Западная стена клиентской зоны (внешний угол).
  addWall(0.2, 3.2, 3.05, -1.7, 1.6, 2.075);

  // Перегородка между нашей зоной и складом с дверью 1,2 м.
  addWall(0.2, 3.2, 0.3, -1.7, 1.6, -1.35);
  addWall(0.2, 3.2, 0.55, -1.7, 1.6, 0.275);
  addWall(0.2, 0.7, 1.2, -1.7, 2.85, -0.6);

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
  const base4 = box(6.4, 0.16, 0.05, WALL_TRIM);
  base4.position.set(-4.8, 0.08, 0.545);
  scene.add(base4);
  const base5 = box(0.05, 0.16, 2.05, WALL_TRIM);
  base5.position.set(-7.995, 0.08, -0.475);
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
  frameStoreS.position.set(-1.59, 1.25, -1.2);
  scene.add(frameStoreS);
  const frameStoreN = frameStoreS.clone();
  frameStoreN.position.z = 0.0;
  scene.add(frameStoreN);
  const frameStoreTop = box(0.1, 0.1, 1.2, dark);
  frameStoreTop.position.set(-1.59, 2.5, -0.6);
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
  storageSign.position.set(-5.1, 2.72, 0.545);
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
  const lampPositions: Array<[number, number, number]> = [
    [0.4, 1.6, 1.0],
    [-4.3, -0.35, 0.9],
  ];
  const glowTexture = makeGlowTexture();

  for (const [x, z, scale] of lampPositions) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.scale.setScalar(scale);
    const cord = cylinder(0.02, 0.02, 0.7, '#2b3440', 6);
    cord.position.set(0, 2.95, 0);
    group.add(cord);
    const shade = cone(0.34, 0.32, '#3a4a5c', 10);
    shade.position.set(0, 2.5, 0);
    shade.rotation.x = Math.PI;
    group.add(shade);
    const bulb = sphere(0.1, '#ffd98a');
    bulb.position.set(0, 2.36, 0);
    group.add(bulb);

    const light = new THREE.PointLight(0xffd9a8, 0.22, 6, 2);
    light.position.set(0, 2.3, 0);
    group.add(light);

    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture,
        color: '#ffe4b8',
        transparent: true,
        opacity: 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    glow.position.set(0, 2.38, 0);
    glow.scale.set(0.9, 0.9, 1);
    group.add(glow);

    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(0.82, 24),
      new THREE.MeshBasicMaterial({
        color: '#ffe4b8',
        transparent: true,
        opacity: 0.08,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.02;
    pool.raycast = () => {};
    group.add(pool);

    mergeStaticMeshesToVertexColor(
      group.children.filter(
        (child): child is THREE.Mesh =>
          child instanceof THREE.Mesh && !(child.material as THREE.Material).transparent,
      ),
      group,
      VERTEX_COLOR_MATERIAL,
    );
    scene.add(group);
  }
}

function createFittingRooms(scene: THREE.Scene): void {
  const frame = '#7b8b9d';
  const curtain = '#b9c6d4';

  for (const x of [3.15, 4.35]) {
    const cabin = new THREE.Group();
    cabin.position.set(x, 0, 2.95);
    cabin.rotation.y = -Math.PI / 2;

    const back = box(0.08, 2.3, 1.2, frame);
    back.position.set(0.62, 1.15, 0);
    cabin.add(back);

    for (const side of [-1, 1]) {
      const panel = box(1.3, 2.3, 0.08, frame);
      panel.position.set(0, 1.15, side * 0.6);
      cabin.add(panel);
    }

    const top = box(1.38, 0.1, 1.32, '#4a5b6d');
    top.position.set(0, 2.3, 0);
    cabin.add(top);

    const rod = box(0.05, 0.05, 1.18, '#2f3d4c');
    rod.position.set(-0.66, 2.12, 0);
    cabin.add(rod);

    for (const side of [-1, 1]) {
      const panel = box(0.04, 1.9, 0.42, curtain);
      panel.position.set(-0.65, 1.07, side * 0.41);
      cabin.add(panel);
    }

    const bench = box(0.68, 0.1, 0.82, '#8b6f52');
    bench.position.set(0.2, 0.48, 0);
    cabin.add(bench);

    const mirrorFrame = box(0.035, 1.15, 0.76, WOOD_DARK);
    mirrorFrame.position.set(0.58, 1.25, 0);
    cabin.add(mirrorFrame);

    const mirror = box(0.02, 1.0, 0.62, '#cfe8f5');
    mirror.position.set(0.55, 1.25, 0);
    cabin.add(mirror);

    const hook = box(0.06, 0.06, 0.14, WOOD);
    hook.position.set(0.56, 1.8, 0.42);
    cabin.add(hook);

    mergeStaticMeshesToVertexColor(
      cabin.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh),
      cabin,
      VERTEX_COLOR_MATERIAL,
    );
    scene.add(cabin);
  }

  const fittingSign = signPlane('ПРИМЕРОЧНЫЕ', 2.2, 0.5, {
    bg: CREAM,
    color: INK,
    fontSize: 54,
    border: '#596b80',
  });
  fittingSign.rotation.y = Math.PI;
  fittingSign.position.set(3.75, 2.72, 3.585);
  scene.add(fittingSign);
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
  createQueueLine(scene);
  createStorageProps(scene);
  createLamps(scene);
  createFittingRooms(scene);
  createPlant(scene, 2.15, 3.25, 0.85);
  createPlant(scene, -7.05, -1.3, 0.8);

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
