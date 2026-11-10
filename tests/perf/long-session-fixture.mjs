// Self-contained browser fixture: also serialized by Playwright page.evaluate().
// Uses the existing console API, so it runs against production preview too.
export async function measureLongSession({ cycles = 20, sampleFrames = 12, warmupCycles = 4 } = {}) {
  const game = window.game;
  const renderer = game.renderer;
  renderer.setAnimationLoop(null);
  const archetypes = game.clients.map((client) => client.archetype);
  if (archetypes.length !== 2 || game.phase !== 'menu')
    throw new Error('Expected fresh menu with two clients');
  const liveMaterials = new Set();
  const observedMaterials = new Set();
  const observeMaterials = () => {
    game.scene.traverse((object) => {
      if (!object.isMesh) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (observedMaterials.has(material.uuid)) continue;
        observedMaterials.add(material.uuid);
        liveMaterials.add(material.uuid);
        // Keep UUIDs only: the probe must not retain retired Three.js objects.
        const id = material.uuid;
        material.addEventListener('dispose', () => liveMaterials.delete(id));
      }
    });
  };
  observeMaterials();
  const rows = [];
  const sample = async (cycle, stage) => {
    observeMaterials();
    game.time = 15;
    renderer.setAnimationLoop(() => {
      game.update(1 / 60);
      window.ui.update(1 / 60);
      renderer.render(game.scene, game.camera);
      window.labelRenderer.render(game.scene, game.camera);
    });
    // Let uploads and CSS2D removal settle before comparing equal lifecycle states.
    for (let i = 0; i < 2; i++) await new Promise(requestAnimationFrame);
    const times = [];
    let previous = await new Promise(requestAnimationFrame);
    for (let i = 0; i < sampleFrames; i++) {
      const now = await new Promise(requestAnimationFrame);
      times.push(now - previous);
      previous = now;
    }
    renderer.setAnimationLoop(null);
    const referencedMaterials = new Set();
    game.scene.traverse((object) => {
      if (!object.isMesh) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        referencedMaterials.add(material.uuid);
      }
    });
    const sorted = [...times].sort((a, b) => a - b);
    rows.push({
      cycle,
      stage,
      clients: game.clients.length,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      programs: renderer.info.programs.length,
      sceneMaterials: referencedMaterials.size,
      observedUndisposedMaterials: liveMaterials.size,
      clientLabels: document.querySelectorAll('.client-label').length,
      frameMs: {
        avg: times.reduce((a, b) => a + b, 0) / times.length,
        p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
        max: sorted.at(-1),
      },
    });
  };
  for (let cycle = 1; cycle <= cycles; cycle++) {
    game.startNewGame();
    // Fixed four ordinary clients; actual start/restart owns their construction/destruction.
    game.spawnQueue = Array.from({ length: 4 }, (_, i) => ({
      archetype: archetypes[i % archetypes.length],
      patience: 999,
      mixed: false,
    }));
    while (game.spawnQueue.length) game.spawnNext();
    game.helpOpen = true; // Pause service, retain normal world/UI animation and rendering.
    for (const [i, client] of game.clients.entries()) {
      client.placeAt({ x: 0.4, z: -0.55 + i * 0.7 });
      client.rig.setCarry(true, '#d8b98a'); // Upload the unique material and shared decal too.
    }
    await sample(cycle, 'active');
    game.restartGame();
    await sample(cycle, 'menu');
  }
  const gl = renderer.getContext();
  const extension = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    cycles,
    sampleFrames,
    warmupCycles,
    archetypes: archetypes.map((value) => value.id),
    gpu: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    rows,
  };
}

export function assertLongSessionPlateau(report) {
  if (report.cycles < 10 || report.rows.length !== report.cycles * 2) throw new Error('Incomplete session');
  const counters = [
    'geometries',
    'textures',
    'programs',
    'sceneMaterials',
    'observedUndisposedMaterials',
    'clientLabels',
  ];
  for (const stage of ['active', 'menu']) {
    const rows = report.rows.filter((row) => row.stage === stage && row.cycle > report.warmupCycles);
    if (rows.length < 6) throw new Error('Not enough steady-state cycles');
    for (const key of counters) {
      const values = rows.map((row) => row[key]);
      if (Math.max(...values) !== Math.min(...values)) {
        throw new Error(`${stage}.${key} did not plateau: ${values.join(', ')}`);
      }
    }
    if (
      rows.some((row) => row.clients !== (stage === 'active' ? 4 : 2) || row.clientLabels !== row.clients)
    ) {
      throw new Error(`${stage}: leaked or missing clients/labels`);
    }
  }
}
