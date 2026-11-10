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
  kitCylinder,
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

  const topTrim = kitPanel(width + 0.02, 0.025, SHELF_D + 0.02, KIT_COLORS.cream, {
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
  shadow.position.set(0, 0.011, 0.05);
  group.add(shadow);

  const labels: CSS2DObject[] = [];
  const letterEl = document.createElement('div');
  letterEl.className = 'shelf-letter';
  letterEl.textContent = SHELF_LETTERS[index];
  const letter = new CSS2DObject(letterEl);
  letter.position.set(0, SHELF_H + 0.35, 0);
  letter.center.set(0.5, 1);
  group.add(letter);
  labels.push(letter);

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
  group.position.set(COUNTER.x, 0, COUNTER.z);
  group.userData = { type: 'counter' };

  const base = roundedBox(COUNTER.w, 0.94, COUNTER.d, KIT_COLORS.sage, { radius: 0.06 });
  base.position.y = 0.47;
  group.add(base);

  const kick = roundedBox(COUNTER.w, 0.12, COUNTER.d + 0.04, KIT_COLORS.woodDeep, {
    radius: 0.02,
  });
  kick.position.y = 0.06;
  group.add(kick);

  const top = roundedBox(COUNTER.w + 0.18, 0.1, COUNTER.d + 0.14, KIT_COLORS.woodLight, {
    radius: 0.04,
  });
  top.position.y = 1.045;
  group.add(top);

  const trim = roundedBox(COUNTER.w + 0.2, 0.04, COUNTER.d + 0.16, KIT_COLORS.cream, {
    radius: 0.015,
  });
  trim.position.y = 0.995;
  group.add(trim);

  for (const side of [-1, 1]) {
    const cap = roundedBox(0.07, 0.86, COUNTER.d + 0.02, KIT_COLORS.wood, { radius: 0.02 });
    cap.position.set(side * (COUNTER.w / 2 - 0.035), 0.47, 0);
    group.add(cap);
  }

  const panelW = COUNTER.w - 0.12;
  const panelZ = COUNTER.d / 2 + 0.012;

  const frontPanel = roundedBox(panelW, 0.68, 0.04, KIT_COLORS.cream, { radius: 0.028 });
  frontPanel.position.set(0, 0.5, panelZ);
  group.add(frontPanel);

  const frameTop = box(panelW + 0.08, 0.05, 0.055, KIT_COLORS.wood);
  frameTop.position.set(0, 0.865, panelZ);
  group.add(frameTop);
  const frameBottom = box(panelW + 0.08, 0.05, 0.055, KIT_COLORS.wood);
  frameBottom.position.set(0, 0.135, panelZ);
  group.add(frameBottom);
  for (const side of [-1, 1]) {
    const frameSide = box(0.05, 0.72, 0.055, KIT_COLORS.wood);
    frameSide.position.set(side * (panelW / 2 + 0.04), 0.5, panelZ);
    group.add(frameSide);
  }
  const divider = box(0.035, 0.62, 0.06, KIT_COLORS.wood);
  divider.position.set(0, 0.5, panelZ + 0.005);
  group.add(divider);

  for (const side of [-1, 1]) {
    const handle = kitCylinder(0.02, 0.02, 0.055, KIT_COLORS.mustard, 8);
    handle.rotation.x = Math.PI / 2;
    handle.position.set(side * 1.35, 0.56, panelZ + 0.045);
    group.add(handle);
  }

  const backPanel = roundedBox(panelW, 0.68, 0.04, KIT_COLORS.sageDark, { radius: 0.028 });
  backPanel.position.set(0, 0.5, -panelZ);
  group.add(backPanel);

  const backTrim = box(panelW + 0.08, 0.05, 0.055, KIT_COLORS.wood);
  backTrim.position.set(0, 0.865, -panelZ);
  group.add(backTrim);

  const monitorStand = kitCylinder(0.055, 0.085, 0.28, KIT_COLORS.metal, 10);
  monitorStand.position.set(-1.45, 1.22, -0.08);
  group.add(monitorStand);

  const monitor = roundedBox(0.56, 0.38, 0.07, '#2d3a40', { radius: 0.035 });
  monitor.position.set(-1.45, 1.47, -0.08);
  group.add(monitor);

  const screenTexture = makeTextTexture('ЗАКАЗЫ', {
    width: 512,
    height: 320,
    bg: '#17212b',
    color: '#9fe6a8',
    fontSize: 92,
    subtext: 'ПВЗ · 01',
  });
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.47, 0.29),
    new THREE.MeshBasicMaterial({ map: screenTexture }),
  );
  screen.position.set(-1.45, 1.47, -0.12);
  screen.rotation.y = Math.PI;
  group.add(screen);

  const scannerBase = roundedBox(0.24, 0.14, 0.2, KIT_COLORS.metal, { radius: 0.035 });
  scannerBase.position.set(0.55, 1.16, -0.08);
  group.add(scannerBase);
  const scannerHead = roundedBox(0.18, 0.09, 0.16, KIT_COLORS.woodDark, { radius: 0.025 });
  scannerHead.position.set(0.55, 1.27, -0.08);
  group.add(scannerHead);
  const redLight = sphere(0.028, '#ff5b5b');
  redLight.position.set(0.61, 1.31, -0.15);
  group.add(redLight);

  const printer = roundedBox(0.36, 0.22, 0.24, KIT_COLORS.cream, { radius: 0.03 });
  printer.position.set(-1.8, 1.2, 0.0);
  group.add(printer);
  const paper = roundedBox(0.25, 0.02, 0.16, KIT_COLORS.white, { radius: 0.006 });
  paper.position.set(-1.8, 1.32, 0.02);
  group.add(paper);

  const terminal = roundedBox(0.24, 0.12, 0.16, KIT_COLORS.metal, { radius: 0.03 });
  terminal.position.set(1.9, 1.15, 0.0);
  group.add(terminal);

  const bellBase = kitCylinder(0.06, 0.07, 0.02, KIT_COLORS.woodDark, 10);
  bellBase.position.set(1.55, 1.1, 0.14);
  group.add(bellBase);
  const bell = sphere(0.045, KIT_COLORS.mustard);
  bell.position.set(1.55, 1.14, 0.14);
  group.add(bell);

  const counterParcel = roundedBox(0.24, 0.16, 0.2, '#d8b48a', { radius: 0.025 });
  counterParcel.position.set(1.15, 1.13, 0.03);
  group.add(counterParcel);
  const counterParcelTape = box(0.24, 0.012, 0.06, KIT_COLORS.cream);
  counterParcelTape.position.set(1.15, 1.215, 0.03);
  group.add(counterParcelTape);

  const plantX = 2.4;
  const plantPot = kitCylinder(0.13, 0.1, 0.2, KIT_COLORS.coral, 10);
  plantPot.position.set(plantX, 1.18, 0.06);
  group.add(plantPot);
  for (let i = 0; i < 5; i++) {
    const leaf = cone(0.09, 0.32, KIT_COLORS.sage, 6);
    leaf.position.set(plantX + Math.cos(i * 1.6) * 0.08, 1.4, 0.06 + Math.sin(i * 1.6) * 0.08);
    leaf.rotation.z = Math.cos(i * 1.6) * 0.45;
    leaf.rotation.x = Math.sin(i * 1.6) * 0.45;
    group.add(leaf);
  }

  const penCup = kitCylinder(0.045, 0.05, 0.11, KIT_COLORS.mustard, 10);
  penCup.position.set(-0.7, 1.155, 0.12);
  group.add(penCup);
  const penColors = [KIT_COLORS.coral, KIT_COLORS.blue, KIT_COLORS.sageDark];
  for (let i = 0; i < penColors.length; i++) {
    const pen = box(0.012, 0.18, 0.012, penColors[i]);
    pen.position.set(-0.7 + (i - 1) * 0.022, 1.245, 0.12 + (i - 1) * 0.012);
    pen.rotation.z = (i - 1) * 0.16;
    group.add(pen);
  }

  const staffSign = signPlane('СТОЙКА', 1.2, 0.3, {
    bg: KIT_COLORS.cream,
    color: KIT_COLORS.ink,
    fontSize: 54,
    border: KIT_COLORS.woodDark,
  });
  staffSign.position.set(0, 0.78, -(COUNTER.d / 2 + 0.01));
  staffSign.rotation.y = Math.PI;
  group.add(staffSign);

  const shadow = contactShadow(COUNTER.w / 2 + 0.06, COUNTER.d / 2 + 0.04, 0.14);
  shadow.position.set(0, 0.011, 0.02);
  group.add(shadow);

  const counterParts = group.children.filter(
    (child): child is THREE.Mesh =>
      child instanceof THREE.Mesh &&
      !(child.material as THREE.Material).transparent &&
      !(child.material as THREE.MeshBasicMaterial).map,
  );
  mergeStaticMeshesToVertexColor(counterParts, group, VERTEX_COLOR_MATERIAL);
  scene.add(group);
  return group;
}

