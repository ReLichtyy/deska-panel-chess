// A small chess engine for the bot. A panel cannot run Stockfish: Deska's policy is
// worker-src 'none' and allows no WebAssembly, so the search runs on the page's own thread.
// It is a plain alpha-beta search (quiescence, captures first, check extension) over a flat
// board. Weaker levels search less deep and add noise to each move's score, so they sometimes
// pick a worse move. The strength numbers are approximate, not measured Elo.

const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6
const VALUE = [0, 100, 320, 330, 500, 900, 0]
const KNIGHT_D = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]
const KING_D = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]]
const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const INF = 1e6
const MATE = 100000
const TIMEOUT = Symbol('timeout')

// Move = from | to << 6 | flags << 12
const F_DOUBLE = 1, F_EP = 2, F_CASTLE_K = 4, F_CASTLE_Q = 8, F_PROMO = 16
// Castling rights bits: white king side, white queen side, black king side, black queen side.
const CASTLE_MASK = new Int8Array(64).fill(15)
CASTLE_MASK[4] = 15 & ~3; CASTLE_MASK[0] = 15 & ~2; CASTLE_MASK[7] = 15 & ~1
CASTLE_MASK[60] = 15 & ~12; CASTLE_MASK[56] = 15 & ~8; CASTLE_MASK[63] = 15 & ~4

const LETTERS = { p: P, n: N, b: B, r: R, q: Q, k: K }

class Position {
  constructor(fen) {
    const parts = fen.trim().split(/\s+/)
    this.b = new Int8Array(64)
    this.kings = [0, 0] // index 0 white, 1 black
    parts[0].split('/').forEach((row, i) => {
      let f = 0
      for (const ch of row) {
        if (/[1-8]/.test(ch)) { f += Number(ch); continue }
        const type = LETTERS[ch.toLowerCase()]
        const sq = (7 - i) * 8 + f++
        const white = ch === ch.toUpperCase()
        this.b[sq] = white ? type : -type
        if (type === K) this.kings[white ? 0 : 1] = sq
      }
    })
    this.side = parts[1] === 'w' ? 1 : -1
    const rights = parts[2] || '-'
    this.castle = (rights.includes('K') ? 1 : 0) | (rights.includes('Q') ? 2 : 0) | (rights.includes('k') ? 4 : 0) | (rights.includes('q') ? 8 : 0)
    this.ep = !parts[3] || parts[3] === '-' ? -1 : (Number(parts[3][1]) - 1) * 8 + 'abcdefgh'.indexOf(parts[3][0])
    this.undo = []
  }

  kingSquare(side) { return this.kings[side === 1 ? 0 : 1] }

  /** Is `sq` attacked by `by` (1 white, -1 black)? */
  attacked(sq, by) {
    const b = this.b
    const f = sq & 7
    const r = sq >> 3
    const pr = r - by
    if (pr >= 0 && pr < 8) {
      if (f > 0 && b[pr * 8 + f - 1] === by * P) return true
      if (f < 7 && b[pr * 8 + f + 1] === by * P) return true
    }
    for (const [df, dr] of KNIGHT_D) {
      const x = f + df, y = r + dr
      if (x >= 0 && x < 8 && y >= 0 && y < 8 && b[y * 8 + x] === by * N) return true
    }
    for (const [df, dr] of KING_D) {
      const x = f + df, y = r + dr
      if (x >= 0 && x < 8 && y >= 0 && y < 8 && b[y * 8 + x] === by * K) return true
    }
    for (const [dirs, slider] of [[DIAG, B], [ORTHO, R]]) {
      for (const [df, dr] of dirs) {
        let x = f + df, y = r + dr
        while (x >= 0 && x < 8 && y >= 0 && y < 8) {
          const v = b[y * 8 + x]
          if (v !== 0) {
            if (v === by * slider || v === by * Q) return true
            break
          }
          x += df; y += dr
        }
      }
    }
    return false
  }

  inCheck(side) { return this.attacked(this.kingSquare(side), -side) }

