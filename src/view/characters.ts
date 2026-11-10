import * as THREE from 'three';
import type {
  Archetype,
  HairStyle,
  Headwear,
  PersonAccessory,
  PersonBuild,
  PropKind,
} from '../data';
import {
  KIT_COLORS,
  kitMaterial,
  mergeColoredGeometries,
  mergeStaticMeshes,
  mergeStaticMeshesToVertexColor,
  roundedBox,
  VERTEX_COLOR_MATERIAL,
} from './kit';
import {
  box,
  cachedGeometry,
  contactShadow,
  createParcelTopDecal,
  cylinder,
  HEAD_CY,
  headShellGeometry,
  headphoneBandGeometry,
  mat,
  sphere,
} from './primitives';

export interface PersonRig {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  setCarry: (visible: boolean, color?: string) => void;
  update: (dt: number, moving: boolean, time: number, mood?: 'idle' | 'impatient' | 'angry') => void;
}

export interface PersonOptions {
  coat: string;
  pants: string;
  skin: string;
  hair: string;
  accent?: string;
  scale?: number;
  prop?: PropKind;
  cap?: boolean;
  boss?: boolean;
  build?: PersonBuild;
  hairStyle?: HairStyle;
  headwear?: Headwear;
  accessory?: PersonAccessory;
}

const BUILD_DIMS: Record<
  PersonBuild,
  {
    torsoW: number;
    torsoH: number;
    torsoD: number;
    hipW: number;
    legW: number;
    legPivot: number;
    headScale: number;
  }
> = {
  slim: {
    torsoW: 0.44,
    torsoH: 0.62,
    torsoD: 0.28,
    hipW: 0.38,
    legW: 0.15,
    legPivot: 0.52,
    headScale: 0.97,
  },
  regular: {
    torsoW: 0.5,
    torsoH: 0.62,
    torsoD: 0.31,
    hipW: 0.42,
    legW: 0.17,
    legPivot: 0.52,
    headScale: 1,
  },
  round: {
    torsoW: 0.58,
    torsoH: 0.6,
    torsoD: 0.38,
    hipW: 0.5,
    legW: 0.19,
    legPivot: 0.47,
    headScale: 1.02,
  },
  tall: {
    torsoW: 0.46,
    torsoH: 0.7,
    torsoD: 0.29,
    hipW: 0.4,
    legW: 0.16,
    legPivot: 0.56,
    headScale: 1,
  },
};

