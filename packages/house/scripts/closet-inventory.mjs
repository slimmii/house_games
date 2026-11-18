#!/usr/bin/env node
/** Build the curated storage manifest from closet-inventory.py's Blender audit. */
import { readFile, writeFile } from 'node:fs/promises';

const args = Object.fromEntries(process.argv.slice(2).map((value, index, all) =>
  value.startsWith('--') ? [value.slice(2), all[index + 1]] : null).filter(Boolean));
const sourcePath = args.source ?? '/tmp/closet-source-inventory.json';
const outputPath = args.output ?? 'src/shared/closets-manifest.json';
const audit = JSON.parse(await readFile(sourcePath, 'utf8'));
const objects = audit.objects;
const byName = new Map(objects.map(object => [object.name, object]));
const natural = new Intl.Collator('en', { numeric: true }).compare;
const sorted = values => [...values].sort((a, b) => natural(a.name, b.name));
const matches = pattern => sorted(objects.filter(object => pattern.test(object.name)));
const center = box => box.min.map((value, index) => (value + box.max[index]) / 2);
const union = boxes => ({
  min: [0, 1, 2].map(axis => Math.min(...boxes.map(box => box.min[axis]))),
  max: [0, 1, 2].map(axis => Math.max(...boxes.map(box => box.max[axis]))),
});
const distance2 = (a, b) => a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0);
const unique = values => [...new Set(values)];
const BOARD_THICKNESS = 0.045;

// These are authored storage fronts. Appliances, room/shower doors, decorative
// bins, open shelving, and construction objects are intentionally absent.
const rules = [
  [/^Kitchen base door(?:\.\d+)?$/, 'cupboard', [1, 0, 0], 'kitchen-base', 4, /^Kitchen reference edge pull Kitchen base door(?:\.\d+)?$/],
  [/^Kitchen bench junction - short door$/, 'cupboard', [1, 0, 0], 'kitchen-bench', 1, /^Kitchen reference edge pull Kitchen bench junction - short door$/],
  [/^Kitchen sink cabinet door(?:\.\d+)?$/, 'cupboard', [0, 0, -1], 'kitchen-sink', 2, /^Kitchen return handle(?:\.\d+)?$/],
  [/^Kitchen long upper cabinet(?:\.\d+)?$/, 'cupboard', [1, 0, 0], 'kitchen-upper', 5, /^Kitchen upper handle(?:\.\d+)?$/, true],
  [/^Kitchen return upper cabinet(?:\.\d+)?$/, 'cupboard', [0, 0, -1], 'kitchen-return-upper', 2, /^Kitchen return upper handle(?:\.\d+)?$/, true],
  [/^Veranda photo - kitchen lower white door(?:\.\d+)?$/, 'cupboard', [1, 0, 0], 'veranda-kitchen', 2, /^Veranda photo - kitchen lower handle(?:\.\d+)?$/],

  [/^Camber drawing \/ A full height white door$/, 'cupboard', [-1, 0, 0], 'camber-a-tall', 1],
  [/^Camber drawing \/ A bench drawer front \d+$/, 'drawer', [-1, 0, 0], 'camber-a-bench', 6],
  [/^Camber drawing \/ B upper white door(?:\.\d+)?$/, 'cupboard', [-1, 0, 0], 'camber-b-upper', 6],
  [/^Camber drawing \/ B book column (?:lower|upper) white door$/, 'cupboard', [-1, 0, 0], 'camber-book-column', 2],
  [/^Camber drawing \/ B full height double door [12]$/, 'cupboard', [-1, 0, 0], 'camber-b-tall', 2],
  [/^Camber drawing \/ B pedestal drawer \d+$/, 'drawer', [-1, 0, 0], 'camber-b-drawers', 4],
  [/^Camber drawing \/ C low white front \d+$/, 'cupboard', [-1, 0, 0], 'camber-tv', 4],
  [/^Camber drawing \/ C side opening front white return$/, 'cupboard', [-1, 0, 0], 'camber-side-return', 1],

  [/^Bathroom photo \/ vanity white door \d+$/, 'cupboard', [0, 0, 1], 'bathroom-vanity', 3, /^Bathroom photo \/ vanity black U handle(?:\.\d+)?$/],
  [/^Bathroom photo \/ tall cabinet door or drawer$/, 'cupboard', [0, 0, 1], 'bathroom-tall', 1, /^Bathroom photo \/ tall cabinet black U pull$/],
  [/^Bathroom photo \/ tall cabinet door or drawer\.001$/, 'drawer', [0, 0, 1], 'bathroom-tall', 1, /^Bathroom photo \/ tall cabinet black U pull\.001$/],
  [/^Bathroom photo \/ tall cabinet door or drawer\.002$/, 'cupboard', [0, 0, 1], 'bathroom-tall', 1, /^Bathroom photo \/ tall cabinet black U pull\.002$/],
  [/^Ground bathroom photo \/ vanity drawer front(?:\.\d+)?$/, 'drawer', [0, 0, -1], 'ground-bath-vanity', 2, /^Ground bathroom photo \/ vanity recessed pull(?:\.\d+)?$/],
  [/^Ground bathroom photo \/ mirror (?:left|right) door$/, 'cupboard', [0, 0, -1], 'ground-bath-mirror', 2],

  [/^Laundry photo \/ tower (?:main|upper) door$/, 'cupboard', [1, 0, 0], 'laundry-tower', 2],
  [/^Laundry photo \/ pedestal drawer [01]$/, 'drawer', [1, 0, 0], 'laundry-pedestals', 2, /^Laundry photo \/ pedestal pull [01]$/],
  [/^Laundry photo \/ wide overhead flap door$/, 'cupboard', [1, 0, 0], 'laundry-overhead', 1],
  [/^Laundry photo \/ upper cupboard door(?:\.\d+)?$/, 'cupboard', [1, 0, 0], 'laundry-overhead', 2],
  [/^Laundry photo \/ left return door(?:\.\d+)?$/, 'cupboard', [1, 0, 0], 'laundry-left-return', 2, /^Laundry photo \/ left recessed pull(?:\.\d+)?$/],
  [/^Laundry photo \/ rear cabinet door(?:\.\d+)?$/, 'cupboard', [0, 0, 1], 'laundry-rear-base', 3, /^Laundry photo \/ rear recessed pull(?:\.\d+)?$/],
  [/^Laundry photo \/ rear upper cupboard door(?:\.\d+)?$/, 'cupboard', [1, 0, 0], 'laundry-rear-upper', 2],

  [/^Hall photo \/ tall door [01]$/, 'cupboard', [1, 0, 0], 'hall-tall', 2],
  [/^Hall photo \/ narrow tower door$/, 'cupboard', [1, 0, 0], 'hall-narrow', 1],
  [/^Hall photo \/ shoe unit drawer(?:\.\d+)?$/, 'drawer', [1, 0, 0], 'hall-shoes', 4],

  [/^Bedroom 1 \/ SMÅSTAD closed cupboard door(?:\.\d+)?$/, 'cupboard', [0, 0, 1], 'bedroom1-smastad', 2, /^Bedroom 1 \/ SMÅSTAD white cupboard pull(?:\.\d+)?$/],
  [/^Bedroom 1 \/ SMÅSTAD closed drawer(?:\.\d+)?$/, 'drawer', [0, 0, 1], 'bedroom1-smastad', 3, /^Bedroom 1 \/ SMÅSTAD drawer handle(?:\.\d+)?$/],
  [/^Bedroom 1 \/ rear wardrobe closed door(?:\.\d+)?$/, 'cupboard', [0, 0, 1], 'bedroom1-rear-wardrobe', 12, /^Bedroom 1 \/ rear wardrobe pale green U handle(?:\.\d+)?$/],
  [/^Bedroom 1 \/ divider pink insert front(?:\.\d+)?$/, 'drawer', [0, 0, -1], 'bedroom1-divider', 3, /^Bedroom 1 \/ divider pink insert pull(?:\.\d+)?$/],
  [/^Bedroom 1 entry corner \/ horse cupboard door$/, 'cupboard', [0, 0, 1], 'bedroom1-horse-cupboard', 1, /^Bedroom 1 entry corner \/ horse cupboard black vertical pull$/],
  [/^Bedroom 1 entry corner \/ wardrobe drawer [123]$/, 'drawer', [1, 0, 0], 'bedroom1-entry-wardrobe', 3, /^Bedroom 1 entry corner \/ drawer [123] round knob$/],
  [/^Bedroom 1 entry corner \/ wardrobe single tall door$/, 'cupboard', [1, 0, 0], 'bedroom1-entry-wardrobe', 1, /^Bedroom 1 entry corner \/ wardrobe door round knob$/],

  [/^Bedroom 2 \/ closed floating bedside drawer front(?:\.\d+)?$/, 'drawer', [-1, 0, 0], 'bedroom2-bedsides', 2],
  [/^Bedroom 2 \/ wardrobe closed inner drawer front(?:\.\d+)?$/, 'drawer', [0, 0, -1], 'bedroom2-wardrobe', 6],
  [/^Bedroom 2 \/ white storage closed drawer face(?:\.\d+)?$/, 'drawer', [0, 0, -1], 'bedroom2-white-storage', 2, /^Bedroom 2 \/ white storage black drawer knob(?:\.\d+)?$/],
  [/^Bedroom 2 \/ white armoire closed door(?:\.\d+)?$/, 'cupboard', [1, 0, 0], 'bedroom2-armoire', 2, /^Bedroom 2 \/ white armoire round pull(?:\.\d+)?$/],
  [/^Bedroom 2 \/ small table closed drawer$/, 'drawer', [1, 0, 0], 'bedroom2-small-table', 1, /^Bedroom 2 \/ small table recessed drawer pull$/, true],

  [/^Small bedroom \/ modular cube illustrated door(?:\.\d+)?$/, 'cupboard', [0, 0, 1], 'small-bedroom-cubes', 6, /^Small bedroom \/ cube black finger hole(?:\.\d+)?$/],
  [/^Living craft desk \/ (?:left|right) drawer [12] front$/, 'drawer', [1, 0, 0], 'living-craft-desk', 4, /^Living craft desk \/ (?:left|right) drawer [12] grip ledge$/],
  [/^Living \/ coffee table reference \/ closed white drawer front$/, 'drawer', [1, 0, 0], 'living-coffee-table', 1, /^Living \/ coffee table reference \/ horizontal oak drawer pull$/],
  [/^Office \/ woven drawer above printer$/, 'drawer', [1, 0, 0], 'office-printer-shelf', 1, undefined, true],
];

