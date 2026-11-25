/**
 * Zoomable, draggable seat map.
 *  - Mouse: scroll to zoom, drag to move, click to pick
 *  - Phone: pinch to zoom, drag with one finger, tap to pick
 *    (when the map is zoomed far out, the first tap zooms in on that spot so tiny seats are easy to hit)
 */
class SeatMap {
  constructor(root, { layout, onSeatTap, mode = 'student' }) {
    this.root = root;
    this.layout = layout;
    this.onSeatTap = onSeatTap || (() => {});
    this.U = 32;       // horizontal pitch per seat column
    this.SZ = 28;      // chair size
    this.RH = 40;      // row pitch
    this.LW = 50;      // left space for row letters
    this.TOP = 96;     // space for the stage
    this.s = 1; this.tx = 0; this.ty = 0;
    this.minS = 0.2; this.maxS = 3;
    this.pointers = new Map();
    this.dragged = false;
    this.userMoved = false;
    this.seatEls = new Map();

    root.classList.add('seatmap', mode);
    if (mode !== 'student') root.classList.add('staff');
    root.innerHTML = `
      <div class="sm-viewport"><div class="sm-canvas"></div></div>
      <div class="sm-controls">
        <button type="button" data-z="in" aria-label="Zoom in">+</button>
        <button type="button" data-z="out" aria-label="Zoom out">&minus;</button>
        <button type="button" data-z="fit" aria-label="Reset view">&#8634;</button>
      </div>
      <div class="sm-hint">Pinch or scroll to zoom, drag to move</div>`;
    this.vp = root.querySelector('.sm-viewport');
    this.canvas = root.querySelector('.sm-canvas');
    this.hint = root.querySelector('.sm-hint');

    this._build();
    this._bind();
    requestAnimationFrame(() => this.fit());
    if ('ResizeObserver' in window) {
      new ResizeObserver(() => { if (!this.userMoved) this.fit(); }).observe(this.vp);
    }
    setTimeout(() => this.hint.classList.add('fade'), 4500);
  }

  _build() {
    const frag = document.createDocumentFragment();
    let maxX = 0;
    let minCenter = Infinity;
    let maxCenter = 0;
    this.layout.rows.forEach((row, i) => {
      const y = this.TOP + i * this.RH;
      const lab = document.createElement('div');
      lab.className = 'sm-row-label';
      lab.textContent = row.label;
      lab.style.left = '6px';
      lab.style.top = y + 'px';
      frag.appendChild(lab);

      row.seats.forEach((seat) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'seat closed';
        b.style.left = this.LW + seat.x * this.U + 'px';
        b.style.top = y + 'px';
        b.textContent = seat.n;
        b.dataset.id = seat.id;
        b.setAttribute('aria-label', `Seat ${seat.id}`);
        this.seatEls.set(seat.id, b);
        frag.appendChild(b);
        maxX = Math.max(maxX, seat.x);
        if (row.seats.length >= 19 && row.seats.length <= 20 && row.seats[0].x > 10) {
          minCenter = Math.min(minCenter, seat.x);
          maxCenter = Math.max(maxCenter, seat.x);
        }
      });
    });

    // Stage above the centre block, with a soft light beam falling on the front rows
    const sx = minCenter === Infinity ? 11 : minCenter;
    const ex = maxCenter || 30;
    const stageLeft = this.LW + sx * this.U;
    const stageW = (ex - sx) * this.U + this.SZ;
    const beam = document.createElement('div');
    beam.className = 'sm-beam';
    beam.style.left = stageLeft - 60 + 'px';
    beam.style.width = stageW + 120 + 'px';
    beam.style.top = '50px';
    beam.style.height = this.RH * 4 + 'px';
    frag.prepend(beam);
    const stage = document.createElement('div');
    stage.className = 'sm-stage';
    stage.style.left = stageLeft + 'px';
    stage.style.width = stageW + 'px';
    stage.style.top = '20px';
    stage.textContent = 'STAGE';
    frag.appendChild(stage);

