import { generatePuzzle, levels, randomFrom, shapes, shuffle } from './geometry.mjs'
import { keepOnTable, layoutTable } from './layout.mjs'

const starterPhotos = [
  { id: 'garden', name: 'Garden patrol', source: './assets/photos/garden.webp', width: 1680, height: 1260, alt: 'Black-and-white cat in a garden with pink flowers' },
  { id: 'blue', name: 'Blue blanket', source: './assets/photos/blue.webp', width: 720, height: 540, alt: 'Black-and-white cat resting on a bright blue blanket' },
  { id: 'nap', name: 'Afternoon nap', source: './assets/photos/nap.webp', width: 1680, height: 1260, alt: 'Fluffy cat curled up asleep on a blue cushion' },
  { id: 'armchair', name: 'The armchair', source: './assets/photos/armchair.webp', width: 1680, height: 952, alt: 'Black-and-white cat lounging across a chair' },
]

const $ = id => document.getElementById(id)
const board = $('board')
const stage = $('stage')
const looseLayer = $('loose-layer')
const setup = $('setup-dialog')
const results = $('results-dialog')
const preview = $('reference-dialog')
const photoSelect = $('setup-photo-select')
const countSelect = $('piece-count')
const patternSelect = $('cut-pattern')
const orientationSelect = $('orientation')
const fileInput = $('file-input')
const keys = { game: 'puzzledad/game/1', photos: 'puzzledad/photos/1' }
const maxPhotoStorage = 3_600_000
const svgNamespace = 'http://www.w3.org/2000/svg'
const finishFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

function svg(element, attributes = {}) {
  const node = document.createElementNS(svgNamespace, element)
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value)
  return node
}

function icon(name) {
  const node = svg('svg', { class: 'icon', 'aria-hidden': 'true' })
  node.append(svg('use', { href: '#i-' + name }))
  return node
}

function element(tag, className, content) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (content) node.textContent = content
  return node
}

let storageFailed = false

function readStorage(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? null : JSON.parse(raw)
  } catch {
    storageFailed = true
    return null
  }
}

function saveStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

function showStorageStatus() {
  const status = $('storage-status')
  status.toggleAttribute('data-failed', storageFailed)
  const value = storageFailed ? 'Off' : 'On'
  if ($('save-value').textContent !== value) $('save-value').textContent = value
  status.title = storageFailed ? 'Browser storage is unavailable' : 'Saved in this browser'
}

function isPhoto(photo) {
  return photo && typeof photo.id === 'string' && typeof photo.name === 'string' &&
    typeof photo.source === 'string' && photo.source.startsWith('data:image/') &&
    Number.isFinite(photo.width) && photo.width > 0 && Number.isFinite(photo.height) && photo.height > 0
}

const savedPhotos = readStorage(keys.photos)
let uploads = Array.isArray(savedPhotos) ? savedPhotos.filter(isPhoto) : []
const allPhotos = () => [...starterPhotos, ...uploads]
const findPhoto = id => allPhotos().find(photo => photo.id === id)
const newSeed = () => crypto.getRandomValues(new Uint32Array(1))[0]

function newGame(photoId, settings, generated) {
  return {
    photoId,
    ...settings,
    order: shuffle(generated.pieces.map(piece => piece.id), randomFrom(settings.seed ^ 0x9e3779b9)),
    placements: [],
    positions: {},
    turns: {},
    rotationSeed: settings.seed ^ 0x61c88647,
    depth: 0,
    elapsed: 0,
    started: false,
    paused: false,
    guide: true,
    edges: false,
  }
}