const entries = [];
let serial = 0;
function thinSynthetic(box, outward) {
  const axis = outward.findIndex(value => value !== 0);
  const result = structuredClone(box);
  if (outward[axis] > 0) result.min[axis] = result.max[axis] - 0.06;
  else result.max[axis] = result.min[axis] + 0.06;
  return result;
}
function makeEntry(fronts, kind, outward, unitId, handles = [], synthetic = false, extras = [], forcedSlide) {
  const originalBox = union(fronts.map(object => object.bounds));
  const box = synthetic ? thinSynthetic(originalBox, outward) : originalBox;
  const handleBoxes = handles.map(object => object.bounds);
  const normalAxis = outward.findIndex(value => value !== 0);
  const widthAxis = normalAxis === 0 ? 2 : 0;
  const handlePoint = handleBoxes.length ? center(union(handleBoxes)) : null;
  const hingeAtMin = handlePoint
    ? Math.abs(handlePoint[widthAxis] - box.min[widthAxis]) > Math.abs(handlePoint[widthAxis] - box.max[widthAxis])
    : serial % 2 === 0;
  const pivot = center(box);
  pivot[1] = box.min[1];
  pivot[widthAxis] = hingeAtMin ? box.min[widthAxis] : box.max[widthAxis];
  const freeVector = [0, 0, 0];
  freeVector[widthAxis] = hingeAtMin ? 1 : -1;
  const derivative = [freeVector[2], 0, -freeVector[0]];
  const angle = kind === 'cupboard'
    ? (derivative[0] * outward[0] + derivative[2] * outward[2] >= 0 ? Math.PI / 2 : -Math.PI / 2)
    : 0;
  const slideDistance = kind === 'drawer' ? 1.2 : 0;
  const slide = forcedSlide ?? outward.map(value => value * slideDistance);
  const sourceNames = fronts.map(object => object.name);
  const handleNames = handles.map(object => object.name);
  const extraNames = extras.map(object => object.name);
  const id = `closet_${String(serial++).padStart(3, '0')}`;
  const names = synthetic ? [`front:${id}`] : sourceNames;
  let targetBoxes = handleBoxes;
  if (!targetBoxes.length) {
    // Handleless/push fronts receive a small visible grip at this exact box.
    // Keeping the hit box handle-sized enforces precise crosshair targeting.
    const tangentAxis = normalAxis === 0 ? 2 : 0;
    const gripCenter = center(box);
    gripCenter[tangentAxis] = hingeAtMin
      ? box.max[tangentAxis] - Math.min(.16, (box.max[tangentAxis] - box.min[tangentAxis]) * .2)
      : box.min[tangentAxis] + Math.min(.16, (box.max[tangentAxis] - box.min[tangentAxis]) * .2);
    gripCenter[1] = kind === 'drawer' ? box.max[1] - Math.min(.11, (box.max[1] - box.min[1]) * .25) : gripCenter[1];
    gripCenter[normalAxis] = (outward[normalAxis] > 0 ? box.max[normalAxis] : box.min[normalAxis])
      + outward[normalAxis] * .035;
    const gripSize = [0.045, Math.min(.28, Math.max(.14, (box.max[1] - box.min[1]) * .18)), 0.045];
    gripSize[normalAxis] = .06;
    targetBoxes = [{
      min: gripCenter.map((value, axis) => value - gripSize[axis] / 2),
      max: gripCenter.map((value, axis) => value + gripSize[axis] / 2),
    }];
  }
  entries.push({
    id,
    label: sourceNames[0].replace(/\.\d+$/, ''),
    kind,
    min: box.min,
    max: box.max,
    pivot,
    angle,
    slide,
    fixed: false,
    frontNames: names,
    handleNames,
    attachedNames: unique([...names, ...handleNames, ...extraNames]),
    attachmentBounds: [...handles, ...extras].map(object => ({ name: object.name, ...object.bounds })),
    removeNames: unique([...(synthetic ? sourceNames : names), ...handleNames, ...extraNames]),
    targetBoxes,
    collisionBoxes: [box],
    unitId,
    outward,
    ...(synthetic ? {
      sourceSolidNames: sourceNames,
      sourceSolidBounds: fronts.map(object => ({ name: object.name, ...object.bounds })),
      notes: ['Front panel is extracted from the exposed face of an authored solid cabinet object; the solid is replaced by a hollow shell.'],
    } : {}),
  });
}

