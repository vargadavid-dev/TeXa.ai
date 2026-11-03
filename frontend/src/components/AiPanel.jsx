import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import axios from 'axios'
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
  Loader2
} from 'lucide-react'

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
  { value: 'feladatsor', label: 'Feladatsor', desc: 'Számozott feladatok megoldókulccsal' },
  { value: 'beamer', label: 'Beamer prezentáció', desc: 'Diák bullet pontokkal és képletekkel' },
  { value: 'leiras', label: 'Részletes leírás', desc: 'Folyó szöveg, példák, TikZ ábrák' }
]

const PROBLEM_DIFFICULTY_OPTIONS = [
  { value: 'pyramid', label: 'Piramis (fokozatosan nehezedő)', desc: 'Alap → Közép → Emelt szint' },
  { value: 'easy', label: 'Alapszint', desc: 'Drill és alapfogalmak' },
  { value: 'medium', label: 'Középszint', desc: 'Érettségi típusfeladatok' },
  { value: 'hard', label: 'Emelt szint', desc: 'Összetett feladatok' },
  { value: 'competition', label: 'Verseny / Olimpia', desc: 'Mély gondolkodtató feladatok' }
]

const SOLUTION_PLACEMENT_OPTIONS = [
  { value: 'separate_page', label: 'Külön oldalon a végén', desc: 'A feladatok után új lapon' },
  { value: 'inline', label: 'Feladatok alatt (inline)', desc: 'Minden feladat után közvetlenül' },
  { value: 'separate_doc', label: 'Külön dokumentumban', desc: 'Önálló megoldókulcs .tex fájl' }
]

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

  // Feladatsor
  const [probSourceMode, setProbSourceMode] = useState('custom') // custom | current | project
  const [probTopic, setProbTopic] = useState('')
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
  const [selectedProjectFile, setSelectedProjectFile] = useState(null)
  const [selectedFileContent, setSelectedFileContent] = useState('')
  const [isLoadingFileContent, setIsLoadingFileContent] = useState(false)

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

  const projectFileOptions = useMemo(
    () =>
      allProjectFiles.map((f) => ({
        value: f.path,
        label: f.relativePath || f.name
      })),
    [allProjectFiles]
  )

  const handleSelectProjectFile = async (filePath) => {
    const file = allProjectFiles.find((f) => f.path === filePath)
    setSelectedProjectFile(file || null)
    setSelectedFileContent('')
    if (!file) return
    setIsLoadingFileContent(true)
    try {
      const r = await axios.post('/api/files/load', { filePath: file.path })
      setSelectedFileContent(r.data?.content || '')
    } catch (err) {
      addNotif?.('A kiválasztott fájl tartalma nem tölthető be.', 'error')
    } finally {
      setIsLoadingFileContent(false)
    }
  }

  // Kép beillesztés vágólapról (csevegő módban)
  const readImageFile = useCallback((file) => {
    const reader = new FileReader()
    reader.onload = (evt) => {
      setPendingImages((prev) => [...prev, { dataUrl: evt.target.result, name: file.name || 'kép' }])
    }
    reader.readAsDataURL(file)
  }, [])

  useEffect(() => {
    if (!open || mode !== 'chat') return undefined
    const handlePaste = (e) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const file = item.getAsFile()
          if (file) readImageFile(file)
        }
      }
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [open, mode, readImageFile])

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
      onInsert?.(res.data.latex, true, topic.trim())
      setLastInserted({ label: topic.trim() })
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

  // 3. TikZ
  const handleTikz = async () => {
    if (!tikzDesc.trim() || loading) return
    setLoading(true)
    setLastInserted(null)
    startProgressTracking()
    try {
      const res = await axios.post('/api/ai/tikz', {
        description: tikzDesc.trim(),
        subject: activeSubject.toLowerCase(),
        provider,
        model: modelParam
      })
      remember()
      onAppend?.(res.data.tikz, { forceAppend: true })
      setLastInserted({ label: 'TikZ ábra' })
      stopProgressTracking(true)
    } catch (err) {
      stopProgressTracking(false)
      reportError(err)
    } finally {
      setLoading(false)
    }
  }

  // 4. Feladatsor
  const handleProblems = async () => {
    if (loading) return
    if (probSourceMode === 'custom' && !probTopic.trim()) return
    if (probSourceMode === 'project' && !selectedFileContent) return
    setLoading(true)
    setLastInserted(null)
    startProgressTracking()
    try {
      const useContext = probSourceMode !== 'custom'
      const contextContent = probSourceMode === 'current' ? currentCode : selectedFileContent
      const selectedSnippet = probSourceMode === 'current' ? getSelectedSnippet?.() || '' : ''
      const activeTypes = Object.entries(probTypes)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .join(',')

      const fd = buildFormData({
        topic: probTopic.trim(),
        subject: activeSubject,
        count: probCount,
        sourceMode: useContext ? 'current' : 'custom',
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
      onInsert?.(res.data.latex, true)
      setLastInserted({ label: 'Beamer prezentáció' })
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
          <span>AI dolgozik…</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="progress-track">
          <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="ai-progress-status-text">{statusMsg}</div>
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
          <button type="button" className="ai-expand-btn" onClick={onToggleCollapse} title="AI Asszisztens kinyitása">
            <Sparkles size={16} />
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
          <div className="ai-header-icon">
            <Sparkles size={13} />
          </div>
          <div>
            <div className="ai-panel-title">AI Asszisztens</div>
          </div>
        </div>

        <div className="ai-header-right">
          <div style={{ width: 165 }}>
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
              title="AI Asszisztens összecsukása vékony sávra"
            >
              <PanelLeftClose size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Tantárgy választó sáv */}
      <div className="ai-subject-strip">
        <div className="ai-subject-switcher">
          <button
            type="button"
            className={`ai-subject-btn ${activeSubject === 'Matematika' ? 'active math' : ''}`}
            onClick={() => handleSubjectChange('Matematika')}
            title="Matematika AI asszisztens és eszközök"
          >
            <Sigma size={15} />
            <span>Matematika</span>
          </button>
          <button
            type="button"
            className={`ai-subject-btn ${activeSubject === 'Fizika' ? 'active physics' : ''}`}
            onClick={() => handleSubjectChange('Fizika')}
            title="Fizika AI asszisztens és eszközök"
          >
            <Atom size={15} />
            <span>Fizika</span>
          </button>
        </div>
      </div>

      {/* Törzs */}
      <div className={`ai-panel-body ${mode === 'chat' ? 'chat-mode' : ''}`}>
        {/* Mód választó fülek */}
        <div className="ai-mode-tabs">
          {MODES.map((m) => {
            const Icon = m.icon
            const isActive = mode === m.id
            return (
              <button
                key={m.id}
                className={`ai-mode-tab ${isActive ? 'active' : ''}`}
                onClick={() => {
                  setMode(m.id)
                  setLastInserted(null)
                }}
                title={m.desc}
              >
                <Icon size={16} />
                <span>{m.label}</span>
              </button>
            )
          })}
        </div>

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

            {pendingImages.length > 0 && (
              <div className="ai-chat-pending-bar">
                <span className="ai-chat-pending-label">Csatolva:</span>
                <div className="ai-chat-pending-list">
                  {pendingImages.map((img, idx) => (
                    <div key={idx} className="ai-chat-pending-thumb">
                      <img src={img.dataUrl} alt="Csatolt" />
                      <button
                        type="button"
                        className="ai-chat-pending-del"
                        onClick={() => setPendingImages((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        <X size={9} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="ai-chat-input-container">
              <textarea
                ref={chatInputRef}
                className="ai-chat-textarea"
                rows={2}
                placeholder="Írd le, mit szeretnél módosítani, vagy csatolj képernyőképet…"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleChatKeyDown}
                disabled={chatLoading}
              />
              <div className="ai-chat-toolbar-row">
                <div className="ai-chat-toolbar-left">
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
                    className="ai-chat-attach-btn"
                    onClick={() => chatImageInputRef.current?.click()}
                    title="Kép csatolása"
                  >
                    <ImageIcon size={12} />
                    <span>Kép</span>
                  </button>
                  <span className="ai-chat-paste-tag">⌘V a beillesztéshez</span>
                </div>
                <button
                  type="button"
                  className="btn btn-primary ai-chat-send-btn"
                  disabled={chatLoading || (!chatInput.trim() && pendingImages.length === 0)}
                  onClick={() => handleSendChatMessage()}
                >
                  {chatLoading ? <Loader2 size={12} className="spinner" /> : <Send size={12} />}
                  <span>Küldés</span>
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
          <>
            <div className="form-group">
              <label className="form-label">Ábra leírása *</label>
              <textarea
                className="form-textarea"
                style={{ minHeight: 120 }}
                value={tikzDesc}
                onChange={(e) => setTikzDesc(e.target.value)}
                placeholder="pl. Derékszögű háromszög a befogókkal és az átfogóval jelölve, beírt körrel…"
              />
            </div>

            <div className="current-doc-info-sub" style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 11, color: 'var(--text-muted)' }}>
              <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>Az ábra a dokumentum végére (az \end&#123;document&#125; elé) kerül beillesztésre.</span>
            </div>

            {renderProgress()}
            {renderInserted()}

            <button className="btn btn-primary" style={{ justifyContent: 'center' }} disabled={!tikzDesc.trim() || loading} onClick={handleTikz}>
              {loading ? <Loader2 size={14} className="spinner" /> : <Shapes size={14} />}
              TikZ ábra generálása
            </button>
          </>
        )}

        {/* MODE: FELADATSOR */}
        {mode === 'problems' && (
          <>
            {/* 1. Forrás */}
            <div className="form-group">
              <label className="form-label">Forrás</label>
              <div className="ai-source-tabs">
                {[
                  { id: 'custom', label: 'Egyéni téma' },
                  { id: 'current', label: 'Aktuális dokumentum' },
                  { id: 'project', label: 'Projektfájl' }
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`ai-source-tab ${probSourceMode === s.id ? 'active' : ''}`}
                    onClick={() => setProbSourceMode(s.id)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* A: aktuális dokumentum */}
            {probSourceMode === 'current' && (
              <div className="current-doc-info-card">
                <div className="current-doc-info-header">
                  <div className="current-doc-info-title">
                    <FileText size={13} />
                    <span>{currentFile?.name || 'Névtelen.tex'}</span>
                  </div>
                  <span className="current-doc-subject-badge">{activeSubject}</span>
                </div>
                <div className="current-doc-info-sub">
                  <span>{currentCode.split('\n').length} sor betöltve</span>
                  {selectionLinesHint > 0 && <span> · {selectionLinesHint} sor kijelölve (erre fókuszál)</span>}
                </div>
              </div>
            )}

            {/* B: projektfájl */}
            {probSourceMode === 'project' && (
              <div className="form-group">
                <label className="form-label">Projektfájl</label>
                <CustomSelect
                  value={selectedProjectFile?.path || ''}
                  onChange={handleSelectProjectFile}
                  options={projectFileOptions}
                  placeholder="Válassz .tex fájlt…"
                />
                {selectedProjectFile && (
                  <div className="current-doc-info-card">
                    <div className="current-doc-info-title">
                      <Folder size={13} />
                      <span>{selectedProjectFile.relativePath || selectedProjectFile.name}</span>
                    </div>
                    <div className="current-doc-info-sub">
                      {isLoadingFileContent ? (
                        <span style={{ color: 'var(--accent-light)' }}>Betöltés…</span>
                      ) : (
                        selectedFileContent && <span>{selectedFileContent.split('\n').length} sor betöltve</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* C: egyéni téma */}
            <div className="form-group">
              <label className="form-label">Témakör {probSourceMode === 'custom' ? '*' : '(opcionális)'}</label>
              <input
                className="form-input"
                value={probTopic}
                onChange={(e) => setProbTopic(e.target.value)}
                placeholder="pl. Másodfokú egyenletek, Ismétléses permutáció, Kinematika…"
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
              disabled={
                loading ||
                (probSourceMode === 'custom' && !probTopic.trim()) ||
                (probSourceMode === 'project' && !selectedFileContent)
              }
              onClick={handleProblems}
            >
              {loading ? <Loader2 size={14} className="spinner" /> : <ListChecks size={14} />}
              Feladatsor generálása
            </button>
          </>
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
