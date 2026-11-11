const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { supplementFullLatex } = require('../utils/latexPreambleHelper');

const router = express.Router();
const TEMP_DIR = path.join(__dirname, '..', 'temp');
const ACTIVE_DIR = path.join(TEMP_DIR, 'active');

const PDFLATEX = fs.existsSync('/Library/TeX/texbin/pdflatex')
  ? '/Library/TeX/texbin/pdflatex'
  : 'pdflatex';
const SYNCTEX = fs.existsSync('/Library/TeX/texbin/synctex')
  ? '/Library/TeX/texbin/synctex'
  : 'synctex';

fs.ensureDirSync(TEMP_DIR);
fs.ensureDirSync(ACTIVE_DIR);

function parseSyncTeXView(stdout) {
  const pageMatch = stdout.match(/Page:(\d+)/i);
  const xMatch = stdout.match(/x:([\d.-]+)/);
  const yMatch = stdout.match(/y:([\d.-]+)/);
  const hMatch = stdout.match(/h:([\d.-]+)/);
  const vMatch = stdout.match(/v:([\d.-]+)/);
  const wMatch = stdout.match(/W:([\d.-]+)/);
  const hBoxMatch = stdout.match(/H:([\d.-]+)/);

  if (!pageMatch) return null;
  return {
    page: parseInt(pageMatch[1], 10),
    x: xMatch ? parseFloat(xMatch[1]) : 0,
    y: yMatch ? parseFloat(yMatch[1]) : 0,
    h: hMatch ? parseFloat(hMatch[1]) : 0,
    v: vMatch ? parseFloat(vMatch[1]) : 0,
    width: wMatch ? parseFloat(wMatch[1]) : 0,
    height: hBoxMatch ? parseFloat(hBoxMatch[1]) : 0
  };
}

function parseSyncTeXEdit(stdout) {
  if (!stdout) return null;
  const lineMatches = [...stdout.matchAll(/Line:(\d+)/gi)].map((m) => parseInt(m[1], 10));
  const colMatch = stdout.match(/Column:(-?\d+)/i);

  if (lineMatches.length === 0) return null;
  return {
    line: lineMatches[lineMatches.length - 1],
    lines: lineMatches,
    column: colMatch ? Math.max(1, parseInt(colMatch[1], 10)) : 1
  };
}

// Intelligens TeX hibanapló kinyerő: megőrzi a hibaüzenetet, a kontextust és a pontos kódsort (l.<sorszám>)
function extractTexErrors(fullLog) {
  if (!fullLog) return '';
  const lines = fullLog.split('\n');
  const errorBlocks = [];
  let capturing = false;
  let currentBlock = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('!')) {
      if (currentBlock.length > 0) errorBlocks.push(currentBlock.join('\n'));
      capturing = true;
      currentBlock = [line];
    } else if (capturing) {
      currentBlock.push(line);
      // A TeX naplóban a hibás sor l.<sorszám> formában jelenik meg
      if (line.match(/^l\.\d+/)) {
        if (i + 1 < lines.length && lines[i + 1].trim()) {
          currentBlock.push(lines[i + 1]);
        }
        errorBlocks.push(currentBlock.join('\n'));
        currentBlock = [];
        capturing = false;
      }
    }
  }
  if (currentBlock.length > 0) errorBlocks.push(currentBlock.join('\n'));
  return errorBlocks.join('\n---\n') || fullLog.slice(-3000);
}

