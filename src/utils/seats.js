const { ROWS } = require('../config/seatLayout');

/**
 * The row students are currently allowed to book in.
 * It is the first row (front to back) that still has a free, unlocked seat.
 * Rows that are completely locked (e.g. row A for guests) are skipped.
 * Returns null when every bookable seat is taken (house full).
 */
function currentOpenRow(event, bookedSeatIds) {
  const booked = bookedSeatIds instanceof Set ? bookedSeatIds : new Set(bookedSeatIds);
  const locked = new Set(event.lockedSeats || []);
  for (const row of ROWS) {
    if (row.seats.some((s) => !locked.has(s.id) && !booked.has(s.id))) return row.label;
  }
  return null;
}

function seatCounts(event, bookedSeatIds) {
  const booked = bookedSeatIds instanceof Set ? bookedSeatIds : new Set(bookedSeatIds);
  const locked = new Set(event.lockedSeats || []);
  let total = 0;
  let lockedCount = 0;
  let available = 0;
  for (const row of ROWS) {
    for (const s of row.seats) {
      total += 1;
      if (booked.has(s.id)) continue;
      if (locked.has(s.id)) lockedCount += 1;
      else available += 1;
    }
  }
  return { total, booked: booked.size, locked: lockedCount, available };
}

function withGlobalLocks(event, globalLockedSeats = []) {
  if (!globalLockedSeats.length) return event;
  const merged = [...new Set([...(event.lockedSeats || []), ...globalLockedSeats])];
  return { ...(event.toObject ? event.toObject() : event), lockedSeats: merged };
}

module.exports = { currentOpenRow, seatCounts, withGlobalLocks };
