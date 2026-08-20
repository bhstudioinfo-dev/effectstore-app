const assert = require('assert');
const express = require('express');
const remoteRouter = require('../routes/remote');

async function run() {
    const app = express();
    app.use(express.json());
    app.locals.broadcastToClients = () => {};
    app.use('/api/remote', remoteRouter);
    const server = await new Promise((resolve) => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    try {
        const base = `http://127.0.0.1:${server.address().port}`;
        const lanInfo = await fetch(`${base}/api/remote/lan-info`).then((response) => response.json());
        const token = new URL(lanInfo.remoteUrl).searchParams.get('token');
        assert.ok(token);

        const syncResponse = await fetch(`${base}/api/remote/sync-deck`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                deck: {
                    effect: { visible: 10, slots: [null] },
                    sound: { visible: 10, slots: [] },
                    availableEffects: [
                        { id: 'effect-1', name: 'Hoa Hồng', thumbUrl: '/thumb.png', duration: 0.05 },
                        { id: 'wheel-1', name: 'Vòng quay thử thách', type: 'challenge-wheel' }
                    ],
                    availableSounds: []
                }
            })
        });
        assert.strictEqual(syncResponse.status, 200);

        const unauthorized = await fetch(`${base}/api/remote/deck-state`);
        assert.strictEqual(unauthorized.status, 401);

        const initialState = await fetch(`${base}/api/remote/deck-state`, {
            headers: { 'x-remote-token': token }
        }).then((response) => response.json());
        assert.deepStrictEqual(initialState.deck.availableEffects.map((effect) => effect.id), ['effect-1']);

        const rejectedWheel = await fetch(`${base}/api/remote/assign-slot`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-remote-token': token },
            body: JSON.stringify({ index: 1, deckType: 'effect', item: { id: 'wheel-1' } })
        });
        assert.strictEqual(rejectedWheel.status, 400);

        const assignResponse = await fetch(`${base}/api/remote/assign-slot`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-remote-token': token
            },
            body: JSON.stringify({
                index: 2,
                deckType: 'effect',
                item: { id: 'effect-1' }
            })
        });
        const assigned = await assignResponse.json();
        assert.strictEqual(assignResponse.status, 200);
        assert.strictEqual(assigned.slot.effectId, 'effect-1');
        assert.strictEqual(assigned.slot.index, 2);
        assert.ok(Number.isInteger(assigned.revision));

        const stateResponse = await fetch(`${base}/api/remote/deck-state`, {
            headers: { 'x-remote-token': token }
        });
        const state = await stateResponse.json();
        assert.strictEqual(state.deck.effect.slots.length, 1);
        assert.strictEqual(state.deck.effect.slots[0].effectId, 'effect-1');

        const triggered = await fetch(`${base}/api/remote/trigger`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-remote-token': token },
            body: JSON.stringify({ slotId: assigned.slot.id, deckType: 'effect' })
        });
        const triggeredData = await triggered.json();
        assert.strictEqual(triggered.status, 200);
        assert.ok(triggeredData.durationMs >= 1000);

        const duplicateTrigger = await fetch(`${base}/api/remote/trigger`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-remote-token': token },
            body: JSON.stringify({ slotId: assigned.slot.id, deckType: 'effect' })
        });
        assert.strictEqual(duplicateTrigger.status, 409);

        const connectionStatus = await fetch(`${base}/api/remote/connection-status`);
        const connection = await connectionStatus.json();
        assert.strictEqual(connectionStatus.status, 200);
        assert.strictEqual(connection.connectedClients, 1);
        assert.strictEqual(connection.deck.effect.slots[0].effectId, 'effect-1');
        assert.strictEqual(connection.revision, assigned.revision);

        const removeResponse = await fetch(`${base}/api/remote/remove-slot`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-remote-token': token },
            body: JSON.stringify({ slotId: assigned.slot.id, deckType: 'effect' })
        });
        const removed = await removeResponse.json();
        assert.strictEqual(removeResponse.status, 200);
        assert.strictEqual(removed.success, true);
        assert.ok(removed.revision > assigned.revision);

        const stateAfterRemove = await fetch(`${base}/api/remote/deck-state`, {
            headers: { 'x-remote-token': token }
        }).then((response) => response.json());
        assert.strictEqual(stateAfterRemove.deck.effect.slots.length, 0);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}

run()
    .then(() => console.log('remote control tests passed'))
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
