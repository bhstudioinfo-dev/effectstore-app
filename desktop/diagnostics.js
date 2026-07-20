function sanitizeDiagnosticText(value) {
    return String(value || '')
        .replace(/mongodb(?:\+srv)?:\/\/[^\s"']+/gi, 'mongodb://[REDACTED]')
        .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
        .replace(/(JWT_SECRET|ENCRYPTION_PASSWORD|INITIAL_SETUP_TOKEN)\s*[=:]\s*[^\s]+/gi, '$1=[REDACTED]');
}

module.exports = { sanitizeDiagnosticText };
