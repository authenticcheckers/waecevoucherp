const express = require('express');
const router = express.Router();
const pool = require('../utils/db');
const generateVoucherPDF = require('../utils/pdfGenerator');

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

// Paystack webhook
router.post('/webhook', async (req,res) => {
    const event = req.body;
    // Verify the event with Paystack signature if needed
    if(event.event === 'charge.success') {
        const { metadata } = event.data;
        const { voucherId, purchaserName, purchaserPhone } = metadata;

        // Update voucher
        const voucherRes = await pool.query('UPDATE vouchers SET sold=true, purchaser_name=$1, purchaser_phone=$2, purchased_at=NOW() WHERE id=$3 RETURNING *',
        [purchaserName, purchaserPhone, voucherId]);

        const voucher = voucherRes.rows[0];

        // Generate PDF
        await generateVoucherPDF(voucher.serial_number, voucher.pin);
    }
    res.sendStatus(200);
});

module.exports = router;
