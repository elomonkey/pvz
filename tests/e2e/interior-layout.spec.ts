import { expect, test } from '@playwright/test';

test('expanded warehouse keeps every A/B/C column and the return cabinet reachable', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.addInitScript(() => localStorage.setItem('pvz_tycoon_tutorial_done', '1'));
  await page.goto('/');
  await page.waitForFunction(() => window.game);
  const state = await page.evaluate(async () => {
    const g = (window as any).game, path = '/src/data.ts';
    const d = await import(path);
    g.renderer.setAnimationLoop(null);
    g.debugSetShift(2); // C is active, including its actual nav obstacle.
    g.update(1.3);
    const targets = d.SHELF_DEFS.flatMap((s: any, shelf: number) => [
      { ...d.SHELF_POINTS[shelf], shelf, column: 'panel' },
      ...Array.from({ length: s.columns }, (_, column) => ({
        x: s.x + Math.cos(s.rotation) * (column - (s.columns - 1) / 2) * s.cellW + Math.sin(s.rotation) * 0.9,
        z: s.z - Math.sin(s.rotation) * (column - (s.columns - 1) / 2) * s.cellW + Math.cos(s.rotation) * 0.9,
        shelf, column,
      })),
    ]);
    targets.push({ ...d.RETURN_POINT, shelf: 'return', column: 'cabinet' });
    const routes = targets.map((target: any) => {
      const route = g.nav.findPath(d.SERVICE_POINT, target);
      g.movement.snapTo(d.SERVICE_POINT);
      g.moveTo(target, null);
      for (let frame = 0; frame < 1200 && g.movement.hasPath; frame++) g.updatePlayer(1 / 60);
      return { target, walkable: g.nav.isWalkable(target.x, target.z),
        route: route.length, distance: Math.hypot(g.movement.position.x - target.x, g.movement.position.z - target.z) };
    });
    g.scene.updateMatrixWorld(true);
    const screen = g.scene.getObjectByName('laptop-screen');
    const position = screen.getWorldPosition(g.playerRoot.position.clone());
    const normal = position.clone().set(0, 0, 1).transformDirection(screen.matrixWorld);
    const facing = normal.dot(g.camera.position.clone().sub(position).normalize());
    const projected = g.world.shelves[2].group.position.clone().project(g.camera);
    g.movement.snapTo(d.SERVICE_POINT); g.updatePlayer(0);
    g.renderer.render(g.scene, g.camera); (window as any).labelRenderer.render(g.scene, g.camera);
    return { routes, facing, cInFrame: Math.abs(projected.x) < 0.96,
      cabins: g.scene.children.filter((o: any) => o.name === 'fitting-room').length,
      floorFront: d.STORAGE.minZ === d.ROOM.minZ, capacity: d.FITTING_CAPACITY,
      toy: g.world.toy.visible, shadowMaps: g.renderer.shadowMap.enabled };
  });
  for (const route of state.routes) {
    expect(route.walkable, JSON.stringify(route)).toBe(true);
    expect(route.route, JSON.stringify(route)).toBeGreaterThan(0);
    expect(route.distance, JSON.stringify(route)).toBeLessThan(0.06);
  }
  expect(state.facing).toBeGreaterThan(0.4);
  expect(state).toMatchObject({ cInFrame: true, cabins: 1, capacity: 1, floorFront: true, toy: true, shadowMaps: false });
  await page.screenshot({ path: testInfo.outputPath('three-shelf-interior.png') });
  expect(errors).toEqual([]);
});

test('one fitting room becomes full at 1/1 and releases its patience penalty', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => window.game);
  const occupied = await page.evaluate(() => {
    const g = (window as any).game;
    g.renderer.setAnimationLoop(null); g.debugSetShift(4);
    g.updateFittingRooms(5.1);
    return { rooms: [...g.fittingOccupied], full: g.fittingFull, multiplier: g.patienceMultiplier() };
  });
  expect(occupied).toEqual({ rooms: [true], full: true, multiplier: 1.2 });
  await expect(page.locator('#hud-fittings-value')).toHaveText('1/1');
  await expect(page.locator('#hud-fittings')).toHaveClass(/busy/);
  await page.evaluate(() => (window as any).game.updateFittingRooms(14));
  await expect(page.locator('#hud-fittings-value')).toHaveText('0/1');
  expect(await page.evaluate(() => (window as any).game.patienceMultiplier())).toBe(1);
  expect(errors).toEqual([]);
});
