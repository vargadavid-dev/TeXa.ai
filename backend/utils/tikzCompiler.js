const { exec } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');

const TEMP_DIR = path.join(__dirname, '..', 'temp');
fs.ensureDirSync(TEMP_DIR);

const PDFLATEX = fs.existsSync('/Library/TeX/texbin/pdflatex')
  ? '/Library/TeX/texbin/pdflatex'
  : 'pdflatex';

/**
 * Tisztítja a TikZ kódot és kinyeri az esetleges előre írt \usetikzlibrary parancsokat
 */
function prepareTikzCode(code) {
  let cleaned = (code || '').trim();
  // Markdown blokkok eltávolítása ha van
  const m = cleaned.match(/```(?:latex|tex|tikz)?\n?([\s\S]*?)```/i);
  if (m) cleaned = m[1].trim();
  else cleaned = cleaned.replace(/^```(?:latex|tex|tikz)?\n?/i, '').replace(/\n?```$/i, '').trim();

  // Ha a felhasználó egy teljes standalone dokumentumot adott meg, azt tartsuk meg
  if (cleaned.includes('\\documentclass') && cleaned.includes('\\begin{document}')) {
    return {
      standaloneTex: cleaned,
      rawTikz: cleaned
    };
  }

  // Kinyerjük a \usetikzlibrary vagy \usepackage sorokat, ha a kód elején vannak
  const extraLibs = [];
  const lines = cleaned.split('\n');
  const codeLines = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('\\usetikzlibrary') || trimmed.startsWith('% \\usetikzlibrary')) {
      const cleanLine = trimmed.replace(/^%\s*/, '');
      extraLibs.push(cleanLine);
    } else {
      codeLines.push(line);
    }
  }

  let body = codeLines.join('\n').trim();

  // Ha nincs \begin{tikzpicture}, becsomagoljuk
  if (!body.includes('\\begin{tikzpicture}')) {
    body = `\\begin{tikzpicture}\n${body}\n\\end{tikzpicture}`;
  }

  const extraLibsStr = extraLibs.length > 0 ? extraLibs.join('\n') : '';

  const standaloneTex = `\\documentclass[tikz,border=4mm]{standalone}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[magyar]{babel}
\\usepackage{amsmath,amssymb}
\\usepackage{tikz}
\\usepackage{pgfplots}
\\pgfplotsset{compat=1.18}
\\usetikzlibrary{
  arrows.meta,
  calc,
  angles,
  quotes,
  patterns,
  positioning,
  decorations.pathmorphing,
  decorations.pathreplacing,
  shapes.geometric,
  intersections,
  through,
  backgrounds,
  fit
}
${extraLibsStr}
\\begin{document}
${body}
\\end{document}`;

  return {
    standaloneTex,
    rawTikz: body
  };
}

/**
 * Önálló, villámgyors TikZ fordítás standalone sablonnal
 * @param {string} tikzCode
 * @returns {Promise<{ success: boolean, pdf?: string, error?: string, log?: string, standaloneTex: string, rawTikz: string }>}
 */
async function compileStandaloneTikz(tikzCode) {
  const { standaloneTex, rawTikz } = prepareTikzCode(tikzCode);
  const jobId = 'tikz_' + uuidv4().slice(0, 8);
  const jobDir = path.join(TEMP_DIR, jobId);

  try {
    await fs.ensureDir(jobDir);
    const texPath = path.join(jobDir, 'figure.tex');
    const pdfPath = path.join(jobDir, 'figure.pdf');
    const logPath = path.join(jobDir, 'figure.log');

    await fs.writeFile(texPath, standaloneTex, 'utf8');

    const cmd = `"${PDFLATEX}" -no-shell-escape -interaction=nonstopmode figure.tex`;

    const execResult = await new Promise((resolve) => {
      exec(cmd, { cwd: jobDir, timeout: 8000, maxBuffer: 5 * 1024 * 1024 }, (error, stdout, stderr) => {
        resolve({ error, stdout, stderr });
      });
    });

    const pdfExists = await fs.pathExists(pdfPath);
    if (pdfExists) {
      const stat = await fs.stat(pdfPath);
      if (stat.size > 100) {
        const pdfBuf = await fs.readFile(pdfPath);
        await fs.remove(jobDir).catch(() => {});
        return {
          success: true,
          pdf: pdfBuf.toString('base64'),
          standaloneTex,
          rawTikz
        };
      }
    }

    // Ha nem jött létre PDF, napló kinyerése
    let logSnippet = '';
    if (await fs.pathExists(logPath)) {
      const fullLog = await fs.readFile(logPath, 'utf8');
      const lines = fullLog.split('\n');
      const errLines = [];
      let capturing = false;
      for (const l of lines) {
        if (l.startsWith('!')) {
          capturing = true;
          errLines.push(l);
        } else if (capturing) {
          errLines.push(l);
          if (l.match(/^l\.\d+/)) {
            capturing = false;
          }
        }
      }
      logSnippet = errLines.slice(0, 15).join('\n') || fullLog.slice(-1500);
    }

    await fs.remove(jobDir).catch(() => {});
    return {
      success: false,
      error: 'TikZ fordítási hiba',
      log: logSnippet || execResult.stderr || execResult.stdout || 'Nem sikerült lefordítani az ábrát.',
      standaloneTex,
      rawTikz
    };
  } catch (err) {
    await fs.remove(jobDir).catch(() => {});
    return {
      success: false,
      error: err.message || 'Belső hiba a TikZ fordításakor',
      standaloneTex,
      rawTikz
    };
  }
}

module.exports = {
  prepareTikzCode,
  compileStandaloneTikz
};
