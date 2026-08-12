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
const { mirrorUserLocally } = require('../services/localUserMirror');
const { forgetCloudSessionToken, rememberCloudSessionToken, getCloudSessionToken, getAnyCloudSessionToken } = require('../services/cloudSessionTokenStore');
const { verifyUserToken } = require('../services/userToken');
const Effect = require('../models/Effect');

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

    if (!headers['authorization']) {
        const activeToken = (req.userId ? getCloudSessionToken(req.userId) : '') || getAnyCloudSessionToken();
        if (activeToken) {
            headers['authorization'] = `Bearer ${activeToken}`;
        }
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
            const contentType = cloudRes.headers.get('content-type');

            // Local-only routes (OBS trigger, TikTok Live) must keep working
            // without a network round-trip, so they check this machine's own
            // User model directly — mirror the account data every time the
            // central server confirms it (login, /me, profile updates...) so
            // a brand-new account or a fresh purchase made elsewhere is never
            // invisible to those routes. Complete the mirror before returning
            // an auth response, otherwise the renderer immediately calls
            // local-only APIs with an account that does not exist locally yet.
            if (cloudRes.ok && contentType && contentType.includes('application/json')) {
                try {
                    const parsed = JSON.parse(text);
                    const userId = parsed?.user?.id || parsed?.user?._id;
                    if (userId) {
                        await mirrorUserLocally(parsed.user);
                        const responseToken = parsed.token;
                        const requestToken = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
                        rememberCloudSessionToken(userId, responseToken || requestToken);
                    }
                } catch (_error) { /* not a mirrorable JSON body */ }
            }

            res.status(cloudRes.status);
            if (contentType) res.set('content-type', contentType);
            res.send(text);
            if (cloudRes.ok && req.path === '/logout') {
                try {
                    const requestToken = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
                    const decoded = verifyUserToken(requestToken);
                    if (decoded?.userId) forgetCloudSessionToken(decoded.userId);
                } catch (_error) { /* invalid/expired token has no reusable session */ }
            }

            // The reverse of mirrorEffectFromCentral (effectLibraryService.js):
            // deleting an effect centrally must also clear this machine's own
            // local copy, or the TikTok/OBS mapping screen — which reads the
            // local Effect model directly for live-trigger speed — would keep
            // showing a "ghost" effect forever after it was deleted elsewhere.
            if (cloudRes.ok && req.method === 'DELETE') {
                const match = req.path.match(/^\/api\/effects\/([a-f0-9]{24})$/);
                if (match) Effect.findByIdAndDelete(match[1]).catch(() => {});
            }
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