// PDF Fordítás végrehajtása SyncTeX generálással
router.post('/', async (req, res) => {
  let { content, filePath, fileName, subject } = req.body;
  if (!content) return res.status(400).json({ error: 'Hiányzó LaTeX tartalom' });

  // Automatikus preambulum- és csomagkiegészítés a hibátlan megjelenítéshez
  let finalContent = content;
  try {
    finalContent = supplementFullLatex(content);
  } catch (suppErr) {
    console.warn('[Compile] Supplement hiba (figyelmen kívül hagyva):', suppErr.message);
  }

  // Ha a dokumentum törzse teljesen üres (pl. tiszta üres dokumentum), a pdflatex nem hozna létre oldalt ("No pages of output").
  // Beiktatunk egy \null parancsot, hogy tiszta üres PDF lap jöjjön létre hiba nélkül.
  if (/\\begin\{document\}\s*\\end\{document\}/.test(finalContent)) {
    finalContent = finalContent.replace(
      /\\begin\{document\}\s*\\end\{document\}/,
      '\\begin{document}\n\\null\n\\end{document}'
    );
  }

  const jobId = uuidv4();
  const jobDir = path.join(TEMP_DIR, jobId);

  try {
    await fs.ensureDir(jobDir);
    const texFile = path.join(jobDir, 'document.tex');
    const pdfFile = path.join(jobDir, 'document.pdf');
    await fs.writeFile(texFile, finalContent, 'utf8');

    // -synctex=1 engedélyezése és futtatás a jobDir könyvtáron belül (-no-shell-escape a biztonságért)
    const command = `"${PDFLATEX}" -no-shell-escape -synctex=1 -interaction=nonstopmode document.tex`;

    const runLatex = () =>
      new Promise((resolve) => {
        exec(command, { cwd: jobDir, timeout: 20000, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
          resolve({ error, stdout, stderr });
        });
      });

    // Első fordítási kör
    const firstResult = await runLatex();

    // Időtúllépés ellenőrzése
    if (firstResult.error && (firstResult.error.killed || firstResult.error.signal === 'SIGTERM')) {
      const logFile = path.join(jobDir, 'document.log');
      let log = '';
      if (await fs.pathExists(logFile)) {
        const full = await fs.readFile(logFile, 'utf8');
        log = extractTexErrors(full);
      }
      await fs.remove(jobDir).catch(() => {});
      return res.status(422).json({
        error: 'Időtúllépés',
        log: log || 'A LaTeX fordító túllépte a maximális időkorlátot (20 mp). Kérjük, ellenőrizd a lezáratlan környezeteket vagy ciklusokat a kódban!'
      });
    }

    let pdfExists = await fs.pathExists(pdfFile);
    let pdfSize = 0;
    if (pdfExists) {
      try {
        const stat = await fs.stat(pdfFile);
        pdfSize = stat.size;
      } catch {}
    }
    const isPdfValid = pdfExists && pdfSize > 100;

    let result = firstResult;
    // Csak akkor futtatjuk a második kört (kereszthivatkozásokhoz), ha az első sikeres volt hiba nélkül és van érvényes PDF
    if (!firstResult.error && isPdfValid) {
      result = await runLatex();
    }

    if (!isPdfValid) {
      const logFile = path.join(jobDir, 'document.log');
      let log = '';
      if (await fs.pathExists(logFile)) {
        const full = await fs.readFile(logFile, 'utf8');
        log = extractTexErrors(full);
      }
      await fs.remove(jobDir).catch(() => {});
      return res.status(422).json({
        error: 'Fordítási hiba',
        log: log || result.stdout || result.stderr || 'Nem jött létre érvényes PDF fájl a fordítás során.'
      });
    }

    const pdfBuffer = await fs.readFile(pdfFile);

    // Kinyerjük a figyelmeztetéseket
    const logFile = path.join(jobDir, 'document.log');
    let warnings = '';
    if (await fs.pathExists(logFile)) {
      const log = await fs.readFile(logFile, 'utf8');
      warnings = log
        .split('\n')
        .filter((l) => l.includes('Warning'))
        .slice(0, 5)
        .join('\n');
    }

    // Aktív könyvtár frissítése a SyncTeX és az előnézet kiszolgálásához
    try {
      await fs.ensureDir(ACTIVE_DIR);
      await fs.copy(pdfFile, path.join(ACTIVE_DIR, 'document.pdf'));
      await fs.copy(texFile, path.join(ACTIVE_DIR, 'document.tex'));

      const synctexGz = path.join(jobDir, 'document.synctex.gz');
      const synctexPlain = path.join(jobDir, 'document.synctex');
      if (await fs.pathExists(synctexGz)) {
        await fs.copy(synctexGz, path.join(ACTIVE_DIR, 'document.synctex.gz'));
      } else if (await fs.pathExists(synctexPlain)) {
        await fs.copy(synctexPlain, path.join(ACTIVE_DIR, 'document.synctex'));
      }

      // Mentjük a lefordított fájl metaadatait a gyors helyreállításhoz
      const meta = {
        filePath: filePath || null,
        fileName: fileName || (filePath ? path.basename(filePath) : null),
        subject: subject || null,
        compiledAt: new Date().toISOString()
      };
      await fs.writeJson(path.join(ACTIVE_DIR, 'meta.json'), meta);
    } catch (activeErr) {
      console.warn('[Compile] Figyelmeztetés: active mappába másolás sikertelen:', activeErr.message);
    }

    await fs.remove(jobDir).catch(() => {});

    res.json({
      success: true,
      pdf: pdfBuffer.toString('base64'),
      warnings,
      supplementedContent: finalContent !== content ? finalContent : undefined
    });
  } catch (err) {
    console.error('[Compile] Nem várt fordítási hiba:', err);
    await fs.remove(jobDir).catch(() => {});
    let texLog = '';
    try {
      const logFile = path.join(jobDir, 'document.log');
      if (await fs.pathExists(logFile)) {
        const full = await fs.readFile(logFile, 'utf8');
        texLog = extractTexErrors(full);
      }
    } catch {}
    res.status(422).json({
      error: 'Fordítási hiba',
      log: texLog || err.message || 'Belső szerverhiba fordítás közben'
    });
  }
});

