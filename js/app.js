/* Herding Cats · Copyright (c) 2026 Natius. All rights reserved. See LICENSE. */
/* Herding Cats · app (beta, Phase 2 milestone 2.1: accounts and families)
   Screens: first-time setup, Today, Calendar (activities, reminders, school
   terms, tasks, exams, study), Tasks, Study planner, Money (accounts, savings
   goals, money owed, chores, reward goals), child pages, Settings. */
(function () {
  'use strict';
  const FH = window.FH;
  const data = FH.data;
  const C = FH.cal;
  const VERSION = '2.1.0';
  const MILESTONE = 7;
  const PHASE2 = '2.1'; // Phase 2 milestone in this build

  /* ---------- Small helpers ---------- */
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const todayS = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const DOWL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const fmtLong = d => `${DOWL[d.getDay()]} ${d.getDate()} ${MONL[d.getMonth()]}`;
  const fmtStamp = iso => { if (!iso) return 'unknown date'; const d = new Date(iso); return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const fmtBytes = b => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`;
  const inFrame = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();

  const COLOURS = [
    ['c1', 'Red'], ['c2', 'Blue'], ['c3', 'Gold'], ['c4', 'Green'],
    ['c5', 'Purple'], ['c6', 'Orange'], ['c7', 'Teal'], ['c8', 'Pink'],
  ];
  const colName = k => (COLOURS.find(c => c[0] === k) || COLOURS[0])[1];
  const GRADES = ['Grade R', ...Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`), 'Pre-school', 'Finished school'];

  const MILESTONES = [
    [1, 'Foundation', 'Install, local storage, children, backup'],
    [2, 'Calendar and activities', 'Week and month views, activities, reminders, school terms'],
    [3, 'Tasks', 'Homework and projects with notes and steps'],
    [4, 'Study planner', 'Exam timetable photo, revision plan'],
    [5, 'Accounts and savings', 'Balances, savings goals, money owed'],
    [6, 'Chores and reward goals', 'Done or not done log, approvals'],
    [7, 'Today and hand-over', 'Daily digest, child pages, install guide'],
  ];
  const COMING = {
  };

  /* ---------- State ---------- */
  const S = {
    ready: false, error: null,
    view: 'today', child: null,
    children: [], parent: null, family: '',
    sheet: null,            // { kind: 'child', id?, confirm? } | { kind: 'restore', backup, summary, confirm? }
    setup: null,            // first-time setup rows
    storage: { persisted: null, usage: null, quota: null },
    installEvt: null,
    backupText: '',
    /* milestone 2 */
    activities: [], reminders: [], terms: [], daysoff: [], sc: null,
    hidden: new Set(),                      // children switched off on the calendar
    kinds: new Set(['act', 'rem', 'task', 'study']), // item types shown on the calendar
    tasks: [], taskFilter: 'open', openTask: null,
    periods: [], exams: [], sessions: [], study: { period: null, tab: 'exams', imp: null },
    chores: [], rewards: [], choreView: {},
    accounts: [], entries: [], goals: [], ledger: [], moneyChild: null, editBal: null, editAlloc: null, histAll: {}, ledgerHist: false,
    cal: { mode: 'week', cursor: C.today(), sel: C.today() },
    pastTerms: false,
  };
  const KINDS = [['act', 'Activities'], ['rem', 'Reminders'], ['task', 'Tasks'], ['study', 'Exams and study']];
  try {
    const saved = JSON.parse(localStorage.getItem('fh-cal') || 'null');
    if (saved) { if (saved.mode) S.cal.mode = saved.mode; if (Array.isArray(saved.kinds)) { S.kinds = new Set(saved.kinds.filter(k => KINDS.some(x => x[0] === k))); for (const [k] of KINDS) if (!(saved.seen || ['act', 'rem']).includes(k)) S.kinds.add(k); } if (Array.isArray(saved.hidden)) S.hidden = new Set(saved.hidden); }
  } catch (e) { /* storage not available: use defaults */ }
  function saveCalPrefs() { try { localStorage.setItem('fh-cal', JSON.stringify({ mode: S.cal.mode, kinds: [...S.kinds], hidden: [...S.hidden], seen: KINDS.map(x => x[0]) })); } catch (e) { /* ignore */ } }
  const visibleSet = () => new Set(S.children.filter(c => !S.hidden.has(c.id)).map(c => c.id));
  const kidOf = id => S.children.find(c => c.id === id);
  const colOf = id => kidOf(id)?.colour || 'c1';
  const nameOf = id => kidOf(id)?.name || '';

  /* ---------- Icons ---------- */
  const IC = {
    today: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    tasks: '<path d="M10 6h10M10 12h10M10 18h10M4 6l1.2 1.2L7.5 5M4 12l1.2 1.2 2.3-2.2M4 18l1.2 1.2 2.3-2.2"/>',
    study: '<path d="M4 19V5a2 2 0 0 1 2-2h14v14H6a2 2 0 0 0-2 2 2 2 0 0 0 2 2h14M8 7h8"/>',
    money: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M15.5 14.5h2.5"/>',
    settings: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    left: '<path d="M15 5l-7 7 7 7"/>',
    right: '<path d="M9 5l7 7-7 7"/>',
  };
  const ic = k => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${IC[k]}</svg>`;
  const avatar = (p, lg) => `<span class="avatar${lg ? ' lg' : ''}" style="--c:var(--${esc(p.colour)})">${esc((p.name || '?').trim()[0] || '?')}</span>`;

  /* ---------- Loading ---------- */
  async function load() {
    S.parent = data.user;
    S.children = (await data.list('people', p => p.type === 'child')).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
    S.family = await data.getSetting('familyName', '');
    S.setupDone = await data.getSetting('setupDone', false);
    const kids = new Set(S.children.map(c => c.id));
    S.activities = (await data.list('activities')).filter(a => kids.has(a.owner));
    S.reminders = (await data.list('reminders')).filter(r => kids.has(r.owner));
    S.tasks = (await data.list('tasks')).filter(t => kids.has(t.owner));
    S.periods = (await data.list('periods')).filter(p => kids.has(p.owner));
    const pids = new Set(S.periods.map(p => p.id));
    S.exams = (await data.list('exams')).filter(x => pids.has(x.period));
    S.sessions = (await data.list('sessions')).filter(x => pids.has(x.period));
    S.accounts = (await data.list('accounts')).filter(a => kids.has(a.owner)).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    const aids = new Set(S.accounts.map(a => a.id));
    S.entries = (await data.list('entries')).filter(e => aids.has(e.account));
    S.goals = (await data.list('goals')).filter(g => aids.has(g.account)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.createdAt || '').localeCompare(b.createdAt || ''));
    S.ledger = (await data.list('ledger')).filter(l => kids.has(l.owner));
    S.chores = (await data.list('chores')).filter(c => kids.has(c.owner)).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    S.rewards = (await data.list('rewards')).filter(g => kids.has(g.owner)).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    if (!kids.has(S.moneyChild)) S.moneyChild = S.children[0]?.id || null;
    if (!S.periods.some(p => p.id === S.study.period)) S.study.period = periodsSorted()[0]?.id || null;
    S.terms = await data.list('terms');
    S.daysoff = await data.list('daysoff');
    S.sc = C.schoolCalendar(S.terms, S.daysoff);
  }

  /* Adds official terms and holidays that this device has never had.
     Anything you edited or removed is left exactly as you left it. */
  async function importOfficial() {
    let added = 0;
    for (const t of C.OFFICIAL.terms) {
      if (await data.known('terms', t.id)) continue;
      await data.save('terms', { id: t.id, name: t.name, start: t.start, end: t.end, official: { name: t.name, start: t.start, end: t.end } });
      added++;
    }
    for (const d of C.OFFICIAL.daysoff) {
      if (await data.known('daysoff', d.id)) continue;
      await data.save('daysoff', { id: d.id, name: d.name, date: d.date, end: '', official: { name: d.name, date: d.date, end: '' } });
      added++;
    }
    return added;
  }
  async function resetOfficial() {
    for (const t of C.OFFICIAL.terms) await data.save('terms', { id: t.id, name: t.name, start: t.start, end: t.end, official: { name: t.name, start: t.start, end: t.end } });
    for (const d of C.OFFICIAL.daysoff) await data.save('daysoff', { id: d.id, name: d.name, date: d.date, end: '', official: { name: d.name, date: d.date, end: '' } });
  }
  const isEdited = r => !!r.official && Object.keys(r.official).some(k => (r[k] || '') !== (r.official[k] || ''));
  async function refreshStorage() {
    try {
      if (navigator.storage?.persisted) S.storage.persisted = await navigator.storage.persisted();
      if (navigator.storage?.estimate) { const e = await navigator.storage.estimate(); S.storage.usage = e.usage; S.storage.quota = e.quota; }
    } catch (e) { /* not available in this browser */ }
  }

  /* ---------- Views ---------- */
  function vError() {
    return `<div class="solo"><section class="card stack">
      <h1 class="solo-h">Herding Cats can't save on this device</h1>
      <p>This browser isn't letting the app store its data. This usually happens in a private or incognito window, or when site data is blocked in the browser's settings.</p>
      <p class="muted">Details: ${esc(S.error)}</p>
      <div class="row"><button class="btn pri" data-act="retry">Try again</button></div>
    </section></div>`;
  }

  /* An empty list shows the sleeping cat with its message. */
  const emptyCat = msg => `<div class="ecat"><span class="ecat-img" aria-hidden="true">${FH.cats.sleep}</span><p class="empty">${msg}</p></div>`;

  function vSetup() {
    const rows = S.setup.rows;
    return `<div class="solo">
      <div class="hero"><span class="hcat" aria-hidden="true">${FH.cats.welcome}</span><div class="eyebrow">Herding Cats · family calendar</div><h1>Welcome</h1>
        <p class="digest">${S.session ? 'Add your children to get started.' : 'Add your children to get started. Everything you enter stays on this device; nothing is uploaded.'}</p></div>
      <section class="card stack">
        <label class="fld">Family name (optional)<input id="su-family" placeholder="e.g. The Rautenbachs" value="${esc(S.setup.family)}" autocomplete="off"></label>
        <div class="flbl">Children</div>
        <div class="stack" id="su-rows">${rows.map((r, i) => setupRow(r, i)).join('')}</div>
        <div><button class="btn sm addstep" data-act="su-add">${ic('plus')}Add another child</button></div>
        <div class="err" id="su-err" role="alert"></div>
        <div class="row" style="justify-content:space-between">
          <button class="btn" data-act="go-restore">Restore from a backup</button>
          <button class="btn pri" data-act="su-finish">Start using Herding Cats</button>
        </div>
      </section>
      <p class="muted small center">${S.session ? 'For now, what you add stays on this device. Sharing with the rest of your family arrives in the next update.' : 'Setting up a second device? Export a backup on the first device, then choose Restore from a backup here.'}</p>
      ${restoreInput()}
    </div>`;
  }
  function setupRow(r, i) {
    return `<div class="crow" data-i="${i}">
      <span class="avatar" style="--c:var(--${r.colour})">${esc((r.name || '?')[0] || '?')}</span>
      <input id="su-name-${i}" class="su-name" placeholder="Child's first name" value="${esc(r.name)}" aria-label="Child ${i + 1} name" autocomplete="off">
      <select id="su-grade-${i}" class="su-grade" aria-label="Child ${i + 1} grade">${GRADES.map(g => `<option ${g === r.grade ? 'selected' : ''}>${g}</option>`).join('')}</select>
      <div class="swatches" role="radiogroup" aria-label="Colour for child ${i + 1}">${COLOURS.map(([k, n]) => `<button type="button" class="sw" role="radio" aria-checked="${k === r.colour}" aria-label="${n}" title="${n}" data-act="su-col" data-v="${i}|${k}" style="--c:var(--${k})"></button>`).join('')}</div>
      ${rows().length > 1 ? `<button type="button" class="rm" data-act="su-rm" data-v="${i}" aria-label="Remove this child">×</button>` : ''}
    </div>`;
    function rows() { return S.setup.rows; }
  }

  function childCards() {
    if (!S.children.length) return `<section class="card"><p class="empty">No children yet.</p><button class="btn pri" data-act="child-add">Add a child</button></section>`;
    return `<div class="kids">${S.children.map(c => `<button class="kid" style="--c:var(--${esc(c.colour)})" data-act="open-child" data-v="${c.id}">
        <span class="row" style="gap:8px;flex-wrap:nowrap">${avatar(c)}<span class="nm">${esc(c.name)}</span></span>
        <span class="st">${esc(c.grade || '')}</span></button>`).join('')}</div>`;
  }

  const ROLE_LABEL = { owner: 'Family administrator', parent: 'Parent', carer: 'Carer', child_view: 'Child, view only', child_limited: 'Child, limited' };
  function signInCard() {
    const s = S.session;
    if (!s) return '';
    const isOwner = s.role === 'owner';
    return `<section class="card" id="account"><div class="card-h"><h3>Your account</h3><span class="pill on">${esc(ROLE_LABEL[s.role] || s.role)}</span></div>
        <div class="set"><span class="min0"><b>${esc(s.name)}</b><span class="muted"> · ${esc(s.email)}</span></span></div>
        <div class="set"><span class="min0">Family: <b>${esc(S.family || s.familyName)}</b>${isOwner ? '<span class="muted"> · you are its administrator</span>' : ''}</span></div>
        <p class="hint" style="margin-top:8px">Inviting your family, roles for each person and children's logins arrive in the next updates. For now, what you add stays on this device.</p>
        <div class="row" style="margin-top:10px"><button class="btn sm" data-act="acct-signout">Sign out</button></div>
      </section>
      <section class="card"><div class="card-h"><h3>Privacy</h3></div>${FH.account.PRIVACY}</section>`;
  }

  function roadmap() {
    return `<section class="card"><div class="card-h"><h3>Phase 1 build</h3><span class="pill on">Complete</span></div>
      <ol class="ms">${MILESTONES.map(([n, t, d]) => `<li class="${n <= MILESTONE ? 'done' : ''}"><span class="msn">${n}</span><span class="min0"><b>${t}</b><span class="muted"> · ${d}</span></span><span class="pill ${n <= MILESTONE ? 'on' : ''}">${n <= MILESTONE ? 'Done' : 'Coming'}</span></li>`).join('')}</ol></section>`;
  }

  /* ---------- Events (activities and reminders) ---------- */
  const src = () => ({ activities: S.activities, reminders: S.reminders, tasks: S.tasks, exams: S.exams, sessions: S.sessions, sc: S.sc });
  const KLABEL = { act: 'Activity', rem: 'Reminder', task: 'Due', step: 'Step', exam: 'Exam', study: 'Study' };
  /* Category label shown on every calendar item, with the subject where there is one. */
  const ctag = e => `<span class="ctag">${esc(e.cat || KLABEL[e.kind] || '')}${e.subject ? ' · ' + esc(e.subject) : ''}</span>`;
  const stepList = e => e.steps && e.steps.length ? `<span class="evsteps">${e.steps.map(st => `<span class="${st.done || e.done ? 'struck' : ''}">${esc(st.text)}</span>`).join('')}</span>` : '';
  function evRow(e, showDate) {
    return `<button class="ev evb" style="--c:var(--${colOf(e.child)})" data-act="ev" data-v="${e.kind}|${e.id}|${e.date}">
      <span class="t">${showDate ? `${C.DOW[C.dow(e.date)]}<small>${C.toD(e.date).getDate()} ${C.MON[C.toD(e.date).getMonth()]}</small>` : `${e.time || (e.kind === 'task' || e.kind === 'step' ? 'Due' : 'All day')}${e.end ? `<small>${e.end}</small>` : ''}`}</span>
      <span class="bar"></span>
      <span class="min0"><span class="ti ${e.skipped || e.done ? 'struck' : ''}">${esc(e.title)}</span><span class="sub">${ctag(e)} ${esc(nameOf(e.child))}${e.skipped ? ' · skipped this time' : `${showDate && e.time ? ' · ' + e.time : ''}${e.detail ? ' · ' + esc(e.detail) : ''}${e.done ? ' · done' : ''}`}</span>${stepList(e)}</span></button>`;
  }
  function schoolLine(s) {
    const sc = S.sc; if (!sc) return '';
    const t = sc.termOf(s);
    if (t) {
      const wk = Math.floor(C.diffDays(C.startOfWeek(t.start), s) / 7) + 1;
      const wks = Math.floor(C.diffDays(C.startOfWeek(t.start), t.end) / 7) + 1;
      const off = sc.offLabel(s);
      return `${esc(t.name.replace(/ \d{4}$/, ''))} · week ${wk} of ${wks}${off ? ' · ' + esc(off) : ''}`;
    }
    if (sc.covered(s)) { const n = sc.nextTerm(s); return `School holidays${n ? ` · school opens ${C.fmtDay(n.start)}` : ''}`; }
    return '';
  }

  function vToday() {
    const s = C.today();
    const all = new Set(S.children.map(c => c.id));
    const ev = C.eventsOn(s, src(), { visible: all });
    const live = ev.filter(e => !e.skipped);
    const soon = [];
    for (let i = 1; i <= 7; i++) soon.push(...C.eventsOn(C.addDays(s, i), src(), { visible: all, kinds: new Set(['rem']) }));
    const overdueN = S.tasks.filter(x => !x.done && x.due < s).length;
    const t = S.sc?.termOf(s);
    const nt = !t && S.sc?.covered(s) ? S.sc.nextTerm(s) : null;
    const digest = !S.children.length ? 'Add your children to get started.'
      : `<b>${live.length ? `${live.length} ${live.length === 1 ? 'thing' : 'things'} on today` : 'Nothing planned today'}</b>${live.length && S.children.length > 1 ? ` across ${new Set(live.map(e => e.child)).size} ${new Set(live.map(e => e.child)).size === 1 ? 'child' : 'children'}` : ''}. `
        + (soon.length ? `${soon.length} reminder${soon.length === 1 ? '' : 's'} in the next week. ` : '')
        + (overdueN ? `<b class="overdue">${overdueN} overdue task${overdueN === 1 ? '' : 's'}</b>. ` : '')
        + (t ? `School closes ${C.fmtDay(t.end)} (${C.rel(C.diffDays(s, t.end))}).` : nt ? `School opens ${C.fmtDay(nt.start)} (${C.rel(C.diffDays(s, nt.start))}).` : '');
    const backupAge = S.lastBackup ? Math.floor((Date.now() - new Date(S.lastBackup)) / 864e5) : null;
    return `<div class="view">
      <section class="hero"><div class="eyebrow">${S.family ? esc(S.family) + ' · ' : ''}${schoolLine(s) || 'Today'}</div><h1>${C.fmtLong(s)}</h1>
        <p class="digest">${digest}</p>${S.children.length ? '<button class="btn sm" data-act="digest-open" style="margin-top:10px">Daily digest</button>' : ''}</section>
      ${childCards()}
      <div class="cols">
        <div class="stack">
          <section class="card"><div class="card-h"><h3>Today</h3><button class="btn sm" data-act="nav" data-v="calendar">Week view</button></div>
            ${ev.length ? ev.map(e => evRow(e)).join('') : emptyCat('Nothing planned today.')}
            ${!S.activities.length ? `<div class="nudge"><p class="small">Add weekly activities like hockey practice or music lessons. They repeat every week and pause in school holidays.</p><button class="btn sm pri" data-act="add" data-v="activity">Add an activity</button></div>` : ''}
          </section>
          ${dueSoonCard()}
          ${examCountdownCard()}
          ${choresTodayCard()}
          <section class="card"><div class="card-h"><h3>Reminders this week</h3><button class="btn sm" data-act="add" data-v="reminder">Add reminder</button></div>
            ${soon.length ? soon.map(e => evRow(e, true)).join('') : '<p class="empty">No reminders in the next seven days.</p>'}
          </section>
        </div>
        <div class="stack">
          ${approvalsCard()}
          ${backupCard(backupAge)}
          ${S.storage.persisted === false ? `<section class="card warnc"><div class="card-h"><h3>Protect your data</h3></div><p class="small">This browser may clear the app's data when the device runs low on space. Ask it to keep the data, and install the app to your home screen.</p><div class="row" style="margin-top:10px"><button class="btn sm pri" data-act="persist">Keep data on this device</button><button class="btn sm" data-act="nav" data-v="settings">Settings</button></div></section>` : ''}
        </div>
      </div></div>`;
  }
  function backupCard(age) {
    const msg = age === null ? 'No backup has been made on this device yet.' : age === 0 ? 'Last backup: today.' : `Last backup: ${age} day${age === 1 ? '' : 's'} ago.`;
    const due = age === null || age > 7;
    return `<section class="card${due ? ' warnc' : ''}"><div class="card-h"><h3>${due ? 'Time for a backup' : 'Backup'}</h3></div><p class="small">${msg} A backup is also how you copy your data to your other device.</p><div class="row" style="margin-top:10px"><button class="btn sm" data-act="nav" data-v="settings" data-scroll="backup">Make a backup</button></div></section>`;
  }

  function vComing(key) {
    const c = COMING[key];
    return `<div class="view"><section class="card coming">
      <div class="eyebrow">Arrives in milestone ${c.m}</div><h2 class="solo-h">${c.title}</h2><p>${c.text}</p>
      <p class="muted small">You confirmed this screen in the prototype. It will be built after milestone ${c.m - 1} has been tested.</p>
    </section></div>`;
  }

  function vChild(id) {
    const c = S.children.find(x => x.id === id);
    if (!c) return `<div class="view"><section class="card"><p class="empty">This child was removed.</p><button class="btn" data-act="nav" data-v="today">Back to Today</button></section></div>`;
    return `<div class="view">
      <div class="phead">${avatar(c, true)}<div class="min0" style="flex:1"><h1>${esc(c.name)}</h1><div class="muted">${esc(c.grade || '')} · ${colName(c.colour)}</div></div>
        <button class="btn" data-act="child-edit" data-v="${c.id}">Edit</button></div>
      <section class="card" style="margin-bottom:14px"><div class="card-h"><h3>Today · ${C.fmtDay(C.today())}</h3><button class="btn sm" data-act="only-child" data-v="${c.id}">Week view</button></div>
        ${(() => { const ev = C.eventsOn(C.today(), src(), { visible: new Set([c.id]) }); return ev.length ? ev.map(e => evRow(e)).join('') : emptyCat('Nothing planned today.'); })()}</section>
      <div class="cols">
        <section class="card"><div class="card-h"><h3>Weekly activities</h3><button class="btn sm" data-act="add" data-v="activity" data-child="${c.id}">Add</button></div>
          ${weeklyList(c.id)}</section>
        <section class="card"><div class="card-h"><h3>Upcoming reminders</h3><button class="btn sm" data-act="add" data-v="reminder" data-child="${c.id}">Add</button></div>
          ${upcomingReminders(c.id)}</section>
        <section class="card"><div class="card-h"><h3>Homework and projects</h3><button class="btn sm" data-act="add" data-v="task" data-child="${c.id}">Add</button></div>
          ${taskRows(S.tasks.filter(t => t.owner === c.id && !t.done).sort(byDue), true) || emptyCat('No open homework or projects.')}</section>
        <section class="card"><div class="card-h"><h3>Upcoming exams</h3><button class="btn sm" data-act="nav" data-v="study">Study planner</button></div>${studyProgress(c.id)}${examRows(S.exams.filter(x => x.owner === c.id && x.date >= C.today()).sort(byDate).slice(0, 8), true) || '<p class="empty">No exams coming up.</p>'}</section>
        ${childMoneyCard(c.id)}
        <section class="card"><div class="card-h"><h3>Chores and reward goals</h3><button class="btn sm" data-act="money-child" data-v="${c.id}">Open</button></div>
          ${S.chores.filter(x => x.owner === c.id).map(x => choreCard(x, true)).join('')}${S.rewards.filter(x => x.owner === c.id).map(rewardCard).join('')}
          ${!S.chores.some(x => x.owner === c.id) && !S.rewards.some(x => x.owner === c.id) ? '<p class="empty">No chores or reward goals yet.</p>' : ''}</section>
      </div></div>`;
  }

  const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
  const daysText = wd => {
    const sorted = WEEK_ORDER.filter(d => wd.includes(d));
    if (sorted.length === 7) return 'Every day';
    if (sorted.length === 5 && !wd.includes(0) && !wd.includes(6)) return 'Weekdays';
    return sorted.map(d => C.DOW[d]).join(', ');
  };
  const actSummary = a => `${daysText(a.weekdays)}${a.start ? `, ${a.start}${a.end ? '–' + a.end : ''}` : ''}${a.place ? ` · ${esc(a.place)}` : ''}${a.runsInHolidays ? ' · also in holidays' : ''}${a.until ? ` · until ${C.fmtDate(a.until)}` : ''}`;
  function weeklyList(childId) {
    const acts = S.activities.filter(a => a.owner === childId && (!a.until || a.until >= C.today()));
    if (!acts.length) return '<p class="empty">No weekly activities yet.</p>';
    const rows = [];
    for (const d of WEEK_ORDER) for (const a of acts.filter(x => x.weekdays.includes(d)).sort((x, y) => (x.start || '').localeCompare(y.start || ''))) rows.push({ d, a });
    return rows.map(({ d, a }) => `<button class="ev evb" style="--c:var(--${colOf(childId)})" data-act="act-edit" data-v="${a.id}">
      <span class="t">${C.DOW[d]}</span><span class="bar"></span>
      <span class="min0"><span class="ti">${esc(a.title)}</span><span class="sub">${a.start ? `${a.start}${a.end ? '–' + a.end : ''}` : 'Any time'}${a.place ? ` · ${esc(a.place)}` : ''}${a.runsInHolidays ? ' · also in holidays' : ''}</span></span>
      <span class="tag act">Edit</span></button>`).join('');
  }
  function upcomingReminders(childId) {
    const s = C.today();
    const list = S.reminders.filter(r => r.owner === childId).map(r => ({ r, d: C.nextReminder(r, s) })).filter(x => x.d && C.diffDays(s, x.d) <= 60).sort((x, y) => x.d.localeCompare(y.d));
    if (!list.length) return '<p class="empty">No reminders in the next two months.</p>';
    return list.map(({ r, d }) => evRow({ kind: 'rem', id: r.id, child: childId, date: d, time: r.time || '', title: r.title, cat: 'Reminder', subject: '', detail: r.repeat && r.repeat !== 'none' ? C.REPEATS.find(x => x[0] === r.repeat)[1] : '' }, true)).join('');
  }

  /* ---------- Tasks (homework and projects) ---------- */
  const byDue = (a, b) => (a.due || '').localeCompare(b.due || '') || (PRIO[a.priority] ?? 1) - (PRIO[b.priority] ?? 1);
  const PRIO = { High: 0, Medium: 1, Low: 2 };
  const PRIOS = ['High', 'Medium', 'Low'];
  const sid = () => Math.random().toString(36).slice(2, 10);
  function dueText(t) {
    const n = C.diffDays(C.today(), t.due);
    return `due ${C.fmtDay(t.due)} <span class="${n < 0 && !t.done ? 'overdue' : ''}">(${C.rel(n)})</span>`;
  }
  function taskRows(list, compact) {
    return list.map(t => {
      const open = S.openTask === t.id;
      const steps = t.steps || [];
      const sd = steps.filter(x => x.done).length;
      return `<div class="task" style="--c:var(--${colOf(t.owner)})">
        <button class="cb" role="checkbox" aria-checked="${!!t.done}" aria-label="Mark ${esc(t.title)} done" data-act="task-done" data-v="${t.id}">${ic('check')}</button>
        <div class="min0">
          <button class="ti ${t.done ? 'struck' : ''}" data-act="task-open" data-v="${t.id}" aria-expanded="${open}">${esc(t.title)}</button>
          <div class="sub">${compact ? '' : esc(nameOf(t.owner)) + ' · '}${t.subject ? esc(t.subject) + ' ' : ''}${esc((t.type || 'Homework').toLowerCase())} · ${dueText(t)}${steps.length ? ` · ${sd}/${steps.length} steps` : ''}${t.notes ? ' · notes' : ''}</div>
          ${open && t.notes ? `<div class="tnotes">${esc(t.notes)}</div>` : ''}
          ${open && steps.length ? `<ul class="subs">${steps.map(x => `<li><button class="cb" role="checkbox" aria-checked="${!!x.done}" aria-label="${esc(x.text)}" data-act="step-done" data-v="${t.id}|${x.id}">${ic('check')}</button><span class="${x.done || t.done ? 'struck' : ''}">${esc(x.text)}</span>${x.due ? `<span class="sd ${!x.done && !t.done && x.due < C.today() ? 'overdue' : ''}">${C.fmtDay(x.due)}</span>` : ''}</li>`).join('')}</ul>` : ''}
        </div>
        <div class="tside"><span class="tag ${(t.priority || 'Medium').toLowerCase()}">${esc(t.priority || 'Medium')}</span><button class="btn sm" data-act="task-edit" data-v="${t.id}" aria-label="Edit ${esc(t.title)}">Edit</button></div>
      </div>`;
    }).join('');
  }
  /* A step listed on its own in the Tasks screen, under the week it is due. */
  function stepItemRow(t, x) {
    const n = C.diffDays(C.today(), x.due);
    return `<div class="task stepitem" style="--c:var(--${colOf(t.owner)})">
      <button class="cb" role="checkbox" aria-checked="${!!x.done}" aria-label="Mark step ${esc(x.text)} done" data-act="step-done" data-v="${t.id}|${x.id}">${ic('check')}</button>
      <div class="min0">
        <button class="ti" data-act="ev" data-v="step|${t.id}|${x.due}">${esc(x.text)}</button>
        <div class="sub"><span class="ctag">Step${t.subject ? ' · ' + esc(t.subject) : ''}</span> ${esc(nameOf(t.owner))} · of ${esc(t.title)} · due ${C.fmtDay(x.due)} <span class="${n < 0 ? 'overdue' : ''}">(${C.rel(n)})</span></div>
      </div>
      <div class="tside"><span class="tag step">Step</span><button class="btn sm" data-act="task-edit" data-v="${t.id}" aria-label="Edit ${esc(t.title)}">Edit</button></div>
    </div>`;
  }
  function vTasks() {
    const f = S.taskFilter;
    const s = C.today();
    const vis = visibleSet();
    const list = S.tasks.filter(t => vis.has(t.owner) && (f === 'all' || (f === 'done') === !!t.done)).sort(byDue);
    /* Weeks run Monday to Sunday. Open steps with their own date are listed in the
       group for that date, as well as under their task. */
    const weekEnd = C.addDays(C.startOfWeek(s), 6), nextEnd = C.addDays(weekEnd, 7);
    const bucket = d => d < s ? 'over' : d <= weekEnd ? 'this' : d <= nextEnd ? 'next' : 'later';
    const items = [];
    for (const t of list.filter(x => !x.done)) {
      items.push({ due: t.due, task: t });
      for (const x of t.steps || []) if (x.due && !x.done) items.push({ due: x.due, task: t, step: x });
    }
    const pick = k => items.filter(it => bucket(it.due) === k).sort((p, q) => p.due.localeCompare(q.due) || (p.step ? 0 : 1) - (q.step ? 0 : 1));
    const groups = f === 'done' ? [['Done', list.slice().reverse().map(t => ({ task: t }))]] : [
      ['Overdue', pick('over')],
      [`This week · until ${C.fmtDay(weekEnd)}`, pick('this')],
      [`Next week · ${C.fmtDay(C.addDays(weekEnd, 1))} – ${C.fmtDay(nextEnd)}`, pick('next')],
      ['Later', pick('later')],
      ...(f === 'all' ? [['Done', list.filter(t => t.done).reverse().map(t => ({ task: t }))]] : []),
    ];
    const shown = groups.filter(g => g[1].length).map(([h, its]) => [h, its, its.filter(i => !i.step).length, its.filter(i => i.step).length]);
    return `<div class="view">
      <div class="calbar"><div class="ttl">Homework and projects</div>
        <div class="seg" role="group">${[['open', 'Open'], ['done', 'Done'], ['all', 'All']].map(([v2, l]) => `<button data-act="tfilter" data-v="${v2}" aria-pressed="${v2 === f}">${l}</button>`).join('')}</div></div>
      <div class="filters">${toggles()}</div>
      <div class="stack">${shown.map(([h, its, nT, nS]) => `<section class="card"><div class="card-h"><h3>${h}</h3><span class="muted" style="font-size:13px">${[nT ? `${nT} ${nT === 1 ? 'task' : 'tasks'}` : '', nS ? `${nS} ${nS === 1 ? 'step' : 'steps'}` : ''].filter(Boolean).join(' · ')}</span></div>${its.map(it => it.step ? stepItemRow(it.task, it.step) : taskRows([it.task])).join('')}</section>`).join('')
        || `<section class="card">${emptyCat(S.tasks.length ? 'No tasks match these filters.' : 'No homework or projects yet.')}${S.tasks.length ? '' : '<button class="btn pri" data-act="add" data-v="task">Add homework or a project</button>'}</section>`}</div>
    </div>`;
  }
  function dueSoonCard() {
    const s = C.today(), end = C.addDays(s, 3);
    const overdue = S.tasks.filter(t => !t.done && t.due < s).sort(byDue);
    const soon = S.tasks.filter(t => !t.done && t.due >= s && t.due <= end).sort(byDue);
    const steps = [];
    for (const t of S.tasks) if (!t.done) for (const x of t.steps || []) if (!x.done && x.due && x.due <= end) steps.push({ t, x });
    if (!overdue.length && !soon.length && !steps.length) return '';
    const row = (t, label, late) => `<button class="ev evb" style="--c:var(--${colOf(t.owner)})" data-act="ev" data-v="task|${t.id}|${t.due}"><span class="t ${late ? 'overdue' : ''}">${C.DOW[C.dow(t.due)]}<small>${C.toD(t.due).getDate()} ${C.MON[C.toD(t.due).getMonth()]}</small></span><span class="bar"></span><span class="min0"><span class="ti">${esc(t.title)}</span><span class="sub">${esc(nameOf(t.owner))} · ${label}</span></span><span class="tag ${late ? 'high' : 'task'}">${late ? 'Late' : 'Due'}</span></button>`;
    return `<section class="card"><div class="card-h"><h3>Overdue and due soon</h3><button class="btn sm" data-act="nav" data-v="tasks">All tasks</button></div>
      ${overdue.map(t => row(t, `<span class="overdue">overdue</span>`, true)).join('')}
      ${soon.map(t => row(t, `${esc(t.subject || '')} ${esc((t.type || '').toLowerCase())} ${C.rel(C.diffDays(s, t.due))}`, false)).join('')}
      ${steps.sort((a, b) => a.x.due.localeCompare(b.x.due)).map(({ t, x }) => `<button class="ev evb" style="--c:var(--${colOf(t.owner)})" data-act="ev" data-v="step|${t.id}|${x.due}"><span class="t ${x.due < s ? 'overdue' : ''}">${C.DOW[C.dow(x.due)]}<small>${C.toD(x.due).getDate()} ${C.MON[C.toD(x.due).getMonth()]}</small></span><span class="bar"></span><span class="min0"><span class="ti">${esc(x.text)}</span><span class="sub">${esc(nameOf(t.owner))} · step of ${esc(t.title)}</span></span><span class="tag task">Step</span></button>`).join('')}
    </section>`;
  }

  /* ---------- Study planner ---------- */
  const ST = FH.study;
  const byDate = (a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''));
  const periodsSorted = () => S.periods.slice().sort((a, b) => {
    const fa = S.exams.filter(x => x.period === a.id).map(x => x.date).sort()[0] || a.createdAt || '';
    const fb = S.exams.filter(x => x.period === b.id).map(x => x.date).sort()[0] || b.createdAt || '';
    return fa.localeCompare(fb);
  });
  const examTitle = x => `${x.subject}${x.paper ? ' ' + x.paper : ''}`;
  function examRows(list, withChild) {
    const s = C.today();
    return list.map(x => {
      const n = C.diffDays(s, x.date);
      return `<button class="ev evb" style="--c:var(--${colOf(x.owner)})" data-act="exam-edit" data-v="${x.id}">
        <span class="t">${C.DOW[C.dow(x.date)]}<small>${C.toD(x.date).getDate()} ${C.MON[C.toD(x.date).getMonth()]}</small></span><span class="bar"></span>
        <span class="min0"><span class="ti">${esc(examTitle(x))}</span><span class="sub"><span class="ctag">Exam</span> ${withChild ? esc(nameOf(x.owner)) + ' · ' : ''}${x.time ? x.time : 'time not set'}${x.mins ? ` · ${x.mins} min` : ''}</span></span>
        ${n >= 0 ? `<span class="countdown">${n}<small>${n === 1 ? 'day' : 'days'}</small></span>` : '<span class="tag">Written</span>'}</button>`;
    }).join('');
  }
  function examCountdownCard() {
    const s = C.today();
    const list = S.exams.filter(x => x.date >= s && C.diffDays(s, x.date) <= 21).sort(byDate);
    if (!list.length) return '';
    return `<section class="card"><div class="card-h"><h3>Exams, next 3 weeks</h3><button class="btn sm" data-act="nav" data-v="study">Study planner</button></div>${examRows(list.slice(0, 6), true)}${list.length > 6 ? `<p class="meta" style="margin-top:6px">${list.length - 6} more in the study planner</p>` : ''}</section>`;
  }

  function vStudy() {
    const st = S.study;
    const periods = periodsSorted();
    const p = periods.find(x => x.id === st.period) || null;
    const head = `<div class="calbar"><div class="ttl">Exam periods</div><button class="btn" data-act="period-add">New exam period</button></div>
      ${periods.length ? `<div class="toggles" style="margin-bottom:14px">${periods.map(x => `<button class="tg" style="--c:var(--${colOf(x.owner)})" data-act="study-period" data-v="${x.id}" aria-pressed="${x.id === st.period}"><span class="dot"></span>${esc(nameOf(x.owner))} · ${esc(x.name)}</button>`).join('')}</div>` : ''}`;
    if (!p) return `<div class="view">${head}<section class="card coming"><span class="ecat-img" aria-hidden="true">${FH.cats.sleep}</span><h2 class="solo-h">Plan for exams</h2><p>Create an exam period for a child, add the exams (from a photo of the timetable, by pasting it, or one by one), and Herding Cats builds a revision plan you can adjust and tick off.</p><div><button class="btn pri" data-act="period-add">New exam period</button></div></section></div>`;
    if (st.imp && st.imp.period === p.id) return `<div class="view">${head}${importPanel(p)}</div>`;
    const exams = S.exams.filter(x => x.period === p.id).sort(byDate);
    const sess = S.sessions.filter(x => x.period === p.id).sort(byDate);
    const range = exams.length ? `${C.fmtDay(exams[0].date)} – ${C.fmtDay(exams[exams.length - 1].date)} ${exams[exams.length - 1].date.slice(0, 4)}` : 'No exams added yet';
    const doneN = sess.filter(x => x.done).length;
    return `<div class="view">${head}
      <section class="card phead2" style="--c:var(--${colOf(p.owner)})"><div class="row" style="justify-content:space-between;align-items:flex-start">
        <div class="min0"><div class="eyebrow">${esc(nameOf(p.owner))}</div><h2 class="solo-h">${esc(p.name)}</h2><p class="meta">${range} · ${exams.length} ${exams.length === 1 ? 'exam' : 'exams'}${sess.length ? ` · ${doneN} of ${sess.length} sessions done` : ''}</p></div>
        <button class="btn sm" data-act="period-edit" data-v="${p.id}">Edit</button></div>
        ${sess.length ? `<div class="track" style="margin-top:10px"><div class="fill" style="width:${Math.round(doneN / sess.length * 100)}%;--c:var(--${colOf(p.owner)})"></div></div>` : ''}
      </section>
      <div class="seg" role="group" style="margin:14px 0">${[['exams', `Exams (${exams.length})`], ['plan', `Revision plan (${sess.length})`]].map(([k, l]) => `<button data-act="study-tab" data-v="${k}" aria-pressed="${st.tab === k}">${l}</button>`).join('')}</div>
      ${st.tab === 'plan' ? planView(p, exams, sess) : `<section class="card"><div class="card-h"><h3>Exams</h3></div>
        ${exams.length ? examRows(exams) : emptyCat('No exams yet. Read them from the school\'s timetable, or add them one by one.')}
        <div class="row" style="margin-top:12px"><button class="btn pri" data-act="imp-start">Read exam timetable</button><button class="btn" data-act="exam-add">Add exam</button></div>
        ${exams.length && !sess.length ? `<div class="nudge"><p class="small">Exams added. Next, build the revision plan.</p><button class="btn sm pri" data-act="study-tab" data-v="plan">Go to revision plan</button></div>` : ''}
      </section>`}
    </div>`;
  }

  function planView(p, exams, sess) {
    const s = C.today();
    const future = exams.filter(x => x.date >= s);
    if (!sess.length) return `<section class="card stack">
      <p>The plan adds four sessions before each exam: summary notes (10 days before), practice questions (6 days), a past paper (3 days) and a final revision (the day before, 90 minutes).</p>
      <p class="meta">At most two sessions a day, at 17:30 and 19:00 on school days and 10:00 and 14:00 on weekends. Days already past are skipped. Every session can be moved, changed or deleted afterwards.</p>
      <div class="row"><button class="btn pri" data-act="plan-build" ${future.length ? '' : 'disabled'}>Build revision plan</button>${future.length ? '' : '<span class="meta">Add exams that are still coming up first.</span>'}</div>
    </section>`;
    const byDay = new Map();
    for (const x of sess) { if (!byDay.has(x.date)) byDay.set(x.date, []); byDay.get(x.date).push(x); }
    const upcoming = [...byDay.entries()].filter(([d]) => d >= s);
    const past = [...byDay.entries()].filter(([d]) => d < s);
    const dayBlock = ([d, xs]) => `<div class="dategrp">${C.fmtDay(d)}${d === s ? ' · today' : ''}</div>${xs.map(x => `<div class="sess" style="--c:var(--${colOf(x.owner)})">
        <button class="cb" role="checkbox" aria-checked="${!!x.done}" aria-label="Mark ${esc(x.subject)} session done" data-act="sess-done" data-v="${x.id}">${ic('check')}</button>
        <span class="stime">${x.time || ''}</span>
        <button class="min0 slink ${x.done ? 'struck' : ''}" data-act="sess-edit" data-v="${x.id}">${esc(x.subject)} <span class="muted">· ${esc(x.label)}${x.mins ? `, ${x.mins} min` : ''}</span></button></div>`).join('')}`;
    const prog = exams.map(e => { const xs = sess.filter(x => x.exam === e.id); const dn = xs.filter(x => x.done).length; return `<div class="prog" style="--c:var(--${colOf(e.owner)})"><span class="min0"><b>${esc(examTitle(e))}</b> <span class="muted">· ${C.fmtDay(e.date)}</span></span><span class="muted" style="font-size:13px">${dn}/${xs.length}</span><div class="track"><div class="fill" style="width:${xs.length ? Math.round(dn / xs.length * 100) : 0}%"></div></div></div>`; }).join('');
    return `<div class="cols">
      <section class="card"><div class="card-h"><h3>Sessions</h3><button class="btn sm" data-act="sess-add">Add session</button></div>
        ${upcoming.length ? upcoming.map(dayBlock).join('') : emptyCat('No sessions left. Good luck!')}
        ${past.length ? `<details class="pastsess"><summary>Earlier sessions (${past.reduce((n, [, xs]) => n + xs.length, 0)})</summary>${past.reverse().map(dayBlock).join('')}</details>` : ''}
      </section>
      <div class="stack">
        <section class="card"><div class="card-h"><h3>Progress per exam</h3></div>${prog || '<p class="empty">No exams.</p>'}</section>
        <section class="card"><div class="card-h"><h3>Change the plan</h3></div>
          <p class="small">Rebuilding replaces the sessions still to come that aren't ticked off. Sessions you've done, and earlier ones, stay.</p>
          <div class="row" style="margin-top:10px"><button class="btn sm del" data-act="plan-rebuild">Rebuild plan</button></div></section>
      </div></div>`;
  }

  /* Timetable import: choose a photo or paste text, then review before saving. */
  function importPanel(p) {
    const im = S.study.imp;
    if (im.stage === 'reading') return `<section class="card stack"><h2 class="solo-h">Reading the timetable…</h2>
      <p class="small">${esc(im.status || 'Starting')}</p>
      <div class="track"><div class="fill" style="width:${Math.round((im.progress || 0) * 100)}%;--c:var(--accent)"></div></div>
      <p class="meta">This happens on your device; the photo is not uploaded. The first time, the reader downloads about 5 MB.</p>
      <div><button class="btn" data-act="imp-cancel">Cancel</button></div></section>`;
    if (im.stage === 'review') {
      const flagged = im.rows.filter(r => r.flag).length;
      return `<section class="card stack"><div class="card-h" style="margin:0"><h3>Check the exams</h3><span class="meta">${im.rows.length} found${flagged ? ` · ${flagged} to check` : ''}</span></div>
        <p class="small">Text read from a photo is never perfect. Correct anything highlighted, remove lines that aren't exams, then save.</p>
        ${im.photo ? `<details class="photoref"><summary>Show the photo</summary><img src="${im.photo}" alt="Your timetable photo"></details>` : ''}
        <datalist id="subjects">${ST.SUBJECTS.map(([n]) => `<option value="${esc(n)}">`).join('')}</datalist>
        <div class="tbl"><table class="imp"><thead><tr><th>Subject</th><th>Paper</th><th>Date</th><th>Start</th><th></th></tr></thead><tbody>
          ${im.rows.map((r, i) => `<tr class="${r.flag ? 'flag' : ''}" data-i="${i}">
            <td><input id="ir-s-${i}" class="ir-s" list="subjects" value="${esc(r.subject)}" aria-label="Subject">${r.flag ? `<div class="flagnote">${esc(r.flag)}</div>` : ''}</td>
            <td style="width:76px"><input id="ir-p-${i}" class="ir-p" value="${esc(r.paper)}" aria-label="Paper" placeholder="P1"></td>
            <td style="width:150px"><input id="ir-d-${i}" class="ir-d" type="date" value="${r.date}" aria-label="Date"></td>
            <td style="width:104px"><input id="ir-t-${i}" class="ir-t" type="time" value="${r.time}" aria-label="Start time"></td>
            <td style="width:44px"><button type="button" class="rm" data-act="imp-row-rm" data-v="${i}" aria-label="Remove this line">×</button></td></tr>`).join('')}
        </tbody></table></div>
        ${im.rows.length ? '' : '<p class="empty">No exams were found in the text. Add them below, or try a sharper photo taken straight on.</p>'}
        ${im.text ? `<details class="photoref"><summary>Show the text that was read</summary><pre>${esc(im.text)}</pre></details>` : ''}
        <div class="err" id="imp-err" role="alert"></div>
        <div class="row" style="justify-content:space-between"><button class="btn" data-act="imp-row-add">Add a line</button>
          <span class="row"><button class="btn" data-act="imp-cancel">Cancel</button><button class="btn pri" data-act="imp-save">Save ${im.rows.length || ''} ${im.rows.length === 1 ? 'exam' : 'exams'}</button></span></div>
      </section>`;
    }
    return `<section class="card stack"><h2 class="solo-h">Read the exam timetable</h2>
      <p class="small">Take a photo of the timetable the school sent, or choose one from your photos. For the best result, photograph it straight on, in good light, with the whole table in view.</p>
      ${inFrame ? '<p class="hint">Photo reading works in the installed app. In this test link, paste the timetable text below instead.</p>' : ''}
      <div class="row"><label class="btn pri${inFrame ? ' disabled' : ''}" for="imp-photo">Choose or take a photo</label><input type="file" id="imp-photo" accept="image/*" hidden ${inFrame ? 'disabled' : ''}></div>
      <label class="fld">Or paste the timetable text (for example from an email or WhatsApp)<textarea id="imp-text" rows="6" placeholder="Tue 3 Nov  08:30  Mathematics P1&#10;Thu 5 Nov  08:30  English HL P1"></textarea></label>
      <div class="err" id="imp-err" role="alert">${esc(im.error || '')}</div>
      <div class="row"><button class="btn" data-act="imp-cancel">Cancel</button><button class="btn pri" data-act="imp-text">Read the text</button><button class="btn" data-act="imp-manual">Type them in instead</button></div>
    </section>`;
  }

  function periodSheet() {
    const sh = S.sheet;
    const p = sh.id ? S.periods.find(x => x.id === sh.id) : null;
    const kid = kidOf(p ? p.owner : sh.child) || S.children[0];
    const month = C.MONL[new Date().getMonth()];
    return panel(p ? `Edit ${esc(p.name)}` : 'New exam period', `
      <form class="form" data-form="period" style="margin-top:14px">
        ${childSelect(p ? p.owner : kid?.id)}
        <label>Name<input id="f-title" value="${esc(p?.name || `${kid?.grade ? kid.grade + ' ' : ''}${month} exams`)}" autocomplete="off"></label>
        ${p ? `<p class="hint full">Deleting the period also deletes its exams and revision sessions.</p>` : ''}
        <div class="err full" id="f-err" role="alert"></div>
        <div class="actions full">${p ? delBtn(sh, 'this exam period') : ''}<button type="button" class="btn" data-act="close">Cancel</button><button class="btn pri" type="submit">${p ? 'Save' : 'Create'}</button></div>
      </form>`);
  }
  function examSheet() {
    const sh = S.sheet;
    const x = sh.id ? S.exams.find(e => e.id === sh.id) : null;
    const planned = x ? S.sessions.filter(s2 => s2.exam === x.id).length : 0;
    return panel(x ? `Edit ${esc(examTitle(x))}` : 'Add an exam', `
      <datalist id="subjects">${ST.SUBJECTS.map(([n]) => `<option value="${esc(n)}">`).join('')}</datalist>
      <form class="form" data-form="exam" style="margin-top:14px">
        <label>Subject<input id="f-title" list="subjects" value="${esc(x?.subject || '')}" placeholder="e.g. Mathematics" autocomplete="off"></label>
        <label>Paper (optional)<input id="f-paper" value="${esc(x?.paper || '')}" placeholder="e.g. P1" autocomplete="off"></label>
        <label>Date<input id="f-date" type="date" value="${x?.date || ''}"></label>
        <label>Start time<input id="f-time" type="time" value="${x?.time || '08:30'}"></label>
        <label>Length in minutes (optional)<input id="f-mins" inputmode="numeric" value="${x?.mins || ''}" placeholder="e.g. 120"></label>
        ${planned ? `<p class="hint full">This exam has ${planned} revision sessions. If you change the date, rebuild the plan to move them.</p>` : ''}
        <div class="err full" id="f-err" role="alert"></div>
        <div class="actions full">${x ? delBtn(sh, 'this exam') : ''}<button type="button" class="btn" data-act="close">Cancel</button><button class="btn pri" type="submit">${x ? 'Save' : 'Add exam'}</button></div>
      </form>`);
  }
  function sessionSheet() {
    const sh = S.sheet;
    const x = sh.id ? S.sessions.find(e => e.id === sh.id) : null;
    const pexams = S.exams.filter(e => e.period === (x ? x.period : sh.period)).sort(byDate);
    return panel(x ? `${esc(x.subject)}` : 'Add a study session', `
      <form class="form" data-form="session" style="margin-top:14px">
        <label class="full">For exam<select id="f-exam">${pexams.map(e => `<option value="${e.id}" ${e.id === x?.exam ? 'selected' : ''}>${esc(examTitle(e))} · ${C.fmtDay(e.date)}</option>`).join('')}</select></label>
        <label>Date<input id="f-date" type="date" value="${x?.date || C.today()}"></label>
        <label>Start<input id="f-time" type="time" value="${x?.time || '17:30'}"></label>
        <label>Minutes<input id="f-mins" inputmode="numeric" value="${x?.mins || 60}"></label>
        <label>What to do<input id="f-title" value="${esc(x?.label || 'Revision')}" autocomplete="off"></label>
        ${x ? `<label class="chk full"><input id="f-done" type="checkbox" ${x.done ? 'checked' : ''}>Done</label>` : ''}
        <div class="err full" id="f-err" role="alert"></div>
        <div class="actions full">${x ? delBtn(sh, 'this session') : ''}<button type="button" class="btn" data-act="close">Cancel</button><button class="btn pri" type="submit">${x ? 'Save' : 'Add session'}</button></div>
      </form>`);
  }

  async function savePeriod() {
    const sh = S.sheet;
    const name = val('#f-title');
    if (!name) return fail('Give the exam period a name, for example Grade 10 November exams.');
    const rec = { owner: val('#f-child'), name };
    if (sh.id) rec.id = sh.id;
    const saved = await data.save('periods', rec);
    if (sh.id) for (const st of ['exams', 'sessions']) for (const x of S[st].filter(r => r.period === sh.id && r.owner !== rec.owner)) await data.save(st, { id: x.id, owner: rec.owner });
    S.sheet = null; S.study.period = saved.id; if (!sh.id) S.study.tab = 'exams'; await load(); go('study');
    toast(sh.id ? 'Exam period saved.' : `${name} created. Add the exams next.`);
    return true;
  }
  async function saveExam() {
    const sh = S.sheet;
    const p = S.periods.find(x => x.id === (sh.id ? S.exams.find(e => e.id === sh.id).period : S.study.period));
    const subject = val('#f-title'), date = val('#f-date'), time = val('#f-time'), minsS = val('#f-mins');
    if (!subject) return fail('Enter the subject.');
    if (!C.isDate(date)) return fail('Choose the exam date.');
    if (time && !C.isTime(time)) return fail('The start time is not a valid time.');
    const mins = minsS ? parseInt(minsS, 10) : 0;
    if (minsS && !(mins > 0 && mins < 600)) return fail('Enter the length in minutes, for example 120.');
    const rec = { owner: p.owner, period: p.id, subject, paper: val('#f-paper').toUpperCase(), date, time, mins };
    if (sh.id) rec.id = sh.id;
    await data.save('exams', rec);
    if (sh.id) for (const x of S.sessions.filter(r => r.exam === sh.id)) await data.save('sessions', { id: x.id, subject: `${subject}${rec.paper ? ' ' + rec.paper : ''}` });
    S.sheet = null; await load(); render();
    toast(`${subject}${rec.paper ? ' ' + rec.paper : ''} ${sh.id ? 'saved' : 'added'} for ${C.fmtDay(date)}.`);
    return true;
  }
  async function saveSession() {
    const sh = S.sheet;
    const ex = S.exams.find(e => e.id === val('#f-exam'));
    const date = val('#f-date'), time = val('#f-time'), mins = parseInt(val('#f-mins'), 10), label = val('#f-title');
    if (!ex) return fail('Choose the exam this session is for.');
    if (!C.isDate(date)) return fail('Choose the date.');
    if (date > ex.date) return fail(`This is after the exam (${C.fmtDay(ex.date)}). Choose an earlier date.`);
    if (!C.isTime(time)) return fail('Enter the start time.');
    if (!(mins > 0 && mins <= 300)) return fail('Enter the minutes, for example 60.');
    const rec = { owner: ex.owner, period: ex.period, exam: ex.id, subject: examTitle(ex), date, time, mins, label: label || 'Revision' };
    if (sh.id) { rec.id = sh.id; rec.done = !!$('#f-done')?.checked; } else rec.done = false;
    await data.save('sessions', rec);
    S.sheet = null; await load(); render();
    toast(sh.id ? 'Session saved.' : `Session added for ${C.fmtDay(date)}.`);
    return true;
  }
  async function buildPlan(rebuild) {
    const p = S.periods.find(x => x.id === S.study.period);
    const s = C.today();
    const exams = S.exams.filter(x => x.period === p.id && x.date >= s);
    if (rebuild) for (const x of S.sessions.filter(r => r.period === p.id && !r.done && r.date >= s)) await data.remove('sessions', x.id);
    await load();
    const keep = S.sessions.filter(r => r.period === p.id);
    const examsNeeding = exams.filter(e => !keep.some(k => k.exam === e.id && k.date >= s) || rebuild);
    const busy = S.sessions.filter(x => x.owner === p.owner && x.date >= s).map(x => x.date);
    /* Don't plan a step again that's already been done (for example a ticked-off past paper). */
    const plan = ST.buildPlan(examsNeeding, busy, s).filter(x => !keep.some(k => k.exam === x.exam && k.label === x.label && k.done));
    for (const x of plan) await data.save('sessions', { ...x, owner: p.owner, period: p.id });
    await load(); render();
    toast(plan.length ? `${plan.length} revision sessions added. They're on the calendar too.` : 'No new sessions could be added: the exams are too close or the days are full.');
  }

  /* Photo reading: the Tesseract library is loaded only when you first use it. */
  function loadReader() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    return new Promise((res, rej) => {
      const sc = document.createElement('script');
      sc.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
      sc.onload = () => (window.Tesseract ? res(window.Tesseract) : rej(new Error('reader missing')));
      sc.onerror = () => rej(new Error("The photo reader couldn't be downloaded. Connect to the internet and try again; after the first time it's kept on this device."));
      document.head.appendChild(sc);
    });
  }
  async function shrink(file) {
    try {
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, 2200 / Math.max(bmp.width, bmp.height));
      const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
      const g = cv.getContext('2d'); g.filter = 'grayscale(1) contrast(1.3)'; g.drawImage(bmp, 0, 0, cv.width, cv.height);
      return cv;
    } catch (e) { return file; }
  }
  async function readPhoto(file) {
    const im = S.study.imp;
    const run = im.run = Date.now();
    im.stage = 'reading'; im.progress = 0; im.status = 'Preparing the photo'; im.error = '';
    try { if (im.photo) URL.revokeObjectURL(im.photo); } catch (e) { /* ignore */ }
    im.photo = URL.createObjectURL(file);
    render();
    try {
      const T = await loadReader();
      if (S.study.imp?.run !== run) return;
      im.status = 'Loading the reader'; render();
      const img = await shrink(file);
      const res = await T.recognize(img, 'eng', { logger: m => {
        if (S.study.imp?.run !== run) return;
        const bar = document.querySelector('.view .track .fill');
        if (m.status === 'recognizing text') { im.status = 'Reading the text'; im.progress = m.progress; }
        else if (m.status) { im.status = 'Getting ready: ' + m.status; }
        if (bar) bar.style.width = Math.round((im.progress || 0) * 100) + '%';
        const st = document.querySelector('.view .stack .small'); if (st) st.textContent = im.status;
      } });
      if (S.study.imp?.run !== run) return;
      im.text = res.data.text || '';
      im.rows = ST.parseTimetable(im.text, C.today());
      im.stage = 'review'; render();
    } catch (e) {
      console.error(e);
      if (S.study.imp?.run !== run) return;
      im.stage = 'pick'; im.error = e.message && e.message.includes('internet') ? e.message : `The photo couldn't be read (${e.message || e}). Try again, or paste the text instead.`; render();
    }
  }
  function syncImportRows() {
    const im = S.study.imp; if (!im || im.stage !== 'review') return;
    im.rows.forEach((r, i) => {
      const g = c => document.getElementById(`ir-${c}-${i}`);
      if (!g('s')) return;
      r.subject = g('s').value.trim(); r.paper = g('p').value.trim().toUpperCase(); r.date = g('d').value; r.time = g('t').value;
    });
  }
  async function saveImport() {
    syncImportRows();
    const im = S.study.imp;
    const p = S.periods.find(x => x.id === im.period);
    const err = m => { const e = $('#imp-err'); if (e) e.textContent = m; };
    const rows = im.rows.filter(r => r.subject || r.date);
    if (!rows.length) return err('There are no exams to save. Add a line, or cancel.');
    const bad = rows.findIndex(r => !r.subject || !C.isDate(r.date) || (r.time && !C.isTime(r.time)));
    if (bad >= 0) return err(`Line ${bad + 1} needs a subject and a valid date${rows[bad].time ? ' and time' : ''}.`);
    let added = 0, skipped = 0;
    for (const r of rows) {
      if (S.exams.some(x => x.period === p.id && x.subject.toLowerCase() === r.subject.toLowerCase() && (x.paper || '') === (r.paper || '') && x.date === r.date)) { skipped++; continue; }
      await data.save('exams', { owner: p.owner, period: p.id, subject: r.subject, paper: r.paper, date: r.date, time: r.time, mins: 0 });
      added++;
    }
    try { if (im.photo) URL.revokeObjectURL(im.photo); } catch (e) { /* ignore */ }
    S.study.imp = null; S.study.tab = 'exams'; await load(); render();
    toast(`${added} ${added === 1 ? 'exam' : 'exams'} saved${skipped ? `, ${skipped} already there` : ''}. Next, build the revision plan.`);
  }

  /* ---------- Money: accounts, savings goals, money owed ---------- */
  const M = FH.money;
  const balOf = a => M.balanceOf(a, S.entries);
  function moneyOf(id) {
    const accs = S.accounts.filter(a => a.owner === id);
    const open = S.ledger.filter(l => l.owner === id && M.leftOf(l) > 0);
    const owes = open.filter(l => l.dir === 'owes').reduce((n, l) => n + M.leftOf(l), 0);
    const owe = open.filter(l => l.dir === 'owe').reduce((n, l) => n + M.leftOf(l), 0);
    const savings = accs.reduce((n, a) => n + balOf(a), 0);
    /* The child's total: savings, plus what you owe them, minus what they owe you. */
    return { accs, savings, owes, owe, net: savings + owe - owes };
  }
  const netText = (id, m) => `${esc(nameOf(id))}'s total: <b class="${m.net < 0 ? 'neg' : ''}">${M.fmt(m.net)}</b>`;

  function childMoneyCard(id) {
    const m = moneyOf(id);
    return `<section class="card"><div class="card-h"><h3>Money</h3><button class="btn sm" data-act="money-child" data-v="${id}">Open</button></div>
      <div class="line"><span>Savings</span><span class="amt">${M.fmt(m.savings)}</span></div>
      <div class="line"><span>Owes you</span><span class="amt">${M.fmt(m.owes)}</span></div>
      <div class="line"><span>You owe</span><span class="amt">${M.fmt(m.owe)}</span></div>
      <p class="meta" style="margin-top:8px">${netText(id, m)}</p></section>`;
  }

  function vMoney() {
    if (!S.children.length) return '<div class="view"><section class="card"><p class="empty">Add a child first.</p></section></div>';
    const id = S.moneyChild || S.children[0].id;
    const m = moneyOf(id);
    const kid = kidOf(id);
    const open = S.ledger.filter(l => l.owner === id && M.leftOf(l) > 0).sort((a, b) => b.date.localeCompare(a.date));
    const settled = S.ledger.filter(l => l.owner === id && M.leftOf(l) === 0).sort((a, b) => (b.settledAt || b.date).localeCompare(a.settledAt || a.date));
    return `<div class="view">
      <section class="card" style="margin-bottom:14px"><div class="card-h"><h3>All children</h3></div>
        <div class="tbl"><table class="ov"><thead><tr><th>Child</th><th>Savings</th><th>Owes you</th><th>You owe</th><th>Net</th></tr></thead><tbody>
        ${S.children.map(c => { const x = moneyOf(c.id); return `<tr class="${c.id === id ? 'sel' : ''}"><td><button data-act="money-child" data-v="${c.id}">${avatar(c)}${esc(c.name)}</button></td><td>${M.fmt(x.savings)}</td><td>${M.fmt(x.owes)}</td><td>${M.fmt(x.owe)}</td><td class="${x.net < 0 ? 'neg' : ''}" style="font-weight:700">${M.fmt(x.net)}</td></tr>`; }).join('')}
        </tbody></table></div>
        <p class="meta" style="margin-top:8px">Net is each child's total: savings, plus what you owe them, minus what they owe you.</p></section>
      <div class="row" style="margin-bottom:12px">${avatar(kid, true)}<div><div class="big">${esc(kid.name)}</div><div class="muted">${netText(id, m)}</div></div></div>
      <div class="split">
        <div class="stat"><div class="k">Savings</div><div class="v">${M.fmt(m.savings)}</div></div>
        <div class="stat"><div class="k">Owes you</div><div class="v">${M.fmt(m.owes)}</div></div>
        <div class="stat"><div class="k">You owe</div><div class="v">${M.fmt(m.owe)}</div></div>
      </div>
      <div class="mgrid">
        <div class="stack">
          ${m.accs.map(a => accountCard(a)).join('') || `<section class="card">${emptyCat(`No accounts yet. Add ${esc(kid.name)}'s bank account or cash savings to track balances and goals.`)}</section>`}
          <div><button class="btn" data-act="acc-add">Add account</button></div>
        </div>
        <section class="card"><div class="card-h"><h3>Money owed</h3><button class="btn sm" data-act="led-add">Add</button></div>
          ${open.map(l => { const left = M.leftOf(l), paid = M.paidOf(l); return `<div class="line">
            <button class="min0 slink" data-act="led-edit" data-v="${l.id}"><span class="lti">${esc(l.note)}</span><span class="sb">${C.fmtDay(l.date)} · ${l.dir === 'owes' ? `${esc(kid.name)} owes you` : `You owe ${esc(kid.name)}`}${paid ? ` · ${M.fmt(paid)} of ${M.fmt(l.amount)} paid` : ''}</span></button>
            <span class="row" style="gap:8px;flex-wrap:nowrap"><span class="amt ${l.dir === 'owes' ? 'pos' : 'neg'}">${M.fmt(left)}</span><button class="btn sm" data-act="led-settle" data-v="${l.id}">Settle</button></span></div>`; }).join('') || '<p class="empty">Nothing owed either way.</p>'}
          ${settled.length ? `<details class="pastsess" ${S.ledgerHist ? 'open' : ''}><summary data-act="led-hist">Settled (${settled.length})</summary>${settled.map(l => `<div class="line"><button class="min0 slink struck" data-act="led-edit" data-v="${l.id}"><span class="lti">${esc(l.note)}</span><span class="sb">${C.fmtDay(l.date)}${l.settledAt ? ` · settled ${C.fmtDay(l.settledAt)}` : ''}</span></button><span class="amt muted">${M.fmt(l.amount)}</span></div>`).join('')}</details>` : ''}
        </section>
      </div>
      ${choresSection(id)}</div>`;
  }

  function accountCard(a) {
    const bal = balOf(a);
    const goals = S.goals.filter(g => g.account === a.id);
    const ent = S.entries.filter(e => e.account === a.id).sort((x, y) => (y.date + (y.createdAt || '')).localeCompare(x.date + (x.createdAt || '')));
    const all = S.histAll[a.id];
    return `<section class="card" style="--c:var(--${colOf(a.owner)})"><div class="card-h"><h3>${esc(a.name)} · ${esc(a.where === 'Cash' ? 'cash' : a.bank || 'bank')}</h3><button class="btn sm" data-act="acc-edit" data-v="${a.id}">Edit</button></div>
      ${S.editBal === a.id ? `<form class="row" data-form="balance" data-v="${a.id}" style="flex-wrap:nowrap"><input id="bal-${a.id}" inputmode="decimal" value="${M.toInput(bal)}" aria-label="New balance in rand"><button class="btn pri" type="submit">Save</button><button type="button" class="btn" data-act="bal-cancel">Cancel</button></form><p class="meta" style="margin-top:6px">The difference is recorded as an adjustment, so the history still adds up.</p><div class="err" id="bal-err" role="alert"></div>`
        : `<div class="row" style="justify-content:space-between"><div class="big ${bal < 0 ? 'neg' : ''}">${M.fmt(bal)}</div><span class="row" style="gap:6px"><button class="btn sm" data-act="entry-add" data-v="${a.id}|Deposit">Deposit</button><button class="btn sm" data-act="entry-add" data-v="${a.id}|Withdrawal">Withdraw</button><button class="btn sm" data-act="bal-edit" data-v="${a.id}">Edit balance</button></span></div>`}
      ${goalsBlock(a, bal, goals)}
      <div class="group-h" style="margin-top:14px">History</div>
      ${(all ? ent : ent.slice(0, 5)).map(e => `<button class="line slink" data-act="entry-edit" data-v="${e.id}"><span class="min0"><span class="lti">${esc(e.note || e.type)}</span><span class="sb">${C.fmtDay(e.date)} ${e.date.slice(0, 4)} · ${esc(e.type)}</span></span><span class="amt ${e.amount < 0 ? 'neg' : 'pos'}">${M.fmtSigned(e.amount)}</span></button>`).join('') || '<p class="empty">No entries yet.</p>'}
      ${ent.length > 5 ? `<button class="linkbtn" style="margin-top:8px" data-act="hist-all" data-v="${a.id}">${all ? 'Show fewer' : `Show all ${ent.length}`}</button>` : ''}
    </section>`;
  }

  /* Savings goals are filled in priority order from the account balance.
     "In order" shows how far the savings reach down the list; "On its own"
     compares all the savings with that goal alone, so you can see when a
     lower goal could be bought now instead. */
  function goalsBlock(a, bal, goals) {
    const active = goals.filter(g => g.status !== 'reached').sort(goalOrder);
    const reached = goals.filter(g => g.status === 'reached').sort((x, y) => (y.reachedAt || '').localeCompare(x.reachedAt || ''));
    let left = Math.max(0, bal);
    const rows = active.map((g, i) => {
      const inOrder = Math.min(left, g.target); left -= inOrder;
      const alone = Math.min(Math.max(0, bal), g.target);
      const pIn = g.target ? Math.floor(inOrder / g.target * 100) : 0, pAl = g.target ? Math.floor(alone / g.target * 100) : 0;
      const canBuy = bal >= g.target;
      return `<div class="goal2">
        <div class="row" style="justify-content:space-between;flex-wrap:nowrap;align-items:flex-start">
          <button class="min0 slink" data-act="goal-edit" data-v="${g.id}"><b>${i + 1}. ${esc(g.name)}</b><span class="sb">${M.fmt(g.target)}${g.by ? ` by ${C.MON[C.toD(g.by).getMonth()]} ${g.by.slice(0, 4)}` : ''}</span></button>
          <span class="row" style="gap:4px;flex-wrap:nowrap"><button class="iconbtn sm" data-act="goal-up" data-v="${g.id}" aria-label="Move ${esc(g.name)} up" ${i === 0 ? 'disabled' : ''}>↑</button><button class="iconbtn sm" data-act="goal-down" data-v="${g.id}" aria-label="Move ${esc(g.name)} down" ${i === active.length - 1 ? 'disabled' : ''}>↓</button></span>
        </div>
        <div class="gbar"><span class="glbl">In order</span><span class="track"><span class="fill" style="width:${pIn}%"></span></span><span class="gpct">${pIn}%</span></div>
        <div class="gbar alone"><span class="glbl">On its own</span><span class="track"><span class="fill" style="width:${pAl}%"></span></span><span class="gpct">${pAl}%</span></div>
        <div class="row" style="justify-content:space-between;gap:8px"><span class="meta">${inOrder >= g.target ? 'Covered in priority order' : canBuy ? `<b class="pos">Can buy now</b> if you choose it first` : `${M.fmt(g.target - alone)} more needed on its own`}</span>
          ${canBuy ? `<button class="btn sm pri" data-act="goal-reach" data-v="${g.id}">Goal reached</button>` : ''}</div>
      </div>`;
    }).join('');
    return `<div class="sgoals">
      ${active.length ? `<div class="flbl">Savings goals, in priority order</div>${rows}` : ''}
      <div class="row" style="justify-content:space-between;gap:8px"><span class="meta">${active.length ? (left > 0 ? `${M.fmt(left)} left after all goals` : '') : 'No savings goals yet.'}</span>
        <button class="btn sm" data-act="goal-add" data-v="${a.id}">Add goal</button></div>
      ${reached.length ? `<details class="pastsess"><summary>Reached (${reached.length})</summary>${reached.map(g => `<div class="line"><span class="min0"><span class="lti">${esc(g.name)}</span><span class="sb">Reached ${g.reachedAt ? C.fmtDay(g.reachedAt) + ' ' + g.reachedAt.slice(0, 4) : ''}${g.spent ? ` · spent ${M.fmt(g.spent)}` : ''}</span></span><button class="btn sm" data-act="goal-reopen" data-v="${g.id}">Undo</button></div>`).join('')}</details>` : ''}
    </div>`;
  }
  const goalOrder = (x, y) => (x.order ?? 0) - (y.order ?? 0) || (x.createdAt || '').localeCompare(y.createdAt || '');
  const pctTxt = p => `${String(M.pctRound(p)).replace('.', ',')}%`;
  function allocSumText(bal, sum) {
    const left = 100 - sum;
    return `Set aside ${pctTxt(sum)} · ${left >= -0.005 ? `${M.fmt(M.shareOf(Math.max(0, bal), Math.max(0, left)))} not set aside` : `<span class="overdue">${pctTxt(-left)} too much</span>`}`;
  }
  const allocRows = () => [...document.querySelectorAll('.sgoals.editing .arow')];
  const pctVal = el => { const v = Number(String(el.value).replace(',', '.').replace('%', '').trim()); return Number.isFinite(v) ? v : NaN; };
  function updAlloc() {
    const a = S.accounts.find(x => x.id === S.editAlloc); if (!a) return;
    const bal = Math.max(0, balOf(a));
    let sum = 0;
    for (const r of allocRows()) { const p = pctVal(r.querySelector('input')) || 0; sum += p; const el = document.getElementById('allocamt-' + r.dataset.g); if (el) el.textContent = M.fmt(M.shareOf(bal, p)); }
    const el = $('#allocsum'); if (el) el.innerHTML = allocSumText(bal, sum);
  }

  /* Sheets */
  function accountSheet() {
    const sh = S.sheet;
    const a = sh.id ? S.accounts.find(x => x.id === sh.id) : null;
    return panel(a ? `Edit ${esc(a.name)}` : 'Add an account', `
      <form class="form" data-form="account" style="margin-top:14px">
        ${childSelect(a ? a.owner : sh.child)}
        <label>Kept<select id="f-where"><option ${a?.where !== 'Cash' ? 'selected' : ''}>Bank</option><option ${a?.where === 'Cash' ? 'selected' : ''}>Cash</option></select></label>
        <label>Name<input id="f-title" value="${esc(a?.name || 'Savings account')}" autocomplete="off"></label>
        <label>Bank (optional)<input id="f-bank" value="${esc(a?.bank || '')}" placeholder="e.g. Capitec" autocomplete="off"></label>
        ${a ? `<p class="hint full">Deleting the account also deletes its history and savings goals.</p>` : `<label>Balance now (R)<input id="f-amount" inputmode="decimal" placeholder="0" autocomplete="off"></label>`}
        <div class="err full" id="f-err" role="alert"></div>
        <div class="actions full">${a ? delBtn(sh, 'this account') : ''}<button type="button" class="btn" data-act="close">Cancel</button><button class="btn pri" type="submit">${a ? 'Save' : 'Add account'}</button></div>
      </form>`);
  }
  function entrySheet() {
    const sh = S.sheet;
    const e = sh.id ? S.entries.find(x => x.id === sh.id) : null;
    const type = e ? e.type : sh.type;
    const signed = ['Withdrawal'].includes(type) ? -1 : 1;
    return panel(e ? `Edit ${esc(type.toLowerCase())}` : type === 'Deposit' ? 'Deposit' : 'Withdrawal', `
      <form class="form" data-form="entry" style="margin-top:14px">
        <label>Amount (R)<input id="f-amount" inputmode="decimal" value="${e ? M.toInput(type === 'Adjustment' || type === 'Opening balance' ? e.amount : Math.abs(e.amount)) : ''}" placeholder="0" autocomplete="off"></label>
        <label>Date<input id="f-date" type="date" value="${e?.date || C.today()}"></label>
        <label class="full">Note<input id="f-title" value="${esc(e?.note || '')}" placeholder="${signed < 0 ? 'e.g. Movie outing' : 'e.g. Birthday money from Gran'}" autocomplete="off"></label>
        ${type === 'Adjustment' || type === 'Opening balance' ? '<p class="hint full">Use a minus sign for an amount that lowered the balance.</p>' : ''}
        <div class="err full" id="f-err" role="alert"></div>
        <div class="actions full">${e ? delBtn(sh, 'this entry') : ''}<button type="button" class="btn" data-act="close">Cancel</button><button class="btn pri" type="submit">${e ? 'Save' : type === 'Deposit' ? 'Add deposit' : 'Add withdrawal'}</button></div>
      </form>`);
  }
  function goalSheet() {
    const sh = S.sheet;
    const g = sh.id ? S.goals.find(x => x.id === sh.id) : null;
    return panel(g ? `Edit ${esc(g.name)}` : 'Add a savings goal', `
      <form class="form" data-form="goal" style="margin-top:14px">
        <label class="full">Saving for<input id="f-title" value="${esc(g?.name || '')}" placeholder="e.g. New bicycle" autocomplete="off"></label>
        <label>Target (R)<input id="f-amount" inputmode="decimal" value="${g ? M.toInput(g.target) : ''}" placeholder="e.g. 2 500" autocomplete="off"></label>
        <label>By (optional)<input id="f-date" type="date" value="${g?.by || ''}"></label>
        ${g ? '' : '<p class="hint full">New goals go to the bottom of the list. Use the arrows to change the order.</p>'}
        <div class="err full" id="f-err" role="alert"></div>
        <div class="actions full">${g ? delBtn(sh, 'this goal') : ''}<button type="button" class="btn" data-act="close">Cancel</button><button class="btn pri" type="submit">${g ? 'Save' : 'Add goal'}</button></div>
      </form>`);
  }
  function reachSheet() {
    const sh = S.sheet;
    const g = S.goals.find(x => x.id === sh.id);
    const a = S.accounts.find(x => x.id === g.account);
    return panel(`Goal reached: ${esc(g.name)}`, `
      <p class="small" style="margin:10px 0">Well done! This records what was spent and moves the goal to the Reached list. The goals below it move up.</p>
      <form class="form" data-form="reach">
        <label>Amount spent (R)<input id="f-amount" inputmode="decimal" value="${M.toInput(g.target)}" autocomplete="off"></label>
        <label>Date<input id="f-date" type="date" value="${C.today()}"></label>
        <label class="chk full"><input id="f-withdraw" type="checkbox" checked>Record it as a withdrawal from ${esc(a.name)}</label>
        <div class="err full" id="f-err" role="alert"></div>
        <div class="actions full"><button type="button" class="btn" data-act="close">Cancel</button><button class="btn pri" type="submit">Mark as reached</button></div>
      </form>`);
  }
  function ledgerSheet() {
    const sh = S.sheet;
    const l = sh.id ? S.ledger.find(x => x.id === sh.id) : null;
    const kid = kidOf(l ? l.owner : sh.child);
    return panel(l ? 'Edit money owed' : 'Add money owed', `
      <form class="form" data-form="ledger" style="margin-top:14px">
        ${childSelect(l ? l.owner : sh.child)}
        <label>Who owes<select id="f-dir"><option value="owes" ${l?.dir !== 'owe' ? 'selected' : ''}>The child owes you</option><option value="owe" ${l?.dir === 'owe' ? 'selected' : ''}>You owe the child</option></select></label>
        <label>Amount (R)<input id="f-amount" inputmode="decimal" value="${l ? M.toInput(l.amount) : ''}" placeholder="0" autocomplete="off"></label>
        <label>Date<input id="f-date" type="date" value="${l?.date || C.today()}"></label>
        <label class="full">What for<input id="f-title" value="${esc(l?.note || '')}" placeholder="e.g. Concert ticket" autocomplete="off"></label>
        ${l && (l.payments || []).length ? `<div class="full"><div class="flbl">Payments</div>${l.payments.map((p, i) => `<div class="line"><span>${C.fmtDay(p.date)}${p.note ? ' · ' + esc(p.note) : ''}</span><span class="row" style="gap:8px;flex-wrap:nowrap"><span class="amt">${M.fmt(p.amount)}</span><button type="button" class="rm" data-act="pay-rm" data-v="${i}" aria-label="Remove this payment">×</button></span></div>`).join('')}</div>` : ''}
        <div class="err full" id="f-err" role="alert"></div>
        <div class="actions full">${l ? delBtn(sh, 'this entry') : ''}<button type="button" class="btn" data-act="close">Cancel</button><button class="btn pri" type="submit">${l ? 'Save' : 'Add'}</button></div>
      </form>`);
  }
  function settleSheet() {
    const sh = S.sheet;
    const l = S.ledger.find(x => x.id === sh.id);
    const left = M.leftOf(l);
    return panel(`Settle: ${esc(l.note)}`, `
      <p class="small" style="margin:10px 0">${l.dir === 'owes' ? `${esc(nameOf(l.owner))} owes you` : `You owe ${esc(nameOf(l.owner))}`} <b>${M.fmt(left)}</b>${M.paidOf(l) ? ` (of ${M.fmt(l.amount)})` : ''}.</p>
      <form class="form" data-form="settle">
        <label>Amount paid (R)<input id="f-amount" inputmode="decimal" value="${M.toInput(left)}" autocomplete="off"></label>
        <label>Date<input id="f-date" type="date" value="${C.today()}"></label>
        <label class="full">Note (optional)<input id="f-title" placeholder="e.g. Paid from pocket money" autocomplete="off"></label>
        <p class="hint full">Pay part of it now and the rest stays open.</p>
        <div class="err full" id="f-err" role="alert"></div>
        <div class="actions full"><button type="button" class="btn" data-act="close">Cancel</button><button class="btn pri" type="submit">Record payment</button></div>
      </form>`);
  }

  /* Saves */
  const amt = id => M.parseRand($(id)?.value ?? '');
  async function saveAccount() {
    const sh = S.sheet;
    const name = val('#f-title');
    if (!name) return fail('Give the account a name, for example Savings account.');
    const rec = { owner: val('#f-child'), where: val('#f-where'), name, bank: val('#f-bank') };
    let opening = 0;
    if (!sh.id) { const raw = val('#f-amount'); opening = raw ? amt('#f-amount') : 0; if (Number.isNaN(opening)) return fail('Enter the balance in rand, for example 1 250 or 12,50.'); }
    if (sh.id) rec.id = sh.id;
    const saved = await data.save('accounts', rec);
    if (sh.id) { for (const st of ['entries', 'goals']) for (const x of S[st].filter(r => r.account === sh.id && r.owner !== rec.owner)) await data.save(st, { id: x.id, owner: rec.owner }); }
    else if (opening) await data.save('entries', { owner: rec.owner, account: saved.id, date: C.today(), amount: opening, type: 'Opening balance', note: 'Balance when added' });
    S.sheet = null; S.moneyChild = rec.owner; await load(); go('money');
    toast(sh.id ? 'Account saved.' : `${name} added for ${nameOf(rec.owner)}.`);
    return true;
  }
  async function saveEntry() {
    const sh = S.sheet;
    const e = sh.id ? S.entries.find(x => x.id === sh.id) : null;
    const type = e ? e.type : sh.type;
    const a = S.accounts.find(x => x.id === (e ? e.account : sh.account));
    const v = amt('#f-amount'), date = val('#f-date');
    const free = type === 'Adjustment' || type === 'Opening balance';
    if (Number.isNaN(v) || (!free && v <= 0) || v === 0) return fail('Enter the amount in rand, for example 50 or 12,50.');
    if (!C.isDate(date)) return fail('Choose the date.');
    const amount = free ? v : type === 'Withdrawal' ? -Math.abs(v) : Math.abs(v);
    const rec = { owner: a.owner, account: a.id, date, amount, type, note: val('#f-title') };
    if (e) rec.id = e.id;
    await data.save('entries', rec);
    S.sheet = null; await load(); render();
    toast(`${type} of ${M.fmt(Math.abs(amount))} ${e ? 'saved' : 'recorded'}. Balance: ${M.fmt(balOf(a))}.`);
    return true;
  }
  async function saveGoal() {
    const sh = S.sheet;
    const g = sh.id ? S.goals.find(x => x.id === sh.id) : null;
    const accId = g ? g.account : sh.account;
    const a = S.accounts.find(x => x.id === accId);
    const name = val('#f-title'), target = amt('#f-amount'), by = val('#f-date');
    if (!name) return fail('Say what the goal is for, for example New bicycle.');
    if (!(target > 0)) return fail('Enter the target in rand, for example 2 500.');
    if (by && !C.isDate(by)) return fail('The By date is not a valid date.');
    const rec = { owner: a.owner, account: a.id, name, target, by };
    if (g) rec.id = g.id; else { rec.status = 'active'; rec.order = Math.max(-1, ...S.goals.filter(x => x.account === accId).map(x => x.order ?? 0)) + 1; }
    await data.save('goals', rec);
    S.sheet = null; await load(); render();
    toast(g ? 'Goal saved.' : `Goal added: ${name}.`);
    return true;
  }
  async function saveReach() {
    const sh = S.sheet;
    const g = S.goals.find(x => x.id === sh.id);
    const v = amt('#f-amount'), date = val('#f-date');
    if (!(v > 0)) return fail('Enter the amount spent in rand.');
    if (!C.isDate(date)) return fail('Choose the date.');
    if ($('#f-withdraw').checked) await data.save('entries', { owner: g.owner, account: g.account, date, amount: -v, type: 'Withdrawal', note: `Goal reached: ${g.name}` });
    await data.save('goals', { id: g.id, status: 'reached', reachedAt: date, spent: v });
    S.sheet = null; await load(); render();
    toast(`${g.name} reached. The next goal is now first in line.`);
    return true;
  }
  /* Moves a goal up or down and renumbers the list. */
  async function moveGoal(id, dir) {
    const g = S.goals.find(x => x.id === id);
    const list = S.goals.filter(x => x.account === g.account && x.status !== 'reached').sort(goalOrder);
    const i = list.findIndex(x => x.id === id), j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    for (const [k, x] of list.entries()) if ((x.order ?? -1) !== k) await data.save('goals', { id: x.id, order: k });
    await load(); render();
  }
  async function saveLedger() {
    const sh = S.sheet;
    const l = sh.id ? S.ledger.find(x => x.id === sh.id) : null;
    const v = amt('#f-amount'), date = val('#f-date'), note = val('#f-title');
    if (!(v > 0)) return fail('Enter the amount in rand, for example 50 or 12,50.');
    if (!C.isDate(date)) return fail('Choose the date.');
    if (!note) return fail('Add a short note so you remember what this was for.');
    if (l && M.paidOf(l) > v) return fail(`${M.fmt(M.paidOf(l))} has already been paid, so the amount can't be less than that.`);
    const rec = { owner: val('#f-child'), dir: val('#f-dir'), amount: v, date, note };
    if (l) { rec.id = l.id; rec.payments = l.payments || []; rec.settledAt = M.paidOf(l) >= v ? (l.settledAt || C.today()) : ''; } else { rec.payments = []; rec.settledAt = ''; }
    await data.save('ledger', rec);
    S.sheet = null; S.moneyChild = rec.owner; await load(); render();
    toast(l ? 'Saved.' : `${rec.dir === 'owes' ? `${nameOf(rec.owner)} owes you` : `You owe ${nameOf(rec.owner)}`} ${M.fmt(v)}.`);
    return true;
  }
  async function saveSettle() {
    const sh = S.sheet;
    const l = S.ledger.find(x => x.id === sh.id);
    const left = M.leftOf(l);
    const v = amt('#f-amount'), date = val('#f-date');
    if (!(v > 0)) return fail('Enter the amount paid in rand.');
    if (v > left) return fail(`Only ${M.fmt(left)} is still owed. Enter that or less.`);
    if (!C.isDate(date)) return fail('Choose the date.');
    const payments = [...(l.payments || []), { date, amount: v, note: val('#f-title') }];
    const full = v === left;
    await data.save('ledger', { id: l.id, payments, settledAt: full ? date : '' });
    S.sheet = null; await load(); render();
    toast(full ? `Settled: ${l.note}.` : `${M.fmt(v)} paid. ${M.fmt(left - v)} still owed.`);
    return true;
  }
  async function saveBalance(id) {
    const a = S.accounts.find(x => x.id === id);
    const v = amt('#bal-' + id);
    if (Number.isNaN(v)) { const e = $('#bal-err'); if (e) e.textContent = 'Enter the balance in rand, for example 3 450 or 3 450,00.'; return; }
    const diff = v - balOf(a);
    S.editBal = null;
    if (diff) await data.save('entries', { owner: a.owner, account: a.id, date: C.today(), amount: diff, type: 'Adjustment', note: 'Balance edited' });
    await load(); render();
    toast(diff ? `Balance updated to ${M.fmt(v)}. Adjustment of ${M.fmtSigned(diff)} recorded.` : 'The balance is unchanged.');
  }

  /* ---------- Chores and reward goals ---------- */
  const K = FH.chores;
  function choreCard(c, compact) {
    const today = C.today();
    const view = S.choreView[c.id] || today;
    const r = K.periodOf(c, view);
    const st = K.periodStats(c, r);
    const cur = K.curOcc(c, today);
    const showMark = cur && cur >= r.start && cur <= r.end && !st.paid;
    const hist = [];
    if (c.freq !== 'Once' && !compact) { let p = K.periodOf(c, today); for (let i = 0; i < 4 && p.end >= c.start; i++) { hist.push(p); p = K.periodOf(c, C.addDays(p.start, -1)); } }
    return `<div class="chore" style="--c:var(--${colOf(c.owner)})">
      <div class="row" style="justify-content:space-between;flex-wrap:nowrap;align-items:flex-start"><button class="min0 slink" data-act="chore-edit" data-v="${c.id}"><b>${esc(c.title)}</b><span class="sb">${compact ? esc(nameOf(c.owner)) + ' · ' : ''}${c.freq} · ${M.fmt(c.reward)} ${K.PER_LBL[c.period]} · ${c.rule === 'all' ? 'paid only if all done' : 'paid for what was done'}</span></button></div>
      ${showMark ? `<div class="row" style="gap:6px"><span class="meta" style="min-width:84px">${K.CUR_LBL[c.freq]}</span><button class="btn sm ok" data-act="chore-mark" data-v="${c.id}|done" aria-pressed="${(c.log || {})[cur] === 'done'}">Mark done</button><button class="btn sm no" data-act="chore-mark" data-v="${c.id}|missed" aria-pressed="${(c.log || {})[cur] === 'missed'}">Mark not done</button></div>` : ''}
      ${compact ? '' : `<div class="row" style="justify-content:space-between;gap:8px">
        <div class="row" style="gap:6px;flex-wrap:nowrap">${c.freq === 'Once' ? '' : `<button class="iconbtn sm" data-act="chore-prev" data-v="${c.id}" aria-label="Previous period" ${r.start <= c.start ? 'disabled' : ''}>${ic('left')}</button>`}<b style="font-size:14px">${r.label}</b>${c.freq === 'Once' ? '' : `<button class="iconbtn sm" data-act="chore-next" data-v="${c.id}" aria-label="Next period" ${r.end >= today ? 'disabled' : ''}>${ic('right')}</button>`}</div>
        <span class="meta">${st.done} of ${st.occ.length} done${st.missed ? ` · ${st.missed} not done` : ''}</span></div>
      <div class="chips">${st.occ.map(d => { const s2 = (c.log || {})[d]; return `<button class="chip ${s2 || ''}" data-act="chore-occ" data-v="${c.id}|${d}" ${d > today || st.paid ? 'disabled' : ''} aria-label="${K.occLabel(c, d)}: ${s2 === 'done' ? 'done' : s2 === 'missed' ? 'not done' : 'not marked'}">${s2 === 'done' ? '✓ ' : s2 === 'missed' ? '✗ ' : ''}${K.occLabel(c, d)}</button>`; }).join('') || '<span class="meta">Nothing due in this period.</span>'}</div>
      <div class="row" style="justify-content:space-between;gap:8px">
        <span class="meta">${r.end > today && c.freq !== 'Once' ? `Period ends ${C.fmtDay(r.end)}` : ''}</span>
        ${st.paid ? `<span class="pill on">Approved ${M.fmt(st.paid.amount)}</span>` : st.amount ? `<button class="btn sm pri" data-act="chore-approve" data-v="${c.id}|${r.start}">Approve ${M.fmt(st.amount)}</button>` : `<span class="pill">${c.rule === 'all' && st.done && st.done < st.occ.length ? 'Not all done' : 'Nothing earned yet'}</span>`}
      </div>
      ${hist.length > 1 ? `<div class="hist">${hist.map(h => { const s3 = K.periodStats(c, h); return `<button data-act="chore-view" data-v="${c.id}|${h.start}" aria-current="${h.key === r.key}"><span>${h.label}</span><span>${s3.done} of ${s3.occ.length} done${s3.paid ? ` · approved ${M.fmt(s3.paid.amount)}` : ''}</span></button>`; }).join('')}</div>` : ''}`}
    </div>`;
  }
  function rewardCard(g) {
    const reached = g.count >= g.target;
    const prize = [g.bonus ? M.fmt(g.bonus) : '', g.extra].filter(Boolean).join(' + ');
    return `<div class="chore" style="--c:var(--${colOf(g.owner)})">
      <div class="row" style="justify-content:space-between;align-items:flex-start;flex-wrap:nowrap"><button class="min0 slink" data-act="reward-edit" data-v="${g.id}"><b>${esc(g.title)}</b><span class="sb">Reward: ${esc(prize)}</span></button>
        <div class="row" style="flex-wrap:nowrap;gap:6px"><button class="iconbtn sm" data-act="reward-minus" data-v="${g.id}" aria-label="Take one off" ${g.count && !g.paid ? '' : 'disabled'}>−</button><button class="btn sm" data-act="reward-plus" data-v="${g.id}" ${reached ? 'disabled' : ''}>+1</button></div></div>
      <div class="goal" style="margin:0"><div class="track"><div class="fill" style="width:${Math.min(100, g.target ? g.count / g.target * 100 : 0)}%"></div></div>
        <div class="row" style="justify-content:space-between"><span class="meta">${g.count} of ${g.target} ${esc(g.unit || '')}${(g.log || []).length ? ` · last on ${C.fmtDay(g.log[g.log.length - 1])}` : ''}</span>${g.paid ? '<span class="pill on">Reward approved</span>' : reached ? `<button class="btn sm pri" data-act="reward-approve" data-v="${g.id}">Approve reward</button>` : `<span class="meta">${g.target - g.count} to go</span>`}</div></div>
    </div>`;
  }
  function choresSection(id) {
    const chores = S.chores.filter(c => c.owner === id && !c.archived);
    const rewards = S.rewards.filter(g => g.owner === id);
    return `<div class="mgrid" style="margin-top:14px">
      <section class="card"><div class="card-h"><h3>Chores</h3><button class="btn sm" data-act="chore-add">Add chore</button></div>
        ${chores.map(c => choreCard(c)).join('') || '<p class="empty">No chores yet.</p>'}
        <p class="meta" style="margin-top:10px">Mark each day, week or month done or not done; tap a chip to change it. Approving a period adds its reward to "You owe".</p></section>
      <section class="card"><div class="card-h"><h3>Reward goals</h3><button class="btn sm" data-act="reward-add">Add goal</button></div>
        ${rewards.map(rewardCard).join('') || '<p class="empty">No reward goals yet, for example "Read 10 books".</p>'}
        <p class="meta" style="margin-top:10px">Count progress towards a target. When it's reached, approve the reward.</p></section>
    </div>`;
  }
  function choresTodayCard() {
    const t = C.today();
    const due = S.chores.filter(c => !c.archived).map(c => ({ c, d: K.curOcc(c, t) })).filter(({ c, d }) => d && d <= t && K.occEnd(c, d) >= t && !(c.log || {})[d] && !(c.paid || {})[K.periodOf(c, d).key]);
    if (!due.length) return '';
    return `<section class="card"><div class="card-h"><h3>Chores to mark</h3><button class="btn sm" data-act="nav" data-v="money">Money</button></div>
      ${due.map(({ c, d }) => `<div class="line" style="--c:var(--${colOf(c.owner)})"><span class="min0"><span class="lti">${esc(c.title)}</span><span class="sb">${esc(nameOf(c.owner))} · ${K.CUR_LBL[c.freq].toLowerCase()}${c.freq !== 'Daily' && c.freq !== 'Once' ? ` (until ${C.fmtDay(K.occEnd(c, d))})` : ''}</span></span>
        <span class="row" style="gap:6px;flex-wrap:nowrap"><button class="btn sm ok" data-act="chore-mark" data-v="${c.id}|done">Done</button><button class="btn sm no" data-act="chore-mark" data-v="${c.id}|missed">Not done</button></span></div>`).join('')}
    </section>`;
  }

  function choreSheet() {
    const sh = S.sheet;
    const c = sh.id ? S.chores.find(x => x.id === sh.id) : null;
    const opt = (list, cur, lbl) => list.map(o => `<option value="${o}" ${o === cur ? 'selected' : ''}>${lbl ? lbl(o) : o}</option>`).join('');
    return panel(c ? `Edit ${esc(c.title)}` : 'Add a chore', `
      <form class="form" data-form="chore" style="margin-top:14px">
        ${childSelect(c ? c.owner : sh.child)}
        <label>Frequency<select id="f-freq">${opt(K.FREQS, c?.freq || 'Daily')}</select></label>
        <label class="full">Chore<input id="f-title" value="${esc(c?.title || '')}" placeholder="e.g. Feed the dog" autocomplete="off"></label>
        <label>Reward (R)<input id="f-amount" inputmode="decimal" value="${c ? M.toInput(c.reward) : ''}" placeholder="e.g. 35" autocomplete="off"></label>
        <label>Reward period<select id="f-period">${opt(['Daily', 'Weekly', 'Monthly'], c?.period || 'Weekly', o => ({ Daily: 'Per day', Weekly: 'Per week', Monthly: 'Per month' }[o]))}</select></label>
        <label>Pay out<select id="f-rule">${opt(['prorata', 'all'], c?.rule || 'prorata', o => o === 'all' ? 'Only if all done' : 'For what was done')}</select></label>
        <label>Starts${'' /* for a one-off chore this is the due date */}<input id="f-date" type="date" value="${c?.start || C.today()}"></label>
        <p class="hint full">Example: a daily chore paid per week is marked each day and approved once a week. For a chore done once, Starts is the due date.</p>
        <div class="err full" id="f-err" role="alert"></div>
        <div class="actions full">${c ? delBtn(sh, 'this chore') : ''}<button type="button" class="btn" data-act="close">Cancel</button><button class="btn pri" type="submit">${c ? 'Save' : 'Add chore'}</button></div>
      </form>`);
  }
  function rewardSheet() {
    const sh = S.sheet;
    const g = sh.id ? S.rewards.find(x => x.id === sh.id) : null;
    return panel(g ? `Edit ${esc(g.title)}` : 'Add a reward goal', `
      <form class="form" data-form="reward" style="margin-top:14px">
        ${childSelect(g ? g.owner : sh.child)}
        <label>Target<input id="f-target" inputmode="numeric" value="${g?.target || ''}" placeholder="e.g. 10" autocomplete="off"></label>
        <label class="full">Goal<input id="f-title" value="${esc(g?.title || '')}" placeholder="e.g. Read 10 books" autocomplete="off"></label>
        <label>Counted in<input id="f-unit" value="${esc(g?.unit || '')}" placeholder="e.g. books" autocomplete="off"></label>
        <label>Done so far<input id="f-count" inputmode="numeric" value="${g?.count ?? 0}" autocomplete="off"></label>
        <label>Bonus (R, optional)<input id="f-amount" inputmode="decimal" value="${g?.bonus ? M.toInput(g.bonus) : ''}" placeholder="e.g. 100" autocomplete="off"></label>
        <label>Other reward (optional)<input id="f-extra" value="${esc(g?.extra || '')}" placeholder="e.g. Trip to the bookshop" autocomplete="off"></label>
        <div class="err full" id="f-err" role="alert"></div>
        <div class="actions full">${g ? delBtn(sh, 'this reward goal') : ''}<button type="button" class="btn" data-act="close">Cancel</button><button class="btn pri" type="submit">${g ? 'Save' : 'Add goal'}</button></div>
      </form>`);
  }
  async function saveChore() {
    const sh = S.sheet;
    const title = val('#f-title'), freq = val('#f-freq'), reward = amt('#f-amount'), start = val('#f-date');
    const period = freq === 'Once' ? 'Once' : val('#f-period');
    if (!title) return fail('Name the chore, for example Feed the dog.');
    if (!(reward > 0)) return fail('Enter the reward in rand, for example 35 or 12,50.');
    if (!K.PER_OK[freq].includes(period)) return fail(`A ${freq.toLowerCase()} chore can only be rewarded ${K.PER_OK[freq].map(x => K.PER_LBL[x]).join(' or ')}. Change the reward period.`);
    if (!C.isDate(start)) return fail('Choose the start date.');
    const rec = { owner: val('#f-child'), title, freq, period, reward, rule: val('#f-rule'), start };
    if (sh.id) rec.id = sh.id; else { rec.log = {}; rec.paid = {}; }
    await data.save('chores', rec);
    S.sheet = null; S.moneyChild = rec.owner; await load(); render();
    toast(sh.id ? 'Chore saved.' : `${title} added for ${nameOf(rec.owner)}: ${M.fmt(reward)} ${K.PER_LBL[period]}.`);
    return true;
  }
  async function saveReward() {
    const sh = S.sheet;
    const title = val('#f-title'), target = parseInt(val('#f-target'), 10), count = parseInt(val('#f-count') || '0', 10), extra = val('#f-extra');
    const bonus = val('#f-amount') ? amt('#f-amount') : 0;
    if (!title) return fail('Name the goal, for example Read 10 books.');
    if (!(target > 0)) return fail('Enter the target number, for example 10.');
    if (Number.isNaN(bonus) || bonus < 0) return fail('Enter the bonus in rand, for example 100, or leave it empty.');
    if (!bonus && !extra) return fail('Add a bonus amount, another reward, or both.');
    if (!(count >= 0)) return fail('Done so far must be 0 or more.');
    const rec = { owner: val('#f-child'), title, target, unit: val('#f-unit') || 'times', count: Math.min(target, count), bonus, extra };
    if (sh.id) rec.id = sh.id; else { rec.log = []; rec.paid = null; }
    await data.save('rewards', rec);
    S.sheet = null; S.moneyChild = rec.owner; await load(); render();
    toast(sh.id ? 'Reward goal saved.' : `Reward goal added: ${title}.`);
    return true;
  }
  async function approveChore(id, d) {
    const c = S.chores.find(x => x.id === id);
    const r = K.periodOf(c, d), st = K.periodStats(c, r);
    if (!st.amount || st.paid) return;
    const led = await data.save('ledger', { owner: c.owner, dir: 'owe', amount: st.amount, date: C.today(), note: `Chore: ${c.title}, ${r.label.replace(/^Week of/, 'week of')} (${st.done} of ${st.occ.length} done)`, payments: [], settledAt: '' });
    await data.save('chores', { id: c.id, paid: { ...(c.paid || {}), [r.key]: { amount: st.amount, date: C.today(), ledger: led.id } } });
    await load(); render();
    toast(`${M.fmt(st.amount)} added to what you owe ${nameOf(c.owner)}.`);
  }

  /* ---------- Milestone 7: daily digest, approvals, help ---------- */
  /* Chore periods that have ended with a reward still to approve, and reward goals reached. */
  function approvalsWaiting(childId) {
    const t = C.today(), out = [];
    for (const c of S.chores.filter(x => !childId || x.owner === childId)) {
      let p = K.periodOf(c, t);
      if (p.end >= t) p = K.periodOf(c, C.addDays(p.start, -1));
      for (let i = 0; i < 6 && p.end >= c.start && p.end < t; i++) {
        const st = K.periodStats(c, p);
        if (st.amount && !st.paid) out.push({ kind: 'chore', c, p, st });
        if (c.freq === 'Once') break;
        p = K.periodOf(c, C.addDays(p.start, -1));
      }
    }
    for (const g of S.rewards.filter(x => (!childId || x.owner === childId) && x.count >= x.target && !x.paid)) out.push({ kind: 'reward', g });
    return out;
  }
  function approvalsCard() {
    const list = approvalsWaiting();
    if (!list.length) return '';
    return `<section class="card"><div class="card-h"><h3>Waiting for your approval</h3><button class="btn sm" data-act="nav" data-v="money">Money</button></div>
      ${list.map(x => x.kind === 'chore'
        ? `<div class="line" style="--c:var(--${colOf(x.c.owner)})"><span class="min0"><span class="lti">${esc(x.c.title)}</span><span class="sb">${esc(nameOf(x.c.owner))} · ${x.p.label} · ${x.st.done} of ${x.st.occ.length} done</span></span><button class="btn sm pri" data-act="chore-approve" data-v="${x.c.id}|${x.p.start}">Approve ${M.fmt(x.st.amount)}</button></div>`
        : `<div class="line"><span class="min0"><span class="lti">${esc(x.g.title)}</span><span class="sb">${esc(nameOf(x.g.owner))} · goal reached</span></span><button class="btn sm pri" data-act="reward-approve" data-v="${x.g.id}">Approve</button></div>`).join('')}
    </section>`;
  }
  function studyProgress(childId) {
    const t = C.today();
    const ids = new Set(S.exams.filter(x => x.owner === childId && x.date >= t).map(x => x.id));
    const sess = S.sessions.filter(x => ids.has(x.exam));
    if (!sess.length) return '';
    const done = sess.filter(x => x.done).length;
    return `<div class="prog" style="--c:var(--${colOf(childId)});margin-bottom:6px"><span class="min0"><b>Revision</b> <span class="muted">· for upcoming exams</span></span><span class="muted" style="font-size:13px">${done}/${sess.length} sessions</span><div class="track"><div class="fill" style="width:${Math.round(done / sess.length * 100)}%"></div></div></div>`;
  }

  /* The morning summary: one block per child, shown on the first open of the day. */
  function digestFor(id) {
    const t = C.today(), soon = C.addDays(t, 7);
    const ev = C.eventsOn(t, src(), { visible: new Set([id]) }).filter(e => !e.skipped && e.kind !== 'step');
    const overdue = S.tasks.filter(x => x.owner === id && !x.done && x.due < t);
    const stepsDue = []; for (const x of S.tasks.filter(y => y.owner === id && !y.done)) for (const st of x.steps || []) if (!st.done && st.due && st.due <= t) stepsDue.push(st);
    const exams = S.exams.filter(x => x.owner === id && x.date > t && x.date <= soon).sort(byDate);
    const chores = S.chores.filter(c => c.owner === id).map(c => ({ c, d: K.curOcc(c, t) })).filter(({ c, d }) => d && d <= t && K.occEnd(c, d) >= t && !(c.log || {})[d] && !(c.paid || {})[K.periodOf(c, d).key]);
    const appr = approvalsWaiting(id);
    const lines = [];
    if (ev.length) lines.push(`<b>Today:</b> ${ev.map(e => `${e.time ? e.time + ' ' : ''}${esc(e.title)}${e.kind === 'task' ? ' (due)' : ''}`).join(', ')}`);
    if (overdue.length) lines.push(`<b class="overdue">Overdue:</b> ${overdue.map(x => esc(x.title)).join(', ')}`);
    if (stepsDue.length) lines.push(`<b>Steps due:</b> ${stepsDue.map(x => esc(x.text)).join(', ')}`);
    if (exams.length) lines.push(`<b>Exams this week:</b> ${exams.map(x => `${esc(examTitle(x))} ${C.DOW[C.dow(x.date)]} (${C.rel(C.diffDays(t, x.date))})`).join(', ')}`);
    if (chores.length) lines.push(`<b>Chores to mark:</b> ${chores.map(x => esc(x.c.title)).join(', ')}`);
    if (appr.length) lines.push(`<b>To approve:</b> ${appr.map(x => x.kind === 'chore' ? `${esc(x.c.title)} ${M.fmt(x.st.amount)}` : esc(x.g.title)).join(', ')}`);
    return lines;
  }
  function digestSheet() {
    const t = C.today();
    const blocks = S.children.map(c => ({ c, lines: digestFor(c.id) }));
    const any = blocks.some(b => b.lines.length);
    return panel(`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}`, `
      <p class="small" style="margin:6px 0 12px">${C.fmtLong(t)}${schoolLine(t) ? ' · ' + schoolLine(t) : ''}</p>
      <div class="stack">${blocks.map(({ c, lines }) => `<div class="dig" style="--c:var(--${c.colour})"><div class="row" style="gap:8px;flex-wrap:nowrap">${avatar(c)}<b>${esc(c.name)}</b></div>
        ${lines.length ? `<ul>${lines.map(l => `<li>${l}</li>`).join('')}</ul>` : '<p class="meta" style="margin-top:6px">Nothing planned today.</p>'}</div>`).join('')}</div>
      ${any ? '' : '<p class="meta" style="margin-top:8px">A quiet day for everyone.</p>'}
      <div class="actions" style="margin-top:14px"><button class="btn pri" data-act="digest-close">Got it</button></div>`);
  }
  async function maybeDigest() {
    if (!S.ready || !S.children.length || S.sheet) return;
    const seen = await data.getSetting('digestSeen', '');
    if (seen === C.today()) return;
    if (!S.children.some(c => digestFor(c.id).length)) return;
    S.sheet = { kind: 'digest' }; renderSheet();
  }

  function helpCard() {
    const q = (title, body) => `<details class="help"><summary>${title}</summary><div class="small">${body}</div></details>`;
    return `<section class="card" id="help"><div class="card-h"><h3>Help</h3></div>
      ${q('Install on iPhone or iPad', '<ol><li>Open the app\'s address in <b>Safari</b> (not another browser).</li><li>Tap the Share button, then <b>Add to Home Screen</b>, then Add.</li><li>Open Herding Cats from the new icon. It then works without internet.</li></ol>')}
      ${q('Install on Android', '<ol><li>Open the app\'s address in <b>Chrome</b>.</li><li>Tap <b>Install app</b> when it\'s offered, or the ⋮ menu, then <b>Install app</b> or <b>Add to Home screen</b>.</li></ol>')}
      ${q('Install on a PC or Mac', '<ol><li>Open the app\'s address in Chrome or Edge.</li><li>Click the install icon at the right of the address bar, or the browser menu, then <b>Install Herding Cats</b>.</li></ol>')}
      ${q('How updates arrive', '<p>New versions download in the background while you have internet. The app switches to the new version by itself the next time you open it; your data stays as it is. Settings › About shows the version you have.</p>')}
      ${q('Make a backup', '<p>Go to Settings › Backup. On a phone or PC that has the app installed, <b>Download backup file</b> saves one file with everything in it; keep it somewhere safe, for example in Google Drive, iCloud or email it to yourself. <b>Copy backup as text</b> works everywhere: paste it into a note. Make one at least once a week; Today reminds you after 7 days.</p>')}
      ${q('Move data to your other device', '<ol><li>On the device with your data: Settings › Backup › Download backup file (or Copy backup as text).</li><li>Get the file or text to the other device (email, WhatsApp to yourself, or cloud storage).</li><li>On the other device: Settings › Backup › <b>Restore from a backup</b>, choose the file or paste the text, and confirm.</li></ol><p>Restoring replaces everything on that device. Until shared sync arrives in Phase 3, each device keeps its own copy, so pick one device as the main one.</p>')}
      ${q('A phone is lost, broken or replaced', '<p>Install Herding Cats on the new phone, then choose <b>Restore from a backup</b> on the welcome screen and use your latest backup file or text. Anything added after that backup is not in it, which is why a weekly backup matters.</p>')}
      ${q('Keep the data safe on the device', '<p>Under Settings › Storage, the label should say <b>Kept</b>. If it says "May be cleared", tap <b>Keep data on this device</b>. Installing the app to the home screen also protects the data, especially on iPhone.</p>')}
    </section>`;
  }

  /* ---------- Calendar ---------- */
  function toggles() {
    const allOn = S.children.every(c => !S.hidden.has(c.id));
    return `<div class="toggles" role="group" aria-label="Show children">
      <button class="tg" style="--c:var(--all)" data-act="vis" data-v="all" aria-pressed="${allOn}"><span class="dot"></span>All</button>
      ${S.children.map(c => `<button class="tg" style="--c:var(--${c.colour})" data-act="vis" data-v="${c.id}" aria-pressed="${!S.hidden.has(c.id)}"><span class="dot"></span>${esc(c.name)}</button>`).join('')}
    </div>`;
  }
  function kindToggles() {
    const allOn = KINDS.every(([k]) => S.kinds.has(k));
    return `<div class="toggles kinds" role="group" aria-label="Show item types"><span class="flbl">Show</span>
      <button class="tg" style="--c:var(--accent)" data-act="kind" data-v="all" aria-pressed="${allOn}"><span class="dot"></span>Everything</button>
      ${KINDS.map(([k, l]) => `<button class="tg" style="--c:var(--accent)" data-act="kind" data-v="${k}" aria-pressed="${S.kinds.has(k)}"><span class="dot"></span>${l}</button>`).join('')}
    </div>`;
  }
  function vCalendar() {
    const c = S.cal;
    const vis = visibleSet();
    const opts = { visible: vis, kinds: S.kinds };
    let body, title;
    if (c.mode === 'week') {
      const start = C.startOfWeek(c.cursor);
      const days = Array.from({ length: 7 }, (_, i) => C.addDays(start, i));
      const a = C.toD(days[0]), b = C.toD(days[6]);
      title = a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()} ${C.MON[b.getMonth()]} ${b.getFullYear()}` : `${a.getDate()} ${C.MON[a.getMonth()]} – ${b.getDate()} ${C.MON[b.getMonth()]} ${b.getFullYear()}`;
      body = `<div class="week">${days.map(d => {
        const ev = C.eventsOn(d, src(), opts);
        const lbl = S.sc.offLabel(d);
        return `<div class="day${d === C.today() ? ' today' : ''}${lbl ? ' off' : ''}">
          <div class="dayh"><b>${C.DOW[C.dow(d)]} ${C.toD(d).getDate()}</b>${lbl ? `<span class="offlbl">${esc(lbl)}</span>` : ''}</div>
          ${ev.length ? ev.map(e => `<button class="mini minib" style="--c:var(--${colOf(e.child)})" data-act="ev" data-v="${e.kind}|${e.id}|${e.date}"><span class="bar"></span><span class="min0"><span class="tm">${e.time || (e.kind === 'task' || e.kind === 'step' ? (e.kind === 'task' ? 'Due' : 'Step') : 'All day')}${e.end ? '–' + e.end : ''}</span><span class="${e.skipped || e.done ? 'struck' : ''}">${esc(e.title)}</span><span class="sb">${ctag(e)} ${esc(nameOf(e.child))}${e.skipped ? ' · skipped' : e.detail ? ' · ' + esc(e.detail) : ''}</span>${stepList(e)}</span></button>`).join('') : '<p class="empty" style="font-size:13px">Nothing planned</p>'}
        </div>`;
      }).join('')}</div>`;
    } else {
      const first = c.cursor.slice(0, 8) + '01';
      const fd = C.toD(first);
      title = `${C.MONL[fd.getMonth()]} ${fd.getFullYear()}`;
      const last = C.toS(new Date(fd.getFullYear(), fd.getMonth() + 1, 0));
      const cells = [];
      for (let d = C.startOfWeek(first), end = C.addDays(C.startOfWeek(last), 6); d <= end; d = C.addDays(d, 1)) cells.push(d);
      const selEv = C.eventsOn(c.sel, src(), opts);
      body = `<div class="month">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<div class="mh">${d}</div>`).join('')}
        ${cells.map(d => {
          const ev = C.eventsOn(d, src(), opts).filter(e => !e.skipped);
          const out = d.slice(0, 7) !== first.slice(0, 7);
          const lbl = S.sc.offLabel(d);
          const showLbl = lbl && (lbl !== 'School holiday' || !S.sc.offDay(C.addDays(d, -1)) || d.endsWith('-01') || C.dow(d) === 1);
          return `<button class="mc${out ? ' out' : ''}${lbl ? ' off' : ''}${d === C.today() ? ' today' : ''}" data-act="selday" data-v="${d}" aria-pressed="${d === c.sel}" aria-label="${C.fmtLong(d)}, ${ev.length} ${ev.length === 1 ? 'item' : 'items'}${lbl ? ', ' + esc(lbl) : ''}">
            <span class="n">${C.toD(d).getDate()}</span>
            ${showLbl ? `<span class="mlbl">${esc(lbl)}</span>` : ''}
            <span class="dots">${ev.slice(0, 6).map(e => `<i style="--c:var(--${colOf(e.child)})"></i>`).join('')}</span>
            ${ev.slice(0, 3).map(e => `<span class="mtxt" style="--c:var(--${colOf(e.child)})" title="${esc((e.cat || '') + (e.subject ? ' · ' + e.subject : '') + ': ' + e.title)}"><span class="mcat">${esc(e.cat || '')}</span> ${e.time ? e.time + ' ' : ''}${esc(e.title)}</span>`).join('')}
            ${ev.length > 3 ? `<span class="more mtxt" style="border:0;padding:0">+${ev.length - 3} more</span>` : ''}
          </button>`;
        }).join('')}</div>
        <section class="card" style="margin-top:14px"><div class="card-h"><h3>${C.fmtLong(c.sel)}</h3>${S.sc.offLabel(c.sel) ? `<span class="pill">${esc(S.sc.offLabel(c.sel))}</span>` : ''}</div>
          ${selEv.length ? selEv.map(e => evRow(e)).join('') : emptyCat('Nothing planned on this day.')}</section>`;
    }
    const noKids = !S.children.length;
    return `<div class="view">
      <div class="calbar">
        <div class="ttl">${title}</div>
        <div class="seg" role="group">${[['week', 'Week'], ['month', 'Month']].map(([v, l]) => `<button data-act="calmode" data-v="${v}" aria-pressed="${c.mode === v}">${l}</button>`).join('')}</div>
        <div class="navpair"><button class="iconbtn" data-act="calprev" aria-label="Previous ${c.mode}">${ic('left')}</button><button class="btn" data-act="caltoday">Today</button><button class="iconbtn" data-act="calnext" aria-label="Next ${c.mode}">${ic('right')}</button></div>
      </div>
      <div class="filters">${toggles()}${kindToggles()}</div>
      ${noKids ? '<section class="card"><p class="empty">Add a child first.</p></section>' : vis.size && S.kinds.size ? body : '<section class="card"><p class="empty">Switch on at least one child and one item type above to see the schedule.</p></section>'}
      <div class="legend"><span class="swatch-off"></span>School holiday or day off. Weekly activities pause on these days unless set to run in holidays.</div>
    </div>`;
  }

  function termsCard() {
    const s = C.today();
    const terms = S.terms.slice().sort((a, b) => a.start.localeCompare(b.start));
    const shownTerms = S.pastTerms ? terms : terms.filter(t => t.end >= s);
    const days = S.daysoff.slice().sort((a, b) => a.date.localeCompare(b.date));
    const shownDays = S.pastTerms ? days : days.filter(d => (d.end || d.date) >= s).slice(0, 6);
    const badge = r => !r.official ? '<span class="pill">Added by you</span>' : isEdited(r) ? '<span class="pill warn">Edited</span>' : '';
    const range = (a, b) => `${C.fmtDay(a)} – ${C.fmtDay(b)} ${b.slice(0, 4)}`;
    return `<section class="card" id="terms"><div class="card-h"><h3>School terms and holidays</h3></div>
      <p class="small">Imported from the official calendar for public schools. Change anything to match your school; your changes are kept when new dates are added.</p>
      <div class="group-h" style="margin-top:14px">Terms</div>
      ${shownTerms.map(t => `<div class="set"><span class="min0"><b>${esc(t.name)}</b>${S.sc.termOf(s) === t ? ' <span class="pill on">Now</span>' : ''} ${badge(t)}<span class="meta" style="display:block">${range(t.start, t.end)}</span></span><button class="btn sm" data-act="term-edit" data-v="${t.id}">Edit</button></div>`).join('') || '<p class="empty">No terms.</p>'}
      <div class="group-h" style="margin-top:14px">Public holidays and days off</div>
      ${shownDays.map(d => `<div class="set"><span class="min0"><b>${esc(d.name)}</b> ${badge(d)}<span class="meta" style="display:block">${d.end && d.end > d.date ? range(d.date, d.end) : C.fmtDay(d.date) + ' ' + d.date.slice(0, 4)}</span></span><button class="btn sm" data-act="day-edit" data-v="${d.id}">Edit</button></div>`).join('') || '<p class="empty">No days off coming up.</p>'}
      <div class="row" style="margin-top:12px"><button class="btn sm" data-act="day-add">Add day off</button><button class="btn sm" data-act="term-add">Add term</button><button class="btn sm" data-act="past-terms">${S.pastTerms ? 'Show fewer dates' : 'Show all dates'}</button></div>
      <div class="row" style="margin-top:8px;justify-content:space-between"><span class="meta">School dates loaded up to ${S.sc.coverEnd ? C.fmtDate(S.sc.coverEnd) : '—'}.</span><button class="btn sm del" data-act="terms-reset">Reset to official dates</button></div>
    </section>`;
  }

  function vSettings() {
    const st = S.storage;
    const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    return `<div class="view"><div class="stack">
      <section class="card"><div class="card-h"><h3>Children</h3><button class="btn sm" data-act="child-add">Add child</button></div>
        ${S.children.map(c => `<div class="set"><span class="row" style="flex-wrap:nowrap">${avatar(c)}<span class="min0"><b>${esc(c.name)}</b> <span class="muted">· ${esc(c.grade || '')}</span></span></span><button class="btn sm" data-act="child-edit" data-v="${c.id}">Edit</button></div>`).join('') || '<p class="empty">No children yet.</p>'}
      </section>

      ${termsCard()}

      <section class="card"><div class="card-h"><h3>Family</h3></div>
        <form class="row" data-form="family" style="flex-wrap:nowrap"><input id="set-family" placeholder="Family name (optional)" value="${esc(S.family)}" aria-label="Family name" autocomplete="off"><button class="btn" type="submit">Save</button></form>
      </section>

      <section class="card" id="backup"><div class="card-h"><h3>Backup and other devices</h3></div>
        <p class="small">A backup holds everything on this device in one file. Use it to keep a copy safe, or to move your data to your phone or PC: export here, then restore on the other device.</p>
        <div class="row" style="margin-top:12px">
          ${inFrame ? '' : `<button class="btn pri" data-act="export-file">Download backup file</button>`}
          <button class="btn ${inFrame ? 'pri' : ''}" data-act="export-copy">Copy backup as text</button>
          <button class="btn" data-act="go-restore">Restore from a backup</button>
        </div>
        ${inFrame ? '<p class="hint" style="margin-top:8px">In this test link, files can\'t be downloaded. Copy the backup as text and keep it in a note; the installed app adds a Download button.</p>' : ''}
        ${S.backupText ? `<label class="fld" style="margin-top:12px">Backup text<textarea id="backup-text" rows="4" readonly>${esc(S.backupText)}</textarea></label><p class="hint">If copying didn't work, select the text above and copy it yourself.</p>` : ''}
        <p class="meta" style="margin-top:8px">${S.lastBackup ? `Last backup on this device: ${fmtStamp(S.lastBackup)}` : 'No backup made on this device yet.'}${S.restoredAt ? ` · Restored from a backup: ${fmtStamp(S.restoredAt)}` : ''}</p>
      </section>

      <section class="card"><div class="card-h"><h3>Storage on this device</h3>${st.persisted === true ? '<span class="pill on">Kept</span>' : st.persisted === false ? '<span class="pill warn">May be cleared</span>' : ''}</div>
        <p class="small">${st.persisted === true ? 'This browser has agreed to keep the app\'s data, even when space runs low.' : st.persisted === false ? 'This browser may clear the data if the device runs low on space. Ask it to keep the data. Installing the app to your home screen also helps, especially on iPhone.' : 'This browser doesn\'t say whether it keeps the data. Install the app and make regular backups.'}</p>
        ${st.persisted === false ? '<div class="row" style="margin-top:10px"><button class="btn sm pri" data-act="persist">Keep data on this device</button></div>' : ''}
        ${st.usage != null ? `<p class="meta" style="margin-top:8px">Using ${fmtBytes(st.usage)} on this device.</p>` : ''}
      </section>

      <section class="card"><div class="card-h"><h3>Install the app</h3>${installed ? '<span class="pill on">Installed</span>' : ''}</div>
        ${installed ? '<p class="small">Herding Cats is installed and works without internet.</p>'
          : inFrame ? '<p class="small">Installing works once Herding Cats is on its own web address (GitHub Pages). This test link can\'t be installed.</p>'
          : S.installEvt ? '<p class="small">Add Herding Cats to this device so it opens like an app and works without internet.</p><div class="row" style="margin-top:10px"><button class="btn sm pri" data-act="install">Install Herding Cats</button></div>'
          : ios ? '<p class="small">In Safari, tap the Share button, then <b>Add to Home Screen</b>.</p>'
          : '<p class="small">In your browser menu, choose <b>Install app</b> or <b>Add to Home screen</b>.</p>'}
      </section>

      ${signInCard()}

      ${helpCard()}

      ${roadmap()}

      <section class="card"><div class="card-h"><h3>About</h3></div>
        <p class="meta">Herding Cats beta ${VERSION} · Phase 2, milestone ${PHASE2}${inFrame ? ' · test link' : ''}${FH.cloud && FH.cloud.kind === 'fake' ? ' · test accounts (not online)' : ''}</p>
        <p class="meta" style="margin-top:4px">© 2026 Natius. All rights reserved.</p>
      </section>
    </div></div>`;
  }

  /* ---------- Sheets ---------- */
  function childSheet() {
    const sh = S.sheet;
    const c = sh.id ? S.children.find(x => x.id === sh.id) : null;
    const used = new Set(S.children.filter(x => x.id !== sh.id).map(x => x.colour));
    const colour = sh.colour || c?.colour || (COLOURS.find(([k]) => !used.has(k)) || COLOURS[0])[0];
    sh.colour = colour;
    return `<div class="scrim" data-act="close-bg"><div class="panel" role="dialog" aria-modal="true" aria-labelledby="sh-h">
      <h2 id="sh-h">${c ? `Edit ${esc(c.name)}` : 'Add a child'}</h2>
      <form class="form" data-form="child" style="margin-top:14px">
        <label class="full">First name<input id="f-name" value="${esc(c?.name || '')}" placeholder="e.g. Mia" autocomplete="off" required></label>
        <label>Grade<select id="f-grade">${GRADES.map(g => `<option ${g === (c?.grade || 'Grade 1') ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
        <label>Colour<span class="swatches" role="radiogroup" aria-label="Colour">${COLOURS.map(([k, n]) => `<button type="button" class="sw" role="radio" aria-checked="${k === colour}" aria-label="${n}${used.has(k) ? ' (used)' : ''}" title="${n}${used.has(k) ? ' (used)' : ''}" data-act="sh-col" data-v="${k}" style="--c:var(--${k})"></button>`).join('')}</span></label>
        ${used.has(colour) ? `<p class="hint full">Another child already uses ${colName(colour)}. Different colours make the calendar easier to read.</p>` : ''}
        <div class="err full" id="f-err" role="alert"></div>
        <div class="actions full">${c ? `<button type="button" class="btn del${sh.confirm ? ' armed' : ''}" data-act="child-del">${sh.confirm ? `Tap again to remove ${esc(c.name)}` : 'Remove'}</button>` : ''}<button type="button" class="btn" data-act="close">Cancel</button><button class="btn pri" type="submit">${c ? 'Save' : 'Add'}</button></div>
      </form>
    </div></div>`;
  }

  function restoreInput() { return `<input type="file" id="restore-file" accept=".json,application/json,text/plain" hidden>`; }
  function restoreSheet() {
    const sh = S.sheet;
    const sum = sh.summary;
    return `<div class="scrim" data-act="close-bg"><div class="panel" role="dialog" aria-modal="true" aria-labelledby="sh-h">
      <h2 id="sh-h">Restore from a backup</h2>
      ${!sum ? `<p class="small" style="margin:10px 0 14px">Choose the backup file, or paste the backup text you copied on your other device.</p>
        <div class="row"><button class="btn pri" data-act="pick-file">Choose backup file</button></div>
        <label class="fld" style="margin-top:14px">Or paste backup text<textarea id="restore-text" rows="5" placeholder='Starts with {"app":"family-hub"'></textarea></label>
        <div class="err" id="r-err" role="alert">${esc(sh.error || '')}</div>
        <div class="actions"><button class="btn" data-act="close">Cancel</button><button class="btn pri" data-act="check-text">Check backup</button></div>`
      : `<div class="stack" style="margin-top:12px">
          <div class="card sunk"><b>Backup from ${fmtStamp(sum.exportedAt)}</b>${sum.fromThisDevice ? ' <span class="pill">This device</span>' : ''}
            <p class="small" style="margin-top:6px">${sum.children.length ? `Children: ${sum.children.map(esc).join(', ')}` : 'No children in this backup.'}</p></div>
          <p class="small"><b>Restoring replaces everything on this device</b> with the backup. ${S.children.length ? `The ${S.children.length} ${S.children.length === 1 ? 'child' : 'children'} here now will be replaced.` : ''}</p>
          <div class="err" id="r-err" role="alert">${esc(sh.error || '')}</div>
          <div class="actions"><button class="btn" data-act="close">Cancel</button><button class="btn pri${sh.confirm ? ' danger' : ''}" data-act="do-restore">${sh.confirm ? 'Tap again to replace this device\'s data' : 'Restore this backup'}</button></div>
        </div>`}
    </div></div>`;
  }

  /* ---------- Milestone 2 sheets ---------- */
  const panel = (title, inner) => `<div class="scrim" data-act="close-bg"><div class="panel" role="dialog" aria-modal="true" aria-labelledby="sh-h"><h2 id="sh-h">${title}</h2>${inner}</div></div>`;
  const childSelect = sel => `<label>Child<select id="f-child">${S.children.map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>`;
  const delBtn = (sh, what) => `<button type="button" class="btn del${sh.confirm ? ' armed' : ''}" data-act="rec-del">${sh.confirm ? `Tap again to delete ${what}` : 'Delete'}</button>`;
  const typePills = cur => `<div class="types" role="group" aria-label="What to add">${[['task', 'Homework or project'], ['activity', 'Weekly activity'], ['reminder', 'Reminder']].map(([k, l]) => `<button type="button" data-act="add-type" data-v="${k}" aria-pressed="${k === cur}">${l}</button>`).join('')}</div>`;
  const defaultDate = () => (S.view === 'calendar' ? (S.cal.mode === 'month' ? S.cal.sel : (S.cal.cursor >= C.today() ? S.cal.cursor : C.today())) : C.today());

  function activitySheet() {
    const sh = S.sheet;
    const a = sh.id ? S.activities.find(x => x.id === sh.id) : null;
    const days = a ? a.weekdays : [C.dow(defaultDate())];
    return panel(a ? `Edit ${esc(a.title)}` : 'Add', `${a ? '' : typePills('activity')}
      <form class="form" data-form="activity" style="margin-top:${a ? 14 : 0}px">
        ${childSelect(a ? a.owner : sh.child)}
        <label>Activity<input id="f-title" value="${esc(a?.title || '')}" placeholder="e.g. Hockey practice" autocomplete="off"></label>
        <div class="full fieldset"><span class="flbl">Days</span><div class="daychips" role="group" aria-label="Days">${WEEK_ORDER.map(d => `<button type="button" class="dchip" data-act="day-toggle" data-day="${d}" aria-pressed="${days.includes(d)}">${C.DOW[d]}</button>`).join('')}</div></div>
        <label>Starts<input id="f-start" type="time" value="${a?.start || '15:00'}"></label>
        <label>Ends (optional)<input id="f-end" type="time" value="${a?.end || ''}"></label>
        <label class="full">Where (optional)<input id="f-place" value="${esc(a?.place || '')}" placeholder="e.g. School astro" autocomplete="off"></label>
        <label>From<input id="f-from" type="date" value="${a?.from || C.today()}"></label>
        <label>Until (optional)<input id="f-until" type="date" value="${a?.until || ''}"></label>
        <label class="chk full"><input id="f-pause" type="checkbox" ${a?.runsInHolidays ? '' : 'checked'}>Pause during school holidays and days off</label>
        <div class="err full" id="f-err" role="alert"></div>
        <div class="actions full">${a ? delBtn(sh, 'this activity') : ''}<button type="button" class="btn" data-act="close">Cancel</button><button class="btn pri" type="submit">${a ? 'Save' : 'Add activity'}</button></div>
      </form>`);
  }

  function reminderSheet() {
    const sh = S.sheet;
    const r = sh.id ? S.reminders.find(x => x.id === sh.id) : null;
    return panel(r ? `Edit ${esc(r.title)}` : 'Add', `${r ? '' : typePills('reminder')}
      <form class="form" data-form="reminder" style="margin-top:${r ? 14 : 0}px">
        ${childSelect(r ? r.owner : sh.child)}
        <label>Reminder<input id="f-title" value="${esc(r?.title || '')}" placeholder="e.g. Return permission slip" autocomplete="off"></label>
        <label>Date<input id="f-date" type="date" value="${r?.date || defaultDate()}"></label>
        <label>Time (optional)<input id="f-time" type="time" value="${r?.time || ''}"></label>
        <label>Repeats<select id="f-repeat">${C.REPEATS.map(([k, l]) => `<option value="${k}" ${k === (r?.repeat || 'none') ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>Repeat until (optional)<input id="f-until" type="date" value="${r?.until || ''}"></label>
        <div class="err full" id="f-err" role="alert"></div>
        <div class="actions full">${r ? delBtn(sh, 'this reminder') : ''}<button type="button" class="btn" data-act="close">Cancel</button><button class="btn pri" type="submit">${r ? 'Save' : 'Add reminder'}</button></div>
      </form>`);
  }

  function eventSheet() {
    const sh = S.sheet;
    const isAct = sh.ekind === 'act';
    const rec = isAct ? S.activities.find(x => x.id === sh.id) : S.reminders.find(x => x.id === sh.id);
    if (!rec) return panel('Not found', '<p class="small" style="margin:12px 0">This item was removed.</p><div class="actions"><button class="btn" data-act="close">Close</button></div>');
    const skipped = (rec.skips || []).includes(sh.date);
    const repeating = isAct || (rec.repeat && rec.repeat !== 'none');
    const info = isAct ? actSummary(rec) : `${C.fmtDay(rec.date)}${rec.time ? ' at ' + rec.time : ''} · ${C.REPEATS.find(x => x[0] === (rec.repeat || 'none'))[1]}${rec.until ? ` until ${C.fmtDate(rec.until)}` : ''}`;
    return panel(esc(rec.title), `
      <div class="evhead" style="--c:var(--${colOf(rec.owner)})">${avatar(kidOf(rec.owner) || { name: '?', colour: 'c1' })}<span class="min0"><b>${esc(nameOf(rec.owner))}</b> · ${KLABEL[sh.ekind]}<span class="meta" style="display:block">${info}</span></span></div>
      <div class="card sunk" style="margin:12px 0"><b>${C.fmtLong(sh.date)}</b>${isAct && rec.start ? ` · ${rec.start}${rec.end ? '–' + rec.end : ''}` : !isAct && rec.time ? ` · ${rec.time}` : ''}${skipped ? ' <span class="pill warn">Skipped</span>' : ''}</div>
      <div class="actions" style="justify-content:flex-start">
        ${repeating ? `<button class="btn" data-act="ev-skip">${skipped ? 'Undo skip' : `Skip ${C.fmtDay(sh.date)} only`}</button>` : ''}
        <button class="btn pri" data-act="ev-edit">Edit ${isAct ? 'activity' : 'reminder'}</button>
        <button class="btn" data-act="close">Close</button>
      </div>`);
  }

  let stepN = 0;
  const stepRow = x => { const n = ++stepN; return `<div class="steprow" data-id="${esc(x?.id || '')}" data-done="${x?.done ? 1 : 0}"><input id="st-t-${n}" class="st-t" placeholder="Step, e.g. Print photos" aria-label="Step" value="${esc(x?.text || '')}" autocomplete="off"><input id="st-due-${n}" class="st-due" type="date" aria-label="Step due date (optional)" value="${x?.due || ''}"><button type="button" class="rm" data-act="step-rm" aria-label="Remove step">×</button></div>`; };
  function taskSheet() {
    const sh = S.sheet;
    const t = sh.id ? S.tasks.find(x => x.id === sh.id) : null;
    const opt = (list, cur) => list.map(o => `<option ${o === cur ? 'selected' : ''}>${o}</option>`).join('');
    return panel(t ? `Edit ${esc(t.title)}` : 'Add', `${t ? '' : typePills('task')}
      <form class="form" data-form="task" style="margin-top:${t ? 14 : 0}px">
        ${childSelect(t ? t.owner : sh.child)}
        <label>Type<select id="f-kind">${opt(['Homework', 'Project'], t?.type || 'Homework')}</select></label>
        <label class="full">Title<input id="f-title" value="${esc(t?.title || '')}" placeholder="e.g. Book report" autocomplete="off"></label>
        <label>Subject<input id="f-subject" value="${esc(t?.subject || '')}" placeholder="e.g. English" autocomplete="off"></label>
        <label>Due<input id="f-date" type="date" value="${t?.due || C.addDays(defaultDate(), 3)}"></label>
        <label>Priority<select id="f-prio">${opt(PRIOS, t?.priority || 'Medium')}</select></label>
        <label class="full">Notes (optional)<textarea id="f-notes" rows="3" placeholder="e.g. A3 size, at least six labelled photos">${esc(t?.notes || '')}</textarea></label>
        <div class="full fieldset"><span class="flbl">Steps (optional)</span><div class="steps" id="f-steps">${(t?.steps || []).map(stepRow).join('')}</div>
          <button type="button" class="btn sm addstep" data-act="step-add">${ic('plus')}Add step</button>
          <span class="hint">Each step can have its own due date. Dated steps show on the calendar; the others show with the task.</span></div>
        <div class="err full" id="f-err" role="alert"></div>
        <div class="actions full">${t ? delBtn(sh, 'this task') : ''}<button type="button" class="btn" data-act="close">Cancel</button><button class="btn pri" type="submit">${t ? 'Save' : 'Add'}</button></div>
      </form>`);
  }
  function taskViewSheet() {
    const sh = S.sheet;
    const t = S.tasks.find(x => x.id === sh.id);
    if (!t) return panel('Not found', '<p class="small" style="margin:12px 0">This task was removed.</p><div class="actions"><button class="btn" data-act="close">Close</button></div>');
    const steps = t.steps || [];
    return panel(esc(t.title), `
      <div class="evhead">${avatar(kidOf(t.owner) || { name: '?', colour: 'c1' })}<span class="min0"><b>${esc(nameOf(t.owner))}</b> · ${esc(t.subject ? t.subject + ' ' : '')}${esc((t.type || 'Homework').toLowerCase())}<span class="meta" style="display:block">${dueText(t)} · ${esc(t.priority || 'Medium')} priority${t.done ? ' · done' : ''}</span></span></div>
      ${t.notes ? `<div class="tnotes">${esc(t.notes)}</div>` : ''}
      ${steps.length ? `<ul class="subs" style="margin-top:8px">${steps.map(x => `<li style="--c:var(--${colOf(t.owner)})"><button class="cb" role="checkbox" aria-checked="${!!x.done}" aria-label="${esc(x.text)}" data-act="step-done" data-v="${t.id}|${x.id}">${ic('check')}</button><span class="${x.done || t.done ? 'struck' : ''}">${esc(x.text)}</span>${x.due ? `<span class="sd">${C.fmtDay(x.due)}</span>` : ''}</li>`).join('')}</ul>` : ''}
      <div class="actions" style="justify-content:flex-start;margin-top:14px">
        <button class="btn pri" data-act="task-done" data-v="${t.id}">${t.done ? 'Mark not done' : 'Mark done'}</button>
        <button class="btn" data-act="task-edit" data-v="${t.id}">Edit</button>
        <button class="btn" data-act="close">Close</button>
      </div>`);
  }

  function termSheet() {
    const sh = S.sheet;
    const t = sh.id ? S.terms.find(x => x.id === sh.id) : null;
    const o = t?.official;
    return panel(t ? `Edit ${esc(t.name)}` : 'Add a term', `
      <form class="form" data-form="term" style="margin-top:14px">
        <label class="full">Name<input id="f-title" value="${esc(t?.name || '')}" placeholder="e.g. Term 1 2028" autocomplete="off"></label>
        <label>First day<input id="f-start" type="date" value="${t?.start || ''}"></label>
        <label>Last day<input id="f-end" type="date" value="${t?.end || ''}"></label>
        ${o ? `<p class="hint full">Official dates: ${C.fmtDay(o.start)} – ${C.fmtDay(o.end)} ${o.end.slice(0, 4)}.${isEdited(t) ? ' <button type="button" class="linkbtn" data-act="use-official">Use the official dates</button>' : ''}</p>` : ''}
        <div class="err full" id="f-err" role="alert"></div>
        <div class="actions full">${t ? delBtn(sh, 'this term') : ''}<button type="button" class="btn" data-act="close">Cancel</button><button class="btn pri" type="submit">${t ? 'Save' : 'Add term'}</button></div>
      </form>`);
  }

  function dayoffSheet() {
    const sh = S.sheet;
    const d = sh.id ? S.daysoff.find(x => x.id === sh.id) : null;
    const o = d?.official;
    return panel(d ? `Edit ${esc(d.name)}` : 'Add a day off', `
      <form class="form" data-form="dayoff" style="margin-top:14px">
        <label class="full">Name<input id="f-title" value="${esc(d?.name || '')}" placeholder="e.g. Sports day, staff development day" autocomplete="off"></label>
        <label>Date<input id="f-date" type="date" value="${d?.date || C.today()}"></label>
        <label>Last day (optional)<input id="f-end" type="date" value="${d?.end || ''}"></label>
        <p class="hint full">Activities set to pause in holidays don't show on days off.${o ? ` Official date: ${C.fmtDay(o.date)} ${o.date.slice(0, 4)}.` : ''}${o && isEdited(d) ? ' <button type="button" class="linkbtn" data-act="use-official">Use the official date</button>' : ''}</p>
        <div class="err full" id="f-err" role="alert"></div>
        <div class="actions full">${d ? delBtn(sh, 'this day off') : ''}<button type="button" class="btn" data-act="close">Cancel</button><button class="btn pri" type="submit">${d ? 'Save' : 'Add day off'}</button></div>
      </form>`);
  }

  /* ---------- Render ---------- */
  const NAV = [['today', 'Today'], ['calendar', 'Calendar'], ['tasks', 'Tasks'], ['study', 'Study'], ['money', 'Money']];
  const TITLES = { today: 'Herding Cats', calendar: 'Calendar', tasks: 'Tasks', study: 'Study planner', money: 'Money', settings: 'Settings' };

  function render() {
    if (FH.account && FH.account.blocking) return; // the sign-in screens are showing
    const app = $('#app');
    if (S.error) { app.innerHTML = vError(); renderSheet(); return; }
    if (!S.ready) { app.innerHTML = '<div class="solo"><p class="muted center" style="padding-top:40px">Opening Herding Cats…</p></div>'; return; }
    if (!S.children.length && !S.setupDone) {
      if (!S.setup) S.setup = { family: S.family || '', rows: [{ name: '', grade: 'Grade 1', colour: 'c1' }] };
      app.innerHTML = vSetup(); renderSheet(); return;
    }
    const v = S.view;
    const content = v === 'today' ? vToday() : v === 'calendar' ? vCalendar() : v === 'tasks' ? vTasks() : v === 'study' ? vStudy() : v === 'money' ? vMoney() : v === 'settings' ? vSettings() : v === 'child' ? vChild(S.child) : COMING[v] ? vComing(v) : vToday();
    const fab = ['today', 'calendar', 'child', 'tasks'].includes(v) && S.children.length;
    const title = v === 'child' ? (S.children.find(c => c.id === S.child)?.name || 'Child') : TITLES[v] || 'Herding Cats';
    const cur = k => (v === k ? 'aria-current="page"' : '');
    app.innerHTML = `<div class="shell">
      <nav class="side" aria-label="Main">
        <div class="brand">Herding Cats</div><div class="brand-sub"><span class="tagline">family calendar</span> <span class="proto">Beta</span></div>
        ${NAV.map(([k, l]) => `<button class="navbtn" data-act="nav" data-v="${k}" ${cur(k)}>${ic(k)}${l}${COMING[k] ? `<span class="soon">M${COMING[k].m}</span>` : ''}</button>`).join('')}
        <h3>Children</h3>
        ${S.children.map(c => `<button class="navbtn" data-act="open-child" data-v="${c.id}" ${v === 'child' && S.child === c.id ? 'aria-current="page"' : ''}>${avatar(c)}${esc(c.name)}</button>`).join('')}
        <button class="navbtn" data-act="child-add">${ic('plus')}Add child</button>
        <div style="flex:1"></div>
        <button class="navbtn" data-act="nav" data-v="settings" ${cur('settings')}>${ic('settings')}Settings</button>
      </nav>
      <main class="main">
        <header class="topbar"><span class="tcat" aria-hidden="true">${FH.cats[v === 'child' ? 'welcome' : v] || FH.cats.today}</span><h2>${esc(title)}</h2><span class="proto">Beta</span><button class="iconbtn gear" data-act="nav" data-v="settings" aria-label="Settings">${ic('settings')}</button></header>
        ${content}
      </main>
      <nav class="tabbar" aria-label="Main">${NAV.map(([k, l]) => `<button data-act="nav" data-v="${k}" ${cur(k)}>${ic(k)}${l}</button>`).join('')}</nav>
      ${fab ? `<button class="fab" data-act="add" data-v="${v === 'tasks' ? 'task' : S.lastAdd || 'activity'}"${v === 'child' ? ` data-child="${S.child}"` : ''}>${ic('plus')}Add</button>` : ''}
    </div>${restoreInput()}`;
    renderSheet();
  }
  function renderSheet() {
    const el = $('#sheet');
    if (!S.sheet) { el.hidden = true; el.innerHTML = ''; return; }
    const k = S.sheet.kind;
    el.innerHTML = k === 'child' ? childSheet() : k === 'restore' ? restoreSheet() : k === 'activity' ? activitySheet()
      : k === 'reminder' ? reminderSheet() : k === 'event' ? eventSheet() : k === 'task' ? taskSheet() : k === 'taskview' ? taskViewSheet()
      : k === 'period' ? periodSheet() : k === 'exam' ? examSheet() : k === 'session' ? sessionSheet()
      : k === 'account' ? accountSheet() : k === 'entry' ? entrySheet() : k === 'goal' ? goalSheet() : k === 'ledger' ? ledgerSheet() : k === 'settle' ? settleSheet() : k === 'reach' ? reachSheet() : k === 'chore' ? choreSheet() : k === 'digest' ? digestSheet() : k === 'reward' ? rewardSheet() : k === 'term' ? termSheet() : dayoffSheet();
    el.hidden = false;
  }

  /* ---------- Routing ---------- */
  function go(view, child) {
    S.view = view; S.child = child || null;
    try { history.replaceState(null, '', '#' + (view === 'child' ? 'child-' + child : view)); } catch (e) { /* not allowed here */ }
    render(); window.scrollTo(0, 0);
  }
  function fromHash() {
    let h = ''; try { h = (location.hash || '').slice(1); } catch (e) { /* ignore */ }
    if (h.startsWith('child-')) { S.view = 'child'; S.child = h.slice(6); }
    else if (TITLES[h]) S.view = h;
  }

  /* ---------- Toast ---------- */
  let toastT;
  function toast(m) { const el = $('#toast'); el.textContent = m; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 3200); }

  /* ---------- Actions ---------- */
  async function saveChild() {
    const sh = S.sheet;
    const name = $('#f-name').value.trim();
    if (!name) { $('#f-err').textContent = "Enter the child's first name."; $('#f-name').focus(); return; }
    const twin = S.children.find(c => c.id !== sh.id && c.name.toLowerCase() === name.toLowerCase());
    if (twin) { $('#f-err').textContent = `There is already a child called ${twin.name}. Use a different name, or add a surname initial.`; return; }
    const rec = { type: 'child', name, grade: $('#f-grade').value, colour: sh.colour };
    if (sh.id) rec.id = sh.id; else rec.order = S.children.length;
    await data.save('people', rec);
    S.sheet = null; await load(); render();
    toast(sh.id ? `${name} updated.` : `${name} added.`);
  }

  /* ---------- Milestone 2 saves ---------- */
  const val = id => ($(id)?.value ?? '').trim();
  const fail = m => { const e = $('#f-err'); if (e) e.textContent = m; return false; };

  async function saveActivity() {
    const sh = S.sheet;
    const title = val('#f-title');
    const weekdays = [...document.querySelectorAll('.dchip[aria-pressed="true"]')].map(b => Number(b.dataset.day));
    const start = val('#f-start'), end = val('#f-end'), from = val('#f-from'), until = val('#f-until');
    if (!title) return fail('Give the activity a name, for example Hockey practice.');
    if (!weekdays.length) return fail('Choose at least one day of the week.');
    if (!C.isTime(start)) return fail('Enter the start time.');
    if (end && !C.isTime(end)) return fail('The end time is not a valid time.');
    if (end && end <= start) return fail('The end time must be after the start time.');
    if (from && !C.isDate(from)) return fail('The From date is not a valid date.');
    if (until && !C.isDate(until)) return fail('The Until date is not a valid date.');
    if (from && until && until < from) return fail('The Until date must be on or after the From date.');
    const rec = { owner: val('#f-child'), title, weekdays, start, end, place: val('#f-place'), from: from || C.today(), until, runsInHolidays: !$('#f-pause').checked };
    if (sh.id) rec.id = sh.id; else rec.skips = [];
    await data.save('activities', rec);
    S.sheet = null; S.lastAdd = 'activity'; await load(); render();
    toast(`${title} ${sh.id ? 'updated' : `added for ${nameOf(rec.owner)}: ${daysText(weekdays).toLowerCase() === 'every day' ? 'every day' : daysText(weekdays)}`}.`);
    return true;
  }
  async function saveReminder() {
    const sh = S.sheet;
    const title = val('#f-title'), date = val('#f-date'), time = val('#f-time'), repeat = val('#f-repeat'), until = val('#f-until');
    if (!title) return fail('Give the reminder a name.');
    if (!C.isDate(date)) return fail('Choose the date for the reminder.');
    if (time && !C.isTime(time)) return fail('The time is not a valid time.');
    if (until && !C.isDate(until)) return fail('The Repeat until date is not a valid date.');
    if (until && until < date) return fail('Repeat until must be on or after the reminder date.');
    const rec = { owner: val('#f-child'), title, date, time, repeat, until: repeat === 'none' ? '' : until };
    if (sh.id) rec.id = sh.id; else rec.skips = [];
    await data.save('reminders', rec);
    S.sheet = null; S.lastAdd = 'reminder'; await load();
    if (S.view === 'calendar') { S.cal.cursor = date; S.cal.sel = date; }
    render();
    toast(`${title} ${sh.id ? 'updated' : 'added'} for ${C.fmtDay(date)}.`);
    return true;
  }
  async function saveTask() {
    const sh = S.sheet;
    const old = sh.id ? S.tasks.find(x => x.id === sh.id) : null;
    const title = val('#f-title'), due = val('#f-date');
    if (!title) return fail('Give the task a title, for example Book report.');
    if (!C.isDate(due)) return fail('Choose the due date.');
    const steps = [];
    for (const r of document.querySelectorAll('#f-steps .steprow')) {
      const text = r.querySelector('.st-t').value.trim(), sdue = r.querySelector('.st-due').value;
      if (!text) continue;
      if (sdue && !C.isDate(sdue)) return fail(`The date for the step "${text}" is not a valid date.`);
      if (sdue && sdue > due) return fail(`The step "${text}" is due after the task itself (${C.fmtDay(due)}). Move the step's date or the task's due date.`);
      steps.push({ id: r.dataset.id || sid(), text, due: sdue, done: r.dataset.done === '1' });
    }
    const rec = { owner: val('#f-child'), type: val('#f-kind'), title, subject: val('#f-subject'), due, priority: val('#f-prio'), notes: ($('#f-notes')?.value || '').trim(), steps };
    if (old) rec.id = old.id; else rec.done = false;
    const saved = await data.save('tasks', rec);
    S.sheet = null; S.lastAdd = 'task'; S.openTask = saved.id; await load();
    if (S.view === 'calendar') { S.cal.cursor = due; S.cal.sel = due; }
    render();
    toast(`${title} ${old ? 'updated' : `added for ${nameOf(rec.owner)}`}, due ${C.fmtDay(due)}.`);
    return true;
  }

  async function saveTerm() {
    const sh = S.sheet;
    const name = val('#f-title'), start = val('#f-start'), end = val('#f-end');
    if (!name) return fail('Give the term a name, for example Term 1 2028.');
    if (!C.isDate(start) || !C.isDate(end)) return fail('Choose the first and last day of the term.');
    if (end <= start) return fail('The last day must be after the first day.');
    const clash = S.terms.find(t => t.id !== sh.id && start <= t.end && end >= t.start);
    if (clash) return fail(`These dates overlap ${clash.name} (${C.fmtDay(clash.start)} – ${C.fmtDay(clash.end)} ${clash.end.slice(0, 4)}). Change one of them.`);
    const rec = { name, start, end };
    if (sh.id) rec.id = sh.id;
    await data.save('terms', rec);
    S.sheet = null; await load(); render();
    toast(`${name} saved. Activities follow the new dates.`);
    return true;
  }
  async function saveDayoff() {
    const sh = S.sheet;
    const name = val('#f-title'), date = val('#f-date'), end = val('#f-end');
    if (!name) return fail('Give the day off a name, for example Sports day.');
    if (!C.isDate(date)) return fail('Choose the date.');
    if (end && (!C.isDate(end) || end < date)) return fail('The last day must be on or after the first day.');
    const rec = { name, date, end: end && end > date ? end : '' };
    if (sh.id) rec.id = sh.id;
    await data.save('daysoff', rec);
    S.sheet = null; await load(); render();
    toast(`${name} saved. Activities that pause in holidays won't show that day.`);
    return true;
  }

  function openAdd(kind, child) {
    if (!S.children.length) { toast('Add a child first.'); return; }
    const vis = S.children.filter(c => !S.hidden.has(c.id));
    const pick = child || (S.view === 'child' ? S.child : (vis.length === 1 ? vis[0].id : S.children[0].id));
    S.sheet = { kind, child: pick }; renderSheet();
    setTimeout(() => $('#f-title')?.focus(), 30);
  }

  async function finishSetup() {
    const rows = S.setup.rows.map(r => ({ ...r, name: r.name.trim() })).filter(r => r.name);
    const err = $('#su-err');
    if (!rows.length) { err.textContent = 'Add at least one child to start.'; $('#su-name-0')?.focus(); return; }
    const names = rows.map(r => r.name.toLowerCase());
    if (new Set(names).size !== names.length) { err.textContent = 'Two children have the same name. Add a surname initial to tell them apart.'; return; }
    for (const [i, r] of rows.entries()) await data.save('people', { type: 'child', name: r.name, grade: r.grade, colour: r.colour, order: i });
    if (S.setup.family.trim()) await data.setSetting('familyName', S.setup.family.trim());
    await data.setSetting('setupDone', true);
    S.setup = null; await load(); go('today');
    toast('Herding Cats is ready. Make a backup in Settings once you have added more.');
    tryPersist(false);
  }
  function readSetupInputs() {
    if (!S.setup) return;
    const fam = $('#su-family'); if (fam) S.setup.family = fam.value;
    S.setup.rows.forEach((r, i) => {
      const n = $('#su-name-' + i), g = $('#su-grade-' + i);
      if (n) r.name = n.value; if (g) r.grade = g.value;
    });
  }

  async function makeBackup() {
    const b = await data.exportBackup();
    const text = JSON.stringify(b);
    await data.setSetting('lastBackup', b.exportedAt);
    S.lastBackup = b.exportedAt;
    return { b, text };
  }
  async function exportFile() {
    const { b, text } = await makeBackup();
    const d = new Date(b.exportedAt);
    const name = `herding-cats-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    render(); toast(`Backup saved as ${name}.`);
  }
  async function exportCopy() {
    const { text } = await makeBackup();
    S.backupText = text; render();
    try { await navigator.clipboard.writeText(text); toast('Backup copied. Paste it into a note or message to keep it.'); }
    catch (e) { const ta = $('#backup-text'); if (ta) { ta.focus(); ta.select(); } toast('Copying was blocked here. The backup text is selected below; copy it yourself.'); }
  }

  function startRestore() { S.sheet = { kind: 'restore' }; renderSheet(); }
  function checkBackupText(text, fromFile) {
    let obj;
    try { obj = JSON.parse(text); }
    catch (e) { S.sheet.error = fromFile ? "This file can't be read as a Herding Cats backup. Choose the .json file the app exported." : "This text isn't a complete backup. Copy the whole backup again and paste all of it."; renderSheet(); return; }
    try { S.sheet.summary = data.checkBackup(obj); S.sheet.backup = obj; S.sheet.error = ''; }
    catch (e) { S.sheet.error = e.message; }
    renderSheet();
  }
  async function doRestore() {
    const sh = S.sheet;
    if (!sh.confirm) { sh.confirm = true; renderSheet(); return; }
    try {
      await data.restoreBackup(sh.backup);
      await importOfficial();
      S.sheet = null; S.setup = null; await loadSettings(); await load(); go('today');
      toast('Backup restored. This device now has the same data as the backup.');
    } catch (e) { sh.error = `Nothing was changed. ${e.message}`; sh.confirm = false; renderSheet(); }
  }

  async function tryPersist(announce) {
    try {
      if (!navigator.storage?.persist) { if (announce) toast("This browser can't promise to keep the data. Install the app and make regular backups."); return; }
      const ok = await navigator.storage.persist();
      await refreshStorage(); render();
      if (announce) toast(ok ? 'This device will keep the app\'s data.' : 'The browser said no for now. Installing the app to your home screen usually changes that.');
    } catch (e) { /* ignore */ }
  }
  async function loadSettings() {
    S.lastBackup = await data.getSetting('lastBackup', null);
    S.restoredAt = await data.getSetting('restoredAt', null);
  }

  /* ---------- Events ---------- */
  document.addEventListener('click', async ev => {
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.act, v = b.dataset.v;
    if (a === 'close-bg') { if (ev.target === b) { S.sheet = null; renderSheet(); } return; }
    try {
      switch (a) {
        case 'retry': location.reload(); return;
        case 'nav': go(v); if (b.dataset.scroll) setTimeout(() => document.getElementById(b.dataset.scroll)?.scrollIntoView({ behavior: 'smooth' }), 50); return;
        case 'open-child': go('child', v); return;
        case 'child-add': S.sheet = { kind: 'child' }; renderSheet(); setTimeout(() => $('#f-name')?.focus(), 30); return;
        case 'child-edit': S.sheet = { kind: 'child', id: v }; renderSheet(); return;
        case 'sh-col': {
          const nameVal = $('#f-name')?.value, gradeVal = $('#f-grade')?.value;
          S.sheet.colour = v; renderSheet();
          if (nameVal != null) $('#f-name').value = nameVal; if (gradeVal) $('#f-grade').value = gradeVal;
          return;
        }
        case 'child-del': {
          const sh = S.sheet;
          if (!sh.confirm) { sh.confirm = true; b.classList.add('armed'); b.textContent = `Tap again to remove ${S.children.find(c => c.id === sh.id)?.name || 'this child'}`; return; }
          const name = S.children.find(c => c.id === sh.id)?.name;
          for (const x of S.activities.filter(r => r.owner === sh.id)) await data.remove('activities', x.id);
          for (const x of S.reminders.filter(r => r.owner === sh.id)) await data.remove('reminders', x.id);
          for (const x of S.tasks.filter(r => r.owner === sh.id)) await data.remove('tasks', x.id);
          for (const st of ['sessions', 'exams', 'periods', 'entries', 'goals', 'accounts', 'ledger', 'chores', 'rewards']) for (const x of S[st].filter(r => r.owner === sh.id)) await data.remove(st, x.id);
          await data.remove('people', sh.id);
          S.sheet = null; await load();
          if (S.view === 'child' && S.child === sh.id) go('today'); else render();
          toast(`${name} removed.`); return;
        }
        case 'close': S.sheet = null; renderSheet(); return;
        case 'su-add': readSetupInputs(); S.setup.rows.push({ name: '', grade: 'Grade 1', colour: (COLOURS.find(([k]) => !S.setup.rows.some(r => r.colour === k)) || COLOURS[0])[0] }); render(); $('#su-name-' + (S.setup.rows.length - 1))?.focus(); return;
        case 'su-rm': readSetupInputs(); S.setup.rows.splice(Number(v), 1); render(); return;
        case 'su-col': { readSetupInputs(); const [i, k] = v.split('|'); S.setup.rows[Number(i)].colour = k; render(); return; }
        case 'su-finish': readSetupInputs(); await finishSetup(); return;
        case 'acct-signout': FH.account.signOut(); return;
        case 'export-file': await exportFile(); return;
        case 'export-copy': await exportCopy(); return;
        case 'go-restore': startRestore(); return;
        case 'pick-file': $('#restore-file').click(); return;
        case 'check-text': { const t = $('#restore-text').value.trim(); if (!t) { S.sheet.error = 'Paste the backup text first, or choose the backup file.'; renderSheet(); return; } checkBackupText(t, false); return; }
        case 'do-restore': await doRestore(); return;
        case 'persist': await tryPersist(true); return;
        /* calendar */
        case 'vis':
          if (v === 'all') S.hidden = new Set(); else S.hidden.has(v) ? S.hidden.delete(v) : S.hidden.add(v);
          saveCalPrefs(); render(); return;
        case 'kind':
          if (v === 'all') S.kinds = new Set(KINDS.map(x => x[0])); else S.kinds.has(v) ? S.kinds.delete(v) : S.kinds.add(v);
          saveCalPrefs(); render(); return;
        case 'calmode': S.cal.mode = v; if (v === 'month') S.cal.sel = S.cal.cursor; saveCalPrefs(); render(); return;
        case 'calprev': case 'calnext': {
          const dir = a === 'calnext' ? 1 : -1;
          if (S.cal.mode === 'week') S.cal.cursor = C.addDays(S.cal.cursor, 7 * dir);
          else { const d = C.toD(S.cal.cursor.slice(0, 8) + '01'); d.setMonth(d.getMonth() + dir); S.cal.cursor = C.toS(d); S.cal.sel = S.cal.cursor; }
          render(); return;
        }
        case 'caltoday': S.cal.cursor = C.today(); S.cal.sel = C.today(); render(); return;
        case 'selday': S.cal.sel = v; S.cal.cursor = v; render(); return;
        /* adding and editing */
        case 'add': openAdd(v, b.dataset.child); return;
        case 'add-type': {
          const child = $('#f-child')?.value, title = $('#f-title')?.value;
          S.sheet = { kind: v, child }; renderSheet();
          if (title) $('#f-title').value = title;
          return;
        }
        case 'day-toggle': b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); return;
        case 'ev': {
          const [k, id, date] = v.split('|');
          S.sheet = k === 'task' || k === 'step' ? { kind: 'taskview', id } : k === 'exam' ? { kind: 'exam', id } : k === 'study' ? { kind: 'session', id } : { kind: 'event', ekind: k, id, date };
          renderSheet(); return;
        }
        /* tasks */
        case 'tfilter': S.taskFilter = v; render(); return;
        case 'task-open': S.openTask = S.openTask === v ? null : v; render(); return;
        case 'task-edit': S.sheet = { kind: 'task', id: v }; renderSheet(); return;
        case 'task-done': {
          const t = S.tasks.find(x => x.id === v);
          await data.save('tasks', { id: t.id, done: !t.done, doneAt: t.done ? '' : new Date().toISOString() });
          await load(); render(); renderSheet();
          toast(t.done ? `${t.title} is open again.` : `${t.title} marked done.`);
          return;
        }
        case 'step-done': {
          const [tid, stid] = v.split('|');
          const t = S.tasks.find(x => x.id === tid);
          const steps = (t.steps || []).map(x => x.id === stid ? { ...x, done: !x.done } : x);
          await data.save('tasks', { id: t.id, steps });
          await load(); render(); renderSheet();
          if (steps.length && steps.every(x => x.done) && !t.done) toast(`All steps of ${t.title} are done. Tick the task when it's handed in.`);
          return;
        }
        case 'step-add': { const box = $('#f-steps'); box.insertAdjacentHTML('beforeend', stepRow(null)); box.lastElementChild.querySelector('.st-t').focus(); return; }
        case 'step-rm': b.closest('.steprow').remove(); return;
        case 'ev-skip': {
          const sh = S.sheet;
          const store = sh.ekind === 'act' ? 'activities' : 'reminders';
          const rec = (sh.ekind === 'act' ? S.activities : S.reminders).find(x => x.id === sh.id);
          const skips = new Set(rec.skips || []);
          const undo = skips.has(sh.date);
          undo ? skips.delete(sh.date) : skips.add(sh.date);
          await data.save(store, { id: rec.id, skips: [...skips].sort() });
          await load(); render(); renderSheet();
          toast(undo ? `${rec.title} is back on for ${C.fmtDay(sh.date)}.` : `${rec.title} skipped on ${C.fmtDay(sh.date)} only.`);
          return;
        }
        case 'ev-edit': S.sheet = { kind: S.sheet.ekind === 'act' ? 'activity' : 'reminder', id: S.sheet.id }; renderSheet(); return;
        case 'act-edit': S.sheet = { kind: 'activity', id: v }; renderSheet(); return;
        case 'term-edit': S.sheet = { kind: 'term', id: v }; renderSheet(); return;
        case 'term-add': S.sheet = { kind: 'term' }; renderSheet(); return;
        case 'day-edit': S.sheet = { kind: 'dayoff', id: v }; renderSheet(); return;
        case 'day-add': S.sheet = { kind: 'dayoff' }; renderSheet(); return;
        case 'past-terms': S.pastTerms = !S.pastTerms; render(); return;
        case 'use-official': {
          const sh = S.sheet;
          const rec = (sh.kind === 'term' ? S.terms : S.daysoff).find(x => x.id === sh.id);
          if (!rec?.official) return;
          for (const [k2, v2] of Object.entries(rec.official)) { const f = { name: '#f-title', start: '#f-start', end: '#f-end', date: '#f-date' }[k2]; if (f && $(f)) $(f).value = v2; }
          toast('Official dates filled in. Tap Save to keep them.');
          return;
        }
        case 'terms-reset':
          if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'Tap again to reset official dates'; return; }
          await resetOfficial(); await load(); render();
          toast('Official terms and holidays restored. Days off you added are kept.');
          return;
        case 'rec-del': {
          const sh = S.sheet;
          if (!sh.confirm) { sh.confirm = true; b.classList.add('armed'); b.textContent = 'Tap again to delete'; return; }
          const store = { activity: 'activities', reminder: 'reminders', term: 'terms', dayoff: 'daysoff', task: 'tasks', exam: 'exams', session: 'sessions', period: 'periods', account: 'accounts', entry: 'entries', goal: 'goals', ledger: 'ledger', chore: 'chores', reward: 'rewards' }[sh.kind];
          const list = { activity: S.activities, reminder: S.reminders, term: S.terms, dayoff: S.daysoff, task: S.tasks, exam: S.exams, session: S.sessions, period: S.periods, account: S.accounts, entry: S.entries, goal: S.goals, ledger: S.ledger, chore: S.chores, reward: S.rewards }[sh.kind];
          if (sh.kind === 'account') for (const st of ['entries', 'goals']) for (const x of S[st].filter(r => r.account === sh.id)) await data.remove(st, x.id);
          if (sh.kind === 'period') for (const st of ['sessions', 'exams']) for (const x of S[st].filter(r => r.period === sh.id)) await data.remove(st, x.id);
          if (sh.kind === 'exam') for (const x of S.sessions.filter(r => r.exam === sh.id && !r.done)) await data.remove('sessions', x.id);
          const rec = list.find(x => x.id === sh.id);
          await data.remove(store, sh.id);
          S.sheet = null; await load(); render();
          toast(`${rec?.title || rec?.name || 'Item'} deleted.`);
          return;
        }
        /* study planner */
        case 'study-period': S.study.period = v; S.study.imp = null; render(); return;
        case 'study-tab': S.study.tab = v; render(); return;
        case 'period-add': if (!S.children.length) { toast('Add a child first.'); return; } S.sheet = { kind: 'period', child: S.view === 'child' ? S.child : (S.periods.find(x => x.id === S.study.period)?.owner || S.children[0].id) }; renderSheet(); return;
        case 'period-edit': S.sheet = { kind: 'period', id: v }; renderSheet(); return;
        case 'exam-add': S.sheet = { kind: 'exam' }; renderSheet(); setTimeout(() => $('#f-title')?.focus(), 30); return;
        case 'exam-edit': S.sheet = { kind: 'exam', id: v }; renderSheet(); return;
        case 'imp-start': S.study.imp = { period: S.study.period, stage: 'pick', rows: [] }; render(); return;
        case 'imp-cancel': try { if (S.study.imp?.photo) URL.revokeObjectURL(S.study.imp.photo); } catch (e) { /* ignore */ } S.study.imp = null; render(); return;
        case 'imp-text': {
          const t = ($('#imp-text')?.value || '').trim();
          if (!t) { $('#imp-err').textContent = 'Paste the timetable text first, or choose a photo.'; return; }
          Object.assign(S.study.imp, { stage: 'review', text: t, rows: FH.study.parseTimetable(t, C.today()), photo: null });
          render(); return;
        }
        case 'imp-manual': Object.assign(S.study.imp, { stage: 'review', text: '', rows: [{ subject: '', paper: '', date: '', time: '08:30', flag: '' }] }); render(); return;
        case 'imp-row-rm': syncImportRows(); S.study.imp.rows.splice(Number(v), 1); render(); return;
        case 'imp-row-add': { syncImportRows(); const last = S.study.imp.rows[S.study.imp.rows.length - 1]; S.study.imp.rows.push({ subject: '', paper: '', date: last?.date || '', time: last?.time || '08:30', flag: '' }); render(); document.getElementById(`ir-s-${S.study.imp.rows.length - 1}`)?.focus(); return; }
        case 'imp-save': await saveImport(); return;
        case 'plan-build': await buildPlan(false); return;
        case 'plan-rebuild':
          if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'Tap again to rebuild'; return; }
          await buildPlan(true); return;
        case 'sess-done': {
          const x = S.sessions.find(r => r.id === v);
          await data.save('sessions', { id: x.id, done: !x.done });
          await load(); render(); renderSheet(); return;
        }
        case 'sess-edit': S.sheet = { kind: 'session', id: v }; renderSheet(); return;
        case 'sess-add': S.sheet = { kind: 'session', period: S.study.period }; renderSheet(); return;
        /* money */
        case 'money-child': S.moneyChild = v; S.editBal = null; S.editAlloc = null; if (S.view !== 'money') go('money'); else render(); return;
        case 'acc-add': S.sheet = { kind: 'account', child: S.moneyChild || S.children[0]?.id }; renderSheet(); return;
        case 'acc-edit': S.sheet = { kind: 'account', id: v }; renderSheet(); return;
        case 'entry-add': { const [acc, type] = v.split('|'); S.sheet = { kind: 'entry', account: acc, type }; renderSheet(); setTimeout(() => $('#f-amount')?.focus(), 30); return; }
        case 'entry-edit': S.sheet = { kind: 'entry', id: v }; renderSheet(); return;
        case 'bal-edit': S.editBal = v; S.editAlloc = null; render(); setTimeout(() => $('#bal-' + v)?.select(), 30); return;
        case 'bal-cancel': S.editBal = null; render(); return;
        case 'hist-all': S.histAll[v] = !S.histAll[v]; render(); return;
        case 'goal-add': S.sheet = { kind: 'goal', account: v }; renderSheet(); setTimeout(() => $('#f-title')?.focus(), 30); return;
        case 'goal-edit': S.sheet = { kind: 'goal', id: v }; renderSheet(); return;
        case 'goal-up': await moveGoal(v, -1); return;
        case 'goal-down': await moveGoal(v, 1); return;
        case 'goal-reach': S.sheet = { kind: 'reach', id: v }; renderSheet(); return;
        case 'goal-reopen': {
          const g = S.goals.find(x => x.id === v);
          const order = Math.max(-1, ...S.goals.filter(x => x.account === g.account && x.status !== 'reached').map(x => x.order ?? 0)) + 1;
          await data.save('goals', { id: g.id, status: 'active', reachedAt: '', order });
          await load(); render(); toast(`${g.name} is back in the list${g.spent ? '. The withdrawal is still in the history; delete it there if it was a mistake' : ''}.`); return;
        }
        case 'alloc-edit': S.editAlloc = v; S.editBal = null; render(); return;
        case 'alloc-cancel': S.editAlloc = null; render(); return;
        case 'alloc-even': { const rows = allocRows(); const out = M.splitEvenly(rows.map(r => ({ id: r.dataset.g }))); for (const o of out) { const el = document.getElementById('alloc-' + o.id); if (el) el.value = String(o.pct).replace('.', ','); } updAlloc(); return; }
        case 'alloc-first': {
          const a = S.accounts.find(x => x.id === S.editAlloc);
          const cur = allocRows().map(r => ({ id: r.dataset.g, pct: pctVal(r.querySelector('input')) || 0, target: S.goals.find(g => g.id === r.dataset.g).target }));
          for (const o of M.completeFirst(Math.max(0, balOf(a)), cur, v)) { const el = document.getElementById('alloc-' + o.id); if (el) el.value = String(o.pct).replace('.', ','); }
          updAlloc(); return;
        }
        case 'alloc-save': {
          const vals = allocRows().map(r => ({ id: r.dataset.g, p: pctVal(r.querySelector('input')) }));
          const errEl = $('#alloc-err');
          if (vals.some(x => Number.isNaN(x.p) || x.p < 0 || x.p > 100)) { errEl.textContent = 'Each share must be a number from 0 to 100.'; return; }
          const sum = vals.reduce((n, x) => n + x.p, 0);
          if (sum > 100.005) { errEl.textContent = `The shares add up to ${pctTxt(sum)}. Lower one so the total is 100% or less.`; return; }
          for (const x of vals) await data.save('goals', { id: x.id, pct: M.pctRound(x.p) });
          S.editAlloc = null; await load(); render(); toast('Allocation saved.'); return;
        }
        case 'led-add': S.sheet = { kind: 'ledger', child: S.moneyChild || S.children[0]?.id }; renderSheet(); setTimeout(() => $('#f-amount')?.focus(), 30); return;
        case 'led-edit': S.sheet = { kind: 'ledger', id: v }; renderSheet(); return;
        case 'led-settle': S.sheet = { kind: 'settle', id: v }; renderSheet(); return;
        case 'led-hist': S.ledgerHist = !S.ledgerHist; return;
        case 'pay-rm': {
          const l = S.ledger.find(x => x.id === S.sheet.id);
          const payments = (l.payments || []).filter((_, i) => i !== Number(v));
          await data.save('ledger', { id: l.id, payments, settledAt: M.paidOf({ payments }) >= l.amount ? l.settledAt : '' });
          await load(); renderSheet(); render(); toast('Payment removed.'); return;
        }
        /* chores and reward goals */
        case 'chore-add': S.sheet = { kind: 'chore', child: S.view === 'child' ? S.child : S.moneyChild || S.children[0]?.id }; renderSheet(); setTimeout(() => $('#f-title')?.focus(), 30); return;
        case 'chore-edit': S.sheet = { kind: 'chore', id: v }; renderSheet(); return;
        case 'chore-mark': {
          const [cid, st] = v.split('|'); const c = S.chores.find(x => x.id === cid);
          const d = K.curOcc(c, C.today()); if (!d) return;
          const log = { ...(c.log || {}) }; if (log[d] === st) delete log[d]; else log[d] = st;
          await data.save('chores', { id: c.id, log }); await load(); render();
          if (log[d]) toast(`${c.title}: ${st === 'done' ? 'done' : 'not done'}.`);
          return;
        }
        case 'chore-occ': {
          const [cid, d] = v.split('|'); const c = S.chores.find(x => x.id === cid);
          const log = { ...(c.log || {}) }; const cur = log[d];
          if (!cur) log[d] = 'done'; else if (cur === 'done') log[d] = 'missed'; else delete log[d];
          await data.save('chores', { id: c.id, log }); await load(); render(); return;
        }
        case 'chore-prev': case 'chore-next': {
          const c = S.chores.find(x => x.id === v); const r = K.periodOf(c, S.choreView[c.id] || C.today());
          let nv = a === 'chore-prev' ? C.addDays(r.start, -1) : C.addDays(r.end, 1); if (nv > C.today()) nv = C.today();
          S.choreView[c.id] = nv; render(); return;
        }
        case 'chore-view': { const [cid, d] = v.split('|'); S.choreView[cid] = d; render(); return; }
        case 'chore-approve': { const [cid, d] = v.split('|'); await approveChore(cid, d); return; }
        case 'reward-add': S.sheet = { kind: 'reward', child: S.view === 'child' ? S.child : S.moneyChild || S.children[0]?.id }; renderSheet(); setTimeout(() => $('#f-title')?.focus(), 30); return;
        case 'reward-edit': S.sheet = { kind: 'reward', id: v }; renderSheet(); return;
        case 'reward-plus': case 'reward-minus': {
          const g = S.rewards.find(x => x.id === v); const log = [...(g.log || [])];
          let count = g.count;
          if (a === 'reward-plus' && count < g.target) { count++; log.push(C.today()); }
          if (a === 'reward-minus' && count > 0 && !g.paid) { count--; log.pop(); }
          await data.save('rewards', { id: g.id, count, log }); await load(); render();
          if (a === 'reward-plus' && count === g.target) toast(`${nameOf(g.owner)} reached the goal. Approve the reward when you're ready.`);
          return;
        }
        case 'reward-approve': {
          const g = S.rewards.find(x => x.id === v); if (g.paid) return;
          let ledger = '';
          if (g.bonus) ledger = (await data.save('ledger', { owner: g.owner, dir: 'owe', amount: g.bonus, date: C.today(), note: `Reward: ${g.title}`, payments: [], settledAt: '' })).id;
          await data.save('rewards', { id: g.id, paid: { date: C.today(), ledger } }); await load(); render();
          toast(`Reward approved${g.bonus ? `. ${M.fmt(g.bonus)} added to what you owe ${nameOf(g.owner)}` : ''}${g.extra ? `. Also: ${g.extra}` : ''}.`);
          return;
        }
        /* digest and shortcuts */
        case 'digest-open': S.sheet = { kind: 'digest' }; renderSheet(); return;
        case 'digest-close': S.sheet = null; renderSheet(); await data.setSetting('digestSeen', C.today()); return;
        case 'only-child': S.hidden = new Set(S.children.filter(c => c.id !== v).map(c => c.id)); S.cal.mode = 'week'; S.cal.cursor = C.today(); saveCalPrefs(); go('calendar'); return;
        case 'install': if (S.installEvt) { S.installEvt.prompt(); const r = await S.installEvt.userChoice; S.installEvt = null; render(); if (r.outcome === 'accepted') toast('Herding Cats is being installed.'); } return;
        default: return;
      }
    } catch (e) {
      console.error(e);
      toast(e.name === 'AccessError' ? e.message : `Something went wrong and nothing was saved: ${e.message}`);
    }
  });

  document.addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = ev.target.dataset.form;
    try {
      if (f === 'child') await saveChild();
      if (f === 'task') await saveTask();
      if (f === 'period') await savePeriod();
      if (f === 'account') await saveAccount();
      if (f === 'entry') await saveEntry();
      if (f === 'goal') await saveGoal();
      if (f === 'reach') await saveReach();
      if (f === 'chore') await saveChore();
      if (f === 'reward') await saveReward();
      if (f === 'ledger') await saveLedger();
      if (f === 'settle') await saveSettle();
      if (f === 'exam') await saveExam();
      if (f === 'session') await saveSession();
      if (f === 'activity') await saveActivity();
      if (f === 'reminder') await saveReminder();
      if (f === 'term') await saveTerm();
      if (f === 'dayoff') await saveDayoff();
      if (f === 'balance') await saveBalance(ev.target.dataset.v);
      if (f === 'family') { await data.setSetting('familyName', $('#set-family').value.trim()); S.family = $('#set-family').value.trim(); if (FH.account) FH.account.renameFamily(S.family); render(); toast('Family name saved.'); }
    } catch (e) { console.error(e); toast(`Nothing was saved: ${e.message}`); }
  });

  document.addEventListener('input', ev => {
    const t = ev.target;
    if (t.id && t.id.startsWith('alloc-')) updAlloc();
    if (t.classList.contains('su-name')) { const av = t.closest('.crow')?.querySelector('.avatar'); if (av) av.textContent = (t.value.trim()[0] || '?'); }
  });

  document.addEventListener('change', ev => {
    if (ev.target.id === 'imp-photo') { const f = ev.target.files && ev.target.files[0]; ev.target.value = ''; if (f && S.study.imp) readPhoto(f); return; }
    if (ev.target.id !== 'restore-file') return;
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    if (!S.sheet || S.sheet.kind !== 'restore') S.sheet = { kind: 'restore' };
    const rd = new FileReader();
    rd.onload = () => checkBackupText(String(rd.result), true);
    rd.onerror = () => { S.sheet.error = "The file couldn't be opened. Try choosing it again."; renderSheet(); };
    rd.readAsText(file);
    ev.target.value = '';
  });

  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && S.sheet) { S.sheet = null; renderSheet(); } });
  window.addEventListener('hashchange', () => { fromHash(); render(); });
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.installEvt = e; if (S.view === 'settings') render(); });
  window.addEventListener('appinstalled', () => { S.installEvt = null; toast('Herding Cats is installed.'); render(); });

  /* ---------- Offline support (only when the app has its own web address) ---------- */
  if ('serviceWorker' in navigator && !inFrame && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(e => console.warn('Offline support not available:', e)); });
    /* When a new version has been downloaded, switch to it straight away unless a form is open. */
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded) return;
      if (S.sheet) { toast('Herding Cats has been updated. Close and reopen it to use the new version.'); return; }
      reloaded = true; location.reload();
    });
  }

  /* ---------- Start ---------- */
  (async function start() {
    fromHash();
    render();
    try {
      if (FH.account) {
        const s = await FH.account.gate();
        S.session = s;
        data.useDatabase('hc-' + s.familyId);
        await data.ready({ id: s.uid, role: ['owner', 'parent'].includes(s.role) ? 'parent' : s.role, name: s.name, personId: s.personId });
      } else await data.ready();
      await importOfficial();
      await loadSettings();
      if (S.session && !S.family && S.session.familyName) { S.family = S.session.familyName; await data.setSetting('familyName', S.family); }
      await load();
      await refreshStorage();
      S.ready = true;
    } catch (e) {
      console.error(e);
      S.error = e && e.message ? e.message : String(e);
    }
    render();
    maybeDigest();
  })();
  /* When the app comes back to the front on a new day, refresh and show that day's digest. */
  let lastDay = C.today();
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || !S.ready || C.today() === lastDay) return;
    lastDay = C.today(); S.cal.cursor = lastDay; S.cal.sel = lastDay;
    await load(); render(); maybeDigest();
  });

  FH.app = { S, render, version: VERSION };
})();
