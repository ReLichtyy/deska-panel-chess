/* Chess: a board on a canvas, a bot you tune, and a side you pick at the start.
 *
 * What this panel teaches:
 * - A game that survives a reload: the position is stored as a FEN after every move and the
 *   chosen side next to it, so a panel moved to a dock comes back where it was.
 * - Settings in deska.storage with a defaults-per-key read, so an older save never breaks a newer
 *   panel, and a failed save is said out loud.
 * - Heavy work with no workers: the bot's search runs on the page and yields between moves.
 * - A canvas that follows Deska's theme tokens, redraws on a theme change, and stops its
 *   animation frames while the panel is hidden or the person prefers reduced motion. */

import { createBoard, drawPreview, PIECE_SETS } from './board.js'
import { chooseMove, profileFor } from './engine.js'
import { fromFEN, isOver, legalMoves, moveFromUci, newGame, other, play, squareName, toFEN } from './rules.js'

const $ = (id) => document.getElementById(id)
const reduced = matchMedia('(prefers-reduced-motion: reduce)')
const SLIDE_MS = 220
const LIFT_MS = 140
// The bot waits a little, a different amount each time, so its answer feels like a person's.
const botDelay = () => 650 + Math.random() * 600

const DEFAULTS = Object.freeze({ palette: 'app', pieceSet: 'classic', coordinates: true, botEnabled: true, botRating: 1200 })
const PALETTES = {
  ocean: { light: '#dce5e8', dark: '#537d91' },
  walnut: { light: '#eed9b7', dark: '#926d50' },
  slate: { light: '#d9dce0', dark: '#69727e' },
}

let settings = { ...DEFAULTS }
let game = newGame()
let side = 'w' // the person's color; the view and the bot follow it
let phase = 'choose' // choose | play | over
let selected = null
let moves = []
let hover = null
let thinking = false
let botToken = 0
let dirty = true
let games = [game] // the position after each ply, from the start
let ucis = [] // the move between each pair of positions, as UCI text
let cursor = 0 // which of `games` is on the board
let hint = null // { from, to } while a suggestion is on the board
let hintBusy = false
let hintToken = 0
let resultDismissed = false
let slide = null // { moves: [{ from, to }], start } while a move is sliding
let selectedAt = 0
let visible = true
let frame = 0
let openSheet = null
let colors = readColors()

const board = createBoard($('board'))

document.documentElement.classList.add('no-transitions')
const init = await deska.ready()
document.documentElement.classList.remove('no-transitions')

// Storage ---------------------------------------------------------------------------------

async function loadSettings() {
  try {
    const stored = await deska.storage.get('settings')
    const out = { ...DEFAULTS }
    if (stored && typeof stored === 'object') {
      if (stored.palette === 'app' || stored.palette in PALETTES) out.palette = stored.palette
      if (stored.pieceSet in PIECE_SETS) out.pieceSet = stored.pieceSet
      if (typeof stored.coordinates === 'boolean') out.coordinates = stored.coordinates
      if (typeof stored.botEnabled === 'boolean') out.botEnabled = stored.botEnabled
      if (Number.isInteger(stored.botRating) && stored.botRating >= 400 && stored.botRating <= 2000) out.botRating = stored.botRating
    }
    return out
  } catch (err) {
    showStatus(`No se pudieron leer tus ajustes. ${problemText(err)}`, 'error')
    return { ...DEFAULTS }
  }
}

async function loadGame() {
  let stored
  try {
    stored = await deska.storage.get('game')
  } catch (err) {
    showStatus(`No se pudo leer la partida. ${problemText(err)}`, 'error')
    return null
  }
  if (!stored || (stored.side !== 'w' && stored.side !== 'b')) return null
  try {
    // Older saves kept only the position (`fen`); newer ones keep the start and every move.
    const first = fromFEN(typeof stored.start === 'string' ? stored.start : stored.fen)
    const list = [first]
    const played = []
    for (const uci of Array.isArray(stored.moves) ? stored.moves : []) {
      const found = moveFromUci(list[list.length - 1], uci)
      if (!found) throw new Error(`Saved move ${uci} is not legal.`)
      list.push(play(list[list.length - 1], found.from, found.move))
      played.push(uci)
    }
    const at = Number.isInteger(stored.cursor) && stored.cursor >= 0 && stored.cursor < list.length ? stored.cursor : list.length - 1
    return { side: stored.side, games: list, ucis: played, cursor: at }
  } catch (err) {
    console.warn('Chess: the saved game could not be restored.', err)
    showStatus('No se pudo restaurar la partida guardada. Empieza una nueva.', 'error')
    return null
  }
}

