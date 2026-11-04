import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import axios from 'axios'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import CustomSelect from './CustomSelect'
import { findSmartReplacement } from '../utils/snippetMatcher'
import {
  Sparkles,
  Wand2,
  Shapes,
  ListChecks,
  Presentation,
  UploadCloud,
  FileText,
  X,
  Copy,
  Check,
  Plus,
  Minus,
  RefreshCw,
  Info,
  CheckCircle2,
  Undo2,
  MessageSquare,
  Send,
  ImageIcon,
  FileCode,
  User,
  Maximize2,
  PanelLeftClose,
  Replace,
  Folder,
  Sigma,
  Atom,
  Loader2,
  ArrowUp,
  ArrowDown,
  Eye,
  Code,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  FilePlus,
  AlertCircle,
  Palette,
  Contrast,
  Type,
  MoveRight,
  Crosshair,
  ArrowDownToLine,
  Image,
  AlignCenter
} from 'lucide-react'

if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker
}

const MODES = [
  { id: 'chat', label: 'Csevegő', icon: MessageSquare, desc: 'Interaktív AI asszisztens és kép alapú hibajavítás' },
  { id: 'generate', label: 'Generálás', icon: Sparkles, desc: 'Teljes dokumentum téma alapján' },
  { id: 'rewrite', label: 'Átdolgozás', icon: Wand2, desc: 'LaTeX kód stílusának vagy tartalmának javítása' },
  { id: 'tikz', label: 'TikZ Ábra', icon: Shapes, desc: 'Vektoros ábra természetes leírásból' },
  { id: 'problems', label: 'Feladatsor', icon: ListChecks, desc: 'Feladatok nehézség szerint megoldással' },
  { id: 'beamer', label: 'Beamer Diák', icon: Presentation, desc: 'Prezentáció készítése a dokumentumból' }
]

const MODEL_OPTIONS = [
  { value: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', desc: 'Legújabb csúcsmodell' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', desc: 'Gyors és megbízható' },
  { value: 'local', label: 'Helyi LLM', desc: 'LM Studio / Ollama' }
]

const DOC_TYPE_OPTIONS = [
  { value: 'osszefoglalo', label: 'Összefoglaló', desc: 'Definíciók, tételek, megoldott példák' },
  { value: 'microlearning', label: 'Mikrotananyag', desc: 'Elmélet → feladat → megoldás ritmusban' },
  { value: 'beamer', label: 'Beamer prezentáció', desc: 'Diák bullet pontokkal és képletekkel' },
  { value: 'leiras', label: 'Részletes leírás', desc: 'Folyó szöveg, példák, TikZ ábrák' }
]

const PROBLEM_DIFFICULTY_OPTIONS = [
  { value: 'pyramid', label: 'Piramis (fokozatosan nehezedő)', desc: 'K1 (Alap) → K2 (Közepes) → K3 (Összetett)' },
  { value: 'k1', label: 'K1 – Alapszint (Könnyű)', desc: 'Alapfogalmak és közvetlen begyakorlás' },
  { value: 'k2', label: 'K2 – Közepes szint', desc: 'Tipikus középszintű érettségi típusfeladatok' },
  { value: 'k3', label: 'K3 – Nehezebb, összetett', desc: 'Gondolkodtató feladatok (nem emelt érettségi!)' },
  { value: 'emelt', label: 'Emelt érettségi szint', desc: 'Valódi emelt szintű érettségi követelmények' },
  { value: 'competition', label: 'Verseny / Kihívás', desc: 'Mély gondolkodtató versenyfeladatok' }
]

const SOLUTION_PLACEMENT_OPTIONS = [
  { value: 'separate_page', label: 'Külön oldalon a végén', desc: 'A feladatok után új lapon' },
  { value: 'inline', label: 'Feladatok alatt (inline)', desc: 'Minden feladat után közvetlenül' },
  { value: 'separate_doc', label: 'Külön dokumentumban', desc: 'Önálló megoldókulcs .tex fájl' }
]

const TIKZ_PRESETS = {
  matematika: [
    { label: 'Koordináta-rendszer', prompt: 'Kétdimenziós derékszögű koordináta-rendszer rácsozással (-4-től 4-ig), nyilakkal, x és y tengelyfeliratokkal, valamint egy bejelölt ponttal: P(2, 3).' },
    { label: 'Derékszögű háromszög', prompt: 'Derékszögű háromszög a befogókkal (a=3 cm, b=4 cm) és átfogóval (c=5 cm), derékszög ívvel és ponttal a C csúcsnál, valamint beírt körrel.' },
    { label: 'Függvénygrafikon', prompt: 'Koordináta-rendszer az f(x) = x^2 - 4x + 3 másodfokú függvény parabolájával, tengelymetszetekkel és a tengelypont koordinátáival megjelölve.' },
    { label: 'Thalesz-tétel', prompt: 'Thalesz-kör átmérővel (AB szakasz), a félköríven egy C ponttal, és a derékszögű háromszög megrajzolásával, a C csúcsnál lévő derékszög íves jelölésével.' },
    { label: 'Valószínűségi fa', prompt: 'Kétszintes valószínűségi döntési fa (két pénzérmedobás: Fej/Írás kimenetelekkel, az éleken 1/2 valószínűségekkel és a leveleken a kimenetelekkel).' },
    { label: 'Kocka / Térbeli', prompt: '3D térbeli kocka perspektivikus ábrázolása, a takart élek szaggatott (dashed) vonallal rajzolva, csúcspontokkal.' }
  ],
  fizika: [
    { label: 'Szabadtest / Erők', prompt: 'Szabadtest-diagram (Free Body Diagram): lejtőn álló test, rajta a ható erőkkel (súlyerő G lefelé, nyomóerő N a lejtőre merőlegesen, súrlódási erő F_s a lejtő mentén felfelé).' },
    { label: 'Optika / Fénytörés', prompt: 'Optikai leképezés vékony gyűjtőlencsével (domború lencse): optikai tengely, fókuszpontok (F és 2F), egy tárgynyíl és a képalkotás 3 nevezetes fénysugara.' },
    { label: 'Áramkör', prompt: 'Egyszerű egyenáramú áramkör feszültségforrással (telep), egy R ellenállással, sorba kapcsolt ampermérővel (A) és az ellenállással párhuzamosan kapcsolt voltmérővel (V).' },
    { label: 'Lejtőn mozgó test', prompt: 'Alfa hajlásszögű lejtő, rajta egy m tömegű kiskocsival, a lejtő tetején csigával, rajta átvetett kötéllel és lefelé lógó m2 testtel.' },
    { label: 'Matematikai inga', prompt: 'Matematikai inga felfüggesztési ponttal, l hosszúságú fonállal, alfa szögkitéréssel, az egyensúlyi helyzet szaggatott vonallal jelölve, a nehezékre ható erőkkel.' }
  ]
}

// ─────────────────────────────────────────────────────────────
// Intelligens témakör-felismerő katalógus és logika
// ─────────────────────────────────────────────────────────────
const SUBJECT_KEYWORDS = [
  // Kombinatorika & Valószínűségszámítás
  { root: 'permutác', display: 'Permutáció' },
  { root: 'kombinác', display: 'Kombináció' },
  { root: 'variác', display: 'Variáció' },
  { root: 'kombinatorik', display: 'Kombinatorika' },
  { root: 'valószínűség', display: 'Valószínűségszámítás' },
  { root: 'valszám', display: 'Valószínűségszámítás' },
  { root: 'statisztik', display: 'Statisztika' },
  { root: 'gráf', display: 'Gráfelmélet' },
  { root: 'halmaz', display: 'Halmazelmélet' },
  { root: 'logik', display: 'Matematikai logika' },

  // Algebra & Számelmélet
  { root: 'másodfok', display: 'Másodfokú egyenletek' },
  { root: 'elsőfok', display: 'Elsőfokú egyenletek' },
  { root: 'hatvány', display: 'Hatványozás és gyökvonás' },
  { root: 'logarit', display: 'Logaritmus' },
  { root: 'exponenciál', display: 'Exponenciális kifejezések' },
  { root: 'egyenletrendszer', display: 'Egyenletrendszerek' },
  { root: 'egyenlet', display: 'Egyenletek' },
  { root: 'egyenlőtlenség', display: 'Egyenlőtlenségek' },
  { root: 'számelmélet', display: 'Számelmélet' },
  { root: 'oszthatóság', display: 'Oszthatóság és prímek' },
  { root: 'számtani sorozat', display: 'Számtani sorozatok' },
  { root: 'mértani sorozat', display: 'Mértani sorozatok' },
  { root: 'sorozat', display: 'Sorozatok' },

  // Analízis & Függvények
  { root: 'derivál', display: 'Differenciálszámítás' },
  { root: 'integrál', display: 'Integrálszámítás' },
  { root: 'szélsőérték', display: 'Szélsőérték-számítás' },
  { root: 'függvény', display: 'Függvények és analízis' },

  // Geometria & Trigonometria
  { root: 'trigonometri', display: 'Trigonometria' },
  { root: 'szögfüggvény', display: 'Szögfüggvények' },
  { root: 'vektor', display: 'Vektorok' },
  { root: 'koordinátageometri', display: 'Koordinátageometria' },
  { root: 'háromszög', display: 'Háromszögek geometriája' },
  { root: 'négyszög', display: 'Négyszögek geometriája' },
  { root: 'pitagorasz', display: 'Pitagorasz-tétel' },
  { root: 'kör', display: 'Kör és körszelet' },
  { root: 'térgeometri', display: 'Térgeometria' },
  { root: 'felszín', display: 'Felszín- és térfogatszámítás' },
  { root: 'térfogat', display: 'Felszín- és térfogatszámítás' },

  // Fizika
  { root: 'kinematik', display: 'Kinematika' },
  { root: 'mozgás', display: 'Mozgások és kinematika' },
  { root: 'hajítás', display: 'Hajítások és szabadesés' },
  { root: 'dinamik', display: 'Dinamika és Newton-törvények' },
  { root: 'gravitác', display: 'Gravitáció' },
  { root: 'súrlódás', display: 'Súrlódás és közegellenállás' },
  { root: 'munka', display: 'Munka, energia és teljesítmény' },
  { root: 'energia', display: 'Energia és munkatétel' },
  { root: 'lendület', display: 'Lendület és ütközések' },
  { root: 'forgómozgás', display: 'Forgómozgás' },
  { root: 'hidrosztatik', display: 'Hidrosztatika és felhajtóerő' },
  { root: 'nyomás', display: 'Nyomás és hidrosztatika' },
  { root: 'termodinamik', display: 'Termodinamika és hőtan' },
  { root: 'hőtan', display: 'Hőtan és gáztörvények' },
  { root: 'gáztörvény', display: 'Gáztörvények' },
  { root: 'elektrosztatik', display: 'Elektrosztatika' },
  { root: 'áramkör', display: 'Egyenáramú áramkörök' },
  { root: 'elektromosság', display: 'Elektromosságtan' },
  { root: 'mágnes', display: 'Mágnesesség és indukció' },
  { root: 'indukció', display: 'Elektromágneses indukció' },
  { root: 'váltakozó áram', display: 'Váltakozó áram' },
  { root: 'rezgés', display: 'Rezgések és hullámok' },
  { root: 'hullám', display: 'Hullámtan és hangtan' },
  { root: 'optik', display: 'Optika és fénytörés' },
  { root: 'fény', display: 'Fénytan' },
  { root: 'atomfizik', display: 'Atomfizika' },
  { root: 'magfizik', display: 'Magfizika és radioaktivitás' }
]

function extractTitleFromContent(content) {
  if (!content || typeof content !== 'string') return ''
  const titleMatch = content.match(/\\title\s*\{([^}]+)\}/)
  if (titleMatch && titleMatch[1]) {
    const t = titleMatch[1].replace(/\\\\/g, ' ').replace(/[{}\$]/g, '').trim()
    if (t) return t
  }
  const secMatch = content.match(/\\section\*?\s*\{([^}]+)\}/)
  if (secMatch && secMatch[1]) {
    const s = secMatch[1].replace(/\\\\/g, ' ').replace(/[{}\$]/g, '').trim()
    if (s) return s
  }
  return ''
}

