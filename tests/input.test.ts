import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { findUserData, isVisibleForPicking, pointerToNdc, PointerController } from '../src/input/pointerController.ts';

test('pointer: экранные координаты в NDC', () => {
  const rect = { left: 10, top: 20, width: 200, height: 100 };

  assert.deepEqual(pointerToNdc(110, 70, rect).toArray(), [0, 0]);
  assert.deepEqual(pointerToNdc(10, 20, rect).toArray(), [-1, 1]);
  assert.deepEqual(pointerToNdc(210, 120, rect).toArray(), [1, -1]);
  assert.deepEqual(pointerToNdc(60, 95, rect).toArray(), [-0.5, -0.5]);
});

for (const hidden of ['mesh', 'parent', 'scene', null]) {
  test(`pointer: visibility includes ${hidden ?? 'a fully visible chain'}`, () => {
    const scene = new THREE.Scene();
    const parent = new THREE.Group();
    const mesh = new THREE.Mesh();
    scene.add(parent);
    parent.add(mesh);
    if (hidden === 'mesh') mesh.visible = false;
    if (hidden === 'parent') parent.visible = false;
    if (hidden === 'scene') scene.visible = false;
    assert.equal(isVisibleForPicking(mesh), hidden === null);
  });
}

for (const kind of ['hidden mesh', 'hidden parent', 'no userData', 'visible']) {
  test(`pointer: real raycast skips ${kind} or keeps the first visible pick`, () => {
    // Minimal canvas event target: exercise pointer events and the actual Raycaster.
    const canvas = Object.assign(new EventTarget(), {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    });
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 5;
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const front = new THREE.Mesh(geometry, material);
    const parent = new THREE.Group();
    parent.add(front);
    scene.add(parent);
    const behind = new THREE.Mesh(geometry, material);
    behind.position.z = -2;
    behind.userData = { type: 'floor' };
    scene.add(behind);
    if (kind !== 'no userData') parent.userData = { type: 'client' };
    if (kind === 'hidden mesh') front.visible = false;
    if (kind === 'hidden parent') parent.visible = false;
    const picks: unknown[] = [];
    const controller = new PointerController({
      canvas: canvas as unknown as HTMLCanvasElement,
      camera, scene, isBlocked: () => false,
      onPick: data => picks.push(data.type), onToyLabel: () => {},
    });
    try {
      for (const type of ['pointerdown', 'pointerup']) {
        canvas.dispatchEvent(Object.assign(new Event(type), { clientX: 50, clientY: 50 }));
      }
      assert.deepEqual(picks, [kind === 'visible' ? 'client' : 'floor']);
    } finally {
      controller.dispose();
      geometry.dispose();
      material.dispose();
    }
  });
}

test('pointer: поиск userData по цепочке родителей', () => {
  const root = {
    parent: null,
    userData: { type: 'cell', cellId: 'A-1-1', shelfIndex: 0 },
  };
  const middle = { parent: root, userData: {} };
  const child = { parent: middle, userData: {} };

  assert.deepEqual(findUserData(child as never), {
    type: 'cell',
    cellId: 'A-1-1',
    shelfIndex: 0,
  });
  assert.equal(findUserData({ parent: null, userData: {} } as never), null);
});
