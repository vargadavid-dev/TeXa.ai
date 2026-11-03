/**
 * snippetMatcher.js
 * Intelligens kódrészlet-illesztő LaTeX dokumentumokhoz.
 * Képes azonosítani, hogy az AI által javasolt/javított kódrészlet (snippet)
 * a dokumentum melyik sorait / blokkját hivatott felváltani (replace),
 * vagy pedig új kódként a dokumentum végére kell fűzni (append).
 */

/**
 * Eltávolítja a markdown kódblokk jelölőket (```latex ... ```) és a felesleges szélső szóközöket.
 */
export function cleanSnippet(snippet) {
  if (!snippet || typeof snippet !== 'string') return ''
  let clean = snippet.trim()
  clean = clean.replace(/^```(?:latex|tex|tikz)?\s*\n?/i, '')
  clean = clean.replace(/\n?```\s*$/i, '')
  return clean.trim()
}

/**
 * Visszaadja a karakterindexhez tartozó 1-bázisú sorszámot a szövegben.
 */
export function getLineNumber(text, index) {
  if (!text || index <= 0) return 1
  return text.slice(0, index).split('\n').length
}

/**
 * Releváns LaTeX kulcsszavak és szavak kinyerése (zajszűréssel)
 */
function extractKeywords(str) {
  if (!str) return []
  const tokens = str.match(/\\[a-zA-Z]+|[a-zA-ZáéíóöőúüűÁÉÍÓÖŐÚÜŰ0-9_]{3,}/g) || []
  const stopwords = new Set([
    '\\begin', '\\end', '\\item', '\\text', '\\textbf', '\\textit',
    'and', 'the', 'for', 'with', 'from', 'this', 'that',
    'hogy', 'vagy', 'mint', 'csak', 'mert', 'tehát', 'ezért'
  ])
  return tokens.filter(t => !stopwords.has(t.toLowerCase()))
}

/**
 * Két halmaz Jaccard hasonlósági együtthatója [0, 1]
 */
function jaccard(setA, setB) {
  if (!setA || !setB || setA.size === 0 || setB.size === 0) return 0
  let intersection = 0
  for (const item of setA) {
    if (setB.has(item)) intersection++
  }
  const union = setA.size + setB.size - intersection
  return union === 0 ? 0 : intersection / union
}

/**
 * Megkeresi, hogy a snippet a dokumentum melyik blokkjának felel meg.
 * 
 * @param {string} doc - A teljes aktuális LaTeX dokumentum
 * @param {string} rawSnippet - Az AI válaszában kapott kódrészlet
 * @returns {object|null} - Találat esetén a célterület adatai, egyébként null
 */
