import * as THREE from 'three';
import { PALETTE } from '../data';
import {
  KIT_COLORS,
  mergeColoredGeometries,
  roundedBoxGeometry,
} from './kit';

export const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
export const UNIT_SPHERE = new THREE.SphereGeometry(1, 8, 6);
const GEO_CACHE = new Map<string, THREE.BufferGeometry>();
const MAT_CACHE = new Map<string, THREE.MeshLambertMaterial>();
const PARCEL_TOP_GEOMETRY = new THREE.PlaneGeometry(0.34, 0.25);
let parcelTopMaterial: THREE.MeshBasicMaterial | null = null;

/** Одна наклейка-декаль на верх посылки: скотч + бумажный штрихкод. */
export function createParcelTopDecal(): THREE.Mesh {
  if (!parcelTopMaterial) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 192;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 256, 192);

      ctx.fillStyle = KIT_COLORS.tape;
      ctx.fillRect(112, 0, 32, 192);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.fillRect(118, 0, 20, 192);

      ctx.fillStyle = '#fff8eb';
      ctx.fillRect(24, 38, 112, 74);
      ctx.strokeStyle = '#d8c1a0';
      ctx.lineWidth = 4;
      ctx.strokeRect(26, 40, 108, 70);

      let x = 38;
      let index = 0;
      while (x < 124) {
        const barWidth = 2 + ((index * 5) % 4);
        ctx.fillStyle = index % 4 === 0 ? '#26313a' : '#6b5a4a';
        ctx.fillRect(x, 50, barWidth, 34);
        x += barWidth + 3;
        index++;
      }

      ctx.fillStyle = '#26313a';
      ctx.font = '700 15px Arial, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('ПВЗ · 01', 80, 102);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    parcelTopMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    });
  }

  const mesh = new THREE.Mesh(PARCEL_TOP_GEOMETRY, parcelTopMaterial);
  mesh.rotation.x = -Math.PI / 2;
  mesh.raycast = () => {};
  return mesh;
}

export const PARCEL_VERTEX_MATERIAL = new THREE.MeshLambertMaterial({
  vertexColors: true,
  flatShading: false,
});
const PARCEL_GEOMETRY_CACHE = new Map<string, THREE.BufferGeometry>();

/**
 * Одна геометрия посылки: короб + скотч + бумажная наклейка со штрихкодом.
 * Vertex colors позволяют уложиться в один draw call на посылку.
 */
export function createParcelGeometry(color: string): THREE.BufferGeometry {
  const cached = PARCEL_GEOMETRY_CACHE.get(color);
  if (cached) return cached;

  const parts = [
    {
      geometry: roundedBoxGeometry(0.34, 0.28, 0.25, 0.035),
      matrix: new THREE.Matrix4(),
      color,
    },
    {
      geometry: UNIT_BOX,
      matrix: new THREE.Matrix4().compose(
        new THREE.Vector3(0, 0.146, 0),
        new THREE.Quaternion(),
        new THREE.Vector3(0.09, 0.012, 0.255),
      ),
      color: KIT_COLORS.tape,
    },
    {
      geometry: UNIT_BOX,
      matrix: new THREE.Matrix4().compose(
        new THREE.Vector3(-0.075, 0.142, -0.045),
        new THREE.Quaternion(),
        new THREE.Vector3(0.15, 0.004, 0.1),
      ),
      color: '#fff8eb',
    },
  ];

  for (let index = 0; index < 6; index++) {
    parts.push({
      geometry: UNIT_BOX,
      matrix: new THREE.Matrix4().compose(
        new THREE.Vector3(-0.135 + index * 0.012, 0.145, -0.045),
        new THREE.Quaternion(),
        new THREE.Vector3(0.006, 0.003, 0.05),
      ),
      color: KIT_COLORS.ink,
    });
  }

  const merged = mergeColoredGeometries(parts);
  if (!merged) {
    return roundedBoxGeometry(0.34, 0.28, 0.25, 0.035);
  }
  PARCEL_GEOMETRY_CACHE.set(color, merged);
  return merged;
}