for (const [frontPattern, kind, outward, unitId, expected, handlePattern, synthetic = false] of rules) {
  const fronts = matches(frontPattern);
  if (fronts.length !== expected) throw new Error(`${frontPattern}: expected ${expected}, got ${fronts.length}`);
  const handles = handlePattern ? matches(handlePattern) : [];
  if (handlePattern && handles.length !== fronts.length) {
    throw new Error(`${handlePattern}: expected ${fronts.length} handles, got ${handles.length}`);
  }
  fronts.forEach((front, index) => makeEntry([front], kind, outward, unitId, handles[index] ? [handles[index]] : [], synthetic));
}

// Composite sliding wardrobe leaves are parented assemblies in Blender.
for (const [index, parent] of ['Bedroom 2 / Sliding wardrobe door 1 CONTROL', 'Bedroom 2 / Sliding wardrobe door 2 CONTROL'].entries()) {
  const fronts = sorted(objects.filter(object => object.parent === parent));
  if (fronts.length !== 11) throw new Error(`${parent}: expected 11 attached source meshes, got ${fronts.length}`);
  const stiles = fronts.filter(object => object.name.includes('stile'));
  makeEntry(fronts, 'sliding', [0, 0, -1], 'bedroom2-wardrobe', stiles, false, [], [index === 0 ? 2.853 : -2.853, 0, 0]);
}

// Sliding mirror doors expose the upper bathroom cabinet.
for (const [index, mirror] of matches(/^Bathroom photo \/ sliding mirror(?:\.\d+)?$/).entries()) {
  makeEntry([mirror], 'sliding', [0, 0, 1], 'bathroom-mirror', [], false, [], [index === 0 ? 1.75 : -1.75, 0, 0]);
  entries.at(-1).motion = {
    type: 'tracked-slide',
    // The authored mirrors share one plane, but bypass sliders occupy distinct
    // rails even while closed. Permanent offsets prevent either independently
    // moving leaf from ever passing through a stationary neighbor or handle.
    baseOffset: [0, 0, index === 0 ? .04 : .16],
    unseat: [0, 0, 0],
    unseatFraction: .12,
    duration: 1.6,
  };
}

// This cabinet is authored as three open wire drawers. Its 513 fine wire
// meshes are individually named in the shipped GLB, so cluster them by the
// three recessed handles and move each complete basket as one drawer. Keep the
// gameplay collider at the thin front plane; the shared drawer tray supplies
// the hollow bottom/sides/back collision.
const basketHandles = matches(/^Bedroom 1 entry corner \/ basket recessed handle(?:\.\d+)?$/);
const basketParts = matches(/^Bedroom 1 entry corner \/ basket (?!recessed handle)(?:fine horizontal mesh|fine vertical mesh|horizontal rim|side mesh|wire bottom)(?:\.\d+)?$/);
if (basketHandles.length !== 3 || basketParts.length !== 510) {
  throw new Error(`Bedroom 1 wire drawers: expected 3 handles and 510 parts, got ${basketHandles.length} and ${basketParts.length}`);
}
const basketPartsByDrawer = Array.from({ length: 3 }, () => []);
for (const partType of ['fine horizontal mesh', 'fine vertical mesh', 'horizontal rim', 'side mesh', 'wire bottom']) {
  const parts = matches(new RegExp(`^Bedroom 1 entry corner / basket ${partType}(?:\\.\\d+)?$`));
  if (parts.length % 3) throw new Error(`Wire drawer part count is not divisible by three: ${partType} (${parts.length})`);
  const perDrawer = parts.length / 3;
  basketPartsByDrawer.forEach((drawer, index) => drawer.push(...parts.slice(index * perDrawer, (index + 1) * perDrawer)));
}
basketHandles.forEach((handle, index) => {
  const parts = basketPartsByDrawer[index];
  if (parts.length !== 170) throw new Error(`Wire drawer ${index + 1}: expected 170 parts, got ${parts.length}`);
  makeEntry(parts, 'drawer', [0, 0, 1], `bedroom1-wire-drawer-${index + 1}`, [handle]);
  const created = entries.at(-1);
  const thinFront = thinSynthetic(union([...parts.map(part => part.bounds), handle.bounds]), [0, 0, 1]);
  created.label = `Bedroom 1 entry corner / metal wire drawer ${index + 1}`;
  created.min = thinFront.min;
  created.max = thinFront.max;
  created.collisionBoxes = [thinFront];
  created.pivot = center(thinFront);
  created.pivot[1] = thinFront.min[1];
  created.notes = ['Open wire basket belonging to the authored three-drawer cabinet.'];
});

