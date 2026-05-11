const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const packagingRoot = path.resolve(__dirname, '..', '..');
const stagingRoot = path.join(packagingRoot, 'runtime', 'app');

const copyBackendEnv = !['0', 'false', 'no'].includes(
  String(process.env.PACKAGING_COPY_BACKEND_ENV || '1').toLowerCase()
);

const rootFiles = ['index.html'];
const rootDirs = ['alchemy_intro_book', 'frontend', 'backend'];

const ignoredDirNames = new Set([
  '.git',
  '.github',
  '.idea',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  '.cache',
  '__pycache__',
  'node_modules',
  'venv',
  '.venv',
  'env',
  'build',
  'dist',
]);

const ignoredFileNames = new Set([
  '.DS_Store',
  'Thumbs.db',
]);

function shouldSkip(sourcePath) {
  const relativePath = path.relative(repoRoot, sourcePath).split(path.sep).join('/');
  const name = path.basename(sourcePath);
  const stats = fs.statSync(sourcePath);

  if (relativePath === 'backend/data') return true;
  if (stats.isDirectory() && ignoredDirNames.has(name)) return true;
  if (stats.isFile() && ignoredFileNames.has(name)) return true;

  if (stats.isFile()) {
    if (name === '.env') return !copyBackendEnv;
    if (name.endsWith('.pyc') || name.endsWith('.pyo') || name.endsWith('.pyd')) {
      return true;
    }
    if (name.endsWith('.log') || name.endsWith('.tmp') || name.endsWith('.temp')) {
      return true;
    }
    if (name.endsWith('.spec')) return true;
  }

  return false;
}

function copyRecursive(sourcePath, targetPath) {
  if (shouldSkip(sourcePath)) return;

  const stats = fs.statSync(sourcePath);
  if (stats.isDirectory()) {
    fs.mkdirSync(targetPath, { recursive: true });
    for (const entry of fs.readdirSync(sourcePath)) {
      copyRecursive(path.join(sourcePath, entry), path.join(targetPath, entry));
    }
    return;
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function main() {
  fs.rmSync(stagingRoot, { recursive: true, force: true });
  fs.mkdirSync(stagingRoot, { recursive: true });

  for (const file of rootFiles) {
    copyRecursive(path.join(repoRoot, file), path.join(stagingRoot, file));
  }

  for (const dir of rootDirs) {
    copyRecursive(path.join(repoRoot, dir), path.join(stagingRoot, dir));
  }

  fs.mkdirSync(path.join(stagingRoot, 'backend', 'data'), { recursive: true });

  process.stdout.write(`[prepare-runtime] staged app to ${stagingRoot}\n`);
  process.stdout.write(
    `[prepare-runtime] backend/.env ${copyBackendEnv ? 'included' : 'skipped'}\n`
  );
  if (copyBackendEnv) {
    process.stdout.write(
      '[prepare-runtime] warning: backend/.env was copied for local validation; do not redistribute secret-bearing builds externally.\n'
    );
  }
}

main();
