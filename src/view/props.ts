import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import {
  CELL_H,
  COUNTER,
  LEVELS,
  PALETTE,
  PARCEL_COLORS,
  SHELF_D,
  SHELF_DEFS,
  SHELF_H,
  SHELF_LETTERS,
  SHELF_POINTS,
  STAFF_SHELF,
  TOY,
  TV,
  cellId,
  randInt,
  shelfWidth,
} from '../data';
import {
  KIT_COLORS,
  kitMaterial,
  kitPanel,
  mergeStaticMeshesToVertexColor,
  roundedBox,
  VERTEX_COLOR_MATERIAL,
} from './kit';
import {
  box,
  cone,
  contactShadow,
  createParcelGeometry,
  cylinder,
  makeTextTexture,
  PARCEL_VERTEX_MATERIAL,
  signPlane,
  sphere,
  UNIT_BOX,
  UNIT_SPHERE,
  woodTexture,
} from './primitives';

export interface CellVisual {
  id: string;
  shelfIndex: number;
  column: number;
  level: number;
  color: string;
  parcel: THREE.Group;
  center: THREE.Vector3;
}

export interface ColumnHighlight {
  group: THREE.Group;
  material: THREE.MeshBasicMaterial;
}

export interface ShelfVisual {
  index: number;
  letter: string;
  group: THREE.Group;
  cells: CellVisual[];
  columnHighlights: ColumnHighlight[];
  labels: CSS2DObject[];
  interaction: { x: number; z: number };
  faceRotation: number;
}