// Append appliance fronts so existing network/paint door IDs remain stable.
for (const front of matches(/^Kitchen refrigerator door(?:\.001)?$/)) {
  makeEntry([front], 'cupboard', [0, 0, -1], 'kitchen-fridge',
    front.name === 'Kitchen refrigerator door' ? matches(/^Kitchen refrigerator handle$/) : []);
  const entry = entries.at(-1);
  // Both hinges are on the same side, opposite the original long handle.
  entry.pivot[0] = entry.max[0];
  entry.angle = -Math.PI / 2;
  if (!entry.handleNames.length) {
    entry.targetBoxes[0].min[0] = entry.min[0] + .16 - .0225;
    entry.targetBoxes[0].max[0] = entry.min[0] + .16 + .0225;
  }
}

function splitUnits(pattern, makeId) {
  const selected = entries.filter(entry => entry.frontNames.some(name => pattern.test(name))
    || entry.label && pattern.test(entry.label));
  selected.forEach((entry, index) => { entry.unitId = makeId(entry, index); });
}
// A generated interior must never bridge a bed, appliance bay, knee opening,
// or neighboring drawer compartment. Split disconnected/independent carcasses.
splitUnits(/^Kitchen base door/, (_entry, index) => `kitchen-base-${index + 1}`);
splitUnits(/^Kitchen long upper cabinet/, (_entry, index) => `kitchen-upper-${index + 1}`);
splitUnits(/^Kitchen return upper cabinet/, (_entry, index) => `kitchen-return-upper-${index + 1}`);
splitUnits(/^Camber drawing \/ A bench drawer front/, (_entry, index) => `camber-a-bench-${index + 1}`);
splitUnits(/^Camber drawing \/ B upper white door/, (_entry, index) => `camber-b-upper-${Math.floor(index / 2) + 1}`);
splitUnits(/^Camber drawing \/ B book column/, (_entry, index) => `camber-book-column-${index + 1}`);
splitUnits(/^Camber drawing \/ C low white front/, (_entry, index) => `camber-tv-${index + 1}`);
splitUnits(/^Laundry photo \/ pedestal drawer/, (_entry, index) => `laundry-pedestal-${index + 1}`);
splitUnits(/^Laundry photo \/ wide overhead flap door$/, () => 'laundry-overhead-flap');
splitUnits(/^Laundry photo \/ upper cupboard door/, () => 'laundry-overhead-upper');
splitUnits(/^Hall photo \/ shoe unit drawer/, (_entry, index) => `hall-shoes-${Math.floor(index / 2) + 1}`);
splitUnits(/^Bedroom 2 \/ closed floating bedside drawer front/, (_entry, index) => `bedroom2-bedside-${index + 1}`);
splitUnits(/^Bedroom 2 \/ wardrobe closed inner drawer front/, (_entry, index) => `bedroom2-wardrobe-drawers-${Math.floor(index / 2) + 1}`);

// Use the travel supported by the authored clearances. The left sink leaf has
// a deliberately shallow corner stop; a 90-degree generic hinge intersects
// the neighboring base side. Two Camber bench drawers stop at the dining
// frame before the generic 1.2 m drawer extension.
const sinkLeaves=entries.filter(entry=>entry.unitId==='kitchen-sink').sort((a,b)=>a.min[0]-b.min[0]);
if (sinkLeaves.length!==2) throw new Error(`Kitchen sink: expected 2 leaves, got ${sinkLeaves.length}`);
sinkLeaves[0].angle=85*Math.PI/180;
for (const [unitId,distance] of new Map([
  ['camber-a-bench-2',.85],
  ['camber-a-bench-3',1],
  ['camber-a-bench-4',.9],
  ['camber-a-bench-5',.85],
])) {
  const drawer=entries.find(entry=>entry.unitId===unitId);
  if (!drawer) throw new Error(`Missing travel-limited drawer ${unitId}`);
  drawer.slide=[-distance,0,0];
}

const laundryFlap=entries.find(entry=>entry.unitId==='laundry-overhead-flap');
if (!laundryFlap) throw new Error('Missing laundry overhead flap');
laundryFlap.pivot=[2.99,laundryFlap.max[1],laundryFlap.pivot[2]];
laundryFlap.angle=0;
laundryFlap.motion={type:'flap',angle:Math.PI/2,duration:1.3};
for (const door of entries.filter(entry=>entry.unitId==='laundry-overhead-upper')) {
  // Overlay hinges sit ahead of the retained niche cheeks. The authored panel
  // remains closed in place but swings about the real external hinge line.
  door.pivot[0]=2.99;
}
splitUnits(/^Living craft desk \/ left drawer/, () => 'living-craft-desk-left');
splitUnits(/^Living craft desk \/ right drawer/, () => 'living-craft-desk-right');

function attachSolids(entryPattern, solidPattern, mode = 'nearest') {
  const selectedEntries = entries.filter(entry => entry.frontNames.some(name => entryPattern.test(name))
    || entryPattern.test(entry.label));
  const solids = matches(solidPattern);
  if (!selectedEntries.length || !solids.length) throw new Error(`Solid mapping failed: ${entryPattern} -> ${solidPattern}`);
  for (const entry of selectedEntries) {
    const chosen = mode === 'all' ? solids : [solids.reduce((best, solid) =>
      distance2(center(solid.bounds), center(entry)) < distance2(center(best.bounds), center(entry)) ? solid : best)];
    entry.sourceSolidNames = unique([...(entry.sourceSolidNames ?? []), ...chosen.map(object => object.name)]);
    const solidBounds = [...(entry.sourceSolidBounds ?? []), ...chosen.map(object => ({ name: object.name, ...object.bounds }))];
    entry.sourceSolidBounds = [...new Map(solidBounds.map(value => [value.name, value])).values()];
    entry.removeNames = unique([...entry.removeNames, ...chosen.map(object => object.name)]);
    entry.notes = unique([...(entry.notes ?? []), 'Authored solid body is removed and replaced by a hollow collision/render shell.']);
  }
}
attachSolids(/^Kitchen refrigerator door/, /^Kitchen integrated refrigerator$/, 'all');
attachSolids(/^Kitchen base door/, /^Kitchen base carcass(?:\.\d+)?$/);
attachSolids(/^Kitchen bench junction - short door$/, /^Kitchen bench junction - raised cabinet$/);
attachSolids(/^Kitchen sink cabinet door/, /^Kitchen sink base(?:\.\d+)?$/);
attachSolids(/^Veranda photo - kitchen lower white door/, /^Veranda photo - kitchen base carcass$/, 'all');
attachSolids(/^Bathroom photo \/ tall cabinet door or drawer/, /^Bathroom photo \/ tall right cabinet carcass$/, 'all');
attachSolids(/^Ground bathroom photo \/ vanity drawer front/, /^Ground bathroom photo \/ floating vanity carcass$/, 'all');
attachSolids(/^Ground bathroom photo \/ mirror (?:left|right) door/, /^Ground bathroom photo \/ mirrored cabinet$/, 'all');
attachSolids(/^Bathroom photo \/ sliding mirror/, /^Bathroom photo \/ mirror cabinet body$/, 'all');
attachSolids(/^Laundry photo \/ tower (?:main|upper) door/, /^Laundry photo \/ tower body$/, 'all');
attachSolids(/^Laundry photo \/ pedestal drawer/, /^Laundry photo \/ storage pedestal$/, 'all');
attachSolids(/^Laundry photo \/ (?:wide overhead flap|upper cupboard) door/, /^Laundry photo \/ overhead cupboard carcass$/, 'all');
attachSolids(/^Laundry photo \/ left return door/, /^Laundry photo \/ left return base$/, 'all');
attachSolids(/^Laundry photo \/ rear cabinet door/, /^Laundry photo \/ rear sink cabinet$/, 'all');
attachSolids(/^Laundry photo \/ rear upper cupboard door/, /^Laundry photo \/ short rear overhead cupboard$/, 'all');
attachSolids(/^Hall photo \/ tall door/, /^Hall photo \/ left full height carcass$/, 'all');
attachSolids(/^Hall photo \/ narrow tower door$/, /^Hall photo \/ narrow tower body$/, 'all');
attachSolids(/^Hall photo \/ shoe unit drawer/, /^Hall photo \/ stair shoe unit$/, 'all');
attachSolids(/^Bedroom 2 \/ closed floating bedside drawer front/, /^Bedroom 2 \/ floating bedside drawer carcass(?:\.\d+)?$/);
attachSolids(/^Living craft desk \/ left drawer/, /^Living craft desk \/ left pedestal carcass$/, 'all');
attachSolids(/^Living craft desk \/ right drawer/, /^Living craft desk \/ right pedestal carcass$/, 'all');

