/**
 * latexNumberingHelper.js
 *
 * Intelligens LaTeX számozás-tisztító és duplikáció-megelőző segédprogram.
 *
 * Problémák:
 * 1. Fejezetcímek kettős számozása:
 *    A LaTeX számozott fejezetparancsai (\part, \chapter, \section, \subsection, \subsubsection,
 *    \paragraph, \subparagraph) eleve automatikusan kirakják a hierarchikus sorszámot (pl. "1. ", "2. ", "1.1. ").
 *    Ha az AI vagy sablon a címbe is beírja a sorszámot:
 *      \section{1. Mikor használjuk?}
 *    akkor a PDF-ben ronda kettős számozás keletkezik: "1. 1. Mikor használjuk?".
 *    Ez a modul automatikusan eltávolítja a kézi sorszám-prefixeket a számozott fejezetekből:
 *      \section{1. Mikor használjuk?} -> \section{Mikor használjuk?}
 *      \subsection{1.1. Részletek}    -> \subsection{Részletek}
 *      \section{1. fejezet: Bevezetés} -> \section{Bevezetés}
 *    A csillagozott címeket (\section*{...}) NEM bántja, mivel azoknak nincs automatikus számlálójuk!
 *
 * 2. Számozott listák (\begin{enumerate}...) kettős számozása:
 *    Amikor az AI számozott listát hoz létre, az enumerate lista maga kirakja a sorszámot/betűt.
 *    Ez a modul eltávolítja a redundáns sorszámokat az \item elemek után:
 *      \item \textbf{1. Feladat} -> \item \textbf{Feladat}
 *      \item \textbf{1. Feladat megoldása} -> \item \textbf{Feladat megoldása}
 *      \item \textbf{1.} -> \item
 *      \item a) Kérdés... -> \item Kérdés...
 *
 * 3. AI listaelem elgépelések javítása:
 *    Ha az AI ritkán elírja az \item parancsot (pl. "utoitem" vagy "\autoitem" lista belsejében),
 *    azt automatikusan visszajavítja szabványos \item-re.
 */

/**
 * Megtisztítja a fejezetcímet a manuális sorszám-prefixektől.
 * Pl.: "1. Mikor használjuk?" -> "Mikor használjuk?"
 *      "1.1. Alapfogalmak"    -> "Alapfogalmak"
 *      "1. fejezet: Cím"      -> "Cím"
 *      "1 - Alapok"           -> "Alapok"
 *      "I. Bevezetés"         -> "Bevezetés"
 *      "\textbf{1. Cím}"      -> "\textbf{Cím}"
 *
 * Megőrzi a nem-sorszám kifejezéseket: pl. "3D modellezés", "2024-es érettségi", "100 lépés".
 *
 * @param {string} title
 * @returns {string}
 */
function cleanSectionTitle(title) {
  if (!title) return title;

  let t = title.trim();

  // Ha a cím \textbf{...} vagy egyéb formázó dobozba van csomagolva:
  const boldWrap = t.match(/^\\textbf\{([\s\S]*)\}$/);
  if (boldWrap) {
    const innerClean = cleanSectionTitle(boldWrap[1]);
    return innerClean ? `\\textbf{${innerClean}}` : t;
  }

  const cleaned = t
    .replace(/^(\s*)(?:\d{1,2}(?:\.\d{1,2})+\.?|\d{1,2}\.|\b[IVXLCDM]+\.)\s*(?:\b(?:fejezet|rész|szakasz)\b\s*[:.-]?\s*)?/i, '$1')
    .replace(/^(\s*)\d{1,2}\s*[:\-–—]\s*/, '$1')
    .trim();

  // Ha véletlenül a teljes cím törlődne (mert pl. csak egy szám volt a cím), tartsuk meg az eredetit
  return cleaned || t;
}

/**
 * Kinyeri a kapcsos zárójelek közötti szöveget a beágyazott zárójelek és escape-ek figyelembevételével.
 *
 * @param {string} text
 * @param {number} startIdx A nyitó kapcsos zárójel utáni karakter indexe
 * @returns {{ content: string, endIdx: number } | null}
 */
function extractBalancedBrace(text, startIdx) {
  let depth = 1;
  let i = startIdx;
  while (i < text.length && depth > 0) {
    if (text[i] === '\\') {
      i += 2; // átugorjuk az escape-elt karaktert (pl. \{ vagy \})
      continue;
    }
    if (text[i] === '{') depth++;
    else if (text[i] === '}') depth--;
    if (depth === 0) return { content: text.slice(startIdx, i), endIdx: i };
    i++;
  }
  return null;
}

/**
 * Eltávolítja a manuális sorszámokat a számozott fejezetcímekből (\section, \subsection, stb.).
 * Csak a nem-csillagozott parancsokat módosítja!
 *
 * @param {string} latex
 * @returns {string}
 */
