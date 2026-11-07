const express = require('express');
const path = require('path');
const fs = require('fs-extra');

const router = express.Router();
const DATA_DIR = path.join(__dirname, '..', 'data');
const CUSTOM_DOC_TYPES_FILE = path.join(DATA_DIR, 'custom_doc_types.json');

const DEFAULT_CUSTOM_DOC_TYPES = [
  {
    id: 'formula_sheet',
    name: 'Képletgyűjtemény & Fogalomtár',
    desc: '2 hasábos, tömör referencia képletekkel, definíciókkal és táblázatokkal',
    prompt: `Készíts egy tömör, áttekinthető 2 hasábos Képletgyűjteményt és Fogalomtárat a témakörből!
Formátum és felépítés:
- Használj kétoszlopos elrendezést (\\begin{multicols}{2} vagy \\documentclass[twocolumn]{article})!
- Tömör, vizuális összefoglaló a legfontosabb képletekről, definíciókról, azonosságokról és SI mértékegységekről!
- Kiemelésekhez használj kompakt tcolorbox dobozokat és tiszta táblázatokat (booktabs)!
- Minden összefüggés mellett röviden szerepeljen a változók jelentése és mértékegysége!
- Kerüld a hosszú folyószöveget, légy maximálisan lényegretörő és vizuális!`,
    subject: 'Mindkettő',
    isBuiltIn: true,
    createdAt: '2026-11-06T12:00:00.000Z'
  },
  {
    id: 'lab_report',
    name: 'Laboratóriumi Mérési Jegyzőkönyv',
    desc: 'Mérési cél, eszközök, TikZ kapcsolási rajz, adattáblázat, értékelés',
    prompt: `Készíts egy hivatalos iskolai Laboratóriumi Mérési Jegyzőkönyv sablont a témakörből!
Kötelező szakaszok és felépítés:
1. \\section*{A mérés célja és elméleti alapjai} (a vizsgált fizikai/matematikai jelenség, alapképletek)
2. \\section*{Alkalmazott eszközök és mérési elrendezés} (eszközlista, TikZ kapcsolási/mérési ábra)
3. \\section*{Mérési adatok és jegyzőkönyvi táblázat} (szép booktabs táblázat mért és számított oszlopokkal, mértékegységekkel)
4. \\section*{Számítások és hibaszámítás} (mintaszámítás részletesen levezetve, relatív és abszolút hiba)
5. \\section*{Értékelés és következtetések} (tapasztalatok összegzése, lehetséges hibaforrások megvitatása)`,
    subject: 'Fizika',
    isBuiltIn: true,
    createdAt: '2026-11-06T12:00:00.000Z'
  },
  {
    id: 'thesis_proof',
    name: 'Tézislap & Tételbizonyítás',
    desc: 'Tétel kimondása, feltételek, lépésről-lépésre bizonyítás és alkalmazási példa',
    prompt: `Készíts egy didaktikus Tézislapot a témakör legfontosabb tételéről!
Kötelező felépítés:
1. \\begin{tcolorbox}[title=A tétel precíz kimondása] (feltételek és állítás pontos megfogalmazása)
2. \\section*{Értelmezés és szemléltetés} (szemléletes magyarázat és TikZ ábra)
3. \\section*{Részletes bizonyítás} (lépésről-lépésre levezetett, logikailag szigorú bizonyítás indoklásokkal)
4. \\section*{Alkalmazási típuspélda} (egy konkrét feladat részletes levezetésével, ahol a tétel közvetlenül alkalmazásra kerül)
5. \\section*{Tipikus buktatók} (mire kell figyelni a feltételek ellenőrzésekor)`,
    subject: 'Matematika',
    isBuiltIn: true,
    createdAt: '2026-11-06T12:00:00.000Z'
  }
];

async function loadCustomDocTypes() {
  await fs.ensureDir(DATA_DIR);
  if (!fs.existsSync(CUSTOM_DOC_TYPES_FILE)) {
    await fs.writeJson(CUSTOM_DOC_TYPES_FILE, DEFAULT_CUSTOM_DOC_TYPES, { spaces: 2 });
    return DEFAULT_CUSTOM_DOC_TYPES;
  }
  try {
    const list = await fs.readJson(CUSTOM_DOC_TYPES_FILE);
    return Array.isArray(list) ? list : DEFAULT_CUSTOM_DOC_TYPES;
  } catch (err) {
    console.error('Hiba a custom_doc_types.json beolvasásakor:', err);
    return DEFAULT_CUSTOM_DOC_TYPES;
  }
}

async function saveCustomDocTypes(types) {
  await fs.ensureDir(DATA_DIR);
  await fs.writeJson(CUSTOM_DOC_TYPES_FILE, types, { spaces: 2 });
}

// GET /api/custom-doc-types - Összes saját dokumentumtípus lekérése
router.get('/', async (req, res) => {
  try {
    const docTypes = await loadCustomDocTypes();
    res.json({ success: true, docTypes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/custom-doc-types - Új saját dokumentumtípus mentése
router.post('/', async (req, res) => {
  try {
    const { name, desc, prompt, subject } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'A típus neve kötelező!' });
    }
    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ success: false, error: 'Az egyéni utasítás / prompt szövege kötelező!' });
    }

    const docTypes = await loadCustomDocTypes();
    const newDocType = {
      id: `custom_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: name.trim(),
      desc: (desc || '').trim() || 'Egyéni dokumentum sablon',
      prompt: prompt.trim(),
      subject: subject || 'Mindkettő',
      isBuiltIn: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    docTypes.push(newDocType);
    await saveCustomDocTypes(docTypes);
    res.json({ success: true, docType: newDocType });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/custom-doc-types/:id - Saját dokumentumtípus módosítása
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, desc, prompt, subject } = req.body;
    const docTypes = await loadCustomDocTypes();
    const idx = docTypes.findIndex((t) => t.id === id);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'A dokumentumtípus nem található!' });
    }

    if (name) docTypes[idx].name = name.trim();
    if (desc !== undefined) docTypes[idx].desc = desc.trim();
    if (prompt) docTypes[idx].prompt = prompt.trim();
    if (subject) docTypes[idx].subject = subject;
    docTypes[idx].updatedAt = new Date().toISOString();

    await saveCustomDocTypes(docTypes);
    res.json({ success: true, docType: docTypes[idx] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/custom-doc-types/:id - Saját dokumentumtípus törlése
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const docTypes = await loadCustomDocTypes();
    const target = docTypes.find((t) => t.id === id);
    if (!target) {
      return res.status(404).json({ success: false, error: 'A dokumentumtípus nem található!' });
    }

    const filtered = docTypes.filter((t) => t.id !== id);
    await saveCustomDocTypes(filtered);
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