function loadPuzzle() {
  const saved = readStorage(keys.game)
  const photo = findPhoto(saved?.photoId)
  if (photo && Object.hasOwn(shapes, saved.shape) && [...levels, 12, 48, 80].includes(saved.count) &&
      ['random', 'repeating'].includes(saved.pattern) && Number.isInteger(saved.seed)) {
    const generated = generatePuzzle(photo, saved)
    const ids = new Set(generated.pieces.map(piece => piece.id))
    const inOrder = Array.isArray(saved.order) && new Set(saved.order).size === ids.size &&
      saved.order.length === ids.size && saved.order.every(id => ids.has(id))
    const validPlacements = Array.isArray(saved.placements) &&
      new Set(saved.placements.map(placement => placement?.id)).size === saved.placements.length &&
      saved.placements.every((placement, index) =>
        ids.has(placement?.id) && Number.isFinite(placement.at) &&
        placement.at >= (index ? saved.placements[index - 1].at : 0))
    if (inOrder && validPlacements && Number.isFinite(saved.elapsed) && saved.elapsed >= 0) {
      const positions = Object.fromEntries(Object.entries(saved.positions || {}).filter(([id, point]) =>
        ids.has(Number(id)) && Number.isFinite(point?.x) && Number.isFinite(point?.y) &&
        Number.isFinite(point?.depth)))
      const depth = Math.max(0, ...Object.values(positions).map(point => point.depth))
      const orientation = saved.orientation === 'shuffled' ? 'shuffled' : 'fixed'
      const turns = Object.fromEntries(Object.entries(saved.turns || {}).filter(([id, turn]) =>
        ids.has(Number(id)) && Number.isInteger(turn) && turn >= 0 && turn < 4))
      const rotationSeed = Number.isInteger(saved.rotationSeed) ? saved.rotationSeed : saved.seed ^ 0x61c88647
      return { game: { ...saved, positions, depth, orientation, rotationSeed, turns }, puzzle: generated }
    }
  }
  const settings = { shape: 'classic', count: 150, seed: newSeed(), pattern: 'random', orientation: 'fixed' }
  const generated = generatePuzzle(starterPhotos[0], settings)
  return { game: newGame(starterPhotos[0].id, settings, generated), puzzle: generated }
}

let { game, puzzle } = loadPuzzle()
let placed = new Set(game.placements.map(placement => placement.id))
let startedAt = null
let selected = null
let gesture = null
let layout = null
let camera = null
let zoom = 1
const looseNodes = new Map()
const piecePositions = new Map()
const rotations = new WeakMap()
let initialTurns = []
let importing = false
let dragDepth = 0
let toastTimeout
let missTimeout

const complete = () => placed.size === puzzle.pieces.length
const activePhoto = () => findPhoto(game.photoId)
const elapsedTime = () => game.elapsed + (startedAt === null ? 0 : performance.now() - startedAt)
const activeDialog = () => setup.open || results.open || preview.open
const turnsFor = id => game.orientation === 'shuffled' ? (game.turns[id] ?? initialTurns[id]) : 0

function makeInitialTurns() {
  const random = randomFrom(game.rotationSeed)
  initialTurns = game.orientation === 'shuffled' ? puzzle.pieces.map(() => Math.floor(random() * 4)) : []
}

function persist() {
  const record = { ...game, elapsed: elapsedTime() }
  const failed = !saveStorage(keys.game, record)
  if (failed !== storageFailed) storageFailed = failed
  showStorageStatus()
}

function stopClock() {
  if (startedAt === null) return
  game.elapsed += performance.now() - startedAt
  startedAt = null
}

function syncClock() {
  const running = game.started && !game.paused && !complete() && !document.hidden && !activeDialog()
  if (running && startedAt === null) startedAt = performance.now()
  if (!running) stopClock()
  renderTime()
}

function beginClock() {
  if (!game.started) {
    game.started = true
    syncClock()
    persist()
  }
}

function duration(milliseconds) {
  const total = Math.floor(Math.max(0, milliseconds) / 1000)
  const seconds = String(total % 60).padStart(2, '0')
  const minutes = Math.floor(total / 60)
  if (minutes < 60) return minutes + ':' + seconds
  return Math.floor(minutes / 60) + ':' + String(minutes % 60).padStart(2, '0') + ':' + seconds
}

function renderTime() {
  const value = duration(elapsedTime())
  const time = $('elapsed')
  if (time.textContent !== value) time.textContent = value
  const action = complete() ? 'Finished' : game.paused ? 'Resume timer' : 'Pause timer'
  const name = action + '. Elapsed time ' + value
  const button = $('timer-toggle')
  if (button.getAttribute('aria-label') !== name) button.setAttribute('aria-label', name)
  let estimate = '—'
  if (complete()) estimate = 'Done'
  else if (game.paused) estimate = 'Paused'
  else if (placed.size >= 3) {
    const recent = game.placements.slice(-13)
    const pace = (recent.at(-1).at - recent[0].at) / (recent.length - 1)
    estimate = finishFormatter.format(Date.now() + pace * (puzzle.pieces.length - placed.size))
  }
  if ($('estimate').textContent !== estimate) $('estimate').textContent = estimate
}

function announce(message) {
  $('announcement').textContent = message
}

function toast(message) {
  const target = $('toast')
  const dialog = document.querySelector('dialog[open]')
  const container = dialog || document.body
  container.append(target)
  target.classList.toggle('dialog-toast', Boolean(dialog))
  target.textContent = message
  target.hidden = false
  clearTimeout(toastTimeout)
  toastTimeout = setTimeout(() => { target.hidden = true }, 4300)
}

