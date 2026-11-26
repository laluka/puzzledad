const intersects = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x &&
  a.y < b.y + b.height && a.y + a.height > b.y

const contains = (outer, inner) => inner.x >= outer.x && inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height

function subtract(rectangle, used) {
  if (!intersects(rectangle, used)) return [rectangle]
  const { x, y, width, height } = rectangle
  const right = x + width
  const bottom = y + height
  return [
    { x, y, width: used.x - x, height },
    { x: used.x + used.width, y, width: right - used.x - used.width, height },
    { x, y, width, height: used.y - y },
    { x, y: used.y + used.height, width, height: bottom - used.y - used.height },
  ].filter(space => space.width > .001 && space.height > .001)
}

function removeContained(spaces) {
  return spaces.filter((space, index) => !spaces.some((other, otherIndex) =>
    otherIndex !== index && contains(other, space) && (!contains(space, other) || otherIndex < index)))
}

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
    area: rectangle.width * rectangle.height, used: 0, spaces: [rectangle],
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
  const positions = new Map()
  for (const { id, left, top, width, height } of entries) {
    let best = null
    for (const zone of zones) {
      for (const space of zone.spaces) {
        if (space.width < width || space.height < height) continue
        const fit = Math.min(space.width - width, space.height - height) / Math.min(width, height)
        const score = zone.used / zone.area + fit * .058
        if (!best || score < best.score) best = { zone, space, score }
      }
    }
    if (!best) return null
    const { zone, space } = best
    const footprint = { x: space.x, y: space.y, width, height }
    zone.used += width * height
    zone.spaces = removeContained(zone.spaces.flatMap(area => subtract(area, footprint)))
    positions.set(id, {
      x: space.x + gap / 2 - left,
      y: space.y + gap / 2 - top,
    })
  }
  return positions
}

export function layoutTable(puzzle, width, height, order, turns = []) {
  width = Math.max(1, width)
  height = Math.max(1, height)
  const aspect = width / height
  const sideRoom = aspect >= 1.12
  const fitWidth = Math.min(width * (sideRoom ? .72 : .94),
    height * (sideRoom ? .96 : .6) * puzzle.width / puzzle.height)
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
