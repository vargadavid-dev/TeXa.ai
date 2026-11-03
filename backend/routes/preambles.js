const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const { supplementPreamble } = require('../utils/latexPreambleHelper');

const router = express.Router();
const DATA_DIR = path.join(__dirname, '..', 'data');
const PREAMBLES_FILE = path.join(DATA_DIR, 'preambles.json');

fs.ensureDirSync(DATA_DIR);

const DEFAULT_PREAMBLES = [
  {
    id: 'default-microlearning',
    name: 'Interaktív Mikrotananyag',
    desc: 'Definíciók, tételek, feladat- és megoldásdobozok az azonnali visszacsatoláshoz',
    subject: 'Mindkettő',
    isBuiltin: true,
    preamble: `\\documentclass[a4paper,12pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[magyar]{babel}
\\usepackage{amsmath, amssymb, amsthm}
\\usepackage{geometry}
\\usepackage{xcolor}
\\usepackage{tcolorbox}
\\tcbuselibrary{theorems,skins,breakable}
\\usepackage{tikz}
\\usepackage{enumitem}
\\geometry{margin=2.5cm}

% Dobozok a mikrotananyag módszertanhoz
\\newtcolorbox{definiciodoboz}[1][]{colback=blue!5!white,colframe=blue!75!black,fonttitle=\\bfseries,title=Definíció: #1}
\\newtcolorbox{teteldoboz}[1][]{colback=green!8!white,colframe=green!75!black,fonttitle=\\bfseries,title=Tétel: #1}
\\newtcolorbox{feladatdoboz}[1][]{colback=orange!5!white,colframe=orange!85!black,fonttitle=\\bfseries,title=Ellenőrző feladat: #1}
\\newtcolorbox{megoldasdoboz}[1][]{colback=gray!5!white,colframe=gray!60!black,fonttitle=\\bfseries,title=Megoldás és magyarázat: #1}`
  },
  {
    id: 'default-math',
    name: 'Matematika Mester-Preambulum',
    desc: 'Elegáns kék definíciók, zöld tételek, bizonyítások, TikZ és koordinátarendszer',
    subject: 'Matematika',
    isBuiltin: true,
    preamble: `\\documentclass[a4paper,12pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[magyar]{babel}
\\usepackage{amsmath, amssymb, amsthm}
\\usepackage{geometry}
\\usepackage{xcolor}
\\usepackage{tcolorbox}
\\tcbuselibrary{theorems,skins}
\\usepackage{tikz}
\\usepackage{pgfplots}
\\pgfplotsset{compat=1.18}
\\usepackage{enumerate}
\\geometry{margin=2.5cm}

% Egyedi definíció és tétel dobozok
\\newtcolorbox{definiciodoboz}[1][]{colback=blue!5!white,colframe=blue!75!black,fonttitle=\\bfseries,title=Definíció: #1}
\\newtcolorbox{teteldoboz}[1][]{colback=green!10!white,colframe=green!75!black,fonttitle=\\bfseries,title=Tétel: #1}`
  },
  {
    id: 'default-physics',
    name: 'Fizika Mester-Preambulum',
    desc: 'SI mértékegységek (siunitx), törvénydobozok, TikZ és áramkörök',
    subject: 'Fizika',
    isBuiltin: true,
    preamble: `\\documentclass[a4paper,12pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[magyar]{babel}
\\usepackage{amsmath, amssymb}
\\usepackage{siunitx}
\\sisetup{locale=DE}
\\usepackage{geometry}
\\usepackage{xcolor}
\\usepackage{tcolorbox}
\\usepackage{tikz}
\\usepackage{circuitikz}
\\usepackage{booktabs}
\\geometry{margin=2.5cm}

% Egyedi fizikai törvény kiemelő doboz
\\newtcolorbox{torvenydoboz}[1][]{colback=purple!5!white,colframe=purple!75!black,fonttitle=\\bfseries,title=Fizikai törvény: #1}`
  },
  {
    id: 'default-worksheet',
    name: 'Gyakorló Feladatsor & Dolgozat',
    desc: 'Kompakt 2cm margó, fejléc mezők, számozott feladatok és pontozás',
    subject: 'Mindkettő',
    isBuiltin: true,
    preamble: `\\documentclass[a4paper,11pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[magyar]{babel}
\\usepackage{amsmath, amssymb}
\\usepackage{geometry}
\\usepackage{xcolor}
\\usepackage{tcolorbox}
\\usepackage{enumitem}
\\geometry{margin=2cm}`
  },
  {
    id: 'default-beamer',
    name: 'Beamer Diavetítés',
    desc: '16:9 szélesvásznú diák, Madrid téma, bullet pointok és képletek',
    subject: 'Mindkettő',
    isBuiltin: true,
    preamble: `\\documentclass[aspectratio=169,11pt]{beamer}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[magyar]{babel}
\\usepackage{amsmath, amssymb}
\\usetheme{Madrid}
\\usecolortheme{whale}`
  }
];