function cleanSubjectName(str) {
  if (!str) return ''
  return str
    .replace(/\.tex$/i, '')
    .replace(/^[\d\.\-\s_]+/, '')
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function inferTopicFromFiles(files, folderHint = '') {
  if (!Array.isArray(files) || files.length === 0) {
    if (folderHint && folderHint !== 'Matematika' && folderHint !== 'Fizika') {
      return cleanSubjectName(folderHint)
    }
    return ''
  }

  const cleanNames = files.map((f) => cleanSubjectName(f.name || f.path || '')).filter(Boolean)
  if (cleanNames.length === 0) return ''

  // Ha csak 1 fájl van:
  if (cleanNames.length === 1) {
    const raw = cleanNames[0]
    const isGeneric = ['main', 'document', 'doc', 'untitled', 'nevtel', 'névtel', 'proba', 'próba', 'test', 'teszt', 'file'].some(
      (g) => raw.toLowerCase().startsWith(g)
    )
    if (isGeneric && files[0]?.content) {
      const fromContent = extractTitleFromContent(files[0].content)
      if (fromContent) return fromContent
    }
    return raw
  }

  // Szülőmappa kinyerése (pl. Matematika/Kombinatorika/1. Ismétlés nélküli permutáció.tex -> Kombinatorika)
  const parentFolders = files
    .map((f) => {
      const p = f.relativePath || f.path || ''
      const parts = p.split('/').filter(Boolean)
      if (parts.length >= 2) {
        const folder = parts[parts.length - 2]
        if (folder !== 'Matematika' && folder !== 'Fizika') {
          return cleanSubjectName(folder)
        }
      }
      return ''
    })
    .filter(Boolean)

  const commonParentFolder =
    parentFolders.length > 0 && parentFolders.every((f) => f.toLowerCase() === parentFolders[0].toLowerCase())
      ? parentFolders[0]
      : (folderHint && folderHint !== 'Matematika' && folderHint !== 'Fizika' ? cleanSubjectName(folderHint) : '')

  // Rövidítések kibontása és kisbetűsítés
  const normalizedNames = cleanNames.map((name) => {
    let s = name.toLowerCase()
    s = s.replace(/\bperm\b/g, 'permutáció')
    s = s.replace(/\bkomb\b/g, 'kombináció')
    s = s.replace(/\bvar\b/g, 'variáció')
    s = s.replace(/\bism\b/g, 'ismétlés')
    s = s.replace(/\bnelk\b/g, 'nélküli')
    s = s.replace(/\btrigo\b/g, 'trigonometria')
    s = s.replace(/\bgeom\b/g, 'geometria')
    s = s.replace(/\bkinem\b/g, 'kinematika')
    s = s.replace(/\bdinam\b/g, 'dinamika')
    return s
  })

  // 1. Megosztott szakmai kulcsszó vizsgálata az ÖSSZES fájlban (pl. "permutác" mindkettőben -> "Permutáció")
  for (const item of SUBJECT_KEYWORDS) {
    const root = item.root.toLowerCase()
    const matchesAll = normalizedNames.every((n) => n.includes(root))
    if (matchesAll) {
      return item.display
    }
  }

  // 2. Ha az összes fájl egy közös almappában van (pl. Kombinatorika):
  if (commonParentFolder) {
    const stopWords = ['ismétlés', 'ismétléses', 'nélkül', 'nélküli', 'alapjai', 'alapfogalmak', 'feladat', 'feladatok', 'teszt']
    const wordLists = normalizedNames.map((n) =>
      n.split(/\s+/).filter((w) => w.length >= 4 && !stopWords.includes(w))
    )

    if (wordLists.length > 0 && wordLists[0].length > 0) {
      const sharedWords = wordLists[0].filter((w) =>
        wordLists.every((wl) => wl.some((other) => other.includes(w) || w.includes(other)))
      )
      if (sharedWords.length > 0) {
        const found = SUBJECT_KEYWORDS.find(
          (k) => k.root.toLowerCase().includes(sharedWords[0]) || sharedWords[0].includes(k.root.toLowerCase())
        )
        if (found) return found.display
        return sharedWords[0].charAt(0).toUpperCase() + sharedWords[0].slice(1)
      }
    }

    // Ha a fájlok különböző altémák az almappán belül:
    return commonParentFolder
  }

  // 3. Ha 2 vagy 3 fájl van, de nincs közös kulcsszó:
  if (cleanNames.length <= 3) {
    return cleanNames.join(' és ')
  }

  return cleanNames[0]
}

// ─────────────────────────────────────────────────────────────
// Csevegő: kódblokk megjelenítés (csere / beillesztés gombokkal)
// ─────────────────────────────────────────────────────────────
function ChatCodeBlock({ code, currentCode, onInsert, onAppend, addNotif }) {
  const [copied, setCopied] = useState(false)

  const isFullDoc = useMemo(
    () => /\\documentclass/i.test(code) && /\\begin\{document\}/i.test(code),
    [code]
  )

  const matchInfo = useMemo(() => {
    if (isFullDoc || !currentCode || !code) return null
    return findSmartReplacement(currentCode, code)
  }, [code, currentCode, isFullDoc])

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    if (addNotif) addNotif('Kód kimásolva a vágólapra!', 'info')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="ai-chat-code-block">
      <div className="ai-chat-code-header">
        <div className="ai-chat-code-title">
          <FileCode size={13} color="var(--accent-light)" />
          <span className="ai-code-title-text">LaTeX {isFullDoc ? 'teljes dokumentum' : 'kódrészlet'}</span>
          {matchInfo && matchInfo.matched && (
            <span className="ai-code-line-badge" title={matchInfo.reason}>
              Cél: {matchInfo.startLine}–{matchInfo.endLine}. sor
            </span>
          )}
        </div>
        <button type="button" className="ai-chat-code-copy-btn" onClick={handleCopy} title="Kód másolása a vágólapra">
          {copied ? <Check size={12} color="var(--success)" /> : <Copy size={12} />}
          <span>{copied ? 'Másolva' : 'Másolás'}</span>
        </button>
      </div>

      <div className="ai-chat-code-actions-bar">
        {isFullDoc ? (
          <button
            type="button"
            className="ai-chat-code-apply-btn primary"
            onClick={() => onInsert(code)}
            title="Teljes kód cseréje a szerkesztőben és azonnali fordítás"
          >
            <RefreshCw size={12} />
            <span className="apply-btn-full">Teljes kód cseréje &amp; Fordítás</span>
            <span className="apply-btn-short">Csere &amp; Fordítás</span>
          </button>
        ) : matchInfo && matchInfo.matched ? (
          <>
            <button
              type="button"
              className="ai-chat-code-apply-btn match-replace"
              onClick={() => onAppend(code, { targetMatch: matchInfo })}
              title={`Kicseréli a(z) ${matchInfo.startLine}–${matchInfo.endLine}. sorokat a dokumentumban és azonnal újrafordítja`}
            >
              <Replace size={13} />
              <span className="apply-btn-full">Csere a dokumentumban &amp; Fordítás</span>
              <span className="apply-btn-short">Csere &amp; Fordítás</span>
            </button>
            <button
              type="button"
              className="ai-chat-code-apply-btn subtle-append"
              onClick={() => onAppend(code, { forceAppend: true })}
              title="Csere helyett hozzáfűzés a dokumentum végére"
            >
              <Plus size={12} />
              <span>Végére</span>
            </button>
          </>
        ) : (
          <button
            type="button"
            className="ai-chat-code-apply-btn primary"
            onClick={() => onAppend(code)}
            title="Beillesztés a dokumentumba és azonnali fordítás"
          >
            <Plus size={12} />
            <span className="apply-btn-full">Beillesztés &amp; Fordítás</span>
            <span className="apply-btn-short">Beillesztés</span>
          </button>
        )}
      </div>

      <pre className="ai-chat-code-pre">
        <code>{code}</code>
      </pre>
    </div>
  )
}

