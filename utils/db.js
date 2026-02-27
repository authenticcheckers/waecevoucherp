const { Pool } = require('pg');
require('dotenv').config();

// Supabase has THREE connection strings — you must use the right one:
//
//  ❌ Direct connection  (Settings > Database > Connection string > URI)
//     postgresql://postgres:[password]@db.xxxx.supabase.co:5432/postgres
//     → Uses IPv6. Breaks on Render, Railway, Heroku. Only use for local dev.
//
//  ✅ Transaction pooler (Settings > Database > Connection pooling > URI, Mode: Transaction)
//     postgresql://postgres.xxxx:[password]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
//     → IPv4. Works on all hosts. Use this for deployed backends.
//
//  ✅ Session pooler    (Settings > Database > Connection pooling > URI, Mode: Session)
//     postgresql://postgres.xxxx:[password]@aws-0-us-east-1.pooler.supabase.com:5432/postgres
//     → IPv4, port 5432. Also fine for deployed backends.
//
// In your .env, DATABASE_URL should be the Transaction or Session pooler URL.

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set in .env');
  process.exit(1);
}

// Detect if the URL is accidentally the direct connection (contains db.xxxx.supabase.co)
const url = process.env.DATABASE_URL;
if (url.includes('.supabase.co') && !url.includes('.pooler.supabase.com')) {
  console.warn('⚠️  WARNING: DATABASE_URL looks like a direct Supabase connection.');
  console.warn('⚠️  This will fail on Render/Railway (IPv6 not supported).');
  console.warn('⚠️  Go to Supabase > Settings > Database > Connection Pooling and copy that URL instead.');
}

const pool = new Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false }, // Required for Supabase
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Unexpected DB pool error:', err.message);
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Database connection error:', err.message);
    console.error('   Check that DATABASE_URL in .env is the Connection Pooler URL (not direct).');
  } else {
    console.log('✅ Connected to Supabase PostgreSQL via pooler');
    release();
  }
});

module.exports = pool;