async function loadPreambles() {
  if (!(await fs.pathExists(PREAMBLES_FILE))) {
    await fs.writeJson(PREAMBLES_FILE, DEFAULT_PREAMBLES, { spaces: 2 });
    return DEFAULT_PREAMBLES;
  }
  try {
    const list = await fs.readJson(PREAMBLES_FILE);
    return Array.isArray(list) ? list : DEFAULT_PREAMBLES;
  } catch {
    return DEFAULT_PREAMBLES;
  }
}

async function savePreambles(list) {
  await fs.writeJson(PREAMBLES_FILE, list, { spaces: 2 });
}

// GET /api/preambles - Összes preambulum lekérdezése
router.get('/', async (req, res) => {
  try {
    const preambles = await loadPreambles();
    res.json({ success: true, preambles });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/preambles/supplement - Preambulum kiegészítése a megjelenítéshez szükséges csomagokkal
router.post('/supplement', (req, res) => {
  try {
    const { preamble, body } = req.body;
    if (!preamble || !preamble.trim()) {
      return res.status(400).json({ error: 'A preambulum kódja nem lehet üres!' });
    }
    const { supplementedPreamble, addedPackages } = supplementPreamble(preamble, body || '', { forceCustomBoxes: false });
    res.json({
      success: true,
      preamble: supplementedPreamble,
      added: addedPackages
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/preambles - Új saját preambulum mentése
router.post('/', async (req, res) => {
  try {
    const { name, desc, subject = 'Mindkettő', preamble } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'A preambulum neve kötelező!' });
    if (!preamble || !preamble.trim()) return res.status(400).json({ error: 'A preambulum kódja nem lehet üres!' });

    // Mindig kiegészítjük a megjelenítéshez szükséges csomagokkal
    const { supplementedPreamble } = supplementPreamble(preamble, '', { forceCustomBoxes: false });

    const preambles = await loadPreambles();
    const newPreamble = {
      id: `custom-${uuidv4().slice(0, 8)}`,
      name: name.trim(),
      desc: desc ? desc.trim() : 'Felhasználói egyéni preambulum',
      subject: subject || 'Mindkettő',
      isBuiltin: false,
      preamble: supplementedPreamble.trim(),
      createdAt: new Date().toISOString()
    };

    preambles.push(newPreamble);
    await savePreambles(preambles);

    res.json({ success: true, preamble: newPreamble });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/preambles/:id - Meglévő saját preambulum módosítása
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, desc, subject, preamble } = req.body;

    const preambles = await loadPreambles();
    const idx = preambles.findIndex((p) => p.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Preambulum nem található' });

    if (name) preambles[idx].name = name.trim();
    if (desc !== undefined) preambles[idx].desc = desc.trim();
    if (subject) preambles[idx].subject = subject;
    if (preamble) {
      const { supplementedPreamble } = supplementPreamble(preamble, '', { forceCustomBoxes: false });
      preambles[idx].preamble = supplementedPreamble.trim();
    }
    preambles[idx].updatedAt = new Date().toISOString();

    await savePreambles(preambles);
    res.json({ success: true, preamble: preambles[idx] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/preambles/:id - Saját preambulum törlése
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const preambles = await loadPreambles();
    const target = preambles.find((p) => p.id === id);

    if (!target) return res.status(404).json({ error: 'Preambulum nem található' });
    if (target.isBuiltin) {
      return res.status(403).json({ error: 'Beépített alap preambulum nem törölhető!' });
    }

    const filtered = preambles.filter((p) => p.id !== id);
    await savePreambles(filtered);

    res.json({ success: true, message: 'Preambulum sikeresen törölve' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
