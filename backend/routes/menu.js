const express = require('express');
const router = express.Router();
const GiftMenu = require('../models/GiftMenu');
const { authMiddleware } = require('../middleware/auth');
const path = require('path');

// Save or Update Menu
router.post('/save', authMiddleware, async (req, res) => {
    try {
        const { id, name, elements, config } = req.body;
        const userId = req.userId;

        if (id) {
            // Update existing
            const menu = await GiftMenu.findOneAndUpdate(
                { _id: id, userId },
                { name, elements, config, updatedAt: Date.now() },
                { new: true }
            );
            return res.json({ success: true, menu });
        } else {
            // Create new
            const newMenu = new GiftMenu({
                userId, name, elements, config
            });
            await newMenu.save();
            return res.json({ success: true, menu: newMenu });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// List User Menus
router.get('/list', authMiddleware, async (req, res) => {
    try {
        const menus = await GiftMenu.find({ userId: req.userId }).sort({ updatedAt: -1 });
        res.json({ success: true, menus });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete Menu
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        await GiftMenu.findOneAndDelete({ _id: req.params.id, userId: req.userId });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
