const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const axios = require('axios');
const { supplementFullLatex, sanitizeLatexNumbering, sanitizeTabularRows, ensureDocumentStructure } = require('../utils/latexPreambleHelper');
const { compileStandaloneTikz } = require('../utils/tikzCompiler');

const router = express.Router();
const upload = multer({ dest: path.join(__dirname, '..', 'uploads'), limits: { fileSize: 20 * 1024 * 1024 } });

fs.ensureDirSync(path.join(__dirname, '..', 'uploads'));

const getGenAI = (req = null) => {
  const clientKey = req?.headers?.['x-gemini-api-key'] || req?.body?.apiKey;
  if (!clientKey || !clientKey.trim()) {
    const error = new Error('Nincs beállítva Gemini API kulcs! Kérjük, add meg a saját kulcsodat a jobb felső Beállítások (Fogaskerék) gombra kattintva.');
    error.status = 401;
    throw error;
  }
  return new GoogleGenerativeAI(clientKey.trim());
};

async function extractFile(filePath, mimetype, originalname) {
  const ext = path.extname(originalname).toLowerCase();
  if (ext === '.pdf') {
    const buf = await fs.readFile(filePath);
    const data = await pdfParse(buf);
    return { type: 'text', content: data.text.slice(0, 12000) };
  }
  if (['.docx', '.doc'].includes(ext)) {
    const buf = await fs.readFile(filePath);
    const result = await mammoth.extractRawText({ buffer: buf });
    return { type: 'text', content: result.value.slice(0, 12000) };
  }
  if (['.tex', '.txt', '.md'].includes(ext)) {
    const content = await fs.readFile(filePath, 'utf8');
    return { type: 'text', content: content.slice(0, 12000) };
  }
  if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
    const buf = await fs.readFile(filePath);
    return { type: 'image', data: buf.toString('base64'), mimeType: mimetype };
  }
  throw new Error(`Nem támogatott formátum: ${ext}`);
}

const SYSTEM = `Te egy professzionális LaTeX dokumentumgeneráló asszisztens vagy, aki középiskolai oktatási anyagokat készít MAGYAR NYELVEN.
Szabályok:
- Mindig teljes, fordítható LaTeX dokumentumot generálj \\documentclass-tól \\end{document}-ig
- Kötelező csomagok: inputenc(utf8), fontenc(T1), babel(magyar), amsmath, amssymb, geometry
- Használj tcolorbox, xcolor, tikz csomagokat szép formázáshoz ahol releváns
- Professzionális, tanulóbarát stílus
- SZIGORÚAN TILOS A DUPLA SZÁMOZÁS:
  * A számozott fejezetek címébe (\\section{...}, \\subsection{...}, \\subsubsection{...}) KIFEJEZETTEN TILOS manuálisan sorszámot írni (pl. TILOS: \\section{1. Bevezetés} vagy \\section{1. Mikor használjuk?}, mert a LaTeX maga számozza a section-öket, és a PDF-ben hibás "1. 1. Bevezetés" jelenne meg! Helyes: \\section{Bevezetés}, \\section{Mikor használjuk?})!
  * Számozott listákban (\\begin{enumerate}) az \\item mögé SOHA NE írj ki kézzel újra sorszámot vagy betűt (pl. \\item \\textbf{1. Feladat} vagy \\item a)), mert a LaTeX számozó automatikusan kirakja a sorszámot vagy betűt, és a kézi kiírás csúnya dupla számozást eredményez!
- CSAK LaTeX kódot adj vissza, semmi más szöveget, magyarázatot`;

const BEAMER_SYSTEM = `Te egy professzionális LaTeX és Beamer prezentáció-készítő asszisztens vagy MAGYAR NYELVEN.
Szabályok:
- Mindig teljes, azonnal pdflatex-szel fordítható Beamer dokumentumot generálj: \\documentclass[aspectratio=169,11pt]{beamer} vagy \\documentclass{beamer} és \\end{document} között.
- Válassz tetszetős témát: pl. \\usetheme{Madrid} vagy \\usetheme{Warsaw}.
- Csomagok: inputenc(utf8), fontenc(T1), babel(magyar), amsmath, amssymb, tikz.
- SZIGORÚAN TILOS az enumitem, az enumerate és a geometry csomagok használata! (A Beamer maga kezeli a diákat és a listák animációit/számlálóit. Az enumitem fatális TeX capacity exceeded fordítási hibát okoz!)
- SZIGORÚAN TILOS a számozott listákban (\\begin{enumerate}) a sorszám megismétlése az \\item mögött!
- Minden dia KÖTELEZŐEN külön \\begin{frame}{Dia címe} ... \\end{frame} blokkban legyen! Ügyelj arra, hogy minden nyitott frame pontosan egyszer legyen lezárva, ne legyenek duplikált zárójelek vagy elhagyott környezetek!
- Kiemelésekhez használd a Beamer beépített dobozait: \\begin{block}{Definíció}...\\end{block}, \\begin{alertblock}{Fontos trükk}...\\end{alertblock}, \\begin{exampleblock}{Példa}...\\end{exampleblock}.
- Gráfos ábráknál, amennyiben a feladat szövegében nem hivatkozunk kifejezetten a csúcsok betűjeleire (A, B, C...), a csúcsokat csak pontként (pöttyként) kell kirajzolni betűk és zavaró fokszám-feliratok nélkül.
- CSAK érvényes Beamer LaTeX kódot adj vissza, semmilyen magyarázó szöveg nélkül!`;

const DOC_TYPES = {
  microlearning: 'interaktív mikrotananyag (aprózott mikro-egységek, azonnali ellenőrző feladatokkal: feleletválasztós A/B/C/D, Igaz/Hamis, rövid válaszos és többlépcsős feladatok)',
  osszefoglalo: 'részletes összefoglaló (definíciók tcolorbox-ban, tételek, bizonyítások, megoldott példák, önálló feladatok)',
  feladatsor: 'feladatsor (elegáns számozás, több rész a/b/c, opcionálisan megoldókulcs a végén)',
  beamer: 'Beamer prezentáció (\\documentclass{beamer}, szemléletes diák, bullet pointok, képletek)',
  leiras: 'részletes leírás és magyarázat (folyó szöveg, szemléltető példák, ábrák TikZ-ben)',
  custom: 'egyéni dokumentum (a felhasználó egyedi utasításai, szerkezete és stílusa alapján)'
};

