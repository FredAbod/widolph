import { route } from '../lib/http.js';
import { dbMode, listSchedule } from '../lib/db.js';

export default route({
  GET: async () => {
    await listSchedule(); // touches the database so a bad connection string shows up here
    return { ok: true, db: dbMode(), time: new Date().toISOString() };
  }
});
