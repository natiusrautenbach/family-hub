/* Family Hub · Copyright (c) 2026 Natius. All rights reserved. See LICENSE. */
/* Family Hub · app (beta, milestone 1)
   Screens: first-time setup, Today, child pages, Settings (children, backup,
   storage, install, access). Calendar, Tasks, Study and Money arrive in
   milestones 2 to 6 and show what is coming until then. */
(function () {
  'use strict';
  const FH = window.FH;
  const data = FH.data;
  const VERSION = '0.1.0';
  const MILESTONE = 1;

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
    calendar: { m: 2, title: 'Calendar', text: 'Week and month views with a toggle for each child, a filter by item type, weekly activities that pause in school holidays, reminders, and Gauteng school terms you can edit.' },
    tasks: { m: 3, title: 'Tasks', text: 'Homework and projects with a due date, priority, notes and steps. Steps can have their own due dates and show on the calendar.' },
    study: { m: 4, title: 'Study planner', text: 'Photograph an exam timetable, check what was read, and get a revision plan you can adjust and tick off.' },
    money: { m: 5, title: 'Money', text: 'Bank balances with history, savings goals shared by percentage, and money owed each way. Chores and reward goals follow in milestone 6.' },
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
  };

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
  };
  const ic = k => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${IC[k]}</svg>`;
  const avatar = (p, lg) => `<span class="avatar${lg ? ' lg' : ''}" style="--c:var(--${esc(p.colour)})">${esc((p.name || '?').trim()[0] || '?')}</span>`;

  /* ---------- Loading ---------- */
  async function load() {
    S.parent = data.user;
    S.children = (await data.list('people', p => p.type === 'child')).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
    S.family = await data.getSetting('familyName', '');
    S.setupDone = await data.getSetting('setupDone', false);
  }
  async function refreshStorage() {
    try {
      if (navigator.storage?.persisted) S.storage.persisted = await navigator.storage.persisted();
      if (navigator.storage?.estimate) { const e = await navigator.storage.estimate(); S.storage.usage = e.usage; S.storage.quota = e.quota; }
    } catch (e) { /* not available in this browser */ }
  }

  /* ---------- Views ---------- */
  function vError() {
    return `<div class="solo"><section class="card stack">
      <h1 class="solo-h">Family Hub can't save on this device</h1>
      <p>This browser isn't letting the app store its data. This usually happens in a private or incognito window, or when site data is blocked in the browser's settings.</p>
      <p class="muted">Details: ${esc(S.error)}</p>
      <div class="row"><button class="btn pri" data-act="retry">Try again</button></div>
    </section></div>`;
  }

  function vSetup() {
    const rows = S.setup.rows;
    return `<div class="solo">
      <div class="hero"><div class="eyebrow">Family Hub · beta</div><h1>Welcome</h1>
        <p class="digest">Add your children to get started. Everything you enter stays on this device; nothing is uploaded.</p></div>
      <section class="card stack">
        <label class="fld">Family name (optional)<input id="su-family" placeholder="e.g. The Rautenbachs" value="${esc(S.setup.family)}" autocomplete="off"></label>
        <div class="flbl">Children</div>
        <div class="stack" id="su-rows">${rows.map((r, i) => setupRow(r, i)).join('')}</div>
        <div><button class="btn sm addstep" data-act="su-add">${ic('plus')}Add another child</button></div>
        <div class="err" id="su-err" role="alert"></div>
        <div class="row" style="justify-content:space-between">
          <button class="btn" data-act="go-restore">Restore from a backup</button>
          <button class="btn pri" data-act="su-finish">Start using Family Hub</button>
        </div>
      </section>
      <p class="muted small center">Setting up a second device? Export a backup on the first device, then choose Restore from a backup here.</p>
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

  function roadmap() {
    return `<section class="card"><div class="card-h"><h3>Beta build</h3><span class="pill">Milestone ${MILESTONE} of 7</span></div>
      <ol class="ms">${MILESTONES.map(([n, t, d]) => `<li class="${n < MILESTONE ? 'done' : n === MILESTONE ? 'now' : ''}"><span class="msn">${n}</span><span class="min0"><b>${t}</b><span class="muted"> · ${d}</span></span><span class="pill ${n === MILESTONE ? 'on' : ''}">${n < MILESTONE ? 'Done' : n === MILESTONE ? 'Ready to test' : 'Coming'}</span></li>`).join('')}</ol></section>`;
  }

  function vToday() {
    const d = new Date();
    const backupAge = S.lastBackup ? Math.floor((Date.now() - new Date(S.lastBackup)) / 864e5) : null;
    return `<div class="view">
      <section class="hero"><div class="eyebrow">${S.family ? esc(S.family) + ' · ' : ''}Today</div><h1>${fmtLong(d)}</h1>
        <p class="digest">${S.children.length ? `<b>${S.children.length} ${S.children.length === 1 ? 'child' : 'children'}</b> set up on this device. Schedules, tasks and money arrive in the next milestones.` : 'Add your children to get started.'}</p></section>
      ${childCards()}
      <div class="cols">
        ${roadmap()}
        <div class="stack">
          ${backupCard(backupAge)}
          ${S.storage.persisted === false ? `<section class="card warnc"><div class="card-h"><h3>Protect your data</h3></div><p class="small">This browser may clear Family Hub's data when the device runs low on space. Ask it to keep the data, and install the app to your home screen.</p><div class="row" style="margin-top:10px"><button class="btn sm pri" data-act="persist">Keep data on this device</button><button class="btn sm" data-act="nav" data-v="settings">Settings</button></div></section>` : ''}
        </div>
      </div></div>`;
  }
  function backupCard(age) {
    const msg = age === null ? 'No backup has been made on this device yet.' : age === 0 ? 'Last backup: today.' : `Last backup: ${age} day${age === 1 ? '' : 's'} ago.`;
    return `<section class="card"><div class="card-h"><h3>Backup</h3></div><p class="small">${msg} A backup is also how you copy your data to your other device.</p><div class="row" style="margin-top:10px"><button class="btn sm" data-act="nav" data-v="settings" data-scroll="backup">Make a backup</button></div></section>`;
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
      <div class="cols">
        <section class="card"><div class="card-h"><h3>Weekly activities</h3><span class="pill">Milestone 2</span></div><p class="empty">${esc(c.name)}'s activities will show here.</p></section>
        <section class="card"><div class="card-h"><h3>Homework and projects</h3><span class="pill">Milestone 3</span></div><p class="empty">Open tasks will show here.</p></section>
        <section class="card"><div class="card-h"><h3>Exams</h3><span class="pill">Milestone 4</span></div><p class="empty">Upcoming exams will show here.</p></section>
        <section class="card"><div class="card-h"><h3>Money</h3><span class="pill">Milestone 5</span></div><p class="empty">Savings and money owed will show here.</p></section>
      </div></div>`;
  }

  function vSettings() {
    const st = S.storage;
    const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    return `<div class="view"><div class="stack">
      <section class="card"><div class="card-h"><h3>Children</h3><button class="btn sm" data-act="child-add">Add child</button></div>
        ${S.children.map(c => `<div class="set"><span class="row" style="flex-wrap:nowrap">${avatar(c)}<span class="min0"><b>${esc(c.name)}</b> <span class="muted">· ${esc(c.grade || '')}</span></span></span><button class="btn sm" data-act="child-edit" data-v="${c.id}">Edit</button></div>`).join('') || '<p class="empty">No children yet.</p>'}
      </section>

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
        <p class="small">${st.persisted === true ? 'This browser has agreed to keep Family Hub\'s data, even when space runs low.' : st.persisted === false ? 'This browser may clear the data if the device runs low on space. Ask it to keep the data. Installing the app to your home screen also helps, especially on iPhone.' : 'This browser doesn\'t say whether it keeps the data. Install the app and make regular backups.'}</p>
        ${st.persisted === false ? '<div class="row" style="margin-top:10px"><button class="btn sm pri" data-act="persist">Keep data on this device</button></div>' : ''}
        ${st.usage != null ? `<p class="meta" style="margin-top:8px">Using ${fmtBytes(st.usage)} on this device.</p>` : ''}
      </section>

      <section class="card"><div class="card-h"><h3>Install the app</h3>${installed ? '<span class="pill on">Installed</span>' : ''}</div>
        ${installed ? '<p class="small">Family Hub is installed and works without internet.</p>'
          : inFrame ? '<p class="small">Installing works once Family Hub is on its own web address (GitHub Pages). This test link can\'t be installed.</p>'
          : S.installEvt ? '<p class="small">Add Family Hub to this device so it opens like an app and works without internet.</p><div class="row" style="margin-top:10px"><button class="btn sm pri" data-act="install">Install Family Hub</button></div>'
          : ios ? '<p class="small">In Safari, tap the Share button, then <b>Add to Home Screen</b>.</p>'
          : '<p class="small">In your browser menu, choose <b>Install app</b> or <b>Add to Home screen</b>.</p>'}
      </section>

      <section class="card"><div class="card-h"><h3>Access</h3></div>
        <div class="set"><span><b>Parent</b> · sees and changes everything</span><span class="pill on">You</span></div>
        <div class="set"><span><b>Child, view only</b> · own schedule and balances</span><span class="pill">Phase 3</span></div>
        <div class="set"><span><b>Child, limited edit</b> · tick off tasks, add homework, suggest IOUs for approval</span><span class="pill">Phase 3</span></div>
      </section>

      <section class="card"><div class="card-h"><h3>About</h3></div>
        <p class="meta">Family Hub beta ${VERSION} · milestone ${MILESTONE} of 7${inFrame ? ' · test link' : ''}</p>
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

  /* ---------- Render ---------- */
  const NAV = [['today', 'Today'], ['calendar', 'Calendar'], ['tasks', 'Tasks'], ['study', 'Study'], ['money', 'Money']];
  const TITLES = { today: 'Family Hub', calendar: 'Calendar', tasks: 'Tasks', study: 'Study planner', money: 'Money', settings: 'Settings' };

  function render() {
    const app = $('#app');
    if (S.error) { app.innerHTML = vError(); renderSheet(); return; }
    if (!S.ready) { app.innerHTML = '<div class="solo"><p class="muted center" style="padding-top:40px">Opening Family Hub…</p></div>'; return; }
    if (!S.children.length && !S.setupDone) {
      if (!S.setup) S.setup = { family: '', rows: [{ name: '', grade: 'Grade 1', colour: 'c1' }] };
      app.innerHTML = vSetup(); renderSheet(); return;
    }
    const v = S.view;
    const content = v === 'today' ? vToday() : v === 'settings' ? vSettings() : v === 'child' ? vChild(S.child) : COMING[v] ? vComing(v) : vToday();
    const title = v === 'child' ? (S.children.find(c => c.id === S.child)?.name || 'Child') : TITLES[v] || 'Family Hub';
    const cur = k => (v === k ? 'aria-current="page"' : '');
    app.innerHTML = `<div class="shell">
      <nav class="side" aria-label="Main">
        <div class="brand">Family Hub</div><div class="brand-sub"><span class="proto">Beta · milestone ${MILESTONE}</span></div>
        ${NAV.map(([k, l]) => `<button class="navbtn" data-act="nav" data-v="${k}" ${cur(k)}>${ic(k)}${l}${COMING[k] ? `<span class="soon">M${COMING[k].m}</span>` : ''}</button>`).join('')}
        <h3>Children</h3>
        ${S.children.map(c => `<button class="navbtn" data-act="open-child" data-v="${c.id}" ${v === 'child' && S.child === c.id ? 'aria-current="page"' : ''}>${avatar(c)}${esc(c.name)}</button>`).join('')}
        <button class="navbtn" data-act="child-add">${ic('plus')}Add child</button>
        <div style="flex:1"></div>
        <button class="navbtn" data-act="nav" data-v="settings" ${cur('settings')}>${ic('settings')}Settings</button>
      </nav>
      <main class="main">
        <header class="topbar"><h2>${esc(title)}</h2><span class="proto">Beta</span><button class="iconbtn gear" data-act="nav" data-v="settings" aria-label="Settings">${ic('settings')}</button></header>
        ${content}
      </main>
      <nav class="tabbar" aria-label="Main">${NAV.map(([k, l]) => `<button data-act="nav" data-v="${k}" ${cur(k)}>${ic(k)}${l}</button>`).join('')}</nav>
    </div>${restoreInput()}`;
    renderSheet();
  }
  function renderSheet() {
    const el = $('#sheet');
    if (!S.sheet) { el.hidden = true; el.innerHTML = ''; return; }
    el.innerHTML = S.sheet.kind === 'child' ? childSheet() : restoreSheet();
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
    toast('Family Hub is ready. Make a backup in Settings once you have added more.');
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
    const name = `family-hub-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
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
    catch (e) { S.sheet.error = fromFile ? "This file can't be read as a Family Hub backup. Choose the .json file the app exported." : "This text isn't a complete backup. Copy the whole backup again and paste all of it."; renderSheet(); return; }
    try { S.sheet.summary = data.checkBackup(obj); S.sheet.backup = obj; S.sheet.error = ''; }
    catch (e) { S.sheet.error = e.message; }
    renderSheet();
  }
  async function doRestore() {
    const sh = S.sheet;
    if (!sh.confirm) { sh.confirm = true; renderSheet(); return; }
    try {
      await data.restoreBackup(sh.backup);
      S.sheet = null; S.setup = null; await loadSettings(); await load(); go('today');
      toast('Backup restored. This device now has the same data as the backup.');
    } catch (e) { sh.error = `Nothing was changed. ${e.message}`; sh.confirm = false; renderSheet(); }
  }

  async function tryPersist(announce) {
    try {
      if (!navigator.storage?.persist) { if (announce) toast("This browser can't promise to keep the data. Install the app and make regular backups."); return; }
      const ok = await navigator.storage.persist();
      await refreshStorage(); render();
      if (announce) toast(ok ? 'This device will keep Family Hub\'s data.' : 'The browser said no for now. Installing the app to your home screen usually changes that.');
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
        case 'export-file': await exportFile(); return;
        case 'export-copy': await exportCopy(); return;
        case 'go-restore': startRestore(); return;
        case 'pick-file': $('#restore-file').click(); return;
        case 'check-text': { const t = $('#restore-text').value.trim(); if (!t) { S.sheet.error = 'Paste the backup text first, or choose the backup file.'; renderSheet(); return; } checkBackupText(t, false); return; }
        case 'do-restore': await doRestore(); return;
        case 'persist': await tryPersist(true); return;
        case 'install': if (S.installEvt) { S.installEvt.prompt(); const r = await S.installEvt.userChoice; S.installEvt = null; render(); if (r.outcome === 'accepted') toast('Family Hub is being installed.'); } return;
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
      if (f === 'family') { await data.setSetting('familyName', $('#set-family').value.trim()); S.family = $('#set-family').value.trim(); render(); toast('Family name saved.'); }
    } catch (e) { console.error(e); toast(`Nothing was saved: ${e.message}`); }
  });

  document.addEventListener('input', ev => {
    const t = ev.target;
    if (t.classList.contains('su-name')) { const av = t.closest('.crow')?.querySelector('.avatar'); if (av) av.textContent = (t.value.trim()[0] || '?'); }
  });

  document.addEventListener('change', ev => {
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
  window.addEventListener('appinstalled', () => { S.installEvt = null; toast('Family Hub is installed.'); render(); });

  /* ---------- Offline support (only when the app has its own web address) ---------- */
  if ('serviceWorker' in navigator && !inFrame && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(e => console.warn('Offline support not available:', e)); });
  }

  /* ---------- Start ---------- */
  (async function start() {
    fromHash();
    render();
    try {
      await data.ready();
      await loadSettings();
      await load();
      await refreshStorage();
      S.ready = true;
    } catch (e) {
      console.error(e);
      S.error = e && e.message ? e.message : String(e);
    }
    render();
  })();

  FH.app = { S, render, version: VERSION };
})();
