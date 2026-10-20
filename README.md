# Polowat House Builder

A parametric designer for finishing a small house on an existing concrete frame, and for a toilet house beside it, intended for Polowat atoll (Chuuk, FSM). Materials are bought from a supply shop in Weno and shipped by ferry.

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
- optional insect screens: a hinged screen frame inside every louvre, screen under the eaves, and the roof gaps closed with foam and blocking
- optional gutters on both eaves feeding a rainwater tank on a block base at one gable end, through a first-flush chamber

Every dimension of the existing concrete can be set to match what was actually poured.

## Features

- **3D model** (three.js) with two looks: a flat **SketchUp-style** view with outlines, and a **realistic** view. The realistic view has:
  - procedural, non-repeating materials: treated pine with real grain and knots, weathered concrete with rain streaks and splash-back grime, a troweled slab, spangled galvanised steel, lauan plywood, coral sand and grass
  - per-board and per-sheet colour variation
  - a tropical sky with clouds that also lights the scene, sun shadows, ambient occlusion and haze toward the horizon
  - exposure that adapts when you look around inside
- **Gable roof** in **metal or PVC "tinroof"**; outer walls in the same material and inner walls in plywood.
- **Doors and windows**: in a wall × bay grid, tick the bays that have a door gap in the pony wall. A second grid closes chosen gaps with framing, corrugated sheet and plywood instead of a door. Windows are spread along every wall no further apart than a maximum spacing you choose.
- **Existing concrete inputs**: column count and size, pony wall height and thickness, and ring beam height. There is an optional new floor slab reinforced with 6″ × 6″ galvanised wire mesh over a plastic underlay.
- **All hardware is drawn**: framing nails and toenails, concrete screws, wedge anchors, hurricane ties, roofing screws on every purlin and girt, panel nails, casing nails, T-hinges, hasps and padlocks. The fastener counts in the bill of materials come from this hardware.
- **Screens and rainwater**: insect screens can be turned on or off. So can the gutters and tank, with a choice of tank size (300 to 1500 gal) and which end it stands at. The pipes run from the gutters along the end wall to a tee, then out over a first-flush chamber into the tank. The tank's block base is built as high as the gutters allow, so a shorter tank gets a higher tap. Warnings appear if the tank is too tall for the gutters, if the tap is too low for a bucket, or if the pipes would cross a door or window.
- **Explode slider** that separates the building into its layers.
- **Construction playback**: 16 steps, from the existing concrete through the floor, wall plates, infill walls, roof, siding, windows and doors and the interior plywood, to the screens, gutters and tank. Each step has a written explanation that uses the real dimensions and quantities.
- **Step-by-step guide**: written for someone who has never built anything. It covers tools, safety, the words used and the basic skills, then every stage in order, with "done" ticks kept in the browser. Every number comes from the current design. The pictures are:
  - snapshots of the 3D model at each stage, wide views and close-ups, with the parts added in that step highlighted
  - drawings made from the design: a plan of the frame, framing for each bay (identical bays drawn once) with where to mark and how long to cut every piece, a section through the wall, the rafter pattern and birdsmouth, the gable end, purlin spacing, sheet layouts and plywood layouts. With screens and rainwater on, the drawings also include a section through the eave, the window screen frame, the fall of the gutters, the tank end of the house with its pipes, a plan of the tank base and a section through the tank
  - close-up diagrams of the techniques: nailing, concrete screws, wedge anchors, mixing concrete, sheet laps, hurricane ties, the door brace
- **Shipping layout**: every purchased item laid flat in strapped bundles, with sizes, volume and weight for the ferry.
- **Bill of materials** priced from the shop's written quote where it lists the item, and from the shop's price sign otherwise, plus 6% sales tax:
  - lumber is cut-optimised, and every board gets a cut diagram
  - plywood is nested on 4×8 sheets
  - 8′, 10′ and 12′ corrugated sheets are chosen at the lowest cost
  - each material group has its own contingency/overage
  - the tools from the guide's tool list are on it too
  - with gutters and tank on, it is split into two phases: **phase 1** is the house, **phase 2** the gutters, downpipes, water tank and its base, which can be bought and built later
  - prices are editable, and you can export a CSV
- **Store shopping list** for the counter at Ace Hardware in Weno: every item with the shop's item # from its quote, the Ace Hardware item # and manufacturer's #, the quantity in Ace's packs, a price, a plain-English description and what it is used for. It downloads as a CSV or prints as a clean page whose item names link to the Ace pages. The lists for the default design are in `shopping/`.
- **Design notes**: key specs, the reasons behind the design choices, and the assumptions you should check.
- The URL stores every parameter, so a design can be shared as a link.

## Toilet House

