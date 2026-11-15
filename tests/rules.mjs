// Herding Cats · Copyright (c) 2026 Natius. All rights reserved. See LICENSE.
// Permission rule tests, run on GitHub against Firebase's local emulators.
// Each check tries something a person may or may not do and expects the right answer.
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore, connectFirestoreEmulator, doc, collection, writeBatch, getDoc, getDocs, setDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp, increment, query, where,
} from 'firebase/firestore';

const cfg = { apiKey: 'demo-key', authDomain: 'demo-herding-cats.firebaseapp.com', projectId: 'demo-herding-cats' };
let failed = 0;
const say = (ok, name, extra = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'} rules: ${name}${extra ? ' — ' + extra : ''}`); };
async function expectOk(name, fn) { try { await fn(); say(true, name); } catch (e) { say(false, name, e.code || e.message); } }
async function expectDenied(name, fn) {
  try { await fn(); say(false, name, 'was allowed'); }
  catch (e) { say(e.code === 'permission-denied', name, e.code === 'permission-denied' ? '' : (e.code || e.message)); }
}

async function person(label, email) {
  const app = initializeApp(cfg, label);
  const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app); connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const cred = await createUserWithEmailAndPassword(auth, email, 'password123');
  return { uid: cred.user.uid, db };
}
function familyBatch(p, overrides = {}) {
  const fref = doc(collection(p.db, 'families'));
  const b = writeBatch(p.db);
  b.set(fref, Object.assign({ name: 'Family', ownerUid: p.uid, code: 'ABC234', plan: 'beta', maxMembers: 8, createdAt: serverTimestamp(), consent: { by: p.uid, at: serverTimestamp(), version: 1 } }, overrides.family || {}));
  b.set(doc(p.db, 'families', fref.id, 'members', p.uid), Object.assign({ uid: p.uid, role: 'owner', displayName: 'Owner', email: 'x@example.com', joinedAt: serverTimestamp(), personId: null }, overrides.member || {}));
  b.set(doc(p.db, 'users', p.uid), { familyId: fref.id, displayName: 'Owner', email: 'x@example.com', createdAt: serverTimestamp() });
  return { b, fid: fref.id };
}

const stamp = Date.now();
const A = await person('A', `a${stamp}@example.com`);
const B = await person('B', `b${stamp}@example.com`);

const fa = familyBatch(A, { family: { name: 'Family A' } });
await expectOk('owner creates a family with their owner record', () => fa.b.commit());
await expectOk('owner reads their family', () => getDoc(doc(A.db, 'families', fa.fid)).then(s => { if (!s.exists()) throw new Error('missing'); }));
await expectOk('owner renames their family', () => updateDoc(doc(A.db, 'families', fa.fid), { name: 'Family A renamed' }));
await expectDenied('owner cannot hand the family to someone else here', () => updateDoc(doc(A.db, 'families', fa.fid), { ownerUid: B.uid }));
await expectDenied('owner cannot change the plan or size', () => updateDoc(doc(A.db, 'families', fa.fid), { maxMembers: 100 }));

await expectDenied('another person cannot read the family', () => getDoc(doc(B.db, 'families', fa.fid)));
await expectDenied('another person cannot read its members', () => getDoc(doc(B.db, 'families', fa.fid, 'members', A.uid)));
await expectDenied('another person cannot read the owner\'s pointer', () => getDoc(doc(B.db, 'users', A.uid)));
await expectDenied('another person cannot rename the family', () => updateDoc(doc(B.db, 'families', fa.fid), { name: 'Hacked' }));
await expectDenied('another person cannot make themselves owner of an existing family',
  () => setDoc(doc(B.db, 'families', fa.fid, 'members', B.uid), { uid: B.uid, role: 'owner', displayName: 'B', email: 'b@example.com', joinedAt: serverTimestamp(), personId: null }));
