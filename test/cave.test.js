const fs = require("fs")
const path = require("path")
const vm = require("vm")
const assert = require("assert")

const src = fs.readFileSync(path.join(__dirname, "..", "scenes", "cave.js"), "utf8").replace(/^\.pragma library\s*$/m, "")
const S = {}
vm.createContext(S)
vm.runInContext(src, S)

const cols = 512, rows = 144
for (const seed of [1, 7, 42, 1234, 99999]) {
  const random = S.rng(seed)
  let grid = S.noise(cols, rows, random, 0.51)
  for (let pass = 0; pass < 7; pass++) grid = S.erode(grid, cols, rows, pass)
  const open = grid.reduce((n, v) => n + (v ? 0 : 1), 0) / grid.length
  assert(open > 0.25 && open < 0.7, `seed ${seed}: open ratio ${open.toFixed(2)} out of range`)
  for (let x = 0; x < cols; x++) assert(grid[x] === 1 && grid[(rows - 1) * cols + x] === 1, "border must be rock")

  const smallest = Math.round(cols * rows * 0.004)
  let map = S.caverns(grid, cols, rows)
  assert.strictEqual(map.sizes.reduce((n, v) => n + v, 0), grid.reduce((n, v) => n + (v ? 0 : 1), 0), "every open cell belongs to a cavern")
  for (const cell of S.pockets(map, smallest)) grid[cell] = 1
  map = S.caverns(grid, cols, rows)
  assert(map.sizes.every((size) => size >= smallest), "no pocket survives the cull")
  const before = map.sizes.length
  const dig = S.tunnels(grid, cols, rows, map, smallest, random)
  for (const cell of dig) {
    const x = cell % cols, y = Math.floor(cell / cols)
    assert(x > 0 && y > 0 && x < cols - 1 && y < rows - 1, "tunnels never break the outer wall")
    grid[cell] = 0
  }
  assert.strictEqual(S.caverns(grid, cols, rows).sizes.length, 1, `tunnels join all ${before} caverns into one`)

  const seeds = S.placeLights(grid, cols, rows, 5, random)
  const flood = S.biomeFlood(grid, cols, rows, seeds)
  let grown = seeds.length, biomeSteps = 0
  while (!flood.done) { grown += S.growBiomes(flood, 60).length; biomeSteps++ }
  assert.strictEqual(grown, grid.reduce((n, v) => n + (v ? 0 : 1), 0), "biomes end up owning every open cell")
  const share = seeds.map((_, b) => flood.owner.reduce((n, v) => n + (v === b ? 1 : 0), 0))
  assert(share.every((cells) => cells > grown * 0.04), `no biome is squeezed out: ${share}`)
  S.claimRock(flood)
  assert(flood.owner.every((v) => v >= 0), "rock gets a biome too")
  const pool = S.pools(grid, cols, rows, flood.owner, seeds.length, random)
  assert(pool.length > 0 && pool.length < grown * 0.12, `pools stay a small part of the cave: ${pool.length}`)
  assert.strictEqual(new Set(pool).size, pool.length, "no pool cell twice")
  for (const cell of pool) assert.strictEqual(grid[cell], 0, "pools sit in open cave")

  const lights = S.placeLights(grid, cols, rows, 8, random)
  assert.strictEqual(lights.length, 8)
  for (const cell of lights) assert.strictEqual(grid[cell], 0, "a light sits in open space")

  const field = S.reach(grid, cols, rows, lights[0], 34)
  assert(field.cells.length > 50, "light reaches its surroundings")
  assert.strictEqual(new Set(field.cells).size, field.cells.length, "no cell is visited twice")
  for (let i = 0; i < field.cells.length; i++) {
    assert.strictEqual(grid[field.cells[i]], 0, "light never enters rock")
    assert(field.steps[i] <= 34)
    if (i) assert(field.steps[i] >= field.steps[i - 1] - 1e-6, "cells come out nearest first")
  }

  const light = { field, color: [1, 0.5, 0.2], spread: 0, power: new Float32Array(field.cells.length), settled: 0 }
  const total = new Float32Array(cols * rows * 3)
  assert.strictEqual(S.spreadLight([light], 34, total).length, 0, "nothing lit before the light spreads")
  let touched = 0
  while (light.spread < 34 + 3) { light.spread += 1; touched += S.spreadLight([light], 34, total).length }
  assert(Math.abs(total[lights[0] * 3] - 1) < 1e-4, "full power at the source")
  assert.strictEqual(light.settled, field.cells.length, "every cell settles once the light has passed")
  assert.strictEqual(S.spreadLight([light], 34, total).length, 0, "a finished light changes nothing")
  const whole = { field, color: [1, 0.5, 0.2], spread: 34 + 3, power: new Float32Array(field.cells.length), settled: 0 }
  const once = new Float32Array(cols * rows * 3)
  S.spreadLight([whole], 34, once)
  for (let i = 0; i < total.length; i++) assert(Math.abs(total[i] - once[i]) < 1e-4, "step by step ends where one big step does")
  console.log(`seed ${seed}: open ${(open * 100).toFixed(0)}%, ${before} caverns joined by ${dig.length} dug cells, biomes ${share.join('/')} in ${biomeSteps} steps, ${pool.length} pool cells, light reaches ${field.cells.length} cells`)
}
const t0 = Date.now()
{
  const random = S.rng(5)
  let grid = S.noise(cols, rows, random, 0.51)
  for (let p = 0; p < 6; p++) grid = S.erode(grid, cols, rows, p)
  const ls = S.placeLights(grid, cols, rows, 37, random).map((c) => {
    const field = S.reach(grid, cols, rows, c, 72)
    return { field, color: [1, 1, 1], spread: 0, power: new Float32Array(field.cells.length), settled: 0 }
  })
  const total = new Float32Array(cols * rows * 3)
  let frames = 0, most = 0
  while (ls.some((l) => l.spread < 75)) { ls.forEach((l) => (l.spread += 72 / 60)); most = Math.max(most, S.spreadLight(ls, 72, total).length); frames++ }
  console.log(`full cycle at 512x144 (6 passes, 37 lights, ${frames} light frames, at most ${most} cells repainted per frame): ${Date.now() - t0} ms`)
}
console.log("ok")
