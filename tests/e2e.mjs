// Herding Cats · Copyright (c) 2026 Natius. All rights reserved. See LICENSE.
// Screen tests, run on GitHub: the real app with the real Firebase code, talking to
// Firebase's local emulators (served at http://127.0.0.1:5000 by the hosting emulator).
import { chromium } from 'playwright';

const URL = 'http://127.0.0.1:5000/';
let failed = 0;
const ok = (cond, name) => { if (!cond) failed++; console.log(`${cond ? 'PASS' : 'FAIL'} app: ${name}`); };
const errors = [];

const browser = await chromium.launch();
async function newPage(width = 390) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errors.push(`pageerror ${e.message}`));
  pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|fonts\.g/.test(m.text())) errors.push(`console ${m.text()}`); });
  return { ctx, pg };
}
const submit = (pg, form) => pg.click(`[data-gate-form=${form}] button[type=submit]`);
async function signUp(pg, name, email, family) {
  await pg.click('[data-gate=to-signup]');
  await pg.fill('#g-name', name); await pg.fill('#g-email', email); await pg.fill('#g-pass', 'password123');
  await submit(pg, 'signup');
  await pg.waitForSelector('#g-family', { timeout: 20000 });
  if (family) { await pg.fill('#g-family', family); await pg.check('#g-consent'); await submit(pg, 'family'); }
}

