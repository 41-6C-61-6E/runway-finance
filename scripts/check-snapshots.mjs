import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgresql://postgres:l45606393b@localhost:5432/runway_finance' });
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
