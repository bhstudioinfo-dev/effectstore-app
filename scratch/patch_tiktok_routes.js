const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'backend', 'routes', 'tiktok.js');

let content = fs.readFileSync(file, 'utf8');

// 1. Add model import at the top
const importMarker = "const { authMiddleware } = require('../middleware/auth');";
const modelImport = "\nconst GiftMenuLayout = require('../models/GiftMenuLayout');";
if (content.includes(importMarker) && !content.includes("models/GiftMenuLayout")) {
    content = content.replace(importMarker, importMarker + modelImport);
}

// 2. Locate and replace the old singular endpoints block
const targetStart = "// Gift Menu Designer layout (local JSON storage, DB-independent)";
const targetEnd = "});" + "\n\n" + "module.exports = router;"; // wait, let's verify where it ends

const newRoutesCode = `// Gift Menu Designer layout (MongoDB and local sync for OBS)
router.get('/gift-menu-layouts', authMiddleware, async (req, res) => {
    try {
        const layouts = await GiftMenuLayout.find({ userId: req.userId, isTemplate: false }).sort({ updatedAt: -1 });
        res.json({ success: true, layouts });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/gift-menu-templates', async (_req, res) => {
    try {
        const templates = await GiftMenuLayout.find({ isTemplate: true }).sort({ updatedAt: -1 });
        res.json({ success: true, templates });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/gift-menu-layout', authMiddleware, async (req, res) => {
    try {
        let layout = await GiftMenuLayout.findOne({ userId: req.userId, isActive: true });
        if (!layout) {
            layout = await GiftMenuLayout.findOne({ userId: req.userId });
            if (layout) {
                layout.isActive = true;
                await layout.save();
            }
        }
        if (!layout) {
            layout = new GiftMenuLayout({
                userId: req.userId,
                name: 'Menu mặc định',
                aspectRatio: '9:16',
                items: [],
                exportedItems: [],
                isActive: true
            });
            await layout.save();
        }
        fs.writeFileSync(giftMenuLayoutPath, JSON.stringify(layout, null, 2), 'utf8');
        res.json({ success: true, layout });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/gift-menu-layout', authMiddleware, async (req, res) => {
    try {
        const payload = req.body || {};
        let layout = await GiftMenuLayout.findOne({ userId: req.userId, isActive: true });
        if (!layout && payload._id) {
            layout = await GiftMenuLayout.findById(payload._id);
        }
        if (!layout) {
            layout = new GiftMenuLayout({
                userId: req.userId,
                name: payload.name || 'Menu mặc định',
                isActive: true
            });
        }
        layout.aspectRatio = payload.aspectRatio || '9:16';
        layout.items = Array.isArray(payload.items) ? payload.items : [];
        layout.exportedItems = Array.isArray(payload.exportedItems) ? payload.exportedItems : [];
        await layout.save();
        fs.writeFileSync(giftMenuLayoutPath, JSON.stringify(layout, null, 2), 'utf8');
        res.json({ success: true, layout });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/gift-menu-layout/create', authMiddleware, async (req, res) => {
    try {
        const { name } = req.body;
        await GiftMenuLayout.updateMany({ userId: req.userId }, { isActive: false });
        const layout = new GiftMenuLayout({
            userId: req.userId,
            name: name || 'Thiết kế mới',
            aspectRatio: '9:16',
            items: [],
            exportedItems: [],
            isActive: true
        });
        await layout.save();
        fs.writeFileSync(giftMenuLayoutPath, JSON.stringify(layout, null, 2), 'utf8');
        res.json({ success: true, layout });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/gift-menu-layout/:layoutId/activate', authMiddleware, async (req, res) => {
    try {
        const { layoutId } = req.params;
        await GiftMenuLayout.updateMany({ userId: req.userId }, { isActive: false });
        const layout = await GiftMenuLayout.findOneAndUpdate(
            { _id: layoutId, userId: req.userId },
            { isActive: true },
            { new: true }
        );
        if (!layout) return res.status(404).json({ success: false, error: 'Layout not found' });
        fs.writeFileSync(giftMenuLayoutPath, JSON.stringify(layout, null, 2), 'utf8');
        res.json({ success: true, layout });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.delete('/gift-menu-layout/:layoutId', authMiddleware, async (req, res) => {
    try {
        const { layoutId } = req.params;
        const layout = await GiftMenuLayout.findOneAndDelete({ _id: layoutId, userId: req.userId });
        if (!layout) return res.status(404).json({ success: false, error: 'Layout not found' });
        if (layout.isActive) {
            const nextLayout = await GiftMenuLayout.findOne({ userId: req.userId });
            if (nextLayout) {
                nextLayout.isActive = true;
                await nextLayout.save();
                fs.writeFileSync(giftMenuLayoutPath, JSON.stringify(nextLayout, null, 2), 'utf8');
            } else {
                if (fs.existsSync(giftMenuLayoutPath)) fs.unlinkSync(giftMenuLayoutPath);
            }
        }
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/gift-menu-layout/publish', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        const isAdmin = !!(user && (user.isAdmin || user.email === 'admin@effectstore.vn'));
        if (!isAdmin) return res.status(403).json({ success: false, error: 'Unauthorized' });
        const activeLayout = await GiftMenuLayout.findOne({ userId: req.userId, isActive: true });
        if (!activeLayout) return res.status(400).json({ success: false, error: 'No active layout to publish' });
        const template = new GiftMenuLayout({
            name: activeLayout.name + ' - Template',
            aspectRatio: activeLayout.aspectRatio,
            items: activeLayout.items,
            exportedItems: activeLayout.exportedItems,
            isTemplate: true
        });
        await template.save();
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});`;

// Find everything from targetStart onwards and replace it up to module.exports = router;
const replaceRegex = /\/\/ Gift Menu Designer layout \(local JSON storage[\s\S]+?module\.exports = router;/;

if (replaceRegex.test(content)) {
    content = content.replace(replaceRegex, newRoutesCode + "\n\nmodule.exports = router;");
    console.log('Tiktok routes updated successfully via Regex');
} else {
    console.warn('Could not find replaceRegex in tiktok.js');
}

fs.writeFileSync(file, content, 'utf8');
console.log('Successfully completed tiktok.js routing updates');
