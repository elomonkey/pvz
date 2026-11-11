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
type Point = [number, number];
type Triple = [number, number, number];

/** Approved fashion-perfectionist concept; visual wardrobe only, same PersonRig. */
export function createQueenPerson(options: PersonOptions): PersonRig {
  const root = new THREE.Group(),
    body = new THREE.Group();
  body.name = 'queen-body';
  root.scale.setScalar(options.scale ?? 1);
  root.add(body, contactShadow(0.46, 0.3, 0.18));
  const owned: THREE.BufferGeometry[] = [],
    materials: THREE.Material[] = [];
  const p = {
    jacket: '#e6d3b8',
    lapel: '#f0dfc3',
    seam: '#cbb89f',
    wine: '#783349',
    collar: '#643043',
    shoe: '#383039',
    sole: '#59434a',
    skin: `#${new THREE.Color(options.skin).lerp(new THREE.Color('#efb48e'), 0.35).getHexString()}`,
    hair: '#a65b37',
    hairLight: '#b96a40',
    hairDark: '#85442f',
    gold: '#cda35d',
    ink: '#35282a',
    lips: '#99534e',
    sage: '#929f7e',
    fold: '#778768',
    wood: '#a87746',
  };
  const block = (
    parent: THREE.Group,
    size: Triple,
    at: Triple,
    color: string,
    bevel = 0.02,
  ) => {
    const geometry = bevel
      ? chamferedBox(...size, bevel)
      : cachedGeometry(
          `queen-box:${size}`,
          () => new THREE.BoxGeometry(...size),
        );
    const mesh = new THREE.Mesh(geometry, mat(color));
    mesh.position.set(...at);
    parent.add(mesh);
    return mesh;
  };
  const panel = (
    parent: THREE.Group,
    points: Point[],
    at: Triple,
    color: string,
    depth = 0,
  ) => {
    const geometry = cachedGeometry(`queen-panel:${points}:${depth}`, () => {
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
    });
    const mesh = new THREE.Mesh(geometry, mat(color));
    mesh.position.set(...at);
    parent.add(mesh);
    return mesh;
  };
  const disc = (
    parent: THREE.Group,
    w: number,
    h: number,
    at: Triple,
    color: string,
    segments = 8,
  ) => {
    const mesh = new THREE.Mesh(
      cachedGeometry(`queen-disc:${w}:${h}:${segments}`, () =>
        new THREE.CircleGeometry(1, segments).scale(w / 2, h / 2, 1),
      ),
      mat(color),
    );
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
  const rings = (
    parent: THREE.Group,
    key: string,
    sections: Triple[],
    color: string,
    openFront = false,
  ) => {
    const geometry = cachedGeometry(`queen-rings:${key}`, () => {
      const vertices: number[] = [],
        indices: number[] = [];
      for (const [y, w, d] of sections)
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
      for (let row = 0; row < sections.length - 1; row++)
        for (let i = 0; i < 8; i++) {
          if (openFront && i === 0) continue;
          const a = row * 8 + i,
            b = row * 8 + ((i + 1) % 8);
          indices.push(a, b, a + 8, b, b + 8, a + 8);
        }
      const top = (sections.length - 1) * 8;
      for (let i = 1; i < 7; i++) {
        indices.push(0, i + 1, i);
        indices.push(top, top + i, top + i + 1);
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
    parent.add(new THREE.Mesh(geometry, mat(color)));
  };

  const legL = new THREE.Group(),
    legR = new THREE.Group();
  for (const [leg, side] of [
    [legL, -1],
    [legR, 1],
  ] as const) {
    leg.position.set(side * 0.115, 0.67, 0);
    root.add(leg);
    block(leg, [0.14, 0.51, 0.17], [0, -0.245, 0], p.skin, 0.025);
    const boot = block(
      leg,
      [0.19, 0.16, 0.27],
      [0, -0.56, 0.035],
      p.shoe,
      0.03,
    );
    boot.geometry = cachedGeometry('queen-ankle-boot', () => {
      const g = boot.geometry.clone(),
        pos = g.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const front = Math.max(0, pos.getZ(i) / 0.135);
        pos.setX(i, pos.getX(i) * (1 - 0.18 * front));
        if (pos.getY(i) > 0) pos.setY(i, pos.getY(i) - 0.03 * front);
      }
      g.computeVertexNormals();
      return g;
    });
    block(leg, [0.15, 0.13, 0.175], [0, -0.475, -0.008], p.shoe, 0.02);
    block(leg, [0.083, 0.045, 0.095], [0, -0.6425, -0.062], p.sole, 0);
    block(leg, [0.18, 0.025, 0.195], [0, -0.6475, 0.075], p.sole, 0);
    batch(leg);
  }
  // A closed, broad-faceted A-line silhouette; legs remain independently animated.
  const skirtGeometry = cachedGeometry('queen-midi-skirt', () => {
    const vertices: number[] = [],
      indices: number[] = [];
    const sections = [
      [0.35, 0.35, 0.235],
      [0.67, 0.265, 0.18],
      [0.89, 0.21, 0.145],
    ];
    for (const [y, w, d] of sections)
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2,
          fold = i % 2 ? 0.91 : 1;
        vertices.push(
          Math.sin(angle) * w * fold,
          y,
          Math.cos(angle) * d * fold,
        );
      }
    for (let row = 0; row < 2; row++)
      for (let i = 0; i < 12; i++) {
        const a = row * 12 + i,
          b = row * 12 + ((i + 1) % 12);
        indices.push(a, b, a + 12, b, b + 12, a + 12);
      }
    for (let i = 1; i < 11; i++) {
      indices.push(0, i + 1, i);
      indices.push(24, 24 + i, 24 + i + 1);
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
    const flat = g.toNonIndexed();
    g.dispose();
    flat.computeVertexNormals();
    return flat;
  });
  body.add(new THREE.Mesh(skirtGeometry, mat(p.wine)));
  rings(
    body,
    'blouse',
    [
      [0.87, 0.2, 0.14],
      [1.05, 0.245, 0.165],
      [1.22, 0.26, 0.16],
      [1.29, 0.18, 0.115],
    ],
    p.wine,
  );
  rings(
    body,
    'cropped-jacket',
    [
      [0.91, 0.225, 0.17],
      [1.1, 0.28, 0.18],
      [1.23, 0.275, 0.172],
      [1.3, 0.185, 0.127],
    ],
    p.jacket,
    true,
  );
  for (const side of [-1, 1]) {
    panel(
      body,
      [
        [0.085, 1.27],
        [0.215, 1.23],
        [0.245, 1.12],
        [0.23, 0.91],
        [0.07, 0.91],
        [0.105, 1.1],
        [0.035, 1.16],
      ].map(([x, y]) => [side * x, y]),
      [0, 0, 0.178],
      p.jacket,
      0.022,
    );
    panel(
      body,
      [
        [0.06, 1.3],
        [0.205, 1.23],
        [0.11, 1.13],
        [0.03, 1.24],
      ].map(([x, y]) => [side * x, y]),
      [0, 0, 0.208],
      p.lapel,
      0.012,
    );
    panel(
      body,
      [
        [0.015, 1.29],
        [0.075, 1.3],
        [0.085, 1.235],
        [0.028, 1.25],
      ].map(([x, y]) => [side * x, y]),
      [0, 0, 0.226],
      p.wine,
      0.008,
    );
    block(body, [0.115, 0.013, 0.014], [side * 0.153, 0.938, 0.203], p.seam, 0);
  }
  block(body, [0.42, 0.055, 0.285], [0, 0.87, 0], p.collar, 0.009);
  panel(
    body,
    [
      [-0.006, 1.21],
      [0.006, 1.21],
      [0.006, 0.91],
      [-0.006, 0.91],
    ],
    [0, 0, 0.169],
    p.collar,
  );
  const brooch = new THREE.Mesh(
    cachedGeometry('queen-brooch', () => new THREE.IcosahedronGeometry(1, 0)),
    mat(p.gold),
  );
  brooch.scale.set(0.032, 0.029, 0.017);
  brooch.position.set(-0.16, 1.17, 0.233);
  body.add(brooch);
  block(body, [0.145, 0.16, 0.145], [0, 1.33, 0], p.skin, 0.024);

  const armL = new THREE.Group(),
    armR = new THREE.Group(),
    elbows: THREE.Group[] = [];
  for (const [arm, side] of [
    [armL, -1],
    [armR, 1],
  ] as const) {
    arm.position.set(side * 0.3, 1.2, 0);
    body.add(arm);
    block(arm, [0.185, 0.26, 0.215], [0, -0.1, 0], p.jacket, 0.04);
    const elbow = new THREE.Group();
    elbow.position.y = -0.225;
    arm.add(elbow);
    elbows.push(elbow);
    block(elbow, [0.165, 0.22, 0.19], [0, -0.085, 0.01], p.jacket, 0.035);
    block(elbow, [0.148, 0.025, 0.168], [0, -0.19, 0.01], p.lapel, 0.008);
    block(elbow, [0.13, 0.12, 0.135], [0, -0.26, 0.018], p.skin, 0.027);
    block(
      elbow,
      [0.04, 0.06, 0.065],
      [-side * 0.054, -0.24, 0.06],
      p.skin,
      0.012,
    );
    batch(elbow);
    batch(arm);
  }

  // The wardrobe prop is attached to the grip, but counter-rotates with the forearm.
  const garment = new THREE.Group();
  garment.name = 'queen-garment';
  elbows[1].add(garment);
  garment.position.set(0, -0.225, 0.1);
  const hook = new THREE.Mesh(
    cachedGeometry(
      'queen-hanger-hook',
      () => new THREE.TorusGeometry(0.035, 0.009, 4, 8, Math.PI * 1.45),
    ),
    mat(p.wood),
  );
  hook.position.y = -0.015;
  garment.add(hook);
  block(garment, [0.018, 0.11, 0.018], [0, -0.09, 0], p.wood, 0);
  const hangerGeometry = cachedGeometry('queen-open-hanger', () => {
    const shape = new THREE.Shape([
      new THREE.Vector2(-0.23, -0.25),
      new THREE.Vector2(0, -0.14),
      new THREE.Vector2(0.23, -0.25),
      new THREE.Vector2(0.225, -0.275),
      new THREE.Vector2(-0.225, -0.275),
    ]);
    shape.holes.push(
      new THREE.Path([
        new THREE.Vector2(-0.15, -0.245),
        new THREE.Vector2(0.15, -0.245),
        new THREE.Vector2(0, -0.185),
      ]),
    );
    return new THREE.ExtrudeGeometry(shape, {
      depth: 0.018,
      bevelEnabled: false,
      steps: 1,
    });
  });
  garment.add(new THREE.Mesh(hangerGeometry, mat(p.wood)));
  panel(
    garment,
    [
      [-0.12, -0.25],
      [-0.22, -0.29],
      [-0.19, -0.36],
      [-0.145, -0.345],
      [-0.15, -0.57],
      [0.15, -0.57],
      [0.145, -0.345],
      [0.19, -0.36],
      [0.22, -0.29],
      [0.12, -0.25],
      [0.065, -0.28],
      [-0.065, -0.28],
    ],
    [0, 0, 0.017],
    p.sage,
    0.055,
  );
  panel(
    garment,
    [
      [-0.12, -0.26],
      [-0.06, -0.28],
      [0, -0.33],
      [-0.08, -0.39],
    ],
    [0, 0, 0.074],
    '#a5b08f',
    0.007,
  );
  panel(
    garment,
    [
      [0.12, -0.26],
      [0.06, -0.28],
      [0, -0.33],
      [0.08, -0.39],
    ],
    [0, 0, 0.074],
    p.fold,
    0.007,
  );
  panel(
    garment,
    [
      [-0.11, -0.39],
      [-0.09, -0.4],
      [-0.1, -0.56],
      [-0.125, -0.56],
    ],
    [0, 0, 0.074],
    p.fold,
  );
  panel(
    garment,
    [
      [0.12, -0.4],
      [0.14, -0.38],
      [0.145, -0.56],
      [0.13, -0.56],
    ],
    [0, 0, 0.074],
    '#9da98a',
  );
  panel(
    garment,
    [
      [-0.005, -0.33],
      [0.005, -0.33],
      [0.005, -0.56],
      [-0.005, -0.56],
    ],
    [0, 0, 0.075],
    p.fold,
  );
  batch(garment);

  const head = new THREE.Group();
  head.position.set(0, 1.56, 0);
  body.add(head);
  const skull = cachedGeometry('queen-skull', () => {
    const g = new THREE.SphereGeometry(1, 16, 10),
      pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        y = pos.getY(i),
        z = pos.getZ(i);
      pos.setXYZ(
        i,
        Math.sign(x) *
          Math.abs(x) ** 0.46 *
          0.247 *
          (1 - 0.12 * Math.max(0, -y)),
        Math.sign(y) * Math.abs(y) ** 0.55 * 0.25,
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
      [0.055, 0.083, 0.063],
      [side * 0.247, -0.012, 0],
      p.skin,
      0.018,
    );
    const earring = new THREE.Mesh(
      cachedGeometry(
        'queen-earring',
        () => new THREE.ConeGeometry(0.029, 0.073, 4),
      ),
      mat(p.gold),
    );
    earring.position.set(side * 0.265, -0.096, 0.025);
    head.add(earring);
  }
  const nose = new THREE.Mesh(
    cachedGeometry('queen-nose', () =>
      new THREE.ConeGeometry(0.031, 0.063, 4).rotateX(Math.PI / 2),
    ),
    mat(p.skin),
  );
  nose.position.set(0, -0.028, 0.226);
  head.add(nose);
  const hair = cachedGeometry('queen-copper-bob', () => {
    const g = new THREE.SphereGeometry(
        1,
        14,
        7,
        0,
        Math.PI * 2,
        0,
        Math.PI / 2,
      ),
      pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const phi = Math.atan2(pos.getZ(i), pos.getX(i)),
        t = Math.acos(THREE.MathUtils.clamp(pos.getY(i), 0, 1)) / (Math.PI / 2);
      const front = Math.max(0, Math.sin(phi)),
        theta = t * (2.6 - 1.3 * front + 0.08 * front * Math.cos(phi));
      const x = Math.sin(theta) * Math.cos(phi),
        y = Math.cos(theta),
        z = Math.sin(theta) * Math.sin(phi);
      pos.setXYZ(
        i,
        Math.sign(x) * Math.abs(x) ** 0.44 * (0.3 + 0.02 * t),
        Math.sign(y) * Math.abs(y) ** 0.6 * 0.29 + 0.055,
        Math.sign(z) * Math.abs(z) ** 0.52 * 0.252 - 0.012,
      );
    }
    const flat = g.toNonIndexed();
    g.dispose();
    flat.computeVertexNormals();
    return flat;
  });
  head.add(new THREE.Mesh(hair, mat(p.hair)));
  panel(
    head,
    [
      [-0.23, 0.1],
      [-0.18, 0.24],
      [0.06, 0.3],
      [0.23, 0.22],
      [0.245, 0.11],
      [0.17, 0.145],
      [0.07, 0.2],
      [-0.1, 0.18],
    ],
    [0, 0, 0.219],
    p.hairLight,
    0.015,
  );
  panel(
    head,
    [
      [0.06, 0.3],
      [0.23, 0.22],
      [0.245, 0.11],
      [0.17, 0.145],
      [0.07, 0.2],
    ],
    [0, 0, 0.236],
    p.hair,
    0.004,
  );

  const eyes: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(side * 0.102, 0.025, 0.207);
    head.add(eye);
    panel(
      eye,
      [
        [-0.07, 0.025],
        [0.065, 0.038],
        [0.071, -0.01],
        [0.023, -0.032],
        [-0.04, -0.027],
        [-0.07, -0.01],
      ].map(([x, y]) => [side * x, y]),
      [0, 0, 0.007],
      '#fff0d8',
    );
    panel(
      eye,
      [
        [-0.073, 0.026],
        [0.068, 0.039],
        [0.083, 0.052],
        [0.05, 0.048],
        [-0.073, 0.037],
      ].map(([x, y]) => [side * x, y]),
      [0, 0, 0.012],
      p.ink,
    );
    disc(eye, 0.043, 0.048, [-side * 0.007, -0.004, 0.016], p.ink, 10);
    disc(eye, 0.011, 0.011, [-0.009, 0.01, 0.019], '#fff6df', 6);
    batch(eye);
    eyes.push(eye);
  }
  const expressionGeometry = (mood: Mood) =>
    cachedGeometry(`queen-expression:${mood}`, () => {
      const group = new THREE.Group();
      for (const side of [-1, 1]) {
        const inner =
          mood === 'angry'
            ? 0.085
            : mood === 'impatient' && side === -1
              ? 0.15
              : 0.105;
        const outer = mood === 'angry' ? 0.14 : 0.12;
        panel(
          group,
          [
            [side * 0.035, inner],
            [side * 0.172, outer],
            [side * 0.167, outer + 0.024],
            [side * 0.04, inner + 0.022],
          ],
          [0, 0, 0.235],
          p.hairDark,
          0.006,
        );
      }
      if (mood === 'angry') {
        panel(
          group,
          [
            [-0.04, -0.103],
            [0.035, -0.094],
            [0.045, -0.144],
            [-0.03, -0.15],
          ],
          [0, 0, 0.233],
          p.ink,
        );
        disc(group, 0.038, 0.016, [0.006, -0.139, 0.235], '#b96c63', 8);
        panel(
          group,
          [
            [-0.043, -0.106],
            [0.033, -0.095],
            [0.031, -0.09],
            [-0.045, -0.1],
          ],
          [0, 0, 0.236],
          p.lips,
        );
      } else {
        panel(
          group,
          [
            [-0.052, -0.115],
            [-0.015, -0.1],
            [0.015, -0.106],
            [0.055, mood === 'impatient' ? -0.108 : -0.09],
            [0.035, -0.117],
            [-0.02, -0.12],
          ],
          [0, 0, 0.233],
          p.lips,
          0.003,
        );
      }
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
  carry.position.set(0, 1.015, 0.39);
  body.add(carry);
  carry.visible = false;
  const parcelGeometry = chamferedBox(0.36, 0.28, 0.27, 0.025),
    parcels: THREE.Mesh[] = [],
    carryMaterials: THREE.MeshLambertMaterial[] = [];
  const decal = createParcelTopDecal();
  carry.add(decal);
  const resources = { geometries: owned, materials };
  body.userData.personResources = resources;
  let carrying = false,
    phase = 0,
    blinkDelay = 3.1,
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
      const colors = typeof color === 'string' ? [color] : (color ?? []),
        requested =
          count ?? (typeof color === 'string' || !color ? 1 : color.length);
      const amount = visible
        ? Math.max(1, Math.min(MAX_CARRY_PARCELS, Math.floor(requested)))
        : 0;
      carrying = visible;
      carry.visible = visible;
      garment.visible = !visible;
      while (parcels.length < amount) {
        const material = mat('#c8a072').clone();
        materials.push(material);
        carryMaterials.push(material);
        const mesh = new THREE.Mesh(parcelGeometry, material);
        mesh.position.y = parcels.length * 0.275;
        mesh.userData.carryParcel = parcels.length;
        carry.add(mesh);
        parcels.push(mesh);
      }
      parcels.forEach((mesh, i) => {
        mesh.visible = i < amount;
        const value = colors[Math.min(i, colors.length - 1)];
        if (value) carryMaterials[i].color.set(value);
      });
      decal.position.y = 0.145 + Math.max(0, amount - 1) * 0.275;
    },
    update(dt, moving, time, mood = 'idle') {
      phase += dt * 8;
      const swing = Math.sin(phase);
      legL.rotation.x = moving ? swing * 0.28 : 0;
      legR.rotation.x = moving
        ? -swing * 0.28
        : mood === 'impatient'
          ? Math.max(0, Math.sin(time * 8)) * 0.045
          : 0;
      body.position.y = moving
        ? Math.abs(swing) * 0.014
        : Math.sin(time * 1.6) * 0.003;
      body.rotation.set(
        carrying ? -0.02 : 0,
        0,
        moving ? swing * 0.008 : Math.sin(time * 0.65) * 0.004,
      );
      head.rotation.set(
        mood === 'angry' ? 0.01 : -0.055,
        moving ? Math.sin(phase * 0.5) * 0.02 : Math.sin(time * 0.5) * 0.045,
        mood === 'impatient' ? -0.035 : 0,
      );
      armL.rotation.set(-0.15 + (moving ? -swing * 0.05 : 0), 0, -0.6);
      elbows[0].rotation.set(-0.5, 0, 1.2);
      armR.rotation.set(-0.3 + (moving ? swing * 0.07 : 0), 0, -0.08);
      elbows[1].rotation.set(mood === 'angry' ? -1.6 : -1.45, 0, 0);
      garment.rotation.set(
        -armR.rotation.x - elbows[1].rotation.x,
        0,
        -armR.rotation.z + Math.sin(time * 1.7) * 0.025,
      );
      if (carrying) {
        armL.rotation.set(-0.48, 0, 0.3);
        armR.rotation.set(-0.48, 0, -0.3);
        elbows[0].rotation.set(-0.85, 0, 0);
        elbows[1].rotation.set(-0.85, 0, 0);
      }
      blinkDelay -= dt;
      if (blinkDelay <= 0) {
        blinkRemaining = 0.16;
        blinkDelay = 3.5;
      }
      blinkRemaining = Math.max(0, blinkRemaining - dt);
      const lid =
        blinkRemaining > 0
          ? Math.max(0.08, Math.abs((blinkRemaining / 0.16) * 2 - 1))
          : 1;
      eyes.forEach(
        (eye) =>
          (eye.scale.y =
            lid *
            (mood === 'angry' ? 0.94 : mood === 'impatient' ? 0.85 : 0.87)),
      );
      expression.geometry = expressions[mood];
    },
  };
  rig.update(0, false, 0);
  return rig;
}
