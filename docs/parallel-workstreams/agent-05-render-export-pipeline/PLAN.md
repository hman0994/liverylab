# Agent 05 Plan - Render And Export Pipeline

## Mission

Create the rendering and export contracts that move the app away from incidental scene rasterization toward explicit layer surfaces and a shared compositor.

## Start Condition

Can start with contract design and hotspot analysis immediately; implementation should align with the document model from Agent 03.

## Primary Outcomes

- Define the shared compositor contract.
- Unify viewport rendering assumptions and export output assumptions.
- Plan the migration away from per-stroke full-scene raster merges.
- Create the foundation for dirty-region, tile, and worker strategies.

## Owned Surface Area

- `js/core/render/**` as it is introduced
- render/export-facing portions of `js/editor.js`
- `js/export.js`

## Parallel-Safe Tasks

1. Profile the current brush merge, fill, and export path assumptions.
2. Define layer-surface responsibilities and compositing rules.
3. Define how export reuses compositor output instead of maintaining a separate truth path.
4. Identify the minimum adapter needed to coexist with Fabric during transition.
5. Define dirty-region and cache requirements without prematurely implementing worker complexity.

## Dependencies

- Coordinate ownership boundaries with Agent 01.
- Depend on Agent 03 for document-layer structure.
- Coordinate invalidation semantics with Agent 04.
- Coordinate tool preview behavior with Agent 06.

## Non-Goals

- No full tool-lifecycle ownership.
- No document-schema ownership.
- No early workerization unless the render contract is already stable.

## Deliverables

- First compositor contract.
- A staged plan for brush/fill/export unification.
- Clear migration boundaries between Fabric interaction and raster ownership.

## Definition Of Done

- Render and export no longer depend on unrelated scene behavior for correctness.
- The repo has a documented path away from full-scene stroke merges.
- Future performance work has a stable target architecture.

## First Execution Slice

1. Document the current render/export hotspots.
2. Publish the first compositor contract.
3. Validate one narrow path where export and viewport can share the same composite assumptions.

### First Slice Status (2026-04-02)

#### Hotspot Analysis

**Brush merge hotspot**

- Current path: `_onPathCreated()` -> `_mergeObjectOntoLayer()` -> `_rasterizeFabricObject()` -> `_replaceLayerWithImage()`.
- The stroke path is rasterized through a fresh full-size `fabric.StaticCanvas`, then merged into a full-size offscreen canvas, then encoded to PNG, then decoded again through `fabric.Image.fromURL()`.
- This means one localized stroke still pays for full-surface allocation, full-surface draw, PNG encode/decode, and Fabric object replacement.
- Layer identity is stable only through copied `_id` metadata; the actual raster owner is still the replaced Fabric image object rather than a document- or render-owned surface.

**Fill path hotspot**

- Current path: `_doFill()` draws the active layer into a full 2048x2048 offscreen canvas, reads the entire `ImageData`, runs scanline fill on the full buffer, then encodes the whole result back through `_replaceLayerWithImage()`.
- The algorithm is scoped to the active layer, which is correct for ownership, but the storage path is still whole-surface read/modify/write even when the affected region is small.
- The fallback path for no active layer creates a blank full-size layer and fills the whole artboard immediately, which reinforces the assumption that raster ownership is whole-scene rather than layer-surface based.

**Export-path duplication hotspot**

- `exportPNG()` and `exportTGA()` both depend on `editor.getExportImageData()` and then diverge only at the final file-encoding step.
- `getExportImageData()` temporarily mutates the live Fabric scene by hiding template, guide, and spec-map layers, calls `canvas.toDataURL()`, then reloads that flattened image into another canvas to recover `ImageData`.
- Export correctness therefore depends on incidental Fabric scene state, temporary visibility mutation, and a second encode/decode hop instead of a stable compositor contract.

**Layer-surface ownership hotspot**

- `EditorDocument v1` publishes layer metadata and a `payloadRef`, but the actual raster pixels are still owned by live Fabric image elements inside `bridge.fabricCanvas`.
- Brush and fill mutate pixels by replacing Fabric image objects, while export ignores document layer records and flattens the current scene.
- There is no stable surface registry keyed by document layer id, so viewport composition and export composition cannot yet share one authoritative raster source.