// Existing drawer-box parts and door decoration move with their corresponding fronts.
const extraRules = [
  [/^Bedroom 1 \/ small cloud door decal(?:\.\d+)?$/, /^Bedroom 1 \/ rear wardrobe closed door(?:\.\d+)?$/],
  [/^Bedroom 1 entry corner \/ monkey silhouette on tall door$/, /^Bedroom 1 entry corner \/ wardrobe single tall door$/],
  [/^Bedroom 1 entry corner \/ horse picture collage$/, /^Bedroom 1 entry corner \/ horse cupboard door$/],
  [/^Bedroom 1 entry corner \/ (?:drawer [123]|wardrobe door) round knob stem$/, /^Bedroom 1 entry corner \/ wardrobe (?:drawer [123]|single tall door)$/],
  [/^Bathroom photo \/ vanity black U handle fixing(?:\.\d+)?$/, /^Bathroom photo \/ vanity white door \d+$/],
  [/^Bathroom photo \/ tall cabinet black U pull fixing(?:\.\d+)?$/, /^Bathroom photo \/ tall cabinet door or drawer(?:\.\d+)?$/],
  [/^Small bedroom \/ (?:hedgehog print snout|hedgehog printed body|mushroom printed cap|mushroom printed stem|mushroom white spot(?:\.\d+)?|printed leaf stalk(?:\.\d+)?|printed trailing vine(?:\.\d+)?|printed tree trunk(?:\.\d+)?|tree print(?:\.\d+)?|woodland printed leaf(?:\.\d+)?)$/, /^Small bedroom \/ modular cube illustrated door(?:\.\d+)?$/],
];
for (const [extraPattern, frontPattern] of extraRules) {
  for (const extra of matches(extraPattern)) {
    const candidates = entries.filter(entry => entry.frontNames.some(name => frontPattern.test(name)));
    const nearest = candidates.sort((a, b) => distance2(center(extra.bounds), center({ min: a.min, max: a.max }))
      - distance2(center(extra.bounds), center({ min: b.min, max: b.max })))[0];
    if (!nearest) throw new Error(`No front for attached detail ${extra.name}`);
    nearest.attachedNames.push(extra.name);
    nearest.removeNames.push(extra.name);
    nearest.attachmentBounds.push({ name: extra.name, ...extra.bounds });
  }
}

// These dark planes fake a closed gap directly behind the craft-desk fronts.
// Remove them with the old closed drawer rather than moving them: the hollow
// generated drawer/interior should be visible after opening.
for (const reveal of matches(/^Living craft desk \/ (?:left|right) drawer [12] shadow reveal$/)) {
  const candidates = entries.filter(entry => /^Living craft desk \/ (?:left|right) drawer [12] front$/.test(entry.frontNames[0]));
  const nearest = candidates.sort((a, b) => distance2(center(reveal.bounds), center({ min: a.min, max: a.max }))
    - distance2(center(reveal.bounds), center({ min: b.min, max: b.max })))[0];
  if (!nearest) throw new Error(`No drawer front for shadow reveal ${reveal.name}`);
  nearest.removeNames.push(reveal.name);
}

// Several drawers already have complete authored trays. Move those exact
// parts with their fronts and expose their bounds to shared collision instead
// of layering a generated tray over the retained source geometry.
function attachAuthoredTray(entry, partNames) {
  const parts = partNames.map(name => byName.get(name));
  if (parts.some(part => !part)) throw new Error(`Missing authored tray part for ${entry.label}`);
  entry.authoredTrayVisual = true;
  entry.authoredTrayBounds = parts.map(part => ({ name: part.name, ...part.bounds }));
  entry.attachedNames = unique([...entry.attachedNames, ...partNames]);
  entry.removeNames = unique([...entry.removeNames, ...partNames]);
  entry.attachmentBounds = [
    ...entry.attachmentBounds,
    ...parts.map(part => ({ name: part.name, ...part.bounds })),
  ];
}

const suffix = index => index === 0 ? '' : `.${String(index).padStart(3, '0')}`;
const pinkDrawers = entries.filter(entry => /^Bedroom 1 \/ divider pink insert front/.test(entry.label));
pinkDrawers.forEach((entry, index) => attachAuthoredTray(entry, [
  `Bedroom 1 / divider empty pink insert bottom${suffix(index)}`,
  `Bedroom 1 / divider empty pink insert side${suffix(index * 2)}`,
  `Bedroom 1 / divider empty pink insert side${suffix(index * 2 + 1)}`,
  `Bedroom 1 / divider empty pink insert back${suffix(index)}`,
]));

