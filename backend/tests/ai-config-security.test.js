const assert = require('assert');
const fs = require('fs');
const path = require('path');
const aiAssistantService = require('../services/aiAssistantService');

const originalGeminiKey = process.env.GEMINI_API_KEY;
const originalElevenKey = process.env.ELEVENLABS_API_KEY;

(async () => {
    try {
        process.env.GEMINI_API_KEY = 'server-only-gemini-test-key';
        process.env.ELEVENLABS_API_KEY = 'server-only-eleven-test-key';

        let saves = 0;
        let updates = 0;
        class FakeUser {
            static async updateOne(filter, update, options) {
                updates += 1;
                assert.deepStrictEqual(filter, { _id: 'account-1' });
                assert.deepStrictEqual(update, { $set: { aiAssistantConfig: update.$set.aiAssistantConfig } });
                assert.strictEqual(options.runValidators, true);
            }

            constructor() {
                this._id = 'account-1';
                this.aiAssistantConfig = {};
            }

            async save() { saves += 1; }
        }
        const user = new FakeUser();
        const config = await aiAssistantService.saveConfig({
            enabled: true,
            persona: 'smart',
            minimumDonatorCoins: 25,
            geminiApiKey: 'must-not-be-saved',
            elevenLabsApiKey: 'must-not-be-saved'
        }, user);

        assert.strictEqual(updates, 1);
        assert.strictEqual(saves, 0);
        assert.strictEqual(user.aiAssistantConfig.enabled, true);
        assert.strictEqual(user.aiAssistantConfig.minimumDonatorCoins, 25);
        assert.strictEqual(Object.hasOwn(user.aiAssistantConfig, 'geminiApiKey'), false);
        assert.strictEqual(Object.hasOwn(user.aiAssistantConfig, 'elevenLabsApiKey'), false);
        assert.strictEqual(Object.hasOwn(config, 'geminiApiKey'), false);
        assert.strictEqual(Object.hasOwn(config, 'elevenLabsApiKey'), false);
        assert.strictEqual(config.geminiConfigured, true);
        assert.strictEqual(config.elevenLabsConfigured, true);

        const routeSource = fs.readFileSync(path.join(__dirname, '../routes/tiktok.js'), 'utf8');
        const desktopSource = fs.readFileSync(path.join(__dirname, '../../desktop/renderer/js/home.js'), 'utf8');
        assert(routeSource.includes("router.get('/ai-config', authMiddleware"));
        assert(routeSource.includes("router.post('/save-voice-sample', authMiddleware, adminMiddleware"));
        assert(!desktopSource.includes('xi-api-key'));
        assert(!desktopSource.includes('admin-gemini-key'));
        assert(!desktopSource.includes('admin-eleven-key'));
        assert(desktopSource.includes('await this.playAiAssistantVoicePreview(testSentence, voiceId)'));
        assert(desktopSource.includes('`${this.API_URL}/api/ai/speech`'));
        assert(desktopSource.includes('es_ai_voice_cache_${safeVoiceId}_${text}'));

        console.log('AI config security tests passed');
    } finally {
        if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
        else process.env.GEMINI_API_KEY = originalGeminiKey;
        if (originalElevenKey === undefined) delete process.env.ELEVENLABS_API_KEY;
        else process.env.ELEVENLABS_API_KEY = originalElevenKey;
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
