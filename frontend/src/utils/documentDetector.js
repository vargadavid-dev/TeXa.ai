/**
 * Intelligens LaTeX dokumentum metaadat-felismerő
 * Automatikusan kinyeri a dokumentum címét, témáját és kategóriáját (Matematika / Fizika)
 */

export function detectDocumentMeta(code, currentSubjectFallback = '', availableCategories = []) {
  if (!code || typeof code !== 'string') {
    return {
      filename: `Dokumentum_${Date.now().toString().slice(-4)}.tex`,
      subject: currentSubjectFallback || (availableCategories[0] || ''),
      displayTitle: 'Névtelen dokumentum'
    }
  }

  // 1. Cím kinyerése \title{...} parancsból (kapcsos zárójelek kiegyensúlyozott kezelésével)
  let rawTitle = ''
  const titleIdx = code.indexOf('\\title')
  if (titleIdx !== -1) {
    let pos = titleIdx + 6
    while (pos < code.length && /\s/.test(code[pos])) pos++
    if (pos < code.length && code[pos] === '[') {
      let bCount = 1
      pos++
      while (pos < code.length && bCount > 0) {
        if (code[pos] === '[') bCount++
        else if (code[pos] === ']') bCount--
        pos++
      }
    }
    while (pos < code.length && /\s/.test(code[pos])) pos++
    if (pos < code.length && code[pos] === '{') {
      let depth = 1
      let startBrace = pos + 1
      pos++
      while (pos < code.length && depth > 0) {
        if (code[pos] === '{') depth++
        else if (code[pos] === '}') depth--
        pos++
      }
      if (depth === 0) {
        rawTitle = code.slice(startBrace, pos - 1).trim()
      }
    }
  }

  if (!rawTitle) {
    const titleMatch = code.match(/\\title\s*\{([^}]+)\}/i)
    if (titleMatch && titleMatch[1].trim()) {
      rawTitle = titleMatch[1].trim()
    }
  }

  // Általános vagy sablon címek szűrése
  const genericTitles = [
    'új dokumentum',
    'uj dokumentum',
    'dokumentum',
    'névtelen',
    'nevtelen',
    'untitled',
    'document',
    'téma összefoglaló',
    'tema osszefoglalo',
    'témakör bemutatása',
    'bemutató anyag',
    'feladatsor'
  ]

  const isGeneric = !rawTitle || genericTitles.includes(rawTitle.toLowerCase().trim())

  // Ha a \title sablonos vagy hiányzik, megnézzük az első \section{...} címét
  if (isGeneric) {
    const sectionMatch = code.match(/\\section\*?\s*\{([^}]+)\}/i)
    if (sectionMatch && sectionMatch[1].trim()) {
      rawTitle = sectionMatch[1].trim()
    } else {
      // Beamer esetén megnézzük az első \frametitle{...}-t
      const frameMatch = code.match(/\\frametitle\s*\{([^}]+)\}/i)
      if (frameMatch && frameMatch[1].trim()) {
        rawTitle = frameMatch[1].trim()
      }
    }
  }

  // Ha még mindig nincs semmi értelmes cím:
  if (!rawTitle || genericTitles.includes(rawTitle.toLowerCase().trim())) {
    rawTitle = `Dokumentum_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`
  }

  // Cím tisztítása LaTeX parancsoktól (\textbf, \emph, stílusok, sortörések)
  let cleanName = rawTitle
    .replace(/\\[a-zA-Z]+\*?\{([^}]*)\}/g, '$1') // pl. \textbf{tétel} -> tétel
    .replace(/\\[a-zA-Z]+/g, ' ')                // egyéb parancsok pl. \\, \medskip -> szóköz
    .replace(/[{}$#&%~^]/g, '')                 // LaTeX speciális karakterek
    .replace(/[\/\\:*?"<>|]/g, '_')             // tiltott fájlrendszer karakterek
    .replace(/\s+/g, '_')                       // szóközök aláhúzásra
    .replace(/_+/g, '_')                        // duplázott aláhúzások
    .replace(/^_+|_+$/g, '')                    // eleji és végi aláhúzások

  if (cleanName.length > 100) {
    cleanName = cleanName.substring(0, 100).replace(/_+$/, '')
  }

  if (!cleanName) {
    cleanName = `Dokumentum_${Date.now().toString().slice(-4)}`
  }

  // 2. Kategória / Tantárgy (Matematika vs Fizika) felismerése kulcsszavak és képletek alapján
  const lowerCode = code.toLowerCase()

  const physicsKeywords = [
    'fizika', 'newton', 'sebesség', 'sebesseg', 'gyorsulás', 'gyorsulas', 'erő', 'ero',
    'lendület', 'energia', 'teljesítmény', 'hatásfok', 'kinematika', 'dinamika',
    'gravitáció', 'coulomb', 'elektrosztatika', 'áramerősség', 'feszültség', 'ellenállás',
    'ohm', 'mágneses', 'optika', 'lencse', 'fénytörés', 'fenytore', 'hőtan', 'termodinamika',
    'kelvin', 'hőmérséklet', 'homerséklet', 'gáztörvény', 'nyomás', 'pascal', 'hullám',
    'frekvencia', 'foton', 'relativitás', 'sugárzás', 'kvantum', 'dinamika', 'mozgás'
  ]

  const mathKeywords = [
    'matematika', 'egyenlet', 'másodfokú', 'masodfoku', 'diszkrimináns', 'pitagorasz',
    'függvény', 'fuggveny', 'derivált', 'integrál', 'határérték', 'mátrix', 'matrix',
    'determináns', 'vektor', 'geometria', 'háromszög', 'haromszog', 'szög', 'szog',
    'trigonometria', 'sin', 'cos', 'tan', 'valószínűség', 'valoszinuseg', 'kombinatorika',
    'statisztika', 'halmaz', 'logaritmus', 'prímszám', 'polinom', 'sorozat', 'számtani',
    'mértani', 'koordináta', 'algebra'
  ]

  let physicsScore = 0
  let mathScore = 0

  physicsKeywords.forEach(kw => {
    if (lowerCode.includes(kw)) physicsScore += (kw.length > 6 ? 2 : 1)
  })

  mathKeywords.forEach(kw => {
    if (lowerCode.includes(kw)) mathScore += (kw.length > 6 ? 2 : 1)
  })

  let detectedSubject = currentSubjectFallback || (availableCategories[0] || '')
  if (currentSubjectFallback && (!availableCategories.length || availableCategories.includes(currentSubjectFallback))) {
    detectedSubject = currentSubjectFallback
  } else if (physicsScore > mathScore && physicsScore >= 2 && (!availableCategories.length || availableCategories.includes('Fizika'))) {
    detectedSubject = 'Fizika'
  } else if (mathScore > physicsScore && mathScore >= 2 && (!availableCategories.length || availableCategories.includes('Matematika'))) {
    detectedSubject = 'Matematika'
  }

  const finalFilename = cleanName.endsWith('.tex') ? cleanName : `${cleanName}.tex`

  return {
    filename: finalFilename,
    subject: detectedSubject,
    displayTitle: rawTitle
  }
}
