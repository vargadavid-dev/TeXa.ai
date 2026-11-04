/**
 * latexPreambleHelper.js
 *
 * Intelligens LaTeX Preambulum és Csomag Kiegészítő segédprogram.
 * Biztosítja, hogy ha a felhasználó saját vagy egyéni preambulumot használ,
 * az MINDIG ki legyen egészítve a hibátlan megjelenítéshez és fordításhoz
 * szükséges csomagokkal (tcolorbox, TikZ, pgfplots, xcolor, amsmath, amssymb,
 * magyar babel, fontenc, geometry, siunitx, booktabs, enumitem, stb.),
 * valamint a használt egyedi dobozkörnyezetekkel.
 */

const { sanitizeLatexNumbering } = require('./latexNumberingHelper');

// Alapvető megjelenítési csomagok (article, report, és hasonló szabványos dokumentumtípusokhoz)
const CORE_DISPLAY_PACKAGES = [
  { name: 'inputenc', code: '\\usepackage[utf8]{inputenc}' },
  { name: 'fontenc', code: '\\usepackage[T1]{fontenc}' },
  { name: 'babel', code: '\\usepackage[magyar]{babel}' }, // elfogadja a 'hungarian'-t is
  { name: 'amsmath', code: '\\usepackage{amsmath, amssymb, amsfonts, amsthm}' },
  { name: 'geometry', code: '\\usepackage{geometry}\n\\geometry{margin=2.5cm}' }, // beamer esetén kihagyjuk
  { name: 'xcolor', code: '\\usepackage{xcolor}' },
  { name: 'tcolorbox', code: '\\usepackage{tcolorbox}\n\\tcbuselibrary{theorems,skins,breakable}' },
  { name: 'tikz', code: '\\usepackage{tikz}' },
  { name: 'pgfplots', code: '\\usepackage{pgfplots}\n\\pgfplotsset{compat=1.18}' },
  { name: 'graphicx', code: '\\usepackage{graphicx}' },
  { name: 'enumitem', code: '\\usepackage{enumitem}' }, // ha se enumitem, se enumerate nincs
  { name: 'booktabs', code: '\\usepackage{booktabs}' },
  { name: 'float', code: '\\usepackage{float}' },
  { name: 'caption', code: '\\usepackage{caption}' },
  { name: 'microtype', code: '\\usepackage{microtype}' }
];

/**
 * Kinyeri a már betöltött csomagok nevét kisbetűs halmazként (Set).
 */
function extractLoadedPackages(preambleText) {
  const loaded = new Set();
  if (!preambleText) return loaded;

  // \usepackage[...]{pkg1, pkg2, ...}
  const pkgRegex = /\\usepackage(?:\s*\[[^\]]*\])?\s*\{([^}]+)\}/g;
  let match;
  while ((match = pkgRegex.exec(preambleText)) !== null) {
    const pkgs = match[1].split(',').map(p => p.trim().toLowerCase());
    for (const p of pkgs) {
      if (p) loaded.add(p);
    }
  }

  // polyglossia alternatívaként a babelre
  if (preambleText.includes('\\usepackage{polyglossia}') || preambleText.includes('polyglossia')) {
    loaded.add('babel');
  }

  // enumerate alternatívaként az enumitemre (ha NEM beamer)
  const isBeamer = /\\documentclass(?:\[[^\]]*\])?\{beamer\}/i.test(preambleText);
  if (loaded.has('enumerate') && !isBeamer) {
    loaded.add('enumitem');
  }

  return loaded;
}

/**
 * Eltávolít egy adott csomagot a preambulumból vagy kódból,
 * kezelve az önálló (\usepackage{pkg}) és a vesszővel elválasztott listákat (\usepackage{a, pkg, b}) is.
 */
