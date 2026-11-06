/* Where everything in the Digital Store stands (no three.js here, so pages can use it without loading the 3D engine). */
export const SLOT_W = 0.55;      // width of one place on a row
export const ROW_H = 0.75;       // height between shelves
export const RACK_D = 0.5;       // depth of a rack
const RACK_GAP = 2.4;     // walking space between racks on a line
const LINE_GAP = 5.2;     // distance between lines of racks (the aisle)
export const EYE = 1.6;

/* Where everything stands, from the store set-up (racks, rows per rack, products per row). Also used by the minimap. */
export function computeLayout(store) {
  const rackW = store.slots_per_row * SLOT_W + 0.2;
  const rackH = store.rows_per_rack * ROW_H + 0.25;
  const perLine = Math.max(1, Math.ceil(Math.sqrt(store.racks * 1.6)));
  const lines = Math.ceil(store.racks / perLine);
  const pitch = rackW + RACK_GAP;
  const width = Math.max(11, perLine * pitch + 2);
  const zMax = 5;                                   // entrance wall
  const zMin = -((lines - 1) * LINE_GAP) - 1.5 - 3.5; // back wall
  const racks = [];
  for (let i = 0; i < store.racks; i++) {
    const col = i % perLine, line = Math.floor(i / perLine);
    const inLine = Math.min(perLine, store.racks - line * perLine);
    racks.push({ index: i + 1, x: (col - (inLine - 1) / 2) * pitch, z: -(line * LINE_GAP) - 1.5, w: rackW, h: rackH, d: RACK_D });
  }
  return { racks, width, zMax, zMin, rackW, rackH, depth: zMax - zMin };
}

/* world position of a product's place */
export function placeOf(layout, store, item) {
  const rack = layout.racks[item.rack - 1];
  if (!rack) return null;
  const x = rack.x + (item.slot - (store.slots_per_row + 1) / 2) * SLOT_W;
  const y = 0.12 + (item.row_no - 1) * ROW_H + 0.06;
  return { x, y, z: rack.z, rack };
}

