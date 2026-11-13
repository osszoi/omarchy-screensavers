import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import qs.Commons
import qs.Commons as Commons
import qs.Ui

// Every screensaver on this machine as a card. Enter makes one the active one, which
// switches the others off; P plays it for a minute (any key ends it) without changing anything.
Item {
  id: root

  property var shell: null
  property var manifest: null
  property bool opened: false

  readonly property string home: Quickshell.env("HOME")
  readonly property string configHome: Quickshell.env("XDG_CONFIG_HOME") || home + "/.config"
  property string here: Qt.resolvedUrl(".").toString().replace(/^file:\/\//, "")
  readonly property string nvimDir: configHome + "/omarchy/plugins/eduardo.nvim-screensaver"

  property string active: ""
  property bool nvimInstalled: false
  property int selected: 0

  readonly property var everything: [
    { id: "world", name: "World", note: "Land and water settle, then biomes creep across it", picture: Qt.resolvedUrl("previews/world.png") },
    { id: "cave", name: "Living cave", note: "A cave erodes out of noise, then crystals light it up", picture: Qt.resolvedUrl("previews/cave.png") },
    { id: "maze", name: "Maze", note: "Carved, searched, then solved", picture: Qt.resolvedUrl("previews/maze.png") },
    { id: "topo", name: "Topographic map", note: "Contour lines of a terrain that does not exist", picture: Qt.resolvedUrl("previews/topo.png") },
    { id: "circuit", name: "Circuit board", note: "Traces route themselves, then carry a pulse", picture: Qt.resolvedUrl("previews/circuit.png") },
    { id: "nvim", name: "Nvim", note: "Replays your recent commits in a fake Neovim", picture: "file://" + nvimDir + "/preview.png" },
    { id: "omarchy", name: "Omarchy", note: "The built-in terminal screensaver", picture: "" },
  ]
  readonly property var entries: everything.filter(function(entry) { return entry.id !== "nvim" || root.nvimInstalled })
  readonly property int columns: 4

  readonly property color ink: Commons.Color.menu.text
  readonly property color paper: Commons.Color.menu.background
  readonly property color accent: Commons.Color.accent
  readonly property int tileWidth: 340
  readonly property int pictureHeight: Math.round(tileWidth * 225 / 800)

  function open(payloadJson) {
    configFile.reload()
    nvimProbe.running = true
    opened = true
    Qt.callLater(function() { keys.forceActiveFocus() })
  }

  function close() { opened = false }
  function dismiss() { opened = false }

  function choose(index) {
    var entry = entries[index]
    if (!entry) return
    Quickshell.execDetached(["bash", here + "bin/screensavers-apply", entry.id])
    active = entry.id
    dismiss()
  }

  function preview(index) {
    var entry = entries[index]
    if (!entry) return
    dismiss()
    if (entry.id === "nvim") Quickshell.execDetached(["omarchy-shell", "nvim-screensaver", "test", "60"])
    else if (entry.id === "omarchy") Quickshell.execDetached(["omarchy-launch-screensaver", "force"])
    else Quickshell.execDetached(["omarchy-shell", "screensavers", "test", "60", entry.id])
  }

  function move(by) {
    selected = Math.max(0, Math.min(entries.length - 1, selected + by))
  }

  FileView {
    id: configFile
    path: root.configHome + "/omarchy-screensavers/config.json"
    watchChanges: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: {
      try {
        root.active = JSON.parse(text()).active || ""
      } catch (error) {
        root.active = ""
      }
      for (var i = 0; i < root.entries.length; i++) if (root.entries[i].id === root.active) root.selected = i
    }
  }

  Process {
    id: nvimProbe
    running: true
    command: ["test", "-f", root.nvimDir + "/config.json"]
    onExited: function(code) { root.nvimInstalled = code === 0 }
  }

  OverlayWindow {
    id: panel
    shown: root.opened
    WlrLayershell.namespace: "eduardo-screensavers-chooser"

    Rectangle {
      anchors.fill: parent
      color: Commons.Color.menu.scrim
    }

    MouseArea {
      anchors.fill: parent
      onClicked: root.dismiss()
    }

    Rectangle {
      id: card

      anchors.centerIn: parent
      width: grid.width + 56
      height: column.height + 56
      radius: Style.cornerRadius
      color: root.paper
      border.width: 1
      border.color: Qt.rgba(root.ink.r, root.ink.g, root.ink.b, 0.16)

      MouseArea { anchors.fill: parent; onClicked: {} }

      Item {
        id: keys

        anchors.fill: parent
        focus: true

        Keys.onPressed: function(event) {
          if (event.key === Qt.Key_Escape) root.dismiss()
          else if (event.key === Qt.Key_Left) root.move(-1)
          else if (event.key === Qt.Key_Right) root.move(1)
          else if (event.key === Qt.Key_Up) root.move(-root.columns)
          else if (event.key === Qt.Key_Down) root.move(root.columns)
          else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) root.choose(root.selected)
          else if (event.key === Qt.Key_P) root.preview(root.selected)
          else return
          event.accepted = true
        }
      }

      Column {
        id: column

        anchors.centerIn: parent
        spacing: 22

        Text {
          textFormat: Text.PlainText
          text: "Screensavers"
          color: root.ink
          font.family: Style.font.menuFamily
          font.pixelSize: Style.font.heading
          font.weight: Font.Bold
        }

        Grid {
          id: grid

          columns: root.columns
          spacing: 20

          Repeater {
            model: root.entries

            Item {
              id: tile

              required property var modelData
              required property int index

              readonly property bool current: index === root.selected
              readonly property bool inUse: modelData.id === root.active

              width: root.tileWidth
              height: root.pictureHeight + 62

              Rectangle {
                id: picture

                width: parent.width
                height: root.pictureHeight
                radius: 10
                color: Qt.darker(root.paper, 1.5)
                border.width: tile.current ? 2 : 1
                border.color: tile.current ? root.accent : Qt.rgba(root.ink.r, root.ink.g, root.ink.b, 0.14)
                clip: true

                Image {
                  anchors.fill: parent
                  anchors.margins: parent.border.width
                  visible: tile.modelData.picture !== ""
                  source: tile.modelData.picture
                  sourceSize: Qt.size(800, 225)
                  fillMode: Image.PreserveAspectCrop
                  asynchronous: true
                }

                Text {
                  anchors.centerIn: parent
                  visible: tile.modelData.picture === ""
                  textFormat: Text.PlainText
                  text: ">_"
                  color: Qt.rgba(root.ink.r, root.ink.g, root.ink.b, 0.55)
                  font.family: Style.font.family
                  font.pixelSize: 44
                }

                Rectangle {
                  visible: tile.inUse
                  anchors.right: parent.right
                  anchors.top: parent.top
                  anchors.margins: 10
                  width: badge.width + 18
                  height: badge.height + 8
                  radius: height / 2
                  color: root.accent

                  Text {
                    id: badge
                    anchors.centerIn: parent
                    textFormat: Text.PlainText
                    text: "Active"
                    color: root.paper
                    font.family: Style.font.menuFamily
                    font.pixelSize: Style.font.bodySmall
                    font.weight: Font.Bold
                  }
                }
              }

              Text {
                id: name

                anchors.top: picture.bottom
                anchors.topMargin: 10
                textFormat: Text.PlainText
                text: tile.modelData.name
                color: tile.current ? root.accent : root.ink
                font.family: Style.font.menuFamily
                font.pixelSize: Style.font.title
                font.weight: Font.DemiBold
              }

              Text {
                anchors.top: name.bottom
                anchors.topMargin: 3
                width: parent.width
                textFormat: Text.PlainText
                text: tile.modelData.note
                elide: Text.ElideRight
                color: Qt.rgba(root.ink.r, root.ink.g, root.ink.b, 0.6)
                font.family: Style.font.menuFamily
                font.pixelSize: Style.font.body
              }

              MouseArea {
                anchors.fill: parent
                hoverEnabled: true
                onEntered: root.selected = tile.index
                onClicked: root.choose(tile.index)
              }
            }
          }
        }

        Text {
          textFormat: Text.PlainText
          text: "Enter to use it    P to preview    Esc to close"
          color: Qt.rgba(root.ink.r, root.ink.g, root.ink.b, 0.5)
          font.family: Style.font.menuFamily
          font.pixelSize: Style.font.bodySmall
        }
      }
    }
  }
}