#### First Compositor Contract

This first contract stays intentionally narrow and CPU-only. It stabilizes the render truth before any worker or GPU discussion.

**Document-owned inputs**

- Agent 03 owns document layer order, identity, visibility, opacity, blend mode, transform, role, and export policy fields.
- Agent 05 consumes those layer records and resolves them to raster surfaces through adapter-owned payloads.
- The minimum layer record fields required by the compositor are: `id`, `role`, `visible`, `opacity`, `blendMode`, `transform`, `bounds`, and `payloadRef`.

**Render-owned surface model**

- Introduce a render-side surface registry keyed by document layer id.
- Each raster-capable layer resolves to one canonical surface at artboard resolution.
- Fabric remains an interaction adapter, not the durable raster owner.
- The first contract only needs raster surfaces for committed layer content. Tool previews stay outside the committed compositor output.

**First compositor interface**

```js
composeDocument({
	document,
	targetWidth,
	targetHeight,
	surfaceRegistry,
	policy,
	dirtyRect = null,
}) => {
	canvas,
	imageData,
	composedLayerIds,
}
```

Where `policy` is a stable render/export rules object:

```js
{
	mode: 'viewport' | 'export',
	includeTemplate: boolean,
	includeGuides: boolean,
	includeSpecMap: boolean,
	includeTransientPreview: boolean,
}
```

Contract rules:

- Layer ordering comes from the document, not Fabric stack order.
- Surface lookup happens by `layer.id`, not by active Fabric object identity.
- Export and viewport use the same compositor and differ only by `policy` and target size.
- PNG and TGA become codec wrappers over the same composed `ImageData`.
- Transient tool previews are explicitly excluded from committed export output; Agent 06 owns how those previews are painted above the committed viewport composite.

#### Invalidation Strategy

- `layer.content.changed`: pixel data on one layer changed; invalidate that layer surface and its affected rect.
- `layer.props.changed`: opacity, visibility, blend mode, or transform changed; keep the surface but invalidate composition for that layer's bounds.
- `stack.changed`: layer insert/remove/reorder; invalidate composite ordering from the earliest changed stack position upward.
- `document.resized`: invalidate every surface and the composite cache.
- `preview.changed`: viewport-only invalidation owned jointly with Agent 06; does not dirty committed export output.

The first slice does not require tile storage. Dirty rectangles are enough as a contract even if the first implementation still falls back to full-frame recomposition.

#### Narrow Migration Target

The first implementation slice should unify one narrow, testable path:

- committed raster image layers only,
- `source-over` plus current eraser `destination-out` behavior,
- export exclusion rules for template, guide, and spec-map layers,
- no text/shape/vector re-architecture yet,
- no workerization, no GPU path, no tile engine.

Concretely:

1. Add a render adapter that can resolve committed raster surfaces for existing image-backed content layers by `layer.id`.
2. Add one compositor entry point that composes those layers for both viewport base rendering and export rendering.
3. Switch `getExportImageData()` to the compositor instead of `canvas.toDataURL()` scene flattening.
4. Keep Fabric-based transient objects above the composed viewport base until Agent 06 defines the preview overlay contract.

This is the smallest slice where viewport and export share the same assumptions without forcing a full tool or document rewrite.

#### Coordination Notes

- With Agent 03: document layer records need one stable path from `layers[].id` to a raster surface payload. Render code should not invent a second layer identity model.
- With Agent 06: tool previews remain transient overlay state and must not be mistaken for committed layer pixels. Brush previews can stay in Fabric until commit, but committed stroke results should land in the shared raster-surface path.
- With Agent 04: invalidation reasons should line up with future transaction/event names so recomposition can respond to committed document changes instead of raw Fabric callbacks.

#### Next Implementation Slice

Success criteria for the next code slice:

1. A new render module can compose raster image layers from document order without mutating live Fabric visibility.
2. `getExportImageData()` uses that compositor and returns the same pixels for PNG and TGA inputs.
3. A viewport debug path or base-layer path can render the same compositor result under existing Fabric overlays for raster-only documents.
4. Manual verification compares raster-only viewport output vs exported PNG on a project containing base paint, one brush stroke, one filled region, and hidden guide/template/spec layers.