const express = require('express');
const router = express.Router();
const Banner = require('../models/Banner');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { paths: dataPaths } = require('../config/dataPaths');

const bannersDir = dataPaths.bannersDir;
if (!fs.existsSync(bannersDir)) {
    fs.mkdirSync(bannersDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dataPaths.tempDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 5 },
    fileFilter: (_req, file, callback) => {
        const allowed = new Set(['.png', '.jpg', '.jpeg', '.webp']).has(path.extname(file.originalname || '').toLowerCase());
        callback(allowed ? null : new Error('Unsupported banner image.'), allowed);
    }
});

const CLOUD_URL = process.env.CLOUD_API_URL || '';

// Get active banner
router.get('/', async (req, res) => {
    try {
        const banner = await Banner.findOne({ isActive: true });
        if (banner && banner.publicUrl) {
            return res.json({ 
                success: true, 
                hasBanner: true,
                banner: { url: banner.publicUrl } 
            });
        }

        // Fallback: If local desktop database has no banner record, fetch from Cloud Render
        try {
            if (!CLOUD_URL) throw new Error('Cloud disabled');
            const cloudRes = await fetch(`${CLOUD_URL}/api/banner`, { signal: AbortSignal.timeout(3000) }).catch(() => null);
            if (cloudRes && cloudRes.ok) {
                const cloudData = await cloudRes.json().catch(() => ({}));
                if (cloudData.success && cloudData.banner && cloudData.banner.url) {
                    const fullCloudUrl = cloudData.banner.url.startsWith('http')
                        ? cloudData.banner.url
                        : `${CLOUD_URL}${cloudData.banner.url.startsWith('/') ? '' : '/'}${cloudData.banner.url}`;
                    return res.json({
                        success: true,
                        hasBanner: true,
                        banner: { url: fullCloudUrl }
                    });
                }
            }
        } catch (_err) {}

        res.json({ 
            success: true, 
            hasBanner: false,
            banner: null 
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

        const { uploadBanner, deleteBanner } = require('../services/effectAssetStore');
        try {
            await uploadBanner(fileName, bannerPath);
        } catch (r2Err) {
            console.error('Failed to sync banner to R2:', r2Err.message);
        }
        
        const oldBanner = await Banner.findOne({ isActive: true });
        if (oldBanner) {
            if (fs.existsSync(oldBanner.filePath)) {
                try { fs.unlinkSync(oldBanner.filePath); } catch (e) {}
            }
            if (oldBanner.publicUrl) {
                const oldFileName = path.basename(oldBanner.publicUrl);
                try { await deleteBanner(oldFileName); } catch (e) {}
            }
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
        if (banner) {
            if (fs.existsSync(banner.filePath)) {
                try { fs.unlinkSync(banner.filePath); } catch (e) {}
            }
            if (banner.publicUrl) {
                const { deleteBanner } = require('../services/effectAssetStore');
                const oldFileName = path.basename(banner.publicUrl);
                try { await deleteBanner(oldFileName); } catch (e) {}
            }
        }
        await Banner.deleteMany({});
        res.json({ success: true, message: 'Đã xóa banner' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.use((error, _req, res, next) => {
    if (error instanceof multer.MulterError || error?.message === 'Unsupported banner image.') {
        return res.status(400).json({ success: false, error: error.message });
    }
    return next(error);
});

module.exports = router;
