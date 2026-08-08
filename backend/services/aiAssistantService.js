const fs = require('fs');
const path = require('path');
const https = require('https');
const { paths: dataPaths } = require('../config/dataPaths');

const dataDir = dataPaths?.dataRoot || path.resolve(__dirname, '..');
const CONFIG_FILE = path.join(dataDir, 'uploads', 'ai-assistant-config.json');

const DEFAULT_CONFIG = {
    enabled: false,
    persona: 'sassy', // 'sassy' | 'funny' | 'sweet' | 'smart'
    cooldownSeconds: 20,
    donatorOnly: false,
    geminiApiKey: '',
    elevenLabsApiKey: '',
    elevenLabsVoiceId: '21m00Tcm4TlvDq8ikWAM', // default voice
    ttsEngine: 'webspeech', // 'webspeech' | 'elevenlabs'
    readSpeed: 1.0,
    volume: 1.0,
    usedCharactersThisMonth: 0,
    addonCharacters: 0,
    monthKey: ''
};

let currentConfig = { ...DEFAULT_CONFIG };

const PLAN_LIMITS = {
    free: 1000,
    basic: 3000,
    pro: 10000,
    admin: 999999999
};

function getCharacterUsage(userPlan = 'free') {
    loadConfig();
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    if (currentConfig.monthKey !== monthKey) {
        currentConfig.monthKey = monthKey;
        currentConfig.usedCharactersThisMonth = 0;
        saveConfig(currentConfig);
    }
    
    if (userPlan === 'admin' || userPlan === 'ADMIN') {
        return {
            used: Number(currentConfig.usedCharactersThisMonth || 0),
            baseLimit: 999999999,
            addon: 0,
            totalLimit: 999999999,
            remaining: 999999999,
            hasQuota: true,
            isAdmin: true,
            monthKey
        };
    }

    const baseLimit = PLAN_LIMITS[userPlan] || PLAN_LIMITS.free;
    const addon = Number(currentConfig.addonCharacters || 0);
    const totalLimit = baseLimit + addon;
    const used = Number(currentConfig.usedCharactersThisMonth || 0);
    
    return {
        used,
        baseLimit,
        addon,
        totalLimit,
        remaining: Math.max(0, totalLimit - used),
        hasQuota: used < totalLimit,
        monthKey
    };
}

function recordCharacterUsage(count) {
    currentConfig.usedCharactersThisMonth = (currentConfig.usedCharactersThisMonth || 0) + count;
    saveConfig(currentConfig);
}

function addAddonCharacters(addonCount) {
    currentConfig.addonCharacters = (currentConfig.addonCharacters || 0) + addonCount;
    saveConfig(currentConfig);
    return getCharacterUsage();
}

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
            currentConfig = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
        }
    } catch (e) {
        console.error('Load AI Assistant config error:', e.message);
    }
    return currentConfig;
}

function saveConfig(newConfig) {
    try {
        const geminiApiKey = (newConfig.geminiApiKey !== undefined && newConfig.geminiApiKey !== '') ? newConfig.geminiApiKey : currentConfig.geminiApiKey;
        const elevenLabsApiKey = (newConfig.elevenLabsApiKey !== undefined && newConfig.elevenLabsApiKey !== '') ? newConfig.elevenLabsApiKey : currentConfig.elevenLabsApiKey;

        currentConfig = { 
            ...currentConfig, 
            ...newConfig,
            geminiApiKey: geminiApiKey || '',
            elevenLabsApiKey: elevenLabsApiKey || ''
        };
        fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(currentConfig, null, 2), 'utf8');
    } catch (e) {
        console.error('Save AI Assistant config error:', e.message);
    }
    return currentConfig;
}

loadConfig();

let lastSpeakTime = 0;
let broadcastCallback = null;

function setBroadcastCallback(cb) {
    broadcastCallback = cb;
}