function renderInline(text) {
  const nodes = []
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let last = 0
  let m
  let key = 0
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const token = m[0]
    if (token.startsWith('**')) {
      nodes.push(<strong key={key++}>{token.slice(2, -2)}</strong>)
    } else {
      nodes.push(
        <code key={key++} className="ai-chat-inline-code">
          {token.slice(1, -1)}
        </code>
      )
    }
    last = m.index + token.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

function ChatContentRenderer({ text, currentCode, onInsert, onAppend, addNotif }) {
  const parts = useMemo(() => {
    if (!text) return []
    const regex = /```(?:latex|tex|tikz)?\n?([\s\S]*?)```/g
    const result = []
    let lastIndex = 0
    let match
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        result.push({ type: 'text', value: text.slice(lastIndex, match.index) })
      }
      result.push({ type: 'code', value: match[1].trim() })
      lastIndex = match.index + match[0].length
    }
    if (lastIndex < text.length) {
      result.push({ type: 'text', value: text.slice(lastIndex) })
    }
    return result
  }, [text])

  return (
    <div className="ai-chat-rendered-content">
      {parts.map((p, i) =>
        p.type === 'code' ? (
          <ChatCodeBlock
            key={i}
            code={p.value}
            currentCode={currentCode}
            onInsert={onInsert}
            onAppend={onAppend}
            addNotif={addNotif}
          />
        ) : (
          <div key={i} className="ai-chat-prose">
            {p.value
              .split(/\n{2,}/)
              .filter((s) => s.trim())
              .map((para, j) => (
                <p key={j}>{renderInline(para.trim())}</p>
              ))}
          </div>
        )
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// TikZ Mini-Előnézet Canvas komponens (C pont)
// ─────────────────────────────────────────────────────────────
function TikzMiniCanvas({ pdfData, zoom = 1.0, onZoomClick, onRenderReady }) {
  const canvasRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!pdfData) {
      setLoading(false)
      return
    }
    let isCancelled = false
    setLoading(true)
    setError(null)

    const renderPage = async () => {
      try {
        const bytes = atob(pdfData)
        const arr = new Uint8Array(bytes.length)
        for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)

        const loadingTask = pdfjsLib.getDocument({ data: arr })
        const pdf = await loadingTask.promise
        if (isCancelled) return

        const page = await pdf.getPage(1)
        if (isCancelled) return

        const canvas = canvasRef.current
        if (!canvas) return

        const pixelRatio = window.devicePixelRatio || 2
        const unscaledViewport = page.getViewport({ scale: 1.0 })
        const baseScale = Math.min(2.5, Math.max(0.7, 310 / unscaledViewport.width))
        const finalScale = baseScale * zoom
        const viewport = page.getViewport({ scale: finalScale })

        canvas.width = Math.floor(viewport.width * pixelRatio)
        canvas.height = Math.floor(viewport.height * pixelRatio)
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`

        const ctx = canvas.getContext('2d')
        ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, viewport.width, viewport.height)

        await page.render({
          canvasContext: ctx,
          viewport
        }).promise

        if (!isCancelled) {
          setLoading(false)
          try {
            const dataUrl = canvas.toDataURL('image/png')
            onRenderReady?.(dataUrl)
          } catch (e) {}
        }
      } catch (err) {
        if (!isCancelled) {
          console.error('[TikZ Mini Preview Error]:', err)
          setError(err.message)
          setLoading(false)
        }
      }
    }

    renderPage()
    return () => {
      isCancelled = true
    }
  }, [pdfData, zoom, onRenderReady])

  return (
    <div className="tikz-mini-canvas-container" onClick={onZoomClick} title="Kattints a nagyításhoz">
      {loading && (
        <div className="tikz-mini-canvas-loading">
          <Loader2 size={16} className="spinner" />
          <span>Mini-előnézet renderelése…</span>
        </div>
      )}
      {error && (
        <div className="tikz-mini-canvas-error">
          <AlertCircle size={15} />
          <span>Előnézet hiba: {error}</span>
        </div>
      )}
      <canvas ref={canvasRef} style={{ display: loading || error ? 'none' : 'block' }} />
    </div>
  )
}

export default function AiPanel({
  open,
  onToggleCollapse,
  subject = 'Matematika',
  onSubjectChange,
  currentCode = '',
  currentFile,
  projectTree,
  getSelectedSnippet,
  activeModel = 'gemini-3.8-flash',
  onModelChange,
  onInsert,
  onAppend,
  onRefreshProjects,
  addNotif,
  preambles = [],
  onOpenPreambles
}) {
  // Tantárgy: kizárólag Matematika vagy Fizika az AI Asszisztensben
  const [localSubject, setLocalSubject] = useState(subject === 'Fizika' ? 'Fizika' : 'Matematika')

  useEffect(() => {
    if (subject === 'Fizika' || subject === 'Matematika') setLocalSubject(subject)
  }, [subject])

  const handleSubjectChange = (newSub) => {
    setLocalSubject(newSub)
    if (onSubjectChange) onSubjectChange(newSub)
  }

  const activeSubject = localSubject === 'Fizika' ? 'Fizika' : 'Matematika'

  const [mode, setMode] = useState('generate')
  const [provider, setProvider] = useState('gemini')
  const [selectedGeminiModel, setSelectedGeminiModel] = useState(activeModel || 'gemini-3.8-flash')
  const [loading, setLoading] = useState(false)
  const [lastInserted, setLastInserted] = useState(null)
  const previousCodeRef = useRef(null)
  const [progress, setProgress] = useState(0)
  const [statusMsg, setStatusMsg] = useState('')
  const progressTimerRef = useRef(null)

  // Generálás
  const [topic, setTopic] = useState('')
  const [docType, setDocType] = useState('osszefoglalo')
  const [selectedPreambleId, setSelectedPreambleId] = useState('ai-dynamic')
  const [customPrompt, setCustomPrompt] = useState('')
  const [files, setFiles] = useState([])
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef(null)

  const preambleOptions = useMemo(() => {
    const opts = [{ value: 'ai-dynamic', label: 'AI dinamikus preambulum' }]
    preambles.forEach((p) => {
      opts.push({ value: p.id, label: `${p.name}${p.subject ? ` (${p.subject})` : ''}` })
    })
    return opts
  }, [preambles])

  const customPreambleText = useMemo(() => {
    if (selectedPreambleId === 'ai-dynamic') return ''
    const found = preambles.find((p) => p.id === selectedPreambleId)
    return found?.preamble || ''
  }, [selectedPreambleId, preambles])

  // Átdolgozás
  const [rewriteText, setRewriteText] = useState('')
  const [rewriteInstruction, setRewriteInstruction] = useState('')

  // TikZ
  const [tikzDesc, setTikzDesc] = useState('')
  const [tikzImages, setTikzImages] = useState([]) // [{ dataUrl, name }]
  const [isTikzDragOver, setIsTikzDragOver] = useState(false)
  const tikzFileInputRef = useRef(null)

  // TikZ Mini-Előnézet (C) & Beillesztési opciók (D)
  const [tikzResult, setTikzResult] = useState(null) // { tikz, pdf, compileError, standaloneTex }
  const [tikzEditedCode, setTikzEditedCode] = useState('')
  const [tikzPreviewTab, setTikzPreviewTab] = useState('preview') // 'preview' | 'code'
  const [tikzZoom, setTikzZoom] = useState(1.0)
  const [tikzPreviewPngUrl, setTikzPreviewPngUrl] = useState(null)
  const [tikzInsertPos, setTikzInsertPos] = useState('cursor') // 'cursor' | 'append'
  const [tikzWrapper, setTikzWrapper] = useState('figure') // 'plain' | 'figure' | 'center'
  const [tikzCaption, setTikzCaption] = useState('')
  const [tikzRefinePrompt, setTikzRefinePrompt] = useState('')
  const [tikzRefineLoading, setTikzRefineLoading] = useState(false)
  const [tikzRecompileLoading, setTikzRecompileLoading] = useState(false)
  const [tikzSaveStandaloneLoading, setTikzSaveStandaloneLoading] = useState(false)

  // Feladatsor
  const [probTopic, setProbTopic] = useState('')
  const [isTopicUserEdited, setIsTopicUserEdited] = useState(false)
  const isTopicUserEditedRef = useRef(false)
  const setTopicUserEdited = (val) => {
    isTopicUserEditedRef.current = val
    setIsTopicUserEdited(val)
  }
  const [probCount, setProbCount] = useState(6)
  const [probDiffStructure, setProbDiffStructure] = useState('pyramid')
  const [probTypes, setProbTypes] = useState({
    standard: true,
    multiple_choice: true,
    applied: true,
    error_finding: false,
    true_false: false
  })
  const [withTheory, setWithTheory] = useState(false)
  const [withSolutions, setWithSolutions] = useState(true)
  const [probWithRubric, setProbWithRubric] = useState(true)
  const [solutionPlacement, setSolutionPlacement] = useState('separate_page')
  const [withGroupsAB, setWithGroupsAB] = useState(false)
  const [probOutputTarget, setProbOutputTarget] = useState('new_doc') // new_doc | append
  const [selectedProjectFiles, setSelectedProjectFiles] = useState([]) // [{ path, name, relativePath, content, lineCount, isLoading }]
  const [isProbDragOver, setIsProbDragOver] = useState(false)
  const probDragCounterRef = useRef(0)

  // Beamer
  const [beamerSource, setBeamerSource] = useState('current') // current | custom
  const [beamerText, setBeamerText] = useState('')

  // Csevegő
  const [chatMessages, setChatMessages] = useState([
    {
      role: 'assistant',
      content:
        'Szia! Én vagyok a LaTeX asszisztensed. Kérdezz a dokumentumról, kérj új feladatot vagy pontozási útmutatót — képernyőképet is csatolhatsz (⌘V), és megjavítom az elrendezést.'
    }
  ])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [pendingImages, setPendingImages] = useState([])
  const [previewModalImg, setPreviewModalImg] = useState(null)
  const chatScrollRef = useRef(null)
  const chatInputRef = useRef(null)
  const chatImageInputRef = useRef(null)

  useEffect(() => {
    if (activeModel) setSelectedGeminiModel(activeModel)
  }, [activeModel])

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    }
  }, [chatMessages, chatLoading, mode])

  // Összes .tex fájl kinyerése a rekurzív projektfából
  const allProjectFiles = useMemo(() => {
    const list = []
    const scan = (node) => {
      if (!node) return
      if (Array.isArray(node)) {
        node.forEach((f) => {
          if (f?.path) list.push(f)
        })
        return
      }
      if (Array.isArray(node.files)) {
        node.files.forEach((f) => {
          if (f?.path) list.push(f)
        })
      }
      if (Array.isArray(node.folders)) node.folders.forEach(scan)
    }
    if (projectTree && typeof projectTree === 'object') {
      Object.values(projectTree).forEach(scan)
    }
    return list
  }, [projectTree])

  // Forrásfájl betöltése és hozzáadása (projektfából)
  const loadAndAddProjectFile = useCallback(
    async (fileObj) => {
      if (!fileObj || !fileObj.path) return
      let alreadyPresent = false
      let updatedFiles = []
      setSelectedProjectFiles((prev) => {
        if (prev.some((f) => f.path === fileObj.path)) {
          alreadyPresent = true
          return prev
        }
        const nextItem = {
          path: fileObj.path,
          name: fileObj.name || fileObj.path.split('/').pop(),
          relativePath: fileObj.relativePath || fileObj.name || fileObj.path,
          content: '',
          lineCount: 0,
          isLoading: true
        }
        updatedFiles = [...prev, nextItem]
        return updatedFiles
      })

      if (alreadyPresent) {
        addNotif?.(`"${fileObj.name || 'Fájl'}" már hozzá van adva.`, 'info')
        return
      }

      // Intelligens témakör-felismerés (ha a felhasználó még nem írta át kézzel)
      if (!isTopicUserEditedRef.current && updatedFiles.length > 0) {
        const smartTopic = inferTopicFromFiles(updatedFiles)
        if (smartTopic) {
          setProbTopic(smartTopic)
        }
      }

      try {
        const res = await axios.post('/api/files/load', { filePath: fileObj.path })
        const content = res.data?.content || ''
        setSelectedProjectFiles((prev) =>
          prev.map((f) =>
            f.path === fileObj.path
              ? {
                  ...f,
                  content,
                  lineCount: content ? content.split('\n').length : 0,
                  isLoading: false
                }
              : f
          )
        )
        addNotif?.(`"${fileObj.name || 'Fájl'}" hozzáadva a feladatsor forrásaihoz`, 'success')
      } catch (err) {
        setSelectedProjectFiles((prev) => prev.filter((f) => f.path !== fileObj.path))
        addNotif?.(`Nem sikerült betölteni a fájlt: ${fileObj.name || fileObj.path}`, 'error')
      }
    },
    [addNotif]
  )

  // Több forrásfájl hozzáadása (pl. mappából)
  const loadAndAddMultipleFiles = useCallback(
    async (filesList, folderName = '') => {
      if (!Array.isArray(filesList) || filesList.length === 0) return

      let combined = []
      setSelectedProjectFiles((prev) => {
        const existingPaths = new Set(prev.map((f) => f.path))
        const newItems = filesList
          .filter((f) => f?.path && !existingPaths.has(f.path))
          .map((f) => ({
            path: f.path,
            name: f.name || f.path.split('/').pop(),
            relativePath: f.relativePath || f.name || f.path,
            content: '',
            lineCount: 0,
            isLoading: true
          }))
        combined = [...prev, ...newItems]
        return combined
      })

      // Intelligens témakör-felismerés az összes csatolt fájl alapján
      if (!isTopicUserEditedRef.current && combined.length > 0) {
        const smartTopic = inferTopicFromFiles(combined, folderName)
        if (smartTopic) {
          setProbTopic(smartTopic)
        }
      }

      // Tartalmak betöltése párhuzamosan a háttérben
      await Promise.all(
        filesList.map(async (fileObj) => {
          if (!fileObj?.path) return
          try {
            const res = await axios.post('/api/files/load', { filePath: fileObj.path })
            const content = res.data?.content || ''
            setSelectedProjectFiles((prev) =>
              prev.map((f) =>
                f.path === fileObj.path
                  ? {
                      ...f,
                      content,
                      lineCount: content ? content.split('\n').length : 0,
                      isLoading: false
                    }
                  : f
              )
            )
          } catch (err) {}
        })
      )

      addNotif?.(`${filesList.length} fájl hozzáadva a feladatsorhoz`, 'success')
    },
    [addNotif]
  )

  // Külső fájlok kezelése (operációs rendszerből behúzva)
  const handleExternalDroppedFiles = useCallback(
    async (fileList) => {
      if (!fileList || fileList.length === 0) return
      let count = 0
      const newItems = []

      for (const file of Array.from(fileList)) {
        if (!file.name.match(/\.(tex|txt|md|text)$/i)) continue
        try {
          const text = await file.text()
          const id = `ext-${Date.now()}-${file.name}`
          newItems.push({
            path: id,
            name: file.name,
            relativePath: `(külső) ${file.name}`,
            content: text,
            lineCount: text ? text.split('\n').length : 0,
            isLoading: false
          })
          count++
        } catch (err) {
          console.error('External file load error:', err)
        }
      }

      if (newItems.length > 0) {
        let combined = []
        setSelectedProjectFiles((prev) => {
          combined = [...prev, ...newItems]
          return combined
        })
        if (!isTopicUserEditedRef.current && combined.length > 0) {
          const smartTopic = inferTopicFromFiles(combined)
          if (smartTopic) setProbTopic(smartTopic)
        }
        addNotif?.(`${count} külső forrásfájl betöltve a feladatsorhoz`, 'success')
      }
    },
    [addNotif]
  )

  // Aktuális szerkesztett dokumentum hozzáadása
  const handleAddCurrentFile = useCallback(() => {
    if (!currentFile?.name) return
    const currentPath = currentFile.path || currentFile.name
    const alreadyPresent = selectedProjectFiles.some((f) => f.path === currentPath)
    if (alreadyPresent) {
      addNotif?.(`"${currentFile.name}" már a csatolt források között van.`, 'info')
      return
    }
    const item = {
      path: currentPath,
      name: currentFile.name,
      relativePath: currentFile.name,
      content: currentCode || '',
      lineCount: currentCode ? currentCode.split('\n').length : 0,
      isLoading: false
    }
    const nextList = [...selectedProjectFiles, item]
    setSelectedProjectFiles(nextList)
    if (!isTopicUserEditedRef.current) {
      const smartTopic = inferTopicFromFiles(nextList)
      if (smartTopic) setProbTopic(smartTopic)
    }
    addNotif?.(`"${currentFile.name}" hozzáadva a feladatsor forrásaihoz`, 'success')
  }, [currentFile, currentCode, selectedProjectFiles, addNotif])

  const handleRemoveProjectFile = useCallback((path) => {
    setSelectedProjectFiles((prev) => {
      const remaining = prev.filter((f) => f.path !== path)
      if (!isTopicUserEditedRef.current) {
        if (remaining.length > 0) {
          const smartTopic = inferTopicFromFiles(remaining)
          if (smartTopic) setProbTopic(smartTopic)
        } else if (currentFile?.name) {
          const fallback = inferTopicFromFiles([{ name: currentFile.name, path: currentFile.path || '', content: currentCode }])
          setProbTopic(fallback || '')
        } else {
          setProbTopic('')
        }
      }
      return remaining
    })
  }, [currentFile, currentCode])

  const handleClearAllProjectFiles = useCallback(() => {
    setSelectedProjectFiles([])
    if (!isTopicUserEditedRef.current) {
      if (currentFile?.name) {
        const fallback = inferTopicFromFiles([{ name: currentFile.name, path: currentFile.path || '', content: currentCode }])
        setProbTopic(fallback || '')
      } else {
        setProbTopic('')
      }
    }
  }, [currentFile, currentCode])

  // Automatikus témakör-kitöltés, ha feladatsor módra váltunk, vagy változik a fájl
  useEffect(() => {
    if (mode !== 'exam') return
    if (isTopicUserEditedRef.current) return

    if (selectedProjectFiles.length > 0) {
      const smartTopic = inferTopicFromFiles(selectedProjectFiles)
      if (smartTopic) setProbTopic(smartTopic)
    } else if (currentFile?.name) {
      const smartTopic = inferTopicFromFiles([{ name: currentFile.name, path: currentFile.path || '', content: currentCode }])
      if (smartTopic) setProbTopic(smartTopic)
    }
  }, [mode, currentFile?.name, currentFile?.path, currentCode, selectedProjectFiles.length])

  // Drag & Drop eseménykezelők a Feladatsor fülhöz
  const handleProbDragEnter = (e) => {
    e.preventDefault()
    e.stopPropagation()
    probDragCounterRef.current += 1
    setIsProbDragOver(true)
  }

  const handleProbDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
    if (!isProbDragOver) setIsProbDragOver(true)
  }

  const handleProbDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    probDragCounterRef.current -= 1
    if (probDragCounterRef.current <= 0) {
      probDragCounterRef.current = 0
      setIsProbDragOver(false)
    }
  }

  const handleProbDrop = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    probDragCounterRef.current = 0
    setIsProbDragOver(false)

    // 1. Külső fájlok az operációs rendszerből
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleExternalDroppedFiles(e.dataTransfer.files)
      return
    }

    // 2. Belső fogd-és-vidd a Sidebar fa nézetből
    const rawJson = e.dataTransfer.getData('application/json')
    if (rawJson) {
      try {
        const data = JSON.parse(rawJson)
        if (data.type === 'latex-file') {
          await loadAndAddProjectFile(data)
          return
        }
        if (data.type === 'latex-folder' && Array.isArray(data.files) && data.files.length > 0) {
          await loadAndAddMultipleFiles(data.files, data.name)
          return
        }
      } catch (err) {}
    }

    // 3. Fallback: text/plain
    const textData = e.dataTransfer.getData('text/plain')
    if (textData) {
      const match = allProjectFiles.find((f) => f.path === textData || f.name === textData)
      if (match) {
        await loadAndAddProjectFile(match)
      }
    }
  }

  // Kép beillesztés vágólapról (csevegő és TikZ módban)
  const readImageFile = useCallback((file) => {
    const reader = new FileReader()
    reader.onload = (evt) => {
      setPendingImages((prev) => [...prev, { dataUrl: evt.target.result, name: file.name || 'kép' }])
    }
    reader.readAsDataURL(file)
  }, [])

  const readTikzImageFile = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      setTikzImages((prev) => [...prev, { dataUrl: evt.target.result, name: file.name || 'Ábra referenciakép' }])
    }
    reader.readAsDataURL(file)
  }, [])

  useEffect(() => {
    if (!open || (mode !== 'chat' && mode !== 'tikz')) return undefined
    const handlePaste = (e) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const file = item.getAsFile()
          if (file) {
            if (mode === 'chat') readImageFile(file)
            else if (mode === 'tikz') readTikzImageFile(file)
          }
        }
      }
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [open, mode, readImageFile, readTikzImageFile])

  const handleChatImageChange = (e) => {
    Array.from(e.target.files || []).forEach(readImageFile)
    e.target.value = ''
  }

  const handleSendChatMessage = async (customText) => {
    const textToSend = (typeof customText === 'string' ? customText : chatInput).trim()
    if (!textToSend && pendingImages.length === 0) return
    if (chatLoading) return

    const newImages = [...pendingImages]
    const userMessage = {
      role: 'user',
      content: textToSend || 'Kérlek elemezd ezt a csatolt képet és segíts a javításban!',
      images: newImages.map((img) => img.dataUrl)
    }

    const updatedMessages = [...chatMessages, userMessage]
    setChatMessages(updatedMessages)
    setChatInput('')
    setPendingImages([])
    setChatLoading(true)

    try {
      const res = await axios.post('/api/ai/chat', {
        messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
        currentCode,
        subject: activeSubject.toLowerCase(),
        provider,
        model: provider === 'gemini' ? selectedGeminiModel : undefined,
        images: newImages.map((img) => ({ data: img.dataUrl }))
      })
      setChatMessages((prev) => [...prev, { role: 'assistant', content: res.data.reply }])
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Hiba történt a válasz generálása során'
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `**Hiba történt:** ${errorMsg}\n\nKérlek próbáld újra, vagy válassz másik modellt!` }
      ])
      addNotif?.(errorMsg, 'error')
    } finally {
      setChatLoading(false)
    }
  }

  const handleChatKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendChatMessage()
    }
  }

  // Fájlkezelés (generálás)
  const handleFiles = (newFiles) => setFiles((prev) => [...prev, ...Array.from(newFiles)])
  const removeFile = (i) => setFiles((f) => f.filter((_, idx) => idx !== i))
  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  const buildFormData = (extra) => {
    const fd = new FormData()
    Object.entries(extra).forEach(([k, v]) => fd.append(k, v))
    files.forEach((f) => fd.append('files', f))
    return fd
  }

  const startProgressTracking = () => {
    setProgress(8)
    setStatusMsg('Forrásanyagok és utasítások elemzése...')
    let current = 8
    clearInterval(progressTimerRef.current)
    progressTimerRef.current = setInterval(() => {
      current = Math.min(92, current + (current < 40 ? 5 : current < 70 ? 3 : 1))
      setProgress(current)
      if (current > 70) setStatusMsg('LaTeX kód véglegesítése és ellenőrzése...')
      else if (current > 40) setStatusMsg('Tartalom és képletek generálása...')
    }, 700)
  }

  const stopProgressTracking = (ok = true) => {
    clearInterval(progressTimerRef.current)
    setProgress(ok ? 100 : 0)
    setTimeout(() => setProgress(0), 600)
  }

  useEffect(() => () => clearInterval(progressTimerRef.current), [])

  const modelParam = provider === 'gemini' ? selectedGeminiModel : undefined

  const remember = () => {
    previousCodeRef.current = currentCode
  }

  const handleUndoInsert = () => {
    if (previousCodeRef.current !== null && onInsert) {
      onInsert(previousCodeRef.current, true)
    }
    setLastInserted(null)
  }

  const reportError = (err) => {
    const msg = err.response?.data?.error || err.message || 'Hiba történt a generálás során'
    addNotif?.(msg, 'error')
  }

  // 1. Generálás
  const handleGenerate = async () => {
    if (!topic.trim() || loading) return
    setLoading(true)
    setLastInserted(null)
    startProgressTracking()
    try {
      const fd = buildFormData({
        topic: topic.trim(),
        docType,
        subject: activeSubject.toLowerCase(),
        customPrompt,
        provider,
        model: modelParam || '',
        customPreamble: customPreambleText
      })
      const res = await axios.post('/api/ai/generate', fd)
      remember()
      const beamerSuffix = docType === 'beamer' && !topic.trim().toLowerCase().endsWith('beamer') ? '_Beamer' : ''
      const targetTopic = `${topic.trim()}${beamerSuffix}`
      onInsert?.(res.data.latex, true, targetTopic)
      setLastInserted({ label: targetTopic })
      stopProgressTracking(true)
    } catch (err) {
      stopProgressTracking(false)
      reportError(err)
    } finally {
      setLoading(false)
    }
  }

  // 2. Átdolgozás
  const handleRewrite = async () => {
    const content = rewriteText.trim() ? rewriteText : currentCode
    if (!content.trim() || !rewriteInstruction.trim() || loading) return
    setLoading(true)
    setLastInserted(null)
    startProgressTracking()
    try {
      const usingFullDoc = !rewriteText.trim()
      const res = await axios.post('/api/ai/rewrite', {
        content,
        instruction: rewriteInstruction.trim(),
        provider,
        model: modelParam,
        isSnippet: !usingFullDoc
      })
      remember()
      if (usingFullDoc) onInsert?.(res.data.latex, true)
      else onAppend?.(res.data.latex, { targetMatch: findSmartReplacement(currentCode, res.data.latex) })
      setLastInserted({ label: 'Átdolgozott kód' })
      stopProgressTracking(true)
    } catch (err) {
      stopProgressTracking(false)
      reportError(err)
    } finally {
      setLoading(false)
    }
  }

  // 3. TikZ generálás (Azonnali Mini-Előnézettel a beszúrás előtt - C & D)
  const handleTikz = async () => {
    const hasText = Boolean(tikzDesc.trim())
    const hasImages = tikzImages.length > 0
    if ((!hasText && !hasImages) || loading) return
    setLoading(true)
    setLastInserted(null)
    startProgressTracking()
    try {
      const res = await axios.post('/api/ai/tikz', {
        description: tikzDesc.trim(),
        subject: activeSubject.toLowerCase(),
        provider,
        model: modelParam,
        images: tikzImages.map((img) => ({ data: img.dataUrl }))
      })
      remember()
      const data = res.data
      setTikzResult(data)
      setTikzEditedCode(data.tikz)
      setTikzPreviewTab('preview')
      if (!tikzCaption.trim()) {
        const firstLine = (tikzDesc.trim() || `${activeSubject} ábra`).split(/[.\n]/)[0].slice(0, 45)
        setTikzCaption(firstLine)
      }
      setLastInserted({ label: hasImages ? 'Képből generált TikZ előnézet' : 'TikZ ábra előnézet készen' })
      stopProgressTracking(true)
      addNotif?.('A TikZ ábra elkészült! Tekintsd meg az előnézetet a beszúrás előtt.', 'success')
    } catch (err) {
      stopProgressTracking(false)
      reportError(err)
    } finally {
      setLoading(false)
    }
  }

  // TikZ beillesztése a dokumentumba a választott opciókkal (D)
  const handleInsertTikzToDoc = () => {
    if (!tikzResult) return
    const rawCode = (tikzEditedCode || tikzResult.tikz || '').trim()
    if (!rawCode) return

    let codeToInsert = rawCode
    if (tikzWrapper === 'center') {
      codeToInsert = `\\begin{center}\n${rawCode}\n\\end{center}`
    } else if (tikzWrapper === 'figure') {
      const cleanLabel = (tikzCaption || 'abra')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 24)
      codeToInsert = `\\begin{figure}[htbp]\n  \\centering\n  ${rawCode}\n  \\caption{${tikzCaption.trim() || 'Ábra'}}\n  \\label{fig:${cleanLabel || 'abra'}}\n\\end{figure}`
    }

    if (tikzInsertPos === 'cursor') {
      onAppend?.(codeToInsert, { insertAtCursor: true, forceAppend: false, autoCompile: true })
    } else {
      onAppend?.(codeToInsert, { forceAppend: true, autoCompile: true })
    }
  }

  // Mentés önálló ábraként .tex fájlba a projektfába (D)
  const handleSaveStandaloneTikz = async () => {
    if (!tikzResult) return
    setTikzSaveStandaloneLoading(true)
    try {
      const baseName = (tikzCaption || tikzDesc || 'TikZ_Abra')
        .trim()
        .split(/[.\n]/)[0]
        .replace(/[^a-zA-Z0-9áéíóöőúüűÁÉÍÓÖŐÚÜŰ _\-]/g, '')
        .trim()
        .replace(/\s+/g, '_')
        .slice(0, 32) || 'TikZ_Abra'

      const filename = `${baseName}.tex`
      const content = tikzResult.standaloneTex || `\\documentclass[tikz,border=4mm]{standalone}\n\\usepackage[utf8]{inputenc}\n\\usepackage[magyar]{babel}\n\\usepackage{amsmath,amssymb,tikz}\n\\begin{document}\n${tikzEditedCode || tikzResult.tikz}\n\\end{document}`

      await axios.post('/api/files/save', {
        subject: activeSubject,
        filename,
        content
      })
      onRefreshProjects?.()
      addNotif?.(`Önálló ábra fájl mentve: ${filename}`, 'success')
    } catch (err) {
      console.error('[Save Standalone Error]:', err)
      addNotif?.('Nem sikerült elmenteni az önálló ábra fájlt.', 'error')
    } finally {
      setTikzSaveStandaloneLoading(false)
    }
  }

  // TikZ kód gyors újrafordítása a szerkesztőből (C)
  const handleRecompileTikz = async () => {
    if (!tikzEditedCode.trim() || tikzRecompileLoading) return
    setTikzRecompileLoading(true)
    try {
      const res = await axios.post('/api/ai/tikz-compile', {
        tikzCode: tikzEditedCode.trim()
      })
      const data = res.data
      setTikzResult((prev) => ({
        ...prev,
        tikz: tikzEditedCode.trim(),
        pdf: data.pdf,
        compileError: data.compileError,
        standaloneTex: data.standaloneTex
      }))
      if (data.success) {
        addNotif?.('Mini-előnézet sikeresen frissítve!', 'success')
      } else {
        addNotif?.('Hiba a TikZ fordításakor (lásd az előnézet fület)', 'warning')
      }
    } catch (err) {
      reportError(err)
    } finally {
      setTikzRecompileLoading(false)
    }
  }

  // TikZ ábra intelligens finomhangolása AI-val (C & finomítás)
  const handleTikzRefine = async (customInstruction) => {
    const instruction = (typeof customInstruction === 'string' ? customInstruction : tikzRefinePrompt).trim()
    if (!instruction || tikzRefineLoading || !tikzResult) return
    setTikzRefineLoading(true)
    try {
      const res = await axios.post('/api/ai/tikz-refine', {
        tikzCode: tikzEditedCode || tikzResult.tikz,
        instruction,
        subject: activeSubject.toLowerCase(),
        provider,
        model: modelParam
      })
      const data = res.data
      setTikzResult(data)
      setTikzEditedCode(data.tikz)
      setTikzRefinePrompt('')
      addNotif?.('Ábra finomítva és előnézet azonnal frissítve!', 'success')
    } catch (err) {
      reportError(err)
    } finally {
      setTikzRefineLoading(false)
    }
  }

  // 4. Feladatsor
  const handleProblems = async () => {
    if (loading) return
    if (!probTopic.trim()) return
    setLoading(true)
    setLastInserted(null)
    startProgressTracking()
    try {
      let contextContent = ''
      let sourceMode = 'custom'
      if (selectedProjectFiles.length > 0) {
        contextContent = selectedProjectFiles
          .map((f) => `=== FORRÁSFÁJL: ${f.relativePath || f.name} ===\n${f.content || ''}`)
          .join('\n\n')
        sourceMode = 'project'
      } else if (currentCode && currentCode.trim()) {
        contextContent = currentCode
        sourceMode = 'current'
      }
      const useContext = Boolean(contextContent)
      const selectedSnippet = selectedProjectFiles.length === 0 ? getSelectedSnippet?.() || '' : ''
      const activeTypes = Object.entries(probTypes)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .join(',')

      const fd = buildFormData({
        topic: probTopic.trim(),
        subject: activeSubject,
        count: probCount,
        sourceMode: useContext ? sourceMode : 'custom',
        contextContent: useContext ? contextContent : '',
        selectedSnippet,
        difficultyStructure: probDiffStructure,
        problemTypes: activeTypes || 'standard',
        outputTarget: probOutputTarget,
        withTheorySummary: String(withTheory),
        withSolutions: String(withSolutions),
        solutionPlacement,
        withRubric: String(withSolutions && probWithRubric),
        withGroupsAB: String(withGroupsAB),
        provider,
        model: modelParam || '',
        customPreamble: customPreambleText
      })
      const res = await axios.post('/api/ai/problems', fd)
      const data = res.data
      remember()

      if (data.isAppend) {
        onAppend?.(data.latex, { forceAppend: true })
      } else {
        onInsert?.(data.latex, true, data.topic ? `${data.topic}_Feladatsor` : '')
      }

      if (data.hasSeparateDoc && data.solutionsLatex) {
        try {
          await axios.post('/api/files/save', {
            subject: activeSubject,
            filename: data.solutionsFilename,
            content: data.solutionsLatex
          })
          onRefreshProjects?.()
          addNotif?.(`Megoldókulcs mentve: ${data.solutionsFilename}`, 'success')
        } catch (saveErr) {
          addNotif?.('A külön megoldókulcs mentése nem sikerült.', 'warning')
        }
      }

      setLastInserted({ label: `${data.count} feladatos feladatsor` })
      stopProgressTracking(true)
    } catch (err) {
      stopProgressTracking(false)
      reportError(err)
    } finally {
      setLoading(false)
    }
  }

  // 5. Beamer
  const handleBeamer = async () => {
    const content = beamerSource === 'current' ? currentCode : beamerText
    if (!content.trim() || loading) return
    setLoading(true)
    setLastInserted(null)
    startProgressTracking()
    try {
      const res = await axios.post('/api/ai/beamer', {
        content,
        subject: activeSubject.toLowerCase(),
        provider,
        model: modelParam
      })
      remember()

      // Témakör és fájlnév meghatározása: a végén kötelezően szerepeljen a _Beamer
      let baseTopic = ''
      if (beamerSource === 'current' && currentFile?.name) {
        baseTopic = currentFile.name
          .replace(/\.tex$/i, '')
          .replace(/_beamer$/i, '')
          .replace(/_feladatsor$/i, '')
          .replace(/_megoldasok$/i, '')
      } else if (res.data.topic) {
        baseTopic = res.data.topic.replace(/_beamer$/i, '')
      } else {
        const m = res.data.latex.match(/\\title(?:\s*\[[^\]]*\])?\s*\{([^}]+)\}/i)
        if (m) baseTopic = m[1].replace(/\\[a-zA-Z]+/g, '').replace(/[{}]/g, '').trim()
      }

      const beamerTopicName = baseTopic ? `${baseTopic}_Beamer` : 'Prezentacio_Beamer'

      onInsert?.(res.data.latex, true, beamerTopicName)
      setLastInserted({ label: beamerTopicName })
      stopProgressTracking(true)
    } catch (err) {
      stopProgressTracking(false)
      reportError(err)
    } finally {
      setLoading(false)
    }
  }

  const loadSelectionIntoRewrite = () => {
    const sel = getSelectedSnippet?.() || ''
    if (!sel.trim()) {
      addNotif?.('Nincs kijelölt kódrészlet a szerkesztőben.', 'info')
      return
    }
    setRewriteText(sel)
  }

  const renderProgress = () =>
    loading ? (
      <div className="ai-progress-card">
        <div className="ai-progress-header">
          <div className="ai-progress-header-left">
            <Loader2 size={11} className="spinner" />
            <span className="ai-progress-title">AI dolgozik…</span>
            {statusMsg && (
              <>
                <span className="ai-progress-sep">·</span>
                <span className="ai-progress-status-text">{statusMsg}</span>
              </>
            )}
          </div>
          <span className="ai-progress-pct">{Math.round(progress)}%</span>
        </div>
        <div className="progress-track">
          <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>
    ) : null

  const renderInserted = () =>
    lastInserted && !loading ? (
      <div className="ai-inserted-badge">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: 'var(--success)' }}>
          <CheckCircle2 size={15} />
          <span>„{lastInserted.label}” bekerült a szerkesztőbe</span>
        </div>
        <button type="button" className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={handleUndoInsert}>
          <Undo2 size={12} /> Visszavonás
        </button>
      </div>
    ) : null

  // ── Összecsukott állapot ──
  if (!open) {
    return (
      <div className="ai-panel collapsed">
        <div className="ai-collapsed-header">
          <button
            type="button"
            className="btn-subtle ai-expand-btn"
            onClick={onToggleCollapse}
            title="AI Asszisztens kibontása"
          >
            <Sparkles size={16} color="var(--accent-light)" />
          </button>
        </div>

        <div className="ai-collapsed-body">
          {MODES.map((m) => {
            const Icon = m.icon
            return (
              <button
                key={m.id}
                type="button"
                className={`ai-collapsed-btn ${m.id === 'generate' ? 'primary' : ''}`}
                onClick={() => {
                  onToggleCollapse?.()
                  setMode(m.id)
                }}
                title={m.desc}
              >
                <Icon size={15} />
              </button>
            )
          })}

          <div className="ai-collapsed-divider" />

          <div className="ai-collapsed-vertical-text">
            <span>AI ASSZISZTENS</span>
          </div>
        </div>

        <div className="ai-collapsed-footer">
          <div className="ai-collapsed-status" title={`Aktív AI Modell: ${selectedGeminiModel}`}>
            <div className="status-pulse-dot" />
          </div>
        </div>
      </div>
    )
  }

  const selectionLinesHint = (() => {
    try {
      const sel = getSelectedSnippet?.() || ''
      return sel ? sel.split('\n').length : 0
    } catch {
      return 0
    }
  })()

  return (
    <div className="ai-panel">
      {/* Fejléc */}
      <div className="ai-panel-header">
        <div className="ai-header-left">
          <div className="column-header-title-wrap">
            <div className="column-header-icon-wrap" title="AI Asszisztens">
              <Sparkles size={13} />
            </div>
            <span className="column-header-title">AI Asszisztens</span>
          </div>
        </div>

        <div className="ai-header-right">
          <div className="ai-header-model-wrap">
            <CustomSelect
              value={provider === 'local' ? 'local' : selectedGeminiModel}
              onChange={(val) => {
                if (val === 'local') {
                  setProvider('local')
                } else {
                  setProvider('gemini')
                  setSelectedGeminiModel(val)
                  if (onModelChange) onModelChange(val)
                }
                setLastInserted(null)
              }}
              options={MODEL_OPTIONS}
              size="sm"
            />
          </div>

          {onToggleCollapse && (
            <button
              type="button"
              className="btn-subtle ai-collapse-btn"
              onClick={onToggleCollapse}
              title="AI Asszisztens összecsukása"
            >
              <PanelLeftClose size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Rögzített felső vezérlők (Tantárgy és Módválasztó) – mindig pontosan egy helyben maradnak */}
      <div className="ai-panel-top-controls">
        {/* Tantárgy választó kapcsoló (26px kompakt Apple szegmentált kapcsoló) */}
        <div className="ai-subject-switcher" role="tablist" aria-label="Tantárgy">
          <button
            type="button"
            className={`ai-subject-btn ${activeSubject === 'Matematika' ? 'active math' : ''}`}
            onClick={() => handleSubjectChange('Matematika')}
            title="Matematika AI asszisztens és eszközök"
          >
            <Sigma size={13} />
            <span>Matematika</span>
          </button>
          <button
            type="button"
            className={`ai-subject-btn ${activeSubject === 'Fizika' ? 'active physics' : ''}`}
            onClick={() => handleSubjectChange('Fizika')}
            title="Fizika AI asszisztens és eszközök"
          >
            <Atom size={13} />
            <span>Fizika</span>
          </button>
        </div>

        {/* Mód választó fülek */}
        <div className="ai-mode-tabs">
          {MODES.map((m) => {
            const Icon = m.icon
            const isActive = mode === m.id
            return (
              <button
                key={m.id}
                className={`ai-mode-tab ${isActive ? 'active' : ''}`}
                onDragOver={(e) => {
                  if (m.id === 'problems') {
                    e.preventDefault()
                    if (mode !== 'problems') setMode('problems')
                  }
                }}
                onClick={() => {
                  setMode(m.id)
                  setLastInserted(null)
                }}
                title={m.desc}
              >
                <Icon size={13} />
                <span>{m.label}</span>
                {m.id === 'problems' && selectedProjectFiles.length > 0 && (
                  <span className="mode-tab-dot-badge" title={`${selectedProjectFiles.length} fájl csatolva`} />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Törzs */}
      <div className={`ai-panel-body ${mode === 'chat' ? 'chat-mode' : ''}`}>
        {/* MODE: CSEVEGŐ */}
        {mode === 'chat' && (
          <div className="ai-chat-container">
            <div className="ai-chat-messages-area" ref={chatScrollRef}>
              {chatMessages.map((msg, i) => (
                <div key={i} className={`ai-chat-bubble-wrap ${msg.role}`}>
                  <div className="ai-chat-avatar">
                    {msg.role === 'user' ? <User size={13} /> : <Sparkles size={13} />}
                  </div>

                  <div className="ai-chat-bubble-body">
                    {msg.images && msg.images.length > 0 && (
                      <div className="ai-chat-images-grid">
                        {msg.images.map((imgUrl, imgIdx) => (
                          <div
                            key={imgIdx}
                            className="ai-chat-img-thumb"
                            onClick={() => setPreviewModalImg(imgUrl)}
                            title="Kattints a nagyításhoz"
                          >
                            <img src={imgUrl} alt="Csatolt kép" />
                            <div className="ai-chat-img-zoom-overlay">
                              <Maximize2 size={12} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {msg.role === 'assistant' ? (
                      <ChatContentRenderer
                        text={msg.content}
                        currentCode={currentCode}
                        onInsert={(code) => {
                          remember()
                          onInsert?.(code, true)
                        }}
                        onAppend={(code, opts) => {
                          remember()
                          onAppend?.(code, opts)
                        }}
                        addNotif={addNotif}
                      />
                    ) : (
                      <div className="ai-chat-prose">
                        {msg.content.split('\n').map((line, li) => (
                          <p key={li}>{line}</p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {chatLoading && (
                <div className="ai-chat-bubble-wrap assistant">
                  <div className="ai-chat-avatar">
                    <Sparkles size={13} />
                  </div>
                  <div className="ai-chat-bubble-body ai-chat-typing-body">
                    <div className="ai-chat-typing-dots">
                      <span />
                      <span />
                      <span />
                    </div>
                    <span className="ai-chat-typing-text">Az AI gondolkodik…</span>
                  </div>
                </div>
              )}
            </div>

            <div className="ai-chat-input-box">
              {/* Csatolt képek előnézete a beviteli dobozon belül felül */}
              {pendingImages.length > 0 && (
                <div className="ai-chat-pending-row">
                  {pendingImages.map((img, idx) => (
                    <div key={idx} className="ai-chat-pending-thumb">
                      <img src={img.dataUrl} alt="Csatolmány" />
                      <button
                        type="button"
                        className="ai-chat-pending-del"
                        onClick={() => setPendingImages((prev) => prev.filter((_, i) => i !== idx))}
                        title="Kép törlése"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <textarea
                ref={chatInputRef}
                className="ai-chat-textarea"
                rows={2}
                placeholder="Írd le a módosítást, vagy illessz be képet (⌘V)…"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleChatKeyDown}
                disabled={chatLoading}
              />

              <div className="ai-chat-bottom-actions">
                <div className="ai-chat-bottom-left">
                  <input
                    ref={chatImageInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: 'none' }}
                    onChange={handleChatImageChange}
                  />
                  <button
                    type="button"
                    className="ai-chat-icon-btn attach"
                    onClick={() => chatImageInputRef.current?.click()}
                    title="Kép vagy képernyőkép csatolása (⌘V)"
                  >
                    <ImageIcon size={15} />
                  </button>
                  <span className="ai-chat-shortcut-hint">⌘V: Beillesztés</span>
                </div>

                <button
                  type="button"
                  className={`ai-chat-send-circle ${chatInput.trim() || pendingImages.length > 0 ? 'active' : ''}`}
                  disabled={chatLoading || (!chatInput.trim() && pendingImages.length === 0)}
                  onClick={() => handleSendChatMessage()}
                  title={chatLoading ? 'Válasz generálása...' : 'Üzenet küldése (Enter)'}
                >
                  {chatLoading ? (
                    <Loader2 size={13} className="spinner" />
                  ) : (
                    <ArrowUp size={15} strokeWidth={2.4} />
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODE: GENERÁLÁS */}
        {mode === 'generate' && (
          <>
            <div className="form-group">
              <label className="form-label">Témakör *</label>
              <input
                className="form-input"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="pl. Másodfokú egyenletek, Newton törvényei…"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleGenerate()
                }}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Dokumentum típusa</label>
              <CustomSelect value={docType} onChange={setDocType} options={DOC_TYPE_OPTIONS} />
            </div>

            <div className="form-group">
              <label className="form-label">
                <span>Preambulum</span>
                {onOpenPreambles && (
                  <button
                    type="button"
                    className="btn-subtle"
                    style={{ border: 'none', cursor: 'pointer', fontSize: 10.5, color: 'var(--accent-light)', background: 'none' }}
                    onClick={onOpenPreambles}
                  >
                    Kezelés
                  </button>
                )}
              </label>
              <CustomSelect value={selectedPreambleId} onChange={setSelectedPreambleId} options={preambleOptions} />
            </div>

            <div className="form-group">
              <label className="form-label">Külön utasítás (opcionális)</label>
              <textarea
                className="form-textarea"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="pl. Legyen benne sok TikZ ábra, érettségi szintű feladatokkal…"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Forrásanyag (opcionális)</label>
              <div
                className={`uploader ${dragOver ? 'drag-over' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                <UploadCloud size={22} className="uploader-icon" />
                <div>PDF, DOCX, TEX, kép — húzd ide vagy kattints</div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.tex,.txt,.md,.jpg,.jpeg,.png,.webp"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    handleFiles(e.target.files)
                    e.target.value = ''
                  }}
                />
              </div>
              {files.length > 0 && (
                <div className="uploader-files">
                  {files.map((f, i) => (
                    <div key={i} className="uploader-file-item">
                      <FileText size={12} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                      <X size={12} className="remove" onClick={() => removeFile(i)} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {renderProgress()}
            {renderInserted()}

            <button className="btn btn-primary" style={{ justifyContent: 'center' }} disabled={!topic.trim() || loading} onClick={handleGenerate}>
              {loading ? <Loader2 size={14} className="spinner" /> : <Sparkles size={14} />}
              Dokumentum generálása
            </button>
          </>
        )}

        {/* MODE: ÁTDOLGOZÁS */}
        {mode === 'rewrite' && (
          <>
            <div className="form-group">
              <label className="form-label">
                <span>Átdolgozandó kód</span>
                <button
                  type="button"
                  className="btn-subtle"
                  style={{ border: 'none', cursor: 'pointer', fontSize: 10.5, color: 'var(--accent-light)', background: 'none' }}
                  onClick={loadSelectionIntoRewrite}
                >
                  Kijelölés betöltése{selectionLinesHint ? ` (${selectionLinesHint} sor)` : ''}
                </button>
              </label>
              <textarea
                className="form-textarea"
                style={{ minHeight: 120, fontFamily: 'var(--font-mono)', fontSize: 11.5 }}
                value={rewriteText}
                onChange={(e) => setRewriteText(e.target.value)}
                placeholder="Üresen hagyva a teljes dokumentumot dolgozza át…"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Utasítás *</label>
              <textarea
                className="form-textarea"
                value={rewriteInstruction}
                onChange={(e) => setRewriteInstruction(e.target.value)}
                placeholder="pl. Egységesítsd a képleteket, adj hozzá megoldásokat…"
              />
            </div>

            {renderProgress()}
            {renderInserted()}

            <button
              className="btn btn-primary"
              style={{ justifyContent: 'center' }}
              disabled={!rewriteInstruction.trim() || loading}
              onClick={handleRewrite}
            >
              {loading ? <Loader2 size={14} className="spinner" /> : <Wand2 size={14} />}
              Átdolgozás
            </button>
          </>
        )}

        {/* MODE: TIKZ */}
        {mode === 'tikz' && (
          <div
            className={`tikz-mode-container ${isTikzDragOver ? 'drag-over-active' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setIsTikzDragOver(true)
            }}
            onDragLeave={(e) => {
              e.preventDefault()
              setIsTikzDragOver(false)
            }}
            onDrop={(e) => {
              e.preventDefault()
              setIsTikzDragOver(false)
              const files = Array.from(e.dataTransfer?.files || [])
              files.filter((f) => f.type.startsWith('image/')).forEach(readTikzImageFile)
            }}
          >
            {/* 1. Referenciakép csatolása / beillesztése */}
            <div className="form-group">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label className="form-label" style={{ marginBottom: 0 }}>
                  Referenciakép (vázlat, ábra, fotó)
                </label>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>⌘V beillesztés</span>
              </div>

              {tikzImages.length > 0 ? (
                <div className="tikz-image-preview-grid">
                  {tikzImages.map((img, idx) => (
                    <div key={idx} className="tikz-image-preview-card">
                      <img
                        src={img.dataUrl}
                        alt={img.name}
                        onClick={() => setPreviewModalImg(img.dataUrl)}
                        title="Kattints a nagyításhoz"
                      />
                      <div className="tikz-image-info">
                        <span className="tikz-image-name">{img.name}</span>
                        <button
                          type="button"
                          className="tikz-image-remove-btn"
                          onClick={() => setTikzImages((prev) => prev.filter((_, i) => i !== idx))}
                          title="Kép törlése"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="tikz-add-more-img-btn"
                    onClick={() => tikzFileInputRef.current?.click()}
                    title="További kép csatolása"
                  >
                    <Plus size={14} />
                    <span>Új kép</span>
                  </button>
                  <input
                    ref={tikzFileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      Array.from(e.target.files || []).forEach(readTikzImageFile)
                      e.target.value = ''
                    }}
                  />
                </div>
              ) : (
                <div
                  className="tikz-dropzone"
                  onClick={() => tikzFileInputRef.current?.click()}
                  title="Kattints ide vagy húzz ide egy képet, vagy nyomj ⌘V-t"
                >
                  <input
                    ref={tikzFileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      Array.from(e.target.files || []).forEach(readTikzImageFile)
                      e.target.value = ''
                    }}
                  />
                  <div className="tikz-dropzone-icon">
                    <ImageIcon size={20} />
                  </div>
                  <div className="tikz-dropzone-text">
                    <span className="primary-text">Kattints vagy húzz ide egy képet</span>
                    <span className="sub-text">PNG, JPG, WebP vagy másold a vágólapra és nyomj <strong>⌘V</strong>-t</span>
                  </div>
                </div>
              )}
            </div>

            {/* 2. Gyors didaktikai sablonok */}
            <div className="form-group" style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                <label className="form-label" style={{ marginBottom: 0, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <Sparkles size={11} color="var(--accent-light)" />
                  <span>Gyors sablonok</span>
                </label>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>kattintásra beilleszt</span>
              </div>
              <div className="tikz-presets-row">
                {(TIKZ_PRESETS[activeSubject.toLowerCase()] || TIKZ_PRESETS.matematika).map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="tikz-preset-chip"
                    onClick={() => setTikzDesc(p.prompt)}
                    title={p.prompt}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Szöveges leírás */}
            <div className="form-group">
              <label className="form-label">
                Ábra leírása {tikzImages.length > 0 ? '(opcionális pontosítás)' : '*'}
              </label>
              <textarea
                className="form-textarea"
                style={{ minHeight: 95 }}
                value={tikzDesc}
                onChange={(e) => setTikzDesc(e.target.value)}
                placeholder={
                  tikzImages.length > 0
                    ? 'pl. Alakítsd át TikZ kóddá a képen látható ábrát. A nyilak legyenek kékek, a betűzés magyar, derékszög jelöléssel... (opcionális)'
                    : 'pl. Derékszögű háromszög a befogókkal és az átfogóval jelölve, beírt körrel…'
                }
              />
            </div>

            <div className="current-doc-info-sub" style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 11, color: 'var(--text-muted)' }}>
              <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>A generálás után azonnal megjelenik a mini-előnézet, ahol finomhangolhatod, kiválaszthatod a beszúrási pozíciót (kurzorhoz vagy végére), vagy elmentheted önálló fájlként.</span>
            </div>

            {renderProgress()}
            {renderInserted()}

            <button
              className="btn btn-primary"
              style={{ justifyContent: 'center' }}
              disabled={loading || (!tikzDesc.trim() && tikzImages.length === 0)}
              onClick={handleTikz}
            >
              {loading ? (
                <Loader2 size={14} className="spinner" />
              ) : (
                <Shapes size={14} />
              )}
              {tikzImages.length > 0 ? 'TikZ vektoros ábra generálása és előnézet' : 'TikZ ábra generálása és előnézet'}
            </button>

            {/* C & D: AZONNALI TIKZ MINI-ELŐNÉZET ÉS BEILLESZTÉSI / EXPORT VEZÉRLŐK */}
            {tikzResult && (
              <div className="tikz-preview-card">
                {/* Fejléc: Cím, fülek (Előnézet / Kód), Zoom, Lightbox, Bezárás */}
                <div className="tikz-preview-header">
                  <div className="tikz-preview-title">
                    <Shapes size={13} className="accent-color" />
                    <span>TikZ előnézet</span>
                    {tikzResult.compileError ? (
                      <span className="tikz-status-badge error">Hiba</span>
                    ) : (
                      <span className="tikz-status-badge ready">Kész</span>
                    )}
                  </div>

                  <div className="tikz-preview-header-actions">
                    <div className="tikz-preview-tabs">
                      <button
                        type="button"
                        className={`tikz-preview-tab-btn ${tikzPreviewTab === 'preview' ? 'active' : ''}`}
                        onClick={() => setTikzPreviewTab('preview')}
                        title="Vizuális előnézet"
                      >
                        <Eye size={12} />
                        <span>Előnézet</span>
                      </button>
                      <button
                        type="button"
                        className={`tikz-preview-tab-btn ${tikzPreviewTab === 'code' ? 'active' : ''}`}
                        onClick={() => setTikzPreviewTab('code')}
                        title="TikZ LaTeX kód szerkesztése"
                      >
                        <Code size={12} />
                        <span>Kód</span>
                      </button>
                    </div>

                    {tikzPreviewTab === 'preview' && tikzResult.pdf && (
                      <div className="tikz-zoom-controls">
                        <button
                          type="button"
                          className="tikz-tool-btn"
                          onClick={() => setTikzZoom((z) => Math.max(0.6, z - 0.2))}
                          title="Kicsinyítés"
                        >
                          <ZoomOut size={11} />
                        </button>
                        <span className="tikz-zoom-label" onClick={() => setTikzZoom(1.0)} title="Visszaállítás 100%-ra">
                          {Math.round(tikzZoom * 100)}%
                        </span>
                        <button
                          type="button"
                          className="tikz-tool-btn"
                          onClick={() => setTikzZoom((z) => Math.min(2.5, z + 0.2))}
                          title="Nagyítás"
                        >
                          <ZoomIn size={11} />
                        </button>
                        <button
                          type="button"
                          className="tikz-tool-btn"
                          onClick={() => {
                            if (tikzPreviewPngUrl) setPreviewModalImg(tikzPreviewPngUrl)
                          }}
                          title="Nagyítás teljes képernyőre (Lightbox)"
                        >
                          <Maximize2 size={11} />
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      className="tikz-tool-btn close"
                      onClick={() => setTikzResult(null)}
                      title="Előnézet bezárása"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>

                {/* Törzs: Canvas előnézet VAGY Kódszerkesztő */}
                {tikzPreviewTab === 'preview' ? (
                  <div className="tikz-preview-body">
                    {tikzResult.compileError ? (
                      <div className="tikz-compile-error-box">
                        <div className="tikz-error-title">
                          <AlertCircle size={14} />
                          <span>Fordítási hiba történt a TikZ kódban:</span>
                        </div>
                        <pre className="tikz-error-log">{tikzResult.compileError}</pre>
                        <button
                          type="button"
                          className="btn btn-secondary tikz-fix-btn"
                          disabled={tikzRefineLoading}
                          onClick={() => handleTikzRefine(`Javítsd ki az alábbi fordítási hibát a TikZ kódban:\n${tikzResult.compileError}`)}
                        >
                          {tikzRefineLoading ? <Loader2 size={13} className="spinner" /> : <Sparkles size={13} />}
                          Hiba automatikus javítása AI-val
                        </button>
                      </div>
                    ) : tikzResult.pdf ? (
                      <TikzMiniCanvas
                        pdfData={tikzResult.pdf}
                        zoom={tikzZoom}
                        onRenderReady={setTikzPreviewPngUrl}
                        onZoomClick={() => {
                          if (tikzPreviewPngUrl) setPreviewModalImg(tikzPreviewPngUrl)
                        }}
                      />
                    ) : (
                      <div className="tikz-no-pdf">
                        <Loader2 size={18} className="spinner" />
                        <span>Ábra generálása folyamatban…</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="tikz-code-editor-box">
                    <textarea
                      className="tikz-code-editor"
                      value={tikzEditedCode}
                      onChange={(e) => setTikzEditedCode(e.target.value)}
                      placeholder="\begin{tikzpicture} ... \end{tikzpicture}"
                      spellCheck={false}
                    />
                    <div className="tikz-code-editor-footer">
                      <span className="tikz-code-lines-info">
                        {(tikzEditedCode.match(/\n/g) || []).length + 1} sor
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={tikzRecompileLoading}
                        onClick={handleRecompileTikz}
                        title="Kód újrafordítása standalone sablonnal (0.5s)"
                      >
                        {tikzRecompileLoading ? <Loader2 size={11} className="spinner" /> : <RefreshCw size={11} />}
                        Gyors újrafordítás
                      </button>
                    </div>
                  </div>
                )}

                {/* Finomhangoló sáv (Refinement Toolbar) */}
                <div className="tikz-refine-box">
                  <div className="tikz-refine-title">
                    <Sparkles size={11} />
                    <span>Gyors finomhangolás:</span>
                  </div>
                  <div className="tikz-refine-chips">
                    <button
                      type="button"
                      className="tikz-refine-chip"
                      disabled={tikzRefineLoading}
                      onClick={() => handleTikzRefine('Növeld meg az ábra méretét kb. 20%-kal (scale paraméter vagy koordináták arányos növelésével)!')}
                      title="Méret növelése 20%-kal"
                    >
                      <ZoomIn size={11} />
                      <span>+20% Méret</span>
                    </button>
                    <button
                      type="button"
                      className="tikz-refine-chip"
                      disabled={tikzRefineLoading}
                      onClick={() => handleTikzRefine('Csökkentsd le az ábra méretét kb. 20%-kal (scale paraméter csökkentésével)!')}
                      title="Méret csökkentése 20%-kal"
                    >
                      <ZoomOut size={11} />
                      <span>-20% Méret</span>
                    </button>
                    <button
                      type="button"
                      className="tikz-refine-chip"
                      disabled={tikzRefineLoading}
                      onClick={() => handleTikzRefine('Alakítsd át az ábra színeit modern, esztétikus oktatói árnyalatokra (kék, teal, narancs), lágy áttetsző kitöltésekkel!')}
                      title="Modern oktatói színek"
                    >
                      <Palette size={11} />
                      <span>Modern színek</span>
                    </button>
                    <button
                      type="button"
                      className="tikz-refine-chip"
                      disabled={tikzRefineLoading}
                      onClick={() => handleTikzRefine('Alakítsd át az ábrát 100% nyomtatásbarát fekete-fehér stílusúra, színek nélkül, vonalkázott kitöltésekkel!')}
                      title="Nyomtatásbarát fekete-fehér"
                    >
                      <Contrast size={11} />
                      <span>Fekete-fehér</span>
                    </button>
                    <button
                      type="button"
                      className="tikz-refine-chip"
                      disabled={tikzRefineLoading}
                      onClick={() => handleTikzRefine('Tedd a feliratokat és betűzéseket nagyobbá, kontrasztosabbá és jobban olvashatóvá!')}
                      title="Nagyobb betűméret"
                    >
                      <Type size={11} />
                      <span>Nagyobb betűk</span>
                    </button>
                    <button
                      type="button"
                      className="tikz-refine-chip"
                      disabled={tikzRefineLoading}
                      onClick={() => handleTikzRefine('Használj vastagabb éleket és modern stealth nyilhegyeket (arrows.meta)!')}
                      title="Vastagabb nyilak és élek"
                    >
                      <MoveRight size={11} />
                      <span>Vastag nyilak</span>
                    </button>
                  </div>
                  <div className="tikz-refine-input-row">
                    <input
                      type="text"
                      className="form-input"
                      style={{ fontSize: 11.5, height: 28 }}
                      value={tikzRefinePrompt}
                      onChange={(e) => setTikzRefinePrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleTikzRefine(tikzRefinePrompt)
                      }}
                      placeholder="Egyéni finomítás (pl. a kör legyen piros, P pont kék)..."
                    />
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ flexShrink: 0, height: 28, fontSize: 11, padding: '0 10px', gap: 4 }}
                      disabled={!tikzRefinePrompt.trim() || tikzRefineLoading}
                      onClick={() => handleTikzRefine(tikzRefinePrompt)}
                    >
                      {tikzRefineLoading ? <Loader2 size={11} className="spinner" /> : <Wand2 size={11} />}
                      <span>Finomítás</span>
                    </button>
                  </div>
                </div>

                {/* D pont: Beillesztési opciók & Standalone Ábra export */}
                <div className="tikz-insert-options-box">
                  <div className="tikz-options-row">
                    {/* Beszúrási pozíció */}
                    <div className="tikz-option-col">
                      <label className="tikz-opt-label">Pozíció</label>
                      <div className="tikz-segmented-control">
                        <button
                          type="button"
                          className={`tikz-segmented-btn ${tikzInsertPos === 'cursor' ? 'active' : ''}`}
                          onClick={() => setTikzInsertPos('cursor')}
                          title="Beszúrás a kurzor aktuális pozíciójához"
                        >
                          <Crosshair size={11} />
                          <span>Kurzorhoz</span>
                        </button>
                        <button
                          type="button"
                          className={`tikz-segmented-btn ${tikzInsertPos === 'append' ? 'active' : ''}`}
                          onClick={() => setTikzInsertPos('append')}
                          title="Beszúrás a dokumentum végére"
                        >
                          <ArrowDownToLine size={11} />
                          <span>Végére</span>
                        </button>
                      </div>
                    </div>

                    {/* Környezet választás */}
                    <div className="tikz-option-col">
                      <label className="tikz-opt-label">Környezet (burkoló)</label>
                      <div className="tikz-segmented-control">
                        <button
                          type="button"
                          className={`tikz-segmented-btn ${tikzWrapper === 'figure' ? 'active' : ''}`}
                          onClick={() => setTikzWrapper('figure')}
                          title="Számozott figure környezet képaláírással"
                        >
                          <Image size={11} />
                          <span>figure</span>
                        </button>
                        <button
                          type="button"
                          className={`tikz-segmented-btn ${tikzWrapper === 'center' ? 'active' : ''}`}
                          onClick={() => setTikzWrapper('center')}
                          title="Középre zárt center környezet"
                        >
                          <AlignCenter size={11} />
                          <span>center</span>
                        </button>
                        <button
                          type="button"
                          className={`tikz-segmented-btn ${tikzWrapper === 'plain' ? 'active' : ''}`}
                          onClick={() => setTikzWrapper('plain')}
                          title="Csak tiszta tikzpicture kód"
                        >
                          <Code size={11} />
                          <span>Csak TikZ</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Képaláírás, ha figure mód van kiválasztva */}
                  {tikzWrapper === 'figure' && (
                    <div className="tikz-caption-input-wrap">
                      <label className="tikz-opt-label">Képaláírás (caption)</label>
                      <input
                        type="text"
                        className="form-input"
                        style={{ fontSize: 11.5, height: 28 }}
                        value={tikzCaption}
                        onChange={(e) => setTikzCaption(e.target.value)}
                        placeholder="pl. 1. ábra: Derékszögű koordináta-rendszer"
                      />
                    </div>
                  )}

                  {/* Műveleti gombok (Beszúrás, Standalone export, Másolás) */}
                  <div className="tikz-insert-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ flex: 1.2, height: 30, fontSize: 11.5, justifyContent: 'center', padding: '0 8px', gap: 5, whiteSpace: 'nowrap' }}
                      onClick={handleInsertTikzToDoc}
                      title="Beszúrás a szerkesztett dokumentumba és azonnali fordítás"
                    >
                      <ArrowDown size={13} />
                      <span>Beszúrás &amp; Fordítás</span>
                    </button>

                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ flex: 1, height: 30, fontSize: 11.5, justifyContent: 'center', padding: '0 8px', gap: 5, whiteSpace: 'nowrap' }}
                      disabled={tikzSaveStandaloneLoading}
                      onClick={handleSaveStandaloneTikz}
                      title="Ábra elmentése önálló .tex fájlként a projektfába (\documentclass[tikz]{standalone})"
                    >
                      {tikzSaveStandaloneLoading ? <Loader2 size={12} className="spinner" /> : <FilePlus size={12} />}
                      <span>+ Önálló fájl</span>
                    </button>

                    <button
                      type="button"
                      className="btn btn-secondary btn-icon"
                      style={{ width: 30, height: 30, flexShrink: 0 }}
                      onClick={() => {
                        const rawCode = (tikzEditedCode || tikzResult.tikz || '').trim()
                        let codeToCopy = rawCode
                        if (tikzWrapper === 'center') codeToCopy = `\\begin{center}\n${rawCode}\n\\end{center}`
                        else if (tikzWrapper === 'figure') {
                          codeToCopy = `\\begin{figure}[htbp]\n  \\centering\n  ${rawCode}\n  \\caption{${tikzCaption.trim() || 'Ábra'}}\n  \\label{fig:abra}\n\\end{figure}`
                        }
                        navigator.clipboard.writeText(codeToCopy)
                        addNotif?.('TikZ kód másolva a vágólapra!', 'success')
                      }}
                      title="TikZ kód másolása a vágólapra"
                    >
                      <Copy size={13} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* MODE: FELADATSOR */}
        {mode === 'problems' && (
          <div
            className={`problems-mode-container ${isProbDragOver ? 'drag-over-active' : ''}`}
            onDragEnter={handleProbDragEnter}
            onDragOver={handleProbDragOver}
            onDragLeave={handleProbDragLeave}
            onDrop={handleProbDrop}
          >
            {/* Lebegő drag-overlay, ha az egész fül fölé húznak fájlt */}
            {isProbDragOver && (
              <div className="problems-drag-fullscreen-overlay">
                <UploadCloud size={38} className="drag-overlay-pulse-icon" />
                <span className="drag-overlay-main-text">Engedd el a .tex fájlt a forrásokhoz adáshoz!</span>
                <span className="drag-overlay-sub-text">A fájl azonnal bekerül a feladatsor forrásanyagai közé</span>
              </div>
            )}

            {/* 1. Könyvtár forrásfájlok és dropzone (mindig közvetlenül elérhető) */}
            <div className="form-group problems-source-files-wrap">
              <div className="problems-source-files-header">
                <label className="form-label" style={{ marginBottom: 0 }}>
                  Forrásfájlok a könyvtárból {selectedProjectFiles.length > 0 ? `(${selectedProjectFiles.length})` : ''}
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {currentFile?.name && !selectedProjectFiles.some((f) => f.path === (currentFile.path || currentFile.name)) && (
                    <button
                      type="button"
                      className="btn-text-subtle"
                      onClick={handleAddCurrentFile}
                      title="Szerkesztőben lévő fájl csatolása"
                    >
                      + Aktuális fájl
                    </button>
                  )}
                  {selectedProjectFiles.length > 0 && (
                    <button
                      type="button"
                      className="btn-text-subtle"
                      onClick={handleClearAllProjectFiles}
                      title="Minden csatolt fájl eltávolítása"
                    >
                      Összes törlése
                    </button>
                  )}
                </div>
              </div>

              {/* Dropzone és csatolt fájlok kártyái */}
              <div
                className={`problems-dropzone ${isProbDragOver ? 'drag-active' : ''} ${selectedProjectFiles.length > 0 ? 'has-files' : ''}`}
              >
                {selectedProjectFiles.length === 0 ? (
                  <div className="problems-dropzone-empty">
                    <div className="problems-dropzone-empty-main">
                      <div className="problems-dropzone-icon-box">
                        <UploadCloud size={24} className="problems-dropzone-icon" />
                      </div>
                      <div className="problems-dropzone-text-block">
                        <div className="problems-dropzone-title">
                          Húzz ide .tex fájl(oka)t a bal oldali könyvtárból
                        </div>
                        <div className="problems-dropzone-subtitle">
                          vagy akár egy egész mappát · a témakör automatikusan kitöltődik
                        </div>
                      </div>
                    </div>
                    {currentFile?.name && (
                      <button
                        type="button"
                        className="problems-quick-add-current"
                        onClick={handleAddCurrentFile}
                        title="Aktuális szerkesztett dokumentum hozzáadása a feladatsor forrásaihoz"
                      >
                        <Plus size={12} />
                        <span>+ Aktuális fájl csatolása ({currentFile.name})</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="problems-file-chip-list">
                    {selectedProjectFiles.map((file) => (
                      <div key={file.path} className="problems-file-chip">
                        <div className="problems-file-chip-left">
                          <FileCode size={14} className="problems-file-icon" />
                          <div className="problems-file-chip-names">
                            <span className="problems-file-chip-name" title={file.relativePath || file.name}>
                              {file.name}
                            </span>
                            {file.relativePath && file.relativePath !== file.name && (
                              <span className="problems-file-chip-rel" title={file.relativePath}>
                                {file.relativePath}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="problems-file-chip-right">
                          {file.isLoading ? (
                            <span className="problems-file-loading-badge">
                              <Loader2 size={11} className="spinner" /> Betöltés…
                            </span>
                          ) : (
                            <span className="problems-file-lines-badge">{file.lineCount} sor</span>
                          )}
                          <button
                            type="button"
                            className="problems-file-remove-btn"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleRemoveProjectFile(file.path)
                            }}
                            title="Fájl eltávolítása"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      </div>
                    ))}

                    <div className="problems-dropzone-footer-hint">
                      <Plus size={12} />
                      <span>Húzz ide további fájlokat vagy mappát a bal oldali fa nézetből…</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 2. Témakör */}
            <div className="form-group">
              <div className="problems-topic-label-row">
                <label className="form-label" style={{ marginBottom: 0 }}>
                  Témakör *
                </label>
                {(selectedProjectFiles.length > 0 || currentFile?.name) && (
                  <button
                    type="button"
                    className="topic-auto-detect-btn"
                    onClick={() => {
                      const filesToUse = selectedProjectFiles.length > 0
                        ? selectedProjectFiles
                        : (currentFile?.name ? [{ name: currentFile.name, path: currentFile.path || '', content: currentCode }] : [])
                      const smartTopic = inferTopicFromFiles(filesToUse)
                      if (smartTopic) {
                        setProbTopic(smartTopic)
                        setTopicUserEdited(false)
                        addNotif?.(`Témakör felismerve: ${smartTopic}`, 'info')
                      } else {
                        addNotif?.('Nem sikerült automatikusan témakört azonosítani a fájlból.', 'info')
                      }
                    }}
                    title="Témakör automatikus felismerése a fájlok alapján"
                  >
                    <Sparkles size={11} />
                    <span>Felismerés</span>
                  </button>
                )}
              </div>
              <input
                className="form-input"
                value={probTopic}
                onChange={(e) => {
                  setProbTopic(e.target.value)
                  setTopicUserEdited(true)
                }}
                placeholder="pl. Másodfokú egyenletek, Permutáció, Kinematika…"
              />
            </div>

            {/* 2. Nehézségi felépítés és feladatszám */}
            <div className="prob-params-grid">
              <div className="form-group">
                <label className="form-label" title="Generálandó feladatok darabszáma">
                  Feladatok száma
                </label>
                <div className="number-stepper">
                  <button
                    type="button"
                    className="stepper-btn"
                    onClick={() => setProbCount(Math.max(2, probCount - 1))}
                    disabled={probCount <= 2}
                    title="Eggyel kevesebb feladat"
                  >
                    <Minus size={13} />
                  </button>
                  <span className="stepper-val">
                    <span className="stepper-num">{probCount}</span>
                    <span className="stepper-unit">feladat</span>
                  </span>
                  <button
                    type="button"
                    className="stepper-btn"
                    onClick={() => setProbCount(Math.min(25, probCount + 1))}
                    disabled={probCount >= 25}
                    title="Eggyel több feladat"
                  >
                    <Plus size={13} />
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label" title="Feladatsor nehézségi struktúrája">
                  Nehézségi felépítés
                </label>
                <CustomSelect value={probDiffStructure} onChange={setProbDiffStructure} options={PROBLEM_DIFFICULTY_OPTIONS} />
              </div>
            </div>

            {/* 3. Feladattípusok */}
            <div className="form-group">
              <label className="form-label">Feladattípusok és változatosság</label>
              <div className="problem-types-grid">
                {[
                  { key: 'standard', label: 'Számolásos / levezetős' },
                  { key: 'multiple_choice', label: 'Feleletválasztós (A/B/C/D)' },
                  { key: 'applied', label: 'Gyakorlati / Életszerű' },
                  { key: 'error_finding', label: '„Keresd a hibát!”' },
                  { key: 'true_false', label: 'Igaz / Hamis indoklással' }
                ].map((t) => (
                  <label key={t.key} className="type-check-label">
                    <input
                      type="checkbox"
                      checked={probTypes[t.key]}
                      onChange={(e) => setProbTypes((p) => ({ ...p, [t.key]: e.target.checked }))}
                    />
                    <span>{t.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* 4. Megoldások és értékelés */}
            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="custom-checkbox-wrap" onClick={() => setWithTheory(!withTheory)}>
                <div className={`custom-checkbox-box ${withTheory ? 'checked' : ''}`}>
                  {withTheory && <Check size={12} strokeWidth={3} />}
                </div>
                <span>Rövid elméleti összefoglaló a feladatok előtt</span>
              </div>

              <div className="custom-checkbox-wrap" onClick={() => setWithSolutions(!withSolutions)}>
                <div className={`custom-checkbox-box ${withSolutions ? 'checked' : ''}`}>
                  {withSolutions && <Check size={12} strokeWidth={3} />}
                </div>
                <span>Részletes lépésről-lépésre megoldókulcs</span>
              </div>

              {withSolutions && (
                <>
                  <div className="custom-checkbox-wrap" style={{ marginLeft: 22 }} onClick={() => setProbWithRubric(!probWithRubric)}>
                    <div className={`custom-checkbox-box ${probWithRubric ? 'checked' : ''}`}>
                      {probWithRubric && <Check size={12} strokeWidth={3} />}
                    </div>
                    <span>Magyar érettségi pontozási útmutató (pontszámokkal)</span>
                  </div>
                  <div style={{ marginLeft: 22 }}>
                    <CustomSelect value={solutionPlacement} onChange={setSolutionPlacement} options={SOLUTION_PLACEMENT_OPTIONS} />
                  </div>
                </>
              )}

              <div className="custom-checkbox-wrap" onClick={() => setWithGroupsAB(!withGroupsAB)}>
                <div className={`custom-checkbox-box ${withGroupsAB ? 'checked' : ''}`}>
                  {withGroupsAB && <Check size={12} strokeWidth={3} />}
                </div>
                <span>„A” és „B” csoport változat</span>
              </div>
            </div>

            {/* 5. Kimenet */}
            <div className="form-group">
              <label className="form-label">Kimenet</label>
              <div className="ai-source-tabs">
                <button
                  type="button"
                  className={`ai-source-tab ${probOutputTarget === 'new_doc' ? 'active' : ''}`}
                  onClick={() => setProbOutputTarget('new_doc')}
                >
                  Új dokumentum
                </button>
                <button
                  type="button"
                  className={`ai-source-tab ${probOutputTarget === 'append' ? 'active' : ''}`}
                  onClick={() => setProbOutputTarget('append')}
                >
                  Hozzáfűzés a végére
                </button>
              </div>
            </div>

            {renderProgress()}
            {renderInserted()}

            <button
              className="btn btn-primary"
              style={{ justifyContent: 'center' }}
              disabled={loading || !probTopic.trim()}
              onClick={handleProblems}
            >
              {loading ? <Loader2 size={14} className="spinner" /> : <ListChecks size={14} />}
              Feladatsor generálása
            </button>
          </div>
        )}

        {/* MODE: BEAMER */}
        {mode === 'beamer' && (
          <>
            <div className="form-group">
              <label className="form-label">Forrás</label>
              <div className="ai-source-tabs">
                <button
                  type="button"
                  className={`ai-source-tab ${beamerSource === 'current' ? 'active' : ''}`}
                  onClick={() => setBeamerSource('current')}
                >
                  Aktuális dokumentum
                </button>
                <button
                  type="button"
                  className={`ai-source-tab ${beamerSource === 'custom' ? 'active' : ''}`}
                  onClick={() => setBeamerSource('custom')}
                >
                  Beillesztett szöveg
                </button>
              </div>
            </div>

            {beamerSource === 'current' ? (
              <div className="current-doc-info-card">
                <div className="current-doc-info-title">
                  <FileText size={13} />
                  <span>{currentFile?.name || 'Névtelen.tex'}</span>
                </div>
                <div className="current-doc-info-sub">{currentCode.split('\n').length} sor lesz átalakítva Beamer diákká</div>
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label">LaTeX tartalom</label>
                <textarea
                  className="form-textarea"
                  style={{ minHeight: 140, fontFamily: 'var(--font-mono)', fontSize: 11.5 }}
                  value={beamerText}
                  onChange={(e) => setBeamerText(e.target.value)}
                  placeholder="Illeszd be az átalakítandó LaTeX összefoglalót…"
                />
              </div>
            )}

            {renderProgress()}
            {renderInserted()}

            <button
              className="btn btn-primary"
              style={{ justifyContent: 'center' }}
              disabled={loading || (beamerSource === 'custom' && !beamerText.trim())}
              onClick={handleBeamer}
            >
              {loading ? <Loader2 size={14} className="spinner" /> : <Presentation size={14} />}
              Beamer prezentáció készítése
            </button>
          </>
        )}
      </div>

      {/* Kép nagyítás (lightbox) */}
      {previewModalImg && (
        <div className="ai-chat-lightbox-backdrop" onClick={() => setPreviewModalImg(null)}>
          <div className="ai-chat-lightbox-box" onClick={(e) => e.stopPropagation()}>
            <img src={previewModalImg} alt="Nagyított kép" className="ai-chat-lightbox-img" />
            <button type="button" className="ai-chat-lightbox-close-btn" onClick={() => setPreviewModalImg(null)}>
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