export function createShelf(index: number, scene: THREE.Scene): ShelfVisual {
  const def = SHELF_DEFS[index];
  const width = shelfWidth(def);
  const group = new THREE.Group();
  const shelfRotation = def.rotation;
  group.position.set(def.x, 0, def.z);
  group.rotation.y = shelfRotation;
  group.userData = { type: 'shelf', shelfIndex: index };

  const staticParts: THREE.Mesh[] = [];
  const addStatic = (mesh: THREE.Mesh): void => {
    group.add(mesh);
    staticParts.push(mesh);
  };

  const backPanel = roundedBox(width - 0.06, SHELF_H - 0.08, 0.06, KIT_COLORS.sageLight, {
    radius: 0.028,
  });
  backPanel.position.set(0, SHELF_H / 2, -SHELF_D / 2 + 0.03);
  addStatic(backPanel);

  for (const grooveX of [-width * 0.25, width * 0.25]) {
    const groove = box(0.022, SHELF_H - 0.22, 0.012, KIT_COLORS.sageDark);
    groove.position.set(grooveX, SHELF_H / 2, -SHELF_D / 2 + 0.066);
    groove.raycast = () => {};
    addStatic(groove);
  }

  for (const side of [-1, 1]) {
    const panel = roundedBox(0.09, SHELF_H, SHELF_D, KIT_COLORS.wood, { radius: 0.024 });
    panel.position.set(side * (width / 2 - 0.045), SHELF_H / 2, 0);
    addStatic(panel);

    const inset = kitPanel(0.025, SHELF_H - 0.24, SHELF_D - 0.14, KIT_COLORS.woodDark, {
      radius: 0.012,
    });
    inset.position.set(side * (width / 2 - 0.088), SHELF_H / 2, 0);
    inset.raycast = () => {};
    addStatic(inset);
  }

  for (const level of [0, 1, 2, 3]) {
    const y = 0.14 + level * CELL_H;
    const shelfBoard = roundedBox(width - 0.1, 0.07, SHELF_D, KIT_COLORS.woodLight, {
      radius: 0.022,
    });
    shelfBoard.position.set(0, y, 0);
    addStatic(shelfBoard);

    const lip = roundedBox(width - 0.1, 0.04, 0.05, KIT_COLORS.wood, { radius: 0.014 });
    lip.position.set(0, y + 0.026, SHELF_D / 2 - 0.018);
    addStatic(lip);

    const paperStrip = box(width - 0.2, 0.012, 0.02, KIT_COLORS.cream);
    paperStrip.position.set(0, y + 0.052, SHELF_D / 2 + 0.002);
    paperStrip.raycast = () => {};
    addStatic(paperStrip);
  }

  for (const side of [-1, 1]) {
    for (const zSide of [-1, 1]) {
      const post = roundedBox(0.06, SHELF_H, 0.06, KIT_COLORS.woodDark, { radius: 0.018 });
      post.position.set(side * (width / 2 - 0.03), SHELF_H / 2, zSide * (SHELF_D / 2 - 0.03));
      addStatic(post);

      const foot = roundedBox(0.11, 0.07, 0.11, KIT_COLORS.woodDeep, { radius: 0.02 });
      foot.position.set(side * (width / 2 - 0.03), 0.035, zSide * (SHELF_D / 2 - 0.03));
      foot.raycast = () => {};
      addStatic(foot);
    }
  }

  const top = roundedBox(width + 0.1, 0.1, SHELF_D + 0.06, KIT_COLORS.wood, { radius: 0.028 });
  top.position.set(0, SHELF_H - 0.03, 0);
  addStatic(top);

  const topTrim = kitPanel(width + 0.02, 0.025, SHELF_D + 0.02, KIT_COLORS.woodLight, {
    radius: 0.01,
  });
  topTrim.position.set(0, SHELF_H + 0.018, 0);
  topTrim.raycast = () => {};
  addStatic(topTrim);

  const cells: CellVisual[] = [];
  const darkParts: THREE.Mesh[] = [];
  for (let column = 0; column < def.columns; column++) {
    const x = (column - (def.columns - 1) / 2) * def.cellW;
    for (let level = 0; level < LEVELS; level++) {
      const y = 0.45 + level * CELL_H;
      const color = PARCEL_COLORS[(column * LEVELS + level + index * 4) % PARCEL_COLORS.length];

      const dark = roundedBox(def.cellW - 0.06, CELL_H - 0.08, 0.34, KIT_COLORS.cell, {
        radius: 0.028,
      });
      dark.position.set(x, y, -0.02);
      darkParts.push(dark);
      group.add(dark);

      const parcelGroup = new THREE.Group();
      const seed = column * 7 + level * 3 + index * 5;
      parcelGroup.position.set(x, y + 0.005, 0.13);
      parcelGroup.rotation.y = ((seed % 3) - 1) * 0.05;
      parcelGroup.scale.setScalar(0.94 + (seed % 4) * 0.02);
      parcelGroup.userData = {
        type: 'cell',
        cellId: cellId(index, column, level),
        shelfIndex: index,
        column,
        level,
      };

      const parcel = new THREE.Mesh(createParcelGeometry(color), PARCEL_VERTEX_MATERIAL);
      parcel.userData = parcelGroup.userData;
      parcelGroup.add(parcel);

      group.add(parcelGroup);

      cells.push({
        id: cellId(index, column, level),
        shelfIndex: index,
        column,
        level,
        color,
        parcel: parcelGroup,
        center: new THREE.Vector3(
          def.x + Math.cos(shelfRotation) * x + Math.sin(shelfRotation) * 0.13,
          y,
          def.z - Math.sin(shelfRotation) * x + Math.cos(shelfRotation) * 0.13,
        ),
      });
    }
  }

  const columnHighlights: ColumnHighlight[] = [];
  for (let column = 0; column < def.columns; column++) {
    const x = (column - (def.columns - 1) / 2) * def.cellW;
    const highlightGroup = new THREE.Group();
    highlightGroup.position.set(x, SHELF_H / 2, 0.01);
    const highlightMaterial = new THREE.MeshBasicMaterial({
      color: '#ffd166',
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const glow = new THREE.Mesh(UNIT_BOX, highlightMaterial);
    glow.scale.set(def.cellW + 0.03, SHELF_H - 0.18, SHELF_D + 0.02);
    glow.raycast = () => {};
    highlightGroup.add(glow);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(
        new THREE.BoxGeometry(def.cellW + 0.04, SHELF_H - 0.16, SHELF_D + 0.03),
      ),
      new THREE.LineBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.9 }),
    );
    edges.raycast = () => {};
    highlightGroup.add(edges);
    highlightGroup.visible = false;
    group.add(highlightGroup);
    columnHighlights.push({ group: highlightGroup, material: highlightMaterial });
  }

  const shadow = contactShadow(width / 2 + 0.05, SHELF_D / 2 + 0.05, 0.14);
  shadow.position.set(0, 0.032, 0.05);
  group.add(shadow);

  const labels: CSS2DObject[] = [];
  // Printed directly on the wooden top; it follows the shelf and its visibility.
  const letter = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.48),
    new THREE.MeshLambertMaterial({
      map: makeTextTexture(SHELF_LETTERS[index], { width: 256, height: 192, fontSize: 168, bg: 'transparent', color: '#34453a' }),
      transparent: true, depthWrite: false,
    }),
  );
  letter.name = 'shelf-top-letter';
  letter.raycast = () => {};
  letter.rotation.x = -Math.PI / 2;
  letter.position.set(0, SHELF_H + 0.033, 0);
  // C runs across the room: keep its printed letter facing the same camera side.
  letter.rotation.z = index === 2 ? Math.PI / 2 : 0;
  group.add(letter);

  for (let column = 0; column < def.columns; column++) {
    const x = (column - (def.columns - 1) / 2) * def.cellW;
    const columnEl = document.createElement('div');
    columnEl.className = 'col-label';
    columnEl.textContent = String(column + 1);
    const label = new CSS2DObject(columnEl);
    label.position.set(x, SHELF_H + 0.06, 0.3);
    label.center.set(0.5, 0);
    group.add(label);
    labels.push(label);
  }

  mergeStaticMeshesToVertexColor(
    [...staticParts, ...darkParts],
    group,
    VERTEX_COLOR_MATERIAL,
  );
  scene.add(group);

  return {
    index,
    letter: SHELF_LETTERS[index],
    group,
    cells,
    columnHighlights,
    labels,
    interaction: { ...SHELF_POINTS[index] },
    faceRotation: def.face,
  };
}