function removePackageFromPreamble(preambleText, pkgToRemove) {
  if (!preambleText) return preambleText;
  const regex = /\\usepackage(?:\s*\[[^\]]*\])?\s*\{([^}]+)\}/gi;
  return preambleText.replace(regex, (match, pkgList) => {
    const pkgs = pkgList.split(',').map(p => p.trim());
    const filtered = pkgs.filter(p => p.toLowerCase() !== pkgToRemove.toLowerCase());
    if (filtered.length === 0) return '';
    if (filtered.length === pkgs.length) return match;
    return match.replace(`{${pkgList}}`, `{${filtered.join(', ')}}`);
  });
}

/**
 * Szétválasztja a LaTeX kódot preambulumra és törzsre (\begin{document} alapján).
 */
function splitPreambleAndBody(latexCode) {
  if (!latexCode) return { preamble: '', body: '', docStartIdx: -1 };
  const docStartIdx = latexCode.indexOf('\\begin{document}');
  if (docStartIdx === -1) {
    return { preamble: latexCode.trim(), body: '', docStartIdx: -1 };
  }
  return {
    preamble: latexCode.slice(0, docStartIdx).trim(),
    body: latexCode.slice(docStartIdx).trim(),
    docStartIdx
  };
}

/**
 * Kiegészíti a preambulumot a megjelenítéshez szükséges csomagokkal és makrókkal.
 *
 * @param {string} basePreamble - A kiinduló (pl. felhasználói) preambulum
 * @param {string} bodyContent - A dokumentum törzse (opcionális, tartalomelemzéshez)
 * @param {object} options - További beállítások
 * @returns {{ supplementedPreamble: string, addedPackages: string[] }}
 */
