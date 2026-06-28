const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'backend', 'routes', 'tiktok.js');

let content = fs.readFileSync(file, 'utf8');

const goalBoardRoutes = `
// Goal Board mock/fallback routes to avoid frontend console crashes
router.get('/goal-board/assets', authMiddleware, async (req, res) => {
    res.json({ success: true, assets: [] });
});

router.get('/goal-board/templates', authMiddleware, async (req, res) => {
    res.json({ success: true, customTemplates: [] });
});

router.post('/goal-board/upload-asset', authMiddleware, async (req, res) => {
    res.json({ success: true, asset: null });
});

module.exports = router;`;

if (content.includes('module.exports = router;')) {
    content = content.replace('module.exports = router;', goalBoardRoutes);
    console.log('Successfully added goal-board mock routes');
} else {
    console.warn('Could not locate module.exports = router; in tiktok.js');
}

fs.writeFileSync(file, content, 'utf8');
console.log('Done');
