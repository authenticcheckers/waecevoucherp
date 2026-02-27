const express    = require('express');
const bodyParser = require('body-parser');
const cors       = require('cors');
require('dotenv').config();

const voucherRoutes = require('./routes/voucher');
const adminRoutes   = require('./routes/admin');
const paymentRoutes = require('./routes/payment');
const startKeepAlive = require('./utils/keepAlive');

const app = express();

app.use(cors());
app.use(bodyParser.json());

// ── Health check endpoint ─────────────────────────────────────
// Render and the keep-alive pinger both hit this.
// Also does a lightweight DB check so Supabase stays warm.
app.get('/health', async (req, res) => {
  try {
    const pool = require('./utils/db');
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', ts: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: 'error', db: err.message });
  }
});

// ── Routes ────────────────────────────────────────────────────
app.use('/api/voucher',  voucherRoutes);
app.use('/api/admin',    adminRoutes);
app.use('/api/payment',  paymentRoutes);

// ── Start ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  startKeepAlive();
});