async function save(key, value) {
  try {
    await deska.storage.set(key, value)
  } catch (err) {
    showStatus(`No se guardó. ${problemText(err)}`, 'error')
  }
}

const saveSettings = () => save('settings', settings)
const saveGame = () => save('game', { v: 2, side, start: toFEN(games[0]), moves: ucis, cursor })

function problemText(err) {
  const messages = {
    storage_full: 'El almacenamiento está lleno.',
    rate_limited: 'Demasiadas peticiones seguidas. Inténtalo en un momento.',
  }
  return (err && messages[err.code]) || `(${(err && err.code) || 'error desconocido'})`
}

let statusTimer = 0
function showStatus(text, kind = '') {
  const el = $('status')
  clearTimeout(statusTimer)
  el.textContent = text
  el.className = `status${kind ? ` is-${kind}` : ''}`
  if (text && kind !== 'error') statusTimer = setTimeout(() => showStatus(''), 2400)
}

// Colors and drawing ------------------------------------------------------------------------

function readColors() {
  const css = getComputedStyle(document.documentElement)
  const token = (name, fallback) => css.getPropertyValue(name).trim() || fallback
  const accent = token('--deska-accent', '#ff7a5c')
  return {
    bg: token('--deska-bg', '#15171a'),
    label: token('--deska-text-secondary', '#979a9d'),
    danger: token('--deska-danger', '#e2604a'),
    success: token('--deska-success', '#34c77b'),
    font: token('--deska-font-ui', 'system-ui, sans-serif'),
    accent,
  }
}

function boardColors() {
  if (settings.palette === 'app') {
    // The app palette is the accent on dark squares and a pale tint of it on light squares.
    return { dark: colors.accent, light: tint(colors.accent, 0.86) }
  }
  return PALETTES[settings.palette]
}

function tint(hex, amount) {
  if (!/^#[\da-f]{6}$/i.test(hex)) return '#f7e9e3'
  const channel = (i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - amount) + 255 * amount)
  return `#${[1, 3, 5].map((i) => channel(i).toString(16).padStart(2, '0')).join('')}`
}

function pulse(now) {
  return reduced.matches ? 1 : 0.625 + 0.375 * Math.sin((now / 1000) * Math.PI * 2 * 1.2)
}

const ease = (t) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3

function paint(now = performance.now()) {
  if (slide && now - slide.start >= SLIDE_MS) slide = null
  board.draw({
    game,
    flipped: side === 'b',
    selected,
    moves,
    hover,
    colors: { ...colors, ...boardColors() },
    pieceSet: settings.pieceSet,
    coordinates: settings.coordinates,
    pulse: pulse(now),
    hint,
    slide: slide ? { moves: slide.moves, t: ease((now - slide.start) / SLIDE_MS) } : null,
    lift: selected ? (reduced.matches ? 1 : ease((now - selectedAt) / LIFT_MS)) : 0,
  })
  dirty = false
}

// One loop, only while the panel can be seen. It repaints for the blink of a held piece and
// for anything marked dirty, and sleeps otherwise.
function schedule() {
  if (frame || !visible) return
  frame = requestAnimationFrame(tick)
}

// The loop keeps going only while something moves: a held piece blinking and lifting, or a slide.
function tick(now) {
  frame = 0
  if (!visible) return
  paint(now)
  if (slide || (selected && !reduced.matches)) schedule()
}

const redraw = () => { dirty = true; schedule() }

deska.on('visibility', (state) => {
  visible = state.visible
  if (visible) { board.resize(); redraw() } else { cancelAnimationFrame(frame); frame = 0 }
})
deska.on('theme', () => {
  document.documentElement.classList.add('no-transitions')
  requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove('no-transitions')))
  colors = readColors()
  syncSettingsUi()
  redraw()
})
new ResizeObserver(() => { board.resize(); redraw() }).observe($('board'))
reduced.addEventListener('change', redraw)

// Game flow ----------------------------------------------------------------------------------

function startGame(choice) {
  side = choice === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : choice
  game = newGame()
  games = [game]
  ucis = []
  cursor = 0
  phase = 'play'
  slide = null
  botToken++
  thinking = false
  clearHint()
  resultDismissed = false
  clearSelection()
  closeDrawer()
  showPhase()
  announceTitle()
  saveGame()
  redraw()
  const name = side === 'w' ? 'blancas' : 'negras'
  $('announce').textContent = `Juegas con las ${name}.`
  maybeBotMove()
}

