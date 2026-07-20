const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function rendererFor(filePath) {
    const sandbox = { window: {}, document: { querySelectorAll: () => [] }, setInterval: () => 1, Date, Math };
    vm.runInNewContext(fs.readFileSync(filePath, 'utf8'), sandbox, { filename: filePath });
    return sandbox.window.MenuDesignerSharedRenderEngine;
}

const competition = {
    id: 'competition-test',
    title: 'TALENT OF THE NIGHT',
    roundLabel: 'VÒNG 1',
    status: 'running',
    durationSeconds: 180,
    startedAt: new Date().toISOString(),
    activeTalentId: 'a',
    goalAmount: 1000,
    pointsLabel: 'điểm',
    eventFeed: [{ nickname: 'Người ủng hộ', giftName: 'Galaxy', points: 500 }],
    participants: [
        { id: 'a', name: 'Minh Anh', performance: 'Mashup', score: 1200, roundScore: 500 },
        { id: 'b', name: 'Hoàng Long', performance: 'Dance', score: 900, roundScore: 0 },
        { id: 'c', name: 'Bảo Ngọc', performance: 'Singing', score: 700, roundScore: 0 },
        { id: 'd', name: 'Tú Anh', performance: 'Guitar', score: 400, roundScore: 0 }
    ]
};

const root = path.resolve(__dirname, '..', '..');
for (const relative of ['desktop/renderer/js/shared-render-engine.js', 'backend/public/shared-render-engine.js']) {
    const renderer = rendererFor(path.join(root, relative));
    const live = renderer.renderByType({ type: 'talent-live', barColor: '#f43f5e', talentCompetition: competition }, { scale: 1, gifts: [] });
    const ranking = renderer.renderByType({ type: 'talent-leaderboard', barColor: '#fbbf24', talentCompetition: competition }, { scale: 1, gifts: [] });
    assert.ok(live.includes('Minh Anh'));
    assert.ok(live.includes('500'));
    assert.ok(live.includes('gmd-talent-time'));
    assert.ok(ranking.includes('Hoàng Long'));
    assert.ok(ranking.includes('🥇'));
}

const overlay = fs.readFileSync(path.join(root, 'backend/public/gift-menu-overlay.html'), 'utf8');
assert.ok(overlay.includes("'talent-live'"));
assert.ok(overlay.includes("'talent-leaderboard'"));
const designer = fs.readFileSync(path.join(root, 'desktop/renderer/js/gift-menu-designer.js'), 'utf8');
assert.ok(designer.includes('existing.talentCompetition = JSON.parse(JSON.stringify(layer.talentCompetition))'));
console.log('talent competition tests passed');