await expectDenied('another person cannot point their account at someone else\'s pointer', () => setDoc(doc(B.db, 'users', A.uid), { familyId: 'x' }));

await expectDenied('a family cannot be created with a bigger size', () => familyBatch(B, { family: { maxMembers: 50 } }).b.commit());
await expectDenied('a family cannot be created for someone else', () => familyBatch(B, { family: { ownerUid: A.uid } }).b.commit());
await expectDenied('a family cannot be created without its owner record', () => {
  const fref = doc(collection(B.db, 'families'));
  return setDoc(fref, { name: 'Lonely', ownerUid: B.uid, code: 'ABC234', plan: 'beta', maxMembers: 8, createdAt: serverTimestamp(), consent: { by: B.uid, at: serverTimestamp(), version: 1 } });
});
await expectDenied('a family cannot carry extra fields', () => familyBatch(B, { family: { secret: 'x' } }).b.commit());
await expectOk('the second person creates their own family', () => familyBatch(B, { family: { name: 'Family B' } }).b.commit());

// ---------- Invites and joining (joiners wait for approval) ----------
const C = await person('C', `c${stamp}@example.com`);
const D = await person('D', `d${stamp}@example.com`);
const E = await person('E', `e${stamp}@example.com`);
const invite = (p, token, over = {}) => setDoc(doc(p.db, 'families', fa.fid, 'invites', token), Object.assign({
  role: 'parent', familyName: 'Family A', createdBy: p.uid, createdAt: serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 7 * 864e5), usedBy: null,
}, over));
function joinBatch(p, token, opts = {}) {
  const b = writeBatch(p.db);
  b.set(doc(p.db, 'families', fa.fid, 'members', p.uid), { uid: p.uid, role: opts.role || 'pending', requested: opts.requested || 'parent', displayName: 'Joiner', email: 'j@example.com', joinedAt: serverTimestamp(), personId: null, invite: token });
  b.update(doc(p.db, 'families', fa.fid, 'invites', token), { usedBy: p.uid, usedAt: serverTimestamp() });
  if (!opts.noCount) b.update(doc(p.db, 'families', fa.fid), { memberCount: increment(1) });
  b.set(doc(p.db, 'users', p.uid), { familyId: fa.fid, displayName: 'Joiner', email: 'j@example.com', createdAt: serverTimestamp() });
  return b.commit();
}
await expectOk('owner creates an invite link', () => invite(A, 'tokenAAAAAAAAAAAAAAAAAA1'));
await expectDenied('invites cannot make owners', () => invite(A, 'tokenAAAAAAAAAAAAAAAAAA2', { role: 'owner' }));
await expectDenied('an invite cannot last longer than about a week', () => invite(A, 'tokenAAAAAAAAAAAAAAAAAA3', { expiresAt: Timestamp.fromMillis(Date.now() + 30 * 864e5) }));
await expectDenied('someone outside cannot make invites', () => invite(C, 'tokenCCCCCCCCCCCCCCCCCCC1'));
await expectOk('a person with the link can read that invite', () => getDoc(doc(C.db, 'families', fa.fid, 'invites', 'tokenAAAAAAAAAAAAAAAAAA1')));
await expectDenied('a person with the link cannot list all invites', () => getDocs(collection(C.db, 'families', fa.fid, 'invites')));
await expectDenied('joining cannot skip approval (role parent)', () => joinBatch(C, 'tokenAAAAAAAAAAAAAAAAAA1', { role: 'parent' }));
await expectDenied('joining must add one to the head count', () => joinBatch(C, 'tokenAAAAAAAAAAAAAAAAAA1', { noCount: true }));
await expectDenied('joining needs a real invite', () => joinBatch(C, 'tokenNOPENOPENOPENOPENOPE'));
await expectOk('a person joins with the invite and waits', () => joinBatch(C, 'tokenAAAAAAAAAAAAAAAAAA1'));
await expectDenied('a used invite cannot be used again', () => joinBatch(D, 'tokenAAAAAAAAAAAAAAAAAA1'));
await expectOk('owner makes an invite that has already expired (test)', () => invite(A, 'tokenAAAAAAAAAAAAAAAAAA4', { expiresAt: Timestamp.fromMillis(Date.now() - 1000) }));
await expectDenied('an expired invite cannot be used', () => joinBatch(D, 'tokenAAAAAAAAAAAAAAAAAA4'));
await expectOk('owner cancels an invite', () => deleteDoc(doc(A.db, 'families', fa.fid, 'invites', 'tokenAAAAAAAAAAAAAAAAAA4')));

