const path = require('path');
const fs = require('fs-extra');
const os = require('os');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const DEFAULT_PROJECTS_DIR = path.resolve(__dirname, '..', '..', 'projektek');

fs.ensureDirSync(DATA_DIR);

function isForeignHostPath(targetPath) {
  if (!targetPath || typeof targetPath !== 'string') return false;
  if (process.platform !== 'darwin' && targetPath.startsWith('/Users/')) return true;
  if (process.platform !== 'win32' && /^[A-Za-z]:[/\\]/.test(targetPath)) return true;
  if (process.platform === 'linux' && !targetPath.startsWith('/')) return true;
  return false;
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readJsonSync(CONFIG_FILE);
      if (data && typeof data === 'object') {
        const rawDir = typeof data.projectsRootDirectory === 'string' ? data.projectsRootDirectory.trim() : '';
        const resolvedDir = rawDir
          ? (isForeignHostPath(rawDir) ? rawDir : path.resolve(rawDir))
          : DEFAULT_PROJECTS_DIR;
        return {
          projectsRootDirectory: resolvedDir,
          configuredAt: data.configuredAt || null
        };
      }
    }
  } catch (err) {
    console.warn('[Config] Hiba a config.json beolvasásakor:', err.message);
  }

  return {
    projectsRootDirectory: DEFAULT_PROJECTS_DIR,
    configuredAt: null
  };
}

function saveConfig(cfg) {
  fs.ensureDirSync(DATA_DIR);
  const current = loadConfig();
  const updated = {
    ...current,
    ...cfg,
    updatedAt: new Date().toISOString()
  };
  fs.writeJsonSync(CONFIG_FILE, updated, { spaces: 2 });
  return updated;
}

function getProjectsDir() {
  const cfg = loadConfig();
  let dir = cfg.projectsRootDirectory || DEFAULT_PROJECTS_DIR;

  if (dir !== DEFAULT_PROJECTS_DIR && !fs.existsSync(dir)) {
    if (isForeignHostPath(dir) || fs.existsSync(DEFAULT_PROJECTS_DIR)) {
      console.warn(`[Config] A mentett projektek mappa nem létezik (${dir}), visszaállás az alapértelmezettre: ${DEFAULT_PROJECTS_DIR}`);
      dir = DEFAULT_PROJECTS_DIR;
    }
  }

  fs.ensureDirSync(dir);
  return dir;
}

function setProjectsDir(targetPath) {
  if (!targetPath || typeof targetPath !== 'string') {
    throw new Error('Érvénytelen könyvtár útvonal');
  }
  let trimmed = targetPath.trim();
  if (trimmed.startsWith('~')) {
    trimmed = path.join(os.homedir(), trimmed.slice(1));
  }
  const resolved = path.resolve(trimmed);
  fs.ensureDirSync(resolved);

  // Írási jogosultság ellenőrzése tesztfájllal
  const testFile = path.join(resolved, `.write-test-${Date.now()}`);
  try {
    fs.writeFileSync(testFile, 'ok');
    fs.removeSync(testFile);
  } catch (err) {
    throw new Error(`A megadott könyvtár nem írható: ${err.message}`);
  }

  saveConfig({
    projectsRootDirectory: resolved,
    configuredAt: new Date().toISOString()
  });

  return resolved;
}

module.exports = {
  loadConfig,
  saveConfig,
  getProjectsDir,
  setProjectsDir,
  DEFAULT_PROJECTS_DIR
};
