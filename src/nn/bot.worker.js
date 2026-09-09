import { loadWeights, predict } from './network.js'
import { MCTS, greedyVisitAction } from './mcts.js'
import { NumericBoard } from './board.js'

// In a production build this worker lands in dist/assets/, sibling to dist/model/
// (public/model/ copied verbatim), so resolving relative to the worker's own runtime
// URL keeps it correct under any deploy subpath. In dev, source files live under
// /src/nn/ while public/ is served at the site root, so that same relative path
// would miss -- and hit Vite's dev SPA fallback (200 index.html) instead of a real
// 404, silently breaking the manifest.json fetch. Root-absolute is always correct
// in dev, since there's only one place the dev server runs from.
const modelBaseUrl = import.meta.env.DEV ? '/model/' : new URL(/* @vite-ignore */ '../model/', import.meta.url).href

let paramsPromise = null
function getParams() {
  if (!paramsPromise) {
    paramsPromise = loadWeights(`${modelBaseUrl}manifest.json`, `${modelBaseUrl}weights.bin`)
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
