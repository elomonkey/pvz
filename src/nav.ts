import {
  COUNTER,
  ROOM,
  SHELF_D,
  SHELF_DEFS,
  STAFF_SHELF,
  STORAGE_DOOR,
  STORAGE_WALL_X,
  shelfWidth,
  type Vec2,
} from './data';

interface Rect {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
}

class MinHeap {
  private items: { index: number; priority: number }[] = [];

  get size(): number {
    return this.items.length;
  }

  push(index: number, priority: number): void {
    this.items.push({ index, priority });
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent].priority <= this.items[i].priority) break;
      [this.items[parent], this.items[i]] = [this.items[i], this.items[parent]];
      i = parent;
    }
  }

  pop(): number {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0 && last) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        if (left < this.items.length && this.items[left].priority < this.items[smallest].priority) {
          smallest = left;
        }
        if (right < this.items.length && this.items[right].priority < this.items[smallest].priority) {
          smallest = right;
        }
        if (smallest === i) break;
        [this.items[i], this.items[smallest]] = [this.items[smallest], this.items[i]];
        i = smallest;
      }
    }
    return top.index;
  }
}

const NEIGHBORS: Array<[number, number, number]> = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

export class NavGrid {
  readonly cell = 0.35;
  readonly minX = ROOM.minX + 0.45;
  readonly maxX = ROOM.maxX - 0.45;
  readonly minZ = ROOM.minZ + 0.35;
  readonly maxZ = 0.02;
  readonly cols: number;
  readonly rows: number;
  private readonly blocked: Uint8Array;
  private activeShelfCount = 2;

  constructor() {
    this.cols = Math.ceil((this.maxX - this.minX) / this.cell);
    this.rows = Math.ceil((this.maxZ - this.minZ) / this.cell);
    this.blocked = new Uint8Array(this.cols * this.rows);
    this.build();
  }

  private idx(c: number, r: number): number {
    return r * this.cols + c;
  }

  setActiveShelfCount(count: number): void {
    this.activeShelfCount = count;
    this.blocked.fill(0);
    this.build();
  }

