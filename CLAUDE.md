# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A React + Vite web UI for Connect 4, playable against an AlphaZero-style bot that runs entirely client-side (network inference + MCTS both execute in the browser, in a Web Worker — no backend/inference server).

## Commands

```bash
npm run dev       # start the Vite dev server
npm run build     # production build
npm run preview   # preview the production build
npm run lint      # oxlint (config in .oxlintrc.json)
```

There is no test suite in this repo.

Node must be >= 20.12 (Vite 8 / rolldown-vite needs `util.styleText`, added there); older Node fails immediately with a `styleText` import error from `node:util`.

## Architecture

**Two independent board representations coexist by design**, mirroring the split in the sibling training repo (`PycharmProjects/RL1`, not part of this repo — see below):
- `src/connect4.js` — the UI-facing engine: `ROWS x COLS` array of `'R' | 'Y' | null`, driving `App.jsx`'s rendering and win/draw detection.
- `src/nn/board.js` (`NumericBoard`) — the bot-facing engine: flat `Int8Array` of `+1/-1`, current-player-relative, matching `RL1/connect4.py`'s `Connect4Board` exactly (including its `clone()`-for-search and canonical-perspective conventions). `fromCells()` converts a UI board into a `NumericBoard`.

**`src/nn/` is a hand-written pure-JS port of the PyTorch model and search from `RL1/alphazero.py` + `RL1/mcts.py`** — not a generic ONNX/TF.js runtime:
- `network.js` implements the exact `PolicyValueNet` forward pass (stem conv → 6 residual blocks → policy/value heads, GroupNorm not BatchNorm) with hand-unrolled 3x3/1x1 conv, GroupNorm, and linear ops over flat `Float32Array`s. Layer shapes (`CHANNELS = 128`, `NUM_BLOCKS = 6`) are hardcoded to match the trained checkpoint — changing the Python model's architecture requires updating this file in lockstep.
- `mcts.js` is a PUCT MCTS port of `RL1/mcts.py`, operating on `NumericBoard` via a `predictFn` (see `network.predict`).
- Weights load from `public/model/manifest.json` (tensor name → shape/offset/numel, offsets in **float units** not bytes) + `public/model/weights.bin` (all tensors concatenated as raw float32, in the PyTorch `state_dict` iteration order). There is no converter script checked into this repo; regenerating these two files from a `.pt` checkpoint means iterating `torch.load(path)`'s `state_dict` and writing out matching offsets/shapes yourself.
- `bot.worker.js` + `botController.js`: the worker loads weights once and runs `MCTS` per move request, posting `progress`/`result` messages back; `botController.js` is the main-thread API (`preloadBot`, `requestBotMove`) that `App.jsx` calls. Inference and search never run on the main thread.

**Canonical perspective convention** (shared with the Python repo): observations are always from the perspective of the player about to move. `NumericBoard.currentPlayer` flips after every move, and only `network.predict()` applies the `grid * currentPlayer` canonicalization before calling `forward()`. MCTS backpropagation negates value at each ply for the same reason. If you touch `mcts.js` or `network.js`, preserve this sign convention or the bot's play will silently degrade.

**`App.jsx`** owns all game/UI state (board, scores, round count, current player) as plain `useState`; there's no external state library. The bot's turn is driven by a `useEffect` keyed on `currentPlayer`/`board` that calls `requestBotMove` and applies the returned column via the same `drop()` used for human moves.
