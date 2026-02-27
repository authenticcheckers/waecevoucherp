const express = require('express');
const router = express.Router();
const pool = require('../utils/db');
const generateFakeEmail = require('../utils/fakeEmailGenerator');
const axios = require('axios');

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE_URL = 'https://api.paystack.co';

// ─── POST /api/voucher/purchase ───────────────────────────────
router.post('/purchase', async (req, res) => {
    try {
        const { name, phone, type } = req.body;
        if (!name || !phone || !type)
            return res.status(400).json({ message: 'Missing required fields.' });

        const normalizedType = type.toUpperCase();

        const voucherRes = await pool.query(
            'SELECT * FROM vouchers WHERE type=$1 AND sold=false LIMIT 1',
            [normalizedType]
        );
        if (voucherRes.rows.length === 0)
            return res.status(400).json({ message: `No ${type} vouchers available right now.` });

        const selectedVoucher = voucherRes.rows[0];
        const email = generateFakeEmail(name);

        const paystackResponse = await axios.post(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
            email,
            amount: 2500,
            currency: 'GHS',
            callback_url: `${process.env.FRONTEND_URL}/success`,
            metadata: {
                voucherId: selectedVoucher.id,
                voucherType: normalizedType,
                purchaserName: name,
                purchaserPhone: phone,
                cancel_action: `${process.env.FRONTEND_URL}/`
            }
        }, {
            headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' }
        });

        res.json({ authorization_url: paystackResponse.data.data.authorization_url });
    } catch (err) {
        console.error('Purchase Error:', err.response?.data || err.message);
        res.status(500).json({ message: 'Payment initialization failed. Please try again.' });
    }
});

// ─── GET /api/voucher/verify?reference=xxx ────────────────────
// Called by success page after Paystack redirect
router.get('/verify', async (req, res) => {
    try {
        const { reference } = req.query;
        if (!reference) return res.status(400).json({ message: 'Reference required.' });

        // Verify with Paystack
        const verifyRes = await axios.get(`${PAYSTACK_BASE_URL}/transaction/verify/${reference}`, {
            headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` }
        });
        const txData = verifyRes.data.data;

        if (txData.status !== 'success')
            return res.status(402).json({ message: 'Payment was not successful.', status: txData.status });

        const { voucherId, voucherType, purchaserName, purchaserPhone } = txData.metadata;

        // Idempotent update — safe to call multiple times for the same reference
        const updateRes = await pool.query(
            `UPDATE vouchers
             SET sold               = true,
                 purchaser_name     = $1,
                 purchaser_phone    = $2,
                 paystack_reference = $3,
                 purchased_at       = COALESCE(purchased_at, NOW())
             WHERE id = $4
             RETURNING serial_number, pin, type`,
            [purchaserName, purchaserPhone, reference, voucherId]
        );

        if (updateRes.rows.length === 0)
            return res.status(404).json({ message: 'Voucher record not found.' });

        const voucher = updateRes.rows[0];
        res.json({
            success: true,
            serial_number: voucher.serial_number,
            pin: voucher.pin,
            type: voucher.type || voucherType,
            purchaser_name: purchaserName,
        });
    } catch (err) {
        console.error('Verify Error:', err.response?.data || err.message);
        res.status(500).json({ message: 'Verification failed. If you were debited, recover your voucher using your MoMo number on the home page.' });
    }
});

// ─── GET /api/voucher/retrieve/phone/:phone ───────────────────
// Returns all vouchers purchased with a given MoMo number
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
// Serial fallback
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
