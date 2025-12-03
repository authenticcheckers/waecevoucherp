const express = require('express');
const router = express.Router();
const pool = require('../utils/db');

// Upload vouchers in bulk
router.post('/upload', async (req,res) => {
    try {
        const { vouchers } = req.body; // Array of {serial_number, pin, type}
        if(!vouchers || !Array.isArray(vouchers)) return res.status(400).json({ msg: 'Invalid data' });

        const query = 'INSERT INTO vouchers (serial_number, pin, type) VALUES ($1,$2,$3) ON CONFLICT (serial_number) DO NOTHING';
        for(const v of vouchers) {
            await pool.query(query, [v.serial_number, v.pin, v.type]);
        }
        res.json({ msg: 'Vouchers uploaded successfully' });
    } catch(err) {
        console.error(err);
        res.status(500).json({ msg: 'Server error' });
    }
});

// Track sales
router.get('/sales', async (req,res) => {
    try {
        const sales = await pool.query('SELECT * FROM vouchers WHERE sold=true ORDER BY purchased_at DESC');
        res.json(sales.rows);
    } catch(err) {
        console.error(err);
        res.status(500).json({ msg: 'Server error' });
    }
});

module.exports = router;
