/**
 * latexBlockFinder.js
 * Segédfüggvények a SyncTeX és a PDF-ből kinyert szöveg alapján a kijelölt
 * LaTeX elemek (kifejezés, lista-elem, TikZ csomópont, egyenlet, bekezdés) precíz azonosításához.
 */

// Konténer környezetek, amelyekbe TILOS automatikusan felbővíteni egy kijelölést,
// mert a felhasználó csak egy belső elemet (pl. egyetlen \item-et vagy \node-ot) szeretne szerkeszteni.
const CONTAINER_ENVS = new Set([
  'document',
  'center',
  'flushleft',
  'flushright',
  'minipage',
  'multicols',
  'multicols*',
  'tcolorbox',
  'mdframed',
  'frame',
  'columns',
  'column',
  'enumerate',
  'itemize',
  'description',
  'quote',
  'quotation',
  'table',
  'figure'
])

// Önálló matematikai és táblázat környezetek, amelyek mint egyetlen blokk értelmezendők
const SELF_CONTAINED_ENVS = new Set([
  'equation',
  'equation*',
  'align',
  'align*',
  'gather',
  'gather*',
  'multline',
  'multline*',
  'tabular',
  'tabular*',
  'array',
  'matrix',
  'pmatrix',
  'bmatrix',
  'vmatrix',
  'Vmatrix'
])

/**
 * Kiszámítja egy \item listaelem határait és tiszta címét,
 * figyelembe véve az esetleges beágyazott listákat (\begin{itemize}, stb.).
 */
export function getItemBounds(lines, itemIdx) {
  let fDepth = 0
  let itemEnd = itemIdx
  const total = lines.length

  for (let k = itemIdx + 1; k < total; k++) {
    const kl = lines[k].trim()
    if (kl.startsWith('\\begin{itemize}') || kl.startsWith('\\begin{enumerate}') || kl.startsWith('\\begin{description}')) {
      fDepth++
    } else if (kl.startsWith('\\end{itemize}') || kl.startsWith('\\end{enumerate}') || kl.startsWith('\\end{description}')) {
      if (fDepth > 0) {
        fDepth--
      } else {
        itemEnd = k - 1
        break
      }
    } else if (kl.startsWith('\\item')) {
      if (fDepth === 0) {
        itemEnd = k - 1
        break
      }
    }
    itemEnd = k
  }

  while (itemEnd > itemIdx && lines[itemEnd].trim() === '') {
    itemEnd--
  }

  const rawTitle = lines[itemIdx]
    .replace(/^\\item\s*/, '')
    .replace(/\\\\.*$/, '')
    .replace(/\\textbf\{([^}]*)\}/g, '$1')
    .replace(/\\textit\{([^}]*)\}/g, '$1')
    .replace(/[{}]/g, '')
    .trim()

  return {
    startLine: itemIdx + 1,
    endLine: itemEnd + 1,
    title: rawTitle.slice(0, 80)
  }
}

/**
 * Megkeresi a kódsort tartalmazó legkülső feladatot / listaelemet (pl. "2. A ragasztós trükk...").
 * Ez különösen hasznos, ha a feladat több oldalon át ível (TikZ ábra az egyik oldalon, pontok a másikon).
 */
