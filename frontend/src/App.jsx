import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import axios from 'axios'
import Split from 'react-split'
import Toolbar from './components/Toolbar'
import Sidebar from './components/Sidebar'
import EditorPane from './components/EditorPane'
import PdfPreview from './components/PdfPreview'
import AiPanel from './components/AiPanel'
import Notifications from './components/Notifications'
import PreambleModal from './components/PreambleModal'
import ImportDocModal from './components/ImportDocModal'
import TagModal from './components/TagModal'
import StructureFixModal from './components/StructureFixModal'
import SettingsModal from './components/SettingsModal'
import { TEMPLATES, EMPTY_DOCUMENT_CONTENT } from './utils/templates'
import { detectDocumentMeta } from './utils/documentDetector'
import { findSmartReplacement, cleanSnippet } from './utils/snippetMatcher'
import { apiKeyManager } from './utils/apiKeyManager'
import { localWorkspace } from './utils/localWorkspaceManager'
import {
  FileText,
  Save,
  Plus,
  X,
  FileCode,
  CheckCircle2,
  AlertTriangle,
  Cpu,
  Sigma,
  Atom,
  LayoutTemplate,
  Upload,
  Folder,
  Loader2,
  Sparkles
} from 'lucide-react'

const MOBILE_COLUMNS = [
  { id: 'files', label: 'Fájlok', icon: Folder },
  { id: 'ai', label: 'AI Asszisztens', icon: Sparkles },
  { id: 'editor', label: 'Szerkesztő', icon: FileCode },
  { id: 'pdf', label: 'PDF előnézet', icon: FileText }
]

