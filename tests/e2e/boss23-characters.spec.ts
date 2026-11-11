import { expect, test } from '@playwright/test';

for (const style of ['zina', 'sanya'] as const) {
  const index = style === 'zina' ? 1 : 3;

  test(`${style} preserves PersonRig, expressions and the 3000-triangle budget`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto('/tests/visual/boss23-characters.html');
    await page.waitForFunction(() => document.body.dataset.ready === '1');
    const result = await page.evaluate((index) => {
      const lab = (window as any).boss23Lab,
        rig = lab.rigs[index];
      lab.rigs.forEach((r: any, i: number) => (r.root.visible = i === index));
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
          ...lab.stats()[index],
          calls: lab.renderer.info.render.calls,
        });
      }
      const parcels: number[] = [],
        colors: string[] = [];
      rig.setCarry(true, ['#ca8f63', '#a1b2c3', '#b7c79a', '#d1a48e']);
      rig.root.traverseVisible((o: any) => {
        if (o.userData.carryParcel !== undefined) {
          parcels.push(o.userData.carryParcel);
          colors.push(o.material.color.getHexString());
        }
      });
      return {
        rows,
        parcels,
        colors,
        blinked,
        walked,
        finite,
        expressions: expressions.size,
        contract: [
          'root',
          'body',
          'head',
          'armL',
          'armR',
          'legL',
          'legR',
        ].every((key) => rig[key]?.isGroup),
      };
    }, index);
    expect(result.contract).toBe(true);
    expect(result.blinked).toBe(true);
    expect(result.walked).toBe(true);
    expect(result.finite).toBe(true);
    expect(result.expressions).toBe(3);
    expect(result.parcels).toEqual([0, 1, 2, 3]);
    expect(result.colors).toEqual(['ca8f63', 'a1b2c3', 'b7c79a', 'd1a48e']);
    for (const row of result.rows) {
      expect(row.total).toBeGreaterThanOrEqual(1500);
      expect(row.total).toBeLessThanOrEqual(3000);
      expect(row.calls).toBeLessThanOrEqual(20);
    }
    expect(errors).toEqual([]);
  });

  test(`${style} resources plateau for 20 cycles and caches survive dispose`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto('/tests/visual/boss23-characters.html');
    await page.waitForFunction(() => document.body.dataset.ready === '1');
    const result = await page.evaluate(async (style) => {
      const factoryPath = '/src/view/queueBossCharacters.ts',
        dataPath = '/src/data.ts';
      const factories = await import(factoryPath),
        data = await import(dataPath);
      const lab = (window as any).boss23Lab;
      let sharedDisposals = 0,
        wrongDisposals = 0;
      const watched = new Set(),
        rows = [];
      for (let cycle = 0; cycle < 20; cycle++) {
        const createRig =
          style === 'zina'
            ? factories.createZinaPerson
            : factories.createSanyaPerson;
        const archetype =
          style === 'zina' ? data.BABA_ARCHETYPE : data.SANYA_ARCHETYPE;
        const rig = createRig({ ...archetype, boss: style === 'zina' });
        rig.setCarry(true, ['#bd9063', '#a1b2c3', '#b7c79a', '#d1a48e'], 4);
        const resources = rig.body.userData.personResources;
        const owned = new Set([
          ...resources.geometries,
          ...resources.materials,
        ]);
        const counts = new Map([...owned].map((o) => [o, 0]));
        for (const o of owned as Set<any>)
          o.addEventListener('dispose', () =>
            counts.set(o, counts.get(o)! + 1),
          );
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
    }, style);
    expect(result.sharedDisposals).toBe(0);
    expect(result.wrongDisposals).toBe(0);
    for (const row of result.rows.slice(4)) expect(row).toEqual(result.rows[4]);
    expect(errors).toEqual([]);
  });
}

test('actual Zina and Sanya encounters use the new models without changing their scenarios', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.addInitScript(() => {
    for (const key of [
      'pvz_tycoon_tutorial_done',
      'pvz_tycoon_argue_intro_seen',
      'pvz_tycoon_shift4_intro_seen',
    ])
      localStorage.setItem(key, '1');
  });
  await page.goto('/');
  await page.waitForFunction(() => window.game);
  const result = await page.evaluate(() => {
    const g = (window as any).game;
    g.renderer.setAnimationLoop(null);
    const rows = [];
    for (const shift of [2, 3]) {
      g.debugSetShift(shift);
      g.debugBoss();
      g.bossClient.preplaceAtFront();
      g.update(0.01);
      const before = g.bossClient.patience,
        modal = g.modalOpen,
        board = g.zina.board.length;
      g.update(1);
      g.renderer.render(g.scene, g.camera);
      rows.push({
        shift,
        body: g.bossClient.rig.body.name,
        phase: g.phase,
        modal,
        before,
        after: g.bossClient.patience,
        board,
        orderCount: g.bossClient.order?.items.length,
        calls: g.renderer.info.render.calls,
        triangles: g.renderer.info.render.triangles,
      });
    }
    return rows;
  });
  expect(result[0].body).toBe('zina-body');
  expect(result[0].modal).toBe(true);
  expect(result[0].board).toBe(9);
  expect(result[1].body).toBe('sanya-body');
  expect(result[1].modal).toBe(false);
  expect(result[1].orderCount).toBe(4);
  expect(result[1].before).toBeGreaterThan(33);
  expect(result[1].after).toBeCloseTo(result[1].before - 1, 4);
  for (const row of result) {
    expect(row.phase).toBe('boss');
    expect(row.calls).toBeLessThanOrEqual(180);
    expect(row.triangles).toBeLessThanOrEqual(150000);
  }
  expect(errors).toEqual([]);
});