function restart() {
  botToken++
  thinking = false
  clearHint()
  resultDismissed = false
  phase = 'choose'
  clearSelection()
  closeSheets()
  showPhase()
  $('choose').querySelector('button').focus({ preventScroll: true })
  announceTitle()
  deska.storage.remove('game').catch((err) => showStatus(`No se pudo borrar la partida. ${problemText(err)}`, 'error'))
  redraw()
}

function clearSelection() {
  selected = null
  moves = []
}

const botPlays = () => settings.botEnabled && game.turn !== side

function applyMove(from, move) {
  const mover = game.turn
  const piece = game.board[from.r][from.f].type
  const captured = !!game.board[move.r][move.f] || !!move.ep
  game = play(game, from, move)
  games = games.slice(0, cursor + 1)
  ucis = ucis.slice(0, cursor)
  ucis.push(uciOf(from, move, piece))
  games.push(game)
  cursor = games.length - 1
  clearHint()
  resultDismissed = false
  clearSelection()
  slide = reduced.matches ? null : { moves: slideMoves(from, move), start: performance.now() }
  const who = mover === 'w' ? 'Blancas' : 'Negras'
  $('announce').textContent = `${who}: ${pieceName(piece)} de ${squareName(from.f, from.r)} a ${squareName(move.f, move.r)}${captured ? ', captura' : ''}${game.status === 'check' ? ', jaque' : ''}`
  if (isOver(game)) phase = 'over'
  saveGame()
  showPhase()
  announceTitle()
  redraw()
  if (phase === 'play') maybeBotMove()
}

const uciOf = (from, move, piece) =>
  squareName(from.f, from.r) + squareName(move.f, move.r) + (piece === 'p' && (move.r === 0 || move.r === 7) ? 'q' : '')

// With the bot on, only positions where it is the person's turn can be shown, so going back never
// lands where the bot would immediately move again.
function targetIndex(direction) {
  for (let i = cursor + direction; i >= 0 && i < games.length; i += direction) {
    if (!settings.botEnabled || games[i].turn === side) return i
  }
  return -1
}

function goTo(index) {
  botToken++
  thinking = false
  cursor = index
  game = games[cursor]
  phase = isOver(game) ? 'over' : 'play'
  slide = null
  clearHint()
  resultDismissed = false
  clearSelection()
  $('announce').textContent = `Posición después de ${cursor} ${cursor === 1 ? 'jugada' : 'jugadas'}.`
  saveGame()
  showPhase()
  announceTitle()
  redraw()
  if (phase === 'play') maybeBotMove()
}

function updateNav() {
  const active = phase !== 'choose'
  $('undo').disabled = !active || targetIndex(-1) === -1
  $('redo').disabled = !active || targetIndex(1) === -1
  $('hint').disabled = !canMove() || (hintBusy && !hint)
  $('hint').setAttribute('aria-pressed', String(!!hint))
  $('move-count').textContent = active ? `Jugada ${game.full}` : ''
}

function clearHint() {
  hintToken++
  hintBusy = false
  hint = null
  $('hint').removeAttribute('aria-busy')
}

// The hint is the engine at full strength, whatever level the bot plays at.
async function showHint() {
  if (hint) { clearHint(); updateNav(); redraw(); return }
  if (!canMove() || hintBusy) return
  const token = ++hintToken
  hintBusy = true
  $('hint').setAttribute('aria-busy', 'true')
  updateNav()
  let uci = null
  try {
    uci = await chooseMove(toFEN(game), { depth: 4, timeMs: 1200, noise: 0 })
  } catch (err) {
    console.error('Chess: the hint failed.', err)
  }
  if (token !== hintToken) return // the position changed while it thought
  hintBusy = false
  $('hint').removeAttribute('aria-busy')
  const found = uci && moveFromUci(game, uci)
  if (!found) {
    showStatus('No encontré una pista para esta posición.', 'error')
    updateNav()
    return
  }
  hint = { from: found.from, to: { f: found.move.f, r: found.move.r } }
  const piece = game.board[found.from.r][found.from.f].type
  $('announce').textContent = `Pista: ${pieceName(piece)} de ${squareName(found.from.f, found.from.r)} a ${squareName(found.move.f, found.move.r)}.`
  updateNav()
  redraw()
}

