import { expect, test } from '@playwright/test';

test('carried stack follows cell colors and new orders skip emptied cells', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', error => errors.push(error.message));

  try {
    await page.addInitScript(() => localStorage.setItem('pvz_tycoon_tutorial_done', '1'));
    await page.goto('/');
    await page.getByRole('button', { name: 'Начать смену', exact: true }).click();
    await page.waitForFunction(() => window.game && window.game.queue.length > 0);

    const result = await page.evaluate(() => {
      const game = (window as any).game;
      game.renderer.setAnimationLoop(null);
      const client = game.queue[0];

      const cells: any[] = [];
      const colors = new Set<string>();
      for (const cell of game.world.cells) {
        if (cell.shelfIndex !== 0 || !cell.parcel.visible || colors.has(cell.color)) continue;
        colors.add(cell.color);
        cells.push(cell);
        if (cells.length === 3) break;
      }
      if (cells.length < 3) throw new Error('Not enough colored cells on shelf A');

      const order = {
        items: cells.map((cell) => ({
          shelf: cell.shelfIndex,
          column: cell.column,
          level: cell.level,
          cellId: cell.id,
          actualShelf: cell.shelfIndex,
          actualColumn: cell.column,
          actualLevel: cell.level,
          actualCellId: cell.id,
          mixed: false,
          picked: false,
        })),
        shelf: cells[0].shelfIndex,
        column: cells[0].column,
        level: cells[0].level,
        cellId: cells[0].id,
        actualShelf: cells[0].shelfIndex,
        actualColumn: cells[0].column,
        actualLevel: cells[0].level,
        actualCellId: cells[0].id,
        mixed: false,
        scanned: true,
        searchMode: false,
        mixedTriggered: false,
        checkedCells: [],
      };

      game.service.begin(client, order);
      for (const cell of cells) game.takeParcel(cell, order);

      const stack: { index: number; color: string }[] = [];
      game.player.body.traverse((object: any) => {
        if (object.isMesh && object.userData.carryParcel !== undefined && object.visible) {
          stack.push({
            index: Number(object.userData.carryParcel),
            color: object.material.color.getHexString(),
          });
        }
      });
      stack.sort((a, b) => a.index - b.index);

      const expected = cells.map((cell) => cell.color.replace('#', '').toLowerCase());
      const hidden = cells.map((cell) => cell.id);
      game.service.clear();
      game.player.setCarry(false);
      game.releaseOrder(order);

      const created: string[] = [];
      for (let index = 0; index < 40; index++) {
        const next = game.createOrder(false, 1);
        created.push(next.items[0].cellId);
        game.releaseOrder(next);
      }

      game.restockCells();
      const restored = cells.every((cell) => cell.parcel.visible);
      return { stack, expected, hidden, created, restored };
    });

    expect(result.stack.map((parcel) => parcel.color)).toEqual(result.expected);
    expect(result.created.every((id) => !result.hidden.includes(id))).toBe(true);
    expect(result.restored).toBe(true);
  } finally {
    expect(errors, 'console.error and uncaught browser exceptions').toEqual([]);
  }
});