export default function App() {
  const [code, setCode] = useState(TEMPLATES[0].content)
  const codeRef = useRef(code)
  codeRef.current = code
  const isCompilingRef = useRef(false)
  const pendingCompileContentRef = useRef(null)
  const [pdfData, setPdfData] = useState(null)
  const [compileStatus, setCompileStatus] = useState('idle') // idle | compiling | ok | error
  const [lastCompileInfo, setLastCompileInfo] = useState({ time: null, duration: null })
  const [compileLog, setCompileLog] = useState('')
  const [isModified, setIsModified] = useState(false)
  const [currentFile, setCurrentFile] = useState(null) // { name, path, subject }
  const currentFileRef = useRef(currentFile)
  currentFileRef.current = currentFile

  const [currentSubject, setCurrentSubject] = useState('Matematika')
  const currentSubjectRef = useRef(currentSubject)
  currentSubjectRef.current = currentSubject
  const [aiPanelOpen, setAiPanelOpen] = useState(true)
  const [apiOk, setApiOk] = useState(null)
  const [hasCustomKey, setHasCustomKey] = useState(() => apiKeyManager.hasCustomKey())
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  const [activeModel, setActiveModel] = useState('gemini-3.5-flash')
  const [notifications, setNotifications] = useState([])
  const [projectTree, setProjectTree] = useState({})
  const [availableFolders, setAvailableFolders] = useState([])
  const [localDirHandle, setLocalDirHandle] = useState(null)
  const [pendingPermissionHandle, setPendingPermissionHandle] = useState(null)
  const localDirHandleRef = useRef(null)
  const [serverWorkspace, setServerWorkspace] = useState(null)

  const categories = useMemo(() => {
    return Object.keys(projectTree).filter(k => k !== '_root')
  }, [projectTree])
  const [newDocModal, setNewDocModal] = useState(false)
  const [preambles, setPreambles] = useState([])
  const [preambleModalOpen, setPreambleModalOpen] = useState(false)
  const [syncTarget, setSyncTarget] = useState(null)
  const [activeLineToReveal, setActiveLineToReveal] = useState(null)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [pendingImportFiles, setPendingImportFiles] = useState([])
  const [tagModalFile, setTagModalFile] = useState(null)
  const [isFixingStructure, setIsFixingStructure] = useState(false)
  const [structureFixResult, setStructureFixResult] = useState(null)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar_collapsed') === 'true'
    } catch {
      return false
    }
  })
  // Automatikus mentés állapota - ALAPÉRTELMEZETTEN BEKAPCSOLVA (true)
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem('latex_autosave')
      return saved !== null ? saved === 'true' : true
    } catch {
      return true
    }
  })
  const [autoSaveStatus, setAutoSaveStatus] = useState('idle') // idle | saving | saved | error
  const [lastSavedTime, setLastSavedTime] = useState(null)
  const autoSaveTimerRef = useRef(null)

  const toggleAutoSave = useCallback(() => {
    setAutoSaveEnabled(prev => {
      const next = !prev
      try {
        localStorage.setItem('latex_autosave', String(next))
      } catch {}
      return next
    })
  }, [])
  const fileInputRef = useRef(null)
  const editorPaneRef = useRef(null)
  const savedCodeRef = useRef(code)

  // Mobilos 4 oszlopos nézet kezelése ('files' | 'ai' | 'editor' | 'pdf')
  const [mobileActiveTab, setMobileActiveTab] = useState(() => {
    try {
      const saved = localStorage.getItem('latex_mobile_active_tab')
      if (['files', 'ai', 'editor', 'pdf'].includes(saved)) return saved
    } catch {}
    return 'editor'
  })

  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth <= 768
  })

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768)
    }
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const handleMobileTabSelect = useCallback((tabId) => {
    setMobileActiveTab(tabId)
    try {
      localStorage.setItem('latex_mobile_active_tab', tabId)
    } catch {}
    if (tabId === 'editor') {
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'))
        editorPaneRef.current?.layout?.()
      }, 50)
      setTimeout(() => {
        editorPaneRef.current?.layout?.()
      }, 200)
    } else if (tabId === 'pdf') {
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'))
      }, 50)
    }
  }, [])

  const toggleSidebarCollapse = useCallback(() => {
    setSidebarCollapsed(prev => {
      const next = !prev
      try {
        localStorage.setItem('sidebar_collapsed', String(next))
      } catch {}
      return next
    })
  }, [])

  const handleUndoRedoChange = useCallback(({ canUndo, canRedo }) => {
    setCanUndo(canUndo)
    setCanRedo(canRedo)
  }, [])

  const handleUndo = useCallback(() => {
    editorPaneRef.current?.undo()
  }, [])

  const handleRedo = useCallback(() => {
    editorPaneRef.current?.redo()
  }, [])

  // Visszavonható vagy tiszta kódfrissítés a Monaco szerkesztőben
  const applyEditorCode = useCallback((newCode, preserveUndo = true) => {
    if (editorPaneRef.current?.applyCodeUpdate) {
      editorPaneRef.current.applyCodeUpdate(newCode, preserveUndo)
    } else {
      setCode(newCode)
      setIsModified(newCode !== savedCodeRef.current)
    }
  }, [])

  // Aktív dokumentum megjegyzése a böngésző tárolójában az oldalfrissítéshez
  const rememberActiveFile = useCallback((file) => {
    if (!file) {
      try {
        localStorage.removeItem('latex_last_active_file')
      } catch {}
      return
    }
    try {
      localStorage.setItem('latex_last_active_file', JSON.stringify({
        name: file.name,
        path: file.path || null,
        subject: file.subject || currentSubjectRef.current || 'Matematika',
        tags: file.tags || []
      }))
    } catch {}
  }, [])

  const checkHealth = useCallback(async () => {
    try {
      const r = await axios.get('/api/health')
      const hasKey = apiKeyManager.hasCustomKey()
      setApiOk(hasKey)
      setHasCustomKey(hasKey)
      if (r.data.model) setActiveModel(r.data.model)
    } catch {
      const hasKey = apiKeyManager.hasCustomKey()
      setApiOk(hasKey)
      setHasCustomKey(hasKey)
    }
  }, [])

  const loadProjects = useCallback(async (activeHandle = localDirHandleRef.current) => {
    if (activeHandle) {
      try {
        const { tree, availableFolders } = await localWorkspace.getProjectTree(activeHandle)
        setProjectTree(tree)
        setAvailableFolders(availableFolders)
        const cats = Object.keys(tree).filter(k => k !== '_root')
        if (cats.length > 0) {
          setCurrentSubject(prev => (cats.includes(prev) ? prev : cats[0]))
        }
        return
      } catch (err) {
        console.warn('Hiba a helyi mappa beolvasásakor:', err)
      }
    }

    try {
      const r = await axios.get('/api/files/projects')
      const tree = r.data.tree || {}
      setProjectTree(tree)
      if (Array.isArray(r.data.availableFolders)) {
        setAvailableFolders(r.data.availableFolders)
      }
      if (r.data.workspacePath) {
        const parts = r.data.workspacePath.split(/[\/\\]/).filter(Boolean)
        const name = parts[parts.length - 1] || 'projektek'
        setServerWorkspace({ path: r.data.workspacePath, name })
      }
      const cats = Object.keys(tree).filter(k => k !== '_root')
      if (cats.length > 0) {
        setCurrentSubject(prev => (cats.includes(prev) ? prev : cats[0]))
      }
    } catch (err) {
      console.warn('Projektek betöltési hiba:', err)
    }
  }, [])

  const loadPreambles = useCallback(async () => {
    try {
      const res = await axios.get('/api/preambles')
      if (res.data?.preambles && Array.isArray(res.data.preambles)) {
        setPreambles(res.data.preambles)
      }
    } catch (err) {
      console.warn('Preambulumok betöltési hiba:', err)
    }
  }, [])

  // Rendszer állapot betöltése és a legutóbb megnyitott / lefordított fájl helyreállítása
  useEffect(() => {
    const initApp = async () => {
      checkHealth()
      loadPreambles()

      let activeHandle = null

      // 1. Helyi munkakönyvtár ellenőrzése (Saját gép mappa)
      try {
        const saved = await localWorkspace.getSavedDirectory()
        if (saved) {
          const handle = saved.handle || saved
          if (saved.needsPermission) {
            setPendingPermissionHandle(handle)
          } else {
            setLocalDirHandle(handle)
            localDirHandleRef.current = handle
            activeHandle = handle
            await loadProjects(handle)
          }
        }
      } catch (e) {
        console.warn('Helyi munkakönyvtár inicializálása sikertelen:', e)
      }

      if (!activeHandle) {
        await loadProjects(null)
      }

      // 2. Legutóbb megnyitott / lefordított dokumentum és PDF visszaállítása
      try {
        let lastFile = null
        try {
          const raw = localStorage.getItem('latex_last_active_file')
          if (raw) lastFile = JSON.parse(raw)
        } catch {}

        // Lekérdezzük a szerverről a legutóbb sikeresen lefordított PDF-et és metaadatait
        let activeCompile = null
        try {
          const activeRes = await axios.get('/api/compile/active')
          if (activeRes.data?.hasActive) {
            activeCompile = activeRes.data
          }
        } catch {}

        // Ha a localStorage-ban nem volt fájl, de van aktív fordítás a szerveren
        if (!lastFile && activeCompile?.meta?.filePath) {
          lastFile = {
            name: activeCompile.meta.fileName || 'Dokumentum.tex',
            path: activeCompile.meta.filePath,
            subject: activeCompile.meta.subject || 'Matematika'
          }
        }

        if (lastFile?.path) {
          let loadedContent = null

          // Helyi munkakönyvtárból olvasás
          if (activeHandle) {
            try {
              loadedContent = await localWorkspace.readFileContent(activeHandle, lastFile.path)
            } catch (err) {
              console.warn('[Restore] Helyi fájl olvasási hiba:', err)
            }
          }

          // Szerver mappából olvasás
          if (loadedContent === null) {
            try {
              const fileRes = await axios.post('/api/files/load', { filePath: lastFile.path })
              if (fileRes.data?.content !== undefined) {
                loadedContent = fileRes.data.content
                if (fileRes.data.tags) {
                  lastFile.tags = fileRes.data.tags
                }
              }
            } catch (err) {
              console.warn('[Restore] Szerver fájl olvasási hiba:', err)
            }
          }

          if (loadedContent !== null) {
            applyEditorCode(loadedContent, false)
            savedCodeRef.current = loadedContent
            setCurrentFile(lastFile)
            if (lastFile.subject) {
              setCurrentSubject(lastFile.subject)
            }
            setIsModified(false)

            // Ha van lefordított PDF a szerveren, ami ehhez a fájlhoz tartozik
            if (activeCompile?.pdf) {
              const isMatch = !activeCompile.meta?.filePath || activeCompile.meta.filePath === lastFile.path
              if (isMatch) {
                setPdfData(activeCompile.pdf)
                setCompileStatus('ok')
                setCompileLog('✓ Előző sikeres fordítás betöltve.')
              }
            }
            return
          }
        }

        // Ha névtelen szerkesztett vázlat volt fordítva (nincs még lemezes elérési útja)
        if (activeCompile?.content && activeCompile?.pdf) {
          applyEditorCode(activeCompile.content, false)
          savedCodeRef.current = activeCompile.content
          setPdfData(activeCompile.pdf)
          setCompileStatus('ok')
          setCompileLog('✓ Előző sikeres fordítás betöltve.')
          if (activeCompile.meta) {
            const restoredFile = {
              name: activeCompile.meta.fileName || 'Dokumentum.tex',
              path: activeCompile.meta.filePath || null,
              subject: activeCompile.meta.subject || 'Matematika'
            }
            setCurrentFile(restoredFile)
            if (activeCompile.meta.subject) {
              setCurrentSubject(activeCompile.meta.subject)
            }
          }
          setIsModified(false)
        }
      } catch (err) {
        console.warn('Nem sikerült visszaállítani a legutóbbi fájlt:', err)
      }
    }

    initApp()
  }, [checkHealth, loadProjects, loadPreambles, applyEditorCode])

  const addNotif = useCallback((message, type = 'info', action = null) => {
    const id = Date.now()
    setNotifications(n => [...n, { id, message, type, action }])
    const timeoutDuration = action ? 7000 : 4000
    setTimeout(() => setNotifications(n => n.filter(x => x.id !== id)), timeoutDuration)
  }, [])

  // Helyi mappa engedélyezése 1 kattintással (újratöltés után)
  const handleGrantPermission = useCallback(async () => {
    if (!pendingPermissionHandle) return
    try {
      const granted = await localWorkspace.requestPermission(pendingPermissionHandle)
      if (granted) {
        const handle = pendingPermissionHandle
        setLocalDirHandle(handle)
        localDirHandleRef.current = handle
        setPendingPermissionHandle(null)
        await loadProjects(handle)
        addNotif(`Munkakönyvtár csatlakoztatva: ${handle.name}`, 'success')

        // Ha a legutóbbi fájl még nincs betöltve, betöltjük a helyi mappából
        try {
          const raw = localStorage.getItem('latex_last_active_file')
          if (raw) {
            const lastFile = JSON.parse(raw)
            if (lastFile?.path) {
              const content = await localWorkspace.readFileContent(handle, lastFile.path)
              if (content !== null) {
                applyEditorCode(content, false)
                savedCodeRef.current = content
                setCurrentFile(lastFile)
                if (lastFile.subject) setCurrentSubject(lastFile.subject)
                setIsModified(false)
              }
            }
          }
        } catch (e) {}
      } else {
        addNotif('A mappa hozzáférését nem hagytad jóvá.', 'warning')
      }
    } catch (err) {
      console.warn('Hiba a jogosultság kérésekor:', err)
      addNotif('Nem sikerült hozzáférni a helyi mappához.', 'error')
    }
  }, [pendingPermissionHandle, loadProjects, addNotif, applyEditorCode])

  // Helyi mappa tallózása 1 kattintással a Sidebarból
  const handlePickLocalFolder = useCallback(async () => {
    if (!localWorkspace.isSupported()) {
      setSettingsModalOpen(true)
      return
    }
    try {
      const handle = await localWorkspace.selectDirectory()
      if (handle) {
        setLocalDirHandle(handle)
        localDirHandleRef.current = handle
        setPendingPermissionHandle(null)
        await loadProjects(handle)
        addNotif(`Munkakönyvtár csatlakoztatva: ${handle.name}`, 'success')
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('Hiba a mappa kiválasztásakor:', err)
        addNotif('Nem sikerült kiválasztani a mappát.', 'error')
      }
    }
  }, [loadProjects, addNotif])

  // Helyi mappa leválasztása
  const handleDisconnectLocalFolder = useCallback(async () => {
    await localWorkspace.disconnectDirectory()
    setLocalDirHandle(null)
    localDirHandleRef.current = null
    setPendingPermissionHandle(null)
    await loadProjects(null)
    addNotif('Helyi mappa leválasztva, visszaállítva a szerver mappára.', 'info')
  }, [loadProjects, addNotif])

  // PDF Fordítás végrehajtása
  const compile = useCallback(
    async (contentToCompile) => {
      const content = typeof contentToCompile === 'string' ? contentToCompile : (codeRef.current || code)

      // Ha már folyamatban van egy fordítás, elmentjük a legfrissebb állapotot a várakozási sorba
      if (isCompilingRef.current) {
        pendingCompileContentRef.current = content
        return
      }

      isCompilingRef.current = true
      const activeFile = currentFileRef.current
      const activeSubject = currentSubjectRef.current

      const t0 = performance.now()
      setCompileStatus('compiling')
      setCompileLog('⏳ pdflatex (TeX Live) fordítás indítása...')
      try {
        const r = await axios.post('/api/compile', {
          content,
          filePath: activeFile?.path || null,
          fileName: activeFile?.name || null,
          subject: activeFile?.subject || activeSubject || null
        })
        const durationSec = Math.max(0.1, (performance.now() - t0) / 1000).toFixed(1)
        const timeStr = new Date().toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })
        setLastCompileInfo({ time: timeStr, duration: `${durationSec}s` })
        setPdfData(r.data.pdf)
        setCompileStatus('ok')
        setCompileLog(
          r.data.warnings
            ? `✓ Sikeres fordítás figyelmeztetésekkel:\n${r.data.warnings}`
            : '✓ Sikeres fordítás hiba és figyelmeztetés nélkül.'
        )

        // Megjegyezzük az utoljára lefordított fájlt
        if (activeFile) {
          rememberActiveFile(activeFile)
        } else {
          const detected = detectDocumentMeta(content, activeSubject)
          rememberActiveFile({
            name: detected.filename || 'Dokumentum.tex',
            path: null,
            subject: detected.subject || activeSubject || 'Matematika'
          })
        }

        // Ha a fordító automatikusan kiegészítette a preambulumot a hiányzó megjelenítési csomagokkal
        if (r.data.supplementedContent && r.data.supplementedContent !== content) {
          applyEditorCode(r.data.supplementedContent, true)
          savedCodeRef.current = r.data.supplementedContent
          setIsModified(true)
          addNotif('A preambulum automatikusan kiegészült a megjelenítéshez szükséges csomagokkal!', 'info')
        } else {
          addNotif('PDF sikeresen lefordítva!', 'success')
        }
      } catch (err) {
        const durationSec = Math.max(0.1, (performance.now() - t0) / 1000).toFixed(1)
        const timeStr = new Date().toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })
        setLastCompileInfo({ time: timeStr, duration: `${durationSec}s` })
        const log = err.response?.data?.log || err.response?.data?.error || err.message
        setCompileStatus('error')
        setCompileLog(log)
        addNotif('Fordítási hiba történt! Részletek a hibanaplóban.', 'error')
      } finally {
        isCompilingRef.current = false
        if (pendingCompileContentRef.current !== null) {
          const next = pendingCompileContentRef.current
          pendingCompileContentRef.current = null
          setTimeout(() => {
            compile(next)
          }, 60)
        }
      }
    },
    [code, addNotif, applyEditorCode, rememberActiveFile]
  )

  const handleCodeChange = useCallback((val) => {
    setCode(val)
    codeRef.current = val
    const modified = val !== savedCodeRef.current
    setIsModified(modified)
    if (modified) {
      setAutoSaveStatus('idle')
    }
  }, [])

  // Mentés visszavonása (visszaállítás a mentés előtti állapotra a szerkesztőben és lemezen)
  const handleUndoSave = useCallback(
    async (filePath, previousContent, fileName) => {
      try {
        if (autoSaveTimerRef.current) {
          clearTimeout(autoSaveTimerRef.current)
          autoSaveTimerRef.current = null
        }
        addNotif(`Mentés visszavonása folyamatban: ${fileName}...`, 'info')
        const res = await axios.post('/api/files/undo-save', {
          filePath,
          previousContent
        })
        if (res.data?.success) {
          applyEditorCode(previousContent, true)
          savedCodeRef.current = previousContent
          setIsModified(false)
          setAutoSaveStatus('saved')
          compile(previousContent)
          await loadProjects()
          addNotif(`✓ Mentés visszavonva! "${fileName}" visszaállítva az előző változatra.`, 'success')
        }
      } catch (err) {
        addNotif(err.response?.data?.error || 'Nem sikerült visszavonni a mentést', 'error')
      }
    },
    [addNotif, applyEditorCode, compile]
  )

  // Mentés (meglévő fájl helyben frissítése, új dokumentum létrehozása + visszavonás támogatása)
  const handleSave = useCallback(
    async (manualSubject, manualFilename, explicitContent, isAutoSave = false) => {
      const contentToSave = explicitContent !== undefined ? explicitContent : code
      const isExistingFile = Boolean(currentFile?.path)

      let targetSub = manualSubject
      let targetName = manualFilename
      let targetFilePath = isExistingFile ? currentFile.path : undefined

      if (isExistingFile) {
        // MÁR LÉTEZŐ FÁJL: szigorúan a meglévő fájlt írjuk felül helyben!
        // Nem hozunk létre új dokumentumot, nem változtatunk mappát és fájlnevet!
        targetName = currentFile.name
        targetSub = currentFile.subject || currentSubject
        targetFilePath = currentFile.path
      } else {
        // ÚJ DOKUMENTUM: cím és tantárgy felismerése
        const detected = detectDocumentMeta(contentToSave, currentSubject)
        if (!targetName) {
          if (currentFile?.isManualName && currentFile?.name) {
            targetName = currentFile.name
          } else if (
            !currentFile?.name ||
            ['dokumentum.tex', 'névtelen.tex', 'untitled.tex'].includes(currentFile.name.toLowerCase()) ||
            currentFile.name.startsWith('Dokumentum_')
          ) {
            targetName = detected.filename
          } else {
            targetName = currentFile.name
          }
        }

        if (!targetSub) {
          targetSub = currentSubject || detected.subject || 'Matematika'
        }

        if (detected.subject && detected.subject !== currentSubject) {
          setCurrentSubject(detected.subject)
        }
      }

      const previousSavedContent = savedCodeRef.current

      if (isAutoSave) {
        setAutoSaveStatus('saving')
      }

      // ── Ha a felhasználó saját helyi mappája van csatlakoztatva (File System Access) ──
      if (localDirHandleRef.current) {
        try {
          const relPath = targetFilePath || (targetSub ? `${targetSub}/${targetName}` : targetName)
          await localWorkspace.saveFileContent(localDirHandleRef.current, relPath, contentToSave)

          const updatedLocalFile = {
            name: targetName,
            path: relPath,
            subject: targetSub,
            tags: currentFile?.tags || []
          }
          setCurrentFile(updatedLocalFile)
          rememberActiveFile(updatedLocalFile)
          savedCodeRef.current = contentToSave
          setIsModified(false)

          const now = new Date()
          const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
          setLastSavedTime(timeStr)
          setAutoSaveStatus('saved')

          if (!isAutoSave) {
            addNotif(`Sikeres mentés a saját gépedre: ${targetName}`, 'success')
          }
          await loadProjects(localDirHandleRef.current)
          return
        } catch (err) {
          if (isAutoSave) {
            setAutoSaveStatus('error')
            console.warn('[AutoSave] Helyi mentési hiba:', err)
          } else {
            addNotif(err.message || 'Hiba a saját gépre mentés során', 'error')
          }
          return
        }
      }

      try {
        const r = await axios.post('/api/files/save', {
          subject: targetSub,
          filename: targetName,
          content: contentToSave,
          filePath: targetFilePath,
          tags: currentFile?.tags || []
        })

        const savedPath = r.data.path
        const savedName = r.data.filename
        const prevContentForUndo = r.data.previousContent !== undefined && r.data.previousContent !== null
          ? r.data.previousContent
          : previousSavedContent

        const updatedServerFile = {
          name: savedName,
          path: savedPath,
          subject: targetSub,
          tags: currentFile?.tags || []
        }
        setCurrentFile(updatedServerFile)
        rememberActiveFile(updatedServerFile)
        savedCodeRef.current = contentToSave
        setIsModified(false)

        const now = new Date()
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
        setLastSavedTime(timeStr)
        setAutoSaveStatus('saved')

        if (isAutoSave) {
          // Automatikus csendes mentés
        } else {
          if (prevContentForUndo !== null && prevContentForUndo !== contentToSave) {
            addNotif(`Sikeres mentés: ${savedName}`, 'success', {
              label: 'Visszavonás',
              onClick: () => handleUndoSave(savedPath, prevContentForUndo, savedName)
            })
          } else {
            addNotif(`Sikeres mentés: ${savedName}`, 'success')
          }
        }

        loadProjects()
      } catch (err) {
        if (isAutoSave) {
          setAutoSaveStatus('error')
          console.warn('[AutoSave] Mentési hiba:', err)
        } else {
          addNotif(err.response?.data?.error || 'Hiba a mentés során', 'error')
        }
      }
    },
    [code, currentFile, currentSubject, addNotif, handleUndoSave, rememberActiveFile]
  )

  // Automatikus mentés (Auto-save) inaktivitás (2.5 mp) után
  useEffect(() => {
    if (!autoSaveEnabled) {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
        autoSaveTimerRef.current = null
      }
      return
    }

    if (!isModified || code === savedCodeRef.current) {
      return
    }

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
    }

    autoSaveTimerRef.current = setTimeout(() => {
      if (isModified && code !== savedCodeRef.current) {
        handleSave(undefined, undefined, code, true)
      }
    }, 2500)

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
    }
  }, [code, isModified, autoSaveEnabled, handleSave])

  // Ablak elhagyása esetén azonnali mentés
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (autoSaveEnabled && isModified && code !== savedCodeRef.current) {
        handleSave(undefined, undefined, code, true)
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [autoSaveEnabled, isModified, code, handleSave])

  // Új üres dokumentum létrehozása szimplán (azonnali tiszta lap megnyitása)
  const handleNewBlankDoc = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
      autoSaveTimerRef.current = null
    }
    if (isModified && !autoSaveEnabled) {
      const confirmDiscard = window.confirm(
        'A jelenlegi dokumentumban nem mentett módosítások vannak. Biztosan új üres dokumentumot hozol létre?'
      )
      if (!confirmDiscard) return
    }

    applyEditorCode(EMPTY_DOCUMENT_CONTENT, false)
    savedCodeRef.current = EMPTY_DOCUMENT_CONTENT
    setCurrentFile(null)
    rememberActiveFile(null)
    setIsModified(false)
    setAutoSaveStatus('idle')
    setPdfData(null)
    setCompileStatus('idle')
    setCompileLog('')
    axios.delete('/api/compile/active').catch(() => {})
    addNotif('Új üres dokumentum megnyitva!', 'info')
    if (isMobile) {
      handleMobileTabSelect('editor')
    }
  }, [isModified, autoSaveEnabled, applyEditorCode, addNotif, rememberActiveFile, isMobile, handleMobileTabSelect])

  // Dokumentum átnevezése (szerkesztő fülből vagy oldalsávból)
  const handleRenameFile = useCallback(
    async (file, newName) => {
      if (!newName || !newName.trim()) return
      const cleanBase = newName.trim().replace(/\.tex$/i, '').trim()
      if (!cleanBase) return
      const finalNewName = `${cleanBase}.tex`

      const targetFile = file || currentFile
      const isCurrent = !file || (currentFile && (file.path ? currentFile.path === file.path : currentFile.name === file.name))

      if (targetFile?.name === finalNewName) return finalNewName

      // Ha még nem mentett vázlat (nincs lemezes elérési útja)
      if (!targetFile?.path) {
        setCurrentFile(prev => ({
          ...(prev || {}),
          name: finalNewName,
          isManualName: true
        }))
        addNotif(`Dokumentum neve beállítva: ${finalNewName}`, 'info')
        return finalNewName
      }

      // 1. Ha a böngésző helyi munkakönyvtár kezelője aktív (Chrome/Edge File System Access API)
      if (localDirHandleRef.current) {
        try {
          const oldRel = targetFile.path
          const dirParts = oldRel.split('/')
          dirParts.pop()
          const newRel = dirParts.length > 0 ? `${dirParts.join('/')}/${finalNewName}` : finalNewName

          await localWorkspace.renameFile(localDirHandleRef.current, oldRel, newRel)

          if (isCurrent) {
            const updated = {
              ...(targetFile || {}),
              name: finalNewName,
              path: newRel,
              relativePath: newRel,
              isManualName: true
            }
            setCurrentFile(updated)
            rememberActiveFile(updated)
          }
          await loadProjects(localDirHandleRef.current)
          addNotif(`Dokumentum sikeresen átnevezve: ${finalNewName}`, 'success')
          return finalNewName
        } catch (err) {
          addNotif(err.message || 'Hiba történt a helyi fájl átnevezésekor', 'error')
          throw err
        }
      }

      // 2. Szerver oldali átnevezés (Safari vagy szerver munkakönyvtár)
      try {
        const res = await axios.post('/api/files/rename', {
          filePath: targetFile.path,
          newName: finalNewName
        })
        if (res.data.success) {
          const renamedFilename = res.data.filename || res.data.name || finalNewName
          const renamedPath = res.data.newPath || res.data.path || targetFile.path

          if (isCurrent) {
            const updated = {
              ...(targetFile || {}),
              name: renamedFilename,
              path: renamedPath,
              relativePath: res.data.relativePath || targetFile.relativePath,
              isManualName: true
            }
            setCurrentFile(updated)
            rememberActiveFile(updated)

            if (isModified) {
              await axios.post('/api/files/save', {
                filePath: renamedPath,
                subject: res.data.subject || targetFile.subject || currentSubject,
                filename: renamedFilename,
                content: code
              })
              savedCodeRef.current = code
              setIsModified(false)
            }
          }

          await loadProjects()
          addNotif(`Dokumentum sikeresen átnevezve: ${renamedFilename}`, 'success')
          return renamedFilename
        }
      } catch (err) {
        const msg = err.response?.data?.error || 'Hiba történt a fájl átnevezésekor'
        addNotif(msg, 'error')
        throw err
      }
    },
    [currentFile, code, isModified, currentSubject, addNotif, rememberActiveFile, loadProjects]
  )

  // Dokumentum betöltése
  const handleLoad = useCallback(
    async (file) => {
      try {
        if (autoSaveTimerRef.current) {
          clearTimeout(autoSaveTimerRef.current)
          autoSaveTimerRef.current = null
        }

        // Ha saját gép mappa van csatlakoztatva
        if (localDirHandleRef.current) {
          const content = await localWorkspace.readFileContent(localDirHandleRef.current, file.path)
          applyEditorCode(content, false)
          savedCodeRef.current = content
          const loadedFile = {
            ...file,
            tags: file.tags || []
          }
          setCurrentFile(loadedFile)
          rememberActiveFile(loadedFile)
          setCurrentSubject(file.subject || '')
          setIsModified(false)
          setAutoSaveStatus('saved')
          setPdfData(null)
          setCompileStatus('idle')
          setCompileLog('')
          addNotif(`Betöltve a saját gépedről: ${file.name}`, 'info')
          if (isMobile) {
            handleMobileTabSelect('editor')
          }
          return
        }

        const r = await axios.post('/api/files/load', { filePath: file.path })
        applyEditorCode(r.data.content, false)
        savedCodeRef.current = r.data.content
        const loadedFile = {
          ...file,
          tags: r.data.tags || file.tags || []
        }
        setCurrentFile(loadedFile)
        rememberActiveFile(loadedFile)
        setCurrentSubject(file.subject)
        setIsModified(false)
        setAutoSaveStatus('saved')
        setPdfData(null)
        setCompileStatus('idle')
        setCompileLog('')
        addNotif(`Betöltve: ${file.name}`, 'info')
        if (isMobile) {
          handleMobileTabSelect('editor')
        }
      } catch (err) {
        addNotif('Hiba a fájl betöltésekor: ' + (err.message || ''), 'error')
      }
    },
    [addNotif, applyEditorCode, rememberActiveFile, isMobile, handleMobileTabSelect]
  )

  // Dokumentum címkéinek frissítése
  const handleUpdateTags = useCallback(
    async (filePath, tags) => {
      try {
        const res = await axios.post('/api/files/tags', { filePath, tags })
        if (res.data.success) {
          addNotif('Címkék sikeresen frissítve!', 'success')
          await loadProjects()
          setCurrentFile(prev => {
            if (prev && prev.path === filePath) {
              return { ...prev, tags: res.data.tags }
            }
            return prev
          })
        }
      } catch (err) {
        addNotif(err.response?.data?.error || 'Hiba a címkék mentése során', 'error')
      }
    },
    [addNotif]
  )

  // Fájl törlése (kizárólag felhasználói jóváhagyás után)
  const handleDelete = useCallback(
    async (file) => {
      try {
        if (localDirHandleRef.current) {
          await localWorkspace.deleteEntry(localDirHandleRef.current, file.path)
          if (currentFile?.path === file.path) {
            setCurrentFile(null)
            rememberActiveFile(null)
            applyEditorCode(TEMPLATES[0].content, false)
            setPdfData(null)
            savedCodeRef.current = TEMPLATES[0].content
            setIsModified(false)
            axios.delete('/api/compile/active').catch(() => {})
          }
          addNotif(`Törölve a gépedről: ${file.name}`, 'success')
          await loadProjects(localDirHandleRef.current)
          return
        }

        await axios.delete('/api/files/delete', { data: { filePath: file.path } })
        if (currentFile?.path === file.path) {
          setCurrentFile(null)
          rememberActiveFile(null)
          applyEditorCode(TEMPLATES[0].content, false)
          setPdfData(null)
          savedCodeRef.current = TEMPLATES[0].content
          setIsModified(false)
          axios.delete('/api/compile/active').catch(() => {})
        }
        addNotif(`Törölve: ${file.name}`, 'success')
        loadProjects()
      } catch {
        addNotif('Hiba a fájl törlésekor', 'error')
      }
    },
    [currentFile, addNotif, applyEditorCode, loadProjects, rememberActiveFile]
  )

  // Dokumentum áthelyezése másik mappába
  const handleMoveFile = useCallback(
    async (file, targetDir) => {
      try {
        if (localDirHandleRef.current) {
          const filename = file.name
          const targetRel = targetDir ? `${targetDir}/${filename}` : filename
          await localWorkspace.renameFile(localDirHandleRef.current, file.path, targetRel)
          addNotif(`"${file.name}" sikeresen átmozgatva!`, 'success')
          if (currentFile?.path === file.path) {
            const updated = {
              ...currentFile,
              path: targetRel,
              relativePath: targetRel,
              subject: targetDir ? targetDir.split('/')[0] : ''
            }
            setCurrentFile(updated)
            rememberActiveFile(updated)
          }
          await loadProjects(localDirHandleRef.current)
          return
        }

        const res = await axios.post('/api/files/move', {
          filePath: file.path,
          targetFolderPath: targetDir,
          targetDir
        })
        if (res.data.success) {
          addNotif(`"${file.name}" sikeresen átmozgatva!`, 'success')
          const newPath = res.data.newPath || res.data.path
          if (currentFile?.path === file.path) {
            const updated = {
              ...currentFile,
              path: newPath,
              relativePath: res.data.relativePath || file.relativePath,
              subject: res.data.subject || res.data.newSubject
            }
            setCurrentFile(updated)
            rememberActiveFile(updated)
            if (res.data.subject && res.data.subject !== currentSubject) {
              setCurrentSubject(res.data.subject)
            }
          }
          await loadProjects()
        }
      } catch (err) {
        addNotif(err.response?.data?.error || 'Hiba a dokumentum áthelyezésekor', 'error')
      }
    },
    [currentFile, currentSubject, addNotif, rememberActiveFile, loadProjects]
  )

  // Alkönyvtár létrehozása
  const handleCreateFolder = useCallback(
    async (parentPath, folderName, subject) => {
      try {
        if (localDirHandleRef.current) {
          await localWorkspace.createFolder(localDirHandleRef.current, parentPath, folderName)
          addNotif(`"${folderName}" mappa sikeresen létrehozva a saját gépeden!`, 'success')
          await loadProjects(localDirHandleRef.current)
          return { name: folderName, path: parentPath ? `${parentPath}/${folderName}` : folderName }
        }

        const res = await axios.post('/api/files/folder/create', {
          parentPath,
          folderName,
          subject
        })
        if (res.data.success) {
          addNotif(`"${res.data.name}" mappa sikeresen létrehozva!`, 'success')
          await loadProjects()
          return res.data
        }
      } catch (err) {
        addNotif(err.response?.data?.error || err.message || 'Hiba a mappa létrehozásakor', 'error')
        throw err
      }
    },
    [addNotif, loadProjects]
  )

  const handleCreateRootCategory = useCallback(() => {
    const name = window.prompt('Új kategória / mappa neve a munkakönyvtárban (pl. Informatika, Kémia, Szakdolgozat):')
    if (name && name.trim()) {
      handleCreateFolder(null, name.trim(), '')
    }
  }, [handleCreateFolder])

  // Mappa átnevezése
  const handleRenameFolder = useCallback(
    async (folderPath, newName) => {
      try {
        const res = await axios.post('/api/files/folder/rename', {
          folderPath,
          newName
        })
        if (res.data.success) {
          addNotif(`Mappa átnevezve: "${res.data.name}"`, 'success')
          await loadProjects()
          return res.data
        }
      } catch (err) {
        addNotif(err.response?.data?.error || 'Hiba a mappa átnevezésekor', 'error')
        throw err
      }
    },
    [addNotif]
  )

  // Mappa törlése (kizárólag felhasználói jóváhagyás után)
  const handleDeleteFolder = useCallback(
    async (folderPath) => {
      try {
        if (localDirHandleRef.current) {
          await localWorkspace.deleteEntry(localDirHandleRef.current, folderPath)
          addNotif('Mappa és tartalma sikeresen törölve a saját gépedről!', 'success')
          if (currentFile?.path && currentFile.path.startsWith(folderPath)) {
            setCurrentFile(null)
            applyEditorCode(TEMPLATES[0].content, false)
            savedCodeRef.current = TEMPLATES[0].content
            setIsModified(false)
            setPdfData(null)
          }
          await loadProjects(localDirHandleRef.current)
          return
        }

        const res = await axios.delete('/api/files/folder', {
          data: { folderPath }
        })
        if (res.data.success) {
          addNotif('Mappa és tartalma sikeresen törölve!', 'success')
          if (currentFile?.path && currentFile.path.startsWith(folderPath)) {
            setCurrentFile(null)
            applyEditorCode(TEMPLATES[0].content, false)
            savedCodeRef.current = TEMPLATES[0].content
            setIsModified(false)
            setPdfData(null)
          }
          await loadProjects()
        }
      } catch (err) {
        addNotif(err.response?.data?.error || err.message || 'Hiba a mappa törlésekor', 'error')
      }
    },
    [currentFile, addNotif, applyEditorCode, loadProjects]
  )

  // PDF letöltése a számítógépre (a témakör / cím szerinti elnevezéssel)
  const handleDownloadPdf = useCallback(() => {
    if (!pdfData) return
    const bytes = atob(pdfData)
    const arr = new Uint8Array(bytes.length)
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
    const blob = new Blob([arr], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url

    const detected = detectDocumentMeta(code, currentSubject)
    let baseName = ''
    if (
      currentFile?.name &&
      !['dokumentum.tex', 'névtelen.tex', 'untitled.tex'].includes(currentFile.name.toLowerCase()) &&
      (!currentFile.name.startsWith('Dokumentum_') || currentFile.path || currentFile.isManualName)
    ) {
      baseName = currentFile.name.replace(/\.tex$/i, '')
    } else if (detected.filename) {
      baseName = detected.filename.replace(/\.tex$/i, '')
    } else {
      baseName = 'dokumentum'
    }

    const downloadName = `${baseName}.pdf`
    a.download = downloadName
    a.click()
    URL.revokeObjectURL(url)
    addNotif(`PDF letöltése indult: ${downloadName}`, 'info')
  }, [pdfData, code, currentFile, currentSubject, addNotif])

  // AI beszúrás (automatikusan a kódrészbe + azonnali fordítás + cím/fájlnév beállítása a témakör alapján)
  const handleAiInsert = useCallback(
    (latex, autoCompile = true, topicName = '') => {
      applyEditorCode(latex, true)
      setIsModified(true)

      const detected = detectDocumentMeta(latex, currentSubject)
      let filename = detected.filename
      if (topicName && topicName.trim()) {
        const cleanTopic = topicName.trim()
          .replace(/[\/\\:*?"<>|]/g, '_')
          .replace(/\s+/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_+|_+$/g, '')
        if (cleanTopic) {
          filename = `${cleanTopic}.tex`
        }
      }

      setCurrentFile({
        name: filename,
        path: null,
        subject: detected.subject || currentSubject
      })
      if (detected.subject && detected.subject !== currentSubject) {
        setCurrentSubject(detected.subject)
      }

      addNotif(`"${topicName || detected.displayTitle}" bekerült a szerkesztőbe!`, 'success')
      if (autoCompile) {
        compile(latex)
      }
    },
    [compile, currentSubject, addNotif, applyEditorCode]
  )

  // AI kódrészlet intelligens alkalmazása (csere vagy hozzáfűzés + azonnali fordítás)
  const handleAiAppend = useCallback(
    (latex, options = {}) => {
      const opts = typeof options === 'boolean' ? { autoCompile: options } : (options || {})
      const autoCompile = opts.autoCompile !== false
      const forceAppend = opts.forceAppend === true
      const snippet = cleanSnippet(latex)

      let newCode = code
      let replaceStartLine = null
      let replaceEndLine = null
      let actionType = 'append'

      if (opts.insertAtCursor) {
        // 0. Prioritás: Kifejezett kurzorpozícióhoz való beszúrás
        const editor = editorPaneRef.current?.getEditor?.()
        const model = editor?.getModel()
        const pos = editor?.getPosition()
        if (editor && model && pos) {
          const offset = model.getOffsetAt(pos)
          newCode = code.slice(0, offset) + '\n\n' + snippet + '\n\n' + code.slice(offset)
          actionType = 'cursor'
          replaceStartLine = pos.lineNumber
        }
      } else if (!forceAppend) {
        // 1. Prioritás: Ha a felhasználó kijelölt egy részt a Monaco szerkesztőben
        const activeSelection = editorPaneRef.current?.getSelection?.()
        if (activeSelection && activeSelection.selectedText && activeSelection.selectedText.trim().length > 0) {
          const sel = activeSelection.selection
          const model = editorPaneRef.current?.getEditor?.()?.getModel()
          if (model) {
            const startOffset = model.getOffsetAt({ lineNumber: sel.startLineNumber, column: sel.startColumn })
            const endOffset = model.getOffsetAt({ lineNumber: sel.endLineNumber, column: sel.endColumn })
            newCode = code.slice(0, startOffset) + snippet + code.slice(endOffset)
            actionType = 'selection'
            replaceStartLine = sel.startLineNumber
            replaceEndLine = sel.endLineNumber
          }
        } else {
          // 2. Prioritás: Intelligens mintaillesztés a dokumentumban
          const targetMatch = opts.targetMatch || findSmartReplacement(code, snippet)
          if (targetMatch && targetMatch.matched) {
            newCode = code.slice(0, targetMatch.startIndex) + snippet + code.slice(targetMatch.endIndex)
            actionType = 'smart_replace'
            replaceStartLine = targetMatch.startLine
            replaceEndLine = targetMatch.endLine
          }
        }
      }

      if (actionType === 'append') {
        const insertPoint = code.lastIndexOf('\\end{document}')
        if (insertPoint !== -1) {
          newCode = code.slice(0, insertPoint) + '\n\n' + snippet + '\n\n' + code.slice(insertPoint)
        } else {
          newCode = code + '\n\n' + snippet
        }
      }

      applyEditorCode(newCode, true)
      setIsModified(true)

      if (actionType === 'cursor') {
        addNotif(`Ábra sikeresen beszúrva a kurzor pozíciójához (${replaceStartLine}. sor)!`, 'success')
        if (replaceStartLine && editorPaneRef.current?.jumpToLine) {
          setTimeout(() => {
            editorPaneRef.current.jumpToLine(replaceStartLine)
          }, 60)
        }
      } else if (actionType === 'smart_replace') {
        addNotif(
          `Javított rész sikeresen kicserélve a dokumentumban (${replaceStartLine}–${replaceEndLine}. sor)!`,
          'success'
        )
        if (replaceStartLine && editorPaneRef.current?.jumpToLine) {
          setTimeout(() => {
            editorPaneRef.current.jumpToLine(replaceStartLine)
          }, 60)
        }
      } else if (actionType === 'selection') {
        addNotif(
          `Kijelölt rész sikeresen kicserélve (${replaceStartLine}–${replaceEndLine}. sor)!`,
          'success'
        )
        if (replaceStartLine && editorPaneRef.current?.jumpToLine) {
          setTimeout(() => {
            editorPaneRef.current.jumpToLine(replaceStartLine)
          }, 60)
        }
      } else {
        addNotif('A generált kód automatikusan bekerült a dokumentumba!', 'success')
      }

      if (autoCompile) {
        compile(newCode)
      }
      if (isMobile) {
        handleMobileTabSelect('editor')
      }
    },
    [code, compile, addNotif, applyEditorCode, isMobile, handleMobileTabSelect]
  )
  // Kijelölt kódrészlet átdolgozása AI paranccsal
  const handleTransformSelection = useCallback(
    async ({ selectedText, instruction, range, editor, startLine, endLine, isFigure }) => {
      try {
        addNotif(
          isFigure
            ? 'Gemini 3.8 Flash dolgozik a TikZ ábra átrajzolásán...'
            : 'Gemini 3.8 Flash dolgozik a kijelölt részen...',
          'info'
        )
        const res = await axios.post('/api/ai/rewrite', {
          content: selectedText,
          instruction,
          provider: 'gemini',
          model: activeModel,
          isSnippet: true,
          isFigure: Boolean(isFigure)
        })

        const replacement = res.data.latex

        if (editor && range) {
          editor.pushUndoStop?.()
          editor.executeEdits('ai-selection-transform', [
            {
              range,
              text: replacement,
              forceMoveMarkers: true
            }
          ])
          editor.pushUndoStop?.()
          const newCode = editor.getValue()
          setCode(newCode)
          setIsModified(true)
          compile(newCode)
        } else if (startLine && endLine) {
          const lines = code.split('\n')
          const before = lines.slice(0, startLine - 1)
          const after = lines.slice(endLine)
          const newCode = [...before, replacement, ...after].join('\n')
          applyEditorCode(newCode, true)
          compile(newCode)
        } else {
          const newCode = code.replace(selectedText, replacement)
          applyEditorCode(newCode, true)
          compile(newCode)
        }

        addNotif(isFigure ? 'A TikZ ábra sikeresen módosítva és újrafordítva!' : 'A kijelölt rész sikeresen módosítva!', 'success')
      } catch (err) {
        addNotif(err.response?.data?.error || err.message || 'Módosítási hiba történt', 'error')
        throw err
      }
    },
    [code, activeModel, compile, addNotif, applyEditorCode]
  )

  // Új AI tartalom beszúrása a PDF kijelölés vagy kódsor alapján
  const handleInsertSelection = useCallback(
    async ({ contextSnippet, instruction, position = 'after', startLine, endLine, targetLine }) => {
      try {
        addNotif('Gemini generálja az új tartalmat a megadott helyre...', 'info')
        const res = await axios.post('/api/ai/insert', {
          contextSnippet: contextSnippet || code,
          instruction,
          position,
          provider: 'gemini',
          model: activeModel,
          subject: currentSubject
        })

        const insertion = res.data.latex
        if (!insertion) throw new Error('Nem érkezett generált tartalom az AI modelltől.')

        const lines = code.split('\n')
        let insertIndex = lines.length

        if (position === 'before') {
          const lineNum = startLine || targetLine || 1
          insertIndex = Math.max(0, lineNum - 1)
        } else {
          const lineNum = endLine || targetLine || lines.length
          insertIndex = Math.min(lines.length, lineNum)
        }

        // Tiszta elválasztó üres sorokkal illesztjük be
        const before = lines.slice(0, insertIndex)
        const after = lines.slice(insertIndex)
        const newCode = [...before, '', insertion, '', ...after].join('\n')

        applyEditorCode(newCode, true)
        setIsModified(true)
        addNotif('Az új tartalom sikeresen beszúrva! Dokumentum újrafordítása...', 'success')
        compile(newCode)
        if (isMobile) {
          handleMobileTabSelect('editor')
        }
      } catch (err) {
        addNotif(err.response?.data?.error || err.message || 'Beszúrási hiba történt', 'error')
        throw err
      }
    },
    [code, activeModel, currentSubject, compile, addNotif, applyEditorCode, isMobile, handleMobileTabSelect]
  )

  // SyncTeX Forward Search (Kódsor -> PDF koordináta)
  const handleForwardSync = useCallback(
    async (line, column) => {
      try {
        const r = await axios.post('/api/compile/synctex-forward', { line, column })
        if (r.data?.target) {
          setSyncTarget({ ...r.data.target, timestamp: Date.now() })
          addNotif(`SyncTeX: Ugrás a PDF ${r.data.target.page}. oldalára (Sor: ${line})`, 'info')
          if (isMobile) {
            handleMobileTabSelect('pdf')
          }
        }
      } catch (err) {
        console.warn('SyncTeX forward hiba:', err)
      }
    },
    [addNotif, isMobile, handleMobileTabSelect]
  )

  // SyncTeX Inverse Search (PDF Dupla kattintás -> Kódsor)
  const handleInverseSync = useCallback(
    async ({ page, x, y }) => {
      try {
        const r = await axios.post('/api/compile/synctex-inverse', { page, x, y })
        if (r.data?.target?.line) {
          setActiveLineToReveal({
            line: r.data.target.line,
            column: r.data.target.column || 1,
            timestamp: Date.now()
          })
          addNotif(`SyncTeX: Ugrás a forráskód ${r.data.target.line}. sorára`, 'info')
          if (isMobile) {
            handleMobileTabSelect('editor')
          }
        }
      } catch (err) {
        console.warn('SyncTeX inverse hiba:', err)
        addNotif('Nem található kódsor ehhez a pozícióhoz.', 'warning')
      }
    },
    [addNotif, isMobile, handleMobileTabSelect]
  )

  // Fordítási hiba automatikus javítása Gemini AI-val
  const handleFixErrorWithAi = useCallback(async () => {
    if (!compileLog) return
    addNotif('Gemini 3.8 Flash elemzi a fordítási hibát és javítja a forráskódot...', 'info')
    try {
      const res = await axios.post('/api/ai/fix-error', {
        code,
        errorLog: compileLog,
        provider: 'gemini',
        model: activeModel
      })

      const fixedCode = res.data.latex
      if (!fixedCode) throw new Error('Nem érkezett javított kód az AI modelltől.')

      applyEditorCode(fixedCode, true)
      setIsModified(true)
      if (res.data.targeted && res.data.line) {
        addNotif(`A(z) ${res.data.line}. sornál lévő hibát villámgyorsan kijavította az AI!`, 'success')
      } else {
        addNotif('A hibát a Gemini kijavította! Újrafordítás folyamatban...', 'success')
      }
      compile(fixedCode)
    } catch (err) {
      console.error('Hiba javítási hiba:', err)
      addNotif(err.response?.data?.error || err.message || 'Nem sikerült javítani a hibát.', 'error')
      throw err
    }
  }, [code, compileLog, activeModel, compile, addNotif, applyEditorCode])

  // Dokumentum szerkezetének és számozásainak átnézése és javítása a TOC alapján
  const handleFixStructure = useCallback(async () => {
    if (!code || code.trim().length < 20) {
      addNotif('A dokumentum túl rövid a szerkezet átnézéséhez.', 'warning')
      return
    }

    setIsFixingStructure(true)
    const prevCode = code
    addNotif('A dokumentum szerkezetének és számozásainak átnézése a TOC alapján...', 'info')

    try {
      const res = await axios.post('/api/ai/fix-structure', {
        code,
        subject: currentSubject,
        provider: 'gemini',
        model: activeModel
      }, { timeout: 600000 })

      if (res.data?.success) {
        const { fixedLatex, summary, hasChanges } = res.data

        if (!hasChanges) {
          addNotif('A dokumentum szerkezete és számozása már tökéletes összhangban van a TOC-val!', 'info')
          setStructureFixResult({
            summary: ['A dokumentum fejezetszintjei és számozásai már eleve szabályosak és logikusak, nem volt szükség módosításra.'],
            hasChanges: false
          })
          return
        }

        applyEditorCode(fixedLatex, true)
        setIsModified(true)
        compile(fixedLatex)

        setStructureFixResult({
          summary: summary || ['A dokumentum szerkezete és számozása sikeresen frissítve a TOC alapján.'],
          hasChanges: true,
          previousCode: prevCode
        })

        addNotif('Dokumentum szerkezete és számozása sikeresen javítva a TOC alapján!', 'success')
      }
    } catch (err) {
      console.error('Szerkezet javítási hiba:', err)
      addNotif(err.response?.data?.error || err.message || 'Nem sikerült javítani a dokumentum szerkezetét.', 'error')
    } finally {
      setIsFixingStructure(false)
    }
  }, [code, currentSubject, activeModel, applyEditorCode, compile, addNotif])

  const handleRevertStructureFix = useCallback(() => {
    if (structureFixResult?.previousCode) {
      applyEditorCode(structureFixResult.previousCode, true)
      compile(structureFixResult.previousCode)
      setStructureFixResult(null)
      addNotif('A szerkezeti javítás visszavonva, az előző állapot visszaállt.', 'info')
    }
  }, [structureFixResult, applyEditorCode, compile, addNotif])

  // Billentyűkombinációk (⌘S / Ctrl+S: Mentés & Fordítás, Ctrl+A / ⌘A: Teljes kód kijelölése, ⌘B: Fájlkezelő, ⌘⌥N: Új üres doksi, ⌘Z / ⌘Y: Visszavonás/Újra)
  useEffect(() => {
    const handler = (e) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const isCtrlOrCmd = isMac ? (e.metaKey || e.ctrlKey) : (e.ctrlKey || e.metaKey)

      // Ctrl+A vagy Cmd+A kezelése a TeX szerkesztőben
      if (isCtrlOrCmd && !e.altKey && !e.shiftKey && e.key?.toLowerCase() === 'a') {
        const activeEl = document.activeElement
        const isInsideMonaco = !!activeEl?.closest?.('.monaco-editor')
        const tag = activeEl?.tagName?.toLowerCase()
        const isOtherInput = !isInsideMonaco && (tag === 'input' || tag === 'textarea' || activeEl?.isContentEditable)

        if (isInsideMonaco) {
          e.preventDefault()
          const editor = editorPaneRef.current?.getEditor?.()
          if (editor) {
            const model = editor.getModel()
            if (model) {
              editor.setSelection(model.getFullModelRange())
            }
          }
          return
        }

        if (isOtherInput) {
          // Ha nem a Monaco-ban van, hanem más beviteli mezőben (pl. keresés, átnevezés),
          // és Mac-en a felhasználó Ctrl+A-t nyomott, kijelöljük a beviteli mező szövegét
          if (e.ctrlKey && isMac) {
            e.preventDefault()
            activeEl.select?.()
          }
          return
        }

        // Ha nincs aktív beviteli mező: a TeX szerkesztőt fókuszáljuk és kijelöljük a teljes kódot
        const editor = editorPaneRef.current?.getEditor?.()
        if (editor) {
          e.preventDefault()
          editor.focus()
          const model = editor.getModel()
          if (model) {
            editor.setSelection(model.getFullModelRange())
          }
        }
        return
      }

      const modifier = isCtrlOrCmd

      if (modifier && e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        handleNewBlankDoc()
        return
      }

      if (modifier && !e.altKey) {
        const tag = document.activeElement?.tagName?.toLowerCase()
        const isEditingOtherInput = tag === 'input' || tag === 'textarea'

        if (e.key.toLowerCase() === 'b' && !isEditingOtherInput) {
          e.preventDefault()
          toggleSidebarCollapse()
          return
        }

        if (e.key.toLowerCase() === 's') {
          e.preventDefault()
          Promise.resolve(handleSave()).finally(() => {
            compile()
          })
        } else if (!isEditingOtherInput) {
          if (e.key.toLowerCase() === 'z') {
            e.preventDefault()
            if (e.shiftKey) {
              handleRedo()
            } else {
              handleUndo()
            }
          } else if (e.key.toLowerCase() === 'y') {
            e.preventDefault()
            handleRedo()
          }
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSave, compile, handleUndo, handleRedo, handleNewBlankDoc, toggleSidebarCollapse])

  // Preambulum alkalmazása a szerkesztőben
  const handleApplyPreambleToEditor = useCallback(
    async (p) => {
      if (!p?.preamble) return
      const docStart = code.indexOf('\\begin{document}')
      let newCode = ''
      try {
        const bodyContent = docStart !== -1 ? code.slice(docStart) : ''
        const res = await axios.post('/api/preambles/supplement', {
          preamble: p.preamble,
          body: bodyContent
        })
        const finalPreamble = res.data.preamble || p.preamble
        if (docStart !== -1) {
          newCode = `${finalPreamble.trim()}\n\n${code.slice(docStart)}`
        } else {
          newCode = `${finalPreamble.trim()}\n\n\\begin{document}\n\\maketitle\n\n\\section{Bevezetés}\nIde jön a tartalom...\n\n\\end{document}`
        }
        applyEditorCode(newCode, true)
        setIsModified(true)
        addNotif(`"${p.name}" preambulum alkalmazva a szerkesztőben (megjelenítési csomagokkal kiegészítve)!`, 'success')
        compile(newCode)
      } catch (err) {
        if (docStart !== -1) {
          newCode = `${p.preamble.trim()}\n\n${code.slice(docStart)}`
        } else {
          newCode = `${p.preamble.trim()}\n\n\\begin{document}\n\\maketitle\n\n\\section{Bevezetés}\nIde jön a tartalom...\n\n\\end{document}`
        }
        applyEditorCode(newCode, true)
        setIsModified(true)
        addNotif(`"${p.name}" preambulum alkalmazva a szerkesztőben!`, 'success')
        compile(newCode)
      }
    },
    [code, compile, addNotif, applyEditorCode]
  )

  // Fájlválasztó megnyitása importáláshoz
  const handleTriggerImport = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  // Kiválasztott / áthúzott fájlok beolvasása és előkészítése
  const handleProcessImportFiles = useCallback(
    async (fileList) => {
      if (!fileList || fileList.length === 0) return
      const filesArray = Array.from(fileList).filter((f) =>
        f.name.toLowerCase().endsWith('.tex') || f.type === 'text/x-tex' || f.type.startsWith('text/') || !f.type
      )

      if (filesArray.length === 0) {
        addNotif('Kérjük, válassz ki legalább egy .tex kiterjesztésű fájlt!', 'warning')
        return
      }

      const readPromises = filesArray.map((file) => {
        return new Promise((resolve) => {
          const reader = new FileReader()
          reader.onload = (e) => {
            const content = e.target.result || ''
            const meta = detectDocumentMeta(content, currentSubject)
            resolve({
              file,
              content,
              meta,
              targetName: meta.filename || file.name,
              targetSubject: meta.subject || currentSubject
            })
          }
          reader.onerror = () => resolve(null)
          reader.readAsText(file, 'utf-8')
        })
      })

      const results = (await Promise.all(readPromises)).filter(Boolean)
      if (results.length > 0) {
        setPendingImportFiles(results)
        setImportModalOpen(true)
      }
    },
    [currentSubject, addNotif]
  )

  // Importálás véglegesítése és elmentése a projektbe
  const handleConfirmImport = useCallback(
    async (importedItems) => {
      setImportModalOpen(false)
      let lastSaved = null

      for (const item of importedItems) {
        try {
          const r = await axios.post('/api/files/save', {
            subject: item.subject,
            filename: item.filename,
            content: item.content
          })
          lastSaved = {
            name: r.data.filename,
            path: r.data.path,
            subject: item.subject,
            content: item.content,
            openNow: item.openNow
          }
        } catch (err) {
          addNotif(`Hiba a(z) ${item.filename} mentésekor`, 'error')
        }
      }

      await loadProjects()

      // Ha azonnal meg kell nyitni az egyik fájlt (alapértelmezetten a kiválasztottat vagy az elsőt)
      const itemToOpen =
        importedItems.find((i) => i.openNow) || (importedItems.length === 1 ? importedItems[0] : null)

      if (itemToOpen && lastSaved) {
        applyEditorCode(itemToOpen.content, false)
        savedCodeRef.current = itemToOpen.content
        const opened = {
          name: itemToOpen.filename,
          path: lastSaved.path,
          subject: itemToOpen.subject
        }
        setCurrentFile(opened)
        rememberActiveFile(opened)
        setCurrentSubject(itemToOpen.subject)
        setIsModified(false)
        setPdfData(null)
        setCompileStatus('idle')
        setCompileLog('')
        addNotif(`✓ Sikeres importálás: [${itemToOpen.subject}] ${itemToOpen.filename}`, 'success')
        compile(itemToOpen.content)
        if (isMobile) {
          handleMobileTabSelect('editor')
        }
      } else if (importedItems.length > 1) {
        addNotif(`✓ Sikeresen importálva ${importedItems.length} db LaTeX dokumentum!`, 'success')
      }
    },
    [compile, addNotif, applyEditorCode, rememberActiveFile, isMobile, handleMobileTabSelect]
  )

  return (
    <div className={`app ${isMobile ? 'is-mobile' : ''} mobile-tab-${mobileActiveTab}`}>
      {/* Felső Eszköztár (44px kompakt Apple Pro) */}
      <Toolbar
        currentFile={currentFile}
        isModified={isModified}
        autoSaveStatus={autoSaveStatus}
        onSave={() => handleSave()}
        onOpenPreambles={() => setPreambleModalOpen(true)}
        onOpenSettings={() => setSettingsModalOpen(true)}
        hasCustomKey={hasCustomKey}
      />

      {/* Mobilos 4 oszlop navigációs sáv (fejléc alatt) */}
      <nav className="mobile-columns-bar" role="tablist" aria-label="Munkafelület oszlopok">
        {MOBILE_COLUMNS.map((col) => {
          const isActive = mobileActiveTab === col.id
          const IconComponent = col.icon
          return (
            <button
              key={col.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`mobile-tab-btn ${isActive ? 'active' : ''}`}
              onClick={() => handleMobileTabSelect(col.id)}
              title={col.label}
              id={`mobile-tab-${col.id}`}
            >
              <IconComponent size={15} className="mobile-tab-icon" />
              {isActive && (
                <span className="mobile-tab-label">{col.label}</span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Fő munkafelület */}
      <div className="app-body">
        {/* Bal oldali fájlkezelő */}
        <Sidebar
          projectTree={projectTree}
          availableFolders={availableFolders}
          currentFile={currentFile}
          currentSubject={currentSubject}
          apiOk={apiOk}
          activeModel={activeModel}
          localWorkspaceName={localDirHandle ? localDirHandle.name : null}
          pendingWorkspaceName={pendingPermissionHandle ? pendingPermissionHandle.name : null}
          onGrantPermission={handleGrantPermission}
          onPickLocalFolder={handlePickLocalFolder}
          onDisconnectLocalFolder={handleDisconnectLocalFolder}
          onOpenSettings={() => setSettingsModalOpen(true)}
          isCollapsed={isMobile ? false : sidebarCollapsed}
          onToggleCollapse={toggleSidebarCollapse}
          onLoad={handleLoad}
          onDelete={handleDelete}
          onNewBlankDoc={handleNewBlankDoc}
          onNewDoc={() => setNewDocModal(true)}
          onImportDoc={handleTriggerImport}
          onImportFiles={handleProcessImportFiles}
          onRefresh={() => loadProjects()}
          onEditTags={(file) => setTagModalFile(file)}
          onRename={handleRenameFile}
          onMoveFile={handleMoveFile}
          onCreateFolder={handleCreateFolder}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
        />

        {/* AI Asszisztens panel */}
        <AiPanel
          open={isMobile ? mobileActiveTab === 'ai' : aiPanelOpen}
          onToggleCollapse={() => setAiPanelOpen(v => !v)}
          subject={currentSubject}
          onSubjectChange={setCurrentSubject}
          currentCode={code}
          currentFile={currentFile}
          projectTree={projectTree}
          getSelectedSnippet={() => editorPaneRef.current?.getSelection?.()?.selectedText || ''}
          activeModel={activeModel}
          onModelChange={setActiveModel}
          onInsert={handleAiInsert}
          onAppend={handleAiAppend}
          onRefreshProjects={loadProjects}
          onLoadFile={handleLoad}
          addNotif={addNotif}
          preambles={preambles}
          onOpenPreambles={() => setPreambleModalOpen(true)}
        />

        {/* Szerkesztő és PDF előnézet (átméretezhető split panel) */}
        <div className="editor-area">
          <Split
            className="split-panes"
            sizes={[50, 50]}
            minSize={250}
            gutterSize={5}
            direction="horizontal"
          >
            <EditorPane
              ref={editorPaneRef}
              code={code}
              isModified={isModified}
              autoSaveEnabled={autoSaveEnabled}
              autoSaveStatus={autoSaveStatus}
              lastSavedTime={lastSavedTime}
              currentFile={currentFile}
              compileStatus={compileStatus}
              compileLog={compileLog}
              onChange={handleCodeChange}
              onUndoRedoChange={handleUndoRedoChange}
              onClearLog={() => setCompileLog('')}
              onTransformSelection={handleTransformSelection}
              onForwardSync={handleForwardSync}
              activeLineToReveal={activeLineToReveal}
              onFixError={handleFixErrorWithAi}
              onImportFiles={handleProcessImportFiles}
              onEditTags={(file) => setTagModalFile(file)}
              onRenameFile={handleRenameFile}
              onFixStructure={handleFixStructure}
              isFixingStructure={isFixingStructure}
            />
            <PdfPreview
              pdfData={pdfData}
              compileStatus={compileStatus}
              onCompile={compile}
              onDownloadPdf={handleDownloadPdf}
              syncTarget={syncTarget}
              onInverseSync={handleInverseSync}
              code={code}
              onTransformSelection={handleTransformSelection}
              onInsertSelection={handleInsertSelection}
              isActive={!isMobile || mobileActiveTab === 'pdf'}
              isMobile={isMobile}
            />
          </Split>
        </div>
      </div>

      {/* Alsó Állapotsor (Szigorúan 26px, csendes, 3 zónás elrendezés) */}
      <footer className="status-bar" role="contentinfo">
        {/* Bal zóna: Munkamappa ikon és név */}
        <div className="status-bar-zone status-bar-left">
          <button
            type="button"
            className="status-bar-btn status-bar-workspace"
            onClick={handlePickLocalFolder}
            title={`Munkakönyvtár: ${localDirHandle ? localDirHandle.name : (serverWorkspace?.name || 'LaTeX Projektek')} (Kattints a mappa váltásához)`}
          >
            <Folder size={12} color="var(--accent-light)" />
            <span className="status-bar-folder-name">
              {localDirHandle ? localDirHandle.name : (serverWorkspace?.name || 'LaTeX Projektek')}
            </span>
            {localDirHandle && <span className="status-bar-local-tag">Helyi</span>}
          </button>
        </div>

        {/* Közép zóna: Utolsó fordítás eredménye és ideje */}
        <div className="status-bar-zone status-bar-center">
          {compileStatus === 'compiling' ? (
            <span className="status-bar-compile-info compiling">
              <Loader2 size={11} className="spinner" />
              <span>Fordítás folyamatban...</span>
            </span>
          ) : compileStatus === 'error' ? (
            <span className="status-bar-compile-info error" title="LaTeX fordítási hiba történt">
              <span className="status-bar-dot error" />
              <span>Fordítási hiba {lastCompileInfo.duration ? `(${lastCompileInfo.duration})` : ''}</span>
            </span>
          ) : compileStatus === 'ok' ? (
            <span className="status-bar-compile-info ok" title="A PDF sikeresen lefordítva (TeX Live / pdflatex)">
              <span className="status-bar-dot ok" />
              <span>
                Lefordítva {lastCompileInfo.duration ? `(${lastCompileInfo.duration})` : ''}
                {lastCompileInfo.time ? ` · ${lastCompileInfo.time}` : ''}
              </span>
            </span>
          ) : (
            <span className="status-bar-compile-info idle" title="Készenlétben">
              <span className="status-bar-dot idle" />
              <span>Készenlét</span>
            </span>
          )}
        </div>

        {/* Jobb zóna: Dokumentum statisztika és hasznos gyorsbillentyűk */}
        <div className="status-bar-zone status-bar-right">
          <span className="status-bar-doc-stats" title="Dokumentum terjedelme">
            {code.split('\n').length} sor · {code.length} kar.
          </span>
          <span className="status-bar-shortcut-sep">·</span>
          <div className="status-bar-shortcuts" title="Hasznos billentyűparancsok">
            <span className="status-bar-shortcut-item">
              <kbd>⌘S</kbd> Fordítás
            </span>
            <span className="status-bar-shortcut-sep">·</span>
            <span className="status-bar-shortcut-item">
              <kbd>⌘B</kbd> Fájlkezelő
            </span>
            <span className="status-bar-shortcut-sep">·</span>
            <span className="status-bar-shortcut-item">
              <kbd>⌘K</kbd> AI Kijelölés
            </span>
          </div>
        </div>
      </footer>

      {/* Toast Értesítések */}
      <Notifications items={notifications} />

      {/* Preambulumok & Sablonok Kezelő Modál */}
      {preambleModalOpen && (
        <PreambleModal
          isOpen={preambleModalOpen}
          onClose={() => setPreambleModalOpen(false)}
          preambles={preambles}
          onRefreshPreambles={loadPreambles}
          currentCode={code}
          onApplyPreambleToEditor={handleApplyPreambleToEditor}
          addNotif={addNotif}
        />
      )}

      {/* Új Dokumentum / Mentés Másként Modális Ablak */}
      {newDocModal && (
        <NewDocModal
          currentSubject={currentSubject}
          categories={categories}
          preambles={preambles}
          onClose={() => setNewDocModal(false)}
          onConfirm={(sub, name, templateContent) => {
            setNewDocModal(false)
            const chosenContent = templateContent !== undefined && templateContent !== null ? templateContent : ''
            applyEditorCode(chosenContent, false)
            savedCodeRef.current = chosenContent
            setIsModified(false)
            setPdfData(null)
            handleSave(sub, name, chosenContent)
          }}
        />
      )}

      {/* LaTeX Fájl Importálása Modális Ablak */}
      {importModalOpen && (
        <ImportDocModal
          isOpen={importModalOpen}
          pendingFiles={pendingImportFiles}
          currentSubject={currentSubject}
          onClose={() => setImportModalOpen(false)}
          onConfirm={handleConfirmImport}
        />
      )}

      {/* Címkék Kezelése Modális Ablak */}
      {tagModalFile && (
        <TagModal
          file={tagModalFile}
          onClose={() => setTagModalFile(null)}
          onSave={handleUpdateTags}
        />
      )}

      {/* Struktúra és TOC Javítás Eredmény Modális Ablak */}
      {structureFixResult && (
        <StructureFixModal
          result={structureFixResult}
          onClose={() => setStructureFixResult(null)}
          onRevert={handleRevertStructureFix}
        />
      )}

      {/* Rendszerbeállítások & Munkakörnyezet Modális Ablak */}
      <SettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        onWorkspaceChanged={async (newHandle) => {
          setLocalDirHandle(newHandle)
          localDirHandleRef.current = newHandle
          setPendingPermissionHandle(null)
          await loadProjects(newHandle)
        }}
        onApiKeyChanged={async () => {
          await checkHealth()
        }}
        addNotif={addNotif}
      />

      {/* Rejtett fájlválasztó input .tex importáláshoz */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept=".tex,text/x-tex,text/plain"
        multiple
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleProcessImportFiles(e.target.files)
          }
          e.target.value = ''
        }}
      />
    </div>
  )
}

function NewDocModal({ currentSubject, categories = [], preambles = [], onClose, onConfirm }) {
  const [subject, setSubject] = useState(currentSubject || (categories[0] || ''))
  const [name, setName] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState('empty')

  const combinedTemplates = useMemo(() => {
    const list = [...TEMPLATES]
    preambles
      .filter((p) => !p.isBuiltin)
      .forEach((p) => {
        list.push({
          id: p.id,
          name: p.name,
          desc: p.desc || 'Saját egyéni sablon',
          content: `${p.preamble}\n\n\\begin{document}\n\\maketitle\n\n\\section{Bevezetés}\nIde jön a tartalom...\n\n\\end{document}`
        })
      })
    return list
  }, [preambles])

  const handleCreate = () => {
    if (!name.trim()) return
    const template = combinedTemplates.find((t) => t.id === selectedTemplateId)
    let finalDocName = name.trim()
    if (selectedTemplateId === 'beamer' && !finalDocName.toLowerCase().endsWith('beamer')) {
      finalDocName = `${finalDocName}_Beamer`
    }
    onConfirm(subject, finalDocName, template !== undefined ? template.content : '')
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <LayoutTemplate size={18} color="var(--accent)" />
            <span>Új LaTeX Dokumentum</span>
          </div>
          <button className="btn-subtle" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="form-group">
          <label className="form-label">Kategória / Mappa</label>
          {categories.length === 0 ? (
            <input
              className="form-input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Új kategória neve (pl. Informatika, Kémia, Szakdolgozat)"
            />
          ) : (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {categories.map((cat) => {
                const isSelected = subject === cat
                const isMath = cat === 'Matematika'
                const isPhys = cat === 'Fizika'
                const Icon = isMath ? Sigma : isPhys ? Atom : FileText
                return (
                  <button
                    key={cat}
                    type="button"
                    className={`subject-btn ${isSelected ? 'active ' + (isMath ? 'math' : isPhys ? 'physics' : '') : ''}`}
                    onClick={() => setSubject(cat)}
                    style={{ padding: '6px 12px' }}
                  >
                    <Icon size={14} />
                    <span>{cat}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">Fájlnév (.tex nélkül is megadható)</label>
          <input
            className="form-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="pl. Másodfokú_egyenletek_összefoglaló"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
            }}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Kezdősablon kiválasztása</label>
          <div className="template-cards-grid">
            {combinedTemplates.map((t) => (
              <div
                key={t.id}
                className={`template-card ${selectedTemplateId === t.id ? 'active' : ''}`}
                onClick={() => setSelectedTemplateId(t.id)}
              >
                <div className="template-card-name">{t.name}</div>
                <div className="template-card-desc">{t.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            Mégse
          </button>
          <button
            className="btn btn-primary"
            onClick={handleCreate}
            disabled={!name.trim()}
          >
            <Plus size={14} />
            Létrehozás & Mentés
          </button>
        </div>
      </div>
    </div>
  )
}