// Aktuálisan lefordított dokumentum, PDF és metaadatok lekérdezése (oldalfrissítéskor való visszaállításhoz)
router.get('/active', async (req, res) => {
  try {
    const pdfFile = path.join(ACTIVE_DIR, 'document.pdf');
    const texFile = path.join(ACTIVE_DIR, 'document.tex');
    const metaFile = path.join(ACTIVE_DIR, 'meta.json');

    if (!(await fs.pathExists(pdfFile)) || !(await fs.pathExists(texFile))) {
      return res.json({ success: true, hasActive: false });
    }

    const pdfBuffer = await fs.readFile(pdfFile);
    const texContent = await fs.readFile(texFile, 'utf8');
    let meta = null;
    if (await fs.pathExists(metaFile)) {
      meta = await fs.readJson(metaFile).catch(() => null);
    }

    res.json({
      success: true,
      hasActive: true,
      pdf: pdfBuffer.toString('base64'),
      content: texContent,
      meta
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Aktív fordítási adatok törlése (pl. új üres dokumentum nyitásakor)
router.delete('/active', async (req, res) => {
  try {
    await fs.emptyDir(ACTIVE_DIR);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SyncTeX Forward Search: Kódsor -> PDF Pozíció
router.post('/synctex-forward', async (req, res) => {
  const { line, column } = req.body;
  if (!line) return res.status(400).json({ error: 'Hiányzó sorszám' });

  const texFile = path.join(ACTIVE_DIR, 'document.tex');
  const pdfFile = path.join(ACTIVE_DIR, 'document.pdf');

  if (!(await fs.pathExists(pdfFile)) || !(await fs.pathExists(texFile))) {
    return res.json({
      success: false,
      found: false,
      reason: 'no_pdf',
      error: 'Nincs elérhető lefordított dokumentum vagy synctex adat.'
    });
  }

  const col = column || 1;
  const cmd = `"${SYNCTEX}" view -i ${line}:${col}:document.tex -o document.pdf`;

  exec(cmd, { cwd: ACTIVE_DIR }, (err, stdout, stderr) => {
    if (err && !stdout) {
      return res.status(500).json({ error: 'SyncTeX hiba', details: stderr || err.message });
    }
    const result = parseSyncTeXView(stdout);
    if (!result) {
      return res.json({ success: false, found: false, error: 'Nem található PDF pozíció ehhez a sorhoz' });
    }
    res.json({ success: true, found: true, target: result });
  });
});

// SyncTeX Inverse Search: PDF Pozíció -> Kódsor
router.post('/synctex-inverse', async (req, res) => {
  const { page, x, y } = req.body;
  if (!page || x === undefined || y === undefined) {
    return res.status(400).json({ error: 'Hiányzó oldal vagy koordináták' });
  }

  const pdfFile = path.join(ACTIVE_DIR, 'document.pdf');
  if (!(await fs.pathExists(pdfFile))) {
    return res.json({
      success: false,
      found: false,
      reason: 'no_pdf',
      error: 'Nincs elérhető lefordított PDF.'
    });
  }

  const roundX = Math.round(Number(x));
  const roundY = Math.round(Number(y));
  const cmd = `"${SYNCTEX}" edit -o ${page}:${roundX}:${roundY}:document.pdf`;

  exec(cmd, { cwd: ACTIVE_DIR }, (err, stdout, stderr) => {
    if (err && !stdout) {
      return res.status(500).json({ error: 'SyncTeX hiba', details: stderr || err.message });
    }
    const result = parseSyncTeXEdit(stdout);
    if (!result) {
      return res.json({ success: false, found: false, error: 'Nem található kódsor a megadott pozícióhoz' });
    }
    res.json({ success: true, found: true, target: result });
  });
});

const TIKZ_CACHE_DIR = path.join(TEMP_DIR, 'tikz_cache');
fs.ensureDirSync(TIKZ_CACHE_DIR);

const GS = fs.existsSync('/usr/local/bin/gs')
  ? '/usr/local/bin/gs'
  : fs.existsSync('/opt/homebrew/bin/gs')
  ? '/opt/homebrew/bin/gs'
  : 'gs';

// ── Beépített Standalone TikZ Fordító az Előnézethez ──
router.post('/figure-preview', async (req, res) => {
  const { tikzCode, preamble } = req.body;
  if (!tikzCode || typeof tikzCode !== 'string') {
    return res.status(400).json({ error: 'Hiányzó TikZ kód' });
  }

  // Külső center és figure környezetek leválasztása, csak a tiszta tikzpicture megtartása
  let pureTikz = tikzCode
    .replace(/\\begin\{center\}/g, '')
    .replace(/\\end\{center\}/g, '')
    .replace(/\\begin\{figure\}(\[.*?\])?/g, '')
    .replace(/\\end\{figure\}/g, '')
    .trim();

  const match = pureTikz.match(/\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/);
  if (match) {
    pureTikz = match[0];
  }

  // MD5 gyorsítótár ellenőrzése
  const hash = crypto
    .createHash('md5')
    .update(pureTikz + (preamble || ''))
    .digest('hex');
  const cachePng = path.join(TIKZ_CACHE_DIR, `${hash}.png`);

  if (await fs.pathExists(cachePng)) {
    try {
      const pngBuf = await fs.readFile(cachePng);
      return res.json({
        success: true,
        image: `data:image/png;base64,${pngBuf.toString('base64')}`,
        cached: true
      });
    } catch (e) {}
  }

  const jobDir = path.join(TEMP_DIR, `fig_${uuidv4()}`);
  await fs.ensureDir(jobDir);

  try {
    const fullDoc = [
      '\\documentclass[tikz,border=6pt]{standalone}',
      '\\usepackage[utf8]{inputenc}',
      '\\usepackage[T1]{fontenc}',
      '\\usepackage[magyar]{babel}',
      '\\usepackage{amsmath,amssymb}',
      '\\usepackage{tikz}',
      '\\usetikzlibrary{arrows.meta,positioning,calc,shapes,patterns,decorations.pathmorphing}',
      preamble || '',
      '\\begin{document}',
      pureTikz,
      '\\end{document}'
    ].join('\n');

    const texFile = path.join(jobDir, 'fig.tex');
    const pdfFile = path.join(jobDir, 'fig.pdf');
    const pngFile = path.join(jobDir, 'fig.png');
    await fs.writeFile(texFile, fullDoc, 'utf8');

    // 1. Önálló standalone PDF lefordítása pdflatex-szel (-no-shell-escape védelemmel)
    const compileCmd = `"${PDFLATEX}" -no-shell-escape -interaction=nonstopmode fig.tex`;
    await new Promise((resolve, reject) => {
      exec(compileCmd, { cwd: jobDir, timeout: 9000 }, (err) => {
        if (fs.existsSync(pdfFile) && fs.statSync(pdfFile).size > 500) {
          resolve();
        } else {
          reject(err || new Error('A PDF nem jött létre'));
        }
      });
    });

    // 2. Konvertálás áttetsző, pixelpontos PNG formátumba Ghostscripttel
    let pngBase64 = null;
    const gsCmd = `"${GS}" -sDEVICE=pngalpha -r160 -dTextAlphaBits=4 -dGraphicsAlphaBits=4 -o fig.png fig.pdf`;
    try {
      await new Promise((resolve, reject) => {
        exec(gsCmd, { cwd: jobDir, timeout: 5000 }, (err) => {
          if (fs.existsSync(pngFile) && fs.statSync(pngFile).size > 100) {
            resolve();
          } else {
            reject(err || new Error('A PNG konvertálás sikertelen'));
          }
        });
      });

      if (await fs.pathExists(pngFile)) {
        const pngBuf = await fs.readFile(pngFile);
        pngBase64 = pngBuf.toString('base64');
        await fs.copy(pngFile, cachePng).catch(() => {});
      }
    } catch (gsErr) {
      console.warn('Ghostscript figyelmeztetés:', gsErr.message);
    }

    if (pngBase64) {
      await fs.remove(jobDir).catch(() => {});
      return res.json({
        success: true,
        image: `data:image/png;base64,${pngBase64}`,
        cached: false
      });
    }

    // Fallback: Ha a GS nem állna rendelkezésre, a lefordított PDF-et küldjük
    const pdfBuf = await fs.readFile(pdfFile);
    await fs.remove(jobDir).catch(() => {});
    return res.json({
      success: true,
      pdf: pdfBuf.toString('base64'),
      cached: false
    });
  } catch (compileErr) {
    await fs.remove(jobDir).catch(() => {});
    return res.status(422).json({
      error: 'Ábra fordítási hiba',
      details: compileErr.message
    });
  }
});

module.exports = router;
