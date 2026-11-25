/* Admin dashboard */
let me = null;
let events = [];
let current = null;      // event being managed
let seatState = null;
let adminMap = null;
let bookings = [];
let pollTimer = null;
let stopHeroCountdown = null;

const $ = (id) => document.getElementById(id);

(async () => {
  me = await requireUser(['admin']);
  if (!me) return;

  const tabs = $('mainTabs');
  tabs.innerHTML = `
    <button class="tab active" data-tab="events">${ICONS.stage}<span>Overview</span></button>
    <button class="tab" data-tab="students">${ICONS.users}<span>Students</span></button>
    <button class="tab" data-tab="staff">${ICONS.badge}<span>Team</span></button>`;
  useAppNav(tabs);
  tabs.addEventListener('click', (e) => {
    const t = e.target.closest('.tab');
    if (t) showMain(t.dataset.tab);
  });
  document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => showMain('events')));
  $('newEventBtn').onclick = openCreate;
  $('manageTabs').addEventListener('click', (e) => {
    const t = e.target.closest('.tab');
    if (t) showManageTab(t.dataset.mtab);
  });

  bindSeatTools();
  bindBookings();
  bindStudents();
  bindStaff();
  showMain('events');
})();

/* ---------------- Navigation ---------------- */
function showMain(tab) {
  stopPoll();
  document.querySelectorAll('#mainTabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  showView(tab);
  if (tab === 'events') loadOverview();
  if (tab === 'students') loadStudents();
  if (tab === 'staff') loadStaff();
}

function showView(v) {
  ['events', 'create', 'manage', 'students', 'staff'].forEach((x) => $('view-' + x).classList.toggle('hidden', x !== v));
  window.scrollTo({ top: 0 });
}

/* ---------------- Overview ---------------- */
async function loadOverview() {
  try {
    const [ev, ov] = await Promise.all([API.get('/api/events'), API.get('/api/admin/overview')]);
    events = ev.events;
    renderHero(ov);
    renderKpis(ov.totals);
    renderEventList();
    renderFeed(ov.recent);
    renderBars(ov.signups);
  } catch (e) {
    toast(e.message, 'err');
  }
}

function renderHero(ov) {
  if (stopHeroCountdown) stopHeroCountdown();
  const hello = `${greeting()}, <b>${esc(firstName(me.name))}</b>`;
  const next = events.find((e) => new Date(e.startsAt).getTime() > Date.now() - 4 * 3600e3);
  const grid = $('heroGrid');
  $('heroBackdrop').style.removeProperty('--poster');

  if (!next) {
    grid.innerHTML = `<div>
      <p class="hero-hello">${hello}</p>
      <h1 class="hero-title">Nothing on<br>stage yet<span class="x">.</span></h1>
      <p class="hero-sub">Create your first event. Row A is reserved for guests automatically, and students can start booking right away.</p>
      <div class="hero-actions"><button class="btn btn-spot lg" id="heroNew">Create an event</button></div>
    </div>`;
    $('heroNew').onclick = openCreate;
    return;
  }
  if (next.hasPoster) $('heroBackdrop').style.setProperty('--poster', `url("${posterUrl(next)}")`);
  grid.innerHTML = `
    <div>
      <p class="hero-hello">${hello}. Your next show:</p>
      <h1 class="hero-title">${tedTitle(next.title)}</h1>
      ${next.description ? `<p class="hero-sub">${esc(next.description)}</p>` : ''}
      <div class="hero-meta">
        <span>${ICONS.calendar}${fmtDay(next.startsAt)}</span>
        <span>${ICONS.clock}${fmtClock(next.startsAt)}</span>
        <span>${ICONS.pin}${esc(next.venue)}</span>
      </div>
      <div class="hero-actions">
        <button class="btn btn-spot lg" data-manage="${next.id}">Manage seats</button>
        <a class="btn lg" href="/volunteer.html">Open door scanner</a>
      </div>
    </div>
    <div class="hero-card admin-countdown">
      <div class="admin-countdown-label">Time until the event</div>
      <div id="heroCd"></div>
    </div>`;
  grid.querySelector('[data-manage]').onclick = () => openManage(next.id);
  stopHeroCountdown = startCountdown($('heroCd'), next.startsAt);
}

function renderKpis(t) {
  $('kpis').innerHTML = `
    <div class="kpi"><b>${t.students}</b><span>Students signed up</span></div>
    <div class="kpi spot"><b>${t.bookings}</b><span>Seats booked</span></div>
    <div class="kpi teal"><b>${t.scanned}</b><span>Checked in at the door</span></div>
    <div class="kpi"><b>${t.staff}</b><span>Team members</span></div>`;
}

function renderEventList() {
  const box = $('eventList');
  if (!events.length) {
    box.innerHTML = `<div class="empty">${chair('booked')}<b>No events yet</b>Use “New event” to set one up.</div>`;
    return;
  }
  box.innerHTML = events.map((ev) => {
    const c = ev.counts;
    const ended = new Date(ev.startsAt) < Date.now() - 4 * 3600e3;
    return `<article class="bill">
      ${posterHtml(ev)}
      <div>
        <h3>${esc(ev.title)}</h3>
        <div class="meta"><span>${ICONS.calendar}${fmtDate(ev.startsAt, true)}</span><span>${ICONS.pin}${esc(ev.venue)}</span></div>
        <div class="row-line">
          ${ended ? '<span class="pill">Ended</span>' : ev.published ? '<span class="pill green">Visible to students</span>' : '<span class="pill">Hidden</span>'}
          ${ended ? '' : ev.bookingOpen ? '<span class="pill green live"><span class="dot"></span>Booking open</span>' : '<span class="pill red">Booking closed</span>'}
          <span class="seats-left"><b>${c.available}</b> seats available</span>
        </div>
      </div>
      <div class="bill-cta">
        <button class="btn btn-spot" data-manage="${ev.id}">Manage</button>
        <button class="btn btn-danger" data-delete="${ev.id}">Delete</button>
      </div>
    </article>`;
  }).join('');
  box.querySelectorAll('[data-manage]').forEach((b) => b.addEventListener('click', () => openManage(b.dataset.manage)));
  box.querySelectorAll('[data-delete]').forEach((b) => {
    b.addEventListener('click', () => {
      const event = events.find((item) => item.id === b.dataset.delete);
      if (event) deleteEventById(event.id, event.title, event.counts.booked);
    });
  });
}

function renderFeed(recent) {
  if (!recent.length) {
    $('feed').innerHTML = '<p class="muted small">Bookings will appear here as students pick seats.</p>';
    return;
  }
  $('feed').innerHTML = recent.map((r) => `
    <div class="feed-item">
      <span class="avatar">${esc(initials(r.name))}</span>
      <div style="min-width:0"><b>${esc(r.name)}</b><small>${esc(r.dept || '')}${r.sem ? `, sem ${esc(r.sem)}` : ''} · ${timeAgo(r.createdAt)}</small></div>
      <div class="seat-tag">${esc(r.seatId)}<small>${r.scannedAt ? 'checked in' : esc(r.eventTitle)}</small></div>
    </div>`).join('');
}

function renderBars(days) {
  const max = Math.max(1, ...days.map((d) => d.n));
  const total = days.reduce((a, d) => a + d.n, 0);
  $('signupTotal').textContent = total ? `${total} new ${total === 1 ? 'student' : 'students'} in the last 7 days` : 'No new sign-ups in the last 7 days';
  $('bars').innerHTML = days.map((d) => {
    const label = new Date(d.day + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short' });
    return `<div title="${d.n} on ${d.day}"><em>${d.n || ''}</em><i class="${d.n ? '' : 'zero'}" style="height:${Math.max(4, (d.n / max) * 82)}px"></i><small>${label}</small></div>`;
  }).join('');
}

/* ---------------- Event form (create + edit) ---------------- */
function toLocalInput(d) {
  const dt = d ? new Date(d) : new Date(Date.now() + 7 * 864e5);
  return new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function eventFormHtml(ev, isNew) {
  return `
    <div class="form-error hidden" data-err></div>
    <form novalidate data-form>
      <div class="field"><label>Event title</label><input class="input" name="title" required value="${esc(ev?.title || 'TEDx GMU')}"></div>
      <div class="row2">
        <div class="field"><label>Venue</label><input class="input" name="venue" value="${esc(ev?.venue || 'Hallama Auditorium')}"></div>
        <div class="field"><label>Date and time</label><input class="input" name="startsAt" type="datetime-local" required value="${toLocalInput(ev?.startsAt)}"></div>
      </div>
      <div class="field"><label>Description (shown on the student banner)</label><textarea class="input" name="description" placeholder="Speakers, theme, what to expect">${esc(ev?.description || '')}</textarea></div>
      <div class="field">
        <label>Poster</label>
        ${ev?.hasPoster ? `<img class="poster-preview" data-preview src="${posterUrl(ev)}" alt="">` : '<img class="poster-preview hidden" data-preview alt="">'}
        <input class="input" type="file" accept="image/png,image/jpeg,image/webp" data-poster>
        ${ev?.hasPoster ? '<label class="check"><input type="checkbox" data-remove-poster> Remove the current poster</label>' : ''}
      </div>
      <label class="check"><input type="checkbox" name="published" ${!ev || ev.published ? 'checked' : ''}> Show this event to students</label>
      <label class="check"><input type="checkbox" name="bookingOpen" ${!ev || ev.bookingOpen ? 'checked' : ''}> Let students book seats</label>
      <label class="check"><input type="checkbox" name="sequentialRows" ${!ev || ev.sequentialRows ? 'checked' : ''}> Fill row by row (the next row opens only when the current one is full)</label>
      ${isNew ? '<label class="check"><input type="checkbox" name="guestRowA" checked> Reserve row A for guests (you can change single seats later)</label>' : ''}
      <div style="margin-top:18px"><button class="btn btn-spot lg" type="submit">${isNew ? 'Create event' : 'Save changes'}</button></div>
    </form>`;
}

function resizeImage(file, max = 1200) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const r = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * r);
      c.height = Math.round(img.height * r);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file isn’t an image we can read. Try a JPG or PNG.')); };
    img.src = url;
  });
}

