const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadRenderer(filePath) {
    const source = fs.readFileSync(filePath, 'utf8');
    const sandbox = {
        window: {},
        document: { querySelectorAll: () => [] },
        setInterval: () => 1,
        Date,
        Math
    };
    vm.runInNewContext(source, sandbox, { filename: filePath });
    return sandbox.window.MenuDesignerSharedRenderEngine;
}

function verifyGradient(renderer) {
    const item = {
        id: 'gradient-test',
        type: 'top-contributors',
        name: 'TOP SUPPORTERS',
        hideBg: false,
        useCustomBg: true,
        useCustomBgGradient: true,
        bgColorGradientFrom: '#112233',
        bgColorGradientTo: '#445566',
        bgColorGradientAngle: 45,
        contributors: []
    };
    const options = { scale: 1, gifts: [] };
    const tableHtml = renderer.renderByType(item, options);
    assert.ok(tableHtml.includes('linear-gradient(45deg, #112233, #445566)'));

    const podiumHtml = renderer.renderByType({ ...item, contribStyle: 'podium-only' }, options);
    assert.ok(podiumHtml.includes('linear-gradient(45deg, #112233, #445566)'));

    const goalListHtml = renderer.renderByType({
        ...item,
        type: 'goal-list',
        name: 'MỤC TIÊU HÔM NAY',
        goals: []
    }, options);
    assert.ok(goalListHtml.includes('linear-gradient(45deg, #112233, #445566)'));

    const solidHtml = renderer.renderByType({
        ...item,
        useCustomBgGradient: false,
        bgColor: '#abcdef'
    }, options);
    assert.ok(solidHtml.includes('background: #abcdef'));
    assert.ok(!solidHtml.includes('linear-gradient(45deg'));
}

const root = path.resolve(__dirname, '..', '..');
const desktopPath = path.join(root, 'desktop', 'renderer', 'js', 'shared-render-engine.js');
const overlayPath = path.join(root, 'backend', 'public', 'shared-render-engine.js');

verifyGradient(loadRenderer(desktopPath));
verifyGradient(loadRenderer(overlayPath));

const designerSource = fs.readFileSync(
    path.join(root, 'desktop', 'renderer', 'js', 'gift-menu-designer.js'),
    'utf8'
);
assert.ok(designerSource.includes('Chuyển màu (Gradient)'));
assert.ok(designerSource.includes('data-goal-key="bgColorGradientFrom"'));
assert.ok(designerSource.includes('data-goal-key="bgColorGradientTo"'));
assert.ok(designerSource.includes('data-goal-key="bgColorGradientAngle"'));

console.log('designer gradient tests passed');