function openDrawer() {
  $('drawer').removeAttribute('inert')
  $('drawer-toggle').setAttribute('aria-expanded', 'true')
}

function closeDrawer() {
  $('drawer').setAttribute('inert', '')
  $('drawer-toggle').setAttribute('aria-expanded', 'false')
}

function slideMoves(from, move) {
  const out = [{ from: { f: from.f, r: from.r }, to: { f: move.f, r: move.r } }]
  if (move.castle) {
    const rookFrom = move.castle === 'K' ? 7 : 0
    const rookTo = move.castle === 'K' ? 5 : 3
    out.push({ from: { f: rookFrom, r: move.r }, to: { f: rookTo, r: move.r } })
  }
  return out
}

const PIECE_NAMES = { k: 'rey', q: 'dama', r: 'torre', b: 'alfil', n: 'caballo', p: 'peón' }
const pieceName = (type) => PIECE_NAMES[type]

async function maybeBotMove() {
  if (phase !== 'play' || !botPlays() || thinking) return
  const token = ++botToken
  thinking = true
  announceTitle()
  const started = performance.now()
  let uci = null
  try {
    uci = await chooseMove(toFEN(game), profileFor(settings.botRating))
  } catch (err) {
    console.error('Chess: the bot failed.', err)
    if (token === botToken) {
      thinking = false
      showStatus('El bot falló y se desactivó. Puedes seguir jugando por ambos lados.', 'error')
      settings = { ...settings, botEnabled: false }
      syncSettingsUi()
      saveSettings()
      announceTitle()
    }
    return
  }
  const wait = Math.max(0, botDelay() - (performance.now() - started))
  await new Promise((resolve) => setTimeout(resolve, wait))
  if (token !== botToken) return // a restart, a new game or a settings change got there first
  thinking = false
  const found = uci && moveFromUci(game, uci)
  if (!found) {
    showStatus('El bot propuso una jugada no válida y se desactivó.', 'error')
    settings = { ...settings, botEnabled: false }
    syncSettingsUi()
    saveSettings()
    announceTitle()
    return
  }
  applyMove(found.from, found.move)
}

// Text the person reads --------------------------------------------------------------------

