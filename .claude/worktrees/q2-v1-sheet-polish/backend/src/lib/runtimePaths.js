const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const BACKEND_ROOT = path.resolve(__dirname, '../..')

function resolveRuntimeBaseDir(candidate = process.env.STUDYHUB_RUNTIME_DIR) {
  if (candidate) {
    return path.isAbsolute(candidate)
      ? path.normalize(candidate)
      : path.resolve(BACKEND_ROOT, candidate)
  }

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
    return path.join(localAppData, 'StudyHub', 'runtime')
  }

  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'StudyHub', 'runtime')
  }

  return path.join(os.homedir(), '.studyhub', 'runtime')
}

function resolveRuntimePath(...segments) {
  return path.join(resolveRuntimeBaseDir(), ...segments)
}

function ensureRuntimeDir(...segments) {
  const directory = resolveRuntimePath(...segments)
  fs.mkdirSync(directory, { recursive: true })
  return directory
}

module.exports = {
  ensureRuntimeDir,
  resolveRuntimeBaseDir,
  resolveRuntimePath,
}