export function createCounter(scene: THREE.Scene): THREE.Group {
  const group = new THREE.Group();
  group.name = 'service-counter';
  group.position.set(COUNTER.x, 0, COUNTER.z);
  group.userData = { type: 'counter' };
  const add = (w: number, h: number, d: number, color: string, x: number, y: number, z: number): THREE.Mesh => {
    const mesh = roundedBox(w, h, d, color, { radius: 0.025 });
    mesh.position.set(x, y, z); group.add(mesh); return mesh;
  };
  add(COUNTER.w, 0.94, COUNTER.d, '#78835d', 0, 0.47, 0);
  add(COUNTER.w - 0.06, 0.12, COUNTER.d + 0.02, '#3d493a', 0, 0.06, 0);
  const top = add(COUNTER.w + 0.18, 0.1, COUNTER.d + 0.18, KIT_COLORS.woodLight, 0, 1.045, 0);
  top.name = 'countertop';
  top.material = new THREE.MeshLambertMaterial({ map: woodTexture('#dbb380', 2, 1) });
  // Both sides share the olive inset and slender oak frame; the camera sees the staff side.
  for (const side of [-1, 1]) {
    const z = side * (COUNTER.d / 2 + 0.015);
    add(COUNTER.w - 0.18, 0.72, 0.035, '#63734d', 0, 0.52, z);
    for (const y of [0.14, 0.9]) add(COUNTER.w - 0.08, 0.045, 0.055, '#b88d5d', 0, y, z);
    for (const x of [-COUNTER.w / 2 + 0.07, COUNTER.w / 2 - 0.07]) {
      add(0.06, 0.8, 0.06, '#b88d5d', x, 0.53, z);
    }
    add(COUNTER.w - 0.2, 0.018, 0.06, '#efc76d', 0, 0.96, z);
  }
  for (const side of [-1, 1]) add(0.065, 0.9, COUNTER.d, '#bf9665', side * (COUNTER.w / 2 - 0.035), 0.5, 0);

  // The only built-in desktop equipment is a compact open laptop facing the player/camera.
  const laptop = new THREE.Group();
  laptop.name = 'counter-laptop';
  laptop.position.set(-1.42, 1.1, 0);
  const base = roundedBox(0.67, 0.035, 0.43, '#39464b', { radius: 0.018 });
  base.position.y = 0.018; laptop.add(base);
  const keyboard = box(0.53, 0.005, 0.21, '#7e8987');
  keyboard.position.set(0, 0.038, 0.025); laptop.add(keyboard);
  for (let row = 0; row < 3; row++) {
    for (let key = 0; key < 8; key++) {
      const cap = box(0.048, 0.006, 0.033, '#344044');
      cap.position.set(-0.23 + key * 0.065, 0.043, 0.08 - row * 0.05); laptop.add(cap);
    }
  }
  const trackpad = box(0.16, 0.005, 0.07, '#83918e');
  trackpad.position.set(0, 0.039, -0.13); laptop.add(trackpad);
  const lid = new THREE.Group();
  lid.position.set(0, 0.04, 0.16);
  lid.rotation.x = 0.18;
  const frame = roundedBox(0.66, 0.43, 0.04, '#2f3c42', { radius: 0.025 });
  frame.position.y = 0.21; lid.add(frame);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.575, 0.34), new THREE.MeshBasicMaterial({
    map: makeTextTexture('ЗАКАЗЫ', { width: 512, height: 320, bg: '#243a39', color: '#dde6cb', fontSize: 76, subtext: 'ПВЗ · 01' }),
  }));
  screen.name = 'laptop-screen';
  screen.position.set(0, 0.21, -0.022); screen.rotation.y = Math.PI; lid.add(screen);
  mergeStaticMeshesToVertexColor([frame], lid, VERTEX_COLOR_MATERIAL);
  laptop.add(lid);
  mergeStaticMeshesToVertexColor(laptop.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh), laptop, VERTEX_COLOR_MATERIAL);
  group.add(laptop);
  // No permanent printer, loose parcel, bell, payment terminal or plants on the desktop.
  // The existing toy and optional shop decor keep their gameplay and ownership in scene.ts.
  const shadow = contactShadow(COUNTER.w / 2 + 0.06, COUNTER.d / 2 + 0.04, 0.14);
  shadow.position.set(0, 0.032, 0.02); group.add(shadow);
  mergeStaticMeshesToVertexColor(group.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh), group, VERTEX_COLOR_MATERIAL);
  scene.add(group);
  return group;
}

