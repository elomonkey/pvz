import * as THREE from 'three';
import type { PersonOptions, PersonRig } from './characters';
import { mergeStaticMeshesToVertexColor, roundedBox, VERTEX_COLOR_MATERIAL } from './kit';
import { cachedGeometry, contactShadow, createParcelTopDecal, mat } from './primitives';
import { createPersonDisposer, MAX_CARRY_PARCELS } from './personResources';

/** One flat bevel per edge: 44 triangles, rather than a subdivided rounded box. */
function chamferedBox(w: number, h: number, d: number, radius: number): THREE.BufferGeometry {
  return cachedGeometry(`office-chamfer:${w}:${h}:${d}:${radius}`, () => {
    const half = [w / 2, h / 2, d / 2];
    const r = Math.min(radius * 0.72, Math.min(w, h, d) * 0.45);
    const core = half.map((value) => value - r);
    const positions: number[] = [],
      normals: number[] = [],
      uv: number[] = [];
    const face = (points: THREE.Vector3[], normal: THREE.Vector3): void => {
      const cross = new THREE.Vector3()
        .subVectors(points[1], points[0])
        .cross(new THREE.Vector3().subVectors(points[2], points[0]));
      if (cross.dot(normal) < 0) points.reverse();
      for (let i = 1; i < points.length - 1; i++) {
        for (const point of [points[0], points[i], points[i + 1]]) {
          positions.push(point.x, point.y, point.z);
          const smooth = new THREE.Vector3(
            point.x - THREE.MathUtils.clamp(point.x, -core[0], core[0]),
            point.y - THREE.MathUtils.clamp(point.y, -core[1], core[1]),
            point.z - THREE.MathUtils.clamp(point.z, -core[2], core[2]),
          ).normalize();
          normals.push(smooth.x, smooth.y, smooth.z);
          uv.push(0, 0);
        }
      }
    };
    for (let axis = 0; axis < 3; axis++) {
      const b = (axis + 1) % 3,
        c = (axis + 2) % 3;
      for (const sign of [-1, 1]) {
        const points = [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ].map(([sb, sc]) => {
          const point = new THREE.Vector3();
          point.setComponent(axis, sign * half[axis]);
          point.setComponent(b, sb * core[b]);
          point.setComponent(c, sc * core[c]);
          return point;
        });
        face(points, new THREE.Vector3().setComponent(axis, sign));
      }
      for (const sb of [-1, 1])
        for (const sc of [-1, 1]) {
          const points = [
            [-1, false],
            [1, false],
            [1, true],
            [-1, true],
          ].map(([sa, second]) => {
            const point = new THREE.Vector3().setComponent(axis, Number(sa) * core[axis]);
            point.setComponent(b, sb * (second ? core[b] : half[b]));
            point.setComponent(c, sc * (second ? half[c] : core[c]));
            return point;
          });
          face(points, new THREE.Vector3().setComponent(b, sb).setComponent(c, sc).normalize());
        }
    }
    for (const sx of [-1, 1])
      for (const sy of [-1, 1])
        for (const sz of [-1, 1]) {
          face(
            [
              new THREE.Vector3(sx * half[0], sy * core[1], sz * core[2]),
              new THREE.Vector3(sx * core[0], sy * half[1], sz * core[2]),
              new THREE.Vector3(sx * core[0], sy * core[1], sz * half[2]),
            ],
            new THREE.Vector3(sx, sy, sz).normalize(),
          );
        }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return geometry;
  });
}

export const CHARACTER_STYLES = [
  'student',
  'mom',
  'courier',
  'elderly',
  'blogger',
  'office',
  'player',
] as const;
export type CharacterStyle = (typeof CHARACTER_STYLES)[number];
export function isCharacterStyle(value: string): value is CharacterStyle {
  return (CHARACTER_STYLES as readonly string[]).includes(value);
}

const PROFILES: Record<
  CharacterStyle,
  {
    width: number;
    depth: number;
    upper: number;
    leg: number;
    legWidth: number;
    head: number;
    lean: number;
    gait: number;
  }
