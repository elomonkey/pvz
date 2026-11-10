import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Единая визуальная библиотека «уютной low-poly диорамы».
 * Здесь только геометрия, материалы и палитра — без игровых правил.
 */

const MERGE_ATTRIBUTES = ['position', 'normal', 'uv'];

/**
 * Сливает статические Mesh-детали в один Mesh на материал.
 * Не трогает группы, мультиматериалы и объекты с userData.dynamic.
 * Возвращает число убранных draw calls (примерно).
 */
export function mergeStaticMeshes(meshes: THREE.Mesh[], parent: THREE.Object3D): number {
  const byMaterial = new Map<string, { material: THREE.Material; list: THREE.Mesh[] }>();

  for (const mesh of meshes) {
    if (!mesh.isMesh || mesh.children.length > 0) continue;
    if (Array.isArray(mesh.material) || mesh.userData.dynamic) continue;
    const key = (mesh.material as THREE.Material).uuid;
    const entry = byMaterial.get(key) ?? {
      material: mesh.material as THREE.Material,
      list: [],
    };
    entry.list.push(mesh);
    byMaterial.set(key, entry);
  }

  let removed = 0;

  for (const { material, list } of byMaterial.values()) {
    if (list.length < 2) continue;

    const allIndexed = list.every((mesh) => mesh.geometry.index !== null);
    const geometries: THREE.BufferGeometry[] = [];

    for (const mesh of list) {
      mesh.updateMatrix();
      let geometry = allIndexed
        ? mesh.geometry.clone()
        : mesh.geometry.index
          ? mesh.geometry.toNonIndexed()
          : mesh.geometry.clone();

      for (const attribute of Object.keys(geometry.attributes)) {
        if (!MERGE_ATTRIBUTES.includes(attribute)) geometry.deleteAttribute(attribute);
      }

      geometry.applyMatrix4(mesh.matrix);
      geometries.push(geometry);
    }

    const merged = mergeGeometries(geometries, false);
    for (const geometry of geometries) geometry.dispose();
    if (!merged) continue;

    const mergedMesh = new THREE.Mesh(merged, material);
    parent.add(mergedMesh);
    for (const mesh of list) mesh.removeFromParent();
    removed += list.length - 1;
  }

  return removed;
}

export interface ColoredGeometryPart {
  geometry: THREE.BufferGeometry;
  matrix: THREE.Matrix4;
  color: THREE.ColorRepresentation;
}

/**
 * Сливает статические Mesh-детали в один Mesh с vertex colors.
 * Подходит для тела, рук, ног и глаз: одна геометрия — один draw call.
 */
export function mergeStaticMeshesToVertexColor(
  meshes: THREE.Mesh[],
  parent: THREE.Object3D,
  material: THREE.Material,
): THREE.Mesh | null {
  const parts: ColoredGeometryPart[] = [];
  const included: THREE.Mesh[] = [];

  for (const mesh of meshes) {
    if (!mesh.isMesh || mesh.children.length > 0 || Array.isArray(mesh.material)) continue;
    const meshMaterial = mesh.material as THREE.MeshLambertMaterial & {
      map?: THREE.Texture | null;
    };
    if (
      !meshMaterial.color ||
      meshMaterial.map ||
      meshMaterial.transparent ||
      meshMaterial.opacity < 1
    ) {
      continue;
    }
    mesh.updateMatrix();
    parts.push({
      geometry: mesh.geometry,
      matrix: mesh.matrix.clone(),
      color: meshMaterial.color,
    });
    included.push(mesh);
  }

  if (parts.length < 2) return null;

  const merged = mergeColoredGeometries(parts);
  if (!merged) return null;

  const mergedMesh = new THREE.Mesh(merged, material);
  parent.add(mergedMesh);
  for (const mesh of included) mesh.removeFromParent();
  return mergedMesh;
}

/** Собирает несколько геометрий в одну с vertex colors — один draw call. */
export function mergeColoredGeometries(parts: ColoredGeometryPart[]): THREE.BufferGeometry | null {
  if (parts.length === 0) return null;

  const geometries: THREE.BufferGeometry[] = [];

  for (const part of parts) {
    const geometry = part.geometry.index
      ? part.geometry.toNonIndexed()
      : part.geometry.clone();
    geometry.applyMatrix4(part.matrix);

    for (const attribute of Object.keys(geometry.attributes)) {
      if (![...MERGE_ATTRIBUTES, 'color'].includes(attribute)) {
        geometry.deleteAttribute(attribute);
      }
    }

    const color = new THREE.Color(part.color);
    const count = geometry.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometries.push(geometry);
  }

  const merged = mergeGeometries(geometries, false);
  for (const geometry of geometries) geometry.dispose();
  return merged;
}

