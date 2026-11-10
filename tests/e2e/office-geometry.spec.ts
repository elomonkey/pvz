import { expect, test } from '@playwright/test';
import type { WebGLRenderer, Scene, Camera } from 'three';
import type { PersonRig } from '../../src/view/characters';

test('office prototype stays below 3000 triangles including hidden pose meshes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/tests/visual/office-character.html');
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1');
  const result = await page.evaluate(() => {
    const previews = (window as unknown as { characterPreviews: {
      id: string; rig: PersonRig; renderer: WebGLRenderer; scene: Scene; camera: Camera;
    }[] }).characterPreviews;
    const preview = previews.find(value => value.id === 'after')!;
    let total = 0;
    preview.rig.root.traverse(object => {
      const mesh = object as import('three').Mesh;
      if (mesh.isMesh) total += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
    });
    const rendered: number[] = [];
    for (const pose of ['idle', 'impatient', 'angry', 'walking', 'carry'] as const) {
      preview.rig.setCarry(pose === 'carry');
      preview.rig.update(0.016, pose === 'walking', 0.5, pose === 'angry' || pose === 'impatient' ? pose : 'idle');
      preview.renderer.render(preview.scene, preview.camera);
      rendered.push(preview.renderer.info.render.triangles);
    }
    return { total, rendered };
  });
  expect(result.total).toBeGreaterThan(0);
  expect(result.total).toBeLessThanOrEqual(3000);
  for (const count of result.rendered) {
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(3000);
  }
  expect(errors).toEqual([]);
});
