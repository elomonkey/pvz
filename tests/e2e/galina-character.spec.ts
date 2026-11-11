import { expect, test } from '@playwright/test';

test('Galina preserves PersonRig, animated expressions and the 3000-triangle budget', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/tests/visual/galina-character.html');
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  const result = await page.evaluate(() => {
    const lab = (window as any).galinaLab,
      rig = lab.rigs[1];
    lab.rigs[0].root.visible = false;
    const expressions = new Set(),
      rows = [];
    let blinked = false,
      walked = false,
      finite = true;
    for (const pose of [
      'idle',
      'walking',
      'impatient',
      'angry',
      'carry',
      'idle',
    ]) {
      rig.setCarry(pose === 'carry', '#c8a072', 4);
      for (let frame = 0; frame < 240; frame++) {
        rig.update(
          1 / 60,
          pose === 'walking',
          frame / 60,
          pose === 'impatient' || pose === 'angry' ? pose : 'idle',
        );
        if (pose === 'walking' && Math.abs(rig.legL.rotation.x) > 0.1)
          walked = true;
        if (rig.head.children.some((o: any) => o.isGroup && o.scale.y < 0.4))
          blinked = true;
      }
      rig.root.traverse((o: any) => {
        if (!o.isMesh) return;
        if (
          o.parent === rig.head &&
          o.material.vertexColors &&
          !rig.body.userData.personResources.geometries.includes(o.geometry)
        )
          expressions.add(o.geometry);
        const positions = o.geometry.attributes.position.array;
        if (
          !positions.every(Number.isFinite) ||
          ![
            ...o.position,
            ...o.rotation.toArray().slice(0, 3),
            ...o.scale,
          ].every(Number.isFinite)
        )
          finite = false;
      });
      lab.renderer.render(lab.scene, lab.camera);
      rows.push({
        pose,
        ...lab.stats()[1],
        calls: lab.renderer.info.render.calls,
      });
    }
    const parcels: number[] = [];
    rig.setCarry(true, '#ca8f63', 4);
    rig.root.traverseVisible((o: any) => {
      if (o.userData.carryParcel !== undefined)
        parcels.push(o.userData.carryParcel);
    });
    return {
      rows,
      parcels,
      blinked,
      walked,
      finite,
      expressions: expressions.size,
      contract: ['root', 'body', 'head', 'armL', 'armR', 'legL', 'legR'].every(
        (key) => rig[key]?.isGroup,
      ),
    };
  });
  expect(result.contract).toBe(true);
  expect(result.blinked).toBe(true);
  expect(result.walked).toBe(true);
  expect(result.finite).toBe(true);
  expect(result.expressions).toBe(3);
  expect(result.parcels).toEqual([0, 1, 2, 3]);
  for (const row of result.rows) {
    expect(row.total).toBeGreaterThanOrEqual(1500);
    expect(row.total).toBeLessThanOrEqual(3000);
    expect(row.calls).toBeLessThanOrEqual(20);
  }
  expect(errors).toEqual([]);
});

test('Galina instance resources plateau for 20 cycles and caches survive dispose', async ({
  page,
}) => {
  await page.goto('/tests/visual/galina-character.html');
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  const result = await page.evaluate(async () => {
    const factoryPath = '/src/view/galinaCharacter.ts',
      dataPath = '/src/data.ts';
    const { createGalinaPerson } = await import(factoryPath),
      { BOSS_ARCHETYPE } = await import(dataPath);
    const lab = (window as any).galinaLab;
    let sharedDisposals = 0,
      wrongDisposals = 0;
    const watched = new Set(),
      rows = [];
    for (let cycle = 0; cycle < 20; cycle++) {
      const rig = createGalinaPerson({ ...BOSS_ARCHETYPE, boss: true });
      const resources = rig.body.userData.personResources;
      const owned = new Set([...resources.geometries, ...resources.materials]);
      const counts = new Map([...owned].map((o) => [o, 0]));
      for (const o of owned as Set<any>)
        o.addEventListener('dispose', () => counts.set(o, counts.get(o)! + 1));
      lab.scene.add(rig.root);
      rig.setCarry(true, '#bd9063', 4);
      for (const mood of ['idle', 'impatient', 'angry']) {
        rig.update(0.03, true, 0.5, mood);
        rig.root.traverse((o: any) => {
          if (!o.isMesh) return;
          for (const resource of [
            o.geometry,
            o.material,
            o.material.map,
          ].filter(Boolean)) {
            if (owned.has(resource) || watched.has(resource)) continue;
            watched.add(resource);
            resource.addEventListener('dispose', () => sharedDisposals++);
          }
        });
        lab.renderer.render(lab.scene, lab.camera);
      }
      rig.root.removeFromParent();
      rig.dispose();
      rig.dispose();
      if (resources.geometries.length || resources.materials.length)
        throw new Error('Ownership lists retained');
      wrongDisposals += [...counts.values()].filter(
        (value) => value !== 1,
      ).length;
      lab.renderer.render(lab.scene, lab.camera);
      rows.push({
        ...lab.renderer.info.memory,
        programs: lab.renderer.info.programs.length,
      });
    }
    return { sharedDisposals, wrongDisposals, rows };
  });
  expect(result.sharedDisposals).toBe(0);
  expect(result.wrongDisposals).toBe(0);
  for (const row of result.rows.slice(4)) expect(row).toEqual(result.rows[4]);
});

test('both Galina encounters use the new factory; the other four bosses stay legacy', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/');
  await page.waitForFunction(() => window.game);
  const result = await page.evaluate(async () => {
    const g = (window as any).game;
    g.renderer.setAnimationLoop(null);
    g.debugSetShift(1);
    g.debugBoss();
    g.bossClient.preplaceAtFront();
    g.update(0.01);
    const first = g.bossClient.rig.body.name;
    g.debugSetShift(5);
    g.debugBoss();
    const final = g.finalBossGalya.rig.body.name,
      valera = g.finalBossValera.rig.body.name;
    const cp = '/src/client.ts',
      dp = '/src/data.ts';
    const { Client } = await import(cp),
      data = await import(dp);
    const others = [
      data.BABA_ARCHETYPE,
      data.SANYA_ARCHETYPE,
      data.QUEEN_ARCHETYPE,
      data.VALERA_ARCHETYPE,
    ].map((archetype) => {
      const c = new Client({
        scene: g.scene,
        id: 999,
        archetype,
        order: null,
        patience: 99,
        queueIndex: 0,
        isBoss: archetype !== data.SANYA_ARCHETYPE,
      });
      const name = c.rig.body.name;
      c.destroy();
      return name;
    });
    return { first, final, valera, others };
  });
  expect(result.first).toBe('galina-body');
  expect(result.final).toBe('galina-body');
  expect(result.valera).not.toBe('galina-body');
  expect(result.others).not.toContain('galina-body');
  expect(errors).toEqual([]);
});