const PERSONA_PROMPTS = {
    sassy: 'Bạn là trợ lý AI cà khịa, xéo sắc, thông minh và cực kỳ dí dỏm trên phòng livestream. Nhiệm vụ của bạn là đáp trả lại comment của khán giả một cách hài hước, xéo sắc nhẹ nhàng, khiến người xem bật cười. Không xúc phạm thô tục. Trả lời bằng tiếng Việt cực ngắn gọn 1 câu duy nhất (dưới 20 từ).',
    funny: 'Bạn là trợ lý AI nhí nhảnh, vui vẻ, siêu hài hước trên phòng livestream. Hãy đáp trả khán giả bằng phong cách hài hước, dí dỏm, thả thính ngộ nghĩnh. Trả lời bằng tiếng Việt cực ngắn gọn 1 câu duy nhất (dưới 20 từ).',
    sweet: 'Bạn là trợ lý AI dịu dàng, ngọt ngào, siêu đáng yêu trên phòng livestream. Hãy gửi lời cảm ơn và khen ngợi khán giả một cách đằm thắm. Trả lời bằng tiếng Việt cực ngắn gọn 1 câu duy nhất (dưới 20 từ).',
    smart: 'Bạn là trợ lý AI tinh tế, thông thái, lịch sự trên phòng livestream. Hãy đưa ra góc nhìn thông minh, khéo léo. Trả lời bằng tiếng Việt cực ngắn gọn 1 câu duy nhất (dưới 20 từ).'
};

const FALLBACK_RESPONSES = {
    sassy: [
        'Comment chất đấy bạn ơi, nhưng Idol vẫn đẹp trai hơn nhé!',
        'Nghe hay đấy nhưng mình chưa phục đâu nha!',
        'Bạn nói đúng nhưng xem chừng Idol không quan tâm lắm đâu!',
        'Quá khen rồi, nhưng mà tặng thêm quà là Idol vui liền đó!'
    ],
    funny: [
        'Aha comment của bạn làm cả phòng live cười xỉu luôn!',
        'Chuẩn luôn bạn ơi, thả tim thả tim nào!',
        'Trí tuệ đỉnh cao đấy, Idol đọc xong tự nhiên ngơ luôn!',
        'Đúng rồi bạn ơi, chuẩn không cần chỉnh luôn!'
    ],
    sweet: [
        'Cảm ơn bạn yêu nhé, comment dễ thương quá đi mất!',
        'Cảm ơn bạn đã luôn đồng hành và cổ vũ phòng live nè!',
        'Yêu bạn nhiều nha, thả ngàn trái tim cho bạn nè!',
        'Comment ngọt ngào quá, làm phòng live ấm áp hẳn lên!'
    ],
    smart: [
        'Một ý kiến rất thú vị, cảm ơn bạn đã đóng góp nhé!',
        'Quan điểm tuyệt vời, phòng live rất trân trọng bạn!',
        'Rất chính xác, cảm ơn bạn đã đồng hành cùng kênh!',
        'Cảm ơn sự tinh tế và góc nhìn tuyệt vời của bạn nhé!'
    ]
};

function sanitizeText(text) {
    return String(text || '').replace(/[^\p{L}\p{N}\s?,.!:-]/gu, '').trim();
}

function getRandomFallback(persona) {
    const list = FALLBACK_RESPONSES[persona] || FALLBACK_RESPONSES.sassy;
    return list[Math.floor(Math.random() * list.length)];
}

async function callGeminiApi(apiKey, systemPrompt, username, userMessage) {
    const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
    for (const model of models) {
        try {
            const resText = await new Promise((resolve, reject) => {
                const payload = JSON.stringify({
                    systemInstruction: {
                        parts: [{ text: systemPrompt }]
                    },
                    contents: [
                        { role: 'user', parts: [{ text: `Khán giả "${username}" vừa bình luận: "${userMessage}"` }] }
                    ],
                    generationConfig: { maxOutputTokens: 150, temperature: 0.9 }
                });

                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
                const req = https.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => {
                    let data = '';
                    res.on('data', chunk => { data += chunk; });
                    res.on('end', () => {
                        try {
                            const parsed = JSON.parse(data);
                            const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
                            if (res.statusCode === 200 && text) resolve(text.trim());
                            else reject(new Error(parsed?.error?.message || `HTTP ${res.statusCode}`));
                        } catch (e) {
                            reject(e);
                        }
                    });
                });
                req.on('error', reject);
                req.write(payload);
                req.end();
            });
            if (resText) return resText;
        } catch (err) {
            console.warn(`Gemini model ${model} failed, trying next:`, err.message);
        }
    }
    throw new Error('All Gemini models failed');
}

let systemStatus = {
    status: 'healthy',
    message: '🟢 Tất cả Gemini API Key hoạt động bình thường (Dung lượng dồi dào)',
    lastUpdated: Date.now()
};

function getSystemStatus() {
    return systemStatus;
}

