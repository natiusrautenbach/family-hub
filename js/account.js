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
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'unavailable' })), ms))]);
  const offline = e => e && ['unavailable', 'sdk-unavailable', 'auth/network-request-failed', 'deadline-exceeded'].includes(e.code);

  const G_ICON = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.7 1.2 9.2 3.6l6.9-6.9C35.9 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l8 6.2C12.6 13.6 17.9 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.8c4.3-4 6.9-9.9 6.9-17.2z"/><path fill="#FBBC05" d="M10.7 28.5c-.5-1.4-.8-2.9-.8-4.5s.3-3.1.8-4.5l-8-6.2C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l8-6.2z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.8c-2.1 1.4-4.8 2.3-8.5 2.3-6.1 0-11.4-4.1-13.3-9.7l-8 6.2C6.6 42.6 14.6 48 24 48z"/></svg>';

  /* Privacy notice shown when creating a family, and in Settings. */
  const PRIVACY = `<p class="small">Herding Cats keeps your family's information on Google Firebase servers in Johannesburg, so the people you invite can see it on their own devices. It is used only to run the app: it is never sold, shared with anyone outside your family, or used for advertising.</p>
    <p class="small" style="margin-top:8px">As the family administrator you decide who joins and what each person sees. You can have your family and everything stored about it deleted at any time; a Delete button arrives in Settings in a coming update. For questions about your information, contact Natius, who runs Herding Cats.</p>`;

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
    if (!u) { keep.clear(); return show(st.screen === 'loading' ? 'signin' : st.screen); }
    st.user = u;
    if (cached && cached.uid === u.uid) {
      done(cached, false);
      refresh(u); // check in the background that the family is still theirs
      return;
    }
    await findFamily(u);
  }

  async function findFamily(u) {
    show('loading');
    try {
      const r = await withTimeout(cloud.myFamily(), 15000);
      if (!r) { st.name = u.name || ''; return show('family'); }
      done(session(u, r), false);
    } catch (e) {
      st.error = cloud.message(e);
      show(offline(e) ? 'offline' : 'signin');
    }
  }
  async function refresh(u) {
    try {
      const r = await withTimeout(cloud.myFamily(), 20000);
      if (r) { const s = session(u, r); keep.set(s); if (A.session) Object.assign(A.session, s); }
    } catch (e) { /* offline: keep using what the device remembers */ }
  }
  const session = (u, r) => ({ uid: u.uid, email: u.email, name: r.member.name || u.name || u.email, provider: u.provider, familyId: r.family.id, familyName: r.family.name, familyCode: r.family.code, role: r.member.role, personId: r.member.personId });

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
    app.innerHTML = view();
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
    if (s === 'signin') return `<div class="solo">${hero('Sign in', 'Sign in to see your family. New to Herding Cats? Create an account below.')}
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
          <button type="button" class="btn ghost sm" data-gate="to-signup">Create an account</button>
        </div>
      </section></div>`;
    if (s === 'signup') return `<div class="solo">${hero('Create an account', 'One account per person. Each person in your family signs in with their own.')}
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
    if (a === 'signout') return run(async () => { await cloud.signOut(); keep.clear(); st.user = null; st.screen = 'signin'; });
    if (a === 'google') return run(async () => { const u = await cloud.google(); if (u) { st.user = u; await findFamily(u); } });
  });

  FH.account = A;
})();
