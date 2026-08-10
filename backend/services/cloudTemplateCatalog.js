const GiftMenuLayout = require('../models/GiftMenuLayout');

const CLOUD_API_URL = String(process.env.CLOUD_API_URL || '').trim().replace(/\/+$/, '');

function isDesktopManagedBackend() {
    return process.env.EFFECTSTORE_DESKTOP_MANAGED === 'true' && Boolean(CLOUD_API_URL);
}

function resolveCloudAssetUrl(value) {
    const raw = String(value || '').trim();
    if (!raw || /^https?:\/\//i.test(raw) || !CLOUD_API_URL) return raw;
    return `${CLOUD_API_URL}${raw.startsWith('/') ? '' : '/'}${raw}`;
}

async function fetchCloudTemplateJson(pathname, token = '', options = {}) {
    if (!isDesktopManagedBackend()) return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        let body;
        if (options.body !== undefined) {
            headers['Content-Type'] = 'application/json';
            body = JSON.stringify(options.body);
        }
        const response = await fetch(`${CLOUD_API_URL}${pathname}`, {
            method: options.method || 'GET',
            headers,
            body,
            signal: controller.signal
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.success === false) {
            const error = new Error(data.error || `Cloud template request failed (${response.status})`);
            error.status = response.status;
            throw error;
        }
        return data;
    } finally {
        clearTimeout(timeout);
    }
}

function templateFields(template) {
    return {
        name: template.name || 'Mẫu bảng quà',
        version: template.version || 2,
        savedAt: template.savedAt || template.updatedAt || new Date(),
        aspectRatio: template.aspectRatio || '9:16',
        canvasSize: template.canvasSize || {},
        safeArea: template.safeArea || {},
        exportSize: template.exportSize || {},
        items: Array.isArray(template.items) ? template.items : [],
        exportedItems: Array.isArray(template.exportedItems) ? template.exportedItems : [],
        isActive: false,
        isTemplate: true,
        category: template.category || 'all',
        productType: template.productType || 'standard',
        price: Number(template.price) || 0,
        originalPrice: Number(template.originalPrice) || 0,
        description: template.description || '',
        icon: template.icon || '📋',
        isPremium: Boolean(template.isPremium),
        requiredPlan: template.requiredPlan || 'free',
        editableSchema: Array.isArray(template.editableSchema) ? template.editableSchema : []
    };
}

async function mirrorCloudTemplates(templates = []) {
    const valid = templates.filter((template) => template && (template._id || template.id));
    await Promise.all(valid.map((template) => GiftMenuLayout.findByIdAndUpdate(
        template._id || template.id,
        { $set: templateFields(template) },
        { upsert: true, setDefaultsOnInsert: true, runValidators: false }
    )));
    return valid;
}

async function syncCloudTemplateList(token = '') {
    const data = await fetchCloudTemplateJson('/api/tiktok/gift-menu-templates', token);
    if (!data) return null;
    const templates = Array.isArray(data.templates) ? data.templates : [];
    await mirrorCloudTemplates(templates);
    return templates;
}

async function syncCloudTemplate(templateId, token = '') {
    const data = await fetchCloudTemplateJson(`/api/tiktok/gift-menu-templates/${encodeURIComponent(templateId)}`, token);
    if (!data) return null;
    if (data.template) await mirrorCloudTemplates([data.template]);
    return data.template || null;
}

module.exports = {
    fetchCloudTemplateJson,
    isDesktopManagedBackend,
    mirrorCloudTemplates,
    resolveCloudAssetUrl,
    syncCloudTemplate,
    syncCloudTemplateList,
    templateFields
};
