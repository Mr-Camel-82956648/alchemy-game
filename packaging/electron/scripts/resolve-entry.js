function resolveEntryUrl(options = {}) {
  const host = options.host || '127.0.0.1';
  const port = Number(options.port || 8000);
  const entryPath = options.entryPath || '/';

  const envUrl = process.env.PACKAGING_ENTRY_URL;
  if (envUrl) {
    if (envUrl.startsWith('file://')) {
      throw new Error('PACKAGING_ENTRY_URL must use http(s), not file://');
    }
    return envUrl;
  }

  const normalizedPath = entryPath.startsWith('/') ? entryPath : `/${entryPath}`;
  return `http://${host}:${port}${normalizedPath}`;
}

module.exports = {
  resolveEntryUrl,
};
