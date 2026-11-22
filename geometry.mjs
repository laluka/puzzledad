export const shapes = {
  classic: { name: 'Classic', detail: 'Traditional jigsaw tabs' },
  wiggle: { name: 'Wiggle', detail: 'Wavy, offbeat curves' },
  mosaic: { name: 'Mosaic', detail: 'Honeycomb paving' },
  triangles: { name: 'Triangles', detail: 'Uneven triangular cuts' },
  squares: { name: 'Squares', detail: 'Mixed-size square tiles' },
  surprise: { name: 'Surprise me', detail: 'A randomly chosen cut' },
}

export const levels = [24, 50, 100, 150, 200, 250, 300]

export function randomFrom(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), state | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffle(items, random = Math.random) {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1))
    const item = result[index]
    result[index] = result[other]
    result[other] = item
  }
  return result
}

function grid(count, ratio) {
  let match = { score: Infinity }
  for (let rows = 1; rows <= count; rows++) {
    if (count % rows) continue
    const columns = count / rows
    const score = Math.abs(Math.log(columns / rows / ratio))
    if (score < match.score) match = { columns, rows, score }
  }
  return match
}

const round = number => Math.round(number * 1000) / 1000
const coordinate = point => point.map(round).join(' ')
const line = end => ({ end })
const curve = (first, second, end) => ({ first, second, end })
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])

function cutEdge(start, end, depth, direction, style, shift) {
  if (!direction) return [line(end)]
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const size = Math.hypot(dx, dy)
  const at = (along, across) => [
    start[0] + dx * along + dy / size * across * direction * depth,
    start[1] + dy * along - dx / size * across * direction * depth,
  ]

  if (style === 'wiggle') {
    return [
      curve(at(.16, 0), at(.16, .94), at(.35 + shift, .74)),
      curve(at(.51 + shift, .54), at(.48 + shift, -.92), at(.69 + shift, -.7)),
      curve(at(.82, -.57), at(.85, 0), end),
    ]
  }

  const tab = (along, across) => at(along + shift, across)
  return [
    line(tab(.4, 0)),
    curve(tab(.45, 0), tab(.36, .29), tab(.36, .55)),
    curve(tab(.36, 1.02), tab(.64, 1.02), tab(.64, .55)),
    curve(tab(.64, .29), tab(.55, 0), tab(.6, 0)),
    line(end),
  ]
}

function reverseEdge(start, segments) {
  return segments.map((segment, index) => {
    const end = index ? segments[index - 1].end : start
    return segment.first ? curve(segment.second, segment.first, end) : line(end)
  }).reverse()
}

function makePiece(vertices, segments, width, height) {
  let path = 'M ' + coordinate(vertices[0])
  const points = [vertices[0]]
  for (const segment of segments) {
    if (segment.first) {
      path += ' C ' + [segment.first, segment.second, segment.end].map(coordinate).join(' ')
      points.push(segment.first, segment.second)
    } else {
      path += ' L ' + coordinate(segment.end)
    }
    points.push(segment.end)
  }

  const bounds = {
    left: Math.min(...points.map(([x]) => x)),
    right: Math.max(...points.map(([x]) => x)),
    top: Math.min(...points.map(([, y]) => y)),
    bottom: Math.max(...points.map(([, y]) => y)),
  }
  const x = vertices.reduce((sum, point) => sum + point[0], 0) / vertices.length
  const y = vertices.reduce((sum, point) => sum + point[1], 0) / vertices.length
  const atBorder = ([x, y], [nextX, nextY]) =>
    (Math.abs(x - nextX) < .001 && (Math.abs(x) < .001 || Math.abs(x - width) < .001)) ||
    (Math.abs(y - nextY) < .001 && (Math.abs(y) < .001 || Math.abs(y - height) < .001))

  const edge = vertices.some((point, index) => {
    const next = vertices[(index + 1) % vertices.length]
    return distance(point, next) > .001 && atBorder(point, next)
  })
  return { path: path + ' Z', bounds, x, y, edge }
}

function polygon(vertices, width, height) {
  return makePiece(vertices, [...vertices.slice(1), vertices[0]].map(line), width, height)
}

function jigsaw(width, height, count, style, repeating, random) {
  const { columns, rows } = grid(count, width / height)
  const dx = width / columns
  const dy = height / rows
  const point = (column, row) => [column * dx, row * dy]
  const edge = (column, row, vertical, outer) => {
    const start = point(column, row)
    const end = point(column + Number(!vertical), row + Number(vertical))
    const direction = repeating ? ((column + row) % 2 ? 1 : -1) : (random() < .5 ? -1 : 1)
    const depth = Math.min(dx, dy) * (repeating ? .23 : .205 + .055 * random())
    const shift = repeating ? 0 : (random() - .5) * .12
    return cutEdge(start, end, depth, outer ? 0 : direction, style, shift)
  }
  const horizontal = Array.from({ length: rows + 1 }, (_, row) =>
    Array.from({ length: columns }, (_, column) => edge(column, row, false, row === 0 || row === rows)))
  const vertical = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns + 1 }, (_, column) => edge(column, row, true, column === 0 || column === columns)))

  const pieces = []
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const topLeft = point(column, row)
      const topRight = point(column + 1, row)
      const bottomRight = point(column + 1, row + 1)
      const bottomLeft = point(column, row + 1)
      const segments = [
        ...horizontal[row][column],
        ...vertical[row][column + 1],
        ...reverseEdge(bottomLeft, horizontal[row + 1][column]),
        ...reverseEdge(topLeft, vertical[row][column]),
      ]
      pieces.push(makePiece([topLeft, topRight, bottomRight, bottomLeft], segments, width, height))
    }
  }
  return pieces
}

