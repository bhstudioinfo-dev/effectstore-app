const mongoose = require('mongoose');
const Effect = require('../models/Effect');
const User = require('../models/User');
const GiftMapping = require('../models/GiftMapping');
const GiftMenuLayout = require('../models/GiftMenuLayout');
const ChallengeWheel = require('../models/ChallengeWheel');

async function detachWheelMappings(wheelIds) {
    if (!wheelIds.length) return;
    await GiftMapping.deleteMany({ wheelId: { $in: wheelIds }, triggerType: 'wheel' });
    await GiftMapping.updateMany(
        { wheelId: { $in: wheelIds } },
        { $set: { wheelId: null, triggerType: 'effect' } }
    );
}

async function deleteCatalogEffectCascade(effectId) {
    if (!mongoose.isObjectIdOrHexString(String(effectId || ''))) return { deleted: false };
    const effect = await Effect.findById(effectId).lean();
    if (!effect) return { deleted: false };

    await User.updateMany(
        { 'purchasedEffects.effectId': effect._id },
        { $pull: { purchasedEffects: { effectId: effect._id } } }
    );
    await GiftMapping.deleteMany({ effectId: String(effect._id) });
    await GiftMapping.updateMany(
        { 'effects.effectId': String(effect._id) },
        { $pull: { effects: { effectId: String(effect._id) } } }
    );

    let deletedTemplateId = null;
    if (effect.category === 'menu_template' && mongoose.isObjectIdOrHexString(String(effect.fileUrl || ''))) {
        deletedTemplateId = String(effect.fileUrl);
        const wheelIds = (await ChallengeWheel.find({ sourceTemplateId: deletedTemplateId }).select('_id').lean())
            .map((wheel) => wheel._id);
        await detachWheelMappings(wheelIds);
        await ChallengeWheel.deleteMany({ sourceTemplateId: deletedTemplateId });
        await GiftMenuLayout.deleteMany({
            $or: [
                { _id: deletedTemplateId, isTemplate: true },
                { parentTemplateId: deletedTemplateId }
            ]
        });
    }

    await Effect.deleteOne({ _id: effect._id });
    return { deleted: true, deletedTemplateId };
}

module.exports = { deleteCatalogEffectCascade, detachWheelMappings };
