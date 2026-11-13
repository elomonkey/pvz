import * as THREE from 'three';
import { mergeColoredGeometries, type ColoredGeometryPart } from './kit';
import { UNIT_BOX } from './primitives';
import { CAMERA } from '../data';

type Phase = 1 | 2 | 3;
const PHASES = {
  1: { sky: '#9acbe0', horizon: '#ffe2b9', tint: '#fff0dc', foliage: '#f0edc6', lamps: 0 },
  2: { sky: '#77bae6', horizon: '#e5f3f7', tint: '#ffffff', foliage: '#ffffff', lamps: 0 },
  3: { sky: '#b685af', horizon: '#ffbd8e', tint: '#edbdac', foliage: '#c3c9ae', lamps: 1 },
} as const;

/** A shallow, forced-perspective 3D courtyard for the fixed high 3/4 camera.
 * The distant ground steps down behind the unchanged level NPC approach.
 * No portal camera, render target, extra time system or gameplay colliders.
 */
export function createStreet(scene: THREE.Scene) {
  // Extrude the facade aperture along the existing camera rays. Local clipping
  // prevents the compact street from floating outside the diorama silhouette.
  const dx = (CAMERA.pos.x - CAMERA.target.x) / (CAMERA.target.z - CAMERA.pos.z);
  const dy = (CAMERA.pos.y - CAMERA.target.y) / (CAMERA.target.z - CAMERA.pos.z);
  const plane = (normal: THREE.Vector3, constant: number) => new THREE.Plane(normal, constant).normalize();
  const clip = [
    plane(new THREE.Vector3(1, 0, dx), 1.445 - dx * 3.7),
    plane(new THREE.Vector3(-1, 0, -dx), 2.19 + dx * 3.7),
    plane(new THREE.Vector3(0, 1, dy), -.015 - dy * 3.7),
    plane(new THREE.Vector3(0, -1, -dy), 2.65 + dy * 3.7),
  ];
  const root = new THREE.Group();
  root.name = 'window-street';
  const foliageGeometry = new THREE.IcosahedronGeometry(1, 1);
  const solid: ColoredGeometryPart[] = [], green: ColoredGeometryPart[] = [], lit: ColoredGeometryPart[] = [];
  const put = (parts: ColoredGeometryPart[], geometry: THREE.BufferGeometry, color: string,
    x: number, y: number, z: number, sx: number, sy: number, sz: number, rz = 0): void => {
    parts.push({ geometry, color, matrix: new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rz)), new THREE.Vector3(sx, sy, sz),
    ) });
  };
  const block = (parts: ColoredGeometryPart[], c: string, x: number, y: number, z: number, w: number, h: number, d: number) => put(parts, UNIT_BOX, c, x, y, z, w, h, d);
  const batch = (parts: ColoredGeometryPart[], material: THREE.Material, name: string) => {
    const mesh = new THREE.Mesh(mergeColoredGeometries(parts)!, material);
    mesh.name = name; mesh.raycast = () => {}; root.add(mesh); return mesh;
  };
  const solidMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, clippingPlanes: clip, color: PHASES[1].tint });
  const leafMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, clippingPlanes: clip, color: PHASES[1].foliage });
  const lightMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, clippingPlanes: clip, color: '#000000' });

  // Keep the original level pavement and all entry/exit waypoints free.
  block(solid, '#c7bfae', -.1, -.025, 4.12, 5.1, .05, .78);
  block(solid, '#b5ad9b', -.1, -.035, 4.63, 5.1, .035, .24);
  block(solid, '#ded5c2', 1.8, -.015, 4.03, 1.1, .03, .82);
  // The road is behind the entire NPC approach (z=4.68), never under it.
  const road = new THREE.Shape();
  road.moveTo(-4.3, -.25); road.lineTo(2.1, -.25); road.lineTo(2.1, .25); road.lineTo(-4.3, .25); road.closePath();
  const roadGeometry = new THREE.ShapeGeometry(road);
  const roadMatrix = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
  roadGeometry.applyMatrix4(roadMatrix);
  const rp = roadGeometry.getAttribute('position');
  for (let i = 0; i < rp.count; i++) rp.setY(i, -.38 - rp.getZ(i) * .65);
  roadGeometry.computeVertexNormals();
  put(solid, roadGeometry, '#637078', 0, 0, 5.3, 1, 1, 1);
  for (let i = 0; i < 12; i++) block(solid, '#e4dbbc', -4.05 + i * .52, -.37, 5.3, .23, .008, .018);
  for (const z of [5.04, 5.56]) block(solid, '#c7bfab', -1.1, z === 5.04 ? -.20 : -.56, z, 6.4, .055, .045);
  // Small crosswalk and planted verge give the street a readable scale.
  for (let i = 0; i < 5; i++) block(solid, '#eae2d0', -.9, -.23 - i * .06, 5.08 + i * .09, .38, .008, .045);
  block(solid, '#8c9973', -1.2, -.87, 5.95, 6.2, .08, .6);

  // Two five-storey blocks, with real side faces, recessed windows and flat roofs.
  for (const [index, x] of [-2.4, -.43].entries()) {
    const base = -1.8, height = .9, z = 6.78, width = 1.8;
    block(solid, index ? '#d4bd9c' : '#b8c2c1', x, base + height / 2, z, width, height, .08);
    block(solid, '#969f9e', x, base + height + .025, z, width + .08, .035, .12);
    block(solid, '#889496', x, base + .06, z - .055, width, .12, .035);
    for (let floor = 0; floor < 5; floor++) {
      const y = base + .12 + floor * .16;
      block(solid, '#b0aba0', x, y + .09, z - .05, width, .018, .025);
      for (let col = 0; col < 6; col++) {
        const wx = x - .73 + col * .29;
        block(solid, '#e6ded0', wx, y, z - .06, .15, .115, .03);
        block(solid, '#5e7b88', wx, y, z - .08, .115, .085, .018);
        block(solid, '#d7d4c4', wx, y, z - .094, .009, .085, .008);
        if ((col + floor * 3 + index) % 4 === 0) block(lit, '#ffe1a0', wx, y, z - .098, .1, .078, .005);
      }
    }
    // The end wall is modelled too, so the block has depth through the doorway.
    for (let f = 0; f < 5; f++) block(solid, '#6e838a', x + width / 2 + .006, base + .12 + f * .16, z, .014, .11, .12);
    block(solid, '#777f7d', x + .3, base + height + .09, z + .06, .15, .13, .12);
  }
  // Birch trunks and irregular low-poly crowns are separated for a tiny breeze.
  const trunkGeometry = new THREE.CylinderGeometry(.035, .047, 1, 7);
  for (const [index, x] of [-2.25, -.23].entries()) {
    const y = -1.52, z = 6.13;
    put(solid, trunkGeometry, '#e9e4d4', x, y + .55, z, 1, 1.1, 1, index ? -.07 : .06);
    for (let i = 0; i < 7; i++) block(solid, '#5b6259', x + (i % 2 ? .015 : -.015), y + .13 + i * .12, z - .036, .043, .018, .013);
    for (let i = 0; i < 9; i++) {
      const angle = i * 2.4;
      put(green, foliageGeometry, i % 3 ? '#8da45f' : '#b2bd73', x + Math.cos(angle) * .17, y + .85 + (i % 3) * .12, z + Math.sin(angle) * .14, .20, .22, .18);
    }
  }
  for (let i = 0; i < 13; i++) {
    const x = -3.6 + i * .42;
    put(green, foliageGeometry, i % 2 ? '#7c985f' : '#91a76c', x, -.86 + (i % 3) * .025, 5.88, .24, .18, .18);
  }
  // Sign and lamp are behind the pavement, clear of the route to the door.
  block(solid, '#68767a', -1.8, -.01, 5.04, .018, .58, .018);
  block(solid, '#e8dba1', -1.8, .24, 5.04, .19, .21, .018);
  block(solid, '#527a9b', -1.8, .24, 5.025, .15, .17, .012);
  const triangle = new THREE.Shape();
  triangle.moveTo(-.058, -.058); triangle.lineTo(.058, -.058); triangle.lineTo(0, .065); triangle.closePath();
  const triangleGeometry = new THREE.ShapeGeometry(triangle);
  triangleGeometry.rotateY(Math.PI);
  put(solid, triangleGeometry, '#eee6d2', -1.8, .24, 5.014, 1, 1, 1);
  block(solid, '#344957', -1.8, .238, 5.005, .012, .055, .005);
  block(solid, '#566568', .45, -.38, 5.86, .025, 1.06, .025);
  block(solid, '#566568', .35, .15, 5.86, .22, .025, .025);
  block(solid, '#495858', .26, .12, 5.86, .1, .045, .06);
  block(lit, '#ffe0a3', .26, .093, 5.85, .08, .012, .05);
  batch(solid, solidMaterial, 'street-buildings-road');
  const leaves = batch(green, leafMaterial, 'street-birch-leaves');
  const lights = batch(lit, lightMaterial, 'street-evening-windows');
  roadGeometry.dispose(); trunkGeometry.dispose(); triangleGeometry.dispose();

  // Sky is only a colour gradient; all buildings, trees and the road are 3D.
  const skyGeometry = new THREE.PlaneGeometry(6.5, 2.7, 1, 6);
  const skyColors = new Float32Array(skyGeometry.getAttribute('position').count * 3);
  skyGeometry.setAttribute('color', new THREE.BufferAttribute(skyColors, 3));
  const sky = new THREE.Mesh(skyGeometry, new THREE.MeshBasicMaterial({ vertexColors: true, clippingPlanes: clip }));
  sky.name = 'street-sky'; sky.rotation.y = Math.PI; sky.position.set(-1.1, -3.55, 8.7); sky.raycast = () => {}; root.add(sky);
  const clouds: ColoredGeometryPart[] = [];
  for (const x of [-2.7, -.9, .9]) for (let i = 0; i < 3; i++) put(clouds, foliageGeometry, '#ffffff', x + i * .18, -2.18 + (i % 2) * .04, 8.1, .22, .075, .07);
  const cloudMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, clippingPlanes: clip, color: '#fff2df' });
  const cloud = batch(clouds, cloudMaterial, 'street-clouds');

  const carParts: ColoredGeometryPart[] = [];
  block(carParts, '#8babb8', 0, .12, 0, .56, .16, .22);
  block(carParts, '#bed0d4', -.03, .24, 0, .3, .14, .2);
  block(carParts, '#4c6672', -.03, .26, -.105, .25, .075, .008);
  for (const x of [-.18, .18]) for (const z of [-.11, .11]) put(carParts, foliageGeometry, '#34424a', x, .065, z, .065, .065, .025);
  const car = batch(carParts, solidMaterial, 'street-car');
  foliageGeometry.dispose();
  const palette = Object.fromEntries(Object.entries(PHASES).map(([key, value]) => [key, {
    sky: new THREE.Color(value.sky), horizon: new THREE.Color(value.horizon),
    tint: new THREE.Color(value.tint), foliage: new THREE.Color(value.foliage), lamps: value.lamps,
  }])) as Record<Phase, { sky: THREE.Color; horizon: THREE.Color; tint: THREE.Color; foliage: THREE.Color; lamps: number }>;
  const color = new THREE.Color();
  let target: Phase = 1, previous: number | null = null;
  const skyTop = new THREE.Color(PHASES[1].sky), horizon = new THREE.Color(PHASES[1].horizon);
  let glow = 0;
  const setPhase = (phase: Phase): void => { target = phase; root.userData.phase = phase; };
  const update = (time: number): void => {
    const dt = previous === null ? 0 : Math.max(0, time - previous); previous = time;
    const mix = 1 - Math.exp(-dt * 1.8), phase = palette[target];
    solidMaterial.color.lerp(phase.tint, mix);
    leafMaterial.color.lerp(phase.foliage, mix);
    skyTop.lerp(phase.sky, mix); horizon.lerp(phase.horizon, mix);
    const positions = skyGeometry.getAttribute('position'), colors = skyGeometry.getAttribute('color');
    for (let i = 0; i < positions.count; i++) {
      color.copy(horizon).lerp(skyTop, (positions.getY(i) + 1.35) / 2.7);
      colors.setXYZ(i, color.r, color.g, color.b);
    }
    colors.needsUpdate = true;
    glow += (phase.lamps - glow) * mix; lightMaterial.color.setRGB(glow, glow, glow);
    lights.visible = glow > .002; root.userData.eveningGlow = glow;
    cloud.position.x = Math.sin(time * .024) * .09;
    leaves.position.x = Math.sin(time * .8) * .006;
    const passage = ((time + 12) % 36);
    car.visible = passage < 8;
    car.position.set(-4.1 + passage / 8 * 6.1, -.38, 5.3);
    root.userData.carPassage = passage;
  };
  setPhase(1); update(0); scene.add(root);
  return { setPhase, update };
}
