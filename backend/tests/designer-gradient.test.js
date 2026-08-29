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
assert.ok(designerSource.includes('data-goal-key="pkBarOffsetY"'));
assert.ok(designerSource.includes("'timerOffsetY', 'pkBarOffsetY'"));
assert.ok(designerSource.includes('target.pkContentScale = Math.max(0.15'));
assert.ok(designerSource.includes('itemExport.pkContentScale = Number('));
assert.ok(designerSource.includes('item.width / Number(item.pkLockedPreviewW)'));
assert.ok(designerSource.includes('item.height / Number(item.pkLockedPreviewH)'));
assert.ok(designerSource.includes("const isFlexibleTalentLive = item.type === 'talent-live' && item.lockRatio !== true"));
assert.ok(designerSource.includes('Number(item.talentLiveContentScale) || (item.width / refW)'));
assert.ok(designerSource.includes('itemExport.talentLiveContentScale = Number('));
assert.ok(designerSource.includes('Math.max(1, item.height / talentContentScale)'));
assert.ok(designerSource.includes('item.talentLiveContentScale = Math.max(0.08, item.width / refW)'));
assert.ok(!designerSource.includes('target.talentLiveContentScale = Math.max(0.08, target.width / 900)'));
assert.ok(!designerSource.includes('item.talentLiveContentScale = Math.max(0.08, item.width / 900)'));
assert.ok(designerSource.includes('const previousCount = Number(selected.teamCount)'));
assert.ok(designerSource.includes('if (previousCount !== count)'));
assert.ok(designerSource.includes('player.score = 0'));
assert.ok(!designerSource.includes("score: idx === 0 ? 120 : (idx === 1 ? 80 : 50)"));
assert.ok(designerSource.includes('const rawPct = total > 0 ? (Number(p.score || 0) / total) * 100 : 0'));
assert.ok(designerSource.includes('const visualPct = total > 0 ? rawPct : (100 / players.length)'));
const normalizedDesignerSource = designerSource.replace(/\r\n/g, '\n');
assert.ok(!designerSource.includes("localStorage.getItem('effectstore_auth_token')"));
assert.ok(designerSource.includes('localStorage.setItem(this.designerDraftStorageKey, JSON.stringify(payload))'));
assert.ok(designerSource.includes('await window.app.checkAuth().catch(() => {})'));
assert.ok(designerSource.includes('Thiết kế đã được giữ an toàn trên máy.'));
assert.ok(
    normalizedDesignerSource.includes('this.invalidateItemVisual(selected);\n                this.renderCanvas();'),
    'PK score changes that alter the leader must invalidate the cached widget visual'
);
assert.ok(
    normalizedDesignerSource.includes('// Reset also removes the current leader state'),
    'Resetting PK scores must force a complete visual refresh'
);

const desktopRenderEngineSource = fs.readFileSync(desktopPath, 'utf8');
const overlayRenderEngineSource = fs.readFileSync(overlayPath, 'utf8');
for (const renderEngineSource of [desktopRenderEngineSource, overlayRenderEngineSource]) {
    assert.ok(
        renderEngineSource.includes('const pPct = totalScore > 0 ? (score / totalScore) * 100 : 0'),
        'A PK bar with no score must display a real 0% label'
    );
    assert.ok(
        renderEngineSource.includes('const visualPct = totalScore > 0 ? pPct : (100 / players.length)'),
        'A zero-score PK bar must retain equally divided team colors'
    );
    assert.ok(
        renderEngineSource.includes('transition: none; ${segmentSkew}'),
        'PK team colors must be visible immediately on initial render'
    );
    assert.ok(
        renderEngineSource.includes('item.pkBarOffsetY !== undefined ? item.pkBarOffsetY : 0'),
        'PK progress bar vertical offset must be shared by designer and OBS renderers'
    );
    assert.ok(
        !renderEngineSource.includes("if (widthVal <= 0) return '';"),
        'Zero-width PK teams must remain mounted so later donations can reveal their color'
    );
    assert.ok(
        renderEngineSource.includes('min-width: 0; flex-shrink: 0; overflow: hidden; background:'),
        'PK segments must preserve their calculated widths and hide zero-width labels'
    );
}