const wardrobeDrawers = entries.filter(entry => /^Bedroom 2 \/ wardrobe closed inner drawer front/.test(entry.label));
wardrobeDrawers.forEach((entry, index) => attachAuthoredTray(entry, [
  `Bedroom 2 / wardrobe empty drawer bottom${suffix(index)}`,
  `Bedroom 2 / wardrobe empty drawer side${suffix(index * 2)}`,
  `Bedroom 2 / wardrobe empty drawer side${suffix(index * 2 + 1)}`,
  `Bedroom 2 / wardrobe empty drawer back${suffix(index)}`,
]));

const coffeeDrawer = entries.find(entry => /^Living \/ coffee table reference \/ closed white drawer front/.test(entry.label));
if (!coffeeDrawer) throw new Error('Missing coffee-table drawer');
attachAuthoredTray(coffeeDrawer, [
  'Living / coffee table reference / drawer box floor',
  'Living / coffee table reference / drawer box side',
  'Living / coffee table reference / drawer box side.001',
  'Living / coffee table reference / drawer box back',
]);
for (const name of [
  'Living / coffee table reference / handle mounting block',
  'Living / coffee table reference / handle mounting block.001',
]) {
  const part = byName.get(name);
  if (!part) throw new Error(`Missing coffee-table handle mount: ${name}`);
  coffeeDrawer.attachedNames.push(name);
  coffeeDrawer.removeNames.push(name);
  coffeeDrawer.attachmentBounds.push({ name, ...part.bounds });
}

for (const entry of entries.filter(entry => /^Bedroom 1 entry corner \/ metal wire drawer/.test(entry.label))) {
  entry.authoredTrayVisual = true;
}

// Append the sixteen Bedroom 3 fabric bins without changing existing storage IDs.
// The authored dark "cavity" is a solid placeholder: replace it with a hollow
// bottom/back while retaining the fabric sides, colored front and recessed pull.
const fabricFronts = matches(/^Small bedroom \/ fabric bin front(?:\.\d+)?$/);
if (fabricFronts.length !== 16) throw new Error(`Expected 16 bedroom fabric bins, got ${fabricFronts.length}`);
for (const [index, front] of fabricFronts.entries()) {
  const part = label => {
    const object = byName.get(`Small bedroom / fabric bin ${label}${suffix(index)}`);
    if (!object) throw new Error(`Missing fabric bin ${label} ${index}`);
    return object;
  };
  const left = part('left side'), right = part('right side'), cavity = part('cavity');
  const travel = front.bounds.min[1] < 18 && front.bounds.max[2] > -3.75 ? .55 : .85;
  makeEntry([front], 'drawer', [-1, 0, 0], `small-bedroom-fabric-bin-${index + 1}`,
    [part('recessed handle')], false, [left, right], [-travel, 0, 0]);
  const entry = entries.at(-1);
  entry.sourceSolidNames = [cavity.name];
  entry.sourceSolidBounds = [{ name: cavity.name, ...cavity.bounds }];
  entry.removeNames.push(cavity.name);
  const min = [front.bounds.max[0], front.bounds.min[1], front.bounds.min[2]];
  const max = [left.bounds.max[0], front.bounds.max[1], front.bounds.max[2]];
  entry.authoredTrayBounds = [
    { name: `bin-bottom:${entry.id}`, min, max: [max[0], min[1] + .018, max[2]] },
    { name: right.name, ...right.bounds },
    { name: left.name, ...left.bounds },
    { name: `bin-back:${entry.id}`, min: [max[0] - .018, min[1], min[2]], max },
  ];
  entry.notes = ['Pull-out fabric bin; hollow interior replaces the solid dark placeholder. Lower bins beside the bed have shorter travel for headboard clearance.'];
}

const depthByUnit = unitId => unitId.includes('mirror') ? 0.35
  : unitId.includes('cube') ? 1.0
  : unitId.includes('camber') ? 1.35
  : unitId.includes('wardrobe') ? 1.55
  : unitId.includes('laundry') ? 1.55
  : unitId.includes('kitchen') ? 1.55
  : 1.2;
const unitsById = new Map();
for (const entry of entries) {
  if (unitsById.has(entry.unitId)) continue;
  const siblings = entries.filter(item => item.unitId === entry.unitId);
  const fronts = union(siblings.map(item => ({ min: item.min, max: item.max })));
  const interior = structuredClone(fronts);
  const axis = entry.outward.findIndex(value => value !== 0);
  const depth = depthByUnit(entry.unitId);
  if (entry.outward[axis] > 0) interior.min[axis] = interior.max[axis] - depth;
  else interior.max[axis] = interior.min[axis] + depth;
  // Solid authored carcasses are removed so their fronts can move. Rebuild the
  // rear board inside that exact source envelope instead of placing it behind
  // an arbitrary label-based cavity depth. The old placement could put a
  // generated cabinet back directly on an architectural wall (the entrance
  // cupboards were coplanar with the brick wall), causing visible z-fighting.
  const sourceSolids = siblings.flatMap(item => item.sourceSolidBounds ?? []);
  if (sourceSolids.length) {
    if (entry.outward[axis] > 0) {
      interior.min[axis] = Math.min(...sourceSolids.map(box => box.min[axis])) + BOARD_THICKNESS;
    } else {
      interior.max[axis] = Math.max(...sourceSolids.map(box => box.max[axis])) - BOARD_THICKNESS;
    }
  }
  interior.min[1] += 0.06;
  interior.max[1] -= 0.06;
  const nearbyBodies = objects.filter(object => {
    if (!/(?:carcass|body|side|back|shelf|horizontal|plinth|track)/i.test(object.name)) return false;
    const c = center(object.bounds);
    const expanded = { min: interior.min.map(value => value - .2), max: interior.max.map(value => value + .2) };
    return c.every((value, index) => value >= expanded.min[index] && value <= expanded.max[index]);
  }).map(object => object.name);
  unitsById.set(entry.unitId, {
    id: entry.unitId,
    label: entry.unitId.replaceAll('-', ' '),
    bodyNames: nearbyBodies,
    interior: entry.unitId === 'kitchen-fridge' ? { ...interior, shelves: [8.7, 9.75, 10.8, 11.85, 12.585, 13.7] } : interior,
    // The long kitchen run and its perpendicular return form a blind L-corner.
    // These two cavities share their min-horizontal edge; omitting only that
    // joining side board keeps the exterior envelope intact.
    ...(['kitchen-sink', 'kitchen-return-upper-1', 'laundry-rear-base'].includes(entry.unitId) ? { openSides: ['min'] } : {}),
    ...(entry.unitId==='kitchen-sink' ? { openSideShelfInset: 1.9 } : {}),
    ...(entry.unitId==='kitchen-return-upper-1' ? { openSideShelfInset: 1.88 } : {}),
    ...(entry.unitId==='laundry-rear-base' ? { openSideShelfInset: 1.9 } : {}),
    ...(entry.unitId==='kitchen-sink' ? { cornerSweepY: [
      entries.find(candidate=>candidate.unitId==='kitchen-base-1').min[1],
      entries.find(candidate=>candidate.unitId==='kitchen-base-1').max[1],
    ] } : {}),
    ...(entry.unitId==='kitchen-return-upper-1' ? { cornerSweepY: [
      entries.find(candidate=>candidate.unitId==='kitchen-upper-1').min[1],
      entries.find(candidate=>candidate.unitId==='kitchen-upper-1').max[1],
    ] } : {}),
    ...(entry.unitId==='laundry-rear-base' ? { cornerSweepY: [
      Math.min(...entries.filter(candidate=>candidate.unitId==='laundry-left-return').map(candidate=>candidate.min[1])),
      Math.max(...entries.filter(candidate=>candidate.unitId==='laundry-left-return').map(candidate=>candidate.max[1])),
    ] } : {}),
  });
}

