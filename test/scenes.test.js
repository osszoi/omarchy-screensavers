const fs = require("fs")
const path = require("path")
const vm = require("vm")
const assert = require("assert")

function load(name) {
  const src = fs.readFileSync(path.join(__dirname, "..", "scenes", name), "utf8").replace(/^\.pragma library\s*$/m, "")
  const context = {}
  vm.createContext(context)
  vm.runInContext(src, context)
  return context
}

const { rng } = load("cave.js")
const M = load("maze.js")
const C = load("circuit.js")

for (const seed of [3, 77, 2024]) {
  const cols = 320, rows = 90
  const maze = M.carver(cols, rows, rng(seed))
  let carved = 1, steps = 0
  while (!maze.done) { carved += M.carve(maze, 40).length / 2; steps++ }
  assert.strictEqual(carved, cols * rows, "every cell is carved exactly once")
  const open = maze.links.reduce((n, v) => n + (v & 1) + ((v & 2) >> 1), 0)
  assert.strictEqual(open, cols * rows - 1, "a perfect maze has cells - 1 openings")

  const start = Math.floor(rows / 2) * cols, goal = start + cols - 1
  const search = M.solver(maze.links, cols, rows, start, goal)
  let visited = 0
  while (!search.done) visited += M.flood(search, 60).length
  const way = M.path(search, start)
  assert.strictEqual(way[0], start)
  assert.strictEqual(way[way.length - 1], goal)
  for (let i = 1; i < way.length; i++) assert(M.linked(maze.links, cols, way[i - 1], way[i]), "the path never walks through a wall")
  console.log(`maze seed ${seed}: carved in ${steps} steps, search visited ${visited}, path ${way.length} cells`)

  const traces = C.route(cols, rows, rng(seed))
  const owner = new Map()
  let cells = 0
  traces.forEach((trace, index) => {
    assert(trace.length >= 8)
    for (let i = 0; i < trace.length; i += 2) {
      const x = trace[i], y = trace[i + 1]
      assert(x >= 0 && y >= 0 && x < cols && y < rows, "trace stays on the board")
      const key = y * cols + x
      assert(!owner.has(key), "two traces never share a cell")
      owner.set(key, index)
      if (i) assert(Math.abs(x - trace[i - 2]) <= 1 && Math.abs(y - trace[i - 1]) <= 1, "a trace moves one cell at a time")
      cells++
    }
  })
  console.log(`circuit seed ${seed}: ${traces.length} traces over ${cells} cells`)
}
console.log("ok")
