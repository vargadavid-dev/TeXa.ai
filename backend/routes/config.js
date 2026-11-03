const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const {
  loadConfig,
  saveConfig,
  getProjectsDir,
  setProjectsDir,
  DEFAULT_PROJECTS_DIR
} = require('../utils/configHelper');

const router = express.Router();

// GET /api/config
router.get('/', async (req, res) => {
  try {
    const cfg = loadConfig();
    const currentDir = getProjectsDir();
    const isDefault = path.resolve(currentDir) === path.resolve(DEFAULT_PROJECTS_DIR);

    let filesCount = 0;
    let foldersCount = 0;
    try {
      const items = await fs.readdir(currentDir, { withFileTypes: true });
      foldersCount = items.filter(i => i.isDirectory() && !i.name.startsWith('.')).length;
      filesCount = items.filter(i => i.isFile() && i.name.endsWith('.tex')).length;
    } catch {
      // ignore
    }

    res.json({
      success: true,
      projectsRootDirectory: currentDir,
      defaultDirectory: DEFAULT_PROJECTS_DIR,
      isDefault,
      isConfigured: !!cfg.configuredAt,
      stats: { foldersCount, filesCount }
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
    res.json({
      success: true,
      projectsRootDirectory: resolved,
      message: 'Munkakönyvtár sikeresen frissítve!'
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