function setPhoto(node, photo, decorative = false) {
  node.src = photo.source
  node.alt = decorative ? '' : (photo.alt || photo.name)
}

function renderPhotoShelf(activeId) {
  const items = allPhotos().map(photo => {
    const button = element('button', 'photo-tile')
    button.type = 'button'
    button.title = photo.name
    button.setAttribute('aria-label', 'Choose ' + photo.name)
    if (photo.id === activeId) button.setAttribute('aria-current', 'true')
    const image = element('img')
    setPhoto(image, photo, true)
    button.append(image)
    button.addEventListener('click', () => {
      photoSelect.value = photo.id
      refreshSetupPhoto()
      $('photo-list').querySelector('[aria-current="true"]')?.focus({ preventScroll: true })
    })
    return button
  })
  $('photo-list').replaceChildren(...items)
}

function pieceGraphic(id) {
  const group = svg('g', { class: 'piece-graphic', 'aria-hidden': 'true' })
  group.append(
    svg('use', { href: '#source-photo', 'clip-path': 'url(#clip-' + id + ')' }),
    svg('use', { href: '#shape-' + id, class: 'piece-outline' }),
  )
  return group
}

function renderGeometry() {
  const { width, height, pieces } = puzzle
  const source = svg('image', {
    id: 'source-photo', href: activePhoto().source, width, height, preserveAspectRatio: 'xMidYMid slice',
  })
  const definitions = [source]
  for (const piece of pieces) {
    const route = svg('path', { id: 'shape-' + piece.id, d: piece.path })
    const clip = svg('clipPath', { id: 'clip-' + piece.id })
    clip.append(svg('use', { href: '#shape-' + piece.id }))
    definitions.push(route, clip)
  }
  $('photo-definitions').replaceChildren(...definitions)
  $('outline-layer').replaceChildren(...pieces.map(piece => svg('use', { href: '#shape-' + piece.id })))
  const target = $('board-target')
  target.setAttribute('width', width)
  target.setAttribute('height', height)
}

function drawSolved(id) {
  const graphic = pieceGraphic(id)
  graphic.classList.add('solved-piece')
  $('solved-layer').append(graphic)
}

function renderBoardState() {
  const count = puzzle.pieces.length
  $('progress-text').textContent = placed.size + ' / ' + count
  $('progress').max = count
  $('progress').value = placed.size
  board.classList.toggle('no-guide', !game.guide)
  board.classList.toggle('complete', complete())
  board.setAttribute('tabindex', game.paused ? '-1' : '0')
  for (const node of looseNodes.values()) node.setAttribute('tabindex', game.paused ? '-1' : '0')
  $('guide-toggle').setAttribute('aria-pressed', String(game.guide))
  $('edge-toggle').setAttribute('aria-pressed', String(game.edges))
  $('guide-toggle').disabled = complete()
  $('edge-toggle').disabled = game.paused || complete()
  $('shuffle').disabled = game.paused || complete()
  $('timer-toggle').disabled = complete()
  $('timer-toggle').setAttribute('aria-pressed', String(game.paused))
  $('timer-icon').setAttribute('href', game.paused ? '#i-play' : '#i-pause')
  $('pause-overlay').hidden = !game.paused
  $('show-results').hidden = !complete()
  renderTime()
}

function setView(centerX, centerY) {
  const { view } = layout
  const width = view.width / zoom
  const height = view.height / zoom
  const x = Math.max(view.x, Math.min(view.x + view.width - width, centerX - width / 2))
  const y = Math.max(view.y, Math.min(view.y + view.height - height, centerY - height / 2))
  camera = { x, y, width, height }
  board.setAttribute('viewBox', [x, y, width, height].join(' '))
  board.toggleAttribute('data-zoomed', zoom > 1)
  $('zoom-out').disabled = zoom === 1
  $('zoom-fit').disabled = zoom === 1
  $('zoom-in').disabled = zoom === 4
}

function viewCenter() {
  return { x: camera.x + camera.width / 2, y: camera.y + camera.height / 2 }
}

function zoomTable(multiplier, point = viewCenter()) {
  const priorZoom = zoom
  zoom = Math.max(1, Math.min(4, zoom * multiplier))
  if (zoom === priorZoom) return
  const center = viewCenter()
  const ratio = priorZoom / zoom
  setView(point.x + (center.x - point.x) * ratio, point.y + (center.y - point.y) * ratio)
}

function refreshLayout(resetView = false) {
  const center = camera && !resetView ? viewCenter() : { x: puzzle.width / 2, y: puzzle.height / 2 }
  if (resetView) zoom = 1
  layout = layoutTable(puzzle, stage.clientWidth, stage.clientHeight, game.order, initialTurns)
  setView(center.x, center.y)
  for (const id of looseNodes.keys()) {
    const position = game.positions[id] || layout.positions.get(id)
    movePiece(id, keepOnTable(puzzle.pieces[id], position, layout.view, turnsFor(id)))
  }
}

