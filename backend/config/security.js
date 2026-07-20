const MIN_JWT_SECRET_LENGTH = 32;

const INSECURE_JWT_SECRETS = new Set([
    'your-secret-key',
    'secret',
    'jwt-secret',
    'changeme'
]);

function getJwtSecret() {
    const secret = String(process.env.JWT_SECRET || '').trim();
    if (secret.length < MIN_JWT_SECRET_LENGTH || INSECURE_JWT_SECRETS.has(secret.toLowerCase())) {
        throw new Error(`JWT_SECRET must be a unique secret with at least ${MIN_JWT_SECRET_LENGTH} characters.`);
    }
    return secret;
}

function assertSecurityConfiguration() {
    getJwtSecret();
}

function isAdminUser(user) {
    return Boolean(user && user.isAdmin === true);
}

module.exports = {
    MIN_JWT_SECRET_LENGTH,
    assertSecurityConfiguration,
    getJwtSecret,
    isAdminUser
};
