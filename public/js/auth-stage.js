/* The little auditorium on the login / sign-up screens: seats fill up one by one,
   and a single yellow "selected" seat hops around like someone choosing. */
(function () {
  const hall = document.getElementById('miniHall');
  if (!hall) return;
  const COLS = 16;
  const ROWS = 7;
  const chairs = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const el = document.createElement('i');
      el.className = 'chair';
      // aisles, like the real hall
      if (c === 3 || c === 12) el.style.visibility = 'hidden';
      hall.appendChild(el);
      chairs.push(el);
    }
  }
  const seats = chairs.filter((c) => c.style.visibility !== 'hidden');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    seats.forEach((s, i) => { if (i % 3 === 0) s.classList.add('gone'); });
    return;
  }
  let picking = null;
  setInterval(() => {
    if (picking) { picking.classList.remove('on'); picking.classList.add('gone'); }
    const free = seats.filter((s) => !s.classList.contains('gone'));
    if (free.length < 12) { seats.forEach((s) => s.classList.remove('gone', 'on')); picking = null; return; }
    // fill front rows first, like the real booking rules
    const front = free.slice(0, Math.max(6, Math.floor(free.length / 4)));
    picking = front[(Math.random() * front.length) | 0];
    picking.classList.add('on');
  }, 900);
})();