function wireEventForm(box, ev, isNew, onSaved) {
  box.innerHTML = eventFormHtml(ev, isNew);
  const form = box.querySelector('[data-form]');
  const err = box.querySelector('[data-err]');
  const preview = box.querySelector('[data-preview]');
  let posterData;

  box.querySelector('[data-poster]').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      posterData = await resizeImage(f);
      preview.src = posterData;
      preview.classList.remove('hidden');
    } catch (ex) { toast(ex.message, 'err'); }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.classList.add('hidden');
    const btn = form.querySelector('button[type=submit]');
    const body = {
      title: form.title.value,
      venue: form.venue.value,
      startsAt: form.startsAt.value ? new Date(form.startsAt.value).toISOString() : '',
      description: form.description.value,
      published: form.published.checked,
      bookingOpen: form.bookingOpen.checked,
      sequentialRows: form.sequentialRows.checked,
    };
    if (posterData) body.poster = posterData;
    else if (box.querySelector('[data-remove-poster]')?.checked) body.poster = null;
    if (isNew) body.guestRows = form.guestRowA.checked ? ['A'] : [];

    btn.disabled = true;
    try {
      if (isNew) {
        const { event } = await API.post('/api/admin/events', body);
        toast('Event created', 'ok');
        onSaved(event.id);
      } else {
        await API.put(`/api/admin/events/${ev.id}`, body);
        toast('Changes saved', 'ok');
        onSaved(ev.id);
      }
    } catch (ex) {
      err.textContent = ex.message;
      err.classList.remove('hidden');
    } finally {
      btn.disabled = false;
    }
  });
}

