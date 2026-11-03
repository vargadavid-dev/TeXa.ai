const path = require('path');
const fs = require('fs-extra');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const DEFAULT_PROJECTS_DIR = path.resolve(__dirname, '..', '..', 'projektek');

fs.ensureDirSync(DATA_DIR);

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readJsonSync(CONFIG_FILE);
      if (data && typeof data === 'object') {
        return {
          projectsRootDirectory: data.projectsRootDirectory ? path.resolve(data.projectsRootDirectory) : DEFAULT_PROJECTS_DIR,
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
  const dir = cfg.projectsRootDirectory || DEFAULT_PROJECTS_DIR;
  fs.ensureDirSync(dir);
  return dir;
}

function setProjectsDir(targetPath) {
  if (!targetPath || typeof targetPath !== 'string') {
    throw new Error('Érvénytelen könyvtár útvonal');
  }
  const resolved = path.resolve(targetPath.trim());
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
