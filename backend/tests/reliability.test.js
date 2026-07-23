const assert = require('assert');
const effectQueue = require('../services/effectQueue');
const playbackManager = require('../services/playbackManager');
const tiktokService = require('../services/tiktokService');

async function run() {
    const originalProcess = effectQueue.process;
    const originalQueue = effectQueue.queue;
    const originalRecentKeys = effectQueue.recentEventKeys;
    effectQueue.process = () => {};
    effectQueue.queue = [];
    effectQueue.recentEventKeys = new Map();

    try {
        const item = {
            effectId: 'effect-1',
            effectName: 'Effect 1',
            effectUrl: 'http://localhost/effect.webm',
            duration: 1000,
            playbackType: 'live_mapping',
            eventKey: 'gift-event-1'
        };
        assert.strictEqual(await effectQueue.add(item), true);
        assert.strictEqual(await effectQueue.add(item), false);
        assert.strictEqual(effectQueue.queue.length, 1);

        const liveItemWithoutUrl = {
            effectId: 'effect-from-real-live',
            effectName: 'Real live effect',
            duration: 1500,
            playbackType: 'live_mapping',
            userId: 'user-1',
            eventKey: 'gift-event-2'
        };
        assert.strictEqual(await effectQueue.add(liveItemWithoutUrl), true);
        assert.strictEqual(effectQueue.queue.length, 2);

        const unresolvedItemWithoutUser = {
            effectId: 'unsafe-unresolved-effect',
            duration: 1500,
            playbackType: 'live_mapping'
        };
        assert.strictEqual(await effectQueue.add(unresolvedItemWithoutUser), false);

        effectQueue.recentEventKeys.set('expired', Date.now() - 1);
        assert.strictEqual(effectQueue.isDuplicateEvent({ eventKey: 'new-event' }), false);
        assert.strictEqual(effectQueue.recentEventKeys.has('expired'), false);
    } finally {
        effectQueue.process = originalProcess;
        effectQueue.queue = originalQueue;
        effectQueue.recentEventKeys = originalRecentKeys;
    }

    assert.strictEqual(playbackManager.failCurrent('test'), false);
    assert.strictEqual(tiktokService.shouldSkipIntermediateStreak({ giftType: 1, repeatEnd: false }), true);
    assert.strictEqual(tiktokService.shouldSkipIntermediateStreak({ giftType: 1, repeatEnd: true }), false);
    assert.strictEqual(tiktokService.shouldSkipIntermediateStreak({ giftType: 0, repeatEnd: false }), false);

    const originalClient = tiktokService.tiktokClient;
    const originalRoom = tiktokService.lastRoomId;
    const originalUser = tiktokService.currentLiveUserId;
    const originalBroadcast = tiktokService.broadcastFn;
    let stopped = false;
    tiktokService.tiktokClient = { async stop() { stopped = true; } };
    tiktokService.lastRoomId = 'room-to-stop';
    tiktokService.currentLiveUserId = 'user-1';
    tiktokService.broadcastFn = () => {};
    await tiktokService.disconnect();
    assert.strictEqual(stopped, true);
    assert.strictEqual(tiktokService.lastRoomId, null);
    assert.strictEqual(tiktokService.currentLiveUserId, null);
    assert.strictEqual(tiktokService.reconnectTimer, null);

    tiktokService.tiktokClient = originalClient;
    tiktokService.lastRoomId = originalRoom;
    tiktokService.currentLiveUserId = originalUser;
    tiktokService.broadcastFn = originalBroadcast;

    console.log('reliability tests passed');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