  private build(): void {
    const inflate = 0.32;
    const rects: Rect[] = [];

    // Стойка полностью отделяет клиентскую зону.
    rects.push({
      x1: COUNTER.x - COUNTER.w / 2 - inflate,
      x2: COUNTER.x + COUNTER.w / 2 + inflate,
      z1: COUNTER.z - COUNTER.d / 2 - inflate,
      z2: COUNTER.z + COUNTER.d / 2 + inflate,
    });

    // Шкафчик в расширенной зоне сотрудника.
    rects.push({
      x1: STAFF_SHELF.x - STAFF_SHELF.w / 2 - inflate,
      x2: STAFF_SHELF.x + STAFF_SHELF.w / 2 + inflate,
      z1: STAFF_SHELF.z - STAFF_SHELF.d / 2 - inflate,
      z2: STAFF_SHELF.z + STAFF_SHELF.d / 2 + inflate,
    });

    // Стеллажи в складском крыле. Третий стоит вдоль западной стены.
    for (let index = 0; index < this.activeShelfCount; index++) {
      const def = SHELF_DEFS[index];
      const width = shelfWidth(def);
      const halfX =
        Math.abs(Math.cos(def.rotation)) * (width / 2) +
        Math.abs(Math.sin(def.rotation)) * (SHELF_D / 2);
      const halfZ =
        Math.abs(Math.sin(def.rotation)) * (width / 2) +
        Math.abs(Math.cos(def.rotation)) * (SHELF_D / 2);
      rects.push({
        x1: def.x - halfX - inflate,
        x2: def.x + halfX + inflate,
        z1: def.z - halfZ - inflate,
        z2: def.z + halfZ + inflate,
      });
    }

    // Перегородка склад/наша зона. Дверной проём: z от -1.2 до 0.0.
    const doorZ1 = STORAGE_DOOR.z - STORAGE_DOOR.width / 2;
    const doorZ2 = STORAGE_DOOR.z + STORAGE_DOOR.width / 2;
    rects.push({
      x1: STORAGE_WALL_X - 0.1 - inflate,
      x2: STORAGE_WALL_X + 0.1 + inflate,
      z1: -1.55 - inflate,
      z2: doorZ1 + inflate,
    });
    rects.push({
      x1: STORAGE_WALL_X - 0.1 - inflate,
      x2: STORAGE_WALL_X + 0.1 + inflate,
      z1: doorZ2 - inflate,
      z2: 0.55 + inflate,
    });

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const p = this.gridToWorld(c, r);
        let isBlocked = false;
        for (const rect of rects) {
          if (p.x >= rect.x1 && p.x <= rect.x2 && p.z >= rect.z1 && p.z <= rect.z2) {
            isBlocked = true;
            break;
          }
        }
        this.blocked[this.idx(c, r)] = isBlocked ? 1 : 0;
      }
    }
  }

  worldToGrid(x: number, z: number): { c: number; r: number } {
    const c = Math.round((x - this.minX) / this.cell);
    const r = Math.round((z - this.minZ) / this.cell);
    return {
      c: Math.max(0, Math.min(this.cols - 1, c)),
      r: Math.max(0, Math.min(this.rows - 1, r)),
    };
  }

  gridToWorld(c: number, r: number): Vec2 {
    return {
      x: this.minX + c * this.cell,
      z: this.minZ + r * this.cell,
    };
  }

  private isBlockedCell(c: number, r: number): boolean {
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return true;
    return this.blocked[this.idx(c, r)] === 1;
  }

  isWalkable(x: number, z: number): boolean {
    // Важно: клики за пределами сетки (например, по клиентской зоне)
    // не должны считаться проходимыми — иначе игрок выходит за стойку.
    if (x < this.minX || x > this.maxX || z < this.minZ || z > this.maxZ) return false;
    const { c, r } = this.worldToGrid(x, z);
    return !this.isBlockedCell(c, r);
  }

  /** Resolves a click/action target to a guaranteed walkable point. */
  resolveTarget(target: Vec2): Vec2 | null {
    if (this.isWalkable(target.x, target.z)) return { x: target.x, z: target.z };
    const { c, r } = this.worldToGrid(target.x, target.z);
    if (this.isBlockedCell(c, r)) {
      const free = this.nearestFree(c, r);
      return free ? this.gridToWorld(free.c, free.r) : null;
    }
    return this.gridToWorld(c, r);
  }

  private nearestFree(c0: number, r0: number): { c: number; r: number } | null {
    if (!this.isBlockedCell(c0, r0)) return { c: c0, r: r0 };
    for (let radius = 1; radius < Math.max(this.cols, this.rows); radius++) {
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          if (Math.abs(dr) !== radius && Math.abs(dc) !== radius) continue;
          const c = c0 + dc;
          const r = r0 + dr;
          if (!this.isBlockedCell(c, r)) return { c, r };
        }
      }
    }
    return null;
  }

  private heuristic(c1: number, r1: number, c2: number, r2: number): number {
    const dx = Math.abs(c1 - c2);
    const dz = Math.abs(r1 - r2);
    return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz);
  }

  findPath(start: Vec2, target: Vec2): Vec2[] {
    const resolved = this.resolveTarget(target);
    if (!resolved) return [];

    let s = this.worldToGrid(start.x, start.z);
    if (this.isBlockedCell(s.c, s.r)) {
      const free = this.nearestFree(s.c, s.r);
      if (!free) return [];
      s = free;
    }
    const e = this.worldToGrid(resolved.x, resolved.z);

    const startIdx = this.idx(s.c, s.r);
    const endIdx = this.idx(e.c, e.r);
    const total = this.cols * this.rows;

    if (startIdx === endIdx) return [start, resolved];

    const gScore = new Float32Array(total).fill(Number.POSITIVE_INFINITY);
    const cameFrom = new Int32Array(total).fill(-1);
    const closed = new Uint8Array(total);
    const open = new MinHeap();

    gScore[startIdx] = 0;
    open.push(startIdx, this.heuristic(s.c, s.r, e.c, e.r));

    let found = false;
    while (open.size > 0) {
      const current = open.pop();
      if (current === endIdx) {
        found = true;
        break;
      }
      if (closed[current]) continue;
      closed[current] = 1;

      const cc = current % this.cols;
      const cr = Math.floor(current / this.cols);

      for (const [dc, dr, cost] of NEIGHBORS) {
        const nc = cc + dc;
        const nr = cr + dr;
        if (this.isBlockedCell(nc, nr)) continue;
        if (dc !== 0 && dr !== 0) {
          if (this.isBlockedCell(cc + dc, cr) || this.isBlockedCell(cc, cr + dr)) continue;
        }
        const ni = this.idx(nc, nr);
        if (closed[ni]) continue;
        const tentative = gScore[current] + cost;
        if (tentative < gScore[ni]) {
          gScore[ni] = tentative;
          cameFrom[ni] = current;
          open.push(ni, tentative + this.heuristic(nc, nr, e.c, e.r));
        }
      }
    }

    if (!found) return [];

    const cells: number[] = [];
    let cur = endIdx;
    while (cur !== -1) {
      cells.push(cur);
      if (cur === startIdx) break;
      cur = cameFrom[cur];
    }
    cells.reverse();

    const raw: Vec2[] = cells.map((index) =>
      this.gridToWorld(index % this.cols, Math.floor(index / this.cols)),
    );
    raw[0] = { x: start.x, z: start.z };
    raw.push(resolved);

    return this.smooth(raw);
  }

  private smooth(points: Vec2[]): Vec2[] {
    if (points.length <= 2) return points;
    const out: Vec2[] = [points[0]];
    let i = 0;
    while (i < points.length - 1) {
      let j = points.length - 1;
      for (; j > i + 1; j--) {
        if (this.hasLineOfSight(points[i], points[j])) break;
      }
      out.push(points[j]);
      i = j;
    }
    return out;
  }

  private hasLineOfSight(a: Vec2, b: Vec2): boolean {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(2, Math.ceil(dist / 0.12));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (!this.isWalkable(a.x + dx * t, a.z + dz * t)) return false;
    }
    return true;
  }
}