function openCreate() {
  stopPoll();
  showView('create');
  openCreateWizard($('createFormBox'), (id) => openManage(id), () => showMain('events'));
}

/* ---------------- Manage one event ---------------- */
async function openManage(id) {
  stopPoll();
  showView('manage');
  $('mTitle').textContent = 'Loading…';
  $('mStats').innerHTML = '';
  try {
    seatState = await API.get(`/api/events/${id}/seats`);
  } catch (e) {
    toast(e.message, 'err');
    return showMain('events');
  }
  current = seatState.event;
  $('mTitle').textContent = current.title;

  $('rowSelect').innerHTML = seatState.layout.rows.map((r) => `<option value="${r.label}">Row ${r.label}</option>`).join('');
  $('adminLegend').innerHTML = legendHtml(['available', 'closed', 'booked', 'scanned', 'locked']);

  $('adminMap').innerHTML = '';
  $('adminMap').className = '';
  adminMap = new SeatMap($('adminMap'), { layout: seatState.layout, onSeatTap: onAdminSeatTap, mode: 'admin' });
  renderManage();
  showManageTab('seats');

  openCreateWizard($('editFormBox'), async () => {
    const full = await API.get(`/api/events/${current.id}`);
    current = full.event;
    $('mTitle').textContent = current.title;
    refreshManage();
  }, () => showManageTab('seats'), current);
  $('deleteEventBtn').onclick = deleteEvent;
  pollTimer = setInterval(() => { if (!document.hidden) refreshManage(); }, 10000);
}

