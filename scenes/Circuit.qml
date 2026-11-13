import QtQuick
import QtQuick.Effects
import "cave.js" as Random
import "circuit.js" as Sim

// Traces route themselves around each other until the board is full, then a handful of
// them carry a pulse from one pad to the other.
Scene {
  id: scene

  readonly property int cell: 16
  readonly property int cols: Math.max(8, Math.floor(width / cell))
  readonly property int rows: Math.max(4, Math.floor(height / cell))
  // drawn at half size, plenty for 3px lines and a quarter of the pixels to push around
  readonly property real unit: cell / 2

  readonly property color traceColor: mixed(base, accent, 0.36)
  readonly property color padColor: mixed(base, accent, 0.62)
  readonly property var palette: [cool, vivid, accent, warm]

  property var traces: []
  property int drawn: 0
  property int pending: 0
  property var pulses: []
  property int tick: 0
  property bool wipe: true

  onBegin: {
    traces = Sim.route(cols, rows, Random.rng(seed()))
    drawn = 0
    pending = 0
    pulses = []
    tick = 0
    wipe = true
    interval = 45
    board.requestPaint()
    sparks.requestPaint()
  }

  onStep: {
    if (phase === "draw") {
      pending = Math.min(traces.length, drawn + Math.ceil(traces.length / 110))
      board.requestPaint()
      if (pending >= traces.length) energise()
    } else if (phase === "pulse") {
      tick++
      var moving = false
      for (var i = 0; i < pulses.length; i++) {
        var pulse = pulses[i]
        if (tick < pulse.wait) { moving = true; continue }
        if (pulse.at < pulse.cells.length / 2 - 1) { pulse.at++; moving = true }
      }
      sparks.requestPaint()
      if (!moving) finish()
    }
  }

  function energise() {
    var random = Random.rng(seed())
    var chosen = []
    var wanted = Math.min(70, Math.round(traces.length * 0.09))
    for (var i = 0; i < traces.length && chosen.length < wanted; i++) {
      var trace = traces[Math.floor(random() * traces.length)]
      if (trace.length < 20) continue
      chosen.push({ cells: trace, at: 0, wait: Math.floor(random() * 26), color: palette[chosen.length % palette.length] })
    }
    pulses = chosen
    tick = 0
    phase = "pulse"
    interval = 35
  }

  function px(v) { return (v + 0.5) * unit }

  Canvas {
    id: board

    width: Math.ceil(scene.width / 2)
    height: Math.ceil(scene.height / 2)

    onPaint: {
      var ctx = getContext("2d")
      if (scene.wipe) {
        ctx.fillStyle = scene.base
        ctx.fillRect(0, 0, width, height)
        scene.wipe = false
      }
      ctx.lineWidth = 1.5
      ctx.lineJoin = "round"
      for (var t = scene.drawn; t < scene.pending; t++) {
        var trace = scene.traces[t]
        ctx.strokeStyle = scene.traceColor
        ctx.beginPath()
        ctx.moveTo(scene.px(trace[0]), scene.px(trace[1]))
        for (var i = 2; i < trace.length; i += 2) ctx.lineTo(scene.px(trace[i]), scene.px(trace[i + 1]))
        ctx.stroke()
        ctx.strokeStyle = scene.padColor
        ctx.fillStyle = scene.base
        for (var end = 0; end < 2; end++) {
          var at = end ? trace.length - 2 : 0
          ctx.beginPath()
          ctx.arc(scene.px(trace[at]), scene.px(trace[at + 1]), 2.4, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()
        }
      }
      scene.drawn = scene.pending
    }
  }

  Canvas {
    id: sparks

    width: board.width
    height: board.height

    onPaint: {
      var ctx = getContext("2d")
      ctx.clearRect(0, 0, width, height)
      ctx.lineWidth = 1.6
      ctx.lineCap = "round"
      for (var i = 0; i < scene.pulses.length; i++) {
        var pulse = scene.pulses[i]
        if (scene.tick < pulse.wait) continue
        var cells = pulse.cells, color = pulse.color
        var tail = 9
        for (var back = Math.min(tail, pulse.at); back >= 1; back--) {
          var to = (pulse.at - back + 1) * 2, from = to - 2
          ctx.strokeStyle = Qt.rgba(color.r, color.g, color.b, 1 - back / (tail + 1))
          ctx.beginPath()
          ctx.moveTo(scene.px(cells[from]), scene.px(cells[from + 1]))
          ctx.lineTo(scene.px(cells[to]), scene.px(cells[to + 1]))
          ctx.stroke()
        }
        ctx.fillStyle = scene.mixed(color, Qt.rgba(1, 1, 1, 1), 0.6)
        ctx.beginPath()
        ctx.arc(scene.px(cells[pulse.at * 2]), scene.px(cells[pulse.at * 2 + 1]), 2.6, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  ShaderEffectSource {
    anchors.fill: parent
    sourceItem: board
    hideSource: true
    smooth: true
  }

  ShaderEffectSource {
    id: sparksTexture
    anchors.fill: parent
    sourceItem: sparks
    hideSource: true
    smooth: true
  }

  MultiEffect {
    anchors.fill: parent
    source: sparksTexture
    blurEnabled: true
    blur: 1
    blurMax: 36
    brightness: 0.3
  }
}
