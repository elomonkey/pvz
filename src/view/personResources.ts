import type { BufferGeometry, Material } from 'three';

/** Maximum number of parcels shown in the stack above the bottom one. */
export const MAX_CARRY_PARCELS = 4;

/** Explicit ownership list: never infer ownership by traversing a character. */
export interface PersonResources {
  geometries: BufferGeometry[];
  materials: Material[];
}

/** Only factory-created instance resources belong here; caches/textures stay shared. */
export function createPersonDisposer(resources: PersonResources): () => void {
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    for (const geometry of new Set(resources.geometries)) geometry.dispose();
    for (const material of new Set(resources.materials)) material.dispose();
    resources.geometries.length = 0;
    resources.materials.length = 0;
  };
}
