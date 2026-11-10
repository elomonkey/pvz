import test from 'node:test';
import assert from 'node:assert/strict';

import { findUserData, pointerToNdc } from '../src/input/pointerController.ts';

test('pointer: экранные координаты в NDC', () => {
  const rect = { left: 10, top: 20, width: 200, height: 100 };

  assert.deepEqual(pointerToNdc(110, 70, rect).toArray(), [0, 0]);
  assert.deepEqual(pointerToNdc(10, 20, rect).toArray(), [-1, 1]);
  assert.deepEqual(pointerToNdc(210, 120, rect).toArray(), [1, -1]);
  assert.deepEqual(pointerToNdc(60, 95, rect).toArray(), [-0.5, -0.5]);
});

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
