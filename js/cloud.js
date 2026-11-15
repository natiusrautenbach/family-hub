/* Herding Cats · Copyright (c) 2026 Natius. All rights reserved. See LICENSE. */
/* Herding Cats · cloud accounts (Phase 2)
   Sign-in and family accounts on Google Firebase (database in Johannesburg).
   One small API, FH.cloud, used by the sign-in screens. Two back ends:
   - firebase: the real service (or Firebase's local emulators in automatic tests)
   - fake: a stand-in kept in this browser, used for screen tests where Firebase
     can't be reached. Turned on with ?backend=fake; never used by real families.
   The settings below are public by design: Firebase protects the data with the
   database's permission rules (firestore.rules), not by hiding these values. */
(function () {
  'use strict';
  const FH = (window.FH = window.FH || {});

  const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
  const CONFIG = {
    apiKey: 'AIzaSyAZVf9NhM8uv5pvTY8hihQ0V4kHDis6aXo',
    authDomain: 'herding-cats-1e399.firebaseapp.com',
    projectId: 'herding-cats-1e399',
    storageBucket: 'herding-cats-1e399.firebasestorage.app',
    messagingSenderId: '702030124612',
    appId: '1:702030124612:web:94483c497c958468048e11',
  };
  const MAX_MEMBERS = 8;
  const INVITE_DAYS = 7;
  const inviteToken = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), b => 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 56]).join('');
  const CONSENT_VERSION = 1;

  /* Firebase's local emulators run on this computer during automatic tests. */
  const emulated = ['localhost', '127.0.0.1'].includes(location.hostname) && location.port === '5000';
  const params = new URLSearchParams(location.search);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked: nothing to keep */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* nothing to remove */ } },
  };
  if (params.get('backend') === 'fake') store.set('hc-backend', 'fake');
  if (params.get('backend') === 'firebase') store.del('hc-backend');
  const useFake = store.get('hc-backend') === 'fake';

  /* A short family code, e.g. for signing in with a family username later. No 0/O or 1/I. */
  const familyCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');

  /* Plain-language messages for the errors people can actually hit. */
  const MESSAGES = {
    'auth/invalid-credential': "That email and password don't match. Check them, or reset your password.",
    'auth/wrong-password': "That email and password don't match. Check them, or reset your password.",
    'auth/user-not-found': "That email and password don't match. Check them, or reset your password.",
    'auth/invalid-email': "That doesn't look like an email address.",
    'auth/missing-email': 'Enter your email address.',
    'auth/missing-password': 'Enter your password.',
    'auth/email-already-in-use': 'There is already an account with this email. Sign in instead, or reset the password.',
    'auth/weak-password': 'Choose a password of at least 8 characters.',
    'auth/too-many-requests': 'Too many attempts. Wait a few minutes, then try again.',
    'auth/network-request-failed': "Can't reach the internet. Check your connection and try again.",
    'auth/popup-closed-by-user': 'Google sign-in was closed before it finished.',
    'auth/cancelled-popup-request': 'Google sign-in was closed before it finished.',
    'auth/user-disabled': 'This account has been switched off. Ask your family administrator.',
    'auth/account-exists-with-different-credential': 'This email already signs in another way. Use email and password instead.',
    'permission-denied': "You don't have access to that family.",
    unavailable: "Can't reach the internet. Check your connection and try again.",
    'sdk-unavailable': "Can't reach Herding Cats' sign-in service. Check your internet connection and try again.",
    'invite-gone': 'This invite link has been cancelled. Ask for a new one.',
  };
  const message = err => MESSAGES[err && err.code] || (err && err.message) || 'Something went wrong. Try again.';
  const fail = code => Object.assign(new Error(MESSAGES[code] || code), { code });

  /* ---------- Firebase ---------- */
  function firebaseBackend() {
    let A, F, auth, db, starting = null;

    function init() {
      if (starting) return starting;
      starting = (async () => {
        let mods;
        try {
          mods = await Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js')]);
        } catch (e) { starting = null; throw fail('sdk-unavailable'); }
        const [appM, authM, fsM] = mods;
        A = authM; F = fsM;
        const app = appM.initializeApp(emulated ? Object.assign({}, CONFIG, { projectId: 'demo-herding-cats' }) : CONFIG);
        auth = A.getAuth(app);
        /* The database keeps its own copy on the device, so changes made offline are
           sent when the connection returns, even after the app was closed. */
        try { db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) }); }
        catch (e) { db = F.getFirestore(app); }
        if (emulated) {
          A.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
          F.connectFirestoreEmulator(db, '127.0.0.1', 8080);
        }
        await auth.authStateReady();
        await A.getRedirectResult(auth).catch(() => null);
      })();
      return starting;
    }
    const who = u => u ? { uid: u.uid, email: u.email || '', name: u.displayName || '', provider: (u.providerData[0] || {}).providerId || 'password' } : null;

    return {
      kind: 'firebase',
      init,
      user: () => who(auth && auth.currentUser),
      async signUp(name, email, password) {
        const cred = await A.createUserWithEmailAndPassword(auth, email, password);
        if (name) await A.updateProfile(cred.user, { displayName: name });
        return who(auth.currentUser);
      },
      async signIn(email, password) { await A.signInWithEmailAndPassword(auth, email, password); return who(auth.currentUser); },
      async google() {
        const provider = new A.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        try { await A.signInWithPopup(auth, provider); }
        catch (e) {
          if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') { await A.signInWithRedirect(auth, provider); return null; }
          throw e;
        }
        return who(auth.currentUser);
      },
      reset: email => A.sendPasswordResetEmail(auth, email),
      signOut: () => A.signOut(auth),

      /* The family this person belongs to, with their role; null when they have none yet. */
      async myFamily() {
        const u = auth.currentUser;
        if (!u) return null;
        const us = await F.getDoc(F.doc(db, 'users', u.uid));
        const fid = us.exists() ? us.data().familyId : null;
        if (!fid) return null;
        try {
          const [fs, ms] = await Promise.all([F.getDoc(F.doc(db, 'families', fid)), F.getDoc(F.doc(db, 'families', fid, 'members', u.uid))]);
          if (!fs.exists() || !ms.exists()) return null;
          const f = fs.data(), m = ms.data();
          return { family: { id: fid, name: f.name, code: f.code, ownerUid: f.ownerUid }, member: { role: m.role, name: m.displayName, personId: m.personId || null } };
        } catch (e) {
          if (e.code === 'permission-denied') return null; // removed from the family
          throw e;
        }
      },

      /* Creates a family with this person as its owner, all in one go. */
      async createFamily({ familyName, displayName }) {
        const u = auth.currentUser;
        if (!u) throw fail('auth/invalid-credential');
        const fref = F.doc(F.collection(db, 'families'));
        const code = familyCode();
        const b = F.writeBatch(db);
        b.set(fref, {
          name: familyName, ownerUid: u.uid, code, plan: 'beta', maxMembers: MAX_MEMBERS,
          createdAt: F.serverTimestamp(), consent: { by: u.uid, at: F.serverTimestamp(), version: CONSENT_VERSION },
        });
        b.set(F.doc(db, 'families', fref.id, 'members', u.uid), {
          uid: u.uid, role: 'owner', displayName, email: u.email || '', joinedAt: F.serverTimestamp(), personId: null,
        });
        b.set(F.doc(db, 'users', u.uid), { familyId: fref.id, displayName, email: u.email || '', createdAt: F.serverTimestamp() });
        await b.commit();
        if (displayName && displayName !== u.displayName) await A.updateProfile(u, { displayName }).catch(() => {});
        return { family: { id: fref.id, name: familyName, code, ownerUid: u.uid }, member: { role: 'owner', name: displayName, personId: null } };
      },
      renameFamily: (fid, name) => F.updateDoc(F.doc(db, 'families', fid), { name }),

      /* ---------- Sync ---------- */
      /* One shared document per record; the record itself travels as text so any shape fits. */
      get ready() { return !!db; },
      pushRecord(fid, store, rec) {
        if (!db) return Promise.reject(fail('sdk-unavailable'));
        return F.setDoc(F.doc(db, 'families', fid, 'records', store + '~' + rec.id), {
          store, id: rec.id, updatedAt: rec.updatedAt || '', by: rec.updatedBy || '', deleted: !!rec.deleted,
          json: JSON.stringify(rec), syncAt: F.serverTimestamp(),
        });
      },
      /* Calls back with records changed on the server since a moment (milliseconds). */
      listen(fid, sinceMs, onChanges, onError) {
        if (!db) throw fail('sdk-unavailable');
        const col = F.collection(db, 'families', fid, 'records');
        const q = sinceMs ? F.query(col, F.where('syncAt', '>', F.Timestamp.fromMillis(sinceMs))) : col;
        return F.onSnapshot(q, snap => {
          const list = [];
          for (const ch of snap.docChanges()) {
            if (ch.type === 'removed') continue;
            const d = ch.doc.data({ serverTimestamps: 'estimate' });
            let rec; try { rec = JSON.parse(d.json); } catch (e) { continue; }
            list.push({ store: d.store, rec, syncAt: d.syncAt ? d.syncAt.toMillis() : 0, local: ch.doc.metadata.hasPendingWrites });
          }
          onChanges(list, snap.metadata.fromCache);
        }, onError);
      },

      /* ---------- People in the family ---------- */
      async members(fid) {
        const qs = await F.getDocs(F.collection(db, 'families', fid, 'members'));
        return qs.docs.map(d => { const m = d.data(); return { uid: d.id, role: m.role, name: m.displayName, email: m.email || '', joinedAt: m.joinedAt ? m.joinedAt.toMillis() : 0 }; });
      },
      async createInvite(fid, familyName, role) {
        const u = auth.currentUser;
        const token = inviteToken();
        await F.setDoc(F.doc(db, 'families', fid, 'invites', token), {
          role, familyName, createdBy: u.uid, createdAt: F.serverTimestamp(),
          expiresAt: F.Timestamp.fromMillis(Date.now() + INVITE_DAYS * 864e5), usedBy: null,
        });
        return { token, role, expiresAt: Date.now() + INVITE_DAYS * 864e5 };
      },
      async invites(fid) {
        const qs = await F.getDocs(F.collection(db, 'families', fid, 'invites'));
        return qs.docs.map(d => { const v = d.data(); return { token: d.id, role: v.role, usedBy: v.usedBy, expiresAt: v.expiresAt ? v.expiresAt.toMillis() : 0 }; });
      },
      cancelInvite: (fid, token) => F.deleteDoc(F.doc(db, 'families', fid, 'invites', token)),
      async readInvite(fid, token) {
        const d = await F.getDoc(F.doc(db, 'families', fid, 'invites', token));
        if (!d.exists()) return null;
        const v = d.data();
        return { familyName: v.familyName, role: v.role, used: !!v.usedBy, usedByMe: v.usedBy === (auth.currentUser || {}).uid, expired: (v.expiresAt ? v.expiresAt.toMillis() : 0) < Date.now() };
      },
      /* Joins with an invite: the member record, the invite marked used and the person's pointer, in one go. */
      async joinFamily(fid, token, displayName) {
        const u = auth.currentUser;
        const inv = await F.getDoc(F.doc(db, 'families', fid, 'invites', token));
        if (!inv.exists()) throw fail('invite-gone');
        const v = inv.data();
        const b = F.writeBatch(db);
        b.set(F.doc(db, 'families', fid, 'members', u.uid), { uid: u.uid, role: v.role, displayName, email: u.email || '', joinedAt: F.serverTimestamp(), personId: null, invite: token });
        b.update(inv.ref, { usedBy: u.uid, usedAt: F.serverTimestamp() });
        b.set(F.doc(db, 'users', u.uid), { familyId: fid, displayName, email: u.email || '', createdAt: F.serverTimestamp() });
        await b.commit();
        if (displayName && displayName !== u.displayName) await A.updateProfile(u, { displayName }).catch(() => {});
        const fs = await F.getDoc(F.doc(db, 'families', fid));
        const f = fs.data();
        return { family: { id: fid, name: f.name, code: f.code, ownerUid: f.ownerUid }, member: { role: v.role, name: displayName, personId: null } };
      },
    };
  }

  /* ---------- Stand-in kept in this browser (screen tests only) ---------- */
  function fakeBackend() {
    const K = 'hc-fake-db';
    const load = () => { try { return JSON.parse(store.get(K)) || null; } catch (e) { return null; } };
    let D = load() || { accounts: {}, session: null, users: {}, families: {}, members: {} };
    const save = () => store.set(K, JSON.stringify(D));
    const wait = () => new Promise(r => setTimeout(r, 60));
    const id = () => Math.random().toString(36).slice(2, 12);
    const listeners = [];
    const who = uid => { const a = Object.values(D.accounts).find(x => x.uid === uid); return a ? { uid, email: a.email, name: a.name, provider: a.provider } : null; };
    return {
      kind: 'fake',
      ready: true,
      async init() { await wait(); },
      user: () => (D.session ? who(D.session) : null),
      async signUp(name, email, password) {
        await wait();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw fail('auth/invalid-email');
        if (!password || password.length < 6) throw fail('auth/weak-password');
        if (D.accounts[email.toLowerCase()]) throw fail('auth/email-already-in-use');
        const uid = id();
        D.accounts[email.toLowerCase()] = { uid, email, name, password, provider: 'password' };
        D.session = uid; save(); return who(uid);
      },
      async signIn(email, password) {
        await wait();
        const a = D.accounts[(email || '').toLowerCase()];
        if (!a || a.password !== password) throw fail('auth/invalid-credential');
        D.session = a.uid; save(); return who(a.uid);
      },
      async google() {
        await wait();
        const email = 'google.parent@example.com';
        if (!D.accounts[email]) D.accounts[email] = { uid: id(), email, name: 'Google Parent', password: null, provider: 'google.com' };
        D.session = D.accounts[email].uid; save(); return who(D.session);
      },
      async reset(email) { await wait(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email || '')) throw fail('auth/invalid-email'); },
      async signOut() { D.session = null; save(); },
      async myFamily() {
        await wait();
        const u = D.session && D.users[D.session];
        if (!u || !u.familyId) return null;
        const f = D.families[u.familyId], m = (D.members[u.familyId] || {})[D.session];
        if (!f || !m) return null;
        return { family: { id: u.familyId, name: f.name, code: f.code, ownerUid: f.ownerUid }, member: { role: m.role, name: m.displayName, personId: null } };
      },
      async createFamily({ familyName, displayName }) {
        await wait();
        const fid = id(), code = familyCode(), a = who(D.session);
        D.families[fid] = { name: familyName, ownerUid: D.session, code, plan: 'beta', maxMembers: MAX_MEMBERS };
        D.members[fid] = { [D.session]: { role: 'owner', displayName, email: a.email } };
        D.users[D.session] = { familyId: fid, displayName };
        save();
        return { family: { id: fid, name: familyName, code, ownerUid: D.session }, member: { role: 'owner', name: displayName, personId: null } };
      },
      async renameFamily(fid, name) { if (D.families[fid]) { D.families[fid].name = name; save(); } },

      /* Sync stand-in: records kept in this browser; listeners on this page are told about new ones. */
      async pushRecord(fid, store, rec) {
        await wait();
        D.records = D.records || {}; D.records[fid] = D.records[fid] || {};
        const key = store + '~' + rec.id, cur = D.records[fid][key];
        if (cur && (cur.rec.updatedAt || '') > (rec.updatedAt || '')) throw fail('permission-denied');
        D.clock = Math.max((D.clock || 0) + 1, Date.now());
        D.records[fid][key] = { store, rec: JSON.parse(JSON.stringify(rec)), syncAt: D.clock };
        save();
        const item = D.records[fid][key];
        for (const l of listeners) if (l.fid === fid) setTimeout(() => l.cb([{ store, rec: item.rec, syncAt: item.syncAt, local: false }], false), 30);
      },
      listen(fid, sinceMs, cb) {
        const l = { fid, cb }; listeners.push(l);
        setTimeout(() => {
          const all = Object.values((D.records || {})[fid] || {}).filter(x => x.syncAt > (sinceMs || 0));
          cb(all.map(x => ({ store: x.store, rec: x.rec, syncAt: x.syncAt, local: false })), false);
        }, 40);
        return () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); };
      },
      async members(fid) {
        await wait();
        return Object.entries(D.members[fid] || {}).map(([uid, m]) => ({ uid, role: m.role, name: m.displayName, email: m.email || '', joinedAt: m.joinedAt || 0 }));
      },
      async createInvite(fid, familyName, role) {
        await wait();
        const token = inviteToken(), expiresAt = Date.now() + INVITE_DAYS * 864e5;
        D.invites = D.invites || {}; D.invites[fid + '.' + token] = { fid, role, familyName, expiresAt, usedBy: null };
        save(); return { token, role, expiresAt };
      },
      async invites(fid) { await wait(); return Object.entries(D.invites || {}).filter(([, v]) => v.fid === fid).map(([k, v]) => ({ token: k.split('.')[1], role: v.role, usedBy: v.usedBy, expiresAt: v.expiresAt })); },
      async cancelInvite(fid, token) { delete (D.invites || {})[fid + '.' + token]; save(); },
      async readInvite(fid, token) {
        await wait();
        const v = (D.invites || {})[fid + '.' + token];
        return v ? { familyName: v.familyName, role: v.role, used: !!v.usedBy, usedByMe: v.usedBy === D.session, expired: v.expiresAt < Date.now() } : null;
      },
      async joinFamily(fid, token, displayName) {
        await wait();
        const v = (D.invites || {})[fid + '.' + token];
        if (!v) throw fail('invite-gone');
        if (v.usedBy || v.expiresAt < Date.now()) throw fail('permission-denied');
        const a = who(D.session);
        D.members[fid] = D.members[fid] || {};
        D.members[fid][D.session] = { role: v.role, displayName, email: a.email, joinedAt: Date.now() };
        v.usedBy = D.session;
        D.users[D.session] = { familyId: fid, displayName };
        save();
        const f = D.families[fid];
        return { family: { id: fid, name: f.name, code: f.code, ownerUid: f.ownerUid }, member: { role: v.role, name: displayName, personId: null } };
      },
    };
  }

  FH.cloud = Object.assign(useFake ? fakeBackend() : firebaseBackend(), { message, emulated, MAX_MEMBERS, CONSENT_VERSION });
})();
