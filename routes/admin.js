const express = require('express');
const router = express.Router();
const pool = require('../utils/db');

// Simple admin auth middleware — set ADMIN_SECRET in your .env
const auth = (req, res, next) => {
    const key = req.headers['x-admin-key'];
    if (!key || key !== process.env.ADMIN_SECRET) {
        return res.status(401).json({ message: 'Unauthorized.' });
    }
    next();
};

// ─── POST /api/admin/upload ───────────────────────────────────
// Bulk upload vouchers from JSON array: [{serial_number, pin, type}]
router.post('/upload', auth, async (req, res) => {
    try {
        const { vouchers } = req.body;
        if (!vouchers || !Array.isArray(vouchers) || vouchers.length === 0)
            return res.status(400).json({ message: 'Send an array of vouchers.' });

        const query = `
            INSERT INTO vouchers (serial_number, pin, type)
            VALUES ($1, $2, $3)
            ON CONFLICT (serial_number) DO NOTHING
        `;
        let inserted = 0;
        for (const v of vouchers) {
            if (!v.serial_number || !v.pin || !v.type) continue;
            const r = await pool.query(query, [v.serial_number, v.pin, v.type.toUpperCase()]);
            if (r.rowCount > 0) inserted++;
        }
        res.json({ message: `Uploaded ${inserted} new vouchers (${vouchers.length - inserted} duplicates skipped).` });
    } catch (err) {
        console.error('Upload Error:', err);
        res.status(500).json({ message: 'Server error during upload.' });
    }
});

// ─── GET /api/admin/sales ─────────────────────────────────────
// All sold vouchers ordered by most recent
router.get('/sales', auth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, serial_number, type, purchaser_name, purchaser_phone,
                   paystack_reference, purchased_at, 25.00 AS amount_ghs
            FROM vouchers
            WHERE sold = true
            ORDER BY purchased_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ message: 'Server error.' });
    }
});

// ─── GET /api/admin/stats ─────────────────────────────────────
// Dashboard summary: total revenue, stock levels, daily breakdown
router.get('/stats', auth, async (req, res) => {
    try {
        const [stockRes, revenueRes, dailyRes] = await Promise.all([
            pool.query(`
                SELECT type,
                       COUNT(*) FILTER (WHERE sold = false) AS available,
                       COUNT(*) FILTER (WHERE sold = true)  AS sold_count,
                       COUNT(*)                              AS total
                FROM vouchers GROUP BY type
            `),
            pool.query(`
                SELECT COUNT(*) AS total_sold, COUNT(*) * 25 AS total_revenue_ghs
                FROM vouchers WHERE sold = true
            `),
            pool.query(`
                SELECT DATE(purchased_at AT TIME ZONE 'Africa/Accra') AS sale_date,
                       type, COUNT(*) AS vouchers_sold, COUNT(*) * 25 AS revenue_ghs
                FROM vouchers WHERE sold = true
                GROUP BY sale_date, type
                ORDER BY sale_date DESC
                LIMIT 30
            `)
        ]);

        res.json({
            stock:         stockRes.rows,
            revenue:       revenueRes.rows[0],
            daily:         dailyRes.rows,
        });
    } catch (err) {
        console.error('Stats Error:', err);
        res.status(500).json({ message: 'Server error.' });
    }
});

// ─── DELETE /api/admin/voucher/:id ───────────────────────────
// Remove a specific voucher (e.g. invalid ones)
router.delete('/voucher/:id', auth, async (req, res) => {
    try {
        const result = await pool.query(
            'DELETE FROM vouchers WHERE id=$1 AND sold=false RETURNING id',
            [req.params.id]
        );
        if (result.rowCount === 0)
            return res.status(404).json({ message: 'Voucher not found or already sold.' });
        res.json({ message: 'Voucher deleted.' });
    } catch (err) {
        res.status(500).json({ message: 'Server error.' });
    }
});

module.exports = router;
