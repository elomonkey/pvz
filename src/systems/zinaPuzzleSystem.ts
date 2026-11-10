export const ZINA_PUZZLE_TIME = 75;

const TARGET_INDEXES = [0, 1, 3, 4];
const NEIGHBORS: number[][] = [
  [1, 3],
  [0, 2, 4],
  [1, 5],
  [0, 4, 6],
  [1, 3, 5, 7],
  [2, 4, 8],
  [3, 7],
  [4, 6, 8],
  [5, 7],
];

export type ZinaMoveResult = 'inactive' | 'invalid' | 'moved' | 'solved';
export type ZinaTickResult = 'inactive' | 'active' | 'timeout';

export function isZinaSolved(
  board: readonly (number | null)[],
  target: readonly number[],
): boolean {
  return TARGET_INDEXES.every(
    (boardIndex, targetIndex) => board[boardIndex] === target[targetIndex],
  );
}

function shuffleWith<T>(values: T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

/**
 * Пятнашки Бабы Зины: штрихкод, поле 3×3, таймер и проверка решения.
 * Без DOM, Three.js и UI.
 */
export class ZinaPuzzleSystem {
  private targetTiles: number[] = [];
  private boardTiles: (number | null)[] = [];
  private remaining = 0;
  private started = false;
  private done = false;

  get target(): number[] {
    return this.targetTiles;
  }

  get board(): (number | null)[] {
    return this.boardTiles;
  }

  get time(): number {
    return this.remaining;
  }

  get timeRatio(): number {
    return Math.max(0, Math.min(1, this.remaining / ZINA_PUZZLE_TIME));
  }

  get active(): boolean {
    return this.started && !this.done;
  }

  get finished(): boolean {
    return this.started && this.done;
  }

  start(
    segmentIds: number[],
    filler: number,
    random: () => number = Math.random,
  ): void {
    this.targetTiles = shuffleWith(segmentIds, random);
    this.boardTiles = [
      this.targetTiles[0],
      this.targetTiles[1],
      filler,
      this.targetTiles[2],
      this.targetTiles[3],
      filler,
      filler,
      filler,
      null,
    ];

    let empty = 8;
    let previous = -1;
    for (let move = 0; move < 120; move++) {
      const options = NEIGHBORS[empty].filter((index) => index !== previous);
      const next = options[Math.floor(random() * options.length)];
      this.boardTiles[empty] = this.boardTiles[next];
      this.boardTiles[next] = null;
      previous = empty;
      empty = next;
    }

    if (this.isSolved()) {
      const next = NEIGHBORS[empty][0];
      this.boardTiles[empty] = this.boardTiles[next];
      this.boardTiles[next] = null;
    }

    this.remaining = ZINA_PUZZLE_TIME;
    this.started = true;
    this.done = false;
  }

  move(index: number): ZinaMoveResult {
    if (!this.active) return 'inactive';
    const empty = this.boardTiles.indexOf(null);
    if (empty < 0 || !NEIGHBORS[empty].includes(index)) return 'invalid';

    this.boardTiles[empty] = this.boardTiles[index];
    this.boardTiles[index] = null;
    return this.isSolved() ? 'solved' : 'moved';
  }

  tick(dt: number): ZinaTickResult {
    if (!this.active) return 'inactive';
    this.remaining = Math.max(0, this.remaining - dt);
    return this.remaining <= 0 ? 'timeout' : 'active';
  }

  resolve(): void {
    this.done = true;
  }

  reset(): void {
    this.targetTiles = [];
    this.boardTiles = [];
    this.remaining = 0;
    this.started = false;
    this.done = false;
  }

  private isSolved(): boolean {
    return isZinaSolved(this.boardTiles, this.targetTiles);
  }
}
