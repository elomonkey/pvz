import { expect, test } from '@playwright/test';

test('street keeps the real entrance/exit and smoothly changes phases without growing resources', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    for (const key of ['tutorial_done', 'results_intro_seen', 'argue_intro_seen', 'shift4_intro_seen', 'scanner_break_seen']) {
      localStorage.setItem(`pvz_tycoon_${key}`, '1');
    }
  });
  await page.goto('/');
  await page.waitForFunction(() => window.game);
  const result = await page.evaluate(async () => {
    const dataPath = '/src/data.ts', clientPath = '/src/client.ts';
    const data = await import(dataPath), { Client } = await import(clientPath);
    const g = (window as any).game;
    g.renderer.setAnimationLoop(null);
    g.clearClients();
    const client = new Client({ scene: g.scene, id: 9001, archetype: data.ARCHETYPES[0], order: null, patience: 999, queueIndex: 0 });
    const entry = { ...client.position }, initiallyHiddenLabel = !client.label.visible;
    const incoming: { x: number; z: number }[] = [];
    for (let i = 0; i < 600 && client.state !== 'waiting'; i++) {
      client.update(1 / 60, i / 60); incoming.push(client.position);
    }
    const waiting = client.state === 'waiting' && client.isAt(data.QUEUE_SPOTS[0]) && client.label.visible;
    client.leave();
    const outgoing: { x: number; z: number }[] = [];
    for (let i = 0; i < 600 && client.state !== 'gone'; i++) {
      client.update(1 / 60, i / 60); outgoing.push(client.position);
    }
    const gone = client.state === 'gone' && !client.root.visible;
    client.destroy();

    const street = g.scene.getObjectByName('window-street');
    const sky = street.getObjectByName('street-sky');
    const lights = street.getObjectByName('street-evening-windows');
    let time = 100;
    const advance = (seconds: number) => {
      for (let i = 0; i < seconds * 30; i++) { time += 1 / 30; g.world.update(time); }
    };
    const skyColor = () => Array.from(sky.geometry.getAttribute('color').array) as number[];
    g.world.setDayPhase(1); advance(8);
    const morning = skyColor();
    g.world.setDayPhase(3);
    const unchangedOnSet = JSON.stringify(skyColor()) === JSON.stringify(morning);
    advance(.1);
    const earlyGlow = street.userData.eveningGlow;
    advance(6);
    const eveningGlow = street.userData.eveningGlow, evening = skyColor();
    g.world.setDayPhase(2); advance(8);
    const day = skyColor(), dayLightsOff = !lights.visible;

    // Same four-client/all-decor fixture as npm run perf, with the car and
    // evening windows explicitly visible (the normal 5s sample may miss them).
    g.debugSetShift(5); g.debugAddMoney(50000);
    for (const id of ['cat', 'clock', 'rug', 'sign', 'walls', 'floor', 'tv']) g.buyDecor(id);
    g.update(1.3);
    g.spawnQueue = ['office', 'elderly', 'student', 'courier'].map(id => ({ archetype: data.ARCHETYPES.find((a: any) => a.id === id), patience: 35, mixed: false }));
    while (g.spawnQueue.length) g.spawnNext();
    for (let i = 0; i < 300; i++) g.update(.05);
    g.helpOpen = true;
    const render = () => g.renderer.render(g.scene, g.camera);
    g.world.setDayPhase(3); time = 200; advance(8);
    g.world.update(208); render(); // (208 + 12) % 36 = 4, middle of a car passage.
    const peak = { calls: g.renderer.info.render.calls, triangles: g.renderer.info.render.triangles, clients: g.queue.length,
      car: street.getObjectByName('street-car').visible, lights: lights.visible };
    const memory = () => ({ geometries: g.renderer.info.memory.geometries, textures: g.renderer.info.memory.textures, programs: g.renderer.info.programs.length });
    // Warm both light visibility variants before comparing program caches.
    g.world.setDayPhase(1); advance(8); render();
    const before = memory();
    for (let cycle = 0; cycle < 3; cycle++) {
      for (const phase of [1, 2, 3]) { g.world.setDayPhase(phase); advance(8); render(); }
    }
    const after = memory();
    g.world.update(340); const carHiddenBetweenPassages = !street.getObjectByName('street-car').visible;
    g.scene.updateMatrixWorld(true);
    const hits: unknown[] = [];
    street.traverse((object: any) => { if (object.isMesh) object.raycast({}, hits); });
    const streetHits = hits.length;
    return { entry, expectedEntry: data.ENTRY_POINT, initiallyHiddenLabel, waiting, gone,
      doorOnEntry: incoming.some(p => Math.abs(p.x - 1.8) < .15 && Math.abs(p.z - 3.3) < .15),
      turnOnEntry: incoming.some(p => Math.hypot(p.x - data.ENTRY_TURN_POINT.x, p.z - data.ENTRY_TURN_POINT.z) < .08),
      doorOnExit: outgoing.some(p => Math.abs(p.x - 1.8) < .15 && Math.abs(p.z - 3.3) < .15),
      exitDistance: Math.hypot(outgoing.at(-1)!.x - data.EXIT_POINT.x, outgoing.at(-1)!.z - data.EXIT_POINT.z),
      unchangedOnSet, earlyGlow, eveningGlow, morning, day, evening, dayLightsOff, peak, before, after,
      carHiddenBetweenPassages, streetHits, shadowMaps: g.renderer.shadowMap.enabled, localClip: g.renderer.localClippingEnabled };
  });
  await testInfo.attach('street-checks', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  console.log(JSON.stringify({ peak: result.peak, before: result.before, after: result.after }));
  expect(result.entry).toEqual(result.expectedEntry);
  expect(result).toMatchObject({ initiallyHiddenLabel: true, waiting: true, gone: true, turnOnEntry: true,
    doorOnEntry: true, doorOnExit: true, unchangedOnSet: true, dayLightsOff: true, carHiddenBetweenPassages: true,
    streetHits: 0, shadowMaps: false, localClip: true });
  expect(result.exitDistance).toBeLessThan(.08);
  expect(result.earlyGlow).toBeGreaterThan(0);
  expect(result.earlyGlow).toBeLessThan(.4);
  expect(result.eveningGlow).toBeGreaterThan(.99);
  expect(result.day).not.toEqual(result.morning);
  expect(result.evening).not.toEqual(result.day);
  expect(result.peak).toMatchObject({ clients: 4, car: true, lights: true });
  expect(result.peak.calls).toBeLessThanOrEqual(180);
  expect(result.peak.triangles).toBeLessThanOrEqual(150000);
  expect(result.after).toEqual(result.before);
  expect(errors).toEqual([]);
});
