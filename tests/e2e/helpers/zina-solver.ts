const neighbors = [[1, 3], [0, 2, 4], [1, 5], [0, 4, 6], [1, 3, 5, 7], [2, 4, 8], [3, 7], [4, 6, 8], [5, 7]];

// Find legal moves for the real shuffled board; no direct win callback or state mutation.
export function solve(board: (number | null)[], target: number[]): number[] {
  const queue = [{ board, path: [] as number[] }];
  const seen = new Set([JSON.stringify(board)]);
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const node = queue[cursor];
    if ([0, 1, 3, 4].every((index, i) => node.board[index] === target[i])) return node.path;
    const empty = node.board.indexOf(null);
    for (const index of neighbors[empty]) {
      const next = [...node.board];
      [next[empty], next[index]] = [next[index], next[empty]];
      const key = JSON.stringify(next);
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({ board: next, path: [...node.path, index] });
    }
  }
  throw new Error('Zina board has no solution');
}

