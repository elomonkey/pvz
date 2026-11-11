import { expect, test } from '@playwright/test';

test('Queen preserves PersonRig, animated expressions and the 3000-triangle budget', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/tests/visual/queen-character.html');
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  const result = await page.evaluate(() => {
    const lab = (window as any).queenLab,
      rig = lab.rigs[1];
    lab.rigs.forEach((r: any, i: number) => (r.root.visible = i === 1));
    const expressions = new Set(),
      rows = [];
    let blinked = false,
      walked = false,
      finite = true,
      upright = true;
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
        rig.root.updateMatrixWorld(true);
        const garment = rig.root.getObjectByName('queen-garment');
        if (garment.visible) {
          const e = garment.matrixWorld.elements;
          if (e[5] / Math.hypot(e[4], e[5], e[6]) < 0.9) upright = false;
        }
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
        garmentVisible: rig.root.getObjectByName('queen-garment').visible,
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
      upright,
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
  expect(result.upright).toBe(true);
  expect(result.expressions).toBe(3);
  expect(result.parcels).toEqual([0, 1, 2, 3]);
  expect(result.colors).toEqual(['ca8f63', 'a1b2c3', 'b7c79a', 'd1a48e']);
  for (const row of result.rows) {
    expect(row.total).toBeGreaterThanOrEqual(1500);
    expect(row.total).toBeLessThanOrEqual(3000);
    expect(row.calls).toBeLessThanOrEqual(20);
    expect(row.garmentVisible).toBe(row.pose !== 'carry');
  }
  expect(errors).toEqual([]);
});

test('Queen instance resources plateau for 20 cycles and caches survive dispose', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/tests/visual/queen-character.html');
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  const result = await page.evaluate(async () => {
    const factoryPath = '/src/view/queenCharacter.ts',
      dataPath = '/src/data.ts';
    const { createQueenPerson } = await import(factoryPath),
      { QUEEN_ARCHETYPE } = await import(dataPath);
    const lab = (window as any).queenLab;
    let sharedDisposals = 0,
      wrongDisposals = 0;
    const watched = new Set(),
      rows = [];
    for (let cycle = 0; cycle < 20; cycle++) {
      const rig = createQueenPerson({ ...QUEEN_ARCHETYPE, boss: true });
      rig.setCarry(true, ['#bd9063', '#a1b2c3', '#b7c79a', '#d1a48e'], 4);
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
  expect(errors).toEqual([]);
});

test('actual Queen uses her new rig and a transparent three-cell matching portrait atlas', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.addInitScript(() =>
    localStorage.setItem('pvz_tycoon_tutorial_done', '1'),
  );
  await page.goto('/');
  await page.waitForFunction(() => window.game);
  const result = await page.evaluate(async () => {
    const g = (window as any).game;
    g.renderer.setAnimationLoop(null);
    g.debugSetShift(4);
    g.debugBoss();
    g.renderer.render(g.scene, g.camera);
    const textureCount = g.renderer.info.memory.textures;
    const src = getComputedStyle(
      document.querySelector('.boss-entrance-portrait')!,
    ).backgroundImage.match(/url\(["']?(.*?)["']?\)/)![1];
    const image = new Image();
    image.src = src;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
    const alpha = (x: number, y: number) =>
      pixels[(y * image.width + x) * 4 + 3];
    const corners = [];
    for (const x of [
      0,
      image.height - 1,
      image.height,
      2 * image.height - 1,
      2 * image.height,
      image.width - 1,
    ])
      corners.push(alpha(x, 0));
    const nonempty = [];
    for (let cell = 0; cell < 3; cell++) {
      let found = false;
      for (let y = 0; y < image.height; y += 16)
        for (
          let x = cell * image.height;
          x < (cell + 1) * image.height;
          x += 16
        )
          if (alpha(x, y) > 0) found = true;
      nonempty.push(found);
    }
    const emotionTextures = [];
    for (const title of [
      'Королева примерочной',
      'Королева вернулась с возвратом',
      'Королева ушла',
    ]) {
      (window as any).ui.banner(title, '', 30);
      g.renderer.render(g.scene, g.camera);
      emotionTextures.push(g.renderer.info.memory.textures);
    }
    return {
      src,
      width: image.width,
      height: image.height,
      corners,
      nonempty,
      textureCount,
      emotionTextures,
      body: g.queenClient.rig.body.name,
      modal: g.modalOpen,
    };
  });
  expect(result.body).toBe('queen-body');
  expect(result.modal).toBe(false);
  expect(result.src).toContain('queen-expressions-v2');
  expect(result.width).toBe(result.height * 3);
  expect(result.corners.every((v) => v === 0)).toBe(true);
  expect(result.nonempty).toEqual([true, true, true]);
  expect(result.emotionTextures).toEqual([
    result.textureCount,
    result.textureCount,
    result.textureCount,
  ]);
  expect(errors).toEqual([]);
});