async function generateReply(username, comment) {
    const config = currentConfig;
    const persona = config.persona || 'sassy';
    const systemPrompt = PERSONA_PROMPTS[persona] || PERSONA_PROMPTS.sassy;
    const cleanComment = sanitizeText(comment);
    const rawKeys = config.geminiApiKey || process.env.GEMINI_API_KEY || '';
    const keyList = rawKeys.split(/[,;\n]+/).map(k => k.trim()).filter(Boolean);

    if (keyList.length > 0) {
        // Rotate randomly between available keys to distribute traffic load
        const activeApiKey = keyList[Math.floor(Math.random() * keyList.length)];
        try {
            const aiText = await callGeminiApi(activeApiKey, systemPrompt, username, cleanComment);
            if (aiText) {
                systemStatus = {
                    status: 'healthy',
                    message: `🟢 Gemini API (${keyList.length} Key active) hoạt động mượt mà`,
                    lastUpdated: Date.now()
                };
                return aiText.replace(/^["']|["']$/g, '');
            }
        } catch (e) {
            console.warn('Gemini API call failed, attempting fallback or alternate key:', e.message);
            if (e.message.includes('429') || e.message.includes('Quota') || e.message.includes('RESOURCE_EXHAUSTED')) {
                systemStatus = {
                    status: 'warning',
                    message: `⚠️ Cảnh báo: Gemini API Key (${activeApiKey.slice(0, 8)}...) vừa chạm trần Quota Google! Vui lòng dán thêm Key mới vào Trang Quản Trị.`,
                    lastUpdated: Date.now()
                };
            }
            // Retry with secondary key if available
            if (keyList.length > 1) {
                const altKey = keyList.find(k => k !== activeApiKey) || keyList[0];
                try {
                    const altText = await callGeminiApi(altKey, systemPrompt, username, cleanComment);
                    if (altText) return altText.replace(/^["']|["']$/g, '');
                } catch (_altErr) {}
            }
        }
    } else {
        systemStatus = {
            status: 'warning',
            message: '⚠️ Chưa cấu hình Gemini API Key Hệ Thống. Đang dùng lời thoại dự phòng.',
            lastUpdated: Date.now()
        };
    }

    return getRandomFallback(persona);
}

async function processChatMessage({ username, comment, isDonator = false, userPlan = 'free' }) {
    const config = currentConfig;
    if (!config.enabled) return null;
    if (config.donatorOnly && !isDonator) return null;

    const usage = getCharacterUsage(userPlan);

    const baseCooldownSec = Number(config.cooldownSeconds) || 20;
    // Bumping cooldown to 45s for free users when ElevenLabs quota runs out to protect Gemini usage
    const effectiveCooldownSec = (!usage.hasQuota && userPlan !== 'admin') ? Math.max(baseCooldownSec, 45) : baseCooldownSec;
    const cooldownMs = effectiveCooldownSec * 1000;

    const now = Date.now();
    if (now - lastSpeakTime < cooldownMs) return null;

    const cleanComment = sanitizeText(comment);
    if (!cleanComment || cleanComment.length < 3) return null;

    lastSpeakTime = now;
    const replyText = await generateReply(username, cleanComment);

    // Track character usage
    const charLength = replyText ? replyText.length : 0;
    recordCharacterUsage(charLength);
    const updatedUsage = getCharacterUsage(userPlan);

    // Rotate ElevenLabs API Keys only if user still has quota. Fall back to free machine TTS when quota ends!
    const rawElevenKeys = updatedUsage.hasQuota ? (config.elevenLabsApiKey || '') : '';
    const elevenKeyList = rawElevenKeys.split(/[,;\n]+/).map(k => k.trim()).filter(Boolean);
    const activeElevenKey = elevenKeyList.length > 0 ? elevenKeyList[Math.floor(Math.random() * elevenKeyList.length)] : '';

    const eventData = {
        type: 'ai_assistant_speech',
        username,
        comment: cleanComment,
        replyText,
        persona: config.persona,
        ttsEngine: updatedUsage.hasQuota ? config.ttsEngine : 'google_free',
        elevenLabsApiKey: activeElevenKey,
        elevenLabsVoiceId: config.elevenLabsVoiceId || 'pNInz6obpgDQGcFmaJgB',
        usage: updatedUsage,
        timestamp: Date.now()
    };

    try {
        const obsService = require('./obsService');
        obsService.broadcastWebSocketMessage(eventData);
    } catch (_err) {}

    return replyText;
}

module.exports = {
    getConfig: loadConfig,
    saveConfig,
    getSystemStatus,
    setBroadcastCallback,
    processChatMessage,
    generateReply,
    getCharacterUsage,
    addAddonCharacters,
    PLAN_LIMITS
};