// ---------- Records and roles ----------
const recRef = (p, store, id) => doc(p.db, 'families', fa.fid, 'records', `${store}~${id}`);
const MONEY = ['accounts', 'entries', 'goals', 'ledger', 'chores', 'rewards'];
const rec = (store, id, owner, updatedAt, extra = {}) => Object.assign({ store, id, owner, money: MONEY.includes(store), updatedAt, by: 'x', deleted: false, json: JSON.stringify({ id, owner, updatedAt }), syncAt: serverTimestamp() }, extra);
const T = '2026-11-15T10:00:00.000Z';
await expectOk('owner adds records for two children and the school calendar', async () => {
  await setDoc(recRef(A, 'people', 'kidA'), rec('people', 'kidA', 'kidA', T));
  await setDoc(recRef(A, 'people', 'kidB'), rec('people', 'kidB', 'kidB', T));
  await setDoc(recRef(A, 'tasks', 'tA'), rec('tasks', 'tA', 'kidA', T));
  await setDoc(recRef(A, 'tasks', 'tB'), rec('tasks', 'tB', 'kidB', T));
  await setDoc(recRef(A, 'activities', 'aB'), rec('activities', 'aB', 'kidB', T));
  await setDoc(recRef(A, 'accounts', 'mA'), rec('accounts', 'mA', 'kidA', T));
  await setDoc(recRef(A, 'terms', 'term1'), rec('terms', 'term1', '_family', T));
});
await expectDenied('a waiting person cannot read family data', () => getDoc(recRef(C, 'tasks', 'tA')));
await expectDenied('a waiting person cannot add family data', () => setDoc(recRef(C, 'tasks', 'tX'), rec('tasks', 'tX', 'kidA', T)));
await expectDenied('a waiting person cannot approve themselves', () => updateDoc(doc(C.db, 'families', fa.fid, 'members', C.uid), { role: 'parent' }));
await expectDenied('nobody can be made owner', () => updateDoc(doc(A.db, 'families', fa.fid, 'members', C.uid), { role: 'owner' }));
await expectOk('owner approves them as a carer for one child', () => updateDoc(doc(A.db, 'families', fa.fid, 'members', C.uid), { role: 'carer', kids: ['kidA'] }));
const carerQuery = () => getDocs(query(collection(C.db, 'families', fa.fid, 'records'), where('money', '==', false), where('owner', 'in', ['kidA'])));
await expectOk('carer reads their child\'s non-money items', () => carerQuery().then(q => { if (!q.docs.some(d => d.id === 'tasks~tA')) throw new Error('missing'); }));
await expectOk('carer reads the school calendar', () => getDoc(recRef(C, 'terms', 'term1')));
await expectDenied('carer cannot read another child\'s items', () => getDoc(recRef(C, 'tasks', 'tB')));
await expectDenied('carer cannot read money', () => getDoc(recRef(C, 'accounts', 'mA')));
await expectDenied('carer cannot read everything at once', () => getDocs(collection(C.db, 'families', fa.fid, 'records')));
await expectOk('carer ticks off their child\'s task', () => setDoc(recRef(C, 'tasks', 'tA'), rec('tasks', 'tA', 'kidA', '2026-11-15T11:00:00.000Z')));
await expectDenied('carer cannot add activities', () => setDoc(recRef(C, 'activities', 'aX'), rec('activities', 'aX', 'kidA', T)));
await expectDenied('a carer cannot manage people', () => updateDoc(doc(C.db, 'families', fa.fid, 'members', A.uid), { displayName: 'X' }));

