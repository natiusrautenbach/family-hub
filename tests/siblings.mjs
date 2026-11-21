// Herding Cats · Copyright (c) 2026 Natius. All rights reserved. See LICENSE.
// A child sees their siblings' activities (a) when allowed from the start and (b) when allowed
// after signing in; never a parent's own items. Also: shared reminders and the sign-in link.
import { chromium } from 'playwright';

const URL = 'http://127.0.0.1:5000/';
let failed = 0;
const ok = (c, n) => { if (!c) failed++; console.log(`${c ? 'PASS' : 'FAIL'} siblings: ${n}`); };
/* Settings sections start folded; tests open them all. */
const openSettings = async p => { await p.click('[data-act=nav][data-v=settings] >> visible=true'); await p.waitForSelector('details.sec', { state: 'attached' }); await p.evaluate(() => document.querySelectorAll('details.sec').forEach(d => { d.open = true; })); await p.waitForTimeout(100); };
const browser = await chromium.launch();
async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: 'block' });
  const pg = await ctx.newPage();
  pg.on('console', m => { if (['error', 'warning'].includes(m.type()) && !/Failed to load resource|fonts\.g/.test(m.text())) console.log(`  [${m.type()}] ${m.text().slice(0, 300)}`); });
  pg.on('pageerror', e => console.log('  [pageerror]', e.message));
  return pg;
}
const submit = (pg, f) => pg.click(`[data-gate-form=${f}] button[type=submit]`);
const childLogin = async (pg, code, user) => {
  await pg.goto(URL); await pg.waitForSelector('#g-email', { timeout: 30000 });
  await pg.click('[data-gate=to-username]'); await pg.fill('#g-code', code); await pg.fill('#g-user', user); await pg.fill('#g-pass', 'kitty1234');
  await submit(pg, 'username'); await pg.waitForSelector('.shell', { timeout: 30000 }); await pg.waitForTimeout(4000);
};
const state = pg => pg.evaluate(() => ({ kids: FH.app.S.children.map(c => c.name), people: FH.app.S.people.map(c => c.name), acts: FH.app.S.activities.map(a => a.title), rems: FH.app.S.reminders.map(r => r.title), sync: FH.sync.status(), sess: { role: FH.account.session.role, siblings: FH.account.session.siblings } }));

