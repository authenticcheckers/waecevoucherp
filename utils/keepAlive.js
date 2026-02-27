const https = require('https');
const http  = require('http');
const pool  = require('./db');

const RENDER_URL  = process.env.RENDER_URL;   // e.g. https://waecevoucaherp.onrender.com
const PING_INTERVAL_MS = 2 * 60 * 1000;       // every 2 minutes

function pingServer() {
  if (!RENDER_URL) return;

  const url = `${RENDER_URL}/health`;
  const lib = url.startsWith('https') ? https : http;

  const req = lib.get(url, (res) => {
    console.log(`[keep-alive] Pinged ${url} → ${res.statusCode}`);
  });

  req.on('error', (err) => {
    console.warn(`[keep-alive] Ping failed: ${err.message}`);
  });

  req.end();
}

async function pingDatabase() {
  try {
    await pool.query('SELECT 1');
    console.log('[keep-alive] DB heartbeat OK');
  } catch (err) {
    console.warn(`[keep-alive] DB heartbeat failed: ${err.message}`);
  }
}

function startKeepAlive() {
  if (!RENDER_URL) {
    console.log('[keep-alive] RENDER_URL not set — skipping keep-alive (fine for local dev)');
    return;
  }

  console.log(`[keep-alive] Starting — pinging every ${PING_INTERVAL_MS / 1000}s`);

  setInterval(() => {
    pingServer();
    pingDatabase();
  }, PING_INTERVAL_MS);

  // First ping after 30s so the server is fully up
  setTimeout(() => {
    pingServer();
    pingDatabase();
  }, 30_000);
}

module.exports = startKeepAlive;
