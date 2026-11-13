.pragma library

var TURNS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]

// Traces grow from random pads, mostly straight with the odd 45 degree bend, and stop
// before they would touch another trace. Each trace is a flat [x, y, x, y, ...] of cells.
function route(cols, rows, random) {
  var used = new Uint8Array(cols * rows)
  var traces = []
  var attempts = Math.round(cols * rows / 12)
  for (var i = 0; i < attempts; i++) {
    var x = Math.floor(random() * cols), y = Math.floor(random() * rows)
    if (used[y * cols + x]) continue
    var heading = Math.floor(random() * 4) * 2
    var cells = [x, y]
    var claimed = [y * cols + x]
    var length = 6 + Math.floor(random() * 34)
    for (var step = 0; step < length; step++) {
      if (random() < 0.16) heading = (heading + (random() < 0.5 ? 1 : 7)) % 8
      var nx = x + TURNS[heading][0], ny = y + TURNS[heading][1]
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || used[ny * cols + nx] || claimed.indexOf(ny * cols + nx) >= 0) break
      // a diagonal may not squeeze between two cells another trace already owns
      if (heading % 2 === 1 && (used[y * cols + nx] || used[ny * cols + x])) break
      x = nx; y = ny
      cells.push(x, y)
      claimed.push(y * cols + x)
    }
    if (cells.length < 8) continue
    for (var c = 0; c < claimed.length; c++) used[claimed[c]] = 1
    traces.push(cells)
  }
  return traces
}
