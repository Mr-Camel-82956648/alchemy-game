import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.md': 'text/markdown; charset=utf-8',
};

export async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return {};
  return JSON.parse(text);
}

export function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(body);
}

export function sendEmpty(res, statusCode = 204) {
  res.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end();
}

export function sendError(res, statusCode, detail) {
  sendJson(res, statusCode, { detail });
}

export function serveFile(res, filePath, options = {}) {
  const root = options.root ? path.resolve(options.root) : null;
  const resolved = path.resolve(filePath);
  if (root && resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    sendError(res, 403, 'Forbidden');
    return true;
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return false;
  }
  const ext = path.extname(resolved).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const stat = fs.statSync(resolved);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': stat.size,
    'Cache-Control': options.cacheControl || 'no-cache',
    'Access-Control-Allow-Origin': '*',
  });
  fs.createReadStream(resolved).pipe(res);
  return true;
}

export function toFileUrl(filePath) {
  return pathToFileURL(path.resolve(filePath)).href;
}

export function parseUrl(req) {
  return new URL(req.url || '/', 'http://127.0.0.1');
}

export function route(method, pathname, pattern) {
  if (method && method !== '*') {
    return null;
  }
  const names = [];
  const source = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/:([A-Za-z0-9_]+)/g, (_, name) => {
      names.push(name);
      return '([^/]+)';
    });
  const match = pathname.match(new RegExp(`^${source}$`));
  if (!match) return null;
  const params = {};
  names.forEach((name, index) => {
    params[name] = decodeURIComponent(match[index + 1]);
  });
  return params;
}