try {
  const { pg } = await newPage();
  await pg.goto(URL);
  await pg.waitForSelector('#g-email', { timeout: 30000 });
  ok(await pg.locator('.gbtn').count() === 1, 'sign-in screen with Google button');

  await pg.fill('#g-email', 'nobody@example.com'); await pg.fill('#g-pass', 'wrongpass1'); await submit(pg, 'signin');
  await pg.waitForFunction(() => document.querySelector('#gate-err')?.textContent.trim(), null, { timeout: 15000 });
  ok((await pg.innerText('#gate-err')).includes("don't match"), 'unknown account gives a plain message');

  await signUp(pg, 'Natius', 'natius@example.com', null);
  ok((await pg.innerText('.hero')).includes('natius@example.com'), 'new account goes to Create your family');
  await pg.fill('#g-family', 'The Rautenbachs'); await submit(pg, 'family');
  ok((await pg.innerText('#gate-err')).includes('Tick the box'), 'consent is required');
  ok(await pg.inputValue('#g-family') === 'The Rautenbachs', 'family name kept after an error');
  await pg.check('#g-consent'); await submit(pg, 'family');
  await pg.waitForSelector('#su-name-0', { timeout: 20000 });
  ok(await pg.inputValue('#su-family') === 'The Rautenbachs', 'family created in Firebase; setup opens');
  await pg.fill('#su-name-0', 'Ava'); await pg.click('[data-act=su-finish]'); await pg.waitForSelector('.kid');

  await pg.reload(); await pg.waitForSelector('.shell', { timeout: 30000 }); await pg.waitForTimeout(500);
  ok(await pg.locator('.kid').count() === 1, 'reload: still signed in, child still there');
  if (await pg.locator('[data-act=digest-close]').count()) await pg.click('[data-act=digest-close]');

  await pg.click('[data-act=nav][data-v=settings] >> visible=true');
  const acc = await pg.innerText('#account');
  ok(acc.includes('natius@example.com') && acc.toUpperCase().includes('FAMILY ADMINISTRATOR'), 'account card shows email and role');

  await pg.click('[data-act=acct-signout]'); await pg.waitForSelector('#g-email', { timeout: 20000 });
  ok(await pg.locator('.shell').count() === 0, 'sign out returns to sign-in');
  await pg.fill('#g-email', 'natius@example.com'); await pg.fill('#g-pass', 'password123'); await submit(pg, 'signin');
  await pg.waitForSelector('.shell', { timeout: 20000 }); await pg.waitForTimeout(300);
  ok(await pg.evaluate(() => FH.app.S.children.map(c => c.name).join()) === 'Ava', 'sign back in: family found again');

  // ---------- Two devices: invite, join, sync both ways, offline ----------
  if (await pg.locator('[data-act=digest-close]').count()) await pg.click('[data-act=digest-close]');
  await pg.click('[data-act=nav][data-v=settings] >> visible=true');
  await pg.waitForSelector('#people .set', { timeout: 15000 });
  await pg.click('[data-act=inv-new]'); await pg.waitForSelector('#inv-link', { timeout: 15000 });
  const link = await pg.inputValue('#inv-link');
  ok(link.includes('?join='), 'owner makes an invite link');

  const { ctx: ctxW, pg: pw } = await newPage();
  await pw.goto(link); await pw.waitForSelector('#g-email', { timeout: 30000 });
  await pw.click('[data-gate=to-signup]'); await pw.fill('#g-name', 'Wife'); await pw.fill('#g-email', 'wife@example.com'); await pw.fill('#g-pass', 'password123');
  await submit(pw, 'signup'); await pw.waitForSelector('[data-gate-form=join]', { timeout: 20000 });
  ok((await pw.innerText('.hero')).includes('Join The Rautenbachs'), 'invite opens the Join screen');
  await submit(pw, 'join'); await pw.waitForSelector('[data-gate=pending-check]', { timeout: 20000 });
  ok((await pw.innerText('.hero')).includes('Waiting for approval'), 'joiner waits for approval');
  await pg.click('[data-act=nav][data-v=settings] >> visible=true');
  await pg.waitForSelector('[data-act=mem-approve]', { timeout: 20000 });
  await pg.click('[data-act=mem-approve]'); await pg.waitForSelector('[data-form=member]');
  await pg.click('[data-form=member] button[type=submit]');
  await pg.waitForFunction(() => (FH.app.S.members || []).some(m => m.name === 'Wife' && m.role === 'parent'), null, { timeout: 15000 }).catch(() => {});
  ok(await pg.evaluate(() => (FH.app.S.members || []).some(m => m.name === 'Wife' && m.role === 'parent')), 'owner approves her as a parent');
  await pw.click('[data-gate=pending-check]');
  await pw.waitForSelector('.shell', { timeout: 30000 });
  await pw.waitForFunction(() => FH.app.S.children.some(c => c.name === 'Ava'), null, { timeout: 20000 }).catch(() => {});
  ok(await pw.evaluate(() => FH.app.S.children.map(c => c.name).join()) === 'Ava', "wife's phone receives the family's data");
  if (await pw.locator('[data-act=digest-close]').count()) await pw.click('[data-act=digest-close]');

  const addReminder = async (p, title) => { await p.click('[data-act=nav][data-v=today] >> visible=true'); await p.click('.fab'); await p.click('[data-act=add-type][data-v=reminder]'); await p.fill('#f-title', title); await p.fill('#f-date', '2026-11-20'); await p.click('.panel button[type=submit]'); await p.waitForTimeout(400); };
  await addReminder(pw, 'Swimming gala');
  const arrived = async (p, title) => p.waitForFunction(t => FH.app.S.reminders.some(r => r.title === t), title, { timeout: 20000 }).then(() => true).catch(() => false);
  ok(await arrived(pg, 'Swimming gala'), "owner's phone receives the wife's reminder live");
  await addReminder(pg, 'Cricket form');
  ok(await arrived(pw, 'Cricket form'), "wife's phone receives the owner's reminder live");

  await ctxW.setOffline(true); await pw.waitForTimeout(500);
  await addReminder(pw, 'Written offline');
  ok(await pw.evaluate(() => FH.sync.status().waiting) > 0, 'offline change waits in the outbox');
  ok(!(await pg.evaluate(() => FH.app.S.reminders.some(r => r.title === 'Written offline'))), 'not yet on the other phone while offline');
  await ctxW.setOffline(false);
  ok(await arrived(pg, 'Written offline'), 'back online: the waiting change arrives');
  await pw.waitForFunction(() => FH.sync.status().waiting === 0, null, { timeout: 20000 }).catch(() => {});
  ok(await pw.evaluate(() => FH.sync.status().waiting) === 0, 'outbox empties once sent');

  await pg.click('[data-act=nav][data-v=settings] >> visible=true');
  await pg.waitForFunction(() => (document.querySelector('#people') || {}).innerText?.includes('Wife'), null, { timeout: 15000 }).catch(() => {});
  ok((await pg.innerText('#people')).includes('Wife'), 'family card lists both people');
  await pg.evaluate(() => { const r = FH.app.S.reminders.find(x => x.title === 'Swimming gala'); FH.app.S.sheet = { kind: 'reminder', id: r.id }; FH.app.render(); });
  ok((await pg.innerText('#sheet')).includes('Last changed by Wife'), 'form shows who last changed it');
  await pg.keyboard.press('Escape');

  // ---------- A child's username login sees only their own items ----------
  await pg.click('[data-act=nav][data-v=settings] >> visible=true');
  await pg.click('[data-act=child-add] >> visible=true'); await pg.fill('#f-name', 'Liam'); await pg.click('.panel button[type=submit]'); await pg.waitForTimeout(400);
  const addTask = async (who, title) => { await pg.click('[data-act=nav][data-v=tasks] >> visible=true'); await pg.click('.fab'); await pg.selectOption('#f-child', { label: who }); await pg.fill('#f-title', title); await pg.fill('#f-date', '2026-11-25'); await pg.click('.panel button[type=submit]'); await pg.waitForTimeout(400); };
  await addTask('Ava', 'Ava maths'); await addTask('Liam', 'Liam spelling');
  await pg.click('[data-act=nav][data-v=settings] >> visible=true');
  await pg.waitForSelector('[data-act=login-add]'); await pg.click('[data-act=login-add]'); await pg.waitForSelector('[data-form=login]');
  await pg.selectOption('#f-person', { label: 'Ava' }); await pg.waitForTimeout(150);
  await pg.fill('#f-pass', 'kitty1234'); await pg.uncheck('#f-money');
  await pg.click('[data-form=login] button[type=submit]');
  await pg.waitForSelector('#new-login', { timeout: 20000 });
  const code = await pg.evaluate(() => FH.account.session.familyCode);
  ok((await pg.innerText('#new-login')).includes('ava'), 'owner adds a username for Ava');
  ok(await pg.evaluate(() => FH.account.session.uid === FH.cloud.user().uid), 'owner is still signed in after adding it');

  const { pg: pk } = await newPage();
  await pk.goto(URL); await pk.waitForSelector('#g-email', { timeout: 30000 });
  await pk.click('[data-gate=to-username]'); await pk.fill('#g-code', code); await pk.fill('#g-user', 'ava'); await pk.fill('#g-pass', 'kitty1234');
  await submit(pk, 'username'); await pk.waitForSelector('.shell', { timeout: 30000 });
  await pk.waitForFunction(() => FH.app.S.tasks.length > 0, null, { timeout: 20000 }).catch(() => {});
  ok(await pk.evaluate(() => FH.account.session.role) === 'child_view', 'Ava signs in with the family username');
  ok(await pk.evaluate(() => FH.app.S.children.map(c => c.name).join()) === 'Ava', "Ava's phone only has Ava");
  ok(await pk.evaluate(() => FH.app.S.tasks.map(t => t.title).join()) === 'Ava maths', "Ava's phone only has Ava's tasks");
  ok(await pk.evaluate(() => FH.app.S.reminders.length) > 0 && !(await pk.locator('.tabbar [data-v=money]').count()), 'Ava sees her reminders, and no Money tab');
  ok(await pk.evaluate(() => FH.app.S.accounts.length) === 0, 'no money data on her phone');

  // ---------- Removing someone ----------
  const wifeUid = await pg.evaluate(() => FH.app.S.members.find(m => m.name === 'Wife').uid);
  await pg.click(`[data-act=mem-edit][data-v="${wifeUid}"]`); await pg.waitForSelector('[data-form=member]');
  await pg.click('[data-act=mem-remove]'); await pg.click('[data-act=mem-remove]');
  await pg.waitForFunction(() => !FH.app.S.members.some(m => m.name === 'Wife'), null, { timeout: 15000 }).catch(() => {});
  ok(!(await pg.evaluate(() => FH.app.S.members.some(m => m.name === 'Wife'))), 'owner removes the wife');
  await pw.reload();
  await pw.waitForSelector('#g-family, #g-email', { timeout: 30000 }).catch(() => {});
  ok(await pw.locator('#g-family').count() === 1 && await pw.evaluate(async () => (await indexedDB.databases()).every(d => !d.name.startsWith('hc-'))), "removed person loses access and the family's data leaves her phone");

  // ---------- Ava's home page ----------
  await pk.reload(); await pk.waitForSelector('.shell', { timeout: 30000 }); await pk.waitForTimeout(500);
  if (await pk.locator('[data-act=digest-close]').count()) await pk.click('[data-act=digest-close]');
  await pk.click('[data-act=nav][data-v=today] >> visible=true');
  ok((await pk.innerText('main')).includes('Hi Ava'), "Ava's home page greets her");
  ok(await pk.evaluate(() => [...document.querySelectorAll('[data-act=child-edit],[data-act=task-edit],[data-act=add]')].every(e => getComputedStyle(e).display === 'none')), 'no editing buttons for a view-only child');

  const { pg: pc } = await newPage();
  await pc.goto(link); await pc.waitForSelector('#g-email', { timeout: 30000 });
  await pc.click('[data-gate=to-signup]'); await pc.fill('#g-name', 'Stranger'); await pc.fill('#g-email', 'stranger@example.com'); await pc.fill('#g-pass', 'password123');
  await submit(pc, 'signup'); await pc.waitForSelector('[data-gate=join-skip]', { timeout: 20000 });
  ok((await pc.innerText('.solo')).includes('already been used'), 'a used invite link is refused');

  const { pg: pg2 } = await newPage(1280);
  await pg2.goto(URL); await pg2.waitForSelector('#g-email', { timeout: 30000 });
  await signUp(pg2, 'Sam', 'sam@example.com', 'Other family');
  await pg2.waitForSelector('#su-name-0', { timeout: 20000 });
  ok(await pg2.evaluate(() => FH.app.S.children.length) === 0, 'another person gets their own empty family');

  await pg2.evaluate(() => FH.account.signOut()); await pg2.waitForSelector('#g-email', { timeout: 20000 });
  await pg2.click('[data-gate=to-reset]'); await pg2.fill('#g-email', 'sam@example.com'); await submit(pg2, 'reset');
  await pg2.waitForSelector('#gate-note', { timeout: 15000 });
  ok((await pg2.innerText('#gate-note')).includes('reset link'), 'password reset email requested');
  // ---------- The owner deletes the family ----------
  if (await pg.locator('.panel').count()) await pg.keyboard.press('Escape');
  await pg.click('[data-act=nav][data-v=settings] >> visible=true');
  await pg.click('[data-act=del-fam]'); await pg.fill('#f-confirm', 'The Rautenbachs'); await pg.click('[data-form=delfam] button[type=submit]');
  await pg.waitForSelector('#g-email', { timeout: 60000 });
  ok(await pg.locator('.shell').count() === 0, 'owner deletes the family and is signed out');
  await pk.reload(); await pk.waitForSelector('#g-email, #g-family', { timeout: 30000 }).catch(() => {});
  ok(await pk.locator('.shell').count() === 0, "Ava's phone loses access after the family is deleted");
  const { pg: pz } = await newPage();
  await pz.goto(URL); await pz.waitForSelector('#g-email', { timeout: 30000 });
  await pz.click('[data-gate=to-username]'); await pz.fill('#g-code', code); await pz.fill('#g-user', 'ava'); await pz.fill('#g-pass', 'kitty1234'); await submit(pz, 'username');
  await pz.waitForFunction(() => document.querySelector('#gate-err')?.textContent.trim(), null, { timeout: 15000 }).catch(() => {});
  ok((await pz.innerText('#gate-err')).includes("don't match"), "Ava's username is gone too");
} catch (e) {
  failed++; console.log('FAIL app: test stopped early —', e.message);
}
ok(errors.length === 0, `no errors on the page${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(failed ? `${failed} app check(s) failed` : 'All app checks passed');
process.exit(failed ? 1 : 0);
