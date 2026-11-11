const express = require('express');
const path = require('path');
const fs = require('fs-extra');

const router = express.Router();
const DATA_DIR = path.join(__dirname, '..', 'data');
const EXAM_TEMPLATES_FILE = path.join(DATA_DIR, 'exam_templates.json');

const DEFAULT_EXAM_TEMPLATES = [
  {
    id: 'ropdolgozat',
    name: 'Röpdolgozat (15 perc)',
    desc: '3 feladat, max. 15–20 pont, fejléc táblázat (max/elért/érdemjegy), A/B csoport',
    examType: 'ropdolgozat',
    taskCount: 3,
    difficulty: 'k1',
    groupMode: 'ab',
    withGroupsAB: true,
    layoutMode: 'compact',
    withEvaluationTable: true,
    withRubric: true,
    withGradingScale: true,
    solutionPlacement: 'separate_page',
    customPrompt: '1 db fogalmi tesztkérdés (4 pont), 2 db közvetlen egy-két lépéses alapfeladat (2x6=12 pont). Összesen: 16 pont.',
    isBuiltIn: true,
    createdAt: '2026-11-07T12:00:00.000Z'
  },
  {
    id: 'dolgozat',
    name: 'Órai Dolgozat / Ellenőrző (30 perc)',
    desc: '4 feladat, 25–35 pont, fejléc táblázat (max/elért/érdemjegy), A/B csoport',
    examType: 'dolgozat',
    taskCount: 4,
    difficulty: 'k2',
    groupMode: 'ab',
    withGroupsAB: true,
    layoutMode: 'compact',
    withEvaluationTable: true,
    withRubric: true,
    withGradingScale: true,
    solutionPlacement: 'separate_page',
    customPrompt: '1 db elméleti/fogalmi kérdés (5 pont), 2 db begyakorló típusfeladat (16 pont), 1 db gondolkodtató alkalmazás (9 pont). Összesen: 30 pont.',
    isBuiltIn: true,
    createdAt: '2026-11-07T12:00:00.000Z'
  },
  {
    id: 'temazaro',
    name: 'Témazáró Dolgozat (45 perc)',
    desc: '5 feladat K1 → K2 → K3 piramissal, fejléc táblázat (max/elért/érdemjegy) és A/B csoport',
    examType: 'temazaro',
    taskCount: 5,
    difficulty: 'pyramid',
    groupMode: 'ab',
    withGroupsAB: true,
    layoutMode: 'compact',
    withEvaluationTable: true,
    withRubric: true,
    withGradingScale: true,
    solutionPlacement: 'separate_page',
    customPrompt: 'K1 alapismeretek (1-2. feladat: 12 pont), K2 középszintű típusfeladatok (3-4. feladat: 20 pont), K3 összetett gondolkodtató feladat (5. feladat: 13 pont). Összesen: 45 pont.',
    isBuiltIn: true,
    createdAt: '2026-11-07T12:00:00.000Z'
  },
  {
    id: 'erettsegi_proba',
    name: 'Érettségi Próbavizsga (90 perc)',
    desc: 'I. rész rövid alap + II. rész összetett kidolgozós feladatok, 100 pontos skála',
    examType: 'erettsegi',
    taskCount: 8,
    difficulty: 'k2',
    groupMode: 'none',
    withGroupsAB: false,
    layoutMode: 'worksheet',
    withEvaluationTable: true,
    withRubric: true,
    withGradingScale: true,
    solutionPlacement: 'separate_doc',
    customPrompt: 'I. Rész: 4 db rövid alapfeladat (30 pont). II. Rész: 4 db összetett feladat (70 pont). Hivatalos pontozási útmutatóval.',
    isBuiltIn: true,
    createdAt: '2026-11-07T12:00:00.000Z'
  }
];

async function loadExamTemplates() {
  await fs.ensureDir(DATA_DIR);
  if (!fs.existsSync(EXAM_TEMPLATES_FILE)) {
    await fs.writeJson(EXAM_TEMPLATES_FILE, DEFAULT_EXAM_TEMPLATES, { spaces: 2 });
    return DEFAULT_EXAM_TEMPLATES;
  }
  try {
    const list = await fs.readJson(EXAM_TEMPLATES_FILE);
    if (!Array.isArray(list)) return DEFAULT_EXAM_TEMPLATES;
    let updated = false;
    for (const def of DEFAULT_EXAM_TEMPLATES) {
      const existingIdx = list.findIndex((t) => t.id === def.id);
      if (existingIdx === -1) {
        list.push(def);
        updated = true;
      } else if (list[existingIdx].isBuiltIn) {
        // Frissítjük a gyári sablon tulajdonságait (pl. groupMode, withEvaluationTable)
        list[existingIdx] = { ...def, ...list[existingIdx], groupMode: def.groupMode, withEvaluationTable: def.withEvaluationTable };
        updated = true;
      }
    }
    if (updated) {
      await fs.writeJson(EXAM_TEMPLATES_FILE, list, { spaces: 2 });
    }
    return list;
  } catch (err) {
    console.error('Hiba az exam_templates.json olvasásakor:', err);
    return DEFAULT_EXAM_TEMPLATES;
  }
}

