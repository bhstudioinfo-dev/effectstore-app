const fs = require('fs');
const path = require('path');

// 1. Update backend/routes/auth.js
const authFile = path.join(__dirname, '..', 'backend', 'routes', 'auth.js');
if (fs.existsSync(authFile)) {
    let content = fs.readFileSync(authFile, 'utf8');
    content = content.replace(
        "const deviceLimits = { 'free': 1, 'pro': 2, 'business': 5 };",
        "const deviceLimits = { 'free': 1, 'pro': 2, 'business': 5, 'studio': 999 };"
    );
    fs.writeFileSync(authFile, content, 'utf8');
    console.log('Successfully updated auth.js device limits');
}

// 2. Update backend/routes/tiktok.js
const tiktokFile = path.join(__dirname, '..', 'backend', 'routes', 'tiktok.js');
if (fs.existsSync(tiktokFile)) {
    let content = fs.readFileSync(tiktokFile, 'utf8');
    content = content.replace(
        "const limits = { 'free': 5, 'pro': 20, 'business': 100 };",
        "const limits = { 'free': 5, 'pro': 20, 'business': 100, 'studio': 9999 };"
    );
    fs.writeFileSync(tiktokFile, content, 'utf8');
    console.log('Successfully updated tiktok.js mapping limits');
}

// 3. Update backend/routes/admin.js
const adminFile = path.join(__dirname, '..', 'backend', 'routes', 'admin.js');
if (fs.existsSync(adminFile)) {
    let content = fs.readFileSync(adminFile, 'utf8');
    content = content.replace(
        `        user.subscription = plan;
        if (plan !== 'free') {
            const exp = new Date();
            exp.setDate(exp.getDate() + (parseInt(durationDays) || 30));
            user.subscriptionExpiresAt = exp;
        } else {
            user.subscriptionExpiresAt = null;
        }`,
        `        user.subscription = plan;
        if (plan !== 'free') {
            let baseDate = new Date();
            if (extend && user.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt) > new Date()) {
                baseDate = new Date(user.subscriptionExpiresAt);
            }
            const exp = baseDate;
            exp.setDate(exp.getDate() + (parseInt(durationDays) || 30));
            user.subscriptionExpiresAt = exp;
        } else {
            user.subscriptionExpiresAt = null;
        }`
    );
    // Also extract req.body parameters to include extend
    content = content.replace(
        "const { plan, durationDays } = req.body;",
        "const { plan, durationDays, extend } = req.body;"
    );
    fs.writeFileSync(adminFile, content, 'utf8');
    console.log('Successfully updated admin.js subscription extension');
}
