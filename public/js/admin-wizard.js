/* Multi-step Create Event Wizard */

const WIZARD_STAGES = [
  { id: 1, title: 'About Event' },
  { id: 2, title: 'Speakers & Guests' },
  { id: 3, title: 'Event Schedule' },
  { id: 4, title: 'Participation' },
  { id: 5, title: 'Organizer Information' },
];

const WIZARD_CATEGORIES = [
  'TEDx',
  'Seminar',
  'Workshop',
  'Conference',
  'Guest Lecture',
  'Hackathon',
  'Cultural',
  'Technical Symposium',
  'Other',
];

const WIZARD_DEPTS = [
  'CSE',
  'CSE (Data Science)',
  'CSE (AI & ML)',
  'ISE',
  'ECE',
  'EEE',
  'Mechanical',
  'Civil',
  'MBA',
  'MCA',
  'BCA',
  'BBA',
  'B.Com',
];

const WIZARD_SEMS = ['1', '2', '3', '4', '5', '6', '7', '8'];

const AUDIENCE_LABELS = {
  all: 'All students',
  departments: 'Specific departments',
  semesters: 'Specific semesters / years',
  faculty_students: 'Faculty and students',
  custom: 'Custom eligibility',
};

const DRAFT_KEY = 'gmu_tedx_create_event_draft_v1';

function createDefaultWizardState() {
  return {
    stage: 1, // 1..5, or 6 for Review & Confirm
    maxVisited: 1,
    about: {
      title: 'TEDx GMU',
      tagline: '',
      category: 'TEDx',
      venue: 'Hallama Auditorium',
      startsAt: toLocalInput(null),
      description: '',
      overview: '',
      poster: '',
      highlights: [],
    },
    speakers: [],
    schedule: [],
    participation: {
      audienceType: 'all',
      allDepartments: true,
      departments: [],
      allSemesters: true,
      semesters: [],
      customEligibility: '',
    },
    organizer: {
      department: '',
      facultyCoordinator: '',
      studentCoordinator: '',
      contactPhone: '',
      contactEmail: '',
    },
    config: {
      published: true,
      bookingOpen: true,
      sequentialRows: true,
      guestRowA: true,
    },
  };
}

function loadWizardDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return createDefaultWizardState();
    const parsed = JSON.parse(raw);
    const base = createDefaultWizardState();
    return {
      ...base,
      ...parsed,
      about: { ...base.about, ...(parsed.about || {}) },
      participation: { ...base.participation, ...(parsed.participation || {}) },
      organizer: { ...base.organizer, ...(parsed.organizer || {}) },
      config: { ...base.config, ...(parsed.config || {}) },
      speakers: Array.isArray(parsed.speakers) ? parsed.speakers : [],
      schedule: Array.isArray(parsed.schedule) ? parsed.schedule : [],
    };
  } catch {
    return createDefaultWizardState();
  }
}

function saveWizardDraft(state) {
  try {
    // Store draft safely; if images make it exceed quota, retry without base64 photos
    localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
  } catch {
    try {
      const slim = {
        ...state,
        about: { ...state.about, poster: '' },
        speakers: state.speakers.map((s) => ({ ...s, photo: '' })),
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(slim));
    } catch { /* ignore storage quota errors */ }
  }
}

function clearWizardDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}

function formatEligibilitySummary(p) {
  const base = AUDIENCE_LABELS[p.audienceType] || 'All students';
  const parts = [base];
  if (p.allDepartments) parts.push('All departments');
  else if (p.departments.length) parts.push(`Depts: ${p.departments.join(', ')}`);
  if (p.allSemesters) parts.push('All semesters');
  else if (p.semesters.length) parts.push(`Sem: ${p.semesters.join(', ')}`);
  if (p.audienceType === 'custom' && p.customEligibility.trim()) {
    parts.push(p.customEligibility.trim());
  }
  return parts.join(' · ');
}

function stateFromEvent(ev) {
  const base = createDefaultWizardState();
  return {
    ...base,
    stage: 1,
    maxVisited: 5,
    about: {
      title: ev.title || '',
      tagline: ev.tagline || '',
      category: ev.category || 'TEDx',
      venue: ev.venue || 'Hallama Auditorium',
      startsAt: toLocalInput(ev.startsAt),
      description: ev.description || '',
      overview: ev.overview || '',
      poster: '',
      hasPoster: Boolean(ev.hasPoster),
      removePoster: false,
      highlights: Array.isArray(ev.highlights) ? ev.highlights.map((h) => ({ ...h })) : [],
    },
    speakers: Array.isArray(ev.speakers) ? ev.speakers.map((s) => ({ ...s })) : [],
    schedule: Array.isArray(ev.schedule) ? ev.schedule.map((s) => ({ ...s })) : [],
    participation: { ...base.participation, ...(ev.participation || {}) },
    organizer: { ...base.organizer, ...(ev.organizer || {}) },
    config: {
      published: Boolean(ev.published),
      bookingOpen: Boolean(ev.bookingOpen),
      sequentialRows: Boolean(ev.sequentialRows),
      guestRowA: true,
    },
  };
}

