.pragma library

// Smooth random field in 0..1: a coarse grid of random values, eased between its points.
function field(cols, rows, scale, random) {
  var gw = Math.ceil(cols / scale) + 2, gh = Math.ceil(rows / scale) + 2
  var knots = new Float32Array(gw * gh)
  for (var k = 0; k < knots.length; k++) knots[k] = random()
  var out = new Float32Array(cols * rows)
  for (var y = 0; y < rows; y++) {
    var fy = y / scale, y0 = Math.floor(fy), ty = fy - y0
    ty = ty * ty * (3 - 2 * ty)
    for (var x = 0; x < cols; x++) {
      var fx = x / scale, x0 = Math.floor(fx), tx = fx - x0
      tx = tx * tx * (3 - 2 * tx)
      var a = knots[y0 * gw + x0], b = knots[y0 * gw + x0 + 1]
      var c = knots[(y0 + 1) * gw + x0], d = knots[(y0 + 1) * gw + x0 + 1]
      out[y * cols + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty
    }
  }
  return out
}

function layered(cols, rows, scales, weights, random) {
  var out = new Float32Array(cols * rows), total = 0
  for (var s = 0; s < scales.length; s++) {
    var layer = field(cols, rows, scales[s], random)
    for (var i = 0; i < out.length; i++) out[i] += layer[i] * weights[s]
    total += weights[s]
  }
  for (var n = 0; n < out.length; n++) out[n] /= total
  return out
}

// every value replaced by its rank in 0..1, so a field always covers the same spread
// no matter how the dice fell
function ranked(values) {
  var order = []
  for (var i = 0; i < values.length; i++) order.push(i)
  order.sort(function(a, b) { return values[a] - values[b] })
  var out = new Float32Array(values.length)
  for (var r = 0; r < order.length; r++) out[order[r]] = r / (order.length - 1)
  return out
}

// Water and land as random specks, a little wetter where a slow field says so,
// so the lakes that survive end up gathered in a few districts.
function soup(cols, rows, random, wet) {
  var lean = ranked(layered(cols, rows, [44, 18], [1, 0.5], random))
  var water = new Uint8Array(cols * rows)
  var chance = new Float32Array(cols * rows)
  for (var i = 0; i < water.length; i++) {
    chance[i] = wet + (lean[i] - 0.5) * 0.5
    water[i] = random() < chance[i] ? 1 : 0
  }
  return { cols: cols, rows: rows, random: random, water: water, chance: chance }
}

// One breath of the map: `count` cells picked anywhere each take the side of their
// neighbours. Nothing sweeps, the whole surface settles at once. While `heat` is high a share
// of them ignore the neighbours and roll the dice instead, so the map keeps boiling and only
// calms down as the heat drains away. Returns the cells that flipped.
function mutate(world, count, heat) {
  var cols = world.cols, rows = world.rows, water = world.water, random = world.random
  var flipped = []
  for (var n = 0; n < count; n++) {
    var x = Math.floor(random() * cols), y = Math.floor(random() * rows)
    var next
    if (heat > 0 && random() < heat) {
      next = random() < world.chance[y * cols + x] ? 1 : 0
    } else {
      var wet = 0
      for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
          var nx = x + dx, ny = y + dy
          if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && water[ny * cols + nx]) wet++
        }
      }
      next = wet >= 5 ? 1 : 0
    }
    var cell = y * cols + x
    if (water[cell] !== next) { water[cell] = next; flipped.push(cell) }
  }
  return flipped
}

// how hot the map still is, `progress` going 0..1 over the settling: it cools on a curve
// and the last fifth is left alone to set
function heatAt(progress) {
  if (progress >= 0.8) return 0
  var left = 1 - progress / 0.8
  return 0.42 * left * left
}

// puddles smaller than `smallest` dry up, returns their cells
function puddles(world, smallest) {
  var cols = world.cols, water = world.water
  var seen = new Uint8Array(water.length)
  var dry = []
  for (var start = 0; start < water.length; start++) {
    if (!water[start] || seen[start]) continue
    var body = [start]
    seen[start] = 1
    for (var at = 0; at < body.length; at++) {
      var cell = body[at], x = cell % cols
      var around = [cell - cols, cell + cols, x > 0 ? cell - 1 : -1, x < cols - 1 ? cell + 1 : -1]
      for (var a = 0; a < 4; a++) {
        var next = around[a]
        if (next < 0 || next >= water.length || !water[next] || seen[next]) continue
        seen[next] = 1
        body.push(next)
      }
    }
    if (body.length < smallest) for (var b = 0; b < body.length; b++) dry.push(body[b])
  }
  return dry
}

