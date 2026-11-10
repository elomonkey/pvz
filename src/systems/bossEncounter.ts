import type { BossKind } from '../domain/bosses';

/**
 * Короткое состояние встречи с боссом: кто это, открыт ли уже диалог
 * и решён ли конфликт. UI, сцена и награды остаются в Game.
 */
export class BossEncounter {
  private current: BossKind | null = null;
  private triggeredFlag = false;
  private resolvedFlag = false;

  get kind(): BossKind | null {
    return this.current;
  }

  get triggered(): boolean {
    return this.triggeredFlag;
  }

  get resolved(): boolean {
    return this.resolvedFlag;
  }

  begin(kind: BossKind): void {
    this.current = kind;
    this.triggeredFlag = false;
    this.resolvedFlag = false;
  }

  trigger(): void {
    this.triggeredFlag = true;
  }

  resolve(): void {
    this.triggeredFlag = true;
    this.resolvedFlag = true;
  }

  reset(): void {
    this.current = null;
    this.triggeredFlag = false;
    this.resolvedFlag = false;
  }
}
