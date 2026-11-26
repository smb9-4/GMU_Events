/* Admin Global Settings: Manage Seats (Global Locks) + UI Customizations (Login Slides) */

let globalSettings = null;
let globalMap = null;
let draftSlides = [];
let settingsSubTab = 'seats';

function bindGlobalSettings() {
  const tabs = $('settingsTabs');
  if (!tabs) return;
  tabs.addEventListener('click', (e) => {
    const t = e.target.closest('.tab');
    if (t) showSettingsTab(t.dataset.stab);
  });

  $('gLockRowBtn').onclick = () => globalRowAction(true);
  $('gUnlockRowBtn').onclick = () => globalRowAction(false);
  $('gClearAllBtn').onclick = clearAllGlobalSeats;

  $('addSlideBtn').onclick = () => {
    readSlideInputs();
    if (draftSlides.length >= 10) return toast('Maximum 10 slides allowed.', 'err');
    draftSlides.push({
      image: '/img/event-tedx-1.png',
      category: 'University Events',
      title: 'New Highlight.',
      date: 'GM University Campus',
      description: '',
    });
    renderSlidesEditor();
  };

  $('resetSlidesBtn').onclick = async () => {
    const ok = await confirmBox(
      'Reset login slides to default?',
      '<p>This restores the original 4 GM University showcase images and text on the login page.</p>',
      'Reset to default',
      'btn-danger'
    );
    if (!ok) return;
    try {
      const r = await API.put('/api/admin/settings/slides', { reset: true });
      globalSettings.loginSlides = r.loginSlides;
      draftSlides = r.loginSlides.map((s) => ({ ...s }));
      renderSlidesEditor();
      toast('Login slides reset to default', 'ok');
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  $('previewSlidesBtn').onclick = () => {
    readSlideInputs();
    for (let i = 0; i < draftSlides.length; i++) {
      if (!draftSlides[i].image) return toast(`Slide #${i + 1} needs an image.`, 'err');
    }
    openSlidesPreviewModal();
  };
}

async function loadSettings() {
  try {
    globalSettings = await API.get('/api/admin/settings');
    draftSlides = (globalSettings.loginSlides || []).map((s) => ({ ...s }));

    $('gRowSelect').innerHTML = globalSettings.layout.rows
      .map((r) => `<option value="${r.label}">Row ${r.label}</option>`)
      .join('');
    $('gSeatLegend').innerHTML = legendHtml(['available', 'locked']);

    const mapHost = $('globalSeatMap');
    mapHost.innerHTML = '';
    mapHost.className = '';
    globalMap = new SeatMap(mapHost, {
      layout: globalSettings.layout,
      onSeatTap: onGlobalSeatTap,
      mode: 'admin',
    });

    renderGlobalSeats();
    renderSlidesEditor();
    showSettingsTab(settingsSubTab);
  } catch (e) {
    toast(e.message, 'err');
  }
}

function showSettingsTab(tab) {
  settingsSubTab = tab;
  document.querySelectorAll('#settingsTabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.stab === tab));
  ['seats', 'ui'].forEach((x) => $('stab-' + x).classList.toggle('hidden', x !== tab));
  if (tab === 'seats' && globalMap) {
    requestAnimationFrame(() => { if (!globalMap.userMoved) globalMap.fit(); });
  }
}

function renderGlobalSeats() {
  if (!globalSettings || !globalMap) return;
  const locked = new Set(globalSettings.globalLockedSeats || []);
  const st = {};
  for (const row of globalSettings.layout.rows) {
    for (const seat of row.seats) {
      st[seat.id] = locked.has(seat.id) ? 'locked' : 'available';
    }
  }
  globalMap.setStatuses(st);
  const count = locked.size;
  $('gLockCountPill').textContent = count ? `${count} ${count === 1 ? 'seat' : 'seats'} locked globally` : 'No seats locked globally';
  $('gLockCountPill').className = `pill ${count ? 'red' : 'green'}`;
}

async function onGlobalSeatTap(id, el) {
  const lock = el.dataset.st !== 'locked';
  try {
    const r = await API.post('/api/admin/settings/seats', { seatIds: [id], lock });
    globalSettings.globalLockedSeats = r.globalLockedSeats;
    renderGlobalSeats();
    toast(`${id} ${lock ? 'locked across all events' : 'unlocked globally'}`, 'ok');
  } catch (e) {
    toast(e.message, 'err');
  }
}

async function globalRowAction(lock) {
  const row = $('gRowSelect').value;
  try {
    const r = await API.post('/api/admin/settings/seats', { row, lock });
    globalSettings.globalLockedSeats = r.globalLockedSeats;
    renderGlobalSeats();
    toast(`Row ${row} ${lock ? 'locked across all events' : 'unlocked globally'}`, 'ok');
  } catch (e) {
    toast(e.message, 'err');
  }
}

async function clearAllGlobalSeats() {
  if (!globalSettings?.globalLockedSeats?.length) return toast('No globally locked seats to clear.');
  const ok = await confirmBox(
    'Unlock all globally locked seats?',
    `<p>All ${globalSettings.globalLockedSeats.length} maintenance/damaged seat locks will be removed across all events.</p>`,
    'Unlock all',
    'btn-spot'
  );
  if (!ok) return;
  try {
    const r = await API.post('/api/admin/settings/seats', { clearAll: true });
    globalSettings.globalLockedSeats = r.globalLockedSeats;
    renderGlobalSeats();
    toast('All global seat locks cleared', 'ok');
  } catch (e) {
    toast(e.message, 'err');
  }
}

/* ---------------- UI Customizations (Login Slideshow) ---------------- */
function readSlideInputs() {
  draftSlides = draftSlides.map((s, i) => ({
    ...s,
    category: document.querySelector(`[data-sl-cat="${i}"]`)?.value || '',
    title: document.querySelector(`[data-sl-title="${i}"]`)?.value || '',
    date: document.querySelector(`[data-sl-date="${i}"]`)?.value || '',
    description: document.querySelector(`[data-sl-desc="${i}"]`)?.value || '',
    position: document.querySelector(`[data-sl-pos="${i}"]`)?.value || 'center',
    hoverEffect: document.querySelector(`[data-sl-hover="${i}"]`)?.value || 'zoom',
    pinned: Boolean(document.querySelector(`[data-sl-pin="${i}"]`)?.checked),
  }));
}

function renderSlidesEditor() {
  const box = $('slidesEditorList');
  if (!box) return;
  box.innerHTML = draftSlides.map((s, i) => `
    <div class="wizard-item-card" data-sl-card="${i}">
      <div class="wizard-item-head">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span class="pill spot">Slide #${i + 1}</span>
          <label class="check" style="margin:0;font-size:13px">
            <input type="checkbox" data-sl-pin="${i}" ${s.pinned ? 'checked' : ''}> Pin as primary login background
          </label>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${i > 0 ? `<button type="button" class="btn sm" data-sl-up="${i}">Move Up</button>` : ''}
          ${i < draftSlides.length - 1 ? `<button type="button" class="btn sm" data-sl-down="${i}">Move Down</button>` : ''}
          ${draftSlides.length > 1 ? `<button type="button" class="btn sm btn-danger" data-sl-rm="${i}">Remove</button>` : ''}
        </div>
      </div>

      <div style="display:grid;grid-template-columns:220px minmax(0,1fr);gap:16px;align-items:start" class="slide-editor-grid">
        <div>
          <img src="${esc(s.image)}" alt="Slide ${i + 1}" style="width:100%;aspect-ratio:16/10;object-fit:cover;object-position:${esc(s.position || 'center')};border-radius:14px;border:1px solid var(--line-2);background:#1a060b;display:block">
          <label class="btn sm block" style="margin-top:8px;cursor:pointer">
            Change Image
            <input type="file" accept="image/png,image/jpeg,image/webp" data-sl-file="${i}" class="hidden">
          </label>
        </div>
        <div style="display:grid;gap:10px">
          <div class="row2">
            <div class="field" style="margin-bottom:0">
              <label>Category label</label>
              <input class="input" data-sl-cat="${i}" value="${esc(s.category)}" placeholder="e.g. TEDx & Conferences">
            </div>
            <div class="field" style="margin-bottom:0">
              <label>Subtitle / Venue / Date</label>
              <input class="input" data-sl-date="${i}" value="${esc(s.date)}" placeholder="e.g. GM University Auditorium">
            </div>
          </div>
          <div class="row2">
            <div class="field" style="margin-bottom:0">
              <label>Image position / focus</label>
              <select class="input" data-sl-pos="${i}">
                <option value="center" ${(s.position || 'center') === 'center' ? 'selected' : ''}>Center</option>
                <option value="top" ${s.position === 'top' ? 'selected' : ''}>Top (Faces / Stage)</option>
                <option value="bottom" ${s.position === 'bottom' ? 'selected' : ''}>Bottom</option>
                <option value="left" ${s.position === 'left' ? 'selected' : ''}>Left</option>
                <option value="right" ${s.position === 'right' ? 'selected' : ''}>Right</option>
              </select>
            </div>
            <div class="field" style="margin-bottom:0">
              <label>Hover effect on login page</label>
              <select class="input" data-sl-hover="${i}">
                <option value="zoom" ${(s.hoverEffect || 'zoom') === 'zoom' ? 'selected' : ''}>Zoom &amp; Highlight on hover</option>
                <option value="brighten" ${s.hoverEffect === 'brighten' ? 'selected' : ''}>Brighten image on hover</option>
                <option value="none" ${s.hoverEffect === 'none' ? 'selected' : ''}>Static (no hover motion)</option>
              </select>
            </div>
          </div>
          <div class="field" style="margin-bottom:0">
            <label>Headline (use Enter for line break)</label>
            <textarea class="input" style="min-height:64px" data-sl-title="${i}" placeholder="Ideas worth&#10;sharing.">${esc(String(s.title || '').replace(/<br\s*\/?>/gi, '\n'))}</textarea>
          </div>
          <div class="field" style="margin-bottom:0">
            <label>Description</label>
            <input class="input" data-sl-desc="${i}" value="${esc(s.description)}" placeholder="Short sentence shown below the headline">
          </div>
        </div>
      </div>
    </div>`).join('');

  box.querySelectorAll('[data-sl-pin]').forEach((chk) => {
    chk.onchange = () => {
      const idx = Number(chk.dataset.slPin);
      const checked = chk.checked;
      readSlideInputs();
      draftSlides.forEach((sl, j) => { sl.pinned = checked && j === idx; });
      renderSlidesEditor();
    };
  });

  box.querySelectorAll('[data-sl-pos]').forEach((sel) => {
    sel.onchange = () => { readSlideInputs(); renderSlidesEditor(); };
  });

  box.querySelectorAll('[data-sl-file]').forEach((inp) => {
    inp.onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      readSlideInputs();
      try {
        draftSlides[Number(inp.dataset.slFile)].image = await resizeImage(f, 1600);
        renderSlidesEditor();
      } catch (ex) {
        toast(ex.message, 'err');
      }
    };
  });

  box.querySelectorAll('[data-sl-up]').forEach((b) => {
    b.onclick = () => {
      readSlideInputs();
      const idx = Number(b.dataset.slUp);
      [draftSlides[idx - 1], draftSlides[idx]] = [draftSlides[idx], draftSlides[idx - 1]];
      renderSlidesEditor();
    };
  });

  box.querySelectorAll('[data-sl-down]').forEach((b) => {
    b.onclick = () => {
      readSlideInputs();
      const idx = Number(b.dataset.slDown);
      [draftSlides[idx], draftSlides[idx + 1]] = [draftSlides[idx + 1], draftSlides[idx]];
      renderSlidesEditor();
    };
  });

  box.querySelectorAll('[data-sl-rm]').forEach((b) => {
    b.onclick = () => {
      readSlideInputs();
      draftSlides.splice(Number(b.dataset.slRm), 1);
      renderSlidesEditor();
    };
  });
}

function formatSlideTitleHtml(t) {
  return esc(String(t || '').replace(/<br\s*\/?>/gi, '\n')).replace(/\n/g, '<br>');
}

function openSlidesPreviewModal() {
  let idx = 0;
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" style="max-width:860px;width:100%">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px">
        <div>
          <h3>Login Page Slideshow Preview</h3>
          <p class="muted small">Inspect every slide before permitting it to go live on the login page.</p>
        </div>
        <span class="pill spot" id="pvCounter">Slide 1 of ${draftSlides.length}</span>
      </div>

      <div class="pv-showcase" style="position:relative;border-radius:20px;overflow:hidden;border:1px solid var(--line-2);height:380px;background:#14050a">
        <div id="pvBg" style="position:absolute;inset:0;background-size:cover;background-position:center;transition:background-image .3s ease"></div>
        <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(20,5,10,.35) 0%,rgba(20,5,10,.25) 45%,rgba(20,5,10,.92) 100%)"></div>
        <div style="position:relative;z-index:2;height:100%;display:flex;flex-direction:column;justify-content:flex-end;padding:28px">
          <p id="pvCat" style="font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--spot);margin-bottom:8px"></p>
          <h2 id="pvTitle" style="font-family:var(--display);font-weight:900;font-size:44px;line-height:.95;color:#fff"></h2>
          <p id="pvDate" style="margin-top:10px;font-size:13px;color:#e6dcd6"></p>
          <p id="pvDesc" style="margin-top:8px;font-size:14.5px;color:#d0c4bf;max-width:52ch"></p>
        </div>
        <div style="position:absolute;right:18px;bottom:18px;z-index:3;display:flex;gap:8px">
          <button type="button" class="showcase-arrow" id="pvPrev" aria-label="Previous">&#8592;</button>
          <button type="button" class="showcase-arrow" id="pvNext" aria-label="Next">&#8594;</button>
        </div>
      </div>

      <div class="modal-actions" style="margin-top:18px">
        <button type="button" class="btn btn-ghost" id="pvBackBtn">Back to Edit</button>
        <button type="button" class="btn btn-spot" id="pvPublishBtn">Permit &amp; Publish to Login Page</button>
      </div>
    </div>`;

  const renderSlide = () => {
    const s = draftSlides[idx];
    back.querySelector('#pvCounter').textContent = `Slide ${idx + 1} of ${draftSlides.length}${s.pinned ? ' (Pinned)' : ''}`;
    const bgEl = back.querySelector('#pvBg');
    bgEl.style.backgroundImage = `url("${s.image}")`;
    bgEl.style.backgroundPosition = s.position || 'center';
    back.querySelector('#pvCat').textContent = s.category || '';
    back.querySelector('#pvTitle').innerHTML = formatSlideTitleHtml(s.title);
    back.querySelector('#pvDate').textContent = s.date || '';
    back.querySelector('#pvDesc').textContent = s.description || '';
  };

  back.querySelector('#pvPrev').onclick = () => { idx = (idx - 1 + draftSlides.length) % draftSlides.length; renderSlide(); };
  back.querySelector('#pvNext').onclick = () => { idx = (idx + 1) % draftSlides.length; renderSlide(); };
  back.querySelector('#pvBackBtn').onclick = () => back.remove();
  back.addEventListener('click', (e) => { if (e.target === back) back.remove(); });

  back.querySelector('#pvPublishBtn').onclick = async () => {
    const btn = back.querySelector('#pvPublishBtn');
    btn.disabled = true;
    btn.textContent = 'Publishing…';
    try {
      const r = await API.put('/api/admin/settings/slides', { slides: draftSlides });
      globalSettings.loginSlides = r.loginSlides;
      draftSlides = r.loginSlides.map((s) => ({ ...s }));
      renderSlidesEditor();
      back.remove();
      toast('Login slideshow updated!', 'ok');
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Permit & Publish to Login Page';
      toast(e.message, 'err');
    }
  };

  renderSlide();
  document.body.appendChild(back);
}
