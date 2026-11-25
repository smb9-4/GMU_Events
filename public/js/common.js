/* Shared helpers used by every page */

const API = {
  async req(method, url, body) {
    const opts = { method, credentials: 'same-origin', headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(url, opts);
    } catch {
      throw new Error('No internet connection. Check your network and try again.');
    }
    let data = null;
    try { data = await res.json(); } catch { /* empty body */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || `Request failed (${res.status})`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  },
  get(url) { return this.req('GET', url); },
  post(url, body = {}) { return this.req('POST', url, body); },
  put(url, body = {}) { return this.req('PUT', url, body); },
  del(url) { return this.req('DELETE', url); },
};

function homeFor(role) {
  if (role === 'admin') return '/admin.html';
  if (role === 'volunteer') return '/volunteer.html';
  return '/student.html';
}

/** Makes sure someone is logged in (and has one of the given roles). Redirects otherwise. */
async function requireUser(roles) {
  try {
    const { user } = await API.get('/api/auth/me');
    if (roles && !roles.includes(user.role)) {
      location.replace(homeFor(user.role));
      return null;
    }
    renderUserBox(user);
    return user;
  } catch {
    location.replace('/?next=' + encodeURIComponent(location.pathname + location.search));
    return null;
  }
}

function initials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}
function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || 'there';
}

