const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const { getProjectsDir } = require('../utils/configHelper');

const router = express.Router();
const DATA_DIR = path.join(__dirname, '..', 'data');
const METADATA_FILE = path.join(DATA_DIR, 'document_metadata.json');

fs.ensureDirSync(DATA_DIR);

async function loadMetadata() {
  if (await fs.pathExists(METADATA_FILE)) {
    try {
      const data = await fs.readJson(METADATA_FILE);
      return typeof data === 'object' && data !== null ? data : {};
    } catch {
      return {};
    }
  }
  return {};
}

async function saveMetadata(meta) {
  await fs.ensureDir(DATA_DIR);
  await fs.writeJson(METADATA_FILE, meta, { spaces: 2 });
}

/**
 * Biztonságos és robusztus elérési út feloldó a projektek munkakönyvtárában.
 * Megbízhatóan kezeli a relatív (pl. "Matematika/fajl.tex") és abszolút útvonalakat,
 * szigorúan megakadályozva a könyvtárelhagyásos (path traversal) támadásokat.
 */
function resolvePathInProjects(filePath, projectsDir = getProjectsDir()) {
  if (!filePath || typeof filePath !== 'string') return null;
  const root = path.resolve(projectsDir);
  const trimmed = filePath.trim();
  if (!trimmed) return null;

  const isWinAbs = /^[A-Za-z]:[/\\]/.test(trimmed);
  const isAnyAbs = path.isAbsolute(trimmed) || isWinAbs;
  let resolved = path.isAbsolute(trimmed)
    ? path.resolve(trimmed)
    : (isWinAbs ? null : path.resolve(root, trimmed));

  // Ha az útvonal kívül esik az aktuális projektek mappán (pl. másik OS/konténer vagy szülő munkakörnyezet):
  if (!resolved || (resolved !== root && !resolved.startsWith(root + path.sep))) {
    if (resolved) {
      const workspaceRoot = path.resolve(__dirname, '..', '..');
      const relFromWs = path.relative(workspaceRoot, resolved);
      if (relFromWs && !relFromWs.startsWith('..') && !path.isAbsolute(relFromWs)) {
        const candidate = path.resolve(root, relFromWs);
        if (fs.existsSync(candidate)) {
          resolved = candidate;
        }
      }
    }

    // Különösen macOS/Windows <-> Linux Docker közötti mentett abszolút útvonalakhoz:
    // kinyerjük az utolsó projektek gyökérmappa utáni relatív útvonalat (kis/nagybetű érzékenyen a /Documents/Projektek/ ütközések elkerülésére).
    if ((!resolved || (resolved !== root && !resolved.startsWith(root + path.sep))) && isAnyAbs) {
      const normalized = trimmed.replace(/\\/g, '/');
      const rootName = path.basename(root).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const markerRegex = new RegExp(`^.*/(?:${rootName}|projektek)/(.+)$`);
      const match = normalized.match(markerRegex);
      if (match && match[1]) {
        const candidate = path.resolve(root, match[1]);
        const candRel = path.relative(root, candidate);
        if (candRel && !candRel.startsWith('..') && !path.isAbsolute(candRel)) {
          resolved = candidate;
        }
      }
    }
  }

  if (!resolved) return null;

  const rel = path.relative(root, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return null;
  }

  return resolved;
}

function autoDetectTags(filename, subject) {
  const tags = [];
  const lower = filename.toLowerCase();

  if (lower.includes('mikro') || lower.includes('micro')) {
    tags.push('Mikrotananyag');
  }
  if (lower.includes('gr') || lower.includes('graf')) {
    tags.push('Gráfelmélet');
  }
  if (lower.includes('trigono')) {
    tags.push('Trigonometria');
  }
  if (lower.includes('alapfogalom') || lower.includes('alapfogalmak')) {
    tags.push('Alapfogalmak');
  }
  if (lower.includes('feladatsor') || lower.includes('gyakorlo')) {
    tags.push('Gyakorló');
  }
  if (lower.includes('osszefoglalo')) {
    tags.push('Összefoglaló');
  }

  if (subject && !tags.includes(subject)) {
    tags.push(subject);
  }

  return [...new Set(tags)];
}

