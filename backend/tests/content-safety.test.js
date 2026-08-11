const assert = require('assert');
const { moderateText, normalizeForSafety } = require('../services/contentSafetyService');

assert.strictEqual(moderateText('Idol hôm nay xinh quá').allowed, true);
assert.strictEqual(moderateText('Bạn cho mình hỏi sản phẩm này dùng thế nào?').allowed, true);
assert.strictEqual(moderateText('d.m.m đồ chó').allowed, false);
assert.strictEqual(moderateText('Tôi muốn tự tử').category, 'self_harm');
assert.strictEqual(moderateText('Chuyển khoản trước để nhận thưởng').category, 'gambling_scam');
assert.strictEqual(moderateText('Số điện thoại của tôi là 0912345678').category, 'personal_information');
assert.strictEqual(moderateText('https://spam.example').category, 'spam');
assert.strictEqual(moderateText('Cảm ơn bạn nhiều nhé!').allowed, true);
assert.strictEqual(moderateText('Gọi ngay 0901234567', { output: true }).allowed, false);
assert.strictEqual(normalizeForSafety('Địt mẹ'), 'dit me');

console.log('content safety tests passed');