// A child's username login (made through a second connection, as the app does)
const K = await person('K', `u-abc234-kid-${stamp}@example.com`);
const addKid = (by, extra = {}) => {
  const b = writeBatch(by.db);
  b.set(doc(by.db, 'families', fa.fid, 'members', K.uid), Object.assign({ uid: K.uid, role: 'child_limited', displayName: 'Kid A', email: '', joinedAt: serverTimestamp(), personId: 'kidA', username: 'kida', kids: [], siblings: false, money: false, createdBy: by.uid }, extra));
  b.set(doc(by.db, 'logins', 'ABC234-kida'), { email: 'k@example.com', familyId: fa.fid, uid: K.uid });
  b.update(doc(by.db, 'families', fa.fid), { memberCount: increment(1) });
  return b.commit();
};
await expectDenied('a carer cannot add a username login', () => addKid(C));
await expectDenied('a child login must say which child it is', () => addKid(A, { personId: null }));
await expectOk('owner adds a username login for a child', () => addKid(A));
await expectOk('anyone can look up a family username (to sign in)', async () => {
  const anon = initializeApp(cfg, 'anon'); const db = getFirestore(anon); connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const d = await getDoc(doc(db, 'logins', 'ABC234-kida')); if (!d.exists()) throw new Error('missing');
});
const kidQuery = (extra = []) => getDocs(query(collection(K.db, 'families', fa.fid, 'records'), ...extra, where('owner', 'in', ['kidA', '_family'])));
await expectOk('child reads their own items (money hidden)', () => kidQuery([where('money', '==', false)]).then(q => { if (!q.docs.some(d => d.id === 'tasks~tA')) throw new Error('missing'); }));
await expectDenied('child with money hidden cannot read their money', () => getDoc(recRef(K, 'accounts', 'mA')));
await expectDenied('child cannot read a sibling\'s task', () => getDoc(recRef(K, 'tasks', 'tB')));
await expectDenied('child cannot read a sibling\'s activities unless allowed', () => getDoc(recRef(K, 'activities', 'aB')));
await expectOk('owner allows siblings\' activities and money', () => updateDoc(doc(A.db, 'families', fa.fid, 'members', K.uid), { siblings: true, money: true }));
await expectOk('child now reads a sibling\'s activity', () => getDoc(recRef(K, 'activities', 'aB')));
await expectOk('child now reads their own money', () => getDoc(recRef(K, 'accounts', 'mA')));
await expectDenied('child still cannot read a sibling\'s task', () => getDoc(recRef(K, 'tasks', 'tB')));
await expectOk('limited child ticks off own task', () => setDoc(recRef(K, 'tasks', 'tA'), rec('tasks', 'tA', 'kidA', '2026-11-15T12:00:00.000Z')));
await expectOk('limited child adds own homework', () => setDoc(recRef(K, 'tasks', 'tK'), rec('tasks', 'tK', 'kidA', T)));
await expectDenied('limited child cannot add homework for a sibling', () => setDoc(recRef(K, 'tasks', 'tK2'), rec('tasks', 'tK2', 'kidB', T)));
await expectDenied('limited child cannot change a reminder', () => setDoc(recRef(K, 'reminders', 'r1'), rec('reminders', 'r1', 'kidA', T)));
await expectDenied('limited child cannot move a record to another child', () => setDoc(recRef(K, 'tasks', 'tA'), rec('tasks', 'tA', 'kidB', '2026-11-15T13:00:00.000Z')));
await expectOk('owner switches the child to view only', () => updateDoc(doc(A.db, 'families', fa.fid, 'members', K.uid), { role: 'child_view' }));
await expectDenied('view-only child cannot tick off', () => setDoc(recRef(K, 'tasks', 'tA'), rec('tasks', 'tA', 'kidA', '2026-11-15T14:00:00.000Z')));