function stopPoll() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

function showManageTab(tab) {
  document.querySelectorAll('#manageTabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.mtab === tab));
  ['seats', 'bookings', 'settings'].forEach((x) => $('mtab-' + x).classList.toggle('hidden', x !== tab));
  if (tab === 'seats' && adminMap) requestAnimationFrame(() => { if (!adminMap.userMoved) adminMap.fit(); });
  if (tab === 'bookings') loadBookings();
}

async function refreshManage() {
  if (!current) return;
  try {
    seatState = await API.get(`/api/events/${current.id}/seats`);
    renderManage();
  } catch { /* ignore */ }
}

function renderManage() {
  const s = seatState;
  const scanned = Object.values(s.details || {}).filter((d) => d.scannedAt).length;
  $('mStats').innerHTML = `
    <div class="kpi"><b>${s.counts.total}</b><span>Seats in the hall</span></div>
    <div class="kpi spot"><b>${s.counts.booked}</b><span>Booked</span></div>
    <div class="kpi green"><b>${s.counts.available}</b><span>Still free</span></div>
    <div class="kpi red"><b>${s.counts.locked}</b><span>Reserved</span></div>
    <div class="kpi teal"><b>${scanned}</b><span>Checked in</span></div>`;
  const pill = $('mOpenRow');
  if (!s.event.bookingOpen) { pill.className = 'pill red'; pill.innerHTML = 'Booking closed'; }
  else if (!s.event.sequentialRows) { pill.className = 'pill green live'; pill.innerHTML = '<span class="dot"></span>All rows open'; }
  else if (s.openRow) { pill.className = 'pill green live'; pill.innerHTML = `<span class="dot"></span>Filling row ${esc(s.openRow)}`; }
  else { pill.className = 'pill red'; pill.innerHTML = 'Houseful'; }

  const seqBtn = $('toggleSeqBtn');
  if (seqBtn) {
    seqBtn.textContent = `Row-by-row: ${s.event.sequentialRows ? 'ON' : 'OFF'}`;
    seqBtn.className = `btn sm ${s.event.sequentialRows ? 'btn-spot' : ''}`;
  }

  const limitBtn = $('toggleRowLimitBtn');
  const countInp = $('freeRowCount');
  const freeNBtn = $('freeNRowsBtn');
  if (limitBtn && countInp && freeNBtn) {
    const enabled = Boolean(s.event.rowLimitEnabled);
    const count = s.event.openRowCount || 5;
    limitBtn.textContent = `Row Limit: ${enabled ? 'ON' : 'OFF'}`;
    limitBtn.className = `btn sm ${enabled ? 'btn-spot' : ''}`;
    if (document.activeElement !== countInp) countInp.value = count;
    const n = Math.max(1, Math.min(19, Number(countInp.value) || 5));
    freeNBtn.textContent = `Open ${n} ${n === 1 ? 'row' : 'rows'}`;
  }

  const booked = new Set(s.booked);
  const locked = new Set(s.locked);
  const st = {};
  for (const row of s.layout.rows) {
    for (const seat of row.seats) {
      if (booked.has(seat.id)) st[seat.id] = s.details?.[seat.id]?.scannedAt ? 'scanned' : 'booked';
      else if (locked.has(seat.id)) st[seat.id] = 'locked';
      else if (s.event.sequentialRows && row.label !== s.openRow) st[seat.id] = 'closed';
      else st[seat.id] = 'available';
    }
  }
  adminMap.setStatuses(st);
}

function bindSeatTools() {
  const rowAction = async (lock) => {
    const row = $('rowSelect').value;
    try {
      const r = await API.post(`/api/admin/events/${current.id}/locks`, { row, lock });
      let msg = `Row ${row} ${lock ? 'reserved' : 'freed'}`;
      if (r.skipped?.length) msg += `. ${r.skipped.length} already-booked ${r.skipped.length === 1 ? 'seat stays' : 'seats stay'} booked.`;
      toast(msg, 'ok');
      refreshManage();
    } catch (e) { toast(e.message, 'err'); }
  };
  $('lockRowBtn').onclick = () => rowAction(true);
  $('unlockRowBtn').onclick = () => rowAction(false);

  const countInp = $('freeRowCount');
  const freeNBtn = $('freeNRowsBtn');
  const syncFreeLabel = () => {
    const n = Math.max(1, Math.min(19, Number(countInp.value) || 1));
    freeNBtn.textContent = `Open ${n} ${n === 1 ? 'row' : 'rows'}`;
  };
  countInp.addEventListener('input', syncFreeLabel);
  syncFreeLabel();

  const applyRowLimit = async (enabled) => {
    const n = Math.max(1, Math.min(19, Number(countInp.value) || 5));
    countInp.value = n;
    syncFreeLabel();
    try {
      const r = await API.post(`/api/admin/events/${current.id}/row-limit`, { enabled, count: n });
      if (enabled) {
        const range = r.openRows.length > 1 ? `${r.openRows[0]}–${r.openRows[r.openRows.length - 1]}` : r.openRows[0];
        toast(`Row Limit ON: Rows ${range} (${r.count} rows) open, all others locked`, 'ok');
      } else {
        toast('Row Limit OFF: All student rows (B–T) open, Row A reserved for guests', 'ok');
      }
      refreshManage();
    } catch (e) { toast(e.message, 'err'); }
  };

  freeNBtn.onclick = () => applyRowLimit(true);
  $('toggleRowLimitBtn').onclick = () => applyRowLimit(!seatState?.event?.rowLimitEnabled);

  $('toggleSeqBtn').onclick = async () => {
    if (!seatState?.event) return;
    const nextVal = !seatState.event.sequentialRows;
    try {
      await API.put(`/api/admin/events/${current.id}`, { sequentialRows: nextVal });
      current.sequentialRows = nextVal;
      toast(`Row-by-row filling turned ${nextVal ? 'ON' : 'OFF'}`, 'ok');
      refreshManage();
    } catch (e) { toast(e.message, 'err'); }
  };
}

async function onAdminSeatTap(id, el) {
  const st = el.dataset.st;
  if (st === 'booked' || st === 'scanned') {
    const d = seatState.details[id] || {};
    const v = await modal({
      title: `Seat ${id}`,
      html: `<div class="kv">
        <span>Name</span><b>${esc(d.name)}</b>
        <span>Department</span><b>${esc(d.dept || '—')}, sem ${esc(d.sem || '—')}</b>
        <span>Phone</span><b>${esc(d.phone || '—')}</b>
        <span>Email</span><b style="word-break:break-all">${esc(d.email || '—')}</b>
        <span>Status</span><b>${d.scannedAt ? `Checked in at ${fmtClock(d.scannedAt)}` : 'Not checked in yet'}</b>
      </div>`,
      actions: [{ label: 'Cancel booking', value: 'cancel', cls: 'btn-danger' }, { label: 'Close', value: null, cls: 'btn-spot' }],
    });
    if (v === 'cancel') cancelBooking(d.bookingId, id, d.name);
    return;
  }
  const lock = st !== 'locked';
  try {
    await API.post(`/api/admin/events/${current.id}/locks`, { seatIds: [id], lock });
    toast(`${id} ${lock ? 'reserved' : 'freed'}`, 'ok');
    refreshManage();
  } catch (e) { toast(e.message, 'err'); }
}

async function cancelBooking(bookingId, seatId, name) {
  const ok = await confirmBox('Cancel this booking?', `<p>Seat <b>${esc(seatId)}</b> booked by <b>${esc(name)}</b> becomes free again, and their QR ticket stops working.</p>`, 'Cancel booking', 'btn-danger');
  if (!ok) return;
  try {
    await API.del(`/api/admin/bookings/${bookingId}`);
    toast(`Booking for ${seatId} cancelled`, 'ok');
    await refreshManage();
    if (!$('mtab-bookings').classList.contains('hidden')) loadBookings();
  } catch (e) { toast(e.message, 'err'); }
}

async function deleteEvent() {
  return deleteEventById(current.id, current.title, seatState.counts.booked);
}

async function deleteEventById(id, title, bookedCount) {
  const ok = await confirmBox('Delete this event?', `<p>This permanently deletes <b>${esc(title)}</b> and its ${bookedCount} bookings.</p>`, 'Delete event', 'btn-danger');
  if (!ok) return;
  try {
    await API.del(`/api/admin/events/${id}`);
    toast('Event deleted', 'ok');
    showMain('events');
  } catch (e) { toast(e.message, 'err'); }
}

/* ---------------- Bookings table ---------------- */
function bindBookings() {
  $('bkSearch').addEventListener('input', debounce(renderBookings, 150));
  $('bkFilter').addEventListener('change', renderBookings);
  $('bkExport').onclick = () => {
    const rows = [['Seat', 'Name', 'Dept', 'Sem', 'Phone', 'Email', 'College', 'Booked at', 'Checked in', 'Checked in by']];
    filteredBookings().forEach((b) => rows.push([b.seatId, b.user.name, b.user.dept, b.user.sem, b.user.phone, b.user.email, b.user.college, fmtDate(b.createdAt), b.scannedAt ? fmtDate(b.scannedAt) : 'No', b.scannedBy || '']));
    downloadCSV(`${current.title.replace(/\W+/g, '_')}_bookings.csv`, rows);
  };
}

async function loadBookings() {
  $('bkBody').innerHTML = '<tr><td colspan="9" class="muted">Loading…</td></tr>';
  try {
    ({ bookings } = await API.get(`/api/admin/events/${current.id}/bookings`));
    bookings.sort((a, b) => seatCompare(a.seatId, b.seatId));
    renderBookings();
  } catch (e) { toast(e.message, 'err'); }
}

function filteredBookings() {
  const q = $('bkSearch').value.trim().toLowerCase();
  const f = $('bkFilter').value;
  return bookings.filter((b) => {
    if (f === 'in' && !b.scannedAt) return false;
    if (f === 'out' && b.scannedAt) return false;
    if (!q) return true;
    return [b.seatId, b.user.name, b.user.phone, b.user.email, b.user.dept].some((v) => String(v || '').toLowerCase().includes(q));
  });
}

function renderBookings() {
  const list = filteredBookings();
  if (!list.length) {
    $('bkBody').innerHTML = '<tr><td colspan="9" class="muted" style="text-align:center;padding:28px">No bookings match. Try a different search or filter.</td></tr>';
    return;
  }
  $('bkBody').innerHTML = list.map((b) => `<tr>
    <td data-label="Seat" class="seatcell">${esc(b.seatId)}</td>
    <td data-label="Name"><b>${esc(b.user.name)}</b></td>
    <td data-label="Dept">${esc(b.user.dept || '—')}</td>
    <td data-label="Sem">${esc(b.user.sem || '—')}</td>
    <td data-label="Phone">${esc(b.user.phone || '—')}</td>
    <td data-label="Email" style="word-break:break-all">${esc(b.user.email || '—')}</td>
    <td data-label="Booked">${fmtDate(b.createdAt)}</td>
    <td data-label="Status">${b.scannedAt ? `<span class="pill teal">In at ${fmtClock(b.scannedAt)}</span>` : '<span class="pill">Not scanned</span>'}</td>
    <td class="actions-cell"><button class="btn btn-danger sm" data-cancel="${b.id}" data-seat="${esc(b.seatId)}" data-name="${esc(b.user.name)}">Cancel</button></td>
  </tr>`).join('');
  $('bkBody').querySelectorAll('[data-cancel]').forEach((btn) => btn.addEventListener('click', () => cancelBooking(btn.dataset.cancel, btn.dataset.seat, btn.dataset.name)));
}

/* ---------------- Students ---------------- */
let students = [];
function bindStudents() {
  $('stEvent').addEventListener('change', loadStudents);
  $('stSearch').addEventListener('input', debounce(renderStudents, 150));
  $('stFilter').addEventListener('change', renderStudents);
  $('stExport').onclick = () => {
    const rows = [['Name', 'Phone', 'Email', 'Dept', 'Sem', 'College', 'Signed up', 'Last login', 'Seat', 'Checked in']];
    filteredStudents().forEach((s) => rows.push([s.name, s.phone, s.email, s.dept, s.sem, s.college, fmtDate(s.createdAt), fmtDate(s.lastLoginAt), s.booking?.seatId || '', s.booking?.scannedAt ? fmtDate(s.booking.scannedAt) : '']));
    downloadCSV('students.csv', rows);
  };
}

async function loadStudents() {
  const sel = $('stEvent');
  if (!events.length) {
    try { ({ events } = await API.get('/api/events')); } catch { /* ignore */ }
  }
  const prev = sel.value;
  sel.innerHTML = '<option value="">Booking status for…</option>' + events.map((e) => `<option value="${e.id}">${esc(e.title)}, ${fmtDate(e.startsAt)}</option>`).join('');
  sel.value = prev || (events[0]?.id || '');
  $('stBody').innerHTML = '<tr><td colspan="10" class="muted">Loading…</td></tr>';
  try {
    ({ students } = await API.get(`/api/admin/students${sel.value ? `?eventId=${sel.value}` : ''}`));
    renderStudents();
  } catch (e) { toast(e.message, 'err'); }
}

function filteredStudents() {
  const q = $('stSearch').value.trim().toLowerCase();
  const f = $('stFilter').value;
  return students.filter((s) => {
    if (f === 'booked' && !s.booking) return false;
    if (f === 'notbooked' && s.booking) return false;
    if (!q) return true;
    return [s.name, s.email, s.phone, s.dept, s.college, s.booking?.seatId].some((v) => String(v || '').toLowerCase().includes(q));
  });
}

function renderStudents() {
  const bookedN = students.filter((s) => s.booking).length;
  $('stStats').innerHTML = `
    <div class="kpi"><b>${students.length}</b><span>Signed up</span></div>
    <div class="kpi spot"><b>${bookedN}</b><span>Booked a seat</span></div>
    <div class="kpi red"><b>${students.length - bookedN}</b><span>No seat yet</span></div>`;
  const list = filteredStudents();
  if (!list.length) {
    $('stBody').innerHTML = '<tr><td colspan="10" class="muted" style="text-align:center;padding:28px">No students match. Try a different search or filter.</td></tr>';
    return;
  }
  $('stBody').innerHTML = list.map((s) => `<tr>
    <td data-label="Name"><b>${esc(s.name)}</b></td>
    <td data-label="Phone">${esc(s.phone || '—')}</td>
    <td data-label="Email" style="word-break:break-all">${esc(s.email)}</td>
    <td data-label="Dept">${esc(s.dept || '—')}</td>
    <td data-label="Sem">${esc(s.sem || '—')}</td>
    <td data-label="College">${esc(s.college || '—')}</td>
    <td data-label="Signed up">${fmtDate(s.createdAt)}</td>
    <td data-label="Last login">${s.lastLoginAt ? timeAgo(s.lastLoginAt) : '—'}</td>
    <td data-label="Seat" class="seatcell">${s.booking ? esc(s.booking.seatId) : '<span class="muted" style="font-family:var(--body);font-size:14px">—</span>'}</td>
    <td data-label="Checked in">${s.booking ? (s.booking.scannedAt ? `<span class="pill teal">${fmtClock(s.booking.scannedAt)}</span>` : '<span class="pill">Not yet</span>') : '—'}</td>
  </tr>`).join('');
}

/* ---------------- Team ---------------- */
function bindStaff() {
  $('staffForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const err = $('staffErr');
    err.classList.add('hidden');
    try {
      await API.post('/api/admin/staff', { name: f.name.value, email: f.email.value, phone: f.phone.value, password: f.password.value, role: f.role.value });
      toast(`${f.role.value === 'admin' ? 'Admin' : 'Volunteer'} added. Share the email and password with them.`, 'ok');
      f.reset();
      loadStaff();
    } catch (ex) {
      err.textContent = ex.message;
      err.classList.remove('hidden');
    }
  });
}

