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
        backgroundOpacity: 100,
        contributors: []
    };
    const options = { scale: 1, gifts: [] };
    const tableHtml = renderer.renderByType(item, options);
    assert.ok(tableHtml.includes('linear-gradient(45deg, #112233ff, #445566ff)'));

    const podiumHtml = renderer.renderByType({ ...item, contribStyle: 'podium-only' }, options);
    assert.ok(podiumHtml.includes('linear-gradient(45deg, #112233ff, #445566ff)'));

    const goalListHtml = renderer.renderByType({
        ...item,
        type: 'goal-list',
        name: 'MỤC TIÊU HÔM NAY',
        goals: []
    }, options);
    assert.ok(goalListHtml.includes('linear-gradient(45deg, #112233ff, #445566ff)'));

    const solidHtml = renderer.renderByType({
        ...item,
        useCustomBgGradient: false,
        bgColor: '#abcdef'
    }, options);
    assert.ok(solidHtml.includes('background:#abcdefff'));
    assert.ok(!solidHtml.includes('linear-gradient(45deg'));

    const repairedConflictingBackgroundHtml = renderer.renderByType({
        ...item,
        hideBg: true,
        useCustomBg: true,
        useCustomBgGradient: true
    }, options);
    assert.ok(repairedConflictingBackgroundHtml.includes('linear-gradient(45deg, #112233ff, #445566ff)'));

    const listHtml = renderer.renderByType({
        ...item,
        contribStyle: 'list-only',
        rowFontSize: 21,
        valueFontSize: 17,
        contributors: [{ nickname: 'Tester', value: 1234, avatar: '' }]
    }, options);
    assert.ok(listHtml.includes('font-size: 21px'));
    assert.ok(listHtml.includes('font-size: 17px'));
    assert.ok(listHtml.includes('1.234'));

    const designerFallbackHtml = renderer.renderByType({
        ...item,
        contribStyle: 'podium-only',
        contributors: []
    }, { ...options, includeDesignerFallback: true });
    assert.ok(designerFallbackHtml.includes('Người ủng hộ 1'));

    const overlayEmptyHtml = renderer.renderByType({
        ...item,
        contribStyle: 'podium-only',
        contributors: []
    }, { ...options, mode: 'overlay', includeDesignerFallback: false });
    assert.ok(!overlayEmptyHtml.includes('Người ủng hộ 1'));

    const hiddenPodiumFieldsHtml = renderer.renderByType({
        ...item,
        contribStyle: 'podium-only',
        showAvatar: false,
        showValue: false,
        contributors: [{ nickname: 'Tester', value: 999, avatar: '/avatar.png' }]
    }, options);
    assert.ok(!hiddenPodiumFieldsHtml.includes('gmd-podium-avatar-wrap'));
    assert.ok(!hiddenPodiumFieldsHtml.includes('gmd-podium-value'));

    const resizedListAvatarHtml = renderer.renderByType({
        ...item,
        contribStyle: 'list-only',
        contributorAvatarSize: 72,
        contributors: [{ nickname: 'Tester', value: 10, avatar: '/avatar.png' }]
    }, options);
    assert.ok(resizedListAvatarHtml.includes('width:72px;height:72px'));

    const resizedPodiumAvatarHtml = renderer.renderByType({
        ...item,
        contribStyle: 'podium-only',
        contributorAvatarSize: 120,
        contributors: [{ nickname: 'Top 1', value: 30 }, { nickname: 'Top 2', value: 20 }, { nickname: 'Top 3', value: 10 }]
    }, options);
    assert.ok(resizedPodiumAvatarHtml.includes('width: 120px; height: 120px'));
    assert.ok(resizedPodiumAvatarHtml.includes('width: 88px; height: 88px'));

    const customBorderHtml = renderer.renderByType({
        ...item,
        contribStyle: 'podium-only',
        borderColor: '#12abef'
    }, options);
    assert.ok(customBorderHtml.includes('border: 1px solid #12abef'));
}

const root = path.resolve(__dirname, '..', '..');
const desktopPath = path.join(root, 'desktop', 'renderer', 'js', 'shared-render-engine.js');
const overlayPath = path.join(root, 'backend', 'public', 'shared-render-engine.js');

verifyGradient(loadRenderer(desktopPath));
verifyGradient(loadRenderer(overlayPath));

// PK content lives in a fixed 900x180 design space. Its parent wrapper is
// responsible for resizing it; the renderer must not apply item.width again.
for (const rendererPath of [desktopPath, overlayPath]) {
    const source = fs.readFileSync(rendererPath, 'utf8');
    assert.ok(!source.includes('const localScale = w / 900'));
    assert.ok(source.includes('justify-content: flex-start'));
    assert.ok(source.includes('padding-top:${roundPx(18, ctx.scale)}px'));
}

const designerSource = fs.readFileSync(
    path.join(root, 'desktop', 'renderer', 'js', 'gift-menu-designer.js'),
    'utf8'
);
assert.ok(designerSource.includes('Chuyển màu (Gradient)'));
assert.ok(designerSource.includes('data-goal-key="bgColorGradientFrom"'));
assert.ok(designerSource.includes('data-goal-key="bgColorGradientTo"'));
assert.ok(designerSource.includes('data-goal-key="bgColorGradientAngle"'));
assert.ok(designerSource.includes('const isPodiumContributorStyle'));
assert.ok(designerSource.includes("makeCompactFontSizeField('Cỡ chữ Điểm số (Value)', 'valueFontSize'"));
assert.ok(designerSource.includes("if (key === 'useCustomBg' && item.useCustomBg)"));
assert.ok(designerSource.includes("else if (key === 'hideBg' && item.hideBg)"));
assert.ok(designerSource.includes('if (selected.hideBg && selected.useCustomBg)'));
assert.ok(designerSource.includes('data-goal-key="contributorAvatarSize"'));
assert.ok(designerSource.includes('gmd-pk-responsive-preview'));
assert.ok(designerSource.includes('gmd-goal-circle-responsive-preview'));
assert.ok(designerSource.includes('gmd-goal-list-responsive-preview'));
assert.ok(designerSource.includes('Number(item.unlockedContentScale) || 1'));
assert.ok(designerSource.includes('delete item.lockedContentScale'));
assert.ok(designerSource.includes('item.lockedPreviewW = Number(item.width || 900)'));
assert.ok(designerSource.includes('item.goalListContentScale = Math.max(0.15, visibleGoalListScale)'));
assert.ok(designerSource.includes('itemExport.goalListContentScale = (Number('));
assert.ok(designerSource.includes('data-goal-key="timerOffsetY"'));
assert.ok(designerSource.includes('target.pkContentScale = Math.max(0.15'));
assert.ok(designerSource.includes('itemExport.pkContentScale = Number('));

const overlaySource = fs.readFileSync(
    path.join(root, 'backend', 'public', 'gift-menu-overlay.html'),
    'utf8'
);
assert.ok(overlaySource.includes('gmd-pk-responsive-overlay'));
assert.ok(overlaySource.includes('gmd-goal-circle-responsive-overlay'));
assert.ok(overlaySource.includes('gmd-goal-list-responsive-overlay'));
assert.ok(overlaySource.includes('Number(item.unlockedContentScale) || 1'));
assert.ok(overlaySource.includes('Number(item.goalListContentScale) || Number(item.lockedContentScale)'));

console.log('designer gradient tests passed');
