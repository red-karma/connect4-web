// Numeric Connect4 engine mirroring PycharmProjects/RL1/connect4.py's Connect4Board:
// pieces are +1 / -1 (not the UI's 'R' / 'Y'), current player flips after every
// non-terminal move, and the board stays raw (not perspective-shifted) -- only
// network.predict() applies the `board * current_player` canonicalization.
import { ROWS, COLS } from './network.js'

export class NumericBoard {
  constructor() {
    this.grid = new Int8Array(ROWS * COLS)
    this.heights = new Int8Array(COLS)
    this.currentPlayer = 1
    this.winner = null
    this.done = false
    this.lastMove = null
  }

  clone() {
    const copy = new NumericBoard()
    copy.grid.set(this.grid)
    copy.heights.set(this.heights)
    copy.currentPlayer = this.currentPlayer
    copy.winner = this.winner
    copy.done = this.done
    copy.lastMove = this.lastMove
    return copy
  }

  legalColumns() {
    const cols = []
    for (let c = 0; c < COLS; c += 1) if (this.heights[c] < ROWS) cols.push(c)
    return cols
  }

  drop(col) {
    const row = ROWS - 1 - this.heights[col]
    const player = this.currentPlayer
    this.grid[row * COLS + col] = player
    this.heights[col] += 1
    this.lastMove = [row, col]

    if (this._checkWin(row, col, player)) {
      this.winner = player
      this.done = true
    } else if (this.legalColumns().length === 0) {
      this.winner = 0
      this.done = true
    } else {
      this.currentPlayer = -player
    }
    return { winner: this.winner, done: this.done }
  }

  _checkWin(row, col, player) {
    const directions = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ]
    for (const [dr, dc] of directions) {
      let count = 1
      count += this._countDir(row, col, dr, dc, player)
      count += this._countDir(row, col, -dr, -dc, player)
      if (count >= 4) return true
    }
    return false
  }

  _countDir(row, col, dr, dc, player) {
    let count = 0
    let r = row + dr
    let c = col + dc
    while (r >= 0 && r < ROWS && c >= 0 && c < COLS && this.grid[r * COLS + c] === player) {
      count += 1
      r += dr
      c += dc
    }
    return count
  }
}

export function fromCells(cells, redIsPositive, currentPlayerIsRed) {
  const board = new NumericBoard()
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const cell = cells[row][col]
      if (cell === null) continue
      const value = (cell === 'R') === redIsPositive ? 1 : -1
      board.grid[row * COLS + col] = value
      board.heights[col] += 1
    }
  }
  board.currentPlayer = currentPlayerIsRed === redIsPositive ? 1 : -1
  return board
}