/** Low return cabinet at the end of the counter, with an empty receiving cubby. */
export function createStaffShelf(scene: THREE.Scene): THREE.Group {
  const group = new THREE.Group();
  group.name = 'return-cabinet';
  group.position.set(STAFF_SHELF.x, 0, STAFF_SHELF.z);
  group.userData = { type: 'return-shelf' };
  const add = (w: number, h: number, d: number, color: string, x: number, y: number, z: number): void => {
    const mesh = roundedBox(w, h, d, color, { radius: 0.022 });
    mesh.position.set(x, y, z); group.add(mesh);
  };
  add(STAFF_SHELF.w, 0.65, STAFF_SHELF.d, '#78835d', 0, 0.35, 0);
  add(STAFF_SHELF.w + 0.08, 0.065, STAFF_SHELF.d + 0.04, '#dcbb88', 0, 0.7, 0);
  for (const side of [-1, 1]) {
    add(STAFF_SHELF.w / 2 - 0.055, 0.5, 0.025, '#e0d4b9', side * STAFF_SHELF.w / 4, 0.36, -STAFF_SHELF.d / 2 - 0.015);
    add(0.022, 0.1, 0.035, '#c59e55', side * 0.065, 0.34, -STAFF_SHELF.d / 2 - 0.045);
    add(0.055, 0.36, STAFF_SHELF.d, '#c79e6b', side * (STAFF_SHELF.w / 2 - 0.03), 0.91, 0);
  }
  add(STAFF_SHELF.w - 0.1, 0.32, 0.035, '#869274', 0, 0.9, STAFF_SHELF.d / 2 - 0.02);
  add(STAFF_SHELF.w + 0.08, 0.06, STAFF_SHELF.d + 0.04, '#dcbb88', 0, 1.1, 0);
  const sign = signPlane('ВОЗВРАТ', 0.92, 0.2, { bg: KIT_COLORS.cream, color: KIT_COLORS.ink, fontSize: 46, border: '#ad8b5e' });
  sign.position.set(0, 0.59, -STAFF_SHELF.d / 2 - 0.035); sign.rotation.y = Math.PI;
  group.add(sign);
  group.add(contactShadow(STAFF_SHELF.w / 2 + 0.08, STAFF_SHELF.d / 2 + 0.06, 0.14));
  mergeStaticMeshesToVertexColor(group.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh), group, VERTEX_COLOR_MATERIAL);
  scene.add(group);
  return group;
}

