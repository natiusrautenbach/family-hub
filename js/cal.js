/* Family Hub · Copyright (c) 2026 Natius. All rights reserved. See LICENSE. */
/* Family Hub · dates, school calendar and repeat rules
   Pure functions: no screen code and no database access. */
(function () {
  'use strict';
  const FH = (window.FH = window.FH || {});

  /* ---------- Dates (always local 'YYYY-MM-DD' strings) ---------- */
  const pad = n => String(n).padStart(2, '0');
  const toD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const toS = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => toS(new Date());
  const addDays = (s, n) => { const d = toD(s); d.setDate(d.getDate() + n); return toS(d); };
  const dow = s => toD(s).getDay();
  const diffDays = (a, b) => Math.round((toD(b) - toD(a)) / 864e5);
  const startOfWeek = s => addDays(s, -((dow(s) + 6) % 7)); // weeks start on Monday
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DOWL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const fmtDay = s => { const d = toD(s); return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`; };
  const fmtDate = s => { const d = toD(s); return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`; };
  const fmtLong = s => { const d = toD(s); return `${DOWL[d.getDay()]} ${d.getDate()} ${MONL[d.getMonth()]}`; };
  const rel = n => n === 0 ? 'today' : n === 1 ? 'tomorrow' : n === -1 ? 'yesterday' : n > 0 ? `in ${n} days` : `${-n} days ago`;
  const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && toS(toD(s)) === s;
  const isTime = s => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

  /* ---------- Official school calendar ----------
     Department of Basic Education calendar for public schools (all
     provinces, including Gauteng), with national public holidays.
     Imported once per item: anything you edit or remove is never
     overwritten when the app updates or a new year is added. */
  const OFFICIAL = {
    source: 'Department of Basic Education school calendar, via gauteng.net',
    coverage: { start: '2026-10-06', end: '2027-12-31' },
    terms: [
      { id: 'dbe-2026-t4', name: 'Term 4 2026', start: '2026-10-06', end: '2026-12-09' },
      { id: 'dbe-2027-t1', name: 'Term 1 2027', start: '2027-01-13', end: '2027-03-19' },
      { id: 'dbe-2027-t2', name: 'Term 2 2027', start: '2027-04-06', end: '2027-06-25' },
      { id: 'dbe-2027-t3', name: 'Term 3 2027', start: '2027-07-20', end: '2027-09-22' },
      { id: 'dbe-2027-t4', name: 'Term 4 2027', start: '2027-10-05', end: '2027-12-08' },
    ],
    daysoff: [
      { id: 'ph-2026-12-16', date: '2026-12-16', name: 'Day of Reconciliation' },
      { id: 'ph-2026-12-25', date: '2026-12-25', name: 'Christmas Day' },
      { id: 'ph-2026-12-26', date: '2026-12-26', name: 'Day of Goodwill' },
      { id: 'ph-2027-01-01', date: '2027-01-01', name: "New Year's Day" },
      { id: 'ph-2027-03-22', date: '2027-03-22', name: 'Human Rights Day (observed)' },
      { id: 'ph-2027-03-26', date: '2027-03-26', name: 'Good Friday' },
      { id: 'ph-2027-03-29', date: '2027-03-29', name: 'Family Day' },
      { id: 'sh-2027-04-26', date: '2027-04-26', name: 'School holiday' },
      { id: 'ph-2027-04-27', date: '2027-04-27', name: 'Freedom Day' },
      { id: 'ph-2027-05-01', date: '2027-05-01', name: "Workers' Day" },
      { id: 'ph-2027-06-16', date: '2027-06-16', name: 'Youth Day' },
      { id: 'ph-2027-08-09', date: '2027-08-09', name: "National Women's Day" },
      { id: 'ph-2027-09-24', date: '2027-09-24', name: 'Heritage Day' },
      { id: 'ph-2027-12-16', date: '2027-12-16', name: 'Day of Reconciliation' },
      { id: 'ph-2027-12-25', date: '2027-12-25', name: 'Christmas Day' },
      { id: 'ph-2027-12-27', date: '2027-12-27', name: 'Day of Goodwill (observed)' },
    ],
  };

  /* Builds quick lookups from the terms and days off stored on the device. */
  function schoolCalendar(terms, daysoff) {
    const T = terms.slice().sort((a, b) => a.start.localeCompare(b.start));
    const offMap = new Map();
    for (const d of daysoff) {
      const last = d.end && d.end > d.date ? d.end : d.date;
      for (let s = d.date; s <= last; s = addDays(s, 1)) if (!offMap.has(s)) offMap.set(s, d.name || 'Day off');
    }
    const first = T.length ? T[0].start : null;
    /* The known calendar runs from the first term to the end of the year of the last term
       (when that term is the year's last one), so the December holidays count as holidays. */
    const lastEnd = T.reduce((m, t) => (t.end > m ? t.end : m), '');
    const coverEnd = !lastEnd ? null : lastEnd.slice(5) >= '10-01' ? lastEnd.slice(0, 4) + '-12-31' : lastEnd;
    const covered = s => !!first && s >= first && s <= coverEnd;
    const termOf = s => T.find(t => s >= t.start && s <= t.end) || null;
    /* A day off school: a public holiday or day off, or (within the known calendar) a day outside every term. */
    const offDay = s => offMap.has(s) || (covered(s) && !termOf(s));
    const offLabel = s => offMap.get(s) || (covered(s) && !termOf(s) ? 'School holiday' : '');
    const nextTerm = s => T.find(t => t.start > s) || null;
    return { terms: T, termOf, offDay, offLabel, covered, nextTerm, first, coverEnd };
  }

  /* ---------- Repeat rules ---------- */
  /* Returns 'on', 'skipped', 'holiday' or null for an activity on a date. */
  function activityOn(a, s, sc) {
    if (!a.weekdays || !a.weekdays.includes(dow(s))) return null;
    if (a.from && s < a.from) return null;
    if (a.until && s > a.until) return null;
    if (!a.runsInHolidays && sc.offDay(s)) return 'holiday';
    if (a.skips && a.skips.includes(s)) return 'skipped';
    return 'on';
  }

  const REPEATS = [['none', 'Does not repeat'], ['weekly', 'Every week'], ['monthly', 'Every month'], ['yearly', 'Every year']];
  function reminderOn(r, s) {
    if (!r.date || s < r.date) return false;
    if (r.until && s > r.until) return false;
    if (r.skips && r.skips.includes(s)) return false;
    const a = toD(r.date), b = toD(s);
    switch (r.repeat) {
      case 'weekly': return a.getDay() === b.getDay();
      case 'monthly': return a.getDate() === b.getDate();
      case 'yearly': return a.getDate() === b.getDate() && a.getMonth() === b.getMonth();
      default: return r.date === s;
    }
  }
  /* Next date on or after s that a reminder falls on, within a year. */
  function nextReminder(r, s) {
    for (let i = 0, d = s; i < 400; i++, d = addDays(d, 1)) if (reminderOn(r, d)) return d;
    return null;
  }

  /* ---------- Events for a day ---------- */
  function eventsOn(s, src, opts) {
    const o = opts || {};
    const out = [];
    for (const a of src.activities) {
      const st = activityOn(a, s, src.sc);
      if (!st || st === 'holiday') continue;
      out.push({ kind: 'act', id: a.id, child: a.owner, date: s, time: a.start || '', end: a.end || '', title: a.title, sub: a.place || '', skipped: st === 'skipped' });
    }
    for (const r of src.reminders) {
      if (!reminderOn(r, s)) continue;
      out.push({ kind: 'rem', id: r.id, child: r.owner, date: s, time: r.time || '', end: '', title: r.title, sub: r.repeat && r.repeat !== 'none' ? REPEATS.find(x => x[0] === r.repeat)[1] : 'Reminder', skipped: false });
    }
    return out
      .filter(e => !o.visible || o.visible.has(e.child))
      .filter(e => !o.kinds || o.kinds.has(e.kind))
      .sort((x, y) => (x.time || '99:99').localeCompare(y.time || '99:99') || x.title.localeCompare(y.title));
  }

  FH.cal = {
    pad, toD, toS, today, addDays, dow, diffDays, startOfWeek, isDate, isTime,
    DOW, DOWL, MON, MONL, fmtDay, fmtDate, fmtLong, rel,
    OFFICIAL, schoolCalendar, activityOn, reminderOn, nextReminder, eventsOn, REPEATS,
  };
})();