function movePiece(id, position) {
  const piece = puzzle.pieces[id]
  piecePositions.set(id, position)
  looseNodes.get(id).setAttribute('transform', 'translate(' + (position.x - piece.x) + ' ' +
    (position.y - piece.y) + ')')
}

function setAngle(rotor, piece, angle) {
  rotor.dataset.angle = angle
  rotor.setAttribute('transform', 'rotate(' + [angle, piece.x, piece.y].join(' ') + ')')
}

function animateRotation(rotor, piece, turns) {
  const previous = rotations.get(rotor)
  if (previous) cancelAnimationFrame(previous.frame)
  if (reduceMotion()) {
    rotations.delete(rotor)
    setAngle(rotor, piece, turns * 90)
    return
  }
  const from = Number(rotor.dataset.angle)
  const to = (previous?.to ?? from) + 90
  const start = performance.now()
  const motion = { to, frame: 0 }
  function update(now) {
    if (!rotor.isConnected) return
    const progress = Math.max(0, Math.min(1, (now - start) / 155))
    if (progress === 1) {
      setAngle(rotor, piece, turns * 90)
      rotations.delete(rotor)
      return
    }
    const eased = 1 - (1 - progress) ** 3
    setAngle(rotor, piece, from + (to - from) * eased)
    motion.frame = requestAnimationFrame(update)
  }
  rotations.set(rotor, motion)
  motion.frame = requestAnimationFrame(update)
}

function labelPiece(node, piece, turns) {
  const label = (piece.edge ? 'Edge piece ' : 'Piece ') + (piece.id + 1)
  const orientation = game.orientation === 'shuffled'
    ? (turns ? ', rotated ' + turns * 90 + ' degrees' : ', upright')
    : ''
  node.setAttribute('aria-label', label + orientation)
}

function renderLoose() {
  const available = game.order.filter(id => !placed.has(id) && (!game.edges || puzzle.pieces[id].edge))
  available.sort((a, b) => (game.positions[a]?.depth || 0) - (game.positions[b]?.depth || 0))
  looseNodes.clear()
  piecePositions.clear()
  for (const id of available) {
    const piece = puzzle.pieces[id]
    const turns = turnsFor(id)
    const node = svg('g', {
      class: 'loose-piece', 'data-piece': id, role: 'button', tabindex: game.paused ? '-1' : '0',
      'aria-pressed': 'false',
    })
    labelPiece(node, piece, turns)
    const rotor = svg('g')
    setAngle(rotor, piece, turns * 90)
    rotor.append(pieceGraphic(id), svg('path', { d: piece.path, class: 'hit-piece', 'aria-hidden': 'true' }))
    node.append(rotor)
    looseNodes.set(id, node)
    const position = game.positions[id] || layout.positions.get(id)
    movePiece(id, keepOnTable(piece, position, layout.view, turns))
  }
  looseLayer.replaceChildren(...looseNodes.values())
  if (game.edges && !available.length && !complete()) {
    announce('All edge pieces are placed. Turn off the edge filter to see the rest.')
  }
}

function renderAll() {
  looseNodes.clear()
  makeInitialTurns()
  renderGeometry()
  $('solved-layer').replaceChildren()
  for (const { id } of game.placements) drawSolved(id)
  refreshLayout(true)
  renderLoose()
  renderBoardState()
}

function clearSelection({ restore = true, focus = false } = {}) {
  if (!selected) return
  const { id, origin } = selected
  const node = looseNodes.get(id)
  selected = null
  board.removeAttribute('data-selected')
  node?.setAttribute('aria-pressed', 'false')
  if (restore && node) movePiece(id, origin)
  if (focus) node?.focus({ preventScroll: true })
}

function selectPiece(id, keyboard) {
  clearSelection()
  const node = looseNodes.get(id)
  selected = { id, origin: piecePositions.get(id) }
  node.setAttribute('aria-pressed', 'true')
  if (keyboard) board.focus({ preventScroll: true })
  looseLayer.append(node)
  board.setAttribute('data-selected', '')
  if (keyboard) {
    announce('Piece selected. Use the arrow keys to move it and Enter to place it.')
  } else {
    announce('Piece selected.')
  }
  beginClock()
}

function boardPoint(clientX, clientY) {
  const rect = board.getBoundingClientRect()
  return {
    x: camera.x + (clientX - rect.left) * camera.width / rect.width,
    y: camera.y + (clientY - rect.top) * camera.height / rect.height,
  }
}

