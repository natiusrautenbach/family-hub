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
        db = F.getFirestore(app);
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
    const who = uid => { const a = Object.values(D.accounts).find(x => x.uid === uid); return a ? { uid, email: a.email, name: a.name, provider: a.provider } : null; };
    return {
      kind: 'fake',
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
    };
  }

  FH.cloud = Object.assign(useFake ? fakeBackend() : firebaseBackend(), { message, emulated, MAX_MEMBERS, CONSENT_VERSION });
})();