export function createToy(scene: THREE.Scene): { group: THREE.Group; label: CSS2DObject } {
  const group = new THREE.Group();
  group.position.set(TOY.x, TOY.y, TOY.z);
  group.rotation.y = Math.PI;
  group.userData = { type: 'toy' };

  const bodyMaterial = new THREE.MeshLambertMaterial({
    color: PALETTE.toy,
    flatShading: true,
  });
  const body = new THREE.Mesh(UNIT_SPHERE, bodyMaterial);
  body.scale.set(0.17, 0.14, 0.17);
  body.userData = { type: 'toy' };
  group.add(body);

  const base = cylinder(0.12, 0.14, 0.03, '#e89b00', 10);
  base.position.y = -0.14;
  group.add(base);

  for (const side of [-1, 1]) {
    const eye = box(0.028, 0.04, 0.015, '#2b2b2b');
    eye.position.set(side * 0.055, 0.035, 0.155);
    group.add(eye);
    const cheek = sphere(0.03, '#ff8b6b');
    cheek.position.set(side * 0.09, -0.015, 0.145);
    cheek.scale.set(0.05, 0.03, 0.03);
    group.add(cheek);
  }

  const mouth = box(0.055, 0.015, 0.012, '#7a4a3a');
  mouth.position.set(0, -0.04, 0.16);
  group.add(mouth);

  const labelEl = document.createElement('div');
  labelEl.className = 'prop-label toy-label';
  labelEl.dataset.action = 'toy';
  labelEl.textContent = '🧸';
  const label = new CSS2DObject(labelEl);
  label.position.set(0, 0.48, 0);
  label.center.set(0.5, 1);
  group.add(label);

  mergeStaticMeshesToVertexColor(
    group.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh),
    group,
    VERTEX_COLOR_MATERIAL,
  );
  scene.add(group);
  return { group, label };
}

export function createTV(scene: THREE.Scene): {
  group: THREE.Group;
  glowMaterial: THREE.MeshBasicMaterial;
} {
  const group = new THREE.Group();
  group.position.set(TV.x, TV.y, TV.z);
  // Телевизор висит заподлицо на западной стене клиентской зоны, экраном в зал.
  group.rotation.y = Math.PI / 2;
  group.visible = false;

  const glowMaterial = new THREE.MeshBasicMaterial({
    color: '#4d8fe8',
    transparent: true,
    opacity: 0.1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.42, 0.94), glowMaterial);
  glow.position.z = 0.012;
  group.add(glow);

  const frame = roundedBox(1.15, 0.72, 0.07, '#202832', { radius: 0.035 });
  group.add(frame);

  const screenTexture = makeTextTexture('РЕКЛАМА', {
    width: 1024,
    height: 600,
    bg: '#1b2b4a',
    color: '#ffd166',
    fontSize: 150,
    subtext: 'МАРКЕТПЛЕЙС · ВИДЕО',
    border: '#4d8fe8',
  });
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(1.03, 0.6),
    new THREE.MeshBasicMaterial({ map: screenTexture }),
  );
  screen.position.z = 0.041;
  group.add(screen);

  const shelf = roundedBox(1.35, 0.06, 0.3, KIT_COLORS.woodLight, { radius: 0.02 });
  shelf.position.set(0, -0.48, 0.16);
  group.add(shelf);

  const shelfBox = roundedBox(0.28, 0.2, 0.2, KIT_COLORS.coral, { radius: 0.035 });
  shelfBox.position.set(0.34, -0.35, 0.17);
  group.add(shelfBox);

  scene.add(group);
  return { group, glowMaterial };
}

export function createPlant(scene: THREE.Scene, x: number, z: number, scale = 1): void {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.scale.setScalar(scale);
  const pot = cylinder(0.19, 0.14, 0.3, '#b46b4f', 8);
  pot.position.y = 0.15;
  group.add(pot);
  const soil = cylinder(0.165, 0.165, 0.03, '#3e2d24', 8);
  soil.position.y = 0.3;
  group.add(soil);

  for (let i = 0; i < 6; i++) {
    const leaf = cone(0.11, 0.55, i % 2 === 0 ? '#3f7d5a' : '#4e946a', 5);
    const angle = (i / 6) * Math.PI * 2;
    leaf.position.set(Math.cos(angle) * 0.1, 0.55, Math.sin(angle) * 0.1);
    leaf.rotation.z = Math.cos(angle) * 0.35;
    leaf.rotation.x = Math.sin(angle) * 0.35;
    group.add(leaf);
  }

  const shadow = contactShadow(0.35, 0.35, 0.12);
  group.add(shadow);
  const opaqueParts = group.children.filter(
    (child): child is THREE.Mesh =>
      child instanceof THREE.Mesh && !(child.material as THREE.Material).transparent,
  );
  mergeStaticMeshesToVertexColor(opaqueParts, group, VERTEX_COLOR_MATERIAL);
  scene.add(group);
}

