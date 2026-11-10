import { expect, test } from '@playwright/test';
import type * as THREE from 'three';
import type { PersonRig } from '../../src/view/characters';

test('all character styles keep their rig, pose and geometry budgets', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/tests/visual/character-lineup.html');
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1');
  const result = await page.evaluate(() => {
    const lineup = (
      window as unknown as {
        lineup: {
          previews: { id: string; rig: PersonRig }[];
          renderer: THREE.WebGLRenderer;
          scene: THREE.Scene;
          camera: THREE.Camera;
        };
      }
    ).lineup;
    return lineup.previews.map(({ id, rig }) => {
      let triangles = 0;
      const geometries = new Set<THREE.BufferGeometry>();
      const resources = rig.body.userData.personResources as {
        geometries: THREE.BufferGeometry[];
        materials: THREE.Material[];
      };
      rig.root.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        geometries.add(mesh.geometry);
        triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
      });
      const poses: { calls: number; triangles: number }[] = [];
      const others = lineup.previews.filter((value) => value.rig !== rig);
      for (const value of others) value.rig.root.visible = false;
      let walked = false,
        blinked = false;
      const browGeometries = new Set<THREE.BufferGeometry>();
      // Exercise a full blink interval, expressions, both legs and repeated carry transitions.
      for (const pose of ['idle', 'walking', 'impatient', 'angry', 'carry', 'idle'] as const) {
        rig.setCarry(pose === 'carry', '#c8a072');
        for (let frame = 0; frame < 240; frame++) {
          rig.update(
            1 / 60,
            pose === 'walking',
            frame / 60,
            pose === 'impatient' || pose === 'angry' ? pose : 'idle',
          );
          if (pose === 'walking' && Math.abs(rig.legL.rotation.x) > 0.1) walked = true;
          if (
            pose === 'idle' &&
            rig.head.children.some((child) => child.type === 'Group' && child.scale.y < 0.4)
          )
            blinked = true;
          rig.root.traverse((object) => {
            const mesh = object as THREE.Mesh;
            if (mesh.isMesh && !geometries.has(mesh.geometry)) browGeometries.add(mesh.geometry);
            if (
              ![
                ...object.position,
                ...(object.rotation.toArray().slice(0, 3) as number[]),
                ...object.scale,
              ].every(Number.isFinite)
            )
              throw new Error(`${id}: invalid pose`);
          });
        }
        lineup.renderer.render(lineup.scene, lineup.camera);
        poses.push({
          calls: lineup.renderer.info.render.calls,
          triangles: lineup.renderer.info.render.triangles,
        });
      }
      for (const value of others) value.rig.root.visible = true;
      return {
        id,
        triangles,
        poses,
        walked,
        blinked,
        expressionGeometries: browGeometries.size,
        trackedGeometries: resources.geometries.length,
        trackedMaterials: resources.materials.length,
        contract: ['root', 'body', 'head', 'armL', 'armR', 'legL', 'legR'].every(
          (key) => (rig[key as keyof PersonRig] as THREE.Object3D).isObject3D,
        ),
      };
    });
  });
  expect(result.map((value) => value.id)).toEqual([
    'student',
    'mom',
    'courier',
    'elderly',
    'blogger',
    'office',
    'player',
  ]);
  for (const style of result) {
    expect(style.contract, style.id).toBe(true);
    expect(style.triangles, style.id).toBeLessThanOrEqual(3000);
    expect(style.walked, style.id).toBe(true);
    expect(style.blinked, style.id).toBe(true);
    expect(style.expressionGeometries, style.id).toBe(2);
    expect(style.trackedGeometries, style.id).toBeGreaterThanOrEqual(8);
    expect(style.trackedMaterials, style.id).toBe(1);
    for (const pose of style.poses) {
      expect(pose.calls, style.id).toBeLessThanOrEqual(14);
      expect(pose.triangles, style.id).toBeGreaterThan(1500);
      expect(pose.triangles, style.id).toBeLessThanOrEqual(3000);
    }
  }
  expect(errors).toEqual([]);
});
