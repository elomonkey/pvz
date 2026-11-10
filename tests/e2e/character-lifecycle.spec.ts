import { expect, test } from '@playwright/test';
import { measureLongSession, assertLongSessionPlateau } from '../perf/long-session-fixture.mjs';

test('20 start/restart cycles reach a resource plateau', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.addInitScript(() => {
    let seed = 73129;
    Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    localStorage.setItem('pvz_tycoon_tutorial_done', '1');
  });
  await page.goto('/');
  await page.waitForFunction(() => window.game);
  const report = await page.evaluate(measureLongSession, { cycles: 20, sampleFrames: 4, warmupCycles: 4 });
  await testInfo.attach('long-session.json', {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json',
  });
  assertLongSessionPlateau(report);
  await expect(page.locator('#start-screen')).toBeVisible();
  expect(errors).toEqual([]);
});

test('ordinary and legacy clients release owned resources exactly once and keep caches alive', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await page.waitForFunction(() => window.game);
  const result = await page.evaluate(async () => {
    // Variable paths keep this browser-only import out of Playwright's Node module graph.
    const clientPath = '/src/client.ts',
      dataPath = '/src/data.ts',
      primitivesPath = '/src/view/primitives.ts';
    const { Client } = await import(clientPath);
    const data = await import(dataPath);
    const { createParcelGeometry, PARCEL_VERTEX_MATERIAL, createParcelTopDecal } = await import(
      primitivesPath
    );
    const game = (window as any).game;
    const renderer = game.renderer;
    renderer.setAnimationLoop(null);
    const archetypes = [
      ...data.ARCHETYPES,
      data.BOSS_ARCHETYPE,
      data.BABA_ARCHETYPE,
      data.SANYA_ARCHETYPE,
      data.QUEEN_ARCHETYPE,
      data.VALERA_ARCHETYPE,
    ];
    let sharedDisposals = 0,
      missingDisposals = 0,
      labelsLeft = 0;
    const observedShared = new Set();
    const watchShared = (resource: any) => {
      if (observedShared.has(resource)) return;
      observedShared.add(resource);
      resource.addEventListener('dispose', () => sharedDisposals++);
    };
    // World parcel resources are explicitly outside character ownership.
    watchShared(createParcelGeometry('#d8b98a'));
    watchShared(PARCEL_VERTEX_MATERIAL);
    const sharedDecal = createParcelTopDecal();
    watchShared(sharedDecal.geometry);
    watchShared(sharedDecal.material);
    watchShared(sharedDecal.material.map);
    const memory = [];
    const render = () => {
      renderer.render(game.scene, game.camera);
      (window as any).labelRenderer.render(game.scene, game.camera);
    };
    for (let pass = 0; pass < 3; pass++) {
      for (const archetype of archetypes) {
        const client = new Client({
          scene: game.scene,
          id: 10000,
          archetype,
          order: null,
          patience: 999,
          queueIndex: 0,
          isBoss: !data.ARCHETYPES.includes(archetype),
        });
        client.placeAt({ x: 0.4, z: -0.55 });
        const resources = client.rig.body.userData.personResources;
        const owned = new Set([...resources.geometries, ...resources.materials]);
        const disposals = new Map([...owned].map((resource) => [resource, 0]));
        for (const resource of owned as Set<any>) {
          resource.addEventListener('dispose', () => disposals.set(resource, disposals.get(resource)! + 1));
        }
        // Catch accidental disposal of any cache, including hidden carry/expression meshes.
        client.root.traverse((object: any) => {
          if (!object.isMesh) return;
          if (!owned.has(object.geometry)) watchShared(object.geometry);
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            if (!owned.has(material)) watchShared(material);
            if (material.map) watchShared(material.map);
          }
        });
        for (const mood of ['idle', 'impatient', 'angry'] as const) {
          client.rig.setCarry(true);
          client.rig.update(0.1, true, 0.5, mood);
          render();
        }
        if (!client.label.element.isConnected) throw new Error('Fixture label was never rendered');
        client.destroy();
        client.destroy();
        client.rig.dispose();
        missingDisposals += [...disposals.values()].filter((count) => count !== 1).length;
        if (client.root.parent || client.label.element.isConnected) labelsLeft++;
        if (resources.geometries.length || resources.materials.length)
          throw new Error('Ownership lists retained');
      }
      render();
      memory.push({ ...renderer.info.memory, programs: renderer.info.programs.length });
    }
    return {
      sharedDisposals,
      missingDisposals,
      labelsLeft,
      memory,
      labels: document.querySelectorAll('.client-label').length,
      tested: archetypes.length,
    };
  });
  expect(result.tested).toBe(11);
  expect(result.sharedDisposals).toBe(0);
  expect(result.missingDisposals).toBe(0);
  expect(result.labelsLeft).toBe(0);
  expect(result.labels).toBe(2);
  expect(result.memory[2]).toEqual(result.memory[1]);
  expect(errors).toEqual([]);
});
