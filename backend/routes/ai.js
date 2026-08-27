const express = require('express');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');
const aiAssistantService = require('../services/aiAssistantService');
const { getStatus, setSecret } = require('../services/systemAiSecretService');
const { moderateText } = require('../services/contentSafetyService');
const User = require('../models/User');

const router = express.Router();
const aiLimiter = createRateLimiter({ windowMs: 60000, max: 30, message: 'Quá nhiều yêu cầu AI. Vui lòng thử lại sau.' });
const adminLimiter = createRateLimiter({ windowMs: 60000, max: 10, message: 'Quá nhiều lần cập nhật. Vui lòng thử lại sau.' });

async function ensureCurrentAiMonth(user, userId) {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (user.aiMonthKey !== monthKey) {
        await User.updateOne(
            { _id: userId, aiMonthKey: { $ne: monthKey } },
            { $set: { aiMonthKey: monthKey, usedCharactersThisMonth: 0, usedSystemVoiceCharactersThisMonth: 0 } }
        );
        user.aiMonthKey = monthKey;
        user.usedCharactersThisMonth = 0;
        user.usedSystemVoiceCharactersThisMonth = 0;
    }
    return monthKey;
}

router.get('/admin/status', authMiddleware, adminMiddleware, async (_req, res) => {
    try {
        res.json({ success: true, status: await getStatus() });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/admin/secrets', authMiddleware, adminMiddleware, adminLimiter, async (req, res) => {
    try {
        const geminiKey = String(req.body?.geminiKey || '').trim();
        const elevenLabsKey = String(req.body?.elevenLabsKey || '').trim();
        if (!geminiKey && !elevenLabsKey) return res.status(400).json({ success: false, error: 'Không có API key mới để lưu.' });
        if (geminiKey) await setSecret('gemini', geminiKey, req.userId);
        if (elevenLabsKey) await setSecret('elevenlabs', elevenLabsKey, req.userId);
        res.json({ success: true, message: 'Đã cập nhật API key an toàn.', status: await getStatus() });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

router.post('/reply', authMiddleware, aiLimiter, async (req, res) => {
    try {
        const username = String(req.body?.username || 'Khán giả').slice(0, 80);
        const comment = String(req.body?.comment || '').slice(0, 500);
        const persona = ['sassy', 'funny', 'sweet', 'smart'].includes(req.body?.persona) ? req.body.persona : 'sassy';
        if (!comment || !moderateText(comment).allowed) return res.status(422).json({ success: false, error: 'Nội dung không phù hợp.' });
        await ensureCurrentAiMonth(req.user, req.userId);
        const usage = aiAssistantService.getCharacterUsage(req.user);
        if (usage.responseMode === 'exhausted') return res.status(402).json({ success: false, error: 'Đã hết hạn mức Trợ lý AI tháng này.' });
        const replyText = await aiAssistantService.generateReply(username, comment, { persona });
        if (!replyText || !moderateText(replyText, { output: true }).allowed) return res.status(422).json({ success: false, error: 'Không thể tạo phản hồi an toàn.' });
        res.json({ success: true, replyText });
    } catch (error) {
        res.status(503).json({ success: false, error: 'Dịch vụ AI tạm thời chưa sẵn sàng.' });
    }
});

router.post('/speech', authMiddleware, aiLimiter, async (req, res) => {
    let reservedCharacters = 0;
    try {
        const text = String(req.body?.text || '').trim().slice(0, 500);
        const voiceId = String(req.body?.voiceId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
        const isTest = Boolean(req.body?.isTest);
        if (!text || !voiceId || !moderateText(text, { output: true }).allowed) return res.status(422).json({ success: false, error: 'Yêu cầu giọng đọc không hợp lệ.' });
        await ensureCurrentAiMonth(req.user, req.userId);
        const usage = aiAssistantService.getCharacterUsage(req.user);
        if (!usage.isAdmin && !isTest) {
            reservedCharacters = text.length;
            if (!usage.hasQuota || reservedCharacters > usage.remaining) {
                return res.status(402).json({ success: false, error: 'Đã hết hạn mức giọng tùy chỉnh tháng này.' });
            }
            const reservation = await User.updateOne(
                {
                    _id: req.userId,
                    aiMonthKey: usage.monthKey,
                    usedCharactersThisMonth: { $lte: usage.totalLimit - reservedCharacters }
                },
                { $inc: { usedCharactersThisMonth: reservedCharacters } }
            );
            if (reservation.modifiedCount !== 1) {
                return res.status(409).json({ success: false, error: 'Hạn mức vừa được sử dụng bởi một yêu cầu khác.' });
            }
        }
        const audio = await aiAssistantService.synthesizeElevenLabs(text, { elevenLabsVoiceId: voiceId });
        if (!audio?.audioDataUrl) {
            if (reservedCharacters) await User.updateOne({ _id: req.userId }, { $inc: { usedCharactersThisMonth: -reservedCharacters } });
            return res.status(503).json({ success: false, error: 'Dịch vụ giọng đọc chưa được cấu hình.' });
        }
        try {
            const persona = String(req.body?.persona || 'sassy').trim();
            const base64Data = audio.audioDataUrl.split(',')[1];
            if (base64Data) {
                const audioBuffer = Buffer.from(base64Data, 'base64');
                const targetDirs = [
                    path.join(__dirname, '../public/assets/audio/voice-samples'),
                    path.join(__dirname, '../../desktop/renderer/assets/audio/voice-samples')
                ];
                for (const dir of targetDirs) {
                    try {
                        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                        fs.writeFileSync(path.join(dir, `${persona}_${voiceId}.mp3`), audioBuffer);
                        fs.writeFileSync(path.join(dir, `${voiceId}.mp3`), audioBuffer);
                        fs.writeFileSync(path.join(dir, `sample_${voiceId}.mp3`), audioBuffer);
                    } catch (_writeErr) {}
                }
                const { uploadVoiceSample } = require('../services/effectAssetStore');
                uploadVoiceSample(`${persona}_${voiceId}.mp3`, audioBuffer).catch(() => {});
                uploadVoiceSample(`${voiceId}.mp3`, audioBuffer).catch(() => {});
                uploadVoiceSample(`sample_${voiceId}.mp3`, audioBuffer).catch(() => {});
            }
        } catch (_cacheErr) {}
        res.setHeader('Cache-Control', 'no-store');
        res.json({ success: true, voiceId: audio.voiceId, audioDataUrl: audio.audioDataUrl });
    } catch (_error) {
        if (reservedCharacters) await User.updateOne({ _id: req.userId }, { $inc: { usedCharactersThisMonth: -reservedCharacters } }).catch(() => {});
        res.status(503).json({ success: false, error: 'Dịch vụ giọng đọc tạm thời chưa sẵn sàng.' });
    }
});

module.exports = router;