async function scanDirectory(dirPath, subject, metadata, allTagsMap, rootProjectsDir) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = [];
  const folders = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(dirPath, entry.name);
    const relPath = path.relative(rootProjectsDir, fullPath);

    if (entry.isDirectory()) {
      const sub = await scanDirectory(fullPath, subject, metadata, allTagsMap, rootProjectsDir);
      folders.push({
        name: entry.name,
        path: fullPath,
        relativePath: relPath,
        subject,
        isFolder: true,
        folders: sub.folders,
        files: sub.files,
        totalCount: sub.totalCount
      });
    } else if (entry.isFile() && entry.name.endsWith('.tex')) {
      const key = relPath;
      const legacyKey = subject ? `${subject}/${entry.name}` : entry.name;
      const meta = metadata[key] || metadata[legacyKey] || {};
      let tags = Array.isArray(meta.tags) && meta.tags.length > 0
        ? meta.tags
        : autoDetectTags(entry.name, subject);

      tags.forEach(t => {
        allTagsMap[t] = (allTagsMap[t] || 0) + 1;
      });

      files.push({
        name: entry.name,
        path: fullPath,
        relativePath: relPath,
        subject,
        tags,
        description: meta.description || '',
        createdAt: meta.createdAt || null,
        updatedAt: meta.updatedAt || null
      });
    }
  }

  folders.sort((a, b) => a.name.localeCompare(b.name, 'hu'));
  files.sort((a, b) => a.name.localeCompare(b.name, 'hu'));

  const directCount = files.length;
  const totalCount = directCount + folders.reduce((sum, f) => sum + f.totalCount, 0);

  return { files, folders, totalCount };
}

function collectAllFolders(node, list = [], depth = 0) {
  list.push({
    name: node.name,
    path: node.path,
    relativePath: node.relativePath,
    subject: node.subject,
    depth
  });
  if (Array.isArray(node.folders)) {
    for (const sub of node.folders) {
      collectAllFolders(sub, list, depth + 1);
    }
  }
  return list;
}

