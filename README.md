<p align="center">
	<img src="assets/brand/fullLogo.png" alt="Livery Lab" width="720">
</p>

<p align="center">
	<strong>Free browser-based iRacing paint editor</strong><br>
	Official iRacing templates, layered painting tools, and fast PNG/TGA export in one clean workflow.
</p>

<p align="center">
	<a href="https://hman0994.github.io/liverylab"><strong>Open Livery Lab</strong></a>
</p>

<p align="center">
	<img alt="Version" src="https://img.shields.io/badge/release-v0.2.0.2-111111?style=for-the-badge">
	<img alt="Exports" src="https://img.shields.io/badge/export-PNG%20%7C%2032--bit%20TGA-d7ff3f?style=for-the-badge">
	<img alt="Cars" src="https://img.shields.io/badge/templates-166%2B-111111?style=for-the-badge">
</p>

---

<p align="center">
	<img src="assets/GIF1.gif" alt="Livery Lab — template picker and car selection" width="800">
</p>

## What It Does

Livery Lab is a free, browser-based livery painter built specifically for iRacing. Open the app, pick any of 166+ official car templates, paint on multiple layers using a full set of drawing tools, and export a race-ready TGA or PNG — no install, no account, no friction.

Official templates are hosted on a fast CDN and load on demand. Your work is saved locally in your browser and can be exported as a JSON project file at any time. Everything runs client-side, so your livery data never leaves your machine.

Current version: **v0.2.0.2**

---

<p align="center">
	<img src="assets/GIF2.gif" alt="Livery Lab — brush and paint tools in action" width="800">
</p>

## Features

### Template Library — 166+ Cars

Templates are grouped into 13 categories covering nearly every car currently available in iRacing:

| Category | Templates |
|---|---|
| NASCAR / Oval | 36 |
| GT3 | 18 |
| Sports Car | 18 |
| Formula | 15 |
| Other | 15 |
| Prototype | 13 |
| Touring Car | 10 |
| Dirt Oval | 10 |
| One-Make | 9 |
| Truck | 9 |
| GT4 | 7 |
| Rallycross | 4 |
| Suits & Helmets | 2 |

The car picker supports **live search**, **category filtering**, and remembers your **5 most recently used** templates so you can jump back into past projects quickly.

---

### Painting Tools

Each tool maps to a single keyboard shortcut so you can switch without reaching for the mouse:

- **Brush** (`B`) — freehand painting with adjustable size and opacity
- **Eraser** (`E`) — remove paint while preserving the template layer underneath
- **Fill** (`F`) — flood-fill a region with a solid color in a single click
- **Rectangle** (`R`) and **Circle** (`C`) — draw crisp, filled or outlined shapes
- **Line** (`L`) — straight lines between two points
- **Gradient** (`G`) — linear gradients between two colors across the canvas
- **Text** (`T`) — add sponsor names, numbers, or any custom text with font and size control
- **Select** (`V`) — move, nudge, or delete any painted element

All tools operate on a **non-destructive layer system** — the original template is always preserved on its own layer and is never painted over.

---

<p align="center">
	<img src="assets/GIF3.gif" alt="Livery Lab — layers, shapes, and design tools" width="800">
</p>

### Layers and Undo

The editor maintains a stack of paint operations so you can:

- **Undo / Redo** with `Ctrl+Z` / `Ctrl+Y` to step through your full edit history
- **Nudge** selected elements pixel-by-pixel with `Arrow keys`, or 10px at a time with `Shift+Arrow`
- Layer decals, shapes, gradients, and text on top of each other in any order

### Export

The export panel is designed around the exact folder structure iRacing expects. Enter your **customer ID** once and the app generates the correct filename and folder path automatically.

```text
Documents\iRacing\paint\<car_folder>\car_XXXXXXXX.tga
```

**Formats:** PNG, 32-bit TGA  
**Sizes:** 1024×1024 or 2048×2048 (2048 recommended for high-detail liveries)

TGA files are exported with full 32-bit BGRA color depth, matching what iRacing reads natively. PNG export is useful for sharing previews or use in external editors.

### Project Save and Load

The **Save Project** button exports your full livery as a `.json` file containing every layer, shape, gradient, and text element. You can:

- Save mid-session and reload later without losing anything
- Share a project file and let someone else open it in their own browser
- Keep versioned saves (`livery-v1.json`, `livery-v2.json`) as checkpoints while iterating

---

<p align="center">
	<img src="assets/GIF4.gif" alt="Livery Lab — export workflow" width="800">
</p>

---

## Quick Start

1. Open [Livery Lab](https://hman0994.github.io/liverylab).
2. Pick a car from the template library, upload your own PSD/TGA/PNG, or start blank.
3. Paint using the toolbar — press `B` for brush, `F` for fill, `T` for text, etc.
4. Click **Export Paint**, set your customer ID, and drop the file into the folder shown.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `V` | Select |
| `B` | Brush |
| `E` | Eraser |
| `F` | Fill |
| `R` | Rectangle |
| `C` | Circle |
| `L` | Line |
| `G` | Gradient |
| `T` | Text |
| `Arrow keys` | Nudge selection 1px |
| `Shift` + `Arrow` | Nudge selection 10px |
| `Delete` / `Backspace` | Delete selection |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |

## Tips

- **Start with the template layer visible** so you can see panel lines and body contours while painting. You can hide it at any time without losing it.
- **Use 2048×2048 for final exports** — iRacing supports it and the extra resolution is visible in-sim, especially on sponsor text and fine details.
- **Save a project file before major changes.** The undo stack exists per session; reloading the page clears it. A saved JSON file is your permanent undo.
- **For number plates and sponsor logos**, use the Text tool for simple text, or upload a PNG with a transparent background as a decal and position it with the Select tool.
- **Custom templates:** if you have a car not in the list, you can upload any PNG, TGA, or PSD directly and paint over it the same way.

## More Detail

- [CHANGELOG.md](CHANGELOG.md) — release history
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — internals and editor design
- [docs/QA/README.md](docs/QA/README.md) — QA process overview
- [docs/QA/MANUAL-TEST-CHECKLIST.md](docs/QA/MANUAL-TEST-CHECKLIST.md) — manual regression checklist
