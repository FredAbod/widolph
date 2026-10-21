// Seed records. Everything here is clearly demo / placeholder data –
// no real dates, prices or transit times are implied.

// The six tracking stages from the brief, in order.
export const STAGES = [
  { key: 'picked_up', title: 'Picked up', defaultLocation: 'Sydney, NSW' },
  { key: 'departed_au', title: 'Departed Australia', defaultLocation: 'Australia' },
  { key: 'arrived_ng', title: 'Arrived Apapa Port, Lagos', defaultLocation: 'Apapa, Lagos' },
  { key: 'customs', title: 'Customs clearance', defaultLocation: 'Lagos, Nigeria' },
  { key: 'out_for_delivery', title: 'Out for delivery', defaultLocation: 'Lagos, Nigeria' },
  { key: 'delivered', title: 'Delivered', defaultLocation: 'Lagos, Nigeria' }
];

export const DEMO_CODE = 'WDP-DEMO-1024';

export function DEMO_SHIPMENT() {
  const now = new Date().toISOString();
  return {
    code: DEMO_CODE,
    demo: true,
    origin: 'Sydney',
    destination: 'Lagos',
    method: 'Sea freight LCL',
    customerName: 'Demo customer',
    quoteRef: null,
    // Index of the current stage – "Out for delivery".
    stage: 4,
    events: STAGES.slice(0, 5).map((s) => ({ key: s.key, location: s.defaultLocation, at: null, note: '' })),
    createdAt: now,
    updatedAt: now
  };
}

export function SEED_SCHEDULE() {
  return [1, 2, 3, 4].map((n) => ({
    order: n,
    departure: null,
    cutoff: null,
    eta: null,
    placeholder: true
  }));
}
