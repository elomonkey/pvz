import * as THREE from 'three';
import type { PersonOptions, PersonRig } from './characters';
import { chamferedBox } from './characterRig';
import { mergeStaticMeshesToVertexColor, VERTEX_COLOR_MATERIAL } from './kit';
import {
  cachedGeometry,
  contactShadow,
  createParcelTopDecal,
  mat,
} from './primitives';
import { createPersonDisposer, MAX_CARRY_PARCELS } from './personResources';

type Mood = 'idle' | 'impatient' | 'angry';
type BossStyle = 'zina' | 'sanya';

export const createZinaPerson = (options: PersonOptions): PersonRig =>
  createQueueBoss(options, 'zina');
export const createSanyaPerson = (options: PersonOptions): PersonRig =>
  createQueueBoss(options, 'sanya');

/** Two distinct wardrobes/proportions, retaining the existing animated PersonRig contract. */
function createQueueBoss(options: PersonOptions, style: BossStyle): PersonRig {
  const zina = style === 'zina';
  const root = new THREE.Group(),
    body = new THREE.Group();
  body.name = `${style}-body`;
  root.scale.setScalar(options.scale ?? 1);
  root.add(body, contactShadow(zina ? 0.44 : 0.39, 0.29, 0.18));
  const owned: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const p = {
    coat: zina ? '#8592a8' : '#d8a13b',
    fold: zina ? '#66748d' : '#b77e2e',
    lapel: zina ? '#9aa4b5' : '#e1af4c',
    ink: '#302d31',
    skin: zina ? '#e6ba96' : '#dda87c',
    cream: '#f0dfbd',
    hair: zina ? '#c7c3be' : '#302a27',
    blue: '#3e6488',
    pants: zina ? '#514858' : '#35434f',
    shoe: zina ? '#554639' : '#3d4a54',
    sole: zina ? '#937652' : '#d9d4c6',
  };
  const block = (
    parent: THREE.Group,
    size: [number, number, number],
    at: [number, number, number],
    color: string,
    bevel = 0.02,
  ) => {
    const mesh = new THREE.Mesh(
      bevel
        ? chamferedBox(...size, bevel)
        : cachedGeometry(
            `queue-boss-box:${size}`,
            () => new THREE.BoxGeometry(...size),
          ),
      mat(color),
    );
    mesh.position.set(...at);
    parent.add(mesh);
    return mesh;
  };
  const panel = (
    parent: THREE.Group,
    points: [number, number][],
    at: [number, number, number],
    color: string,
    depth = 0,
  ) => {
    const geometry = cachedGeometry(
      `queue-boss-panel:${points}:${depth}`,
      () => {
        const shape = new THREE.Shape();
        shape.moveTo(...points[0]);
        for (const point of points.slice(1)) shape.lineTo(...point);
        shape.closePath();
        return depth
          ? new THREE.ExtrudeGeometry(shape, {
              depth,
              bevelEnabled: false,
              steps: 1,
            })
          : new THREE.ShapeGeometry(shape);
      },
    );
    const mesh = new THREE.Mesh(geometry, mat(color));
    mesh.position.set(...at);
    parent.add(mesh);
    return mesh;
  };
  const disc = (
    parent: THREE.Group,
    w: number,
    h: number,
    at: [number, number, number],
    color: string,
    segments = 8,
  ) => {
    const geometry = cachedGeometry(
      `queue-boss-disc:${w}:${h}:${segments}`,
      () => new THREE.CircleGeometry(1, segments).scale(w / 2, h / 2, 1),
    );
    const mesh = new THREE.Mesh(geometry, mat(color));
    mesh.position.set(...at);
    parent.add(mesh);
    return mesh;
  };
  const facet = (
    parent: THREE.Group,
    size: [number, number, number],
    at: [number, number, number],
    color: string,
  ) => {
    const mesh = new THREE.Mesh(
      cachedGeometry(
        'queue-boss-ico',
        () => new THREE.IcosahedronGeometry(1, 0),
      ),
      mat(color),
    );
    mesh.scale.set(...size);
    mesh.position.set(...at);
    parent.add(mesh);
    return mesh;
  };
  const batch = (parent: THREE.Group) => {
    const mesh = mergeStaticMeshesToVertexColor(
      parent.children.filter((o): o is THREE.Mesh => o instanceof THREE.Mesh),
      parent,
      VERTEX_COLOR_MATERIAL,
    );
    if (mesh) owned.push(mesh.geometry);
  };

  const legLength = zina ? 0.36 : 0.56,
    hip = legLength + 0.11;
  const legL = new THREE.Group(),
    legR = new THREE.Group();
  for (const [leg, side] of [
    [legL, -1],
    [legR, 1],
  ] as const) {
    leg.position.set(side * (zina ? 0.125 : 0.12), hip, 0);
    root.add(leg);
    const trouser = block(
      leg,
      [zina ? 0.19 : 0.17, legLength, 0.21],
      [0, -legLength / 2, 0],
      p.pants,
      0.025,
    );
    trouser.geometry = cachedGeometry(`queue-boss-trouser:${style}`, () => {
      const g = trouser.geometry.clone(),
        positions = g.getAttribute('position');
      for (let i = 0; i < positions.count; i++)
        positions.setX(
          i,
          positions.getX(i) *
            (0.85 + (0.15 * (positions.getY(i) + legLength / 2)) / legLength),
        );
      return g;
    });
    block(
      leg,
      [0.215, 0.11, 0.315],
      [0, -legLength - 0.04, 0.045],
      p.shoe,
      0.032,
    );
    block(leg, [0.22, 0.027, 0.325], [0, -legLength - 0.086, 0.045], p.sole, 0);
    block(
      leg,
      [0.13, 0.014, 0.13],
      [0, -legLength + 0.007, 0.095],
      zina ? '#736355' : '#e5ddc9',
      0,
    );
    if (!zina)
      for (const z of [0.09, 0.135])
        block(
          leg,
          [0.115, 0.012, 0.014],
          [0, -legLength + 0.017, z],
          '#a5aeb0',
          0,
        );
    batch(leg);
  }
  block(body, [zina ? 0.43 : 0.38, 0.13, 0.28], [0, hip + 0.025, 0], p.pants);
  const coatGeometry = cachedGeometry(`queue-boss-coat:${style}`, () => {
    const rings = zina
      ? [
          [0.43, 0.285, 0.185],
          [0.68, 0.3, 0.21],
          [0.93, 0.3, 0.2],
          [1.1, 0.29, 0.17],
          [1.19, 0.19, 0.13],
        ]
      : [
          [0.65, 0.215, 0.155],
          [0.88, 0.23, 0.16],
          [1.12, 0.275, 0.18],
          [1.25, 0.27, 0.155],
          [1.32, 0.17, 0.12],
        ];
    const vertices: number[] = [],
      indices: number[] = [];
    for (const [y, w, d] of rings)
      for (const [x, z] of [
        [-0.78, 1],
        [0.78, 1],
        [1, 0.65],
        [1, -0.65],
        [0.78, -1],
        [-0.78, -1],
        [-1, -0.65],
        [-1, 0.65],
      ])
        vertices.push(x * w, y, z * d);
    for (let row = 0; row < 4; row++)
      for (let i = 0; i < 8; i++) {
        const a = row * 8 + i,
          b = row * 8 + ((i + 1) % 8);
        indices.push(a, b, a + 8, b, b + 8, a + 8);
      }
    for (let i = 1; i < 7; i++) {
      indices.push(0, i + 1, i);
      indices.push(32, 32 + i, 32 + i + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    g.setAttribute(
      'uv',
      new THREE.Float32BufferAttribute(
        new Float32Array((vertices.length / 3) * 2),
        2,
      ),
    );
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  });
  body.add(new THREE.Mesh(coatGeometry, mat(p.coat)));
  const collarY = zina ? 1.17 : 1.3;
  panel(
    body,
    [
      [-0.11, collarY],
      [0.11, collarY],
      [0.025, collarY - 0.22],
    ],
    [0, 0, 0.206],
    zina ? p.cream : '#ede3d1',
  );
  for (const side of [-1, 1]) {
    panel(
      body,
      (zina
        ? [
            [0.08, collarY],
            [0.2, collarY - 0.055],
            [0.165, collarY - 0.12],
            [0.205, collarY - 0.14],
            [0.025, collarY - 0.245],
          ]
        : [
            [0.075, collarY],
            [0.175, collarY + 0.012],
            [0.205, collarY - 0.135],
            [0.035, collarY - 0.23],
            [0.09, collarY - 0.08],
          ]
      ).map(([x, y]) => [side * x, y]),
      [0, 0, 0.211],
      p.lapel,
      0.012,
    );
    const pocket = block(
      body,
      [0.135, 0.025, 0.018],
      [side * 0.155, zina ? 0.64 : 0.86, zina ? 0.21 : 0.173],
      p.fold,
      0,
    );
    pocket.rotation.z = side * (zina ? -0.07 : 0.12);
  }
  if (zina) {
    panel(
      body,
      [
        [-0.07, 1.165],
        [0, 1.09],
        [0.07, 1.165],
        [0, 1.18],
      ],
      [0, 0, 0.227],
      '#674556',
    );
    for (const y of [0.89, 0.72, 0.54])
      disc(body, 0.03, 0.033, [0.025, y, 0.217], p.cream);
    block(body, [0.012, 0.47, 0.009], [-0.006, 0.72, 0.218], p.fold, 0);
  } else {
    block(body, [0.022, 0.45, 0.012], [0, 0.92, 0.183], p.blue, 0);
    block(body, [0.033, 0.05, 0.018], [0, 1.03, 0.198], '#bdc8c7', 0.006);
    block(body, [0.115, 0.032, 0.018], [-0.128, 1.105, 0.191], p.blue, 0);
    for (const side of [-1, 1])
      block(
        body,
        [0.12, 0.015, 0.012],
        [side * 0.135, 0.976, 0.184],
        '#dfd9ba',
        0,
      );
    block(body, [0.42, 0.055, 0.3], [0, 0.669, 0], p.blue, 0.012);
  }
  block(body, [0.15, 0.16, 0.15], [0, zina ? 1.21 : 1.33, 0], p.skin, 0.025);

  const armL = new THREE.Group(),
    armR = new THREE.Group(),
    elbows: THREE.Group[] = [];
  const phones = new THREE.Group();
  for (const [arm, side] of [
    [armL, -1],
    [armR, 1],
  ] as const) {
    arm.position.set(side * (zina ? 0.315 : 0.292), zina ? 1.065 : 1.2, 0);
    body.add(arm);
    block(
      arm,
      [zina ? 0.205 : 0.185, zina ? 0.24 : 0.29, 0.22],
      [0, -0.095, 0],
      p.coat,
      0.04,
    );
    const elbow = new THREE.Group();
    elbow.position.y = zina ? -0.205 : -0.25;
    arm.add(elbow);
    elbows.push(elbow);
    block(
      elbow,
      [0.17, zina ? 0.205 : 0.235, 0.195],
      [0, -0.085, 0.01],
      p.coat,
      0.035,
    );
    block(
      elbow,
      [0.15, 0.028, 0.17],
      [0, zina ? -0.18 : -0.202, 0.01],
      zina ? p.lapel : p.cream,
      0.008,
    );
    block(
      elbow,
      [0.133, 0.12, 0.137],
      [0, zina ? -0.244 : -0.267, 0.017],
      p.skin,
      0.026,
    );
    block(
      elbow,
      [0.041, 0.06, 0.064],
      [-side * 0.054, zina ? -0.225 : -0.249, 0.063],
      p.skin,
      0.012,
    );
    if (side === 1) {
      phones.position.set(0, zina ? -0.23 : -0.25, 0.111);
      phones.rotation.x = 0.75;
      elbow.add(phones);
      block(phones, [0.11, 0.185, 0.029], [0, 0.04, 0], '#38404b', 0.014);
      block(
        phones,
        [0.092, 0.165, 0.006],
        [0, 0.04, 0.017],
        zina ? '#544b53' : '#515c6b',
        0.012,
      );
      for (const y of [0.083, 0.049])
        disc(phones, 0.017, 0.017, [-0.028, y, 0.022], '#222a32');
      disc(phones, 0.008, 0.008, [-0.028, 0.086, 0.023], '#869d9c', 6);
      batch(phones);
    } else if (!zina) {
      block(elbow, [0.153, 0.036, 0.18], [0, -0.187, 0.01], p.blue, 0);
      block(elbow, [0.055, 0.033, 0.018], [0, -0.187, 0.106], '#bfc8c3', 0.006);
    }
    batch(elbow);
    batch(arm);
  }

  const cane = new THREE.Group();
  if (zina) {
    root.add(cane);
    const shaft = new THREE.Mesh(
      cachedGeometry(
        'zina-cane-shaft',
        () => new THREE.CylinderGeometry(0.018, 0.019, 0.575, 6),
      ),
      mat('#936541'),
    );
    shaft.position.set(-0.385, 0.311, 0.225);
    cane.add(shaft);
    const grip = new THREE.Mesh(
      cachedGeometry(
        'zina-cane-grip',
        () => new THREE.TorusGeometry(0.052, 0.017, 4, 8, Math.PI),
      ),
      mat('#ad7e51'),
    );
    grip.position.set(-0.365, 0.6, 0.225);
    cane.add(grip);
    block(cane, [0.042, 0.034, 0.043], [-0.385, 0.025, 0.225], '#514638', 0);
    batch(cane);
  }

  const head = new THREE.Group();
  head.position.set(0, zina ? 1.425 : 1.58, zina ? 0.035 : 0);
  body.add(head);
  const skull = cachedGeometry(`queue-boss-skull:${style}`, () => {
    const g = new THREE.SphereGeometry(1, 16, 10),
      positions = g.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i),
        y = positions.getY(i),
        z = positions.getZ(i);
      positions.setXYZ(
        i,
        Math.sign(x) *
          Math.abs(x) ** 0.45 *
          (zina ? 0.265 : 0.239) *
          (1 - (zina ? 0.025 : 0.09) * Math.max(0, -y)),
        Math.sign(y) * Math.abs(y) ** 0.55 * (zina ? 0.24 : 0.256),
        Math.sign(z) * Math.abs(z) ** 0.5 * 0.205,
      );
    }
    g.computeVertexNormals();
    return g;
  });
  head.add(new THREE.Mesh(skull, mat(p.skin)));
  for (const side of [-1, 1]) {
    block(
      head,
      [0.055, 0.083, 0.065],
      [side * (zina ? 0.265 : 0.239), -0.012, 0],
      p.skin,
      0.019,
    );
    if (zina) disc(head, 0.037, 0.021, [side * 0.17, -0.076, 0.211], '#cb947b');
  }
  const nose = new THREE.Mesh(
    cachedGeometry(`queue-boss-nose:${style}`, () =>
      new THREE.ConeGeometry(
        zina ? 0.037 : 0.033,
        zina ? 0.06 : 0.071,
        4,
      ).rotateX(Math.PI / 2),
    ),
    mat(p.skin),
  );
  nose.position.set(0, -0.027, 0.228);
  head.add(nose);

  if (zina) {
    const scarf = cachedGeometry('zina-scarf', () => {
      const g = new THREE.SphereGeometry(
          1,
          14,
          6,
          0,
          Math.PI * 2,
          0,
          Math.PI / 2,
        ),
        pos = g.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const phi = Math.atan2(pos.getZ(i), pos.getX(i));
        const t =
          Math.acos(THREE.MathUtils.clamp(pos.getY(i), 0, 1)) / (Math.PI / 2);
        const front = Math.max(0, Math.sin(phi)),
          theta = t * (1.96 - 0.71 * front + 0.04 * Math.cos(phi));
        const x = Math.sin(theta) * Math.cos(phi),
          y = Math.cos(theta),
          z = Math.sin(theta) * Math.sin(phi);
        pos.setXYZ(
          i,
          Math.sign(x) * Math.abs(x) ** 0.46 * 0.295,
          Math.sign(y) * Math.abs(y) ** 0.55 * 0.272 + 0.028,
          Math.sign(z) * Math.abs(z) ** 0.5 * 0.238 - 0.01,
        );
      }
      const flat = g.toNonIndexed();
      g.dispose();
      flat.computeVertexNormals();
      return flat;
    });
    head.add(new THREE.Mesh(scarf, mat(p.cream)));
    for (const side of [-1, 1])
      panel(
        head,
        [
          [side * 0.01, 0.217],
          [side * 0.18, 0.18],
          [side * 0.245, 0.085],
          [side * 0.205, 0.053],
          [side * 0.135, 0.151],
        ],
        [0, 0, 0.223],
        p.hair,
        0.009,
      );
    facet(head, [0.068, 0.056, 0.048], [-0.265, -0.07, -0.063], '#dfc697');
    for (const [x, y, rotation] of [
      [-0.275, -0.14, -0.4],
      [-0.235, -0.16, 0.17],
    ]) {
      const tail = panel(
        head,
        [
          [-0.025, 0.07],
          [0.03, 0.055],
          [0.028, -0.055],
          [-0.017, -0.08],
        ],
        [x, y, -0.064],
        p.cream,
        0.015,
      );
      tail.rotation.z = rotation;
    }
    const frameGeometry = cachedGeometry('zina-reading-glasses', () => {
      const outer = [
        [-0.085, -0.053],
        [0.08, -0.053],
        [0.098, -0.032],
        [0.098, 0.037],
        [0.08, 0.053],
        [-0.08, 0.053],
        [-0.098, 0.037],
        [-0.098, -0.032],
      ];
      const shape = new THREE.Shape(
        outer.map(([x, y]) => new THREE.Vector2(x, y)),
      );
      const hole = new THREE.Path(
        outer.map(([x, y]) => new THREE.Vector2(x * 0.83, y * 0.75)),
      );
      shape.holes.push(hole);
      return new THREE.ExtrudeGeometry(shape, {
        depth: 0.008,
        bevelEnabled: false,
        steps: 1,
      });
    });
    for (const side of [-1, 1]) {
      const frame = new THREE.Mesh(frameGeometry, mat('#62564a'));
      frame.position.set(side * 0.109, -0.005, 0.236);
      head.add(frame);
      block(
        head,
        [0.016, 0.014, 0.15],
        [side * 0.212, 0.014, 0.165],
        '#62564a',
        0,
      );
    }
    block(head, [0.039, 0.013, 0.014], [0, 0.009, 0.24], '#62564a', 0);
  } else {
    // A continuous nape/sides under the cap; a flat fringe would pierce its crown.
    const hair = cachedGeometry('sanya-short-scalp', () => {
      const g = new THREE.SphereGeometry(
        1,
        14,
        5,
        0,
        Math.PI * 2,
        0,
        Math.PI / 2,
      );
      const pos = g.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const phi = Math.atan2(pos.getZ(i), pos.getX(i));
        const t =
          Math.acos(THREE.MathUtils.clamp(pos.getY(i), 0, 1)) / (Math.PI / 2);
        const front = Math.max(0, Math.sin(phi));
        const theta = t * (1.98 - 0.66 * front + 0.07 * front * Math.cos(phi));
        const x = Math.sin(theta) * Math.cos(phi),
          y = Math.cos(theta),
          z = Math.sin(theta) * Math.sin(phi);
        pos.setXYZ(
          i,
          Math.sign(x) * Math.abs(x) ** 0.5 * 0.252,
          Math.sign(y) * Math.abs(y) ** 0.55 * 0.265 + 0.012,
          Math.sign(z) * Math.abs(z) ** 0.5 * 0.216 - 0.008,
        );
      }
      const flat = g.toNonIndexed();
      g.dispose();
      flat.computeVertexNormals();
      return flat;
    });
    head.add(new THREE.Mesh(hair, mat(p.hair)));
    const cap = cachedGeometry('sanya-cap-crown', () => {
      const g = new THREE.SphereGeometry(
          1,
          12,
          5,
          0,
          Math.PI * 2,
          0,
          Math.PI / 2,
        ),
        pos = g.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i),
          y = pos.getY(i),
          z = pos.getZ(i);
        pos.setXYZ(
          i,
          Math.sign(x) * Math.abs(x) ** 0.5 * 0.269,
          y * 0.19 + 0.202,
          Math.sign(z) * Math.abs(z) ** 0.55 * 0.23 - 0.012,
        );
      }
      const flat = g.toNonIndexed();
      g.dispose();
      flat.computeVertexNormals();
      return flat;
    });
    head.add(new THREE.Mesh(cap, mat(p.blue)));
    // Leave room for the raised eyebrow pose below the brim, never on the crown.
    block(head, [0.455, 0.031, 0.25], [0, 0.206, 0.2], '#4b7399', 0.035);
    block(head, [0.41, 0.014, 0.22], [0, 0.189, 0.2], '#36546e', 0.025);
    facet(head, [0.028, 0.017, 0.027], [0, 0.392, -0.012], p.blue);
    for (const side of [-1, 1])
      panel(
        head,
        [
          [-0.024, -0.022],
          [0.012, -0.022],
          [0.032, 0.022],
          [-0.005, 0.022],
        ],
        [side * 0.024, 0.292, 0.218],
        '#e4dabc',
      );
  }

  const eyes: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(side * 0.103, zina ? 0.035 : 0.025, 0.207);
    head.add(eye);
    panel(
      eye,
      [
        [-0.07, 0.027],
        [0.065, 0.038],
        [0.071, -0.012],
        [0.023, -0.042],
        [-0.041, -0.034],
        [-0.071, -0.012],
      ].map(([x, y]) => [side * x, y]),
      [0, 0, 0.007],
      '#f7e8d1',
    );
    panel(
      eye,
      [
        [-0.071, 0.028],
        [0.065, 0.038],
        [0.065, 0.048],
        [-0.071, 0.039],
      ].map(([x, y]) => [side * x, y]),
      [0, 0, 0.011],
      zina ? '#66584b' : p.hair,
    );
    disc(eye, 0.044, 0.062, [-side * 0.006, -0.003, 0.015], '#3b322c', 10);
    disc(eye, 0.012, 0.012, [-0.008, 0.013, 0.018], '#fff3df', 6);
    batch(eye);
    eyes.push(eye);
  }
  const expressionGeometry = (mood: Mood) =>
    cachedGeometry(`queue-boss-expression:${style}:${mood}`, () => {
      const group = new THREE.Group();
      for (const side of [-1, 1]) {
        const inner = mood === 'angry' ? 0.083 : zina ? 0.158 : 0.111;
        const outer =
          mood === 'impatient' && side === -1 ? 0.175 : zina ? 0.13 : 0.151;
        panel(
          group,
          [
            [side * 0.035, inner],
            [side * 0.177, outer],
            [side * 0.173, outer + 0.024],
            [side * 0.04, inner + 0.022],
          ],
          [0, 0, 0.225],
          p.hair,
          0.006,
        );
      }
      if (mood === 'angry' || (zina && mood === 'impatient')) {
        disc(
          group,
          mood === 'angry' ? 0.068 : 0.041,
          mood === 'angry' ? 0.069 : 0.044,
          [0, -0.116, 0.231],
          p.ink,
        );
        if (mood === 'angry')
          disc(group, 0.041, 0.014, [0, -0.138, 0.232], '#b3786c', 6);
      } else if (zina)
        panel(
          group,
          [
            [-0.043, -0.117],
            [0, -0.102],
            [0.04, -0.117],
            [0, -0.113],
          ],
          [0, 0, 0.232],
          '#936351',
          0.004,
        );
      else
        panel(
          group,
          [
            [-0.067, -0.093],
            [-0.026, -0.117],
            [0.024, -0.115],
            [0.067, -0.085],
            [0.043, -0.118],
            [-0.022, -0.129],
          ],
          [0, 0, 0.23],
          '#86523d',
          0.003,
        );
      return mergeStaticMeshesToVertexColor(
        group.children as THREE.Mesh[],
        group,
        VERTEX_COLOR_MATERIAL,
      )!.geometry;
    });
  const expressions = {
    idle: expressionGeometry('idle'),
    impatient: expressionGeometry('impatient'),
    angry: expressionGeometry('angry'),
  };
  batch(head);
  const expression = new THREE.Mesh(expressions.idle, VERTEX_COLOR_MATERIAL);
  head.add(expression);
  batch(body);

  const carry = new THREE.Group();
  carry.position.set(0, zina ? 0.9 : 1.035, zina ? 0.38 : 0.35);
  body.add(carry);
  carry.visible = false;
  const parcelGeometry = chamferedBox(0.36, 0.28, 0.27, 0.025),
    parcels: THREE.Mesh[] = [];
  const carryMaterials: THREE.MeshLambertMaterial[] = [];
  const decal = createParcelTopDecal();
  carry.add(decal);
  const resources = { geometries: owned, materials };
  body.userData.personResources = resources;
  let carrying = false,
    phase = 0,
    blinkDelay = zina ? 2.3 : 3.0,
    blinkRemaining = 0;
  const rig: PersonRig = {
    root,
    body,
    head,
    armL,
    armR,
    legL,
    legR,
    dispose: createPersonDisposer(resources),
    setCarry(visible, color, count) {
      const colors = typeof color === 'string' ? [color] : (color ?? []);
      const requested =
        count ?? (typeof color === 'string' || !color ? 1 : color.length);
      const amount = visible
        ? Math.max(1, Math.min(MAX_CARRY_PARCELS, Math.floor(requested)))
        : 0;
      carrying = visible;
      carry.visible = visible;
      phones.visible = !visible;
      cane.visible = !visible;
      while (parcels.length < amount) {
        const material = mat('#c8a072').clone();
        carryMaterials.push(material);
        materials.push(material);
        const parcel = new THREE.Mesh(parcelGeometry, material);
        parcel.position.y = parcels.length * 0.275;
        parcel.userData.carryParcel = parcels.length;
        carry.add(parcel);
        parcels.push(parcel);
      }
      parcels.forEach((parcel, i) => {
        parcel.visible = i < amount;
        const value = colors[Math.min(i, colors.length - 1)];
        if (value) carryMaterials[i].color.set(value);
      });
      decal.position.y = 0.145 + Math.max(0, amount - 1) * 0.275;
    },
    update(dt, moving, time, mood = 'idle') {
      phase += dt * (zina ? 6.6 : 9.1);
      const swing = Math.sin(phase);
      legL.rotation.x = moving ? swing * (zina ? 0.24 : 0.43) : 0;
      legR.rotation.x = moving
        ? -legL.rotation.x
        : mood === 'impatient' && !zina
          ? Math.max(0, Math.sin(time * 9)) * 0.07
          : 0;
      body.position.y = moving
        ? Math.abs(swing) * (zina ? 0.011 : 0.022)
        : Math.sin(time * 1.8) * 0.004;
      body.rotation.set(
        (zina ? 0.065 : 0) + (carrying ? -0.025 : 0),
        0,
        moving ? swing * 0.012 : Math.sin(time * 0.7) * 0.004,
      );
      head.rotation.set(
        zina ? -0.045 : -0.012,
        moving ? Math.sin(phase * 0.5) * 0.025 : Math.sin(time * 0.65) * 0.045,
        mood === 'impatient' ? (zina ? 0.045 : -0.04) : 0,
      );
      armL.rotation.set(
        zina ? -0.18 : moving ? -swing * 0.35 : -0.08,
        0,
        zina ? -0.1 : 0.055,
      );
      armR.rotation.set(-0.15 + (moving ? swing * 0.09 : 0), 0, -0.05);
      elbows[0].rotation.x = zina ? -0.25 : -0.18;
      elbows[1].rotation.x = mood === 'angry' ? -1.38 : zina ? -1.14 : -1.06;
      if (mood === 'impatient' && !moving)
        armR.rotation.z = -0.12 - Math.sin(time * 2.7) * 0.025;
      if (zina) {
        cane.position.z = moving ? Math.sin(phase) * 0.023 : 0;
        cane.rotation.x = moving ? swing * 0.025 : 0;
      }
      if (carrying) {
        armL.rotation.set(-0.48, 0, 0.27);
        armR.rotation.set(-0.48, 0, -0.27);
        elbows[0].rotation.x = elbows[1].rotation.x = -0.85;
      }
      blinkDelay -= dt;
      if (blinkDelay <= 0) {
        blinkRemaining = 0.16;
        blinkDelay = zina ? 3.0 : 3.5;
      }
      blinkRemaining = Math.max(0, blinkRemaining - dt);
      const lid =
        blinkRemaining > 0
          ? Math.max(0.08, Math.abs((blinkRemaining / 0.16) * 2 - 1))
          : 1;
      for (const eye of eyes)
        eye.scale.y =
          lid * (mood === 'angry' ? 0.76 : mood === 'impatient' ? 0.87 : 1);
      expression.geometry = expressions[mood];
    },
  };
  rig.update(0, false, 0);
  return rig;
}
