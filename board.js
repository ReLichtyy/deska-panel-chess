// Canvas drawing for the board: squares, coordinates, four piece styles, and the outlines that
// show hover, the held piece, its moves and a king in check. Nothing here knows the rules.

// The list order is the menu order; Clásico is the default style (see DEFAULTS in app.js).
export const PIECE_SETS = Object.freeze({ prism: 'Prisma', trace: 'Trazo', orbit: 'Órbita', classic: 'Clásico' })

// Silhouettes on a 48-unit grid, rasterized at device resolution.
const shapes = {
  k: new Path2D('M21 3H27V9H33V15H27V21H21V15H15V9H21ZM18 22H30L34 37H14ZM10 40H38V44H10Z'),
  q: new Path2D('M8 12L16 20L18 7L24 18L30 7L32 20L40 12L35 29H13ZM16 29H32L36 37H12ZM9 40H39V44H9Z'),
  r: new Path2D('M10 6H16V12H21V6H27V12H32V6H38V19L33 23V34L37 37H11L15 34V23L10 19ZM9 40H39V44H9Z'),
  b: new Path2D('M24 5C34 13 38 18 32 24L31 28H17L16 24C10 18 14 13 24 5ZM18 28H30L34 37H14ZM10 40H38V44H10Z'),
  n: new Path2D('M14 37L17 25L10 28L8 22L20 8L22 3L29 7C38 10 39 25 34 37ZM10 40H38V44H10Z'),
  p: new Path2D('M31 13A7 7 0 1 1 17 13A7 7 0 1 1 31 13ZM20 22H28C27 29 30 34 34 37H14C18 34 21 29 20 22ZM11 40H37V44H11Z'),
}
// Trazo ("Neo caótico"), Prisma and Órbita ("Futurista") are drawn on a 64-unit grid; paintPiece scales
// them into the same 48-unit box as the other styles.
const trace = {
  k: new Path2D('M28 5Q31 1 35 5L35 12Q45 9 45 16Q44 21 35 21L35 28L27 28L27 21Q16 23 17 16Q17 11 28 12ZM23 31Q34 26 41 32Q36 40 43 47Q48 52 42 54Q29 58 18 54Q14 52 20 47Q27 42 23 31ZM16 59Q31 54 47 58L46 63L15 63Z'),
  q: new Path2D('M9 17Q6 7 13 8Q17 9 19 20L27 10Q26 0 33 2Q40 4 36 12L43 23Q44 10 50 12Q57 15 50 23L43 36Q32 42 20 36ZM23 41Q37 36 40 42L41 49Q50 57 34 57Q12 58 19 50ZM15 61Q29 56 48 60L46 64H16Z'),
  r: new Path2D('M11 10Q12 3 18 6L21 14L27 12Q24 1 33 3L37 13L44 13Q41 3 49 5L51 24Q49 29 43 30L43 46Q54 54 39 56L22 55Q13 54 19 48L21 30Q11 28 11 10ZM13 61Q30 57 48 60L49 64H13Z'),
  b: new Path2D('M29 4Q50 16 44 29Q39 38 25 37Q8 32 15 20Q21 10 29 4ZM24 41Q32 37 40 41Q33 44 42 51Q46 57 27 56Q15 57 19 50ZM15 60Q34 56 48 61L47 64H15Z'),
  n: new Path2D('M18 53Q16 40 23 32L13 34Q6 32 8 26L24 12Q20 1 28 3L33 10Q49 7 51 24Q54 41 43 52ZM14 58Q31 53 46 57Q54 64 40 64H16Z'),
  p: new Path2D('M20 18Q17 4 30 5Q45 3 44 17Q48 32 32 32Q19 34 20 18ZM27 37Q32 34 37 36Q31 45 42 51Q51 57 33 57Q14 60 21 52Q30 47 27 37ZM16 61Q32 57 48 61L45 64H17Z'),
}
const prism = {
  k: new Path2D('M27 2H37V10H45V20H37V27H27V20H19V10H27ZM24 31H40L46 46L41 54H23L18 46ZM15 58L23 54H41L49 58V63H15Z'),
  q: new Path2D('M10 15L19 24L24 6L32 21L40 6L45 24L54 15L47 34H17ZM21 38H43L48 50L42 55H22L16 50ZM15 59L22 55H42L49 59V63H15Z'),
  r: new Path2D('M12 6H22V14H28V6H36V14H42V6H52V25L45 31V50L39 55H25L19 50V31L12 25ZM14 59L25 55H39L50 59V63H14Z'),
  b: new Path2D('M32 3L47 22L42 32L32 37L22 32L17 22ZM26 40H38L45 51L40 55H24L19 51ZM16 59L24 55H40L48 59V63H16Z'),
  n: new Path2D('M20 52L24 35L14 39L8 29L24 13L26 3L35 10L44 13L50 24V45L43 53ZM15 58L22 53H43L49 58V63H15Z'),
  p: new Path2D('M32 5L44 13V26L32 34L20 26V13ZM27 38H37L44 51L39 55H25L20 51ZM17 59L25 55H39L47 59V63H17Z'),
}
const orbit = {
  k: new Path2D('M28 3H36V11H43V18H36V24H28V18H21V11H28ZM25 31Q32 27 39 31L41 47Q42 54 32 54Q22 54 23 47ZM18 58Q32 54 46 58L44 63H20Z'),
  q: new Path2D('M14 9Q20 7 23 19L29 5H35L41 19Q44 7 50 9L46 28Q32 37 18 28ZM25 38Q32 34 39 38L41 49Q40 54 32 54Q24 54 23 49ZM18 58Q32 54 46 58L44 63H20Z'),
  r: new Path2D('M15 5H24V14H29V5H35V14H40V5H49V25Q44 31 41 31L42 48Q43 54 32 54Q21 54 22 48L23 31Q18 31 15 25ZM18 58Q32 54 46 58L44 63H20Z'),
  b: new Path2D('M32 3Q47 17 43 25Q41 31 32 33Q23 31 21 25Q17 17 32 3ZM26 39Q32 36 38 39L41 49Q40 54 32 54Q24 54 23 49ZM18 58Q32 54 46 58L44 63H20Z'),
  n: new Path2D('M23 50Q22 39 27 33L17 36Q10 35 12 27L26 12L27 4L36 12Q48 13 48 29Q48 42 40 52Q30 55 23 50ZM18 58Q32 54 46 58L44 63H20Z'),
  p: new Path2D('M43 17A11 11 0 1 1 21 17A11 11 0 1 1 43 17ZM27 36Q32 33 37 36L41 49Q40 54 32 54Q24 54 23 49ZM18 58Q32 54 46 58L44 63H20Z'),
}

