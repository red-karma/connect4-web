import { loadWeights, predict } from './network.js'
import { MCTS, greedyVisitAction } from './mcts.js'
import { NumericBoard } from './board.js'

let paramsPromise = null
function getParams() {
  if (!paramsPromise) paramsPromise = loadWeights('/model/manifest.json', '/model/weights.bin')
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
