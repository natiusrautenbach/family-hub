/* Herding Cats · Copyright (c) 2026 Natius. All rights reserved. See LICENSE. */
/* Herding Cats · money logic
   All amounts are whole cents (R 12,50 is 1250) so sums never drift.
   Pure functions: no screens, no database. */
(function () {
  'use strict';
  const FH = (window.FH = window.FH || {});

  const ZAR = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' });
  const fmt = cents => ZAR.format((cents || 0) / 100);
  const fmtSigned = cents => (cents < 0 ? '−' : '+') + fmt(Math.abs(cents));

  /* Reads amounts the way people type them: 50, 12,50, 12.50, R 1 234,50, R1,234.50.
     Returns cents, or NaN when it isn't an amount. */
  function parseRand(input) {
    let s = String(input ?? '').trim().replace(/^r\s*/i, '').replace(/[\s ']/g, '');
    if (!s) return NaN;
    const neg = s.startsWith('-') || s.startsWith('−');
    s = s.replace(/^[-−+]/, '');
    if (!/^[\d.,]+$/.test(s)) return NaN;
    const lastSep = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
    let whole = s, frac = '';
    if (lastSep >= 0 && s.length - lastSep - 1 <= 2) { whole = s.slice(0, lastSep); frac = s.slice(lastSep + 1); }
    whole = whole.replace(/[.,]/g, '');
    if (!whole && !frac) return NaN;
    const cents = Number(whole || '0') * 100 + Number((frac + '00').slice(0, 2));
    return Number.isFinite(cents) ? (neg ? -cents : cents) : NaN;
  }
  /* Shows cents in an input as 12,50 (or 12 when there are no cents). */
  const toInput = cents => { const r = Math.abs(cents) / 100; const t = Number.isInteger(r) ? String(r) : r.toFixed(2).replace('.', ','); return (cents < 0 ? '-' : '') + t; };

  const balanceOf = (account, entries) => entries.filter(e => e.account === account.id).reduce((n, e) => n + (e.amount || 0), 0);
  const paidOf = l => (l.payments || []).reduce((n, p) => n + (p.amount || 0), 0);
  const leftOf = l => Math.max(0, (l.amount || 0) - paidOf(l));

  /* Savings goals share an account's balance by percentage (two decimals). */
  const shareOf = (balance, pct) => Math.round(balance * (pct || 0) / 100);
  const pctRound = p => Math.round(p * 100) / 100;
  /* Gives one goal just enough to finish it and scales the others down to fit. */
  function completeFirst(balance, goals, id) {
    const g = goals.find(x => x.id === id);
    if (!g || balance <= 0) return goals.map(x => ({ id: x.id, pct: x.pct || 0 }));
    const need = Math.min(100, Math.ceil(g.target / balance * 10000) / 100);
    const others = goals.filter(x => x.id !== id);
    const sum = others.reduce((n, x) => n + (x.pct || 0), 0);
    const room = Math.max(0, 100 - need);
    const k = sum > room && sum > 0 ? room / sum : 1;
    return goals.map(x => ({ id: x.id, pct: x.id === id ? need : Math.floor((x.pct || 0) * k * 100) / 100 }));
  }
  function splitEvenly(goals) {
    if (!goals.length) return [];
    const each = Math.floor(10000 / goals.length) / 100;
    return goals.map((x, i) => ({ id: x.id, pct: i === 0 ? pctRound(100 - each * (goals.length - 1)) : each }));
  }

  FH.money = { fmt, fmtSigned, parseRand, toInput, balanceOf, paidOf, leftOf, shareOf, pctRound, completeFirst, splitEvenly };
})();
