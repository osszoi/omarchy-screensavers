# Screensavers for Omarchy

An [Omarchy](https://omarchy.org) shell plugin with five generative screensavers and a chooser for every screensaver on the machine.

- **World**: a map seen from above that settles instead of being drawn. Land and water start as specks and take sides all over the map at once, then the ground rises, plants creep inland from the shores, woods thicken, peaks turn to rock and snow, rivers find their way down to the lakes and, since it is always night there, the lights of the settlements come on along the water.
- **Living cave**: built the way a roguelike builds one. Noise, smoothing passes that land as scattered changes all over it, small pockets filled back in, tunnels dug between the caverns that are left, biomes racing each other through it, pools, and finally crystals whose light walks through the tunnels and stops at rock.
- **Maze**: carved cell by cell, flooded by a search with its front lit up, then the way through is traced back.
- **Topographic map**: contour lines of a terrain that does not exist, drawn from the valleys up.
- **Circuit board**: traces route themselves around each other, then a handful carry a pulse.

Each one builds itself step by step, holds for 3 seconds once finished and fades into a new random one. Colours follow the Omarchy theme.

It starts after `idle.screensaver` seconds (`~/.config/omarchy/shell.json`), goes away on any key or mouse movement, and stays out of the way of the lock screen, idle inhibitors and the stay-awake toggle.

## Install

```bash
git clone https://github.com/osszoi/omarchy-screensavers ~/Work/personal/omarchy-screensavers
~/Work/personal/omarchy-screensavers/install.sh
```

`install.sh` links the plugin into `~/.config/omarchy/plugins`, enables it, adds a **Screensavers** entry to the app launcher and, the first time, makes the living cave the active screensaver. `uninstall.sh` hands the job back to the Nvim screensaver if it is installed, to Omarchy's own one otherwise.

## Chooser

Open **Screensavers** from the launcher, or run `omarchy-shell shell toggle eduardo.screensavers`.

It lists the five scenes, [eduardo.nvim-screensaver](https://github.com/osszoi/omarchy-nvim-screensaver) when installed, and Omarchy's built-in one. Arrows move, Enter makes one the active screensaver (the others are switched off), P plays it for a minute without changing anything (any key ends it).

The choice lives in `~/.config/omarchy-screensavers/config.json`:

```json
{ "active": "maze", "respectInhibitors": true }
```

From a terminal:

```bash
bin/screensavers-apply world|cave|maze|topo|circuit|nvim|omarchy
omarchy-shell screensavers test 10 maze   # play one for 10 seconds
omarchy-shell screensavers status
```

## How it is built

`Screensavers.qml` is the service: an idle monitor and one fullscreen overlay per screen that loads the active scene. `Chooser.qml` is the overlay with the cards.

Every scene extends `scenes/Scene.qml`, which owns the step clock, the hold and the fade. Scenes only repaint when a step lands and only what that step changed; nothing animates between steps. The simulations are plain JS (`scenes/*.js`) and are tested with node:

```bash
node test/cave.test.js && node test/scenes.test.js && node test/world.test.js
```

The cave and the map are drawn by fragment shaders in `shaders/`. After editing a `.frag`, rebuild its `.qsb`:

```bash
/usr/lib/qt6/bin/qsb --qt6 -o shaders/cave.frag.qsb shaders/cave.frag
```
