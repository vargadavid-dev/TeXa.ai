import { useState, useMemo, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import Editor from '@monaco-editor/react'
import {
  FileCode,
  Terminal,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Trash2,
  Sparkles,
  Wand2,
  X,
  Loader2,
  CornerDownLeft,
  ListTree,
  Navigation,
  AlertTriangle,
  AlertCircle,
  ArrowRight,
  List,
  Code2,
  Undo2,
  Redo2,
  Sun,
  Moon,
  Pencil,
  RefreshCw
} from 'lucide-react'
import { extractOutline } from '../utils/latexOutline'
import { registerLatexLanguage } from '../utils/latexMonarch'
import DocumentOutline from './DocumentOutline'

const LATEX_ERROR_HINTS = {
  'Missing $ inserted.': 'Hiányzó dollárjel ($) matematikai képlet körül vagy aláhúzás/speciális karakter (_ , ^ , &) sima szövegben.',
  'Undefined control sequence.': 'Ismeretlen vagy elgépelt parancs, esetleg hiányzó \\usepackage csomag a preambulumban.',
  'LaTeX Error: Environment': 'Ismeretlen környezet (pl. hiányzó tcolorbox, amsmath stb. csomag).',
  'LaTeX Error: File': 'Hiányzó stíluslap (.sty) vagy képfájl.',
  'Extra }, or forgotten $.': 'Felesleges lezáró kapcsos zárójel (}) vagy lezáratlan képlet.',
  'Missing \\begin{document}': 'Hiányzó \\begin{document} a dokumentum elején.',
  'Paragraph ended before': 'Lezáratlan parancs vagy hiányzó kapcsos zárójel a bekezdésben.',
  'Missing number, treated as zero.': 'Hiányzó számérték méret- vagy pozíciómegadásnál.',
  'Illegal unit of measure': 'Érvénytelen mértékegység (pl. pt, cm, mm helyett hibás karakter).',
  'Emergency stop.': 'Kritikus hiba, a TeX feldolgozó leállt.',
  'Bad math environment delimiter': 'Hibás egyenlethatároló vagy egymásba ágyazott matematikai környezet.'
}

function getFriendlyHint(msg) {
  if (!msg) return null
  for (const [key, hint] of Object.entries(LATEX_ERROR_HINTS)) {
    if (msg.includes(key)) return hint
  }
  return null
}

function parseLatexErrors(log) {
  if (!log || typeof log !== 'string') return []
  const lines = log.split('\n')
  const items = []
  let current = null

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]
    const trimmed = rawLine.trim()

    // 1. pdflatex hiba sor: ! jellel kezdődik
    if (trimmed.startsWith('!')) {
      if (current) items.push(current)
      const msg = trimmed.replace(/^!\s*/, '')
      current = {
        id: `err-${items.length + 1}`,
        type: 'error',
        message: msg,
        hint: getFriendlyHint(msg),
        line: null,
        snippet: '',
        raw: [trimmed]
      }
      continue
    }

    // 2. document.tex:33: format
    const fileLineMatch = trimmed.match(/^(?:\.\/)?[\w\-\.]+\.tex:(\d+):\s*(.*)/i)
    if (fileLineMatch && !current) {
      const lineNum = parseInt(fileLineMatch[1], 10)
      const msg = fileLineMatch[2] || 'Fordítási hiba'
      items.push({
        id: `err-${items.length + 1}`,
        type: 'error',
        message: msg,
        hint: getFriendlyHint(msg),
        line: lineNum,
        snippet: '',
        raw: [trimmed]
      })
      continue
    }

    if (current) {
      current.raw.push(trimmed)

      // Sorszám keresése: l.<szám>
      const lMatch = trimmed.match(/^l\.(\d+)\s*(.*)/)
      if (lMatch) {
        current.line = parseInt(lMatch[1], 10)
        if (lMatch[2] && !current.snippet) {
          current.snippet = lMatch[2].trim()
        }
      } else if (!current.line) {
        const inlineMatch = trimmed.match(/(?:on input line|lines?)\s+(\d+)/i)
        if (inlineMatch) {
          current.line = parseInt(inlineMatch[1], 10)
        }
      }

      if (
        !current.snippet &&
        trimmed &&
        !trimmed.startsWith('l.') &&
        !trimmed.startsWith('<inserted') &&
        !trimmed.startsWith('---')
      ) {
        current.snippet = trimmed
      }
    }
  }

  if (current) items.push(current)

  // Ha nincs ! hiba, keressünk figyelmeztetéseket (pl. Warning on input line 42)
  if (items.length === 0) {
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim()
      const warnMatch = trimmed.match(/LaTeX Warning:\s*(.*?)(?:on input line (\d+))?\.?$/i)
      if (warnMatch) {
        items.push({
          id: `warn-${items.length + 1}`,
          type: 'warning',
          message: warnMatch[1] || trimmed,
          hint: 'Figyelmeztetés a dokumentumban',
          line: warnMatch[2] ? parseInt(warnMatch[2], 10) : null,
          snippet: '',
          raw: [trimmed]
        })
      }
    }
  }

  return items
}

const QUICK_INLINE_CHIPS = [
  'Tedd elegáns tcolorbox dobozba',
  'Javítsd és szépítsd meg a képleteket',
  'Magyarázd el lépésről lépésre magyarul',
  'Egyszerűsítsd a matematikai levezetést',
  'Alakítsd át számozott egyenletekké'
]