/** Шкафчик в расширенной зоне сотрудника — витрина под будущие предметы магазина. */
export function createStaffShelf(scene: THREE.Scene): THREE.Group {
  const group = new THREE.Group();
  group.position.set(STAFF_SHELF.x, 0, STAFF_SHELF.z);
  group.userData = { type: 'return-shelf' };

  const body = roundedBox(STAFF_SHELF.w, 0.86, STAFF_SHELF.d, KIT_COLORS.sage, {
    radius: 0.045,
  });
  body.position.y = 0.43;
  group.add(body);

  const top = roundedBox(STAFF_SHELF.w + 0.1, 0.07, STAFF_SHELF.d + 0.08, KIT_COLORS.woodLight, {
    radius: 0.025,
  });
  top.position.y = 0.89;
  group.add(top);

  const topTrim = kitPanel(STAFF_SHELF.w + 0.02, 0.025, STAFF_SHELF.d + 0.02, KIT_COLORS.cream, {
    radius: 0.01,
  });
  topTrim.position.y = 0.932;
  topTrim.raycast = () => {};
  group.add(topTrim);

  for (const side of [-1, 1]) {
    const door = roundedBox(0.52, 0.58, 0.035, KIT_COLORS.cream, { radius: 0.025 });
    door.position.set(side * 0.33, 0.44, -STAFF_SHELF.d / 2 - 0.012);
    group.add(door);

    const handle = kitCylinder(0.018, 0.018, 0.05, KIT_COLORS.mustard, 8);
    handle.rotation.x = Math.PI / 2;
    handle.position.set(side * 0.08, 0.47, -STAFF_SHELF.d / 2 - 0.04);
    group.add(handle);
  }

  // Верхняя открытая полка: смотрит в сторону камеры.
  const back = roundedBox(STAFF_SHELF.w, 0.74, 0.05, KIT_COLORS.sageLight, { radius: 0.024 });
  back.position.set(0, 1.28, STAFF_SHELF.d / 2 - 0.025);
  group.add(back);
  for (const side of [-1, 1]) {
    const panel = roundedBox(0.055, 0.74, STAFF_SHELF.d, KIT_COLORS.wood, { radius: 0.018 });
    panel.position.set(side * (STAFF_SHELF.w / 2 - 0.028), 1.28, 0);
    group.add(panel);
  }
  const shelf = roundedBox(STAFF_SHELF.w - 0.1, 0.055, STAFF_SHELF.d - 0.06, KIT_COLORS.woodLight, {
    radius: 0.02,
  });
  shelf.position.set(0, 1.28, 0);
  group.add(shelf);

  const itemColors = [KIT_COLORS.coral, KIT_COLORS.blue, KIT_COLORS.mustard, KIT_COLORS.sageDark];
  for (let index = 0; index < 4; index++) {
    const width = 0.15 + (index % 2) * 0.05;
    const item = roundedBox(width, 0.16, 0.16, itemColors[index], { radius: 0.025 });
    item.position.set(-0.45 + index * 0.3, 1.4, 0);
    group.add(item);
    const tape = box(width * 0.22, 0.018, 0.17, KIT_COLORS.tape);
    tape.position.set(item.position.x, 1.49, 0);
    tape.raycast = () => {};
    group.add(tape);
  }

  const sign = signPlane('ВОЗВРАТ', 0.95, 0.22, {
    bg: KIT_COLORS.cream,
    color: KIT_COLORS.plum,
    fontSize: 46,
    border: KIT_COLORS.plum,
  });
  sign.position.set(0, 0.58, -STAFF_SHELF.d / 2 - 0.015);
  sign.rotation.y = Math.PI;
  group.add(sign);

  const shadow = contactShadow(STAFF_SHELF.w / 2 + 0.08, STAFF_SHELF.d / 2 + 0.06, 0.14);
  group.add(shadow);

  const staffParts = group.children.filter(
    (child): child is THREE.Mesh =>
      child instanceof THREE.Mesh &&
      !(child.material as THREE.Material).transparent &&
      !(child.material as THREE.MeshBasicMaterial).map,
  );
  mergeStaticMeshesToVertexColor(staffParts, group, VERTEX_COLOR_MATERIAL);
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