// Generikus AI hívás (Kezeli a Gemini és a Helyi LM Studio / Ollama hívásokat is)
async function callAi(prompt, provider, imageParts = [], systemPrompt = SYSTEM, requestedModel = null, req = null, options = {}) {
  if (provider === 'local') {
    const combinedPrompt = `${systemPrompt}\n\nFONTOS HELYI MODELL UTASÍTÁS: Mivel helyi számítógépen futsz, légy lényegretörő, rendkívül tömör és törekedj a gyors generálásra (maximum 600-800 szó). Ne ismételd önmagad! Mindenképpen fejezd be a dokumentumot és zárd le a \\end{document} paranccsal!\n\nKérés:\n${prompt}`;

    // 1. Megpróbáljuk elérni az LM Studio-t (port: 1234)
    try {
      const response = await axios.post('http://localhost:1234/v1/chat/completions', {
        model: 'local-model', // Az LM Studio ezt automatikusan a betöltött modellre irányítja át
        messages: [
          { role: 'user', content: combinedPrompt }
        ]
        // KIHAGYJUK a temperature-t és a max_tokens-t, hogy az LM Studio a GUI-ban beállított optimális mintavételezési (sampler) értékeket használja, elkerülve a Gemma lefagyását.
      }, { timeout: 600000 }); // 10 perc időtúllépés a lassabb helyi modelleknek
      return response.data.choices[0].message.content;
    } catch (lmErr) {
      // 2. Ha nem az LM Studio fut, megpróbáljuk az Ollama-t (port: 11434)
      try {
        const tagsRes = await axios.get('http://localhost:11434/api/tags');
        const models = tagsRes.data.models || [];
        if (models.length === 0) {
          throw new Error('Nincs letöltött modell az Ollama-ban! Futtasd a terminálban pl. az "ollama run llama3" parancsot a letöltéshez.');
        }
        // Az első elérhető helyi modellt használjuk
        const modelName = models[0].name;

        const response = await axios.post('http://localhost:11434/v1/chat/completions', {
          model: modelName,
          messages: [
            { role: 'user', content: combinedPrompt }
          ]
        }, { timeout: 600000 }); // 10 perc időtúllépés
        return response.data.choices[0].message.content;
      } catch (ollamaErr) {
        if (ollamaErr.message.includes('Nincs letöltött modell')) {
          throw ollamaErr;
        }
        throw new Error(`[Helyi LLM Hiba]: Nem sikerült kapcsolódni sem az LM Studio-hoz (port: 1234), sem az Ollama-hoz (port: 11434)! Ellenőrizd, hogy elindítottad-e valamelyik helyi LLM alkalmazást.`);
      }
    }
  } else {
    const genAI = getGenAI(req);
    const candidateModels = [
      requestedModel,
      process.env.GEMINI_MODEL,
      'gemini-3.8-flash',
      'gemini-3.5-flash-lite',
      'gemini-2.5-flash',
      'gemini-3.5-flash'
    ].filter(Boolean);

    const uniqueModels = [...new Set(candidateModels)];
    let lastError = null;
    const parts = [{ text: `${systemPrompt}\n\n${prompt}` }, ...imageParts];
    if (imageParts.length > 0) parts.push({ text: '\nA fenti képeket is vedd figyelembe.' });

    const thinkingLevel = options?.thinkingLevel || 'low';
    const timeoutMs = options?.timeoutMs || 30000;

    for (const modelName of uniqueModels) {
      try {
        const genConfig = {};
        // Thinking konfiguráció beállítása (Gemini 2.5 / 3.x / 4.x modelleknél)
        const supportsThinking = !modelName.includes('gemini-1.') && !modelName.includes('gemini-2.0');
        if (supportsThinking && thinkingLevel) {
          genConfig.thinkingConfig = { thinkingLevel };
        }

        let model;
        try {
          model = genAI.getGenerativeModel({
            model: modelName,
            ...(Object.keys(genConfig).length > 0 ? { generationConfig: genConfig } : {})
          });
        } catch (_) {
          model = genAI.getGenerativeModel({ model: modelName });
        }

        const resultPromise = model.generateContent(parts);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Időtúllépés (${timeoutMs / 1000}s) a(z) ${modelName} modellnél`)), timeoutMs)
        );
        const result = await Promise.race([resultPromise, timeoutPromise]);
        return result.response.text();
      } catch (err) {
        // Ha a modell nem fogadta el a thinkingConfig-ot, azonnali próbálkozás anélkül
        if (err.message && (err.message.includes('thinking') || err.message.includes('ThinkingConfig') || err.message.includes('generationConfig'))) {
          try {
            const fallbackModel = genAI.getGenerativeModel({ model: modelName });
            const resultPromise = fallbackModel.generateContent(parts);
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error(`Időtúllépés (${timeoutMs / 1000}s) a(z) ${modelName} modellnél`)), timeoutMs)
            );
            const result = await Promise.race([resultPromise, timeoutPromise]);
            return result.response.text();
          } catch (retryErr) {
            lastError = retryErr;
          }
        } else {
          lastError = err;
        }
        console.warn(`[Gemini API] '${modelName}' nem elérhető (${err.message}). Következő modell kipróbálása...`);
      }
    }
    throw new Error(`Gemini API hiba: ${lastError?.message || 'Nem sikerült választ kapni a modelltől.'}`);
  }
}

// GET /api/ai/models
router.get('/models', (req, res) => {
  res.json({
    active: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
    geminiModels: [
      { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', desc: 'Legújabb csúcsmodell (gyorsított gondolkodással)' },
      { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite', desc: 'Villámgyors és hatékony (azonnali válasz)' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', desc: 'Stabil gyors modell' },
      { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', desc: 'Prémium minőség' }
    ]
  });
});

// POST /api/ai/validate-key - ellenőrzi a kliens által megadott Gemini kulcsot
router.post('/validate-key', async (req, res) => {
  try {
    const customKey = req.headers['x-gemini-api-key'] || req.body?.apiKey;
    if (!customKey || !customKey.trim()) {
      return res.status(400).json({ success: false, valid: false, error: 'Kérjük, add meg az API kulcsodat!' });
    }
    const genAI = new GoogleGenerativeAI(customKey.trim());
    const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash-lite' });
    const result = await Promise.race([
      model.generateContent('ping'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Időtúllépés az ellenőrzés során (12s)')), 12000))
    ]);
    res.json({
      success: true,
      valid: true,
      message: 'API kulcs érvényes és működőképes!'
    });
  } catch (err) {
    let msg = err.message || 'Érvénytelen API kulcs!';
    if (msg.includes('API_KEY_INVALID') || msg.includes('400')) msg = 'A megadott API kulcs érvénytelen!';
    if (msg.includes('429')) msg = 'A megadott API kulcs elérte az átmeneti kvótakorlátot!';
    res.status(400).json({ success: false, valid: false, error: msg });
  }
});

// POST /api/ai/generate
router.post('/generate', upload.array('files', 5), async (req, res) => {
  try {
    const { topic, docType, subject, customPrompt, provider, model, customPreamble } = req.body;

    let fileContext = '';
    const imageParts = [];

    for (const file of (req.files || [])) {
      try {
        const ex = await extractFile(file.path, file.mimetype, file.originalname);
        if (ex.type === 'text') fileContext += `\n\n--- ${file.originalname} ---\n${ex.content}`;
        else imageParts.push({ inlineData: { data: ex.data, mimeType: ex.mimeType } });
      } finally {
        await fs.remove(file.path).catch(() => {});
      }
    }

    const subjectName = subject === 'fizika' ? 'Fizika' : 'Matematika';
    const typeName = DOC_TYPES[docType] || DOC_TYPES.osszefoglalo;

    const hasCustomPreamble = customPreamble && customPreamble.trim().length > 0;

    const sysPrompt = hasCustomPreamble
      ? `Te egy professzionális LaTeX dokumentumgeneráló asszisztens vagy MAGYAR NYELVEN.
A dokumentumhoz a felhasználó egy EGYÉNI (SAJÁT) PREAMBULUMOT adott meg.
SZABÁLYOK:
- Tartsd tiszteletben és őrizd meg a megadott saját preambulum stílusát és alapbeállításait!
- A dokumentum címe (\\title{...}) PONTOSAN a megadott Témakör legyen: \\title{${(topic || '').trim()}} (ne találj ki más címet)!
- FONTOS: Ha a generált tartalomhoz, feladatokhoz, ábrákhoz vagy az esztétikus, professzionális megjelenítéshez olyan csomagokra vagy környezetekre van szükség, amelyek hiányoznak a megadott preambulumból (pl. tcolorbox, tikz, pgfplots, siunitx, amsmath, amssymb, cancel, booktabs, enumitem, egyedi kiemelő dobozok), a kód elején lévő preambulumot MINDENKÉPPEN egészítsd ki ezekkel a csomagokkal és definíciókkal!
- SZIGORÚAN TILOS A DUPLA SZÁMOZÁS: A számozott fejezetcímekbe (\\section{...}, \\subsection{...}) KIFEJEZETTEN TILOS manuálisan sorszámot írni (pl. TILOS: \\section{1. Mikor használjuk?}, helyette \\section{Mikor használjuk?} a helyes, mert a LaTeX automatikusan elé teszi a számot)!
- A generált kód egy teljes, azonnal pdflatex-szel fordítható LaTeX dokumentum legyen (\\documentclass-tól \\end{document}-ig), a kiegészített preambulummal együtt!
- CSAK LaTeX kódot adj vissza, semmilyen magyarázat nélkül.`
      : `Te egy professzionális LaTeX dokumentumgeneráló asszisztens vagy, aki középiskolai oktatási anyagokat készít MAGYAR NYELVEN.
Szabályok:
- Mindig teljes, fordítható LaTeX dokumentumot generálj \\documentclass-tól \\end{document}-ig
- A dokumentum címe (\\title{...}) PONTOSAN a megadott Témakör legyen: \\title{${(topic || '').trim()}}
- Kötelező csomagok: inputenc(utf8), fontenc(T1), babel(magyar), amsmath, amssymb, geometry
- Használj tcolorbox, xcolor, tikz csomagokat szép formázáshoz ahol releváns
- Professzionális, tanulóbarát stílus
- SZIGORÚAN TILOS A DUPLA SZÁMOZÁS: A számozott fejezetcímekbe (\\section{...}, \\subsection{...}) KIFEJEZETTEN TILOS manuálisan sorszámot írni (pl. TILOS: \\section{1. Mikor használjuk?}, helyette \\section{Mikor használjuk?} a helyes, mert a LaTeX automatikusan elé teszi a számot)!
- CSAK LaTeX kódot adj vissza, semmi más szöveget, magyarázatot`;

    let prompt = `Tantárgy: ${subjectName}\nDokumentum típusa: ${typeName}\nTémakör (és a dokumentum címe): ${topic}`;
    if (topic && topic.trim()) {
      prompt += `\nKÖTELEZŐ: A dokumentum címe \\title{${topic.trim()}} legyen!`;
    }
    if (docType === 'custom') {
      prompt += `\n\nKÖTELEZŐ EGYÉNI UTASÍTÁS SZERINTI FELÉPÍTÉS:
A dokumentum felépítését, szerkezetét, stílusát, fejezeteit és formátumát a felhasználó egyéni utasítása határozza meg!
Kövesd maximális pontossággal és hiánytalanul az alábbi egyéni elvárásokat:
"${(customPrompt || topic || '').trim()}"`;
    }
    if (docType === 'microlearning') {
      prompt += `\n\nKÖTELEZŐ MIKROTANANYAG (MICROLEARNING) METODIKA ÉS FELÉPÍTÉS:
1. Aprózás (Microlearning):
- Oszd fel az elméleti anyagot a lehető legkisebb, logikus, könnyen emészthető egységekre (mikroleckékre/alszakaszokra)!
- Egyszerre KIZÁRÓLAG egy-egy új fogalmat, szabályt, definíciót vagy képletet mutass be (pl. \\begin{definiciodoboz}[...] vagy \\begin{teteldoboz}[...] dobozban). Ne halmozz össze egyszerre több új fogalmat!

2. Azonnali visszacsatolás (Elmélet -> Gyakorlat ritmus):
- Minden egyes rövid elméleti egység után KÖZVETLENÜL illessz be egy megértést ellenőrző feladatblokkot (\\begin{feladatdoboz}[...] vagy \\begin{problem})!
- SZIGORÚAN TILOS az elméletet egybehagyni és a feladatokat a dokumentum végére tenni!
- A struktúra kötelezően mindig ez a váltakozó ritmus legyen:
  Elmélet 1 -> Feladat 1 -> Megoldás 1 -> Elmélet 2 -> Feladat 2 -> Megoldás 2 -> Elmélet 3 -> Feladat 3 -> Megoldás 3...
- Minden feladat után közvetlenül adj világos megoldást és indoklást (pl. \\begin{megoldasdoboz}[...] környezetben)!

3. Változatos feladattípusok:
A tesztkérdések módja legyen minél változatosabb, vegyesen alkalmazva az alábbiakat:
- Feleletválasztós (A/B/C/D) kérdések: 4 jól megkülönböztethető opcióval (\\begin{enumerate}[label=(\\Alph*)]).
- Igaz / Hamis állítások: konkrét állítások megadása, ahol el kell dönteni az igazságértéket és indokolni kell.
- Konkrét számértéket, képletet vagy rövid fogalmat bekérő kérdések.
- Többlépcsős feladatvezetés: Ha a feladat összetettebb és számolást igényel, NE egyben kérd a végeredményt! Bontsd fel a problémát részszámításokra (a), b), c) alkérdések), és több egymásra épülő lépésen keresztül vezesd végig a tanulót a megoldásig!

4. Formai és ábrázolási követelmények:
- SZIGORÚAN TILOS A DUPLA SZÁMOZÁS: Számozott listákban (\\begin{enumerate}) az \\item után SOHA NE írj ki kézzel sorszámot vagy betűt (pl. \\item a) vagy \\item 1. Feladat), mert a lista automatikusan számoz!
- Használj esztétikus, tiszta TikZ ábrákat a fogalmakhoz és feladatokhoz!
- FONTOS SZABÁLY: Gráfos ábráknál és moduloknál, amennyiben a feladat vagy lecke szövegében nem hivatkozunk kifejezetten a csúcsok betűjeleire (A, B, C...), a csúcsokat csak pontként (pöttyként) kell kirajzolni betűk és zavaró fokszám-feliratok nélkül!`;
    }
    if (hasCustomPreamble) {
      prompt += `\n\nA dokumentumhoz használt SAJÁT PREAMBULUM:\n\`\`\`latex\n${customPreamble.trim()}\n\`\`\`\n\nÜgyelj arra, hogy a dokumentum megjelenítéséhez szükséges összes csomag és környezet rendelkezésre álljon a preambulumban!`;
    }
    if (customPrompt) prompt += `\nKülön instrukció: ${customPrompt}`;
    if (fileContext) prompt += `\n\nForrásanyag:\n${fileContext}`;

    let latex = await callAi(prompt, provider, imageParts, sysPrompt, model, req, { thinkingLevel: req.body?.thinkingLevel || 'low', timeoutMs: 60000 });
    const m = latex.match(/```(?:latex|tex)?\n?([\s\S]*?)```/);
    if (m) latex = m[1];

    let finalLatex = latex.trim();
    if (hasCustomPreamble) {
      finalLatex = supplementFullLatex(finalLatex, customPreamble, topic);
    } else {
      finalLatex = supplementFullLatex(finalLatex, null, topic);
    }

    finalLatex = sanitizeLatexNumbering(finalLatex);

    res.json({ success: true, latex: finalLatex.trim(), topic: topic?.trim() });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/ai/rewrite