const EditorPane = forwardRef(function EditorPane({
  code,
  isModified,
  autoSaveEnabled = true,
  autoSaveStatus = 'idle',
  lastSavedTime = null,
  currentFile,
  compileStatus,
  compileLog,
  onChange,
  onUndoRedoChange,
  onClearLog,
  onTransformSelection,
  onForwardSync,
  activeLineToReveal,
  onFixError,
  onImportFiles,
  onRenameFile,
  onFixStructure,
  isFixingStructure
}, ref) {
  // Alapértelmezetten összecsukva, hogy ne foglalja feleslegesen a helyet a szerkesztő elől
  const [consoleCollapsed, setConsoleCollapsed] = useState(true)
  const [consoleHeight, setConsoleHeight] = useState(() => {
    try {
      const saved = localStorage.getItem('latex_console_height')
      return saved ? parseInt(saved, 10) : 210
    } catch {
      return 210
    }
  })
  const [isResizingConsole, setIsResizingConsole] = useState(false)
  const [consoleViewTab, setConsoleViewTab] = useState('errors') // 'errors' | 'raw'
  const prevCompileStatusRef = useRef(compileStatus)
  const [copied, setCopied] = useState(false)
  const [selectedText, setSelectedText] = useState('')
  const [selectionRange, setSelectionRange] = useState(null)
  const [isAiPromptOpen, setIsAiPromptOpen] = useState(false)
  const [inlineInstruction, setInlineInstruction] = useState('')
  const [isTransforming, setIsTransforming] = useState(false)
  const [isOutlineOpen, setIsOutlineOpen] = useState(false)
  const inlineTextareaRef = useRef(null)

  // Automatikus magasságállítás a többsoros prompt beviteli mezőhöz (szövegtördelés és teljes olvashatóság)
  useEffect(() => {
    if (inlineTextareaRef.current) {
      inlineTextareaRef.current.style.height = 'auto'
      const scrollH = inlineTextareaRef.current.scrollHeight
      inlineTextareaRef.current.style.height = `${Math.min(Math.max(scrollH, 52), 180)}px`
    }
  }, [inlineInstruction, isAiPromptOpen])

  // Fájlnév szerkesztési állapot
  const [isEditingName, setIsEditingName] = useState(false)
  const [editNameValue, setEditNameValue] = useState('')
  const renameInputRef = useRef(null)

  const handleStartRename = useCallback(() => {
    const raw = currentFile ? currentFile.name : 'Dokumentum'
    const base = raw.replace(/\.tex$/i, '')
    setEditNameValue(base)
    setIsEditingName(true)
    setTimeout(() => {
      if (renameInputRef.current) {
        renameInputRef.current.focus()
        renameInputRef.current.select()
      }
    }, 40)
  }, [currentFile])

  const handleCommitRename = useCallback(async () => {
    const val = editNameValue.trim()
    setIsEditingName(false)
    if (!val) return
    const cleanBase = val.replace(/\.tex$/i, '').trim()
    if (!cleanBase) return
    const newName = `${cleanBase}.tex`
    if (currentFile?.name === newName) return
    if (onRenameFile) {
      await onRenameFile(currentFile, newName)
    }
  }, [editNameValue, currentFile, onRenameFile])

  const handleCancelRename = useCallback(() => {
    setIsEditingName(false)
  }, [])
  const [outlineWidth, setOutlineWidth] = useState(() => {
    try {
      const saved = localStorage.getItem('latex_outline_width')
      return saved ? parseInt(saved, 10) : 280
    } catch {
      return 280
    }
  })
  const [isResizingOutline, setIsResizingOutline] = useState(false)
  const [isFixingError, setIsFixingError] = useState(false)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [editorTheme, setEditorTheme] = useState(() => {
    try {
      return localStorage.getItem('latex_editor_theme') || 'overleaf-dark'
    } catch {
      return 'overleaf-dark'
    }
  })

  const editorRef = useRef(null)
  const monacoRef = useRef(null)
  const flashDecorationsRef = useRef([])

  const updateUndoRedoStatus = useCallback(() => {
    if (!editorRef.current) return
    const model = editorRef.current.getModel()
    if (model) {
      const u = Boolean(model.canUndo && model.canUndo())
      const r = Boolean(model.canRedo && model.canRedo())
      setCanUndo(u)
      setCanRedo(r)
      onUndoRedoChange?.({ canUndo: u, canRedo: r })
    }
  }, [onUndoRedoChange])

  const handleUndo = useCallback(() => {
    if (editorRef.current) {
      editorRef.current.trigger('toolbar', 'undo', null)
      editorRef.current.focus()
      setTimeout(updateUndoRedoStatus, 20)
    }
  }, [updateUndoRedoStatus])

  const handleRedo = useCallback(() => {
    if (editorRef.current) {
      editorRef.current.trigger('toolbar', 'redo', null)
      editorRef.current.focus()
      setTimeout(updateUndoRedoStatus, 20)
    }
  }, [updateUndoRedoStatus])

  const handleToggleTheme = useCallback(() => {
    setEditorTheme((cur) => {
      const next = cur === 'overleaf-dark' ? 'overleaf-light' : 'overleaf-dark'
      try {
        localStorage.setItem('latex_editor_theme', next)
      } catch {}
      return next
    })
  }, [])



  // Sor villanó kiemelése Monaco szerkesztőben
  const flashLine = useCallback((line) => {
    if (!editorRef.current || !monacoRef.current) return
    const monaco = monacoRef.current
    flashDecorationsRef.current = editorRef.current.deltaDecorations(flashDecorationsRef.current, [
      {
        range: new monaco.Range(line, 1, line, 1),
        options: {
          isWholeLine: true,
          className: 'monaco-line-flash-highlight',
          marginClassName: 'monaco-glyph-flash-highlight'
        }
      }
    ])
    setTimeout(() => {
      if (editorRef.current) {
        flashDecorationsRef.current = editorRef.current.deltaDecorations(
          flashDecorationsRef.current,
          []
        )
      }
    }, 1800)
  }, [])

  // Gyorsugrás sorszámra
  const handleJumpToLine = useCallback(
    (line) => {
      if (!editorRef.current) return
      editorRef.current.revealLineInCenter(line)
      editorRef.current.setPosition({ lineNumber: line, column: 1 })
      editorRef.current.focus()
      flashLine(line)
      if (onForwardSync) {
        onForwardSync(line, 1)
      }
    },
    [onForwardSync, flashLine]
  )

  // Ref metódusok az App felé (visszavonható kódfrissítés, undo, redo, ugrás, kijelölés lekérés)
  useImperativeHandle(
    ref,
    () => ({
      applyCodeUpdate: (newCode, preserveUndo = true) => {
        if (!editorRef.current) {
          onChange?.(newCode)
          return
        }
        const editor = editorRef.current
        const model = editor.getModel()
        if (!model) {
          onChange?.(newCode)
          return
        }
        if (model.getValue() === newCode) return

        if (preserveUndo) {
          editor.pushUndoStop()
          editor.executeEdits('app-update', [
            {
              range: model.getFullModelRange(),
              text: newCode,
              forceMoveMarkers: true
            }
          ])
          editor.pushUndoStop()
          setTimeout(updateUndoRedoStatus, 20)
        } else {
          editor.setValue(newCode)
          setTimeout(updateUndoRedoStatus, 20)
        }
      },
      undo: handleUndo,
      redo: handleRedo,
      getEditor: () => editorRef.current,
      layout: () => {
        if (editorRef.current) {
          editorRef.current.layout()
        }
      },
      jumpToLine: handleJumpToLine,
      flashLine: flashLine,
      selectAll: () => {
        if (!editorRef.current) return
        const model = editorRef.current.getModel()
        if (model) {
          editorRef.current.focus()
          editorRef.current.setSelection(model.getFullModelRange())
        }
      },
      getSelection: () => {
        if (!editorRef.current) return null
        const selection = editorRef.current.getSelection()
        if (!selection || selection.isEmpty()) return null
        const model = editorRef.current.getModel()
        if (!model) return null
        const selectedText = model.getValueInRange(selection)
        return {
          selection,
          selectedText,
          startLine: selection.startLineNumber,
          endLine: selection.endLineNumber,
          startColumn: selection.startColumn,
          endColumn: selection.endColumn
        }
      }
    }),
    [onChange, handleUndo, handleRedo, updateUndoRedoStatus, handleJumpToLine, flashLine]
  )

  const lineCount = useMemo(() => code.split('\n').length, [code])
  const charCount = useMemo(() => code.length, [code])
  const selectedLinesCount = useMemo(
    () => (selectedText ? selectedText.split('\n').length : 0),
    [selectedText]
  )

  // Dokumentum szerkezeti fa kinyerése
  const outline = useMemo(() => extractOutline(code), [code])

  const dotClass = {
    idle: 'idle',
    compiling: 'compiling',
    ok: 'ok',
    error: 'error'
  }[compileStatus] || 'idle'

  const handleCopyCode = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }



  // Amikor a PDF felől érkezik Inverse SyncTeX ugrás
  useEffect(() => {
    if (activeLineToReveal && activeLineToReveal.line && editorRef.current) {
      editorRef.current.revealLineInCenter(activeLineToReveal.line)
      editorRef.current.setPosition({
        lineNumber: activeLineToReveal.line,
        column: activeLineToReveal.column || 1
      })
      editorRef.current.focus()
      flashLine(activeLineToReveal.line)
    }
  }, [activeLineToReveal, flashLine])

  // Fordítási hibák elemzése kattintható listához
  const parsedErrors = useMemo(() => parseLatexErrors(compileLog), [compileLog])

  // Fordítási hiba esetén automatikusan kinyitjuk a konzolt és a hibalistára váltunk
  useEffect(() => {
    const prevStatus = prevCompileStatusRef.current
    prevCompileStatusRef.current = compileStatus

    if (compileStatus === 'error') {
      setConsoleCollapsed(false)
      setConsoleViewTab('errors')
    } else if (compileStatus === 'ok' && prevStatus === 'error') {
      setConsoleCollapsed(true)
    }
  }, [compileStatus])

  // Konzol magasság átméretezése egérhúzással
  const handleConsoleResizeStart = useCallback(
    (e) => {
      e.preventDefault()
      e.stopPropagation()
      const startY = e.clientY
      const startHeight = consoleCollapsed ? 210 : consoleHeight
      if (consoleCollapsed) {
        setConsoleCollapsed(false)
      }
      setIsResizingConsole(true)

      let rafId = null

      const handlePointerMove = (moveEvent) => {
        // Felfelé húzás növeli a magasságot
        const deltaY = startY - moveEvent.clientY
        const newHeight = Math.max(80, Math.min(Math.round(window.innerHeight * 0.75), startHeight + deltaY))
        setConsoleHeight(newHeight)
        try {
          localStorage.setItem('latex_console_height', String(newHeight))
        } catch {}

        if (rafId) cancelAnimationFrame(rafId)
        rafId = requestAnimationFrame(() => {
          if (editorRef.current) {
            editorRef.current.layout()
          }
        })
      }

      const handlePointerUp = () => {
        setIsResizingConsole(false)
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', handlePointerUp)
        window.removeEventListener('pointercancel', handlePointerUp)
        if (rafId) cancelAnimationFrame(rafId)
        if (editorRef.current) {
          editorRef.current.layout()
        }
      }

      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', handlePointerUp)
      window.addEventListener('pointercancel', handlePointerUp)
    },
    [consoleCollapsed, consoleHeight]
  )

  // Ha a vázlat panel állapota, szélessége vagy a konzol mérete változik, újraszámoljuk a Monaco elrendezést
  useEffect(() => {
    const timer1 = setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.layout()
      }
    }, 50)
    const timer2 = setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.layout()
      }
    }, 220)
    return () => {
      clearTimeout(timer1)
      clearTimeout(timer2)
    }
  }, [isOutlineOpen, consoleCollapsed, outlineWidth, consoleHeight])

  // Fordítási hiba javítása AI-val
  const handleFixClick = async (e) => {
    if (e) e.stopPropagation()
    if (!onFixError || isFixingError) return
    setIsFixingError(true)
    try {
      await onFixError()
    } finally {
      setIsFixingError(false)
    }
  }

  // Monaco szerkesztő betöltése előtti konfigurálás (LaTeX nyelv + Overleaf témák regisztrációja)
  const handleEditorWillMount = (monaco) => {
    registerLatexLanguage(monaco)
  }

  // Monaco szerkesztő inicializálása
  const handleEditorDidMount = (editor, monaco) => {
    registerLatexLanguage(monaco)
    editorRef.current = editor
    monacoRef.current = monaco

    // Undo / Redo állapot folyamatos szinkronizálása
    editor.onDidChangeModelContent(() => {
      updateUndoRedoStatus()
    })
    updateUndoRedoStatus()

    // Kijelölés változásának figyelése
    editor.onDidChangeCursorSelection(() => {
      const selection = editor.getSelection()
      if (selection && !selection.isEmpty()) {
        const text = editor.getModel().getValueInRange(selection)
        if (text && text.trim().length > 0) {
          setSelectedText(text)
          setSelectionRange(selection)
          return
        }
      }
      setSelectedText('')
      setSelectionRange(null)
    })

    // Ctrl+Click vagy Cmd+Click a forráskódban: SyncTeX Forward Search közvetlenül a PDF-re!
    editor.onMouseDown((e) => {
      if ((e.event.ctrlKey || e.event.metaKey) && e.target?.position) {
        const pos = e.target.position
        if (onForwardSync) {
          onForwardSync(pos.lineNumber, pos.column)
        }
      }
    })

    // ⌘K (Mac) vagy Ctrl+K (Windows) billentyűparancs a kijelölt rész AI módosításához
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => {
      const selection = editor.getSelection()
      if (selection && !selection.isEmpty()) {
        const text = editor.getModel().getValueInRange(selection)
        if (text && text.trim().length > 0) {
          setSelectedText(text)
          setSelectionRange(selection)
          setIsAiPromptOpen(true)
        }
      }
    })

    // Alt+S gyorsbillentyű a kurzor pozíciójának SyncTeX kereséséhez
    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KeyS, () => {
      const pos = editor.getPosition()
      if (pos && onForwardSync) {
        onForwardSync(pos.lineNumber, pos.column)
      }
    })

    // Ctrl+A és Cmd+A: Teljes kód kijelölése a szerkesztőben (Macen és Windowson egyaránt)
    const selectAllCode = () => {
      const model = editor.getModel()
      if (model) {
        editor.setSelection(model.getFullModelRange())
        editor.focus()
      }
    }

    // 1. Közvetlen billentyűleütés lehallgatása Monaco szinten
    // (Macen felülbírálja az alapértelmezett Emacs kurzormozgatást / cursorLineStart viselkedést)
    editor.onKeyDown((e) => {
      const isKeyA =
        e.keyCode === monaco.KeyCode.KeyA ||
        e.code === 'KeyA' ||
        e.browserEvent?.key?.toLowerCase() === 'a'

      if (isKeyA && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        selectAllCode()
      }
    })

    // 2. Monaco parancsok regisztrálása (Ctrl+A és Cmd+A)
    editor.addCommand(monaco.KeyMod.WinCtrl | monaco.KeyCode.KeyA, selectAllCode)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyA, selectAllCode)

    // 3. Helyi menü (jobb klikk) parancs regisztrálása
    editor.addAction({
      id: 'select-all-latex-code',
      label: 'Összes kód kijelölése (Ctrl+A / ⌘A)',
      keybindings: [
        monaco.KeyMod.WinCtrl | monaco.KeyCode.KeyA,
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyA
      ],
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1.5,
      run: () => {
        selectAllCode()
      }
    })
  }

  // AI módosítás végrehajtása
  const handleExecuteTransform = async (customInstruction) => {
    const instr = customInstruction || inlineInstruction
    if (!instr.trim() || !selectedText) return

    setIsTransforming(true)
    try {
      if (onTransformSelection) {
        await onTransformSelection({
          selectedText,
          instruction: instr,
          range: selectionRange,
          editor: editorRef.current
        })
      }
      setIsAiPromptOpen(false)
      setInlineInstruction('')
    } catch (err) {
      console.error(err)
    } finally {
      setIsTransforming(false)
    }
  }

  // Vázlat (TOC) szélességének dinamikus egérrel / touch-csal történő átméretezése
  const handleOutlineResizeStart = useCallback((e) => {
    e.preventDefault()
    setIsResizingOutline(true)
    const startX = e.clientX
    const startWidth = outlineWidth

    let rafId = null

    const handlePointerMove = (moveEvent) => {
      const delta = moveEvent.clientX - startX
      const newWidth = Math.min(Math.max(180, startWidth + delta), 750)
      setOutlineWidth(newWidth)
      try {
        localStorage.setItem('latex_outline_width', String(newWidth))
      } catch {}

      if (rafId) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        if (editorRef.current) {
          editorRef.current.layout()
        }
      })
    }

    const handlePointerUp = () => {
      setIsResizingOutline(false)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
      if (rafId) cancelAnimationFrame(rafId)
      if (editorRef.current) {
        editorRef.current.layout()
      }
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
  }, [outlineWidth])

  // Dupla kattintásra visszaáll az alapértelmezett 280px szélesség
  const handleOutlineResetWidth = useCallback(() => {
    setOutlineWidth(280)
    try {
      localStorage.setItem('latex_outline_width', '280')
    } catch {}
    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.layout()
      }
    }, 50)
  }, [])

  const handleEditorDragOver = (e) => {
    if (e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
      e.preventDefault()
    }
  }

  const handleEditorDrop = (e) => {
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      e.preventDefault()
      onImportFiles?.(e.dataTransfer.files)
    }
  }

  return (
    <div
      className={`editor-pane ${isResizingOutline ? 'resizing-col' : ''}`}
      style={{ position: 'relative' }}
      onDragOver={handleEditorDragOver}
      onDrop={handleEditorDrop}
    >
      {/* Munkafelület: Vázlat Panel (TOC) + Fő Szerkesztő Oszlop */}
      <div className="editor-workspace-wrap">
        {isOutlineOpen && (
          <>
            <DocumentOutline
              outline={outline}
              width={outlineWidth}
              onJumpToLine={handleJumpToLine}
              onClose={() => setIsOutlineOpen(false)}
              onFixStructure={onFixStructure}
              isFixingStructure={isFixingStructure}
            />
            <div
              className={`outline-resizer-handle ${isResizingOutline ? 'dragging' : ''}`}
              onPointerDown={handleOutlineResizeStart}
              onDoubleClick={handleOutlineResetWidth}
              title="Húzd a vázlat szélességének módosításához (Dupla kattintás: alapméret 280px)"
            />
          </>
        )}

        <div className="editor-main-column">
          {/* Editor Header Tab Bar */}
          <div className="editor-tab-header">
            <div className="editor-header-left">
              <div className="column-header-title-wrap">
                <div className="column-header-icon-wrap" title="TEX szerkesztő">
                  <FileCode size={13} />
                </div>
                <span className="column-header-title">TEX szerkesztő</span>
                <span className="column-header-title-short">TEX</span>
              </div>

              <div className="editor-header-title-divider" />

              {/* Fájl fül vagy Átnevezés űrlap */}
              {isEditingName ? (
                <div className="editor-file-tab editing">
                  <FileCode size={13} style={{ flexShrink: 0 }} />
                  <form
                    className="editor-file-tab-rename-form"
                    onSubmit={(e) => {
                      e.preventDefault()
                      handleCommitRename()
                    }}
                  >
                    <input
                      ref={renameInputRef}
                      type="text"
                      className="editor-file-tab-input"
                      value={editNameValue}
                      onChange={(e) => setEditNameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          e.stopPropagation()
                          handleCancelRename()
                        }
                      }}
                      placeholder="Dokumentum neve"
                      autoFocus
                    />
                    <span className="editor-file-tab-ext">.tex</span>
                    <button
                      type="submit"
                      className="editor-file-tab-action-btn confirm"
                      title="Átnevezés jóváhagyása (Enter)"
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      <Check size={12} />
                    </button>
                    <button
                      type="button"
                      className="editor-file-tab-action-btn cancel"
                      onClick={handleCancelRename}
                      title="Mégse (Esc)"
                    >
                      <X size={12} />
                    </button>
                  </form>
                  {autoSaveEnabled ? (
                    <div
                      className={`editor-autosave-indicator ${autoSaveStatus} ${isModified ? 'pending' : ''}`}
                      title={
                        autoSaveStatus === 'saving'
                          ? 'Automatikus mentés folyamatban...'
                          : autoSaveStatus === 'saved' && !isModified
                          ? `Automatikusan mentve (${lastSavedTime || 'most'})`
                          : autoSaveStatus === 'error'
                          ? 'Mentési hiba történt'
                          : isModified
                          ? 'Módosítva (automatikus mentés hamarosan)'
                          : 'Minden változtatás mentve'
                      }
                    >
                      {autoSaveStatus === 'saving' ? (
                        <>
                          <RefreshCw size={10} className="spinner" />
                          <span className="autosave-label">Mentés...</span>
                        </>
                      ) : autoSaveStatus === 'saved' && !isModified ? (
                        <>
                          <Check size={10} color="#30d158" />
                          <span className="autosave-label">Mentve</span>
                        </>
                      ) : isModified ? (
                        <div className="modified-dot" title="Nem mentett változtatások (auto-mentés hamarosan)" />
                      ) : null}
                    </div>
                  ) : (
                    isModified && <div className="modified-dot" title="Nem mentett változtatások" />
                  )}
                </div>
              ) : (
                <div
                  className="editor-file-tab"
                  title="Kattints a ceruza ikonra vagy kattints duplán a névre a dokumentum átnevezéséhez"
                >
                  <FileCode size={13} style={{ flexShrink: 0 }} />
                  <span
                    className="editor-file-tab-name"
                    onDoubleClick={handleStartRename}
                    title="Dupla kattintás az átnevezéshez"
                  >
                    {currentFile ? currentFile.name : 'Névtelen.tex'}
                  </span>
                  <button
                    type="button"
                    className="editor-file-tab-rename-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleStartRename()
                    }}
                    title="Dokumentum átnevezése"
                  >
                    <Pencil size={11} />
                  </button>
                  {autoSaveEnabled ? (
                    <div
                      className={`editor-autosave-indicator ${autoSaveStatus} ${isModified ? 'pending' : ''}`}
                      title={
                        autoSaveStatus === 'saving'
                          ? 'Automatikus mentés folyamatban...'
                          : autoSaveStatus === 'saved' && !isModified
                          ? `Automatikusan mentve (${lastSavedTime || 'most'})`
                          : autoSaveStatus === 'error'
                          ? 'Mentési hiba történt'
                          : isModified
                          ? 'Módosítva (automatikus mentés hamarosan)'
                          : 'Minden változtatás mentve'
                      }
                    >
                      {autoSaveStatus === 'saving' ? (
                        <>
                          <RefreshCw size={10} className="spinner" />
                          <span className="autosave-label">Mentés...</span>
                        </>
                      ) : autoSaveStatus === 'saved' && !isModified ? (
                        <>
                          <Check size={10} color="#30d158" />
                          <span className="autosave-label">Mentve</span>
                        </>
                      ) : isModified ? (
                        <div className="modified-dot" title="Nem mentett változtatások (auto-mentés hamarosan)" />
                      ) : null}
                    </div>
                  ) : (
                    isModified && <div className="modified-dot" title="Nem mentett változtatások" />
                  )}
                </div>
              )}

              {/* Visszavonás és Újra gombok a lap fejlécében (kompakt csoport, mint a PDF nézetben) */}
              <div className="editor-header-group" title="Módosítások visszavonása és megismétlése">
                <button
                  type="button"
                  className="editor-group-btn"
                  onClick={handleUndo}
                  disabled={!canUndo}
                  title="Visszavonás (⌘Z vagy Ctrl+Z)"
                >
                  <Undo2 size={13} />
                </button>
                <button
                  type="button"
                  className="editor-group-btn"
                  onClick={handleRedo}
                  disabled={!canRedo}
                  title="Újra (⌘⇧Z vagy Ctrl+Y)"
                >
                  <Redo2 size={13} />
                </button>
              </div>

              {/* Vázlat (Outline) kapcsoló gomb */}
              <button
                type="button"
                className={`editor-header-btn editor-outline-btn ${isOutlineOpen ? 'active' : ''}`}
                onClick={() => setIsOutlineOpen((v) => !v)}
                title="Dokumentum Szerkezeti Fa (TOC) megjelenítése / elrejtése"
              >
                <ListTree size={13} />
                <span className="editor-btn-label">Vázlat</span>
                <span className="editor-header-badge">{outline.length}</span>
              </button>

              {/* SyncTeX Forward gomb */}
              <button
                type="button"
                className="editor-header-btn editor-synctex-btn"
                onClick={() => {
                  const pos = editorRef.current?.getPosition()
                  if (pos && onForwardSync) onForwardSync(pos.lineNumber, pos.column)
                }}
                title="Ugrás a PDF-re ennél a sornál (SyncTeX Forward) [Ctrl+Kattintás vagy Alt+S]"
              >
                <Navigation size={13} />
                <span className="editor-btn-label">Ugrás a PDF-re</span>
              </button>

              {/* Kijelölés AI gomb a fejlécben */}
              {selectedText && (
                <button
                  type="button"
                  className="editor-header-btn editor-header-ai-btn"
                  onClick={() => setIsAiPromptOpen(true)}
                  title="Kijelölt kódrészlet átdolgozása paranccsal (⌘K)"
                >
                  <Sparkles size={13} />
                  <span className="editor-btn-label">Kijelölés ({selectedLinesCount} sor)</span>
                  <span className="editor-btn-label-short">{selectedLinesCount} sor</span>
                  <span className="editor-header-kbd">⌘K</span>
                </button>
              )}
            </div>

            <div className="editor-header-actions">
              {/* Overleaf Téma Váltó (Sötét / Világos) */}
              <button
                type="button"
                className="editor-header-btn"
                onClick={handleToggleTheme}
                title={editorTheme === 'overleaf-dark' ? 'Váltás világos Overleaf témára' : 'Váltás sötét Overleaf témára'}
              >
                {editorTheme === 'overleaf-dark' ? (
                  <Sun size={13} color="#fbbf24" />
                ) : (
                  <Moon size={13} color="#0a84ff" />
                )}
              </button>

              <button
                type="button"
                className="editor-header-btn"
                onClick={handleCopyCode}
                title="Teljes kód másolása a vágólapra"
              >
                {copied ? <Check size={13} color="var(--success)" /> : <Copy size={13} />}
                <span className="editor-btn-label">{copied ? 'Másolva' : 'Másolás'}</span>
              </button>
            </div>
          </div>

          <div className="monaco-wrapper">
            <Editor
              height="100%"
              language="latex"
              value={code}
              onChange={onChange}
              beforeMount={handleEditorWillMount}
              onMount={handleEditorDidMount}
              theme={editorTheme}
              options={{
                fontSize: 13,
                fontFamily: "'SF Mono', SFMono-Regular, 'JetBrains Mono', Menlo, Monaco, monospace",
                fontLigatures: false,
                lineHeight: 21,
                minimap: { enabled: false },
                automaticLayout: true,
                wordWrap: 'on',
                scrollBeyondLastLine: false,
                renderLineHighlight: 'line',
                roundedSelection: true,
                overviewRulerBorder: false,
                hideCursorInOverviewRuler: true,
                scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
                guides: { indentation: false },
                bracketPairColorization: { enabled: true },
                folding: true,
                padding: { top: 16, bottom: 16 },
                smoothScrolling: true,
                cursorBlinking: 'smooth',
                cursorSmoothCaretAnimation: 'on',
                tabSize: 2,
                autoClosingBrackets: 'always',
                autoClosingQuotes: 'always',
                autoSurround: 'quotesAndBrackets'
              }}
            />
          </div>

          {/* Console Log Panel */}
          <div
            className={`console-panel ${consoleCollapsed ? 'collapsed' : ''} ${isResizingConsole ? 'resizing' : ''}`}
            style={{ height: consoleCollapsed ? 34 : consoleHeight }}
          >
            {/* Resize handle bar at the top */}
            <div
              className="console-resize-handle"
              onPointerDown={handleConsoleResizeStart}
              title="Húzd a konzol magasságának állításához"
            >
              <div className="console-resize-handle-bar" />
            </div>

            <div className="console-header" onClick={() => setConsoleCollapsed((v) => !v)}>
              <div className={`console-status-dot ${dotClass}`} />
              <Terminal size={13} />
              <span className="console-header-title">Fordítási Konzol</span>

              {compileStatus === 'ok' && (
                <span className="console-header-status-pill ok">✓ Sikeres fordítás</span>
              )}
              {compileStatus === 'compiling' && (
                <span className="console-header-status-pill compiling">⏳ Fordítás...</span>
              )}
              {compileStatus === 'error' && (
                <span className="console-header-status-pill error">✗ Fordítási hiba</span>
              )}

              {/* View mode switcher tabs (Hibák vs Nyers napló) */}
              {!consoleCollapsed && parsedErrors.length > 0 && (
                <div className="console-view-tabs" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className={`console-view-tab ${consoleViewTab === 'errors' ? 'active' : ''}`}
                    onClick={() => setConsoleViewTab('errors')}
                    title="Hibák listanézete gyorsugrással"
                  >
                    <List size={11} />
                    <span>Hibák ({parsedErrors.length})</span>
                  </button>
                  <button
                    type="button"
                    className={`console-view-tab ${consoleViewTab === 'raw' ? 'active' : ''}`}
                    onClick={() => setConsoleViewTab('raw')}
                    title="pdflatex nyers kimenete"
                  >
                    <Code2 size={11} />
                    <span>Nyers napló</span>
                  </button>
                </div>
              )}

              {/* Hiba javítása AI-val gomb a konzol fejlécében */}
              {compileStatus === 'error' && onFixError && (
                <button
                  className="btn btn-primary console-fix-header-btn"
                  onClick={handleFixClick}
                  disabled={isFixingError}
                  title="Fordítási hibák automatikus elemzése és javítása a Gemini 3.8 Flash-sel"
                >
                  {isFixingError ? (
                    <>
                      <Loader2 size={12} className="spinner" />
                      <span>Javítás...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={12} />
                      <span>Hiba javítása AI-val</span>
                    </>
                  )}
                </button>
              )}

              <div className="console-actions" onClick={(e) => e.stopPropagation()}>
                {onClearLog && (
                  <button
                    type="button"
                    className="btn-subtle console-action-btn"
                    onClick={onClearLog}
                    title="Konzol törlése"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
                <button
                  type="button"
                  className="btn-subtle console-action-btn"
                  onClick={() => setConsoleCollapsed((v) => !v)}
                  title={consoleCollapsed ? 'Konzol megnyitása' : 'Konzol összecsukása'}
                >
                  {consoleCollapsed ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
              </div>
            </div>

            {!consoleCollapsed && (
              <div className="console-body">
                {/* Kiemelt hiba banner a konzol tetején */}
                {compileStatus === 'error' && onFixError && (
                  <div className="console-error-banner">
                    <div className="console-error-banner-left">
                      <AlertTriangle size={15} color="#ef4444" />
                      <div className="console-error-banner-text">
                        <span className="console-error-banner-title">pdflatex fordítási hiba történt</span>
                        <span className="console-error-banner-sub">
                          {parsedErrors.length > 0
                            ? `Kattints az alábbi hibákra a kódban való javításhoz, vagy kérd a Gemini segítségét!`
                            : 'A Gemini 3.8 Flash kielemezte a hibát és kész kijavítani a LaTeX kódot.'}
                        </span>
                      </div>
                    </div>
                    <button
                      className="btn btn-primary console-error-action-btn"
                      onClick={handleFixClick}
                      disabled={isFixingError}
                    >
                      {isFixingError ? (
                        <>
                          <Loader2 size={13} className="spinner" />
                          <span>Gemini javítja a LaTeX kódot...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={13} />
                          <span>Hiba automatikus javítása AI-val</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* 1. Kattintható strukturált hibalista */}
                {consoleViewTab === 'errors' && parsedErrors.length > 0 ? (
                  <div className="console-structured-errors">
                    {parsedErrors.map((err, idx) => (
                      <div
                        key={err.id || idx}
                        className={`console-error-card ${err.line ? 'clickable' : ''}`}
                        onClick={() => {
                          if (err.line) handleJumpToLine(err.line)
                        }}
                        title={err.line ? `Kattints a ${err.line}. sorra ugráshoz a szerkesztőben` : ''}
                      >
                        <div className="console-error-card-badge-col">
                          {err.line ? (
                            <span className="console-error-line-pill">
                              {err.line}. sor
                            </span>
                          ) : (
                            <span className="console-error-line-pill general">Hiba</span>
                          )}
                        </div>

                        <div className="console-error-card-main">
                          <div className="console-error-card-title-row">
                            <span className="console-error-msg">{err.message}</span>
                            {err.line && (
                              <span className="console-error-jump-link">
                                Ugrás a sorra <ArrowRight size={11} />
                              </span>
                            )}
                          </div>

                          {err.hint && <div className="console-error-hint">{err.hint}</div>}

                          {err.snippet && (
                            <code className="console-error-code-snippet">{err.snippet}</code>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : compileLog ? (
                  compileLog.split('\n').map((line, i) => {
                    const isErr = line.startsWith('!') || line.toLowerCase().includes('error')
                    const isOk =
                      line.startsWith('✓') || line.startsWith('✅') || line.includes('Sikeres')
                    const isWarn = line.startsWith('⚠') || line.toLowerCase().includes('warning')
                    const cls = isErr ? 'err' : isOk ? 'ok' : isWarn ? 'warn' : ''

                    return (
                      <div key={i} className={cls}>
                        {line}
                      </div>
                    )
                  })
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>
                    Várakozás a fordításra... (Nyomj ⌘S gombot a fordításhoz)
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lebegő AI Pill kijelölés esetén */}
      {selectedText && !isAiPromptOpen && (
        <div
          className="floating-selection-pill"
          onClick={() => setIsAiPromptOpen(true)}
          title="Kijelölt rész módosítása AI paranccsal (⌘K)"
        >
          <Sparkles size={14} />
          <span>Kijelölt rész módosítása</span>
          <span className="kbd-badge">⌘K</span>
        </div>
      )}

      {/* Lebegő AI Parancssor Dialógus (Inline AI Box) */}
      {isAiPromptOpen && (
        <div className="inline-ai-overlay" onClick={() => !isTransforming && setIsAiPromptOpen(false)}>
          <div className="inline-ai-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="inline-ai-dialog-header">
              <div className="inline-ai-dialog-title">
                <Wand2 size={16} color="var(--accent)" />
                <span>Kijelölt rész módosítása paranccsal</span>
                <span className="sidebar-count-badge">{selectedLinesCount} sor</span>
              </div>
              <button
                className="btn-subtle"
                onClick={() => setIsAiPromptOpen(false)}
                disabled={isTransforming}
              >
                <X size={15} />
              </button>
            </div>

            {/* Kijelölt szöveg rövid előnézete */}
            <div className="inline-ai-snippet-preview">
              {selectedText.slice(0, 300)}
              {selectedText.length > 300 && '...'}
            </div>

            {/* Gyors parancs javaslatok (Chips) */}
            <div className="inline-ai-chips">
              {QUICK_INLINE_CHIPS.map((chip, idx) => (
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

            {/* Parancsbeviteli mező */}
            <div className="inline-ai-input-wrap">
              <textarea
                ref={inlineTextareaRef}
                className="inline-ai-input"
                value={inlineInstruction}
                onChange={(e) => setInlineInstruction(e.target.value)}
                placeholder="Írd be a parancsot... (pl. tedd tcolorbox-ba és javítsd a képleteket)"
                autoFocus
                rows={2}
                disabled={isTransforming}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleExecuteTransform()
                  } else if (e.key === 'Escape') {
                    setIsAiPromptOpen(false)
                  }
                }}
              />
              <div className="inline-ai-input-hint">
                <span>↵ Enter: Küldés • Shift+Enter: Új sor</span>
              </div>
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
                onClick={() => handleExecuteTransform()}
                disabled={!inlineInstruction.trim() || isTransforming}
              >
                {isTransforming ? (
                  <>
                    <Loader2 size={14} className="spinner" />
                    Gemini 3.8 Flash dolgozik...
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
          </div>
        </div>
      )}
    </div>
  )
})

export default EditorPane
