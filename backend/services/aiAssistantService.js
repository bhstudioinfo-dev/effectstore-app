const https = require('https');
const { normalizePlan } = require('../config/planEntitlements');
const { moderateText } = require('./contentSafetyService');
const { getCloudSessionToken } = require('./cloudSessionTokenStore');
const { getSecret } = require('./systemAiSecretService');

const CLOUD_API_URL = String(process.env.CLOUD_API_URL || '').trim().replace(/\/+$/, '');

const DEFAULT_CONFIG = {
    enabled: false,
    persona: 'sassy', // 'sassy' | 'funny' | 'sweet' | 'smart'
    cooldownSeconds: 20,
    donatorOnly: false,
    minimumDonatorCoins: 10,
    elevenLabsVoiceId: '21m00Tcm4TlvDq8ikWAM', // default voice
    ttsEngine: 'webspeech', // 'webspeech' | 'elevenlabs'
    readSpeed: 1.0,
    volume: 1.0,
    usedCharactersThisMonth: 0,
    addonCharacters: 0,
    monthKey: ''
};

let runtimeConfig = { ...DEFAULT_CONFIG };

const SAFE_CONFIG_KEYS = [
    'enabled', 'persona', 'cooldownSeconds', 'donatorOnly', 'minimumDonatorCoins',
    'elevenLabsVoiceId', 'ttsEngine', 'readSpeed', 'volume'
];

function sanitizeConfig(input = {}) {
    const result = {};
    for (const key of SAFE_CONFIG_KEYS) {
        if (input[key] !== undefined) result[key] = input[key];
    }
    result.enabled = Boolean(result.enabled ?? false);
    result.persona = ['sassy', 'funny', 'sweet', 'smart'].includes(result.persona) ? result.persona : 'sassy';
    result.cooldownSeconds = [15, 20, 30, 60].includes(Number(result.cooldownSeconds)) ? Number(result.cooldownSeconds) : 20;
    result.donatorOnly = Boolean(result.donatorOnly ?? false);
    result.minimumDonatorCoins = Math.min(1000000, Math.max(1, Math.floor(Number(result.minimumDonatorCoins) || 10)));
    result.elevenLabsVoiceId = String(result.elevenLabsVoiceId || DEFAULT_CONFIG.elevenLabsVoiceId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100) || DEFAULT_CONFIG.elevenLabsVoiceId;
    result.ttsEngine = result.ttsEngine === 'webspeech' ? 'webspeech' : 'elevenlabs';
    result.readSpeed = Math.min(2, Math.max(0.5, Number(result.readSpeed) || 1));
    result.volume = Math.min(1, Math.max(0, Number(result.volume) || 1));
    return result;
}

function getRuntimeConfig(user = null) {
    return { ...DEFAULT_CONFIG, ...sanitizeConfig(user?.aiAssistantConfig || runtimeConfig) };
}

function getPublicConfig(user = null) {
    const usesCloudAi = Boolean(CLOUD_API_URL);
    return {
        ...getRuntimeConfig(user),
        geminiConfigured: usesCloudAi || Boolean(process.env.GEMINI_API_KEY),
        elevenLabsConfigured: usesCloudAi || Boolean(process.env.ELEVENLABS_API_KEY)
    };
}

