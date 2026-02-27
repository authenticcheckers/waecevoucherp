const express = require('express');
const router  = express.Router();
const pool    = require('../utils/db');
const generateFakeEmail = require('../utils/fakeEmailGenerator');
const axios   = require('axios');

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE_URL   = 'https://api.paystack.co';
const UNIT_PRICE_PESEWAS  = 2500; // ₵25 in pesewas

// ─── POST /api/voucher/purchase ───────────────────────────────
router.post('/purchase', async (req, res) => {
  try {
    const { name, phone, type, qty = 1 } = req.body;

    if (!name || !phone || !type)
      return res.status(400).json({ message: 'Missing required fields.' });

    const quantity = parseInt(qty);
    if (isNaN(quantity) || quantity < 1 || quantity > 10)
      return res.status(400).json({ message: 'Quantity must be between 1 and 10.' });

    const normalizedType = type.toUpperCase();

    // Check there are enough unsold vouchers available
    const availableRes = await pool.query(
      'SELECT id FROM vouchers WHERE type=$1 AND sold=false ORDER BY id ASC LIMIT $2',
      [normalizedType, quantity]
    );

    if (availableRes.rows.length < quantity) {
      const has = availableRes.rows.length;
      return res.status(400).json({
        message: has === 0
          ? `No ${normalizedType} vouchers are currently available.`
          : `Only ${has} ${normalizedType} voucher${has === 1 ? '' : 's'} left in stock. Please reduce your quantity.`
      });
    }

    const voucherIds = availableRes.rows.map(r => r.id);
    const email      = generateFakeEmail(name);
    const totalAmount = quantity * UNIT_PRICE_PESEWAS;

    const paystackResponse = await axios.post(
      `${PAYSTACK_BASE_URL}/transaction/initialize`,
      {
        email,
        amount:       totalAmount,
        currency:     'GHS',
        callback_url: `${process.env.FRONTEND_URL}/success`,
        metadata: {
          voucherIds,          // array of IDs to mark sold on verify
          voucherType:   normalizedType,
          quantity,
          purchaserName: name,
          purchaserPhone: phone,
          cancel_action: `${process.env.FRONTEND_URL}/`
        }
      },
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' } }
    );

    res.json({ authorization_url: paystackResponse.data.data.authorization_url });
  } catch (err) {
    console.error('Purchase Error:', err.response?.data || err.message);
    res.status(500).json({ message: 'Payment initialization failed. Please try again.' });
  }
});

// ─── GET /api/voucher/verify?reference=xxx ────────────────────
router.get('/verify', async (req, res) => {
  try {
    const { reference } = req.query;
    if (!reference) return res.status(400).json({ message: 'Reference required.' });

    const verifyRes = await axios.get(
      `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } }
    );
    const txData = verifyRes.data.data;

    if (txData.status !== 'success')
      return res.status(402).json({ message: 'Payment was not successful.', status: txData.status });

    const { voucherIds, voucherType, purchaserName, purchaserPhone, quantity } = txData.metadata;

    // Support both old (single voucherId) and new (array voucherIds) format
    const ids = Array.isArray(voucherIds)
      ? voucherIds
      : [txData.metadata.voucherId].filter(Boolean);

    if (!ids.length)
      return res.status(400).json({ message: 'No voucher IDs found in payment metadata.' });

    // Idempotent bulk update — mark all vouchers as sold
    const updateRes = await pool.query(
      `UPDATE vouchers
       SET sold               = true,
           purchaser_name     = $1,
           purchaser_phone    = $2,
           paystack_reference = $3,
           purchased_at       = COALESCE(purchased_at, NOW())
       WHERE id = ANY($4::bigint[])
       RETURNING serial_number, pin, type`,
      [purchaserName, purchaserPhone, reference, ids]
    );

    if (updateRes.rows.length === 0)
      return res.status(404).json({ message: 'Voucher records not found.' });

    res.json({
      success:        true,
      vouchers:       updateRes.rows,   // array — frontend iterates over these
      type:           updateRes.rows[0].type || voucherType,
      purchaser_name: purchaserName,
      quantity:       updateRes.rows.length,
    });
  } catch (err) {
    console.error('Verify Error:', err.response?.data || err.message);
    res.status(500).json({ message: 'Verification failed. If you were debited, recover your vouchers using your MoMo number on the home page.' });
  }
});

// ─── GET /api/voucher/retrieve/phone/:phone ───────────────────
router.get('/retrieve/phone/:phone', async (req, res) => {
  try {
    const phone = decodeURIComponent(req.params.phone).replace(/\s+/g, '');
    const result = await pool.query(
      `SELECT serial_number, pin, type, purchased_at
       FROM vouchers
       WHERE purchaser_phone = $1 AND sold = true
       ORDER BY purchased_at DESC`,
      [phone]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ message: 'No vouchers found for this number. Make sure you enter the exact MoMo number used when you paid.' });
    res.json(result.rows);
  } catch (err) {
    console.error('Phone Retrieval Error:', err);
    res.status(500).json({ message: 'Server error during retrieval.' });
  }
});

// ─── GET /api/voucher/retrieve/:serial ───────────────────────
router.get('/retrieve/:serial', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT serial_number, pin, type, sold, purchased_at FROM vouchers WHERE serial_number=$1',
      [req.params.serial]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ message: 'Voucher not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// ─── GET /api/voucher/stock ───────────────────────────────────
router.get('/stock', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT type, COUNT(*) AS available FROM vouchers WHERE sold = false GROUP BY type`
    );
    const stock = {};
    result.rows.forEach(r => { stock[r.type] = parseInt(r.available); });
    res.json(stock);
  } catch (err) {
    res.status(500).json({ message: 'Could not fetch stock.' });
  }
});

module.exports = router;
