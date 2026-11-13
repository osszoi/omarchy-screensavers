import QtQuick
import "cave.js" as Random
import "world.js" as Sim

// A world seen from above that settles into shape instead of being drawn. Land and water
// start as specks and take sides all over the map at once, generation after generation.
// Then the ground rises, plants creep inland from the shores, woods thicken, the peaks turn
// to rock and snow, the rivers find their way down to the lakes and, since it is night,
// the lights of the settlements come on along the water.
Scene {
  id: scene

  readonly property int cell: 8
  readonly property int cols: Math.max(32, Math.ceil(width / cell))
  readonly property int rows: Math.max(18, Math.ceil(height / cell))
  readonly property int generations: 16
  readonly property int stepsPerGeneration: 25

  // beach, desert, mesa, savanna, steppe, grass, forest, swamp, rainforest, jungle, taiga, tundra, rock, snow
  readonly property var finalColors: ["#d6c896", "#dab874", "#be7a4c", "#b0aa5c", "#a0a868", "#70a452", "#347442",
                                      "#48684c", "#22683e", "#165234", "#3e6c62", "#949e8e", "#7c746c", "#e8eef4"]
  // what grows first where woods or bare peaks will end up
  readonly property var firstColors: ["#d6c896", "#dab874", "#be7a4c", "#b0aa5c", "#a0a868", "#70a452", "#7ea65a",
                                      "#7c8e5e", "#86aa54", "#7aa650", "#869a7c", "#949e8e", "#8f8a72", "#9a9684"]
  readonly property color bareColor: "#5a5046"

  property real rise: 0
  property var towns: []
  property int lit: 0

  // plain state the clock chews on, nothing binds to it
  property var world: null
  property var land: null
  property var spread: null
  property var flows: []
  property int turn: 0
  property int surveyed: 0
  property int flowed: 0
  property bool finalCoat: false
  // queues for the three canvases
  property var shapeWork: []
  property var coverWork: []
  property bool wipe: true
  property bool wipeCover: true

  onBegin: {
    world = Sim.soup(cols, rows, Random.rng(seed()), 0.32)
    land = null
    spread = null
    flows = []
    turn = 0
    surveyed = 0
    flowed = 0
    rise = 0
    towns = []
    lit = 0
    wipe = true
    wipeCover = true
    shapeWork = ["all"]
    coverWork = []
    phase = "mutate"
    interval = 40
    shapeCanvas.requestPaint()
    coverCanvas.requestPaint()
    reliefCanvas.requestPaint()
  }

  onStep: {
    if (phase === "mutate") mutate()
    else if (phase === "survey") survey()
    else if (phase === "rise") lift()
    else if (phase === "cover" || phase === "woods" || phase === "peaks") creep()
    else if (phase === "rivers") flow()
    else if (phase === "lights") light()
  }

  function mutate() {
    var total = generations * stepsPerGeneration
    shapeWork.push(Sim.mutate(world, Math.ceil(cols * rows / stepsPerGeneration), Sim.heatAt(turn / total)))
    shapeCanvas.requestPaint()
    turn++
    if (turn < total) return
    var dry = Sim.puddles(world, Math.round(cols * rows * 0.0015))
    for (var i = 0; i < dry.length; i++) world.water[dry[i]] = 0
    shapeWork.push(dry)
    shapeCanvas.requestPaint()
    land = Sim.terrain(world)
    surveyed = 0
    phase = "survey"
  }

  // the height map goes to its canvas a few rows per step, in one go it would stall a frame
  function survey() {
    surveyed = Math.min(rows, surveyed + 12)
    reliefCanvas.requestPaint()
    if (surveyed < rows) return
    phase = "rise"
    interval = 50
  }

  function lift() {
    rise += 1 / 50
    if (rise < 1) return
    rise = 1
    var shore = []
    var isLand = new Uint8Array(cols * rows)
    for (var i = 0; i < isLand.length; i++) {
      if (world.water[i]) continue
      isLand[i] = 1
      if (land.inland[i] < 1.5) shore.push(i)
    }
    beginCreep("cover", isLand, shore, false, 110)
  }

  function beginCreep(name, allowed, seeds, coat, steps) {
    var count = 0
    for (var i = 0; i < allowed.length; i++) count += allowed[i]
    if (count === 0) return nextAfter(name)
    spread = Sim.creep(cols, rows, allowed, seeds, Random.rng(seed()))
    spread.perStep = Math.max(8, Math.ceil(count / steps))
    finalCoat = coat
    phase = name
    interval = 40
  }

  function creep() {
    coverWork.push([finalCoat, Sim.advance(spread, spread.perStep)])
    coverCanvas.requestPaint()
    if (spread.done) nextAfter(phase)
  }

  function chosen(wanted, density, pickHighest) {
    var allowed = new Uint8Array(cols * rows)
    var seeds = []
    var random = Random.rng(seed())
    for (var i = 0; i < allowed.length; i++) {
      if (world.water[i] || !wanted[Sim.BIOMES[land.biome[i]]]) continue
      allowed[i] = 1
      if (pickHighest ? land.elev[i] > 0.93 : random() < density) seeds.push(i)
    }
    return { allowed: allowed, seeds: seeds }
  }

  function nextAfter(name) {
    if (name === "cover") {
      var woods = chosen(Sim.WOODED, 0.004, false)
      beginCreep("woods", woods.allowed, woods.seeds, true, 90)
    } else if (name === "woods") {
      var peaks = chosen(Sim.HIGH, 0.002, true)
      beginCreep("peaks", peaks.allowed, peaks.seeds, true, 55)
    } else {
      flows = Sim.rivers(world, land, Math.max(6, Math.round(cols * rows / 2400)))
      flowed = 0
      phase = "rivers"
      interval = 40
    }
  }

  function flow() {
    var cells = []
    var running = false
    for (var i = 0; i < flows.length; i++) {
      if (flowed < flows[i].length) { cells.push(flows[i][flowed]); running = true }
    }
    flowed++
    shapeWork.push(["river", cells])
    shapeCanvas.requestPaint()
    if (running) return
    towns = Sim.settlements(world, land, flows, Math.max(8, Math.round(cols * rows / 2600)))
    lit = 0
    phase = "lights"
    interval = 70
  }

  function light() {
    lit += 1
    if (lit >= towns.length) finish()
  }

  // putImageData draws nothing on this Qt, so the data textures are painted cell by cell.
  // water goes in the red channel, rivers in the green one
  Canvas {
    id: shapeCanvas

    width: scene.cols
    height: scene.rows

    onPaint: {
      var world = scene.world
      if (!world) return
      var ctx = getContext("2d")
      var work = scene.shapeWork
      scene.shapeWork = []
      for (var w = 0; w < work.length; w++) {
        var job = work[w]
        if (job === "all") {
          ctx.fillStyle = "#000000"
          ctx.fillRect(0, 0, width, height)
          ctx.fillStyle = "#ff0000"
          for (var y = 0; y < height; y++) {
            var from = -1
            for (var x = 0; x <= width; x++) {
              var wet = x < width && world.water[y * width + x] === 1
              if (wet && from < 0) from = x
              if (!wet && from >= 0) { ctx.fillRect(from, y, x - from, 1); from = -1 }
            }
          }
        } else if (job[0] === "river") {
          ctx.fillStyle = "#00ff00"
          for (var r = 0; r < job[1].length; r++) ctx.fillRect(job[1][r] % width, Math.floor(job[1][r] / width), 1, 1)
        } else {
          for (var i = 0; i < job.length; i++) {
            ctx.fillStyle = world.water[job[i]] ? "#ff0000" : "#000000"
            ctx.fillRect(job[i] % width, Math.floor(job[i] / width), 1, 1)
          }
        }
      }
    }
  }

  // red: how high the land is, green: how deep the water is
  Canvas {
    id: reliefCanvas

    property int painted: 0

    width: scene.cols
    height: scene.rows

    onPaint: {
      var ctx = getContext("2d")
      if (scene.wipe || !scene.land) {
        ctx.fillStyle = "#000000"
        ctx.fillRect(0, 0, width, height)
        scene.wipe = false
        painted = 0
        return
      }
      var land = scene.land
      for (var y = painted; y < scene.surveyed; y++) {
        for (var x = 0; x < width; x++) {
          var at = y * width + x
          ctx.fillStyle = Qt.rgba(land.elev[at], land.depth[at], 0, 1)
          ctx.fillRect(x, y, 1, 1)
        }
      }
      painted = scene.surveyed
    }
  }

  Canvas {
    id: coverCanvas

    width: scene.cols
    height: scene.rows

    onPaint: {
      var ctx = getContext("2d")
      var work = scene.coverWork
      scene.coverWork = []
      if (scene.wipeCover) {
        ctx.fillStyle = scene.bareColor
        ctx.fillRect(0, 0, width, height)
        scene.wipeCover = false
      }
      if (!scene.land) return
      var biome = scene.land.biome
      for (var w = 0; w < work.length; w++) {
        var colors = work[w][0] ? scene.finalColors : scene.firstColors
        var cells = work[w][1]
        for (var i = 0; i < cells.length; i++) {
          ctx.fillStyle = colors[biome[cells[i]]]
          ctx.fillRect(cells[i] % width, Math.floor(cells[i] / width), 1, 1)
        }
      }
    }
  }

  ShaderEffectSource {
    id: shapeTexture
    sourceItem: shapeCanvas
    hideSource: true
    smooth: true
  }

  ShaderEffectSource {
    id: reliefTexture
    sourceItem: reliefCanvas
    hideSource: true
    smooth: true
  }

  ShaderEffectSource {
    id: coverTexture
    sourceItem: coverCanvas
    hideSource: true
    smooth: true
  }

  ShaderEffect {
    anchors.fill: parent

    property variant shape: shapeTexture
    property variant relief: reliefTexture
    property variant cover: coverTexture
    property vector2d grid: Qt.vector2d(scene.cols, scene.rows)
    property real rise: scene.rise
    property color shallowColor: "#408aaa"
    property color deepColor: "#103468"
    property color riverColor: "#4696c4"

    fragmentShader: Qt.resolvedUrl("../shaders/world.frag.qsb")
  }

  Repeater {
    model: scene.towns

    Item {
      required property var modelData
      required property int index

      visible: index < scene.lit
      x: (modelData % scene.cols + 0.5) * scene.width / scene.cols
      y: (Math.floor(modelData / scene.cols) + 0.5) * scene.height / scene.rows

      Rectangle {
        anchors.centerIn: parent
        width: 18
        height: 18
        radius: 9
        color: Qt.rgba(1.0, 0.78, 0.42, 0.14)
      }

      Rectangle {
        anchors.centerIn: parent
        width: 5
        height: 5
        radius: 2.5
        color: "#ffd9a0"
      }
    }
  }
}