function supplementPreamble(basePreamble = '', bodyContent = '', options = {}) {
  let preamble = (basePreamble || '').trim();
  const body = bodyContent || '';
  const fullText = `${preamble}\n${body}`;

  // Ha még \documentclass sincs, adjunk hozzá alapértelmezettet
  if (!preamble.includes('\\documentclass')) {
    preamble = `\\documentclass[a4paper,12pt]{article}\n\n${preamble}`;
  }

  // pdflatex összeférhetetlenségek automatikus szanálása:
  // Ha fontspec vagy babelfont szerepel (pl. XeLaTeX mintából másolva),
  // a pdflatex azonnal fatal hibával leállna ("The fontspec package requires either XeTeX or LuaTeX").
  if (preamble.includes('fontspec') || preamble.includes('babelfont') || preamble.includes('babelprovide')) {
    preamble = preamble.replace(/\\usepackage(?:\s*\[[^\]]*\])?\s*\{fontspec\}/gi, '');
    preamble = preamble.replace(/\\babelprovide(?:\s*\[[^\]]*\])?\s*\{[^}]*\}/gi, '');
    preamble = preamble.replace(/\\babelfont(?:\s*\[[^\]]*\])?\s*\{[^}]*\}\s*\{[^}]*\}/gi, '');
    preamble = preamble.replace(/\\usepackage\s*\[magyar,\s*bidi=basic,\s*provide=\*\]\{babel\}/gi, '\\usepackage[magyar]{babel}');
  }

  // Lemaradt backslash automatikus pótlása gyakori metaadat-parancsok előtt (pl. author{...} -> \author{...})
  preamble = preamble.replace(/(^|\n)\s*author\s*\{/g, '$1\\author{');
  preamble = preamble.replace(/(^|\n)\s*title\s*\{/g, '$1\\title{');
  preamble = preamble.replace(/(^|\n)\s*date\s*\{/g, '$1\\date{');

  const isBeamer = /\\documentclass(?:\[[^\]]*\])?\{beamer\}/i.test(preamble) || /\\documentclass(?:\[[^\]]*\])?\{beamer\}/i.test(body);

  if (isBeamer) {
    // Beamer-specifikus összeférhetetlen csomagok szanálása:
    // 1. enumitem / enumerate / paralist: Fatális rekurzív hurkot okoz (\labelenumi -> {\labelenumi}), mert
    // felülírja a Beamer beépített számlálóit és overlay-logikáját (\end{frame} végtelen ciklusba fut: grouping levels=255).
    preamble = removePackageFromPreamble(preamble, 'enumitem');
    preamble = removePackageFromPreamble(preamble, 'enumerate');
    preamble = removePackageFromPreamble(preamble, 'paralist');

    // 2. geometry: A Beamer maga definiálja a vetítési arányt és keretet (pl. aspectratio=169).
    // A geometry csomag felülbírálja és tönkreteszi a diák elrendezését.
    preamble = removePackageFromPreamble(preamble, 'geometry');
    preamble = preamble.replace(/\\geometry\s*\{[^}]*\}/gi, '');

    // 3. float: A Beamer frame-ekben nem léteznek úsztatott blokkok (floating bodies).
    preamble = removePackageFromPreamble(preamble, 'float');

    // 4. caption: Beamer saját feliratozási és címsor-témákat kezel.
    preamble = removePackageFromPreamble(preamble, 'caption');

    // 5. amsthm: A Beamer beépítve tartalmazza a tételkörnyezeteket, az amsthm betöltése ütközést okoz.
    preamble = removePackageFromPreamble(preamble, 'amsthm');
  }

  const loaded = extractLoadedPackages(preamble);
  const packagesToAdd = [];
  const addedNames = [];

  // 1. Alapvető megjelenítési csomagok vizsgálata
  for (const pkg of CORE_DISPLAY_PACKAGES) {
    if (isBeamer && ['geometry', 'tcolorbox', 'enumitem', 'float', 'caption'].includes(pkg.name)) {
      // Beamer esetén ezek a csomagok tilosak vagy nem szükségesek
      continue;
    }

    if (pkg.name === 'babel') {
      // Ha már van babel vagy magyar/hungarian babel opció, nem kell újra
      if (loaded.has('babel') || /\\usepackage\s*\[[^\]]*(?:magyar|hungarian)[^\]]*\]\{babel\}/i.test(preamble)) {
        continue;
      }
    }

    if (pkg.name === 'amsmath') {
      if (loaded.has('amsmath') && loaded.has('amssymb') && (loaded.has('amsthm') || isBeamer)) {
        continue;
      }
      // Ha valamelyik hiányzik:
      const missingMath = [];
      if (!loaded.has('amsmath')) missingMath.push('amsmath');
      if (!loaded.has('amssymb')) missingMath.push('amssymb');
      if (!loaded.has('amsfonts')) missingMath.push('amsfonts');
      if (!loaded.has('amsthm') && !isBeamer) missingMath.push('amsthm');
      if (missingMath.length > 0) {
        packagesToAdd.push(`\\usepackage{${missingMath.join(', ')}}`);
        addedNames.push(...missingMath);
        missingMath.forEach(m => loaded.add(m));
      }
      continue;
    }

    if (!loaded.has(pkg.name)) {
      packagesToAdd.push(pkg.code);
      addedNames.push(pkg.name);
      loaded.add(pkg.name);
    }
  }

  // 2. Tartalom-specifikus csomagok vizsgálata (ha a törzsben használva vannak)
  // SI mértékegységek
  if (
    /\\(SI|qty|unit|num|si|ang)\s*\{/.test(fullText) ||
    fullText.includes('siunitx')
  ) {
    if (!loaded.has('siunitx')) {
      packagesToAdd.push('\\usepackage{siunitx}\n\\sisetup{locale=DE}');
      addedNames.push('siunitx');
      loaded.add('siunitx');
    }
  }

  // Áramkörök
  if (fullText.includes('circuitikz') && !loaded.has('circuitikz')) {
    packagesToAdd.push('\\usepackage{circuitikz}');
    addedNames.push('circuitikz');
    loaded.add('circuitikz');
  }

  // Matematikai áthúzás
  if (/\\(cancel|bcancel|xcancel)\s*\{/.test(fullText) && !loaded.has('cancel')) {
    packagesToAdd.push('\\usepackage{cancel}');
    addedNames.push('cancel');
    loaded.add('cancel');
  }

  // Kémiai képletek
  if (/\\ce\s*\{/.test(fullText) && !loaded.has('mhchem')) {
    packagesToAdd.push('\\usepackage[version=4]{mhchem}');
    addedNames.push('mhchem');
    loaded.add('mhchem');
  }

  // Több hasáb
  if (fullText.includes('multicols') && !loaded.has('multicol')) {
    packagesToAdd.push('\\usepackage{multicol}');
    addedNames.push('multicol');
    loaded.add('multicol');
  }

  // Lebegő ábrák (Beamer diákban nem használható a wrapfigure)
  if (fullText.includes('wrapfigure') && !isBeamer && !loaded.has('wrapfig')) {
    packagesToAdd.push('\\usepackage{wrapfig}');
    addedNames.push('wrapfig');
    loaded.add('wrapfig');
  }

  // Abstract csomag (Beamerben nincs abstract)
  if (fullText.includes('\\begin{abstract}') && !isBeamer && !loaded.has('abstract')) {
    packagesToAdd.push('\\usepackage{abstract}');
    addedNames.push('abstract');
    loaded.add('abstract');
  }

  // 3. Egyedi dobozkörnyezetek és makrók vizsgálata
  const macrosToAdd = [];

  // definiciodoboz
  if (
    (fullText.includes('definiciodoboz') || options.forceCustomBoxes) &&
    !preamble.includes('{definiciodoboz}')
  ) {
    macrosToAdd.push(
      '\\newtcolorbox{definiciodoboz}[1][]{colback=blue!5!white,colframe=blue!75!black,fonttitle=\\bfseries,title=Definíció: #1}'
    );
    addedNames.push('definiciodoboz');
  }

  // teteldoboz
  if (
    (fullText.includes('teteldoboz') || options.forceCustomBoxes) &&
    !preamble.includes('{teteldoboz}')
  ) {
    macrosToAdd.push(
      '\\newtcolorbox{teteldoboz}[1][]{colback=green!10!white,colframe=green!75!black,fonttitle=\\bfseries,title=Tétel: #1}'
    );
    addedNames.push('teteldoboz');
  }

  // torvenydoboz
  if (
    (fullText.includes('torvenydoboz') || options.forceCustomBoxes) &&
    !preamble.includes('{torvenydoboz}')
  ) {
    macrosToAdd.push(
      '\\newtcolorbox{torvenydoboz}[1][]{colback=purple!5!white,colframe=purple!75!black,fonttitle=\\bfseries,title=Fizikai törvény: #1}'
    );
    addedNames.push('torvenydoboz');
  }

  // feladatdoboz (mikrotananyagokhoz és interaktív ellenőrzésekhez)
  if (
    fullText.includes('feladatdoboz') &&
    !preamble.includes('{feladatdoboz}')
  ) {
    macrosToAdd.push(
      '\\newtcolorbox{feladatdoboz}[1][]{colback=orange!5!white,colframe=orange!85!black,fonttitle=\\bfseries,title=Ellenőrző feladat: #1}'
    );
    addedNames.push('feladatdoboz');
  }

  // megoldasdoboz (azonnali visszacsatoláshoz)
  if (
    fullText.includes('megoldasdoboz') &&
    !preamble.includes('{megoldasdoboz}')
  ) {
    macrosToAdd.push(
      '\\newtcolorbox{megoldasdoboz}[1][]{colback=green!5!white,colframe=green!60!black,fonttitle=\\bfseries,title=Megoldás és magyarázat: #1}'
    );
    addedNames.push('megoldasdoboz');
  }

  // tippdoboz
  if (
    fullText.includes('tippdoboz') &&
    !preamble.includes('{tippdoboz}')
  ) {
    macrosToAdd.push(
      '\\newtcolorbox{tippdoboz}[1][]{colback=yellow!10!white,colframe=orange!80!black,fonttitle=\\bfseries,title=Megjegyzés: #1}'
    );
    addedNames.push('tippdoboz');
  }

  // Ha definíciós dobozokat használunk, biztosítjuk a tcolorbox csomagot
  if (macrosToAdd.some(m => m.includes('\\newtcolorbox')) && !loaded.has('tcolorbox')) {
    packagesToAdd.push(isBeamer ? '\\usepackage{tcolorbox}' : '\\usepackage{tcolorbox}\n\\tcbuselibrary{theorems,skins,breakable}');
    addedNames.push('tcolorbox');
    loaded.add('tcolorbox');
  }

  // problem környezet (Beamer alatt a \begin{problem} beépített környezet!)
  if (
    !isBeamer &&
    fullText.includes('{problem}') &&
    !preamble.includes('{problem}')
  ) {
    macrosToAdd.push(
      '\\theoremstyle{definition}\n\\newtheorem*{problem}{Feladat}'
    );
    addedNames.push('problem environment');
  }

  // example környezet (Beamer alatt a \begin{example} beépített környezet!)
  if (
    !isBeamer &&
    fullText.includes('{example}') &&
    !preamble.includes('{example}')
  ) {
    macrosToAdd.push(
      '\\theoremstyle{definition}\n\\newtheorem*{example}{Példa}'
    );
    addedNames.push('example environment');
  }

  // solution környezet (Beamer alatt a \begin{solution} beépített környezet!)
  if (
    !isBeamer &&
    fullText.includes('{solution}') &&
    !preamble.includes('{solution}')
  ) {
    macrosToAdd.push(
      '\\newenvironment{solution}{\\begin{proof}[Megoldás]}{\\end{proof}}'
    );
    addedNames.push('solution environment');
  }

  // \\textbfr makró
  if (fullText.includes('\\textbfr') && !preamble.includes('\\textbfr')) {
    macrosToAdd.push(
      '\\providecommand{\\textbfr}[1]{\\textbf{\\textcolor{red}{#1}}}'
    );
    addedNames.push('\\textbfr');
  }

  // \\mytriangle makró
  if (fullText.includes('\\mytriangle') && !preamble.includes('\\mytriangle')) {
    macrosToAdd.push(
      '\\usepackage{etoolbox}\n\\providecommand{\\mytriangle}[1]{\\tikz{\\filldraw[draw=#1,fill=#1,rotate=-90] (0,0)--(0.2cm,0)--(0.1cm,0.2cm)--cycle;}}'
    );
    addedNames.push('\\mytriangle');
  }

  // dotMarkRightAngle geometriai derékszög jelölés
  if (fullText.includes('\\dotMarkRightAngle') && !preamble.includes('\\dotMarkRightAngle')) {
    macrosToAdd.push(
`\\def\\dotMarkRightAngle[size=#1](#2,#3,#4){%
 \\draw ($(#3)!#1!(#2)$) -- 
       ($($(#3)!#1!(#2)$)!#1!90:(#2)$) --
       ($(#3)!#1!(#4)$);
 \\path (#3)--node[circle,fill,inner sep=.5pt]{} ($($(#3)!#1!(#2)$)!#1!90:(#2)$);
}`
    );
    addedNames.push('\\dotMarkRightAngle');
  }

  // Ha nincs mit hozzáadni, visszatérünk az eredetivel
  if (packagesToAdd.length === 0 && macrosToAdd.length === 0) {
    return { supplementedPreamble: preamble, addedPackages: [] };
  }

  // 4. Intelligens beillesztés:
  // A csomagokat érdemes a hyperref ELÉ tenni (LaTeX szabály), vagy a preambulum végére.
  let supplemented = preamble;
  const hyperrefMatch = supplemented.match(/\\usepackage(?:\s*\[[^\]]*\])?\{hyperref\}/);

  let insertionBlock = '';
  if (packagesToAdd.length > 0) {
    insertionBlock += `\n%%% Megjelenítéshez automatikusan kiegészített csomagok %%%\n${packagesToAdd.join('\n')}\n`;
  }
  if (macrosToAdd.length > 0) {
    insertionBlock += `\n%%% Megjelenítéshez kiegészített dobozok és makrók %%%\n${macrosToAdd.join('\n')}\n`;
  }

  if (hyperrefMatch && hyperrefMatch.index !== undefined) {
    // Beszúrjuk a hyperref elé
    const idx = hyperrefMatch.index;
    supplemented = supplemented.slice(0, idx) + insertionBlock + '\n' + supplemented.slice(idx);
  } else {
    // Ha nincs hyperref, adjuk a preambulum végéhez, és zárjuk le hyperref-fel
    if (!loaded.has('hyperref')) {
      insertionBlock += `\n\\usepackage{hyperref}\n`;
      addedNames.push('hyperref');
    }
    supplemented = `${supplemented}\n${insertionBlock}`.trim();
  }

  // Ha van \maketitle a törzsben, de nincs \author megadva, adjunk hozzá üres \author{}-t,
  // megelőzve a "LaTeX Warning: No \author given." figyelmeztetést
  if (body.includes('\\maketitle') && !supplemented.includes('\\author')) {
    supplemented = `${supplemented}\n\\author{}`;
  }

  return {
    supplementedPreamble: supplemented.trim(),
    addedPackages: addedNames
  };
}

/**
 * Beállítja vagy lecseréli a LaTeX dokumentum címét (\title{...}) a megadott címre/témakörre.
 */
function replaceLatexTitle(latexCode, newTitle) {
  if (!newTitle || !newTitle.trim() || !latexCode) return latexCode;
  const cleanTitle = newTitle.trim();

  const titleIdx = latexCode.indexOf('\\title');
  if (titleIdx !== -1) {
    let pos = titleIdx + 6;
    while (pos < latexCode.length && /\s/.test(latexCode[pos])) pos++;
    if (pos < latexCode.length && latexCode[pos] === '[') {
      let bCount = 1;
      pos++;
      while (pos < latexCode.length && bCount > 0) {
        if (latexCode[pos] === '[') bCount++;
        else if (latexCode[pos] === ']') bCount--;
        pos++;
      }
    }
    while (pos < latexCode.length && /\s/.test(latexCode[pos])) pos++;
    if (pos < latexCode.length && latexCode[pos] === '{') {
      let depth = 1;
      pos++;
      while (pos < latexCode.length && depth > 0) {
        if (latexCode[pos] === '{') depth++;
        else if (latexCode[pos] === '}') depth--;
        pos++;
      }
      if (depth === 0) {
        return latexCode.slice(0, titleIdx) + `\\title{${cleanTitle}}` + latexCode.slice(pos);
      }
    }
  }

  // Ha nem volt \title, de van \begin{document}
  const docStart = latexCode.indexOf('\\begin{document}');
  if (docStart !== -1) {
    return `${latexCode.slice(0, docStart).trim()}\n\n\\title{${cleanTitle}}\n\\author{AI LaTeX Studio}\n\\date{\\today}\n\n${latexCode.slice(docStart)}`;
  }

  return `\\title{${cleanTitle}}\n\n${latexCode}`;
}

/**
 * Teljes LaTeX dokumentum kiegészítése a megjelenítéshez szükséges csomagokkal.
 * Ha customPreamble is meg van adva, biztosítja, hogy a customPreamble legyen
 * az alap, kiegészítve a hiányzó megjelenítési csomagokkal és az AI által
 * esetlegesen generált új csomagokkal/makrókkal.
 * Ha topic is meg van adva, a \title{...} garantáltan a témakör lesz.
 */
function supplementFullLatex(fullLatex = '', customPreamble = null, topic = null) {
  if (!fullLatex || typeof fullLatex !== 'string') return fullLatex;

  let workingLatex = fullLatex;
  if (topic && topic.trim()) {
    workingLatex = replaceLatexTitle(workingLatex, topic.trim());
  }

  const { preamble: currentPreamble, body, docStartIdx } = splitPreambleAndBody(workingLatex);
  const isBeamer = /\\documentclass(?:\[[^\]]*\])?\{beamer\}/i.test(workingLatex);

  // Ha van saját preambulum specifikálva (pl. AI generáláskor kiválasztott)
  let basePreamble = customPreamble && customPreamble.trim() ? customPreamble.trim() : currentPreamble;

  // Ha a fullLatex tartalmazott olyan csomagokat vagy definíciókat a preambulumban,
  // amit az AI generált hozzá, vonjuk össze őket
  if (customPreamble && currentPreamble && currentPreamble !== customPreamble) {
    const customPkgs = extractLoadedPackages(customPreamble);
    const currentPkgs = extractLoadedPackages(currentPreamble);

    // Kikeressük az AI által hozzáadott extra \usepackage és \new... sorokat
    const extraLines = [];
    const lines = currentPreamble.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('%')) continue;
      if (trimmed.startsWith('\\usepackage')) {
        // megnézzük, szerepelt-e
        const match = trimmed.match(/\\usepackage(?:\s*\[[^\]]*\])?\s*\{([^}]+)\}/);
        if (match) {
          const names = match[1].split(',').map(n => n.trim().toLowerCase());
          if (isBeamer && (names.includes('enumitem') || names.includes('enumerate') || names.includes('paralist') || names.includes('geometry') || names.includes('float') || names.includes('caption') || names.includes('amsthm'))) {
            continue;
          }
          const hasNew = names.some(n => !customPkgs.has(n));
          if (hasNew && !basePreamble.includes(trimmed)) {
            extraLines.push(trimmed);
          }
        }
      } else if (
        (trimmed.startsWith('\\newtcolorbox') ||
         trimmed.startsWith('\\newcommand') ||
         trimmed.startsWith('\\newenvironment') ||
         trimmed.startsWith('\\newtheorem') ||
         trimmed.startsWith('\\usetikzlibrary') ||
         trimmed.startsWith('\\tcbuselibrary')) &&
        !basePreamble.includes(trimmed)
      ) {
        if (isBeamer && (trimmed.includes('{problem}') || trimmed.includes('{example}') || trimmed.includes('{solution}'))) {
          continue;
        }
        extraLines.push(trimmed);
      }
    }

    if (extraLines.length > 0) {
      basePreamble = `${basePreamble}\n\n% AI által javasolt kiegészítések:\n${extraLines.join('\n')}`;
    }
  }

  // Végrehajtjuk az automatikus megjelenítési kiegészítést
  const { supplementedPreamble } = supplementPreamble(basePreamble, body);

  let cleanBody = sanitizeLatexNumbering(body);
  if (isBeamer) {
    cleanBody = removePackageFromPreamble(cleanBody, 'enumitem');
    cleanBody = removePackageFromPreamble(cleanBody, 'enumerate');
    cleanBody = removePackageFromPreamble(cleanBody, 'paralist');
    cleanBody = removePackageFromPreamble(cleanBody, 'geometry');
    cleanBody = removePackageFromPreamble(cleanBody, 'float');
  }

  let finalDoc = '';
  if (docStartIdx !== -1 && cleanBody) {
    finalDoc = `${supplementedPreamble}\n\n${cleanBody}`.trim();
  } else if (!fullLatex.includes('\\begin{document}')) {
    if (isBeamer) {
      finalDoc = `${supplementedPreamble}\n\n\\begin{document}\n\\frame{\\titlepage}\n\n\\begin{frame}{Bevezetés}\nIde jön a tartalom...\n\\end{frame}\n\n\\end{document}`;
    } else {
      finalDoc = `${supplementedPreamble}\n\n\\begin{document}\n\\maketitle\n\n\\section{Bevezetés}\nIde jön a tartalom...\n\n\\end{document}`;
    }
  } else {
    finalDoc = supplementedPreamble;
  }

  if (topic && topic.trim()) {
    finalDoc = replaceLatexTitle(finalDoc, topic.trim());
  }

  return finalDoc;
}

module.exports = {
  extractLoadedPackages,
  splitPreambleAndBody,
  supplementPreamble,
  supplementFullLatex,
  replaceLatexTitle,
  sanitizeLatexNumbering,
  CORE_DISPLAY_PACKAGES
};