// OBS Browser Source executes the inline overlay scripts directly.  Parse each
// one in CI so a duplicate declaration cannot leave the whole gift menu blank.
const overlayDocumentSource = fs.readFileSync(
    path.join(root, 'backend', 'public', 'gift-menu-overlay.html'),
    'utf8'
);
const inlineOverlayScripts = [...overlayDocumentSource.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .filter((script) => script.trim());
assert.ok(inlineOverlayScripts.length > 0, 'gift-menu overlay must include executable scripts');
inlineOverlayScripts.forEach((script, index) => {
    assert.doesNotThrow(() => new Function(script), `gift-menu overlay inline script ${index} must parse`);
});
assert.ok(
    designerSource.includes("segmentEl.style.transition = 'width 0.3s ease'"),
    'Existing PK segments should still animate smoothly when scores change'
);
assert.ok(
    desktopRenderEngineSource.includes('border-radius: ${roundPx(12, ctx.scale)}px'),
    'Designer PK team-card radius must scale with its preview context'
);
assert.ok(
    desktopRenderEngineSource.includes('${Math.max(1, roundPx(1.5, ctx.scale))}px solid color-mix'),
    'Designer PK team-card border must remain visible at small preview scales'
);
assert.ok(
    desktopRenderEngineSource.includes('giftIcon && players.length === 2'),
    'Designer must not crowd multi-team PK cards with per-team gift icons'
);

const overlaySource = fs.readFileSync(
    path.join(root, 'backend', 'public', 'gift-menu-overlay.html'),
    'utf8'
);
assert.ok(overlaySource.includes('gmd-pk-responsive-overlay'));
assert.ok(overlaySource.includes('gmd-goal-circle-responsive-overlay'));
assert.ok(overlaySource.includes('gmd-goal-list-responsive-overlay'));
assert.ok(overlaySource.includes('Number(item.unlockedContentScale) || 1'));
assert.ok(overlaySource.includes('Number(item.goalListContentScale) || Number(item.lockedContentScale)'));
assert.ok(overlaySource.includes("const isFlexibleTalentLive = item.type === 'talent-live' && item.lockRatio !== true"));
assert.ok(overlaySource.includes('Number(item.talentLiveContentScale) || (boardWidth / refW)'));
assert.ok(overlaySource.includes('Math.max(1, boardHeight / talentContentScale)'));

// Verify Text Element Enhancements (Marquee, Background Box, 3D, Stroke, Glow, Gradient)
const textItem = {
    id: 'text-test-1',
    type: 'text',
    text: 'CHÀO MỪNG ĐẾN VỚI LIVE',
    isMarquee: true,
    marqueeSpeed: 8,
    showBackground: true,
    bgFillType: 'gradient',
    bgGradientAngle: 135,
    bgGradientFrom: '#1e1b4b',
    bgGradientTo: '#3b0764',
    showBorder: true,
    borderColor: '#38bdf8',
    borderWidth: 2,
    borderGlow: true,
    borderGlowColor: 'rgba(56, 189, 248, 0.6)',
    borderRadius: 14,
    paddingX: 20,
    paddingY: 10,
    enableStroke: true,
    strokeColor: '#000000',
    strokeWidth: 3,
    enable3D: true,
    depth3DColor: '#78350f',
    depth3DSize: 4,
    enableGlow: true,
    glowColor: '#f59e0b',
    glowIntensity: 1.2,
    textFillType: 'gradient',
    textGradientFrom: '#fef08a',
    textGradientTo: '#d97706',
    textGradientAngle: 90
};
const desktopRenderer = loadRenderer(desktopPath);
const textHtml = desktopRenderer.renderByType(textItem, { scale: 1 });
assert.ok(textHtml.includes('gmd-text-marquee-box'), 'Marquee class must be rendered when isMarquee is enabled');
assert.ok(textHtml.includes('animation: gmd-marquee-text-test-1 8s linear infinite'), 'Marquee animation style must be applied');
assert.ok(textHtml.includes('linear-gradient(135deg'), 'Background gradient must be applied');
assert.ok(textHtml.includes('border: 2px solid #38bdf8'), 'Border must be applied');
assert.ok(textHtml.includes('box-shadow: 0 0 14px rgba(56, 189, 248, 0.6)'), 'Border glow must be applied');
assert.ok(textHtml.includes('-webkit-text-stroke: 3px #000000'), 'Text stroke must be applied');
assert.ok(textHtml.includes('1px 1px 0 #78350f, 2px 2px 0 #78350f'), '3D extrusion text shadow must be generated');
assert.ok(textHtml.includes('0 0 17px #f59e0b'), 'Neon glow text shadow must be generated');
assert.ok(textHtml.includes('-webkit-background-clip: text'), 'Gradient text clipping must be applied');
assert.ok(designerSource.includes('applyTextPreset(itemId, presetName)'), 'GiftMenuDesigner must implement applyTextPreset');

console.log('designer gradient tests passed');
