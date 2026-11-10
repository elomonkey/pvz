import * as THREE from 'three';
import type { PersonOptions, PersonRig } from './characters';
import { mergeStaticMeshesToVertexColor, roundedBox, VERTEX_COLOR_MATERIAL } from './kit';
import { contactShadow, createParcelTopDecal, mat } from './primitives';

/** Art prototype for the office archetype only; the existing rig contract is preserved. */
export function createOfficePerson(options: PersonOptions): PersonRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body, contactShadow(0.43, 0.29, 0.18));
  const palette = {
    jacket: '#647d8e', lapel: '#738b9a', seam: '#506879',
    trousers: '#35444f', shirt: '#f1e8da', tie: '#789783',
    leather: '#90694c', leatherDark: '#654a38', sole: '#403a34',
    skin: options.skin, hair: '#493327', hairLight: '#5c4130', ink: '#39322f',
  };
  const block = (
    parent: THREE.Group, size: [number, number, number],
    position: [number, number, number], color: string, radius = 0.025,
  ): THREE.Mesh => {
    const mesh = roundedBox(...size, color, { radius, segments: radius >= 0.06 ? 2 : 1 });
    mesh.position.set(...position);
    parent.add(mesh);
    return mesh;
  };
  const batch = (group: THREE.Group): void => {
    mergeStaticMeshesToVertexColor(
      group.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh),
      group, VERTEX_COLOR_MATERIAL,
    );
  };
  const panel = (parent: THREE.Group, outline: [number, number][], z: number, color: string): THREE.Mesh => {
    const shape = new THREE.Shape();
    shape.moveTo(...outline[0]);
    for (const point of outline.slice(1)) shape.lineTo(...point);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.008, bevelEnabled: true, bevelSize: 0.003,
      bevelThickness: 0.002, bevelSegments: 1, steps: 1, curveSegments: 1,
    });
    const mesh = new THREE.Mesh(geometry, mat(color));
    mesh.position.z = z;
    parent.add(mesh);
    return mesh;
  };

  const legL = new THREE.Group();
  const legR = new THREE.Group();
  for (const [leg, side] of [[legL, -1], [legR, 1]] as const) {
    leg.position.set(side * 0.112, 0.55, 0);
    root.add(leg);
    const trouser = block(leg, [0.175, 0.47, 0.19], [0, -0.225, 0], palette.trousers, 0.035);
    trouser.geometry = trouser.geometry.clone();
    const positions = trouser.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const taper = 0.82 + 0.18 * (positions.getY(i) + 0.235) / 0.47;
      positions.setX(i, positions.getX(i) * taper);
    }
    trouser.geometry.computeVertexNormals();
    block(leg, [0.15, 0.035, 0.198], [0, -0.432, 0], palette.seam, 0.008);
    block(leg, [0.19, 0.105, 0.295], [0, -0.495, 0.042], palette.leatherDark, 0.042);
    block(leg, [0.195, 0.025, 0.30], [0, -0.538, 0.042], palette.sole, 0.012);
    block(leg, [0.17, 0.018, 0.275], [0, -0.52, 0.042], palette.leather, 0.008);
    for (const z of [0.025, 0.055]) {
      block(leg, [0.075, 0.008, 0.009], [0, -0.44, z], '#b69b7c', 0.003);
    }
    batch(leg);
  }

  block(body, [0.38, 0.10, 0.27], [0, 0.59, 0], palette.trousers, 0.035);
  const torso = block(body, [0.49, 0.61, 0.305], [0, 0.90, 0], palette.jacket, 0.065);
  torso.geometry = torso.geometry.clone();
  const torsoPositions = torso.geometry.getAttribute('position');
  for (let i = 0; i < torsoPositions.count; i++) {
    const y = torsoPositions.getY(i);
    const x = torsoPositions.getX(i);
    const waist = 0.92 - 0.055 * Math.exp(-(((y + 0.055) / 0.16) ** 2));
    torsoPositions.setX(i, x * waist);
    // Sloped shoulders instead of the horizontal slab across the old jacket.
    if (y > 0.18) torsoPositions.setY(i, y - 0.045 * (Math.abs(x) / 0.245) ** 1.5);
  }
  torso.geometry.computeVertexNormals();
  panel(body, [[-0.085, 1.193], [0.085, 1.193], [0.025, 0.997], [-0.025, 0.997]], 0.155, palette.shirt);
  for (const side of [-1, 1]) {
    const lapelOutline: [number, number][] = [[0.045, 1.193], [0.125, 1.166], [0.105, 1.136], [0.145, 1.113], [0.024, 0.975], [0.055, 1.085]];
    panel(body, lapelOutline.map(([x, y]) => [side * x, y]), 0.166, palette.lapel);
    panel(body, [[side * 0.073, 1.197], [side * 0.012, 1.18], [side * 0.035, 1.137]], 0.177, palette.shirt);
    block(body, [0.105, 0.018, 0.017], [side * 0.132, 0.83, 0.148], palette.seam, 0.006);
    block(body, [0.09, 0.011, 0.012], [side * 0.132, 0.844, 0.15], palette.lapel, 0.004);
  }
  block(body, [0.11, 0.017, 0.018], [-0.13, 1.04, 0.155], palette.seam, 0.004);
  block(body, [0.047, 0.037, 0.013], [-0.13, 1.062, 0.157], palette.shirt, 0.005);
  block(body, [0.031, 0.032, 0.018], [0, 1.155, 0.186], palette.tie, 0.007);
  panel(body, [[-0.013, 1.138], [0.013, 1.138], [0.02, 1.017], [0, 0.997], [-0.02, 1.017]], 0.18, palette.tie);
  for (const y of [0.94, 0.87]) block(body, [0.018, 0.018, 0.012], [0.018, y, 0.157], palette.leatherDark, 0.006);

  const armL = new THREE.Group();
  const armR = new THREE.Group();
  for (const [arm, side] of [[armL, -1], [armR, 1]] as const) {
    arm.position.set(side * 0.265, 1.135, 0);
    body.add(arm);
    const sleeve = block(arm, [0.155, 0.43, 0.17], [0, -0.185, 0], palette.jacket, 0.06);
    sleeve.geometry = sleeve.geometry.clone();
    const sleevePositions = sleeve.geometry.getAttribute('position');
    for (let i = 0; i < sleevePositions.count; i++) {
      const t = (sleevePositions.getY(i) + 0.215) / 0.43;
      sleevePositions.setX(i, sleevePositions.getX(i) * (0.78 + 0.22 * t));
      sleevePositions.setZ(i, sleevePositions.getZ(i) * (0.8 + 0.2 * t) + 0.012 * (1 - t));
    }
    sleeve.geometry.computeVertexNormals();
    block(arm, [0.123, 0.034, 0.132], [0, -0.397, 0.01], palette.shirt, 0.012);
    block(arm, [0.105, 0.125, 0.115], [0, -0.465, 0.005], palette.skin, 0.035);
    for (const y of [-0.34, -0.37]) block(arm, [0.012, 0.012, 0.012], [side * 0.061, y, 0.025], palette.leatherDark, 0.004);
  }
  const bag = new THREE.Group();
  bag.position.set(-0.015, -0.69, 0.025);
  armL.add(bag);
  block(bag, [0.255, 0.245, 0.095], [0, 0, 0], palette.leather, 0.025);
  block(bag, [0.23, 0.10, 0.018], [0, 0.071, 0.052], '#a37c59', 0.018);
  block(bag, [0.035, 0.04, 0.012], [0, 0.02, 0.066], '#c8ae80', 0.006);
  block(bag, [0.11, 0.018, 0.03], [0, 0.17, 0], palette.leatherDark, 0.008);
  for (const side of [-1, 1]) block(bag, [0.018, 0.055, 0.025], [side * 0.047, 0.14, 0], palette.leatherDark, 0.006);
  batch(bag);
  batch(armL); batch(armR);

  const head = new THREE.Group();
  head.position.y = 1.415;
  body.add(head);
  block(head, [0.13, 0.14, 0.13], [0, -0.225, 0], palette.skin, 0.035);
  const skull = block(head, [0.405, 0.445, 0.36], [0, 0, 0], palette.skin, 0.105);
  const skullGeometry = new THREE.SphereGeometry(1, 16, 12);
  const skullPositions = skullGeometry.getAttribute('position');
  for (let i = 0; i < skullPositions.count; i++) {
    const x = skullPositions.getX(i), y = skullPositions.getY(i), z = skullPositions.getZ(i);
    skullPositions.setXYZ(i,
      Math.sign(x) * Math.abs(x) ** 0.72 * 0.213 * (1 - 0.12 * Math.max(0, -y)),
      Math.sign(y) * Math.abs(y) ** 0.8 * 0.225 + 0.015,
      Math.sign(z) * Math.abs(z) ** 0.72 * 0.185,
    );
  }
  skullGeometry.computeVertexNormals();
  skull.geometry = skullGeometry;
  for (const side of [-1, 1]) {
    block(head, [0.04, 0.075, 0.055], [side * 0.206, 0.005, 0.005], palette.skin, 0.018);
    block(head, [0.018, 0.037, 0.024], [side * 0.222, 0.005, 0.016], '#d29b79', 0.01);
  }
  block(head, [0.045, 0.052, 0.044], [0, -0.007, 0.189], palette.skin, 0.019);
  // A single scalp-conforming cap with an asymmetric hairline and a shallow side part.
  const hairGeometry = new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  const hairPositions = hairGeometry.getAttribute('position');
  const hairPoint = (t: number, phi: number): THREE.Vector3 => {
    const front = Math.max(0, Math.sin(phi));
    const theta = t * (1.61 - 0.50 * front + 0.08 * front * Math.cos(phi));
    const hx = Math.sin(theta) * Math.cos(phi), hy = Math.cos(theta), hz = Math.sin(theta) * Math.sin(phi);
    const part = 0.009 * Math.exp(-(((hx - 0.30) / 0.10) ** 2)) * front * Math.sin(theta);
    return new THREE.Vector3(
      Math.sign(hx) * Math.abs(hx) ** 0.72 * 0.219,
      Math.sign(hy) * Math.abs(hy) ** 0.8 * 0.238 + 0.021 + front * Math.sin(theta) * 0.017 - part,
      Math.sign(hz) * Math.abs(hz) ** 0.72 * 0.193,
    );
  };
  for (let i = 0; i < hairPositions.count; i++) {
    const phi = Math.atan2(hairPositions.getZ(i), hairPositions.getX(i));
    const t = Math.acos(THREE.MathUtils.clamp(hairPositions.getY(i), 0, 1)) / (Math.PI / 2);
    const point = hairPoint(t, phi);
    hairPositions.setXYZ(i, point.x, point.y, point.z);
  }
  hairGeometry.computeVertexNormals();
  head.add(new THREE.Mesh(hairGeometry, mat(palette.hair)));
  const partPoints = Array.from({ length: 7 }, (_, i) => hairPoint(0.28 + i / 6 * 0.65, 0.95).multiplyScalar(1.009));
  const partCurve = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(partPoints), 12, 0.002, 4, false);
  head.add(new THREE.Mesh(partCurve, mat('#35271f')));
  const eyes: THREE.Group[] = [];
  const brows: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(side * 0.084, 0.053, 0.183);
    head.add(eye);
    block(eye, [0.071, 0.049, 0.016], [0, 0, 0], '#f8eedf', 0.019);
    block(eye, [0.033, 0.041, 0.013], [-side * 0.004, -0.001, 0.01], '#49382e', 0.013);
    block(eye, [0.011, 0.011, 0.005], [-0.006, 0.008, 0.019], '#fff4df', 0.004);
    batch(eye); eyes.push(eye);
    brows.push(block(head, [0.067, 0.012, 0.016], [side * 0.084, 0.112, 0.182], palette.hair, 0.005));
  }
  // Keep the animated brows out of the static head batch.
  for (const brow of brows) brow.userData.dynamic = true;
  const smile = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.035, -0.070, 0.182), new THREE.Vector3(0, -0.079, 0.185), new THREE.Vector3(0.035, -0.066, 0.182),
  ]), 8, 0.0045, 4, false), mat('#8e5743'));
  const mouthFlat = block(head, [0.059, 0.009, 0.01], [0, -0.074, 0.185], '#8e5743', 0.004);
  head.add(smile);
  mouthFlat.visible = false;
  // Explicit list avoids baking the expression meshes into the neutral face.
  mergeStaticMeshesToVertexColor(head.children.filter((child): child is THREE.Mesh =>
    child instanceof THREE.Mesh && !brows.includes(child) && child !== smile && child !== mouthFlat,
  ), head, VERTEX_COLOR_MATERIAL);
  batch(body);

  const carry = new THREE.Group();
  carry.position.set(0, 0.93, 0.31);
  body.add(carry);
  const parcel = block(carry, [0.34, 0.30, 0.26], [0, 0, 0], '#d8b98a', 0.035);
  const carryMaterial = (parcel.material as THREE.MeshLambertMaterial).clone();
  parcel.material = carryMaterial;
  const decal = createParcelTopDecal(); decal.position.y = 0.156; carry.add(decal);
  carry.visible = false;
  root.scale.setScalar(options.scale ?? 1);
  let carrying = false;
  let blink = 0;
  let blinkDelay = 3.4;
  return {
    root, body, head, armL, armR, legL, legR,
    setCarry(visible, color) {
      carrying = visible; carry.visible = visible; bag.visible = !visible;
      if (color) carryMaterial.color.set(color);
    },
    update(dt, moving, time, mood = 'idle') {
      const swing = Math.sin(time * 9);
      legL.rotation.x = moving ? swing * 0.5 : 0;
      legR.rotation.x = moving ? -swing * 0.5 : 0;
      body.position.y = moving ? Math.abs(swing) * 0.024 : Math.sin(time * 1.8) * 0.005;
      body.rotation.z = moving ? swing * 0.014 : Math.sin(time * 0.8) * 0.005;
      head.rotation.y = moving ? 0 : Math.sin(time * 0.6) * 0.07;
      head.rotation.z = mood === 'impatient' ? -0.035 : 0;
      armL.rotation.x = carrying ? -1.02 : moving ? -swing * 0.33 : -0.03;
      armR.rotation.x = carrying ? -1.02 : moving ? swing * 0.33 : 0.025;
      armL.rotation.z = carrying ? -0.06 : 0.025;
      armR.rotation.z = carrying ? 0.06 : -0.025;
      blinkDelay -= dt;
      if (blinkDelay <= 0) { blink = 0.11; blinkDelay = 3.4; }
      blink = Math.max(0, blink - dt);
      for (const eye of eyes) eye.scale.y = blink > 0 ? 0.12 : mood === 'angry' ? 0.65 : 1;
      for (let i = 0; i < brows.length; i++) brows[i].rotation.z = (i ? 1 : -1) * (mood === 'angry' ? 0.22 : mood === 'impatient' ? 0.1 : 0.035);
      smile.visible = mood === 'idle'; mouthFlat.visible = mood !== 'idle';
    },
  };
}