> = {
  office: { width: 1, depth: 1, upper: 1, leg: 0.55, legWidth: 1, head: 1, lean: 0, gait: 8.8 },
  student: {
    width: 0.9,
    depth: 0.95,
    upper: 0.98,
    leg: 0.56,
    legWidth: 0.9,
    head: 0.98,
    lean: 0.015,
    gait: 9.4,
  },
  mom: { width: 1.1, depth: 1.06, upper: 1, leg: 0.52, legWidth: 1.03, head: 1.02, lean: 0, gait: 8.2 },
  courier: {
    width: 0.94,
    depth: 0.96,
    upper: 1.03,
    leg: 0.57,
    legWidth: 0.94,
    head: 0.98,
    lean: 0.025,
    gait: 9.8,
  },
  elderly: {
    width: 1.22,
    depth: 1.15,
    upper: 0.94,
    leg: 0.46,
    legWidth: 1.06,
    head: 1.02,
    lean: 0.045,
    gait: 6.6,
  },
  blogger: {
    width: 0.89,
    depth: 0.94,
    upper: 1.03,
    leg: 0.57,
    legWidth: 0.88,
    head: 0.99,
    lean: 0,
    gait: 8.9,
  },
  player: { width: 1.02, depth: 1, upper: 1, leg: 0.55, legWidth: 1, head: 1, lean: 0, gait: 8.8 },
};

