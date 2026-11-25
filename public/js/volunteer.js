/* Volunteer: scan tickets, see attendees and the seat map */
const $ = (id) => document.getElementById(id);
let eventId = null;
let attendees = [];
let seatState = null;
let vMap = null;
let scanner = null;
let busy = false;
let lastCode = '';
let lastCodeAt = 0;
let activeTab = 'scan';

(async () => {
  const user = await requireUser(['volunteer', 'admin']);
  if (!user) return;
  $('hello').innerHTML = `${greeting()}, <b>${esc(firstName(user.name))}</b>. You’re on the door.`;
  $('readerIdle').innerHTML = $('readerIdle').innerHTML.replace('${SCAN}', ICONS.scan.replace('<svg ', '<svg width="44" height="44" '));
  const vt = $('vTabs');
  vt.innerHTML = `
    <button class="tab active" data-tab="scan">${ICONS.scan}<span>Scan</span></button>
    <button class="tab" data-tab="people">${ICONS.list}<span>Attendees</span><span class="count" id="pendingCount">0</span></button>
    <button class="tab" data-tab="seats">${ICONS.seats}<span>Seats</span></button>`;
  useAppNav(vt);
  $('heroScan').onclick = () => { showTab('scan'); $('tab-scan').scrollIntoView({ behavior: 'smooth', block: 'start' }); startScanner(); };

  const { events } = await API.get('/api/volunteer/events');
  const sel = $('eventSel');
  if (!events.length) {
    sel.innerHTML = '<option>No events yet</option>';
    sel.disabled = true;
    $('evTitle').textContent = 'No events yet';
    return;
  }
  sel.innerHTML = events.map((e) => `<option value="${e.id}">${esc(e.title)}, ${fmtDate(e.startsAt)}</option>`).join('');
  const setTitle = () => { const ev = events.find((e) => e.id === sel.value); $('evTitle').innerHTML = ev ? tedTitle(ev.title) : ''; };

  // Default: last used event, otherwise the next upcoming one
  let saved = null;
  try { saved = localStorage.getItem('vol_event'); } catch { /* ignore */ }
  const upcoming = events.find((e) => new Date(e.startsAt) > Date.now() - 12 * 3600e3);
  sel.value = events.some((e) => e.id === saved) ? saved : (upcoming || events[events.length - 1]).id;
  eventId = sel.value;
  setTitle();
  sel.addEventListener('change', () => {
    eventId = sel.value;
    setTitle();
    try { localStorage.setItem('vol_event', eventId); } catch { /* ignore */ }
    vMap = null;
    $('vMap').innerHTML = '';
    $('vMap').className = '';
    refreshAll();
  });

  $('vTabs').addEventListener('click', (e) => {
    const t = e.target.closest('.tab');
    if (t) showTab(t.dataset.tab);
  });
  $('startScan').onclick = startScanner;
  $('stopScan').onclick = stopScanner;
  $('manualForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const code = $('manualCode').value.replace(/\s+/g, '');
    if (code) { handleCode(code); $('manualCode').value = ''; }
  });
  $('pSearch').addEventListener('input', debounce(renderPeople, 150));
  $('pFilter').addEventListener('change', renderPeople);
  $('vLegend').innerHTML = legendHtml(['booked', 'scanned', 'locked', 'closed'], { booked: 'Booked, not here yet', closed: 'Empty' });

  await refreshAll();
  setInterval(() => { if (!document.hidden && !busy) refreshAll(); }, 10000);
})();

