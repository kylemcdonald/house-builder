# Polowat House Builder

A parametric designer for a small house built with pole-frame construction on a concrete slab, intended for Polowat atoll (Chuuk, FSM). Materials are bought from a supply shop in Weno and shipped by ferry.

**Live app:** https://kylemcdonald.github.io/house-builder/

Set the **width** and **depth** and everything else is redesigned automatically: posts, studs, blocking, door and window openings, rafters, purlins, roof sheets, siding, plywood, slab, rebar and formwork. The default is a 36′ × 17′ house on a 12″ concrete slab. It has 12 posts (the corners plus two along each wall), two doors on one long wall, and one door on each of the other walls.

## Features

- **3D model** (three.js) with two looks: a flat **SketchUp-style** view with outlines, and a **realistic** view with procedural wood, concrete, galvanised steel, PVC, plywood and sand, sky lighting, shadows and ambient occlusion.
- **Gable roof** in **metal or PVC "tinroof"**; outer walls in the same material and inner walls in plywood.
- **Doors and windows**: set the number of doors per wall. Windows are spread along every wall no further apart than a maximum spacing you choose, and posts slide aside to clear openings.
- **Foundation**: a solid slab (12″ by default) or a 4″ slab with a thickened edge. It includes cast-in post footings, a rebar grid, plastic underlay and J-bolts.
- **Explode slider** that separates the building into its layers.
- **Construction playback**: 14 steps, from layout strings, excavation, posts, formwork and rebar, through to the interior plywood. Each step has a written explanation that uses the real dimensions and quantities.
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

The structure follows the reference build. The posts are pairs of 2x6s laminated together, because the shop has no 4x4s. They run continuously from footing holes below the slab up to the wall plate, and are cast in when the slab is poured. The walls are 2x4 framed between the posts, with rows of blocking for the vertical corrugated siding to nail to, and the bottom plates are J-bolted to the slab. The gable roof has rafters, 2x4 purlins and corrugated sheets. There are hurricane ties throughout, aluminium louvre windows, and site-built board doors.

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