  /** Pseudo-legal moves; with `captures` only captures and promotions. */
  gen(captures = false) {
    const out = []
    const b = this.b
    const side = this.side
    for (let sq = 0; sq < 64; sq++) {
      const piece = b[sq] * side
      if (piece <= 0) continue
      const f = sq & 7
      const r = sq >> 3
      if (piece === P) {
        const lastBefore = side === 1 ? 6 : 1
        const start = side === 1 ? 1 : 6
        const t = sq + 8 * side
        const promo = r === lastBefore ? F_PROMO : 0
        if (b[t] === 0) {
          if (!captures || promo) out.push(sq | (t << 6) | (promo << 12))
          if (!captures && r === start && b[t + 8 * side] === 0) out.push(sq | ((t + 8 * side) << 6) | (F_DOUBLE << 12))
        }
        for (const df of [-1, 1]) {
          const nf = f + df
          if (nf < 0 || nf > 7) continue
          const c = t + df
          if (b[c] * side < 0) out.push(sq | (c << 6) | (promo << 12))
          else if (c === this.ep) out.push(sq | (c << 6) | (F_EP << 12))
        }
      } else if (piece === N || piece === K) {
        for (const [df, dr] of piece === N ? KNIGHT_D : KING_D) {
          const x = f + df, y = r + dr
          if (x < 0 || x > 7 || y < 0 || y > 7) continue
          const t = y * 8 + x
          const v = b[t] * side
          if (v > 0) continue
          if (captures && v === 0) continue
          out.push(sq | (t << 6))
        }
        if (piece === K && !captures) {
          const base = side === 1 ? 0 : 56
          if (sq === base + 4 && !this.attacked(sq, -side)) {
            const kingSide = side === 1 ? 1 : 4
            const queenSide = side === 1 ? 2 : 8
            if ((this.castle & kingSide) && b[base + 5] === 0 && b[base + 6] === 0 && b[base + 7] === side * R
              && !this.attacked(base + 5, -side) && !this.attacked(base + 6, -side)) out.push(sq | ((base + 6) << 6) | (F_CASTLE_K << 12))
            if ((this.castle & queenSide) && b[base + 1] === 0 && b[base + 2] === 0 && b[base + 3] === 0 && b[base] === side * R
              && !this.attacked(base + 3, -side) && !this.attacked(base + 2, -side)) out.push(sq | ((base + 2) << 6) | (F_CASTLE_Q << 12))
          }
        }
      } else {
        const dirs = piece === B ? DIAG : piece === R ? ORTHO : DIAG.concat(ORTHO)
        for (const [df, dr] of dirs) {
          let x = f + df, y = r + dr
          while (x >= 0 && x < 8 && y >= 0 && y < 8) {
            const t = y * 8 + x
            const v = b[t] * side
            if (v > 0) break
            if (v < 0) { out.push(sq | (t << 6)); break }
            if (!captures) out.push(sq | (t << 6))
            x += df; y += dr
          }
        }
      }
    }
    return out
  }

  make(m) {
    const b = this.b
    const side = this.side
    const from = m & 63
    const to = (m >> 6) & 63
    const flags = m >> 12
    const piece = b[from]
    let captured = b[to]
    this.undo.push({ m, captured, castle: this.castle, ep: this.ep })
    b[from] = 0
    if (flags & F_EP) { captured = b[to - 8 * side]; b[to - 8 * side] = 0; this.undo[this.undo.length - 1].captured = captured }
    b[to] = flags & F_PROMO ? side * Q : piece
    if (flags & F_CASTLE_K) { b[to - 1] = b[to + 1]; b[to + 1] = 0 }
    if (flags & F_CASTLE_Q) { b[to + 1] = b[to - 2]; b[to - 2] = 0 }
    if (piece === side * K) this.kings[side === 1 ? 0 : 1] = to
    this.castle &= CASTLE_MASK[from] & CASTLE_MASK[to]
    this.ep = flags & F_DOUBLE ? from + 8 * side : -1
    this.side = -side
  }