async function saveExamTemplates(templates) {
  await fs.ensureDir(DATA_DIR);
  await fs.writeJson(EXAM_TEMPLATES_FILE, templates, { spaces: 2 });
}

// GET /api/exam-templates - Összes dolgozatsablon lekérése
router.get('/', async (req, res) => {
  try {
    const templates = await loadExamTemplates();
    res.json({ success: true, templates });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/exam-templates - Új saját dolgozatsablon mentése
router.post('/', async (req, res) => {
  try {
    const {
      name,
      desc,
      examType = 'temazaro',
      taskCount = 5,
      difficulty = 'pyramid',
      groupMode = 'ab',
      withGroupsAB = true,
      layoutMode = 'compact',
      withEvaluationTable = true,
      withRubric = true,
      withGradingScale = true,
      solutionPlacement = 'separate_page',
      customPrompt = '',
      subject = 'Mindkettő'
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'A sablon neve kötelező!' });
    }

    const templates = await loadExamTemplates();
    const effectiveGroupMode = groupMode || (withGroupsAB ? 'ab' : 'none');
    const newTemplate = {
      id: `exam_tpl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: name.trim(),
      desc: (desc || '').trim() || 'Egyéni dolgozat sablon',
      examType,
      taskCount: Number(taskCount) || 5,
      difficulty,
      groupMode: effectiveGroupMode,
      withGroupsAB: effectiveGroupMode !== 'none',
      layoutMode,
      withEvaluationTable: Boolean(withEvaluationTable),
      withRubric: Boolean(withRubric),
      withGradingScale: Boolean(withGradingScale),
      solutionPlacement,
      customPrompt: (customPrompt || '').trim(),
      subject,
      isBuiltIn: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    templates.push(newTemplate);
    await saveExamTemplates(templates);
    res.json({ success: true, template: newTemplate });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/exam-templates/:id - Dolgozatsablon módosítása
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const templates = await loadExamTemplates();
    const idx = templates.findIndex((t) => t.id === id);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'A sablon nem található!' });
    }

    const {
      name,
      desc,
      examType,
      taskCount,
      difficulty,
      groupMode,
      withGroupsAB,
      layoutMode,
      withEvaluationTable,
      withRubric,
      withGradingScale,
      solutionPlacement,
      customPrompt,
      subject
    } = req.body;

    if (name) templates[idx].name = name.trim();
    if (desc !== undefined) templates[idx].desc = desc.trim();
    if (examType !== undefined) templates[idx].examType = examType;
    if (taskCount !== undefined) templates[idx].taskCount = Number(taskCount);
    if (difficulty !== undefined) templates[idx].difficulty = difficulty;
    if (groupMode !== undefined) {
      templates[idx].groupMode = groupMode;
      templates[idx].withGroupsAB = groupMode !== 'none';
    } else if (withGroupsAB !== undefined) {
      templates[idx].withGroupsAB = Boolean(withGroupsAB);
      templates[idx].groupMode = withGroupsAB ? 'ab' : 'none';
    }
    if (layoutMode !== undefined) templates[idx].layoutMode = layoutMode;
    if (withEvaluationTable !== undefined) templates[idx].withEvaluationTable = Boolean(withEvaluationTable);
    if (withRubric !== undefined) templates[idx].withRubric = Boolean(withRubric);
    if (withGradingScale !== undefined) templates[idx].withGradingScale = Boolean(withGradingScale);
    if (solutionPlacement !== undefined) templates[idx].solutionPlacement = solutionPlacement;
    if (customPrompt !== undefined) templates[idx].customPrompt = customPrompt.trim();
    if (subject !== undefined) templates[idx].subject = subject;
    templates[idx].updatedAt = new Date().toISOString();

    await saveExamTemplates(templates);
    res.json({ success: true, template: templates[idx] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/exam-templates/:id - Saját dolgozatsablon törlése
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const templates = await loadExamTemplates();
    const target = templates.find((t) => t.id === id);
    if (!target) {
      return res.status(404).json({ success: false, error: 'A sablon nem található!' });
    }
    if (target.isBuiltIn) {
      return res.status(400).json({ success: false, error: 'A beépített mintasablonok nem törölhetők!' });
    }

    const filtered = templates.filter((t) => t.id !== id);
    await saveExamTemplates(filtered);
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