export function mat(color: string, transparent = false, opacity = 1): THREE.MeshLambertMaterial {
  const key = `${color}|${transparent ? 't' : 'o'}|${opacity}`;
  const cached = MAT_CACHE.get(key);
  if (cached) return cached;
  const material = new THREE.MeshLambertMaterial({
    color,
    flatShading: true,
    transparent,
    opacity,
    depthWrite: !transparent,
  });
  MAT_CACHE.set(key, material);
  return material;
}

export function box(
  w: number,
  h: number,
  d: number,
  color: string,
  options: { transparent?: boolean; opacity?: number } = {},
): THREE.Mesh {
  const mesh = new THREE.Mesh(UNIT_BOX, mat(color, options.transparent, options.opacity));
  mesh.scale.set(w, h, d);
  return mesh;
}

export function sphere(r: number, color: string): THREE.Mesh {
  const mesh = new THREE.Mesh(UNIT_SPHERE, mat(color));
  mesh.scale.setScalar(r);
  return mesh;
}

export function cachedGeometry(key: string, create: () => THREE.BufferGeometry): THREE.BufferGeometry {
  const existing = GEO_CACHE.get(key);
  if (existing) return existing;
  const geometry = create();
  GEO_CACHE.set(key, geometry);
  return geometry;
}

export const HEAD_CY = 0.02;

const WOOD_TEXTURE_CACHE = new Map<string, THREE.CanvasTexture>();

/** Small, deterministic oak grain; shared by surfaces, with no external assets. */
export function woodTexture(base: string, repeatX = 1, repeatY = 1): THREE.CanvasTexture {
  const key = `${base}|${repeatX}|${repeatY}`;
  const cached = WOOD_TEXTURE_CACHE.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 256);
    for (let board = 0; board < 4; board++) {
      ctx.fillStyle = board % 2 ? 'rgba(255,248,229,0.08)' : 'rgba(110,76,45,0.035)';
      ctx.fillRect(0, board * 64, 256, 64);
      ctx.fillStyle = 'rgba(100,72,48,0.12)';
      ctx.fillRect(0, board * 64, 256, 1);
      ctx.fillRect((board * 97) % 256, board * 64, 1, 64);
    }
    for (let line = 0; line < 100; line++) {
      const y = (line * 31.73) % 256;
      ctx.strokeStyle = line % 3 ? 'rgba(116,80,46,0.055)' : 'rgba(255,251,235,0.12)';
      ctx.lineWidth = 0.5 + (line % 3) * 0.25;
      ctx.beginPath();
      for (let x = 0; x <= 256; x += 4) {
        const gy = y + Math.sin(x * Math.PI / 128 + line) * (0.5 + line % 4);
        if (x === 0) ctx.moveTo(x, gy);
        else ctx.lineTo(x, gy);
      }
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 4;
  WOOD_TEXTURE_CACHE.set(key, texture);
  return texture;
}

/**
 * Оболочка-шапочка по эллипсоиду черепа.
 * Край задаётся отдельно спереди, сбоку и сзади, поэтому причёска
 * и головной убор повторяют форму головы, а не режут лицо и виски.
 */
