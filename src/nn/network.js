// Pure-JS port of alphazero.py's PolicyValueNet (see PycharmProjects/RL1/alphazero.py
// and dqn.py's ResidualBlock). Operates on a single (1, ROWS, COLS) board, batch size 1.
export const ROWS = 6
export const COLS = 7
const CHANNELS = 128
const NUM_BLOCKS = 6
const GN_EPS = 1e-5

// 3x3, padding=1, stride=1 (the only kind this network uses besides 1x1).
// Pads once into a zero-bordered buffer, then for each (oc, ic) does a 9-term
// FMA per output pixel with the kernel unrolled by hand -- a kh/kw loop here
// costs ~3x more (V8 doesn't hoist/unroll it on its own), and this still runs
// hundreds of times per bot move (once per MCTS simulation).
function conv3x3(input, cIn, h, w, weight, bias, cOut) {
  const ph = h + 2
  const pw = w + 2
  const padded = new Float32Array(cIn * ph * pw)
  for (let c = 0; c < cIn; c += 1) {
    const srcBase = c * h * w
    const dstBase = c * ph * pw
    for (let r = 0; r < h; r += 1) {
      padded.set(input.subarray(srcBase + r * w, srcBase + r * w + w), dstBase + (r + 1) * pw + 1)
    }
  }

  const hw = h * w
  const out = new Float32Array(cOut * hw)
  for (let oc = 0; oc < cOut; oc += 1) {
    const outBase = oc * hw
    out.fill(bias[oc], outBase, outBase + hw)
    const wBaseOc = oc * cIn * 9
    for (let ic = 0; ic < cIn; ic += 1) {
      const wBase = wBaseOc + ic * 9
      const w00 = weight[wBase]
      const w01 = weight[wBase + 1]
      const w02 = weight[wBase + 2]
      const w10 = weight[wBase + 3]
      const w11 = weight[wBase + 4]
      const w12 = weight[wBase + 5]
      const w20 = weight[wBase + 6]
      const w21 = weight[wBase + 7]
      const w22 = weight[wBase + 8]
      const padBase = ic * ph * pw
      for (let oh = 0; oh < h; oh += 1) {
        const r0 = padBase + oh * pw
        const r1 = r0 + pw
        const r2 = r1 + pw
        const outRow = outBase + oh * w
        for (let ow = 0; ow < w; ow += 1) {
          out[outRow + ow] +=
            w00 * padded[r0 + ow] + w01 * padded[r0 + ow + 1] + w02 * padded[r0 + ow + 2] +
            w10 * padded[r1 + ow] + w11 * padded[r1 + ow + 1] + w12 * padded[r1 + ow + 2] +
            w20 * padded[r2 + ow] + w21 * padded[r2 + ow + 1] + w22 * padded[r2 + ow + 2]
        }
      }
    }
  }
  return out
}

// 1x1, padding=0: a plain [cOut x cIn] . [cIn x HW] matmul.
function conv1x1(input, cIn, h, w, weight, bias, cOut) {
  const hw = h * w
  const out = new Float32Array(cOut * hw)
  for (let oc = 0; oc < cOut; oc += 1) {
    const outBase = oc * hw
    out.fill(bias[oc], outBase, outBase + hw)
    for (let ic = 0; ic < cIn; ic += 1) {
      const wv = weight[oc * cIn + ic]
      const inBase = ic * hw
      for (let i = 0; i < hw; i += 1) out[outBase + i] += wv * input[inBase + i]
    }
  }
  return out
}

function groupNorm(input, c, h, w, groups, weight, bias) {
  const hw = h * w
  const chPerGroup = c / groups
  const out = new Float32Array(c * hw)
  const count = chPerGroup * hw
  for (let g = 0; g < groups; g += 1) {
    const cStart = g * chPerGroup
    const cEnd = cStart + chPerGroup
    let sum = 0
    let sumSq = 0
    for (let ch = cStart; ch < cEnd; ch += 1) {
      const base = ch * hw
      for (let i = 0; i < hw; i += 1) {
        const v = input[base + i]
        sum += v
        sumSq += v * v
      }
    }
    const mean = sum / count
    const variance = sumSq / count - mean * mean
    const invStd = 1 / Math.sqrt(variance + GN_EPS)
    for (let ch = cStart; ch < cEnd; ch += 1) {
      const base = ch * hw
      const chWeight = weight[ch]
      const chBias = bias[ch]
      for (let i = 0; i < hw; i += 1) {
        out[base + i] = (input[base + i] - mean) * invStd * chWeight + chBias
      }
    }
  }
  return out
}

function reluInPlace(x) {
  for (let i = 0; i < x.length; i += 1) if (x[i] < 0) x[i] = 0
  return x
}

