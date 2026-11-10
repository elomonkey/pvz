import * as THREE from 'three';
import { PALETTE, SHELF_DEFS, type DecorOwnership } from '../data';
import { createEnvironment } from './environment';
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
  const ambient = new THREE.AmbientLight(0xfff8ed, 0.65);
  scene.add(ambient);

  const hemisphere = new THREE.HemisphereLight(0xe5eff2, 0xc7ae91, 1.25);
  scene.add(hemisphere);

  const keyLight = new THREE.DirectionalLight(0xffe5c4, 1.75);
  keyLight.position.set(-3, 9, -6);
  // A single cached shadow map for furniture; moving characters keep cheap blobs.
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  Object.assign(keyLight.shadow.camera, { left: -10, right: 10, top: 8, bottom: -8, near: 0.5, far: 30 });
  keyLight.shadow.bias = -0.0003;
  keyLight.shadow.normalBias = 0.025;
  keyLight.shadow.radius = 3;
  keyLight.shadow.intensity = 0.7;
  keyLight.shadow.autoUpdate = false;
  keyLight.target.position.set(-1.5, 0, 0.5);
  scene.add(keyLight.target);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xddeaf4, 0.55);
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

  // Snapshot only the static world before Game adds animated characters.
  const floors = new Set<THREE.Object3D>(environment.floors);
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (materials.some((material) => material.transparent || material instanceof THREE.MeshBasicMaterial)) return;
    object.castShadow = !floors.has(object) && object !== environment.clientRug;
    object.receiveShadow = true;
  });
  cat.traverse((object) => { object.castShadow = false; });
  // Parcels disappear on pickup: do not bake their changing visibility into the map.
  for (const cell of cells) {
    cell.parcel.traverse((object) => { object.castShadow = false; });
  }
  environment.clockSecondHand.castShadow = false;

  const applyDecor = (owned: DecorOwnership): void => {
    tv.visible = owned.tv;
    cat.visible = owned.cat;
    neonSign.visible = owned.sign;

    if (wallMaterial) wallMaterial.color.set(owned.walls ? '#cbd6c5' : PALETTE.wall);
    rugMaterial.color.set(owned.rug ? '#718b9e' : '#8c9fa8');
    for (const material of floorMaterials) {
      material.color.set(owned.floor ? '#c9a06a' : '#ffffff');
    }
    clockMaterial.color.set(owned.clock ? '#7ec8ff' : '#ffffff');
    keyLight.shadow.needsUpdate = true;
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