router.post('/rewrite', async (req, res) => {
  try {
    const { content, instruction, provider, model, isSnippet, isFigure: reqIsFigure } = req.body;
    const isFullDoc = content.includes('\\documentclass') && !isSnippet;
    const isFigure = Boolean(reqIsFigure || content.includes('\\begin{tikzpicture}'));

    let sysPrompt;
    if (isFullDoc) {
      sysPrompt = SYSTEM;
    } else if (isFigure) {
      sysPrompt = `Te egy mesterszintű LaTeX TikZ és vektorgrafikai szakértő vagy MAGYAR NYELVEN.
A feladatod a megadott TikZ ábra (tikzpicture) professzionális átdolgozása, szépítése, átméretezése vagy elemeinek módosítása a felhasználói utasítás szerint.

FONTOS SZABÁLYOK:
- Kizárólag érvényes, azonnal fordítható TikZ kódot adj vissza (minden \\node, \\draw, \\path utasítás pontosan pontosvesszővel ';' végződjön)!
- Tartsd meg a környezetet (\\begin{tikzpicture}[...] ... \\end{tikzpicture}) és az esetleges közvetlen \\begin{center} ... \\end{center} burkolót!
- NE tegyél köré \\documentclass vagy \\begin{document} környezetet!
- CSAK ÉS KIZÁRÓLAG a módosított TikZ ábra kódrészletet add vissza, ami közvetlenül beilleszthető a meglévő kód helyére!
- SZIGORÚ FELHASZNÁLÓI SZABÁLYOK:
  1. A tűzgömböt és a tűz részecskék fizikáját, illetve emisszióját Tilos átírni!
  2. A gráfos ábráknál, amennyiben a feladat vagy lecke szövegében nem hivatkozunk kifejezetten a csúcsok betűjeleire (A, B, C...), a csúcsokat csak pontként (pöttyként) kell kirajzolni betűk és zavaró fokszám-feliratok nélkül!
- CSAK a tiszta LaTeX/TikZ kódot add vissza, semmilyen magyarázó vagy bevezető szöveg nélkül!`;
    } else {
      sysPrompt = `Te egy professzionális LaTeX asszisztens vagy MAGYAR NYELVEN.
A feladatod egy meglévő LaTeX kódrészlet átdolgozása, kiegészítése vagy formázása a megadott utasítás szerint.
FONTOS SZABÁLYOK:
- CSAK ÉS KIZÁRÓLAG a módosított kódrészletet add vissza, ami közvetlenül beilleszthető a meglévő kód helyére!
- NE tegyél köré \\documentclass vagy \\begin{document} környezetet!
- CSAK tiszta LaTeX kódot add vissza, semmilyen magyarázat, bevezető vagy lezáró szöveg nélkül.`;
    }
    const prompt = `Kódrészlet:\n\`\`\`latex\n${content}\n\`\`\`\n\nUtasítás: ${instruction}\n\nCsak a módosított kódrészletet add vissza.`;

    let latex = await callAi(prompt, provider, [], sysPrompt, model, req, { thinkingLevel: 'low', timeoutMs: 30000 });
    const m = latex.match(/```(?:latex|tex)?\n?([\s\S]*?)```/);
    if (m) latex = m[1];
    res.json({ success: true, latex: sanitizeLatexNumbering(latex.trim()) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/ai/insert
router.post('/insert', async (req, res) => {
  try {
    const { contextSnippet = '', instruction, position = 'after', provider, model, subject = 'matematika' } = req.body;
    if (!instruction) {
      return res.status(400).json({ error: 'Hiányzó utasítás a tartalom generálásához.' });
    }

    const insertSysPrompt = `Te egy mesterszintű LaTeX tananyag- és tartalomkészítő asszisztens vagy MAGYAR NYELVEN (${subject === 'fizika' ? 'Fizika' : 'Matematika'} tantárgyhoz).
A feladatod egy ÚJ LaTeX kódrészlet generálása és beszúrása a dokumentum megadott pontjára a környező kontextus és a felhasználó utasítása alapján.

SZIGORÚ SZABÁLYOK:
1. CSAK ÉS KIZÁRÓLAG a beszúrandó új LaTeX kódrészletet add vissza, ami közvetlenül beilleszthető a forráskódba!
2. NE tegyél köré \\documentclass vagy \\begin{document} / \\end{document} környezetet!
3. Illeszkedjen tökéletesen a dokumentum stílusához, környezetéhez, változóihoz és jelölésrendszeréhez!
4. Feladatok és mikrotananyag elemek esetén:
   - Használj elegáns tcolorbox vagy feladatdoboz / megoldasdoboz / tippdoboz környezeteket, ha illeszkedik.
   - Feleletválasztós tesztnél használj jól olvasható A), B), C), D) opciókat.
   - Igaz/Hamis tesztkérdésnél vagy rövid számszerű válasszal ellenőrzött feladatnál legyen egyértelmű útmutatás.
   - Többlépcsős feladatvezetésnél bontsd fel a problémát logikus részkérdésekre (a/b/c).
5. Gráfos ábráknál (TikZ): Amennyiben a feladat vagy szöveg nem hivatkozik kifejezetten a csúcsok betűjeleire (A, B, C...), a csúcsokat csak pontként (pöttyként) rajzold meg betűk és zavaró fokszám-feliratok nélkül!
6. Tűzgömböt és tűz részecskék fizikáját tilos átírni!
7. CSAK tiszta LaTeX kódot adj vissza, semmilyen kísérő magyarázó vagy bevezető szöveg nélkül!`;

    const prompt = `Környező dokumentum kontextus (a beszúrás helyénél):
\`\`\`latex
${contextSnippet.slice(0, 2500)}
\`\`\`

Utasítás: ${instruction}
Elhelyezés: ${position === 'before' ? 'A fenti kódrészlet ELÉ kell beszúrni' : 'A fenti kódrészlet UTÁN (alá) kell beszúrni'}

Generáld le a közvetlenül beilleszthető új LaTeX kódrészletet!`;

    let latex = await callAi(prompt, provider, [], insertSysPrompt, model, req, { thinkingLevel: 'low', timeoutMs: 30000 });
    const m = latex.match(/```(?:latex|tex)?\n?([\s\S]*?)```/);
    if (m) latex = m[1];
    res.json({ success: true, latex: latex.trim() });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/ai/tikz - Szöveges leírásból és képekből (Image-to-TikZ) professzionális TikZ ábra generálása
router.post('/tikz', upload.array('files', 5), async (req, res) => {
  try {
    const { description = '', subject = 'Matematika', provider, model, images = [] } = req.body;

    const imageParts = [];

    // 1. Multipart feltöltött fájlok
    for (const file of (req.files || [])) {
      try {
        const ex = await extractFile(file.path, file.mimetype, file.originalname);
        if (ex.type === 'image') {
          imageParts.push({ inlineData: { data: ex.data, mimeType: ex.mimeType } });
        }
      } finally {
        await fs.remove(file.path).catch(() => {});
      }
    }

    // 2. JSON-ben küldött képek (base64 / dataUrl / vágólap)
    let parsedImages = images;
    if (typeof parsedImages === 'string') {
      try { parsedImages = JSON.parse(parsedImages); } catch (e) { parsedImages = []; }
    }
    if (Array.isArray(parsedImages)) {
      for (const img of parsedImages) {
        let base64Data = img.data || img.dataUrl || (typeof img === 'string' ? img : '');
        let mimeType = img.mimeType || 'image/png';
        if (base64Data.startsWith('data:')) {
          const match = base64Data.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            mimeType = match[1];
            base64Data = match[2];
          }
        }
        if (base64Data) {
          imageParts.push({
            inlineData: {
              data: base64Data,
              mimeType
            }
          });
        }
      }
    }

    const hasImages = imageParts.length > 0;
    const effectiveSubject = (subject === 'fizika' || subject === 'Fizika') ? 'Fizika' : 'Matematika';

    const sys = `Te egy professzionális LaTeX és TikZ/PGF ábrakészítő szakértő vagy MAGYAR NYELVEN.
Tantárgy: ${effectiveSubject}

${hasImages ? `A felhasználó egy vagy több képet csatolt (vázlat, füzetrajz, tankönyvi ábra, geometriai ábra, grafikon, fizikai kísérlet).
A FELADATOD: Végezz rendkívül pontos vizuális elemzést (Image-to-TikZ rekonstrukció), és készíts belőle tökéletes, éles, professzionális és azonnal fordítható TikZ vektoros ábrát!
- Alakzatok, arányok, szögek, szakaszok, ívek, jelölések hű leképezése
- Értelmes feliratok, betűzések, méretvonalak, szögívek, derékszög-jelölések elhelyezése
- Elegáns stílus, modern színek (pl. blue!75!black, teal!80!black, orange!80!black, lágy kitöltések pl. blue!10)
- Ha a felhasználó szöveges leírást vagy módosítási kérést is megadott, azt vedd figyelembe a kép rekonstruálásakor!` : 'Generálj precíz, professzionális TikZ ábrakódot a megadott leírás alapján.'}

SZABÁLYOK:
1. Csak a tikzpicture környezetet add vissza (\\begin{tikzpicture}...\\end{tikzpicture}), semmi mást!
2. Ha szükségesek extra TikZ könyvtárak (pl. arrows.meta, angles, quotes, calc, positioning, decorations.pathmorphing, patterns, babel), a kód legelső soraiként tüntesd fel őket kommentben: % \\usetikzlibrary{...}.
3. Használj modern TikZ szintaxist (pl. arrows.meta csomagot, [-{Stealth[length=2.5mm]}] a nyilakhoz).
4. Áttekinthető, jól kommentelt, könnyen karbantartható kód koordinátákkal vagy csomópontokkal (node).
5. Kifejezetten a felhasználói szabály szerint: Gráfos ábráknál, amennyiben a feladat vagy leírás szövegében nem hivatkozunk kifejezetten a csúcsok betűjeleire (A, B, C...), a csúcsokat csak pontként (pöttyként) rajzold ki betűk és zavaró fokszám-feliratok nélkül!
6. Ne tegyél köré felesleges magyarázó szöveget, CSAK a tiszta TikZ kódot (markdown \`\`\` blokk megengedett).`;

    let prompt = '';
    if (description && description.trim()) {
      prompt += `Felhasználói leírás / instrukció:\n${description.trim()}\n\n`;
    }
    if (hasImages) {
      prompt += `Kérlek, alakítsd át a csatolt képet professzionális, tiszta TikZ vektoros kóddá a(z) ${effectiveSubject} követelményeknek megfelelően!`;
    }
    if (!prompt.trim()) {
      prompt = `Készíts professzionális TikZ ábrát a csatolt kép alapján (${effectiveSubject})!`;
    }

    let tikz = await callAi(prompt, provider, imageParts, sys, model, req, { thinkingLevel: 'low', timeoutMs: 40000 });
    const m = tikz.match(/```(?:latex|tex|tikz)?\n?([\s\S]*?)```/);
    if (m) tikz = m[1];
    tikz = tikz.trim();

    // Azonnali standalone TikZ fordítás a mini-előnézethez
    let compiled = null;
    try {
      compiled = await compileStandaloneTikz(tikz);
    } catch (compileErr) {
      console.warn('[AI TikZ Preview Compile Warning]:', compileErr.message);
    }

    res.json({
      success: true,
      tikz,
      pdf: compiled?.success ? compiled.pdf : null,
      compileError: compiled && !compiled.success ? (compiled.log || compiled.error) : null,
      standaloneTex: compiled?.standaloneTex || null
    });
  } catch (err) {
    console.error('[AI TikZ Error]:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/ai/tikz-compile - Kifejezetten a TikZ mini-előnézet azonnali újrafordításához
router.post('/tikz-compile', async (req, res) => {
  try {
    const { tikzCode } = req.body;
    if (!tikzCode || !tikzCode.trim()) {
      return res.status(400).json({ error: 'Hiányzó TikZ kód' });
    }
    const compiled = await compileStandaloneTikz(tikzCode);
    res.json({
      success: compiled.success,
      pdf: compiled.success ? compiled.pdf : null,
      compileError: compiled.success ? null : (compiled.log || compiled.error),
      standaloneTex: compiled.standaloneTex,
      rawTikz: compiled.rawTikz
    });
  } catch (err) {
    console.error('[AI TikZ Compile Error]:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/ai/tikz-refine - TikZ ábra intelligens finomhangolása és azonnali újrafordítása
router.post('/tikz-refine', async (req, res) => {
  try {
    const { tikzCode, instruction, subject = 'Matematika', provider, model } = req.body;
    if (!tikzCode || !instruction || !instruction.trim()) {
      return res.status(400).json({ error: 'Hiányzó TikZ kód vagy finomítási instrukció' });
    }
    const effectiveSubject = (subject === 'fizika' || subject === 'Fizika') ? 'Fizika' : 'Matematika';
    const refineSys = `Te egy professzionális LaTeX és TikZ ábraszerkesztő szakértő vagy MAGYAR NYELVEN.
Tantárgy: ${effectiveSubject}
A feladatod a megadott TikZ ábra módosítása a kért finomítási instrukció alapján.

SZABÁLYOK:
1. Csak a módosított tikzpicture környezetet add vissza (\\begin{tikzpicture}...\\end{tikzpicture}), semmi más kísérőszöveget!
2. Őrizd meg az eredeti ábra jó részeit, de hajtsd végre pontosan a kért változtatást!
3. Ügyelj a szintaxisra, minden utasítás pontosvesszővel (;) végződjön!
4. Gráfos ábráknál, ha nincsenek nevesítve a csúcsok, pöttyként rajzold ki őket betűk nélkül!`;

    const prompt = `EREDETI TIKZ KÓD:\n\`\`\`latex\n${tikzCode}\n\`\`\`\n\nMÓDOSÍTÁSI KÉRÉS:\n${instruction.trim()}`;
    let refinedTikz = await callAi(prompt, provider, [], refineSys, model, req, { thinkingLevel: 'low', timeoutMs: 35000 });
    const m = refinedTikz.match(/```(?:latex|tex|tikz)?\n?([\s\S]*?)```/);
    if (m) refinedTikz = m[1];
    refinedTikz = refinedTikz.trim();

    const compiled = await compileStandaloneTikz(refinedTikz);
    res.json({
      success: true,
      tikz: refinedTikz,
      pdf: compiled.success ? compiled.pdf : null,
      compileError: compiled.success ? null : (compiled.log || compiled.error),
      standaloneTex: compiled.standaloneTex
    });
  } catch (err) {
    console.error('[AI TikZ Refine Error]:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/ai/problems - továbbfejlesztett didaktikai feladatgeneráló
router.post('/problems', upload.array('files', 3), async (req, res) => {
  try {
    const {
      topic,
      subject = 'Matematika',
      count = 6,
      sourceMode = 'custom',
      contextContent = '',
      selectedSnippet = '',
      difficultyStructure = 'pyramid',
      problemTypes = 'standard,multiple_choice,applied',
      outputTarget = 'new_doc',
      withTheorySummary = 'false',
      withSolutions = 'true',
      solutionPlacement = 'separate_page',
      withRubric = 'true',
      withGroupsAB = 'false',
      customPrompt = '',
      provider,
      model,
      customPreamble
    } = req.body;

    let fileContext = '';
    for (const file of (req.files || [])) {
      try {
        const ex = await extractFile(file.path, file.mimetype, file.originalname);
        if (ex.type === 'text') fileContext += `\n\n--- ${file.originalname} ---\n${ex.content}`;
      } finally {
        await fs.remove(file.path).catch(() => {});
      }
    }

    const effectiveSubject = subject === 'fizika' || subject === 'Fizika' ? 'Fizika' : 'Matematika';
    const effectiveTopic = (topic && topic.trim())
      ? topic.trim()
      : (sourceMode === 'current' ? 'Gyakorló feladatsor' : 'Általános feladatsor');

    // 1. Nehézségi struktúra szöveges definíciója (K1, K2, K3 modell)
    let diffInstruction = '';
    if (difficultyStructure === 'pyramid') {
      diffInstruction = `NEHÉZSÉGI FELÉPÍTÉS (Fokozatosan nehezedő piramis modell: K1 → K2 → K3):
A feladatsor didaktikailag szigorúan a K1, K2, K3 nehézségi szintek szerint épüljön fel fokozatosan:
- 1. Szint: K1 (Alapszint / Könnyű): Alapfogalmak közvetlen felismerése, egyszerű alapvető képletbehelyettesítés, egyértelmű számolások.
- 2. Szint: K2 (Közepes szint / Gyakorló): Tipikus középszintű érettségi jellegű feladatok, 2-3 lépéses levezetések, életszerű szöveges feladatok.
- 3. Szint: K3 (Nehezebb / Összetett feladat): Mélyebb gondolkodtató, esetszétválasztást vagy kombinált összefüggéseket igénylő feladat.
  FONTOS: A K3 feladat NEM emelt szintű érettségi tananyag vagy követelmény! A középszintű témakör nehezebb, gondolkodtatóbb feladata legyen, NEM emelt érettségi szint!
${Number(count) >= 6 ? '- Ha a feladatok száma eléri vagy meghaladja a 6-ot, az utolsó feladat lehet egy különösen érdekes K3 szintű gondolkodtató feladvány.' : ''}

KÖTELEZŐ SZINTJELÖLÉS ÉS SZÁMOZÁSI SZABÁLY:
A feladatokhoz számozott listát használj: \\begin{enumerate}[label=\\arabic*., leftmargin=*]
SZIGORÚAN TILOS A DUPLA SZÁMOZÁS!
Mivel az enumerate környezet automatikusan kirakja a sorszámot (1., 2., 3...), az \\item mögé KIFEJEZETTEN TILOS még egyszer kiírni a számot!
TILOS forma: \\item \\textbf{1. Feladat} (mert ez a PDF-ben hibás "1. 1. Feladat"-ként jelenne meg)!
KÖTELEZŐ HELYES FORMA:
\\item \\textbf{Feladat} \\textsf{\\small [K1 – Alap]} \\\\
vagy
\\item \\textbf{Feladat} \\textsf{\\small [K2 – Közepes]} \\\\
vagy
\\item \\textbf{Feladat} \\textsf{\\small [K3 – Nehezebb]} \\\\
(SZIGORÚAN TILOS a 3. szintet „Emelt szint”-nek vagy „Emelt érettségi”-nek jelölni, mert a K3 szint a középszintű témakör nehezebb, összetett feladata, nem emelt érettségi!)`;
    } else {
      const diffLevels = {
        k1: 'K1 – alapszintű (könnyű, alapfogalmi / drill feladatok)',
        easy: 'K1 – alapszintű (könnyű, alapfogalmi / drill feladatok)',
        k2: 'K2 – közepes szintű (tipikus középszintű érettségi jellegű feladatok)',
        medium: 'K2 – közepes szintű (tipikus középszintű érettségi jellegű feladatok)',
        k3: 'K3 – nehezebb, összetett feladatok (gondolkodtató, esetszétválasztásos feladatok – FONTOS: NEM emelt érettségi tananyag, hanem a középszintű témakör nehezebb feladatai!)',
        hard: 'K3 – nehezebb, összetett feladatok (gondolkodtató, esetszétválasztásos feladatok – FONTOS: NEM emelt érettségi tananyag, hanem a középszintű témakör nehezebb feladatai!)',
        emelt: 'valódi emelt szintű érettségi nehézségű feladatok',
        advanced: 'valódi emelt szintű érettségi nehézségű feladatok',
        competition: 'verseny / olimpiai szintű, mély kreativitást igénylő feladatok'
      };
      const desc = diffLevels[difficultyStructure] || 'K2 – közepes szintű';
      const labelTag = (difficultyStructure === 'k1' || difficultyStructure === 'easy') ? 'K1 – Alap'
        : (difficultyStructure === 'k2' || difficultyStructure === 'medium') ? 'K2 – Közepes'
        : (difficultyStructure === 'k3' || difficultyStructure === 'hard') ? 'K3 – Nehezebb'
        : (difficultyStructure === 'emelt' || difficultyStructure === 'advanced') ? 'Emelt szint'
        : 'Versenyfeladat';
      diffInstruction = `NEHÉZSÉG: Minden feladat egységesen ${desc} legyen.
SZIGORÚAN TILOS A DUPLA SZÁMOZÁS: A feladatsorhoz használj \\begin{enumerate}[label=\\arabic*., leftmargin=*] környezetet!
Minden feladat fejléce az \\item mögött: \\item \\textbf{Feladat} \\textsf{\\small [${labelTag}]} \\\\
(TILOS a "\\item \\textbf{1. Feladat}" forma, mert az a PDF-ben hibás dupla számozást ("1. 1. Feladat") okoz!)
${(difficultyStructure === 'k3' || difficultyStructure === 'hard') ? '(FONTOS: A K3 feladat NEM emelt szintű érettségi, szigorúan a középszintű tananyag nehezebb, gondolkodtató feladata!)' : ''}`;
    }

    // 2. Feladattípusok instrukciója
    const parsedTypes = Array.isArray(problemTypes) ? problemTypes : String(problemTypes).split(',').map(s => s.trim());
    const typeInstructions = [];
    if (parsedTypes.includes('standard')) typeInstructions.push('- Klasszikus számolásos és levezetős feladatok lépésről lépésre (a, b, c alpontokkal)');
    if (parsedTypes.includes('multiple_choice')) typeInstructions.push('- Legalább 1 db feleletválasztós (A/B/C/D) tesztkérdés, ahol a téves opciók tipikus tanulói hibákra (distraktorokra) épülnek');
    if (parsedTypes.includes('error_finding')) typeInstructions.push('- 1 db "Keresd meg a hibát a levezetésben!" feladat, amely egy látszólag helyes, de rejtett matematikai/fizikai hibát tartalmazó megoldást mutat be, és a diáknak meg kell találnia és ki kell javítania a hibát');
    if (parsedTypes.includes('true_false')) typeInstructions.push('- Igaz / Hamis állítások indoklással vagy ellenpéldával (a fogalmi megértés tesztelésére)');
    if (parsedTypes.includes('applied')) typeInstructions.push('- Hétköznapi, életszerű vagy fizikai méréshez/gyakorlathoz kapcsolódó szöveges feladat');

    // 3. Forrás és kontextus
    let contextInstruction = '';
    if (contextContent && contextContent.trim()) {
      contextInstruction = `FORRÁSDOKUMENTUM(OK) ÉS ELMÉLETI HÁTTÉR:
${topic && topic.trim() ? `KIEMELT TÉMAKÖR / FÓKUSZ: ${topic.trim()}\n` : ''}
A feladatokat közvetlenül az alábbi forrásanyag(ok) elméleti hátterére, definícióira, típusfeladataira és képleteire építsd:
${selectedSnippet ? `KIFEJEZETTEN AZ ALÁBBI KIJELÖLT RÉSZLETRE KONCENTRÁLJ:\n"""\n${selectedSnippet}\n"""\n\nA forrásanyag részletei:` : ''}
"""\n${contextContent.slice(0, 32000)}\n"""`;
    } else {
      contextInstruction = `TÉMAKÖR: ${effectiveTopic}`;
    }

    // 4. Elméleti összefoglaló a feladatok előtt
    let theoryInstruction = '';
    const hasTheory = withTheorySummary === 'true' || withTheorySummary === true;
    if (hasTheory) {
      theoryInstruction = `RÖVID ELMÉLETI ÖSSZEFOGLALÓ A FELADATOK ELŐTT:
A feladatok előtt hozz létre egy tömör, szemléletes, áttekinthető elméleti összefoglaló blokkot (pl. \\section*{Elméleti áttekintés és fontos képletek} vagy elegáns tcolorbox dobozban)!
Tartalmazza:
- A témakör legfontosabb definícióit és fogalmait
- A feladatok megoldásához szükséges alapvető matematikai/fizikai képleteket, azonosságokat, mértékegységeket egyenletkörnyezetben
- Rövid megjegyzéseket a tipikus buktatókra / kikötésekre (pl. értelmezési tartomány, feltételek)
Ez a rész legyen tömör, lényegretörő (kb. fél-egy oldal), hogy a diák áttekinthesse a tudnivalókat a feladatok megkezdése előtt!
Ezután következzen a feladatok szakasza: \\section*{Gyakorló feladatok}.`;
    }

    // 5. Megoldókulcs és pontozás (felhasználói elhelyezési opciók: separate_page | inline | separate_doc)
    let solutionInstruction = '';
    const hasSolutions = withSolutions === 'true' || withSolutions === true;
    const hasRubric = withRubric === 'true' || withRubric === true;

    if (hasSolutions) {
      if (solutionPlacement === 'inline') {
        solutionInstruction = `MEGOLDÓKULCS ÉS ELHELYEZÉS (KÖZVETLENÜL MINDEN FELADAT UTÁN):
Minden egyes feladatnál a felépítés KÖTELEZŐEN a következő legyen:
1. Először írd ki a feladat sorszámát és a FELADAT TELJES SZÖVEGÉT (minden adattal, kitűzéssel, kérdéssel).
2. Közvetlenül utána helyezd el a részletes lépésről-lépésre kidolgozást és magyarázatot egy elegáns dobozban (tanári/megoldott példatár stílus):
\\begin{tcolorbox}[title=Megoldás és levezetés, colback=blue!3!white, colframe=blue!65!black]
... részletes levezetés lépésről lépésre, indoklással, képletekkel és kiemelt végeredménnyel ...
${hasRubric ? '\\tcblower\n\\textbf{Pontozási útmutató:} Képlet felírása és behelyettesítés: 1p; Számolási lépések: 2p; Ellenőrzés és szöveges válasz: 1p. Összesen: 4 pont' : ''}
\\end{tcolorbox}
FONTOS: NE a dokumentum végére tedd a megoldásokat, hanem minden egyes feladat szövege alá KÖZVETLENÜL!`;
      } else if (solutionPlacement === 'separate_doc') {
        solutionInstruction = `MEGOLDÓKULCS ÉS ELHELYEZÉS (KÉT KÜLÖNÁLLÓ DOKUMENTUMKÉNT):
A feladatsort és a megoldókulcsot KÉT KÜLÖNÁLLÓ DOKUMENTUMKÉNT kell elkészíteni!
1. A feladatsor (az első szakasz) SEMMILYEN megoldást vagy választ NEM TARTALMAZHAT! Kizárólag a feladatok (és az elméleti összefoglaló ha kérték) szerepeljenek benne.
2. A feladatsor befejezése után kötelezően szúrj be pontosan egy ilyen elválasztó sort:
=== SEPARATE_SOLUTIONS_DOCUMENT ===
3. Az elválasztó sor UTÁN generáld le a TELJES, ÖNÁLLÓ MEGOLDÓKULCS DOKUMENTUMOT (\\title{${effectiveTopic} - Megoldókulcs és kidolgozások}, saját dokumentum-struktúrával).

SZIGORÚ KÖVETELMÉNY A MEGOLDÓKULCS DOKUMENTUMBAN:
Minden egyes feladatnál a megoldókulcsban KÖTELEZŐ ELŐSZÖR A FELADAT TELJES SZÖVEGÉT (minden adatot, kitűzést, kérdést szó szerint) újra megjeleníteni, és KÖZVETLENÜL UTÁNA a részletes, lépésről-lépésre levezetett kidolgozást! Így a megoldókulcs a feladatlap nélkül, önállóan is tökéletesen használható.
Formátum minden feladathoz az önálló megoldókulcs dokumentumban:
\\subsection*{X. feladat}
\\noindent\\textbf{A feladat szövege:} \\textit{<Itt szerepeljen a feladat teljes, hiánytalan kitűzése, adatai és kérdései>}\\par\\medskip
\\noindent\\textbf{Részletes kidolgozás és levezetés:}
<Részletes lépésről-lépésre kidolgozás, indoklások, egyenletek, ellenőrzés>\\par\\smallskip
\\noindent\\textbf{Végeredmény:} <Kiemelt végeredmény és szöveges válasz>
${hasRubric ? '\n\\smallskip\n\\noindent\\textbf{Pontozási útmutató:} <Tételes pontbontás a magyar érettségi javítási útmutatók mintájára: pl. Képlet felírása és behelyettesítés: 1 pont; Számolási lépések: 2 pont; Ellenőrzés és szöveges válasz: 1 pont. Összesen: 4 pont>' : ''}`;
      } else {
        // 'separate_page' (alapértelmezett)
        solutionInstruction = `MEGOLDÓKULCS ÉS ELHELYEZÉS (A FELADATSOR UTÁN KÜLÖN OLDALRA):
A teljes feladatsor (összes feladat) után tegyél be egy kötelező lapdobást:
\\newpage
\\section*{Részletes megoldókulcs és kidolgozások}

SZIGORÚ KÖVETELMÉNY A MEGOLDÓKULCSHOZ:
Minden egyes feladatnál a megoldókulcsban KÖTELEZŐ ELŐSZÖR A FELADAT TELJES SZÖVEGÉT (minden adatot, kitűzést, kérdést szó szerint) megjeleníteni, és KÖZVETLENÜL UTÁNA a részletes, lépésről-lépésre levezetett kidolgozást! Így a megoldókulcs a feladatsor nélkül, önmagában is tökéletesen olvasható és használható.
Formátum minden feladathoz a megoldókulcsban:
\\subsection*{X. feladat}
\\noindent\\textbf{A feladat szövege:} \\textit{<Itt szerepeljen a feladat teljes, hiánytalan kitűzése, adatai és kérdései>}\\par\\medskip
\\noindent\\textbf{Részletes kidolgozás és levezetés:}
<Részletes lépésről-lépésre kidolgozás, indoklások, egyenletek, ellenőrzés>\\par\\smallskip
\\noindent\\textbf{Végeredmény:} <Kiemelt végeredmény és szöveges válasz>
${hasRubric ? '\n\\smallskip\n\\noindent\\textbf{Pontozási útmutató:} <Tételes pontbontás a magyar érettségi javítási útmutatók mintájára: pl. Képlet felírása és behelyettesítés: 1 pont; Számolási lépések: 2 pont; Ellenőrzés és szöveges válasz: 1 pont. Összesen: 4 pont>' : ''}`;
      }
    }

    // 6. "A" és "B" csoport
    let groupsInstruction = '';
    if (withGroupsAB === 'true' || withGroupsAB === true) {
      groupsInstruction = `CSOPORTOK: Készíts "A" csoport és "B" csoport változatot azonos feladatszerkezettel és nehézséggel, de eltérő numerikus adatokkal!`;
    }

    // 7. Kimenet célja
    let outputInstruction = '';
    const isAppendMode = outputTarget === 'append';
    if (isAppendMode) {
      if (solutionPlacement === 'separate_doc') {
        outputInstruction = `KIMENETI FORMÁTUM (HOZZÁFŰZÉSI MÓD + KÜLÖN MEGOLDÓKULCS):
A feladatlapot úgy generáld, hogy közvetlenül a felhasználó meglévő dokumentumának végére illeszthető legyen:
\\newpage
${hasTheory ? '\\section*{Elméleti összefoglaló és képletek}\n... a legfontosabb képletek és definíciók ...\n\\section*{Gyakorló feladatsor: ' + effectiveTopic + '}' : '\\section*{Gyakorló feladatsor: ' + effectiveTopic + '}'}
... a feladatok számozva megoldások NÉLKÜL ...
Ezután tedd be pontosan az elválasztó sort:
=== SEPARATE_SOLUTIONS_DOCUMENT ===
Az elválasztó utáni MEGOLDÓKULCS viszont legyen egy TELJES, ÖNÁLLÓAN FORDÍTHATÓ LaTeX dokumentum (\\documentclass, \\begin{document}, cím, preambulum, levezetések)!`;
      } else {
        outputInstruction = `KIMENETI FORMÁTUM (HOZZÁFŰZÉSI MÓD):
FONTOS: NE generálj \\documentclass-t, ne legyen \\usepackage, és NE legyen \\begin{document} vagy \\end{document}!
Kizárólag a meglévő dokumentum végére közvetlenül beilleszthető szakaszt generáld:
\\newpage
${hasTheory ? '\\section*{Elméleti összefoglaló és képletek}\n... a legfontosabb képletek és definíciók ...\n\\section*{Gyakorló feladatsor: ' + effectiveTopic + '}' : '\\section*{Gyakorló feladatsor: ' + effectiveTopic + '}'}
... a feladatok számozva ${solutionPlacement === 'inline' ? '(mindegyik alatt közvetlenül ott a tcolorbox megoldása)' : ''} ...
${hasSolutions && solutionPlacement === 'separate_page' ? '\\newpage\n\\section*{Részletes megoldókulcs és kidolgozások}\n... a feladatok teljes szövegeivel és utána a részletes levezetésekkel ...' : ''}`;
      }
    } else {
      outputInstruction = `KIMENETI FORMÁTUM (TELJES DOKUMENTUM):
Generálj teljes, önállóan fordítható LaTeX dokumentumot \\documentclass[12pt,a4paper]{article} beállítással, \\title{${effectiveTopic} - Gyakorló feladatsor}-ral, elegáns címoldallal vagy fejléccel és a szükséges csomagokkal (amsmath, amssymb, geometry, tcolorbox, babel magyar). ${hasTheory ? 'A feladatsor előtt tartalmazzon \\section*{Elméleti áttekintés és képletek} összefoglalót.' : ''}
${hasSolutions && solutionPlacement === 'separate_doc' ? 'A feladatlap befejezése után helyezd el az elválasztót (=== SEPARATE_SOLUTIONS_DOCUMENT ===), majd utána a teljes önálló megoldókulcs dokumentumot!' : ''}`;
    }

    const fullPrompt = `Te egy mester pedagógus és érettségi tételkészítő szakértő vagy. Készíts egy professzionális, ${count} darab feladatból álló feladatsort!
Tantárgy: ${effectiveSubject}

${contextInstruction}

${theoryInstruction}

${diffInstruction}

FELADATTÍPUSOK:
${typeInstructions.join('\n')}

${solutionInstruction}

${groupsInstruction}

${customPrompt && customPrompt.trim() ? `KÜLÖN EGYÉNI UTASÍTÁS A FELADATOKHOZ:\n${customPrompt.trim()}\n` : ''}

${fileContext ? `Csatolt fájlok tartalma:\n${fileContext}\n` : ''}

${outputInstruction}

SZABÁLYOK:
- Kizárólag érvényes, hibátlan LaTeX kódot adj vissza!
- SZIGORÚAN TILOS A DUPLA SZÁMOZÁS:
  * Számozott listákban (\\begin{enumerate}) az \\item mögé SOHA NE írj ki kézzel újra sorszámot vagy betűt, mert a lista számozója azt automatikusan kirakja!
  * Főfeladatoknál: a helyes fejléc \\item \\textbf{Feladat} \\textsf{\\small [K1 – Alap]} (SZIGORÚAN TILOS a "\\item \\textbf{1. Feladat}" forma, mert az a PDF-ben hibás "1. 1. Feladat"-ként jelenne meg duplán)!
  * Alkérdéseknél (\\begin{enumerate}[label=\\alph*)]): \\item <kérdés szövege> (TILOS a "\\item a)" vagy "\\item (a)" forma)!
  * Megoldókulcsban lista esetén: \\item \\textbf{Feladat megoldása} (TILOS a "\\item \\textbf{1. Feladat megoldása}" forma)!
- MEGOLDÓKULCS KÖVETELMÉNY: A megoldókulcsban (külön lapon, külön dokumentumban, vagy inline feladatok alatti elhelyezés esetén is) MINDEN EGYES FELADATNÁL KÖTELEZŐ szerepelnie ELŐSZÖR A FELADAT TELJES SZÖVEGÉNEK (minden adat, kitűzés és kérdés szó szerint), és KÖZVETLENÜL UTÁNA a részletes lépésről lépésre kidolgozásnak és levezetésnek! A megoldások önmagukban, a feladat szövege nélkül NEM állhatnak.
- Matematikai képletekhez használj tiszta egyenletkörnyezeteket (pl. align*, equation*, $...$).
- Magyar ékezetek és tipográfiai szabályok betartása kötelező.
- Gráfos ábráknál (TikZ), ha a feladat szövegében nem hivatkozol kifejezetten a csúcsok betűjeleire (A, B, C...), a csúcsokat csak pontként (pöttyként) rajzold ki, betűk és zavaró fokszám-feliratok nélkül!
- CSAK a LaTeX kódblokkot (vagy a megadott elválasztóval ellátott kódot) add vissza!`;

    let latex = await callAi(fullPrompt, provider, [], SYSTEM, model, req, { thinkingLevel: req.body?.thinkingLevel || 'medium', timeoutMs: 90000 });
    let finalLatex = latex.trim();
    let solutionsLatex = null;

    if (hasSolutions && solutionPlacement === 'separate_doc') {
      const sepRegex = /={3,}\s*SEPARATE_SOLUTIONS_DOCUMENT\s*={3,}/i;
      if (sepRegex.test(finalLatex)) {
        const parts = finalLatex.split(sepRegex);
        finalLatex = parts[0].trim();
        solutionsLatex = parts[1].trim();
      } else if (finalLatex.includes('\\section*{Részletes megoldókulcs') || finalLatex.includes('\\section*{Megoldókulcs')) {
        const splitIdx = finalLatex.indexOf('\\section*{Részletes megoldókulcs') !== -1
          ? finalLatex.indexOf('\\section*{Részletes megoldókulcs')
          : finalLatex.indexOf('\\section*{Megoldókulcs');
        solutionsLatex = finalLatex.slice(splitIdx).trim();
        finalLatex = finalLatex.slice(0, splitIdx).trim();
        finalLatex = finalLatex.replace(/\\newpage\s*$/, '').trim();
      }

      const m1 = finalLatex.match(/```(?:latex|tex)?\n?([\s\S]*?)```/);
      if (m1) finalLatex = m1[1].trim();
      else finalLatex = finalLatex.replace(/^```(?:latex|tex)?\n?/i, '').replace(/\n?```$/i, '').trim();

      if (solutionsLatex) {
        const m2 = solutionsLatex.match(/```(?:latex|tex)?\n?([\s\S]*?)```/);
        if (m2) solutionsLatex = m2[1].trim();
        else solutionsLatex = solutionsLatex.replace(/^```(?:latex|tex)?\n?/i, '').replace(/\n?```$/i, '').trim();

        solutionsLatex = supplementFullLatex(solutionsLatex, customPreamble, `${effectiveTopic} - Megoldókulcs`);
      }
    } else {
      const m = finalLatex.match(/```(?:latex|tex)?\n?([\s\S]*?)```/);
      if (m) finalLatex = m[1].trim();
      else finalLatex = finalLatex.replace(/^```(?:latex|tex)?\n?/i, '').replace(/\n?```$/i, '').trim();
    }

    if (isAppendMode) {
      // Ha append módban mégis generált volna \begin{document} burkolót, vágjuk le
      const docBegin = finalLatex.indexOf('\\begin{document}');
      if (docBegin !== -1) {
        finalLatex = finalLatex.slice(docBegin + '\\begin{document}'.length);
      }
      const docEnd = finalLatex.lastIndexOf('\\end{document}');
      if (docEnd !== -1) {
        finalLatex = finalLatex.slice(0, docEnd);
      }
      finalLatex = finalLatex.trim();
    } else {
      finalLatex = supplementFullLatex(finalLatex, customPreamble, effectiveTopic);
    }

    finalLatex = sanitizeLatexNumbering(finalLatex);
    if (solutionsLatex) {
      solutionsLatex = sanitizeLatexNumbering(solutionsLatex);
    }

    const safeTopicName = (effectiveTopic || 'Feladatsor')
      .replace(/[\/\\:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');

    res.json({
      success: true,
      latex: finalLatex,
      solutionsLatex: solutionsLatex || null,
      hasSeparateDoc: Boolean(solutionsLatex && solutionPlacement === 'separate_doc'),
      solutionsFilename: `${safeTopicName}_Megoldasok.tex`,
      topic: effectiveTopic,
      outputTarget,
      solutionPlacement,
      isAppend: isAppendMode,
      count: Number(count)
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/ai/exam - Professzionális dolgozat, témazáró és vizsgageneráló
router.post('/exam', upload.array('files', 5), async (req, res) => {
  try {
    const {
      topic,
      subject = 'Matematika',
      examType = 'temazaro', // 'ropdolgozat' | 'dolgozat' | 'temazaro' | 'erettsegi' | 'custom'
      taskCount = 5,
      schoolName = '',
      groupMode = 'ab', // 'none' | 'ab' | 'abc' | 'abcd'
      withGroupsAB = 'true', // legacy fallback
      layoutMode = 'compact', // 'compact' | 'worksheet'
      withEvaluationTable = 'true',
      withRubric = 'true',
      withGradingScale = 'true',
      solutionPlacement = 'separate_page', // 'separate_page' | 'separate_doc' | 'inline' | 'none'
      customPrompt = '',
      provider,
      model,
      customPreamble
    } = req.body;

    let fileContext = '';
    for (const file of (req.files || [])) {
      try {
        const ex = await extractFile(file.path, file.mimetype, file.originalname);
        if (ex.type === 'text') fileContext += `\n\n--- ${file.originalname} ---\n${ex.content}`;
      } finally {
        await fs.remove(file.path).catch(() => {});
      }
    }

    const effectiveSubject = subject === 'fizika' || subject === 'Fizika' ? 'Fizika' : 'Matematika';
    const effectiveTopic = (topic && topic.trim()) ? topic.trim() : 'Témazáró Dolgozat';
    
    // Csoportbontás meghatározása: 'none' | 'ab' | 'abc' | 'abcd'
    let effectiveGroupMode = 'ab';
    if (groupMode !== undefined && groupMode !== '') {
      effectiveGroupMode = groupMode;
    } else if (withGroupsAB !== undefined) {
      effectiveGroupMode = (withGroupsAB === 'true' || withGroupsAB === true) ? 'ab' : 'none';
    }

    const groupLabels = effectiveGroupMode === 'ab'
      ? ['A', 'B']
      : effectiveGroupMode === 'abc'
      ? ['A', 'B', 'C']
      : effectiveGroupMode === 'abcd'
      ? ['A', 'B', 'C', 'D']
      : [];

    const isGroups = groupLabels.length > 0;
    const isWorksheet = layoutMode === 'worksheet';
    const hasEvalTable = withEvaluationTable === 'true' || withEvaluationTable === true;
    const hasRubric = withRubric === 'true' || withRubric === true;
    const hasGradingScale = withGradingScale === 'true' || withGradingScale === true;
    const count = Number(taskCount) || 5;

    // Dolgozat típus specifikus instrukciók
    let examTypeInstruction = '';
    if (examType === 'ropdolgozat') {
      examTypeInstruction = `DOLGOZAT TÍPUSA: ⚡️ RÖPDOLGOZAT (10-15 perc)
- Cél: Az előző 1-2 tanóra anyagának vagy alapfogalmainak azonnali, villámgyors számonkérése.
- Felépítés: ${count} db feladat (1 db fogalom/definíció/képletellenőrzés, a többi 1-2 lépéses közvetlen számolási alapfeladat).
- Összpontszám: 15–20 pont.
- Papírtakarékos, kompakt tördelés.`;
    } else if (examType === 'dolgozat') {
      examTypeInstruction = `DOLGOZAT TÍPUSA: 📝 ÓRAI DOLGOZAT / TÉMAELLENŐRZŐ (25-30 perc)
- Cél: Egy kisebb tematikus tanulmányi egység tanórai felmérése és ellenőrzése.
- Felépítés: ${count} db feladat (alapfogalmak, begyakorló típusfeladatok és egy alkalmazás/szöveges feladat).
- Összpontszám: 25–35 pont.`;
    } else if (examType === 'erettsegi') {
      examTypeInstruction = `DOLGOZAT TÍPUSA: 🎓 ÉRETTSÉGI PRÓBAVIZSGA (90 perc)
- Cél: Középiskolai érettségi vizsgaszintű átfogó számonkérés.
- Felépítés: Két részből áll:
  * I. Rész: Rövid, egyszerűbb választ igénylő alapfeladatok (kb. 30 pont)
  * II. Rész: Összetett, több lépéses kidolgozós feladatok részpontozással (kb. 70 pont)
- Összpontszám: 100 pont, a hivatalos érettségi pontozási struktúra mintájára.`;
    } else {
      examTypeInstruction = `DOLGOZAT TÍPUSA: 📘 TÉMAZÁRÓ DOLGOZAT (45 perc)
- Cél: Egy teljes tanulmányi fejezet lezárása és érdemjeggyel történő értékelése.
- Felépítés: ${count} db feladat K1 → K2 → K3 nehézségi piramis szerint felépítve (K1 alapismeretek, K2 típusfeladatok, K3 gondolkodtató feladat).
- Összpontszám: 40–50 pont.`;
    }

    // Fejléc és értékelési táblázat instrukció (Max pont, elért pont, érdemjegy)
    const taskColHeaders = Array.from({ length: count }, (_, i) => `${i + 1}.`).join(' & ');
    const taskMaxPlaceholders = Array.from({ length: count }, (_, i) => `[p_{${i + 1}}]`).join(' & ');
    const emptyCells = Array.from({ length: count + 2 }, () => '').join(' & ');
    const colAlign = `|l|${'c|'.repeat(count)}|c||c|`;
    const colCountForCline = count + 2;

    const evalTableSample = hasEvalTable ? `\\begin{flushright}
  ${count >= 7 ? '{\\footnotesize' : '{\\small'}
  \\begin{tabular}{${colAlign}}
    \\hline
    \\textbf{Feladat} & ${taskColHeaders} & \\textbf{Össz.} & \\textbf{Érdemjegy} \\\\ \\hline
    \\textbf{Max. pont} & ${taskMaxPlaceholders} & [P_{max}] & \\\\ \\cline{1-${colCountForCline}}
    \\textbf{Elért pont} & ${emptyCells} \\\\ \\hline
  \\end{tabular}
  }
  \\end{flushright}` : '';

    const headerInstruction = `KÖTELEZŐ DOLGOZAT FEJLÉC ÉS ADMINISZTRÁCIÓS ÉRTÉKELŐ TÁBLÁZAT (MAX PONT, ELÉRT PONT, ÉRDEMJEGY):
Minden csoport (vagy egységes feladatsor) feladatlapjának legtetején KÖTELEZŐ az alábbi fejléc elhelyezése:
\\noindent
\\begin{minipage}[t]{0.45\\textwidth}
  \\vspace{0pt}
  ${schoolName && schoolName.trim() ? `{\\small\\textsf{${schoolName.trim()}}}\\\\[1mm]` : ''}
  {\\Large\\textbf{${effectiveTopic}}}\\\\[2mm]
  ${isGroups ? '{\\large\\textbf{„[CSOPORT_BETŰJELE]” CSOPORT}}\\\\[2mm]' : ''}
  \\textbf{Név:} \\underline{\\hspace{4.5cm}}\\\\[2mm]
  \\textbf{Osztály:} \\underline{\\hspace{1.5cm}} \\quad \\textbf{Dátum:} \\underline{\\hspace{2cm}}
\\end{minipage}
\\hfill
\\begin{minipage}[t]{0.53\\textwidth}
  \\vspace{0pt}
  ${evalTableSample}
\\end{minipage}
\\vspace{2mm}
\\hrule
\\vspace{4mm}

SZIGORÚ ÉRTÉKELÉSI ÉS PONTOZÁSI SZABÁLYOK (MAX PONT, ELÉRT PONT, ÉRDEMJEGY):
1. A fejléc-táblázat PONTOSAN ${count + 3} oszlopos (${colAlign}). A táblázat MINDEN sorában PONTOSAN ${count + 2} darab '&' elválasztó jelnek kell lennie! Soha ne tegyél több '&' jelet a sorokba!
2. A táblázat 'Max. pont' sorában MINDEN egyes feladatnál KÖTELEZŐ kiírni a feladatra járó maximális pontszámot (pl. 4 & 6 & 8...), és a végén az 'Össz.' oszlopba a dolgozat pontos összpontszámát (P_{max})!
3. Az 'Elért pont' sort hagyd üresen (csak az elválasztó '&' jelek legyenek): '\\textbf{Elért pont} & ${emptyCells} \\\\ \\hline' (pontosan ${count + 2} db '&' jel)!
4. Az 'Érdemjegy' oszlop az érdemjegy beírására szolgál, hagyd üresen a rubrikát!
5. Minden feladat jobb szélén KÖTELEZŐ feltüntetni a maximális pontszámot: pl. \\hfill \\textbf{[4 pont]} vagy részpontoknál \\hfill \\textit{[2 pont]}!
6. A fejléc-táblázatban megadott feladat-pontszámok és az összpontszám PONTOSAN egyezzen meg a feladatok szövege mellett szereplő pontszámokkal!`;

    // Csoportok instrukciója (A-B stb csoportok)
    let groupsInstruction = '';
    if (isGroups) {
      groupsInstruction = `SZIGORÚ CSOPORT SZIMMETRIA ÉS MÁSOLÁS ELLENI VÉDELEM (${groupLabels.map(g => `„${g}”`).join(', ')} CSOPORTOK):
A dolgozatot ${groupLabels.length} teljesen egyenértékű, szimmetrikus változatban kell elkészíteni: ${groupLabels.map(g => `„${g}” csoport`).join(', ')}!
${groupLabels.map((g, idx) => `
${idx > 0 ? '\\newpage\n' : ''}* Készítsd el a(z) „${g}” csoport teljes feladatsorát a saját fejlécével ({\\large\\textbf{„${g}” CSOPORT}} felirattal), a fejléc értékelő táblázattal (Max pont, elért pont, érdemjegy), a feladatokkal és az alján a ponthatárokkal!`).join('\n')}

DIDAKTIKAI KÖVETELMÉNYEK A CSOPORTOKHOZ:
- Mindegyik csoportban az azonos sorszámú feladatnak pontosan ugyanazt a matematikai/fizikai képességet és nehézségi szintet kell mérnie, és ugyanannyi maximális pontot kell érnie!
- A számadatok, együtthatók, függvények paraméterei és szöveges kontextusai legyenek eltérőek, hogy szomszédos padokból ne lehessen egymásról lemásolni a lépéseket vagy az eredményt!
- Ha a feladathoz TikZ ábra tartozik, mindegyik csoportban szerepeljen ugyanolyan szerkezetű ábra, de eltérő paraméterekkel (pl. más szögérték, tükrözött háromszög, eltolt koordináták)!`;
    }

    // Elrendezési mód: Kompakt vs. Munkalap (négyzethálós)
    let layoutInstruction = '';
    if (isWorksheet) {
      layoutInstruction = `KITÖLTŐS MUNKALAP (WORKSHEET) ELRENDEZÉS:
A diákok közvetlenül erre a lapra dolgoznak! Minden egyes feladat után KÖTELEZŐ kihagyni megfelelő helyet a számoláshoz és levezetéshez:
Használj elegáns, halvány szürke 5mm-es TikZ négyzethálót a számoláshoz:
\\begin{tikzpicture}
  \\draw[step=5mm, gray!30, very thin] (0,0) grid (\\linewidth, 4.5);
\\end{tikzpicture}
Szöveges kifejtős kérdéseknél pedig pontozott vonalakat (\\dotfill).`;
    } else {
      layoutInstruction = `KOMPAKT FELADATLAP ELRENDEZÉS:
A diákok külön lapra/füzetbe dolgoznak. A tördelés legyen helytakarékos, áttekinthető, iskolai sokszorosításra és fénymásolásra optimalizált.`;
    }

    // Érdemjegy skála konkrét pontszámokkal
    let gradingScaleInstruction = '';
    if (hasGradingScale) {
      gradingScaleInstruction = `ÉRDEMJEGY PONTHATÁROK TÁBLÁZAT A DOLGOZATLAP ALJÁN:
A feladatlap alján (csoportos dolgozatnál minden csoport lapjának alján) helyezz el egy áttekinthető ponthatárok táblázatot az 1-5 érdemjegyekhez.
KÖTELEZŐ a konkrét pontszám-tartományok kiszámítása a dolgozat megállapított összpontszáma (P_max) alapján:
- 1 (elégtelen): 0 – (39% pontszám) pont
- 2 (elégséges): (40% pontszám) – (54% pontszám) pont
- 3 (közepes): (55% pontszám) – (69% pontszám) pont
- 4 (jó): (70% pontszám) – (84% pontszám) pont
- 5 (jeles): (85% pontszám) – P_max pont
Példa (ha P_max = 40 pont):
\\vfill
\\noindent
\\begin{center}
\\small
\\textbf{Ponthatárok:} \\quad 1 (elégtelen): 0--15 p \\quad 2 (elégséges): 16--21 p \\quad 3 (közepes): 22--27 p \\quad 4 (jó): 28--33 p \\quad 5 (jeles): 34--40 p
\\end{center}`;
    }

    // Részpontozás
    const pointsInstruction = `KÖTELEZŐ RÉSZPONTOZÁS:
Minden egyes feladat jobb szélén KÖTELEZŐ feltüntetni a maximálisan szerezhető pontszámot, pl.:
\\hfill \\textbf{[4 pont]} vagy alkérdéseknél \\hfill \\textit{[2 pont]}`;

    // Megoldókulcs instrukció
    let solutionInstruction = '';
    if (solutionPlacement === 'separate_doc') {
      solutionInstruction = `MEGOLDÓKULCS KÜLÖNÁLLÓ DOKUMENTUMKÉNT:
1. A dolgozat befejezése után kötelezően szúrj be pontosan egy ilyen elválasztó sort:
=== SEPARATE_SOLUTIONS_DOCUMENT ===
2. Az elválasztó után generáld le a TELJES, ÖNÁLLÓ TANÁRI JAVÍTÓKULCS DOKUMENTUMOT (\\title{${effectiveTopic} - Javítókulcs és Pontozási Útmutató}).
SZIGORÚ KÖVETELMÉNY: Minden feladatnál ELŐSZÖR A FELADAT TELJES SZÖVEGÉT mutasd be szó szerint, utána a lépésről-lépésre levezetett megoldást, a részletes pontbontást (rubric), valamint egy „Tanári megjegyzés / Tipikus hiba” blokkot!`;
    } else if (solutionPlacement === 'inline') {
      solutionInstruction = `MEGOLDÓKULCS INLINE ELHELYEZÉS:
Minden feladat alatt közvetlenül helyezz el egy tanári megoldás dobozt a levezetéssel és a pontozási rubrikával.`;
    } else {
      solutionInstruction = `MEGOLDÓKULCS KÜLÖN OLDALON A VÉGÉN:
A teljes dolgozat után tegyél be egy kötelező lapdobást:
\\newpage
\\section*{Részletes tanári megoldókulcs és pontozási útmutató}
SZIGORÚ KÖVETELMÉNY: Minden feladatnál ELŐSZÖR A FELADAT TELJES SZÖVEGE szerepeljen szó szerint, közvetlenül utána a részletes lépésről-lépésre kidolgozás, a pontozási útmutató és a tipikus tanulói hibák!`;
    }

    const fullPrompt = `Te egy mester pedagógus és érettségi tételkészítő szakértő vagy. Készíts egy professzionális, nyomtatásra kész középiskolai dolgozatot!
Tantárgy: ${effectiveSubject}
Témakör: ${effectiveTopic}

${examTypeInstruction}

${headerInstruction}

${groupsInstruction}

${layoutInstruction}

${pointsInstruction}

${gradingScaleInstruction}

${solutionInstruction}

${customPrompt && customPrompt.trim() ? `KÜLÖN EGYÉNI TANÁRI UTASÍTÁS A DOLGOZATHOZ:\n${customPrompt.trim()}\n` : ''}

${fileContext ? `Csatolt forrásanyagok tartalma:\n${fileContext}\n` : ''}

SZABÁLYOK:
- Kizárólag érvényes, hibátlan, pdflatex-szel azonnal fordítható LaTeX kódot adj vissza!
- SZIGORÚAN TILOS A DUPLA SZÁMOZÁS:
  * Számozott listákban (\\begin{enumerate}) az \\item mögé SOHA NE írj ki kézzel sorszámot vagy betűt!
  * Helyes fejléc: \\item \\textbf{Feladat} \\hfill \\textbf{[X pont]}
- Gráfos ábráknál (TikZ), ha a feladat szövegében nem hivatkozol kifejezetten a csúcsok betűjeleire (A, B, C...), a csúcsokat csak pontként (pöttyként) rajzold ki, betűk és zavaró fokszám-feliratok nélkül!
- CSAK a LaTeX kódblokkot (vagy a megadott elválasztóval ellátott kódot) add vissza!`;

    let latex = await callAi(fullPrompt, provider, [], SYSTEM, model, req, { thinkingLevel: req.body?.thinkingLevel || 'medium', timeoutMs: 90000 });
    let finalLatex = latex.trim();
    let solutionsLatex = null;

    if (solutionPlacement === 'separate_doc') {
      const sepRegex = /(?:%*\s*={3,}.*?\n)?%*\s*={0,}\s*SEPARATE[_\s-]+SOLUTIONS[_\s-]+DOCUMENT\s*={0,}%*(?:\n\s*%*\s*={3,})?/i;
      if (sepRegex.test(finalLatex)) {
        const parts = finalLatex.split(sepRegex);
        finalLatex = parts[0].trim();
        solutionsLatex = parts[1].trim();
      } else if (finalLatex.includes('\\section*{Részletes tanári megoldókulcs') || finalLatex.includes('\\section*{Megoldókulcs')) {
        const splitIdx = finalLatex.indexOf('\\section*{Részletes tanári megoldókulcs') !== -1
          ? finalLatex.indexOf('\\section*{Részletes tanári megoldókulcs')
          : finalLatex.indexOf('\\section*{Megoldókulcs');
        solutionsLatex = finalLatex.slice(splitIdx).trim();
        finalLatex = finalLatex.slice(0, splitIdx).trim();
        finalLatex = finalLatex.replace(/\\newpage\s*$/, '').trim();
      }

      const m1 = finalLatex.match(/```(?:latex|tex)?\n?([\s\S]*?)```/);
      if (m1) finalLatex = m1[1].trim();
      else finalLatex = finalLatex.replace(/^```(?:latex|tex)?\n?/i, '').replace(/\n?```$/i, '').trim();

      if (solutionsLatex) {
        const m2 = solutionsLatex.match(/```(?:latex|tex)?\n?([\s\S]*?)```/);
        if (m2) solutionsLatex = m2[1].trim();
        else solutionsLatex = solutionsLatex.replace(/^```(?:latex|tex)?\n?/i, '').replace(/\n?```$/i, '').trim();

        solutionsLatex = supplementFullLatex(solutionsLatex, customPreamble, `${effectiveTopic} - Javítókulcs`);
        solutionsLatex = sanitizeLatexNumbering(solutionsLatex);
        solutionsLatex = sanitizeTabularRows(solutionsLatex);
        solutionsLatex = ensureDocumentStructure(solutionsLatex);
      }
    } else {
      const m = finalLatex.match(/```(?:latex|tex)?\n?([\s\S]*?)```/);
      if (m) finalLatex = m[1].trim();
      else finalLatex = finalLatex.replace(/^```(?:latex|tex)?\n?/i, '').replace(/\n?```$/i, '').trim();
    }

    finalLatex = supplementFullLatex(finalLatex, customPreamble, `${effectiveTopic}_Dolgozat`);
    finalLatex = sanitizeLatexNumbering(finalLatex);
    finalLatex = sanitizeTabularRows(finalLatex);
    finalLatex = ensureDocumentStructure(finalLatex);

    const safeTopicName = (effectiveTopic || 'Dolgozat')
      .replace(/[\/\\:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');

    res.json({
      success: true,
      latex: finalLatex,
      solutionsLatex: solutionsLatex || null,
      hasSeparateDoc: Boolean(solutionsLatex && solutionPlacement === 'separate_doc'),
      solutionsFilename: `${safeTopicName}_Dolgozat_Megoldasok.tex`,
      topic: `${safeTopicName}_Dolgozat`,
      groupMode: effectiveGroupMode,
      isGroupsAB: effectiveGroupMode !== 'none',
      layoutMode,
      taskCount: count
    });
  } catch (err) {
    console.error('[AI Exam Error]:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/ai/beamer
router.post('/beamer', async (req, res) => {
  try {
    const { content, subject, customPrompt, provider, model } = req.body;
    let prompt = `Alakítsd át az alábbi LaTeX tananyagot/összefoglalót Beamer prezentációvá!\nTantárgy: ${subject === 'fizika' ? 'Fizika' : 'Matematika'}\n\nForrás:\n${content}\n\nKészíts szemléletes, jól tagolt Beamer prezentációt (pl. \\usetheme{Madrid}). Adj címet minden diának (\\begin{frame}{Dia címe}). Használj átlátható bullet pointokat és Beamer block környezeteket. Ügyelj a frame-ek pontos lezárására!`;
    if (customPrompt && customPrompt.trim()) {
      prompt += `\n\nKÜLÖN EGYÉNI UTASÍTÁS A PREZENTÁCIÓHOZ:\n${customPrompt.trim()}`;
    }

    let latex = await callAi(prompt, provider, [], BEAMER_SYSTEM, model, req, { thinkingLevel: 'low', timeoutMs: 60000 });
    const m = latex.match(/```(?:latex|tex)?\n?([\s\S]*?)```/);
    if (m) latex = m[1];
    const finalLatex = supplementFullLatex(latex.trim());

    let extractedTopic = '';
    const tm = finalLatex.match(/\\title(?:\s*\[[^\]]*\])?\s*\{([^}]+)\}/i);
    if (tm) {
      extractedTopic = tm[1].replace(/\\[a-zA-Z]+/g, '').replace(/[{}]/g, '').trim();
    }

    res.json({ success: true, latex: finalLatex.trim(), topic: extractedTopic || undefined });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

function getContextAroundLine(code, targetLine, padding = 10) {
  const lines = code.split('\n');
  const total = lines.length;
  const targetIdx = Math.max(0, Math.min(targetLine - 1, total - 1));

  let startIdx = Math.max(0, targetIdx - padding);
  let endIdx = Math.min(total - 1, targetIdx + padding);

  // Ha környezeten belül van (\begin{env} ... \end{env}), terjesszük ki a teljes környezetre
  const stack = [];
  const envRanges = [];
  for (let i = 0; i < total; i++) {
    const l = lines[i];
    const b = l.match(/\\begin\{([a-zA-Z0-9*_-]+)\}/);
    const e = l.match(/\\end\{([a-zA-Z0-9*_-]+)\}/);
    if (b && b[1] !== 'document') stack.push({ env: b[1], startIdx: i });
    if (e && e[1] !== 'document') {
      for (let j = stack.length - 1; j >= 0; j--) {
        if (stack[j].env === e[1]) {
          const st = stack.splice(j, 1)[0];
          envRanges.push({ env: st.env, startIdx: st.startIdx, endIdx: i });
          break;
        }
      }
    }
  }

  for (const env of envRanges) {
    if (env.startIdx <= targetIdx && env.endIdx >= targetIdx) {
      if (env.startIdx < startIdx) startIdx = env.startIdx;
      if (env.endIdx > endIdx) endIdx = env.endIdx;
    }
  }

  return {
    startLine: startIdx + 1,
    endLine: endIdx + 1,
    snippet: lines.slice(startIdx, endIdx + 1).join('\n')
  };
}

// POST /api/ai/fix-error
router.post('/fix-error', async (req, res) => {
  try {
    const { code, errorLog, provider, model } = req.body;
    if (!code) return res.status(400).json({ error: 'Hiányzó forráskód' });

    // 0. Gyors automatikus szanálás ismert strukturális hibákra (pl. Beamer + enumitem végtelen rekurzív hurok)
    const isBeamer = /\\documentclass(?:\[[^\]]*\])?\{beamer\}/i.test(code);
    if (
      isBeamer &&
      (errorLog?.includes('TeX capacity exceeded') || errorLog?.includes('labelenumi') || errorLog?.includes('grouping levels=255'))
    ) {
      const autoCleaned = supplementFullLatex(code);
      return res.json({ success: true, latex: autoCleaned.trim(), targeted: true, autoHealed: true });
    }

    // 1. Kinyerjük a hibás sorszámot a hibanaplóból (l.<sorszám>)
    const lineMatch = (errorLog || '').match(/^l\.(\d+)/m) || (errorLog || '').match(/l\.(\d+)/);
    const errorLine = lineMatch ? parseInt(lineMatch[1], 10) : null;
    const totalLines = code.split('\n').length;

    // Ha van pontos hibás sorszám és a dokumentum hosszabb mint 40 sor: CÉLZOTT VILLÁMGYORS JAVÍTÁS
    if (errorLine && totalLines > 40) {
      const ctx = getContextAroundLine(code, errorLine, 8);
      const targetedSys = `Te egy mesterszintű LaTeX hibajavító asszisztens vagy MAGYAR NYELVEN.
A feladatod a megadott kódrészletben lévő hiba azonnali, precíz kijavítása.
SZIGORÚ SZABÁLYOK:
1. CSAK a megadott kódrészlet javított változatát add vissza, ami közvetlenül beilleszthető a helyére (Sor ${ctx.startLine}–${ctx.endLine})!
2. NE tegyél köré \\documentclass vagy \\begin{document} környezetet!
3. CSAK tiszta LaTeX kódot add vissza, semmilyen magyarázat vagy bevezető szöveg nélkül!`;

      const targetedPrompt = `A pdflatex fordító a(z) ${errorLine}. sornál az alábbi hibával állt le:
----------------------------------------
${errorLog}
----------------------------------------

A hibás sor körüli kódrészlet (Sor ${ctx.startLine}–${ctx.endLine}):
\`\`\`latex
${ctx.snippet}
\`\`\`

Javítsd ki a kódrészletet úgy, hogy a hiba megszűnjön! Csak a javított kódrészletet add vissza.`;

      try {
        let fixedSnippet = await callAi(targetedPrompt, provider, [], targetedSys, model, req, { thinkingLevel: 'low', timeoutMs: 25000 });
        const m = fixedSnippet.match(/```(?:latex|tex)?\n?([\s\S]*?)```/);
        if (m) fixedSnippet = m[1];
        fixedSnippet = fixedSnippet.trim();

        // Ha a modell nem a teljes dokumentumot adta vissza, beillesztjük a helyére
        if (!fixedSnippet.includes('\\documentclass') && fixedSnippet.length > 0) {
          const lines = code.split('\n');
          const before = lines.slice(0, ctx.startLine - 1);
          const after = lines.slice(ctx.endLine);
          const assembledCode = [...before, fixedSnippet, ...after].join('\n');
          const finalLatex = supplementFullLatex(assembledCode);
          return res.json({ success: true, latex: finalLatex.trim(), targeted: true, line: errorLine });
        }
      } catch (targetedErr) {
        console.warn('[Fix-Error] Célzott javítás hiba, visszaesés a teljes generálásra:', targetedErr.message);
      }
    }

    // 2. Ha nincs sorszám vagy a célzott javítás nem volt alkalmazható: Teljes kód javítása
    const fixSysPrompt = `Te egy mesterszintű LaTeX és TeX Live hibajavító szakértő vagy MAGYAR NYELVEN.
A feladatod egy fordítási hibát (pdflatex compilation error) tartalmazó LaTeX dokumentum elemzése és a hibák precíz kijavítása.

SZIGORÚ SZABÁLYOK:
1. Elemezd a csatolt pdflatex hibanaplót (pl. hiányzó zárójel, hibás/lezáratlan környezet, hiányzó math mode '$', elgépelt parancs, hiányzó csomag, hibás táblázat/align szintaxis).
2. Javítsd ki a forráskódot úgy, hogy a dokumentum hiba nélkül leforduljon pdflatex-szel, miközben az eredeti tartalom és szerkezet maradéktalanul megmarad.
3. CSAK ÉS KIZÁRÓLAG a teljes, javított, azonnal fordítható LaTeX kódot add vissza (\\documentclass-tól \\end{document}-ig)!
4. Semmilyen bevezető, lezáró vagy magyarázó szöveget NE írj a kód elé vagy mögé!`;

    const prompt = `A pdflatex fordító az alábbi hibával állt le:
----------------------------------------
${errorLog || 'Ismeretlen fordítási hiba'}
----------------------------------------

A hibás dokumentum teljes LaTeX forráskódja:
\`\`\`latex
${code}
\`\`\`

Javítsd ki a hibá(ka)t, hogy a pdflatex hiba és figyelmeztetés nélkül le tudja fordítani! Csak a javított LaTeX forráskódot add vissza.`;

    let latex = await callAi(prompt, provider, [], fixSysPrompt, model, req, { thinkingLevel: 'low', timeoutMs: 45000 });
    const m = latex.match(/```(?:latex|tex)?\n?([\s\S]*?)```/);
    if (m) latex = m[1];
    const finalLatex = supplementFullLatex(latex.trim());
    res.json({ success: true, latex: finalLatex.trim(), targeted: false });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/ai/fix-structure - Dokumentum átnézése és javítása a TOC alapján (szintek és számozások)
router.post('/fix-structure', async (req, res) => {
  try {
    const { code, subject = 'Matematika', provider, model } = req.body;
    if (!code || typeof code !== 'string' || !code.trim()) {
      return res.status(400).json({ error: 'Nincs megadva LaTeX forráskód az átnézéshez' });
    }

    const effectiveSubject = subject === 'fizika' || subject === 'Fizika' ? 'Fizika' : 'Matematika';

    const structureSysPrompt = `Te egy mesterszintű LaTeX tipográfiai, didaktikai és dokumentumszerkezeti szakértő vagy MAGYAR NYELVEN.
A feladatod a felhasználó által megadott teljes LaTeX dokumentum átnézése és a szerkezet, a Tartalomjegyzék (TOC) hierarchia, a section/subsection/subsubsection szintek és a számozások intelligens javítása.

SZIGORÚ SZABÁLYOK ÉS IRÁNYELVEK:
1. TOC HIERARCHIA ÉS SZINTEK JAVÍTÁSA:
   - A dokumentum hierarchiájának szigorúan logikusnak és fokozatosnak kell lennie: \\section -> \\subsection -> \\subsubsection.
   - Ne ugorj át szinteket (pl. \\section után közvetlenül ne álljon \\subsubsection)!
   - Ha a dokumentumban hiányzik a fő \\section szint (pl. a dokumentum rögtön \\subsection*-gal vagy \\subsection-nel indul, mint pl. "\\subsection*{1. A lényeg}"), emeld fel a fő logikai egységeket \\section szintre!
   - Ha \\documentclass[...]{article}-ben hibásan \\chapter szerepel, alakítsd át \\section-re!

2. KETTŐS ÉS HIBÁS SZÁMOZÁSOK KISZŰRÉSE:
   - A LaTeX automatikusan számozza a számozott szinteket (\\section, \\subsection, \\subsubsection).
   - Ezért ha egy számozott címben manuális számozás van (pl. \\section{1. Bevezetés}, \\subsection{1.1. Alapfogalmak}, \\subsection{1. A teljes gráf}), TÁVOLÍTSD EL a manuális számozást a címből (pl. \\section{Bevezetés}, \\subsection{Alapfogalmak}, \\subsection{A teljes gráf}), mert a LaTeX automatikus számozása csúnya kettős számozást idéz elő (pl. "1 1. Bevezetés", "3.1 1. A teljes gráf") a szövegben és a tartalomjegyzékben (TOC)!
   - Számozott listákban (\\begin{enumerate}): ha az \\item után manuálisan meg van ismételve a sorszám vagy betűjel (pl. \\item \\textbf{1. Feladat} vagy \\item a)), TÁVOLÍTSD EL a manuális sorszámot (pl. \\item \\textbf{Feladat} vagy \\item), mert a lista automatikusan megszámozza!
   - Ha a dokumentum csillagozott címeket használ (\\section*{...}, \\subsection*{...}):
     - Ha a dokumentumhoz logikusan illik a szabványos számozott LaTeX hierarchia (hogy a \\tableofcontents működjön), alakítsd át számozott \\section / \\subsection szintekre felesleges kézi prefixek nélkül.
     - Ha csillagozottak maradnak, javítsd a számozási folytonossági hibákat (pl. 1, 2, 3, 5 -> 1, 2, 3, 4).
   - Záró összefoglaló, irodalomjegyzék vagy megoldókulcs (pl. \\section*{Részletes megoldókulcs}) maradhat csillagozott.

3. TARTALMI ÉS MATEMATIKAI ÉRINTETLENSÉG:
   - A tananyag szöveges tartalmát, magyarázatait, matematikai levezetéseit, képleteit és egyenleteit SZÓRÓL SZÓRA ŐRIZD MEG!
   - Tilos szöveget lerövidíteni, kihagyni vagy átfogalmazni!
   - A preambulumot és az összes csomagot, beállítást hagyd érintetlenül!

4. FELHASZNÁLÓI SZABÁLYOK:
   - A tűzgömböt és a tűz részecskék fizikáját, illetve emisszióját Tilos átírni!
   - Gráfos ábráknál (TikZ), ha a szövegben nem hivatkozunk kifejezetten a csúcsok betűjeleire (A, B, C...), a csúcsokat csak pontként (pöttyként) rajzold ki betűk és zavaró fokszám-feliratok nélkül!

KIMENETI FORMÁTUM:
Válaszodat PONTOSAN az alábbi formátumban add meg:
=== SUMMARY ===
- [pontokba szedett tömör magyar összefoglaló a javításokról, pl.: "Manuális kettős számozások eltávolítva 4 alcímnél", "Fő fejezetek előléptetve \\section szintre", "TOC hierarchia helyreállítva"]
=== LATEX ===
[A teljes, javított, azonnal fordítható LaTeX dokumentum kódja]`;

    const prompt = `Kérlek, nézd át a következő LaTeX dokumentumot (${effectiveSubject}), és javítsd a TOC alapján a számozásokat, a section és egyéb szinteket:\n\n${code}`;

    let raw = await callAi(prompt, provider, [], structureSysPrompt, model, req, { thinkingLevel: 'low', timeoutMs: 35000 });

    let summary = [];
    let fixedLatex = '';

    if (raw.includes('=== SUMMARY ===') && raw.includes('=== LATEX ===')) {
      const parts = raw.split('=== LATEX ===');
      const sumPart = parts[0].replace('=== SUMMARY ===', '').trim();
      summary = sumPart.split('\n')
        .map(l => l.replace(/^[-*•\d.]+\s*/, '').trim())
        .filter(Boolean);
      fixedLatex = parts[1].trim();
    } else {
      fixedLatex = raw.trim();
    }

    const m = fixedLatex.match(/```(?:latex|tex)?\n?([\s\S]*?)```/);
    if (m) fixedLatex = m[1].trim();
    else fixedLatex = fixedLatex.replace(/^```(?:latex|tex)?\n?/i, '').replace(/\n?```$/i, '').trim();

    // Ha véletlenül kimaradt volna a preambulum, de az eredetiben ott volt
    if (!fixedLatex.includes('\\documentclass') && code.includes('\\documentclass')) {
      const docBegin = code.indexOf('\\begin{document}');
      if (docBegin !== -1) {
        const preamble = code.substring(0, docBegin);
        if (!fixedLatex.includes('\\begin{document}')) {
          fixedLatex = `${preamble}\\begin{document}\n\n${fixedLatex}\n\n\\end{document}`;
        } else {
          fixedLatex = `${preamble}${fixedLatex}`;
        }
      }
    }

    fixedLatex = sanitizeLatexNumbering(fixedLatex);

    if (summary.length === 0) {
      summary = ['A dokumentum fejezetszintjei és számozásai átnézve és normalizálva a TOC alapján.'];
    }

    const hasChanges = fixedLatex.trim() !== code.trim();

    res.json({
      success: true,
      fixedLatex,
      summary,
      hasChanges
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/ai/chat
router.post('/chat', async (req, res) => {
  try {
    const { messages = [], currentCode = '', subject = 'matematika', provider, model, images = [] } = req.body;

    const CHAT_SYSTEM = `Te egy professzionális, rendkívül segítőkész LaTeX és oktatási szakértő AI asszisztens vagy MAGYAR NYELVEN.
A felhasználó az aktív LaTeX dokumentumát (${subject === 'fizika' ? 'Fizika' : 'Matematika'}) szerkeszti, és veled beszélget a tartalomról, feladatokról, magyarázatokról, pontozási útmutatóról vagy a kinézetről.
A felhasználó képeket is csatolhat (pl. képernyőképet a lefordított PDF-ről, ami nem olyan lett, amilyet szeretett volna, vagy kézzel írt képletet/ábrát).
A te feladatod az esetleges képek vizuális elemzése, a probléma azonosítása és a forráskód megfelelő javítása.

SZABÁLYOK:
1. Válaszolj közvetlenül, világosan és szakszerűen magyar nyelven.
2. Ha kódot, új feladatot, pontozást vagy javítást adsz át, formázd tisztán \`\`\`latex ... \`\`\` blokkba!
3. Ha a felhasználó egy vizuális hibát mutat be a képen (pl. túlcsordulás, csúnya tördelés, hibás képletigazítás, egymásra lógó elemek):
   - Magyarázd el röviden, mi a probléma oka TeX-ben.
   - Adj azonnal használható, javított LaTeX kódblokkot.
4. Törekedj arra, hogy a javasolt kódrészletek könnyen beilleszthetők vagy lecserélhetők legyenek.`;

    // Format previous messages and latest message
    const lastMsg = messages[messages.length - 1];
    const latestQuery = lastMsg ? lastMsg.content : 'Segíts a dokumentum szerkesztésében!';
    const previousHistory = messages.slice(0, -1).slice(-6);

    let prompt = '';
    if (currentCode && currentCode.trim()) {
      prompt += `AZ AKTUÁLISAN SZERKESZTETT DOKUMENTUM FORRÁSKÓDJA:\n\`\`\`latex\n${currentCode.slice(0, 16000)}\n\`\`\`\n\n`;
    }

    if (previousHistory.length > 0) {
      prompt += `KORÁBBI BESZÉLGETÉSI ELŐZMÉNYEK:\n`;
      for (const m of previousHistory) {
        prompt += `${m.role === 'user' ? 'Felhasználó' : 'Asszisztens'}: ${m.content}\n\n`;
      }
    }

    prompt += `FELHASZNÁLÓ AKTUÁLIS KÉRÉSE:\n${latestQuery}`;

    // Process attached images
    const imageParts = [];
    if (Array.isArray(images)) {
      for (const img of images) {
        let base64Data = img.data || (typeof img === 'string' ? img : '');
        let mimeType = img.mimeType || 'image/png';
        if (base64Data.startsWith('data:')) {
          const match = base64Data.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            mimeType = match[1];
            base64Data = match[2];
          }
        }
        if (base64Data) {
          imageParts.push({
            inlineData: {
              data: base64Data,
              mimeType
            }
          });
        }
      }
    }

    const reply = await callAi(prompt, provider, imageParts, CHAT_SYSTEM, model, req, { thinkingLevel: 'low', timeoutMs: 30000 });
    res.json({ success: true, reply: reply.trim() });
  } catch (err) {
    console.error('[AI Chat Error]:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;