function sanitizeSectionHeadings(latex) {
  if (!latex || typeof latex !== 'string') return latex;

  let result = '';
  let lastIndex = 0;
  // Csak nem-csillagozott part, chapter, section, subsection, subsubsection, paragraph, subparagraph
  const secRegex = /\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)(?:\s*)(\{)/g;
  let m;

  while ((m = secRegex.exec(latex)) !== null) {
    const cmd = m[1];
    const braceStart = secRegex.lastIndex;
    const braceResult = extractBalancedBrace(latex, braceStart);

    if (braceResult) {
      result += latex.slice(lastIndex, m.index);
      const rawTitle = braceResult.content;
      const cleaned = cleanSectionTitle(rawTitle);
      result += `\\${cmd}{${cleaned}}`;
      lastIndex = braceResult.endIdx + 1;
      secRegex.lastIndex = lastIndex;
    }
  }

  result += latex.slice(lastIndex);
  return result;
}

/**
 * Javítja az AI elgépeléseket a listaelemek elején (pl. "utoitem" vagy "\autoitem" -> "\item").
 *
 * @param {string} latex
 * @returns {string}
 */
function sanitizeListTypo(latex) {
  if (!latex || typeof latex !== 'string') return latex;

  return latex.replace(/(\\begin\{(?:itemize|enumerate)\}[\s\S]*?\\end\{(?:itemize|enumerate)\})/g, (block) => {
    return block.replace(/(^|\n)(\s*)\\?(?:utoitem|autoitem)\b/g, '$1$2\\item');
  });
}

/**
 * Megtisztítja a LaTeX kódot a számozott listákban (\begin{enumerate}) előforduló
 * felesleges dupla számozásoktól.
 *
 * @param {string} latex
 * @returns {string}
 */
