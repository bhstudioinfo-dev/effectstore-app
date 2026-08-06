const sessionTokens = new Map();

function rememberCloudSessionToken(userId, token) {
    const normalizedUserId = String(userId || '').trim();
    const normalizedToken = String(token || '').trim();
    if (!normalizedUserId || !normalizedToken) return false;
    sessionTokens.set(normalizedUserId, normalizedToken);
    return true;
}

function getCloudSessionToken(userId) {
    return sessionTokens.get(String(userId || '').trim()) || '';
}

function getAnyCloudSessionToken() {
    for (const token of sessionTokens.values()) {
        if (token) return token;
    }
    return '';
}

function forgetCloudSessionToken(userId) {
    sessionTokens.delete(String(userId || '').trim());
}

function clearCloudSessionTokens() {
    sessionTokens.clear();
}

module.exports = {
    clearCloudSessionTokens,
    forgetCloudSessionToken,
    getCloudSessionToken,
    getAnyCloudSessionToken,
    rememberCloudSessionToken
};
