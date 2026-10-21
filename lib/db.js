// Data access for quotes, shipments and the LCL schedule.
// Uses MongoDB when MONGODB_URI is set; otherwise falls back to an in-memory
// store so the site still works for local previews (data resets on restart).
import { MongoClient } from 'mongodb';
import { DEMO_CODE, DEMO_SHIPMENT, SEED_SCHEDULE } from './seed-data.js';

const URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || 'widoph';

// Reuse the client across hot serverless invocations.
const g = globalThis;
g.__widoph ??= { client: null, ready: null, memory: null };

async function mongo() {
  if (!g.__widoph.ready) {
    g.__widoph.ready = (async () => {
      const client = new MongoClient(URI, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 });
      await client.connect();
      const db = client.db(DB_NAME);
      await Promise.all([
        db.collection('quotes').createIndex({ ref: 1 }, { unique: true }),
        db.collection('quotes').createIndex({ createdAt: -1 }),
        db.collection('shipments').createIndex({ code: 1 }, { unique: true }),
        db.collection('schedule').createIndex({ order: 1 })
      ]);
      await db.collection('shipments').updateOne(
        { code: DEMO_CODE },
        { $setOnInsert: DEMO_SHIPMENT() },
        { upsert: true }
      );
      if ((await db.collection('schedule').countDocuments()) === 0) {
        await db.collection('schedule').insertMany(SEED_SCHEDULE());
      }
      g.__widoph.client = client;
      return db;
    })().catch((err) => {
      g.__widoph.ready = null; // allow a retry on the next request
      throw err;
    });
  }
  return g.__widoph.ready;
}

function memory() {
  if (!g.__widoph.memory) {
    g.__widoph.memory = { quotes: [], shipments: [DEMO_SHIPMENT()], schedule: SEED_SCHEDULE() };
    console.warn('[widoph] MONGODB_URI is not set – using in-memory storage (data resets on restart).');
  }
  return g.__widoph.memory;
}

const strip = (doc) => {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return rest;
};
const clone = (v) => structuredClone(v);

export const dbMode = () => (URI ? 'mongodb' : 'memory');

/* ---------- quotes ---------- */

export async function insertQuote(quote) {
  if (!URI) return void memory().quotes.unshift(clone(quote));
  await (await mongo()).collection('quotes').insertOne({ ...quote });
}

export async function listQuotes({ status, q, limit = 200 } = {}) {
  const needle = q ? q.toLowerCase() : '';
  const matches = (x) =>
    (!status || x.status === status) &&
    (!needle || [x.ref, x.name, x.email, x.phone, x.destination, x.origin].some((f) => String(f || '').toLowerCase().includes(needle)));

  if (!URI) return memory().quotes.filter(matches).slice(0, limit).map(clone);

  const filter = {};
  if (status) filter.status = status;
  if (needle) {
    const rx = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = ['ref', 'name', 'email', 'phone', 'destination', 'origin'].map((f) => ({ [f]: rx }));
  }
  const rows = await (await mongo()).collection('quotes').find(filter).sort({ createdAt: -1 }).limit(limit).toArray();
  return rows.map(strip);
}

export async function quoteStats() {
  if (!URI) {
    const counts = {};
    for (const x of memory().quotes) counts[x.status] = (counts[x.status] || 0) + 1;
    return { total: memory().quotes.length, byStatus: counts };
  }
  const rows = await (await mongo()).collection('quotes').aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]).toArray();
  const byStatus = Object.fromEntries(rows.map((r) => [r._id, r.n]));
  return { total: rows.reduce((a, r) => a + r.n, 0), byStatus };
}

export async function updateQuote(ref, patch) {
  const set = { ...patch, updatedAt: new Date().toISOString() };
  if (!URI) {
    const doc = memory().quotes.find((x) => x.ref === ref);
    if (!doc) return null;
    Object.assign(doc, set);
    return clone(doc);
  }
  const doc = await (await mongo()).collection('quotes').findOneAndUpdate({ ref }, { $set: set }, { returnDocument: 'after' });
  return strip(doc);
}

export async function getQuote(ref) {
  if (!URI) return clone(memory().quotes.find((x) => x.ref === ref) || null);
  return strip(await (await mongo()).collection('quotes').findOne({ ref }));
}

/* ---------- shipments ---------- */

export async function getShipment(code) {
  if (!URI) return clone(memory().shipments.find((x) => x.code === code) || null);
  return strip(await (await mongo()).collection('shipments').findOne({ code }));
}

export async function listShipments() {
  if (!URI) return memory().shipments.map(clone);
  const rows = await (await mongo()).collection('shipments').find({}).sort({ createdAt: -1 }).limit(200).toArray();
  return rows.map(strip);
}

export async function insertShipment(shipment) {
  if (!URI) return void memory().shipments.unshift(clone(shipment));
  await (await mongo()).collection('shipments').insertOne({ ...shipment });
}

export async function replaceShipment(code, shipment) {
  if (!URI) {
    const list = memory().shipments;
    const i = list.findIndex((x) => x.code === code);
    if (i === -1) return null;
    list[i] = clone(shipment);
    return clone(shipment);
  }
  const { _id, ...doc } = shipment;
  const res = await (await mongo()).collection('shipments').findOneAndReplace({ code }, doc, { returnDocument: 'after' });
  return strip(res);
}

export async function deleteShipment(code) {
  if (!URI) {
    const list = memory().shipments;
    const i = list.findIndex((x) => x.code === code);
    if (i !== -1) list.splice(i, 1);
    return i !== -1;
  }
  const res = await (await mongo()).collection('shipments').deleteOne({ code });
  return res.deletedCount === 1;
}

/* ---------- schedule ---------- */

export async function listSchedule() {
  if (!URI) return memory().schedule.map(clone);
  const rows = await (await mongo()).collection('schedule').find({}).sort({ order: 1 }).toArray();
  return rows.map(strip);
}

export async function replaceSchedule(rows) {
  if (!URI) {
    memory().schedule = clone(rows);
    return rows;
  }
  const col = (await mongo()).collection('schedule');
  await col.deleteMany({});
  if (rows.length) await col.insertMany(rows.map((r) => ({ ...r })));
  return rows;
}