/** Shared low-poly rig; wardrobe, proportions, hair and props define each identity. */
export function createStyledPerson(options: PersonOptions, style: CharacterStyle): PersonRig {
  const profile = PROFILES[style];
  const root = new THREE.Group();
  const body = new THREE.Group();
  const ownedGeometries = new Set<THREE.BufferGeometry>();
  const ownedMaterials = new Set<THREE.Material>();
  const temporaryGeometries = new Set<THREE.BufferGeometry>();
  root.add(body, contactShadow(0.43, 0.29, 0.18));
  const palette = {
    jacket:
      style === 'office'
        ? '#647d8e'
        : style === 'blogger'
          ? '#916d9d'
          : style === 'courier'
            ? '#d7aa53'
            : options.coat,
    lapel: '#738b9a',
    seam: '#506879',
    trousers: style === 'office' ? '#35444f' : options.pants,
    shirt: '#f1e8da',
    tie: '#789783',
    leather: '#90694c',
    leatherDark: '#654a38',
    sole: '#403a34',
    skin: options.skin,
    hair: style === 'office' ? '#493327' : options.hair,
    ink: '#39322f',
  };
  const accent =
    style === 'courier' ? '#7399ba' : style === 'blogger' ? '#82adb4' : (options.accent ?? '#dfbc75');
  const shoeColor =
    style === 'student' || style === 'courier'
      ? '#526474'
      : style === 'blogger'
        ? '#4e414f'
        : palette.leatherDark;
  const soleColor = style === 'student' || style === 'courier' ? '#e1dbcc' : palette.sole;
  const block = (
    parent: THREE.Group,
    size: [number, number, number],
    position: [number, number, number],
    color: string,
    radius = 0.025,
    soft = false,
  ): THREE.Mesh => {
    const mesh = soft
      ? roundedBox(...size, color, { radius, segments: 1 })
      : new THREE.Mesh(
          radius >= 0.015 && Math.min(...size) >= 0.03
            ? chamferedBox(...size, radius)
            : cachedGeometry(`character-box:${size.join(':')}`, () => new THREE.BoxGeometry(...size)),
          mat(color),
        );
    mesh.position.set(...position);
    parent.add(mesh);
    return mesh;
  };
  const batch = (group: THREE.Group): void => {
    const merged = mergeStaticMeshesToVertexColor(
      group.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh),
      group,
      VERTEX_COLOR_MATERIAL,
    );
    if (merged) ownedGeometries.add(merged.geometry);
  };
  const panel = (parent: THREE.Group, outline: [number, number][], z: number, color: string): THREE.Mesh => {
    const shape = new THREE.Shape();
    shape.moveTo(...outline[0]);
    for (const point of outline.slice(1)) shape.lineTo(...point);
    shape.closePath();
    const geometry = new THREE.ShapeGeometry(shape);
    temporaryGeometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, mat(color));
    mesh.position.z = z + 0.008;
    parent.add(mesh);
    return mesh;
  };

  const legL = new THREE.Group();
  const legR = new THREE.Group();
  for (const [leg, side] of [
    [legL, -1],
    [legR, 1],
  ] as const) {
    leg.position.set(side * 0.112 * profile.width, profile.leg, 0);
    leg.scale.set(profile.legWidth, profile.leg / 0.55, 1);
    root.add(leg);
    const trouser = block(leg, [0.175, 0.47, 0.19], [0, -0.225, 0], palette.trousers, 0.035);
    trouser.geometry = trouser.geometry.clone();
    temporaryGeometries.add(trouser.geometry);
    const positions = trouser.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const taper = 0.82 + (0.18 * (positions.getY(i) + 0.235)) / 0.47;
      positions.setX(i, positions.getX(i) * taper);
    }
    // Keep the bevel normals across the low-poly silhouette taper.
    block(leg, [0.15, 0.035, 0.198], [0, -0.432, 0], palette.seam, 0.008);
    block(leg, [0.19, 0.105, 0.295], [0, -0.495, 0.042], shoeColor, 0.042, true);
    block(leg, [0.195, 0.025, 0.3], [0, -0.538, 0.042], soleColor, 0.012, true);
    block(leg, [0.17, 0.018, 0.275], [0, -0.52, 0.042], palette.leather, 0.008);
    batch(leg);
  }

  block(body, [0.38, 0.1, 0.27], [0, 0.59, 0], palette.trousers, 0.035);
  const longCoat = style === 'mom' || style === 'elderly';
  const torso = block(
    body,
    [0.49, longCoat ? 0.65 : 0.61, 0.305],
    [0, longCoat ? 0.88 : 0.9, 0],
    palette.jacket,
    0.065,
  );
  torso.geometry = torso.geometry.clone();
  temporaryGeometries.add(torso.geometry);
  const torsoPositions = torso.geometry.getAttribute('position');
  for (let i = 0; i < torsoPositions.count; i++) {
    const y = torsoPositions.getY(i);
    const x = torsoPositions.getX(i);
    const waist =
      style === 'elderly'
        ? 1.02 + 0.06 * Math.cos(y * 6)
        : style === 'mom'
          ? 0.88 + (0.1 * (0.3 - y)) / 0.65
          : 0.92 - 0.055 * Math.exp(-(((y + 0.055) / 0.16) ** 2));
    torsoPositions.setX(i, x * waist);
    // Sloped shoulders instead of the horizontal slab across the old jacket.
    if (y > 0.18) torsoPositions.setY(i, y - 0.045 * (Math.abs(x) / 0.245) ** 1.5);
  }
  if (style === 'office') {
    panel(
      body,
      [
        [-0.085, 1.193],
        [0.085, 1.193],
        [0.025, 0.997],
        [-0.025, 0.997],
      ],
      0.155,
      palette.shirt,
    );
    for (const side of [-1, 1]) {
      const lapelOutline: [number, number][] = [
        [0.045, 1.193],
        [0.125, 1.166],
        [0.105, 1.136],
        [0.145, 1.113],
        [0.024, 0.975],
        [0.055, 1.085],
      ];
      panel(
        body,
        lapelOutline.map(([x, y]) => [side * x, y]),
        0.166,
        palette.lapel,
      );
      panel(
        body,
        [
          [side * 0.073, 1.197],
          [side * 0.012, 1.18],
          [side * 0.035, 1.137],
        ],
        0.177,
        palette.shirt,
      );
      block(body, [0.105, 0.018, 0.017], [side * 0.132, 0.83, 0.148], palette.seam, 0.006);
      block(body, [0.09, 0.011, 0.012], [side * 0.132, 0.844, 0.15], palette.lapel, 0.004);
    }
    block(body, [0.11, 0.017, 0.018], [-0.13, 1.04, 0.155], palette.seam, 0.004);
    block(body, [0.047, 0.037, 0.013], [-0.13, 1.062, 0.157], palette.shirt, 0.005);
    block(body, [0.031, 0.032, 0.018], [0, 1.155, 0.186], palette.tie, 0.007);
    panel(
      body,
      [
        [-0.013, 1.138],
        [0.013, 1.138],
        [0.02, 1.017],
        [0, 0.997],
        [-0.02, 1.017],
      ],
      0.18,
      palette.tie,
    );
    for (const y of [0.94, 0.87])
      block(body, [0.018, 0.018, 0.012], [0.018, y, 0.157], palette.leatherDark, 0.006);
  } else if (style === 'student') {
    // Hood lining and a low kangaroo pocket keep the student silhouette casual.
    block(body, [0.28, 0.12, 0.13], [0, 1.16, -0.13], palette.shirt, 0.045);
    panel(
      body,
      [
        [-0.09, 1.18],
        [0.09, 1.18],
        [0, 1.08],
      ],
      0.16,
      palette.shirt,
    );
    block(body, [0.25, 0.13, 0.025], [0, 0.78, 0.16], '#587e9d', 0.018);
    for (const side of [-1, 1]) {
      block(body, [0.012, 0.13, 0.012], [side * 0.052, 1.07, 0.174], palette.shirt, 0.004);
      block(body, [0.04, 0.43, 0.025], [side * 0.16, 0.97, 0.15], accent, 0.008);
    }
    block(body, [0.34, 0.39, 0.15], [0, 0.91, -0.22], accent, 0.04);
    block(body, [0.27, 0.14, 0.035], [0, 0.82, -0.308], '#bd995f', 0.015);
  } else if (longCoat) {
    panel(
      body,
      [
        [-0.087, 1.185],
        [0.087, 1.185],
        [0.065, 0.64],
        [-0.065, 0.64],
      ],
      0.158,
      palette.shirt,
    );
    for (const side of [-1, 1]) {
      panel(
        body,
        [
          [side * 0.075, 1.19],
          [side * 0.13, 1.14],
          [side * 0.08, 0.66],
          [side * 0.04, 0.66],
        ],
        0.169,
        palette.jacket,
      );
      block(body, [0.11, 0.1, 0.018], [side * 0.14, 0.75, 0.158], palette.jacket, 0.012);
      block(body, [0.1, 0.013, 0.014], [side * 0.14, 0.802, 0.17], accent, 0.004);
    }
    for (const y of [1.01, 0.9, 0.79])
      block(body, [0.017, 0.017, 0.012], [0.067, y, 0.181], palette.leather, 0.004);
    if (style === 'elderly') {
      panel(
        body,
        [
          [-0.09, 1.19],
          [0.09, 1.19],
          [0.01, 1.06],
          [-0.05, 1.06],
        ],
        0.182,
        '#b66e62',
      );
    }
  } else {
    panel(
      body,
      [
        [-0.075, 1.19],
        [0.075, 1.19],
        [0.045, 1.04],
        [-0.045, 1.04],
      ],
      0.16,
      palette.shirt,
    );
    block(
      body,
      [0.012, 0.45, 0.015],
      [0, 0.87, 0.166],
      style === 'blogger' ? palette.leatherDark : palette.shirt,
      0.004,
    );
    for (const side of [-1, 1]) {
      panel(
        body,
        [
          [side * 0.045, 1.19],
          [side * 0.13, 1.15],
          [side * 0.05, 1.04],
        ],
        0.18,
        palette.jacket,
      );
      block(body, [0.105, 0.085, 0.017], [side * 0.13, 1.015, 0.16], palette.jacket, 0.009);
      block(body, [0.11, 0.022, 0.023], [side * 0.13, 1.055, 0.17], accent, 0.005);
    }
    if (style === 'player') {
      for (const side of [-1, 1]) {
        const strap = block(body, [0.012, 0.2, 0.012], [side * 0.035, 1.08, 0.19], accent, 0.003);
        strap.rotation.z = side * 0.28;
      }
      block(body, [0.075, 0.085, 0.014], [0, 0.94, 0.19], palette.shirt, 0.006);
      block(body, [0.045, 0.012, 0.008], [0, 0.958, 0.201], accent, 0.002);
    }
  }

  const armL = new THREE.Group();
  const armR = new THREE.Group();
  for (const [arm, side] of [
    [armL, -1],
    [armR, 1],
  ] as const) {
    arm.position.set(side * 0.265, 1.135, 0);
    body.add(arm);
    const sleeve = block(arm, [0.155, 0.43, 0.17], [0, -0.185, 0], palette.jacket, 0.06);
    sleeve.geometry = sleeve.geometry.clone();
    temporaryGeometries.add(sleeve.geometry);
    const sleevePositions = sleeve.geometry.getAttribute('position');
    for (let i = 0; i < sleevePositions.count; i++) {
      const t = (sleevePositions.getY(i) + 0.215) / 0.43;
      sleevePositions.setX(i, sleevePositions.getX(i) * (0.78 + 0.22 * t));
      sleevePositions.setZ(i, sleevePositions.getZ(i) * (0.8 + 0.2 * t) + 0.012 * (1 - t));
    }
    block(arm, [0.123, 0.034, 0.132], [0, -0.397, 0.01], palette.shirt, 0.012, true);
    block(arm, [0.105, 0.125, 0.115], [0, -0.465, 0.005], palette.skin, 0.035, true);
    block(arm, [0.032, 0.055, 0.05], [-side * 0.047, -0.45, 0.035], palette.skin, 0.008);
  }
  // Held props remain one opaque batch and make way for a two-handed parcel pose.
  const heldProp = new THREE.Group();
  const propArm = style === 'courier' || style === 'blogger' ? armR : armL;
  propArm.add(heldProp);
  heldProp.position.set(0, -0.47, 0.04);
  if (style === 'office' || style === 'mom') {
    heldProp.position.y = -0.69;
    const tote = style === 'mom';
    block(
      heldProp,
      [tote ? 0.28 : 0.255, tote ? 0.28 : 0.245, 0.095],
      [0, 0, 0],
      tote ? '#b6a078' : palette.leather,
      0.025,
    );
    block(heldProp, [0.23, 0.1, 0.018], [0, 0.071, 0.052], tote ? '#d4c39f' : '#a37c59', 0.018);
    if (!tote) block(heldProp, [0.035, 0.04, 0.012], [0, 0.02, 0.066], '#c8ae80', 0.006);
    block(heldProp, [0.11, 0.018, 0.03], [0, 0.17, 0], palette.leatherDark, 0.008);
    for (const side of [-1, 1])
      block(heldProp, [0.018, 0.055, 0.025], [side * 0.047, 0.14, 0], palette.leatherDark, 0.006);
  } else if (style === 'courier' || style === 'blogger') {
    const selfie = style === 'blogger';
    if (selfie) block(heldProp, [0.018, 0.46, 0.018], [0, 0.19, 0.04], palette.ink, 0.004);
    block(heldProp, [0.09, 0.15, 0.023], [0, selfie ? 0.46 : 0.02, 0.055], palette.ink, 0.012);
    block(heldProp, [0.066, 0.108, 0.006], [0, selfie ? 0.465 : 0.025, 0.07], '#a1c0c1', 0.002);
  } else if (style === 'elderly') {
    block(heldProp, [0.028, 0.69, 0.028], [0, -0.3, 0], palette.leatherDark, 0.008);
    block(heldProp, [0.1, 0.027, 0.035], [0.03, 0.05, 0], palette.leather, 0.009);
    block(heldProp, [0.042, 0.035, 0.042], [0, -0.65, 0], palette.ink, 0.01);
  }
  batch(heldProp);
  batch(armL);
  batch(armR);

  const head = new THREE.Group();
  head.position.y = 1.415;
  body.add(head);
  block(head, [0.13, 0.14, 0.13], [0, -0.225, 0], palette.skin, 0.035);
  const skull = block(head, [0.405, 0.445, 0.36], [0, 0, 0], palette.skin, 0.105);
  const skullGeometry = cachedGeometry('character-skull', () => {
    const geometry = new THREE.SphereGeometry(1, 16, 12);
    const skullPositions = geometry.getAttribute('position');
    for (let i = 0; i < skullPositions.count; i++) {
      const x = skullPositions.getX(i),
        y = skullPositions.getY(i),
        z = skullPositions.getZ(i);
      skullPositions.setXYZ(
        i,
        Math.sign(x) * Math.abs(x) ** 0.72 * 0.213 * (1 - 0.12 * Math.max(0, -y)),
        Math.sign(y) * Math.abs(y) ** 0.8 * 0.225 + 0.015,
        Math.sign(z) * Math.abs(z) ** 0.72 * 0.185,
      );
    }
    geometry.computeVertexNormals();
    return geometry;
  });
  skull.geometry = skullGeometry;
  for (const side of [-1, 1]) {
    block(head, [0.04, 0.075, 0.055], [side * 0.206, 0.005, 0.005], palette.skin, 0.018, true);
    block(head, [0.018, 0.037, 0.024], [side * 0.222, 0.005, 0.016], '#d29b79', 0.01);
  }
  block(head, [0.045, 0.052, 0.044], [0, -0.007, 0.189], palette.skin, 0.019, true);
  // A single scalp-conforming cap with an asymmetric hairline and a shallow side part.

  const hairPoint = (t: number, phi: number): THREE.Vector3 => {
    const front = Math.max(0, Math.sin(phi));
    const theta = t * (1.61 - 0.5 * front + 0.08 * front * Math.cos(phi));
    const hx = Math.sin(theta) * Math.cos(phi),
      hy = Math.cos(theta),
      hz = Math.sin(theta) * Math.sin(phi);
    const part = 0.009 * Math.exp(-(((hx - 0.3) / 0.1) ** 2)) * front * Math.sin(theta);
    return new THREE.Vector3(
      Math.sign(hx) * Math.abs(hx) ** 0.72 * 0.219,
      Math.sign(hy) * Math.abs(hy) ** 0.8 * 0.238 + 0.021 + front * Math.sin(theta) * 0.017 - part,
      Math.sign(hz) * Math.abs(hz) ** 0.72 * 0.193,
    );
  };
  const hairGeometry = cachedGeometry('character-hair-cap', () => {
    const geometry = new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    const positions = geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const phi = Math.atan2(positions.getZ(i), positions.getX(i));
      const t = Math.acos(THREE.MathUtils.clamp(positions.getY(i), 0, 1)) / (Math.PI / 2);
      const point = hairPoint(t, phi);
      positions.setXYZ(i, point.x, point.y, point.z);
    }
    geometry.computeVertexNormals();
    return geometry;
  });
  head.add(new THREE.Mesh(hairGeometry, mat(palette.hair)));
  const cap = style === 'courier' || style === 'player';
  if (!cap) {
    const partCurve = cachedGeometry(
      'character-hair-part',
      () =>
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(
            Array.from({ length: 7 }, (_, i) => hairPoint(0.28 + (i / 6) * 0.65, 0.95).multiplyScalar(1.009)),
          ),
          8,
          0.002,
          3,
          false,
        ),
    );
    head.add(new THREE.Mesh(partCurve, mat(palette.hair)));
  }
  if (style === 'mom' || style === 'blogger') {
    const long = style === 'blogger';
    block(head, [0.4, long ? 0.49 : 0.24, 0.12], [0, long ? -0.1 : 0.01, -0.16], palette.hair, 0.045);
    for (const side of [-1, 1]) {
      const lock = block(
        head,
        [0.064, long ? 0.44 : 0.2, 0.15],
        [side * 0.193, long ? -0.08 : 0.015, -0.005],
        palette.hair,
        0.025,
      );
      lock.rotation.z = side * (long ? 0.04 : -0.09);
      block(head, [0.025, 0.045, 0.025], [side * 0.225, -0.067, 0.035], accent, 0.01);
    }
  }
  if (style === 'elderly') {
    const bun = new THREE.Mesh(
      cachedGeometry('character-bun', () => new THREE.SphereGeometry(1, 10, 6)),
      mat(palette.hair),
    );
    bun.scale.set(0.11, 0.115, 0.11);
    bun.position.set(0, 0.15, -0.18);
    head.add(bun);
  }
  if (cap) {
    const crown = new THREE.Mesh(
      cachedGeometry('character-cap-crown', () =>
        new THREE.SphereGeometry(1, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.236, 0.14, 0.208),
      ),
      mat(style === 'courier' ? accent : '#d8ad53'),
    );
    crown.position.set(0, 0.145, -0.005);
    head.add(crown);
    block(head, [0.39, 0.035, 0.23], [0, 0.137, 0.19], style === 'courier' ? '#587c98' : '#b58b3c', 0.025);
    block(head, [0.065, 0.045, 0.012], [0, 0.22, 0.196], palette.shirt, 0.006);
  }
  if (style === 'student') {
    const band = new THREE.Mesh(
      cachedGeometry('character-headphone-band', () => new THREE.TorusGeometry(0.235, 0.015, 3, 10, Math.PI)),
      mat('#465763'),
    );
    band.position.set(0, 0.03, -0.015);
    head.add(band);
    for (const side of [-1, 1]) {
      block(head, [0.055, 0.105, 0.09], [side * 0.231, 0.025, 0], palette.ink, 0.02);
      block(head, [0.018, 0.067, 0.06], [side * 0.262, 0.025, 0], accent, 0.008);
    }
  }
  if (style === 'elderly') {
    for (const side of [-1, 1]) {
      const rim = new THREE.Mesh(
        cachedGeometry('character-glasses-rim', () => new THREE.RingGeometry(0.74, 1, 10)),
        mat('#706454'),
      );
      rim.scale.set(0.046, 0.037, 1);
      rim.position.set(side * 0.084, 0.053, 0.215);
      head.add(rim);
      block(head, [0.07, 0.012, 0.014], [side * 0.157, 0.063, 0.194], '#706454', 0.003);
    }
    block(head, [0.08, 0.012, 0.014], [0, 0.058, 0.214], '#706454', 0.003);
  }
  const eyes: THREE.Group[] = [];

  const eyeDisc = (
    parent: THREE.Group,
    width: number,
    height: number,
    position: [number, number, number],
    color: string,
    segments: number,
  ): void => {
    const geometry = cachedGeometry(`office-eye:${width}:${height}:${segments}`, () =>
      new THREE.CircleGeometry(1, segments).scale(width / 2, height / 2, 1),
    );
    const mesh = new THREE.Mesh(geometry, mat(color));
    mesh.position.set(...position);
    parent.add(mesh);
  };
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(side * 0.084, 0.053, 0.183);
    head.add(eye);
    eyeDisc(eye, 0.071, 0.049, [0, 0, 0.008], '#f8eedf', 12);
    eyeDisc(eye, 0.033, 0.041, [-side * 0.004, -0.001, 0.017], '#49382e', 10);
    eyeDisc(eye, 0.011, 0.011, [-0.006, 0.008, 0.022], '#fff4df', 6);
    batch(eye);
    eyes.push(eye);
  }
  // A cached pair per expression: one call, no per-frame geometry upload.
  const browGeometries = ['idle', 'impatient', 'angry'].map((mood) =>
    cachedGeometry(`character-brows:${mood}`, () => {
      const group = new THREE.Group();
      for (const side of [-1, 1]) {
        const brow = block(
          group,
          [0.067, 0.012, 0.016],
          [side * 0.084, mood === 'angry' ? 0.104 : 0.112, 0.193],
          '#ffffff',
          0.005,
        );
        brow.rotation.z = side * (mood === 'angry' ? 0.22 : mood === 'impatient' ? 0.1 : 0.035);
      }
      return mergeStaticMeshesToVertexColor(group.children as THREE.Mesh[], group, VERTEX_COLOR_MATERIAL)!
        .geometry;
    }),
  );
  const brows = new THREE.Mesh(browGeometries[0], mat(palette.hair));
  head.add(brows);
  const smile = new THREE.Mesh(
    cachedGeometry(
      'character-smile',
      () =>
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3([
            new THREE.Vector3(-0.035, -0.07, 0.182),
            new THREE.Vector3(0, -0.079, 0.185),
            new THREE.Vector3(0.035, -0.066, 0.182),
          ]),
          6,
          0.0045,
          3,
          false,
        ),
    ),
    mat('#8e5743'),
  );
  const mouthFlat = block(head, [0.059, 0.009, 0.01], [0, -0.074, 0.185], '#8e5743', 0.004);
  head.add(smile);
  mouthFlat.visible = false;
  // Explicit list avoids baking the expression meshes into the neutral face.
  const mergedHead = mergeStaticMeshesToVertexColor(
    head.children.filter(
      (child): child is THREE.Mesh =>
        child instanceof THREE.Mesh && child !== brows && child !== smile && child !== mouthFlat,
    ),
    head,
    VERTEX_COLOR_MATERIAL,
  );
  if (mergedHead) ownedGeometries.add(mergedHead.geometry);
  batch(body);

  const carry = new THREE.Group();
  carry.position.set(0, 0.93, 0.31);
  body.add(carry);
  const resourceMaterials: THREE.Material[] = [];
  let trackCarryMaterial = (material: THREE.MeshLambertMaterial): void => {
    ownedMaterials.add(material);
  };
  const parcel = block(carry, [0.34, 0.3, 0.26], [0, 0, 0], '#d8b98a', 0.035);
  const carryMaterials: THREE.MeshLambertMaterial[] = [];
  const carryMaterialAt = (index: number): THREE.MeshLambertMaterial => {
    let material = carryMaterials[index];
    if (!material) {
      material = (parcel.material as THREE.MeshLambertMaterial).clone();
      carryMaterials[index] = material;
      trackCarryMaterial(material);
    }
    return material;
  };
  parcel.material = carryMaterialAt(0);
  parcel.userData.carryParcel = 0;
  const carryParcels: THREE.Mesh[] = [parcel];
  const carryStep = 0.29;
  const ensureCarryParcels = (count: number): void => {
    while (carryParcels.length < Math.min(MAX_CARRY_PARCELS, count)) {
      const index = carryParcels.length;
      const stacked = new THREE.Mesh(parcel.geometry, carryMaterialAt(index));
      stacked.position.y = index * carryStep;
      stacked.userData.carryParcel = index;
      carry.add(stacked);
      carryParcels.push(stacked);
    }
  };
  const decal = createParcelTopDecal();
  decal.position.y = 0.156;
  carry.add(decal);
  carry.visible = false;
  resourceMaterials.push(...ownedMaterials);
  trackCarryMaterial = (material: THREE.MeshLambertMaterial): void => {
    ownedMaterials.add(material);
    resourceMaterials.push(material);
  };
  root.scale.setScalar(options.scale ?? 1);
  body.scale.set(profile.width, profile.upper, profile.depth);
  const baseY = profile.leg - 0.55 * profile.upper;
  body.position.y = baseY;
  head.scale.set(profile.head / profile.width, profile.head / profile.upper, profile.head / profile.depth);
  // Only per-instance merge outputs and the carry colour clones; never shared caches.
  const resources = { geometries: [...ownedGeometries], materials: resourceMaterials };
  body.userData.personResources = resources;
  for (const geometry of temporaryGeometries) geometry.dispose();
  let carrying = false,
    phase = 0,
    blink = 0,
    blinkDelay = 2.8 + CHARACTER_STYLES.indexOf(style) * 0.19;
  const offset = CHARACTER_STYLES.indexOf(style) * 0.73;
  return {
    root,
    body,
    head,
    armL,
    armR,
    legL,
    legR,
    dispose: createPersonDisposer(resources),
    setCarry(visible, color, count?) {
      carrying = visible;
      carry.visible = visible;
      heldProp.visible = !visible;
      const colors = typeof color === 'string' ? [color] : (color ?? []);
      const requested = count ?? (typeof color === 'string' || !color ? 1 : color.length);
      const amount = visible
        ? Math.max(1, Math.min(MAX_CARRY_PARCELS, Math.floor(requested)))
        : 0;
      if (visible) ensureCarryParcels(amount);
      for (let index = 0; index < amount; index++) {
        const value = colors[Math.min(index, colors.length - 1)];
        if (value) carryMaterials[index].color.set(value);
      }
      for (let index = 0; index < carryParcels.length; index++) {
        carryParcels[index].visible = index < amount;
      }
      decal.visible = amount > 0;
      decal.position.y = 0.156 + Math.max(0, amount - 1) * carryStep;
    },
    update(dt, moving, time, mood = 'idle') {
      phase += dt * profile.gait;
      const swing = Math.sin(phase),
        breath = Math.sin(time * 1.8 + offset);
      const stride = style === 'elderly' ? 0.32 : 0.48;
      legL.rotation.x = moving ? swing * stride : 0;
      legR.rotation.x = moving ? -swing * stride : 0;
      body.position.y = baseY + (moving ? Math.abs(swing) * 0.022 : breath * 0.005);
      body.rotation.x = profile.lean + (moving ? 0.025 : 0);
      body.rotation.z = moving ? swing * 0.014 : Math.sin(time * 0.8 + offset) * 0.005;
      head.rotation.y = moving ? Math.sin(phase * 0.5) * 0.025 : Math.sin(time * 0.6 + offset) * 0.07;
      head.rotation.x = style === 'elderly' ? -0.035 : 0;
      head.rotation.z = mood === 'impatient' ? -0.035 : Math.sin(time * 0.5 + offset) * 0.008;
      armL.rotation.x = moving ? -swing * 0.33 : -0.03;
      armR.rotation.x = moving ? swing * 0.33 : 0.025;
      armL.rotation.z = 0.025;
      armR.rotation.z = -0.025;
      if (style === 'courier' || style === 'blogger')
        propArm.rotation.x = -0.22 + (moving ? swing * 0.08 : 0);
      if (style === 'elderly') propArm.rotation.x = moving ? -swing * 0.12 : -0.04;
      if (mood !== 'idle' && !moving) {
        legR.rotation.x = Math.max(0, Math.sin(time * 9 + offset)) * 0.12;
        head.rotation.y = Math.sin(time * 1.5 + offset) * 0.055;
        armR.rotation.z = -0.1;
        if (mood === 'angry') body.rotation.z = Math.sin(time * 12 + offset) * 0.012;
      }
      if (carrying) {
        armL.rotation.x = -1.02 + (moving ? swing * 0.035 : 0);
        armR.rotation.x = -1.02 - (moving ? swing * 0.035 : 0);
        armL.rotation.z = 0.17;
        armR.rotation.z = -0.17;
        body.rotation.x = profile.lean + (moving ? 0.02 : -0.012);
      } else if (!moving && mood === 'idle') {
        const gesture = Math.max(0, Math.sin(time * 0.65 + offset) - 0.92) / 0.08;
        const freeArm = propArm === armR ? armL : armR;
        freeArm.rotation.x -= gesture * 0.12;
        freeArm.rotation.z += (freeArm === armL ? 1 : -1) * gesture * 0.1;
      }
      blinkDelay -= dt;
      if (blinkDelay <= 0) {
        blink = 0.14;
        blinkDelay = 3.1 + offset * 0.23;
      }
      blink = Math.max(0, blink - dt);
      const eyelid = blink > 0 ? Math.max(0.1, Math.abs((blink / 0.14) * 2 - 1)) : 1;
      for (const eye of eyes)
        eye.scale.y = eyelid * (mood === 'angry' ? 0.65 : mood === 'impatient' ? 0.85 : 1);
      brows.geometry = browGeometries[mood === 'angry' ? 2 : mood === 'impatient' ? 1 : 0];
      smile.visible = mood === 'idle';
      mouthFlat.visible = mood !== 'idle';
    },
  };
}
