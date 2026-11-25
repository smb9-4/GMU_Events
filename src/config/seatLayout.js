/**
 * Hallama Auditorium seat layout — traced from the reference screenshot.
 *
 * Each row is a list of blocks: [startColumn, seatCount].
 * Columns are measured in "seat widths" from the far-left edge of the hall,
 * so fractional starts reproduce the exact staggered shape of the hall.
 * Seat numbers run continuously left → right across all blocks in a row
 * (e.g. row B: 1-3 left, 4-16 centre, 17-22 right), exactly as in the image.
 */
const ROW_BLOCKS = [
  ['A', [[6.65, 2], [14.27, 12], [33.0, 3]]],
  ['B', [[5.65, 3], [14.27, 13], [33.0, 6]]],
  ['C', [[3, 6], [11.75, 19], [33.6, 6]]],
  ['D', [[3, 6], [11.75, 19], [33.6, 9]]],
  ['E', [[0, 9], [11.75, 19], [33.6, 7]]],
  ['F', [[2, 7], [11.75, 19], [33.6, 9]]],
  ['G', [[0, 9], [11.75, 19], [33.6, 7]]],
  ['H', [[2, 7], [11.75, 19], [33.6, 7]]],
  ['I', [[2, 7], [11.75, 19]]],
  ['J', [[11.3, 19]]],
  ['K', [[11.3, 19]]],
  ['L', [[11.3, 19]]],
  ['M', [[11.3, 19]]],
  ['N', [[15.1, 5], [22.9, 5]]],
  ['O', [[13.2, 7], [23.0, 7]]],
  ['P', [[13.2, 7], [23.0, 7]]],
  ['Q', [[13.2, 7], [23.0, 7]]],
  ['R', [[13.2, 7], [23.0, 7]]],
  ['S', [[13.2, 7], [23.0, 7]]],
  ['T', [[13.2, 16]]],
];

const ROWS = ROW_BLOCKS.map(([label, blocks]) => {
  const seats = [];
  let n = 0;
  for (const [start, count] of blocks) {
    for (let i = 0; i < count; i++) {
      n += 1;
      seats.push({ id: `${label}${n}`, row: label, n, x: Math.round((start + i) * 100) / 100 });
    }
  }
  return { label, seats };
});

const SEAT_INDEX = new Map();
ROWS.forEach((r) => r.seats.forEach((s) => SEAT_INDEX.set(s.id, s)));

const ROW_ORDER = ROWS.map((r) => r.label);
const TOTAL_SEATS = SEAT_INDEX.size;

function seatsInRow(label) {
  const row = ROWS.find((r) => r.label === label);
  return row ? row.seats.map((s) => s.id) : [];
}

/** Compact layout sent to the browser. */
const PUBLIC_LAYOUT = {
  name: 'Hallama Auditorium',
  rows: ROWS.map((r) => ({ label: r.label, seats: r.seats.map(({ id, n, x }) => ({ id, n, x })) })),
};

module.exports = { ROWS, SEAT_INDEX, ROW_ORDER, TOTAL_SEATS, PUBLIC_LAYOUT, seatsInRow };
