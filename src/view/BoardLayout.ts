/** Fits the grid and its frame/shadow inside the canvas, including rectangular boards. */
export function calculateBoardLayout(width: number, height: number, rows: number, cols: number) {
  const framePadding = width <= 560 ? 10 : 16;
  const inset = framePadding + 10;
  // Match the larger desktop canvas while retaining a cap for oversized hosts.
  const tileSize = Math.max(1, Math.min(124, Math.floor(Math.min(
    (width - inset * 2) / cols,
    (height - inset * 2) / rows,
  ))));
  const boardWidth = tileSize * cols;
  const boardHeight = tileSize * rows;
  return {
    tileSize, boardWidth, boardHeight, framePadding,
    x: Math.floor((width - boardWidth) / 2),
    y: Math.floor((height - boardHeight) / 2),
  };
}
