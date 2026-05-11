const { spawn, spawnSync } = require('child_process');
const http = require('http');

function resolvePythonCommand() {
  const candidates = [];

  if (process.env.PACKAGING_PYTHON) {
    candidates.push({ command: process.env.PACKAGING_PYTHON, prefixArgs: [] });
  }
  candidates.push({ command: 'python', prefixArgs: [] });
  candidates.push({ command: 'py', prefixArgs: ['-3'] });

  for (const candidate of candidates) {
    const probe = spawnSync(candidate.command, [...candidate.prefixArgs, '--version'], {
      windowsHide: true,
      stdio: 'ignore',
    });
    if (probe.status === 0) {
      return candidate;
    }
  }

  throw new Error(
    'Python launcher not found. Set PACKAGING_PYTHON or ensure python/py is in PATH.'
  );
}

function pipeTaggedOutput(stream, tag) {
  if (!stream) return;
  stream.on('data', (chunk) => {
    const text = String(chunk);
    const lines = text.split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      process.stdout.write(`[${tag}] ${line}\n`);
    }
  });
}

function spawnService({ command, args, cwd, tag, envOverrides }) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...(envOverrides || {}) },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });

  pipeTaggedOutput(child.stdout, tag);
  pipeTaggedOutput(child.stderr, `${tag}:err`);

  return child;
}

function requestHttp(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 2000 }, (res) => {
      res.resume();
      resolve({
        ok: true,
        statusCode: Number(res.statusCode || 0),
      });
    });

    req.on('error', () => resolve({ ok: false, statusCode: 0 }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, statusCode: 0 });
    });
  });
}

async function waitForHttpReady({
  url,
  timeoutMs = 30000,
  intervalMs = 400,
  expectedStatus = 200,
  child,
}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    if (child && child.exitCode !== null) {
      throw new Error(`Process exited before ready: ${url}`);
    }
    const result = await requestHttp(url);
    if (result.ok && result.statusCode === expectedStatus) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function isHttpReady(url, expectedStatus = 200) {
  const result = await requestHttp(url);
  return result.ok && result.statusCode === expectedStatus;
}

function terminateProcessTree(pid) {
  return new Promise((resolve) => {
    if (!pid) {
      resolve();
      return;
    }

    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
      killer.on('error', () => resolve());
      killer.on('exit', () => resolve());
      return;
    }

    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        resolve();
        return;
      }
    }
    setTimeout(() => resolve(), 1200);
  });
}

async function launchBackend(options) {
  const host = options.host || '127.0.0.1';
  const port = Number(options.port || 18001);
  const timeoutMs = Number(options.timeoutMs || 30000);
  const backendDir = options.backendDir;
  const healthUrl = `http://${host}:${port}/docs`;

  // Reuse an already-running backend on the target port instead of failing with EADDRINUSE.
  if (await isHttpReady(healthUrl, 200)) {
    process.stdout.write(`[backend] reuse existing backend at ${healthUrl}\n`);
    return {
      name: 'backend',
      pid: null,
      child: null,
      external: true,
    };
  }

  const python = resolvePythonCommand();
  const args = [
    ...python.prefixArgs,
    '-m',
    'uvicorn',
    'app.main:app',
    '--host',
    host,
    '--port',
    String(port),
  ];
  const child = spawnService({
    command: python.command,
    args,
    cwd: backendDir,
    tag: 'backend',
  });

  try {
    await waitForHttpReady({ url: healthUrl, timeoutMs, expectedStatus: 200, child });
  } catch (err) {
    await terminateProcessTree(child.pid);
    throw err;
  }

  return {
    name: 'backend',
    pid: child.pid,
    child,
    external: false,
  };
}

async function launchStaticServer(options) {
  const host = options.host || '127.0.0.1';
  const port = Number(options.port || 8000);
  const timeoutMs = Number(options.timeoutMs || 30000);
  const serveDir = options.serveDir;

  const python = resolvePythonCommand();
  const args = [
    ...python.prefixArgs,
    '-m',
    'http.server',
    String(port),
    '--bind',
    host,
  ];
  const child = spawnService({
    command: python.command,
    args,
    cwd: serveDir,
    tag: 'static',
  });

  const healthUrl = `http://${host}:${port}/`;
  try {
    await waitForHttpReady({ url: healthUrl, timeoutMs, expectedStatus: 200, child });
  } catch (err) {
    await terminateProcessTree(child.pid);
    throw err;
  }

  return {
    name: 'static',
    pid: child.pid,
    child,
    external: false,
  };
}

async function stopService(service) {
  if (!service || !service.pid || service.external) return;
  await terminateProcessTree(service.pid);
}

module.exports = {
  launchBackend,
  launchStaticServer,
  stopService,
};
