import pg from 'pg';
const { Pool } = pg;
const connectionString = process.env.DATABASE_URL || `postgresql://${process.env.POSTGRES_USER || 'postgres'}:${process.env.POSTGRES_PASSWORD || ''}@localhost:5432/${process.env.POSTGRES_DB || 'runway_finance'}`;
const pool = new Pool({ connectionString });
try {
  const r = await pool.query(`
    SELECT snapshot_date, count(*) as cnt
    FROM account_snapshots
    WHERE snapshot_date >= '2026-06-01'
    GROUP BY snapshot_date
    ORDER BY snapshot_date DESC
    LIMIT 30
  `);
  r.rows.forEach(row => process.stdout.write(row.snapshot_date + ' cnt=' + row.cnt + '\n'));
} finally {
  await pool.end();
}
