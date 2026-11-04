/**
 * latexNumberingHelper.js
 *
 * Intelligens LaTeX számozás-tisztító és duplikáció-megelőző segédprogram.
 *
 * Probléma:
 * Amikor az AI számozott listát (\begin{enumerate}...) hoz létre, a lista környezet
 * eleve automatikusan kirakja az elemek számozását (pl. 1., 2., ... vagy a), b), ...).
 * Ha a modell az \item után kiírja kézzel is a sorszámot:
 *   \item \textbf{1. Feladat} \textsf{\small [K1 – Alap]}
 * akkor a lefordított PDF-ben ronda dupla számozás keletkezik: "1. 1. Feladat [K1 – Alap]".
 * Hasonlóan alpontoknál:
 *   \begin{enumerate}[label=\alph*)]
 *       \item a) Kérdés...
 * eredménye: "a) a) Kérdés...".
 *
 * Ez a modul felderíti a \begin{enumerate} környezeteket, és megtisztítja az \item elemeket
 * a felesleges redundáns számozástól:
 * - \item \textbf{1. Feladat} -> \item \textbf{Feladat} (ha a label-ben nincs benne a Feladat szó)
 * - \item \textbf{1. Feladat} -> \item (ha a label pl. label=\textbf{\arabic*. Feladat})
 * - \item \textbf{1. Feladat megoldása} -> \item \textbf{Feladat megoldása}
 * - \item \textbf{1.} -> \item
 * - \item 1. Feladat -> \item \textbf{Feladat}
 * - \item 1. -> \item
 * - \item a) -> \item
 * - \item (a) -> \item
 * - \item \textbf{a)} -> \item
 */

/**
 * Megtisztítja a LaTeX kódot a számozott listákban (\begin{enumerate}) előforduló
 * felesleges dupla számozásoktól.
 *
 * @param {string} latex
 * @returns {string}
 */
function sanitizeLatexNumbering(latex) {
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

module.exports = {
  sanitizeLatexNumbering
};
