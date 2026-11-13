import QtQuick
import "cave.js" as Sim

// The way a roguelike builds a cave, one stage at a time: noise, a few smoothing passes that
// land as scattered changes all over it, small pockets filled back in, tunnels dug between the caverns that are
// left, biomes racing each other through it, pools, and finally crystals whose light walks
// through the tunnels and stops at rock.
Scene {
  id: scene

  readonly property int cell: 10
  readonly property int cols: Math.max(16, Math.ceil(width / cell))
  readonly property int rows: Math.max(9, Math.ceil(height / cell))
  readonly property int passes: 7
  readonly property real radius: 70
  readonly property int lightCount: Math.max(4, Math.round(cols * rows / 2000))
  readonly property int biomeCount: Math.max(3, Math.min(5, Math.round(cols * rows / 14000)))
  readonly property int smallest: Math.round(cols * rows * 0.004)
  // ember, crystal, fungal, amethyst, frost
  readonly property var biomePalette: [[1.0, 0.42, 0.18], rgb(accent), [0.28, 0.92, 0.55], rgb(vivid), [0.62, 0.95, 1.0]]

  property var crystals: []

  // plain state the clock chews on, nothing binds to it
  property var grid: null
  property var changes: []
  property var dig: []
  property var flood: null
  property var biomeColors: []
  property var claimed: []
  property bool recolour: false
  property var pool: null
  property var poolCells: []
  property var lights: []
  property var glow: null
  property var repaint: []
  property bool wipe: true
  property bool wipeBiomes: true
  // what the walls canvas still has to draw: "all", or [kind, from, to] over columns / dig / poolCells
  property var wallWork: []
  property int pass: 0
  property int swept: 0
  property int dug: 0
  property int pooled: 0
  property int perBiome: 1
  property int frame: 0

  function rgb(c) { return [c.r, c.g, c.b] }
  function paint(c) { return Qt.rgba(c[0], c[1], c[2], 1) }

  onBegin: {
    var random = Sim.rng(seed())
    grid = Sim.noise(cols, rows, random, 0.51)
    var order = biomePalette.slice()
    for (var i = order.length - 1; i > 0; i--) {
      var j = Math.floor(random() * (i + 1)), swap = order[i]
      order[i] = order[j]; order[j] = swap
    }
    biomeColors = order.slice(0, biomeCount)
    changes = []
    dig = []
    flood = null
    claimed = []
    recolour = false
    pool = new Uint8Array(cols * rows)
    poolCells = []
    lights = []
    crystals = []
    glow = new Float32Array(cols * rows * 3)
    repaint = []
    wipe = true
    wipeBiomes = true
    pass = 0
    phase = "noise"
    interval = 900
    wallWork = ["all"]
    wallsCanvas.requestPaint()
    lightsCanvas.requestPaint()
    biomesCanvas.requestPaint()
  }

  onStep: {
    if (phase === "noise") smooth()
    else if (phase === "erode") sweep()
    else if (phase === "cull") cull()
    else if (phase === "dig") tunnel()
    else if (phase === "biome") colonise()
    else if (phase === "pool") fill()
    else if (phase === "light") spread()
  }

  // a pass is worked out whole, then its changes land a handful at a time in random order,
  // so the cave shifts everywhere at once instead of being wiped across
  function smooth() {
    var target = Sim.erode(grid, cols, rows, pass)
    var differ = []
    for (var i = 0; i < grid.length; i++) if (grid[i] !== target[i]) differ.push(i)
    var random = Sim.rng(seed())
    for (var d = differ.length - 1; d > 0; d--) {
      var other = Math.floor(random() * (d + 1)), swap = differ[d]
      differ[d] = differ[other]; differ[other] = swap
    }
    changes = differ
    swept = 0
    phase = "erode"
    interval = 40
  }

  function sweep() {
    var until = Math.min(changes.length, swept + Math.max(1, Math.ceil(changes.length / 24)))
    for (var i = swept; i < until; i++) grid[changes[i]] = 1 - grid[changes[i]]
    wallWork.push(["changed", swept, until])
    swept = until
    wallsCanvas.requestPaint()
    if (swept < changes.length) return
    pass++
    if (pass < passes) {
      smooth()
    } else {
      phase = "cull"
      interval = 350
    }
  }

  function cull() {
    var small = Sim.pockets(Sim.caverns(grid, cols, rows), smallest)
    for (var i = 0; i < small.length; i++) grid[small[i]] = 1
    wallWork.push("all")
    wallsCanvas.requestPaint()
    dig = Sim.tunnels(grid, cols, rows, Sim.caverns(grid, cols, rows), smallest, Sim.rng(seed()))
    dug = 0
    if (dig.length) {
      phase = "dig"
      interval = 40
    } else {
      settle()
    }
  }

  function tunnel() {
    var until = Math.min(dig.length, dug + Math.max(4, Math.ceil(dig.length / 80)))
    for (var i = dug; i < until; i++) grid[dig[i]] = 0
    wallWork.push(["dug", dug, until])
    dug = until
    wallsCanvas.requestPaint()
    if (dug >= dig.length) settle()
  }

  function settle() {
    var open = 0
    for (var i = 0; i < grid.length; i++) if (!grid[i]) open++
    var seeds = Sim.placeLights(grid, cols, rows, biomeCount, Sim.rng(seed()))
    flood = Sim.biomeFlood(grid, cols, rows, seeds)
    claimed = seeds
    perBiome = Math.max(2, Math.ceil(open / (seeds.length * 115)))
    phase = "biome"
    interval = 40
    biomesCanvas.requestPaint()
  }

  function colonise() {
    claimed = claimed.concat(Sim.growBiomes(flood, perBiome))
    biomesCanvas.requestPaint()
    if (!flood.done) return
    Sim.claimRock(flood)
    recolour = true
    biomesCanvas.requestPaint()
    poolCells = Sim.pools(grid, cols, rows, flood.owner, biomeColors.length, Sim.rng(seed()))
    pooled = 0
    if (poolCells.length) phase = "pool"
    else ignite()
  }

  function fill() {
    var until = Math.min(poolCells.length, pooled + Math.max(4, Math.ceil(poolCells.length / 50)))
    for (var i = pooled; i < until; i++) pool[poolCells[i]] = 1
    wallWork.push(["pooled", pooled, until])
    pooled = until
    wallsCanvas.requestPaint()
    if (pooled >= poolCells.length) ignite()
  }

  function ignite() {
    var cells = Sim.placeLights(grid, cols, rows, lightCount, Sim.rng(seed()))
    var placed = []
    var shown = []
    for (var i = 0; i < cells.length; i++) {
      var biome = biomeColors[Math.max(0, flood.owner[cells[i]])]
      var color = [biome[0] * 0.8 + 0.2, biome[1] * 0.8 + 0.2, biome[2] * 0.8 + 0.2]
      var field = Sim.reach(grid, cols, rows, cells[i], radius)
      placed.push({ field: field, color: color, spread: 0, power: new Float32Array(field.cells.length), settled: 0 })
      shown.push({ cell: cells[i], color: color, lit: false })
    }
    lights = placed
    crystals = shown
    frame = 0
    phase = "light"
    interval = 50
  }

  function spread() {
    var growing = false
    var lit = -1
    for (var i = 0; i < lights.length; i++) {
      if (frame < i * 6) { growing = true; continue }
      if (frame === i * 6) lit = i
      if (lights[i].spread < radius + 3) {
        lights[i].spread += radius / 56
        growing = true
      }
    }
    frame++
    if (lit >= 0) {
      var shown = crystals.slice()
      shown[lit] = { cell: shown[lit].cell, color: shown[lit].color, lit: true }
      crystals = shown
    }
    repaint = Sim.spreadLight(lights, radius, glow)
    if (repaint.length) lightsCanvas.requestPaint()
    if (!growing) finish()
  }

  // putImageData draws nothing on this Qt, so the data textures are painted cell by cell.
  // rock goes in the red channel and pools in the green one
  Canvas {
    id: wallsCanvas

    width: scene.cols
    height: scene.rows

    function column(ctx, grid, x) {
      ctx.fillStyle = "#000000"
      ctx.fillRect(x, 0, 1, height)
      ctx.fillStyle = "#ff0000"
      var from = -1
      for (var y = 0; y <= height; y++) {
        var rock = y < height && grid[y * width + x] === 1
        if (rock && from < 0) from = y
        if (!rock && from >= 0) { ctx.fillRect(x, from, 1, y - from); from = -1 }
      }
    }

    function dots(ctx, cells, from, to, colour) {
      ctx.fillStyle = colour
      for (var i = from; i < to; i++) ctx.fillRect(cells[i] % width, Math.floor(cells[i] / width), 1, 1)
    }

    onPaint: {
      var grid = scene.grid
      if (!grid) return
      var ctx = getContext("2d")
      var work = scene.wallWork
      scene.wallWork = []
      for (var w = 0; w < work.length; w++) {
        var job = work[w]
        if (job === "all") for (var x = 0; x < width; x++) column(ctx, grid, x)
        else if (job[0] === "changed") {
          for (var c = job[1]; c < job[2]; c++) {
            var cell = scene.changes[c]
            ctx.fillStyle = grid[cell] ? "#ff0000" : "#000000"
            ctx.fillRect(cell % width, Math.floor(cell / width), 1, 1)
          }
        }
        else if (job[0] === "dug") dots(ctx, scene.dig, job[1], job[2], "#000000")
        else if (job[0] === "pooled") dots(ctx, scene.poolCells, job[1], job[2], "#00ff00")
      }
    }
  }

  Canvas {
    id: biomesCanvas

    width: scene.cols
    height: scene.rows

    onPaint: {
      var ctx = getContext("2d")
      if (scene.wipeBiomes) {
        ctx.fillStyle = "#000000"
        ctx.fillRect(0, 0, width, height)
        scene.wipeBiomes = false
      }
      if (!scene.flood) return
      var owner = scene.flood.owner
      if (scene.recolour) {
        // everything has a biome now, rock included: one pass of runs instead of 70k cells
        scene.recolour = false
        scene.claimed = []
        for (var y = 0; y < height; y++) {
          var from = 0
          for (var x = 1; x <= width; x++) {
            if (x < width && owner[y * width + x] === owner[y * width + from]) continue
            ctx.fillStyle = scene.paint(scene.biomeColors[Math.max(0, owner[y * width + from])])
            ctx.fillRect(from, y, x - from, 1)
            from = x
          }
        }
        return
      }
      var cells = scene.claimed
      scene.claimed = []
      for (var i = 0; i < cells.length; i++) {
        ctx.fillStyle = scene.paint(scene.biomeColors[owner[cells[i]]])
        ctx.fillRect(cells[i] % width, Math.floor(cells[i] / width), 1, 1)
      }
    }
  }

  Canvas {
    id: lightsCanvas

    width: scene.cols
    height: scene.rows

    onPaint: {
      var ctx = getContext("2d")
      if (scene.wipe) {
        ctx.fillStyle = "#000000"
        ctx.fillRect(0, 0, width, height)
        scene.wipe = false
      }
      var glow = scene.glow, cells = scene.repaint
      if (!glow) return
      for (var i = 0; i < cells.length; i++) {
        var at = cells[i] * 3
        // half scale, the shader doubles it back, so two lights can overlap without clipping
        ctx.fillStyle = Qt.rgba(Math.min(1, glow[at] / 2), Math.min(1, glow[at + 1] / 2), Math.min(1, glow[at + 2] / 2), 1)
        ctx.fillRect(cells[i] % width, Math.floor(cells[i] / width), 1, 1)
      }
    }
  }

  ShaderEffectSource {
    id: wallsTexture
    sourceItem: wallsCanvas
    hideSource: true
    smooth: true
  }

  ShaderEffectSource {
    id: lightsTexture
    sourceItem: lightsCanvas
    hideSource: true
    smooth: true
  }

  ShaderEffectSource {
    id: biomesTexture
    sourceItem: biomesCanvas
    hideSource: true
    smooth: true
  }

  ShaderEffect {
    anchors.fill: parent

    property variant walls: wallsTexture
    property variant lights: lightsTexture
    property variant biomes: biomesTexture
    property vector2d grid: Qt.vector2d(scene.cols, scene.rows)
    property color rockColor: Qt.darker(scene.base, 1.7)
    property color faceColor: scene.mixed(scene.base, scene.accent, 0.14)
    property color floorColor: scene.mixed(scene.base, scene.accent, 0.04)

    fragmentShader: Qt.resolvedUrl("../shaders/cave.frag.qsb")
  }

  Repeater {
    model: scene.crystals

    Rectangle {
      required property var modelData

      readonly property color tint: Qt.rgba(modelData.color[0], modelData.color[1], modelData.color[2], 1)

      visible: modelData.lit
      x: (modelData.cell % scene.cols + 0.5) * scene.width / scene.cols - width / 2
      y: (Math.floor(modelData.cell / scene.cols) + 0.5) * scene.height / scene.rows - height / 2
      width: 9
      height: 9
      rotation: 45
      color: scene.mixed(tint, Qt.rgba(1, 1, 1, 1), 0.7)
    }
  }
}