function showTab(tab) {
  activeTab = tab;
  document.querySelectorAll('#vTabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  ['scan', 'people', 'seats'].forEach((x) => $('tab-' + x).classList.toggle('hidden', x !== tab));
  if (tab !== 'scan') stopScanner();
  if (tab === 'seats') renderSeats();
  if (tab === 'people') renderPeople();
}

async function refreshAll() {
  if (!eventId) return;
  try {
    const [a, s] = await Promise.all([
      API.get(`/api/volunteer/events/${eventId}/attendees`),
      API.get(`/api/events/${eventId}/seats`),
    ]);
    attendees = a.attendees.sort((x, y) => seatCompare(x.seatId, y.seatId));
    seatState = s;
    renderStats();
    if (activeTab === 'people') renderPeople();
    if (activeTab === 'seats') renderSeats();
  } catch (e) { toast(e.message, 'err'); }
}

function renderStats() {
  const scanned = attendees.filter((a) => a.scannedAt).length;
  const total = attendees.length;
  const pct = total ? scanned / total : 0;
  const R = 52;
  const C = 2 * Math.PI * R;
  $('ring').innerHTML = `
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="${R}" fill="none" stroke="rgba(244,236,228,.1)" stroke-width="10"/>
      <circle cx="60" cy="60" r="${R}" fill="none" stroke="#2dd4bf" stroke-width="10" stroke-linecap="round"
        stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}" style="transition:stroke-dashoffset .6s ease"/>
    </svg>
    <div class="lbl"><div><b>${scanned}</b><small>of ${total} inside</small></div></div>`;
  const pc = $('pendingCount');
  if (pc) pc.textContent = total - scanned;
}

/* ---------------- Scanner ---------------- */
async function startScanner() {
  if (typeof Html5Qrcode === 'undefined') {
    toast('Scanner could not load. Check the internet connection, or type the code below.', 'err');
    return;
  }
  try {
    if (!scanner) scanner = new Html5Qrcode('reader', { verbose: false });
    await scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: (w, h) => { const m = Math.floor(Math.min(w, h) * 0.72); return { width: m, height: m }; } },
      (text) => handleCode(text),
      () => {}
    );
    $('startScan').classList.add('hidden');
    $('stopScan').classList.remove('hidden');
    $('readerIdle').classList.add('hidden');
  } catch (e) {
    toast('Could not open the camera. Allow camera permission and make sure the site uses HTTPS.', 'err');
    console.error(e);
  }
}

async function stopScanner() {
  if (scanner && scanner.isScanning) {
    try { await scanner.stop(); } catch { /* ignore */ }
  }
  $('startScan').classList.remove('hidden');
  $('stopScan').classList.add('hidden');
  $('readerIdle').classList.remove('hidden');
}

function pauseScanner() {
  try { if (scanner && scanner.isScanning) scanner.pause(true); } catch { /* ignore */ }
}
function resumeScanner() {
  try { if (scanner && scanner.getState && scanner.getState() === 3 /* PAUSED */) scanner.resume(); } catch { /* ignore */ }
}

async function handleCode(text) {
  if (busy) return;
  // ignore the same QR being read again within 3s
  if (text === lastCode && Date.now() - lastCodeAt < 3000) return;
  lastCode = text;
  lastCodeAt = Date.now();
  busy = true;
  pauseScanner();
  let r;
  try {
    r = await API.post('/api/volunteer/scan', { code: text, eventId });
  } catch (e) {
    busy = false;
    resumeScanner();
    return toast(e.message, 'err');
  }
  showResult(r);
  if (r.status === 'ok') refreshAll();
}

function showResult(r) {
  const box = $('result');
  const p = r.person || {};
  const person = p.name ? `<div class="who">${esc(p.name)}</div><div>${esc(p.dept || '')}${p.sem ? ` · Sem ${esc(p.sem)}` : ''}</div>` : '';
  let html = '';
  if (r.status === 'ok') {
    html = `<div class="icon">✓</div><div class="big">DONE</div>${person}<div class="seat-big">Seat ${esc(r.seatId)}</div>`;
    if (navigator.vibrate) navigator.vibrate(120);
  } else if (r.status === 'already') {
    html = `<div class="icon">!</div><div class="big">ALREADY SCANNED</div>${person}<div class="seat-big">Seat ${esc(r.seatId)}</div>
            <div>Entered at ${fmtTime(r.scannedAt)}${r.scannedBy ? ` · scanned by ${esc(r.scannedBy)}` : ''}</div>`;
    if (navigator.vibrate) navigator.vibrate([80, 60, 80]);
  } else if (r.status === 'wrong_event') {
    html = `<div class="icon">!</div><div class="big">WRONG EVENT</div>${person}<div>This ticket is for <b>${esc(r.eventTitle)}</b> (seat ${esc(r.seatId)})</div>`;
    if (navigator.vibrate) navigator.vibrate([80, 60, 80]);
  } else {
    html = '<div class="icon">✕</div><div class="big">INVALID QR CODE</div><div>This is not a valid ticket.</div>';
    if (navigator.vibrate) navigator.vibrate([200, 80, 200]);
  }
  html += '<button class="btn lg" id="nextBtn">Scan next</button>';
  box.className = 'scan-result ' + r.status;
  box.innerHTML = html;

  const close = () => {
    clearTimeout(autoT);
    box.classList.add('hidden');
    busy = false;
    resumeScanner();
  };
  const autoT = r.status === 'ok' ? setTimeout(close, 2500) : null;
  $('nextBtn').onclick = close;
}