A second design for a small outhouse built close to the water:
- a 4″ slab with 6″ × 6″ wire mesh (cut from what is left on the house's roll when there's enough), with a step in front of the door
- a hollow-block pony wall with a door gap. The cells under the anchor bolts, at the corners and beside the door are grouted, with #4 dowels hooked into the slab
- 2x4 framing with corrugated metal or PVC sheet, and a single-slope roof that falls toward the water, away from the door
- a band of fiberglass insect screen above eye level along both side walls, for cross-ventilation. The eaves are closed with frieze blocks and foam
- a seat-height pour-flush bowl with a 2″ vent through the roof, flushed with a bucket of seawater
- an outward-opening board door with no lock: a pull and a hook and eye outside, and a barrel bolt inside for privacy

The waste goes either to a **seawater outfall** or to a **pit**:
- **Outfall:** a buried drain down the beach, then a pipe along the lagoon floor held down by concrete collars, with a flap valve and a cleanout.
- **Pit:** block-lined, with a concrete lid. The model shows groundwater standing in it when it is dug below the water table.

The two designs are top tabs (House and Toilet House), and each has its own row of pages underneath. The toilet house has its own 3D model with 13 construction steps and a "Site" view of the whole outfall. It also has:
- a **Step-by-step** guide, from laying out the slab to the first flush. Its drawings include the drain under the slab, a slab plan with the flange and dowel positions, both block courses, every wall's framing with stud lengths, the rafter with its two birdsmouths, and the outfall or the pit
- a **Waste system** page: how the outfall works, its numbers (flush water, how far each flush moves the water in the flooded pipe, how long waste stays in it), what makes it work, and a comparison of outfall, pit and the shoreline
- a **Shipping layout** of its bundles, like the house's
- a bill of materials with shipping bundles
- design notes

Toilet-house parameters are kept in the URL with a `t.` prefix, and `tab=` records the open page (for example `tab=ship`, `tab=toilet-waste` or `tab=all-bom`).

## All

The first top tab, **All**, puts both designs together. It has two pages:
- a **Shipping layout** with the bundles of both designs on one deck, each one marked with the building it is for
- a **Bill of materials** with the house's sections followed by the toilet house's

Every total on it (cost, tax, freight, weight and volume) is the house's plus the toilet house's. The shopping list adds up items that both designs use.

## Photos

The last top tab, **Photos**, shows a picture of every item on both bills of materials, grouped by kind, with the quantity and cost each design needs. It helps when asking for things at the shop counter. A checkbox also shows catalog items that the current designs don't use (the other plywood, louvre and pipe sizes, for example). The pictures are in `img/items/`, and `js/photo-data.js` records where each one came from. Click a photo to open its source.

## Structure

A 2x6 wall plate is wedge-anchored to the ring beam, and the rafters sit on it: birdsmouthed, plumb-cut at the tail for the fascia, and fixed with hurricane ties. Each bay between columns is filled with a 2x4 frame, screwed to the pony wall, the columns and the ring beam. The frame has rows of blocking for the vertical corrugated siding. Openings need no headers, because the ring beam spans over them.

## Development

The app is static HTML/JS with no build step. three.js loads from a CDN through an import map. To run it, serve the folder:

```sh
python3 -m http.server 8000
```

The printed shopping lists in `shopping/` are made from the default design with Node:

```sh
npm install
npm run shopping
```

This writes a CSV and a printable HTML page for each phase. The PDFs beside them are those pages printed to PDF from Chromium, with the links kept. The Ace Hardware item numbers, prices and pack sizes are in `js/ace-data.js`.

| File | Purpose |
| --- | --- |
| `js/design.js` | Parametric engine: parameters → parts, steps and quantities |
| `js/catalog.js` | Shop prices, lumber and plywood sizes, weights |
| `js/bom.js` | Cut optimisation, sheet packing, pricing, the two building phases |
| `js/tools.js` | The house's tool list, shared by the guide and the BOM |
| `js/shopping.js`, `js/ace-data.js`, `scripts/shopping-list.mjs` | Store shopping list: Ace Hardware item numbers, CSV and printable page |
| `js/shipping.js` | Flat-pack bundle layout |
| `js/viewer.js`, `js/materials.js`, `js/geometry.js` | Rendering |
| `js/toilet.js` | Toilet house: parameters → parts, steps and quantities |
| `js/main.js`, `js/toilet-ui.js`, `js/fields.js`, `js/bomview.js`, `js/photos.js` | UI |
| `js/guide-house.js`, `js/guide-house-extras.js`, `js/guide-toilet.js` | Step-by-step guides (the extras file covers the house's screens, gutters and tank) |
| `js/guide.js`, `js/guide-svg.js`, `js/snap.js` | Guide layout, drawing kit, 3D snapshots |
| `js/photo-data.js`, `img/items/` | Item photos and their sources |

This is a planning tool, not a stamped engineering design.