export function createPerson(options: PersonOptions): PersonRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const accent = options.accent ?? KIT_COLORS.mustard;
  const isBoss = Boolean(options.boss);
  const build = options.build ?? 'regular';
  const hairStyle = options.hairStyle ?? (isBoss ? 'bun' : 'short');
  const headwear = options.headwear ?? (options.cap ? 'cap' : 'none');
  const accessory = options.accessory ?? 'none';

  const dims = BUILD_DIMS[build];
  const legPivotY = dims.legPivot;
  const torsoCenterY = legPivotY + dims.torsoH / 2 + 0.11;
  const armPivotY = torsoCenterY + dims.torsoH * 0.35;
  const headY = torsoCenterY + dims.torsoH / 2 + 0.22;
  const armX = dims.torsoW / 2 + 0.03;
  const legX = dims.hipW / 2 - dims.legW / 2 + 0.01;

  const shadow = contactShadow(0.44, 0.3, 0.18);
  root.add(shadow);

  const legL = new THREE.Group();
  const legR = new THREE.Group();
  legL.position.set(-legX, legPivotY, 0);
  legR.position.set(legX, legPivotY, 0);
  const pantHeight = legPivotY - 0.06;
  for (const leg of [legL, legR]) {
    const pant = roundedBox(dims.legW, pantHeight, dims.legW * 1.08, options.pants, {
      radius: 0.028,
    });
    pant.position.y = -pantHeight / 2;
    leg.add(pant);

    const shoe = roundedBox(dims.legW * 1.18, 0.11, dims.legW * 1.6, '#3a3430', {
      radius: 0.035,
    });
    shoe.position.set(0, -pantHeight + 0.055, 0.045);
    leg.add(shoe);

    const sole = box(dims.legW * 1.2, 0.025, dims.legW * 1.62, KIT_COLORS.woodDeep);
    sole.position.set(0, -pantHeight + 0.008, 0.045);
    sole.raycast = () => {};
    leg.add(sole);

    root.add(leg);
  }

  const hip = roundedBox(dims.hipW, 0.2, dims.torsoD * 0.9, options.pants, { radius: 0.045 });
  hip.position.y = torsoCenterY - dims.torsoH / 2 + 0.05;
  body.add(hip);

  const torso = roundedBox(dims.torsoW, dims.torsoH, dims.torsoD, options.coat, {
    radius: 0.075,
  });
  torso.position.y = torsoCenterY;
  body.add(torso);

  const shirt = roundedBox(dims.torsoW * 0.28, dims.torsoH * 0.44, 0.025, KIT_COLORS.cream, {
    radius: 0.02,
  });
  shirt.position.set(0, torsoCenterY + 0.03, dims.torsoD / 2 + 0.006);
  body.add(shirt);

  for (const side of [-1, 1]) {
    const lapel = roundedBox(0.1, 0.24, 0.025, options.coat, { radius: 0.015 });
    lapel.position.set(side * 0.1, torsoCenterY + 0.16, dims.torsoD / 2 + 0.014);
    lapel.rotation.z = side * 0.32;
    body.add(lapel);
  }

  const belt = roundedBox(dims.torsoW + 0.02, 0.07, dims.torsoD + 0.02, KIT_COLORS.ink, {
    radius: 0.018,
  });
  belt.position.y = torsoCenterY - dims.torsoH / 2 + 0.015;
  body.add(belt);

  const buckle = roundedBox(0.055, 0.045, 0.02, accent, { radius: 0.01 });
  buckle.position.set(0, belt.position.y, dims.torsoD / 2 + 0.02);
  body.add(buckle);

  const badge = roundedBox(0.11, 0.07, 0.018, accent, { radius: 0.01 });
  badge.position.set(-dims.torsoW * 0.28, torsoCenterY + 0.09, dims.torsoD / 2 + 0.018);
  body.add(badge);

  const armL = new THREE.Group();
  const armR = new THREE.Group();
  armL.position.set(-armX, armPivotY, 0);
  armR.position.set(armX, armPivotY, 0);
  for (const arm of [armL, armR]) {
    const sleeve = roundedBox(0.14, 0.44, 0.15, options.coat, { radius: 0.035 });
    sleeve.position.y = -0.19;
    arm.add(sleeve);

    const cuff = roundedBox(0.145, 0.05, 0.155, KIT_COLORS.cream, { radius: 0.015 });
    cuff.position.y = -0.4;
    arm.add(cuff);

    const hand = roundedBox(0.1, 0.12, 0.11, options.skin, { radius: 0.03 });
    hand.position.y = -0.47;
    arm.add(hand);

    body.add(arm);
  }

  const head = new THREE.Group();
  head.position.set(0, headY, 0);
  head.scale.setScalar(dims.headScale);
  body.add(head);

  const neck = roundedBox(0.13, 0.12, 0.13, options.skin, { radius: 0.03 });
  neck.position.y = -0.19;
  head.add(neck);

  const skull = sphere(1, options.skin);
  skull.scale.set(0.21, 0.22, 0.2);
  skull.position.y = 0.02;
  head.add(skull);

  for (const side of [-1, 1]) {
    const ear = sphere(1, options.skin);
    ear.scale.set(0.035, 0.05, 0.03);
    ear.position.set(side * 0.205, 0.01, 0.01);
    head.add(ear);
  }

  const makeEye = (x: number): THREE.Group => {
    const eye = new THREE.Group();
    eye.position.set(x, 0.035, 0.178);

    const white = sphere(1, KIT_COLORS.white);
    white.scale.set(0.048, 0.055, 0.02);
    const pupil = sphere(1, KIT_COLORS.ink);
    pupil.scale.set(0.023, 0.03, 0.014);
    pupil.position.set(0, -0.002, 0.014);
    const glint = sphere(1, '#ffffff');
    glint.scale.set(0.008, 0.008, 0.006);
    glint.position.set(-0.009, 0.009, 0.022);

    const eyeParts = [white, pupil, glint].map((mesh) => {
      mesh.updateMatrix();
      return {
        geometry: mesh.geometry,
        matrix: mesh.matrix.clone(),
        color: (mesh.material as THREE.MeshLambertMaterial).color,
      };
    });
    const merged = mergeColoredGeometries(eyeParts);
    if (merged) {
      eye.add(new THREE.Mesh(merged, VERTEX_COLOR_MATERIAL));
    } else {
      eye.add(white, pupil, glint);
    }

    head.add(eye);
    return eye;
  };
  const eyeL = makeEye(-0.07);
  const eyeR = makeEye(0.07);

  const browL = roundedBox(0.08, 0.022, 0.02, options.hair, { radius: 0.008 });
  browL.position.set(-0.07, 0.105, 0.205);
  head.add(browL);
  const browR = browL.clone();
  browR.position.x = 0.07;
  head.add(browR);
  browL.userData.dynamic = true;
  browR.userData.dynamic = true;

  const nose = roundedBox(0.035, 0.045, 0.045, options.skin, { radius: 0.012 });
  nose.position.set(0, -0.005, 0.198);
  head.add(nose);

  const mouthColor = isBoss ? KIT_COLORS.plum : '#7a4a3a';
  const mouthSmile = new THREE.Mesh(
    new THREE.TorusGeometry(0.044, 0.011, 4, 8, Math.PI),
    kitMaterial(mouthColor),
  );
  mouthSmile.position.set(0, -0.075, 0.196);
  mouthSmile.rotation.z = Math.PI;
  head.add(mouthSmile);

  const mouthFlat = roundedBox(0.07, 0.018, 0.012, mouthColor, { radius: 0.008 });
  mouthFlat.position.set(0, -0.075, 0.197);
  mouthFlat.visible = false;
  mouthFlat.userData.dynamic = true;
  mouthSmile.userData.dynamic = true;
  head.add(mouthFlat);

  if (build === 'round' || options.prop === 'selfie' || isBoss) {
    for (const side of [-1, 1]) {
      const cheek = sphere(1, KIT_COLORS.coral);
      cheek.scale.set(0.04, 0.022, 0.012);
      cheek.position.set(side * 0.115, -0.035, 0.185);
      head.add(cheek);
    }
  }

  const hairColor = options.hair;
  const coveredHead = headwear !== 'none';

  if (hairStyle !== 'bald') {
    // Базовая масса волос — всегда одна и та же оболочка по черепу.
    // Кепка/платок накрывают её сверху, а снизу остаётся естественная
    // линия волос; под платком оболочка опущена ниже его края.
    const underScarf = headwear === 'scarf';
    const hairShell = new THREE.Mesh(
      headShellGeometry(
        underScarf ? 'hair-shell|scarf' : 'hair-shell|open',
        0.216,
        0.229,
        0.206,
        underScarf ? 0.112 : 0.128,
        underScarf ? -0.03 : 0.038,
        underScarf ? -0.155 : -0.058,
      ),
      mat(hairColor),
    );
    head.add(hairShell);
  }

  if (hairStyle === 'short') {
    for (const side of [-1, 1]) {
      const sideburn = sphere(1, hairColor);
      sideburn.scale.set(0.026, 0.05, 0.04);
      sideburn.position.set(side * 0.195, 0.045, 0.025);
      head.add(sideburn);
    }
  } else if (hairStyle === 'bob') {
    for (const side of [-1, 1]) {
      const sideHair = roundedBox(0.06, 0.22, 0.12, hairColor, { radius: 0.028 });
      sideHair.position.set(side * 0.188, -0.03, -0.035);
      head.add(sideHair);
    }
    const backHair = roundedBox(0.29, 0.23, 0.08, hairColor, { radius: 0.035 });
    backHair.position.set(0, -0.03, -0.15);
    head.add(backHair);
  } else if (hairStyle === 'long') {
    const backHair = roundedBox(0.28, 0.42, 0.09, hairColor, { radius: 0.035 });
    backHair.position.set(0, -0.14, -0.14);
    head.add(backHair);
    for (const side of [-1, 1]) {
      const strand = roundedBox(0.06, 0.32, 0.08, hairColor, { radius: 0.025 });
      strand.position.set(side * 0.188, -0.09, -0.035);
      head.add(strand);
      const frontStrand = roundedBox(0.055, 0.24, 0.06, hairColor, { radius: 0.02 });
      frontStrand.position.set(side * 0.153, -0.09, 0.11);
      head.add(frontStrand);
    }
  } else if (hairStyle === 'bun') {
    // Пучок вынесен за затылок, поэтому читается в силуэте,
    // а под кепкой и платком опускается к шее.
    const bunY = headwear === 'scarf' ? -0.16 : headwear === 'cap' ? -0.02 : 0.08;
    const bunZ = -0.245;
    const bun = sphere(1, hairColor);
    bun.scale.set(0.085, 0.085, 0.075);
    bun.position.set(0, bunY, bunZ);
    head.add(bun);
    const tie = new THREE.Mesh(
      cachedGeometry('bun-tie', () => new THREE.TorusGeometry(0.07, 0.011, 4, 18)),
      mat(accent),
    );
    tie.position.set(0, bunY, -0.21);
    head.add(tie);

    if (coveredHead) {
      // Волосы у висков выглядывают из-под кепки/платка.
      for (const side of [-1, 1]) {
        const sideTuft = sphere(1, hairColor);
        sideTuft.scale.set(0.03, 0.055, 0.045);
        sideTuft.position.set(side * 0.19, 0.005, 0.005);
        head.add(sideTuft);
      }
    }
  }

  if (headwear === 'scarf') {
    // Платок — не шар поверх головы, а оболочка с открытым лицом:
    // спереди край проходит надо лбом, сзади опускается к затылку.
    const scarf = new THREE.Mesh(
      headShellGeometry('scarf-shell', 0.234, 0.244, 0.224, 0.118, 0.002, -0.125),
      mat(accent),
    );
    head.add(scarf);

    // Узел и концы платка — сбоку-сзади, чтобы не читались как борода,
    // но силуэт оставался узнаваемым в профиль.
    const knot = sphere(1, accent);
    knot.scale.set(0.05, 0.04, 0.032);
    knot.position.set(0.135, -0.03, -0.175);
    head.add(knot);

    const tailA = roundedBox(0.05, 0.16, 0.026, accent, { radius: 0.014 });
    tailA.position.set(0.15, -0.12, -0.18);
    tailA.rotation.z = -0.12;
    tailA.rotation.x = 0.05;
    head.add(tailA);

    const tailB = roundedBox(0.036, 0.11, 0.022, accent, { radius: 0.011 });
    tailB.position.set(0.115, -0.11, -0.16);
    tailB.rotation.z = 0.18;
    head.add(tailB);
  } else if (headwear === 'cap') {
    // Купол кепки повторяет череп и полностью накрывает макушку,
    // а козырёк выходит вперёд над бровями, не заходя на лицо.
    const crown = new THREE.Mesh(
      headShellGeometry('cap-shell', 0.226, 0.246, 0.218, 0.122, 0.118, 0.112),
      mat(accent),
    );
    head.add(crown);

    const brimColor = `#${new THREE.Color(accent).multiplyScalar(0.82).getHexString()}`;
    const brim = roundedBox(0.33, 0.028, 0.21, brimColor, { radius: 0.014 });
    brim.position.set(0, 0.143, 0.205);
    brim.rotation.x = 0.035;
    head.add(brim);

    const button = sphere(1, accent);
    button.scale.set(0.026, 0.02, 0.026);
    button.position.set(0, 0.268, 0);
    head.add(button);
  }

  if (accessory === 'glasses' || accessory === 'sunglasses') {
    const lensColor = accessory === 'sunglasses' ? '#2b3138' : KIT_COLORS.cream;
    for (const side of [-1, 1]) {
      const lens = roundedBox(0.085, 0.065, 0.012, lensColor, {
        radius: 0.015,
        transparent: accessory === 'glasses',
        opacity: accessory === 'glasses' ? 0.25 : 1,
        depthWrite: accessory !== 'glasses',
      });
      lens.position.set(side * 0.07, 0.035, 0.205);
      head.add(lens);
    }
    const bridge = box(0.03, 0.012, 0.012, KIT_COLORS.ink);
    bridge.position.set(0, 0.035, 0.212);
    head.add(bridge);
  }

  if (accessory === 'headphones') {
    // Дуга лежит поверх причёски/кепки, а чашки — снаружи висков.
    const bandRadius = headwear === 'none' ? 0.234 : 0.262;
    const band = new THREE.Mesh(headphoneBandGeometry(bandRadius), mat(KIT_COLORS.ink));
    band.position.set(0, HEAD_CY, 0);
    head.add(band);
    for (const side of [-1, 1]) {
      const cup = roundedBox(0.06, 0.1, 0.08, accent, { radius: 0.02 });
      cup.position.set(side * 0.225, 0.02, 0.005);
      head.add(cup);
    }
  }

  if (accessory === 'earrings') {
    for (const side of [-1, 1]) {
      const earring = sphere(1, accent);
      earring.scale.set(0.018, 0.03, 0.018);
      earring.position.set(side * 0.22, -0.055, 0.045);
      head.add(earring);
    }
  }

  if (accessory === 'tie') {
    const knot = roundedBox(0.055, 0.055, 0.02, accent, { radius: 0.012 });
    knot.position.set(0, torsoCenterY + 0.2, dims.torsoD / 2 + 0.03);
    body.add(knot);
    const tie = roundedBox(0.07, 0.24, 0.02, accent, { radius: 0.012 });
    tie.position.set(0, torsoCenterY + 0.06, dims.torsoD / 2 + 0.028);
    body.add(tie);
  }

  if (accessory === 'lanyard') {
    for (const side of [-1, 1]) {
      const strap = box(0.012, 0.3, 0.012, accent);
      strap.position.set(side * 0.08, torsoCenterY + 0.12, dims.torsoD / 2 + 0.02);
      strap.rotation.z = side * 0.18;
      body.add(strap);
    }
    const card = roundedBox(0.08, 0.1, 0.012, KIT_COLORS.cream, { radius: 0.01 });
    card.position.set(0, torsoCenterY + 0.02, dims.torsoD / 2 + 0.03);
    body.add(card);
  }

  if (options.prop === 'backpack') {
    const pack = roundedBox(0.34, 0.38, 0.18, accent, { radius: 0.05 });
    pack.position.set(0, torsoCenterY + 0.03, -dims.torsoD / 2 - 0.12);
    body.add(pack);
    const pocket = roundedBox(0.22, 0.14, 0.06, KIT_COLORS.cream, { radius: 0.025 });
    pocket.position.set(0, torsoCenterY - 0.06, -dims.torsoD / 2 - 0.22);
    body.add(pocket);
    for (const side of [-1, 1]) {
      const strap = box(0.035, dims.torsoH * 0.8, 0.02, KIT_COLORS.ink);
      strap.position.set(side * 0.16, torsoCenterY + 0.02, dims.torsoD / 2 + 0.012);
      body.add(strap);
    }
  } else if (options.prop === 'bag') {
    const bag = roundedBox(0.3, 0.33, 0.17, accent, { radius: 0.05 });
    bag.position.set(dims.torsoW / 2 + 0.12, torsoCenterY - 0.22, 0.03);
    body.add(bag);
    const handle = roundedBox(0.02, 0.2, 0.02, KIT_COLORS.woodDark, { radius: 0.008 });
    handle.position.set(dims.torsoW / 2 + 0.12, torsoCenterY + 0.02, 0.03);
    body.add(handle);
  } else if (options.prop === 'phone') {
    const phone = roundedBox(0.08, 0.14, 0.025, '#222a33', { radius: 0.012 });
    phone.position.set(0, -0.48, 0.09);
    armR.add(phone);
    const screen = box(0.055, 0.1, 0.008, '#8fd6ff');
    screen.position.set(0, -0.48, 0.105);
    armR.add(screen);
  } else if (options.prop === 'cane') {
    const cane = cylinder(0.022, 0.022, 0.92, KIT_COLORS.woodDark, 8);
    cane.position.set(-dims.torsoW / 2 - 0.12, 0.46, 0.08);
    body.add(cane);
    const handle = roundedBox(0.14, 0.035, 0.04, KIT_COLORS.woodDark, { radius: 0.012 });
    handle.position.set(-dims.torsoW / 2 - 0.06, 0.94, 0.08);
    body.add(handle);
  } else if (options.prop === 'selfie') {
    const stick = cylinder(0.018, 0.018, 0.62, '#2b2b33', 8);
    stick.position.set(dims.torsoW / 2 + 0.1, torsoCenterY + 0.02, 0.12);
    body.add(stick);
    const phone = roundedBox(0.14, 0.2, 0.025, '#222a33', { radius: 0.02 });
    phone.position.set(dims.torsoW / 2 + 0.1, torsoCenterY + 0.38, 0.12);
    body.add(phone);
    const screen = box(0.1, 0.15, 0.006, '#8fd6ff');
    screen.position.set(dims.torsoW / 2 + 0.1, torsoCenterY + 0.38, 0.135);
    body.add(screen);
  }

  const carry = new THREE.Group();
  carry.position.set(0, torsoCenterY + 0.02, dims.torsoD / 2 + 0.15);
  body.add(carry);
  const carriedParcel = roundedBox(0.34, 0.3, 0.26, '#d8b98a', { radius: 0.035 });
  const carryMaterial = (carriedParcel.material as THREE.MeshLambertMaterial).clone();
  carriedParcel.material = carryMaterial;
  carry.add(carriedParcel);
  const carryDecal = createParcelTopDecal();
  carryDecal.position.set(0, 0.156, 0);
  carry.add(carryDecal);
  carry.visible = false;

  mergeStaticMeshesToVertexColor(
    body.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh),
    body,
    VERTEX_COLOR_MATERIAL,
  );
  mergeStaticMeshesToVertexColor(
    armL.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh),
    armL,
    VERTEX_COLOR_MATERIAL,
  );
  mergeStaticMeshesToVertexColor(
    armR.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh),
    armR,
    VERTEX_COLOR_MATERIAL,
  );
  mergeStaticMeshesToVertexColor(
    legL.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh),
    legL,
    VERTEX_COLOR_MATERIAL,
  );
  mergeStaticMeshesToVertexColor(
    legR.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh),
    legR,
    VERTEX_COLOR_MATERIAL,
  );
  const headMeshes = head.children.filter(
    (child): child is THREE.Mesh => child instanceof THREE.Mesh,
  );
  const headOpaque = headMeshes.filter(
    (mesh) => !(mesh.material as THREE.Material).transparent && !mesh.userData.dynamic,
  );
  const headTransparent = headMeshes.filter(
    (mesh) => (mesh.material as THREE.Material).transparent,
  );
  mergeStaticMeshesToVertexColor(headOpaque, head, VERTEX_COLOR_MATERIAL);
  mergeStaticMeshes(headTransparent, head);

  root.scale.setScalar(options.scale ?? 1);

  let phase = Math.random() * Math.PI * 2;
  const offset = Math.random() * Math.PI * 2;
  let carrying = false;
  let blinkTimer = 2.5 + Math.random() * 3;
  let blinkTime = 0;
  let gestureTimer = 5 + Math.random() * 5;
  let gestureTime = 0;
  let gestureSide = 1;

  const rig: PersonRig = {
    root,
    body,
    head,
    armL,
    armR,
    legL,
    legR,
    setCarry(visible: boolean, color?: string) {
      carrying = visible;
      carry.visible = visible;
      if (color) carryMaterial.color.set(color);
    },
    update(dt: number, moving: boolean, time: number, mood = 'idle') {
      phase += dt * (moving ? 9.5 : 2.2);
      const swing = Math.sin(phase);
      const walk = moving ? 1 : 0;

      legL.rotation.x = swing * 0.55 * walk;
      legR.rotation.x = -swing * 0.55 * walk;
      armL.rotation.x = -swing * 0.42 * walk;
      armR.rotation.x = swing * 0.42 * walk;
      armL.rotation.z = 0;
      armR.rotation.z = 0;

      body.position.y = 0;
      body.rotation.x = 0;
      body.rotation.z = 0;
      head.rotation.x = 0;
      head.rotation.y = 0;
      head.rotation.z = 0;

      if (moving) {
        body.position.y = Math.abs(Math.sin(phase * 2)) * 0.035;
        body.rotation.z = Math.sin(phase) * 0.025;
        body.rotation.x = 0.045;
        head.rotation.y = Math.sin(phase * 0.5) * 0.035;
      } else {
        body.position.y = Math.sin(time * 1.8 + offset) * 0.007;
        body.rotation.z = Math.sin(time * 1.1 + offset) * 0.008;
        head.rotation.y = Math.sin(time * 0.7 + offset) * 0.13;
        head.rotation.z = Math.sin(time * 0.5 + offset) * 0.03;
      }

      // Моргание и выражение лица.
      blinkTimer -= dt;
      if (blinkTimer <= 0) {
        blinkTime = 0.12;
        blinkTimer = 2.4 + Math.random() * 3.2;
      }
      if (blinkTime > 0) blinkTime -= dt;
      const moodEye = mood === 'angry' ? 0.58 : mood === 'impatient' ? 0.76 : 1;
      const eyeScale = blinkTime > 0 ? 0.12 : moodEye;
      eyeL.scale.y = eyeScale;
      eyeR.scale.y = eyeScale;

      const browAngle = mood === 'angry' ? 0.28 : mood === 'impatient' ? 0.15 : 0.04;
      browL.rotation.z = -browAngle;
      browR.rotation.z = browAngle;
      browL.position.y = mood === 'angry' ? 0.095 : mood === 'impatient' ? 0.108 : 0.105;
      browR.position.y = browL.position.y;
      const displeased = mood !== 'idle';
      mouthSmile.visible = !displeased;
      mouthFlat.visible = displeased;
      mouthFlat.rotation.z = mood === 'angry' ? -0.08 : 0;
      mouthFlat.scale.x = mood === 'angry' ? 1.1 : 1;

      if (mood === 'impatient' && !moving) {
        legR.rotation.x = Math.max(0, Math.sin(time * 11 + offset)) * 0.18;
        armL.rotation.z = 0.1;
        armR.rotation.z = -0.1;
        body.rotation.x = 0.03;
        head.rotation.y = Math.sin(time * 1.8 + offset) * 0.07;
      }

      if (mood === 'angry') {
        body.rotation.z = Math.sin(time * 18) * 0.026;
        body.rotation.x = 0.02;
        head.rotation.y = Math.sin(time * 12 + offset) * 0.018;
        armL.rotation.z = 0.22;
        armR.rotation.z = -0.22;
      }

      if (carrying) {
        armL.rotation.x = -1.04 + swing * 0.04;
        armR.rotation.x = -1.04 - swing * 0.04;
        armL.rotation.z = -0.08;
        armR.rotation.z = 0.08;
        body.rotation.x = moving ? 0.02 : -0.015;
      } else if (!moving) {
        // Редкий спокойный жест рукой, чтобы персонаж не выглядел статуей.
        gestureTimer -= dt;
        if (gestureTimer <= 0) {
          gestureTime = 1.15;
          gestureTimer = 7 + Math.random() * 6;
          gestureSide = Math.random() < 0.5 ? -1 : 1;
        }
        if (gestureTime > 0) {
          gestureTime -= dt;
          const t = 1 - Math.max(0, gestureTime) / 1.15;
          const lift = Math.sin(t * Math.PI);
          const arm = gestureSide < 0 ? armL : armR;
          arm.rotation.x = -0.15 * lift;
          arm.rotation.z = gestureSide * -0.95 * lift;
        }
      }
    },
  };

  return rig;
}

export function createBossPerson(archetype: Archetype): PersonRig {
  return createPerson({
    coat: archetype.coat,
    pants: archetype.pants,
    skin: archetype.skin,
    hair: archetype.hair,
    accent: archetype.accent,
    prop: archetype.prop,
    scale: archetype.scale,
    boss: true,
    build: archetype.build,
    hairStyle: archetype.hairStyle,
    headwear: archetype.headwear,
    accessory: archetype.accessory,
  });
}
