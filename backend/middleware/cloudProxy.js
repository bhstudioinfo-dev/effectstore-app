// Forwards specific routes from the local, per-machine backend to the
// centrally-hosted server (see docs/COMMERCIAL_CLOUD_ROADMAP.md Giai đoạn A/B).
// Only routes with no local-disk dependency (auth, payment, banner reads,
// effect catalog reads) go through here — anything that touches OBS, TikTok
// Live, local layout files, or uploads a file stays fully local and never
// passes through this file.
//
// Opt-in and zero-risk when unconfigured: if CLOUD_API_URL isn't set, none of
// this is mounted and every route keeps working exactly as it did before.

const CLOUD_API_URL = String(process.env.CLOUD_API_URL || '').trim().replace(/\/+$/, '');

function isCloudProxyEnabled() {
    return Boolean(CLOUD_API_URL);
}

// Headers that must not be forwarded verbatim between hops.
const HOP_BY_HOP_HEADERS = new Set([
    'host', 'connection', 'content-length', 'accept-encoding',
    'transfer-encoding', 'upgrade', 'keep-alive'
]);

function proxyToCloud(req, res) {
    const target = `${CLOUD_API_URL}${req.originalUrl}`;
    const headers = {};
    for (const [key, value] of Object.entries(req.headers)) {
        if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase()) && value !== undefined) headers[key] = value;
    }

    const isBodylessMethod = ['GET', 'HEAD'].includes(req.method);
    const hasJsonBody = !isBodylessMethod && req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0;
    if (hasJsonBody) headers['content-type'] = 'application/json';

    // A write request whose body wasn't parsed as JSON (e.g. a multipart
    // effect-file upload — express.json() ignores non-JSON content types and
    // leaves the raw stream untouched) gets streamed straight through
    // unchanged, so multer on the central server parses the exact same bytes
    // the client sent, file included.
    const isRawStreamBody = !isBodylessMethod && !hasJsonBody && !req.readableEnded;
    const body = hasJsonBody ? JSON.stringify(req.body) : (isRawStreamBody ? req : undefined);

    // The free-tier central server can be asleep and take up to ~50s to wake;
    // give it real room instead of failing a request that would have worked.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    fetch(target, {
        method: req.method,
        headers,
        body,
        duplex: isRawStreamBody ? 'half' : undefined,
        signal: controller.signal
    })
        .then(async (cloudRes) => {
            clearTimeout(timeout);
            const text = await cloudRes.text();
            res.status(cloudRes.status);
            const contentType = cloudRes.headers.get('content-type');
            if (contentType) res.set('content-type', contentType);
            res.send(text);
        })
        .catch((err) => {
            clearTimeout(timeout);
            const timedOut = err && err.name === 'AbortError';
            res.status(502).json({
                success: false,
                error: timedOut
                    ? 'Trạm trung tâm phản hồi quá lâu (có thể đang khởi động lại). Vui lòng thử lại sau ít giây.'
                    : 'Không thể kết nối tới trạm trung tâm. Vui lòng kiểm tra kết nối mạng.'
            });
        });
}

module.exports = { isCloudProxyEnabled, proxyToCloud };
