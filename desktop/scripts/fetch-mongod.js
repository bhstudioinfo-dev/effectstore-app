// Downloads the standalone mongod.exe LiveFlow bundles as its embedded local
// database (see backend-manager.js startBundledMongo). Only mongod.exe is
// needed — verified to run standalone with no extra DLLs — so this pulls the
// full MongoDB Windows zip to a temp file and extracts just that one entry
// instead of installing the ~1.7GB of debug symbols/mongos/tools it also
// contains. Idempotent: skips work if the binary is already staged.
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');
const os = require('os');

const MONGODB_VERSION = '7.0.14';
const DOWNLOAD_URL = `https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-${MONGODB_VERSION}.zip`;
const VENDOR_DIR = path.resolve(__dirname, '..', 'vendor', 'mongodb');
const TARGET_EXE = path.join(VENDOR_DIR, 'mongod.exe');
const TARGET_LICENSE = path.join(VENDOR_DIR, 'LICENSE-Community.txt');
const ZIP_ENTRY_EXE = `mongodb-win32-x86_64-windows-${MONGODB_VERSION}/bin/mongod.exe`;
const ZIP_ENTRY_LICENSE = `mongodb-win32-x86_64-windows-${MONGODB_VERSION}/LICENSE-Community.txt`;

function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                downloadFile(response.headers.location, destPath).then(resolve, reject);
                return;
            }
            if (response.statusCode !== 200) {
                reject(new Error(`Download failed: HTTP ${response.statusCode} for ${url}`));
                return;
            }
            const fileStream = fs.createWriteStream(destPath);
            response.pipe(fileStream);
            fileStream.on('finish', () => fileStream.close(resolve));
            fileStream.on('error', reject);
        });
        request.on('error', reject);
    });
}

function extractEntry(zipPath, entryName, destPath) {
    const psScript = `
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $zip = [System.IO.Compression.ZipFile]::OpenRead('${zipPath.replace(/'/g, "''")}')
        try {
            $entry = $zip.Entries | Where-Object { $_.FullName -eq '${entryName.replace(/'/g, "''")}' }
            if (-not $entry) { throw "Entry not found: ${entryName}" }
            [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, '${destPath.replace(/'/g, "''")}', $true)
        } finally {
            $zip.Dispose()
        }
    `;
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], { stdio: 'inherit' });
}

async function main() {
    if (fs.existsSync(TARGET_EXE)) {
        console.log(`✅ mongod.exe already staged at ${TARGET_EXE}, skipping download.`);
        return;
    }

    fs.mkdirSync(VENDOR_DIR, { recursive: true });
    const tempZip = path.join(os.tmpdir(), `mongodb-windows-${MONGODB_VERSION}-${Date.now()}.zip`);

    try {
        console.log(`⬇️  Downloading MongoDB ${MONGODB_VERSION} for Windows (this only happens once)...`);
        await downloadFile(DOWNLOAD_URL, tempZip);

        console.log('📦 Extracting mongod.exe from the archive...');
        extractEntry(tempZip, ZIP_ENTRY_EXE, TARGET_EXE);
        extractEntry(tempZip, ZIP_ENTRY_LICENSE, TARGET_LICENSE);

        console.log(`✅ Staged ${TARGET_EXE}`);
    } finally {
        if (fs.existsSync(tempZip)) fs.unlinkSync(tempZip);
    }
}

main().catch((error) => {
    console.error('❌ Failed to fetch mongod.exe:', error.message);
    process.exit(1);
});
