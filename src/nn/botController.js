import { fromCells } from './board.js'

const DEFAULT_NUM_SIMULATIONS = 60
const DEFAULT_C_PUCT = 1.5

let worker = null
let nextId = 1
const pending = new Map()

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./bot.worker.js', import.meta.url), { type: 'module' })
    worker.onmessage = (event) => {
      const { id, type } = event.data
      const entry = pending.get(id)
      if (!entry) return
      if (type === 'progress') {
        entry.onProgress?.(event.data.done, event.data.total)
      } else if (type === 'result') {
        pending.delete(id)
        entry.resolve(event.data.column)
      }
    }
    worker.onerror = (err) => {
      for (const entry of pending.values()) entry.reject(err)
      pending.clear()
    }
  }
  return worker
}

// Preloads the network weights in the background so the first move doesn't
// pay the fetch cost on top of search time.
export function preloadBot() {
  getWorker()
}

// cells: the UI board (ROWS x COLS of 'R' | 'Y' | null). redIsRed/currentPlayerIsRed
// describe whose canonical sign is +1 -- callers just need to be consistent.
export function requestBotMove(cells, currentPlayerIsRed, { numSimulations = DEFAULT_NUM_SIMULATIONS, cPuct = DEFAULT_C_PUCT, onProgress } = {}) {
  const board = fromCells(cells, true, currentPlayerIsRed)
  const id = nextId++
  const w = getWorker()

  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress })
    w.postMessage({
      id,
      grid: board.grid,
      heights: board.heights,
      currentPlayer: board.currentPlayer,
      numSimulations,
      cPuct,
    })
  })
}