// Ownership rules for records
await expectDenied('an older change cannot overwrite a newer one', () => setDoc(recRef(A, 'tasks', 'tA'), rec('tasks', 'tA', 'kidA', '2026-11-15T09:00:00.000Z')));
await expectDenied('school dates must belong to the family', () => setDoc(recRef(A, 'terms', 'term2'), rec('terms', 'term2', 'kidA', T)));
await expectDenied('money flag must match the kind of record', () => setDoc(recRef(A, 'accounts', 'mX'), rec('accounts', 'mX', 'kidA', T, { money: false })));
await expectDenied('unknown kinds of record are refused', () => setDoc(recRef(A, 'secrets', 's1'), rec('secrets', 's1', 'kidA', T)));
await expectDenied('a parent cannot delete records', () => deleteDoc(recRef(C, 'tasks', 'tA')));
await expectDenied('someone outside cannot read family data', () => getDoc(recRef(E, 'terms', 'term1')));

// Removing people and the 8-person limit
await expectOk('owner makes the carer a parent', () => updateDoc(doc(A.db, 'families', fa.fid, 'members', C.uid), { role: 'parent', kids: [] }));
await expectDenied('a parent cannot remove the owner', () => deleteDoc(doc(C.db, 'families', fa.fid, 'members', A.uid)));
await expectOk('owner removes the child login', async () => {
  const b = writeBatch(A.db);
  b.delete(doc(A.db, 'families', fa.fid, 'members', K.uid)); b.delete(doc(A.db, 'logins', 'ABC234-kida'));
  b.update(doc(A.db, 'families', fa.fid), { memberCount: increment(-1) });
  await b.commit();
});
await expectDenied('a removed child can no longer read anything', () => getDoc(recRef(K, 'terms', 'term1')));
await expectOk('owner sets the head count to the limit (test)', () => updateDoc(doc(A.db, 'families', fa.fid), { memberCount: 8 }));
await expectOk('owner makes another invite', () => invite(A, 'tokenAAAAAAAAAAAAAAAAAA5'));
await expectDenied('nobody can join a full family', () => joinBatch(E, 'tokenAAAAAAAAAAAAAAAAAA5'));
await expectDenied('the head count cannot go past 8', () => updateDoc(doc(A.db, 'families', fa.fid), { memberCount: 9 }));

// ---------- Deleting the family ----------
await expectDenied('a parent cannot delete the family', () => deleteDoc(doc(C.db, 'families', fa.fid)));
await expectDenied('the owner cannot delete their own record while the family exists', () => deleteDoc(doc(A.db, 'families', fa.fid, 'members', A.uid)));
await expectOk('owner deletes all records, invites, people and the family', async () => {
  const recs = await getDocs(collection(A.db, 'families', fa.fid, 'records'));
  for (const d of recs.docs) await deleteDoc(d.ref);
  for (const d of (await getDocs(collection(A.db, 'families', fa.fid, 'invites'))).docs) await deleteDoc(d.ref);
  for (const d of (await getDocs(collection(A.db, 'families', fa.fid, 'members'))).docs) if (d.id !== A.uid) await deleteDoc(d.ref);
  await deleteDoc(doc(A.db, 'families', fa.fid));
  await deleteDoc(doc(A.db, 'families', fa.fid, 'members', A.uid));
  await deleteDoc(doc(A.db, 'users', A.uid));
});
await expectDenied('the former parent can no longer read anything', () => getDoc(recRef(C, 'terms', 'term1')));

console.log(failed ? `${failed} rule check(s) failed` : 'All rule checks passed');
process.exit(failed ? 1 : 0);
