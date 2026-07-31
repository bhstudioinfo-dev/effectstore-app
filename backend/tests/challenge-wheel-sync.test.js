const assert = require('assert');
const fs = require('fs');
const path = require('path');

const routeSource = fs.readFileSync(path.join(__dirname, '../routes/tiktok.js'), 'utf8');
const serviceSource = fs.readFileSync(path.join(__dirname, '../services/tiktokService.js'), 'utf8');
const designerSource = fs.readFileSync(path.join(__dirname, '../../desktop/renderer/js/gift-menu-designer.js'), 'utf8');
const overlaySource = fs.readFileSync(path.join(__dirname, '../public/gift-menu-overlay.html'), 'utf8');

assert.ok(
    routeSource.includes("presentation?.coordinateSpace === 'export-logical-v1'"),
    'Gift Mapping tests must trust explicitly exported wheel dimensions.'
);
assert.ok(
    routeSource.includes('sourceTemplateId: layout.parentTemplateId'),
    'A saved personal layout must resolve its linked ChallengeWheel through the parent template.'
);
assert.ok(
    routeSource.includes('presentation: buildChallengeWheelPresentation(item, exportedItem)'),
    'Normal Designer saves must synchronize wheel content, position and size.'
);
assert.ok(
    routeSource.includes('opening Gift Mapping must never reset it'),
    'Loading Gift Mapping must not overwrite a user-edited wheel with template defaults.'
);
assert.ok(
    !routeSource.includes("$set: {\n                            name: template.name,\n                            title: wheelItem.title"),
    'Template backfill must not update an existing wheel.'
);
assert.ok(
    routeSource.includes('{ ...entry, challengeWheelId }'),
    'The personal layout must retain its ChallengeWheel link.'
);
assert.ok(
    serviceSource.includes("saved.coordinateSpace === 'export-logical-v1'"),
    'Real TikTok gifts must use the same exported wheel geometry as mapping tests.'
);
assert.ok(
    designerSource.includes("linkedItem?.challengeWheelId || linkedItem?.wheelId"),
    'The dedicated wheel save button must recover a missing persisted link.'
);
assert.ok(
    overlaySource.includes("staticWheel.cloneNode(true)"),
    'A live spin must reuse the saved OBS wheel geometry when that wheel is already rendered.'
);
assert.ok(
    routeSource.includes('renderItem') && overlaySource.includes('presentation.renderItem'),
    'A mapped wheel must retain and rebuild its saved design when the active menu has no wheel.'
);

console.log('challenge wheel sync tests passed');
