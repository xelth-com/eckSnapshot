// .ecksnapshot.config.js

// Я заменил "module.exports =" на "export default"
export default {
    filesToIgnore: [
        'package-lock.json',
        'yarn.lock',
        'pnpm-lock.yaml'
    ],
    extensionsToIgnore: [
        '.sqlite3',
        '.db',
        '.DS_Store',
        '.env',
        '.log',
        '.tmp',
        '.bak',
        '.swp',
        '.ico',
        '.png',
        '.jpg',
        '.jpeg',
        '.gif',
        '.svg'
    ],
    dirsToIgnore: [
        'node_modules/',
        '.git/',
        '.idea/',
        'snapshots/',
        'dist/',
        'build/',
        'coverage/'
    ],
};