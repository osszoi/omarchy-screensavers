.pragma library

function rng(seed) {
  var state = seed >>> 0
  return function() {
    state = (state + 0x6D2B79F5) | 0
    var t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 1 = rock, 0 = open
function noise(cols, rows, random, fill) {
  var grid = new Uint8Array(cols * rows)
  for (var i = 0; i < grid.length; i++) grid[i] = random() < fill ? 1 : 0
  return grid
}

function rockAround(grid, cols, rows, x, y, reach) {
  var count = 0
  for (var dy = -reach; dy <= reach; dy++) {
    for (var dx = -reach; dx <= reach; dx++) {
      var nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || grid[ny * cols + nx]) count++
    }
  }
  return count
}

// the classic 4-5 rule, plus "fill big empty rooms" on the early passes so the cave keeps its pillars
function erode(grid, cols, rows, pass) {
  var next = new Uint8Array(cols * rows)
  for (var y = 0; y < rows; y++) {
    for (var x = 0; x < cols; x++) {
      var edge = x === 0 || y === 0 || x === cols - 1 || y === rows - 1
      var rock = edge || rockAround(grid, cols, rows, x, y, 1) >= 5
      if (!rock && pass < 3) rock = rockAround(grid, cols, rows, x, y, 2) <= 2
      next[y * cols + x] = rock ? 1 : 0
    }
  }
  return next
}

// labels every cavern: { label: region id per cell (-1 for rock), sizes: cells per region }
function caverns(grid, cols, rows) {
  var label = new Int32Array(cols * rows).fill(-1)
  var sizes = []
  for (var start = 0; start < grid.length; start++) {
    if (grid[start] || label[start] >= 0) continue
    var id = sizes.length, size = 0, stack = [start]
    label[start] = id
    while (stack.length) {
      var cell = stack.pop()
      size++
      var x = cell % cols
      var around = [cell - cols, cell + cols, x > 0 ? cell - 1 : -1, x < cols - 1 ? cell + 1 : -1]
      for (var a = 0; a < 4; a++) {
        var next = around[a]
        if (next < 0 || next >= grid.length || grid[next] || label[next] >= 0) continue
        label[next] = id
        stack.push(next)
      }
    }
    sizes.push(size)
  }
  return { label: label, sizes: sizes }
}

// pockets too small to matter, as a list of cells to fill back in with rock
function pockets(map, smallest) {
  var cells = []
  for (var i = 0; i < map.label.length; i++) {
    if (map.label[i] >= 0 && map.sizes[map.label[i]] < smallest) cells.push(i)
  }
  return cells
}

// Joins every cavern that survived to the biggest one. Each tunnel starts at the two cells
// that sit closest together (out of a sample) and wanders a little on its way across.
// Returns the cells to open, in digging order.
function tunnels(grid, cols, rows, map, smallest, random) {
  var members = {}
  for (var i = 0; i < map.label.length; i++) {
    var id = map.label[i]
    if (id < 0 || map.sizes[id] < smallest) continue
    if (!members[id]) members[id] = []
    members[id].push(i)
  }
  var ids = Object.keys(members).sort(function(a, b) { return members[b].length - members[a].length })
  if (ids.length < 2) return []

  function sample(cells, count) {
    var picked = []
    for (var s = 0; s < count; s++) picked.push(cells[Math.floor(random() * cells.length)])
    return picked
  }

  var joined = members[ids[0]].slice()
  var dig = []
  for (var r = 1; r < ids.length; r++) {
    var from = sample(members[ids[r]], 60), to = sample(joined, 160)
    var best = Infinity, a = from[0], b = to[0]
    for (var f = 0; f < from.length; f++) {
      for (var t = 0; t < to.length; t++) {
        var dx = (from[f] % cols) - (to[t] % cols), dy = Math.floor(from[f] / cols) - Math.floor(to[t] / cols)
        var gap = dx * dx + dy * dy
        if (gap < best) { best = gap; a = from[f]; b = to[t] }
      }
    }
    var x = a % cols, y = Math.floor(a / cols)
    var tx = b % cols, ty = Math.floor(b / cols)
    var guard = cols + rows
    while ((x !== tx || y !== ty) && guard-- > 0) {
      // mostly towards the target, sometimes sideways, so tunnels are not ruler straight
      var wander = random()
      if (wander < 0.14 && y > 1 && y < rows - 2) y += random() < 0.5 ? 1 : -1
      else if (wander < 0.28 && x > 1 && x < cols - 2) x += random() < 0.5 ? 1 : -1
      else if (Math.abs(tx - x) > Math.abs(ty - y)) x += tx > x ? 1 : -1
      else y += ty > y ? 1 : -1
      for (var wy = 0; wy <= 1; wy++) {
        for (var wx = 0; wx <= 1; wx++) {
          var cx = x + wx, cy = y + wy
          if (cx < 1 || cy < 1 || cx >= cols - 1 || cy >= rows - 1) continue
          if (grid[cy * cols + cx]) dig.push(cy * cols + cx)
        }
      }
    }
    joined = joined.concat(members[ids[r]])
  }
  return dig
}

// open cells with no rock touching them
function roomyCells(grid, cols, rows) {
  var cells = []
  for (var y = 1; y < rows - 1; y++) {
    for (var x = 1; x < cols - 1; x++) {
      if (!grid[y * cols + x] && rockAround(grid, cols, rows, x, y, 1) === 0) cells.push(y * cols + x)
    }
  }
  return cells
}

// each new light goes where it is farthest from the ones already placed
function placeLights(grid, cols, rows, count, random) {
  var cells = roomyCells(grid, cols, rows)
  if (cells.length === 0) return []
  var lights = [cells[Math.floor(random() * cells.length)]]
  while (lights.length < count) {
    var best = -1, bestGap = -1
    for (var tries = 0; tries < 400; tries++) {
      var candidate = cells[Math.floor(random() * cells.length)]
      var gap = Infinity
      for (var i = 0; i < lights.length; i++) {
        var dx = (candidate % cols) - (lights[i] % cols)
        var dy = Math.floor(candidate / cols) - Math.floor(lights[i] / cols)
        gap = Math.min(gap, dx * dx + dy * dy)
      }
      if (gap > bestGap) { bestGap = gap; best = candidate }
    }
    lights.push(best)
  }
  return lights
}

// how far light has to walk from `start` to reach each open cell, it does not go through rock
function reach(grid, cols, rows, start, radius) {
  var dist = new Float64Array(cols * rows).fill(Infinity)
  var heap = [[0, start]]
  var cells = [], steps = []
  dist[start] = 0
  var moves = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]]
  while (heap.length) {
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
    var d = top[0], cell = top[1]
    if (d > dist[cell]) continue
    cells.push(cell); steps.push(d)
    var x = cell % cols, y = Math.floor(cell / cols)
    for (var m = 0; m < moves.length; m++) {
      var nx = x + moves[m][0], ny = y + moves[m][1]
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
      var next = ny * cols + nx, nd = d + moves[m][2]
      if (grid[next] || nd > radius || nd >= dist[next]) continue
      dist[next] = nd
      heap.push([nd, next])
      for (var c = heap.length - 1; c > 0;) {
        var parent = (c - 1) >> 1
        if (heap[parent][0] <= heap[c][0]) break
        var up = heap[parent]; heap[parent] = heap[c]; heap[c] = up; c = parent
      }
    }
  }
  return { cells: cells, steps: steps }
}

