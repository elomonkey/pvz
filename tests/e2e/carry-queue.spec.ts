import { expect, test } from '@playwright/test';
import type * as THREE from 'three';
import type { Client } from '../../src/client';
import type { PersonRig } from '../../src/view/characters';

test('carry stack shows the requested parcel count', async ({ page }) => {
  await page.goto('/tests/visual/character-lineup.html');
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1');

  const result = await page.evaluate(() => {
    const lineup = (
      window as unknown as {
        lineup: {
          previews: { id: string; rig: PersonRig }[];
        };
      }
    ).lineup;
    const rig = lineup.previews.find((preview) => preview.id === 'player')!.rig;
    const visibleParcels = () => {
      const parcels: { index: number; y: number }[] = [];
      rig.body.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh || mesh.userData.carryParcel === undefined || !mesh.visible) return;
        parcels.push({ index: Number(mesh.userData.carryParcel), y: mesh.position.y });
      });
      return parcels.sort((a, b) => a.index - b.index);
    };

    rig.setCarry(true, '#c8a072', 1);
    const one = visibleParcels();
    rig.setCarry(true, '#c8a072', 3);
    const three = visibleParcels();
    rig.setCarry(false);
    const none = visibleParcels();
    return { one, three, none };
  });

  expect(result.one).toHaveLength(1);
  expect(result.three.map((parcel) => parcel.index)).toEqual([0, 1, 2]);
  expect(result.three[1].y).toBeGreaterThan(result.three[0].y);
  expect(result.three[2].y).toBeGreaterThan(result.three[1].y);
  expect(result.none).toHaveLength(0);
});

test('departing client steps aside before the next client takes the front spot', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.game);

  const result = await page.evaluate(async () => {
    const clientPath = '/src/client.ts';
    const dataPath = '/src/data.ts';
    const { Client: ClientClass } = await import(clientPath);
    const data = await import(dataPath);
    const game = (window as any).game;
    game.renderer.setAnimationLoop(null);
    game.clearClients();

    const first = new ClientClass({
      scene: game.scene,
      id: 9001,
      archetype: data.ARCHETYPES[0],
      order: null,
      patience: 999,
      queueIndex: 0,
    });
    const second = new ClientClass({
      scene: game.scene,
      id: 9002,
      archetype: data.ARCHETYPES[1],
      order: null,
      patience: 999,
      queueIndex: 1,
    });
    first.placeAt(data.QUEUE_SPOTS[0]);
    second.placeAt(data.QUEUE_SPOTS[1]);
    game.clients.push(first, second);
    game.queue.push(first, second);
    game.updateQueue();

    first.leave(0);
    game.removeFromQueue(first);

    let minDistance = Number.POSITIVE_INFINITY;
    const dt = 1 / 60;
    for (let frame = 0; frame < 60; frame++) {
      first.update(dt, frame / 60);
      second.update(dt, frame / 60);
      const distance = Math.hypot(
        first.position.x - second.position.x,
        first.position.z - second.position.z,
      );
      minDistance = Math.min(minDistance, distance);
    }

    return {
      minDistance,
      leavingX: first.position.x,
      frontX: second.position.x,
      frontZ: second.position.z,
    };
  });

  expect(result.minDistance).toBeGreaterThan(0.35);
  expect(result.leavingX).toBeGreaterThan(1);
  expect(result.frontX).toBeCloseTo(0.4, 1);
  expect(result.frontZ).toBeCloseTo(1.15, 1);
});
