const { Pool } = require('pg');
require('dotenv').config();

// Supabase exposes a standard Postgres connection via the "Connection Pooler"
// Use the pooler URL (port 6543) for serverless/deployed backends (Render, Railway, etc.)
// Use the direct URL (port 5432) only for migrations or long-running processes.

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Required for Supabase
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Test connection on startup
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Database connection error:', err.message);
  } else {
    console.log('✅ Connected to Supabase PostgreSQL');
    release();
  }
});

module.exports = pool;
