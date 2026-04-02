# Livery Lab

Livery Lab is a free, browser-based iRacing paint editor. It runs as a static HTML/CSS/JavaScript app with no build step, no install, and no account requirement.

Live site: https://hman0994.github.io/liverylab

## What It Does

- Paint on layered car templates with brush, eraser, fill, shapes, gradients, text, and uploaded decals
- Browse and load built-in PSD templates for 164 cars from a searchable, category-filtered bundled car library
- Reopen your last 5 bundled cars quickly from browser-local recent history in the startup picker
- Export PNG or 32-bit TGA files for iRacing at 1024×1024 or 2048×2048
- Save and reload projects as JSON
- Manage layers, opacity, visibility, ordering, and template overlay strength

## Built-In Car Library

The bundled car selector is driven by [templates/cars.json](templates/cars.json), which maps each PSD template to a display name, iRacing paint-folder hint, and default dimensions.

Current behavior:

- On startup, the app opens on a blank canvas and prompts for a bundled car, custom template upload, or a blank workflow
- The startup picker supports search, category chips, and a recent-cars section so repeat selections are faster in the same browser
- On GitHub Pages or any local HTTP server, the app can load built-in PSD templates directly from the bundled library
- In some browsers, opening [index.html](index.html) via file:// blocks fetch-based loading of bundled templates and the manifest; custom template upload still works
- The export modal and export toasts update to the selected car's iRacing folder hint automatically, including a curated pass for the more ambiguous Class B stock-car variants

## Using The App

1. Open the live site or serve the repo folder over HTTP.
2. Choose a car from the startup modal, use search/category filters if needed, upload your own template, or start with a blank canvas.
3. Paint with the toolbar tools.
4. Export as PNG or TGA.
5. Rename the export to car_XXXXXXXX.tga or car_XXXXXXXX.png and place it in the folder shown by the app.

## iRacing Install Path

Livery Lab shows the target folder for the currently selected car inside the export modal and success toasts.

Typical install path:

```text
Documents\iRacing\paint\<car_folder>\
```

Rename your exported file to:

```text
car_XXXXXXXX.tga
```

Replace XXXXXXXX with your iRacing customer ID.

## Keyboard Shortcuts

- V: Select
- B: Brush
- E: Eraser
- F: Fill
- R: Rectangle
- C: Circle
- L: Line
- G: Gradient
- T: Text
- Delete / Backspace: Delete selection
- Ctrl+Z / Cmd+Z: Undo
- Ctrl+Y or Ctrl+Shift+Z / Cmd+Shift+Z: Redo

## Project Structure

```text
racecarPainter/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── app.js
│   ├── editor.js
│   ├── export.js
│   └── version.js
├── lib/
│   └── tga.js
├── templates/
│   ├── cars.json
│   └── *.psd
├── docs/
│   └── ARCHITECTURE.md
├── PLAN.md
└── CHANGELOG.md
```

## Development Notes

- No npm, no bundler, no transpilation
- Script load order matters: [lib/tga.js](lib/tga.js) → [js/export.js](js/export.js) → [js/editor.js](js/editor.js) → [js/version.js](js/version.js) → [js/app.js](js/app.js)
- [js/version.js](js/version.js) is the visible app-version source used by the top bar badge; keep it in sync with the next planned release in [CHANGELOG.md](CHANGELOG.md)
- Keep changes compatible with GitHub Pages and plain static hosting

## Deploying To GitHub Pages

1. Push the repository to GitHub.
2. In repository settings, open Pages.
3. Set the source to Deploy from a branch.
4. Select main and /(root).

The current public deployment is https://hman0994.github.io/liverylab.

## Tech Stack

- Fabric.js for 2D canvas editing
- ag-psd for PSD parsing
- Vanilla HTML, CSS, and JavaScript for the app shell

## License

MIT
