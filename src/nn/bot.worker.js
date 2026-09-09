import { loadWeights, predict } from './network.js'
import { MCTS, greedyVisitAction } from './mcts.js'
import { NumericBoard } from './board.js'

let paramsPromise = null
function getParams() {
  if (!paramsPromise) {
    // Resolved relative to this worker's own (runtime) URL rather than fetched from
    // a root-absolute path, so it keeps working under any deploy subpath -- public/model/
    // always lands next to assets/ in the build output, whatever the site root is.
    paramsPromise = loadWeights(
      new URL(/* @vite-ignore */ '../model/manifest.json', import.meta.url).href,
      new URL(/* @vite-ignore */ '../model/weights.bin', import.meta.url).href,
    )
  }
  return paramsPromise
}
// Warm the fetch as soon as the worker spins up, so it's ready by the first move.
getParams()

self.onmessage = async (event) => {
  const { id, grid, heights, currentPlayer, numSimulations, cPuct } = event.data
  const params = await getParams()

  const board = new NumericBoard()
  board.grid.set(grid)
  board.heights.set(heights)
  board.currentPlayer = currentPlayer

  const mcts = new MCTS((b) => predict(b, params), { cPuct, numSimulations })
  const root = mcts.run(board, (done, total) => {
    self.postMessage({ id, type: 'progress', done, total })
  })
  const column = greedyVisitAction(root)
  self.postMessage({ id, type: 'result', column })
}
