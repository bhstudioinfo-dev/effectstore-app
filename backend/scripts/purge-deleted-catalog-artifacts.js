/*
 * Removes local runtime records that belong to Challenge Wheel products already
 * deleted from the Store catalog.  This deliberately targets only inactive
 * Challenge Wheel templates, never normal saved gift-menu layouts or active
 * effects.  Run with --execute; without it the script is a dry run.
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const GiftMenuLayout = require('../models/GiftMenuLayout');
const ChallengeWheel = require('../models/ChallengeWheel');
const GiftMapping = require('../models/GiftMapping');
const Effect = require('../models/Effect');

const shouldExecute = process.argv.includes('--execute');
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/effectstore';
const appDataDir = process.env.EFFECTSTORE_DATA_DIR
    || path.join(process.env.APPDATA || process.cwd(), 'effectstore-desktop', 'backend-data');

async function main() {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 8000 });

    const inactiveWheelTemplates = await GiftMenuLayout.find({
        isTemplate: true,
        isActive: false,
        $or: [
            { productType: 'challenge-wheel' },
            { 'items.type': 'challenge-wheel' },
            { 'exportedItems.type': 'challenge-wheel' }
        ]
    }).lean();
    const templateIds = inactiveWheelTemplates.map((template) => String(template._id));
    const [wheels, effects] = await Promise.all([
        ChallengeWheel.find({ sourceTemplateId: { $in: templateIds } }).lean(),
        Effect.find({ category: 'menu_template', fileUrl: { $in: templateIds } }).lean()
    ]);
    const wheelIds = wheels.map((wheel) => String(wheel._id));
    const effectIds = effects.map((effect) => String(effect._id));
    const mappings = await GiftMapping.find({
        $or: [
            { wheelId: { $in: wheelIds } },
            { effectId: { $in: effectIds } },
            { 'effects.effectId': { $in: effectIds } }
        ]
    }).lean();

    const summary = {
        inactiveWheelTemplates: inactiveWheelTemplates.map((template) => ({ id: String(template._id), name: template.name })),
        wheels: wheels.map((wheel) => ({ id: String(wheel._id), name: wheel.name, sourceTemplateId: String(wheel.sourceTemplateId) })),
        staleMenuEffects: effects.map((effect) => ({ id: String(effect._id), name: effect.name, fileUrl: effect.fileUrl })),
        invalidMappings: mappings.map((mapping) => ({ id: String(mapping._id), giftName: mapping.giftName, wheelId: mapping.wheelId ? String(mapping.wheelId) : null }))
    };
    console.log(JSON.stringify({ dryRun: !shouldExecute, ...summary }, null, 2));
    if (!shouldExecute) return;

    const backupDir = path.join(appDataDir, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, `deleted-catalog-artifacts-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), ...summary }, null, 2), 'utf8');

    const [mappingResult, wheelResult, effectResult, templateResult] = await Promise.all([
        GiftMapping.deleteMany({ _id: { $in: mappings.map((mapping) => mapping._id) } }),
        ChallengeWheel.deleteMany({ _id: { $in: wheels.map((wheel) => wheel._id) } }),
        Effect.deleteMany({ _id: { $in: effects.map((effect) => effect._id) } }),
        GiftMenuLayout.deleteMany({ _id: { $in: inactiveWheelTemplates.map((template) => template._id) } })
    ]);
    console.log(JSON.stringify({
        success: true,
        backupPath,
        deleted: {
            mappings: mappingResult.deletedCount,
            wheels: wheelResult.deletedCount,
            effects: effectResult.deletedCount,
            templates: templateResult.deletedCount
        }
    }, null, 2));
}

main()
    .catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; })
    .finally(async () => { await mongoose.disconnect().catch(() => {}); });