function strokeLine(c, points, color, width) {
  c.beginPath()
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)))
  c.strokeStyle = color
  c.lineWidth = width
  c.stroke()
}

function fillPolygon(c, points, color) {
  c.beginPath()
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)))
  c.closePath()
  c.fillStyle = color
  c.fill()
}

function strokeEllipse(c, x, y, rx, ry, color, width, rotation = 0) {
  c.beginPath()
  c.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2)
  c.strokeStyle = color
  c.lineWidth = width
  c.stroke()
}

/**
 * Paints one piece in a 48 x 48 box whose origin is the context's current transform.
 * `look` carries the accent color and the color of the square under the piece.
 */
export function paintPiece(c, set, type, white, look = {}) {
  const accent = look.accent || '#ff7a5c'
  const bg = look.bg || '#2c2d31'
  const fill = white ? '#fffdf5' : '#202725'
  const line = white ? '#29302a' : '#f3f1e8'
  c.fillStyle = fill
  c.strokeStyle = line
  c.lineJoin = 'round'
  c.lineCap = 'round'
  c.lineWidth = 1.45
  if (set === 'trace') {
    // Neo caótico, Trazo: thick curving ink, offset in the accent color.
    const path = trace[type]
    const ink = white ? '#202827' : '#e8e6dd'
    const body = white ? '#f6f1e6' : '#202827'
    c.save()
    c.scale(0.75, 0.75)
    c.save()
    c.translate(-2, 1)
    c.strokeStyle = accent
    c.lineWidth = 7
    c.stroke(path)
    c.restore()
    c.fillStyle = body
    c.strokeStyle = ink
    c.lineWidth = 3.2
    c.fill(path)
    c.stroke(path)
    c.save()
    c.clip(path)
    strokeLine(c, [[14, 48], [29, 45], [42, 48]], accent, 4)
    strokeLine(c, [[18, 61], [31, 59], [43, 60]], ink, 1.1)
    c.restore()
    if (type === 'n') {
      strokeEllipse(c, 32, 20, 2, 2, ink, 1.8)
      strokeLine(c, [[42, 18], [44, 30], [38, 40]], ink, 1.5)
    }
    if (type === 'b') strokeLine(c, [[30, 13], [35, 23]], bg, 3.3)
    if (type === 'q') strokeLine(c, [[25, 30], [32, 31], [38, 28]], ink, 1.4)
    c.restore()
  } else if (set === 'orbit') {
    // Futurista, Órbita: smooth ceramic bodies with accent rings.
    const path = orbit[type]
    const ink = white ? '#202827' : '#e8e6dd'
    const body = white ? '#f6f1e6' : '#202827'
    c.save()
    c.scale(0.75, 0.75)
    const gradient = c.createLinearGradient(16, 0, 48, 0)
    gradient.addColorStop(0, white ? '#d6dcd8' : '#111b1b')
    gradient.addColorStop(0.38, white ? '#ffffff' : '#435353')
    gradient.addColorStop(0.7, body)
    gradient.addColorStop(1, white ? '#d2d8d3' : '#151f1f')
    c.fillStyle = gradient
    c.strokeStyle = ink
    c.lineWidth = 1.5
    c.fill(path)
    c.stroke(path)
    strokeEllipse(c, 32, 55.5, 20, 3.5, accent, 1.8)
    strokeEllipse(c, 32, 33.5, type === 'r' ? 18 : 15, 3, accent, 1.4, -0.08)
    strokeLine(c, [[27, 43], [27, 48]], white ? '#ffffff' : '#96a7a4', 1.3)
    if (type === 'n') {
      strokeEllipse(c, 32, 21, 2.5, 1.3, accent, 1.5)
      strokeLine(c, [[39, 19], [42, 27], [37, 41]], ink, 1)
    }
    if (type === 'b') strokeLine(c, [[30, 13], [36, 22]], accent, 1.8)
    if (type === 'p') strokeEllipse(c, 32, 17, 14, 3, accent, 1.4, -0.3)
    if (type === 'k') strokeLine(c, [[29, 14], [35, 14]], accent, 1.7)
    c.restore()
  } else if (set === 'prism') {
    // Futurista, Prisma: faceted volumes with a drop shadow and accent cores.
    const path = prism[type]
    const ink = white ? '#202827' : '#e8e6dd'
    const body = white ? '#f6f1e6' : '#202827'
    c.save()
    c.scale(0.75, 0.75)
    c.save()
    c.translate(3, 2)
    c.fillStyle = 'rgba(0, 0, 0, 0.32)'
    c.fill(path)
    c.restore()
    c.fillStyle = body
    c.strokeStyle = ink
    c.lineWidth = 1.3
    c.fill(path)
    c.stroke(path)
    c.save()
    c.clip(path)
    fillPolygon(c, [[32, 0], [61, 26], [40, 64], [32, 64]], white ? '#d5d8d4' : '#354342')
    fillPolygon(c, [[17, 49], [32, 33], [48, 49], [32, 55]], white ? '#e5e6df' : '#283332')
    strokeLine(c, [[32, 36], [32, 52]], accent, 2.6)
    strokeLine(c, [[16, 60], [48, 60]], accent, 1.7)
    strokeLine(c, [[32, 38], [23, 51], [32, 55], [41, 51], [32, 38]], ink, 0.8)
    c.restore()
    if (type === 'n') fillPolygon(c, [[23, 22], [36, 19], [32, 24], [24, 25]], accent)
    if (type === 'b') strokeLine(c, [[31, 11], [37, 20]], accent, 1.8)
    if (type === 'p') strokeLine(c, [[24, 18], [40, 18]], accent, 2.4)
    if (type === 'k') fillPolygon(c, [[29, 11], [35, 11], [35, 17], [29, 17]], accent)
    c.restore()
  } else {
    c.fill(shapes[type])
    c.stroke(shapes[type])
    c.lineWidth = 1.4
    if (type === 'b') {
      c.beginPath(); c.moveTo(23, 12); c.lineTo(29, 18); c.stroke()
    }
    if (type === 'n') {
      c.fillStyle = c.strokeStyle
      c.beginPath(); c.arc(23, 14, 1.4, 0, Math.PI * 2); c.fill()
      c.beginPath(); c.moveTo(28, 12); c.quadraticCurveTo(35, 21, 29, 33); c.stroke()
    }
  }
}