function sanitizeEnumerateItems(latex) {
  if (!latex || typeof latex !== 'string') return latex;

  let result = '';
  let lastIndex = 0;
  const enumStack = [];

  // Tokenek: \begin{enumerate...}, \end{enumerate...}, \begin{itemize...}, \end{itemize...}, \item
  const regex = /(\\begin\{(?:enumerate|itemize|description)\}(?:\[[^\]]*\])?)|(\\end\{(?:enumerate|itemize|description)\})|(\\item(?:\s*\[[^\]]*\])?)/g;

  let match;
  while ((match = regex.exec(latex)) !== null) {
    result += latex.slice(lastIndex, match.index);
    const matchedText = match[0];

    if (matchedText.startsWith('\\begin{enumerate}')) {
      const optMatch = matchedText.match(/\[([^\]]*)\]/);
      const optArg = optMatch ? optMatch[1] : '';
      const hasFeladatInLabel = /\b(?:feladat|példa)\b/i.test(optArg);
      enumStack.push({ optArg, hasFeladatInLabel });
      result += matchedText;
      lastIndex = regex.lastIndex;
    } else if (matchedText === '\\end{enumerate}') {
      if (enumStack.length > 0) enumStack.pop();
      result += matchedText;
      lastIndex = regex.lastIndex;
    } else if (matchedText.startsWith('\\begin{') || matchedText.startsWith('\\end{')) {
      result += matchedText;
      lastIndex = regex.lastIndex;
    } else if (matchedText.startsWith('\\item') && enumStack.length > 0) {
      if (matchedText.includes('[')) {
        // Ha a szerző egyedi címkét adott meg: \item[\textbf{1.}], azt tiszteletben tartjuk
        result += matchedText;
        lastIndex = regex.lastIndex;
        continue;
      }

      const currentEnum = enumStack[enumStack.length - 1];
      const remaining = latex.slice(regex.lastIndex);

      let replaced = false;

      // 1. Félkövér számozás feladatszóval vagy anélkül:
      // pl. \item \textbf{1. Feladat} vagy \textbf{1. Feladat megoldása} vagy \textbf{1.} vagy \textbf{1. feladat:}
      const boldMatch = remaining.match(/^(\s*)\\textbf\{(\s*\d{1,2}\.\s*(?:(?:feladat|példa)(?:\s+(?:megoldása|kidolgozása))?|megoldás)?\s*(?::|-)?\s*)\}/i);
      if (boldMatch) {
        const leadingSpaces = boldMatch[1] || ' ';
        const inner = boldMatch[2].trim();
        const stripped = inner.replace(/^\d{1,2}\.\s*/, '').trim();

        const afterMatch = latex.slice(regex.lastIndex + boldMatch[0].length);
        const needsSpace = !/^\s/.test(afterMatch);

        if (currentEnum.hasFeladatInLabel) {
          // Ha a címke (label) már eleve kiírja hogy "Feladat", nem kell még egyszer
          if (!stripped || /^(?:feladat|példa):?$/i.test(stripped)) {
            result += matchedText + (needsSpace ? ' ' : '');
          } else {
            result += matchedText + leadingSpaces + `\\textbf{${stripped}}` + (needsSpace ? ' ' : '');
          }
        } else {
          if (!stripped) {
            result += matchedText + (needsSpace ? ' ' : '');
          } else {
            result += matchedText + leadingSpaces + `\\textbf{${stripped}}` + (needsSpace ? ' ' : '');
          }
        }
        lastIndex = regex.lastIndex + boldMatch[0].length;
        regex.lastIndex = lastIndex;
        replaced = true;
      }

      // 2. Félkövér alpont-számlálók: \textbf{a)} vagy \textbf{(a)} vagy \textbf{a.)} vagy \textbf{1)}
      if (!replaced) {
        const boldSubMatch = remaining.match(/^(\s*)\\textbf\{(\s*(?:[a-zA-Z]\)|\([a-zA-Z]\)|[a-zA-Z]\.(?:\))?|\d{1,2}\)|\(\d{1,2}\)|\d{1,2}\.\))\s*)\}/i);
        if (boldSubMatch) {
          const afterMatch = latex.slice(regex.lastIndex + boldSubMatch[0].length);
          const needsSpace = !/^\s/.test(afterMatch);
          result += matchedText + (needsSpace ? ' ' : '');
          lastIndex = regex.lastIndex + boldSubMatch[0].length;
          regex.lastIndex = lastIndex;
          replaced = true;
        }
      }

      // 3. Nem félkövér feladatszámozás: pl. \item 1. Feladat: vagy \item 1. Feladat vagy \item 1.
      if (!replaced) {
        const plainFeladatMatch = remaining.match(/^(\s*)(\d{1,2}\.\s*(?:(?:feladat|példa)(?:\s+(?:megoldása|kidolgozása))?|megoldás)?\s*(?::|-)?\s*)/i);
        if (plainFeladatMatch) {
          const leadingSpaces = plainFeladatMatch[1] || ' ';
          const text = plainFeladatMatch[2].trim();
          const stripped = text.replace(/^\d{1,2}\.\s*/, '').trim();

          const afterMatch = latex.slice(regex.lastIndex + plainFeladatMatch[0].length);
          const needsSpace = !/^\s/.test(afterMatch);

          if (currentEnum.hasFeladatInLabel) {
            if (!stripped || /^(?:feladat|példa):?$/i.test(stripped)) {
              result += matchedText + (needsSpace ? ' ' : '');
            } else {
              result += matchedText + leadingSpaces + `\\textbf{${stripped}}` + (needsSpace ? ' ' : '');
            }
          } else {
            if (!stripped) {
              result += matchedText + (needsSpace ? ' ' : '');
            } else {
              result += matchedText + leadingSpaces + `\\textbf{${stripped}}` + (needsSpace ? ' ' : '');
            }
          }
          lastIndex = regex.lastIndex + plainFeladatMatch[0].length;
          regex.lastIndex = lastIndex;
          replaced = true;
        }
      }

      // 4. Nem félkövér alkérdés-számlálók: a) vagy (a) vagy a.) vagy a. (szóköz előtt) vagy 1) stb.
      if (!replaced) {
        const plainSubMatch = remaining.match(/^(\s*)(?:[a-zA-Z]\)|\([a-zA-Z]\)|[a-zA-Z]\.\)|[a-zA-Z]\.(?=\s)|\d{1,2}\)|\(\d{1,2}\)|\d{1,2}\.\))\s*/i);
        if (plainSubMatch) {
          const afterMatch = latex.slice(regex.lastIndex + plainSubMatch[0].length);
          const needsSpace = !/^\s/.test(afterMatch);
          result += matchedText + (needsSpace ? ' ' : '');
          lastIndex = regex.lastIndex + plainSubMatch[0].length;
          regex.lastIndex = lastIndex;
          replaced = true;
        }
      }

      if (!replaced) {
        result += matchedText;
        lastIndex = regex.lastIndex;
      }
    } else {
      result += matchedText;
      lastIndex = regex.lastIndex;
    }
  }

  result += latex.slice(lastIndex);
  return result;
}

/**
 * Fő számozás-szanáló függvény: megtisztítja a LaTeX kódot mind a fejezetcímek,
 * mind a számozott listák felesleges dupla számozásaitól és gépelési hibáitól.
 *
 * @param {string} latex
 * @returns {string}
 */
function sanitizeLatexNumbering(latex) {
  if (!latex || typeof latex !== 'string') return latex;

  // 1. Fejezetcímek kettős számozásának szanálása (\section{1. Cím} -> \section{Cím})
  let cleaned = sanitizeSectionHeadings(latex);

  // 2. Elgépelt listaelemek javítása (utoitem / \autoitem -> \item)
  cleaned = sanitizeListTypo(cleaned);

  // 3. Számozott listaelemek kettős számozásának szanálása
  cleaned = sanitizeEnumerateItems(cleaned);

  return cleaned;
}

module.exports = {
  sanitizeLatexNumbering,
  cleanSectionTitle,
  sanitizeSectionHeadings,
  sanitizeListTypo,
  sanitizeEnumerateItems
};
