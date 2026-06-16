// Electron packaging can spawn this file with the bundled Electron/Node runtime.
// It intentionally uses the same server implementation as server deployments.
process.env.HOST ||= '127.0.0.1';
process.env.PORT ||= process.env.BACKEND_PORT || '18001';
process.env.ALCHEMY_SERVE_STATIC ||= '1';

await import('./server.js');