function addReluInPlace(a, b) {
  for (let i = 0; i < a.length; i += 1) {
    const v = a[i] + b[i]
    a[i] = v > 0 ? v : 0
  }
  return a
}

function linear(input, inFeatures, outFeatures, weight, bias) {
  const out = new Float32Array(outFeatures)
  for (let o = 0; o < outFeatures; o += 1) {
    let sum = bias[o]
    const wBase = o * inFeatures
    for (let i = 0; i < inFeatures; i += 1) sum += input[i] * weight[wBase + i]
    out[o] = sum
  }
  return out
}

function softmax(x) {
  let max = -Infinity
  for (let i = 0; i < x.length; i += 1) if (x[i] > max) max = x[i]
  let sum = 0
  const out = new Float32Array(x.length)
  for (let i = 0; i < x.length; i += 1) {
    const e = Math.exp(x[i] - max)
    out[i] = e
    sum += e
  }
  for (let i = 0; i < out.length; i += 1) out[i] /= sum
  return out
}

export async function loadWeights(manifestUrl, binUrl) {
  const [manifest, buffer] = await Promise.all([
    fetch(manifestUrl).then((r) => r.json()),
    fetch(binUrl).then((r) => r.arrayBuffer()),
  ])
  const params = {}
  for (const t of manifest.tensors) {
    params[t.name] = new Float32Array(buffer, t.offset * 4, t.numel)
  }
  return params
}

function residualBlock(x, params, prefix) {
  let out = conv3x3(x, CHANNELS, ROWS, COLS, params[`${prefix}.conv1.weight`], params[`${prefix}.conv1.bias`], CHANNELS)
  out = groupNorm(out, CHANNELS, ROWS, COLS, 8, params[`${prefix}.norm1.weight`], params[`${prefix}.norm1.bias`])
  reluInPlace(out)
  out = conv3x3(out, CHANNELS, ROWS, COLS, params[`${prefix}.conv2.weight`], params[`${prefix}.conv2.bias`], CHANNELS)
  out = groupNorm(out, CHANNELS, ROWS, COLS, 8, params[`${prefix}.norm2.weight`], params[`${prefix}.norm2.bias`])
  return addReluInPlace(out, x)
}

// board: Float32Array(ROWS*COLS), canonical perspective (mover's own pieces = +1).
// Returns { logits: Float32Array(COLS) (raw, unmasked), value: number in [-1, 1] }.
export function forward(board, params) {
  let x = conv3x3(board, 1, ROWS, COLS, params['stem.0.weight'], params['stem.0.bias'], CHANNELS)
  x = groupNorm(x, CHANNELS, ROWS, COLS, 8, params['stem.1.weight'], params['stem.1.bias'])
  reluInPlace(x)

  for (let i = 0; i < NUM_BLOCKS; i += 1) {
    x = residualBlock(x, params, `blocks.${i}`)
  }

  let p = conv1x1(x, CHANNELS, ROWS, COLS, params['policy_head.0.weight'], params['policy_head.0.bias'], 2)
  p = groupNorm(p, 2, ROWS, COLS, 2, params['policy_head.1.weight'], params['policy_head.1.bias'])
  reluInPlace(p)
  const logits = linear(p, 2 * ROWS * COLS, COLS, params['policy_head.4.weight'], params['policy_head.4.bias'])

  let v = conv1x1(x, CHANNELS, ROWS, COLS, params['value_head.0.weight'], params['value_head.0.bias'], 1)
  v = groupNorm(v, 1, ROWS, COLS, 1, params['value_head.1.weight'], params['value_head.1.bias'])
  reluInPlace(v)
  let hidden = linear(v, ROWS * COLS, 64, params['value_head.4.weight'], params['value_head.4.bias'])
  reluInPlace(hidden)
  const valueOut = linear(hidden, 64, 1, params['value_head.6.weight'], params['value_head.6.bias'])
  const value = Math.tanh(valueOut[0])

  return { logits, value }
}

// predict_fn(board) as used by mcts.py: board -> (priors over legal columns, value).
export function predict(board, params) {
  const obs = new Float32Array(ROWS * COLS)
  const mover = board.currentPlayer
  for (let i = 0; i < obs.length; i += 1) obs[i] = board.grid[i] * mover

  const { logits, value } = forward(obs, params)
  const legal = board.legalColumns()
  const legalLogits = new Float32Array(legal.length)
  for (let i = 0; i < legal.length; i += 1) legalLogits[i] = logits[legal[i]]
  const probs = softmax(legalLogits)

  const priors = {}
  for (let i = 0; i < legal.length; i += 1) priors[legal[i]] = probs[i]
  return { priors, value }
}

export { softmax }