async function loadStaff() {
  try {
    const { staff } = await API.get('/api/admin/staff');
    $('staffBody').innerHTML = staff.map((u) => `<tr>
      <td data-label="Name"><b>${esc(u.name)}</b></td>
      <td data-label="Role"><span class="pill ${u.role === 'admin' ? 'spot' : 'teal'}">${u.role === 'admin' ? 'Admin' : 'Volunteer'}</span></td>
      <td data-label="Email" style="word-break:break-all">${esc(u.email)}</td>
      <td data-label="Phone">${esc(u.phone || '—')}</td>
      <td data-label="Last login">${u.lastLoginAt ? timeAgo(u.lastLoginAt) : 'Never'}</td>
      <td class="actions-cell">${String(u.id) === String(me.id) ? '<span class="muted small">You</span>' : `<button class="btn btn-danger sm" data-del="${u.id}" data-name="${esc(u.name)}">Remove</button>`}</td>
    </tr>`).join('');
    $('staffBody').querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmBox('Remove from the team?', `<p>${esc(b.dataset.name)} won’t be able to log in anymore.</p>`, 'Remove', 'btn-danger'))) return;
      try { await API.del(`/api/admin/staff/${b.dataset.del}`); toast('Removed from the team', 'ok'); loadStaff(); } catch (ex) { toast(ex.message, 'err'); }
    }));
  } catch (e) { toast(e.message, 'err'); }
}