// GET /api/files/projects - list all projects with tags and metadata
router.get('/projects', async (req, res) => {
  try {
    const projectsDir = getProjectsDir();
    await fs.ensureDir(projectsDir);

    const metadata = await loadMetadata();
    const entries = await fs.readdir(projectsDir);
    const tree = {};
    const allTagsMap = {};
    const availableFolders = [];
    const looseFiles = [];

    for (const entry of entries) {
      if (entry.startsWith('.')) continue;
      const entryPath = path.join(projectsDir, entry);
      const stat = await fs.stat(entryPath);

      if (stat.isDirectory()) {
        const scanned = await scanDirectory(entryPath, entry, metadata, allTagsMap, projectsDir);
        const folderNode = {
          name: entry,
          path: entryPath,
          relativePath: entry,
          subject: entry,
          isFolder: true,
          files: scanned.files,
          folders: scanned.folders,
          totalCount: scanned.totalCount
        };

        tree[entry] = folderNode;
        collectAllFolders(folderNode, availableFolders, 0);
      } else if (stat.isFile() && entry.endsWith('.tex')) {
        const meta = metadata[entry] || {};
        let tags = Array.isArray(meta.tags) && meta.tags.length > 0
          ? meta.tags
          : autoDetectTags(entry, '');

        tags.forEach(t => {
          allTagsMap[t] = (allTagsMap[t] || 0) + 1;
        });

        looseFiles.push({
          name: entry,
          path: entryPath,
          relativePath: entry,
          subject: '',
          tags,
          description: meta.description || '',
          createdAt: meta.createdAt || null,
          updatedAt: meta.updatedAt || null
        });
      }
    }

    if (looseFiles.length > 0) {
      tree['_root'] = {
        name: 'Gyökérfájlok',
        path: projectsDir,
        relativePath: '',
        subject: '',
        isFolder: true,
        isRootLoose: true,
        files: looseFiles,
        folders: [],
        totalCount: looseFiles.length
      };
    }

    const allTags = Object.entries(allTagsMap).map(([tag, count]) => ({ tag, count }));
    res.json({
      success: true,
      tree,
      allTags,
      availableFolders,
      workspacePath: projectsDir
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/files/tags - update tags for a specific document
router.post('/tags', async (req, res) => {
  try {
    const { filePath, subject, filename, tags } = req.body;
    let targetSubject = subject;
    let targetFilename = filename;
    let key;

    const projectsDir = getProjectsDir();

    if (filePath) {
      const resolved = resolvePathInProjects(filePath, projectsDir);
      if (!resolved) {
        return res.status(403).json({ error: 'Hozzáférés megtagadva' });
      }
      targetFilename = path.basename(resolved);
      const relFromProjects = path.relative(projectsDir, resolved);
      key = relFromProjects;
      targetSubject = relFromProjects.includes(path.sep) ? relFromProjects.split(path.sep)[0] : '';
    } else {
      if (!targetFilename) {
        return res.status(400).json({ error: 'Hiányzó dokumentum azonosító' });
      }
      key = targetSubject ? `${targetSubject}/${targetFilename}` : targetFilename;
    }

    const cleanedTags = Array.isArray(tags)
      ? [...new Set(tags.map(t => String(t).trim()).filter(Boolean))]
      : [];

    const metadata = await loadMetadata();
    metadata[key] = {
      ...(metadata[key] || {}),
      tags: cleanedTags,
      updatedAt: new Date().toISOString()
    };

    await saveMetadata(metadata);
    res.json({ success: true, tags: cleanedTags, key });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/files/tags - list all available tags
router.get('/tags', async (req, res) => {
  try {
    const metadata = await loadMetadata();
    const tagCount = {};

    Object.values(metadata).forEach(meta => {
      if (Array.isArray(meta.tags)) {
        meta.tags.forEach(t => {
          tagCount[t] = (tagCount[t] || 0) + 1;
        });
      }
    });

    const tags = Object.entries(tagCount)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    res.json({ success: true, tags });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/files/save - save a .tex file
router.post('/save', async (req, res) => {
  try {
    const { subject, filename, content, tags, targetDir, filePath: explicitFilePath } = req.body;
    if ((!subject && !targetDir && !explicitFilePath) || !filename || content === undefined) {
      return res.status(400).json({ error: 'Hiányzó mezők' });
    }

    const projectsDir = getProjectsDir();
    const safeFilename = path.basename(filename).replace(/[^a-zA-Z0-9áéíóöőúüűÁÉÍÓÖŐÚÜŰ _\-().]/g, '_');
    const finalName = safeFilename.endsWith('.tex') ? safeFilename : safeFilename + '.tex';

    let filePath;
    let finalSubject = subject;

    if (explicitFilePath) {
      filePath = resolvePathInProjects(explicitFilePath, projectsDir);
      if (!filePath) {
        return res.status(403).json({ error: 'Hozzáférés megtagadva' });
      }
    } else if (targetDir) {
      const resolvedTarget = resolvePathInProjects(targetDir, projectsDir);
      if (!resolvedTarget) {
        return res.status(403).json({ error: 'Hozzáférés megtagadva' });
      }
      filePath = path.join(resolvedTarget, finalName);
    } else if (subject) {
      const resolvedSubject = resolvePathInProjects(subject, projectsDir);
      if (!resolvedSubject) {
        return res.status(403).json({ error: 'Hozzáférés megtagadva' });
      }
      filePath = path.join(resolvedSubject, finalName);
    } else {
      filePath = path.join(projectsDir, finalName);
    }

    const verifiedPath = resolvePathInProjects(filePath, projectsDir);
    if (!verifiedPath) {
      return res.status(403).json({ error: 'Hozzáférés megtagadva' });
    }
    filePath = verifiedPath;

    const relFromProjects = path.relative(projectsDir, filePath);
    finalSubject = relFromProjects.includes(path.sep) ? relFromProjects.split(path.sep)[0] : (subject || '');

    // Ha a fájl már létezett, készítsünk biztonsági mentést az előző tartalomról
    const existed = await fs.pathExists(filePath);
    let previousContent = null;
    if (existed) {
      try {
        previousContent = await fs.readFile(filePath, 'utf8');
        if (previousContent !== content) {
          const historyDir = path.join(DATA_DIR, 'history', relFromProjects);
          await fs.ensureDir(historyDir);
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const backupPath = path.join(historyDir, `${timestamp}.tex`);
          await fs.writeFile(backupPath, previousContent, 'utf8');

          const files = await fs.readdir(historyDir);
          if (files.length > 20) {
            files.sort();
            for (let i = 0; i < files.length - 20; i++) {
              await fs.remove(path.join(historyDir, files[i]));
            }
          }
        }
      } catch (backupErr) {
        console.warn('Backup hiba:', backupErr.message);
      }
    }

    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, content, 'utf8');

    // Címkék mentése
    const metadata = await loadMetadata();
    const key = relFromProjects;
    const legacyKey = finalSubject ? `${finalSubject}/${finalName}` : finalName;
    const existingMeta = metadata[key] || metadata[legacyKey] || {};

    let finalTags = existingMeta.tags;
    if (Array.isArray(tags) && tags.length > 0) {
      finalTags = [...new Set(tags.map(t => String(t).trim()).filter(Boolean))];
    } else if (!finalTags) {
      finalTags = autoDetectTags(finalName, finalSubject);
    }

    metadata[key] = {
      ...existingMeta,
      tags: finalTags,
      updatedAt: new Date().toISOString()
    };
    if (!existingMeta.createdAt) {
      metadata[key].createdAt = new Date().toISOString();
    }
    await saveMetadata(metadata);

    res.json({
      success: true,
      path: filePath,
      newPath: filePath,
      filename: finalName,
      name: finalName,
      subject: finalSubject,
      relativePath: relFromProjects,
      tags: finalTags,
      canUndo: existed && previousContent !== null && previousContent !== content
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/files/undo-save - rollback to previous saved state
router.post('/undo-save', async (req, res) => {
  try {
    const { filePath } = req.body;
    if (!filePath) return res.status(400).json({ error: 'Hiányzó filePath' });

    const projectsDir = getProjectsDir();
    const resolved = resolvePathInProjects(filePath, projectsDir);
    if (!resolved) {
      return res.status(403).json({ error: 'Hozzáférés megtagadva' });
    }

    const relFromProjects = path.relative(projectsDir, resolved);
    const historyDir = path.join(DATA_DIR, 'history', relFromProjects);

    if (!(await fs.pathExists(historyDir))) {
      return res.status(404).json({ error: 'Nincs korábbi mentés ehhez a fájlhoz' });
    }

    const backups = (await fs.readdir(historyDir)).filter(f => f.endsWith('.tex')).sort();
    if (backups.length === 0) {
      return res.status(404).json({ error: 'Nincs elérhető korábbi verzió' });
    }

    const latestBackupName = backups[backups.length - 1];
    const latestBackupPath = path.join(historyDir, latestBackupName);
    const restoredContent = await fs.readFile(latestBackupPath, 'utf8');

    await fs.writeFile(resolved, restoredContent, 'utf8');
    await fs.remove(latestBackupPath);

    const remaining = (await fs.readdir(historyDir)).filter(f => f.endsWith('.tex'));
    res.json({
      success: true,
      content: restoredContent,
      remainingUndos: remaining.length,
      restoredFrom: latestBackupName
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/files/load - load a .tex file
router.post('/load', async (req, res) => {
  try {
    const { filePath } = req.body;
    if (!filePath) return res.status(400).json({ error: 'Hiányzó filePath paraméter' });
    const projectsDir = getProjectsDir();
    const resolved = resolvePathInProjects(filePath, projectsDir);
    if (!resolved) {
      return res.status(403).json({ error: 'Hozzáférés megtagadva' });
    }
    if (!(await fs.pathExists(resolved))) {
      return res.status(404).json({ error: 'A fájl nem található a lemezen' });
    }
    const stat = await fs.stat(resolved);
    if (stat.isDirectory()) {
      return res.status(400).json({ error: 'A megadott útvonal egy mappa, nem fájl' });
    }
    const content = await fs.readFile(resolved, 'utf8');

    const targetFilename = path.basename(resolved);
    const relFromProjects = path.relative(projectsDir, resolved);
    const targetSubject = relFromProjects.includes(path.sep) ? relFromProjects.split(path.sep)[0] : '';
    const metadata = await loadMetadata();
    const key = relFromProjects;
    const legacyKey = targetSubject ? `${targetSubject}/${targetFilename}` : targetFilename;
    const meta = metadata[key] || metadata[legacyKey] || {};
    const tags = Array.isArray(meta.tags) && meta.tags.length > 0
      ? meta.tags
      : autoDetectTags(targetFilename, targetSubject);

    res.json({
      success: true,
      content,
      tags,
      filename: targetFilename,
      name: targetFilename,
      subject: targetSubject,
      path: resolved,
      newPath: resolved,
      relativePath: relFromProjects
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/files/delete - delete a .tex file
router.delete('/delete', async (req, res) => {
  try {
    const { filePath } = req.body;
    if (!filePath) return res.status(400).json({ error: 'Hiányzó filePath paraméter' });
    const projectsDir = getProjectsDir();
    const resolved = resolvePathInProjects(filePath, projectsDir);
    if (!resolved) {
      return res.status(403).json({ error: 'Hozzáférés megtagadva' });
    }
    await fs.remove(resolved);

    // Törlés a metaadatokból
    const relFromProjects = path.relative(projectsDir, resolved);
    const targetFilename = path.basename(resolved);
    const targetSubject = relFromProjects.includes(path.sep) ? relFromProjects.split(path.sep)[0] : '';
    const metadata = await loadMetadata();
    const key = relFromProjects;
    const legacyKey = targetSubject ? `${targetSubject}/${targetFilename}` : targetFilename;
    if (metadata[key] || metadata[legacyKey]) {
      delete metadata[key];
      delete metadata[legacyKey];
      await saveMetadata(metadata);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/files/rename
router.post('/rename', async (req, res) => {
  try {
    const { filePath, newName } = req.body;
    if (!filePath || !newName) {
      return res.status(400).json({ error: 'Hiányzó filePath vagy newName paraméter' });
    }

    const projectsDir = getProjectsDir();
    const resolved = resolvePathInProjects(filePath, projectsDir);
    if (!resolved) {
      return res.status(403).json({ error: 'Hozzáférés megtagadva' });
    }

    if (!(await fs.pathExists(resolved))) {
      return res.status(404).json({ error: 'A fájl nem található a lemezen' });
    }

    const stat = await fs.stat(resolved);
    if (stat.isDirectory()) {
      return res.status(400).json({ error: 'Mappák átnevezéséhez használd a mappa átnevezése funkciót' });
    }

    const dir = path.dirname(resolved);
    const oldFilename = path.basename(resolved);
    const relOld = path.relative(projectsDir, resolved);
    const targetSubject = relOld.includes(path.sep) ? relOld.split(path.sep)[0] : '';

    const safeName = path.basename(newName).replace(/[^a-zA-Z0-9áéíóöőúüűÁÉÍÓÖŐÚÜŰ _\-().]/g, '_');
    const finalNewName = safeName.endsWith('.tex') ? safeName : safeName + '.tex';
    const newPath = path.join(dir, finalNewName);

    if (resolved === newPath) {
      return res.json({
        success: true,
        path: newPath,
        newPath: newPath,
        name: finalNewName,
        filename: finalNewName,
        relativePath: relOld
      });
    }

    if (await fs.pathExists(newPath)) {
      return res.status(400).json({ error: `Már létezik "${finalNewName}" nevű fájl ebben a mappában!` });
    }

    await fs.move(resolved, newPath);

    // Metaadatok migrálása
    const relNew = path.relative(projectsDir, newPath);
    const metadata = await loadMetadata();
    const oldKey = relOld;
    const legacyOldKey = targetSubject ? `${targetSubject}/${oldFilename}` : oldFilename;
    const existingMeta = metadata[oldKey] || metadata[legacyOldKey];

    if (existingMeta) {
      metadata[relNew] = {
        ...existingMeta,
        updatedAt: new Date().toISOString()
      };
      delete metadata[oldKey];
      delete metadata[legacyOldKey];
      await saveMetadata(metadata);
    }

    // Történet könyvtár átnevezése, ha létezik
    const oldHistoryDir = path.join(DATA_DIR, 'history', relOld);
    const newHistoryDir = path.join(DATA_DIR, 'history', relNew);
    if (await fs.pathExists(oldHistoryDir)) {
      await fs.ensureDir(path.dirname(newHistoryDir));
      await fs.move(oldHistoryDir, newHistoryDir);
    }

    res.json({
      success: true,
      path: newPath,
      newPath: newPath,
      name: finalNewName,
      filename: finalNewName,
      relativePath: relNew
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/files/move - move a .tex file to another folder
router.post('/move', async (req, res) => {
  try {
    const { filePath, targetFolderPath, targetDir } = req.body;
    const destFolder = targetFolderPath || targetDir;
    if (!filePath || !destFolder) {
      return res.status(400).json({ error: 'Hiányzó filePath vagy targetFolderPath paraméter' });
    }

    const projectsDir = getProjectsDir();
    const sourcePath = resolvePathInProjects(filePath, projectsDir);
    const targetPath = resolvePathInProjects(destFolder, projectsDir);

    if (!sourcePath || !targetPath) {
      return res.status(403).json({ error: 'Hozzáférés megtagadva: a cél vagy forrás kívül esik a projektek könyvtáron' });
    }

    if (!(await fs.pathExists(sourcePath))) {
      return res.status(404).json({ error: 'A forrásfájl nem található a lemezen' });
    }

    const stat = await fs.stat(targetPath);
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: 'A cél elérési út nem egy mappa' });
    }

    const filename = path.basename(sourcePath);
    const destPath = path.join(targetPath, filename);

    if (sourcePath === destPath) {
      return res.json({
        success: true,
        path: destPath,
        newPath: destPath,
        name: filename,
        filename: filename
      });
    }

    if (await fs.pathExists(destPath)) {
      return res.status(400).json({ error: `A célmappában már létezik egy "${filename}" nevű fájl!` });
    }

    await fs.move(sourcePath, destPath);

    // Metaadatok kulcsának átnevezése
    const oldRel = path.relative(projectsDir, sourcePath);
    const newRel = path.relative(projectsDir, destPath);
    const oldSubject = oldRel.includes(path.sep) ? oldRel.split(path.sep)[0] : '';
    const newSubject = newRel.includes(path.sep) ? newRel.split(path.sep)[0] : '';

    const metadata = await loadMetadata();
    const oldKey = oldRel;
    const legacyOldKey = oldSubject ? `${oldSubject}/${filename}` : filename;
    const existingMeta = metadata[oldKey] || metadata[legacyOldKey];

    if (existingMeta) {
      metadata[newRel] = {
        ...existingMeta,
        updatedAt: new Date().toISOString()
      };
      delete metadata[oldKey];
      delete metadata[legacyOldKey];
      await saveMetadata(metadata);
    }

    // Történet könyvtár átmozgatása
    const oldHistoryDir = path.join(DATA_DIR, 'history', oldRel);
    const newHistoryDir = path.join(DATA_DIR, 'history', newRel);
    if (await fs.pathExists(oldHistoryDir)) {
      await fs.ensureDir(path.dirname(newHistoryDir));
      await fs.move(oldHistoryDir, newHistoryDir);
    }

    res.json({
      success: true,
      path: destPath,
      newPath: destPath,
      name: filename,
      filename: filename,
      relativePath: newRel,
      newSubject,
      subject: newSubject
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/files/folder/create - create a new subdirectory or root folder
router.post('/folder/create', async (req, res) => {
  try {
    const { parentPath, folderName, subject } = req.body;
    if (!folderName || !folderName.trim()) {
      return res.status(400).json({ error: 'Hiányzó mappanév' });
    }

    const cleanName = folderName.trim().replace(/[^a-zA-Z0-9áéíóöőúüűÁÉÍÓÖŐÚÜŰ _\-().]/g, '_');
    if (!cleanName) {
      return res.status(400).json({ error: 'Érvénytelen mappanév' });
    }

    const projectsDir = getProjectsDir();
    let targetParent;
    if (parentPath) {
      targetParent = resolvePathInProjects(parentPath, projectsDir);
    } else if (subject) {
      targetParent = resolvePathInProjects(subject, projectsDir);
    } else {
      targetParent = projectsDir;
    }

    if (!targetParent) {
      return res.status(403).json({ error: 'Hozzáférés megtagadva' });
    }

    await fs.ensureDir(targetParent);
    const newFolderPath = path.join(targetParent, cleanName);

    if (await fs.pathExists(newFolderPath)) {
      return res.status(400).json({ error: `Már létezik "${cleanName}" nevű mappa ezen a helyen!` });
    }

    await fs.ensureDir(newFolderPath);
    const relPath = path.relative(projectsDir, newFolderPath);
    const rootSubject = relPath.includes(path.sep) ? relPath.split(path.sep)[0] : cleanName;

    res.json({
      success: true,
      path: newFolderPath,
      newPath: newFolderPath,
      name: cleanName,
      relativePath: relPath,
      subject: rootSubject
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/files/folder/rename - rename a subdirectory
router.post('/folder/rename', async (req, res) => {
  try {
    const { folderPath, newName } = req.body;
    if (!folderPath || !newName || !newName.trim()) {
      return res.status(400).json({ error: 'Hiányzó paraméterek' });
    }

    const projectsDir = getProjectsDir();
    const resolvedProjects = path.resolve(projectsDir);
    const resolved = resolvePathInProjects(folderPath, projectsDir);

    if (!resolved) {
      return res.status(403).json({ error: 'Hozzáférés megtagadva' });
    }

    if (resolved === resolvedProjects) {
      return res.status(400).json({ error: 'A munkakönyvtár főmappája nem nevezhető át!' });
    }

    const cleanName = newName.trim().replace(/[^a-zA-Z0-9áéíóöőúüűÁÉÍÓÖŐÚÜŰ _\-().]/g, '_');
    const parentDir = path.dirname(resolved);
    const newFolderPath = path.join(parentDir, cleanName);

    if (resolved === newFolderPath) {
      return res.json({
        success: true,
        path: newFolderPath,
        newPath: newFolderPath,
        name: cleanName
      });
    }

    if (await fs.pathExists(newFolderPath)) {
      return res.status(400).json({ error: `Már létezik "${cleanName}" nevű mappa ezen a szinten!` });
    }

    const relPath = path.relative(projectsDir, resolved);
    await fs.move(resolved, newFolderPath);

    // Metaadat kulcsok frissítése a mappán belüli fájlokhoz
    const oldRelPrefix = relPath + path.sep;
    const newRel = path.relative(projectsDir, newFolderPath);
    const newRelPrefix = newRel + path.sep;

    const metadata = await loadMetadata();
    let metaChanged = false;
    for (const key of Object.keys(metadata)) {
      if (key.startsWith(oldRelPrefix)) {
        const rest = key.slice(oldRelPrefix.length);
        metadata[newRelPrefix + rest] = metadata[key];
        delete metadata[key];
        metaChanged = true;
      }
    }
    if (metaChanged) {
      await saveMetadata(metadata);
    }

    res.json({
      success: true,
      path: newFolderPath,
      newPath: newFolderPath,
      name: cleanName,
      relativePath: newRel
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/files/folder - delete a subdirectory
router.delete('/folder', async (req, res) => {
  try {
    const { folderPath } = req.body;
    if (!folderPath) {
      return res.status(400).json({ error: 'Hiányzó folderPath paraméter' });
    }

    const projectsDir = getProjectsDir();
    const resolvedProjects = path.resolve(projectsDir);
    const resolved = resolvePathInProjects(folderPath, projectsDir);

    if (!resolved) {
      return res.status(403).json({ error: 'Hozzáférés megtagadva' });
    }

    if (resolved === resolvedProjects) {
      return res.status(400).json({ error: 'A munkakönyvtár főmappája nem törölhető!' });
    }

    const relPath = path.relative(projectsDir, resolved);
    await fs.remove(resolved);

    // Metaadat kulcsok kitakarítása
    const oldRelPrefix = relPath + path.sep;
    const metadata = await loadMetadata();
    let metaChanged = false;
    for (const key of Object.keys(metadata)) {
      if (key.startsWith(oldRelPrefix) || key === relPath) {
        delete metadata[key];
        metaChanged = true;
      }
    }
    if (metaChanged) {
      await saveMetadata(metadata);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
