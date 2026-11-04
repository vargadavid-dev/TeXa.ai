import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import axios from 'axios'
import {
  FileText,
  Play,
  Download,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Navigation,
  ChevronUp,
  ChevronDown,
  Sparkles,
  Wand2,
  Scan,
  X,
  CornerDownLeft,
  Plus,
  ArrowDown,
  ArrowUp,
  Shapes,
  Eye,
  Code
} from 'lucide-react'
import { findLatexBlockAroundRange, extractAllFigures } from '../utils/latexBlockFinder'

// PDF.js worker beállítása lokális forrásból (offline működés)
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

const QUICK_TRANSFORM_CHIPS = [
  'Tedd elegáns tcolorbox dobozba',
  'Javítsd és szépítsd meg a képleteket',
  'Magyarázd el lépésről lépésre magyarul',
  'Egyszerűsítsd a matematikai levezetést',
  'Alakítsd át számozott egyenletekké'
]


const FIGURE_QUICK_CHIPS = [
  {
    label: '🎨 Modern stílus & tiszta vonalak',
    prompt: 'Alakítsd át az ábra színeit modern, esztétikus árnyalatokra (slate, deep navy, teal), a csúcsokat lekerekített stílusúra, tiszta kontúrokkal!'
  },
  {
    label: '🔍 Méret növelése (+20%)',
    prompt: 'Növeld meg az ábra méretét kb. 20%-kal (a scale faktor vagy a csomópontok távolságának arányos növelésével)!'
  },
  {
    label: '🔍 Méret csökkentése (-20%)',
    prompt: 'Csökkentsd le az ábra méretét kb. 20%-kal (a scale paraméter csökkentésével), hogy kompakt legyen és biztosan elférjen az oldalon!'
  },
  {
    label: '🏷️ Nagyobb, jól olvasható feliratok',
    prompt: 'Növeld meg a feliratok és címkék betűméretét, és igazítsd a feliratok pozícióját úgy, hogy ne fedjék a vonalakat!'
  },
  {
    label: '➕ Vastagabb nyilak (Stealth)',
    prompt: 'Tedd a nyilakat és éleket vastagabbá és markánsabbá (használd a very thick stílust és modern stealth nyilhegyeket)!'
  },
  {
    label: '📐 Szimmetrikus elrendezés',
    prompt: 'Igazítsd újra a koordinátákat úgy, hogy az ábra elemei szimmetrikusan, rendezetten és harmonikusan helyezkedjenek el!'
  },
  {
    label: '✨ TikZ kód optimalizálása',
    prompt: 'Tisztítsd le a TikZ kódot: javítsd az esetleges szintaktikai hibákat, tegyél ki minden hiányzó pontosvesszőt, és optimalizáld a definíciókat!'
  },
  {
    label: '🌈 Pasztell kitöltések',
    prompt: 'Használj lágy, pasztell és kontrasztos háttérkitöltéseket a csomópontoknál és területeknél az elegáns megjelenésért!'
  }
]

const QUICK_INSERT_CHIPS = [
  '🎯 Ellenőrző feladatblokk (Microlearning teszttel)',
  '💡 Kiegészítő magyarázat tippdobozban',
  '📐 Szemléltető TikZ ábra',
  '📝 Kidolgozott mintapélda megoldással',
  '❓ Feleletválasztós (A/B/C/D) tesztkérdés',
  '⚖️ Igaz / Hamis állítások indoklással',
  '📌 Új tétel vagy definíció kiemelése',
  '🔢 Számolásos feladat részeredményekkel'
]


