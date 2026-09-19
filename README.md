# Connect 4 Web

A React + Vite web UI for Connect 4, playable against an AlphaZero-style bot that runs entirely client-side. Both neural network inference and MCTS search execute in the browser inside a Web Worker — there's no backend or inference server.

## Requirements

Node.js >= 20.12 (Vite 8 / rolldown-vite needs `util.styleText`, added in that version).

## Getting started

```bash
npm install
npm run dev       # start the Vite dev server
```

Other commands:

```bash
npm run build     # production build
npm run preview   # preview the production build
npm run lint       # oxlint (config in .oxlintrc.json)
```

There is no test suite in this repo.

## How it works

The bot is a hand-written pure-JS port of a PyTorch AlphaZero-style model and MCTS search (originally trained in a sibling repo):

- `src/connect4.js` — the UI-facing board engine (`ROWS x COLS` grid of `'R' | 'Y' | null'`) that drives rendering and win/draw detection.
- `src/nn/` — the bot-facing engine: `board.js` defines a flat, current-player-relative `NumericBoard`; `network.js` implements the policy/value network forward pass (stem conv → residual blocks → policy/value heads); `mcts.js` is a PUCT MCTS search over `NumericBoard`.
- `public/model/manifest.json` + `public/model/weights.bin` — the trained network weights, loaded once by the worker.
- `bot.worker.js` / `botController.js` — the worker loads the weights and runs MCTS per move request; `botController.js` exposes the main-thread API that `App.jsx` calls to request bot moves.

See `CLAUDE.md` for more implementation detail, including the canonical-perspective convention shared with the model's training code.
