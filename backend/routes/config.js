const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const { exec } = require('child_process');
const {
  loadConfig,
  saveConfig,
  getProjectsDir,
  setProjectsDir,
  DEFAULT_PROJECTS_DIR
} = require('../utils/configHelper');

const router = express.Router();

async function getDirStats(dir) {
  let filesCount = 0;
  let foldersCount = 0;
  try {
    const items = await fs.readdir(dir, { withFileTypes: true });
    foldersCount = items.filter(i => i.isDirectory() && !i.name.startsWith('.')).length;
    filesCount = items.filter(i => i.isFile() && i.name.endsWith('.tex')).length;
  } catch {
    // ignore
  }
  return { foldersCount, filesCount };
}

// GET /api/config
router.get('/', async (req, res) => {
  try {
    const cfg = loadConfig();
    const currentDir = getProjectsDir();
    const isDefault = path.resolve(currentDir) === path.resolve(DEFAULT_PROJECTS_DIR);
    const stats = await getDirStats(currentDir);
    const os = require('os');
    const homedir = os.homedir();

    res.json({
      success: true,
      projectsRootDirectory: currentDir,
      defaultDirectory: DEFAULT_PROJECTS_DIR,
      isDefault,
      isConfigured: !!cfg.configuredAt,
      stats,
      suggestions: [
        { name: 'Alapértelmezett (projektek)', path: DEFAULT_PROJECTS_DIR },
        { name: 'Dokumentumok / LaTeX', path: path.join(homedir, 'Documents', 'LaTeX') },
        { name: 'Asztal / LaTeX', path: path.join(homedir, 'Desktop', 'LaTeX') }
      ]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/config/workspace
router.post('/workspace', async (req, res) => {
  try {
    const { projectsRootDirectory } = req.body;
    if (!projectsRootDirectory || typeof projectsRootDirectory !== 'string') {
      return res.status(400).json({ error: 'Kérjük, adj meg egy érvényes mappa útvonalat!' });
    }

    const resolved = setProjectsDir(projectsRootDirectory);
    const stats = await getDirStats(resolved);
    const isDefault = path.resolve(resolved) === path.resolve(DEFAULT_PROJECTS_DIR);

    res.json({
      success: true,
      projectsRootDirectory: resolved,
      isDefault,
      stats,
      message: 'Munkakönyvtár sikeresen frissítve!'
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/config/browse-native - Natív rendszer mappa-választó ablak (macOS Finder)
router.post('/browse-native', (req, res) => {
  if (process.platform === 'darwin') {
    const promptText = 'Válassz ki egy LaTeX munkakönyvtárat:';
    const script = `osascript -e 'try' -e 'set chosenFolder to choose folder with prompt "${promptText}"' -e 'POSIX path of chosenFolder' -e 'on error number -128' -e 'return "CANCELED"' -e 'end try'`;

    exec(script, { timeout: 15000 }, async (err, stdout) => {
      if (err) {
        console.warn('[browse-native] macOS osascript nem tudott felugró ablakot nyitni:', err.message);
        return res.json({
          success: false,
          fallback: true,
          error: 'A macOS rendszer nem engedélyezte a felugró mappaválasztót (jogosultsági korlátozás). Kérjük, add meg a mappa útvonalát kézzel az alábbi mezőben!'
        });
      }
      const raw = (stdout || '').trim();
      if (!raw || raw === 'CANCELED') {
        return res.json({ success: true, canceled: true });
      }

      const pickedPath = raw.replace(/\/+$/, '');
      try {
        const resolved = setProjectsDir(pickedPath);
        const stats = await getDirStats(resolved);
        const isDefault = path.resolve(resolved) === path.resolve(DEFAULT_PROJECTS_DIR);
        res.json({
          success: true,
          canceled: false,
          projectsRootDirectory: resolved,
          isDefault,
          stats,
          message: 'Munkakönyvtár sikeresen kiválasztva!'
        });
      } catch (saveErr) {
        res.status(400).json({ error: saveErr.message });
      }
    });
  } else {
    res.json({
      success: false,
      fallback: true,
      error: 'A natív felugró ablak macOS-en érhető el. Kérjük, add meg manuálisan a mappa elérési útját!'
    });
  }
});

// POST /api/config/reset-default - Visszaállítás az alapértelmezett projektek mappára
router.post('/reset-default', async (req, res) => {
  try {
    const resolved = setProjectsDir(DEFAULT_PROJECTS_DIR);
    const stats = await getDirStats(resolved);
    res.json({
      success: true,
      projectsRootDirectory: resolved,
      isDefault: true,
      stats,
      message: 'Visszaállítva az alapértelmezett projektek mappára!'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