export const KIT_COLORS = {
  bg: '#e3ece7',
  wall: '#edf2ec',
  wallTrim: '#c8d8cd',
  cream: '#fff4e3',
  paper: '#f6e7d2',
  paperDeep: '#ead4b8',
  ink: '#26313a',
  wood: '#c99766',
  woodLight: '#e0bb8a',
  woodDark: '#8b6446',
  woodDeep: '#5b4634',
  sage: '#7f9f89',
  sageLight: '#a9c4b1',
  sageDark: '#5f7f6d',
  cell: '#59645c',
  coral: '#d98b72',
  coralDark: '#b96e5b',
  mustard: '#f0b44c',
  blue: '#6f9fc4',
  plum: '#8e5a6e',
  white: '#fffaf0',
  shadow: '#1a2430',
  tape: '#f6e7d2',
  metal: '#3b4b52',
  screen: '#17212b',
  screenText: '#9fe6a8',
} as const;

export interface KitMaterialOptions {
  transparent?: boolean;
  opacity?: number;
  depthWrite?: boolean;
  side?: THREE.Side;
  emissive?: string;
  emissiveIntensity?: number;
}

export const VERTEX_COLOR_MATERIAL = new THREE.MeshLambertMaterial({
  vertexColors: true,
  flatShading: true,
});

const MATERIAL_CACHE = new Map<string, THREE.MeshLambertMaterial>();

export function kitMaterial(
  color: string,
  options: KitMaterialOptions = {},
): THREE.MeshLambertMaterial {
  const key = [
    color,
    options.transparent ? 1 : 0,
    options.opacity ?? 1,
    options.depthWrite === false ? 0 : 1,
    options.side ?? THREE.FrontSide,
    options.emissive ?? '',
    options.emissiveIntensity ?? 0,
  ].join('|');

  const cached = MATERIAL_CACHE.get(key);
  if (cached) return cached;

  const material = new THREE.MeshLambertMaterial({
    color,
    flatShading: true,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    depthWrite: options.depthWrite ?? !(options.transparent ?? false),
    side: options.side ?? THREE.FrontSide,
  });
  if (options.emissive) {
    material.emissive = new THREE.Color(options.emissive);
    material.emissiveIntensity = options.emissiveIntensity ?? 1;
  }

  MATERIAL_CACHE.set(key, material);
  return material;
}

export interface RoundedBoxOptions extends KitMaterialOptions {
  radius?: number;
  segments?: number;
}

const ROUNDED_CACHE = new Map<string, RoundedBoxGeometry>();

function roundedGeometry(
  width: number,
  height: number,
  depth: number,
  radius: number,
  segments: number,
): RoundedBoxGeometry {
  const key = [width, height, depth, radius, segments].map((value) => value.toFixed(3)).join('|');
  const cached = ROUNDED_CACHE.get(key);
  if (cached) return cached;
  const geometry = new RoundedBoxGeometry(width, height, depth, segments, radius);
  ROUNDED_CACHE.set(key, geometry);
  return geometry;
}

/**
 * Геометрия скруглённого короба без создания Mesh.
 * Нужна для сборки составных геометрий с vertex colors.
 */
export function roundedBoxGeometry(
  width: number,
  height: number,
  depth: number,
  radius?: number,
  segments = 2,
): RoundedBoxGeometry {
  const minSide = Math.min(width, height, depth);
  const safeRadius = Math.max(0.001, Math.min(radius ?? minSide * 0.16, minSide * 0.48));
  return roundedGeometry(width, height, depth, safeRadius, segments);
}

/**
 * Скруглённый короб — базовый строительный блок диорамы.
 * Размеры задаются в мировых единицах, геометрия кэшируется.
 */
export function roundedBox(
  width: number,
  height: number,
  depth: number,
  color: string,
  options: RoundedBoxOptions = {},
): THREE.Mesh {
  const geometry = roundedBoxGeometry(width, height, depth, options.radius, options.segments);
  return new THREE.Mesh(geometry, kitMaterial(color, options));
}

/** Тонкая накладка/панель: тот же короб, но с меньшим радиусом по умолчанию. */
export function kitPanel(
  width: number,
  height: number,
  depth: number,
  color: string,
  options: RoundedBoxOptions = {},
): THREE.Mesh {
  return roundedBox(width, height, depth, color, {
    ...options,
    radius: Math.min(options.radius ?? 0.018, Math.min(width, height, depth) * 0.4),
  });
}

/** Небольшой цилиндр с кэшем геометрии для ручек, ножек и мелких деталей. */
const CYLINDER_CACHE = new Map<string, THREE.CylinderGeometry>();

export function kitCylinder(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  color: string,
  segments = 10,
): THREE.Mesh {
  const key = [radiusTop, radiusBottom, height, segments].join('|');
  let geometry = CYLINDER_CACHE.get(key);
  if (!geometry) {
    geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments);
    CYLINDER_CACHE.set(key, geometry);
  }
  return new THREE.Mesh(geometry, kitMaterial(color));
}