// distance in cells from every cell where mask is 0 to the nearest cell where it is 1
function distance(mask, cols, rows) {
  var far = cols + rows
  var d = new Float32Array(cols * rows)
  for (var i = 0; i < d.length; i++) d[i] = mask[i] ? 0 : far
  for (var y = 0; y < rows; y++) {
    for (var x = 0; x < cols; x++) {
      var at = y * cols + x, best = d[at]
      if (x > 0) best = Math.min(best, d[at - 1] + 1)
      if (y > 0) best = Math.min(best, d[at - cols] + 1)
      if (x > 0 && y > 0) best = Math.min(best, d[at - cols - 1] + 1.414)
      if (x < cols - 1 && y > 0) best = Math.min(best, d[at - cols + 1] + 1.414)
      d[at] = best
    }
  }
  for (var by = rows - 1; by >= 0; by--) {
    for (var bx = cols - 1; bx >= 0; bx--) {
      var b = by * cols + bx, low = d[b]
      if (bx < cols - 1) low = Math.min(low, d[b + 1] + 1)
      if (by < rows - 1) low = Math.min(low, d[b + cols] + 1)
      if (bx < cols - 1 && by < rows - 1) low = Math.min(low, d[b + cols + 1] + 1.414)
      if (bx > 0 && by < rows - 1) low = Math.min(low, d[b + cols - 1] + 1.414)
      d[b] = low
    }
  }
  return d
}

var BIOMES = ["beach", "desert", "mesa", "savanna", "steppe", "grass", "forest", "swamp", "rainforest", "jungle", "taiga", "tundra", "rock", "snow"]
var WOODED = { forest: true, swamp: true, rainforest: true, jungle: true, taiga: true }
var HIGH = { rock: true, snow: true }

// Heights rise away from the water and get roughed up by noise. Climate then picks a biome
// per cell: hot and dry is desert, wet is forest, cold is tundra, high is rock and snow.
function terrain(world) {
  var cols = world.cols, rows = world.rows, water = world.water, random = world.random
  var land = new Uint8Array(water.length)
  for (var i = 0; i < water.length; i++) land[i] = water[i] ? 0 : 1
  var inland = distance(water, cols, rows)
  var offshore = distance(land, cols, rows)
  var rough = ranked(layered(cols, rows, [36, 16, 7, 3], [1, 0.6, 0.35, 0.15], random))
  var warm = layered(cols, rows, [70, 26], [1, 0.4], random)
  var damp = layered(cols, rows, [60, 24, 10], [1, 0.5, 0.2], random)

  var elev = new Float32Array(water.length)
  var depth = new Float32Array(water.length)
  var biome = new Uint8Array(water.length)
  for (var c = 0; c < water.length; c++) {
    if (water[c]) {
      depth[c] = Math.min(1, offshore[c] / 9)
      continue
    }
    // mostly the noise, lifted a little inland, and always gentle right at the shore
    var reach = Math.min(1, inland[c] / 40)
    var e = (rough[c] * 0.74 + reach * 0.26) * Math.min(1, 0.25 + inland[c] / 8)
    elev[c] = e
    var y = Math.floor(c / cols)
    var lat = Math.abs(y / (rows - 1) * 2 - 1)
    var temp = 0.9 - lat * 0.42 - Math.max(0, e - 0.6) * 1.1 + (warm[c] - 0.5) * 0.85
    var moist = damp[c] * 0.8 + Math.exp(-inland[c] / 9) * 0.5
    var name
    if (e > 0.9) name = "snow"
    else if (e > 0.8) name = "rock"
    else if (inland[c] < 1.5 && temp > 0.25) name = "beach"
    else if (temp < 0.2) name = "snow"
    else if (temp < 0.36) name = moist < 0.45 ? "tundra" : "taiga"
    else if (temp < 0.64) name = moist < 0.3 ? "steppe" : moist < 0.55 ? "grass" : moist < 0.82 ? "forest" : "swamp"
    else name = moist < 0.22 && e > 0.45 ? "mesa" : moist < 0.3 ? "desert" : moist < 0.46 ? "savanna" : moist < 0.72 ? "rainforest" : "jungle"
    biome[c] = BIOMES.indexOf(name)
  }
  return { elev: elev, depth: depth, biome: biome, inland: inland }
}

// Something spreading by contact: only cells in `allowed` take part, it starts from `seeds`
// and every step a number of cells on the edge of what is already covered join in, picked
// at random, so it creeps outward in ragged patches instead of marching in a line.
function creep(cols, rows, allowed, seeds, random) {
  var state = { cols: cols, rows: rows, allowed: allowed, random: random, covered: new Uint8Array(cols * rows), edge: [], left: 0, done: false }
  for (var i = 0; i < allowed.length; i++) if (allowed[i]) state.left++
  for (var s = 0; s < seeds.length; s++) if (allowed[seeds[s]] && !state.covered[seeds[s]]) { state.covered[seeds[s]] = 2; state.edge.push(seeds[s]) }
  return state
}

