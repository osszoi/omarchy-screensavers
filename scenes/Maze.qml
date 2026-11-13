import QtQuick
import QtQuick.Effects
import "cave.js" as Random
import "maze.js" as Sim

// A maze gets carved, a search floods it from the left edge with its front lit up, and the
// way through is traced back. Paced so you can follow each stage.
Scene {
  id: scene

  readonly property int cell: 16
  readonly property int cols: Math.max(8, Math.floor(width / cell))
  readonly property int rows: Math.max(4, Math.floor(height / cell))
  // 3px of corridor + 1px of wall per cell, scaled up without smoothing
  readonly property int unit: 4

  readonly property color wallColor: Qt.darker(base, 1.5)
  readonly property color floorColor: mixed(base, accent, 0.13)
  readonly property color headColor: mixed(accent, Qt.rgba(1, 1, 1, 1), 0.5)

  property var maze: null
  property var search: null
  property var way: []
  property int walked: 0
  property int startCell: 0
  property int reachable: 1

  // what the next paint has to draw: kind, a, b
  property var strokes: []
  property var glowStrokes: []
  property bool wipe: true
  property int lastHead: -1
  property var front: []

  onBegin: {
    maze = Sim.carver(cols, rows, Random.rng(seed()))
    search = null
    way = []
    walked = 0
    strokes = []
    glowStrokes = []
    wipe = true
    lastHead = -1
    front = []
    interval = 40
    board.requestPaint()
    trail.requestPaint()
  }

  onStep: {
    if (phase === "draw") {
      var moves = Sim.carve(maze, Math.ceil(cols * rows / 620))
      for (var i = 0; i < moves.length; i += 2) strokes.push("floor", moves[i], moves[i + 1])
      if (lastHead >= 0) strokes.push("floor", lastHead, lastHead)
      if (maze.head >= 0) strokes.push("head", maze.head, maze.head)
      lastHead = maze.head
      board.requestPaint()
      if (maze.done) {
        startCell = Math.floor(rows / 2) * cols
        search = Sim.solver(maze.links, cols, rows, startCell, startCell + cols - 1)
        reachable = cols + rows
        phase = "search"
      }
    } else if (phase === "search") {
      var visited = Sim.flood(search, Math.ceil(cols * rows / 320))
      for (var f = 0; f < front.length; f++) strokes.push("seen", front[f], search.from[front[f]])
      for (var v = 0; v < visited.length; v++) strokes.push("front", visited[v], search.from[visited[v]])
      front = search.done ? [] : visited
      if (search.done) for (var l = 0; l < visited.length; l++) strokes.push("seen", visited[l], search.from[visited[l]])
      board.requestPaint()
      if (search.done) {
        way = Sim.path(search, startCell)
        walked = 0
        phase = "walk"
        interval = 30
      }
    } else if (phase === "walk") {
      var until = Math.min(way.length, walked + Math.ceil(way.length / 160))
      for (var w = Math.max(1, walked); w < until; w++) glowStrokes.push(w)
      walked = until
      trail.requestPaint()
      if (walked >= way.length) finish()
    }
  }

  function box(ctx, a, b) {
    var low = Math.min(a, b)
    var x = (low % cols) * unit + 1, y = Math.floor(low / cols) * unit + 1
    if (a === b) ctx.fillRect(x, y, unit - 1, unit - 1)
    else if (Math.abs(a - b) === 1) ctx.fillRect(x, y, unit * 2 - 1, unit - 1)
    else ctx.fillRect(x, y, unit - 1, unit * 2 - 1)
  }

  Canvas {
    id: board

    width: scene.cols * scene.unit + 1
    height: scene.rows * scene.unit + 1

    onPaint: {
      var ctx = getContext("2d")
      if (scene.wipe) {
        ctx.fillStyle = scene.wallColor
        ctx.fillRect(0, 0, width, height)
        scene.wipe = false
      }
      var strokes = scene.strokes
      scene.strokes = []
      for (var i = 0; i < strokes.length; i += 3) {
        var kind = strokes[i]
        if (kind === "floor") ctx.fillStyle = scene.floorColor
        else if (kind === "head" || kind === "front") ctx.fillStyle = scene.headColor
        else {
          // the further the search got, the warmer the tint
          var far = Math.min(1, scene.search.dist[strokes[i + 1]] / (scene.cols * 2.2))
          ctx.fillStyle = scene.mixed(scene.mixed(scene.floorColor, scene.cool, 0.34), scene.mixed(scene.floorColor, scene.vivid, 0.34), far)
        }
        scene.box(ctx, strokes[i + 1], strokes[i + 2])
      }
    }
  }

  Canvas {
    id: trail

    width: board.width
    height: board.height

    onPaint: {
      var ctx = getContext("2d")
      var steps = scene.glowStrokes
      scene.glowStrokes = []
      if (!scene.way.length || !steps.length) {
        ctx.clearRect(0, 0, width, height)
        return
      }
      for (var i = 0; i < steps.length; i++) {
        var at = steps[i]
        ctx.fillStyle = scene.mixed(scene.mixed(scene.cool, Qt.rgba(1, 1, 1, 1), 0.35), scene.mixed(scene.vivid, Qt.rgba(1, 1, 1, 1), 0.35), at / scene.way.length)
        scene.box(ctx, scene.way[at - 1], scene.way[at])
      }
    }
  }

  ShaderEffectSource {
    anchors.fill: parent
    sourceItem: board
    hideSource: true
    smooth: false
  }

  ShaderEffectSource {
    id: trailTexture
    anchors.fill: parent
    sourceItem: trail
    hideSource: true
    smooth: false
  }

  MultiEffect {
    anchors.fill: parent
    source: trailTexture
    blurEnabled: true
    blur: 1
    blurMax: 40
    brightness: 0.25
    opacity: 0.85
  }
}
