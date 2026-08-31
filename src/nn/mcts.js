// Port of PycharmProjects/RL1/mcts.py: PUCT MCTS guided by network.predict().
import { COLS } from './network.js'

class MCTSNode {
  constructor(prior) {
    this.prior = prior
    this.visitCount = 0
    this.valueSum = 0
    this.children = new Map()
  }

  value() {
    return this.visitCount === 0 ? 0 : this.valueSum / this.visitCount
  }

  expanded() {
    return this.children.size > 0
  }
}

export class MCTS {
  constructor(predictFn, { cPuct = 1.5, numSimulations = 200 } = {}) {
    this.predictFn = predictFn
    this.cPuct = cPuct
    this.numSimulations = numSimulations
  }

  run(rootBoard, onSimulation) {
    const root = new MCTSNode(1)
    this._expand(root, rootBoard)

    for (let i = 0; i < this.numSimulations; i += 1) {
      const board = rootBoard.clone()
      let node = root
      const path = [node]
      while (node.expanded()) {
        const [action, child] = this._selectChild(node)
        board.drop(action)
        node = child
        path.push(node)
      }
      const value = this._expand(node, board)
      this._backpropagate(path, value)
      if (onSimulation) onSimulation(i + 1, this.numSimulations)
    }

    return root
  }

  _expand(node, board) {
    // A decisive terminal is reached by a move, so board.current_player is
    // left pointing at whoever just moved -- i.e. the winner -- rather than
    // being flipped to "whoever's turn it is." Every other value in this
    // tree (via predictFn and _backpropagate's alternating sign) means
    // "value for the side about to move." To stay on that same convention,
    // a decisive terminal must read as -1 (bad for the side "about to
    // move," who in fact has no move left because they just lost).
    if (board.done) return board.winner === 0 ? 0 : -1

    const { priors, value } = this.predictFn(board)
    for (const [action, p] of Object.entries(priors)) {
      node.children.set(Number(action), new MCTSNode(p))
    }
    return value
  }

  _selectChild(node) {
    const sqrtParent = Math.sqrt(node.visitCount)
    let bestScore = -Infinity
    let best = []
    for (const [action, child] of node.children) {
      const q = -child.value()
      const u = (this.cPuct * child.prior * sqrtParent) / (1 + child.visitCount)
      const score = q + u
      if (score > bestScore) {
        bestScore = score
        best = [[action, child]]
      } else if (score === bestScore) {
        best.push([action, child])
      }
    }
    return best[Math.floor(Math.random() * best.length)]
  }

  _backpropagate(path, initialValue) {
    let value = initialValue
    for (let i = path.length - 1; i >= 0; i -= 1) {
      const node = path[i]
      node.valueSum += value
      node.visitCount += 1
      value = -value
    }
  }
}

// temperature=0 (greedy): the column with the most root visits.
export function greedyVisitAction(root) {
  let bestAction = 0
  let bestCount = -1
  for (let action = 0; action < COLS; action += 1) {
    const child = root.children.get(action)
    const count = child ? child.visitCount : 0
    if (count > bestCount) {
      bestCount = count
      bestAction = action
    }
  }
  return bestAction
}