export function findSmartReplacement(doc, rawSnippet) {
  const snippet = cleanSnippet(rawSnippet)
  if (!snippet || !doc) return null

  // Teljes dokumentumokat külön kezelünk (onInsert)
  if (snippet.includes('\\documentclass')) {
    return null
  }

  // 1. Pontos egyezés (Exact Substring Match)
  const exactIdx = doc.indexOf(snippet)
  if (exactIdx !== -1) {
    const startLine = getLineNumber(doc, exactIdx)
    const endLine = getLineNumber(doc, exactIdx + snippet.length)
    return {
      matched: true,
      confidence: 1.0,
      strategy: 'exact',
      startIndex: exactIdx,
      endIndex: exactIdx + snippet.length,
      startLine,
      endLine,
      targetText: doc.slice(exactIdx, exactIdx + snippet.length),
      replacementText: snippet,
      reason: `Pontos egyezés (${startLine}–${endLine}. sor)`
    }
  }

  const snippetLines = snippet.split('\n').map(l => l.trim()).filter(Boolean)
  if (snippetLines.length === 0) return null

  const firstLine = snippetLines[0]
  const lastLine = snippetLines[snippetLines.length - 1]
  const snippetKws = new Set(extractKeywords(snippet))

  // 2. Horgony-alapú egyezés (Anchor Match: Első és utolsó nem üres sor)
  const anchorStart = doc.indexOf(firstLine)
  if (anchorStart !== -1) {
    const anchorEnd = doc.indexOf(lastLine, anchorStart)
    if (anchorEnd !== -1) {
      const targetEnd = anchorEnd + lastLine.length
      const targetText = doc.slice(anchorStart, targetEnd)
      const targetKws = new Set(extractKeywords(targetText))
      const sim = jaccard(snippetKws, targetKws)
      // Ha a horgonyok közötti szöveg tartalmilag is összecseng a snippet-tel
      if (sim >= 0.3 || snippetLines.length <= 3) {
        const startLine = getLineNumber(doc, anchorStart)
        const endLine = getLineNumber(doc, targetEnd)
        return {
          matched: true,
          confidence: Math.max(0.9, Math.round(sim * 100) / 100),
          strategy: 'anchor',
          startIndex: anchorStart,
          endIndex: targetEnd,
          startLine,
          endLine,
          targetText,
          replacementText: snippet,
          reason: `Horgonyok alapján illeszkedve (${startLine}–${endLine}. sor)`
        }
      }
    }
  }

  // 3. LaTeX környezet egyezés (\begin{env} ... \end{env})
  const envStartMatch = snippet.match(/^\\begin\{([a-zA-Z*]+)\}/)
  const envEndMatch = snippet.match(/\\end\{([a-zA-Z*]+)\}\s*$/)
  if (envStartMatch && envEndMatch && envStartMatch[1] === envEndMatch[1]) {
    const envName = envStartMatch[1]
    const envRegex = new RegExp(`\\\\begin\\{${envName}\\}([\\s\\S]*?)\\\\end\\{${envName}\\}`, 'g')
    let match
    let bestCandidate = null
    let highestSim = 0

    while ((match = envRegex.exec(doc)) !== null) {
      const candidateText = match[0]
      const candidateKws = new Set(extractKeywords(candidateText))
      const sim = jaccard(snippetKws, candidateKws)
      if (sim > highestSim && sim >= 0.25) {
        highestSim = sim
        const startIdx = match.index
        const endIdx = startIdx + candidateText.length
        const startLine = getLineNumber(doc, startIdx)
        const endLine = getLineNumber(doc, endIdx)
        bestCandidate = {
          matched: true,
          confidence: Math.round(sim * 100) / 100,
          strategy: 'environment',
          startIndex: startIdx,
          endIndex: endIdx,
          startLine,
          endLine,
          targetText: candidateText,
          replacementText: snippet,
          reason: `Környezet (\\begin{${envName}}) cseréje (${startLine}–${endLine}. sor)`
        }
      }
    }
    if (bestCandidate) return bestCandidate
  }

  // 4. Belső egyedi sor horgony (Unique Inner Line Anchor)
  // Ha a snippet első sora módosult, de van a belsejében egy egyedi azonosító sor
  let uniqueAnchorIdx = -1
  let uniqueSnippetLineIdx = -1
  for (let i = 0; i < snippetLines.length; i++) {
    const line = snippetLines[i]
    if (line.length >= 10 && !line.startsWith('\\end') && !line.startsWith('\\begin')) {
      const firstOccur = doc.indexOf(line)
      if (firstOccur !== -1 && doc.indexOf(line, firstOccur + 1) === -1) {
        uniqueAnchorIdx = firstOccur
        uniqueSnippetLineIdx = i
        break
      }
    }
  }

  if (uniqueAnchorIdx !== -1) {
    const anchorEnd = doc.indexOf(lastLine, uniqueAnchorIdx)
    if (anchorEnd !== -1) {
      const docBeforeAnchor = doc.slice(0, uniqueAnchorIdx)
      const docBeforeLines = docBeforeAnchor.split('\n')
      const targetStartLineNumber = Math.max(1, docBeforeLines.length - uniqueSnippetLineIdx)
      const targetStartIdx = doc.split('\n').slice(0, targetStartLineNumber - 1).join('\n').length + (targetStartLineNumber > 1 ? 1 : 0)
      const targetEnd = anchorEnd + lastLine.length
      const targetText = doc.slice(targetStartIdx, targetEnd)
      const targetKws = new Set(extractKeywords(targetText))
      const sim = jaccard(snippetKws, targetKws)

      if (sim >= 0.3) {
        const startLine = targetStartLineNumber
        const endLine = getLineNumber(doc, targetEnd)
        return {
          matched: true,
          confidence: Math.max(0.85, Math.round(sim * 100) / 100),
          strategy: 'unique-anchor',
          startIndex: targetStartIdx,
          endIndex: targetEnd,
          startLine,
          endLine,
          targetText,
          replacementText: snippet,
          reason: `Egyedi sor alapján illeszkedve (${startLine}–${endLine}. sor)`
        }
      }
    }
  }

  // 5. Csúszóablak alapú Jaccard hasonlóság (Sliding Window Jaccard)
  const docLines = doc.split('\n')
  if (snippetKws.size >= 3) {
    let bestScore = 0
    let bestStart = -1
    let bestEnd = -1
    const M = snippetLines.length

    for (let w = Math.max(2, M - 4); w <= M + 6; w++) {
      for (let i = 0; i <= docLines.length - w; i++) {
        const windowText = docLines.slice(i, i + w).join('\n')
        const windowKws = new Set(extractKeywords(windowText))
        const score = jaccard(snippetKws, windowKws)
        if (score > bestScore) {
          bestScore = score
          bestStart = i
          bestEnd = i + w
        }
      }
    }

    if (bestScore >= 0.35) {
      const startIdx = docLines.slice(0, bestStart).join('\n').length + (bestStart > 0 ? 1 : 0)
      const endIdx = docLines.slice(0, bestEnd).join('\n').length
      return {
        matched: true,
        confidence: Math.round(bestScore * 100) / 100,
        strategy: 'cluster',
        startIndex: startIdx,
        endIndex: endIdx,
        startLine: bestStart + 1,
        endLine: bestEnd,
        targetText: doc.slice(startIdx, endIdx),
        replacementText: snippet,
        reason: `Hasonlóság alapján (${bestStart + 1}–${bestEnd}. sor, egyezés: ${Math.round(bestScore * 100)}%)`
      }
    }
  }

  return null
}
