const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { paths: dataPaths } = require('../config/dataPaths');

const appDataRoot = path.dirname(dataPaths.customEffectsDir);
const soundboardDir = path.join(appDataRoot, 'soundboard');
const remoteUploadDir = path.join(dataPaths.tempDir, 'remote-media');
const MAX_EFFECT_BYTES = 500 * 1024 * 1024;
const MAX_SOUND_BYTES = 30 * 1024 * 1024;
const EFFECT_EXTENSIONS = new Set(['.mp4', '.mov', '.avi', '.webm']);
const SOUND_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac']);

function getFfmpegPath() {
    try {
        const candidate = require('ffmpeg-static');
        if (candidate && fs.existsSync(candidate)) return candidate;
    } catch (_error) {}
    return process.env.FFMPEG_PATH || 'ffmpeg';
}

function runFfmpeg(args, timeoutMs = 10 * 60 * 1000) {
    return new Promise((resolve, reject) => {
        const child = spawn(getFfmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', ...args], { windowsHide: true });
        let stderr = '';
        child.stderr.on('data', (chunk) => { stderr += chunk.toString().slice(-4000); });
        const timeout = setTimeout(() => {
            child.kill();
            reject(new Error('Tối ưu media quá thời gian cho phép.'));
        }, timeoutMs);
        child.on('error', (error) => {
            clearTimeout(timeout);
            reject(error);
        });
        child.on('close', (code) => {
            clearTimeout(timeout);
            if (code === 0) resolve({ stderr });
            else reject(new Error(stderr.trim() || `FFmpeg exited with code ${code}.`));
        });
    });
}

async function getDurationSeconds(inputPath) {
    try {
        const result = await runFfmpeg(['-i', inputPath, '-f', 'null', '-'], 120000);
        const match = result.stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
        if (!match) return null;
        return Math.max(0.1, Math.min(15, Math.round(((Number(match[1]) * 3600) +
            (Number(match[2]) * 60) + Number(match[3])) * 10) / 10));
    } catch (_error) {
        return null;
    }
}

function ensureDirectories() {
    fs.mkdirSync(remoteUploadDir, { recursive: true });
    fs.mkdirSync(dataPaths.customEffectsDir, { recursive: true });
    fs.mkdirSync(soundboardDir, { recursive: true });
}

function readSoundLibrary() {
    try {
        const parsed = JSON.parse(fs.readFileSync(path.join(soundboardDir, 'library.json'), 'utf8'));
        return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
        return [];
    }
}

async function saveRemoteSound(uploadedFile, requestedName) {
    ensureDirectories();
    const ext = path.extname(uploadedFile.originalname || '').toLowerCase();
    if (!SOUND_EXTENSIONS.has(ext)) throw new Error('Chỉ hỗ trợ MP3, WAV, OGG, M4A hoặc AAC.');
    if (uploadedFile.size > MAX_SOUND_BYTES) throw new Error('File âm thanh phải nhỏ hơn 30MB.');
    const id = `sound-${crypto.randomUUID()}`;
    const fileName = `${id}${ext}`;
    fs.renameSync(uploadedFile.path, path.join(soundboardDir, fileName));
    const sound = {
        id,
        name: String(requestedName || path.basename(uploadedFile.originalname, ext) || 'Sound').trim().slice(0, 60),
        fileName,
        url: `http://127.0.0.1:${process.env.PORT || 9000}/soundboard/${fileName}`,
        bytes: uploadedFile.size,
        createdAt: new Date().toISOString()
    };
    const library = [...readSoundLibrary().filter((item) => item?.id !== id), sound];
    fs.writeFileSync(path.join(soundboardDir, 'library.json'), JSON.stringify(library, null, 2), 'utf8');
    return sound;
}

async function saveRemoteEffect(uploadedFile, requestedName) {
    ensureDirectories();
    const ext = path.extname(uploadedFile.originalname || '').toLowerCase();
    if (!EFFECT_EXTENSIONS.has(ext)) throw new Error('Chỉ hỗ trợ MP4, MOV, AVI hoặc WebM.');
    if (uploadedFile.size > MAX_EFFECT_BYTES) throw new Error('Video hiệu ứng phải nhỏ hơn 500MB.');
    const id = `custom-${crypto.randomUUID()}`;
    const targetDir = path.join(dataPaths.customEffectsDir, id);
    const outputPath = path.join(targetDir, 'effect.webm');
    const thumbnailPath = path.join(targetDir, 'thumbnail.png');
    fs.mkdirSync(targetDir, { recursive: false });
    try {
        await runFfmpeg([
            '-i', uploadedFile.path, '-t', '15',
            '-vf', "scale=720:1280:force_original_aspect_ratio=decrease:flags=lanczos,pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=black@0,fps=30,format=yuva420p",
            '-an', '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-crf', '30', '-b:v', '0',
            '-deadline', 'good', '-cpu-used', '4', '-row-mt', '1', outputPath
        ]);
        await runFfmpeg([
            '-ss', '0', '-i', outputPath, '-frames:v', '1',
            '-vf', 'scale=360:640:force_original_aspect_ratio=decrease,pad=360:640:(ow-iw)/2:(oh-ih)/2:color=black@0',
            thumbnailPath
        ], 120000);
        const duration = await getDurationSeconds(outputPath);
        if (!duration) throw new Error('Không đọc được thời lượng video sau khi tối ưu.');
        const PORT = process.env.PORT || 9000;
        const effect = {
            id,
            _id: id,
            userId: options.userId ? String(options.userId) : null,
            localId: id,
            name: String(requestedName || path.basename(uploadedFile.originalname, ext) || 'Hiệu ứng').trim().slice(0, 80),
            icon: '🎬',
            isCustom: true,
            createdAt: new Date().toISOString(),
            sourceName: path.basename(uploadedFile.originalname),
            originalBytes: uploadedFile.size,
            optimizedBytes: fs.statSync(outputPath).size,
            duration,
            maxDurationSeconds: 15,
            format: 'webm-vp9',
            width: 720,
            height: 1280,
            fps: 30,
            previewUrl: `http://127.0.0.1:${PORT}/custom-effects/${id}/effect.webm`,
            thumbUrl: `http://127.0.0.1:${PORT}/custom-effects/${id}/thumbnail.png`
        };
        fs.writeFileSync(path.join(targetDir, 'metadata.json'), JSON.stringify(effect, null, 2), 'utf8');
        return effect;
    } catch (error) {
        if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });
        throw error;
    } finally {
        if (fs.existsSync(uploadedFile.path)) fs.rmSync(uploadedFile.path, { force: true });
    }
}

ensureDirectories();

module.exports = {
    EFFECT_EXTENSIONS,
    MAX_EFFECT_BYTES,
    MAX_SOUND_BYTES,
    SOUND_EXTENSIONS,
    remoteUploadDir,
    saveRemoteEffect,
    saveRemoteSound
};