  unmake() {
    const u = this.undo.pop()
    const b = this.b
    this.side = -this.side
    const side = this.side
    const from = u.m & 63
    const to = (u.m >> 6) & 63
    const flags = u.m >> 12
    const moved = flags & F_PROMO ? side * P : b[to]
    b[from] = moved
    if (flags & F_EP) { b[to] = 0; b[to - 8 * side] = u.captured } else b[to] = u.captured
    if (flags & F_CASTLE_K) { b[to + 1] = b[to - 1]; b[to - 1] = 0 }
    if (flags & F_CASTLE_Q) { b[to - 2] = b[to + 1]; b[to + 1] = 0 }
    if (moved === side * K) this.kings[side === 1 ? 0 : 1] = from
    this.castle = u.castle
    this.ep = u.ep
  }

  /** Legal moves only (each one is made and unmade to test king safety). */
  legalMoves() {
    const out = []
    for (const m of this.gen()) {
      const mover = this.side
      this.make(m)
      if (!this.inCheck(mover)) out.push(m)
      this.unmake()
    }
    return out
  }
}

// Evaluation -----------------------------------------------------------------------------

/** Score from the side to move's point of view, in centipawns. */
function evaluate(pos) {
  const b = pos.b
  let score = 0
  let material = 0
  for (let sq = 0; sq < 64; sq++) {
    const v = b[sq]
    if (v === 0) continue
    const type = Math.abs(v)
    if (type !== P && type !== K) material += VALUE[type]
  }
  const endgame = material < 2600
  for (let sq = 0; sq < 64; sq++) {
    const v = b[sq]
    if (v === 0) continue
    const white = v > 0
    const type = Math.abs(v)
    const f = sq & 7
    const r = white ? sq >> 3 : 7 - (sq >> 3) // rank from the owner's side
    const center = Math.abs(f - 3.5) + Math.abs((sq >> 3) - 3.5) // 1 in the middle, 7 in a corner
    let s = VALUE[type]
    if (type === P) s += r * 6 + (r >= 2 && (f === 3 || f === 4) ? 12 : 0) + (r >= 5 ? r * 8 : 0)
    else if (type === N || type === B) s += 22 - center * 6
    else if (type === R) s += (r === 6 ? 14 : 0) + (f === 3 || f === 4 ? 4 : 0)
    else if (type === Q) s += endgame ? 0 : 6 - center
    else s += endgame ? 20 - center * 5 : (r === 0 ? 14 : -r * 14) + (r === 0 && (f <= 2 || f >= 6) ? 16 : 0)
    score += white ? s : -s
  }
  return pos.side === 1 ? score : -score
}

// Search -----------------------------------------------------------------------------------

function orderScore(pos, m) {
  const to = (m >> 6) & 63
  const victim = Math.abs(pos.b[to])
  let s = 0
  if (victim) s += 10 * VALUE[victim] - VALUE[Math.abs(pos.b[m & 63])] + 10000
  if ((m >> 12) & F_PROMO) s += 9000
  if ((m >> 12) & F_EP) s += 10000
  return s
}

function sorted(pos, moves) {
  return moves.map((m) => [orderScore(pos, m), m]).sort((a, b) => b[0] - a[0]).map((x) => x[1])
}

function quiesce(pos, ctx, alpha, beta, ply) {
  tick(ctx)
  const stand = evaluate(pos)
  if (ply > 14 || stand >= beta) return stand
  if (stand > alpha) alpha = stand
  for (const m of sorted(pos, pos.gen(true))) {
    const mover = pos.side
    pos.make(m)
    if (pos.inCheck(mover)) { pos.unmake(); continue }
    const score = -quiesce(pos, ctx, -beta, -alpha, ply + 1)
    pos.unmake()
    if (score >= beta) return score
    if (score > alpha) alpha = score
  }
  return alpha
}