/** Two samples on a 96 x 48 canvas: pairs of [type, white]. */
export function drawPreview(target, set, pieces = [['n', true], ['n', false]], look = {}) {
  const c = target.getContext('2d')
  c.clearRect(0, 0, target.width, target.height)
  const offset = (target.width - pieces.length * 48) / 2
  pieces.forEach(([type, white], i) => {
    c.save()
    c.translate(offset + i * 48, 0)
    paintPiece(c, set, type, white, look)
    c.restore()
  })
}

// Antagonist color: the square's opposite hue, pushed to a lightness that keeps 3.5:1 contrast
// against it, so an outline reads on any palette.
const antagonistCache = new Map()
export function antagonist(hex) {
  if (antagonistCache.has(hex)) return antagonistCache.get(hex)
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const lin = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  const lum = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2])
  const contrast = (a, c) => (Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  if (max !== min) {
    const d = max - min
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  }
  h = (h * 60 + 180 + 360) % 360
  const hsl = (l) => {
    const sat = 0.9
    const c = (1 - Math.abs(2 * l - 1)) * sat
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
    const m = l - c / 2
    const [rr, gg, bb] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
    return [rr + m, gg + m, bb + m]
  }
  const bg = lum([r, g, b])
  let best = null
  let bestScore = -1
  for (let l = 0.1; l <= 0.9; l += 0.05) {
    const rgb = hsl(l)
    if (contrast(lum(rgb), bg) >= 3.5 && 1 - Math.abs(l - 0.5) > bestScore) { best = rgb; bestScore = 1 - Math.abs(l - 0.5) }
  }
  if (!best) best = bg > 0.4 ? [0.07, 0.07, 0.07] : [0.97, 0.97, 0.97]
  const out = `#${best.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`
  antagonistCache.set(hex, out)
  return out
}

