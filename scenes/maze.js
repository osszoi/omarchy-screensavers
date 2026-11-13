.pragma library

var EAST = 1, SOUTH = 2

// Depth-first carver. links[cell] has EAST and/or SOUTH set when that wall is open.
function carver(cols, rows, random) {
  var start = Math.floor(random() * cols * rows)
  var seen = new Uint8Array(cols * rows)
  seen[start] = 1
  return { cols: cols, rows: rows, random: random, links: new Uint8Array(cols * rows), seen: seen, stack: [start], head: start, done: false }
}

function link(maze, a, b) {
  var low = Math.min(a, b)
  maze.links[low] |= Math.abs(a - b) === 1 ? EAST : SOUTH
}

function linked(links, cols, a, b) {
  var low = Math.min(a, b)
  return (links[low] & (Math.abs(a - b) === 1 ? EAST : SOUTH)) !== 0
}

function neighbours(cols, rows, cell) {
  var x = cell % cols, list = []
  if (x > 0) list.push(cell - 1)
  if (x < cols - 1) list.push(cell + 1)
  if (cell >= cols) list.push(cell - cols)
  if (cell < cols * (rows - 1)) list.push(cell + cols)
  return list
}

// carves up to `count` new cells, returns [from, to, from, to, ...]
function carve(maze, count) {
  var moves = []
  while (moves.length < count * 2 && maze.stack.length) {
    var cell = maze.stack[maze.stack.length - 1]
    var around = neighbours(maze.cols, maze.rows, cell)
    var free = []
    for (var i = 0; i < around.length; i++) if (!maze.seen[around[i]]) free.push(around[i])
    if (!free.length) { maze.stack.pop(); continue }
    var next = free[Math.floor(maze.random() * free.length)]
    link(maze, cell, next)
    maze.seen[next] = 1
    maze.stack.push(next)
    moves.push(cell, next)
  }
  maze.head = maze.stack.length ? maze.stack[maze.stack.length - 1] : -1
  maze.done = maze.stack.length === 0
  return moves
}

// Breadth-first flood from start, it stops the moment it touches the goal.
function solver(links, cols, rows, start, goal) {
  var from = new Int32Array(cols * rows).fill(-1)
  var dist = new Int32Array(cols * rows).fill(-1)
  from[start] = start
  dist[start] = 0
  return { links: links, cols: cols, rows: rows, goal: goal, from: from, dist: dist, queue: [start], at: 0, done: false }
}

// visits up to `count` cells, returns them
function flood(search, count) {
  var visited = []
  while (visited.length < count && search.at < search.queue.length && !search.done) {
    var cell = search.queue[search.at++]
    visited.push(cell)
    if (cell === search.goal) { search.done = true; break }
    var around = neighbours(search.cols, search.rows, cell)
    for (var i = 0; i < around.length; i++) {
      var next = around[i]
      if (search.from[next] >= 0 || !linked(search.links, search.cols, cell, next)) continue
      search.from[next] = cell
      search.dist[next] = search.dist[cell] + 1
      search.queue.push(next)
    }
  }
  if (search.at >= search.queue.length) search.done = true
  return visited
}

function path(search, start) {
  var cells = [], cell = search.goal
  if (search.from[cell] < 0) return cells
  while (cell !== start) { cells.push(cell); cell = search.from[cell] }
  cells.push(start)
  return cells.reverse()
}
