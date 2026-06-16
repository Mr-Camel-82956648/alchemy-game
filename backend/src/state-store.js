import fs from 'node:fs';
import path from 'node:path';

export function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return structuredClone(fallback);
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return payload && typeof payload === 'object' ? payload : structuredClone(fallback);
  } catch {
    return structuredClone(fallback);
  }
}

export function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tempPath, filePath);
}

export function nowMs() {
  return Date.now();
}

export function clone(value) {
  return value == null ? value : structuredClone(value);
}
