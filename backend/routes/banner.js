const express = require('express');
const router = express.Router();
const Banner = require('../models/Banner');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const bannersDir = path.join(__dirname, '..', 'uploads', 'banners');
if (!fs.existsSync(bannersDir)) {
    fs.mkdirSync(bannersDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/temp/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Get active banner
router.get('/', async (req, res) => {
    try {
        const banner = await Banner.findOne({ isActive: true });
        res.json({ 
            success: true, 
            hasBanner: !!banner,
            banner: banner ? { url: banner.publicUrl } : null 
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Admin: Upload banner
router.post('/', authMiddleware, adminMiddleware, upload.single('banner'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Vui lòng chọn file ảnh' });
        }
        
        const timestamp = Date.now();
        const fileName = `banner-${timestamp}${path.extname(req.file.originalname)}`;
        const bannerPath = path.join(bannersDir, fileName);
        
        fs.copyFileSync(req.file.path, bannerPath);
        
        const oldBanner = await Banner.findOne({ isActive: true });
        if (oldBanner && fs.existsSync(oldBanner.filePath)) {
            try { fs.unlinkSync(oldBanner.filePath); } catch (e) {}
        }
        
        const banner = await Banner.findOneAndUpdate(
            { isActive: true },
            {
                filePath: bannerPath,
                publicUrl: `/uploads/banners/${fileName}`,
                uploadedAt: new Date(),
                isActive: true
            },
            { upsert: true, new: true }
        );
        
        try { fs.unlinkSync(req.file.path); } catch (e) {}
        
        res.json({ success: true, banner });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Admin: Delete banner
router.delete('/', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const banner = await Banner.findOne({ isActive: true });
        if (banner && fs.existsSync(banner.filePath)) {
            try { fs.unlinkSync(banner.filePath); } catch (e) {}
        }
        await Banner.deleteMany({});
        res.json({ success: true, message: 'Đã xóa banner' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