export function headShellGeometry(
  key: string,
  rx: number,
  ry: number,
  rz: number,
  frontY: number,
  sideY: number,
  backY: number,
): THREE.BufferGeometry {
  return cachedGeometry(key, () => {
    const segments = 22;
    const rings = 6;
    const positions: number[] = [0, HEAD_CY + ry, 0];
    const uvs: number[] = [0.5, 1];
    const indices: number[] = [];
    const rows: number[][] = [];

    for (let ring = 1; ring <= rings; ring++) {
      const row: number[] = [];
      for (let segment = 0; segment < segments; segment++) {
        const phi = (segment / segments) * Math.PI * 2;
        const cos = Math.cos(phi);
        const rimY =
          sideY +
          (frontY - sideY) * Math.max(0, cos) +
          (backY - sideY) * Math.max(0, -cos);
        const thetaMax = Math.acos(
          THREE.MathUtils.clamp((rimY - HEAD_CY) / ry, -0.995, 0.995),
        );
        const theta = (thetaMax * ring) / rings;
        const sin = Math.sin(theta);
        positions.push(
          rx * sin * Math.sin(phi),
          HEAD_CY + ry * Math.cos(theta),
          rz * sin * Math.cos(phi),
        );
        uvs.push(segment / segments, 1 - ring / rings);
        row.push(positions.length / 3 - 1);
      }
      rows.push(row);
    }

    for (let segment = 0; segment < segments; segment++) {
      const next = (segment + 1) % segments;
      indices.push(0, rows[0][segment], rows[0][next]);
    }
    for (let ring = 0; ring < rings - 1; ring++) {
      for (let segment = 0; segment < segments; segment++) {
        const next = (segment + 1) % segments;
        const a = rows[ring][segment];
        const b = rows[ring + 1][segment];
        const c = rows[ring][next];
        const d = rows[ring + 1][next];
        indices.push(a, b, c, b, d, c);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  });
}

export function headphoneBandGeometry(radius: number): THREE.BufferGeometry {
  return cachedGeometry(`headphone-band|${radius}`, () => {
    const geometry = new THREE.TorusGeometry(radius, 0.016, 5, 24, Math.PI);
    return geometry;
  });
}

export function cylinder(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  color: string,
  segments = 8,
): THREE.Mesh {
  const key = `cyl|${radiusTop}|${radiusBottom}|${height}|${segments}`;
  const geometry = cachedGeometry(key, () =>
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
  );
  return new THREE.Mesh(geometry, mat(color));
}

export function cone(radius: number, height: number, color: string, segments = 6): THREE.Mesh {
  const key = `cone|${radius}|${height}|${segments}`;
  const geometry = cachedGeometry(key, () => new THREE.ConeGeometry(radius, height, segments));
  return new THREE.Mesh(geometry, mat(color));
}

let contactShadowTexture: THREE.CanvasTexture | null = null;

export function contactShadow(width: number, depth: number, opacity = 0.16): THREE.Mesh {
  if (!contactShadowTexture) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const gradient = ctx.createRadialGradient(32, 32, 3, 32, 32, 32);
      gradient.addColorStop(0, 'rgba(55,43,33,0.95)');
      gradient.addColorStop(0.35, 'rgba(55,43,33,0.65)');
      gradient.addColorStop(0.7, 'rgba(55,43,33,0.2)');
      gradient.addColorStop(1, 'rgba(55,43,33,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 64, 64);
    }
    contactShadowTexture = new THREE.CanvasTexture(canvas);
    contactShadowTexture.colorSpace = THREE.SRGBColorSpace;
  }
  const geometry = cachedGeometry('soft-contact-plane', () => new THREE.PlaneGeometry(2, 2));
  const material = new THREE.MeshBasicMaterial({
    map: contactShadowTexture,
    transparent: true,
    opacity: Math.min(1, opacity * 2.2),
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.012;
  mesh.scale.set(width, depth, 1);
  mesh.raycast = () => {};
  return mesh;
}

export interface TextTextureOptions {
  width?: number;
  height?: number;
  bg?: string;
  color?: string;
  fontSize?: number;
  font?: string;
  border?: string;
  subtext?: string;
}

export function makeTextTexture(text: string, options: TextTextureOptions = {}): THREE.CanvasTexture {
  const w = options.width ?? 512;
  const h = options.height ?? 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  ctx.fillStyle = options.bg ?? PALETTE.cream;
  ctx.fillRect(0, 0, w, h);

  if (options.border) {
    ctx.strokeStyle = options.border;
    ctx.lineWidth = Math.max(4, h * 0.045);
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
  }

  ctx.fillStyle = options.color ?? PALETTE.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${options.fontSize ?? Math.round(h * 0.48)}px ${
    options.font ?? 'Arial, "Segoe UI", sans-serif'
  }`;
  ctx.fillText(text, w / 2, options.subtext ? h * 0.38 : h / 2);

  if (options.subtext) {
    ctx.font = `600 ${Math.round(h * 0.17)}px ${options.font ?? 'Arial, "Segoe UI", sans-serif'}`;
    ctx.globalAlpha = 0.68;
    ctx.fillText(options.subtext, w / 2, h * 0.72);
    ctx.globalAlpha = 1;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function signPlane(
  text: string,
  width: number,
  height: number,
  options: TextTextureOptions = {},
): THREE.Mesh {
  const texture = makeTextTexture(text, {
    width: 512,
    height: 160,
    fontSize: 70,
    ...options,
  });
  const material = new THREE.MeshBasicMaterial({ map: texture });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  return mesh;
}