function closeToTarget(piece, point) {
  return Math.hypot(point.x - piece.x, point.y - piece.y) <= piece.snap
}

function playSnapEffect(piece) {
  if (reduceMotion()) return
  const spark = svg('g', { class: 'snap-spark', 'aria-hidden': 'true' })
  const radius = piece.snap * .92
  for (const [x, y] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    spark.append(svg('line', {
      x1: piece.x + x * radius / 2, y1: piece.y + y * radius / 2,
      x2: piece.x + x * radius, y2: piece.y + y * radius,
    }))
  }
  $('effects-layer').append(spark)
  spark.animate([{ opacity: 0 }, { opacity: .88, offset: .23 }, { opacity: 0 }], {
    duration: 230, easing: 'ease-out',
  }).finished.then(() => spark.remove(), () => spark.remove())
}

function finishMove(id, point, keyboard = false) {
  const piece = puzzle.pieces[id]
  const turns = turnsFor(id)
  const centered = closeToTarget(piece, point)
  clearSelection({ restore: false })
  const loose = looseNodes.get(id)
  if (!centered || turns) {
    const position = keepOnTable(piece, point, layout.view, turns)
    game.positions[id] = { ...position, depth: ++game.depth }
    movePiece(id, position)
    if (point.x >= 0 && point.x <= puzzle.width && point.y >= 0 && point.y <= puzzle.height) {
      board.classList.add('miss')
      clearTimeout(missTimeout)
      missTimeout = setTimeout(() => board.classList.remove('miss'), 300)
      announce(centered ? 'Rotate this piece clockwise until it is upright.' : 'Piece moved. It fits somewhere else.')
    }
    if (keyboard) loose.focus({ preventScroll: true })
    persist()
    return
  }

  placed.add(id)
  game.placements.push({ id, at: elapsedTime() })
  delete game.positions[id]
  delete game.turns[id]
  const next = loose.nextElementSibling || looseLayer.firstElementChild
  loose.remove()
  looseNodes.delete(id)
  piecePositions.delete(id)
  drawSolved(id)
  playSnapEffect(piece)
  if (complete()) {
    stopClock()
    game.elapsed = game.placements.at(-1).at
  }
  renderBoardState()
  persist()
  announce(placed.size + ' of ' + puzzle.pieces.length + ' pieces in place.')
  if (complete()) {
    zoom = 1
    setView(puzzle.width / 2, puzzle.height / 2)
    openResults()
  } else if (keyboard) {
    if (next?.isConnected) next.focus({ preventScroll: true })
    else $('edge-toggle').focus({ preventScroll: true })
  }
}

function rotatePiece(id, keyboard = false) {
  const piece = puzzle.pieces[id]
  const turns = (turnsFor(id) + 1) % 4
  game.turns[id] = turns
  const node = looseNodes.get(id)
  labelPiece(node, piece, turns)
  const position = keepOnTable(piece, piecePositions.get(id), layout.view, turns)
  if (!turns && closeToTarget(piece, position)) {
    finishMove(id, position, keyboard)
    return
  }
  animateRotation(node.firstElementChild, piece, turns)
  movePiece(id, position)
  selected.origin = keepOnTable(piece, selected.origin, layout.view, turns)
  game.positions[id] = { ...selected.origin, depth: ++game.depth }
  persist()
  announce(turns ? 'Rotated clockwise to ' + turns * 90 + ' degrees.' : 'Piece upright.')
}

function keepInView(point) {
  if (zoom === 1) return
  const marginX = camera.width * .12
  const marginY = camera.height * .12
  if (point.x < camera.x + marginX || point.x > camera.x + camera.width - marginX ||
      point.y < camera.y + marginY || point.y > camera.y + camera.height - marginY) {
    setView(point.x, point.y)
  }
}

board.addEventListener('keydown', event => {
  if (game.paused) return
  const loose = event.target.closest('[data-piece]')
  const enter = event.key === 'Enter' || event.key === ' '
  if (loose && enter) {
    event.preventDefault()
    const id = Number(loose.dataset.piece)
    selectPiece(id, true)
    keepInView(piecePositions.get(id))
    return
  }
  const rotate = event.key.toLowerCase() === 'r' && !event.ctrlKey && !event.metaKey
  if ((loose || selected) && game.orientation === 'shuffled' && rotate) {
    event.preventDefault()
    if (loose) selectPiece(Number(loose.dataset.piece), true)
    rotatePiece(selected.id, true)
    return
  }
  if (!selected) return
  if (event.key === 'Escape' || event.key === 'Tab') {
    clearSelection({ focus: event.key === 'Escape' })
    return
  }
  const { id } = selected
  if (enter) {
    event.preventDefault()
    finishMove(id, piecePositions.get(id), true)
    return
  }
  const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]
  if (!direction) return
  event.preventDefault()
  const piece = puzzle.pieces[id]
  const position = piecePositions.get(id)
  const step = piece.snap * (event.shiftKey ? 3.4 : .48)
  const next = keepOnTable(piece, {
    x: position.x + step * direction[0], y: position.y + step * direction[1],
  }, layout.view, turnsFor(id))
  movePiece(id, next)
  keepInView(next)
})

