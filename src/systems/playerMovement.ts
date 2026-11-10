import type { Vec2 } from '../data';

export interface MovementStep {
  moving: boolean;
  arrived: boolean;
  facing: number;
}

/**
 * Движение игрока по уже построенному пути.
 * Не знает про NavGrid, сцену и игровые действия.
 */
export class PlayerMovement {
  position: Vec2;
  facing = 0;
  private path: Vec2[] = [];

  constructor(start: Vec2) {
    this.position = { x: start.x, z: start.z };
  }

  get hasPath(): boolean {
    return this.path.length > 0;
  }

  get pathLength(): number {
    return this.path.length;
  }

  distanceTo(target: Vec2): number {
    return Math.hypot(target.x - this.position.x, target.z - this.position.z);
  }

  setPath(path: readonly Vec2[]): void {
    this.path = path.map((point) => ({ x: point.x, z: point.z }));
  }

  clearPath(): void {
    this.path = [];
  }

  snapTo(position: Vec2): void {
    this.position = { x: position.x, z: position.z };
    this.path = [];
  }

  reset(start: Vec2): void {
    this.position = { x: start.x, z: start.z };
    this.facing = 0;
    this.path = [];
  }

  update(dt: number, speed: number): MovementStep {
    const moving = this.path.length > 0;
    let remaining = speed * dt;

    while (moving && remaining > 0 && this.path.length > 0) {
      const target = this.path[0];
      const dx = target.x - this.position.x;
      const dz = target.z - this.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.0005) {
        this.path.shift();
        continue;
      }

      const step = Math.min(remaining, distance);
      this.position.x += (dx / distance) * step;
      this.position.z += (dz / distance) * step;
      remaining -= step;
      this.facing = Math.atan2(dx, dz);
      if (step >= distance - 0.0005) {
        this.path.shift();
      }
    }

    return {
      moving,
      arrived: moving && this.path.length === 0,
      facing: this.facing,
    };
  }
}