function setTurnIcon(name, tone = '') {
  const icon = $('turn-icon')
  const href = `#i-${name}`
  const changed = icon.firstElementChild.getAttribute('href') !== href
  icon.firstElementChild.setAttribute('href', href)
  icon.dataset.tone = tone
  if (changed && !reduced.matches) {
    icon.animate([{ scale: 0.5, opacity: 0.3 }, { scale: 1.2, opacity: 1 }, { scale: 1, opacity: 1 }], { duration: 380, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' })
  }
}

function announceTitle() {
  let text
  let icon = 'horse'
  let tone = ''
  const check = game.status === 'check'
  if (phase === 'choose') { text = 'Elige tu color'; icon = 'crown-simple' }
  else if (phase === 'over') { text = resultText().title; icon = resultText().icon }
  else if (thinking) { text = 'El bot está pensando'; icon = 'robot' }
  else if (!settings.botEnabled) text = `Turno de ${game.turn === 'w' ? 'las blancas' : 'las negras'}${check ? ' (jaque)' : ''}`
  else if (game.turn === side) text = `Tu turno${check ? ' (jaque)' : ''}`
  else { text = 'Turno del bot'; icon = 'robot' }
  if (check && phase === 'play') { icon = 'warning'; tone = 'danger' }
  $('turn').textContent = text
  $('dots').hidden = !thinking
  $('turn').closest('.turn').classList.toggle('is-thinking', thinking)
  setTurnIcon(icon, tone)
  updateNav()
  deska.setTitle(text).catch(() => {})
  $('board').setAttribute('aria-label', `Tablero de ajedrez. ${side === 'w' ? 'Blancas' : 'Negras'} abajo. ${text}.`)
}

function resultText() {
  const moves = Math.ceil(cursor / 2)
  const length = `${moves} ${moves === 1 ? 'jugada' : 'jugadas'}`
  const versus = settings.botEnabled ? ` Bot ${settings.botRating}.` : ''
  if (game.status === 'checkmate') {
    const winner = other(game.turn)
    if (!settings.botEnabled) {
      return { title: `Victoria de las ${winner === 'w' ? 'blancas' : 'negras'}`, detail: `Jaque mate en ${length}.`, icon: 'trophy', tone: 'win' }
    }
    const won = winner === side
    return {
      title: won ? 'Victoria' : 'Derrota',
      detail: `Jaque mate en ${length}.${versus}`,
      icon: won ? 'trophy' : 'flag-checkered',
      tone: won ? 'win' : 'lose',
    }
  }
  if (game.status === 'stalemate') return { title: 'Tablas', detail: `Rey ahogado en ${length}: no hay jugadas legales y no está en jaque.${versus}`, icon: 'handshake', tone: 'draw' }
  return { title: 'Tablas', detail: `${game.half >= 100 ? 'Cincuenta jugadas sin captura ni movimiento de peón.' : 'Solo quedan los reyes.'}${versus}`, icon: 'handshake', tone: 'draw' }
}

function showPhase() {
  $('choose').hidden = phase !== 'choose'
  $('result').hidden = phase !== 'over' || resultDismissed
  if (phase === 'over') {
    const { title, detail, icon, tone } = resultText()
    $('result-icon').dataset.tone = tone
    $('result-title').textContent = title
    $('result-detail').textContent = detail
    $('result-icon').firstElementChild.setAttribute('href', `#i-${icon}`)
  }
  $('board').toggleAttribute('inert', phase === 'choose')
}

// Input ---------------------------------------------------------------------------------------

function canMove() {
  return phase === 'play' && !thinking && !(settings.botEnabled && game.turn !== side)
}

function activate(sq) {
  if (!canMove()) return
  if (!sq) { clearSelection(); redraw(); return }
  if (selected) {
    const move = moves.find((m) => m.f === sq.f && m.r === sq.r)
    if (move) { applyMove(selected, move); return }
  }
  const piece = game.board[sq.r][sq.f]
  const same = selected && selected.f === sq.f && selected.r === sq.r
  if (piece && piece.color === game.turn && !same) {
    selected = { f: sq.f, r: sq.r }
    selectedAt = performance.now()
    moves = legalMoves(game, sq.f, sq.r)
  } else {
    clearSelection()
  }
  redraw()
}

function pointerSquare(event) {
  const rect = $('board').getBoundingClientRect()
  return board.squareAt(event.clientX - rect.left, event.clientY - rect.top, side === 'b')
}

$('board').addEventListener('pointermove', (event) => { hover = pointerSquare(event); redraw() })
$('board').addEventListener('pointerleave', () => { hover = null; redraw() })
$('board').addEventListener('pointerdown', (event) => {
  hover = pointerSquare(event)
  activate(hover)
})

// Keyboard: arrows move a cursor over the squares, Enter or Space acts like a click.
$('board').addEventListener('keydown', (event) => {
  const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[event.key]
  const flip = side === 'b' ? -1 : 1
  if (step) {
    event.preventDefault()
    const from = hover || { f: 3, r: side === 'w' ? 1 : 6 }
    hover = { f: Math.max(0, Math.min(7, from.f + step[0] * flip)), r: Math.max(0, Math.min(7, from.r + step[1] * flip)) }
    $('announce').textContent = squareName(hover.f, hover.r)
    redraw()
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    activate(hover)
  } else if (event.key === 'Escape' && selected) {
    clearSelection()
    redraw()
  }
})
$('board').addEventListener('blur', () => { hover = null; redraw() })

// Controls and sheets -------------------------------------------------------------------------

function buildControls() {
  for (const button of document.querySelectorAll('.choice')) {
    button.addEventListener('click', () => startGame(button.dataset.side))
  }
  $('again').addEventListener('click', () => startGame(side))
  $('result-colors').addEventListener('click', restart)
  $('result-view').addEventListener('click', () => { resultDismissed = true; showPhase(); $('board').focus({ preventScroll: true }) })
  $('hint').addEventListener('click', showHint)
  $('undo').addEventListener('click', () => { const i = targetIndex(-1); if (i !== -1) goTo(i) })
  $('redo').addEventListener('click', () => { const i = targetIndex(1); if (i !== -1) goTo(i) })
  $('drawer-toggle').addEventListener('click', () => ($('drawer').hasAttribute('inert') ? openDrawer() : closeDrawer()))
  for (const button of document.querySelectorAll('[data-new]')) button.addEventListener('click', () => startGame(button.dataset.new))
  $('restart').addEventListener('click', restart)

  for (const button of document.querySelectorAll('[data-piece-set]')) {
    button.addEventListener('click', () => change({ pieceSet: button.dataset.pieceSet }))
  }
  renderPreviews()
  for (const button of document.querySelectorAll('[data-palette]')) {
    button.addEventListener('click', () => change({ palette: button.dataset.palette }))
  }
  $('coordinates').addEventListener('change', () => change({ coordinates: $('coordinates').checked }))
  $('bot-enabled').addEventListener('change', () => change({ botEnabled: $('bot-enabled').checked }))
  $('bot-rating').addEventListener('input', () => change({ botRating: Number($('bot-rating').value) }))
  $('reset-settings').addEventListener('click', () => change({ ...DEFAULTS }))

  const sheets = { 'bot-button': 'bot-sheet', 'menu-button': 'menu-sheet' }
  for (const [buttonId, sheetId] of Object.entries(sheets)) {
    $(buttonId).addEventListener('click', () => (openSheet === sheetId ? closeSheets() : showSheet(sheetId)))
  }
  for (const close of document.querySelectorAll('[data-close]')) close.addEventListener('click', closeSheets)
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && openSheet) closeSheets(true) })
  document.addEventListener('pointerdown', (event) => {
    if (openSheet && !event.target.closest('.sheet, .bar-actions')) closeSheets()
  })
}

