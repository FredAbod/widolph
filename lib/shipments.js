// Shipment shape helpers shared by the public tracking and admin routes.
import { STAGES } from './seed-data.js';

export { STAGES };

// What the public tracking page may see – no customer contact details.
export function publicView(s) {
  const firstName = String(s.customerName || '').split(/\s+/)[0] || null;
  return {
    code: s.code,
    demo: !!s.demo,
    origin: s.origin,
    destination: s.destination,
    method: s.method,
    customer: s.demo ? null : firstName,
    stage: s.stage,
    status: STAGES[s.stage]?.title || 'Booked',
    updatedAt: s.updatedAt,
    timeline: STAGES.map((st, i) => {
      const ev = s.events?.find((e) => e.key === st.key) || {};
      return {
        key: st.key,
        title: st.key === 'picked_up' ? `Picked up (${s.origin})` : st.title,
        location: ev.location || null,
        at: ev.at || null,
        note: ev.note || '',
        state: i < s.stage || (i === s.stage && st.key === 'delivered') ? 'done' : i === s.stage ? 'cur' : 'up'
      };
    })
  };
}

// Move a shipment to stage `index`, stamping events for every stage reached.
export function setStage(s, index, { location, note } = {}) {
  const now = new Date().toISOString();
  const events = [];
  STAGES.forEach((st, i) => {
    if (i > index) return;
    const prev = s.events?.find((e) => e.key === st.key);
    if (i === index) {
      events.push({
        key: st.key,
        location: location ?? prev?.location ?? defaultLocation(s, st),
        at: prev?.at && i === s.stage ? prev.at : now,
        note: note ?? prev?.note ?? ''
      });
    } else {
      events.push(prev || { key: st.key, location: defaultLocation(s, st), at: now, note: '' });
    }
  });
  return { ...s, stage: index, events, updatedAt: now };
}

function defaultLocation(s, st) {
  if (st.key === 'picked_up') return `${s.origin}, Australia`;
  if (st.key === 'out_for_delivery' || st.key === 'delivered') return `${s.destination}, Nigeria`;
  return st.defaultLocation;
}
