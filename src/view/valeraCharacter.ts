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

type Triple = [number, number, number];
type Point = [number, number];
type Mood = 'idle' | 'impatient' | 'angry';

/** Valera's familiar cap/jacket/bag, with a softer, reluctant silhouette. */
export function createValeraPerson(options: PersonOptions): PersonRig {
  const root = new THREE.Group(),
    body = new THREE.Group();
  body.name = 'valera-body';
  root.scale.setScalar(options.scale ?? 1);
  root.add(body, contactShadow(0.44, 0.29, 0.18));
  const geometries: THREE.BufferGeometry[] = [],
    materials: THREE.Material[] = [];
  const p = {
    coat: '#758494',
    seam: '#566576',
    light: '#91a0ae',
    pants: '#35414c',
    hair: '#514035',
    skin: '#dfae85',
    cream: '#e8d9bb',
    shoe: '#4c423b',
    sole: '#76634c',
    ink: '#382f2b',
    bag: '#b78c58',
    bagLight: '#d0ac77',
  };
  const block = (
    parent: THREE.Group,
    size: Triple,
    at: Triple,
    color: string,
    bevel = 0.02,
  ) => {
    const mesh = new THREE.Mesh(
      bevel
        ? chamferedBox(...size, bevel)
        : cachedGeometry(
            `valera-box:${size}`,
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
    points: Point[],
    at: Triple,
    color: string,
    depth = 0,
  ) => {
    const geometry = cachedGeometry(`valera-panel:${points}:${depth}`, () => {
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
    segments = 10,
  ) => {
    const mesh = new THREE.Mesh(
      cachedGeometry(`valera-disc:${w}:${h}:${segments}`, () =>
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
    if (mesh) geometries.push(mesh.geometry);
  };
  const legL = new THREE.Group(),
    legR = new THREE.Group();
  for (const [leg, side] of [
    [legL, -1],
    [legR, 1],
  ] as const) {
    leg.position.set(side * 0.135, 0.58, 0);
    root.add(leg);
    const trouser = block(
      leg,
      [0.195, 0.49, 0.23],
      [0, -0.22, 0],
      p.pants,
      0.026,
    );
    trouser.geometry = cachedGeometry('valera-trousers', () => {
      const g = trouser.geometry.clone(),
        pos = g.getAttribute('position');
      for (let i = 0; i < pos.count; i++)
        pos.setX(i, pos.getX(i) * (0.9 + (0.1 * (pos.getY(i) + 0.245)) / 0.49));
      g.computeVertexNormals();
      return g;
    });
    block(leg, [0.21, 0.12, 0.32], [0, -0.48, 0.045], p.shoe, 0.032);
    block(leg, [0.218, 0.027, 0.33], [0, -0.552, 0.045], p.sole, 0.008);
    block(leg, [0.14, 0.014, 0.13], [0, -0.408, 0.13], '#6c5b49', 0);
    block(leg, [0.16, 0.028, 0.232], [0, -0.41, 0.002], '#45515b', 0);
    batch(leg);
  }
  block(body, [0.44, 0.15, 0.29], [0, 0.61, 0], p.pants);
  const jacket = cachedGeometry('valera-soft-jacket', () => {
    const sections = [
      [0.61, 0.245, 0.17],
      [0.82, 0.292, 0.21],
      [1.06, 0.3, 0.2],
      [1.23, 0.265, 0.17],
      [1.28, 0.17, 0.12],
    ];
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
        const a = row * 8 + i,
          b = row * 8 + ((i + 1) % 8);
        indices.push(a, b, a + 8, b, b + 8, a + 8);
      }
    for (let i = 1; i < 7; i++)
      indices.push(0, i + 1, i, 32, 32 + i, 32 + i + 1);
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
  body.add(new THREE.Mesh(jacket, mat(p.coat)));
  block(body, [0.46, 0.055, 0.32], [0, 0.633, 0], p.seam, 0.012);
  panel(
    body,
    [
      [-0.105, 1.26],
      [0, 1.12],
      [0.105, 1.26],
    ],
    [0, 0, 0.182],
    p.cream,
    0.008,
  );
  for (const side of [-1, 1]) {
    panel(
      body,
      [
        [side * 0.018, 1.27],
        [side * 0.12, 1.29],
        [side * 0.165, 1.19],
        [side * 0.07, 1.12],
      ],
      [0, 0, 0.198],
      p.light,
      0.013,
    );
    const pocket = block(
      body,
      [0.16, 0.12, 0.025],
      [side * 0.165, 0.81, 0.205],
      p.seam,
      0.009,
    );
    pocket.rotation.z = side * -0.16;
    const flap = block(
      body,
      [0.175, 0.029, 0.028],
      [side * 0.165, 0.865, 0.218],
      p.light,
      0.006,
    );
    flap.rotation.z = side * -0.16;
    panel(
      body,
      [
        [side * 0.25, 1.13],
        [side * 0.285, 1.12],
        [side * 0.24, 0.94],
      ],
      [0, 0, 0.18],
      p.seam,
    );
  }
  block(body, [0.018, 0.47, 0.014], [0, 0.877, 0.223], p.cream, 0);
  block(body, [0.031, 0.046, 0.018], [0, 1.09, 0.235], p.sole, 0.006);
  block(body, [0.16, 0.027, 0.026], [-0.16, 1.115, 0.207], p.seam, 0.003);
  block(body, [0.135, 0.023, 0.016], [-0.16, 1.12, 0.226], p.light, 0);
  block(body, [0.22, 0.1, 0.2], [0, 1.3, 0], p.skin, 0.022);

  const armL = new THREE.Group(),
    armR = new THREE.Group(),
    elbows: THREE.Group[] = [];
  for (const [arm, side] of [
    [armL, -1],
    [armR, 1],
  ] as const) {
    body.add(arm);
    arm.position.set(side * 0.325, 1.16, 0);
    block(arm, [0.205, 0.28, 0.23], [0, -0.115, 0], p.coat, 0.032);
    const elbow = new THREE.Group();
    elbow.position.y = -0.24;
    arm.add(elbow);
    elbows.push(elbow);
    block(elbow, [0.188, 0.22, 0.208], [0, -0.095, 0], p.coat, 0.026);
    block(elbow, [0.19, 0.04, 0.214], [0, -0.198, 0], p.seam, 0.009);
    block(elbow, [0.151, 0.14, 0.15], [0, -0.283, 0.012], p.skin, 0.03);
    block(
      elbow,
      [0.055, 0.078, 0.088],
      [-side * 0.077, -0.255, 0.045],
      p.skin,
      0.016,
    );
    batch(elbow);
    batch(arm);
  }
  const bag = new THREE.Group();
  bag.name = 'valera-bag';
  elbows[0].add(bag);
  bag.position.set(0, -0.338, 0.01);
  const handle = new THREE.Mesh(
    cachedGeometry('valera-bag-handle', () =>
      new THREE.TorusGeometry(0.065, 0.012, 4, 12, Math.PI).rotateZ(0),
    ),
    mat(p.sole),
  );
  handle.position.y = -0.035;
  bag.add(handle);
  block(bag, [0.28, 0.29, 0.145], [0, -0.23, 0], p.bag, 0.018);
  block(bag, [0.29, 0.033, 0.15], [0, -0.1, 0], p.bagLight, 0.008);
  for (const side of [-1, 1])
    panel(
      bag,
      [
        [side * 0.11, -0.12],
        [side * 0.12, -0.34],
        [side * 0.075, -0.28],
      ],
      [0, 0, 0.079],
      p.bagLight,
    );
  block(bag, [0.11, 0.115, 0.007], [0.035, -0.08, -0.025], p.cream, 0.002);
  block(bag, [0.065, 0.012, 0.008], [0.035, -0.04, -0.018], p.sole, 0);
  batch(bag);

  const head = new THREE.Group();
  head.position.set(0, 1.51, 0.015);
  body.add(head);
  const skull = cachedGeometry('valera-skull', () => {
    const g = new THREE.SphereGeometry(1, 16, 12),
      pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        y = pos.getY(i),
        z = pos.getZ(i);
      pos.setXYZ(
        i,
        Math.sign(x) * Math.abs(x) ** 0.49 * 0.265,
        Math.sign(y) * Math.abs(y) ** 0.6 * 0.255,
        Math.sign(z) * Math.abs(z) ** 0.48 * 0.218,
      );
    }
    g.computeVertexNormals();
    return g;
  });
  head.add(new THREE.Mesh(skull, mat(p.skin)));
  for (const side of [-1, 1]) {
    block(head, [0.06, 0.095, 0.07], [side * 0.265, -0.007, 0], p.skin, 0.019);
    panel(
      head,
      [
        [side * 0.216, 0.018],
        [side * 0.239, -0.065],
        [side * 0.184, -0.089],
      ],
      [0, 0, 0.218],
      '#cc9775',
    );
  }
  const nose = new THREE.Mesh(
    cachedGeometry('valera-nose', () =>
      new THREE.ConeGeometry(0.044, 0.08, 4).rotateX(Math.PI / 2),
    ),
    mat(p.skin),
  );
  nose.position.set(0, -0.03, 0.247);
  head.add(nose);
  const scalp = cachedGeometry('valera-hair-under-cap', () => {
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
      const theta = t * (1.98 - 0.69 * Math.max(0, Math.sin(phi)));
      const x = Math.sin(theta) * Math.cos(phi),
        y = Math.cos(theta),
        z = Math.sin(theta) * Math.sin(phi);
      pos.setXYZ(
        i,
        Math.sign(x) * Math.abs(x) ** 0.5 * 0.278,
        Math.sign(y) * Math.abs(y) ** 0.55 * 0.26 + 0.028,
        Math.sign(z) * Math.abs(z) ** 0.5 * 0.23 - 0.016,
      );
    }
    const flat = g.toNonIndexed();
    g.dispose();
    flat.computeVertexNormals();
    return flat;
  });
  head.add(new THREE.Mesh(scalp, mat(p.hair)));
  // Broad low crown and short peak distinguish his flat cap from Sanya's baseball cap.
  const cap = cachedGeometry('valera-flat-cap', () => {
    const g = new THREE.SphereGeometry(
        1,
        16,
        6,
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
        Math.sign(x) * Math.abs(x) ** 0.5 * 0.3,
        Math.sign(y) * Math.abs(y) ** 0.7 * 0.12 + 0.203,
        Math.sign(z) * Math.abs(z) ** 0.5 * 0.268 + 0.013,
      );
    }
    const flat = g.toNonIndexed();
    g.dispose();
    flat.computeVertexNormals();
    return flat;
  });
  head.add(new THREE.Mesh(cap, mat(p.seam)));
  block(head, [0.45, 0.028, 0.19], [0, 0.2, 0.203], p.seam, 0.031);
  block(head, [0.42, 0.016, 0.18], [0, 0.183, 0.203], '#465260', 0.023);
  const eyes: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(side * 0.108, 0.023, 0.222);
    head.add(eye);
    panel(
      eye,
      [
        [-0.073, 0.03],
        [0.07, 0.026],
        [0.066, -0.035],
        [0.018, -0.046],
        [-0.06, -0.029],
      ],
      [0, 0, 0.004],
      '#f6e8d3',
    );
    panel(
      eye,
      [
        [-0.074, 0.031],
        [0.07, 0.028],
        [0.069, 0.041],
        [-0.071, 0.044],
      ],
      [0, 0, 0.009],
      p.hair,
    );
    disc(eye, 0.045, 0.059, [-side * 0.006, -0.007, 0.013], p.ink, 10);
    disc(eye, 0.012, 0.012, [-0.009, 0.008, 0.016], '#fff5df', 6);
    batch(eye);
    eyes.push(eye);
    panel(
      head,
      [
        [side * 0.052, -0.045],
        [side * 0.176, -0.05],
        [side * 0.162, -0.058],
        [side * 0.064, -0.052],
      ],
      [0, 0, 0.225],
      '#bf8868',
    );
  }
  const expressionGeometry = (mood: Mood) =>
    cachedGeometry(`valera-expression:${mood}`, () => {
      const group = new THREE.Group();
      for (const side of [-1, 1]) {
        const inner =
          mood === 'angry'
            ? 0.082
            : mood === 'impatient' && side === -1
              ? 0.135
              : 0.149;
        const outer = mood === 'angry' ? 0.14 : 0.106;
        panel(
          group,
          [
            [side * 0.035, inner],
            [side * 0.183, outer],
            [side * 0.179, outer + 0.025],
            [side * 0.04, inner + 0.025],
          ],
          [0, 0, 0.237],
          p.hair,
          0.005,
        );
      }
      if (mood === 'angry') {
        disc(group, 0.085, 0.085, [0, -0.125, 0.239], p.ink, 10);
        disc(group, 0.049, 0.02, [0, -0.15, 0.242], '#bb7769', 6);
        panel(
          group,
          [
            [-0.035, -0.092],
            [0.035, -0.092],
            [0.032, -0.105],
            [-0.031, -0.105],
          ],
          [0, 0, 0.242],
          p.cream,
        );
      } else
        panel(
          group,
          [
            [-0.057, -0.128],
            [-0.02, -0.112],
            [0.035, -0.118],
            [0.06, -0.109],
            [0.037, -0.131],
            [-0.024, -0.126],
          ],
          [0, 0, 0.24],
          '#8a5948',
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
  carry.position.set(0, 0.94, 0.41);
  carry.visible = false;
  body.add(carry);
  const parcelGeometry = chamferedBox(0.36, 0.28, 0.27, 0.025),
    parcels: THREE.Mesh[] = [],
    carryMaterials: THREE.MeshLambertMaterial[] = [];
  const decal = createParcelTopDecal();
  carry.add(decal);
  const resources = { geometries, materials };
  body.userData.personResources = resources;
  let carrying = false,
    phase = 0,
    blinkDelay = 2.9,
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
      bag.visible = !visible;
      while (parcels.length < amount) {
        const material = mat('#c8a072').clone();
        materials.push(material);
        carryMaterials.push(material);
        const parcel = new THREE.Mesh(parcelGeometry, material);
        parcel.position.y = parcels.length * 0.275;
        parcel.userData.carryParcel = parcels.length;
        carry.add(parcel);
        parcels.push(parcel);
      }
      parcels.forEach((mesh, i) => {
        mesh.visible = i < amount;
        const value = colors[Math.min(i, colors.length - 1)];
        if (value) carryMaterials[i].color.set(value);
      });
      decal.position.y = 0.145 + Math.max(0, amount - 1) * 0.275;
    },
    update(dt, moving, time, mood = 'idle') {
      phase += dt * 7.5;
      const swing = Math.sin(phase);
      legL.rotation.x = moving ? swing * 0.32 : 0;
      legR.rotation.x = moving ? -swing * 0.32 : 0;
      body.position.y = moving
        ? Math.abs(swing) * 0.014
        : Math.sin(time * 1.5) * 0.004;
      body.rotation.set(
        0.045 + (carrying ? -0.02 : 0),
        0,
        moving ? swing * 0.01 : Math.sin(time * 0.6) * 0.004,
      );
      head.rotation.set(
        -0.035,
        Math.sin(time * 0.55) * 0.05,
        mood === 'impatient' ? 0.045 : -0.02,
      );
      armL.rotation.set(moving ? -swing * 0.12 : -0.03, 0, 0.055);
      elbows[0].rotation.set(-0.12, 0, 0);
      armR.rotation.set(
        moving ? swing * 0.22 : mood === 'angry' ? -0.6 : -0.2,
        0,
        -0.07,
      );
      elbows[1].rotation.set(
        mood === 'angry' ? -1.05 : mood === 'impatient' ? -0.75 : -0.25,
        0,
        mood === 'angry' ? -0.2 : 0,
      );
      bag.rotation.set(
        -armL.rotation.x - elbows[0].rotation.x,
        0,
        -armL.rotation.z + Math.sin(time * 1.4) * 0.025,
      );
      if (carrying) {
        armL.rotation.set(-0.48, 0, 0.29);
        armR.rotation.set(-0.48, 0, -0.29);
        elbows[0].rotation.set(-0.8, 0, 0);
        elbows[1].rotation.set(-0.8, 0, 0);
      }
      blinkDelay -= dt;
      if (blinkDelay <= 0) {
        blinkRemaining = 0.16;
        blinkDelay = 3.4;
      }
      blinkRemaining = Math.max(0, blinkRemaining - dt);
      const lid =
        blinkRemaining > 0
          ? Math.max(0.08, Math.abs((blinkRemaining / 0.16) * 2 - 1))
          : 1;
      eyes.forEach(
        (eye) => (eye.scale.y = lid * (mood === 'angry' ? 1 : 0.82)),
      );
      expression.geometry = expressions[mood];
    },
  };
  rig.update(0, false, 0);
  return rig;
}
