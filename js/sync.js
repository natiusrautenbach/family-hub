/* Herding Cats · Copyright (c) 2026 Natius. All rights reserved. See LICENSE. */
/* Herding Cats · family sync (Phase 2)
   Every change made on this device is saved here first, put in the outbox, then
   sent to the family's database. Changes from other devices arrive live and are
   applied when they are newer than what is here. The server only accepts a change
   that is at least as new as the one it holds, so a late change never overwrites
   a newer one. Works offline: the outbox is sent when the connection returns. */
(function () {
  'use strict';
  const FH = (window.FH = window.FH || {});
  const data = FH.data;
  const cloud = FH.cloud;

  const st = { on: false, fid: null, who: null, waiting: 0, lastSync: null, error: '', firstDone: false };
  const ADMIN = ['owner', 'parent'];
  const watchers = [];
  let unsub = null, firstResolve = null, refreshT = null, flushing = false;
  const sending = new Set();
  const notify = () => { for (const f of watchers) { try { f(status()); } catch (e) { /* a screen went away */ } } };
  const status = () => ({
    on: st.on, waiting: st.waiting, lastSync: st.lastSync, error: st.error,
    state: !st.on ? 'off' : !navigator.onLine ? 'offline' : st.waiting ? 'sending' : st.firstDone ? 'ok' : 'starting',
  });

  async function recount() { try { st.waiting = (await data.outbox.all()).length; } catch (e) { /* database closing */ } notify(); }

  /* Sends one record. Safe to call twice: the server keeps whichever is newer. */
  async function send(store, rec) {
    const key = store + '~' + rec.id + '@' + rec.updatedAt;
    if (sending.has(key)) return;
    sending.add(key);
    try {
      await cloud.pushRecord(st.fid, store, rec);
      await data.outbox.done(store, rec);
      st.error = '';
    } catch (e) {
      if (e && e.code === 'permission-denied') {
        // Someone changed this record more recently; their version arrives through the listener.
        await data.outbox.done(store, rec);
      } else {
        st.error = cloud.message(e);
        console.warn('Sync: not sent yet', e);
      }
    } finally {
      sending.delete(key);
      recount();
    }
  }

  async function flush() {
    if (!st.on || flushing || !cloud.ready) return;
    flushing = true;
    try {
      for (const o of await data.outbox.all()) {
        const rec = await data.outbox.get(o.store, o.recId);
        if (rec && rec.updatedAt === o.updatedAt) send(o.store, rec);
        else if (rec) { await data.outbox.add(o.store, rec); send(o.store, rec); }
      }
    } finally { flushing = false; }
  }

  async function onRemote(list) {
    let changed = false, max = 0;
    for (const x of list) {
      if (x.local) continue; // our own change, not yet confirmed
      if (await data.applyRemote(x.store, x.rec)) changed = true;
      if (x.syncAt > max) max = x.syncAt;
    }
    if (max) {
      const prev = await data.getLocal('syncedTo', 0);
      if (max > prev) await data.setLocal('syncedTo', max);
    }
    st.lastSync = Date.now(); st.error = '';
    if (!st.firstDone) { st.firstDone = true; if (firstResolve) firstResolve(); }
    notify();
    if (changed && FH.app && FH.app.refresh) { clearTimeout(refreshT); refreshT = setTimeout(() => FH.app.refresh(), 120); }
  }
  function onError(e) {
    st.error = cloud.message(e);
    /* No longer allowed to see the family (removed, or role changed): let the account check. */
    if (e && e.code === 'permission-denied' && FH.account && FH.account.recheck) FH.account.recheck();
    console.warn('Sync: listening stopped', e);
    notify();
    // Try again shortly (e.g. after a brief loss of access).
    setTimeout(listen, 15000);
  }
  let retryT = null;
  async function listen() {
    if (!st.on) return;
    clearTimeout(retryT);
    if (unsub) { try { unsub(); } catch (e) { /* already stopped */ } unsub = null; }
    try {
      if (!cloud.ready) await cloud.init(); // opened offline: connect now if we can
      const since = await data.getLocal('syncedTo', 0);
      unsub = cloud.listen(st.fid, since ? since - 120000 : 0, onRemote, onError, st.who);
      flush();
    } catch (e) {
      st.error = navigator.onLine ? cloud.message(e) : '';
      notify();
      retryT = setTimeout(listen, 30000); // try again later; changes wait in the outbox
    }
  }

  FH.sync = {
    get available() { return !!(cloud && cloud.listen); },
    /* Starts syncing the signed-in family. Resolves when the first copy from the server
       has arrived, or after a few seconds offline, so the app can open with data. */
    async start(session) {
      if (!cloud || !cloud.listen) return;
      st.on = true; st.fid = session.familyId;
      st.who = { role: session.role, personId: session.personId, kids: session.kids || [], siblings: !!session.siblings, money: session.money !== false };
      const first = new Promise(r => { firstResolve = r; });
      data.onChange = (store, rec) => { data.outbox.add(store, rec).then(() => { recount(); send(store, rec); }); };
      /* The first time this device syncs this family, send what it already has. */
      /* The first time this device syncs this family, send what it already has. Records
         sent before milestone 2.3 are sent again once, now saying whose they are. */
      if (ADMIN.includes(session.role) && (!(await data.getLocal('syncSeeded', false)) || !(await data.getLocal('syncV2', false)))) {
        for (const [store, rec] of await data.allSynced()) await data.outbox.add(store, rec);
        await data.setLocal('syncSeeded', true);
        await data.setLocal('syncV2', true);
      }
      await recount();
      await listen();
      flush();
      return Promise.race([first, new Promise(r => setTimeout(r, 6000))]);
    },
    status,
    watch(fn) { watchers.push(fn); fn(status()); return () => { const i = watchers.indexOf(fn); if (i >= 0) watchers.splice(i, 1); }; },
    flush,
  };

  window.addEventListener('online', () => { notify(); if (st.on && !cloud.ready) listen(); else flush(); });
  window.addEventListener('offline', notify);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') flush(); });
})();