board.addEventListener('focusin', event => {
  const node = event.target.closest('[data-piece]')
  if (node) keepInView(piecePositions.get(Number(node.dataset.piece)))
})

board.addEventListener('pointerdown', event => {
  if (event.button !== 0 || !event.isPrimary || game.paused) return
  const node = event.target.closest('[data-piece]')
  const id = node ? Number(node.dataset.piece) : null
  const point = boardPoint(event.clientX, event.clientY)
  gesture = {
    id, pointer: event.pointerId, point, x: event.clientX, y: event.clientY, center: viewCenter(),
    scale: camera.width / board.clientWidth, mode: null,
  }
  board.setPointerCapture(event.pointerId)
})

board.addEventListener('pointermove', event => {
  if (!gesture || gesture.pointer !== event.pointerId) return
  const dx = event.clientX - gesture.x
  const dy = event.clientY - gesture.y
  if (!gesture.mode && Math.hypot(dx, dy) > 4) {
    if (gesture.id !== null) {
      gesture.mode = 'piece'
      selectPiece(gesture.id, false)
      looseNodes.get(gesture.id).setAttribute('data-dragging', '')
    } else if (zoom > 1) {
      gesture.mode = 'pan'
    }
    if (gesture.mode) board.setAttribute('data-dragging', '')
  }
  const { mode, id, center, scale } = gesture
  if (mode === 'piece') {
    const { origin } = selected
    movePiece(id, { x: origin.x + dx * scale, y: origin.y + dy * scale })
  } else if (mode === 'pan') {
    setView(center.x - dx * scale, center.y - dy * scale)
  }
})

function finishGesture(event, cancelled = false) {
  if (!gesture || gesture.pointer !== event.pointerId) return
  const { id, mode } = gesture
  gesture = null
  board.removeAttribute('data-dragging')
  looseNodes.get(id)?.removeAttribute('data-dragging')
  if (cancelled) {
    if (mode === 'piece') clearSelection()
    return
  }
  if (mode === 'piece') {
    finishMove(id, piecePositions.get(id))
  } else if (!mode && id !== null) {
    if (game.orientation === 'shuffled') {
      if (selected?.id !== id) selectPiece(id, false)
      rotatePiece(id)
    } else if (selected?.id === id) clearSelection()
    else selectPiece(id, false)
  } else if (!mode && selected) {
    finishMove(selected.id, boardPoint(event.clientX, event.clientY))
  }
}

board.addEventListener('pointerup', finishGesture)
board.addEventListener('pointercancel', event => finishGesture(event, true))
board.addEventListener('lostpointercapture', event => finishGesture(event, true))
board.addEventListener('wheel', event => {
  event.preventDefault()
  if (gesture || game.paused) return
  const delta = Math.max(-180, Math.min(180, event.deltaY * (event.deltaMode ? 16 : 1)))
  zoomTable(Math.exp(-delta / 350), boardPoint(event.clientX, event.clientY))
}, { passive: false })

$('zoom-in').addEventListener('click', () => zoomTable(1.36))
$('zoom-out').addEventListener('click', () => zoomTable(1 / 1.36))
$('zoom-fit').addEventListener('click', () => zoomTable(1 / zoom))

$('guide-toggle').addEventListener('click', () => {
  game.guide = !game.guide
  renderBoardState()
  persist()
})

$('edge-toggle').addEventListener('click', () => {
  clearSelection()
  game.edges = !game.edges
  renderLoose()
  renderBoardState()
  persist()
})

$('shuffle').addEventListener('click', () => {
  clearSelection()
  game.order = shuffle(game.order)
  game.positions = {}
  game.turns = {}
  game.rotationSeed = newSeed()
  game.depth = 0
  makeInitialTurns()
  refreshLayout(true)
  renderLoose()
  if (!reduceMotion()) looseLayer.animate([{ opacity: .25 }, { opacity: 1 }], { duration: 190 })
  persist()
  announce('Loose pieces shuffled.')
})

