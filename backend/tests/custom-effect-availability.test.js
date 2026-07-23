const assert = require('assert');
const {
    normalizeCustomEffect,
    isCustomEffectMediaAvailable
} = require('../services/effectLibraryService');

async function run() {
    const effect = normalizeCustomEffect({
        localId: 'custom-test-effect',
        name: 'Hiệu ứng thử',
        duration: 3
    }, { _id: 'user-1' });

    assert.strictEqual(effect.isCustom, true);
    assert.strictEqual(
        await isCustomEffectMediaAvailable(effect, {
            fetchFn: async (_url, options) => {
                assert.strictEqual(options.method, 'HEAD');
                return { ok: true };
            }
        }),
        true
    );

    assert.strictEqual(
        await isCustomEffectMediaAvailable(effect, {
            fetchFn: async () => ({ ok: false })
        }),
        false
    );

    assert.strictEqual(
        await isCustomEffectMediaAvailable(effect, {
            fetchFn: async () => { throw new Error('port unavailable'); }
        }),
        false
    );

    assert.strictEqual(
        await isCustomEffectMediaAvailable({ ...effect, fileUrl: '' }),
        false
    );

    console.log('custom effect availability tests passed');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
