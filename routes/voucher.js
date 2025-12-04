const express = require('express');
const router = express.Router();
const pool = require('../utils/db');
const generateFakeEmail = require('../utils/fakeEmailGenerator');
const generateVoucherPDF = require('../utils/pdfGenerator');
const axios = require('axios');

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE_URL = process.env.PAYSTACK_BASE_URL;

// Purchase voucher
router.post('/purchase', async (req, res) => {
    try {
        const { name, phone, type } = req.body;
        if(!name || !phone || !type) return res.status(400).json({ msg: 'Missing fields' });

        // Get unsold voucher
        const voucher = await pool.query(
            'SELECT * FROM vouchers WHERE type=$1 AND sold=false LIMIT 1',
            [type]
        );

        if(voucher.rows.length === 0) return res.status(400).json({ msg: 'No vouchers available' });
        const selectedVoucher = voucher.rows[0];

        // Fake email for Paystack
        const email = generateFakeEmail(name);

        // Create Paystack payment
        const paystackResponse = await axios.post(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
            email,
            amount: 2500, // 25 cedis -> NGN equivalent depends on Paystack settings
            callback_url: 'https://waecevouchershub.vercel.app/voucher/success',
            metadata: {
                voucherId: selectedVoucher.id,
                purchaserName: name,
                purchaserPhone: phone
            }
        }, {
            headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` }
        });

        res.json({ authorization_url: paystackResponse.data.data.authorization_url });

    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server error' });
    }
});

// Voucher retrieval (after successful payment)
router.get('/retrieve/:serial', async (req,res) => {
    try {
        const { serial } = req.params;
        const voucher = await pool.query('SELECT * FROM vouchers WHERE serial_number=$1', [serial]);
        if(voucher.rows.length === 0) return res.status(404).json({ msg: 'Voucher not found' });
        res.json(voucher.rows[0]);
    } catch(err) {
        console.error(err);
        res.status(500).json({ msg: 'Server error' });
    }
});

module.exports = router;