export function createBoard(canvas) {
  const ctx = canvas.getContext('2d')
  const view = { w: 0, h: 0, dpr: 1, cell: 0, size: 0, x: 0, y: 0 }

  function resize() {
    const rect = canvas.getBoundingClientRect()
    view.dpr = window.devicePixelRatio || 1
    view.w = Math.max(1, Math.round(rect.width))
    view.h = Math.max(1, Math.round(rect.height))
    canvas.width = Math.round(view.w * view.dpr)
    canvas.height = Math.round(view.h * view.dpr)
    // The board takes all the room there is: a thin edge on the sides and the bottom, and it sits
    // against the top of the canvas. Coordinates are drawn inside the squares, so they need no gutter.
    const side = 6
    const top = 4
    const bottom = 6
    // Square edges stay on physical pixels even at fractional display scaling.
    const room = Math.min(view.w - side * 2, view.h - top - bottom)
    view.cell = Math.max(1, Math.floor((room * view.dpr) / 8) / view.dpr)
    view.size = view.cell * 8
    view.x = Math.round(((view.w - view.size) * view.dpr) / 2) / view.dpr
    view.y = top
  }

  const toPx = (f, r, flipped) => ({
    x: view.x + (flipped ? 7 - f : f) * view.cell,
    y: view.y + (flipped ? r : 7 - r) * view.cell,
  })

  /** Board square under a point in CSS pixels relative to the canvas, or null. */
  function squareAt(px, py, flipped) {
    const col = Math.floor((px - view.x) / view.cell)
    const row = Math.floor((py - view.y) / view.cell)
    if (col < 0 || col > 7 || row < 0 || row > 7) return null
    return flipped ? { f: 7 - col, r: row } : { f: col, r: 7 - row }
  }

  function outline(f, r, flipped, color, width, alpha) {
    const { x, y } = toPx(f, r, flipped)
    const inset = width / 2 + 1
    const side = view.cell - inset * 2
    const rad = view.cell * 0.12
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.beginPath()
    ctx.moveTo(x + inset + rad, y + inset)
    ctx.arcTo(x + inset + side, y + inset, x + inset + side, y + inset + side, rad)
    ctx.arcTo(x + inset + side, y + inset + side, x + inset, y + inset + side, rad)
    ctx.arcTo(x + inset, y + inset + side, x + inset, y + inset, rad)
    ctx.arcTo(x + inset, y + inset, x + inset + side, y + inset, rad)
    ctx.closePath()
    ctx.stroke()
    ctx.restore()
  }

  /**
   * model: { game, flipped, selected, moves, hover, colors: { bg, label, light, dark, danger, font },
   *          pieceSet, coordinates, pulse }   (pulse is 0..1, 1 when motion is off)
   */
  function draw(model) {
    const { game, flipped, colors } = model
    const squareFill = (f, r) => ((f + r) % 2 === 0 ? colors.dark : colors.light)
    const markColor = (f, r) => antagonist(squareFill(f, r))
    const lineWidth = Math.max(3, view.cell * 0.06)

    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0)
    ctx.fillStyle = colors.bg
    ctx.fillRect(0, 0, view.w, view.h)
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const { x, y } = toPx(f, r, flipped)
        ctx.fillStyle = squareFill(f, r)
        ctx.fillRect(x, y, view.cell, view.cell)
      }
    }

    // Coordinates sit inside the edge squares, in the color of the opposite square so they read on both.
    if (model.coordinates) {
      const fs = Math.max(9, Math.min(14, Math.round(view.cell * 0.2)))
      const pad = Math.max(2, view.cell * 0.06)
      ctx.font = `700 ${fs}px ${colors.font}`
      ctx.textBaseline = 'alphabetic'
      for (let i = 0; i < 8; i++) {
        const file = flipped ? 7 - i : i
        const bottomRank = flipped ? 7 : 0
        ctx.fillStyle = (file + bottomRank) % 2 === 0 ? colors.light : colors.dark
        ctx.textAlign = 'right'
        ctx.fillText('abcdefgh'[file], view.x + (i + 1) * view.cell - pad, view.y + view.size - pad)
        const rank = flipped ? i : 7 - i
        const leftFile = flipped ? 7 : 0
        ctx.fillStyle = (leftFile + rank) % 2 === 0 ? colors.light : colors.dark
        ctx.textAlign = 'left'
        ctx.fillText(String(rank + 1), view.x + pad, view.y + i * view.cell + pad + fs * 0.8)
      }
    }

    // The held piece's square carries a background, drawn under the pieces.
    if (model.selected) {
      const { f, r } = model.selected
      const { x, y } = toPx(f, r, flipped)
      ctx.save()
      ctx.globalAlpha = 0.32
      ctx.fillStyle = markColor(f, r)
      ctx.fillRect(x, y, view.cell, view.cell)
      ctx.restore()
    }

    const scale = (view.cell * 0.82) / 48
    const putPiece = (piece, x, y, bg) => {
      ctx.save()
      ctx.translate(x + view.cell / 2 - 24 * scale, y + view.cell / 2 - 24 * scale)
      ctx.scale(scale, scale)
      paintPiece(ctx, model.pieceSet, piece.type, piece.color === 'w', { accent: colors.accent, bg })
      ctx.restore()
    }
    // Pieces that are sliding are drawn last, between their old and new squares.
    const sliding = model.slide ? model.slide.moves : []
    const isSliding = (f, r) => sliding.some((m) => m.to.f === f && m.to.r === r)
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const piece = game.board[r][f]
        if (!piece || isSliding(f, r)) continue
        const { x, y } = toPx(f, r, flipped)
        const held = model.selected && model.selected.f === f && model.selected.r === r
        if (held && model.lift > 0) {
          // A soft shadow and a small rise: the piece is in the hand.
          ctx.save()
          ctx.globalAlpha = 0.22 * model.lift
          ctx.fillStyle = '#000'
          ctx.beginPath()
          ctx.ellipse(x + view.cell / 2, y + view.cell * 0.84, view.cell * 0.3, view.cell * 0.07, 0, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
          putPiece(piece, x, y - view.cell * 0.07 * model.lift, squareFill(f, r))
        } else {
          putPiece(piece, x, y, squareFill(f, r))
        }
      }
    }
    for (const m of sliding) {
      const piece = game.board[m.to.r][m.to.f]
      if (!piece) continue
      const from = toPx(m.from.f, m.from.r, flipped)
      const to = toPx(m.to.f, m.to.r, flipped)
      const t = model.slide.t
      putPiece(piece, from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, squareFill(m.to.f, m.to.r))
    }

    if (model.hint) {
      const from = toPx(model.hint.from.f, model.hint.from.r, flipped)
      const to = toPx(model.hint.to.f, model.hint.to.r, flipped)
      const x1 = from.x + view.cell / 2
      const y1 = from.y + view.cell / 2
      const x2 = to.x + view.cell / 2
      const y2 = to.y + view.cell / 2
      const angle = Math.atan2(y2 - y1, x2 - x1)
      const head = view.cell * 0.3
      const stop = view.cell * 0.12 // the line ends inside the arrow head
      const lx = x2 - Math.cos(angle) * (head - stop)
      const ly = y2 - Math.sin(angle) * (head - stop)
      for (const [style, extra] of [['rgba(0,0,0,0.4)', 0.05], [colors.success, 0]]) {
        ctx.save()
        ctx.globalAlpha = style === colors.success ? 0.92 : 1
        ctx.strokeStyle = style
        ctx.fillStyle = style
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.lineWidth = view.cell * (0.1 + extra)
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(lx, ly)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(x2, y2)
        ctx.lineTo(x2 - Math.cos(angle - 0.5) * head, y2 - Math.sin(angle - 0.5) * head)
        ctx.lineTo(x2 - Math.cos(angle + 0.5) * head, y2 - Math.sin(angle + 0.5) * head)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
        ctx.restore()
      }
      outline(model.hint.from.f, model.hint.from.r, flipped, colors.success, lineWidth, 1)
    }
    const a = model.pulse
    if (game.status === 'check' || game.status === 'checkmate') {
      outline(game.king.f, game.king.r, flipped, colors.danger, lineWidth, 0.5 + 0.5 * a)
    }
    for (const m of model.moves) {
      if (m.capture) {
        outline(m.f, m.r, flipped, colors.danger, lineWidth, 0.55 + 0.45 * a)
        continue
      }
      const { x, y } = toPx(m.f, m.r, flipped)
      ctx.save()
      ctx.globalAlpha = 0.45 + 0.4 * a
      ctx.fillStyle = markColor(m.f, m.r)
      ctx.beginPath()
      ctx.arc(x + view.cell / 2, y + view.cell / 2, view.cell * 0.11, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
    // Hover alone is steady; a held square blinks.
    const { selected, hover } = model
    if (hover && !(selected && selected.f === hover.f && selected.r === hover.r)) {
      outline(hover.f, hover.r, flipped, markColor(hover.f, hover.r), lineWidth, 1)
    }
    if (selected) outline(selected.f, selected.r, flipped, markColor(selected.f, selected.r), lineWidth, 0.35 + 0.65 * a)
  }

  return { resize, draw, squareAt, view }
}
