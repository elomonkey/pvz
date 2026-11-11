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

/** Approved Galina concept: a separate wardrobe/rig, with the existing PersonRig contract. */
export function createGalinaPerson(options: PersonOptions): PersonRig {
  const root = new THREE.Group(),
    body = new THREE.Group();
  body.name = 'galina-body';
  root.add(body, contactShadow(0.47, 0.3, 0.18));
  root.scale.setScalar(options.scale ?? 1);
  const vertical = 0.88;
  body.scale.y = vertical;
  const owned: THREE.BufferGeometry[] = [];
  const p = {
    coat: `#${new THREE.Color(options.coat).lerp(new THREE.Color('#644238'), 0.14).getHexString()}`,
    lapel: '#934556',
    seam: '#63273d',
    shirt: '#f3e5d1',
    trousers: '#302d32',
    shoe: '#342d29',
    sole: '#7f573d',
    leather: '#8b5d3d',
    flap: '#a5724b',
    gold: '#d7aa56',
    skin: `#${new THREE.Color(options.skin).lerp(new THREE.Color('#f4ceb0'), 0.18).getHexString()}`,
    hair: '#302825',
    ink: '#302525',
    lips: '#925244',
  };
  const block = (
    parent: THREE.Group,
    size: [number, number, number],
    at: [number, number, number],
    color: string,
    bevel = 0.02,
  ) => {
    const geometry =
      bevel > 0
        ? chamferedBox(...size, bevel)
        : cachedGeometry(
            `galina-box:${size}`,
            () => new THREE.BoxGeometry(...size),
          );
    const mesh = new THREE.Mesh(geometry, mat(color));
    mesh.position.set(...at);
    parent.add(mesh);
    return mesh;
  };
  const panel = (
    parent: THREE.Group,
    points: [number, number][],
    z: number,
    color: string,
    depth = 0.008,
  ) => {
    const geometry = cachedGeometry(`galina-panel:${points}:${depth}`, () => {
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
    mesh.position.z = z;
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
  const disc = (
    parent: THREE.Group,
    w: number,
    h: number,
    at: [number, number, number],
    color: string,
    segments = 10,
  ) => {
    const geometry = cachedGeometry(`galina-disc:${w}:${h}:${segments}`, () =>
      new THREE.CircleGeometry(1, segments).scale(w / 2, h / 2, 1),
    );
    const mesh = new THREE.Mesh(geometry, mat(color));
    mesh.position.set(...at);
    parent.add(mesh);
    return mesh;
  };
  const faceted = (
    parent: THREE.Group,
    size: [number, number, number],
    at: [number, number, number],
    color: string,
    detail = 0,
  ) => {
    const geometry = cachedGeometry(`galina-facet:${detail}`, () => {
      const g = new THREE.IcosahedronGeometry(1, detail);
      g.computeVertexNormals();
      return g;
    });
    const mesh = new THREE.Mesh(geometry, mat(color));
    mesh.scale.set(...size);
    mesh.position.set(...at);
    parent.add(mesh);
    return mesh;
  };

  const legL = new THREE.Group(),
    legR = new THREE.Group();
  for (const [leg, side] of [
    [legL, -1],
    [legR, 1],
  ] as const) {
    leg.position.set(side * 0.135, 0.56 * vertical, 0);
    leg.scale.y = vertical;
    root.add(leg);
    const trouser = block(
      leg,
      [0.215, 0.48, 0.235],
      [0, -0.23, 0],
      p.trousers,
      0.028,
    );
    trouser.geometry = cachedGeometry('galina-tapered-trouser', () => {
      const g = trouser.geometry.clone(),
        positions = g.getAttribute('position');
      for (let i = 0; i < positions.count; i++)
        positions.setX(
          i,
          positions.getX(i) *
            (0.88 + (0.12 * (positions.getY(i) + 0.24)) / 0.48),
        );
      return g;
    });
    block(leg, [0.225, 0.106, 0.315], [0, -0.503, 0.035], p.shoe, 0.033);
    block(leg, [0.23, 0.025, 0.32], [0, -0.548, 0.035], p.sole, 0);
    block(leg, [0.16, 0.012, 0.14], [0, -0.462, 0.1], '#494039', 0);
    batch(leg);
  }
  block(body, [0.46, 0.12, 0.31], [0, 0.565, 0], p.trousers, 0.025);
  // Five octagonal sections form hem, waist, chest and sloping shoulders (76 tris).
  const coatGeometry = cachedGeometry('galina-coat', () => {
    const rings = [
      [0.54, 0.3, 0.195],
      [0.8, 0.285, 0.205],
      [1.04, 0.33, 0.215],
      [1.23, 0.34, 0.19],
      [1.3, 0.235, 0.145],
    ];
    const vertices: number[] = [],
      indices: number[] = [];
    for (const [y, w, d] of rings) {
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
    }
    for (let row = 0; row < rings.length - 1; row++)
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
  panel(
    body,
    [
      [-0.105, 1.3],
      [0.105, 1.3],
      [0.018, 1.055],
    ],
    0.218,
    p.shirt,
  );
  for (const side of [-1, 1]) {
    panel(
      body,
      [
        [0.1, 1.3],
        [0.22, 1.245],
        [0.18, 1.18],
        [0.23, 1.145],
        [0.015, 1.02],
        [0.085, 1.16],
      ].map(([x, y]) => [side * x, y]),
      0.221,
      p.lapel,
      0.014,
    );
    block(body, [0.125, 0.025, 0.017], [side * 0.17, 0.72, 0.2], p.seam, 0);
    block(body, [0.12, 0.017, 0.019], [side * 0.17, 0.737, 0.205], p.lapel, 0);
  }
  panel(
    body,
    [
      [0, 1.045],
      [0.012, 1.04],
      [0.012, 0.555],
      [0, 0.56],
    ],
    0.217,
    p.seam,
    0,
  );
  for (const y of [0.94, 0.82])
    block(body, [0.015, 0.019, 0.014], [0.025, y, 0.222], p.seam, 0);
  block(body, [0.16, 0.15, 0.15], [0, 1.32, 0], '#cc9471', 0.025);

  // A shoulder bag stays attached to the body, while the left hand holds its strap.
  const bag = new THREE.Group();
  body.add(bag);
  block(bag, [0.285, 0.275, 0.14], [-0.385, 0.76, 0.06], p.leather, 0.024);
  block(bag, [0.265, 0.11, 0.03], [-0.385, 0.84, 0.143], p.flap, 0.016);
  block(bag, [0.045, 0.046, 0.018], [-0.385, 0.811, 0.168], p.gold, 0);
  panel(
    bag,
    [
      [-0.25, 1.275],
      [-0.215, 1.265],
      [-0.345, 0.81],
      [-0.38, 0.82],
    ],
    0.214,
    p.leather,
    0.012,
  );
  panel(
    bag,
    [
      [-0.25, 1.275],
      [-0.215, 1.265],
      [-0.345, 0.81],
      [-0.38, 0.82],
    ],
    -0.23,
    p.leather,
    0.012,
  );
  block(bag, [0.043, 0.026, 0.46], [-0.236, 1.275, -0.004], p.leather, 0.008);
  batch(bag);

  const armL = new THREE.Group(),
    armR = new THREE.Group();
  const elbows: THREE.Group[] = [];
  for (const [arm, side] of [
    [armL, -1],
    [armR, 1],
  ] as const) {
    arm.position.set(side * 0.355, 1.17, 0);
    body.add(arm);
    const upper = block(
      arm,
      [0.205, 0.285, 0.235],
      [0, -0.105, 0],
      p.coat,
      0.05,
    );
    upper.geometry = cachedGeometry(`galina-shoulder:${side}`, () => {
      const g = upper.geometry.clone(),
        positions = g.getAttribute('position');
      for (let i = 0; i < positions.count; i++)
        if (positions.getY(i) > 0.08)
          positions.setY(
            i,
            positions.getY(i) -
              0.045 * Math.max(0, (side * positions.getX(i)) / 0.1025),
          );
      return g;
    });
    const elbow = new THREE.Group();
    elbow.position.y = -0.23;
    arm.add(elbow);
    elbows.push(elbow);
    block(elbow, [0.18, 0.23, 0.21], [0, -0.092, 0.008], p.coat, 0.04);
    block(elbow, [0.153, 0.028, 0.178], [0, -0.203, 0.008], p.shirt, 0.01);
    block(elbow, [0.135, 0.13, 0.14], [0, -0.273, 0.012], p.skin, 0.029);
    block(
      elbow,
      [0.042, 0.065, 0.066],
      [-side * 0.055, -0.252, 0.055],
      p.skin,
      0.012,
    );
    batch(elbow);
    batch(arm);
  }

  const head = new THREE.Group();
  head.position.y = 1.55;
  body.add(head);
  const skull = cachedGeometry('galina-skull', () => {
    const g = new THREE.SphereGeometry(1, 16, 10),
      positions = g.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i),
        y = positions.getY(i),
        z = positions.getZ(i);
      positions.setXYZ(
        i,
        Math.sign(x) *
          Math.abs(x) ** 0.44 *
          0.268 *
          (1 - 0.04 * Math.max(0, -y)),
        Math.sign(y) * Math.abs(y) ** 0.55 * 0.255,
        Math.sign(z) * Math.abs(z) ** 0.5 * 0.205,
      );
    }
    g.computeVertexNormals();
    return g;
  });
  head.add(new THREE.Mesh(skull, mat(p.skin)));
  for (const side of [-1, 1]) {
    block(head, [0.06, 0.088, 0.065], [side * 0.266, -0.012, 0], p.skin, 0.02);
    faceted(head, [0.032, 0.044, 0.028], [side * 0.287, -0.097, 0.018], p.gold);
  }
  const nose = new THREE.Mesh(
    cachedGeometry('galina-nose', () =>
      new THREE.ConeGeometry(0.035, 0.065, 4).rotateX(Math.PI / 2),
    ),
    mat(p.skin),
  );
  nose.position.set(0, -0.03, 0.224);
  head.add(nose);
  disc(head, 0.014, 0.014, [-0.18, -0.073, 0.207], '#ad7454', 6);
  // One continuous swept scalp and one faceted bun; no overlapping strand boxes.
  const scalp = cachedGeometry('galina-swept-scalp', () => {
    const g = new THREE.SphereGeometry(
      1,
      14,
      5,
      0,
      Math.PI * 2,
      0,
      Math.PI / 2,
    );
    const positions = g.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const phi = Math.atan2(positions.getZ(i), positions.getX(i));
      const t =
        Math.acos(THREE.MathUtils.clamp(positions.getY(i), 0, 1)) /
        (Math.PI / 2);
      const front = Math.max(0, Math.sin(phi));
      const theta = t * (1.9 - 0.64 * front + 0.07 * front * Math.cos(phi));
      const x = Math.sin(theta) * Math.cos(phi),
        z = Math.sin(theta) * Math.sin(phi);
      const y = Math.cos(theta);
      positions.setXYZ(
        i,
        Math.sign(x) * Math.abs(x) ** 0.44 * 0.295,
        Math.sign(y) * Math.abs(y) ** 0.55 * 0.285 + 0.037,
        Math.sign(z) * Math.abs(z) ** 0.5 * 0.235 - 0.006,
      );
    }
    const flat = g.toNonIndexed();
    g.dispose();
    flat.computeVertexNormals();
    return flat;
  });
  head.add(new THREE.Mesh(scalp, mat(p.hair)));
  faceted(head, [0.18, 0.185, 0.17], [-0.012, 0.335, -0.12], p.hair, 1);

  const eyes: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(side * 0.106, 0.025, 0.204);
    head.add(eye);
    panel(
      eye,
      [
        [-0.073, 0.026],
        [0.073, 0.044],
        [0.074, -0.01],
        [0.025, -0.043],
        [-0.035, -0.039],
        [-0.073, -0.016],
      ].map(([x, y]) => [side * x, y]),
      0.007,
      '#fff0da',
      0,
    );
    panel(
      eye,
      [
        [-0.074, 0.026],
        [0.074, 0.044],
        [0.074, 0.055],
        [-0.074, 0.037],
      ].map(([x, y]) => [side * x, y]),
      0.011,
      p.hair,
      0,
    );
    disc(eye, 0.049, 0.067, [-side * 0.008, -0.002, 0.014], '#3d3029', 10);
    disc(eye, 0.012, 0.012, [-0.009, 0.017, 0.019], '#fff6e7', 6);
    batch(eye);
    eyes.push(eye);
  }
  const expressionGeometry = (mood: Mood) =>
    cachedGeometry(`galina-expression:${p.skin}:${mood}`, () => {
      const group = new THREE.Group();
      for (const side of [-1, 1]) {
        const inner = mood === 'angry' ? 0.084 : 0.105;
        const outer = mood === 'impatient' && side === -1 ? 0.175 : 0.155;
        panel(
          group,
          [
            [side * 0.038, inner],
            [side * 0.177, outer],
            [side * 0.17, outer + 0.024],
            [side * 0.04, inner + 0.025],
          ],
          0.225,
          p.hair,
          0.008,
        );
      }
      if (mood === 'angry') {
        disc(group, 0.068, 0.076, [0, -0.115, 0.228], p.ink, 8);
        disc(group, 0.043, 0.019, [0, -0.14, 0.23], '#b96b60', 6);
      } else
        panel(
          group,
          [
            [-0.055, -0.121],
            [0, -0.104],
            [0.055, -0.121],
            [0, -0.118],
          ],
          0.229,
          p.lips,
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
  const expression = new THREE.Mesh(expressions.idle, VERTEX_COLOR_MATERIAL);
  head.add(expression);
  // Expression is cached and independently switched, not baked into the neutral face.
  expression.removeFromParent();
  batch(head);
  head.add(expression);
  batch(body);

  const carry = new THREE.Group();
  carry.position.set(0, 0.98, 0.365);
  body.add(carry);
  carry.visible = false;
  const carryMaterial = mat('#c8a072').clone();
  const parcelGeometry = chamferedBox(0.36, 0.28, 0.27, 0.025);
  const parcels: THREE.Mesh[] = [];
  const decal = createParcelTopDecal();
  carry.add(decal);
  const resources = { geometries: owned, materials: [carryMaterial] };
  body.userData.personResources = resources;
  let carrying = false,
    phase = 0,
    blinkRemaining = 0,
    blinkDelay = 2.7;
  const rig: PersonRig = {
    root,
    body,
    head,
    armL,
    armR,
    legL,
    legR,
    dispose: createPersonDisposer(resources),
    setCarry(visible, color, count = 1) {
      const amount = visible
        ? Math.max(1, Math.min(MAX_CARRY_PARCELS, Math.floor(count)))
        : 0;
      carrying = visible;
      carry.visible = visible;
      bag.visible = !visible;
      while (parcels.length < amount) {
        const parcel = new THREE.Mesh(parcelGeometry, carryMaterial);
        parcel.position.y = parcels.length * 0.275;
        parcel.userData.carryParcel = parcels.length;
        carry.add(parcel);
        parcels.push(parcel);
      }
      parcels.forEach((parcel, i) => {
        parcel.visible = i < amount;
      });
      decal.position.y = 0.145 + Math.max(0, amount - 1) * 0.275;
      if (color) carryMaterial.color.set(color);
    },
    update(dt, moving, time, mood = 'idle') {
      phase += dt * 7.8;
      const swing = Math.sin(phase),
        breath = Math.sin(time * 1.75);
      legL.rotation.x = moving ? swing * 0.34 : 0;
      legR.rotation.x = moving
        ? -swing * 0.34
        : mood === 'impatient'
          ? Math.max(0, Math.sin(time * 8)) * 0.07
          : 0;
      body.position.y = moving ? Math.abs(swing) * 0.017 : breath * 0.004;
      body.rotation.z = moving
        ? swing * 0.012
        : mood === 'angry'
          ? Math.sin(time * 10) * 0.009
          : Math.sin(time * 0.7) * 0.004;
      body.rotation.x = carrying ? -0.02 : 0;
      head.rotation.y = moving
        ? Math.sin(phase * 0.5) * 0.025
        : Math.sin(time * 0.55) * 0.045;
      head.rotation.z = mood === 'impatient' ? -0.035 : 0;
      head.rotation.x = mood === 'angry' ? 0.025 : -0.012;
      armL.rotation.set(moving ? -swing * 0.12 : -0.025, 0, 0.045);
      armR.rotation.set(moving ? swing * 0.28 : 0, 0, -0.065);
      elbows[0].rotation.x = -1.15;
      elbows[1].rotation.x = -0.12;
      if (!moving && mood !== 'idle') {
        elbows[1].rotation.x = mood === 'angry' ? -1.05 : -0.58;
        armR.rotation.z = -0.13;
      }
      if (carrying) {
        armL.rotation.set(-0.48, 0, 0.31);
        armR.rotation.set(-0.48, 0, -0.31);
        elbows[0].rotation.x = elbows[1].rotation.x = -0.85;
      }
      blinkDelay -= dt;
      if (blinkDelay <= 0) {
        blinkRemaining = 0.16;
        blinkDelay = 3.2;
      }
      blinkRemaining = Math.max(0, blinkRemaining - dt);
      const lid =
        blinkRemaining > 0
          ? Math.max(0.08, Math.abs((blinkRemaining / 0.16) * 2 - 1))
          : 1;
      eyes.forEach((eye) => {
        eye.scale.y =
          lid * (mood === 'angry' ? 0.72 : mood === 'impatient' ? 0.87 : 0.93);
      });
      expression.geometry = expressions[mood];
    },
  };
  rig.update(0, false, 0);
  return rig;
}