// These two Bedroom 1 cabinets already contain complete authored backs,
// shelves, uprights/sides and feet. Preserve those exact parts instead of
// drawing a generic interior over them. Their evaluated bounds also give the
// shared collision layer an explicit description of the retained structure.
const authoredStructureRules = new Map([
  ['bedroom1-rear-wardrobe', {
    structure: /^Bedroom 1 \/ rear wardrobe (?:empty back|empty shelf|upright)(?:\.\d+)?$/,
    back: /^Bedroom 1 \/ rear wardrobe empty back(?:\.\d+)?$/,
  }],
  ['bedroom1-entry-wardrobe', {
    structure: /^Bedroom 1 entry corner \/ wardrobe (?:back|full side|shelf|square foot)(?:\.\d+)?$/,
    back: /^Bedroom 1 entry corner \/ wardrobe back$/,
  }],
  ['bedroom1-smastad', {
    structure: /^Bedroom 1 \/ SMÅSTAD (?:cupboard back|cupboard side(?:\.001)?|empty cupboard shelf(?:\.00[1-4])?)$/,
    back: /^Bedroom 1 \/ SMÅSTAD cupboard back$/,
  }],
  ['bedroom1-divider', {
    structure: /^Bedroom 1 \/ divider (?:cubby solid backing|cubby vertical panel(?:\.001)?|cubby horizontal shelf(?:\.004|\.008|\.012|\.016))$/,
    back: /^Bedroom 1 \/ divider cubby solid backing$/,
  }],
  ['bedroom1-horse-cupboard', {
    structure: /^Bedroom 1 entry corner \/ horse cupboard (?:rear|side(?:\.001)?|top or bottom(?:\.001)?)$/,
    back: /^Bedroom 1 entry corner \/ horse cupboard rear$/,
  }],
  ['bathroom-vanity', {
    structure: /^Bathroom photo \/ vanity carcass (?:back|bottom|side(?:\.001)?)$/,
    back: /^Bathroom photo \/ vanity carcass back$/,
  }],
  ['bedroom2-wardrobe', {
    structure: /^Bedroom 2 \/ wardrobe (?:rear backing|side(?:\.001)?|horizontal carcass(?:\.001)?|internal divider(?:\.001)?|empty shelf(?:\.00[1-9])?|empty top shelf|bare clothes rail)$/,
    back: /^Bedroom 2 \/ wardrobe rear backing$/,
  }],
  ['bedroom2-white-storage', {
    structure: /^Bedroom 2 \/ white storage (?:back|side(?:\.001)?|shelf(?:\.00[1-3])?)$/,
    back: /^Bedroom 2 \/ white storage back$/,
  }],
  ['bedroom2-armoire', {
    structure: /^Bedroom 2 \/ white armoire (?:empty back|empty shelf(?:\.00[1-4])?|side(?:\.001)?)$/,
    back: /^Bedroom 2 \/ white armoire empty back$/,
  }],
  ['small-bedroom-cubes', {
    structure: /^Small bedroom \/ modular cube (?:back(?:\.00[1-5])?|shelf(?:\.00[1-9]|\.01[01])?|side(?:\.00[1-9]|\.01[01])?)$/,
    back: /^Small bedroom \/ modular cube back(?:\.00[1-5])?$/,
  }],
  ['living-coffee-table', {
    structure: /^Living \/ coffee table reference \/ (?:continuous oak (?:bottom|top)|opposite white end|plain white side panel(?:\.001)?|white central divider)$/,
    back: /^Living \/ coffee table reference \/ opposite white end$/,
  }],
]);

