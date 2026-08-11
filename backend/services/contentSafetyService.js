function normalizeForSafety(value) {
    return String(value || '').normalize('NFKC').toLowerCase()
        .replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, 'a').replace(/[èéẹẻẽêềếệểễ]/g, 'e')
        .replace(/[ìíịỉĩ]/g, 'i').replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, 'o')
        .replace(/[ùúụủũưừứựửữ]/g, 'u').replace(/[ỳýỵỷỹ]/g, 'y').replace(/đ/g, 'd')
        .replace(/[@4]/g, 'a').replace(/3/g, 'e').replace(/[1!|]/g, 'i')
        .replace(/0/g, 'o').replace(/[5$]/g, 's')
        .replace(/[^a-z0-9\s.:/@+-]/g, ' ').replace(/\s+/g, ' ').trim();
}

const CATEGORY_RULES = [
    ['youth_safety', /\b(tre em|tre con|vi thanh nien).{0,30}\b(khoa than|tinh duc|quan he|anh nong|gai goi)\b/],
    ['sexual_exploitation', /\b(hiep dam|cuong hiep|xam hai tinh duc|tong tien anh nong|phat tan anh nong|grooming)\b/],
    ['self_harm', /\b(tu tu|tu sat|cat tay|nhay lau|uong thuoc de chet|muon chet|khong muon song)\b/],
    ['violence', /\b(giet|chem chet|dam chet|ban chet|no sung|danh chet|xu ly no|cho no chet|cho may chet)\b.{0,24}\b(may|no|nguoi|idol|gia dinh)?\b/],
    ['hate', /\b(tieu diet|duoi het|khong dang song|ha dang|suc vat)\b.{0,28}\b(dan toc|ton giao|gioi tinh|dong tinh|nguoi khuyet tat|chung toc)\b/],
    ['harassment', /\b(dcm|dmm|dm may|du ma|dit me|dit cha|con di|do cho|cho de|mat day|oc cho|suc vat)\b/],
    ['sexual', /\b(quan he tinh duc|lam tinh|anh nong|clip nong|khoa than|gai goi|mua dam|ban dam)\b/],
    ['regulated_goods', /\b(mua|ban|ship|order|gia)\b.{0,24}\b(ma tuy|can sa|thuoc lac|keo ke|sung|dan duoc|vu khi|thuoc la dien tu)\b/],
    ['gambling_scam', /\b(choi de|danh de|ca do|tai xiu|nha cai|casino|keo baccarat|chuyen khoan truoc|nhan thuong|trung thuong)\b/],
    ['dangerous_challenge', /\b(thu thach|challenge|lam thu)\b.{0,30}\b(nhay lau|dot lua|uong hoa chat|nit tho|tu gay thuong tich)\b/]
];

function looksLikePrivateInfo(raw, normalized) {
  // Keep the boundary check on the original text. Compacting the whole
  // sentence can glue the preceding word to the phone number (for example
  // "la0912...") and make a valid number invisible to the matcher.
  if (/(?:^|[^\d])(?:\+?84|0)(?:[\s.-]?\d){9}(?!\d)/.test(raw)) return true;
    if (/\b(?:cccd|cmnd|so tai khoan|mat khau|otp|dia chi nha)\b/.test(normalized)) return true;
    return /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(raw);
}

function looksLikeSpam(raw, normalized) {
    if (/(https?:\/\/|www\.|t\.me\/|zalo\.me\/)/i.test(raw)) return true;
    if (/(.)\1{9,}/u.test(raw)) return true;
    const words = normalized.split(' ').filter(Boolean);
    return words.length >= 8 && new Set(words).size <= 2;
}

function moderateText(value, { output = false } = {}) {
    const raw = String(value || '').trim();
    const normalized = normalizeForSafety(raw);
    if (!normalized || normalized.length < 2) return { allowed: false, category: 'empty' };
    if (raw.length > (output ? 320 : 500)) return { allowed: false, category: 'oversized' };
    if (looksLikePrivateInfo(raw, normalized)) return { allowed: false, category: 'personal_information' };
    if (looksLikeSpam(raw, normalized)) return { allowed: false, category: 'spam' };
    for (const [category, pattern] of CATEGORY_RULES) {
        if (pattern.test(normalized)) return { allowed: false, category };
    }
    return { allowed: true, category: 'safe', normalized };
}

module.exports = { normalizeForSafety, moderateText };
