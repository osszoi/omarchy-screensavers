import QtQuick
import qs.Commons as Commons

// What every scene shares: the step clock, the 3 second hold once it is finished, the fade
// into the next one, and a few colours pulled from the theme. A scene fills in begin/step
// and calls finish() when there is nothing left to draw.
Item {
  id: scene

  property bool running: true
  property string phase: ""
  property alias interval: clock.interval
  default property alias content: stage.data

  readonly property color base: Commons.Color.background
  readonly property color accent: Commons.Color.accent
  readonly property color warm: Qt.rgba(1.0, 0.66, 0.36, 1)
  readonly property color cool: shifted(accent, -0.12)
  readonly property color vivid: shifted(accent, 0.14)

  signal begin()
  signal step()

  function shifted(c, turn) { return Qt.hsla((c.hslHue + turn + 1) % 1, c.hslSaturation, c.hslLightness, 1) }
  function mixed(a, b, t) { return Qt.rgba(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t, 1) }
  function seed() { return Math.floor(Math.random() * 4294967295) }

  function start() {
    if (width < 64 || height < 64) return
    phase = "draw"
    scene.begin()
    stage.opacity = 1
  }

  function finish() {
    phase = "hold"
    clock.interval = 3000
  }

  onRunningChanged: if (running && phase === "") restart.restart()
  onWidthChanged: restart.restart()
  onHeightChanged: restart.restart()
  Component.onCompleted: restart.restart()

  Timer {
    id: restart
    interval: 60
    onTriggered: if (scene.running) scene.start()
  }

  Timer {
    id: clock
    repeat: true
    running: scene.running && scene.phase !== ""
    onTriggered: {
      if (scene.phase === "hold") {
        scene.phase = "fade"
        clock.interval = 700
        stage.opacity = 0
      } else if (scene.phase === "fade") {
        scene.start()
      } else {
        scene.step()
      }
    }
  }

  Item {
    id: stage

    anchors.fill: parent
    opacity: 0

    Behavior on opacity {
      NumberAnimation { duration: 600; easing.type: Easing.OutCubic }
    }
  }
}
