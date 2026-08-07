const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

function rotateLogFile(logPath, maxBytes = 5 * 1024 * 1024, keep = 5) {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxBytes) return false;
    const directory = path.dirname(logPath);
    const extension = path.extname(logPath);
    const base = path.basename(logPath, extension);
    const rotatedPath = path.join(directory, `${base}-${new Date().toISOString().replace(/[:.]/g, '-')}${extension}`);
    fs.renameSync(logPath, rotatedPath);
    const rotated = fs.readdirSync(directory)
        .filter((name) => name.startsWith(`${base}-`) && name.endsWith(extension))
        .map((name) => ({ name, time: fs.statSync(path.join(directory, name)).mtimeMs }))
        .sort((a, b) => b.time - a.time);
    rotated.slice(Math.max(1, keep)).forEach((entry) => fs.unlinkSync(path.join(directory, entry.name)));
    return true;
}

const BACKEND_HOSTS = ['127.0.0.1', 'localhost'];
const BACKEND_STATUS_PATH = '/api/system/status';
const BACKEND_PORT = 9000;

function makeBackendUrl(host) {
    return `http://${host}:${BACKEND_PORT}${BACKEND_STATUS_PATH}`;
}

function tryBackendRequest(url, timeoutMs) {
    return new Promise((resolve) => {
        const request = http.get(url, { timeout: timeoutMs }, (response) => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => { body += chunk; });
            response.on('end', () => {
                const reachable = response.statusCode === 200 || response.statusCode === 503;
                resolve({ reachable, response, body });
            });
        });
        request.on('timeout', () => { request.destroy(); resolve({ reachable: false }); });
        request.on('error', () => resolve({ reachable: false }));
        request.on('close', () => {});
    });
}

function backendHealthCheck(timeoutMs = 1000) {
    return new Promise(async (resolve) => {
        for (const host of BACKEND_HOSTS) {
            const result = await tryBackendRequest(makeBackendUrl(host), timeoutMs);
            if (result.reachable) return resolve(true);
        }
        resolve(false);
    });
}

function backendStatus(timeoutMs = 1500) {
    return new Promise(async (resolve) => {
        for (const host of BACKEND_HOSTS) {
            const result = await tryBackendRequest(makeBackendUrl(host), timeoutMs);
            if (!result.reachable) continue;
            try {
                resolve({ reachable: true, statusCode: result.response.statusCode, ...JSON.parse(result.body) });
                return;
            } catch (_error) {
                resolve({ reachable: true, statusCode: result.response.statusCode, success: false });
                return;
            }
        }
        resolve({ reachable: false });
    });
}

function createSecretCodec(codec = {}) {
    if (typeof codec.protect !== 'function' || typeof codec.reveal !== 'function') {
        throw new Error('A secure secret codec is required for backend configuration.');
    }
    return {
        protect: codec.protect,
        reveal: codec.reveal
    };
}