function togglePause() {
  if (complete()) return
  clearSelection()
  game.paused = !game.paused
  syncClock()
  renderBoardState()
  persist()
  const nextControl = game.paused ? $('resume') : $('timer-toggle')
  nextControl.focus({ preventScroll: true })
}

$('timer-toggle').addEventListener('click', togglePause)
$('resume').addEventListener('click', togglePause)

function showDialog(dialog) {
  if (!dialog.open) dialog.showModal()
  syncClock()
  persist()
}

function openSetup(photoId = game.photoId) {
  clearSelection()
  fillPhotoSelect(photoId)
  countSelect.value = levels.includes(game.count) ? game.count : 150
  patternSelect.value = game.pattern
  orientationSelect.value = game.orientation
  $('setup-form').elements.shape.value = game.shape
  $('replace-note').hidden = complete() || !game.started
  refreshSetupPhoto()
  showDialog(setup)
}

function fillPhotoSelect(photoId) {
  photoSelect.replaceChildren(...allPhotos().map(photo => new Option(photo.name, photo.id)))
  photoSelect.value = photoId
}

function refreshSetupPhoto() {
  const photo = findPhoto(photoSelect.value)
  setPhoto($('setup-img'), photo, true)
  renderPhotoShelf(photo.id)
  $('remove-photo').hidden = photo.id === game.photoId || !uploads.some(upload => upload.id === photo.id)
  updatePieceCounts()
}

function updatePieceCounts() {
  const approximate = ['squares', 'surprise'].includes($('setup-form').elements.shape.value)
  for (const option of countSelect.options) option.textContent = (approximate ? 'About ' : '') + option.value
}

for (const [key, shape] of Object.entries(shapes)) {
  const option = element('label', 'shape-choice')
  const radio = element('input', 'visually-hidden')
  radio.type = 'radio'
  radio.name = 'shape'
  radio.value = key
  const description = element('span')
  description.append(icon(key === 'classic' ? 'puzzle' : key), element('strong', '', shape.name), element('small', '', shape.detail))
  option.append(radio, description)
  $('shape-options').append(option)
}
countSelect.replaceChildren(...levels.map(count => new Option(count, count)))

$('shape-options').addEventListener('change', updatePieceCounts)
photoSelect.addEventListener('change', refreshSetupPhoto)
$('new-game').addEventListener('click', () => openSetup())

$('setup-form').addEventListener('submit', event => {
  event.preventDefault()
  stopClock()
  const photo = findPhoto(photoSelect.value)
  const settings = {
    shape: event.target.elements.shape.value,
    count: Number(countSelect.value),
    pattern: patternSelect.value,
    orientation: orientationSelect.value,
    seed: newSeed(),
  }
  puzzle = generatePuzzle(photo, settings)
  game = newGame(photo.id, settings, puzzle)
  placed = new Set()
  setup.close()
  renderAll()
  persist()
  $('new-game').focus({ preventScroll: true })
  announce(photo.name + ' puzzle started with ' + puzzle.pieces.length + ' pieces.')
})

function openReference() {
  const photo = activePhoto()
  clearSelection()
  $('preview-title').textContent = photo.name
  setPhoto($('preview-img'), photo)
  showDialog(preview)
}

$('preview-photo').addEventListener('click', openReference)
for (const dialog of [setup, preview, results]) {
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close())
  dialog.addEventListener('close', syncClock)
}
results.addEventListener('close', () => {
  if (!setup.open && complete()) $('show-results').focus({ preventScroll: true })
})

function openResults() {
  const total = game.placements.length
  const seconds = Math.max(.001, game.elapsed / 1000)
  const gaps = game.placements.map((placement, index) =>
    (placement.at - (index ? game.placements[index - 1].at : 0)) / 1000)
  const average = gaps.reduce((sum, gap) => sum + gap, 0) / total
  const variance = gaps.reduce((sum, gap) => sum + (gap - average) ** 2, 0) / total
  const squaredChanges = gaps.slice(1).reduce((sum, gap, index) => sum + (gap - gaps[index]) ** 2, 0)
  const rms = Math.sqrt(squaredChanges / Math.max(1, total - 1))
  const format = number => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(number)
  const metrics = [
    ['Duration', duration(game.elapsed)], ['Pieces / second', format(total / seconds)],
    ['Pieces / minute', format(total * 60 / seconds)], ['Avg. gap', format(average) + ' s'],
    ['Gap variance', format(variance) + ' s²'], ['RMS gap change', format(rms) + ' s'],
  ]
  $('results-subtitle').textContent = activePhoto().name + ' · ' + total + ' pieces'
  $('results-stats').replaceChildren(...metrics.map(([name, value]) => {
    const tile = element('div')
    tile.append(element('dt', '', name), element('dd', '', value))
    return tile
  }))
  const tallest = Math.max(...gaps, .001)
  const step = 440 / total
  const bars = gaps.map((gap, index) => {
    const height = Math.max(1, gap * 79 / tallest)
    const bar = svg('rect', {
      x: index * step, y: 82 - height, width: Math.max(1, step - 2),
      height, rx: 1, fill: 'currentColor',
    })
    const label = svg('title')
    label.textContent = 'Placement ' + (index + 1) + ', ' + format(gap) + ' seconds'
    bar.append(label)
    return bar
  })
  $('rhythm-chart').setAttribute('aria-label', 'Time between placements. Longest gap ' + format(tallest) + ' seconds.')
  $('rhythm-chart').replaceChildren(...bars)
  showDialog(results)
}

