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
const W = load("world.js")
const cols = 640, rows = 180

for (const seed of [2, 31, 777, 4242]) {
  const world = W.soup(cols, rows, rng(seed), 0.32)
  const start = world.water.reduce((n, v) => n + v, 0) / world.water.length
  let flips = 0
  const generations = 16, perStep = Math.ceil(cols * rows / 25)
  const total = generations * 25
  for (let step = 0; step < total; step++) flips += W.mutate(world, perStep, W.heatAt(step / total)).length
  for (const cell of W.puddles(world, Math.round(cols * rows * 0.0015))) world.water[cell] = 0
  const wet = world.water.reduce((n, v) => n + v, 0) / world.water.length
  assert(wet > 0.08 && wet < 0.16, `seed ${seed}: water ${(wet * 100).toFixed(1)}% is outside 8-16%`)
  assert.strictEqual(W.mutate(world, 0, 0).length, 0)
  assert(W.heatAt(0) > 0.3 && W.heatAt(0.5) < W.heatAt(0.1) && W.heatAt(0.85) === 0, "heat drains away and is gone for the last stretch")

  const land = W.terrain(world)
  const seen = {}
  for (let i = 0; i < world.water.length; i++) {
    if (world.water[i]) { assert(land.depth[i] > 0 && land.elev[i] === 0, "water has depth and no height"); continue }
    assert(land.elev[i] >= 0 && land.elev[i] <= 1, "height stays in 0..1")
    seen[W.BIOMES[land.biome[i]]] = (seen[W.BIOMES[land.biome[i]]] || 0) + 1
  }
  const kinds = Object.keys(seen)
  assert(kinds.length >= 8, `seed ${seed}: only ${kinds.length} biomes: ${kinds}`)

  const allowed = new Uint8Array(world.water.length)
  for (let i = 0; i < allowed.length; i++) allowed[i] = world.water[i] ? 0 : 1
  const shore = []
  for (let i = 0; i < allowed.length; i++) if (allowed[i] && land.inland[i] < 1.5) shore.push(i)
  const cover = W.creep(cols, rows, allowed, shore, rng(seed + 1))
  let joined = 0, steps = 0
  while (!cover.done) { joined += W.advance(cover, 600).length; steps++; assert(steps < 5000, "creep must finish") }
  assert.strictEqual(joined, allowed.reduce((n, v) => n + v, 0), "the cover reaches every land cell, cut-off islands included")

  const flows = W.rivers(world, land, 30)
  for (const river of flows) {
    assert(river.length >= 14)
    for (let i = 1; i < river.length; i++) assert(Math.abs(river[i] % cols - river[i - 1] % cols) <= 1 && Math.abs(Math.floor(river[i] / cols) - Math.floor(river[i - 1] / cols)) <= 1, "a river moves one cell at a time")
    for (const cell of river) assert.strictEqual(world.water[cell], 0, "a river runs over land")
  }
  const towns = W.settlements(world, land, flows, 40)
  assert(towns.length >= 20, `seed ${seed}: only ${towns.length} settlements`)
  for (const cell of towns) {
    assert.strictEqual(world.water[cell], 0, "nobody settles in the lake")
    assert(W.HOMELY[W.BIOMES[land.biome[cell]]], "settlements sit on liveable ground")
  }
  const top = kinds.sort((a, b) => seen[b] - seen[a]).slice(0, 6).map((k) => `${k} ${Math.round(seen[k] / (cols * rows) * 100)}%`).join(", ")
  console.log(`seed ${seed}: water ${(start * 100).toFixed(0)}% -> ${(wet * 100).toFixed(0)}% after ${flips} flips, ${kinds.length} biomes (${top}), cover in ${steps} steps, ${flows.length} rivers, ${towns.length} settlements`)
}
const t0 = Date.now()
{ const world = W.soup(cols, rows, rng(9), 0.32); for (let s = 0; s < 400; s++) W.mutate(world, Math.ceil(cols * rows / 25), W.heatAt(s / 400)); const land = W.terrain(world); W.rivers(world, land, 30) }
console.log(`one world at ${cols}x${rows}: ${Date.now() - t0} ms of simulation`)
console.log("ok")