// Moves every light one step and adds what it gained into `total` (r, g, b per cell).
// A field lists its cells nearest first, so cells behind the soft front are done for good.
// lights: [{ field, color: [r, g, b] in 0..1, spread, power: Float32Array, settled: 0 }]
function spreadLight(lights, radius, total) {
  var changed = []
  var marked = {}
  for (var i = 0; i < lights.length; i++) {
    var light = lights[i]
    if (light.spread <= 0) continue
    var cells = light.field.cells, steps = light.field.steps
    for (var c = light.settled; c < cells.length; c++) {
      var d = steps[c]
      if (d > light.spread) break
      var falloff = 1 - d / radius
      var front = Math.min(1, (light.spread - d) / 3)
      var power = Math.pow(falloff, 2.8) * front
      var gained = power - light.power[c]
      if (gained !== 0) {
        light.power[c] = power
        var at = cells[c] * 3
        total[at] += light.color[0] * gained
        total[at + 1] += light.color[1] * gained
        total[at + 2] += light.color[2] * gained
        if (!marked[cells[c]]) { marked[cells[c]] = true; changed.push(cells[c]) }
      }
      if (front >= 1 && c === light.settled) light.settled++
    }
  }
  return changed
}

// Biomes start from a few seeds and race each other through the open cave, a fixed number of
// cells per step each, so they end up with regions of similar size and ragged borders.
function biomeFlood(grid, cols, rows, seeds) {
  var owner = new Int8Array(cols * rows).fill(-1)
  var queues = []
  for (var i = 0; i < seeds.length; i++) {
    owner[seeds[i]] = i
    queues.push({ cells: [seeds[i]], at: 0 })
  }
  return { grid: grid, cols: cols, rows: rows, owner: owner, queues: queues, done: false }
}

