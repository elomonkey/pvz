import * as THREE from 'three';
import { PALETTE, SHELF_DEFS, type DecorOwnership } from '../data';
import { createEnvironment } from './environment';
import { mergeColoredGeometries, VERTEX_COLOR_MATERIAL } from './kit';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  createCounter,
  createCounterCat,
  createShelf,
  createStaffShelf,
  createToy,
  createTV,
  type CellVisual,
  type ShelfVisual,
} from './props';

export interface World {
  shelves: ShelfVisual[];
  cells: CellVisual[];
  toy: THREE.Group;
  tv: THREE.Group;
  applyDecor: (owned: DecorOwnership) => void;
  setDayPhase: (phase: 1 | 2 | 3) => void;
  update: (time: number) => void;
}

export function createWorld(scene: THREE.Scene): World {
  const ambient = new THREE.AmbientLight(0xfff8ed, 0.25);
  scene.add(ambient);

  const hemisphere = new THREE.HemisphereLight(0xe5eff2, 0xc7ae91, 0.8);
  scene.add(hemisphere);

  const keyLight = new THREE.DirectionalLight(0xffedda, 2.2);
  keyLight.position.set(-3, 8, -4);
  keyLight.target.position.set(-1.5, 0, 0.5);
  scene.add(keyLight.target);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xddeaf4, 0.3);
  fillLight.position.set(7, 6, 5);
  scene.add(fillLight);

  // Тёплое пятно у стойки — главный «уютный» акцент сцены.
  const counterGlow = new THREE.PointLight(0xffd9a8, 0.42, 7.5, 2);
  counterGlow.position.set(1.3, 2.35, 1.1);
  scene.add(counterGlow);

  const environment = createEnvironment(scene);

  const shelves = SHELF_DEFS.map((_, index) => createShelf(index, scene));
  const cells = shelves.flatMap((shelf) => shelf.cells);

  createCounter(scene);
  createStaffShelf(scene);
  const toy = createToy(scene).group;
  const tvData = createTV(scene);
  const tv = tvData.group;
  const tvGlowMaterial = tvData.glowMaterial;
  const catData = createCounterCat(scene);
  const cat = catData.group;
  const catTail = catData.tail;

  const wallMaterial = environment.walls[0]
    ? (environment.walls[0].material as THREE.MeshLambertMaterial).clone()
    : null;
  if (wallMaterial) {
    for (const wall of environment.walls) wall.material = wallMaterial;
  }
  const rugMaterial = (environment.clientRug.material as THREE.MeshLambertMaterial).clone();
  environment.clientRug.material = rugMaterial;
  const floorMaterials = environment.floors.map((floor) =>
    (floor.material as THREE.MeshLambertMaterial).clone(),
  );
  environment.floors.forEach((floor, index) => {
    floor.material = floorMaterials[index];
  });
  const clockMaterial = environment.clock.material as THREE.MeshBasicMaterial;
  const neonSign = environment.neonSign;
  const neonGlowMaterial = environment.neonGlowMaterial;

  // Batch the always-visible plaque edges; optional neon plaques keep their owner.
  scene.updateMatrixWorld(true);
  const plaqueEdges: THREE.Mesh[] = [];
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.userData.plaqueBacking) return;
    let owner: THREE.Object3D | null = object;
    while (owner) {
      if (owner === neonSign) return;
      owner = owner.parent;
    }
    plaqueEdges.push(object);
  });
  const plaqueGeometry = mergeColoredGeometries(plaqueEdges.map((mesh) => ({
    geometry: mesh.geometry,
    matrix: mesh.matrixWorld,
    color: (mesh.material as THREE.MeshLambertMaterial).color,
  })));
  if (plaqueGeometry) {
    const plaques = new THREE.Mesh(plaqueGeometry, VERTEX_COLOR_MATERIAL);
    plaques.raycast = () => {};
    scene.add(plaques);
    for (const edge of plaqueEdges) edge.removeFromParent();
  }

  // Batch only fixed ground contacts. Optional/animated decor keeps its own shadows.
  const contactGroups = new Map<THREE.Material, THREE.Mesh[]>();
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.userData.visualContact || Array.isArray(object.material)) return;
    let owner: THREE.Object3D | null = object;
    while (owner) {
      if (owner === cat || owner === tv || owner === neonSign) return;
      if (owner.userData.type === 'shelf' && owner.userData.shelfIndex >= 2) return;
      owner = owner.parent;
    }
    const group = contactGroups.get(object.material) ?? [];
    group.push(object);
    contactGroups.set(object.material, group);
  });
  for (const [material, contacts] of contactGroups) {
    if (contacts.length < 2) continue;
    const parts = contacts.map((mesh) => mesh.geometry.clone().applyMatrix4(mesh.matrixWorld));
    const geometry = mergeGeometries(parts);
    for (const part of parts) part.dispose();
    if (!geometry) continue;
    const combined = new THREE.Mesh(geometry, material);
    combined.raycast = () => {};
    scene.add(combined);
    for (const contact of contacts) contact.removeFromParent();
  }

  const applyDecor = (owned: DecorOwnership): void => {
    tv.visible = owned.tv;
    cat.visible = owned.cat;
    neonSign.visible = owned.sign;

    if (wallMaterial) wallMaterial.color.set(owned.walls ? '#cbd6c5' : PALETTE.wall);
    rugMaterial.color.set(owned.rug ? '#b6c7d3' : '#ffffff');
    for (const material of floorMaterials) {
      material.color.set(owned.floor ? '#c9a06a' : '#ffffff');
    }
    clockMaterial.color.set(owned.clock ? '#7ec8ff' : '#ffffff');
  };

  const update = (time: number): void => {
    catTail.rotation.z = Math.sin(time * 2.2) * 0.22;
    catTail.rotation.x = -0.1 + Math.sin(time * 1.6 + 0.7) * 0.08;
    cat.position.y = 1.09 + Math.sin(time * 1.9) * 0.004;
    environment.clockSecondHand.rotation.z = -((Math.floor(time) % 60) / 60) * Math.PI * 2;
    environment.window.update(time);
    tvGlowMaterial.opacity = 0.08 + (Math.sin(time * 3.1) + 1) * 0.02;
    neonGlowMaterial.opacity = 0.1 + (Math.sin(time * 2.4) + 1) * 0.025;
  };

  return {
    shelves,
    cells,
    toy,
    tv,
    applyDecor,
    setDayPhase: (phase) => environment.window.setPhase(phase),
    update,
  };
}
