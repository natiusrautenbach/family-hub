/* Herding Cats · Copyright (c) 2026 Natius. All rights reserved. See LICENSE. */
/* Herding Cats · lifts (Phase 3)
   Works out the day's trips: dropping children at activities, fetching them afterwards,
   and fetching them from school. Pure planning: no screens and no storage here.

   Activity fields used:  dropOn / pickOn (false = no lift needed), dropBy / pickBy
   ({ all: driverId, <weekday>: driverId }), placeId, liftDay ({ 'YYYY-MM-DD|drop': driverId or 'none' }).
   Child fields used:     school ({ <weekday>: { time, by } }), liftDay ({ 'YYYY-MM-DD|school': ... }).
   Times are the activity's own start and end times; drivers plan when to leave themselves. */
(function () {
  'use strict';
  const FH = (window.FH = window.FH || {});
  const C = FH.cal;
  /* A school pick-up is replaced by an activity that starts within this long after school ends. */
  const AFTER_SCHOOL = 180;
  const LEG = { drop: 'Drop-off', pick: 'Pick-up', school: 'School pick-up' };

  const driverFor = (by, wd) => (by ? (by[wd] ?? by.all ?? '') : '') || '';
  const toMin = t => { const [h, m] = (t || '0:0').split(':').map(Number); return h * 60 + m; };

  /* ctx: { activities, children, sc, places: Map(id → place) } */
  function tripsOn(s, ctx) {
    const wd = C.dow(s);
    const kids = new Set(ctx.children.map(c => c.id));
    const out = [], byKey = new Map();
    const add = (key, t) => {
      const had = key && byKey.get(key);
      if (had) { for (const k of t.kids) if (!had.kids.includes(k)) had.kids.push(k); had.recIds.push(...t.recIds); return; }
      if (key) byKey.set(key, t);
      out.push(t);
    };
    for (const a of ctx.activities) {
      if (!kids.has(a.owner)) continue;
      if (C.activityOn(a, s, ctx.sc) !== 'on') continue;
      const place = a.placeId ? ctx.places.get(a.placeId) : null;
      const mins = 0; // no travel times: drivers get the actual start and end times
      for (const leg of ['drop', 'pick']) {
        if (a[leg + 'On'] === false) continue;
        const time = leg === 'drop' ? a.start : a.end;
        if (!time) continue;
        const over = (a.liftDay || {})[`${s}|${leg}`];
        const driver = over && over !== 'none' ? over : driverFor(a[leg + 'By'], wd);
        add(a.group ? `${leg}|${a.group}` : '', {
          id: `${leg}|${a.id}|${s}`, leg, recId: a.id, recIds: [a.id], group: a.group || '', date: s, time,
          leave: C.addMin(time, -mins), mins, place: place?.name || a.place || '', placeId: a.placeId || '',
          title: a.title, kids: [a.owner], driver, changed: !!over, off: over === 'none', replaced: '',
        });
      }
    }
    /* School pick-ups, on school days only. An activity straight after school replaces it. */
    if (!ctx.sc.offDay(s)) {
      for (const c of ctx.children) {
        const sp = c.school && c.school[wd];
        if (!sp || !sp.time) continue;
        const place = null, mins = 0;
        const follow = ctx.activities.find(a => a.owner === c.id && a.start && C.activityOn(a, s, ctx.sc) === 'on'
          && toMin(a.start) >= toMin(sp.time) && toMin(a.start) <= toMin(sp.time) + AFTER_SCHOOL);
        const over = (c.liftDay || {})[`${s}|school`];
        const driver = over && over !== 'none' ? over : (sp.by || '');
        add(`school|${c.schoolPlace || ''}|${sp.time}|${driver}|${follow ? 1 : 0}|${over === 'none' ? 1 : 0}`, {
          id: `school|${c.id}|${s}`, leg: 'school', recId: c.id, recIds: [c.id], group: '', date: s, time: sp.time,
          leave: C.addMin(sp.time, -mins), mins, place: place?.name || 'School', placeId: c.schoolPlace || '',
          title: 'School', kids: [c.id], driver, changed: !!over, off: over === 'none', replaced: follow ? follow.title : '',
        });
      }
    }
    return out.sort((x, y) => x.leave.localeCompare(y.leave) || x.time.localeCompare(y.time));
  }

  /* A driver down for two lifts at the same time. The driver is optional, so a lift with
     no driver is never a problem. */
  function warnings(trips) {
    const live = trips.filter(t => !t.off && !t.replaced && t.driver);
    const out = [];
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j];
      if (a.driver === b.driver && a.time === b.time && a.place !== b.place) out.push({ type: 'clash', driver: a.driver, trips: [a, b] });
    }
    return out;
  }

  FH.lifts = { tripsOn, warnings, driverFor, LEG, AFTER_SCHOOL };
})();