$('show-results').addEventListener('click', openResults)
$('next-game').addEventListener('click', () => {
  results.close()
  openSetup()
})

function loadImage(file) {
  const url = URL.createObjectURL(file)
  const image = new Image()
  image.src = url
  return image.decode().then(() => image).finally(() => URL.revokeObjectURL(url))
}

async function importPhoto(file) {
  if (!file || importing) return
  importing = true
  try {
    const image = await loadImage(file)
    const scale = Math.min(1, 1280 / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    context.fillStyle = '#f7f5ed'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const source = canvas.toDataURL('image/webp', .83)
    const duplicate = uploads.find(photo => photo.source === source)
    if (duplicate) {
      offerImportedPuzzle(duplicate.id)
      return
    }
    const photo = {
      id: 'photo-' + newSeed().toString(36) + '-' + Date.now().toString(36),
      name: file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 90) || 'My photo',
      source, width: canvas.width, height: canvas.height,
    }
    const next = [...uploads, photo]
    if (JSON.stringify(next).length > maxPhotoStorage || !saveStorage(keys.photos, next)) {
      toast('This photo could not be saved. Remove a photo from the shelf to make room, or check browser storage settings.')
      return
    }
    uploads = next
    offerImportedPuzzle(photo.id)
  } catch {
    toast('This image couldn’t be opened. Try a JPEG, PNG or WebP photo.')
  } finally {
    importing = false
    fileInput.value = ''
  }
}

function offerImportedPuzzle(photoId) {
  if (setup.open) {
    fillPhotoSelect(photoId)
    refreshSetupPhoto()
  } else {
    if (preview.open) preview.close()
    if (results.open) results.close()
    openSetup(photoId)
  }
}

$('setup-import').addEventListener('click', () => fileInput.click())
fileInput.addEventListener('change', () => importPhoto(fileInput.files[0]))
$('remove-photo').addEventListener('click', () => {
  const photo = findPhoto(photoSelect.value)
  if (photo.id === game.photoId || !uploads.includes(photo)) return
  const next = uploads.filter(upload => upload !== photo)
  if (!saveStorage(keys.photos, next)) {
    toast('This photo could not be removed from browser storage.')
    return
  }
  uploads = next
  fillPhotoSelect(game.photoId)
  refreshSetupPhoto()
  photoSelect.focus()
  toast('Photo removed from the shelf.')
})

const containsFiles = event => event.dataTransfer?.types.includes('Files')
document.addEventListener('dragenter', event => {
  if (!containsFiles(event)) return
  event.preventDefault()
  dragDepth++
  $('drop-overlay').hidden = activeDialog()
})
document.addEventListener('dragover', event => {
  if (!containsFiles(event)) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'copy'
})
document.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1)
  if (!dragDepth) $('drop-overlay').hidden = true
})
document.addEventListener('drop', event => {
  if (!containsFiles(event) && !event.dataTransfer?.files.length) return
  event.preventDefault()
  dragDepth = 0
  $('drop-overlay').hidden = true
  importPhoto(event.dataTransfer.files[0])
})

document.addEventListener('visibilitychange', () => {
  syncClock()
  if (document.hidden) persist()
})
window.addEventListener('pagehide', () => {
  stopClock()
  persist()
})
window.addEventListener('pageshow', syncClock)
setInterval(renderTime, 350)
setInterval(() => { if (startedAt !== null) persist() }, 4000)
const resizeObserver = new ResizeObserver(() => {
  if (gesture) {
    looseNodes.get(gesture.id)?.removeAttribute('data-dragging')
    board.removeAttribute('data-dragging')
    gesture = null
  }
  clearSelection()
  refreshLayout()
})
resizeObserver.observe(stage)

renderAll()
syncClock()
persist()