async function postCloudAi(pathname, payload, user) {
    if (!CLOUD_API_URL || !user?._id) return null;
    const token = getCloudSessionToken(user._id);
    if (!token) return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
        const response = await fetch(`${CLOUD_API_URL}/api/ai/${pathname}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
        });
        const data = await response.json().catch(() => ({}));
        return response.ok ? data : null;
    } catch (_error) {
        return null;
    } finally {
        clearTimeout(timeout);
    }
}

// Keys must cover every backend/config/planEntitlements.js plan key so no
// tier silently falls back to PLAN_LIMITS.free. 'business' is the legacy
// alias for 'pro' and gets the same quota; 'studio' continues the ~3x
// progression above 'pro'.
const PLAN_LIMITS = {
    free: 1000,
    basic: 5000,
    pro: 15000,
    business: 15000,
    studio: 30000,
    admin: 999999999
};
const SYSTEM_VOICE_GIFT_LIMIT = 5000;

function getCharacterUsage(userOrPlan = 'free', userDoc = null) {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    const user = (typeof userOrPlan === 'object' && userOrPlan !== null) ? userOrPlan : userDoc;
    const userPlan = (typeof userOrPlan === 'string') ? userOrPlan : normalizePlan(user);

    if (user && user.aiMonthKey !== monthKey) {
        user.aiMonthKey = monthKey;
        user.usedCharactersThisMonth = 0;
        user.usedSystemVoiceCharactersThisMonth = 0;
        if (typeof user.save === 'function') user.save().catch(() => {});
    }

    if (runtimeConfig.monthKey !== monthKey) {
        runtimeConfig.monthKey = monthKey;
        runtimeConfig.usedCharactersThisMonth = 0;
    }
    
    if (userPlan === 'admin' || userPlan === 'ADMIN' || user?.isAdmin === true || user?.role === 'admin' || user?.email === 'admin@effectstore.vn') {
        return {
            used: Number((user ? user.usedCharactersThisMonth : runtimeConfig.usedCharactersThisMonth) || 0),
            baseLimit: 999999999,
            addon: 0,
            totalLimit: 999999999,
            remaining: 999999999,
            hasQuota: true,
            systemVoiceGiftLimit: SYSTEM_VOICE_GIFT_LIMIT,
            systemVoiceGiftUsed: 0,
            systemVoiceGiftRemaining: SYSTEM_VOICE_GIFT_LIMIT,
            hasSystemVoiceGift: true,
            responseMode: 'custom',
            isAdmin: true,
            monthKey
        };
    }

    const baseLimit = PLAN_LIMITS[userPlan] || PLAN_LIMITS.free;
    const addon = Number((user ? user.addonCharacters : runtimeConfig.addonCharacters) || 0);
    const totalLimit = baseLimit + addon;
    const used = Number((user ? user.usedCharactersThisMonth : runtimeConfig.usedCharactersThisMonth) || 0);
    const systemVoiceGiftUsed = Number(user?.usedSystemVoiceCharactersThisMonth || 0);
    const hasQuota = used < totalLimit;
    const hasSystemVoiceGift = systemVoiceGiftUsed < SYSTEM_VOICE_GIFT_LIMIT;
    
    return {
        used,
        baseLimit,
        addon,
        totalLimit,
        remaining: Math.max(0, totalLimit - used),
        hasQuota,
        systemVoiceGiftLimit: SYSTEM_VOICE_GIFT_LIMIT,
        systemVoiceGiftUsed,
        systemVoiceGiftRemaining: Math.max(0, SYSTEM_VOICE_GIFT_LIMIT - systemVoiceGiftUsed),
        hasSystemVoiceGift,
        responseMode: hasQuota ? 'custom' : (hasSystemVoiceGift ? 'system_gift' : 'exhausted'),
        monthKey
    };
}

async function recordCharacterUsage(count, user = null, mode = 'custom') {
    if (user) {
        if (mode === 'system_gift') {
            user.usedSystemVoiceCharactersThisMonth = (user.usedSystemVoiceCharactersThisMonth || 0) + count;
        } else {
            user.usedCharactersThisMonth = (user.usedCharactersThisMonth || 0) + count;
        }
        if (typeof user.save === 'function') await user.save().catch(() => {});
        return;
    }
    runtimeConfig.usedCharactersThisMonth = (runtimeConfig.usedCharactersThisMonth || 0) + count;
}

async function addAddonCharacters(addonCount, user = null) {
    if (user) {
        user.addonCharacters = (user.addonCharacters || 0) + addonCount;
        if (typeof user.save === 'function') await user.save().catch(() => {});
    } else {
        runtimeConfig.addonCharacters = (runtimeConfig.addonCharacters || 0) + addonCount;
    }
    return getCharacterUsage(user || 'free');
}

async function saveConfig(newConfig = {}, user = null) {
    const safeConfig = sanitizeConfig({ ...getRuntimeConfig(user), ...newConfig });
    if (user) {
        user.aiAssistantConfig = safeConfig;
        if (typeof user.save === 'function') await user.save();
    } else {
        runtimeConfig = { ...runtimeConfig, ...safeConfig };
    }
    return getPublicConfig(user);
}

const lastSpeakTimeByAccount = new Map();
let broadcastCallback = null;
const quotaNoticeKeys = new Set();

function qualifiesForDonatorMode(config = {}, { isDonator = false, donatedCoins = null } = {}) {
    if (!config.donatorOnly) return true;
    const minimumDonatorCoins = Math.max(1, Number(config.minimumDonatorCoins) || 10);
    if (donatedCoins !== null && donatedCoins !== undefined) {
        return Number(donatedCoins) >= minimumDonatorCoins;
    }
    return isDonator === true;
}

function setBroadcastCallback(cb) {
    broadcastCallback = cb;
}

const PERSONA_PROMPTS = {
    sassy: 'Bạn là trợ lý AI cà khịa, xéo sắc, thông minh và cực kỳ dí dỏm trên phòng livestream. Nhiệm vụ của bạn là đáp trả lại comment của khán giả một cách hài hước, xéo sắc nhẹ nhàng, khiến người xem bật cười. Không xúc phạm thô tục. Trả lời bằng tiếng Việt cực ngắn gọn 1 câu duy nhất (dưới 20 từ).',
    funny: 'Bạn là trợ lý AI nhí nhảnh, vui vẻ, siêu hài hước trên phòng livestream. Hãy đáp trả khán giả bằng phong cách hài hước, dí dỏm, thả thính ngộ nghĩnh. Trả lời bằng tiếng Việt cực ngắn gọn 1 câu duy nhất (dưới 20 từ).',
    sweet: 'Bạn là trợ lý AI dịu dàng, ngọt ngào, siêu đáng yêu trên phòng livestream. Hãy gửi lời cảm ơn và khen ngợi khán giả một cách đằm thắm. Trả lời bằng tiếng Việt cực ngắn gọn 1 câu duy nhất (dưới 20 từ).',
    smart: 'Bạn là trợ lý AI tinh tế, thông thái, lịch sự trên phòng livestream. Hãy đưa ra góc nhìn thông minh, khéo léo. Trả lời bằng tiếng Việt cực ngắn gọn 1 câu duy nhất (dưới 20 từ).'
};
const SAFETY_PROMPT = ' Tuyệt đối không nhắc lại từ tục, dữ liệu cá nhân, lời đe dọa hoặc nội dung tình dục; không cổ vũ tự hại, bạo lực, cờ bạc, hàng cấm hay lừa đảo. Không đưa số điện thoại, liên kết hoặc hướng dẫn nguy hiểm. Nếu bình luận không phù hợp, chỉ trả về chuỗi [SKIP].';

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

function requestElevenLabsAudio(apiKey, voiceId, text, modelId, voiceSettings) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({ text, model_id: modelId, voice_settings: voiceSettings });
        const req = https.request({
            hostname: 'api.elevenlabs.io',
            path: `/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
            method: 'POST',
            headers: {
                Accept: 'audio/mpeg',
                'Content-Type': 'application/json',
                'xi-api-key': apiKey,
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const body = Buffer.concat(chunks);
                if (res.statusCode >= 200 && res.statusCode < 300 && body.length) return resolve(body);
                reject(new Error(`ElevenLabs HTTP ${res.statusCode}`));
            });
        });
        req.setTimeout(15000, () => req.destroy(new Error('ElevenLabs timeout')));
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