function showSheet(id) {
  closeSheets()
  openSheet = id
  $(id).hidden = false
  $(id === 'bot-sheet' ? 'bot-button' : 'menu-button').setAttribute('aria-expanded', 'true')
  $(id).querySelector('h2').focus({ preventScroll: true })
}

function closeSheets(returnFocus = false) {
  if (!openSheet) return
  const trigger = $(openSheet === 'bot-sheet' ? 'bot-button' : 'menu-button')
  $(openSheet).hidden = true
  trigger.setAttribute('aria-expanded', 'false')
  openSheet = null
  if (returnFocus) trigger.focus({ preventScroll: true })
}

function change(patch) {
  const botBefore = settings.botEnabled
  settings = { ...settings, ...patch }
  syncSettingsUi()
  saveSettings()
  if (botBefore && !settings.botEnabled) { botToken++; thinking = false }
  announceTitle()
  redraw()
  if (!botBefore && settings.botEnabled) maybeBotMove()
}

// Samples of the piece styles and of the chosen style on the color buttons, in the theme's accent.
function renderPreviews() {
  const look = { accent: colors.accent, bg: colors.bg }
  for (const button of document.querySelectorAll('[data-piece-set]')) {
    drawPreview(button.querySelector('canvas'), button.dataset.pieceSet, undefined, look)
  }
  for (const button of document.querySelectorAll('.choice')) {
    const pieces = { w: [['k', true]], b: [['k', false]], random: [['n', true], ['n', false]] }[button.dataset.side]
    drawPreview(button.querySelector('canvas'), settings.pieceSet, pieces, look)
  }
}

function syncSettingsUi() {
  const palettes = { app: { dark: colors.accent, light: tint(colors.accent, 0.86) }, ...PALETTES }
  for (const button of document.querySelectorAll('[data-palette]')) {
    const p = palettes[button.dataset.palette]
    const swatch = button.querySelector('.swatch')
    swatch.style.setProperty('--swatch-dark', p.dark)
    swatch.style.setProperty('--swatch-light', p.light)
    button.setAttribute('aria-pressed', String(button.dataset.palette === settings.palette))
  }
  for (const button of document.querySelectorAll('[data-piece-set]')) {
    button.setAttribute('aria-pressed', String(button.dataset.pieceSet === settings.pieceSet))
  }
  renderPreviews()
  $('coordinates').checked = settings.coordinates
  $('bot-enabled').checked = settings.botEnabled
  $('bot-rating').value = String(settings.botRating)
  $('bot-rating').disabled = !settings.botEnabled
  $('bot-output').value = String(settings.botRating)
  $('bot-label').textContent = settings.botEnabled ? `Bot ${settings.botRating}` : 'Bot apagado'
}

// Start ----------------------------------------------------------------------------------------

settings = await loadSettings()
const saved = await loadGame()
if (saved) {
  games = saved.games
  ucis = saved.ucis
  cursor = saved.cursor
  game = games[cursor]
  side = saved.side
  phase = isOver(game) ? 'over' : 'play'
}

buildControls()
syncSettingsUi()
board.resize()
colors = readColors()
$('app').setAttribute('aria-busy', 'false')
showPhase()
announceTitle()
schedule()
if (phase === 'play') maybeBotMove()
