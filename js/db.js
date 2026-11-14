/* Family Hub · Copyright (c) 2026 Natius. All rights reserved. See LICENSE. */
/* Family Hub · data layer
   Every read and write in the app goes through FH.data, which checks the
   current user's role before touching the local database (IndexedDB).
   Records are sync-ready: each has a unique id, created/updated timestamps,
   who created it, and a soft-delete flag, so a sync service can be added
   later without changing the screens. */
(function () {
  'use strict';
  const FH = (window.FH = window.FH || {});

  const DB_NAME = 'family-hub';
  const DB_VERSION = 4;
  const BACKUP_FORMAT = 1;

  /* Each milestone adds stores by raising DB_VERSION and adding to this map;
     data already on the device is kept when the app updates. */
  const SCHEMA = {
    people:     { indexes: ['type'] },          // children (and adults from Phase 2)
    users:      { indexes: ['role'] },          // who uses the app: parent now, children later
    approvals:  { indexes: ['status'] },        // child requests waiting for a parent (later)
    meta:       { indexes: [] },                // settings and device info
    activities: { indexes: ['owner'] },         // milestone 2: weekly activities
    reminders:  { indexes: ['owner', 'date'] }, // milestone 2: one-off and repeating reminders
    terms:      { indexes: ['start'] },         // milestone 2: school terms (official or yours)
    daysoff:    { indexes: ['date'] },          // milestone 2: public holidays and school days off
    tasks:      { indexes: ['owner', 'due'] },  // milestone 3: homework and projects, with their steps
    periods:    { indexes: ['owner'] },                 // milestone 4: exam periods
    exams:      { indexes: ['owner', 'period', 'date'] }, // milestone 4: exams in a period
    sessions:   { indexes: ['owner', 'period', 'date'] }, // milestone 4: revision sessions
  };

  const now = () => new Date().toISOString();
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 15);
        return (c === 'x' ? r : (r & 3) | 8).toString(16);
      }));

  /* ---------- IndexedDB basics ---------- */
  let dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); }
      catch (e) { reject(e); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const [name, def] of Object.entries(SCHEMA)) {
          const st = db.objectStoreNames.contains(name)
            ? req.transaction.objectStore(name)
            : db.createObjectStore(name, { keyPath: 'id' });
          for (const ix of def.indexes) if (!st.indexNames.contains(ix)) st.createIndex(ix, ix);
          if (!st.indexNames.contains('updatedAt') && name !== 'meta') st.createIndex('updatedAt', 'updatedAt');
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => { db.close(); dbp = null; };
        resolve(db);
      };
      req.onerror = () => reject(req.error || new Error('The database could not be opened.'));
      req.onblocked = () => reject(new Error('Family Hub is open in another tab with an older version. Close the other tab and try again.'));
    });
    dbp.catch(() => { dbp = null; });
    return dbp;
  }
  const done = tx => new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error || new Error('Save was cancelled.'));
  });
  const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  const raw = {
    async all(store) { const db = await open(); return reqP(db.transaction(store).objectStore(store).getAll()); },
    async get(store, id) { const db = await open(); return reqP(db.transaction(store).objectStore(store).get(id)); },
    async put(store, rec) { const db = await open(); const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(rec); await done(tx); return rec; },
    async clearAll(stores) {
      const db = await open(); const tx = db.transaction(stores, 'readwrite');
      for (const s of stores) tx.objectStore(s).clear();
      await done(tx);
    },
    async putMany(map) {
      const stores = Object.keys(map).filter(s => map[s].length);
      if (!stores.length) return;
      const db = await open(); const tx = db.transaction(stores, 'readwrite');
      for (const s of stores) { const os = tx.objectStore(s); for (const r of map[s]) os.put(r); }
      await done(tx);
    },
  };

  /* ---------- Roles and permissions ----------
     One rules table decides who may do what. The beta has only the parent
     role; the two child roles are defined now so they can be switched on
     later without changing the logic. */
  const RULES = {
    parent: { '*': ['read', 'create', 'update', 'delete'] },
    child_view: {
      people: ['read:own'],
      activities: ['read:own'],
      reminders: ['read:own'],
      terms: ['read'],
      daysoff: ['read'],
      tasks: ['read:own'],
      periods: ['read:own'],
      exams: ['read:own'],
      sessions: ['read:own'],
    },
    child_limited: {
      people: ['read:own'],
      activities: ['read:own'],
      reminders: ['read:own'],
      terms: ['read'],
      daysoff: ['read'],
      tasks: ['read:own', 'update:own'],
      periods: ['read:own'],
      exams: ['read:own'],
      sessions: ['read:own', 'update:own'],
      approvals: ['read:own', 'create:own'],
    },
  };
  const PARENT_ONLY = ['users', 'meta'];

  function can(user, action, store, rec) {
    if (!user) return false;
    const rules = RULES[user.role];
    if (!rules) return false;
    if (user.role !== 'parent' && PARENT_ONLY.includes(store)) return false;
    const list = rules[store] || rules['*'] || [];
    if (list.includes(action)) return true;
    if (list.includes(action + ':own') && rec) {
      const owner = store === 'people' ? rec.id : rec.owner;
      return !!owner && owner === user.personId;
    }
    return false;
  }
  /* Whether a role can read any records of a store (all of them, or only its own). */
  function mayRead(user, store) {
    const rules = user && RULES[user.role];
    if (!rules) return false;
    if (user.role !== 'parent' && PARENT_ONLY.includes(store)) return false;
    return (rules[store] || rules['*'] || []).some(a => a === 'read' || a === 'read:own');
  }
  class AccessError extends Error {
    constructor(action, store) { super(`Your access level doesn't allow you to ${action} ${store}.`); this.name = 'AccessError'; }
  }

  /* ---------- The one data API the screens use ---------- */
  let currentUser = null;
  let deviceId = null;

  const data = {
    get user() { return currentUser; },

    async list(store, filter) {
      if (!mayRead(currentUser, store)) throw new AccessError('see', store);
      const rows = (await raw.all(store)).filter(r => !r.deleted && can(currentUser, 'read', store, r));
      return filter ? rows.filter(filter) : rows;
    },

    async get(store, id) {
      const r = await raw.get(store, id);
      if (!r || r.deleted) return null;
      if (!can(currentUser, 'read', store, r)) throw new AccessError('see', store);
      return r;
    },

    async save(store, fields) {
      const existing = fields.id ? await raw.get(store, fields.id) : null;
      const isNew = !existing || existing.deleted;
      if (!can(currentUser, isNew ? 'create' : 'update', store, existing || fields)) throw new AccessError(isNew ? 'add' : 'change', store);
      const t = now();
      const rec = Object.assign({}, existing || {}, fields, {
        id: fields.id || uuid(),
        createdAt: existing?.createdAt || t,
        createdBy: existing?.createdBy || currentUser.id,
        updatedAt: t,
        updatedBy: currentUser.id,
        device: deviceId,
        deleted: false,
      });
      return raw.put(store, rec);
    },

    async remove(store, id) {
      const r = await raw.get(store, id);
      if (!r) return;
      if (!can(currentUser, 'delete', store, r)) throw new AccessError('remove', store);
      const t = now();
      /* Soft delete: kept as a marker so a later sync knows it was removed. */
      await raw.put(store, Object.assign({}, r, { deleted: true, updatedAt: t, updatedBy: currentUser.id, device: deviceId }));
    },

    /* Whether a record id has ever existed here, including removed ones.
       Used so the official school calendar never brings back what you removed. */
    async known(store, id) { return !!(await raw.get(store, id)); },

    async getSetting(key, fallback) { const r = await raw.get('meta', key); return r ? r.value : fallback; },
    async setSetting(key, value) {
      if (!can(currentUser, 'update', 'meta')) throw new AccessError('change', 'settings');
      await raw.put('meta', { id: key, value, updatedAt: now() });
    },

    /* ---------- Backup ---------- */
    async exportBackup() {
      if (!can(currentUser, 'read', 'meta')) throw new AccessError('export', 'a backup');
      const stores = {};
      for (const s of Object.keys(SCHEMA)) stores[s] = await raw.all(s);
      return { app: 'family-hub', format: BACKUP_FORMAT, schema: DB_VERSION, exportedAt: now(), device: deviceId, stores };
    },

    /* Checks a backup without changing anything. Returns a summary or throws a readable error. */
    checkBackup(obj) {
      if (!obj || typeof obj !== 'object') throw new Error("This isn't a Family Hub backup. Choose the file the app exported.");
      if (obj.app !== 'family-hub') throw new Error("This file isn't a Family Hub backup. Choose the file the app exported.");
      if (typeof obj.format !== 'number' || obj.format > BACKUP_FORMAT) throw new Error('This backup was made by a newer version of Family Hub. Update the app on this device first.');
      if (!obj.stores || typeof obj.stores !== 'object') throw new Error('This backup is damaged: it has no data in it.');
      const counts = {};
      for (const [s, rows] of Object.entries(obj.stores)) {
        if (!SCHEMA[s]) continue;
        if (!Array.isArray(rows) || rows.some(r => !r || typeof r.id !== 'string')) throw new Error(`This backup is damaged: the ${s} list can't be read.`);
        counts[s] = rows.filter(r => !r.deleted).length;
      }
      const children = (obj.stores.people || []).filter(p => !p.deleted && p.type === 'child');
      return { exportedAt: obj.exportedAt, fromThisDevice: obj.device === deviceId, counts, children: children.map(c => c.name) };
    },

    /* Replaces everything on this device with the backup. The device id is kept. */
    async restoreBackup(obj) {
      if (!can(currentUser, 'delete', 'meta')) throw new AccessError('restore', 'a backup');
      data.checkBackup(obj);
      const stores = Object.keys(SCHEMA);
      const map = {};
      for (const s of stores) map[s] = (obj.stores[s] || []).filter(r => !(s === 'meta' && r.id === 'deviceId'));
      map.meta.push({ id: 'deviceId', value: deviceId, updatedAt: now() });
      map.meta.push({ id: 'restoredAt', value: now(), updatedAt: now() });
      await raw.clearAll(stores);
      await raw.putMany(map);
      await data.signIn();
    },

    /* Sets up this device on first open and signs in the parent user. */
    async signIn() {
      deviceId = await data.getSetting('deviceId', null);
      if (!deviceId) { deviceId = uuid(); await raw.put('meta', { id: 'deviceId', value: deviceId, updatedAt: now() }); }
      const users = (await raw.all('users')).filter(u => !u.deleted);
      let parent = users.find(u => u.role === 'parent');
      if (!parent) {
        const t = now();
        parent = { id: uuid(), role: 'parent', name: 'Parent', personId: null, createdAt: t, updatedAt: t, createdBy: 'system', device: deviceId, deleted: false };
        await raw.put('users', parent);
      }
      currentUser = parent;
      return parent;
    },

    async ready() { await open(); return data.signIn(); },
  };

  FH.data = data;
  FH.can = (action, store, rec) => can(currentUser, action, store, rec);
  FH.RULES = RULES;
  FH._raw = raw; // for tests only
})();