function renderUserBox(user) {
  const box = document.getElementById('userBox');
  if (!box) return;
  box.innerHTML = `
    <div class="who"><b>${esc(user.name)}</b><span>${esc(user.role)}</span></div>
    <span class="avatar" aria-hidden="true">${esc(initials(user.name))}</span>
    <button class="icon-btn" id="logoutBtn" title="Log out" aria-label="Log out">${ICONS.logout}</button>`;
  document.getElementById('logoutBtn').onclick = async () => {
    try { await API.post('/api/auth/logout'); } catch { /* ignore */ }
    location.href = '/';
  };
}

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const TZ = 'Asia/Kolkata';
function fmtDate(d, withWeekday) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', {
    timeZone: TZ, weekday: withWeekday ? 'short' : undefined,
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  });
}
function fmtDay(d) {
  return new Date(d).toLocaleDateString('en-IN', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
}
function fmtClock(d) {
  return new Date(d).toLocaleTimeString('en-IN', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true });
}
const fmtTime = fmtClock;
function timeAgo(d) {
  const s = Math.max(1, Math.round((Date.now() - new Date(d)) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24); return days === 1 ? 'yesterday' : `${days} days ago`;
}
function greeting() {
  const h = Number(new Date().toLocaleString('en-IN', { timeZone: TZ, hour: 'numeric', hour12: false }));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function toast(msg, type = '') {
  let host = document.getElementById('toasts');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toasts';
    document.body.appendChild(host);
  }
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  host.appendChild(t);
  setTimeout(() => t.remove(), 3600);
}

/** Modal. actions: [{label, value, cls}] → resolves with the clicked value (or null when closed). */
function modal({ title, html, actions = [{ label: 'Close', value: null }] }) {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
      ${title ? `<h3>${esc(title)}</h3>` : ''}
      <div class="modal-body">${html || ''}</div>
      <div class="actions">${actions.map((a, i) => `<button class="btn ${a.cls || ''}" data-i="${i}">${esc(a.label)}</button>`).join('')}</div>
    </div>`;
    const close = (v) => { back.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    back.addEventListener('click', (e) => {
      if (e.target === back) return close(null);
      const b = e.target.closest('button[data-i]');
      if (b) close(actions[+b.dataset.i].value);
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(back);
    const primary = back.querySelector('.btn-spot, .btn-green, .btn-red');
    if (primary) primary.focus();
  });
}

function confirmBox(title, html, okLabel = 'Confirm', okCls = 'btn-spot') {
  return modal({ title, html, actions: [{ label: 'Cancel', value: false, cls: 'btn-ghost' }, { label: okLabel, value: true, cls: okCls }] });
}

function posterUrl(ev) {
  return ev.hasPoster ? `/api/events/${ev.id}/poster?v=${ev.posterVersion || 1}` : null;
}
function posterHtml(ev, cls = 'bill-poster') {
  const url = posterUrl(ev);
  if (url) return `<img class="${cls}" src="${url}" alt="${esc(ev.title)} poster" loading="lazy">`;
  return `<div class="${cls} poster-fallback" aria-label="${esc(ev.title)}"><img src="/img/logo.png" alt="GM University logo"></div>`;
}

/** Title with the "x" of TEDx in red, when present */
function tedTitle(title) {
  return esc(title).replace(/TEDx/i, (m) => `${m.slice(0, 3)}<span class="x">${m.slice(3)}</span>`);
}

function chair(status, extra = '') {
  return `<i class="chair ${status} ${extra}" aria-hidden="true"></i>`;
}

/** A row of chairs showing how full the hall is. */
function houseMeter(counts, n = 20) {
  const total = Math.max(1, counts.total);
  const taken = Math.round(((counts.booked + counts.locked) / total) * n);
  let html = '';
  for (let i = 0; i < n; i++) html += chair(i < taken ? 'booked' : 'available', i < taken ? '' : 'line');
  return `<div class="house-meter" role="img" aria-label="${counts.available} of ${counts.total} seats free">${html}</div>`;
}

/** Live countdown to an event; returns a stop function. */
function startCountdown(el, date) {
  const target = new Date(date).getTime();
  const tick = () => {
    const diff = target - Date.now();
    if (diff <= 0) {
      const ended = Date.now() - target > 4 * 3600e3;
      el.innerHTML = ended
        ? '<div class="cd-live" style="color:var(--muted)">This event has ended</div>'
        : '<div class="cd-live">Happening now</div><div class="cd-caption">Show your QR at the entrance</div>';
      clearInterval(t);
      return;
    }
    const d = Math.floor(diff / 864e5);
    const h = Math.floor((diff % 864e5) / 36e5);
    const m = Math.floor((diff % 36e5) / 6e4);
    const s = Math.floor((diff % 6e4) / 1e3);
    const pad = (x) => String(x).padStart(2, '0');
    el.innerHTML = `<div class="countdown" role="timer" aria-label="Time until the event">
      <div class="cd"><b>${d}</b><span>${d === 1 ? 'day' : 'days'}</span></div>
      <div class="cd"><b>${pad(h)}</b><span>hours</span></div>
      <div class="cd"><b>${pad(m)}</b><span>minutes</span></div>
      <div class="cd"><b>${pad(s)}</b><span>seconds</span></div>
    </div>`;
  };
  tick();
  const t = setInterval(tick, 1000);
  return () => clearInterval(t);
}

/** Tiny SVG map of the real hall, coloured by seat status. */
function miniMapSvg(layout, statusOf) {
  const colors = { booked: '#6e6468', scanned: '#2dd4bf', locked: '#3f3639', available: '#f4ece4', closed: 'rgba(244,236,228,.22)', mine: '#e62b1e' };
  let maxX = 0;
  let rects = '';
  layout.rows.forEach((row, i) => {
    row.seats.forEach((s) => {
      maxX = Math.max(maxX, s.x);
      rects += `<rect x="${(s.x * 10 + 2).toFixed(1)}" y="${i * 11 + 14}" width="8" height="8" fill="${colors[statusOf(s.id, row.label)] || colors.closed}"/>`;
    });
  });
  const w = maxX * 10 + 12;
  const h = layout.rows.length * 11 + 16;
  const stage = `<path d="M${w * 0.28} 2 H${w * 0.72} Q${w * 0.7} 10 ${w / 2} 10 Q${w * 0.3} 10 ${w * 0.28} 2Z" fill="#ffd75e"/>`;
  return `<svg class="minimap" viewBox="0 0 ${w} ${h}" role="img" aria-label="Hall map">${stage}${rects}</svg>`;
}

function debounce(fn, ms = 250) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/** Natural seat sort: A2 before A10 */
function seatCompare(a, b) {
  const ra = a.match(/^([A-Z])(\d+)$/) || [];
  const rb = b.match(/^([A-Z])(\d+)$/) || [];
  return (ra[1] || '').localeCompare(rb[1] || '') || (+ra[2] || 0) - (+rb[2] || 0);
}

function downloadBlob(filename, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function downloadCSV(filename, rows) {
  const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  downloadBlob(filename, new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
}

/** Calendar file so students can add the event to their phone calendar. */
function downloadICS({ title, venue, startsAt, seatId }) {
  const start = new Date(startsAt);
  const end = new Date(start.getTime() + 3 * 3600e3);
  const f = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GMU TEDx//Booking//EN', 'BEGIN:VEVENT',
    `UID:${f(start)}-${seatId}@gmu-tedx`, `DTSTAMP:${f(new Date())}`, `DTSTART:${f(start)}`, `DTEND:${f(end)}`,
    `SUMMARY:${title} (Seat ${seatId})`, `LOCATION:${venue}`, 'DESCRIPTION:Show your QR ticket at the entrance.',
    'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', 'DESCRIPTION:Reminder', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  downloadBlob('tedx-gmu.ics', new Blob([ics], { type: 'text/calendar' }));
}

/** A short burst of confetti in TEDx colours — used once, right after booking. */
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.createElement('canvas');
  c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:300';
  document.body.appendChild(c);
  const ctx = c.getContext('2d');
  const W = (c.width = innerWidth * devicePixelRatio);
  const H = (c.height = innerHeight * devicePixelRatio);
  const cols = ['#ffd75e', '#e62b1e', '#f4ece4', '#ffb703'];
  const ps = Array.from({ length: 140 }, () => ({
    x: W / 2, y: H * 0.35, vx: (Math.random() - 0.5) * 26, vy: -Math.random() * 26 - 6,
    r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3, w: 8 + Math.random() * 8, h: 4 + Math.random() * 6,
    c: cols[(Math.random() * cols.length) | 0],
  }));
  let frames = 0;
  (function draw() {
    ctx.clearRect(0, 0, W, H);
    ps.forEach((p) => {
      p.vy += 0.6; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
    });
    if (++frames < 150) requestAnimationFrame(draw); else c.remove();
  })();
}

/** Turns a .tabs element into an app-style bottom bar on phones. */
function useAppNav(tabsEl) {
  tabsEl.classList.add('app-nav');
  document.body.classList.add('has-app-nav');
}

function setupSharedControls() {
  const backIcon = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>';

  const topbar = document.querySelector('.topbar');
  if (topbar && !topbar.querySelector('.back-btn')) {
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'icon-btn back-btn';
    back.setAttribute('aria-label', 'Go back');
    back.innerHTML = backIcon;
    back.addEventListener('click', () => {
      if (history.length > 1) history.back();
      else location.href = '/';
    });
    const brand = topbar.querySelector('.brand');
    if (brand) brand.insertAdjacentElement('afterend', back);
    else topbar.prepend(back);
  }

  const eyeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="2.5"/></svg>';

  document.querySelectorAll('input[type="password"]').forEach((input) => {
    if (input.closest('.password-wrap')) return;
    const wrap = document.createElement('div');
    wrap.className = 'password-wrap';
    input.before(wrap);
    wrap.appendChild(input);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'password-toggle';
    button.setAttribute('aria-label', 'Show password');
    button.innerHTML = eyeIcon;
    button.addEventListener('click', () => {
      const visible = input.type === 'text';
      input.type = visible ? 'password' : 'text';
      button.setAttribute('aria-label', visible ? 'Show password' : 'Hide password');
    });
    wrap.appendChild(button);
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupSharedControls);
else setupSharedControls();

const ICONS = {
  pin: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 22s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  clock: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  calendar: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  logout: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4"/></svg>',
  stage: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h18M5 4v4a7 7 0 0 0 14 0V4M7 20h10M12 15v5"/></svg>',
  ticket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z"/><path d="M14 6v12" stroke-dasharray="2 2"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/></svg>',
  badge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="3"/><circle cx="12" cy="10" r="3"/><path d="M8 17a4 4 0 0 1 8 0"/></svg>',
  scan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M4 12h16"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg>',
  seats: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="2" width="12" height="11.5" rx="3"/><rect x="1.8" y="9" width="3.6" height="10.5" rx="1.6"/><rect x="18.6" y="9" width="3.6" height="10.5" rx="1.6"/><rect x="6.2" y="14.6" width="11.6" height="4.9" rx="1.4"/><rect x="7" y="19.5" width="2" height="2.8" rx=".5"/><rect x="15" y="19.5" width="2" height="2.8" rx=".5"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
};
