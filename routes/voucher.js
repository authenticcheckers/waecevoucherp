const express = require('express');
const router = express.Router();
const pool = require('../utils/db');
const generateFakeEmail = require('../utils/fakeEmailGenerator');
const axios = require('axios');

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE_URL = 'https://api.paystack.co'; // Standard Paystack API URL

// Purchase voucher
router.post('/purchase', async (req, res) => {
    try {
        const { name, phone, type } = req.body;

        // 1. Validate fields
        if (!name || !phone || !type) {
            return res.status(400).json({ msg: 'Missing required fields: name, phone, or type' });
        }

        // 2. Get an available (unsold) voucher from the database
        const voucherRes = await pool.query(
            'SELECT * FROM vouchers WHERE type=$1 AND sold=false LIMIT 1',
            [type.toUpperCase()]
        );

        if (voucherRes.rows.length === 0) {
            return res.status(400).json({ msg: `Sorry, no ${type} vouchers are currently available.` });
        }

        const selectedVoucher = voucherRes.rows[0];

        // 3. Generate fake email for Paystack compatibility
        const email = generateFakeEmail(name);

        // 4. Initialize Paystack Transaction
        // 
        // Inside your /purchase route in Express
const paystackResponse = await axios.post(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
    email,
    amount: 2500,
    currency: "GHS",
    // 1. DYNAMIC ORIGIN: Instead of hardcoding, let's make it smarter.
    // Use the origin from the request or a verified env variable.
    callback_url: `${process.env.FRONTEND_URL}/success`, 
    metadata: {
        voucherId: selectedVoucher.id,
        purchaserName: name,
        purchaserPhone: phone
    }
}, {
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        // 5. Send the authorization URL to the frontend for redirection
        res.json({ authorization_url: paystackResponse.data.data.authorization_url });

    } catch (err) {
        console.error("Paystack Initialization Error:", err.response?.data || err.message);
        res.status(500).json({ msg: 'Payment initialization failed. Please try again.' });
    }
});

// Voucher retrieval (by serial number)
router.get('/retrieve/:serial', async (req, res) => {
    try {
        const { serial } = req.params;
        const voucher = await pool.query(
            'SELECT serial_number, pin, type, sold, purchased_at FROM vouchers WHERE serial_number=$1', 
            [serial]
        );
        
        if (voucher.rows.length === 0) {
            return res.status(404).json({ msg: 'Voucher not found' });
        }
        
        res.json(voucher.rows[0]);
    } catch (err) {
        console.error("Retrieval Error:", err);
        res.status(500).json({ msg: 'Server error during retrieval' });
    }
});

module.exports = router;
