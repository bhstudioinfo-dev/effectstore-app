const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'desktop', 'renderer', 'js', 'home.js');

let content = fs.readFileSync(file, 'utf8');

const newUpgradeFn = `    async upgradeSubscription(userId, plan, durationDays, extend = false) {
        const planLabel = { pro: 'Basic', business: 'Pro', studio: 'Studio', free: 'Miễn phí' }[plan] || plan;
        const msg = plan === 'free'
            ? \`Hạ tài khoản về Free?\`
            : (extend ? \`Gia hạn thêm gói \${planLabel} thêm \${durationDays} ngày?\` : \`Đặt gói \${planLabel} trong \${durationDays} ngày?\`);
        if (!confirm(msg)) return;
        try {
            const res = await fetch(\`\${this.API_URL}/api/admin/users/\${userId}/subscription\`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${this.authToken}\` },
                body: JSON.stringify({ plan, durationDays, extend })
            });
            const data = await res.json();
            if (data.success) {
                this.showNotification('success', extend ? \`✅ Đã gia hạn thành công!\` : \`✅ Đã đặt gói \${planLabel}!\`);
                this.loadAdminUsers();
            } else {
                this.showNotification('error', '❌ Lỗi: ' + data.error);
            }
        } catch (e) {
            this.showNotification('error', '❌ Lỗi kết nối: ' + e.message);
        }
    }`;

const upgradeFnRegex = /async\s+upgradeSubscription\s*\(userId,\s*plan,\s*durationDays\)\s*\{[\s\S]+?this\.showNotification\('error',\s*'❌\s*Lỗi\s*kết\s*nối:\s*'\s*\+\s*err\.message\);\s*\}\s*\}/;

if (upgradeFnRegex.test(content)) {
    content = content.replace(upgradeFnRegex, newUpgradeFn);
    console.log('upgradeSubscription function replaced via Regex');
} else {
    console.warn('upgradeSubscription pattern not matched.');
}

fs.writeFileSync(file, content, 'utf8');
console.log('Successfully completed home.js updates');
