// Tools for building the house: the "Tools" step of the guide and the Tools
// section of the bill of materials both come from this list. Each group has
// the store items it needs as [catalog key, quantity].
export function houseTools({ pvc, screens, rain, concrete }) {
  return [
    { name: 'Tape measures', desc: 'two 25\' tapes, and a 100\' tape for the diagonals', items: [['tape25', 2], ['tape100', 1]] },
    { name: 'Chalk line and pencils', desc: 'carpenter\'s pencils and a marker', items: [['chalkLine', 1], ['chalk', 1], ['pencils', 1], ['marker', 1]] },
    { name: 'Speed square', desc: 'for square cuts and the roof angle', items: [['speedSquare', 1]] },
    { name: 'Levels', desc: 'a 4\' level and a short one', items: [['level4', 1], ['levelTorpedo', 1]] },
    { name: 'String line and line level', desc: 'for long straight lines', items: [['stringLine', 1], ['lineLevel', 1]] },
    { name: 'Circular saw', desc: '7-1/4", with spare blades', items: [['circSaw', 1], ['sawBlade', 3]] },
    { name: 'Handsaw', desc: 'to finish cuts the circular saw can\'t reach', items: [['handsaw', 1]] },
    pvc
      ? { name: 'Fine-tooth saw blade', desc: 'for cutting the PVC sheets', items: [['fineBlade', 1]] }
      : { name: 'Tin snips', desc: 'left- and right-cut aviation snips for the metal sheets', items: [['snipsL', 1], ['snipsR', 1]] },
    { name: 'Two framing hammers', desc: '20 oz, and a pry bar', items: [['hammer', 2], ['prybar', 1]] },
    { name: 'Hammer drill', desc: 'with 3/16" and 1/2" masonry bits (buy spares)', items: [['hammerDrill', 1], ['bit316', 4], ['bit12', 2]] },
    { name: 'Drill/driver', desc: 'with a 5/16" hex nut driver for the roofing screws', items: [['drillDriver', 1], ['nutDriver', 2]] },
    { name: 'Wrench or socket', desc: '3/4" for the 1/2" wedge anchors', items: [['wrench34', 1]] },
    { name: 'Caulk gun', desc: 'for the sealant', items: [['caulkGun', 1]] },
    { name: 'Ladders and sawhorses', desc: 'two stepladders, one long ladder, two sawhorses, some planks', items: [['stepladder', 2], ['extLadder', 1], ['sawhorse', 2]] },
    { name: 'Power', desc: 'a small generator and extension cords, or cordless tools with spare batteries', items: [['generator', 1], ['extCord', 2]] },
    ...(screens ? [{ name: 'Staple gun', desc: 'with 3/8" stainless staples, for the insect screen', items: [['stapleGun', 1]] }] : []),
    ...(rain ? [{ name: 'Hacksaw or PVC saw', desc: 'for the pipes and gutters, and a file to clean the cut ends', items: [['hacksaw', 1], ['file', 1]] }] : []),
    ...(concrete ? [
      { name: 'Concrete tools', desc: 'shovels, a mixing tub or wheelbarrow, a hoe, six 5-gal buckets, a hand tamper, a straight 8\' 2x4, a wood float', items: [['shovel', 2], ['wheelbarrow', 1], ['hoe', 1], ['bucket', 6], ['tamper', 1], ['float', 1]] },
      { name: 'Water', desc: 'a drum of fresh water for mixing and curing', items: [['drum', 1]] },
    ] : []),
    { name: 'Safety gear', desc: 'safety glasses, ear protection, work gloves, dust masks, rubber gloves for concrete, a first-aid kit', items: [['glasses', 4], ['earMuffs', 2], ['gloves', 4], ['dustMask', 1], ...(concrete ? [['rubberGloves', 2]] : []), ['firstAid', 1]] },
  ];
}

// Shipping weight of each tool, lb.
export const TOOL_LB = {
  tape25: 1, tape100: 2, chalkLine: 0.5, chalk: 0.5, pencils: 0.2, marker: 0.2, speedSquare: 0.5, level4: 3, levelTorpedo: 0.5,
  stringLine: 0.5, lineLevel: 0.1, circSaw: 10, sawBlade: 0.5, fineBlade: 0.5, handsaw: 1.5, snipsL: 1, snipsR: 1, hammer: 2, prybar: 1.5,
  hammerDrill: 6, bit316: 0.1, bit12: 0.3, drillDriver: 4, nutDriver: 0.1, wrench34: 0.5, caulkGun: 1.5, stepladder: 20, extLadder: 45,
  sawhorse: 12, generator: 110, extCord: 7, stapleGun: 2, hacksaw: 1.5, file: 0.5, shovel: 5, wheelbarrow: 60, hoe: 4, tamper: 9,
  float: 1, glasses: 0.1, earMuffs: 0.5, gloves: 0.3, dustMask: 0.5, rubberGloves: 0.3, firstAid: 2, bucket: 2, drum: 20,
};