// returns the cells claimed this step
function growBiomes(flood, perBiome) {
  var claimed = []
  var alive = false
  for (var b = 0; b < flood.queues.length; b++) {
    var queue = flood.queues[b]
    var budget = perBiome
    while (budget > 0 && queue.at < queue.cells.length) {
      var cell = queue.cells[queue.at++]
      var x = cell % flood.cols, w = flood.cols
      var left = x > 0, right = x < w - 1
      // diagonals too, a four-way flood grows in diamonds and it shows
      var around = [cell - w, cell + w, left ? cell - 1 : -1, right ? cell + 1 : -1,
                    left ? cell - w - 1 : -1, right ? cell - w + 1 : -1, left ? cell + w - 1 : -1, right ? cell + w + 1 : -1]
      for (var a = 0; a < 8; a++) {
        var next = around[a]
        if (next < 0 || next >= flood.grid.length || flood.grid[next] || flood.owner[next] >= 0) continue
        flood.owner[next] = b
        queue.cells.push(next)
        claimed.push(next)
        budget--
      }
    }
    if (queue.at < queue.cells.length) alive = true
  }
  flood.done = !alive
  return claimed
}

// rock takes the biome of the nearest claimed cell, so the walls can be tinted too
function claimRock(flood) {
  var owner = flood.owner, cols = flood.cols
  var queue = []
  for (var i = 0; i < owner.length; i++) if (owner[i] >= 0) queue.push(i)
  for (var at = 0; at < queue.length; at++) {
    var cell = queue[at], x = cell % cols
    var around = [cell - cols, cell + cols, x > 0 ? cell - 1 : -1, x < cols - 1 ? cell + 1 : -1]
    for (var a = 0; a < 4; a++) {
      var next = around[a]
      if (next < 0 || next >= owner.length || owner[next] >= 0) continue
      owner[next] = owner[cell]
      queue.push(next)
    }
  }
}

// A few pools per biome, grown out of the roomiest spots and kept away from the walls.
// Returns the cells in filling order.
function pools(grid, cols, rows, owner, biomes, random) {
  var roomy = []
  for (var b = 0; b < biomes; b++) roomy.push([])
  for (var y = 2; y < rows - 2; y++) {
    for (var x = 2; x < cols - 2; x++) {
      var cell = y * cols + x
      if (!grid[cell] && owner[cell] >= 0 && rockAround(grid, cols, rows, x, y, 2) === 0) roomy[owner[cell]].push(cell)
    }
  }
  var taken = new Uint8Array(cols * rows)
  var filled = []
  var largest = Math.max(24, Math.round(cols * rows * 0.0022))
  for (var biome = 0; biome < biomes; biome++) {
    var spots = roomy[biome]
    var count = Math.min(3, Math.floor(spots.length / 40))
    for (var p = 0; p < count; p++) {
      var seed = spots[Math.floor(random() * spots.length)]
      if (taken[seed]) continue
      var size = Math.round(largest * (0.35 + random() * 0.65))
      var queue = [seed]
      taken[seed] = 1
      for (var at = 0; at < queue.length && at < size; at++) {
        var here = queue[at], hx = here % cols, hy = Math.floor(here / cols)
        filled.push(here)
        var around = [here - cols, here + cols, here - 1, here + 1]
        for (var a = 0; a < 4; a++) {
          var next = around[a]
          var nx = next % cols, ny = Math.floor(next / cols)
          if (taken[next] || grid[next] || owner[next] !== biome) continue
          if (rockAround(grid, cols, rows, nx, ny, 1) !== 0 || random() < 0.22) continue
          taken[next] = 1
          queue.push(next)
        }
      }
    }
  }
  return filled
}
