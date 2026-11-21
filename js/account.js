/* Herding Cats · Copyright (c) 2026 Natius. All rights reserved. See LICENSE. */
/* Herding Cats · sign-in and family set-up (Phase 2)
   Shown before the app opens: sign in or create an account, then create the
   family. The signed-in family is remembered on the device, so the app still
   opens without internet. */
(function () {
  'use strict';
  const FH = (window.FH = window.FH || {});
  const cloud = FH.cloud;
  const SESSION = 'hc-session';
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const keep = {
    get() { try { return JSON.parse(localStorage.getItem(SESSION)); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem(SESSION, JSON.stringify(v)); } catch (e) { /* not kept: signs in again next time */ } },
    clear() { try { localStorage.removeItem(SESSION); } catch (e) { /* nothing kept */ } },
  };
  /* An invite link looks like …/?join=<family id>.<invite token>. It is remembered for this
     visit while the person signs in, then removed from the address. */
  const JOIN = 'hc-join';
  (function catchInvite() {
    try {
      const u = new URL(location.href), j = u.searchParams.get('join');
      if (j && /^[\w-]{6,40}\.[\w-]{16,40}$/.test(j)) sessionStorage.setItem(JOIN, j);
      if (j) { u.searchParams.delete('join'); history.replaceState(null, '', u.pathname + (u.search || '') + u.hash); }
    } catch (e) { /* no invite */ }
  })();
  /* A family sign-in link looks like …/?u=<family code>.<username>: it opens Family sign-in
     with both filled in (it never carries a password). It is kept on the device until that
     person signs in, so it still works after installing the app from the link. */
  const HINT = 'hc-signin';
  (function catchSignin() {
    try {
      const u = new URL(location.href), v = u.searchParams.get('u');
      const m = v && /^([A-Za-z0-9]{6})\.([A-Za-z0-9._-]{1,30})$/.exec(v);
      if (m) localStorage.setItem(HINT, JSON.stringify({ code: m[1].toUpperCase(), username: m[2].toLowerCase() }));
      if (v) { u.searchParams.delete('u'); history.replaceState(null, '', u.pathname + (u.search || '') + u.hash); }
    } catch (e) { /* no link */ }
  })();
  const signinHint = () => { try { return JSON.parse(localStorage.getItem(HINT) || 'null'); } catch (e) { return null; } };
  const clearHint = () => { try { localStorage.removeItem(HINT); } catch (e) { /* nothing kept */ } };
  const pendingJoin = () => { try { const j = sessionStorage.getItem(JOIN); if (!j) return null; const [fid, token] = j.split('.'); return { fid, token }; } catch (e) { return null; } };
  const clearJoin = () => { try { sessionStorage.removeItem(JOIN); } catch (e) { /* nothing kept */ } };
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'unavailable' })), ms))]);
  const offline = e => e && ['unavailable', 'sdk-unavailable', 'auth/network-request-failed', 'deadline-exceeded'].includes(e.code);

  const G_ICON = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.7 1.2 9.2 3.6l6.9-6.9C35.9 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l8 6.2C12.6 13.6 17.9 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.8c4.3-4 6.9-9.9 6.9-17.2z"/><path fill="#FBBC05" d="M10.7 28.5c-.5-1.4-.8-2.9-.8-4.5s.3-3.1.8-4.5l-8-6.2C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l8-6.2z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.8c-2.1 1.4-4.8 2.3-8.5 2.3-6.1 0-11.4-4.1-13.3-9.7l-8 6.2C6.6 42.6 14.6 48 24 48z"/></svg>';

  /* Privacy notice shown when creating a family, and in Settings. */
  const PRIVACY = `<p class="small">Herding Cats keeps your family's information on Google Firebase servers in Johannesburg, so the people you invite can see it on their own devices. It is used only to run the app: it is never sold, shared with anyone outside your family, or used for advertising.</p>
    <p class="small" style="margin-top:8px">As the family administrator you decide who joins and what each person sees. You can delete your family and everything stored about it at any time, under Settings › Delete our family. For questions about your information, contact Natius, who runs Herding Cats.</p>`;

  const st = { screen: 'loading', busy: false, error: '', note: '', email: '', name: '', family: '', pass: '', consent: false, resolve: null, user: null };
  const A = {
    blocking: false,
    session: null,
    PRIVACY,
    get kind() { return cloud.kind; },

    /* Waits until someone is signed in and belongs to a family, then returns the session. */
    gate() {
      A.blocking = true;
      return new Promise(resolve => { st.resolve = resolve; start(); });
    },

    async signOut() {
      try { await cloud.signOut(); } catch (e) { /* signed out on this device anyway */ }
      keep.clear();
      location.reload();
    },
    /* After deleting or leaving the family: clear it from this device and start again. */
    async forgetFamily(fid, signOut) {
      if (signOut) { try { await cloud.signOut(); } catch (e) { /* signed out locally anyway */ } }
      await forget(fid);
    },
    /* Checks again whether this person is still in the family and what they may see. */
    recheck() { const u = cloud.user && cloud.user(); if (u && A.session) refresh(u); },
    async renameFamily(name) {
      const s = A.session;
      if (!s || s.role !== 'owner' || !name) return;
      try { await cloud.renameFamily(s.familyId, name); s.familyName = name; keep.set(s); } catch (e) { console.warn('Family name not saved online:', e); }
    },
  };

  async function start() {
    show('loading');
    const cached = keep.get();
    try {
      await withTimeout(cloud.init(), 15000);
    } catch (e) {
      if (cached) return done(cached, true);
      st.error = cloud.message(e); return show('offline');
    }
    const u = cloud.user();
    if (!u) {
      keep.clear();
      const h = st.screen === 'loading' && !pendingJoin() ? signinHint() : null;
      if (h) { st.code = h.code; st.username = h.username; st.fromLink = true; return show('username'); }
      return show(st.screen === 'loading' ? 'signin' : st.screen);
    }
    st.user = u;
    if (pendingJoin()) return showJoin(u);
    if (cached && cached.uid === u.uid) {
      done(cached, false);
      refresh(u); // check in the background that the family is still theirs
      return;
    }
    await findFamily(u);
  }

  async function findFamily(u) {
    if (pendingJoin()) return showJoin(u);
    show('loading');
    try {
      const r = await withTimeout(cloud.myFamily(), 15000);
      if (!r) { st.name = u.name || ''; return show('family'); }
      if (r.member.role === 'pending') { st.pendingFamily = r.family.name; startPendingCheck(); return show('pending'); }
      done(session(u, r), false);
    } catch (e) {
      st.error = cloud.message(e);
      show(offline(e) ? 'offline' : 'signin');
    }
  }
  /* While waiting for approval, look again every 15 seconds. */
  let pendT = null;
  function startPendingCheck() {
    clearInterval(pendT);
    pendT = setInterval(async () => {
      if (!A.blocking || st.screen !== 'pending') { clearInterval(pendT); return; }
      if (st.busy) return;
      try {
        const u = st.user || cloud.user();
        const r = await withTimeout(cloud.myFamily(), 15000);
        if (r && r.member.role !== 'pending') { clearInterval(pendT); done(session(u, r), false); }
        else if (!r) { clearInterval(pendT); st.error = 'Your request to join was declined or removed.'; show('family'); }
      } catch (e) { /* offline: try again later */ }
    }, 15000);
  }
  async function refresh(u) {
    try {
      const r = await withTimeout(cloud.myFamily(), 20000);
      const before = A.session;
      if (!r || r.member.role === 'pending') {
        /* No longer in this family: remove its data from this device and start again. */
        if (before) await forget(before.familyId);
        return;
      }
      const s = session(u, r);
      keep.set(s);
      if (before && access(before) !== access(s)) { location.reload(); return; }
      if (before) Object.assign(A.session, s);
    } catch (e) { /* offline: keep using what the device remembers */ }
  }
  async function forget(fid) {
    keep.clear();
    try {
      if (FH.data && FH.data.dropDatabase) {
        /* Every copy of this family on the device: the parents' copy and any child's or carer's. */
        const names = new Set(['hc-' + fid]);
        if (A.session && A.session.uid) names.add(`hc-${fid}-${A.session.uid}`);
        try { for (const d of await indexedDB.databases()) if (d.name && (d.name === 'hc-' + fid || d.name.startsWith(`hc-${fid}-`))) names.add(d.name); } catch (e) { /* listing not supported */ }
        for (const n of names) await FH.data.dropDatabase(n);
      }
    } catch (e) { /* removed next time */ }
    location.reload();
  }
  /* Someone opened an invite link: check it, then ask them to confirm. */
  async function showJoin(u) {
    const j = pendingJoin();
    show('loading');
    try {
      const [inv, cur] = await Promise.all([withTimeout(cloud.readInvite(j.fid, j.token), 15000), withTimeout(cloud.myFamily(), 15000).catch(() => null)]);
      if (cur && cur.family.id === j.fid) { clearJoin(); return done(session(u, cur), false); } // already in this family
      st.invite = Object.assign({}, j, inv || {});
      st.current = cur;
      st.name = st.name || (cur && cur.member.name) || u.name || '';
      if (!inv) { st.error = 'This invite link has been cancelled or is incomplete. Ask for a new one.'; return show('join-bad'); }
      if (inv.used && !inv.usedByMe) { st.error = 'This invite link has already been used. Each link works once: ask for a new one.'; return show('join-bad'); }
      if (inv.expired) { st.error = 'This invite link has expired. Invite links last 7 days: ask for a new one.'; return show('join-bad'); }
      show('join');
    } catch (e) {
      st.error = cloud.message(e);
      show(offline(e) ? 'offline' : 'join-bad');
    }
  }

  const session = (u, r) => ({
    uid: u.uid, email: u.email, name: r.member.name || u.name || u.email, provider: u.provider,
    familyId: r.family.id, familyName: r.family.name, familyCode: r.family.code,
    role: r.member.role, personId: r.member.personId || null, username: r.member.username || null,
    kids: r.member.kids || [], siblings: !!r.member.siblings, money: r.member.money !== false,
  });
  /* What decides what this person sees; when it changes, the app restarts to match. */
  const access = s => s ? JSON.stringify([s.familyId, s.role, s.personId, s.kids, s.siblings, s.money]) : '';

  function done(s, offlineStart) {
    st.pass = '';
    keep.set(s);
    A.session = Object.assign({}, s, { offlineStart });
    A.blocking = false;
    const r = st.resolve; st.resolve = null;
    if (r) r(A.session);
  }

  /* ---------- Screens ---------- */
  function show(screen) {
    if (screen !== st.screen) st.pass = '';
    st.screen = screen;
    const app = $('#app');
    if (!app || !A.blocking) return;
    const html = view();
    /* The Install app button shows from the first screen, in the browser only. */
    app.innerHTML = screen !== 'loading' && FH.install ? html.replace('<div class="solo">', `<div class="solo">${FH.install.bar(false)}`) : html;
    const f = app.querySelector('[autofocus]');
    if (f && screen !== 'loading') f.focus();
  }
  const hero = (title, sub) => `<div class="hero"><span class="hcat" aria-hidden="true">${FH.cats ? FH.cats.welcome : ''}</span><div class="eyebrow">Herding Cats · family calendar</div><h1>${title}</h1>${sub ? `<p class="digest">${sub}</p>` : ''}</div>`;
  const err = () => `<div class="err" role="alert" id="gate-err">${esc(st.error)}</div>`;
  const note = () => st.note ? `<p class="ok small" role="status" id="gate-note">${esc(st.note)}</p>` : '';
  const busy = label => st.busy ? 'Please wait…' : label;
  const googleBtn = () => `<button type="button" class="btn gbtn" data-gate="google" ${st.busy ? 'disabled' : ''}>${G_ICON}<span>Continue with Google</span></button>
    ${/iphone|ipad|ipod/i.test(navigator.userAgent) && (matchMedia('(display-mode: standalone)').matches || navigator.standalone) ? '<p class="hint">On iPhone, Google sign-in may not work from the home-screen app yet. Use email and password if it doesn\'t.</p>' : ''}`;

  function view() {
    const s = st.screen;
    if (s === 'loading') return `<div class="solo"><p class="muted center" style="padding-top:40px">Opening Herding Cats…</p></div>`;
    if (s === 'offline') return `<div class="solo">${hero('No connection', 'Herding Cats needs the internet the first time you sign in on this device.')}
      <section class="card stack">${err()}<div><button class="btn pri" data-gate="retry">Try again</button></div></section></div>`;
    if (s === 'join') {
      const inv = st.invite;
      return `<div class="solo">${hero(`Join ${esc(inv.familyName)}`, `You've been invited to join as a <b>parent</b>: you'll see and change everything in the family, and its data will be on this device too.`)}
      <section class="card stack">
        <form class="stack" data-gate-form="join" novalidate>
          <label class="fld">Your name, as your family sees it<input id="g-name" autocomplete="name" value="${esc(st.name)}" autofocus required></label>
          ${st.current ? `<p class="small warnbox">You're currently in <b>${esc(st.current.family.name)}</b>. Joining moves your account to ${esc(inv.familyName)}; you'll no longer see ${esc(st.current.family.name)}.</p>` : ''}
          ${err()}
          <button class="btn pri" type="submit" ${st.busy ? 'disabled' : ''}>${busy(`Join ${esc(inv.familyName)}`)}</button>
        </form>
        <div class="row" style="justify-content:space-between">
          <button type="button" class="btn ghost sm" data-gate="join-skip">Not now</button>
          <span class="hint">Signed in as ${esc(st.user ? st.user.email : '')}</span>
        </div>
      </section></div>`;
    }
    if (s === 'join-bad') return `<div class="solo">${hero('Invite link', '')}
      <section class="card stack">${err()}<div><button class="btn pri" data-gate="join-skip">Continue</button></div></section></div>`;
    const joining = pendingJoin() ? ' to join your family' : '';
    if (s === 'pending') return `<div class="solo">${hero('Waiting for approval', `You've asked to join <b>${esc(st.pendingFamily || 'the family')}</b>. A parent in the family needs to approve you in Settings. This screen checks again by itself.`)}
      <section class="card stack">${err()}
        <div class="row"><button class="btn pri" data-gate="pending-check">Check again</button><button class="btn ghost sm" data-gate="signout">Sign out</button></div>
      </section></div>`;
    if (s === 'username') return `<div class="solo">${hero(st.fromLink ? `Welcome, ${esc((st.username || '').replace(/^./, c => c.toUpperCase()))}` : 'Family sign-in', st.fromLink ? 'Your family code and username are filled in. Enter the password your parent gave you.' : 'For people your family administrator set up with a username, such as children. Ask them for your family code.')}
      <section class="card stack">
        <form class="stack" data-gate-form="username" novalidate>
          <label class="fld">Family code<input id="g-code" autocomplete="off" autocapitalize="characters" maxlength="6" value="${esc(st.code || '')}" placeholder="e.g. K7PQ2M" ${st.fromLink ? '' : 'autofocus'} required></label>
          <label class="fld">Username<input id="g-user" autocomplete="username" autocapitalize="none" value="${esc(st.username || '')}" required></label>
          <label class="fld">Password<input id="g-pass" type="password" autocomplete="current-password" value="${esc(st.pass)}" ${st.fromLink ? 'autofocus' : ''} required></label>
          ${err()}
          <button class="btn pri" type="submit" ${st.busy ? 'disabled' : ''}>${busy('Sign in')}</button>
        </form>
        <div><button type="button" class="btn ghost sm" data-gate="to-signin">Sign in with email instead</button></div>
      </section></div>`;
    if (s === 'signin') return `<div class="solo">${hero('Sign in', joining ? 'Sign in, or create an account, to join your family.' : 'Sign in to see your family. New to Herding Cats? Create an account below.')}
      <section class="card stack">
        <form class="stack" data-gate-form="signin" novalidate>
          <label class="fld">Email<input id="g-email" type="email" autocomplete="email" inputmode="email" value="${esc(st.email)}" autofocus required></label>
          <label class="fld">Password<input id="g-pass" type="password" autocomplete="current-password" value="${esc(st.pass)}" required></label>
          ${err()}${note()}
          <button class="btn pri" type="submit" ${st.busy ? 'disabled' : ''}>${busy('Sign in')}</button>
        </form>
        <div class="or"><span>or</span></div>
        ${googleBtn()}
        <div class="row" style="justify-content:space-between">
          <button type="button" class="btn ghost sm" data-gate="to-reset">Forgot password?</button>
          <button type="button" class="btn ghost sm" data-gate="to-username">Family username</button>
          <button type="button" class="btn ghost sm" data-gate="to-signup">Create an account</button>
        </div>
      </section></div>`;
    if (s === 'signup') return `<div class="solo">${hero('Create an account', `One account per person. Each person in your family signs in with their own${joining}.`)}
      <section class="card stack">
        <form class="stack" data-gate-form="signup" novalidate>
          <label class="fld">Your name<input id="g-name" autocomplete="name" value="${esc(st.name)}" placeholder="e.g. Natius" autofocus required></label>
          <label class="fld">Email<input id="g-email" type="email" autocomplete="email" inputmode="email" value="${esc(st.email)}" required></label>
          <label class="fld">Password<input id="g-pass" type="password" autocomplete="new-password" minlength="8" value="${esc(st.pass)}" required><span class="hint">At least 8 characters.</span></label>
          ${err()}
          <button class="btn pri" type="submit" ${st.busy ? 'disabled' : ''}>${busy('Create account')}</button>
        </form>
        <div class="or"><span>or</span></div>
        ${googleBtn()}
        <div><button type="button" class="btn ghost sm" data-gate="to-signin">I already have an account</button></div>
      </section></div>`;
    if (s === 'reset') return `<div class="solo">${hero('Reset your password', 'We\'ll email you a link to choose a new password.')}
      <section class="card stack">
        <form class="stack" data-gate-form="reset" novalidate>
          <label class="fld">Email<input id="g-email" type="email" autocomplete="email" inputmode="email" value="${esc(st.email)}" autofocus required></label>
          ${err()}${note()}
          <button class="btn pri" type="submit" ${st.busy ? 'disabled' : ''}>${busy('Send reset link')}</button>
        </form>
        <div><button type="button" class="btn ghost sm" data-gate="to-signin">Back to sign in</button></div>
      </section></div>`;
    if (s === 'family') return `<div class="solo">${hero('Create your family', `Signed in as ${esc(st.user ? st.user.email : '')}. You'll be the family administrator: you decide who joins and what they see.`)}
      <section class="card stack">
        <form class="stack" data-gate-form="family" novalidate>
          <label class="fld">Family name<input id="g-family" placeholder="e.g. The Rautenbachs" autocomplete="off" value="${esc(st.family)}" autofocus required></label>
          <label class="fld">Your name, as your family sees it<input id="g-name" autocomplete="name" value="${esc(st.name)}" required></label>
          <div class="privacy"><b class="small">Your family's privacy</b>${PRIVACY}</div>
          <label class="check"><input type="checkbox" id="g-consent" ${st.consent ? 'checked' : ''}><span>I'm the parent or guardian of the children I'll add, and I agree that their information is kept as described above.</span></label>
          ${err()}
          <button class="btn pri" type="submit" ${st.busy ? 'disabled' : ''}>${busy('Create family')}</button>
        </form>
        <p class="hint">Joining someone else's family? Ask them for an invite link; invites arrive in the next update.</p>
        <div><button type="button" class="btn ghost sm" data-gate="signout">Sign out</button></div>
      </section></div>`;
    return '';
  }

  /* ---------- Actions ---------- */
  const val = id => ($('#' + id) ? $('#' + id).value.trim() : '');
  async function run(fn) {
    if (st.busy) return;
    st.busy = true; st.error = ''; st.note = ''; show(st.screen);
    try { await fn(); }
    catch (e) { st.error = cloud.message(e); }
    st.busy = false;
    if (A.blocking) show(st.screen);
  }
  const emailOk = e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

  document.addEventListener('submit', ev => {
    const f = ev.target.dataset && ev.target.dataset.gateForm;
    if (!f) return;
    ev.preventDefault();
    if (f === 'username') {
      const code = val('g-code').toUpperCase(), user = val('g-user').toLowerCase(), pass = $('#g-pass').value;
      st.code = code; st.username = user; st.pass = pass;
      if (!/^[A-Z0-9]{6}$/.test(code)) { st.error = 'The family code has 6 letters and numbers. Ask your family administrator for it.'; return show('username'); }
      if (!user) { st.error = 'Enter your username.'; return show('username'); }
      if (!pass) { st.error = 'Enter your password.'; return show('username'); }
      run(async () => { const u = await cloud.signInUsername(code, user, pass); st.user = u; clearHint(); await findFamily(u); });
    }
    if (f === 'signin') {
      const email = val('g-email'), pass = $('#g-pass').value;
      st.email = email; st.pass = pass;
      if (!emailOk(email)) { st.error = "Enter your email address, e.g. name@gmail.com."; return show('signin'); }
      if (!pass) { st.error = 'Enter your password.'; return show('signin'); }
      run(async () => { const u = await cloud.signIn(email, pass); st.user = u; await findFamily(u); });
    }
    if (f === 'signup') {
      const name = val('g-name'), email = val('g-email'), pass = $('#g-pass').value;
      st.name = name; st.email = email; st.pass = pass;
      if (!name) { st.error = 'Enter your name.'; return show('signup'); }
      if (!emailOk(email)) { st.error = "Enter your email address, e.g. name@gmail.com."; return show('signup'); }
      if (pass.length < 8) { st.error = 'Choose a password of at least 8 characters.'; return show('signup'); }
      run(async () => { const u = await cloud.signUp(name, email, pass); st.user = u; await findFamily(u); });
    }
    if (f === 'reset') {
      const email = val('g-email');
      st.email = email;
      if (!emailOk(email)) { st.error = "Enter your email address, e.g. name@gmail.com."; return show('reset'); }
      run(async () => { await cloud.reset(email); st.note = `If there is an account for ${email}, a reset link is on its way. Check your email, including spam.`; });
    }
    if (f === 'join') {
      const name = val('g-name');
      st.name = name;
      if (!name) { st.error = 'Enter your name.'; return show('join'); }
      const inv = st.invite;
      run(async () => {
        const r = await cloud.joinFamily(inv.fid, inv.token, name);
        clearJoin();
        if (r.member.role === 'pending') { st.pendingFamily = r.family.name; st.screen = 'pending'; startPendingCheck(); return; }
        done(session(st.user || cloud.user(), r), false);
      });
    }
    if (f === 'family') {
      const family = val('g-family'), name = val('g-name');
      st.name = name; st.family = family; st.consent = $('#g-consent').checked;
      if (!family) { st.error = 'Enter a family name.'; return show('family'); }
      if (!name) { st.error = 'Enter your name.'; return show('family'); }
      if (!$('#g-consent').checked) { st.error = 'Tick the box to agree to how your family\'s information is kept.'; return show('family'); }
      run(async () => {
        const r = await cloud.createFamily({ familyName: family, displayName: name });
        done(session(st.user || cloud.user(), r), false);
      });
    }
  });

  document.addEventListener('click', ev => {
    const b = ev.target.closest('[data-gate]');
    if (!b || !A.blocking) return;
    const a = b.dataset.gate;
    st.error = ''; st.note = '';
    if (a === 'to-signup') { st.email = val('g-email') || st.email; return show('signup'); }
    if (a === 'to-signin') { st.email = val('g-email') || st.email; return show('signin'); }
    if (a === 'to-reset') { st.email = val('g-email') || st.email; return show('reset'); }
    if (a === 'retry') return start();
    if (a === 'to-username') return show('username');
    if (a === 'pending-check') return run(async () => { await findFamily(st.user || cloud.user()); });
    if (a === 'join-skip') { clearJoin(); st.invite = null; return st.user ? findFamily(st.user) : show('signin'); }
    if (a === 'signout') return run(async () => { await cloud.signOut(); keep.clear(); st.user = null; st.screen = 'signin'; });
    if (a === 'google') return run(async () => { const u = await cloud.google(); if (u) { st.user = u; await findFamily(u); } });
  });

  FH.account = A;
})();
