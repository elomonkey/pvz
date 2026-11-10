import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, MeshBasicMaterial, Texture } from 'three';
import { createPersonDisposer } from '../src/view/personResources.ts';

test('person resources: dispose is idempotent and keeps shared geometry, material and texture', () => {
  const sharedGeometry = new BoxGeometry();
  const sharedTexture = new Texture();
  const sharedMaterial = new MeshBasicMaterial({ map: sharedTexture });
  const geometry = sharedGeometry.clone();
  const material = sharedMaterial.clone();
  let ownGeometryDisposals = 0,
    ownMaterialDisposals = 0,
    sharedDisposals = 0;
  geometry.addEventListener('dispose', () => ownGeometryDisposals++);
  material.addEventListener('dispose', () => ownMaterialDisposals++);
  for (const resource of [sharedGeometry, sharedTexture, sharedMaterial]) {
    resource.addEventListener('dispose', () => sharedDisposals++);
  }
  const resources = { geometries: [geometry, geometry], materials: [material, material] };
  const dispose = createPersonDisposer(resources);
  dispose();
  dispose();
  assert.equal(ownGeometryDisposals, 1);
  assert.equal(ownMaterialDisposals, 1);
  assert.equal(sharedDisposals, 0);
  assert.equal(material.map, sharedTexture);
  assert.deepEqual(resources, { geometries: [], materials: [] });
});

test('person resources: disposing one instance leaves its sibling resources alive', () => {
  const first = { geometries: [new BoxGeometry()], materials: [new MeshBasicMaterial()] };
  const second = { geometries: [new BoxGeometry()], materials: [first.materials[0].clone()] };
  let secondDisposals = 0;
  for (const resource of [...second.geometries, ...second.materials]) {
    resource.addEventListener('dispose', () => secondDisposals++);
  }
  createPersonDisposer(first)();
  assert.equal(secondDisposals, 0);
  createPersonDisposer(second)();
  assert.equal(secondDisposals, 2);
});
