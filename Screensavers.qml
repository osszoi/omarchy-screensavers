import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import "scenes"

// Shows the chosen scene once the session has been idle for idle.screensaver seconds and
// drops it on the first key or mouse move. Same idle/wake rules as eduardo.nvim-screensaver.
Item {
  id: root

  // injected by omarchy-shell, gives live access to shell.json
  property var shell: null

  readonly property string home: Quickshell.env("HOME")
  readonly property string configPath: (Quickshell.env("XDG_CONFIG_HOME") || home + "/.config") + "/omarchy-screensavers/config.json"
  readonly property string stayAwakeDir: home + "/.local/state/omarchy/indicators"
  readonly property var scenes: ({ world: world, cave: cave, maze: maze, topo: topo, circuit: circuit })

  property var config: ({})
  property string preview: ""
  property bool forceShow: false
  property bool suppressed: false
  property bool locked: false
  property bool armed: false
  property bool stayAwake: false
  property int fileIdleSeconds: 0

  // "nvim" and "omarchy" belong to other screensavers, then this one stays out of the way
  readonly property string active: scenes[config.active] ? config.active : ""
  readonly property string shownScene: preview || active
  readonly property var sysIdle: (shell && shell.shellConfig && shell.shellConfig.idle) ? shell.shellConfig.idle : null
  readonly property int idleSeconds: {
    var seconds = sysIdle ? Number(sysIdle.screensaver) : NaN
    if (isFinite(seconds) && seconds > 0) return Math.floor(seconds)
    return fileIdleSeconds > 0 ? fileIdleSeconds : 300
  }
  readonly property bool monitorIdle: idleLoader.item ? idleLoader.item.isIdle : false
  readonly property bool showing: shownScene !== "" && (forceShow || (monitorIdle && active !== "")) && !locked && !suppressed

  function applyConfig(text) {
    try {
      config = JSON.parse(text)
    } catch (error) {
      config = ({})
    }
    refreshMonitor()
  }

  FileView {
    id: configFile
    path: root.configPath
    watchChanges: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: root.applyConfig(text())
    onLoadFailed: root.applyConfig("{}")
  }

  // only used when the shell object is not injected
  Process {
    id: idleReader
    running: true
    command: ["jq", "-r", ".idle.screensaver // empty", root.home + "/.config/omarchy/shell.json"]
    stdout: StdioCollector {
      onStreamFinished: {
        var seconds = parseInt(String(text).trim(), 10)
        if (!isNaN(seconds) && seconds > 0) root.fileIdleSeconds = seconds
      }
    }
  }

  // IdleMonitor does not re-arm when its timeout changes, and reports idle while disabled,
  // so every change builds a fresh one
  function refreshMonitor() {
    idleLoader.active = false
    monitorArm.restart()
  }

  Timer {
    id: monitorArm
    interval: 80
    onTriggered: idleLoader.active = root.active !== "" && root.idleSeconds > 0 && !root.stayAwake
  }

  onIdleSecondsChanged: refreshMonitor()

  Loader {
    id: idleLoader
    active: false
    sourceComponent: Component {
      IdleMonitor {
        enabled: true
        timeout: root.idleSeconds
        respectInhibitors: root.config.respectInhibitors !== false
      }
    }
  }

  // omarchy's coffee toggle is not a wayland inhibitor, it just drops this file
  Process {
    id: stayAwakeProbe
    running: true
    command: ["test", "-f", root.stayAwakeDir + "/stay-awake"]
    onExited: function(code) {
      root.stayAwake = code === 0
      stayAwakeWatcher.reload()
    }
  }

  FileView {
    id: stayAwakeWatcher
    path: root.stayAwakeDir
    watchChanges: true
    printErrors: false
    onFileChanged: if (!stayAwakeProbe.running) stayAwakeProbe.running = true
  }

  onStayAwakeChanged: refreshMonitor()

  Process {
    id: lockProbe
    command: ["timeout", "5", "omarchy-shell", "lock", "isLocked"]
    stdout: StdioCollector { onStreamFinished: root.locked = String(text).trim() === "true" }
  }

  Timer {
    interval: 2500
    repeat: true
    running: root.showing
    onTriggered: if (!lockProbe.running) lockProbe.running = true
  }

  // the pointer "enters" the overlay the moment it maps, so input only counts after a beat
  function wake() {
    if (!armed) return
    suppressed = true
    armed = false
    forceShow = false
    preview = ""
    suppress.restart()
  }

  Timer { id: suppress; interval: 1200; onTriggered: root.suppressed = false }
  Timer { id: arm; interval: 700; onTriggered: root.armed = true }
  Timer { id: previewEnd; onTriggered: { root.forceShow = false; root.preview = "" } }

  onShowingChanged: {
    armed = false
    if (showing) {
      arm.restart()
      if (!lockProbe.running) lockProbe.running = true
    } else {
      arm.stop()
    }
  }

  IpcHandler {
    target: "screensavers"

    function show(): void { root.forceShow = true }
    function hide(): void { root.forceShow = false; root.preview = ""; root.suppressed = true; suppress.restart() }
    function test(seconds: string, scene: string): void {
      root.preview = root.scenes[scene] ? scene : ""
      root.forceShow = true
      previewEnd.interval = Math.max(1000, (parseInt(seconds, 10) || 10) * 1000)
      previewEnd.restart()
    }
    function reload(): void { configFile.reload() }
    function status(): string {
      return JSON.stringify({ active: root.active, idleSeconds: root.idleSeconds, watching: idleLoader.item !== null, isIdle: root.monitorIdle,
                              showing: root.showing, scene: root.shownScene, locked: root.locked, stayAwake: root.stayAwake })
    }
  }

  Component { id: world; World {} }
  Component { id: cave; Cave {} }
  Component { id: maze; Maze {} }
  Component { id: topo; Topo {} }
  Component { id: circuit; Circuit {} }

  Variants {
    model: Quickshell.screens

    PanelWindow {
      required property var modelData

      screen: modelData
      visible: root.showing
      color: "black"
      anchors { top: true; bottom: true; left: true; right: true }
      WlrLayershell.layer: WlrLayer.Overlay
      WlrLayershell.keyboardFocus: WlrKeyboardFocus.Exclusive
      WlrLayershell.namespace: "eduardo-screensavers"
      exclusionMode: ExclusionMode.Ignore

      Loader {
        anchors.fill: parent
        active: root.showing
        sourceComponent: root.scenes[root.shownScene] || null
      }

      MouseArea {
        anchors.fill: parent
        hoverEnabled: true
        acceptedButtons: Qt.AllButtons
        cursorShape: Qt.BlankCursor
        onPositionChanged: root.wake()
        onPressed: root.wake()
        onWheel: root.wake()
      }

      Item {
        anchors.fill: parent
        focus: true
        Keys.onPressed: root.wake()
      }
    }
  }
}
