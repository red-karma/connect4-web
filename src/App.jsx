import { useCallback, useEffect, useState } from 'react'
import { COLS, RED, YELLOW, createEmptyBoard, findWinningCells, getDropRow, isBoardFull } from './connect4.js'
import { preloadBot, requestBotMove } from './nn/botController.js'
import './App.css'

const KEY_TO_COL = ['0', '1', '2', '3', '4', '5', '6']
const DIFFICULTIES = [
  { level: 1, label: 'Very Easy', simulations: 1 },
  { level: 2, label: 'Easy', simulations: 10 },
  { level: 3, label: 'Average', simulations: 40 },
  { level: 4, label: 'Hard', simulations: 70 },
  { level: 5, label: 'Very Hard', simulations: 100 },
]
const DEFAULT_DIFFICULTY = 3

function cellKey(row, col) {
  return `${row}-${col}`
}

function App() {
  const [board, setBoard] = useState(createEmptyBoard)
  const [currentPlayer, setCurrentPlayer] = useState(RED)
  const [winner, setWinner] = useState(null)
  const [winningCells, setWinningCells] = useState([])
  const [lastMove, setLastMove] = useState(null)
  const [hoverCol, setHoverCol] = useState(null)
  const [pressedCol, setPressedCol] = useState(null)
  const [scores, setScores] = useState({ [RED]: 0, [YELLOW]: 0 })
  const [rounds, setRounds] = useState(0)
  const [botProgress, setBotProgress] = useState(null)
  const [difficulty, setDifficulty] = useState(DEFAULT_DIFFICULTY)

  const gameOver = winner !== null
  const botThinking = !gameOver && currentPlayer === YELLOW
  const winningSet = new Set(winningCells.map(([r, c]) => cellKey(r, c)))
  const botSimulations = DIFFICULTIES[difficulty - 1].simulations

  const drop = useCallback(
    (col, player) => {
      const row = getDropRow(board, col)
      if (row === -1) return

      const nextBoard = board.map((r) => r.slice())
      nextBoard[row][col] = player
      setBoard(nextBoard)
      setLastMove({ row, col })

      const win = findWinningCells(nextBoard, row, col, player)
      if (win) {
        setWinner(player)
        setWinningCells(win)
        setScores((prev) => ({ ...prev, [player]: prev[player] + 1 }))
        setRounds((prev) => prev + 1)
        return
      }

      if (isBoardFull(nextBoard)) {
        setWinner('draw')
        setRounds((prev) => prev + 1)
        return
      }

      setCurrentPlayer(player === RED ? YELLOW : RED)
    },
    [board],
  )

  const columnIsPlayable = useCallback(
    (col) => !gameOver && !botThinking && currentPlayer === RED && getDropRow(board, col) !== -1,
    [gameOver, botThinking, currentPlayer, board],
  )

  const handleColumnSelect = useCallback(
    (col) => {
      if (!columnIsPlayable(col)) return
      drop(col, RED)
    },
    [columnIsPlayable, drop],
  )

  useEffect(() => {
    const handleKeyDown = (event) => {
      const col = KEY_TO_COL.indexOf(event.key)
      if (col === -1) return
      setPressedCol(col)
      handleColumnSelect(col)
    }
    const handleKeyUp = (event) => {
      const col = KEY_TO_COL.indexOf(event.key)
      if (col === -1) return
      setPressedCol((c) => (c === col ? null : c))
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [handleColumnSelect])

  useEffect(() => {
    preloadBot()
  }, [])

  useEffect(() => {
    if (gameOver || currentPlayer !== YELLOW) return undefined

    let cancelled = false
    requestBotMove(board, false, {
      numSimulations: botSimulations,
      onProgress: (done, total) => {
        if (!cancelled) setBotProgress({ done, total })
      },
    }).then((col) => {
      if (cancelled) return
      setBotProgress(null)
      drop(col, YELLOW)
    })

    return () => {
      cancelled = true
    }
  }, [currentPlayer, gameOver, board, drop, botSimulations])

  const newRound = () => {
    setBotProgress(null)
    setBoard(createEmptyBoard())
    setCurrentPlayer(RED)
    setWinner(null)
    setWinningCells([])
    setLastMove(null)
  }

  const resetMatch = () => {
    newRound()
    setScores({ [RED]: 0, [YELLOW]: 0 })
    setRounds(0)
  }

  const statusText = (() => {
    if (winner === 'draw') return "It's a draw!"
    if (winner === RED) return 'You win! 🎉'
    if (winner === YELLOW) return 'Bot wins! 🤖'
    if (botThinking) {
      const n = botProgress?.done ?? 0
      const total = botProgress?.total ?? botSimulations
      return `Bot is thinking… (${n}/${total})`
    }
    return 'Your turn — press 0–6 to drop'
  })()

  return (
    <div className="app">
      <div className="table-surface">
        <header className="hud">
          <h1 className="logo">
            <span className="logo-connect">CONNECT</span>
            <span className="logo-four">4</span>
          </h1>

          <div className="scoreboard">
            <div className={`score-card red ${currentPlayer === RED && !gameOver ? 'active' : ''}`}>
              <span className="disc-icon red" />
              <span className="score-label">You</span>
              <span className="score-value">{scores[RED]}</span>
            </div>
            <div className="round-count">Round {rounds + 1}</div>
            <div className={`score-card yellow ${currentPlayer === YELLOW && !gameOver ? 'active' : ''}`}>
              <span className="disc-icon yellow" />
              <span className="score-label">Bot</span>
              <span className="score-value">{scores[YELLOW]}</span>
            </div>
          </div>
        </header>

        <div className="difficulty">
          <span className="difficulty-label">Difficulty: {DIFFICULTIES[difficulty - 1].label}</span>
          <div className="difficulty-levels">
            {DIFFICULTIES.map(({ level }) => (
              <button
                type="button"
                key={level}
                className={`difficulty-btn ${difficulty === level ? 'active' : ''}`}
                aria-label={`Difficulty ${level}: ${DIFFICULTIES[level - 1].label}`}
                aria-pressed={difficulty === level}
                onClick={() => setDifficulty(level)}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        <div className={`status-line ${gameOver ? 'over' : ''}`}>
          {botThinking && !gameOver && <span className="spinner" />}
          {statusText}
        </div>

        <div className="board-area">
          <div className="drop-row">
            {Array.from({ length: COLS }, (_, col) => {
              const playable = columnIsPlayable(col)
              const highlighted = playable && (hoverCol === col || pressedCol === col)
              return (
                <button
                  type="button"
                  key={col}
                  className={`drop-slot ${pressedCol === col ? 'pressed' : ''}`}
                  disabled={!playable}
                  aria-label={`Drop in column ${col} (press ${col})`}
                  onMouseEnter={() => setHoverCol(col)}
                  onMouseLeave={() => setHoverCol((c) => (c === col ? null : c))}
                  onClick={() => handleColumnSelect(col)}
                >
                  <span className={`ghost-disc red ${highlighted ? 'visible' : ''}`} />
                  <span className={`key-badge ${playable ? '' : 'disabled'}`}>{col}</span>
                </button>
              )
            })}
          </div>

          <div className="board">
            {board.map((rowCells, row) =>
              rowCells.map((cell, col) => {
                const isLast = lastMove && lastMove.row === row && lastMove.col === col
                const isWinning = winningSet.has(cellKey(row, col))
                return (
                  <div
                    key={cellKey(row, col)}
                    className={`cell ${hoverCol === col && columnIsPlayable(col) ? 'col-hover' : ''}`}
                    onMouseEnter={() => setHoverCol(col)}
                    onMouseLeave={() => setHoverCol((c) => (c === col ? null : c))}
                    onClick={() => handleColumnSelect(col)}
                  >
                    <div className="hole">
                      {cell && (
                        <div
                          className={`disc ${cell === RED ? 'red' : 'yellow'} ${isLast ? 'drop-anim' : ''} ${
                            isWinning ? 'winning' : ''
                          }`}
                          style={{ '--row': row }}
                        />
                      )}
                    </div>
                  </div>
                )
              }),
            )}
          </div>

          <div className="board-stand" />
        </div>

        <div className="controls">
          <button type="button" className="btn btn-primary" onClick={newRound}>
            New Round
          </button>
          <button type="button" className="btn btn-ghost" onClick={resetMatch}>
            Reset Match
          </button>
        </div>
      </div>

      {gameOver && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className={`result-card ${winner === 'draw' ? 'draw' : winner === RED ? 'win' : 'lose'}`}>
            <div className="result-discs">
              <span className="disc-icon red big" />
              <span className="disc-icon yellow big" />
            </div>
            <h2>{statusText}</h2>
            <button type="button" className="btn btn-primary" onClick={newRound}>
              Play Again
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