try {
  const pg = await newPage();
  await pg.goto(URL); await pg.waitForSelector('#g-email', { timeout: 30000 });
  await pg.click('[data-gate=to-signup]'); await pg.fill('#g-name', 'Natius'); await pg.fill('#g-email', 'n@example.com'); await pg.fill('#g-pass', 'password123');
  await submit(pg, 'signup'); await pg.waitForSelector('#g-family'); await pg.fill('#g-family', 'Fam'); await pg.check('#g-consent'); await submit(pg, 'family');
  await pg.waitForSelector('#su-name-0'); await pg.fill('#su-name-0', 'Ava'); await pg.click('[data-act=su-add]'); await pg.fill('#su-name-1', 'Liam');
  await pg.click('[data-act=su-finish]'); await pg.waitForSelector('.kid');
  await pg.evaluate(async () => {
    const [a, l] = FH.app.S.children;
    await FH.data.save('activities', { owner: a.id, title: 'Ava ballet', weekdays: [2], start: '15:00', end: '16:00', place: '' });
    await FH.data.save('activities', { owner: l.id, title: 'Liam hockey', weekdays: [1, 3], start: '15:00', end: '16:00', place: '' });
  });
  // 2.5: the parent is a person too, with an activity only for them and a reminder for everyone
  if (await pg.locator('[data-act=digest-close]').count()) await pg.click('[data-act=digest-close]');
  const adultId = await pg.evaluate(() => FH.app.S.adults[0]?.id);
  ok(!!adultId, 'the owner is a person on the calendar');
  await pg.click('.fab'); await pg.click('[data-act=add-type][data-v=activity]'); await pg.waitForSelector('.f-who');
  ok(await pg.locator('.f-who:checked').count() === 1, 'a new activity starts with one person ticked');
  for (const el of await pg.locator('.f-who:checked').all()) await el.uncheck();
  await pg.check(`.f-who[value="${adultId}"]`); await pg.fill('#f-title', 'Mum gym');
  await pg.click('[data-form=activity] button[type=submit]'); await pg.waitForTimeout(600);
  await pg.click('.fab'); await pg.click('[data-act=add-type][data-v=reminder]'); await pg.waitForSelector('#f-who-all');
  await pg.check('#f-who-all'); await pg.fill('#f-title', 'Family dinner');
  await pg.click('[data-form=reminder] button[type=submit]'); await pg.waitForTimeout(600);
  // Phase 3: drivers on, and an activity for Ava today with a parent driving.
  await pg.evaluate(async adult => {
    await FH.data.save('lifts', { id: 'config', type: 'config', assign: true, drivers: [{ id: adult, name: 'Natius', parent: true, uid: '' }] });
    const ava = FH.app.S.children.find(c => c.name === 'Ava');
    await FH.data.save('activities', { owner: ava.id, title: 'Ava swim', weekdays: [FH.cal.dow(FH.cal.today())], start: '17:00', end: '18:00', place: '', from: FH.cal.today(), dropBy: { all: adult }, pickBy: { all: adult } });
  }, adultId);
  const dinner = await pg.evaluate(() => FH.app.S.reminders.filter(r => r.title === 'Family dinner').map(r => [r.owner, r.group, !!r.adult]));
  ok(dinner.length === 3 && new Set(dinner.map(d => d[1])).size === 1 && dinner.filter(d => d[2]).length === 1, 'a reminder for everyone is one copy per person, in one group');
  await pg.waitForTimeout(3000);
  ok(await pg.evaluate(() => FH.sync.status().waiting) === 0, 'owner has sent everything');
  const code = await pg.evaluate(() => FH.account.session.familyCode);
  const addLogin = async (name, sibs) => {
    if (await pg.locator('[data-act=digest-close]').count()) await pg.click('[data-act=digest-close]');
    await openSettings(pg); await pg.waitForSelector('[data-act=login-add]');
    await pg.click('[data-act=login-add]'); await pg.waitForSelector('[data-form=login]');
    await pg.selectOption('#f-person', { label: name }); await pg.waitForTimeout(200);
    await pg.fill('#f-pass', 'kitty1234'); if (sibs) await pg.check('#f-sibs');
    await pg.click('[data-form=login] button[type=submit]'); await pg.waitForSelector(`#new-login:has-text("${name} can now sign in")`, { timeout: 20000 });
  };

  // (a) allowed from the start
  await addLogin('Ava', true);
  const pa = await newPage();
  await childLogin(pa, code, 'ava');
  let s = await state(pa);
  console.log('  (a) Ava sees:', JSON.stringify(s));
  ok(s.sess.siblings === true, '(a) Ava\'s session says siblings allowed');
  ok(s.acts.includes('Liam hockey'), '(a) Ava sees Liam\'s activity');
  ok(s.kids.includes('Liam'), '(a) Ava sees Liam on the calendar');
  ok(!s.acts.includes('Mum gym'), '(a) Ava does not see a parent\'s own activity');
  ok(!s.people.includes('Natius'), '(a) Ava does not receive the parent person');
  // Phase 3: Ava sees her own lift for today, with the driver's name (parents are hidden from her otherwise).
  ok((await pa.innerText('main')).includes('Natius takes you to Ava swim at 17:00'), '(a) Ava sees who takes her to her activity today');
  ok(s.rems.filter(t => t === 'Family dinner').length === 1, '(a) Ava gets her own copy of the reminder for everyone');
  await pa.click('[data-act=nav][data-v=calendar] >> visible=true'); await pa.waitForTimeout(500);
  ok((await pa.innerText('main')).includes('Liam hockey'), '(a) Liam\'s activity shows on Ava\'s calendar');
  await pa.click('[data-act=nav][data-v=today] >> visible=true'); await pa.waitForTimeout(300);
  console.log('  (a) Ava Today mentions Liam:', (await pa.innerText('main')).includes('Liam'));

  // (b) allowed after signing in
  await addLogin('Liam', false);
  const pl = await newPage();
  // Liam signs in from his sign-in link: the family code and username are filled in.
  const link = await pg.inputValue('#login-link');
  console.log('  (b) link:', link);
  ok(link.endsWith(`?u=${code}.liam`), '(b) the sign-in link names the family code and username');
  await pl.goto(link); await pl.waitForSelector('#g-code', { timeout: 30000 });
  ok(await pl.inputValue('#g-code') === code && await pl.inputValue('#g-user') === 'liam', '(b) the link fills in the code and username');
  ok(await pl.locator('.instbar [data-install=go]').count() === 1, '(b) the sign-in screen offers Install app');
  await pl.fill('#g-pass', 'kitty1234'); await submit(pl, 'username');
  await pl.waitForSelector('.shell', { timeout: 30000 }); await pl.waitForTimeout(4000);
  s = await state(pl);
  console.log('  (b) Liam before:', JSON.stringify(s));
  ok(!s.acts.includes('Ava ballet'), '(b) before: Liam does not see Ava\'s activity');
  const liamUid = await pg.evaluate(() => FH.app.S.members.find(m => m.username === 'liam').uid);
  await pg.click(`[data-act=mem-edit][data-v="${liamUid}"]`); await pg.waitForSelector('[data-form=member]');
  await pg.check('#f-sibs'); await pg.click('[data-form=member] button[type=submit]'); await pg.waitForTimeout(1500);
  await pl.reload(); await pl.waitForTimeout(6000);
  await pl.waitForSelector('.shell', { timeout: 30000 }); await pl.waitForTimeout(4000);
  s = await state(pl);
  console.log('  (b) Liam after reopening:', JSON.stringify(s));
  ok(s.sess.siblings === true, '(b) Liam\'s session now says siblings allowed');
  ok(s.acts.includes('Ava ballet'), '(b) after: Liam sees Ava\'s activity');
  ok(!s.acts.includes('Mum gym'), '(b) after: Liam still does not see a parent\'s own activity');
} catch (e) { failed++; console.log('FAIL siblings: stopped early —', e.message); }
await browser.close();
console.log(failed ? `${failed} sibling check(s) failed` : 'All sibling checks passed');
process.exit(failed ? 1 : 0);