function search(pos, ctx, depth, alpha, beta, ply) {
  tick(ctx)
  const inCheck = pos.inCheck(pos.side)
  if (inCheck && ply < 10) depth++
  if (depth <= 0) return quiesce(pos, ctx, alpha, beta, ply)
  let legal = 0
  let best = -INF
  for (const m of sorted(pos, pos.gen())) {
    const mover = pos.side
    pos.make(m)
    if (pos.inCheck(mover)) { pos.unmake(); continue }
    legal++
    const score = -search(pos, ctx, depth - 1, -beta, -alpha, ply + 1)
    pos.unmake()
    if (score > best) best = score
    if (score > alpha) alpha = score
    if (alpha >= beta) break
  }
  if (legal === 0) return inCheck ? -MATE + ply : 0
  return best
}

function tick(ctx) {
  if ((++ctx.nodes & 1023) === 0 && performance.now() > ctx.deadline) throw TIMEOUT
}

// Public API -------------------------------------------------------------------------------

const squareText = (sq) => 'abcdefgh'[sq & 7] + ((sq >> 3) + 1)
const toUci = (m) => squareText(m & 63) + squareText((m >> 6) & 63) + (((m >> 12) & F_PROMO) ? 'q' : '')
const yieldToPage = () => new Promise((resolve) => setTimeout(resolve, 0))
const gaussian = (rng) => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng())

/** What a rating asks of the search: depth, time, and how much noise blurs each score. */
export function profileFor(rating) {
  const elo = Math.max(400, Math.min(2000, rating))
  const noise = elo >= 1800 ? 0 : Math.round(300 * ((1800 - elo) / 1400) ** 1.3)
  const depth = elo < 700 ? 1 : elo < 1100 ? 2 : elo < 1500 ? 3 : elo < 1900 ? 4 : 5
  return { depth, noise, timeMs: elo >= 1900 ? 2800 : 1500 }
}

/**
 * Picks a move for the side to move in `fen`. Resolves to a UCI string, or null when the
 * side has no legal move. The search yields to the page between root moves.
 */
export async function chooseMove(fen, { depth = 3, timeMs = 1500, noise = 0, rng = Math.random } = {}) {
  const pos = new Position(fen)
  const root = pos.legalMoves()
  if (root.length === 0) return null
  if (root.length === 1) return toUci(root[0])

  const ctx = { nodes: 0, deadline: performance.now() + timeMs }
  let ordered = sorted(pos, root)
  let results = null // [{ m, score }] of the last depth that finished
  for (let d = 1; d <= depth; d++) {
    const current = []
    let best = -INF
    try {
      for (const m of ordered) {
        await yieldToPage()
        pos.make(m)
        // With noise every move needs a true score; without it, a narrowed window is enough.
        const score = -search(pos, ctx, d - 1, -INF, noise ? INF : -best, 1)
        pos.unmake()
        current.push({ m, score })
        if (score > best) best = score
      }
    } catch (error) {
      if (error !== TIMEOUT) throw error
      while (pos.undo.length) pos.unmake()
      break
    }
    results = current
    ordered = current.slice().sort((a, b) => b.score - a.score).map((x) => x.m)
    if (best > MATE - 100) break
  }
  if (!results) return toUci(ordered[0])

  let pick = results[0]
  let pickScore = -INF
  for (const entry of results) {
    const blurred = Math.abs(entry.score) > MATE - 200 ? entry.score : entry.score + (noise ? gaussian(rng) * noise : 0)
    if (blurred > pickScore) { pick = entry; pickScore = blurred }
  }
  return toUci(pick.m)
}

/** Leaf count after `depth` plies, for checking the move generator. */
export function perft(fen, depth) {
  const pos = new Position(fen)
  const walk = (d) => {
    if (d === 0) return 1
    let total = 0
    for (const m of pos.legalMoves()) {
      if (d === 1) { total++; continue }
      pos.make(m)
      total += walk(d - 1)
      pos.unmake()
    }
    return total
  }
  return walk(depth)
}
