// Herding Cats · Copyright (c) 2026 Natius. All rights reserved. See LICENSE.
// Diagnosis: does a child see their siblings' activities, (a) when allowed from the start
// and (b) when allowed after they have already signed in?
import { chromium } from 'playwright';

const URL = 'http://127.0.0.1:5000/';
let failed = 0;
const ok = (c, n) => { if (!c) failed++; console.log(`${c ? 'PASS' : 'FAIL'} siblings: ${n}`); };
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
const state = pg => pg.evaluate(() => ({ kids: FH.app.S.children.map(c => c.name), acts: FH.app.S.activities.map(a => a.title), sync: FH.sync.status(), sess: { role: FH.account.session.role, siblings: FH.account.session.siblings } }));

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
  await pg.waitForTimeout(3000);
  ok(await pg.evaluate(() => FH.sync.status().waiting) === 0, 'owner has sent everything');
  const code = await pg.evaluate(() => FH.account.session.familyCode);
  const addLogin = async (name, sibs) => {
    if (await pg.locator('[data-act=digest-close]').count()) await pg.click('[data-act=digest-close]');
    await pg.click('[data-act=nav][data-v=settings] >> visible=true'); await pg.waitForSelector('[data-act=login-add]');
    await pg.click('[data-act=login-add]'); await pg.waitForSelector('[data-form=login]');
    await pg.selectOption('#f-person', { label: name }); await pg.waitForTimeout(200);
    await pg.fill('#f-pass', 'kitty1234'); if (sibs) await pg.check('#f-sibs');
    await pg.click('[data-form=login] button[type=submit]'); await pg.waitForSelector('#new-login', { timeout: 20000 });
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
  await pa.click('[data-act=nav][data-v=calendar] >> visible=true'); await pa.waitForTimeout(500);
  ok((await pa.innerText('main')).includes('Liam hockey'), '(a) Liam\'s activity shows on Ava\'s calendar');
  await pa.click('[data-act=nav][data-v=today] >> visible=true'); await pa.waitForTimeout(300);
  console.log('  (a) Ava Today mentions Liam:', (await pa.innerText('main')).includes('Liam'));

  // (b) allowed after signing in
  await addLogin('Liam', false);
  const pl = await newPage();
  await childLogin(pl, code, 'liam');
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
} catch (e) { failed++; console.log('FAIL siblings: stopped early —', e.message); }
await browser.close();
console.log(failed ? `${failed} sibling check(s) failed` : 'All sibling checks passed');
process.exit(failed ? 1 : 0);