function triangles(width, height, count, repeating, random) {
  const { columns, rows } = grid(count / 2, width / height)
  const dx = width / columns
  const dy = height / rows
  const vertices = Array.from({ length: rows + 1 }, (_, row) => Array.from({ length: columns + 1 }, (_, column) => {
    const offset = (index, last, other) => {
      if (index === 0 || index === last) return 0
      return repeating ? (other % 2 ? .12 : -.12) : (random() - .5) * .4
    }
    return [(column + offset(column, columns, row)) * dx, (row + offset(row, rows, column)) * dy]
  }))
  const pieces = []
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const a = vertices[row][column]
      const b = vertices[row][column + 1]
      const c = vertices[row + 1][column + 1]
      const d = vertices[row + 1][column]
      const slash = repeating ? (row + column) % 2 : random() < .5
      const pair = slash ? [[a, b, d], [b, c, d]] : [[a, b, c], [a, c, d]]
      pieces.push(...pair.map(points => polygon(points, width, height)))
    }
  }
  return pieces
}

function squareTiling(width, height, count, repeating, random) {
  // Choose a near-matching aspect and an achievable number of quadtree leaves.
  const ratio = width / height
  let best = { score: Infinity }
  for (let columns = 1; columns <= 22; columns++) {
    for (let rows = 1; rows <= 22; rows++) {
      const blocks = columns * rows
      const splits = Math.round((count - blocks) / 3)
      if (splits < 1 || splits >= blocks) continue
      const error = Math.abs(Math.log(columns / rows / ratio))
      const score = error * 1.4 + Math.abs(blocks + 3 * splits - count) / count + Math.abs(splits / blocks - .52) * .3
      if (score < best.score) best = { columns, rows, blocks, splits, score }
    }
  }
  const { columns, rows, blocks, splits } = best
  const tile = 1000 / Math.max(columns, rows)
  width = columns * tile
  height = rows * tile
  const indices = Array.from({ length: blocks }, (_, index) => index)
  const checker = index => (index % columns + Math.floor(index / columns)) % 2
  const order = repeating ? indices.sort((a, b) => checker(b) - checker(a)) : shuffle(indices, random)
  const splitBlocks = new Set(order.slice(0, splits))
  const rectangle = (x, y, size) => polygon([[x, y], [x + size, y], [x + size, y + size], [x, y + size]], width, height)
  const pieces = []
  for (let index = 0; index < blocks; index++) {
    const x = (index % columns) * tile
    const y = Math.floor(index / columns) * tile
    if (splitBlocks.has(index)) {
      const half = tile / 2
      pieces.push(rectangle(x, y, half), rectangle(x + half, y, half),
        rectangle(x, y + half, half), rectangle(x + half, y + half, half))
    } else {
      pieces.push(rectangle(x, y, tile))
    }
  }
  return { width, height, pieces }
}

function clipCell(vertices, site, other) {
  const vx = other[0] - site[0]
  const vy = other[1] - site[1]
  const cx = (other[0] + site[0]) / 2
  const cy = (other[1] + site[1]) / 2
  const separation = ([x, y]) => (x - cx) * vx + (y - cy) * vy
  const clipped = []
  for (let index = 0; index < vertices.length; index++) {
    const start = vertices[index]
    const end = vertices[(index + 1) % vertices.length]
    const from = separation(start)
    const to = separation(end)
    if (from <= 0) clipped.push(start)
    if ((from <= 0) !== (to <= 0)) {
      const fraction = from / (from - to)
      clipped.push([start[0] + (end[0] - start[0]) * fraction, start[1] + (end[1] - start[1]) * fraction])
    }
  }
  return clipped
}

function mosaic(width, height, count, repeating, random) {
  const { columns, rows } = grid(count, width / height * .866)
  const dx = width / columns
  const dy = height / rows
  const points = Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / columns)
    const column = index % columns
    const wobble = () => repeating ? 0 : (random() - .5) * .32
    return [(column + (row % 2 ? .75 : .25) + wobble()) * dx, (row + .5 + wobble()) * dy]
  })
  return points.map(site => {
    let vertices = [[0, 0], [width, 0], [width, height], [0, height]]
    for (const other of points) {
      if (site !== other) vertices = clipCell(vertices, site, other)
    }
    return polygon(vertices, width, height)
  })
}

export function generatePuzzle(photo, settings) {
  const { count, seed, pattern } = settings
  const random = randomFrom(seed)
  const choices = Object.keys(shapes).filter(shape => shape !== 'surprise')
  const shape = settings.shape === 'surprise' ? choices[Math.floor(random() * choices.length)] : settings.shape
  const repeating = pattern === 'repeating'
  const scale = 1000 / Math.max(photo.width, photo.height)
  let width = photo.width * scale
  let height = photo.height * scale
  let pieces
  if (shape === 'squares') {
    ({ width, height, pieces } = squareTiling(width, height, count, repeating, random))
  } else if (shape === 'triangles') {
    pieces = triangles(width, height, count, repeating, random)
  } else if (shape === 'mosaic') {
    pieces = mosaic(width, height, count, repeating, random)
  } else {
    pieces = jigsaw(width, height, count, shape, repeating, random)
  }
  pieces.forEach((piece, id) => {
    const closest = Math.min(...pieces.filter(other => other !== piece).map(other =>
      Math.hypot(other.x - piece.x, other.y - piece.y)))
    piece.id = id
    piece.snap = closest * .44
  })
  return { width, height, pieces, shape }
}
