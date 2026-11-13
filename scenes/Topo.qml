import QtQuick

// A terrain nobody has seen before, drawn as contour lines from the valleys up. The whole
// thing lives in the shader: a step only nudges how much of the map is revealed.
Scene {
  id: scene

  property real reveal: 0
  property vector2d origin: Qt.vector2d(0, 0)

  onBegin: {
    origin = Qt.vector2d(Math.random() * 400, Math.random() * 400)
    reveal = 0
    interval = 55
  }

  onStep: {
    reveal += 1 / 46
    if (reveal >= 1.08) finish()
  }

  ShaderEffect {
    anchors.fill: parent

    property vector2d origin: scene.origin
    property real aspect: scene.width / Math.max(1, scene.height)
    property real levels: 14
    property real reveal: scene.reveal
    property color baseColor: scene.base
    property color lowColor: scene.accent
    property color midColor: scene.cool
    property color highColor: scene.vivid

    fragmentShader: Qt.resolvedUrl("../shaders/topo.frag.qsb")
  }
}
