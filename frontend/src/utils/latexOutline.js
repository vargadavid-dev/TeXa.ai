/**
 * LaTeX Dokumentum Szerkezeti Fa (Outline / Mini-TOC) Kinyerő
 * Valós időben kinyeri a dokumentum fejezeteit, diáit, tételeit és definícióit a sorok számával együtt,
 * valódi hierarchikus rétegződéssel (fa-struktúra).
 */

export function extractOutline(code) {
  if (!code || typeof code !== 'string') return []

  const lines = code.split('\n')
  const items = []

  const stripLatex = (str) => {
    return str
      .replace(/\\[a-zA-Z]+\*?\{([^}]*)\}/g, '$1')
      .replace(/\\[a-zA-Z]+/g, '')
      .replace(/[{}$#&%~^]/g, '')
      .trim()
  }

  // Megvizsgáljuk, hogy a dokumentum könyv/disszertáció típusú-e (\part vagy \chapter van-e benne)
  const hasChapters = /\\(part|chapter)\*?\{/i.test(code)
  const baseLevels = hasChapters
    ? { part: 0, chapter: 0, section: 1, subsection: 2, subsubsection: 3 }
    : { section: 0, subsection: 1, subsubsection: 2 }

  let currentHeadingLevel = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('%')) continue

    // 1. Part / Chapter / Section / Subsection / Subsubsection
    const secMatch = line.match(/\\(part|chapter|section|subsection|subsubsection)\*?\s*\{([^}]+)\}/i)
    if (secMatch) {
      const type = secMatch[1].toLowerCase()
      const title = stripLatex(secMatch[2]) || 'Névtelen szakasz'
      const level = baseLevels[type] !== undefined ? baseLevels[type] : 0
      currentHeadingLevel = level

      items.push({
        id: `sec-${i}`,
        type,
        level,
        title,
        line: i + 1
      })
      continue
    }

    // 2. Beamer Frametitle
    const frameTitleMatch = line.match(/\\frametitle\s*\{([^}]+)\}/i)
    if (frameTitleMatch) {
      const title = stripLatex(frameTitleMatch[1]) || 'Prezentáció dia'
      items.push({
        id: `frame-${i}`,
        type: 'frame',
        level: currentHeadingLevel + 1,
        title,
        line: i + 1
      })
      continue
    }

    // 3. Beamer \begin{frame}{Cím}
    const beginFrameMatch = line.match(/\\begin\{frame\}\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/i)
    if (beginFrameMatch) {
      const title = stripLatex(beginFrameMatch[1]) || 'Prezentáció dia'
      items.push({
        id: `frame-${i}`,
        type: 'frame',
        level: currentHeadingLevel + 1,
        title,
        line: i + 1
      })
      continue
    }

    // 4. Matematikai, fizikai és oktatási dobozok / környezetek (magyar és angol elnevezések)
    const envMatch = line.match(
      /\\begin\{(definition|definíció|definicio|definiciodoboz|definíciódoboz|theorem|tétel|tetel|teteldoboz|tételdoboz|lemma|lemmadoboz|proof|bizonyítás|bizonyitas|feladat|feladatdoboz|problem|exercise|pelda|példa|peldadoboz|példadoboz|example|tipp|tippdoboz)\}(?:\[([^\]]+)\])?/i
    )
    if (envMatch) {
      const rawEnv = envMatch[1].toLowerCase()
      const optTitle = envMatch[2] ? stripLatex(envMatch[2]) : ''

      let envName = 'Környezet'
      let envType = 'box'

      if (rawEnv.includes('def')) {
        envName = 'Definíció'
        envType = 'definition'
      } else if (rawEnv.includes('tétel') || rawEnv.includes('tetel') || rawEnv.includes('theorem') || rawEnv.includes('lemma')) {
        envName = 'Tétel'
        envType = 'theorem'
      } else if (rawEnv.includes('feladat') || rawEnv.includes('problem') || rawEnv.includes('exercise')) {
        envName = 'Feladat'
        envType = 'task'
      } else if (rawEnv.includes('bizony') || rawEnv.includes('proof')) {
        envName = 'Bizonyítás'
        envType = 'proof'
      } else if (rawEnv.includes('peld') || rawEnv.includes('péld') || rawEnv.includes('example')) {
        envName = 'Példa'
        envType = 'example'
      } else if (rawEnv.includes('tipp')) {
        envName = 'Tipp'
        envType = 'box'
      }

      const displayTitle = optTitle ? `${envName}: ${optTitle}` : envName
      items.push({
        id: `env-${i}`,
        type: envType,
        level: currentHeadingLevel + 1,
        title: displayTitle,
        line: i + 1
      })
      continue
    }

    // 5. tcolorbox kiemelt dobozok
    const boxMatch = line.match(/\\begin\{tcolorbox\}\[.*?title=\{?([^,\}\]]+)\}?.*?\]/i)
    if (boxMatch) {
      const boxTitle = stripLatex(boxMatch[1])
      items.push({
        id: `box-${i}`,
        type: 'box',
        level: currentHeadingLevel + 1,
        title: `Kiemelés: ${boxTitle}`,
        line: i + 1
      })
      continue
    }

    // 6. TikZ ábrák
    const tikzMatch = line.match(/\\begin\{tikzpicture\}/i)
    if (tikzMatch) {
      items.push({
        id: `tikz-${i}`,
        type: 'figure',
        level: currentHeadingLevel + 1,
        title: 'TikZ ábra / diagram',
        line: i + 1
      })
      continue
    }

    // 7. Táblázatok
    const tableMatch = line.match(/\\begin\{(table|tabular|tabularx)\}/i)
    if (tableMatch) {
      items.push({
        id: `table-${i}`,
        type: 'table',
        level: currentHeadingLevel + 1,
        title: 'Táblázat',
        line: i + 1
      })
      continue
    }
  }

  return items
}
