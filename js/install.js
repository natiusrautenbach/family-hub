/* Herding Cats · Copyright (c) 2026 Natius. All rights reserved. See LICENSE. */
/* Herding Cats · the Install app button
   Shown in the browser (never in the installed app), from the sign-in screen onwards.
   Android and computers: one tap, using the browser's own install prompt.
   iPhone and iPad: a short guide with pictures (Share › Add to Home Screen). */
(function () {
  'use strict';
  const FH = (window.FH = window.FH || {});
  let evt = null, done = false;
  const HIDE = 'hc-install-later';

  const installed = () => done || matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const inFrame = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
  const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const offer = () => !installed() && !inFrame;
  const later = () => { try { return Number(localStorage.getItem(HIDE) || 0) > Date.now(); } catch (e) { return false; } };

  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); evt = e; });
  window.addEventListener('appinstalled', () => { evt = null; done = true; document.querySelectorAll('.instbar').forEach(el => el.remove()); close(); });

  const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 20h14"/></svg>';
  /* The banner. In the app it can be put off for a week; on the sign-in screens it always shows. */
  function bar(inApp) {
    if (!offer() || (inApp && later())) return '';
    return `<div class="instbar" role="region" aria-label="Install the app">
      <span class="instic">${ICON}</span>
      <span class="min0"><b>Install Herding Cats</b><small>Opens like an app and works without internet</small></span>
      <button type="button" class="btn sm pri" data-install="go">Install app</button>
      ${inApp ? '<button type="button" class="instx" data-install="later" aria-label="Not now">×</button>' : ''}
    </div>`;
  }

  /* Small pictures of each iPhone step. */
  const P = {
    share: `<svg viewBox="0 0 220 92" class="instpic" aria-hidden="true"><rect x="1" y="1" width="218" height="90" rx="14" class="ip-bg"/><rect x="14" y="14" width="192" height="26" rx="13" class="ip-bar"/><text x="110" y="31" text-anchor="middle" class="ip-t">herding-cats-1e399.web.app</text>
      <g class="ip-ic"><path d="M30 62l-6 6 6 6M58 62l6 6-6 6"/><rect x="152" y="60" width="16" height="16" rx="3"/><rect x="186" y="60" width="16" height="16" rx="3"/></g>
      <circle cx="110" cy="68" r="17" class="ip-hl"/><g class="ip-ic ip-on"><path d="M110 58v14M105 63l5-5 5 5M103 66h-2v12h18V66h-2"/></g></svg>`,
    add: `<svg viewBox="0 0 220 112" class="instpic" aria-hidden="true"><rect x="1" y="1" width="218" height="110" rx="14" class="ip-bg"/>
      <rect x="12" y="10" width="196" height="26" rx="8" class="ip-bar"/><text x="24" y="27" class="ip-t">Copy</text>
      <rect x="12" y="42" width="196" height="28" rx="8" class="ip-hl2"/><text x="24" y="60" class="ip-t ip-b">Add to Home Screen</text><g class="ip-ic ip-on"><rect x="184" y="48" width="16" height="16" rx="4"/><path d="M192 52v8M188 56h8"/></g>
      <rect x="12" y="76" width="196" height="26" rx="8" class="ip-bar"/><text x="24" y="93" class="ip-t">Add Bookmark</text></svg>`,
    done: `<svg viewBox="0 0 220 70" class="instpic" aria-hidden="true"><rect x="1" y="1" width="218" height="68" rx="14" class="ip-bg"/><text x="20" y="40" class="ip-t">Cancel</text><text x="110" y="40" text-anchor="middle" class="ip-t ip-b">Add to Home Screen</text>
      <rect x="168" y="20" width="40" height="28" rx="14" class="ip-hl2"/><text x="188" y="39" text-anchor="middle" class="ip-t ip-b ip-on2">Add</text></svg>`,
  };
  function sheet() {
    const steps = ios()
      ? [[P.share, 'Tap the <b>Share</b> button', 'In Safari it\'s at the bottom of the screen (on iPad, at the top). In Chrome, tap Share next to the address.'],
         [P.add, 'Tap <b>Add to Home Screen</b>', 'Scroll down the list if you don\'t see it.'],
         [P.done, 'Tap <b>Add</b>', 'Herding Cats appears on your Home Screen. Open it from there and sign in.']]
      : [['', 'Open the browser menu', 'Tap the <b>⋮</b> or <b>…</b> menu, at the top right (or bottom) of the browser.'],
         ['', 'Choose <b>Install app</b>', 'It may be called <b>Add to Home screen</b> or <b>Install Herding Cats</b>.'],
         ['', 'Confirm', 'Herding Cats appears with your apps. Open it from there and sign in.']];
    return `<div class="scrim instscrim" data-install="close"><div class="panel" role="dialog" aria-modal="true" aria-labelledby="inst-h">
      <h2 id="inst-h">Install Herding Cats</h2>
      <p class="small muted" style="margin:6px 0 12px">${ios() ? 'On iPhone and iPad it takes three taps.' : 'Your browser didn\'t offer a one-tap install here, so use its menu.'}</p>
      <ol class="inststeps">${steps.map(([pic, t, d], i) => `<li><span class="instn">${i + 1}</span><div class="min0"><b class="instt">${t}</b><p class="small muted">${d}</p>${pic}</div></li>`).join('')}</ol>
      <div class="actions"><button type="button" class="btn pri" data-install="close">Got it</button></div>
    </div></div>`;
  }
  function close() { document.getElementById('instsheet')?.remove(); }
  async function run() {
    if (evt) {
      const e = evt; e.prompt();
      try { const r = await e.userChoice; if (r.outcome === 'accepted') { evt = null; done = true; document.querySelectorAll('.instbar').forEach(el => el.remove()); } } catch (x) { /* closed */ }
      return;
    }
    close();
    const el = document.createElement('div'); el.id = 'instsheet'; el.className = 'sheet'; el.innerHTML = sheet();
    document.body.appendChild(el);
  }
  document.addEventListener('click', ev => {
    const b = ev.target.closest('[data-install]');
    if (!b) return;
    const a = b.dataset.install;
    if (a === 'go') run();
    else if (a === 'later') { try { localStorage.setItem(HIDE, String(Date.now() + 7 * 864e5)); } catch (e) { /* shows again */ } b.closest('.instbar')?.remove(); }
    else if (a === 'close' && (ev.target === b || b.tagName === 'BUTTON')) close();
  });

  FH.install = { bar, run, installed, offer, ios, get ready() { return !!evt; } };
})();
