import { expect, test, type Page } from '@playwright/test';

async function setup(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.addInitScript(() => {
    localStorage.setItem('pvz_tycoon_tutorial_done', '1');
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Начать смену', exact: true }).click();
  await page.waitForFunction(() => window.game);
  await page.evaluate(() => window.game.renderer.setAnimationLoop(null));
  return errors;
}

test('NavGrid resolves blocked and out-of-bounds targets to walkable points', async ({ page }) => {
  const errors = await setup(page);
  const result = await page.evaluate(() => {
    const g = window.game;
    const nav = g.nav;
    const start = { x: -2.15, z: -1.65 };
    const target = { x: -1.8, z: -1.65 };
    const path = nav.findPath(start, target);
    const last = path[path.length - 1];
    const resolved = nav.resolveTarget(target);
    const outside = { x: nav.minX - 1, z: nav.minZ - 1 };
    const outsidePath = nav.findPath(start, outside);
    const outsideLast = outsidePath[outsidePath.length - 1];
    const outsideResolved = nav.resolveTarget(outside);
    const sameStart = resolved ? { x: resolved.x, z: resolved.z } : start;
    const samePath = nav.findPath(sameStart, sameStart);
    const sameLast = samePath[samePath.length - 1];
    return {
      targetWalkable: nav.isWalkable(target.x, target.z),
      pathLength: path.length,
      last: last
        ? { x: last.x, z: last.z, walkable: nav.isWalkable(last.x, last.z) }
        : null,
      resolved: resolved
        ? { x: resolved.x, z: resolved.z, walkable: nav.isWalkable(resolved.x, resolved.z) }
        : null,
      outsideWalkable: nav.isWalkable(outside.x, outside.z),
      outsidePathLength: outsidePath.length,
      outsideLast: outsideLast
        ? { x: outsideLast.x, z: outsideLast.z, walkable: nav.isWalkable(outsideLast.x, outsideLast.z) }
        : null,
      outsideResolved: outsideResolved
        ? { x: outsideResolved.x, z: outsideResolved.z, walkable: nav.isWalkable(outsideResolved.x, outsideResolved.z) }
        : null,
      sameLast: sameLast
        ? { x: sameLast.x, z: sameLast.z, walkable: nav.isWalkable(sameLast.x, sameLast.z) }
        : null,
    };
  });

  expect(result.targetWalkable).toBe(false);
  expect(result.resolved).not.toBeNull();
  expect(result.resolved?.walkable).toBe(true);
  expect(result.pathLength).toBeGreaterThan(0);
  expect(result.last).not.toBeNull();
  expect(result.last?.walkable).toBe(true);
  expect(Math.hypot(result.last!.x - (-1.8), result.last!.z - (-1.65))).toBeGreaterThan(1e-6);

  expect(result.outsideWalkable).toBe(false);
  expect(result.outsideResolved).not.toBeNull();
  expect(result.outsideResolved?.walkable).toBe(true);
  expect(result.outsidePathLength).toBeGreaterThan(0);
  expect(result.outsideLast?.walkable).toBe(true);

  expect(result.sameLast).not.toBeNull();
  expect(result.sameLast?.walkable).toBe(true);
  expect(errors).toEqual([]);
});

test('Game.moveTo never snaps or arrives on a blocked target', async ({ page }) => {
  const errors = await setup(page);
  const result = await page.evaluate(() => {
    const g = window.game;
    const start = { x: -2.15, z: -1.65 };
    const target = { x: -1.8, z: -1.65 };
    g.movement.snapTo(start);
    g.playerRoot.position.set(start.x, 0, start.z);
    g.moveTo(target, null);
    const afterMove = {
      hasPath: g.movement.hasPath,
      pathLength: g.movement.pathLength,
      marker: g.marker.visible,
    };
    for (let frame = 0; frame < 240; frame++) g.updatePlayer(1 / 60);
    const position = { x: g.movement.position.x, z: g.movement.position.z };
    return {
      afterMove,
      position,
      playerRoot: { x: g.playerRoot.position.x, z: g.playerRoot.position.z },
      walkable: g.nav.isWalkable(position.x, position.z),
      targetWalkable: g.nav.isWalkable(target.x, target.z),
    };
  });

  expect(result.targetWalkable).toBe(false);
  expect(result.position).not.toEqual({ x: -1.8, z: -1.65 });
  expect(result.walkable).toBe(true);
  expect(result.playerRoot.x).toBeCloseTo(result.position.x, 6);
  expect(result.playerRoot.z).toBeCloseTo(result.position.z, 6);
  expect(errors).toEqual([]);
});