/* ---------------- Attendees ---------------- */
function renderPeople() {
  const q = $('pSearch').value.trim().toLowerCase();
  const f = $('pFilter').value;
  const list = attendees.filter((a) => {
    if (f === 'in' && !a.scannedAt) return false;
    if (f === 'out' && a.scannedAt) return false;
    if (!q) return true;
    return [a.name, a.seatId, a.phone, a.dept].some((v) => String(v || '').toLowerCase().includes(q));
  });
  if (!list.length) {
    $('pList').innerHTML = `<p class="muted" style="text-align:center;padding:28px 10px">${f === 'out' && !q ? 'Everyone who booked is inside.' : 'Nobody matches. Try another search or filter.'}</p>`;
    return;
  }
  $('pList').innerHTML = list.map((a) => `
    <div class="att">
      <span class="seat-tag">${esc(a.seatId)}</span>
      <div class="info"><b>${esc(a.name)}</b><span>${esc(a.dept || '')}${a.sem ? `, sem ${esc(a.sem)}` : ''}${a.phone ? ` · ${esc(a.phone)}` : ''}</span></div>
      ${a.scannedAt ? `<span class="pill teal">In at ${fmtClock(a.scannedAt)}</span>` : `<button class="btn sm" data-in="${a.id}" data-name="${esc(a.name)}" data-seat="${esc(a.seatId)}">Check in</button>`}
    </div>`).join('');
  $('pList').querySelectorAll('[data-in]').forEach((b) => b.addEventListener('click', () => manualCheckIn(b.dataset.in, b.dataset.name, b.dataset.seat)));
}

async function manualCheckIn(bookingId, name, seat) {
  const ok = await confirmBox('Check in manually?', `<p style="margin:0">Mark <b>${esc(name)}</b> (seat ${esc(seat)}) as entered? Only do this after checking their ticket.</p>`, 'Check in', 'btn-green');
  if (!ok) return;
  try {
    await API.post(`/api/volunteer/checkin/${bookingId}`);
    toast(`${name} checked in`, 'ok');
    refreshAll();
  } catch (e) { toast(e.message, 'err'); }
}

/* ---------------- Seats ---------------- */
function renderSeats() {
  if (!seatState) return;
  if (!vMap) {
    vMap = new SeatMap($('vMap'), { layout: seatState.layout, onSeatTap: onSeatTap, mode: 'volunteer' });
  }
  const booked = new Set(seatState.booked);
  const locked = new Set(seatState.locked);
  const st = {};
  for (const row of seatState.layout.rows) {
    for (const s of row.seats) {
      if (booked.has(s.id)) st[s.id] = seatState.details?.[s.id]?.scannedAt ? 'scanned' : 'booked';
      else if (locked.has(s.id)) st[s.id] = 'locked';
      else st[s.id] = 'closed';
    }
  }
  vMap.setStatuses(st);
}

async function onSeatTap(id, el) {
  const d = seatState.details?.[id];
  if (!d) return toast(el.dataset.st === 'locked' ? `${id} is reserved for guests` : `${id} is empty`);
  const v = await modal({
    title: `Seat ${id}`,
    html: `<div class="kv">
      <span>Name</span><b>${esc(d.name)}</b>
      <span>Department</span><b>${esc(d.dept || '—')}, sem ${esc(d.sem || '—')}</b>
      <span>Phone</span><b>${esc(d.phone || '—')}</b>
      <span>Status</span><b>${d.scannedAt ? `Entered at ${fmtTime(d.scannedAt)}` : 'Not scanned yet'}</b>
    </div>`,
    actions: d.scannedAt ? [{ label: 'Close', value: null, cls: 'btn-spot' }] : [{ label: 'Close', value: null, cls: 'btn-ghost' }, { label: 'Check in', value: 'in', cls: 'btn-green' }],
  });
  if (v === 'in') manualCheckIn(d.bookingId, d.name, id);
}