export interface CounterCatVisual {
  group: THREE.Group;
  tail: THREE.Group;
}

/** Кот-талисман на стойке: покупка оформления, появляется после приобретения. */
export function createCounterCat(scene: THREE.Scene): CounterCatVisual {
  const group = new THREE.Group();
  group.position.set(1.05, 1.09, 0.16);
  group.rotation.y = Math.PI;
  group.visible = false;
  group.userData = { type: 'cat' };

  const body = roundedBox(0.26, 0.34, 0.24, '#f2b134', { radius: 0.09 });
  body.position.y = 0.17;
  group.add(body);

  const chest = roundedBox(0.19, 0.23, 0.12, '#f7c948', { radius: 0.06 });
  chest.position.set(0, 0.14, 0.1);
  group.add(chest);

  const head = roundedBox(0.24, 0.22, 0.22, '#f7c948', { radius: 0.08 });
  head.position.set(0, 0.39, 0.02);
  group.add(head);

  for (const side of [-1, 1]) {
    const ear = cone(0.055, 0.11, '#f7c948', 4);
    ear.position.set(side * 0.09, 0.5, 0.02);
    ear.rotation.z = side * 0.12;
    group.add(ear);

    const innerEar = cone(0.025, 0.055, '#d98b72', 4);
    innerEar.position.set(side * 0.09, 0.49, 0.045);
    innerEar.rotation.z = side * 0.12;
    group.add(innerEar);

    const eye = sphere(1, KIT_COLORS.ink);
    eye.scale.set(0.025, 0.03, 0.02);
    eye.position.set(side * 0.06, 0.4, 0.13);
    group.add(eye);

    const glint = sphere(1, '#ffffff');
    glint.scale.set(0.007, 0.007, 0.005);
    glint.position.set(side * 0.052, 0.408, 0.147);
    group.add(glint);

    for (let w = 0; w < 2; w++) {
      const whisker = box(0.09, 0.008, 0.008, KIT_COLORS.cream);
      whisker.position.set(side * 0.12, 0.35 + w * 0.025, 0.12);
      whisker.rotation.z = side * (0.12 - w * 0.18);
      group.add(whisker);
    }
  }

  const muzzle = sphere(1, KIT_COLORS.cream);
  muzzle.scale.set(0.07, 0.045, 0.035);
  muzzle.position.set(0, 0.35, 0.125);
  group.add(muzzle);

  const nose = sphere(1, KIT_COLORS.coral);
  nose.scale.set(0.022, 0.016, 0.012);
  nose.position.set(0, 0.37, 0.15);
  group.add(nose);

  const collar = new THREE.Mesh(
    new THREE.TorusGeometry(0.095, 0.014, 5, 12),
    kitMaterial(KIT_COLORS.plum),
  );
  collar.position.set(0, 0.29, 0.01);
  collar.rotation.x = Math.PI / 2;
  group.add(collar);

  const bell = sphere(1, KIT_COLORS.mustard);
  bell.scale.set(0.022, 0.022, 0.018);
  bell.position.set(0, 0.26, 0.12);
  group.add(bell);

  const tail = new THREE.Group();
  tail.position.set(0.08, 0.17, -0.14);
  const tailMesh = roundedBox(0.06, 0.06, 0.26, '#e89b00', { radius: 0.025 });
  tailMesh.position.set(0, 0.04, -0.1);
  tailMesh.rotation.x = -0.7;
  tail.add(tailMesh);
  const tailTip = sphere(1, '#f7c948');
  tailTip.scale.set(0.045, 0.045, 0.04);
  tailTip.position.set(0, 0.2, -0.17);
  tail.add(tailTip);
  group.add(tail);

  const shadow = contactShadow(0.2, 0.16, 0.12);
  shadow.position.y = 0.001;
  group.add(shadow);

  const staticParts = group.children.filter(
    (child): child is THREE.Mesh => child instanceof THREE.Mesh,
  );
  mergeStaticMeshesToVertexColor(staticParts, group, VERTEX_COLOR_MATERIAL);

  scene.add(group);
  return { group, tail };
}

export function randomParcelColor(): string {
  return PARCEL_COLORS[randInt(0, PARCEL_COLORS.length - 1)];
}