function ensureBackendConfig(userDataPath, codecOptions = {}, sharedDefaults = {}) {
    const configPath = path.join(userDataPath, 'backend-config.json');
    let stored = {};
    if (fs.existsSync(configPath)) {
        try { stored = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (_error) {}
    }
    const codec = createSecretCodec(codecOptions);
    const readSecret = (name) => {
        if (stored[name]) return String(stored[name]); // migrate legacy plaintext config
        if (!stored.secrets?.[name]) return '';
        try { return codec.reveal(stored.secrets[name]); } catch (_error) { return ''; }
    };
    const config = {
        JWT_SECRET: readSecret('JWT_SECRET'),
        ENCRYPTION_PASSWORD: readSecret('ENCRYPTION_PASSWORD'),
        INITIAL_SETUP_TOKEN: readSecret('INITIAL_SETUP_TOKEN'),
        MONGODB_URI: readSecret('MONGODB_URI'),
        API_HOST: '0.0.0.0',
        WS_HOST: '0.0.0.0'
    };
    if (config.JWT_SECRET.length < 32) {
        config.JWT_SECRET = crypto.randomBytes(48).toString('hex');
    }
    if (config.ENCRYPTION_PASSWORD.length < 32) {
        config.ENCRYPTION_PASSWORD = crypto.randomBytes(48).toString('hex');
    }
    if (config.INITIAL_SETUP_TOKEN.length < 32) config.INITIAL_SETUP_TOKEN = crypto.randomBytes(48).toString('hex');
    if (!config.MONGODB_URI) config.MONGODB_URI = 'mongodb://127.0.0.1:27017/effectstore';

    fs.mkdirSync(userDataPath, { recursive: true });
    const persisted = {
        version: 2,
        API_HOST: config.API_HOST,
        WS_HOST: config.WS_HOST,
        secrets: {
            JWT_SECRET: codec.protect(config.JWT_SECRET),
            ENCRYPTION_PASSWORD: codec.protect(config.ENCRYPTION_PASSWORD),
            INITIAL_SETUP_TOKEN: codec.protect(config.INITIAL_SETUP_TOKEN),
            MONGODB_URI: codec.protect(config.MONGODB_URI)
        }
    };
    fs.writeFileSync(configPath, `${JSON.stringify(persisted, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    return config;
}

function updateMongoUri(userDataPath, mongoUri, codecOptions = {}) {
    const normalized = String(mongoUri || '').trim();
    if (!/^mongodb(?:\+srv)?:\/\//i.test(normalized)) throw new Error('MongoDB URI không hợp lệ.');
    const config = ensureBackendConfig(userDataPath, codecOptions);
    const configPath = path.join(userDataPath, 'backend-config.json');
    const persisted = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const codec = createSecretCodec(codecOptions);
    persisted.secrets.MONGODB_URI = codec.protect(normalized);
    fs.writeFileSync(configPath, `${JSON.stringify(persisted, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    return { ...config, MONGODB_URI: normalized };
}

function resolveBackendPath({ isPackaged, resourcesPath, desktopDirectory }) {
    return isPackaged
        ? path.join(resourcesPath, 'backend', 'server.js')
        : path.resolve(desktopDirectory, '..', 'backend', 'server.js');
}

async function startManagedBackend(options) {
    if (await backendHealthCheck()) return { process: null, managed: false, reason: 'already-running' };

    const backendEntry = resolveBackendPath(options);
    if (!fs.existsSync(backendEntry)) throw new Error(`Không tìm thấy backend: ${backendEntry}`);
    const config = ensureBackendConfig(options.userDataPath, options.secretCodec);
    const dataDirectory = path.join(options.userDataPath, 'backend-data');
    const logsDirectory = path.join(options.userDataPath, 'logs');
    fs.mkdirSync(dataDirectory, { recursive: true });
    fs.mkdirSync(logsDirectory, { recursive: true });
    const backendLogPath = path.join(logsDirectory, 'backend.log');
    rotateLogFile(backendLogPath);
    const logStream = fs.createWriteStream(backendLogPath, { flags: 'a' });

    const childEnvironment = {
        ...process.env,
        ...config,
        NODE_ENV: options.isPackaged ? 'production' : (process.env.NODE_ENV || 'development'),
        EFFECTSTORE_STARTUP_TRACE: 'true',
        EFFECTSTORE_DATA_DIR: dataDirectory,
        EFFECTSTORE_LEGACY_DATA_DIR: options.legacyDataDirectory || '',
        CLOUD_API_URL: process.env.CLOUD_API_URL || options.cloudApiUrl || '',
        CLOUD_JWT_PUBLIC_KEY: process.env.CLOUD_JWT_PUBLIC_KEY || options.cloudJwtPublicKey || ''
    };
    if (!options.launchProcess) childEnvironment.ELECTRON_RUN_AS_NODE = '1';

    const processOptions = {
        cwd: path.dirname(backendEntry),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: childEnvironment
    };
    const child = options.launchProcess
        ? options.launchProcess(backendEntry, processOptions)
        : spawn(options.executablePath, [backendEntry], processOptions);
    child.__effectstoreExited = false;
    if (child.stdout) child.stdout.pipe(logStream);
    if (child.stderr) child.stderr.pipe(logStream);
    child.once('exit', (code) => {
        child.__effectstoreExited = true;
        child.__effectstoreExitCode = code;
        logStream.end();
    });

    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        if (child.__effectstoreExited) throw new Error(`Backend đã dừng với mã ${child.__effectstoreExitCode}. Xem logs/backend.log.`);
        if (await backendHealthCheck(1000)) return { process: child, managed: true, reason: 'started' };
        await new Promise((resolve) => setTimeout(resolve, 300));
    }
    const errorMsg = 'Backend không sẵn sàng sau 30 giây. Kiểm tra MongoDB và logs/backend.log.';
    try { child.kill('SIGTERM'); } catch (_err) {}
    throw new Error(errorMsg);
}

function stopManagedBackend(child, timeoutMs = 5000) {
    if (!child || child.__effectstoreExited) return Promise.resolve();
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            if (!child.__effectstoreExited) child.kill();
            resolve();
        }, timeoutMs);
        timer.unref();
        child.once('exit', () => { clearTimeout(timer); resolve(); });
        child.kill('SIGTERM');
    });
}

module.exports = {
    backendHealthCheck,
    backendStatus,
    ensureBackendConfig,
    updateMongoUri,
    rotateLogFile,
    resolveBackendPath,
    startManagedBackend,
    stopManagedBackend
};
