// Herding Cats · Copyright (c) 2026 Natius. All rights reserved. See LICENSE.
// Permission rule tests, run on GitHub against Firebase's local emulators.
// Each check tries something a person may or may not do and expects the right answer.
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore, connectFirestoreEmulator, doc, collection, writeBatch, getDoc, setDoc, updateDoc, serverTimestamp,
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

console.log(failed ? `${failed} rule check(s) failed` : 'All rule checks passed');
process.exit(failed ? 1 : 0);
