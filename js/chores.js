/* Family Hub · Copyright (c) 2026 Natius. All rights reserved. See LICENSE. */
/* Family Hub · chores logic
   Frequency = how often a chore must be done. Reward period = how often the
   reward is approved (a daily chore can be paid weekly or monthly). Each
   occurrence is marked done or not done; the period's reward is either paid
   for what was done, or only when everything was done. Amounts in cents. */
(function () {
  'use strict';
  const FH = (window.FH = window.FH || {});
  const C = FH.cal;

  const FREQS = ['Daily', 'Weekly', 'Every 2 weeks', 'Monthly', 'Once'];
  const PER_OK = { Daily: ['Daily', 'Weekly', 'Monthly'], Weekly: ['Weekly', 'Monthly'], 'Every 2 weeks': ['Monthly'], Monthly: ['Monthly'], Once: ['Once'] };
  const PER_LBL = { Daily: 'per day', Weekly: 'per week', Monthly: 'per month', Once: 'when done' };
  const CUR_LBL = { Daily: 'Today', Weekly: 'This week', 'Every 2 weeks': 'This fortnight', Monthly: 'This month', Once: 'Status' };

  /* The reward period containing date s. */
  function periodOf(c, s) {
    if (c.freq === 'Once') return { key: 'once', start: c.start, end: c.start, label: `Due ${C.fmtDay(c.start)}` };
    if (c.period === 'Daily') return { key: s, start: s, end: s, label: C.fmtDay(s) };
    if (c.period === 'Weekly') { const st = C.startOfWeek(s), en = C.addDays(st, 6); return { key: st, start: st, end: en, label: `Week of ${C.toD(st).getDate()} ${C.MON[C.toD(st).getMonth()]}` }; }
    const d = C.toD(s), st = C.toS(new Date(d.getFullYear(), d.getMonth(), 1)), en = C.toS(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    return { key: st.slice(0, 7), start: st, end: en, label: `${C.MONL[d.getMonth()]} ${d.getFullYear()}` };
  }
  /* The dates a chore falls due within a range. Weekly chores fall on the
     Monday of each week, monthly ones on the 1st: the whole week or month counts. */
  function occOf(c, r) {
    if (c.freq === 'Once') return [c.start];
    const anchor = c.freq === 'Daily' ? c.start : c.freq === 'Monthly' ? c.start.slice(0, 8) + '01' : C.startOfWeek(c.start);
    const out = [];
    for (let d = r.start; d <= r.end; d = C.addDays(d, 1)) {
      if (d < anchor) continue;
      if (c.until && d > c.until) continue;
      if (c.freq === 'Daily') out.push(d);
      else if (c.freq === 'Weekly' && C.dow(d) === 1) out.push(d);
      else if (c.freq === 'Every 2 weeks' && C.dow(d) === 1 && Math.round(C.diffDays(anchor, d) / 7) % 2 === 0) out.push(d);
      else if (c.freq === 'Monthly' && d.endsWith('-01')) out.push(d);
    }
    return out;
  }
  /* The occurrence that covers today (this day, week, fortnight or month). */
  function curOcc(c, today) {
    if (c.freq === 'Once') return c.start;
    const list = occOf(c, { start: C.addDays(today, -62), end: today });
    return list.length ? list[list.length - 1] : null;
  }
  function occEnd(c, d) {
    return c.freq === 'Daily' || c.freq === 'Once' ? d : c.freq === 'Weekly' ? C.addDays(d, 6) : c.freq === 'Every 2 weeks' ? C.addDays(d, 13) : C.toS(new Date(C.toD(d).getFullYear(), C.toD(d).getMonth() + 1, 0));
  }
  function periodStats(c, r) {
    const occ = occOf(c, r);
    const log = c.log || {};
    const done = occ.filter(d => log[d] === 'done').length;
    const missed = occ.filter(d => log[d] === 'missed').length;
    const amount = !occ.length ? 0 : c.rule === 'all' ? (done === occ.length ? c.reward : 0) : Math.round(c.reward * done / occ.length);
    return { occ, done, missed, amount, paid: (c.paid || {})[r.key] || null };
  }
  const occLabel = (c, d) => c.freq === 'Daily' ? `${C.DOW[C.dow(d)]} ${C.toD(d).getDate()}` : c.freq === 'Monthly' ? C.MON[C.toD(d).getMonth()] : c.freq === 'Once' ? C.fmtDay(d) : `Wk ${C.toD(d).getDate()} ${C.MON[C.toD(d).getMonth()]}`;

  FH.chores = { FREQS, PER_OK, PER_LBL, CUR_LBL, periodOf, occOf, curOcc, occEnd, periodStats, occLabel };
})();