export default function PdfPreview({
  pdfData,
  compileStatus,
  onCompile,
  onDownloadPdf,
  syncTarget,
  onInverseSync,
  code,
  onTransformSelection,
  onInsertSelection
}) {
  const containerRef = useRef(null)
  const canvasRefs = useRef({})
  const pageViewportsRef = useRef({})

  const [pdfDoc, setPdfDoc] = useState(null)
  const [numPages, setNumPages] = useState(0)
  const [scale, setScale] = useState(1.2)
  const [rendering, setRendering] = useState(false)
  const [highlight, setHighlight] = useState(null)
  const [inverseSyncing, setInverseSyncing] = useState(false)

  // ── Terület kijelölés, AI átszerkesztés és beszúrás állapota ──
  // toolMode: 'select' (átszerkesztés) | 'figure' (ábra szerkesztő) | 'none'
  const [toolMode, setToolMode] = useState('none')
  const [activeTab, setActiveTab] = useState('transform') // 'insert' | 'transform'
  const [insertPosition, setInsertPosition] = useState('after') // 'after' | 'before'

  const [selectionState, setSelectionState] = useState(null)
  // selectionState: { page, startX, startY, currentX, currentY, isDragging, isFinished, box: { left, top, width, height } }
  const [selectedBlock, setSelectedBlock] = useState(null)
  const [resolvingSelection, setResolvingSelection] = useState(false)
  const [isAiPromptOpen, setIsAiPromptOpen] = useState(false)
  const [inlineInstruction, setInlineInstruction] = useState('')
  const [isTransforming, setIsTransforming] = useState(false)
  const [selectionTip, setSelectionTip] = useState(null)
  // ── Dokumentumban található TikZ ábrák listája és gyorsválasztója ──
  const figuresList = useMemo(() => extractAllFigures(code), [code])

  // ── TikZ Ábrák lebegő előnézete (hover thumbnail & popup) ──
  const [figurePreviews, setFigurePreviews] = useState({})
  const [hoveredFigure, setHoveredFigure] = useState(null)
  const [hoverHighlight, setHoverHighlight] = useState(null)
  const inFlightThumbnailsRef = useRef(new Set())
  const hoverLeaveTimerRef = useRef(null)

  // Új fordításkor előnézetek alaphelyzetbe állítása
  useEffect(() => {
    setFigurePreviews({})
    setHoveredFigure(null)
    setHoverHighlight(null)
  }, [pdfData])

  // Dokumentum fejlécéből a TikZ és színcsomagok kinyerése
  const extractedPreamble = useMemo(() => {
    if (!code) return ''
    const docIdx = code.indexOf('\\begin{document}')
    if (docIdx === -1) return ''
    const rawPreamble = code.slice(0, docIdx)
    return rawPreamble
      .split('\n')
      .filter((line) => {
        const t = line.trim()
        return (
          t.startsWith('\\usepackage') ||
          t.startsWith('\\usetikzlibrary') ||
          t.startsWith('\\definecolor') ||
          t.startsWith('\\colorlet') ||
          t.startsWith('\\tikzset') ||
          t.startsWith('\\newcommand') ||
          t.startsWith('\\def')
        ) && !t.includes('{geometry}') && !t.includes('{standalone}') && !t.includes('{documentclass}')
      })
      .join('\n')
  }, [code])

  // Egy adott TikZ ábra lefordítása a beépített standalone fordítóval
  const getOrGenerateFigurePreview = useCallback(
    async (fig) => {
      if (!fig || !fig.index) return null
      if (figurePreviews[fig.index]?.dataUrl) return figurePreviews[fig.index]
      if (inFlightThumbnailsRef.current.has(fig.index)) return null

      inFlightThumbnailsRef.current.add(fig.index)
      setFigurePreviews((prev) => ({
        ...prev,
        [fig.index]: { ...prev[fig.index], isLoading: true }
      }))

      try {
        const res = await axios.post('/api/compile/figure-preview', {
          tikzCode: fig.code,
          preamble: extractedPreamble
        })

        let dataUrl = res.data?.image
        if (!dataUrl && res.data?.pdf) {
          // Ha a backend közvetlenül PDF-et küldött, a PDF.js kirajzolja
          try {
            const raw = atob(res.data.pdf)
            const arr = new Uint8Array(raw.length)
            for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
            const miniDoc = await pdfjsLib.getDocument({ data: arr }).promise
            const page = await miniDoc.getPage(1)
            const vp = page.getViewport({ scale: 2.0 })
            const c = document.createElement('canvas')
            c.width = vp.width
            c.height = vp.height
            const ctx = c.getContext('2d')
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(0, 0, vp.width, vp.height)
            await page.render({ canvasContext: ctx, viewport: vp }).promise
            dataUrl = c.toDataURL('image/png')
          } catch (pdfErr) {
            console.warn('PDF.js render hiba:', pdfErr)
          }
        }

        if (!dataUrl) throw new Error('Nem jött létre kép')

        const previewData = {
          dataUrl,
          isLoading: false
        }

        setFigurePreviews((prev) => ({
          ...prev,
          [fig.index]: previewData
        }))

        return previewData
      } catch (err) {
        console.warn(`Ábra fordítási hiba (#${fig.index}):`, err.message)
        setFigurePreviews((prev) => ({
          ...prev,
          [fig.index]: { isLoading: false, error: true, dataUrl: null }
        }))
        return null
      } finally {
        inFlightThumbnailsRef.current.delete(fig.index)
      }
    },
    [figurePreviews, extractedPreamble]
  )

  // Háttérben előnézetek előtöltése Ábra módban
  useEffect(() => {
    if (toolMode !== 'figure' || figuresList.length === 0) return
    let isCancelled = false

    const runPrefetch = async () => {
      for (const fig of figuresList) {
        if (isCancelled) break
        if (!figurePreviews[fig.index]?.dataUrl) {
          await getOrGenerateFigurePreview(fig)
          await new Promise((r) => setTimeout(r, 60))
        }
      }
    }

    const t = setTimeout(runPrefetch, 200)
    return () => {
      isCancelled = true
      clearTimeout(t)
    }
  }, [toolMode, figuresList, getOrGenerateFigurePreview, figurePreviews])

  const handleFigureMouseEnter = (fig, e) => {
    if (hoverLeaveTimerRef.current) {
      clearTimeout(hoverLeaveTimerRef.current)
      hoverLeaveTimerRef.current = null
    }

    const rect = e.currentTarget.getBoundingClientRect()
    const popoverWidth = 360
    const popoverHeight = 220

    let top = rect.bottom + 8
    if (window.innerHeight - rect.bottom < popoverHeight && rect.top > popoverHeight) {
      top = rect.top - popoverHeight - 8
    }

    let left = rect.left + rect.width / 2 - popoverWidth / 2
    left = Math.max(12, Math.min(window.innerWidth - popoverWidth - 12, left))

    setHoveredFigure({
      fig,
      pos: { top, left }
    })

    getOrGenerateFigurePreview(fig)
  }

  const handleFigureMouseLeave = () => {
    hoverLeaveTimerRef.current = setTimeout(() => {
      setHoveredFigure(null)
      setHoverHighlight(null)
    }, 180)
  }

  const handlePopoverMouseEnter = () => {
    if (hoverLeaveTimerRef.current) {
      clearTimeout(hoverLeaveTimerRef.current)
      hoverLeaveTimerRef.current = null
    }
  }

  const handlePopoverMouseLeave = () => {
    hoverLeaveTimerRef.current = setTimeout(() => {
      setHoveredFigure(null)
      setHoverHighlight(null)
    }, 180)
  }

  const handleJumpToFigure = (fig) => {
    const prev = figurePreviews[fig.index]
    if (!prev?.page) return
    const pageEl = document.getElementById(`pdf-page-${prev.page}`)
    if (!pageEl) return

    const canvas = canvasRefs.current[prev.page]
    const pv = pageViewportsRef.current[prev.page]
    if (canvas && pv) {
      const ratioY = canvas.getBoundingClientRect().height / pv.ptHeight
      const targetScrollY = pageEl.offsetTop + prev.cropTop * ratioY - 70
      containerRef.current?.scrollTo({ top: targetScrollY, behavior: 'smooth' })
      setHighlight({
        page: prev.page,
        left: prev.cropLeft * (canvas.getBoundingClientRect().width / pv.ptWidth),
        top: prev.cropTop * ratioY,
        width: prev.cropWidth * (canvas.getBoundingClientRect().width / pv.ptWidth),
        height: prev.cropHeight * ratioY,
        id: Date.now()
      })
    } else {
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  const handleSelectFigureDirectly = useCallback((fig) => {
    setSelectedBlock({
      startLine: fig.startLine,
      endLine: fig.endLine,
      type: 'tikz_figure',
      env: 'tikzpicture',
      selectedText: fig.code,
      title: fig.title || `TikZ ábra #${fig.index} (${fig.lineCount} sor)`,
      isFigure: true,
      figureIndex: fig.index
    })
    setActiveTab('figure')
    setIsAiPromptOpen(true)
  }, [])


  // 1. PDF adat betöltése
  useEffect(() => {
    if (!pdfData) {
      setPdfDoc(null)
      setNumPages(0)
      return
    }

    let isCancelled = false
    const loadPdf = async () => {
      try {
        const bytes = atob(pdfData)
        const arr = new Uint8Array(bytes.length)
        for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)

        const loadingTask = pdfjsLib.getDocument({ data: arr })
        const doc = await loadingTask.promise
        if (!isCancelled) {
          setPdfDoc(doc)
          setNumPages(doc.numPages)
        }
      } catch (err) {
        console.error('PDF.js betöltési hiba:', err)
      }
    }

    loadPdf()
    return () => {
      isCancelled = true
    }
  }, [pdfData])

  // 2. Oldalak kirajzolása vásznakra (canvas)
  const renderPages = useCallback(async () => {
    if (!pdfDoc) return
    setRendering(true)

    try {
      for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum)
        const canvas = canvasRefs.current[pageNum]
        if (!canvas) continue

        const pixelRatio = window.devicePixelRatio || 1
        const viewport = page.getViewport({ scale })

        // Eltároljuk a méreteket a SyncTeX konverzióhoz (72 dpi big points)
        const ptWidth = viewport.viewBox[2] - viewport.viewBox[0]
        const ptHeight = viewport.viewBox[3] - viewport.viewBox[1]
        pageViewportsRef.current[pageNum] = { ptWidth, ptHeight, viewport }

        canvas.width = Math.floor(viewport.width * pixelRatio)
        canvas.height = Math.floor(viewport.height * pixelRatio)
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`

        const ctx = canvas.getContext('2d')
        ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)

        const renderContext = {
          canvasContext: ctx,
          viewport
        }

        await page.render(renderContext).promise
      }
    } catch (err) {
      console.warn('Oldal renderelési megjegyzés:', err)
    } finally {
      setRendering(false)
    }
  }, [pdfDoc, scale])

  useEffect(() => {
    renderPages()
  }, [renderPages])

  // Ha a zoom vagy az alap PDF változik, a korábbi képpont-alapú kijelölést töröljük
  useEffect(() => {
    setSelectionState(null)
    setSelectedBlock(null)
    setIsAiPromptOpen(false)
    setSelectionTip(null)
  }, [scale, pdfData])

  // 3. SyncTeX Forward Search: Odagörgetés és kiemelés a kód alapján
  useEffect(() => {
    if (!syncTarget || !syncTarget.page) return

    const { page, h, v, y, width, height } = syncTarget
    const pageEl = document.getElementById(`pdf-page-${page}`)
    const canvas = canvasRefs.current[page]
    const pv = pageViewportsRef.current[page]

    if (pageEl && canvas && pv) {
      const rect = canvas.getBoundingClientRect()
      const ratioX = rect.width / pv.ptWidth
      const ratioY = rect.height / pv.ptHeight

      const boxWidth = Math.max(120, (width || 200) * ratioX)
      const boxHeight = Math.max(20, (height || 14) * ratioY)
      const boxLeft = Math.max(10, (h || 72) * ratioX)
      const boxTop = Math.max(10, (v || y || 100) * ratioY - boxHeight)

      setHighlight({
        page,
        left: boxLeft,
        top: boxTop,
        width: boxWidth,
        height: boxHeight,
        id: Date.now()
      })

      // Odagörgetjük a PDF nézetet
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'center' })

      // Kiemelés automatikus eltüntetése 2 másodperc múlva
      const timer = setTimeout(() => {
        setHighlight((cur) => (cur?.id === highlight?.id ? null : cur))
      }, 2200)
      return () => clearTimeout(timer)
    }
  }, [syncTarget])

  // 4. SyncTeX Inverse Search: Dupla kattintás a PDF-en -> Ugrás a kódba
  const handlePageDoubleClick = async (e, pageNum) => {
    if (!onInverseSync) return
    const canvas = canvasRefs.current[pageNum]
    const pv = pageViewportsRef.current[pageNum]
    if (!canvas || !pv) return

    const rect = canvas.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const clickY = e.clientY - rect.top

    // Átszámítás PDF big point (72 dpi) koordinátákra a lap bal felső sarkától
    const ptX = (clickX / rect.width) * pv.ptWidth
    const ptY = (clickY / rect.height) * pv.ptHeight

    setInverseSyncing(true)
    try {
      await onInverseSync({ page: pageNum, x: ptX, y: ptY })
    } finally {
      setInverseSyncing(false)
    }
  }

  // ── 5. Terület-kijelölés egérkezelése a PDF oldalakon ──
  const handlePageMouseDown = (e, pageNum) => {
    if (e.button !== 0) return // Csak bal egérgomb
    if (toolMode === 'none') return

    // Ha a kijelölési doboz valamelyik belső gombjára kattintott, ne kezdjünk új kijelölést
    if (e.target.closest('.pdf-selection-dismiss-btn') || e.target.closest('.pdf-selection-action-pill')) {
      return
    }

    const canvas = canvasRefs.current[pageNum]
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const startX = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
    const startY = Math.max(0, Math.min(e.clientY - rect.top, rect.height))

    setSelectionState({
      page: pageNum,
      startX,
      startY,
      currentX: startX,
      currentY: startY,
      isDragging: true,
      isFinished: false,
      box: { left: startX, top: startY, width: 0, height: 0 }
    })
    setSelectedBlock(null)
    setSelectionTip(null)
    setIsAiPromptOpen(false)
    // Alapértelmezett fül beállítása a kiválasztott eszközhöz
    setActiveTab(toolMode === 'insert' ? 'insert' : toolMode === 'figure' ? 'figure' : 'transform')
  }

  // Globális egérmozgás és elengedés követése húzás közben
  useEffect(() => {
    if (!selectionState?.isDragging) return

    const handleWindowMouseMove = (e) => {
      const canvas = canvasRefs.current[selectionState.page]
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const curX = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
      const curY = Math.max(0, Math.min(e.clientY - rect.top, rect.height))

      const left = Math.min(selectionState.startX, curX)
      const top = Math.min(selectionState.startY, curY)
      const width = Math.abs(curX - selectionState.startX)
      const height = Math.abs(curY - selectionState.startY)

      setSelectionState((prev) =>
        prev
          ? {
              ...prev,
              currentX: curX,
              currentY: curY,
              box: { left, top, width, height }
            }
          : null
      )
    }

    const handleWindowMouseUp = () => {
      setSelectionState((current) => {
        if (!current || !current.isDragging) return current
        const { box } = current
        // Ha a kijelölés túl apró (< 15px széles vagy < 10px magas):
        // Kattintás volt! Készítünk egy kényelmes pontszerű dobozt (120x24px) a kattintás köré
        if (box.width < 15 || box.height < 10) {
          const clickBox = {
            left: Math.max(0, current.startX - 60),
            top: Math.max(0, current.startY - 12),
            width: 120,
            height: 24
          }
          return {
            ...current,
            isDragging: false,
            isFinished: true,
            box: clickBox
          }
        }
        return {
          ...current,
          isDragging: false,
          isFinished: true
        }
      })
    }

    window.addEventListener('mousemove', handleWindowMouseMove)
    window.addEventListener('mouseup', handleWindowMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove)
      window.removeEventListener('mouseup', handleWindowMouseUp)
    }
  }, [selectionState?.isDragging, selectionState?.page, selectionState?.startX, selectionState?.startY])

  // ── 6. Kijelölt PDF területhez tartozó LaTeX kód felderítése SyncTeX-szel és PDF szövegkinyeréssel ──
  useEffect(() => {
    if (!selectionState || !selectionState.isFinished || selectionState.isDragging) return

    let isCancelled = false
    const resolveSelection = async () => {
      const { page, box } = selectionState
      const canvas = canvasRefs.current[page]
      const pv = pageViewportsRef.current[page]
      if (!canvas || !pv || !code) return

      const rect = canvas.getBoundingClientRect()
      const ptWidth = pv.ptWidth
      const ptHeight = pv.ptHeight

      // SyncTeX big-point koordináták (72 DPI) kiszámítása
      const midX = ((box.left + box.width / 2) / rect.width) * ptWidth
      const midY = ((box.top + box.height / 2) / rect.height) * ptHeight

      setResolvingSelection(true)
      setSelectionTip(null)

      try {
        // 1. Kinyerjük a kijelölési doboz által lefedett valódi PDF szövegelemeket a PDF.js-ből
        let pdfText = ''
        try {
          if (pdfDoc) {
            const pdfPage = await pdfDoc.getPage(page)
            const textContent = await pdfPage.getTextContent()
            const viewport = pv.viewport || pdfPage.getViewport({ scale })

            const captured = []
            for (const item of textContent.items) {
              if (!item.str || !item.str.trim()) continue
              const [vx, vy] = viewport.convertToViewportPoint(item.transform[4], item.transform[5])
              const fontSize = Math.hypot(item.transform[2], item.transform[3]) * scale
              const itemTop = vy - fontSize
              const itemLeft = vx
              const itemWidth = (item.width || 0) * scale
              const itemHeight = fontSize

              // Átfedés vizsgálata a kijelölési dobozzal (box)
              const overlaps = !(
                itemLeft > box.left + box.width ||
                itemLeft + itemWidth < box.left ||
                itemTop > box.top + box.height ||
                itemTop + itemHeight < box.top
              )
              if (overlaps) {
                captured.push({
                  str: item.str,
                  top: itemTop,
                  left: itemLeft
                })
              }
            }

            if (captured.length > 0) {
              // Sorfolytonos rendezés: felülről lefelé, balról jobbra
              captured.sort((a, b) => {
                if (Math.abs(a.top - b.top) > 5) return a.top - b.top
                return a.left - b.left
              })
              pdfText = captured.map((c) => c.str).join(' ').trim()
            }
          }
        } catch (pdfErr) {
          console.warn('PDF.js szövegkinyerési figyelmeztetés:', pdfErr)
        }

        // 2. SyncTeX lekérdezés a koordináták alapján
        const targetLines = []
        try {
          const resMid = await axios.post('/api/compile/synctex-inverse', {
            page,
            x: midX,
            y: midY
          })
          if (resMid.data?.target?.lines) {
            targetLines.push(...resMid.data.target.lines)
          } else if (resMid.data?.target?.line) {
            targetLines.push(resMid.data.target.line)
          }

          // Ha a doboz magasabb (> 30px), mint egy sor, a tetejét és az alját is felmérjük
          if (box.height > 30) {
            const topY = (box.top / rect.height) * ptHeight
            const botY = ((box.top + box.height) / rect.height) * ptHeight

            const [resTop, resBot] = await Promise.allSettled([
              axios.post('/api/compile/synctex-inverse', { page, x: midX, y: topY }),
              axios.post('/api/compile/synctex-inverse', { page, x: midX, y: botY })
            ])
            if (resTop.status === 'fulfilled') {
              const d = resTop.value.data?.target
              if (d?.lines) targetLines.push(...d.lines)
              else if (d?.line) targetLines.push(d.line)
            }
            if (resBot.status === 'fulfilled') {
              const d = resBot.value.data?.target
              if (d?.lines) targetLines.push(...d.lines)
              else if (d?.line) targetLines.push(d.line)
            }
          }
        } catch (synctexErr) {
          console.warn('SyncTeX feloldási hiba:', synctexErr)
        }

        if (isCancelled) return

        const minLine = targetLines.length > 0 ? Math.min(...targetLines) : null
        const maxLine = targetLines.length > 0 ? Math.max(...targetLines) : null

        // 3. Intelligens blokkfelismerés (PDF szövegegyeztetés + SyncTeX sorszámok)
        const block = findLatexBlockAroundRange(code, minLine, maxLine, pdfText)

        if (block && block.selectedText && block.selectedText.trim()) {
          setSelectedBlock(block)
          if (block.isFigure) {
            setActiveTab('figure')
          }
          setIsAiPromptOpen(true)
        } else {
          setSelectionTip(pdfText ? `Kijelölve: "${pdfText.slice(0, 45)}..."` : 'Nem sikerült beazonosítani a megfelelő kódrészletet.')
        }
      } catch (err) {
        console.warn('Kijelölés feloldási hiba:', err)
        if (!isCancelled) {
          setSelectionTip('Nem sikerült kódrészletet társítani a kijelöléshez.')
        }
      } finally {
        if (!isCancelled) {
          setResolvingSelection(false)
        }
      }
    }

    resolveSelection()
    return () => {
      isCancelled = true
    }
  }, [selectionState, code, pdfDoc, scale])

  // ── 7a. Kiterjesztés a teljes feladatra / szülő elemre ──
  const handleExpandToTask = useCallback(() => {
    if (!selectedBlock?.enclosingTask || !code) return
    const { startLine, endLine } = selectedBlock.enclosingTask
    const lines = code.split('\n')
    const newText = lines.slice(startLine - 1, endLine).join('\n')
    setSelectedBlock((prev) => ({
      ...prev,
      startLine,
      endLine,
      selectedText: newText,
      isExpanded: true
    }))
  }, [selectedBlock, code])

  // ── 7b. Kijelölési sorok finomhangolása (pl. +1 sor felül, +1 sor alul) ──
  const handleAdjustLines = useCallback((deltaStart, deltaEnd) => {
    if (!selectedBlock || !code) return
    const lines = code.split('\n')
    const newStart = Math.max(1, Math.min(lines.length, selectedBlock.startLine + deltaStart))
    const newEnd = Math.max(newStart, Math.min(lines.length, selectedBlock.endLine + deltaEnd))
    const newText = lines.slice(newStart - 1, newEnd).join('\n')
    setSelectedBlock((prev) => ({
      ...prev,
      startLine: newStart,
      endLine: newEnd,
      selectedText: newText
    }))
  }, [selectedBlock, code])

  // ── 7c. AI Módosítás (Csere) végrehajtása a PDF kijelölés alapján ──
  const handleExecuteTransform = async (customInstruction) => {
    const instr = customInstruction || inlineInstruction
    if (!instr.trim() || !selectedBlock?.selectedText || !onTransformSelection) return

    setIsTransforming(true)
    try {
      await onTransformSelection({
        selectedText: selectedBlock.selectedText,
        instruction: instr,
        startLine: selectedBlock.startLine,
        endLine: selectedBlock.endLine,
        isFigure: Boolean(selectedBlock.isFigure || activeTab === 'figure')
      })
      setIsAiPromptOpen(false)
      setSelectionState(null)
      setSelectedBlock(null)
      setInlineInstruction('')
    } catch (err) {
      console.error('PDF kijelölés átalakítási hiba:', err)
    } finally {
      setIsTransforming(false)
    }
  }

  // ── 8. AI Tartalom Beszúrása a PDF kijelölés alapján ──
  const handleExecuteInsert = async (customInstruction) => {
    const instr = customInstruction || inlineInstruction
    if (!instr.trim() || !onInsertSelection) return

    setIsTransforming(true)
    try {
      await onInsertSelection({
        contextSnippet: selectedBlock?.selectedText || '',
        instruction: instr,
        position: insertPosition,
        startLine: selectedBlock?.startLine,
        endLine: selectedBlock?.endLine
      })
      setIsAiPromptOpen(false)
      setSelectionState(null)
      setSelectedBlock(null)
      setInlineInstruction('')
    } catch (err) {
      console.error('PDF tartalom beszúrási hiba:', err)
    } finally {
      setIsTransforming(false)
    }
  }

  // Escape billentyű figyelése
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (isAiPromptOpen && !isTransforming) {
          setIsAiPromptOpen(false)
        } else if (selectionState) {
          setSelectionState(null)
          setSelectedBlock(null)
          setSelectionTip(null)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isAiPromptOpen, isTransforming, selectionState])

  const handleZoomIn = () => setScale((s) => Math.min(2.5, +(s + 0.15).toFixed(2)))
  const handleZoomOut = () => setScale((s) => Math.max(0.6, +(s - 0.15).toFixed(2)))
  const handleZoomReset = () => setScale(1.2)

  const isSelectActive = toolMode !== 'none'

  return (
    <div className="preview-pane">
      {/* Fejléc és Vezérlők */}
      <div className="preview-pane-header">
        <div className="preview-header-left">
          <div className="column-header-title-wrap">
            <div className="column-header-icon-wrap" title="PDF előnézet">
              <FileText size={13} />
            </div>
            <span className="column-header-title preview-header-title">PDF előnézet</span>
            <span className="column-header-title-short preview-header-title-short">PDF</span>
          </div>
          {numPages > 0 && (
            <span className="preview-page-badge">
              <span className="badge-full">{numPages} oldal</span>
              <span className="badge-short">{numPages}</span>
            </span>
          )}
          {inverseSyncing && (
            <span className="preview-syncing-pill">
              <Navigation size={11} className="spinner" />
              <span className="sync-text-full">Keresés a kódban...</span>
              <span className="sync-text-short">Keresés...</span>
            </span>
          )}
        </div>

        <div className="preview-header-actions">
          {/* Fő Fordítás Gomb */}
          {onCompile && (
            <button
              type="button"
              className={`pdf-header-btn pdf-header-compile-btn ${
                compileStatus === 'compiling' ? 'compiling' : compileStatus === 'error' ? 'error' : 'ready'
              }`}
              onClick={onCompile}
              disabled={compileStatus === 'compiling'}
              title="PDF fordítása TeX Live motorral (⌘S vagy Ctrl+S)"
            >
              {compileStatus === 'compiling' ? (
                <>
                  <Loader2 size={13} className="spinner" />
                  <span className="pdf-btn-label">Fordítás folyamatban...</span>
                </>
              ) : compileStatus === 'error' ? (
                <>
                  <AlertTriangle size={13} />
                  <span className="pdf-btn-label">Fordítás újra</span>
                  <span className="pdf-header-kbd">⌘S</span>
                </>
              ) : (
                <>
                  <Play size={13} fill="currentColor" />
                  <span className="pdf-btn-label pdf-btn-label-full">PDF Fordítás</span>
                  <span className="pdf-btn-label pdf-btn-label-short">Fordítás</span>
                  <span className="pdf-header-kbd">⌘S</span>
                </>
              )}
            </button>
          )}

          {/* Ábra szerkesztése gomb (önálló gomb, TikZ ábrák kiemeléséhez) */}
          {pdfData && (
            <button
              type="button"
              className={`pdf-header-btn ${toolMode === 'figure' ? 'active' : ''}`}
              onClick={() => {
                const next = toolMode === 'figure' ? 'none' : 'figure'
                setToolMode(next)
                if (next === 'figure') {
                  setActiveTab('figure')
                }
                if (next === 'none') {
                  setSelectionState(null)
                  setSelectedBlock(null)
                  setIsAiPromptOpen(false)
                }
              }}
              title={
                toolMode === 'figure'
                  ? 'TikZ Ábra szerkesztő aktív (Válassz ábrát a listából vagy jelölj ki egyet a PDF-en)'
                  : 'TikZ ábrák AI szerkesztése'
              }
            >
              <Shapes size={13} />
              <span className="pdf-btn-label">Ábrák</span>
              {figuresList.length > 0 && (
                <span className="pdf-header-badge">{figuresList.length}</span>
              )}
            </button>
          )}

          {/* Átszerkesztés gomb (önálló gomb, egységes stílus a Letöltés mintájára) */}
          {pdfData && (
            <button
              type="button"
              className={`pdf-header-btn ${toolMode === 'select' ? 'active' : ''}`}
              onClick={() => {
                const next = toolMode === 'select' ? 'none' : 'select'
                setToolMode(next)
                setActiveTab('transform')
                if (next === 'none') {
                  setSelectionState(null)
                  setSelectedBlock(null)
                  setIsAiPromptOpen(false)
                }
              }}
              title={
                toolMode === 'select'
                  ? 'Terület kijelölés bekapcsolva (Húzd az egeret a meglévő rész átírásához)'
                  : 'Terület kijelölése és átírása'
              }
            >
              <Scan size={13} />
              <span className="pdf-btn-label">Átszerkesztés</span>
            </button>
          )}

          {/* Zoom vezérlők (egységes magasság, keret és tónus) */}
          {pdfData && (
            <div className="pdf-header-group pdf-zoom-group">
              <button
                type="button"
                className="pdf-group-btn"
                onClick={handleZoomOut}
                title="Kicsinyítés"
              >
                <ZoomOut size={13} />
              </button>
              <button
                type="button"
                className="pdf-group-val-btn"
                onClick={handleZoomReset}
                title="Eredeti méret visszaállítása (120%)"
              >
                {Math.round(scale * 100)}%
              </button>
              <button
                type="button"
                className="pdf-group-btn"
                onClick={handleZoomIn}
                title="Nagyítás"
              >
                <ZoomIn size={13} />
              </button>
            </div>
          )}

          {/* Gyors ugrás / lapozás többoldalas dokumentumnál */}
          {numPages > 1 && (
            <div className="pdf-header-group pdf-pager-group">
              <button
                type="button"
                className="pdf-group-btn"
                onClick={() => containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
                title="Ugrás az első oldalra / tetejére"
              >
                <ChevronUp size={13} />
              </button>
              <button
                type="button"
                className="pdf-group-btn"
                onClick={() =>
                  containerRef.current?.scrollTo({
                    top: containerRef.current.scrollHeight,
                    behavior: 'smooth'
                  })
                }
                title="Ugrás az utolsó oldalra / végére"
              >
                <ChevronDown size={13} />
              </button>
            </div>
          )}

          {/* Letöltés gomb */}
          {pdfData && onDownloadPdf && (
            <button
              type="button"
              className="pdf-header-btn"
              onClick={onDownloadPdf}
              title="PDF letöltése a számítógépre"
            >
              <Download size={13} />
              <span className="pdf-btn-label">Letöltés</span>
            </button>
          )}
        </div>
      </div>

      {/* TikZ ábrák gyorsválasztó sávja Ábra szerkesztés módban */}
      {toolMode === 'figure' && (
        <div className="pdf-figures-quickbar">
          <div className="pdf-figures-quickbar-header">
            <div className="pdf-figures-quickbar-title">
              <Shapes size={14} className="figure-icon" />
              <span>Dokumentumban észlelt TikZ ábrák ({figuresList.length})</span>
            </div>
            <span className="pdf-figures-quickbar-hint">
              Kattints egy ábrára a gyors AI módosításhoz, vagy húzd az egeret a PDF-en egy ábra fölé!
            </span>
          </div>
          <div className="pdf-figures-pills">
            {figuresList.length === 0 ? (
              <div className="pdf-figures-empty">
                A dokumentumban nem található TikZ ábra. Jelölj ki egy területet az Átszerkesztésben új ábra beszúrásához!
              </div>
            ) : (
              figuresList.map((fig) => (
                <button
                  key={fig.index}
                  type="button"
                  className={`pdf-figure-pill ${hoveredFigure?.fig.index === fig.index ? 'hovered' : ''}`}
                  onClick={() => {
                    setHoveredFigure(null)
                    setHoverHighlight(null)
                    handleSelectFigureDirectly(fig)
                  }}
                  onMouseEnter={(e) => handleFigureMouseEnter(fig, e)}
                  onMouseLeave={handleFigureMouseLeave}
                >
                  <span className="figure-pill-badge">#{fig.index}</span>
                  <span className="figure-pill-title">{fig.title || 'TikZ ábra'}</span>
                  <span className="figure-pill-lines">L{fig.startLine}–{fig.endLine} ({fig.lineCount} sor)</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Törzs: Folyamatos görgethető oldalak vásznakkal */}
      <div
        className={`preview-body pdf-canvas-container ${pdfData ? 'has-pdf' : 'empty'}`}
        ref={containerRef}
      >
        {pdfData ? (
          <div className="pdf-pages-scroll-wrap">
            {Array.from({ length: numPages }, (_, idx) => {
              const pageNum = idx + 1
              return (
                <div
                  key={pageNum}
                  id={`pdf-page-${pageNum}`}
                  className={`pdf-page-card ${isSelectActive ? 'select-mode' : ''}`}
                  onMouseDown={(e) => handlePageMouseDown(e, pageNum)}
                  onDoubleClick={(e) => handlePageDoubleClick(e, pageNum)}
                  title={
                    toolMode === 'insert'
                      ? 'Kattints vagy húzd az egeret új AI tartalom beszúrásához · Dupla kattintás: Ugrás a forráskódra'
                      : 'Húzd az egeret terület kijelöléséhez AI átszerkesztésre · Dupla kattintás: Ugrás a forráskódra'
                  }
                >
                  <canvas ref={(el) => (canvasRefs.current[pageNum] = el)} className="pdf-canvas" />

                  {/* Lebegő egér rámutatás (Hover) ábra körvonal kiemelés */}
                  {hoverHighlight && hoverHighlight.page === pageNum && (
                    <div
                      className="figure-hover-highlight-box"
                      style={{
                        left: `${hoverHighlight.left}px`,
                        top: `${hoverHighlight.top}px`,
                        width: `${hoverHighlight.width}px`,
                        height: `${hoverHighlight.height}px`
                      }}
                    />
                  )}

                  {/* SyncTeX Kiemelés doboz (Kódból Forward ugráskor) */}
                  {highlight && highlight.page === pageNum && (
                    <div
                      className="synctex-highlight-box"
                      style={{
                        left: `${highlight.left}px`,
                        top: `${highlight.top}px`,
                        width: `${highlight.width}px`,
                        height: `${highlight.height}px`
                      }}
                    />
                  )}

                  {/* Terület-kijelölés doboz ezen az oldalon */}
                  {selectionState && selectionState.page === pageNum && (
                    <div
                      className={`pdf-area-selection-box ${
                        selectionState.isFinished ? 'finished' : 'dragging'
                      } ${activeTab === 'insert' ? 'insert-mode' : ''}`}
                      style={{
                        left: `${selectionState.box.left}px`,
                        top: `${selectionState.box.top}px`,
                        width: `${selectionState.box.width}px`,
                        height: `${selectionState.box.height}px`
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Bezárás gomb a kijelölt dobozon */}
                      {selectionState.isFinished && (
                        <button
                          className="pdf-selection-dismiss-btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectionState(null)
                            setSelectedBlock(null)
                            setIsAiPromptOpen(false)
                            setSelectionTip(null)
                          }}
                          title="Kijelölés megszüntetése (Esc)"
                        >
                          <X size={12} />
                        </button>
                      )}

                      {/* Beszúrási célpont vizuális vonaljelzője a dobozon */}
                      {selectionState.isFinished && activeTab === 'insert' && (
                        <div className={`pdf-insertion-indicator ${insertPosition}`}>
                          <span className="pdf-insertion-badge">
                            {insertPosition === 'after' ? '⬇ Beszúrás ide (alá)' : '⬆ Beszúrás ide (elé)'}
                          </span>
                        </div>
                      )}

                      {/* Kód beazonosítása folyamatban jelzés */}
                      {resolvingSelection && (
                        <div className="pdf-selection-loading-pill">
                          <Loader2 size={12} className="spinner" />
                          <span>Kód azonosítása...</span>
                        </div>
                      )}

                      {/* Tájékoztató üzenet (pl. üres margó kijelölése esetén) */}
                      {selectionTip && !resolvingSelection && (
                        <div className="pdf-selection-tip-pill">
                          <span>{selectionTip}</span>
                        </div>
                      )}

                      {/* Lebegő művelet gombok ha a doboz kijelölve és a dialógus be van zárva */}
                      {selectionState.isFinished &&
                        !isAiPromptOpen &&
                        selectedBlock &&
                        !resolvingSelection && (
                          <div className="pdf-selection-actions-cluster">
                            <div
                              className={`pdf-selection-action-pill insert ${activeTab === 'insert' ? 'primary' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                setActiveTab('insert')
                                setIsAiPromptOpen(true)
                              }}
                              title="Új AI tartalom beszúrása a kijelölt pozícióhoz"
                            >
                              <Plus size={13} />
                              <span>Beszúrás ide</span>
                            </div>
                            <div
                              className={`pdf-selection-action-pill transform ${activeTab === 'transform' ? 'primary' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                setActiveTab('transform')
                                setIsAiPromptOpen(true)
                              }}
                              title="Kijelölt rész átdolgozása AI paranccsal"
                            >
                              <Wand2 size={13} />
                              <span>Átszerkesztés ({selectedBlock.endLine - selectedBlock.startLine + 1} sor)</span>
                            </div>
                          </div>
                        )}
                    </div>
                  )}

                  <div className="pdf-page-number-pill">
                    {pageNum} / {numPages}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="preview-placeholder">
            <div className="preview-placeholder-icon-wrap">
              <FileText size={32} />
            </div>
            <div className="preview-placeholder-title">Még nincs lefordított előnézet</div>
            <div className="preview-placeholder-desc">
              Kattints a <strong>PDF Fordítás</strong> gombra vagy nyomd le a{' '}
              <kbd className="kbd-badge">⌘S</kbd> billentyűkombinációt a dokumentum legenerálásához.
            </div>
            {onCompile && (
              <button
                className="btn btn-primary"
                onClick={onCompile}
                disabled={compileStatus === 'compiling'}
                style={{ marginTop: 8 }}
              >
                <Play size={14} fill="currentColor" />
                Fordítás indítása
              </button>
            )}
          </div>
        )}
      </div>

            {/* Lebegő TikZ Ábra Előnézet (CSAK maga a kirajzolt ábra) */}
      {hoveredFigure && (
        <div
          className="pdf-figure-hover-popover pure-figure"
          style={{ top: hoveredFigure.pos.top, left: hoveredFigure.pos.left }}
          onMouseEnter={handlePopoverMouseEnter}
          onMouseLeave={handlePopoverMouseLeave}
          onClick={() => {
            const fig = hoveredFigure.fig
            setHoveredFigure(null)
            setHoverHighlight(null)
            handleSelectFigureDirectly(fig)
          }}
          title="Kattints az ábra AI szerkesztéséhez"
        >
          {figurePreviews[hoveredFigure.fig.index]?.dataUrl ? (
            <img
              src={figurePreviews[hoveredFigure.fig.index].dataUrl}
              alt={`TikZ ábra #${hoveredFigure.fig.index}`}
              className="pdf-popover-pure-image"
            />
          ) : figurePreviews[hoveredFigure.fig.index]?.isLoading ? (
            <div className="pdf-popover-pure-loading">
              <Loader2 size={16} className="spinner" />
              <span>Ábra fordítása beépített LaTeX-kel...</span>
            </div>
          ) : (
            <div className="pdf-popover-pure-loading">
              <span>Nincs előnézet</span>
            </div>
          )}
        </div>
      )}

      {/* Lebegő AI Parancssor Dialógus a PDF-ből indított műveletekhez (Beszúrás és Átszerkesztés) */}
      {isAiPromptOpen && selectedBlock && (
        <div
          className="inline-ai-overlay"
          onClick={() => !isTransforming && setIsAiPromptOpen(false)}
        >
          <div className="inline-ai-dialog" onClick={(e) => e.stopPropagation()}>
            {/* Fejléc Fülekkel: Beszúrás és Átszerkesztés */}
            <div className="inline-ai-dialog-header">
              <div className="inline-ai-tab-bar" style={{ flex: 1, marginRight: 10 }}>
                {selectedBlock.isFigure && (
                  <button
                    type="button"
                    className={`inline-ai-tab-btn figure-tab ${activeTab === 'figure' ? 'active' : ''}`}
                    onClick={() => setActiveTab('figure')}
                    disabled={isTransforming}
                  >
                    <Shapes size={14} />
                    <span>TikZ Ábra szerkesztése</span>
                  </button>
                )}
                <button
                  type="button"
                  className={`inline-ai-tab-btn ${activeTab === 'transform' ? 'active' : ''}`}
                  onClick={() => setActiveTab('transform')}
                  disabled={isTransforming}
                >
                  <Wand2 size={14} />
                  <span>Kijelölt rész átdolgozása</span>
                </button>
                <button
                  type="button"
                  className={`inline-ai-tab-btn insert-tab ${activeTab === 'insert' ? 'active' : ''}`}
                  onClick={() => setActiveTab('insert')}
                  disabled={isTransforming}
                >
                  <Plus size={14} />
                  <span>Új tartalom beszúrása</span>
                </button>
              </div>
              <button
                className="btn-subtle"
                onClick={() => setIsAiPromptOpen(false)}
                disabled={isTransforming}
                title="Bezárás (Esc)"
              >
                <X size={15} />
              </button>
            </div>

            {activeTab === 'figure' ? (
              <>
                {/* TikZ Ábra szerkesztés fül */}
                <div className="inline-ai-context-header figure-header">
                  <div className="inline-ai-context-title">
                    <Shapes size={14} style={{ color: '#0a84ff' }} />
                    <span>
                      TikZ Ábra {selectedBlock.figureIndex ? `#${selectedBlock.figureIndex}` : ''} ({selectedBlock.title || 'Ábra'}) · Sor: {selectedBlock.startLine}–{selectedBlock.endLine}
                    </span>
                    <span className="inline-ai-figure-badge">📐 TikZ Kód</span>
                  </div>
                  <div className="inline-ai-line-adjusters">
                    <button
                      type="button"
                      className="inline-ai-line-btn"
                      onClick={() => handleAdjustLines(-1, 0)}
                      title="1 sor hozzáadása a tetejéhez"
                      disabled={selectedBlock.startLine <= 1}
                    >
                      +1 sor felül
                    </button>
                    <button
                      type="button"
                      className="inline-ai-line-btn"
                      onClick={() => handleAdjustLines(0, 1)}
                      title="1 sor hozzáadása az aljához"
                      disabled={selectedBlock.endLine >= (code ? code.split('\n').length : 9999)}
                    >
                      +1 sor alul
                    </button>
                  </div>
                </div>

                <div className="inline-ai-snippet-preview figure-preview">
                  <code>
                    {selectedBlock.selectedText.slice(0, 400)}
                    {selectedBlock.selectedText.length > 400 && '...'}
                  </code>
                </div>

                {/* Gyors TikZ módosítási lehetőségek */}
                <div className="inline-ai-chips figure-chips">
                  {FIGURE_QUICK_CHIPS.map((chip, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="inline-ai-chip figure-chip"
                      disabled={isTransforming}
                      onClick={() => {
                        setInlineInstruction(chip.prompt)
                        handleExecuteTransform(chip.prompt)
                      }}
                      title={chip.prompt}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>

                {/* Parancsbeviteli mező */}
                <div className="inline-ai-input-wrap">
                  <input
                    className="inline-ai-input"
                    value={inlineInstruction}
                    onChange={(e) => setInlineInstruction(e.target.value)}
                    placeholder="Mit változtasson az AI az ábrán? (pl. Növeld a méretet 20%-kal, vastagabb nyilak...)"
                    autoFocus
                    disabled={isTransforming}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleExecuteTransform()
                      } else if (e.key === 'Escape') {
                        setIsAiPromptOpen(false)
                      }
                    }}
                  />
                </div>

                {/* Műveleti gombok */}
                <div className="inline-ai-actions">
                  <button
                    className="btn btn-ghost"
                    onClick={() => setIsAiPromptOpen(false)}
                    disabled={isTransforming}
                  >
                    Mégse (Esc)
                  </button>
                  <button
                    className="btn btn-primary"
                    style={{ background: 'linear-gradient(180deg, #2b8fff 0%, #0a84ff 100%)', borderColor: '#0a84ff' }}
                    onClick={() => handleExecuteTransform()}
                    disabled={!inlineInstruction.trim() || isTransforming}
                  >
                    {isTransforming ? (
                      <>
                        <Loader2 size={14} className="spinner" />
                        Gemini alakítja az ábrát...
                      </>
                    ) : (
                      <>
                        <Shapes size={14} />
                        Ábra újragenerálása (Enter)
                        <CornerDownLeft size={12} />
                      </>
                    )}
                  </button>
                </div>
              </>
            ) : activeTab === 'insert' ? (
              <>
                {/* Elhelyezés választó: Kijelölt rész után vagy előtt */}
                <div className="inline-ai-position-bar">
                  <span className="inline-ai-pos-label">Beszúrás elhelyezése:</span>
                  <div className="inline-ai-pos-buttons">
                    <button
                      type="button"
                      className={`inline-ai-pos-btn ${insertPosition === 'after' ? 'active' : ''}`}
                      onClick={() => setInsertPosition('after')}
                      disabled={isTransforming}
                      title="A generált új tartalom a kiválasztott rész alá kerül"
                    >
                      <ArrowDown size={12} />
                      <span>Kijelölt rész alá (után)</span>
                    </button>
                    <button
                      type="button"
                      className={`inline-ai-pos-btn ${insertPosition === 'before' ? 'active' : ''}`}
                      onClick={() => setInsertPosition('before')}
                      disabled={isTransforming}
                      title="A generált új tartalom a kiválasztott rész fölé kerül"
                    >
                      <ArrowUp size={12} />
                      <span>Kijelölt rész fölé (elé)</span>
                    </button>
                  </div>
                </div>

                {/* Kontextus kód előnézet */}
                <div className="inline-ai-context-header">
                  <div className="inline-ai-context-title">
                    <span>Beszúrási kontextus (Sor: {selectedBlock.startLine}–{selectedBlock.endLine})</span>
                    {selectedBlock.isExpanded && (
                      <span className="inline-ai-fulltask-badge">✨ Teljes feladat</span>
                    )}
                  </div>
                  <div className="inline-ai-line-adjusters">
                    <button
                      type="button"
                      className="inline-ai-line-btn"
                      onClick={() => handleAdjustLines(-1, 0)}
                      title="1 sor hozzáadása a tetejéhez"
                      disabled={selectedBlock.startLine <= 1}
                    >
                      +1 sor felül
                    </button>
                    <button
                      type="button"
                      className="inline-ai-line-btn"
                      onClick={() => handleAdjustLines(0, 1)}
                      title="1 sor hozzáadása az aljához"
                      disabled={selectedBlock.endLine >= (code ? code.split('\n').length : 9999)}
                    >
                      +1 sor alul
                    </button>
                  </div>
                </div>

                {selectedBlock.enclosingTask &&
                  (selectedBlock.enclosingTask.startLine < selectedBlock.startLine ||
                    selectedBlock.enclosingTask.endLine > selectedBlock.endLine) && (
                    <div className="inline-ai-expand-banner">
                      <button
                        type="button"
                        className="inline-ai-expand-btn"
                        onClick={handleExpandToTask}
                        title="Kijelölés kiterjesztése a teljes, több oldalon átnyúló feladatra"
                      >
                        <Maximize2 size={13} />
                        <span>
                          ⤢ Teljes feladat kijelölése ({selectedBlock.enclosingTask.startLine}–{selectedBlock.enclosingTask.endLine}. sor)
                        </span>
                      </button>
                      <span className="inline-ai-expand-hint">
                        Átnyúlik mindkét oldalra!
                      </span>
                    </div>
                  )}

                <div className="inline-ai-snippet-preview">
                  {selectedBlock.selectedText.slice(0, 300)}
                  {selectedBlock.selectedText.length > 300 && '...'}
                </div>

                {/* Gyors beszúrás sablonok (Chips) */}
                <div className="inline-ai-chips">
                  {QUICK_INSERT_CHIPS.map((chip, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="inline-ai-chip insert-chip"
                      disabled={isTransforming}
                      onClick={() => {
                        setInlineInstruction(chip)
                        handleExecuteInsert(chip)
                      }}
                    >
                      {chip}
                    </button>
                  ))}
                </div>

                {/* Parancsbeviteli mező */}
                <div className="inline-ai-input-wrap">
                  <input
                    className="inline-ai-input"
                    value={inlineInstruction}
                    onChange={(e) => setInlineInstruction(e.target.value)}
                    placeholder="Mit szúrjon be az AI? (pl. Készíts 2 részes ellenőrző feladatot a fenti összefüggéshez)"
                    autoFocus
                    disabled={isTransforming}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleExecuteInsert()
                      } else if (e.key === 'Escape') {
                        setIsAiPromptOpen(false)
                      }
                    }}
                  />
                </div>

                {/* Műveleti gombok */}
                <div className="inline-ai-actions">
                  <button
                    className="btn btn-ghost"
                    onClick={() => setIsAiPromptOpen(false)}
                    disabled={isTransforming}
                  >
                    Mégse (Esc)
                  </button>
                  <button
                    className="btn btn-primary"
                    style={{ background: 'linear-gradient(180deg, #34c759 0%, #30d158 100%)', borderColor: '#30d158' }}
                    onClick={() => handleExecuteInsert()}
                    disabled={!inlineInstruction.trim() || isTransforming}
                  >
                    {isTransforming ? (
                      <>
                        <Loader2 size={14} className="spinner" />
                        Gemini generálja...
                      </>
                    ) : (
                      <>
                        <Plus size={14} />
                        Beszúrás ide (Enter)
                        <CornerDownLeft size={12} />
                      </>
                    )}
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Átszerkesztés fül */}
                <div className="inline-ai-context-header">
                  <div className="inline-ai-context-title">
                    <span>Átszerkesztendő kódrészlet (Sor: {selectedBlock.startLine}–{selectedBlock.endLine})</span>
                    {selectedBlock.isExpanded && (
                      <span className="inline-ai-fulltask-badge">✨ Teljes feladat</span>
                    )}
                  </div>
                  <div className="inline-ai-line-adjusters">
                    <button
                      type="button"
                      className="inline-ai-line-btn"
                      onClick={() => handleAdjustLines(-1, 0)}
                      title="1 sor hozzáadása a tetejéhez"
                      disabled={selectedBlock.startLine <= 1}
                    >
                      +1 sor felül
                    </button>
                    <button
                      type="button"
                      className="inline-ai-line-btn"
                      onClick={() => handleAdjustLines(0, 1)}
                      title="1 sor hozzáadása az aljához"
                      disabled={selectedBlock.endLine >= (code ? code.split('\n').length : 9999)}
                    >
                      +1 sor alul
                    </button>
                  </div>
                </div>

                {selectedBlock.enclosingTask &&
                  (selectedBlock.enclosingTask.startLine < selectedBlock.startLine ||
                    selectedBlock.enclosingTask.endLine > selectedBlock.endLine) && (
                    <div className="inline-ai-expand-banner">
                      <button
                        type="button"
                        className="inline-ai-expand-btn"
                        onClick={handleExpandToTask}
                        title="Kijelölés kiterjesztése a teljes, több oldalon átnyúló feladatra"
                      >
                        <Maximize2 size={13} />
                        <span>
                          ⤢ Teljes feladat kijelölése ({selectedBlock.enclosingTask.startLine}–{selectedBlock.enclosingTask.endLine}. sor)
                        </span>
                      </button>
                      <span className="inline-ai-expand-hint">
                        Átnyúlik a következő oldalra is!
                      </span>
                    </div>
                  )}

                <div className="inline-ai-snippet-preview">
                  {selectedBlock.selectedText.slice(0, 350)}
                  {selectedBlock.selectedText.length > 350 && '...'}
                </div>

                <div className="inline-ai-chips">
                  {QUICK_TRANSFORM_CHIPS.map((chip, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="inline-ai-chip"
                      disabled={isTransforming}
                      onClick={() => {
                        setInlineInstruction(chip)
                        handleExecuteTransform(chip)
                      }}
                    >
                      {chip}
                    </button>
                  ))}
                </div>

                <div className="inline-ai-input-wrap">
                  <input
                    className="inline-ai-input"
                    value={inlineInstruction}
                    onChange={(e) => setInlineInstruction(e.target.value)}
                    placeholder="Írd be a parancsot... (pl. tedd elegáns tcolorbox dobozba és javítsd a képleteket)"
                    autoFocus
                    disabled={isTransforming}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleExecuteTransform()
                      } else if (e.key === 'Escape') {
                        setIsAiPromptOpen(false)
                      }
                    }}
                  />
                </div>

                <div className="inline-ai-actions">
                  <button
                    className="btn btn-ghost"
                    onClick={() => setIsAiPromptOpen(false)}
                    disabled={isTransforming}
                  >
                    Mégse (Esc)
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => handleExecuteTransform()}
                    disabled={!inlineInstruction.trim() || isTransforming}
                  >
                    {isTransforming ? (
                      <>
                        <Loader2 size={14} className="spinner" />
                        Gemini dolgozik...
                      </>
                    ) : (
                      <>
                        <Sparkles size={14} />
                        Módosítás (Enter)
                        <CornerDownLeft size={12} />
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
