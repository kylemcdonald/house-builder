# Polowat House Builder

A parametric designer for finishing a small house on an existing concrete frame, intended for Polowat atoll (Chuuk, FSM). Materials are bought from a supply shop in Weno and shipped by ferry.

**Live app:** https://kylemcdonald.github.io/house-builder/

The site already has a 36′ × 17′ concrete frame:
- a 6″ perimeter outline with pony walls about 2′ high
- 9″ × 9″ concrete columns at the corners and two along each wall
- a 9″ ring beam just above door height

The app designs everything that goes on that frame:
- wood infill walls between the columns
- the gable roof, on a plate bolted to the ring beam
- metal or PVC corrugated cladding outside and plywood inside
- louvre windows and doors
- an optional concrete floor slab

Every dimension of the existing concrete can be set to match what was actually poured.

## Features

- **3D model** (three.js) with two looks: a flat **SketchUp-style** view with outlines, and a **realistic** view with procedural wood, concrete, galvanised steel, PVC, plywood and sand, sky lighting, shadows and ambient occlusion.
- **Gable roof** in **metal or PVC "tinroof"**; outer walls in the same material and inner walls in plywood.
- **Doors and windows**: set the number of doors per wall. Doors are centred in the bays between columns. Windows are spread along every wall no further apart than a maximum spacing you choose.
- **Existing concrete inputs**: column count and size, pony wall height and thickness, and ring beam height. There is an optional new floor slab with a rebar grid and plastic underlay.
- **Explode slider** that separates the building into its layers.
- **Construction playback**: 13 steps, from the existing concrete through the floor, wall plates, infill walls, roof, siding, windows and doors, to the interior plywood. Each step has a written explanation that uses the real dimensions and quantities.
- **Shipping layout**: every purchased item laid flat in strapped bundles, with sizes, volume and weight for the ferry.
- **Bill of materials** priced from the shop sign:
  - lumber is cut-optimised, and every board gets a cut diagram
  - plywood is nested on 4×8 sheets
  - 10′ and 12′ corrugated sheets are chosen at the lowest cost
  - each material group has its own contingency/overage
  - prices are editable, and you can export a CSV
- **Design notes**: key specs, the reasons behind the design choices, and the assumptions you should check.
- The URL stores every parameter, so a design can be shared as a link.

## Structure

A 2x6 wall plate is wedge-anchored to the ring beam, and the rafters sit on it: birdsmouthed, plumb-cut at the tail for the fascia, and fixed with hurricane ties. Each bay between columns is filled with a 2x4 frame, screwed to the pony wall, the columns and the ring beam. The frame has rows of blocking for the vertical corrugated siding. Openings need no headers, because the ring beam spans over them.

## Development

The app is static HTML/JS with no build step. three.js loads from a CDN through an import map. To run it, serve the folder:

```sh
python3 -m http.server 8000
```

| File | Purpose |
| --- | --- |
| `js/design.js` | Parametric engine: parameters → parts, steps and quantities |
| `js/catalog.js` | Shop prices, lumber and plywood sizes, weights |
| `js/bom.js` | Cut optimisation, sheet packing, pricing |
| `js/shipping.js` | Flat-pack bundle layout |
| `js/viewer.js`, `js/materials.js`, `js/geometry.js` | Rendering |
| `js/main.js` | UI |

This is a planning tool, not a stamped engineering design.
