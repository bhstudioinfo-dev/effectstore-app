const User = require('../models/User');
const SystemState = require('../models/SystemState');
const Effect = require('../models/Effect');
const GiftMenuLayout = require('../models/GiftMenuLayout');

const CURRENT_SCHEMA_VERSION = 2;

async function migration1BootstrapState() {
    const admin = await User.findOne({ isAdmin: true }).select('_id').lean();
    if (!admin) return;
    await SystemState.findByIdAndUpdate('admin-bootstrap-claim', {
        value: {
            completed: true,
            adminId: String(admin._id),
            migratedAt: new Date().toISOString()
        },
        updatedAt: new Date()
    }, { upsert: true });
}

async function migration2SyncPublishedMenuProducts() {
    const templates = await GiftMenuLayout.find({ isTemplate: true }).lean();
    for (const template of templates) {
        const templateId = String(template._id);
        const price = Math.max(0, Number(template.price) || 0);
        const originalPrice = Math.max(price, Number(template.originalPrice) || 0);
        await Effect.updateOne(
            { category: 'menu_template', fileUrl: templateId },
            {
                $set: {
                    name: template.name,
                    category: 'menu_template',
                    price,
                    originalPrice,
                    description: template.description || 'Mẫu thiết kế bảng quà.',
                    icon: template.icon || '📋',
                    fileUrl: templateId,
                    duration: 5,
                    isActive: true
                },
                $setOnInsert: { previewUrl: '', thumbUrl: '', createdAt: new Date() }
            },
            { upsert: true }
        );
    }
}

const migrations = new Map([
    [1, migration1BootstrapState],
    [2, migration2SyncPublishedMenuProducts]
]);

async function runSchemaMigrations() {
    const state = await SystemState.findById('schema-version').lean();
    let version = Math.max(0, Number(state?.value?.version) || 0);
    if (version > CURRENT_SCHEMA_VERSION) {
        throw new Error(`Database schema ${version} is newer than supported version ${CURRENT_SCHEMA_VERSION}.`);
    }
    while (version < CURRENT_SCHEMA_VERSION) {
        const nextVersion = version + 1;
        const migrate = migrations.get(nextVersion);
        if (!migrate) throw new Error(`Missing database migration ${nextVersion}.`);
        await migrate();
        await SystemState.findByIdAndUpdate('schema-version', {
            value: { version: nextVersion, migratedAt: new Date().toISOString() },
            updatedAt: new Date()
        }, { upsert: true });
        version = nextVersion;
    }
    return version;
}

module.exports = { CURRENT_SCHEMA_VERSION, runSchemaMigrations };
