require('dotenv').config();
const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL });
c.connect()
  .then(() => c.query("select tablename from pg_tables where schemaname='public' order by tablename"))
  .then((r) => { console.log(JSON.stringify(r.rows.map((x) => x.tablename))); return c.end(); })
  .catch((e) => { console.error(e.message); process.exit(1); });