    this.W = this.LW + maxX * this.U + this.SZ + 30;
    this.H = this.TOP + this.layout.rows.length * this.RH + 16;
    this.canvas.style.width = this.W + 'px';
    this.canvas.style.height = this.H + 'px';
    this.canvas.appendChild(frag);
  }

  /** statuses: { seatId: 'available' | 'selected' | 'booked' | 'locked' | 'closed' | 'mine' | 'scanned' } */
  setStatuses(statuses) {
    for (const [id, el] of this.seatEls) {
      const st = statuses[id] || 'closed';
      if (el.dataset.st !== st) {
        el.dataset.st = st;
        el.className = 'seat ' + st;
      }
    }
  }

  _apply(animate) {
    this.canvas.classList.toggle('animate', !!animate);
    this.canvas.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.s})`;
    if (animate) {
      clearTimeout(this._animT);
      this._animT = setTimeout(() => this.canvas.classList.remove('animate'), 300);
    }
  }

  _clampPan() {
    const r = this.vp.getBoundingClientRect();
    const keep = 80;
    this.tx = Math.min(r.width - keep, Math.max(keep - this.W * this.s, this.tx));
    this.ty = Math.min(r.height - keep, Math.max(keep - this.H * this.s, this.ty));
  }

  fit(animate) {
    const r = this.vp.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const s = Math.min(r.width / this.W, r.height / this.H) * 0.97;
    this.fitS = s;
    this.minS = s * 0.8;
    this.s = s;
    this.tx = (r.width - this.W * s) / 2;
    this.ty = (r.height - this.H * s) / 2;
    this.userMoved = false;
    this._apply(animate);
  }

  zoomAt(px, py, newScale, animate) {
    const s2 = Math.min(this.maxS, Math.max(this.minS, newScale));
    this.tx = px - (px - this.tx) * (s2 / this.s);
    this.ty = py - (py - this.ty) * (s2 / this.s);
    this.s = s2;
    this._clampPan();
    this.userMoved = true;
    this._apply(animate);
  }

  /** Centre the view on a seat (used to show a student's own seat). */
  focusSeat(id, scale = 1.1) {
    const el = this.seatEls.get(id);
    if (!el) return;
    const r = this.vp.getBoundingClientRect();
    const cx = parseFloat(el.style.left) + this.SZ / 2;
    const cy = parseFloat(el.style.top) + this.SZ / 2;
    this.s = Math.min(this.maxS, Math.max(this.minS, scale));
    this.tx = r.width / 2 - cx * this.s;
    this.ty = r.height / 2 - cy * this.s;
    this._clampPan();
    this.userMoved = true;
    this._apply(true);
  }

  _local(e) {
    const r = this.vp.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  _bind() {
    const vp = this.vp;

    this.root.querySelector('.sm-controls').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const r = vp.getBoundingClientRect();
      if (b.dataset.z === 'fit') return this.fit(true);
      this.zoomAt(r.width / 2, r.height / 2, this.s * (b.dataset.z === 'in' ? 1.45 : 1 / 1.45), true);
    });

    vp.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = this._local(e);
      const k = e.ctrlKey ? 0.01 : 0.0015; // ctrlKey = trackpad pinch
      this.zoomAt(p.x, p.y, this.s * Math.exp(-e.deltaY * k));
    }, { passive: false });

    vp.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      this.lastPointerType = e.pointerType;
      this.pointers.set(e.pointerId, this._local(e));
      if (this.pointers.size === 1) {
        this.dragged = false;
        this.start = { ...this._local(e), tx: this.tx, ty: this.ty };
      } else if (this.pointers.size === 2) {
        this.dragged = true;
        this._startPinch();
      }
    });

    const onMove = (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, this._local(e));
      if (this.pointers.size === 1 && this.start) {
        const p = this._local(e);
        const dx = p.x - this.start.x;
        const dy = p.y - this.start.y;
        if (!this.dragged && Math.hypot(dx, dy) > 6) {
          this.dragged = true;
          vp.classList.add('dragging');
        }
        if (this.dragged) {
          this.tx = this.start.tx + dx;
          this.ty = this.start.ty + dy;
          this._clampPan();
          this.userMoved = true;
          this._apply();
        }
      } else if (this.pointers.size === 2 && this.pinch) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        this.s = Math.min(this.maxS, Math.max(this.minS, this.pinch.s0 * (d / this.pinch.d0)));
        this.tx = m.x - this.pinch.cx * this.s;
        this.ty = m.y - this.pinch.cy * this.s;
        this._clampPan();
        this.userMoved = true;
        this._apply();
      }
    };

    const onUp = (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.delete(e.pointerId);
      vp.classList.remove('dragging');
      if (this.pointers.size === 1) {
        // one finger lifted after a pinch: continue panning smoothly from here
        const p = [...this.pointers.values()][0];
        this.start = { x: p.x, y: p.y, tx: this.tx, ty: this.ty };
        this.pinch = null;
      } else if (this.pointers.size === 0) {
        this.pinch = null;
        this.start = null;
      }
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    // Seat taps (ignored if the gesture was a drag/pinch)
    this.canvas.addEventListener('click', (e) => {
      const el = e.target.closest('.seat');
      if (!el) return;
      if (this.dragged) { this.dragged = false; return; }
      const touchLike = this.lastPointerType && this.lastPointerType !== 'mouse';
      if (touchLike && e.detail !== 0 && this.s < 0.75) {
        const r = el.getBoundingClientRect();
        const vr = vp.getBoundingClientRect();
        this.zoomAt(r.left + r.width / 2 - vr.left, r.top + r.height / 2 - vr.top, 1.25, true);
        return;
      }
      this.onSeatTap(el.dataset.id, el);
    });
    this.canvas.addEventListener('keydown', () => { this.dragged = false; });
  }

  _startPinch() {
    const [a, b] = [...this.pointers.values()];
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    this.pinch = {
      d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      s0: this.s,
      cx: (m.x - this.tx) / this.s,
      cy: (m.y - this.ty) / this.s,
    };
  }
}

/** Legend chips with chair icons, reused on every page */
function legendHtml(keys, labels = {}) {
  const all = {
    available: 'Available', selected: 'Selected', booked: 'Booked', locked: 'Reserved',
    closed: 'Opens later', mine: 'Your seat', scanned: 'Checked in',
  };
  const lineStyle = { available: true, closed: true };
  return keys.map((k) => `<span>${chair(k, lineStyle[k] ? 'line' : '')}${labels[k] || all[k]}</span>`).join('');
}
