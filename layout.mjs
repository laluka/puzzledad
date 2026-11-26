function orientedBounds(piece, turns = 0) {
  const left = piece.bounds.left - piece.x
  const right = piece.bounds.right - piece.x
  const top = piece.bounds.top - piece.y
  const bottom = piece.bounds.bottom - piece.y
  if (turns === 1) return { left: -bottom, right: -top, top: left, bottom: right }
  if (turns === 2) return { left: -right, right: -left, top: -bottom, bottom: -top }
  if (turns === 3) return { left: top, right: bottom, top: -right, bottom: -left }
  return { left, right, top, bottom }
}

function pack(puzzle, view, order, turns) {
  const gap = Math.sqrt(puzzle.width * puzzle.height / order.length) * .11
  const margin = gap * 1.7
  const gutter = gap * 1.6
  const left = view.x + margin
  const top = view.y + margin
  const right = view.x + view.width - margin
  const bottom = view.y + view.height - margin
  const strips = [
    { x: left, y: top, width: right - left, height: -gutter - top },
    { x: left, y: puzzle.height + gutter, width: right - left, height: bottom - puzzle.height - gutter },
    { x: left, y: -gutter, width: -gutter - left, height: puzzle.height + gutter * 2 },
    { x: puzzle.width + gutter, y: -gutter, width: right - puzzle.width - gutter, height: puzzle.height + gutter * 2 },
  ].filter(rectangle => rectangle.width > 0 && rectangle.height > 0)
  const zones = strips.map(rectangle => ({
    rectangle, area: rectangle.width * rectangle.height, used: 0, entries: [],
  }))
  const entries = order.map(id => {
    const piece = puzzle.pieces[id]
    const { left, right, top, bottom } = orientedBounds(piece, turns[id])
    // Let pieces overlap slightly in the side trays so the picture can fill more of the table.
    return { id, left, top, width: (right - left) * .5 + gap, height: (bottom - top) * .5 + gap }
  })
  // Pack the larger pieces first. The shuffled order breaks ties between similar pieces.
  entries.sort((a, b) => Math.round(Math.max(b.width, b.height) / gap) -
    Math.round(Math.max(a.width, a.height) / gap))
  for (const entry of entries) {
    const area = entry.width * entry.height
    const available = zones.filter(zone => zone.rectangle.width >= entry.width &&
      zone.rectangle.height >= entry.height && zone.used + area <= zone.area * .95)
    if (!available.length) return null
    available.sort((a, b) => a.used / a.area - b.used / b.area)
    available[0].entries.push(entry)
    available[0].used += area
  }
  const positions = new Map()
  for (const zone of zones) {
    const { rectangle, entries } = zone
    if (!entries.length) continue
    let grid = null
    const maxWidth = Math.max(...entries.map(entry => entry.width))
    const maxHeight = Math.max(...entries.map(entry => entry.height))
    for (let columns = 1; columns <= entries.length; columns++) {
      const rows = Math.ceil(entries.length / columns)
      const crowding = Math.max(maxWidth * columns / rectangle.width,
        maxHeight * rows / rectangle.height)
      const score = crowding + (columns * rows - entries.length) / entries.length * .08
      if (!grid || score < grid.score) grid = { columns, rows, crowding, score }
    }
    if (grid.crowding > 1.3) return null
    entries.forEach((entry, index) => {
      const row = Math.floor(index / grid.columns)
      const rowCount = Math.min(grid.columns, entries.length - row * grid.columns)
      const column = index % grid.columns
      const centerX = rectangle.x + (column + .5) * rectangle.width / rowCount
      const centerY = rectangle.y + (row + .5) * rectangle.height / grid.rows
      positions.set(entry.id, {
        x: centerX - entry.width / 2 + gap / 2 - entry.left,
        y: centerY - entry.height / 2 + gap / 2 - entry.top,
      })
    })
  }
  return positions
}

export function layoutTable(puzzle, width, height, order, turns = [], fullscreen = false) {
  width = Math.max(1, width)
  height = Math.max(1, height)
  const aspect = width / height
  const sideRoom = aspect >= 1.12
  const fitWidth = Math.min(width * (sideRoom ? .72 : .94),
    height * (sideRoom ? .96 : .6) * puzzle.width / puzzle.height) *
    (fullscreen ? (sideRoom ? .82 : .9) : 1)
  function arrange(scale) {
    const worldWidth = width / scale
    const worldHeight = height / scale
    const view = {
      x: (puzzle.width - worldWidth) / 2,
      y: (puzzle.height - worldHeight) / 2,
      width: worldWidth,
      height: worldHeight,
    }
    const positions = pack(puzzle, view, order, turns)
    return positions ? { view, positions } : null
  }
  let high = Math.max(.000001, fitWidth / puzzle.width)
  let best = arrange(high)
  if (best) return best
  let low = high * .87
  while (!(best = arrange(low))) {
    high = low
    low *= .87
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const scale = (high + low) / 2
    const next = arrange(scale)
    if (next) {
      best = next
      low = scale
    } else {
      high = scale
    }
  }
  return best
}

export function keepOnTable(piece, point, view, turns = 0) {
  const { left, right, top, bottom } = orientedBounds(piece, turns)
  const pad = 3
  return {
    x: Math.max(view.x - left + pad, Math.min(view.x + view.width - right - pad, point.x)),
    y: Math.max(view.y - top + pad, Math.min(view.y + view.height - bottom - pad, point.y)),
  }
}
