export const ROWS = 6
export const COLS = 7
export const RED = 'R'
export const YELLOW = 'Y'

export function createEmptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null))
}

export function getDropRow(board, col) {
  for (let r = ROWS - 1; r >= 0; r -= 1) {
    if (board[r][col] === null) return r
  }
  return -1
}

export function getValidColumns(board) {
  const cols = []
  for (let c = 0; c < COLS; c += 1) {
    if (board[0][c] === null) cols.push(c)
  }
  return cols
}

export function isBoardFull(board) {
  return board[0].every((cell) => cell !== null)
}

const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
]

export function findWinningCells(board, row, col, player) {
  for (const [dr, dc] of DIRECTIONS) {
    const cells = [[row, col]]

    let r = row + dr
    let c = col + dc
    while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === player) {
      cells.push([r, c])
      r += dr
      c += dc
    }

    r = row - dr
    c = col - dc
    while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === player) {
      cells.push([r, c])
      r -= dr
      c -= dc
    }

    if (cells.length >= 4) return cells
  }
  return null
}

export function pickRandomMove(board) {
  const cols = getValidColumns(board)
  if (cols.length === 0) return -1
  return cols[Math.floor(Math.random() * cols.length)]
}