function openCreateWizard(host, onCreated, onCancel, existingEvent = null) {
  const isEdit = Boolean(existingEvent);
  let state = isEdit ? stateFromEvent(existingEvent) : loadWizardDraft();
  let submitting = false;

  host.className = 'wizard-shell';
  render();

  function persistDraft() {
    if (!isEdit) saveWizardDraft(state);
  }

  function setStage(nextStage) {
    state.stage = nextStage;
    if (nextStage > state.maxVisited) state.maxVisited = nextStage;
    persistDraft();
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderTracker() {
    const activeIdx = Math.min(state.stage, 5) - 1;
    const fillPct = state.stage > 5 ? 100 : (activeIdx / 4) * 100;
    return `
      <div class="wizard-tracker-wrap" aria-label="Event creation progress">
        <div class="wizard-tracker">
          <div class="wizard-track-line"><div class="wizard-track-fill" style="width:${fillPct}%"></div></div>
          ${WIZARD_STAGES.map((st) => {
            const isDone = state.stage > st.id;
            const isActive = state.stage === st.id;
            const isClickable = st.id <= state.maxVisited && !submitting;
            const cls = [
              'wizard-step',
              isDone ? 'done' : isActive ? 'active' : 'upcoming',
              isClickable ? 'clickable' : '',
            ].filter(Boolean).join(' ');
            return `
              <button type="button" class="${cls}" data-goto-stage="${st.id}" ${isClickable ? '' : 'disabled'}>
                <span class="wizard-dot">${isDone ? '✓' : st.id}</span>
                <span class="wizard-step-label">${esc(st.title)}</span>
              </button>`;
          }).join('')}
        </div>
      </div>`;
  }

  function render() {
    let stageHtml = '';
    if (state.stage === 1) stageHtml = renderStage1();
    else if (state.stage === 2) stageHtml = renderStage2();
    else if (state.stage === 3) stageHtml = renderStage3();
    else if (state.stage === 4) stageHtml = renderStage4();
    else if (state.stage === 5) stageHtml = renderStage5();
    else stageHtml = renderReview();

    host.innerHTML = `${renderTracker()}<div class="wizard-card">${stageHtml}</div>`;
    wireCommon();
    if (state.stage === 1) wireStage1();
    else if (state.stage === 2) wireStage2();
    else if (state.stage === 3) wireStage3();
    else if (state.stage === 4) wireStage4();
    else if (state.stage === 5) wireStage5();
    else wireReview();
  }

  function showErr(msg) {
    const err = host.querySelector('[data-wiz-err]');
    if (!err) return;
    if (!msg) {
      err.classList.add('hidden');
      err.textContent = '';
      return;
    }
    err.textContent = msg;
    err.classList.remove('hidden');
    err.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function wireCommon() {
    host.querySelectorAll('[data-goto-stage]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = Number(btn.dataset.gotoStage);
        if (target >= 1 && target <= state.maxVisited && target !== state.stage) {
          flushCurrentStageInputs();
          setStage(target);
        }
      });
    });
  }

  function flushCurrentStageInputs() {
    if (state.stage === 1) readStage1Inputs();
    else if (state.stage === 2) readStage2Inputs();
    else if (state.stage === 3) readStage3Inputs();
    else if (state.stage === 5) readStage5Inputs();
    saveWizardDraft(state);
  }

  /* ---------------- STAGE 1: ABOUT EVENT ---------------- */
  function renderStage1() {
    const a = state.about;
    return `
      <div class="wizard-stage-head">
        <div>
          <div class="wizard-stage-kicker">Stage 1 of 5</div>
          <h2>About Event</h2>
          <p>Core details, poster, overview, and key highlights shown to students.</p>
        </div>
      </div>
      <div class="form-error hidden" data-wiz-err></div>

      <div class="field">
        <label>Event title *</label>
        <input class="input" id="wTitle" value="${esc(a.title)}" placeholder="e.g. TEDx GMU 2026" required>
      </div>

      <div class="row2">
        <div class="field">
          <label>Event tagline</label>
          <input class="input" id="wTagline" value="${esc(a.tagline)}" placeholder="e.g. Ideas Worth Spreading">
        </div>
        <div class="field">
          <label>Event category</label>
          <select class="input" id="wCategory">
            ${WIZARD_CATEGORIES.map((c) => `<option value="${esc(c)}" ${a.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="row2">
        <div class="field">
          <label>Venue *</label>
          <input class="input" id="wVenue" value="${esc(a.venue)}" placeholder="Hallama Auditorium" required>
        </div>
        <div class="field">
          <label>Date and time *</label>
          <input class="input" id="wStartsAt" type="datetime-local" value="${esc(a.startsAt)}" required>
        </div>
      </div>

      <div class="field">
        <label>Short description (shown on the student banner)</label>
        <textarea class="input" id="wDesc" placeholder="Brief summary of the event">${esc(a.description)}</textarea>
      </div>

      <div class="field">
        <label>Detailed event overview</label>
        <textarea class="input" id="wOverview" style="min-height:120px" placeholder="Full context, theme, takeaways, and what attendees can expect">${esc(a.overview)}</textarea>
      </div>

      <div class="field">
        <label>Poster image</label>
        <img class="poster-preview ${a.poster || (isEdit && a.hasPoster && !a.removePoster) ? '' : 'hidden'}" id="wPosterPreview" src="${a.poster || (isEdit && a.hasPoster && !a.removePoster ? posterUrl(existingEvent) : '')}" alt="Event poster preview">
        <input class="input" id="wPosterFile" type="file" accept="image/png,image/jpeg,image/webp">
        ${(a.poster || (isEdit && a.hasPoster && !a.removePoster)) ? '<div style="margin-top:8px"><button type="button" class="btn sm btn-danger" id="wRemovePoster">Remove poster</button></div>' : ''}
      </div>

      <div class="wizard-section-block">
        <div class="wizard-section-title">
          <div>
            <h3>Event Highlights</h3>
            <p class="muted small">Add key takeaways, themes, or special attractions.</p>
          </div>
          <button type="button" class="btn sm" id="wAddHighlight">+ Add Highlight</button>
        </div>
        <div class="wizard-list" id="wHighlightsList">
          ${a.highlights.length ? a.highlights.map((h, i) => `
            <div class="wizard-item-card" data-hl-idx="${i}">
              <div class="wizard-item-head">
                <span class="pill spot">Highlight #${i + 1}</span>
                <button type="button" class="btn sm btn-danger" data-rm-hl="${i}">Remove</button>
              </div>
              <div class="field" style="margin-bottom:0">
                <label>Highlight title *</label>
                <input class="input" data-hl-title="${i}" value="${esc(h.title)}" placeholder="e.g. 8 Live Speakers">
              </div>
              <div class="field" style="margin-bottom:0">
                <label>Short description</label>
                <input class="input" data-hl-desc="${i}" value="${esc(h.description)}" placeholder="Brief note about this highlight">
              </div>
            </div>`).join('') : '<p class="muted small">No highlights added yet. Click “+ Add Highlight” if you’d like to feature key points.</p>'}
        </div>
      </div>

      <div class="wizard-footer">
        <button type="button" class="btn btn-ghost" id="wCancelBtn">Cancel</button>
        <div class="wizard-footer-right">
          <button type="button" class="btn btn-spot lg" id="wNext1">Continue →</button>
        </div>
      </div>`;
  }

  function readStage1Inputs() {
    const a = state.about;
    const t = host.querySelector('#wTitle');
    if (!t) return;
    a.title = t.value;
    a.tagline = host.querySelector('#wTagline').value;
    a.category = host.querySelector('#wCategory').value;
    a.venue = host.querySelector('#wVenue').value;
    a.startsAt = host.querySelector('#wStartsAt').value;
    a.description = host.querySelector('#wDesc').value;
    a.overview = host.querySelector('#wOverview').value;
    a.highlights = a.highlights.map((_, i) => ({
      title: host.querySelector(`[data-hl-title="${i}"]`)?.value || '',
      description: host.querySelector(`[data-hl-desc="${i}"]`)?.value || '',
    }));
  }

  function wireStage1() {
    host.querySelector('#wCancelBtn').onclick = confirmCancelWizard;

    host.querySelector('#wPosterFile').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        state.about.poster = await resizeImage(f);
        saveWizardDraft(state);
        render();
      } catch (ex) {
        toast(ex.message, 'err');
      }
    });

    const rmPoster = host.querySelector('#wRemovePoster');
    if (rmPoster) {
      rmPoster.onclick = () => {
        state.about.poster = '';
        state.about.removePoster = true;
        persistDraft();
        render();
      };
    }

    host.querySelector('#wAddHighlight').onclick = () => {
      readStage1Inputs();
      state.about.highlights.push({ title: '', description: '' });
      saveWizardDraft(state);
      render();
    };

    host.querySelectorAll('[data-rm-hl]').forEach((btn) => {
      btn.onclick = () => {
        readStage1Inputs();
        state.about.highlights.splice(Number(btn.dataset.rmHl), 1);
        saveWizardDraft(state);
        render();
      };
    });

    host.querySelector('#wNext1').onclick = () => {
      readStage1Inputs();
      const a = state.about;
      if (!a.title.trim()) return showErr('Please enter an event title.');
      if (!a.venue.trim()) return showErr('Please enter a venue.');
      if (!a.startsAt || Number.isNaN(new Date(a.startsAt).getTime())) {
        return showErr('Please select a valid event date and time.');
      }
      for (let i = 0; i < a.highlights.length; i++) {
        if (!a.highlights[i].title.trim() && a.highlights[i].description.trim()) {
          return showErr(`Highlight #${i + 1} needs a title (or remove it).`);
        }
      }
      a.highlights = a.highlights.filter((h) => h.title.trim());
      setStage(2);
    };
  }

  /* ---------------- STAGE 2: SPEAKERS & GUESTS ---------------- */
  function renderStage2() {
    return `
      <div class="wizard-stage-head">
        <div>
          <div class="wizard-stage-kicker">Stage 2 of 5 · Optional</div>
          <h2>Speakers & Guests</h2>
          <p>Add keynote speakers or special guests. You can skip this stage if none are finalized.</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn sm" id="wAddSpeaker">+ Add Speaker</button>
          <button type="button" class="btn sm" id="wAddGuest">+ Add Special Guest</button>
        </div>
      </div>
      <div class="form-error hidden" data-wiz-err></div>

      <div class="wizard-list">
        ${state.speakers.length ? state.speakers.map((sp, i) => `
          <div class="wizard-item-card">
            <div class="wizard-item-head">
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                <span class="role-badge ${sp.role === 'guest' ? 'guest' : 'speaker'}">
                  ${sp.role === 'guest' ? 'Special Guest' : 'Speaker'}
                </span>
                <select class="input" data-sp-role="${i}" style="width:auto;padding:6px 32px 6px 12px;font-size:13.5px">
                  <option value="speaker" ${sp.role !== 'guest' ? 'selected' : ''}>Speaker</option>
                  <option value="guest" ${sp.role === 'guest' ? 'selected' : ''}>Special Guest</option>
                </select>
              </div>
              <button type="button" class="btn sm btn-danger" data-rm-sp="${i}">Remove</button>
            </div>

            <div class="speaker-photo-row">
              ${sp.photo
                ? `<img class="speaker-avatar-preview" src="${sp.photo}" alt="${esc(sp.name || 'Speaker')}">`
                : `<div class="speaker-avatar-preview">${esc(initials(sp.name || (sp.role === 'guest' ? 'G' : 'S')))}</div>`}
              <div class="field" style="margin:0;flex:1;min-width:200px">
                <label>Profile photograph</label>
                <input class="input" type="file" accept="image/png,image/jpeg,image/webp" data-sp-photo="${i}">
              </div>
              ${sp.photo ? `<button type="button" class="btn sm btn-danger" data-rm-sp-photo="${i}">Remove photo</button>` : ''}
            </div>

            <div class="row2">
              <div class="field" style="margin-bottom:0">
                <label>Full name *</label>
                <input class="input" data-sp-name="${i}" value="${esc(sp.name)}" placeholder="e.g. Dr. Ananya Rao">
              </div>
              <div class="field" style="margin-bottom:0">
                <label>Designation</label>
                <input class="input" data-sp-desig="${i}" value="${esc(sp.designation)}" placeholder="e.g. AI Research Lead">
              </div>
            </div>

            <div class="field" style="margin-bottom:0">
              <label>Organization / Institution</label>
              <input class="input" data-sp-org="${i}" value="${esc(sp.organization)}" placeholder="e.g. IISc Bengaluru">
            </div>

            <div class="field" style="margin-bottom:0">
              <label>Short biography</label>
              <textarea class="input" data-sp-bio="${i}" placeholder="Brief background and talk topic">${esc(sp.bio)}</textarea>
            </div>
          </div>`).join('') : `
          <div class="empty" style="padding:36px 20px">
            <b>No speakers or guests added yet</b>
            <p class="muted small" style="margin-top:6px">Click “+ Add Speaker” or “+ Add Special Guest” above, or skip this stage for now.</p>
          </div>`}
      </div>

      <div class="wizard-footer">
        <button type="button" class="btn" id="wBack2">← Back</button>
        <div class="wizard-footer-right">
          <button type="button" class="btn btn-ghost" id="wSkip2">Skip stage</button>
          <button type="button" class="btn btn-spot lg" id="wNext2">Continue →</button>
        </div>
      </div>`;
  }

  function readStage2Inputs() {
    state.speakers = state.speakers.map((sp, i) => ({
      ...sp,
      role: host.querySelector(`[data-sp-role="${i}"]`)?.value === 'guest' ? 'guest' : 'speaker',
      name: host.querySelector(`[data-sp-name="${i}"]`)?.value || '',
      designation: host.querySelector(`[data-sp-desig="${i}"]`)?.value || '',
      organization: host.querySelector(`[data-sp-org="${i}"]`)?.value || '',
      bio: host.querySelector(`[data-sp-bio="${i}"]`)?.value || '',
    }));
  }

  function wireStage2() {
    const addPerson = (role) => {
      readStage2Inputs();
      state.speakers.push({ role, name: '', photo: '', designation: '', organization: '', bio: '' });
      saveWizardDraft(state);
      render();
    };
    host.querySelector('#wAddSpeaker').onclick = () => addPerson('speaker');
    host.querySelector('#wAddGuest').onclick = () => addPerson('guest');

    host.querySelectorAll('[data-sp-role]').forEach((sel) => {
      sel.onchange = () => {
        readStage2Inputs();
        saveWizardDraft(state);
        render();
      };
    });

    host.querySelectorAll('[data-rm-sp]').forEach((btn) => {
      btn.onclick = () => {
        readStage2Inputs();
        state.speakers.splice(Number(btn.dataset.rmSp), 1);
        saveWizardDraft(state);
        render();
      };
    });

    host.querySelectorAll('[data-sp-photo]').forEach((inp) => {
      inp.addEventListener('change', async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        readStage2Inputs();
        try {
          state.speakers[Number(inp.dataset.spPhoto)].photo = await resizeImage(f, 360);
          saveWizardDraft(state);
          render();
        } catch (ex) {
          toast(ex.message, 'err');
        }
      });
    });

    host.querySelectorAll('[data-rm-sp-photo]').forEach((btn) => {
      btn.onclick = () => {
        readStage2Inputs();
        state.speakers[Number(btn.dataset.rmSpPhoto)].photo = '';
        saveWizardDraft(state);
        render();
      };
    });

    host.querySelector('#wBack2').onclick = () => {
      readStage2Inputs();
      setStage(1);
    };

    host.querySelector('#wSkip2').onclick = () => {
      readStage2Inputs();
      state.speakers = state.speakers.filter((s) => s.name.trim());
      setStage(3);
    };

    host.querySelector('#wNext2').onclick = () => {
      readStage2Inputs();
      for (let i = 0; i < state.speakers.length; i++) {
        if (!state.speakers[i].name.trim()) {
          return showErr(`Please enter a full name for entry #${i + 1} or remove it.`);
        }
      }
      setStage(3);
    };
  }

  /* ---------------- STAGE 3: EVENT SCHEDULE ---------------- */
  function renderStage3() {
    const sorted = [...state.schedule]
      .filter((item) => item.title.trim() && item.startTime && item.endTime && item.endTime > item.startTime)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    return `
      <div class="wizard-stage-head">
        <div>
          <div class="wizard-stage-kicker">Stage 3 of 5 · Optional</div>
          <h2>Event Schedule</h2>
          <p>Build the agenda. Sessions are validated and arranged chronologically.</p>
        </div>
        <button type="button" class="btn sm" id="wAddSched">+ Add Schedule Item</button>
      </div>
      <div class="form-error hidden" data-wiz-err></div>

      <div class="wizard-list">
        ${state.schedule.length ? state.schedule.map((item, i) => `
          <div class="wizard-item-card">
            <div class="wizard-item-head">
              <span class="pill spot">Session #${i + 1}</span>
              <button type="button" class="btn sm btn-danger" data-rm-sc="${i}">Remove</button>
            </div>
            <div class="row2">
              <div class="field" style="margin-bottom:0">
                <label>Session / activity title *</label>
                <input class="input" data-sc-title="${i}" value="${esc(item.title)}" placeholder="e.g. Opening Keynote">
              </div>
              <div class="field" style="margin-bottom:0">
                <label>Speaker / host (optional)</label>
                <input class="input" data-sc-speaker="${i}" value="${esc(item.speaker)}" placeholder="e.g. Dr. Ananya Rao">
              </div>
            </div>
            <div class="row2">
              <div class="field" style="margin-bottom:0">
                <label>Start time *</label>
                <input class="input" type="time" data-sc-start="${i}" value="${esc(item.startTime)}">
              </div>
              <div class="field" style="margin-bottom:0">
                <label>End time *</label>
                <input class="input" type="time" data-sc-end="${i}" value="${esc(item.endTime)}">
              </div>
            </div>
            <div class="field" style="margin-bottom:0">
              <label>Short description</label>
              <input class="input" data-sc-desc="${i}" value="${esc(item.description)}" placeholder="What happens in this session">
            </div>
          </div>`).join('') : `
          <div class="empty" style="padding:36px 20px">
            <b>No schedule items yet</b>
            <p class="muted small" style="margin-top:6px">Click “+ Add Schedule Item” to build the timeline, or skip this stage if the agenda isn’t ready.</p>
          </div>`}
      </div>

      ${sorted.length ? `
        <div class="wizard-section-block">
          <div class="wizard-section-title">
            <h3>Timeline Preview</h3>
            <span class="muted small">Sorted chronologically</span>
          </div>
          <div class="schedule-timeline">
            ${sorted.map((item) => `
              <div class="timeline-node">
                <div class="timeline-time">${esc(item.startTime)} – ${esc(item.endTime)}</div>
                <b>${esc(item.title)}</b>
                ${item.speaker ? `<div class="muted small">Host / Speaker: ${esc(item.speaker)}</div>` : ''}
                ${item.description ? `<p class="muted small" style="margin-top:4px">${esc(item.description)}</p>` : ''}
              </div>`).join('')}
          </div>
        </div>` : ''}

      <div class="wizard-footer">
        <button type="button" class="btn" id="wBack3">← Back</button>
        <div class="wizard-footer-right">
          <button type="button" class="btn btn-ghost" id="wSkip3">Skip stage</button>
          <button type="button" class="btn btn-spot lg" id="wNext3">Continue →</button>
        </div>
      </div>`;
  }

  function readStage3Inputs() {
    state.schedule = state.schedule.map((_, i) => ({
      title: host.querySelector(`[data-sc-title="${i}"]`)?.value || '',
      speaker: host.querySelector(`[data-sc-speaker="${i}"]`)?.value || '',
      startTime: host.querySelector(`[data-sc-start="${i}"]`)?.value || '',
      endTime: host.querySelector(`[data-sc-end="${i}"]`)?.value || '',
      description: host.querySelector(`[data-sc-desc="${i}"]`)?.value || '',
    }));
  }

  function wireStage3() {
    host.querySelector('#wAddSched').onclick = () => {
      readStage3Inputs();
      state.schedule.push({ title: '', startTime: '09:30', endTime: '10:30', speaker: '', description: '' });
      saveWizardDraft(state);
      render();
    };

    host.querySelectorAll('[data-rm-sc]').forEach((btn) => {
      btn.onclick = () => {
        readStage3Inputs();
        state.schedule.splice(Number(btn.dataset.rmSc), 1);
        saveWizardDraft(state);
        render();
      };
    });

    host.querySelector('#wBack3').onclick = () => {
      readStage3Inputs();
      setStage(2);
    };

    host.querySelector('#wSkip3').onclick = () => {
      readStage3Inputs();
      state.schedule = state.schedule.filter((s) => s.title.trim() && s.startTime && s.endTime && s.endTime > s.startTime);
      state.schedule.sort((a, b) => a.startTime.localeCompare(b.startTime));
      setStage(4);
    };

    host.querySelector('#wNext3').onclick = () => {
      readStage3Inputs();
      for (let i = 0; i < state.schedule.length; i++) {
        const s = state.schedule[i];
        if (!s.title.trim()) return showErr(`Schedule item #${i + 1} needs a session title.`);
        if (!s.startTime || !s.endTime) return showErr(`Please set start and end times for "${s.title}".`);
        if (s.endTime <= s.startTime) return showErr(`End time must be after start time for "${s.title}".`);
      }
      state.schedule.sort((a, b) => a.startTime.localeCompare(b.startTime));
      setStage(4);
    };
  }

  /* ---------------- STAGE 4: PARTICIPATION ---------------- */
  function renderStage4() {
    const p = state.participation;
    return `
      <div class="wizard-stage-head">
        <div>
          <div class="wizard-stage-kicker">Stage 4 of 5</div>
          <h2>Participation</h2>
          <p>Define who can attend and display eligibility on the student event page.</p>
        </div>
      </div>
      <div class="form-error hidden" data-wiz-err></div>

      <div class="field">
        <label>Who can participate? *</label>
        <div class="audience-grid">
          ${Object.entries(AUDIENCE_LABELS).map(([val, label]) => `
            <label class="audience-option ${p.audienceType === val ? 'selected' : ''}">
              <input type="radio" name="wAudience" value="${val}" ${p.audienceType === val ? 'checked' : ''}>
              <span>${esc(label)}</span>
            </label>`).join('')}
        </div>
      </div>

      ${p.audienceType === 'custom' ? `
        <div class="field">
          <label>Custom eligibility details *</label>
          <input class="input" id="wCustomElig" value="${esc(p.customEligibility)}" placeholder="e.g. Registered hackathon finalists & IEEE members">
        </div>` : ''}

      <div class="wizard-section-block">
        <div class="wizard-section-title">
          <h3>Eligible Departments</h3>
          <label class="check" style="margin:0">
            <input type="checkbox" id="wAllDepts" ${p.allDepartments ? 'checked' : ''}> All Departments
          </label>
        </div>
        <div class="chip-grid" style="${p.allDepartments ? 'opacity:.45;pointer-events:none' : ''}">
          ${WIZARD_DEPTS.map((dept) => {
            const sel = p.departments.includes(dept);
            return `<button type="button" class="chip-btn ${sel ? 'selected' : ''}" data-dept="${esc(dept)}">${esc(dept)}</button>`;
          }).join('')}
        </div>
      </div>

      <div class="wizard-section-block">
        <div class="wizard-section-title">
          <h3>Eligible Semesters / Years</h3>
          <label class="check" style="margin:0">
            <input type="checkbox" id="wAllSems" ${p.allSemesters ? 'checked' : ''}> All Semesters
          </label>
        </div>
        <div class="chip-grid" style="${p.allSemesters ? 'opacity:.45;pointer-events:none' : ''}">
          ${WIZARD_SEMS.map((sem) => {
            const sel = p.semesters.includes(sem);
            return `<button type="button" class="chip-btn ${sel ? 'selected' : ''}" data-sem="${sem}">Semester ${sem}</button>`;
          }).join('')}
        </div>
      </div>

      <div class="wizard-footer">
        <button type="button" class="btn" id="wBack4">← Back</button>
        <div class="wizard-footer-right">
          <button type="button" class="btn btn-spot lg" id="wNext4">Continue →</button>
        </div>
      </div>`;
  }

  function wireStage4() {
    const p = state.participation;
    host.querySelectorAll('input[name="wAudience"]').forEach((r) => {
      r.onchange = () => {
        p.audienceType = r.value;
        if (r.value === 'departments') p.allDepartments = false;
        if (r.value === 'semesters') p.allSemesters = false;
        saveWizardDraft(state);
        render();
      };
    });

    const customInp = host.querySelector('#wCustomElig');
    if (customInp) {
      customInp.oninput = () => { p.customEligibility = customInp.value; saveWizardDraft(state); };
    }

    host.querySelector('#wAllDepts').onchange = (e) => {
      p.allDepartments = e.target.checked;
      saveWizardDraft(state);
      render();
    };

    host.querySelector('#wAllSems').onchange = (e) => {
      p.allSemesters = e.target.checked;
      saveWizardDraft(state);
      render();
    };

    host.querySelectorAll('[data-dept]').forEach((btn) => {
      btn.onclick = () => {
        const d = btn.dataset.dept;
        p.departments = p.departments.includes(d)
          ? p.departments.filter((x) => x !== d)
          : [...p.departments, d];
        saveWizardDraft(state);
        render();
      };
    });

    host.querySelectorAll('[data-sem]').forEach((btn) => {
      btn.onclick = () => {
        const s = btn.dataset.sem;
        p.semesters = p.semesters.includes(s)
          ? p.semesters.filter((x) => x !== s)
          : [...p.semesters, s];
        saveWizardDraft(state);
        render();
      };
    });

    host.querySelector('#wBack4').onclick = () => setStage(3);
    host.querySelector('#wNext4').onclick = () => {
      if (p.audienceType === 'custom' && !p.customEligibility.trim()) {
        return showErr('Please describe the custom eligibility criteria.');
      }
      if (!p.allDepartments && !p.departments.length) {
        return showErr('Select at least one department or choose “All Departments”.');
      }
      if (!p.allSemesters && !p.semesters.length) {
        return showErr('Select at least one semester or choose “All Semesters”.');
      }
      setStage(5);
    };
  }

  /* ---------------- STAGE 5: ORGANIZER INFORMATION ---------------- */
  function renderStage5() {
    const o = state.organizer;
    const a = state.about;
    return `
      <div class="wizard-stage-head">
        <div>
          <div class="wizard-stage-kicker">Stage 5 of 5</div>
          <h2>Organizer Information</h2>
          <p>Department, coordinators, and contact details for student queries.</p>
        </div>
      </div>
      <div class="form-error hidden" data-wiz-err></div>

      <div class="field">
        <label>Organizing department / club *</label>
        <input class="input" id="wOrgDept" value="${esc(o.department)}" placeholder="e.g. Department of CSE & TEDx Club">
      </div>

      <div class="row2">
        <div class="field">
          <label>Faculty coordinator name</label>
          <input class="input" id="wFaculty" value="${esc(o.facultyCoordinator)}" placeholder="e.g. Prof. Rajeshwari K">
        </div>
        <div class="field">
          <label>Student coordinator name</label>
          <input class="input" id="wStudentCoord" value="${esc(o.studentCoordinator)}" placeholder="e.g. Aarav Sharma">
        </div>
      </div>

      <div class="row2">
        <div class="field">
          <label>Contact number</label>
          <input class="input" id="wContactPhone" type="tel" inputmode="numeric" value="${esc(o.contactPhone)}" placeholder="10-digit mobile">
        </div>
        <div class="field">
          <label>Contact email</label>
          <input class="input" id="wContactEmail" type="email" value="${esc(o.contactEmail)}" placeholder="events@gmu.ac.in">
        </div>
      </div>

      <div class="wizard-section-block">
        <div class="wizard-section-title">
          <h3>Event Summary</h3>
          <span class="pill spot">Ready to review</span>
        </div>
        <div class="review-section">
          <div class="review-kv">
            <div><small>Event</small><b>${esc(a.title || '—')}</b></div>
            <div><small>Venue & Time</small><b>${esc(a.venue || '—')} · ${a.startsAt ? fmtDate(a.startsAt, true) : '—'}</b></div>
            <div><small>Speakers & Guests</small><b>${state.speakers.length ? `${state.speakers.length} added` : 'None'}</b></div>
            <div><small>Schedule Sessions</small><b>${state.schedule.length ? `${state.schedule.length} sessions` : 'None'}</b></div>
            <div><small>Eligibility</small><b>${esc(formatEligibilitySummary(state.participation))}</b></div>
          </div>
        </div>
      </div>

      <div class="wizard-footer">
        <button type="button" class="btn" id="wBack5">← Back</button>
        <div class="wizard-footer-right">
          <button type="button" class="btn btn-spot lg" id="wReviewBtn">Review & Create Event →</button>
        </div>
      </div>`;
  }

  function readStage5Inputs() {
    const o = state.organizer;
    const dept = host.querySelector('#wOrgDept');
    if (!dept) return;
    o.department = dept.value;
    o.facultyCoordinator = host.querySelector('#wFaculty').value;
    o.studentCoordinator = host.querySelector('#wStudentCoord').value;
    o.contactPhone = host.querySelector('#wContactPhone').value;
    o.contactEmail = host.querySelector('#wContactEmail').value;
  }

  function wireStage5() {
    host.querySelector('#wBack5').onclick = () => {
      readStage5Inputs();
      setStage(4);
    };

    host.querySelector('#wReviewBtn').onclick = () => {
      readStage5Inputs();
      const o = state.organizer;
      if (!o.department.trim()) return showErr('Please enter the organizing department or club.');
      const digits = o.contactPhone.replace(/\D/g, '');
      if (o.contactPhone.trim() && digits.length !== 10) {
        return showErr('Contact number must be 10 digits.');
      }
      if (o.contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(o.contactEmail.trim())) {
        return showErr('Please enter a valid contact email.');
      }
      setStage(6);
    };
  }

  /* ---------------- FINAL SCREEN: REVIEW & CONFIGURE ---------------- */
  function renderReview() {
    const a = state.about;
    const o = state.organizer;
    const c = state.config;
    return `
      <div class="wizard-stage-head">
        <div>
          <div class="wizard-stage-kicker">Final Confirmation</div>
          <h2>Review & Create Event</h2>
          <p>Verify all details and seat booking settings before publishing.</p>
        </div>
      </div>
      <div class="form-error hidden" data-wiz-err></div>

      <div class="review-grid">
        <div class="review-section">
          <div class="review-section-head">
            <h3>1. About Event</h3>
            <button type="button" class="btn sm" data-edit-stage="1">Edit</button>
          </div>
          <div class="review-kv">
            <div><small>Title</small><b>${esc(a.title)}</b></div>
            <div><small>Category</small><b>${esc(a.category || '—')}</b></div>
            <div><small>Tagline</small><b>${esc(a.tagline || '—')}</b></div>
            <div><small>Venue</small><b>${esc(a.venue)}</b></div>
            <div><small>Date & Time</small><b>${fmtDate(a.startsAt, true)}</b></div>
            <div><small>Poster</small><b>${a.poster ? 'Uploaded' : 'Default'}</b></div>
          </div>
          ${a.description ? `<p class="muted small" style="margin-top:10px">${esc(a.description)}</p>` : ''}
          ${a.highlights.length ? `<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px">${a.highlights.map((h) => `<span class="pill spot">${esc(h.title)}</span>`).join('')}</div>` : ''}
        </div>

        <div class="review-section">
          <div class="review-section-head">
            <h3>2. Speakers & Guests</h3>
            <button type="button" class="btn sm" data-edit-stage="2">Edit</button>
          </div>
          ${state.speakers.length ? `
            <div style="display:flex;flex-wrap:wrap;gap:10px">
              ${state.speakers.map((s) => `
                <div class="pill ${s.role === 'guest' ? 'teal' : 'spot'}">
                  ${esc(s.role === 'guest' ? 'Special Guest' : 'Speaker')}: <b>${esc(s.name)}</b>${s.organization ? ` (${esc(s.organization)})` : ''}
                </div>`).join('')}
            </div>` : '<p class="muted small">Skipped — no speakers or guests added.</p>'}
        </div>

        <div class="review-section">
          <div class="review-section-head">
            <h3>3. Event Schedule</h3>
            <button type="button" class="btn sm" data-edit-stage="3">Edit</button>
          </div>
          ${state.schedule.length ? `
            <div class="wizard-list" style="gap:6px">
              ${state.schedule.map((s) => `<div class="small"><b style="color:var(--spot)">${esc(s.startTime)}–${esc(s.endTime)}</b> · ${esc(s.title)}${s.speaker ? ` <span class="muted">(${esc(s.speaker)})</span>` : ''}</div>`).join('')}
            </div>` : '<p class="muted small">Skipped — no schedule added yet.</p>'}
        </div>

        <div class="review-section">
          <div class="review-section-head">
            <h3>4. Participation</h3>
            <button type="button" class="btn sm" data-edit-stage="4">Edit</button>
          </div>
          <p class="small"><b>${esc(formatEligibilitySummary(state.participation))}</b></p>
        </div>

        <div class="review-section">
          <div class="review-section-head">
            <h3>5. Organizer Information</h3>
            <button type="button" class="btn sm" data-edit-stage="5">Edit</button>
          </div>
          <div class="review-kv">
            <div><small>Department / Club</small><b>${esc(o.department || '—')}</b></div>
            <div><small>Faculty Coordinator</small><b>${esc(o.facultyCoordinator || '—')}</b></div>
            <div><small>Student Coordinator</small><b>${esc(o.studentCoordinator || '—')}</b></div>
            <div><small>Contact</small><b>${esc([o.contactPhone, o.contactEmail].filter(Boolean).join(' · ') || '—')}</b></div>
          </div>
        </div>

        <div class="review-section" style="border-color:rgba(255,215,94,.32)">
          <div class="review-section-head">
            <h3>Event Configuration</h3>
          </div>
          <label class="check"><input type="checkbox" id="wCfgPublished" ${c.published ? 'checked' : ''}> Show this event to students</label>
          <label class="check"><input type="checkbox" id="wCfgBookingOpen" ${c.bookingOpen ? 'checked' : ''}> Let students book seats</label>
          <label class="check"><input type="checkbox" id="wCfgSeqRows" ${c.sequentialRows ? 'checked' : ''}> Fill row by row (the next row opens only when the current one is full)</label>
          ${!isEdit ? `<label class="check"><input type="checkbox" id="wCfgGuestRowA" ${c.guestRowA ? 'checked' : ''}> Reserve row A for guests (you can change single seats later)</label>` : ''}
        </div>
      </div>

      <div class="wizard-footer">
        <button type="button" class="btn" id="wBack6">← Back</button>
        <div class="wizard-footer-right">
          ${!isEdit ? '<button type="button" class="btn btn-danger" id="wCancel6">Cancel</button>' : ''}
          <button type="button" class="btn btn-spot lg" id="wPublishBtn">${isEdit ? 'Save Changes' : 'Publish / Create Event'}</button>
        </div>
      </div>`;
  }

  function wireReview() {
    host.querySelectorAll('[data-edit-stage]').forEach((btn) => {
      btn.onclick = () => setStage(Number(btn.dataset.editStage));
    });

    const syncConfig = () => {
      state.config.published = host.querySelector('#wCfgPublished').checked;
      state.config.bookingOpen = host.querySelector('#wCfgBookingOpen').checked;
      state.config.sequentialRows = host.querySelector('#wCfgSeqRows').checked;
      const guestEl = host.querySelector('#wCfgGuestRowA');
      if (guestEl) state.config.guestRowA = guestEl.checked;
      persistDraft();
    };
    ['#wCfgPublished', '#wCfgBookingOpen', '#wCfgSeqRows', '#wCfgGuestRowA'].forEach((sel) => {
      const el = host.querySelector(sel);
      if (el) el.onchange = syncConfig;
    });

    host.querySelector('#wBack6').onclick = () => setStage(5);
    const cancelBtn = host.querySelector('#wCancel6');
    if (cancelBtn) cancelBtn.onclick = confirmCancelWizard;

    host.querySelector('#wPublishBtn').onclick = async () => {
      if (submitting) return;
      syncConfig();
      const btn = host.querySelector('#wPublishBtn');
      submitting = true;
      btn.disabled = true;
      btn.textContent = isEdit ? 'Saving changes…' : 'Creating event…';
      showErr('');

      const body = {
        title: state.about.title,
        tagline: state.about.tagline,
        category: state.about.category,
        venue: state.about.venue,
        startsAt: new Date(state.about.startsAt).toISOString(),
        description: state.about.description,
        overview: state.about.overview,
        highlights: state.about.highlights,
        speakers: state.speakers,
        schedule: state.schedule,
        participation: state.participation,
        organizer: state.organizer,
        published: state.config.published,
        bookingOpen: state.config.bookingOpen,
        sequentialRows: state.config.sequentialRows,
      };
      if (!isEdit) body.guestRows = state.config.guestRowA ? ['A'] : [];
      if (state.about.poster) body.poster = state.about.poster;
      else if (isEdit && state.about.removePoster) body.poster = null;

      try {
        if (isEdit) {
          await API.put(`/api/admin/events/${existingEvent.id}`, body);
          toast('Changes saved', 'ok');
          onCreated(existingEvent.id);
          submitting = false;
          btn.disabled = false;
          btn.textContent = 'Save Changes';
        } else {
          const { event } = await API.post('/api/admin/events', body);
          clearWizardDraft();
          toast('Event created', 'ok');
          onCreated(event.id);
        }
      } catch (ex) {
        submitting = false;
        btn.disabled = false;
        btn.textContent = isEdit ? 'Save Changes' : 'Publish / Create Event';
        showErr(ex.message);
      }
    };
  }

  async function confirmCancelWizard() {
    const ok = await confirmBox(
      'Discard this event draft?',
      '<p>All unsaved wizard fields will be cleared and you will return to the overview.</p>',
      'Discard draft'
    );
    if (!ok) return;
    clearWizardDraft();
    onCancel();
  }
}