// covered: 0 untouched, 2 queued on the edge, 1 joined. Returns the cells that joined.
function advance(state, count) {
  var cols = state.cols, edge = state.edge, joined = []
  while (joined.length < count && edge.length) {
    var pick = Math.floor(state.random() * edge.length)
    var cell = edge[pick]
    edge[pick] = edge[edge.length - 1]
    edge.pop()
    state.covered[cell] = 1
    state.left--
    joined.push(cell)
    var x = cell % cols
    var around = [cell - cols, cell + cols, x > 0 ? cell - 1 : -1, x < cols - 1 ? cell + 1 : -1]
    for (var a = 0; a < 4; a++) {
      var next = around[a]
      if (next < 0 || next >= state.allowed.length || !state.allowed[next] || state.covered[next]) continue
      state.covered[next] = 2
      edge.push(next)
    }
  }
  if (!edge.length && state.left > 0) {
    // an island of allowed cells nothing has reached: start it off on its own
    for (var i = 0; i < state.allowed.length; i++) {
      if (state.allowed[i] && !state.covered[i]) { state.covered[i] = 2; edge.push(i); break }
    }
  }
  state.done = state.left <= 0
  return joined
}

// Which way water runs off every land cell. The map is flooded from the lakes upward, lowest
// ground first, and each cell remembers the neighbour the flood reached it from. Following
// those always ends in water, even out of a hollow, which plain "go to the lowest neighbour"
// does not.
function drainage(world, land) {
  var cols = world.cols, rows = world.rows, water = world.water
  var down = new Int32Array(water.length).fill(-1)
  var seen = new Uint8Array(water.length)
  var heap = []
  function push(level, cell) {
    heap.push([level, cell])
    for (var c = heap.length - 1; c > 0;) {
      var parent = (c - 1) >> 1
      if (heap[parent][0] <= heap[c][0]) break
      var up = heap[parent]; heap[parent] = heap[c]; heap[c] = up; c = parent
    }
  }
  function pop() {
    var top = heap[0], last = heap.pop()
    if (heap.length) {
      heap[0] = last
      for (var i = 0; ;) {
        var l = i * 2 + 1, r = l + 1, small = i
        if (l < heap.length && heap[l][0] < heap[small][0]) small = l
        if (r < heap.length && heap[r][0] < heap[small][0]) small = r
        if (small === i) break
        var swap = heap[i]; heap[i] = heap[small]; heap[small] = swap; i = small
      }
    }
    return top
  }
  for (var w = 0; w < water.length; w++) if (water[w]) { seen[w] = 1; push(0, w) }
  while (heap.length) {
    var top = pop(), level = top[0], cell = top[1]
    var x = cell % cols, y = Math.floor(cell / cols)
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        var nx = x + dx, ny = y + dy
        if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
        var next = ny * cols + nx
        if (seen[next]) continue
        seen[next] = 1
        down[next] = cell
        push(Math.max(level, land.elev[next]), next)
      }
    }
  }
  return down
}

// Rivers start on high ground and follow the drainage down to a lake, joining any river they
// meet on the way. Each one is a list of cells, source first.
function rivers(world, land, count) {
  var cols = world.cols, rows = world.rows, water = world.water, random = world.random
  var down = drainage(world, land)
  var found = []
  var taken = new Uint8Array(water.length)
  for (var tries = 0; tries < count * 20 && found.length < count; tries++) {
    var cell = Math.floor(random() * water.length)
    if (water[cell] || land.elev[cell] < 0.55 || taken[cell]) continue
    var path = []
    while (cell >= 0 && !water[cell] && !taken[cell] && path.length < cols + rows) {
      path.push(cell)
      cell = down[cell]
    }
    if (cell < 0 || path.length < 14) continue
    for (var p = 0; p < path.length; p++) taken[path[p]] = 1
    found.push(path)
  }
  return found
}

var HOMELY = { beach: true, savanna: true, steppe: true, grass: true, forest: true, rainforest: true, taiga: true }

// Where people would have settled: low, liveable ground close to a lake or a river, and not
// on top of each other. Returns the cells, in the order their lights come on.
function settlements(world, land, flows, count) {
  var cols = world.cols, rows = world.rows, random = world.random
  var byRiver = new Uint8Array(world.water.length)
  for (var f = 0; f < flows.length; f++) for (var p = 0; p < flows[f].length; p++) byRiver[flows[f][p]] = 1
  var apart = Math.max(6, Math.round(Math.sqrt(cols * rows / count) * 0.55))
  var towns = []
  for (var tries = 0; tries < count * 60 && towns.length < count; tries++) {
    var x = 2 + Math.floor(random() * (cols - 4)), y = 2 + Math.floor(random() * (rows - 4))
    var cell = y * cols + x
    if (world.water[cell] || !HOMELY[BIOMES[land.biome[cell]]] || land.elev[cell] > 0.55) continue
    var close = land.inland[cell] < 7
    for (var dy = -2; dy <= 2 && !close; dy++) for (var dx = -2; dx <= 2; dx++) if (byRiver[cell + dy * cols + dx]) { close = true; break }
    if (!close) continue
    var crowded = false
    for (var t = 0; t < towns.length; t++) {
      var tx = towns[t] % cols - x, ty = Math.floor(towns[t] / cols) - y
      if (tx * tx + ty * ty < apart * apart) { crowded = true; break }
    }
    if (!crowded) towns.push(cell)
  }
  return towns
}