async function synthesizeElevenLabs(text, config = getRuntimeConfig(), user = null) {
    const voiceId = String(config.elevenLabsVoiceId || 'pNInz6obpgDQGcFmaJgB').trim();
    if (!voiceId || voiceId === 'google_female_vi') return null;
    if (CLOUD_API_URL && user) {
        const cloudResult = await postCloudAi('speech', { text, voiceId }, user);
        return cloudResult?.audioDataUrl ? { voiceId: cloudResult.voiceId || voiceId, audioDataUrl: cloudResult.audioDataUrl } : null;
    }
    const keys = String(await getSecret('elevenlabs')).split(/[,;\n]+/).map((key) => key.trim()).filter(Boolean);
    if (!keys.length) return null;
    const preferred = ['pNInz6obpgDQGcFmaJgB', 'N2lVS1w4EtoT3dr4eOWO'].includes(voiceId);
    const attempts = preferred
        ? [
            ['eleven_v3', { stability: 0.15, similarity_boost: 0.85, style: 0.2, use_speaker_boost: true }],
            ['eleven_multilingual_v2', { stability: 0.35, similarity_boost: 0.85 }]
        ]
        : [['eleven_multilingual_v2', { stability: 0.35, similarity_boost: 0.85 }]];
    for (const key of keys) {
        for (const [modelId, settings] of attempts) {
            try {
                const audio = await requestElevenLabsAudio(key, voiceId, text, modelId, settings);
                return { voiceId, audioDataUrl: `data:audio/mpeg;base64,${audio.toString('base64')}` };
            } catch (error) {
                console.warn(`ElevenLabs ${modelId} failed:`, error.message);
            }
        }
    }
    return null;
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
                    generationConfig: { maxOutputTokens: 150, temperature: 0.9 },
                    safetySettings: [
                        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_LOW_AND_ABOVE' },
                        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_LOW_AND_ABOVE' },
                        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_LOW_AND_ABOVE' },
                        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_LOW_AND_ABOVE' }
                    ]
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

async function generateReply(username, comment, config = getRuntimeConfig(), user = null) {
    const persona = config.persona || 'sassy';
    const systemPrompt = (PERSONA_PROMPTS[persona] || PERSONA_PROMPTS.sassy) + SAFETY_PROMPT;
    const cleanComment = sanitizeText(comment);
    if (CLOUD_API_URL && user) {
        const cloudResult = await postCloudAi('reply', { username, comment: cleanComment, persona }, user);
        if (cloudResult?.replyText) return cloudResult.replyText;
        return getRandomFallback(persona);
    }
    const rawKeys = await getSecret('gemini');
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
                    message: '⚠️ Gemini API đang chạm giới hạn. Vui lòng kiểm tra quota hoặc cấu hình biến môi trường trên máy chủ.',
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

async function processChatMessage({ username, comment, isDonator = false, donatedCoins = null, userPlan = 'free', user = null, isTest = false }) {
    const config = getRuntimeConfig(user);
    if (!config.enabled) return null;
    if (!qualifiesForDonatorMode(config, { isDonator, donatedCoins })) return null;
    if (!moderateText(comment).allowed) return null;

    const usage = getCharacterUsage(user || userPlan);
    if (!isTest && usage.responseMode === 'exhausted') {
        const noticeKey = `${usage.monthKey}:${String(user?._id || userPlan)}`;
        if (!quotaNoticeKeys.has(noticeKey)) {
            quotaNoticeKeys.add(noticeKey);
            if (broadcastCallback) broadcastCallback('ai_quota_exhausted', { usage });
        }
        return null;
    }

    const baseCooldownSec = Number(config.cooldownSeconds) || 20;
    // Bumping cooldown to 45s for free users when ElevenLabs quota runs out to protect Gemini usage
    const effectiveCooldownSec = (usage.responseMode === 'system_gift') ? Math.max(baseCooldownSec, 45) : baseCooldownSec;
    const cooldownMs = effectiveCooldownSec * 1000;

    const now = Date.now();
    const accountKey = String(user?._id || userPlan || 'local');
    const lastSpeakTime = Number(lastSpeakTimeByAccount.get(accountKey) || 0);
    if (now - lastSpeakTime < cooldownMs) return null;

    const cleanComment = sanitizeText(comment);
    if (!cleanComment || cleanComment.length < 3) return null;

    lastSpeakTimeByAccount.set(accountKey, now);
    const replyText = await generateReply(username, cleanComment, config, user);
    if (!replyText || replyText === '[SKIP]' || !moderateText(replyText, { output: true }).allowed) return null;

    // Track character usage
    const charLength = replyText ? replyText.length : 0;
    let responseMode = isTest ? 'custom' : usage.responseMode;
    let elevenAudio = null;
    if (responseMode === 'custom') {
        elevenAudio = await synthesizeElevenLabs(replyText, config, user);
        if (!elevenAudio) {
            if (usage.hasSystemVoiceGift || isTest) responseMode = 'system_gift';
            else return null;
        }
    }
    if (!isTest) await recordCharacterUsage(charLength, user, responseMode);
    const updatedUsage = getCharacterUsage(user || userPlan);

    const eventData = {
        type: 'ai_assistant_speech',
        username,
        comment: cleanComment,
        replyText,
        persona: config.persona,
        ttsEngine: responseMode === 'custom' ? config.ttsEngine : 'google_free',
        responseMode,
        elevenLabsVoiceId: elevenAudio?.voiceId || '',
        audioDataUrl: elevenAudio?.audioDataUrl || '',
        readSpeed: Number(config.readSpeed) || 1.0,
        volume: Number(config.volume) || 1.0,
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
    getConfig: getPublicConfig,
    saveConfig,
    getSystemStatus,
    setBroadcastCallback,
    processChatMessage,
    generateReply,
    synthesizeElevenLabs,
    getCharacterUsage,
    addAddonCharacters,
    qualifiesForDonatorMode,
    PLAN_LIMITS,
    SYSTEM_VOICE_GIFT_LIMIT
};
