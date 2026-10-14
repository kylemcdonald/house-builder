# Polowat House Builder

A parametric designer for a small raised-floor house built with simple pole-frame construction, intended for Polowat atoll (Chuuk, FSM). Materials are bought from a supply shop in Weno and shipped by ferry.

**Live app:** https://kylemcdonald.github.io/house-builder/

Set the **width** and **depth** and everything else is redesigned automatically: posts, beam lines, joists, studs, blocking, door and window openings, stairs, rafters, purlins, roof sheets, siding and plywood.

## Features

- **3D model** (three.js) with two looks: a flat **SketchUp-style** view with outlines, and a **realistic** view with procedural wood, concrete, galvanised steel, PVC, plywood and sand, sky lighting, shadows and ambient occlusion.
- **Gable or single-slope roof**, and **metal or PVC "tinroof"** for the roof and outer walls. The inner walls are plywood.
- **Explode slider** that separates the building into its layers.
- **Construction playback**: 18 steps, from layout strings and post holes through to the interior plywood. Each step has a written explanation that uses the real dimensions and quantities.
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

The structure follows the reference build: continuous posts from the footing to the wall plate, made of two 2x6s laminated together because the shop has no 4x4s. The posts are set in concrete with a collar crowned above grade. Doubled 2x6 beams are bolted to the posts, with 2x6 joists and a plywood floor. The walls are 2x4 with rows of blocking that the vertical corrugated siding nails to. The roof is rafters with 2x4 purlins and corrugated sheets. There are hurricane ties throughout, aluminium louvre windows on opposite walls, a site-built board door, and cleated 2x6 stairs with railings.

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
