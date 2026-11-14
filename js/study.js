/* Family Hub · Copyright (c) 2026 Natius. All rights reserved. See LICENSE. */
/* Family Hub · study planner logic
   Reading an exam timetable from text (typed, pasted, or read from a photo)
   and building a revision plan. Pure functions: no screens, no database. */
(function () {
  'use strict';
  const FH = (window.FH = window.FH || {});
  const C = FH.cal;

  /* ---------- Subjects (South African CAPS names and common short forms) ---------- */
  const SUBJECTS = [
    ['Mathematical Literacy', ['mathematical literacy', 'maths literacy', 'math lit', 'maths lit', 'wiskundige geletterdheid']],
    ['Mathematics', ['mathematics', 'maths', 'math', 'wiskunde']],
    ['English Home Language', ['english home language', 'english hl', 'eng hl']],
    ['English First Additional Language', ['english first additional language', 'english fal', 'eng fal']],
    ['English', ['english']],
    ['Afrikaans Huistaal', ['afrikaans huistaal', 'afrikaans hl']],
    ['Afrikaans Eerste Addisionele Taal', ['afrikaans eerste addisionele taal', 'afrikaans eat', 'afrikaans fal']],
    ['Afrikaans', ['afrikaans']],
    ['isiZulu', ['isizulu', 'zulu']],
    ['Sesotho', ['sesotho']],
    ['Setswana', ['setswana']],
    ['isiXhosa', ['isixhosa', 'xhosa']],
    ['Sepedi', ['sepedi']],
    ['Physical Sciences', ['physical sciences', 'physical science', 'physics', 'fisiese wetenskappe']],
    ['Life Sciences', ['life sciences', 'life science', 'biology', 'lewenswetenskappe']],
    ['Natural Sciences', ['natural sciences', 'natural science', 'natuurwetenskappe']],
    ['Social Sciences', ['social sciences', 'social science', 'sosiale wetenskappe']],
    ['Geography', ['geography', 'aardrykskunde']],
    ['History', ['history', 'geskiedenis']],
    ['Accounting', ['accounting', 'rekeningkunde']],
    ['Business Studies', ['business studies', 'besigheidstudies']],
    ['Economics', ['economics', 'ekonomie']],
    ['Economic and Management Sciences', ['economic and management sciences', 'economic management sciences', 'ems', 'ebw']],
    ['Life Orientation', ['life orientation', 'lewensoriëntering', 'lo']],
    ['Life Skills', ['life skills', 'lewensvaardighede']],
    ['Computer Applications Technology', ['computer applications technology', 'cat']],
    ['Information Technology', ['information technology', 'it']],
    ['Engineering Graphics and Design', ['engineering graphics and design', 'egd']],
    ['Technology', ['technology', 'tegnologie']],
    ['Tourism', ['tourism', 'toerisme']],
    ['Consumer Studies', ['consumer studies', 'verbruikerstudies']],
    ['Dramatic Arts', ['dramatic arts', 'drama']],
    ['Visual Arts', ['visual arts']],
    ['Creative Arts', ['creative arts', 'kuns en kultuur']],
    ['Music', ['music', 'musiek']],
  ];
  const norm = s => s.toLowerCase().replace(/[^a-zà-ÿ0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  function matchSubject(text) {
    const n = ' ' + norm(text) + ' ';
    for (const [name, keys] of SUBJECTS) for (const k of keys) if (n.includes(' ' + k + ' ')) return name;
    return null;
  }
  /* Small spelling slips from photo reading (Geogrphy, Mathematies) are matched
     to the nearest subject, and the row is flagged so you can check it. */
  function lev(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  function guessSubject(text) {
    const words = norm(text).split(' ').filter(w => w.length >= 5);
    let best = null;
    for (const [name, keys] of SUBJECTS) for (const k of keys) {
      if (k.includes(' ') || k.length < 5) continue;
      for (const w of words) { const dist = lev(w, k); if (dist <= (k.length >= 8 ? 2 : 1) && (!best || dist < best.dist)) best = { name, dist }; }
    }
    return best ? best.name : null;
  }

  /* ---------- Reading dates, times and papers from a line ---------- */
  const MONTHS = { jan: 1, january: 1, januarie: 1, feb: 2, february: 2, februarie: 2, mar: 3, march: 3, maart: 3, apr: 4, april: 4, may: 5, mei: 5, jun: 6, june: 6, junie: 6, jul: 7, july: 7, julie: 7, aug: 8, august: 8, augustus: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, okt: 10, oktober: 10, nov: 11, november: 11, dec: 12, december: 12, des: 12, desember: 12 };
  const DAYWORDS = /\b(mon(day)?|tue(s(day)?)?|wed(nesday)?|thu(r(s(day)?)?)?|fri(day)?|sat(urday)?|sun(day)?|maandag|dinsdag|woensdag|donderdag|vrydag|saterdag|sondag|ma|di|wo|do|vr)\b\.?,?/gi;

  /* Picks the year that puts a day and month closest after (or just before) a reference date. */
  function inferYear(m, d, ref) {
    const y = Number(ref.slice(0, 4));
    for (const yy of [y, y + 1]) { const s = `${yy}-${C.pad(m)}-${C.pad(d)}`; if (C.isDate(s) && C.diffDays(ref, s) >= -45) return s; }
    const s = `${y}-${C.pad(m)}-${C.pad(d)}`; return C.isDate(s) ? s : null;
  }
  function findDate(line, ref) {
    let m;
    if ((m = line.match(/\b(20\d\d)[-/.](\d{1,2})[-/.](\d{1,2})\b/))) { const s = `${m[1]}-${C.pad(+m[2])}-${C.pad(+m[3])}`; if (C.isDate(s)) return { date: s, raw: m[0], sure: true }; }
    if ((m = line.match(/\b(\d{1,2})[/.](\d{1,2})(?:[/.](20\d\d|\d\d))?\b/))) {
      const d = +m[1], mo = +m[2];
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        const s = m[3] ? `${m[3].length === 2 ? '20' + m[3] : m[3]}-${C.pad(mo)}-${C.pad(d)}` : inferYear(mo, d, ref);
        if (s && C.isDate(s)) return { date: s, raw: m[0], sure: !!m[3] };
      }
    }
    if ((m = line.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\.?(?:\s+(20\d\d))?\b/i)) && MONTHS[m[2].toLowerCase()]) {
      const mo = MONTHS[m[2].toLowerCase()], d = +m[1];
      const s = m[3] ? `${m[3]}-${C.pad(mo)}-${C.pad(d)}` : inferYear(mo, d, ref);
      if (s && C.isDate(s)) return { date: s, raw: m[0], sure: true };
    }
    if ((m = line.match(/\b([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d\d))?\b/i)) && MONTHS[m[1].toLowerCase()]) {
      const mo = MONTHS[m[1].toLowerCase()], d = +m[2];
      const s = m[3] ? `${m[3]}-${C.pad(mo)}-${C.pad(d)}` : inferYear(mo, d, ref);
      if (s && C.isDate(s)) return { date: s, raw: m[0], sure: true };
    }
    return null;
  }
  function findTime(line) {
    const m = line.match(/\b([01]?\d|2[0-3])\s?[:hH.]\s?([0-5]\d)\b(?!\s*[/.-]\s*\d)/) || line.match(/\b(0[6-9]|1\d)([0-5]\d)\b/);
    if (!m) return null;
    const h = +m[1];
    if (h < 6 || h > 20) return null; // exams are written during the school day
    return { time: `${C.pad(h)}:${m[2]}`, raw: m[0] };
  }
  function findPaper(line) {
    const m = line.match(/\b(?:paper|p|vraestel|v)\s?([1-3])\b/i);
    return m ? { paper: 'P' + m[1], raw: m[0] } : null;
  }

  /* Turns timetable text into exam rows for review. Lines with a date start a
     new day; lines without one belong to the last date seen. Each row says how
     sure the app is, so doubtful rows can be highlighted. */
  function parseTimetable(text, ref) {
    const rows = [];
    let curDate = null, curDateSure = false;
    const lines = String(text || '').split(/\r?\n/).map(l => l.replace(/[|_~=*•·]+/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
    for (const line of lines) {
      const d = findDate(line, ref);
      let rest = line;
      if (d) { curDate = d.date; curDateSure = d.sure; rest = rest.replace(d.raw, ' '); }
      const t = findTime(rest); if (t) rest = rest.replace(t.raw, ' ');
      const p = findPaper(rest); if (p) rest = rest.replace(p.raw, ' ');
      rest = rest.replace(DAYWORDS, ' ').replace(/\b\d+\s?(min|mins|minutes|h|hrs|hours|uur)\b/gi, ' ').replace(/[-–—:,;()]+/g, ' ').replace(/\s+/g, ' ').trim();
      let subject = matchSubject(rest), guessed = false;
      if (!subject) { subject = guessSubject(rest); guessed = !!subject; }
      const looksLikeWords = /[a-z]{3,}/i.test(rest) && rest.length <= 60;
      if (!subject && !looksLikeWords) continue;        // a date-only line, header or noise
      if (/^(date|datum|time|tyd|subject|vak|paper|exam|examination|timetable|rooster|grade|graad|session|duration)\b/i.test(rest) && !subject) continue;
      if (!curDate) continue;                           // no date known yet
      const issues = [];
      if (!subject) issues.push('Subject not recognised');
      if (guessed) issues.push(`Read as "${rest}", check the subject`);
      if (!d && !curDateSure) issues.push('Date taken from the line above');
      if (!t) issues.push('No start time found');
      rows.push({ subject: subject || rest.replace(/\b\w/g, c => c.toUpperCase()), paper: p ? p.paper : '', date: curDate, time: t ? t.time : '', flag: issues.join('. '), source: line });
    }
    /* Merge exact duplicates that come from the same line read twice. */
    const seen = new Set();
    return rows.filter(r => { const k = `${r.subject}|${r.paper}|${r.date}`; if (seen.has(k)) return false; seen.add(k); return true; });
  }

  /* ---------- Revision plan ---------- */
  const PLAN = [
    [10, 'Summary notes', 60],
    [6, 'Practice questions', 60],
    [3, 'Past paper', 60],
    [1, 'Final revision', 90],
  ];
  const SLOTS = { weekday: ['17:30', '19:00'], weekend: ['10:00', '14:00'] };
  /* exams: this period's exams; busy: the child's other sessions (date list).
     Returns new sessions: never in the past, never on an exam's own day,
     at most two a day for the child. */
  function buildPlan(exams, busy, from) {
    const start = from || C.today();
    const count = new Map();
    for (const d of busy) count.set(d, (count.get(d) || 0) + 1);
    const examDays = new Set(exams.map(e => e.date));
    const out = [];
    for (const e of exams.slice().sort((a, b) => a.date.localeCompare(b.date))) {
      for (const [off, label, mins] of PLAN) {
        let day = C.addDays(e.date, -off);
        if (day < start) { if (off === 1 && C.addDays(e.date, -1) >= start) day = C.addDays(e.date, -1); else continue; }
        let guard = 0;
        while ((count.get(day) || 0) >= 2 || (examDays.has(day) && off !== 1)) {
          day = C.addDays(day, -1); guard++;
          if (day < start || guard > 7) { day = null; break; }
        }
        if (!day) continue;
        const n = count.get(day) || 0;
        const weekend = [0, 6].includes(C.dow(day));
        out.push({ exam: e.id, subject: `${e.subject}${e.paper ? ' ' + e.paper : ''}`, date: day, time: (weekend ? SLOTS.weekend : SLOTS.weekday)[n] || '19:00', mins, label, done: false });
        count.set(day, n + 1);
      }
    }
    return out;
  }

  FH.study = { SUBJECTS, matchSubject, findDate, findTime, parseTimetable, buildPlan, PLAN, SLOTS };
})();
