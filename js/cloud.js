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
    'username-taken': 'That username is already used in your family. Choose another.',
    'username-unknown': "That family code and username don't match. Check them with your family administrator.",
    'family-full': 'Your family already has 8 people, the most a family can have.',
    'username-format': 'A username is 2 to 20 small letters or numbers, with no spaces, e.g. liam or liam2.',
    'invite-refused': "This invite can't be used: it may have expired or been used, or the family is full (8 people).",
  };
  /* Records: whose they are and whether they are money, so the server can share each
     one only with the people allowed to see it. */
  const MONEY = ['accounts', 'entries', 'goals', 'ledger', 'chores', 'rewards'];
  const recOwner = (store, rec) => store === 'people' ? rec.id : ['terms', 'daysoff'].includes(store) ? '_family' : (rec.owner || '_none');
  /* Family usernames sign in with an address the app makes up; nobody ever sees it. */
  const loginKey = (code, username) => `${String(code || '').toUpperCase()}-${String(username || '').toLowerCase()}`;
  const usernameOk = u => /^[a-z0-9]{2,20}$/.test(u);
  const loginEmail = (code, username) => `u-${code.toLowerCase()}-${username}-${Math.random().toString(36).slice(2, 8)}@herding-cats-1e399.firebaseapp.com`;
  const memberOut = (uid, m) => ({
    uid, role: m.role, name: m.displayName, email: m.email || '', joinedAt: m.joinedAt && m.joinedAt.toMillis ? m.joinedAt.toMillis() : (m.joinedAt || 0),
    personId: m.personId || null, requested: m.requested || null, username: m.username || null,
    kids: m.kids || [], siblings: !!m.siblings, money: m.money !== false,
  });
  const message = err => MESSAGES[err && err.code] || (err && err.message) || 'Something went wrong. Try again.';
  const fail = code => Object.assign(new Error(MESSAGES[code] || code), { code });

  /* ---------- Firebase ---------- */
  function firebaseBackend() {
    let A, F, AppM, auth, db, starting = null;

    function init() {
      if (starting) return starting;
      starting = (async () => {
        let mods;
        try {
          mods = await Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js')]);
        } catch (e) { starting = null; throw fail('sdk-unavailable'); }
        const [appM, authM, fsM] = mods;
        A = authM; F = fsM; AppM = appM;
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
    async function withTempUser(email, password, fn) {
      const app2 = AppM.initializeApp(emulated ? Object.assign({}, CONFIG, { projectId: 'demo-herding-cats' }) : CONFIG, 'login-' + Date.now());
      try {
        const auth2 = A.initializeAuth(app2, { persistence: A.inMemoryPersistence });
        const db2 = F.getFirestore(app2);
        if (emulated) { A.connectAuthEmulator(auth2, 'http://127.0.0.1:9099', { disableWarnings: true }); F.connectFirestoreEmulator(db2, '127.0.0.1', 8080); }
        const cred = await A.createUserWithEmailAndPassword(auth2, email, password);
        await fn(db2, cred.user.uid);
        await A.signOut(auth2);
        return cred.user.uid;
      } finally { AppM.deleteApp(app2).catch(() => {}); }
    }

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
          return { family: { id: fid, name: f.name, code: f.code, ownerUid: f.ownerUid, memberCount: f.memberCount || 0 }, member: memberOut(u.uid, m) };
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
          name: familyName, ownerUid: u.uid, code, plan: 'beta', maxMembers: MAX_MEMBERS, memberCount: 1,
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
          store, id: rec.id, owner: recOwner(store, rec), money: MONEY.includes(store), updatedAt: rec.updatedAt || '', by: rec.updatedBy || '', deleted: !!rec.deleted,
          json: JSON.stringify(rec), syncAt: F.serverTimestamp(),
        });
      },
      /* Calls back with records changed on the server since a moment (milliseconds).
         Each role listens only to what it may see (the server checks the same). */
      listen(fid, sinceMs, onChanges, onError, who) {
        if (!db) throw fail('sdk-unavailable');
        const col = F.collection(db, 'families', fid, 'records');
        const W = F.where, since = sinceMs ? [W('syncAt', '>', F.Timestamp.fromMillis(sinceMs))] : [];
        const r = (who && who.role) || 'parent';
        const parts = [];
        if (['owner', 'parent'].includes(r)) parts.push([]);
        else if (r === 'carer') {
          parts.push([W('owner', '==', '_family')]);
          if ((who.kids || []).length) parts.push([W('money', '==', false), W('owner', 'in', who.kids.slice(0, 10))]);
        } else if (r === 'child_view' || r === 'child_limited') {
          const own = [W('owner', 'in', [who.personId || '_none', '_family'])];
          parts.push(who.money === false ? [W('money', '==', false), ...own] : own);
          if (who.siblings) parts.push([W('store', 'in', ['people', 'activities'])]);
        }
        const unsubs = parts.map(p => F.onSnapshot(p.length || since.length ? F.query(col, ...p, ...since) : col, snapHandler, onError));
        return () => unsubs.forEach(u => u());
        function snapHandler(snap) {
          const list = [];
          for (const ch of snap.docChanges()) {
            if (ch.type === 'removed') continue;
            const d = ch.doc.data({ serverTimestamps: 'estimate' });
            let rec; try { rec = JSON.parse(d.json); } catch (e) { continue; }
            list.push({ store: d.store, rec, syncAt: d.syncAt ? d.syncAt.toMillis() : 0, local: ch.doc.metadata.hasPendingWrites });
          }
          onChanges(list, snap.metadata.fromCache);
        }
      },

      /* ---------- People in the family ---------- */
      async members(fid) {
        const qs = await F.getDocs(F.collection(db, 'families', fid, 'members'));
        return qs.docs.map(d => memberOut(d.id, d.data()));
      },
      async family(fid) { const d = await F.getDoc(F.doc(db, 'families', fid)); const f = d.data() || {}; return { memberCount: f.memberCount || 0, maxMembers: f.maxMembers || MAX_MEMBERS, code: f.code }; },
      recount: (fid, n) => F.updateDoc(F.doc(db, 'families', fid), { memberCount: n }),
      /* Approve someone, or change what they can see. */
      updateMember(fid, uid, fields) {
        const out = {};
        for (const k of ['role', 'displayName', 'personId', 'kids', 'siblings', 'money']) if (k in fields) out[k === 'name' ? 'displayName' : k] = fields[k];
        return F.updateDoc(F.doc(db, 'families', fid, 'members', uid), out);
      },
      async removeMember(fid, m, code) {
        const b = F.writeBatch(db);
        b.delete(F.doc(db, 'families', fid, 'members', m.uid));
        if (m.username) b.delete(F.doc(db, 'logins', loginKey(code, m.username)));
        b.update(F.doc(db, 'families', fid), { memberCount: F.increment(-1) });
        await b.commit();
      },
      /* A family username and password for someone without email (e.g. a child).
         The new sign-in is made in a separate, temporary connection so the
         administrator stays signed in. */
      async createLogin(fid, code, o) {
        const username = String(o.username || '').toLowerCase();
        if (!usernameOk(username)) throw fail('username-format');
        const key = loginKey(code, username);
        if (!o.replacing && (await F.getDoc(F.doc(db, 'logins', key))).exists()) throw fail('username-taken');
        const email = loginEmail(code, username);
        const uid = await withTempUser(email, o.password, async (db2, uid2) => {
          await F.setDoc(F.doc(db2, 'users', uid2), { familyId: fid, displayName: o.name, email: '', createdAt: F.serverTimestamp() });
        });
        const b = F.writeBatch(db);
        b.set(F.doc(db, 'families', fid, 'members', uid), {
          uid, role: o.role, displayName: o.name, email: '', joinedAt: F.serverTimestamp(), personId: o.personId || null,
          username, kids: o.kids || [], siblings: !!o.siblings, money: o.money !== false, createdBy: auth.currentUser.uid,
        });
        b.set(F.doc(db, 'logins', key), { email, familyId: fid, uid });
        if (o.replacing) b.delete(F.doc(db, 'families', fid, 'members', o.replacing));
        else b.update(F.doc(db, 'families', fid), { memberCount: F.increment(1) });
        await b.commit();
        return uid;
      },
      /* Deletes everything stored about the family: data, invites, usernames, people,
         then the family itself and the owner's own record. Reports progress. */
      async deleteFamily(fid, code, onStep) {
        const u = auth.currentUser;
        const step = t => { try { onStep && onStep(t); } catch (e) { /* screen gone */ } };
        const inBatches = async refs => {
          for (let i = 0; i < refs.length; i += 400) {
            const b = F.writeBatch(db);
            refs.slice(i, i + 400).forEach(r => b.delete(r));
            await b.commit();
          }
        };
        step('Deleting the family\'s calendar, tasks, study plans and money…');
        await inBatches((await F.getDocs(F.collection(db, 'families', fid, 'records'))).docs.map(d => d.ref));
        step('Deleting invite links and usernames…');
        await inBatches((await F.getDocs(F.collection(db, 'families', fid, 'invites'))).docs.map(d => d.ref));
        const ms = (await F.getDocs(F.collection(db, 'families', fid, 'members'))).docs;
        await inBatches(ms.filter(d => d.data().username).map(d => F.doc(db, 'logins', loginKey(code, d.data().username))));
        step('Removing everyone from the family…');
        await inBatches(ms.filter(d => d.id !== u.uid).map(d => d.ref));
        await F.deleteDoc(F.doc(db, 'families', fid));
        await F.deleteDoc(F.doc(db, 'families', fid, 'members', u.uid));
        await F.deleteDoc(F.doc(db, 'users', u.uid)).catch(() => {});
      },
      /* Leaves the family (anyone but the owner). */
      async leaveFamily(fid) {
        const u = auth.currentUser;
        await F.deleteDoc(F.doc(db, 'families', fid, 'members', u.uid));
        await F.deleteDoc(F.doc(db, 'users', u.uid)).catch(() => {});
      },
      async signInUsername(code, username, password) {
        const d = await F.getDoc(F.doc(db, 'logins', loginKey(code, username)));
        if (!d.exists()) throw fail('username-unknown');
        try { await A.signInWithEmailAndPassword(auth, d.data().email, password); }
        catch (e) { if (e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password' || e.code === 'auth/user-not-found') throw fail('username-unknown'); throw e; }
        return who(auth.currentUser);
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
        b.set(F.doc(db, 'families', fid, 'members', u.uid), { uid: u.uid, role: 'pending', requested: v.role, displayName, email: u.email || '', joinedAt: F.serverTimestamp(), personId: null, invite: token });
        b.update(inv.ref, { usedBy: u.uid, usedAt: F.serverTimestamp() });
        b.update(F.doc(db, 'families', fid), { memberCount: F.increment(1) });
        b.set(F.doc(db, 'users', u.uid), { familyId: fid, displayName, email: u.email || '', createdAt: F.serverTimestamp() });
        try { await b.commit(); }
        catch (e) { if (e.code === 'permission-denied') throw fail('invite-refused'); throw e; }
        if (displayName && displayName !== u.displayName) await A.updateProfile(u, { displayName }).catch(() => {});
        const fs = await F.getDoc(F.doc(db, 'families', fid));
        const f = fs.data();
        return { family: { id: fid, name: f.name, code: f.code, ownerUid: f.ownerUid }, member: memberOut(u.uid, { role: 'pending', requested: v.role, displayName }) };
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
        return { family: { id: u.familyId, name: f.name, code: f.code, ownerUid: f.ownerUid, memberCount: f.memberCount || 0 }, member: memberOut(D.session, m) };
      },
      async createFamily({ familyName, displayName }) {
        await wait();
        const fid = id(), code = familyCode(), a = who(D.session);
        D.families[fid] = { name: familyName, ownerUid: D.session, code, plan: 'beta', maxMembers: MAX_MEMBERS, memberCount: 1 };
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
        return Object.entries(D.members[fid] || {}).map(([uid, m]) => memberOut(uid, m));
      },
      async family(fid) { const f = D.families[fid] || {}; return { memberCount: f.memberCount || 0, maxMembers: f.maxMembers || MAX_MEMBERS, code: f.code }; },
      async recount(fid, n) { D.families[fid].memberCount = n; save(); },
      async updateMember(fid, uid, fields) { await wait(); Object.assign(D.members[fid][uid], fields); save(); },
      async removeMember(fid, m, code) {
        await wait(); delete D.members[fid][m.uid];
        if (m.username) delete (D.logins || {})[loginKey(code, m.username)];
        D.families[fid].memberCount = Math.max(1, (D.families[fid].memberCount || 1) - 1); save();
      },
      async createLogin(fid, code, o) {
        await wait();
        const username = String(o.username || '').toLowerCase();
        if (!usernameOk(username)) throw fail('username-format');
        D.logins = D.logins || {};
        const key = loginKey(code, username);
        if (!o.replacing && D.logins[key]) throw fail('username-taken');
        const email = loginEmail(code, username), uid = id();
        D.accounts[email] = { uid, email, name: o.name, password: o.password, provider: 'password' };
        D.users[uid] = { familyId: fid, displayName: o.name };
        D.members[fid][uid] = { role: o.role, displayName: o.name, email: '', joinedAt: Date.now(), personId: o.personId || null, username, kids: o.kids || [], siblings: !!o.siblings, money: o.money !== false };
        D.logins[key] = { email, familyId: fid, uid };
        if (o.replacing) delete D.members[fid][o.replacing]; else D.families[fid].memberCount = (D.families[fid].memberCount || 1) + 1;
        save(); return uid;
      },
      async deleteFamily(fid, code, onStep) {
        onStep && onStep('Deleting…'); await wait();
        for (const [uid, m] of Object.entries(D.members[fid] || {})) { if (m.username) delete (D.logins || {})[loginKey(code, m.username)]; if (D.users[uid] && D.users[uid].familyId === fid) delete D.users[uid]; }
        delete D.members[fid]; delete D.families[fid]; if (D.records) delete D.records[fid];
        for (const [k, v] of Object.entries(D.invites || {})) if (v.fid === fid) delete D.invites[k];
        save();
      },
      async leaveFamily(fid) { await wait(); delete (D.members[fid] || {})[D.session]; delete D.users[D.session]; save(); },
      async signInUsername(code, username, password) {
        await wait();
        const l = (D.logins || {})[loginKey(code, username)];
        const a = l && D.accounts[l.email];
        if (!a || a.password !== password) throw fail('username-unknown');
        D.session = a.uid; save(); return who(a.uid);
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
        D.members[fid][D.session] = { role: 'pending', requested: v.role, displayName, email: a.email, joinedAt: Date.now() };
        v.usedBy = D.session;
        D.families[fid].memberCount = (D.families[fid].memberCount || 1) + 1;
        D.users[D.session] = { familyId: fid, displayName };
        save();
        const f = D.families[fid];
        return { family: { id: fid, name: f.name, code: f.code, ownerUid: f.ownerUid }, member: memberOut(D.session, D.members[fid][D.session]) };
      },
    };
  }

  FH.cloud = Object.assign(useFake ? fakeBackend() : firebaseBackend(), { message, emulated, MAX_MEMBERS, CONSENT_VERSION });
})();