authoredStructureRules.set('camber-a-tall', {
  structure: /^Camber drawing \/ A left full height cupboard (?:back|horizontal(?:\.001)?|oak niche cheek|side)$/,
  back: /^Camber drawing \/ A left full height cupboard back$/,
});
for (let index = 1; index <= 6; index++) {
  authoredStructureRules.set(`camber-a-bench-${index}`, {
    structure: new RegExp(`^Camber drawing / A bench drawer carcass ${index} (?:back|horizontal(?:\\.001)?|side(?:\\.001)?)$`),
    back: new RegExp(`^Camber drawing / A bench drawer carcass ${index} back$`),
  });
}
for (const [unitIndex, cabinetIndex] of [1, 2, 4].entries()) {
  authoredStructureRules.set(`camber-b-upper-${unitIndex + 1}`, {
    structure: new RegExp(`^Camber drawing / B upper closed cabinet ${cabinetIndex} (?:back|horizontal(?:\\.001)?|side(?:\\.001)?)$`),
    back: new RegExp(`^Camber drawing / B upper closed cabinet ${cabinetIndex} back$`),
  });
}
for (const [index, level] of ['lower', 'upper'].entries()) {
  authoredStructureRules.set(`camber-book-column-${index + 1}`, {
    structure: new RegExp(`^Camber drawing / B book column ${level} cupboard (?:back|horizontal(?:\\.001)?|side(?:\\.001)?)$`),
    back: new RegExp(`^Camber drawing / B book column ${level} cupboard back$`),
  });
}
authoredStructureRules.set('camber-b-tall', {
  structure: /^Camber drawing \/ B tall double cupboard (?:back|horizontal(?:\.001)?|side(?:\.001)?)$/,
  back: /^Camber drawing \/ B tall double cupboard back$/,
});
authoredStructureRules.set('camber-b-drawers', {
  structure: /^Camber drawing \/ B four drawer pedestal (?:back|horizontal(?:\.001)?|side(?:\.001)?)$/,
  back: /^Camber drawing \/ B four drawer pedestal back$/,
});
for (let index = 1; index <= 4; index++) {
  authoredStructureRules.set(`camber-tv-${index}`, {
    structure: new RegExp(`^Camber drawing / C low TV carcass ${index} (?:back|horizontal(?:\\.001)?|side(?:\\.001)?)$`),
    back: new RegExp(`^Camber drawing / C low TV carcass ${index} back$`),
  });
}
authoredStructureRules.set('camber-side-return', {
  structure: /^Camber drawing \/ C (?:side opening (?:wall return|rear cheek|bottom top(?:\.001)?)|side facing oak shelf(?:\.00[1-4])?)$/,
  back: /^Camber drawing \/ C side opening wall return$/,
});
// The six inner drawers sit inside the retained main wardrobe carcass. Reuse
// its exact rear as the structural marker so these nested units do not add a
// second generated cabinet back behind their authored oak trays.
for (let index = 1; index <= 3; index++) {
  authoredStructureRules.set(`bedroom2-wardrobe-drawers-${index}`, {
    structure: /^Bedroom 2 \/ wardrobe rear backing$/,
    back: /^Bedroom 2 \/ wardrobe rear backing$/,
  });
}
for (const [unitId, patterns] of authoredStructureRules) {
  const unit = unitsById.get(unitId);
  if (!unit) throw new Error(`Missing authored-interior unit: ${unitId}`);
  const structure = matches(patterns.structure);
  const backs = matches(patterns.back);
  if (!structure.length) throw new Error(`Missing authored interior structure: ${unitId}`);
  if (!backs.length) throw new Error(`Missing authored interior back: ${unitId}`);
  unit.authoredStructureBounds = structure.map(object => ({ name: object.name, ...object.bounds }));
  unit.bodyNames = unique([...unit.bodyNames, ...structure.map(object => object.name)]);
  const entry = entries.find(candidate => candidate.unitId === unitId);
  const depthAxis = entry.outward.findIndex(value => value !== 0);
  if (entry.outward[depthAxis] > 0) {
    unit.interior.min[depthAxis] = Math.max(...backs.map(object => object.bounds.max[depthAxis]));
  } else {
    unit.interior.max[depthAxis] = Math.min(...backs.map(object => object.bounds.min[depthAxis]));
  }
}

// The three open wire baskets run in one retained metal frame. Its legs, feet,
// top and support rails already define the real structure, so each nested
// drawer unit records the relevant exact pieces and omits a fictitious solid
// melamine shell/back around the wire basket.
for (let drawerIndex = 0; drawerIndex < 3; drawerIndex++) {
  const unit = unitsById.get(`bedroom1-wire-drawer-${drawerIndex + 1}`);
  if (!unit) throw new Error(`Missing wire-drawer unit ${drawerIndex + 1}`);
  const railIndices = [drawerIndex * 2, drawerIndex * 2 + 1, drawerIndex * 2 + 2, drawerIndex * 2 + 3];
  const railNames = railIndices.map(index => `Bedroom 1 entry corner / metal drawer support rail${suffix(index)}`);
  const frameNames = [
    ...(drawerIndex === 0 ? [
      'Bedroom 1 entry corner / metal cabinet dark foot',
      'Bedroom 1 entry corner / metal cabinet dark foot.001',
      'Bedroom 1 entry corner / metal cabinet dark foot.002',
      'Bedroom 1 entry corner / metal cabinet dark foot.003',
      'Bedroom 1 entry corner / metal cabinet square tube leg',
      'Bedroom 1 entry corner / metal cabinet square tube leg.001',
      'Bedroom 1 entry corner / metal cabinet square tube leg.002',
      'Bedroom 1 entry corner / metal cabinet square tube leg.003',
    ] : []),
    ...(drawerIndex === 2 ? ['Bedroom 1 entry corner / metal cabinet sheet top'] : []),
    ...railNames,
  ];
  const structure = frameNames.map(name => byName.get(name));
  if (structure.some(object => !object)) throw new Error(`Missing wire-cabinet structure ${drawerIndex + 1}`);
  unit.authoredStructureBounds = structure.map(object => ({ name: object.name, ...object.bounds }));
  unit.bodyNames = unique([...unit.bodyNames, ...frameNames]);
}

// Retain the open KALLAX frame: do not generate a closed cabinet around each bin.
const fabricStructure = matches(/^Small bedroom \/ KALLAX (?:outer horizontal|outer upright|shelf|vertical divider)(?:\.\d+)?$/);
if (!fabricStructure.length) throw new Error('Missing bedroom fabric-bin shelving');
for (const entry of entries.filter(entry => entry.unitId.startsWith('small-bedroom-fabric-bin-'))) {
  const unit = unitsById.get(entry.unitId);
  unit.authoredStructureBounds = fabricStructure.map(object => ({ name: object.name, ...object.bounds }));
  unit.bodyNames = fabricStructure.map(object => object.name);
  const tray = entry.authoredTrayBounds;
  unit.interior = {
    min: [tray[0].min[0], tray[0].max[1], tray[1].max[2]],
    max: [tray[3].min[0], entry.max[1], tray[2].min[2]],
  };
}

const manifest = {
  version: 1,
  source: audit.source,
  coordinateTransform: audit.coordinateTransform,
  entries: entries.sort((a, b) => natural(a.id, b.id)),
  units: [...unitsById.values()],
  // Canonical collision export can skip these exact source objects, then use
  // each entry's closed-pose collisionBoxes as dynamic collision. Exact names
  // avoid deleting unrelated wall triangles near built-in furniture.
  collisionExcludedSourceNames: unique(entries.flatMap(entry => [
    ...entry.frontNames.filter(name => !name.startsWith('front:')),
    ...(entry.sourceSolidNames ?? []),
    ...entry.handleNames,
    ...entry.attachedNames.filter(name => !name.startsWith('front:')),
    ...entry.removeNames.filter(name => !name.startsWith('front:')),
  ])).sort(natural),
  excluded: [
    { category: 'appliances', names: ['Kitchen oven black front', 'Laundry photo / compact freezer door', 'Laundry photo / detergent drawer 0', 'Laundry photo / detergent drawer 1', 'Office / printer front paper drawer'] },
    { category: 'room-and-shower-doors', pattern: 'architectural room leaves and shower enclosure panels' },
    { category: 'decorative-open-storage', pattern: 'standalone fabric bins, wicker baskets, loose tubs, under-bed boxes, and open shelves; the explicitly named metal three-drawer cabinet and Bedroom 3 KALLAX fabric bins are included' },
  ],
};
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${outputPath}: ${entries.length} movable storage fronts across ${manifest.units.length} units.`);