export function findEnclosingTask(lines, lineIdx) {
  if (!lines || lineIdx < 0 || lineIdx >= lines.length) return null

  let depth = 0
  const items = []
  const maxLookback = Math.max(0, lineIdx - 180)

  for (let i = lineIdx; i >= maxLookback; i--) {
    const l = lines[i].trim()
    if (l.startsWith('\\end{itemize}') || l.startsWith('\\end{enumerate}') || l.startsWith('\\end{description}')) {
      depth++
    } else if (l.startsWith('\\begin{itemize}') || l.startsWith('\\begin{enumerate}') || l.startsWith('\\begin{description}')) {
      if (depth > 0) {
        depth--
      }
    } else if (l.startsWith('\\item')) {
      if (depth === 0) {
        const bounds = getItemBounds(lines, i)
        if (bounds.startLine <= lineIdx + 1 && bounds.endLine >= lineIdx + 1) {
          items.push(bounds)
        }
      }
    }
  }

  if (items.length > 0) {
    // A legtöbb sort lefedő (legkülső, teljes feladat) elemet részesítjük előnyben
    items.sort((a, b) => (b.endLine - b.startLine) - (a.endLine - a.startLine))
    return items[0]
  }

  return null
}
function cleanLatex(str) {
  if (!str) return ''
  return str
    .replace(/\\\w+(\[[^\]]*\])?(\{[^}]*\})?/g, ' ')
    .replace(/[{}\\$%&#^_~]/g, ' ')
    .replace(/[«»„”"'’`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * Keresés a LaTeX sorok között a PDF-ben kijelölt konkrét szöveg alapján.
 * Visszaadja a legjobban egyező [startLine, endLine] tartományt.
 */
export function findBestTextMatch(lines, pdfText, hintLine) {
  if (!lines || !pdfText) return null
  const targetClean = cleanLatex(pdfText)
  const targetWords = targetClean.split(' ').filter((w) => w.length > 1)
  if (targetWords.length === 0) return null

  let bestScore = -Infinity
  let bestRange = null

  const center = hintLine ? Math.max(0, Math.min(hintLine - 1, lines.length - 1)) : Math.floor(lines.length / 2)
  const maxDist = hintLine ? 80 : lines.length

  for (let i = 0; i < lines.length; i++) {
    if (Math.abs(i - center) > maxDist) continue

    let windowText = ''
    for (let len = 1; len <= 10 && i + len <= lines.length; len++) {
      windowText += (windowText ? ' ' : '') + cleanLatex(lines[i + len - 1])

      let matches = 0
      for (const w of targetWords) {
        if (windowText.includes(w)) matches++
      }

      const recall = matches / targetWords.length
      const dist = Math.abs(i - center)
      const score = recall * 100 - dist * 0.08 - len * 0.15

      if (recall >= 0.4 && score > bestScore) {
        bestScore = score
        bestRange = { startLine: i + 1, endLine: i + len, recall }
      }
    }
  }

  return bestRange
}

/**
 * Összes TikZ és LaTeX vektorgrafikus ábra kinyerése a forráskódból sorszámokkal és címekkel.
 */
export function extractAllFigures(code) {
  if (!code || typeof code !== 'string') return []
  const lines = code.split('\n')
  const total = lines.length
  const figures = []

  for (let i = 0; i < total; i++) {
    const l = lines[i]
    if (l.includes('\\begin{tikzpicture}')) {
      let startLine = i + 1
      let endLine = i + 1

      // Ha közvetlenül előtte \begin{center} vagy \begin{figure} van
      if (i > 0 && (lines[i - 1].includes('\\begin{center}') || lines[i - 1].includes('\\begin{figure}'))) {
        startLine = i
      }

      // Lezárás megkeresése
      for (let j = i; j < total; j++) {
        if (lines[j].includes('\\end{tikzpicture}')) {
          endLine = j + 1
          if (j + 1 < total && (lines[j + 1].includes('\\end{center}') || lines[j + 1].includes('\\end{figure}'))) {
            endLine = j + 2
          }
          break
        }
      }

      // Cím vagy kontextus felderítése a megelőző sorokból
      let title = `TikZ ábra (${startLine}–${endLine}. sor)`
      for (let k = Math.max(0, startLine - 6); k < startLine - 1; k++) {
        const kl = lines[k].trim()
        if (kl.startsWith('%')) {
          const cleanComment = kl.replace(/^%+\s*/, '').trim()
          if (cleanComment.length > 2) {
            title = cleanComment.slice(0, 50)
            break
          }
        } else if (kl.includes('\\caption{')) {
          const cm = kl.match(/\\caption\{([^}]+)\}/)
          if (cm && cm[1]) {
            title = cm[1].slice(0, 50)
            break
          }
        } else if (kl.startsWith('\\section') || kl.startsWith('\\subsection')) {
          const sm = kl.match(/\\(?:sub)*section\*?\{([^}]+)\}/)
          if (sm && sm[1]) {
            title = `Ábra: ${sm[1].slice(0, 40)}`
          }
        }
      }

      const snippet = lines.slice(startLine - 1, endLine).join('\n')
      const figureIdx = figures.length + 1
      figures.push({
        id: `fig-${startLine}`,
        index: figureIdx,
        startLine,
        endLine,
        lineCount: endLine - startLine + 1,
        title,
        snippet: snippet.slice(0, 160),
        code: snippet,
        selectedText: snippet,
        isFigure: true
      })

      i = endLine - 1
    }
  }

  return figures
}

/**
 * Megkeresi a LaTeX kódban a megadott sorszámtartományt ([startLine, endLine])
 * és/vagy a PDF-ben kijelölt konkrét szöveget (pdfText) precízen lefedő logikai egységet.
 *
 * @param {string} code Teljes LaTeX forráskód
 * @param {number} [startLine] Kezdő kódsor (1-alapú indexelés)
 * @param {number} [endLine] Záró kódsor (1-alapú indexelés)
 * @param {string} [pdfText] A PDF-en a kijelölési doboz által lefedett valódi szöveg
 * @returns {{ startLine: number, endLine: number, selectedText: string, type: string, isFigure?: boolean, env?: string } | null}
 */
export function findLatexBlockAroundRange(code, startLine, endLine, pdfText = '') {
  if (!code) return null

  const lines = code.split('\n')
  const totalLines = lines.length

  // 1. Prioritás: Ha a felhasználó szöveget jelölt ki a PDF-en, a szövegegyeztetés a legpontosabb!
  if (pdfText && pdfText.trim().length > 2) {
    const textMatch = findBestTextMatch(lines, pdfText, startLine)
    if (textMatch && textMatch.recall >= 0.4) {
      startLine = textMatch.startLine
      endLine = textMatch.endLine
    }
  }

  if (!startLine && !endLine) return null
  if (!startLine) startLine = endLine
  if (!endLine) endLine = startLine

  let sIdx = Math.max(0, Math.min(startLine - 1, totalLines - 1))
  let eIdx = Math.max(0, Math.min(endLine - 1, totalLines - 1))
  if (sIdx > eIdx) [sIdx, eIdx] = [eIdx, sIdx]

  // Enclosing task (pl. teljes feladat / külső számozott \item), amely összefoghat több oldalt
  const enclosingTask = findEnclosingTask(lines, sIdx)

  // 0. Prioritás: TikZ Ábra felismerés - Ha a kijelölési tartomány egy TikZ ábrát metsz vagy abba esik
  const allFigures = extractAllFigures(code)
  for (const fig of allFigures) {
    const fStart = fig.startLine - 1
    const fEnd = fig.endLine - 1
    if ((sIdx >= fStart && sIdx <= fEnd) || (eIdx >= fStart && eIdx <= fEnd) || (sIdx <= fStart && eIdx >= fEnd)) {
      return {
        type: 'tikz_figure',
        isFigure: true,
        env: 'tikzpicture',
        startLine: fig.startLine,
        endLine: fig.endLine,
        selectedText: fig.selectedText,
        title: fig.title,
        enclosingTask
      }
    }
  }

  // 2. Ellenőrizzük, hogy listaelemben (\item) vagyunk-e
  let itemStart = -1
  let backwardDepth = 0
  for (let i = sIdx; i >= Math.max(0, sIdx - 40); i--) {
    const l = lines[i].trim()
    if (l.startsWith('\\end{itemize}') || l.startsWith('\\end{enumerate}') || l.startsWith('\\end{description}')) {
      backwardDepth++
    } else if (l.startsWith('\\begin{itemize}') || l.startsWith('\\begin{enumerate}') || l.startsWith('\\begin{description}')) {
      if (backwardDepth > 0) {
        backwardDepth--
      } else {
        break
      }
    } else if (l.startsWith('\\item')) {
      if (backwardDepth === 0) {
        itemStart = i
        break
      }
    }
  }

  if (itemStart !== -1) {
    const bounds = getItemBounds(lines, itemStart)
    return {
      type: 'list_item',
      startLine: bounds.startLine,
      endLine: bounds.endLine,
      selectedText: lines.slice(bounds.startLine - 1, bounds.endLine).join('\n'),
      enclosingTask
    }
  }

  // 3. Ellenőrizzük, hogy TikZ csomópontban vagy rajzelemben (\node, \draw, \path) vagyunk-e
  let nodeStart = -1
  for (let i = sIdx; i >= Math.max(0, sIdx - 15); i--) {
    const l = lines[i]
    if (l.includes('\\node') || l.includes('\\draw') || l.includes('\\path') || l.includes('\\fill')) {
      nodeStart = i
      break
    }
    if (l.includes('\\begin{tikzpicture}')) break
  }

  if (nodeStart !== -1) {
    let nodeEnd = nodeStart
    for (let i = nodeStart; i < totalLines; i++) {
      if (lines[i].includes(';')) {
        nodeEnd = i
        break
      }
      if (lines[i].includes('\\end{tikzpicture}')) {
        nodeEnd = i - 1
        break
      }
    }
    if (nodeEnd >= sIdx) {
      return {
        type: 'tikz_element',
        startLine: nodeStart + 1,
        endLine: nodeEnd + 1,
        selectedText: lines.slice(nodeStart, nodeEnd + 1).join('\n'),
        enclosingTask
      }
    }
  }

  // 4. Fejlécek (section, subsection, title stb.)
  const curLine = lines[sIdx].trim()
  if (
    sIdx === eIdx &&
    (curLine.startsWith('\\section') ||
      curLine.startsWith('\\subsection') ||
      curLine.startsWith('\\subsubsection') ||
      curLine.startsWith('\\chapter') ||
      curLine.startsWith('\\title'))
  ) {
    return {
      type: 'heading',
      startLine: sIdx + 1,
      endLine: sIdx + 1,
      selectedText: lines[sIdx],
      enclosingTask
    }
  }

  // 5. Legszűkebb matematikai vagy táblázat környezet (pl. align, equation)
  for (let i = sIdx; i >= Math.max(0, sIdx - 30); i--) {
    const bm = lines[i].match(/\\begin\{([a-zA-Z0-9*_-]+)\}/)
    if (bm && SELF_CONTAINED_ENVS.has(bm[1])) {
      const envName = bm[1]
      let envEnd = -1
      for (let j = i; j < totalLines; j++) {
        if (lines[j].includes('\\end{' + envName + '}')) {
          envEnd = j
          break
        }
      }
      if (envEnd !== -1 && envEnd >= eIdx) {
        return {
          type: 'math_environment',
          env: envName,
          startLine: i + 1,
          endLine: envEnd + 1,
          selectedText: lines.slice(i, envEnd + 1).join('\n'),
          enclosingTask
        }
      }
    }
  }

  // 6. Többsoros kijelölés esetén ne bővítsük feleslegesen tovább a sorokat
  if (sIdx !== eIdx) {
    return {
      type: 'range',
      startLine: sIdx + 1,
      endLine: eIdx + 1,
      selectedText: lines.slice(sIdx, eIdx + 1).join('\n'),
      enclosingTask
    }
  }

  // 7. Egysoros folyó szöveg esetén bekezdéshatárok keresése (csak tiszta folyószöveg határokon belül)
  let pStart = sIdx
  let pEnd = sIdx
  while (pStart > 0) {
    const prev = lines[pStart - 1].trim()
    if (
      prev === '' ||
      prev.startsWith('\\section') ||
      prev.startsWith('\\subsection') ||
      prev.startsWith('\\begin{') ||
      prev.startsWith('\\end{') ||
      prev.startsWith('\\item') ||
      prev.startsWith('%')
    ) {
      break
    }
    pStart--
  }

  while (pEnd < totalLines - 1) {
    const next = lines[pEnd + 1].trim()
    if (
      next === '' ||
      next.startsWith('\\section') ||
      next.startsWith('\\subsection') ||
      next.startsWith('\\begin{') ||
      next.startsWith('\\end{') ||
      next.startsWith('\\item') ||
      next.startsWith('%')
    ) {
      break
    }
    pEnd++
  }

  return {
    type: 'paragraph',
    startLine: pStart + 1,
    endLine: pEnd + 1,
    selectedText: lines.slice(pStart, pEnd + 1).join('\n'),
    enclosingTask
  }
}

/**
 * Egyetlen kódsor körüli LaTeX blokk felderítése.
 */
export function findLatexBlockAroundLine(code, targetLine) {
  return findLatexBlockAroundRange(code, targetLine, targetLine)
}
