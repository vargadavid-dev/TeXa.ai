import { useState, useMemo, useRef } from 'react'
import {
  Folder,
  FolderOpen,
  FolderPlus,
  FolderInput,
  FileText,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  ChevronRight,
  Sigma,
  Atom,
  CheckCircle2,
  AlertCircle,
  Cpu,
  Upload,
  Tag,
  X,
  Pencil,
  Check,
  LayoutTemplate,
  PanelLeftClose,
  HardDrive
} from 'lucide-react'
import MoveDocModal from './MoveDocModal'

// Rekurzív mappaszűrés keresési kifejezés alapján
function filterFolderRecursive(folderNode, term) {
  if (!folderNode) return null

  // Kompatibilitás, ha korábbi sima tömb formátum érkezne
  if (Array.isArray(folderNode)) {
    const matchedFiles = folderNode.filter(f => {
      return !term ||
        f.name.toLowerCase().includes(term) ||
        (Array.isArray(f.tags) && f.tags.some(t => t.toLowerCase().includes(term)))
    })
    if (term && matchedFiles.length === 0) return null
    return {
      name: '',
      isFolder: true,
      files: matchedFiles,
      folders: [],
      totalCount: matchedFiles.length
    }
  }

  const directFiles = Array.isArray(folderNode.files) ? folderNode.files : []
  const subFolders = Array.isArray(folderNode.folders) ? folderNode.folders : []

  const matchedFiles = directFiles.filter(f => {
    return !term ||
      f.name.toLowerCase().includes(term) ||
      (Array.isArray(f.tags) && f.tags.some(t => t.toLowerCase().includes(term)))
  })

  const matchedFolders = subFolders
    .map(sub => filterFolderRecursive(sub, term))
    .filter(Boolean)

  if (term && matchedFiles.length === 0 && matchedFolders.length === 0) {
    return null
  }

  const totalCount = matchedFiles.length + matchedFolders.reduce((sum, f) => sum + (f.totalCount || 0), 0)

  return {
    ...folderNode,
    files: matchedFiles,
    folders: matchedFolders,
    totalCount
  }
}

export default function Sidebar({
  projectTree,
  availableFolders = [],
  currentFile,
  currentSubject = 'Matematika',
  apiOk,
  activeModel = 'Gemini 3.8 Flash',
  localWorkspaceName = null,
  pendingWorkspaceName = null,
  onGrantPermission,
  onPickLocalFolder,
  onDisconnectLocalFolder,
  onOpenSettings,
  isCollapsed = false,
  onToggleCollapse,
  onLoad,
  onDelete,
  onNewBlankDoc,
  onNewDoc,
  onImportDoc,
  onImportFiles,
  onRefresh,
  onEditTags,
  onRename,
  onMoveFile,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedFolders, setExpandedFolders] = useState({ Matematika: true, Fizika: true })
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)

  // Drag & drop belső dokumentum mozgatáshoz
  const [draggedFile, setDraggedFile] = useState(null)
  const [dragOverFolderPath, setDragOverFolderPath] = useState(null)

  // Dokumentum áthelyezési modál
  const [moveTargetFile, setMoveTargetFile] = useState(null)

  // Almappa létrehozási állapot
  const [creatingInFolderPath, setCreatingInFolderPath] = useState(null)
  const [newFolderName, setNewFolderName] = useState('')
  const createFolderInputRef = useRef(null)

  // Mappa átnevezési állapot
  const [renamingFolderPath, setRenamingFolderPath] = useState(null)
  const [renamingFolderValue, setRenamingFolderValue] = useState('')
  const renameFolderInputRef = useRef(null)

  // Oldalsávos fájl átnevezési állapot
  const [renamingFilePath, setRenamingFilePath] = useState(null)
  const [renamingValue, setRenamingValue] = useState('')
  const renameInputRef = useRef(null)

  const startSidebarRename = (file) => {
    setRenamingFilePath(file.path)
    setRenamingValue(file.name.replace(/\.tex$/i, ''))
    setTimeout(() => {
      if (renameInputRef.current) {
        renameInputRef.current.focus()
        renameInputRef.current.select()
      }
    }, 40)
  }

  const handleCommitSidebarRename = async (file) => {
    const val = renamingValue.trim()
    setRenamingFilePath(null)
    if (!val) return
    const cleanBase = val.replace(/\.tex$/i, '').trim()
    if (!cleanBase) return
    const newName = `${cleanBase}.tex`
    if (file.name === newName) return
    if (onRename) {
      try {
        await onRename(file, newName)
      } catch (err) {
        // A hibaüzenetet az onRename kezelő az App.jsx-ben már értesítésként megjeleníti
      }
    }
  }

  // Külső fájl Drag & Drop (számítógépről importálás)
  const handleSidebarDragOver = (e) => {
    if (draggedFile) return
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  const handleSidebarDragLeave = (e) => {
    if (draggedFile) return
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  const handleSidebarDrop = (e) => {
    if (draggedFile) return
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onImportFiles?.(e.dataTransfer.files)
    }
  }

  // Belső fájl és mappa mozgatás Drag & Drop események
  const handleFileDragStart = (e, file) => {
    e.dataTransfer.setData('text/plain', file.path)
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({
        type: 'latex-file',
        path: file.path,
        name: file.name,
        relativePath: file.relativePath || file.name,
        subject: file.subject
      })
    )
    e.dataTransfer.effectAllowed = 'copyMove'
    setDraggedFile(file)
  }

  const handleFolderDragStart = (e, folder) => {
    // Ne zavarja meg a belső fájlmozgatást
    setDraggedFile(null)
    const folderFiles = []
    const collectFiles = (node) => {
      if (!node) return
      if (Array.isArray(node.files)) {
        node.files.forEach((f) => {
          if (f?.path) {
            folderFiles.push({
              path: f.path,
              name: f.name,
              relativePath: f.relativePath || f.name,
              subject: f.subject
            })
          }
        })
      }
      if (Array.isArray(node.folders)) {
        node.folders.forEach(collectFiles)
      }
    }
    collectFiles(folder)

    e.dataTransfer.setData('text/plain', folder.path || folder.name)
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({
        type: 'latex-folder',
        path: folder.path,
        name: folder.name,
        relativePath: folder.relativePath || folder.name,
        subject: folder.subject,
        files: folderFiles
      })
    )
    e.dataTransfer.effectAllowed = 'copy'
  }

  const handleFileDragEnd = () => {
    setDraggedFile(null)
    setDragOverFolderPath(null)
  }

  const handleFolderDragOver = (e, folder) => {
    if (draggedFile) {
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'move'
      const key = folder.path || folder.name
      if (dragOverFolderPath !== key) {
        setDragOverFolderPath(key)
      }
    }
  }

  const handleFolderDragLeave = (e, folder) => {
    if (draggedFile) {
      e.preventDefault()
      e.stopPropagation()
      const key = folder.path || folder.name
      if (dragOverFolderPath === key) {
        setDragOverFolderPath(null)
      }
    }
  }

  const handleFolderDrop = (e, folder) => {
    if (draggedFile) {
      e.preventDefault()
      e.stopPropagation()
      setDragOverFolderPath(null)
      const currentDir = draggedFile.path ? draggedFile.path.substring(0, draggedFile.path.lastIndexOf('/')) : ''
      if (folder.path && currentDir !== folder.path) {
        onMoveFile?.(draggedFile, folder.path)
      }
      setDraggedFile(null)
    }
  }

  // Mappa nyitása/csukása
  const toggleFolder = (key) => {
    setExpandedFolders(prev => {
      const current = prev[key] !== undefined ? prev[key] : true
      return { ...prev, [key]: !current }
    })
  }

  const isFolderExpanded = (key) => {
    return expandedFolders[key] !== undefined ? expandedFolders[key] : true
  }

  // Almappa létrehozás indítása és mentése
  const handleStartCreateFolder = (e, folder) => {
    e.stopPropagation()
    const key = folder.path || folder.name
    setCreatingInFolderPath(key)
    setNewFolderName('')
    setExpandedFolders(prev => ({ ...prev, [key]: true }))
    setTimeout(() => {
      if (createFolderInputRef.current) {
        createFolderInputRef.current.focus()
      }
    }, 50)
  }

  const handleCommitCreateFolder = async (folder) => {
    const val = newFolderName.trim()
    setCreatingInFolderPath(null)
    if (!val || !onCreateFolder) return
    try {
      await onCreateFolder(folder.path, val, folder.subject)
    } catch (e) {}
  }

  // Mappa átnevezés indítása és mentése
  const handleStartRenameFolder = (e, folder) => {
    e.stopPropagation()
    setRenamingFolderPath(folder.path)
    setRenamingFolderValue(folder.name)
    setTimeout(() => {
      if (renameFolderInputRef.current) {
        renameFolderInputRef.current.focus()
        renameFolderInputRef.current.select()
      }
    }, 50)
  }

  const handleCommitRenameFolder = async (folder) => {
    const val = renamingFolderValue.trim()
    setRenamingFolderPath(null)
    if (!val || val === folder.name || !onRenameFolder) return
    try {
      await onRenameFolder(folder.path, val)
    } catch (e) {}
  }

  // Mappa törlése megerősítéssel
  const handleDeleteFolderClick = (e, folder) => {
    e.stopPropagation()
    if (!onDeleteFolder) return
    if (window.confirm(`Biztosan törölni szeretnéd a "${folder.name}" mappát és a benne található összes fájlt?`)) {
      onDeleteFolder(folder.path)
    }
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await onRefresh()
    setTimeout(() => setIsRefreshing(false), 400)
  }

  // Szűrt fa keresés alapján
  const filteredTree = useMemo(() => {
    const term = searchTerm.toLowerCase().trim()
    const result = {}

    Object.entries(projectTree).forEach(([subject, node]) => {
      const filtered = filterFolderRecursive(node, term)
      if (filtered) {
        result[subject] = filtered
      }
    })

    return result
  }, [projectTree, searchTerm])

  // Teljes fájlszám kiszámítása a projektben
  const totalFilesCount = useMemo(() => {
    let count = 0
    Object.values(projectTree).forEach(val => {
      if (Array.isArray(val)) {
        count += val.length
      } else if (val && typeof val.totalCount === 'number') {
        count += val.totalCount
      } else if (val?.files) {
        count += val.files.length
      }
    })
    return count
  }, [projectTree])

  // Egyetlen fájl elem kirajzolása
  const renderFileItem = (file, depth = 1) => {
    const isActive = currentFile?.path === file.path
    const isRenaming = renamingFilePath === file.path

    return (
      <div
        key={file.path}
        className={`file-item ${isActive ? 'active' : ''} ${isRenaming ? 'renaming' : ''}`}
        style={{ paddingLeft: 12 + depth * 14 }}
        draggable={!isRenaming}
        onDragStart={(e) => handleFileDragStart(e, file)}
        onDragEnd={handleFileDragEnd}
        onClick={() => {
          if (!isRenaming) {
            onLoad(file)
          }
        }}
        id={`file-${file.name.replace(/\W/g, '_')}`}
        title={file.relativePath || file.name}
      >
        <div className="file-item-content">
          {isRenaming ? (
            <form
              className="sidebar-rename-form"
              onSubmit={e => {
                e.preventDefault()
                e.stopPropagation()
                handleCommitSidebarRename(file)
              }}
              onClick={e => e.stopPropagation()}
            >
              <FileText size={14} style={{ flexShrink: 0, opacity: 0.9 }} />
              <input
                ref={renameInputRef}
                type="text"
                className="sidebar-rename-input"
                value={renamingValue}
                onChange={e => setRenamingValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') {
                    e.stopPropagation()
                    setRenamingFilePath(null)
                  }
                }}
                autoFocus
              />
              <button
                type="submit"
                className="sidebar-rename-btn confirm"
                title="Átnevezés jóváhagyása (Enter)"
              >
                <Check size={11} />
              </button>
              <button
                type="button"
                className="sidebar-rename-btn cancel"
                onClick={() => setRenamingFilePath(null)}
                title="Mégse (Esc)"
              >
                <X size={11} />
              </button>
            </form>
          ) : (
            <div className="file-item-title-row">
              <FileText size={14} style={{ flexShrink: 0, opacity: isActive ? 1 : 0.7 }} />
              <span
                className="file-item-name"
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  startSidebarRename(file)
                }}
                title="Dupla kattintás az átnevezéshez"
              >
                {file.name.replace('.tex', '')}
              </span>
            </div>
          )}
        </div>
        {!isRenaming && (
          <div className="file-item-actions">
            <button
              type="button"
              className="file-action-btn move"
              onClick={e => {
                e.stopPropagation()
                setMoveTargetFile(file)
              }}
              title="Dokumentum áthelyezése másik mappába"
            >
              <FolderInput size={12} />
            </button>
            <button
              type="button"
              className="file-action-btn rename"
              onClick={e => {
                e.stopPropagation()
                startSidebarRename(file)
              }}
              title="Fájl átnevezése"
            >
              <Pencil size={12} />
            </button>
            <button
              type="button"
              className="file-action-btn tag"
              onClick={e => {
                e.stopPropagation()
                onEditTags?.(file)
              }}
              title="Címkék kezelése"
            >
              <Tag size={12} />
            </button>
            <button
              type="button"
              className="file-action-btn delete"
              onClick={e => {
                e.stopPropagation()
                if (window.confirm(`Biztosan törölni szeretnéd a "${file.name}" fájlt?`)) {
                  onDelete(file)
                }
              }}
              title="Fájl törlése"
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>
    )
  }

  // Rekurzív mappa renderelés
  const renderFolderNode = (folder, depth = 0) => {
    if (!folder) return null
    const key = folder.path || folder.name
    const isExpanded = isFolderExpanded(key)
    const isMath = folder.subject === 'Matematika' || folder.name === 'Matematika'
    const isPhys = folder.subject === 'Fizika' || folder.name === 'Fizika'
    const isRoot = depth === 0
    const isDragTarget = dragOverFolderPath === key
    const directFiles = Array.isArray(folder.files) ? folder.files : []
    const subFolders = Array.isArray(folder.folders) ? folder.folders : []
    const totalCount = folder.totalCount !== undefined ? folder.totalCount : (directFiles.length + subFolders.length)
    const folderColor = '#0a84ff'

    return (
      <div key={key} className={`folder-group ${isRoot ? 'root-group' : 'subfolder-group'}`}>
        <div
          className={`folder-header ${isDragTarget ? 'drop-active' : ''} ${!isRoot ? 'subfolder-header' : ''}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          draggable={renamingFolderPath !== folder.path}
          onDragStart={(e) => handleFolderDragStart(e, folder)}
          onClick={() => toggleFolder(key)}
          onDragOver={(e) => handleFolderDragOver(e, folder)}
          onDragLeave={(e) => handleFolderDragLeave(e, folder)}
          onDrop={(e) => handleFolderDrop(e, folder)}
          title={isRoot ? folder.name : `${folder.relativePath || folder.name}`}
        >
          <ChevronRight
            size={13}
            className={`folder-chevron ${isExpanded ? 'expanded' : ''}`}
          />
          {isExpanded ? (
            <FolderOpen size={14} color={folderColor} style={{ flexShrink: 0 }} />
          ) : (
            <Folder size={14} color={folderColor} style={{ flexShrink: 0 }} />
          )}

          {renamingFolderPath === folder.path ? (
            <form
              className="sidebar-inline-folder-form inline-rename"
              onSubmit={(e) => {
                e.preventDefault()
                e.stopPropagation()
                handleCommitRenameFolder(folder)
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <input
                ref={renameFolderInputRef}
                type="text"
                className="sidebar-rename-input"
                value={renamingFolderValue}
                onChange={(e) => setRenamingFolderValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.stopPropagation()
                    setRenamingFolderPath(null)
                  }
                }}
                autoFocus
              />
              <button
                type="submit"
                className="sidebar-rename-btn confirm"
                title="Átnevezés mentése (Enter)"
              >
                <Check size={11} />
              </button>
              <button
                type="button"
                className="sidebar-rename-btn cancel"
                onClick={() => setRenamingFolderPath(null)}
                title="Mégse (Esc)"
              >
                <X size={11} />
              </button>
            </form>
          ) : (
            <>
              <span
                style={{
                  flex: 1,
                  color: isRoot ? folderColor : 'var(--text-secondary)',
                  fontWeight: isRoot ? 600 : 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {folder.name}
              </span>

              <span className="sidebar-count-badge">{totalCount}</span>

              {/* Mappa gyorsgombok */}
              <div className="folder-header-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="folder-action-btn create"
                  onClick={(e) => handleStartCreateFolder(e, folder)}
                  title="Új almappa létrehozása ebben a mappában"
                >
                  <FolderPlus size={13} />
                </button>
                {!folder.isRootLoose && (
                  <>
                    <button
                      type="button"
                      className="folder-action-btn rename"
                      onClick={(e) => handleStartRenameFolder(e, folder)}
                      title="Mappa átnevezése"
                    >
                      <Pencil size={11} />
                    </button>
                    <button
                      type="button"
                      className="folder-action-btn delete"
                      onClick={(e) => handleDeleteFolderClick(e, folder)}
                      title="Mappa törlése"
                    >
                      <Trash2 size={11} />
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Új almappa létrehozása beviteli sor */}
        {creatingInFolderPath === key && (
          <form
            className="sidebar-inline-folder-form"
            style={{ marginLeft: 16 + depth * 14 }}
            onSubmit={(e) => {
              e.preventDefault()
              e.stopPropagation()
              handleCommitCreateFolder(folder)
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <FolderPlus size={13} color="var(--accent-light)" style={{ flexShrink: 0 }} />
            <input
              ref={createFolderInputRef}
              type="text"
              className="sidebar-inline-folder-input"
              placeholder="Új mappa neve..."
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation()
                  setCreatingInFolderPath(null)
                }
              }}
              autoFocus
            />
            <button
              type="submit"
              className="sidebar-rename-btn confirm"
              title="Mappa létrehozása (Enter)"
            >
              <Check size={11} />
            </button>
            <button
              type="button"
              className="sidebar-rename-btn cancel"
              onClick={() => setCreatingInFolderPath(null)}
              title="Mégse (Esc)"
            >
              <X size={11} />
            </button>
          </form>
        )}

        {/* Gyermekek: almappák és közvetlen fájlok */}
        {isExpanded && (
          <div className="folder-children-wrap">
            {subFolders.map((sub) => renderFolderNode(sub, depth + 1))}
            {directFiles.map((file) => renderFileItem(file, depth + 1))}
            {directFiles.length === 0 && subFolders.length === 0 && (
              <div
                style={{
                  padding: '5px 12px',
                  paddingLeft: 22 + depth * 14,
                  fontSize: 11,
                  color: 'var(--text-muted)'
                }}
              >
                {isRoot ? 'Még nincs elmentve dokumentum' : 'Üres mappa'}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className={`sidebar ${isCollapsed ? 'collapsed' : ''} ${isDragOver ? 'drag-over' : ''}`}
      style={{ position: 'relative' }}
      onDragOver={handleSidebarDragOver}
      onDragLeave={handleSidebarDragLeave}
      onDrop={handleSidebarDrop}
    >
      {/* Drag & Drop felugró overlay fájl importáláshoz a gépről */}
      {isDragOver && (
        <div className="sidebar-drop-overlay">
          <Upload size={28} color="var(--accent-light)" />
          <span>Engedd el a .tex fájlt az importáláshoz!</span>
        </div>
      )}

      {isCollapsed ? (
        <div className="sidebar-collapsed-wrap">
          <div className="sidebar-collapsed-header">
            <button
              type="button"
              className="btn-subtle sidebar-expand-btn"
              onClick={onToggleCollapse}
              title={`Fájlkezelő kibontása (⌘B)${totalFilesCount > 0 ? ` (${totalFilesCount} fájl)` : ''}`}
            >
              <Folder size={16} color="var(--accent-light)" />
              {totalFilesCount > 0 && (
                <span className="collapsed-mini-badge">{totalFilesCount}</span>
              )}
            </button>
          </div>

          <div className="sidebar-collapsed-body">
            <button
              type="button"
              className="sidebar-collapsed-btn primary"
              onClick={onNewBlankDoc}
              title="Új üres dokumentum létrehozása"
            >
              <Plus size={16} />
            </button>

            <button
              type="button"
              className="sidebar-collapsed-btn"
              onClick={onNewDoc}
              title="Új dokumentum sablonból"
            >
              <LayoutTemplate size={15} />
            </button>

            <button
              type="button"
              className="sidebar-collapsed-btn"
              onClick={onImportDoc}
              title="Létező .tex importálása"
            >
              <Upload size={15} />
            </button>

            <div className="sidebar-collapsed-divider" />

            <button
              type="button"
              className="sidebar-collapsed-btn"
              onClick={handleRefresh}
              title="Projektek frissítése"
            >
              <RefreshCw size={13} className={isRefreshing ? 'spinner' : ''} />
            </button>
          </div>

          <div className="sidebar-collapsed-footer">
            <div
              className="sidebar-collapsed-subject-icon"
              title={`Aktív tantárgy: ${currentSubject}`}
            >
              {currentSubject === 'Matematika' ? (
                <Sigma size={15} color="var(--text-secondary)" />
              ) : (
                <Atom size={15} color="var(--text-secondary)" />
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="sidebar-expanded-wrap">
          {/* Header */}
          <div className="sidebar-header">
            <div className="column-header-title-wrap">
              <div className="column-header-icon-wrap" title="Fájlkezelő">
                <Folder size={13} />
              </div>
              <span className="column-header-title">Fájlkezelő</span>
              <span className="sidebar-count-badge">{totalFilesCount}</span>
            </div>
            <div className="sidebar-header-actions">
              <button
                type="button"
                className="btn-subtle sidebar-header-btn"
                onClick={onPickLocalFolder}
                style={{ color: 'var(--accent-light)' }}
                title="Mappa megnyitása a számítógépről"
              >
                <FolderOpen size={14} />
              </button>
              <button
                type="button"
                className="btn-subtle sidebar-header-btn"
                onClick={() => {
                  const name = window.prompt('Új kategória / mappa neve (pl. Informatika, Kémia, Szakdolgozat):')
                  if (name && name.trim() && onCreateFolder) {
                    onCreateFolder(null, name.trim(), '')
                  }
                }}
                title="Új kategória / mappa létrehozása a gyökérben"
              >
                <FolderPlus size={14} />
              </button>
              <button
                type="button"
                className="btn-subtle sidebar-header-btn"
                onClick={handleRefresh}
                title="Projektek újratöltése"
              >
                <RefreshCw size={13} className={isRefreshing ? 'spinner' : ''} />
              </button>
              <button
                type="button"
                className="btn-subtle sidebar-header-btn sidebar-collapse-btn"
                onClick={onToggleCollapse}
                title="Fájlkezelő becsukása vékony sávra (⌘B)"
              >
                <PanelLeftClose size={14} />
              </button>
            </div>
          </div>

          {/* Helyi munkakönyvtár jelvény vagy felhívás */}
          {pendingWorkspaceName ? (
            <div
              onClick={onGrantPermission}
              style={{
                padding: '7px 12px',
                fontSize: 11,
                background: 'rgba(245, 158, 11, 0.12)',
                borderBottom: '1px solid rgba(245, 158, 11, 0.3)',
                color: '#f59e0b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer'
              }}
              title="Kattints ide a mappa hozzáférésének feloldásához!"
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <FolderOpen size={13} style={{ flexShrink: 0 }} />
                <span><strong>{pendingWorkspaceName}</strong> mappa elérése</span>
              </span>
              <button
                type="button"
                className="btn btn-primary"
                style={{ fontSize: 10, padding: '2px 8px', height: 'auto', background: '#f59e0b', borderColor: '#d97706', color: '#000', fontWeight: 600 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onGrantPermission?.();
                }}
              >
                Feloldás
              </button>
            </div>
          ) : localWorkspaceName ? (
            <div
              style={{
                padding: '6px 12px',
                fontSize: 11,
                background: 'rgba(255, 255, 255, 0.04)',
                borderBottom: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <span
                onClick={onOpenSettings}
                style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer', flex: 1 }}
                title="Kattints a beállítások megnyitásához vagy mappa módosításához"
              >
                <HardDrive size={13} style={{ flexShrink: 0, color: 'var(--accent)' }} />
                <span><strong style={{ color: 'var(--text-primary)' }}>{localWorkspaceName}</strong> (saját gép)</span>
              </span>
              {onDisconnectLocalFolder && (
                <button
                  type="button"
                  className="btn-subtle"
                  onClick={onDisconnectLocalFolder}
                  style={{ padding: '2px 4px', color: 'var(--text-muted)' }}
                  title="Helyi mappa leválasztása"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ) : (
            <div
              onClick={onPickLocalFolder || onOpenSettings}
              style={{
                padding: '7px 12px',
                fontSize: 11,
                background: 'rgba(255, 255, 255, 0.03)',
                borderBottom: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer'
              }}
              title="Kattints saját mappa megnyitásához a számítógépeden"
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <FolderOpen size={13} style={{ flexShrink: 0, color: 'var(--accent)' }} />
                <span>Mappa megnyitása...</span>
              </span>
              <span style={{ fontSize: 9.5, background: 'rgba(255, 255, 255, 0.08)', color: 'var(--text-primary)', border: '0.5px solid rgba(255, 255, 255, 0.12)', padding: '2px 6px', borderRadius: 4, fontWeight: 500 }}>Tallózás</span>
            </div>
          )}

          {/* Kompakt 28px-es szegmentált akciógomb sor: [ + Üres ] [ ⊞ Sablon ] [ ⤒ Import ] */}
          <div className="sidebar-actions-segmented-wrap">
            <div className="sidebar-actions-segmented">
              <button
                type="button"
                className="sidebar-seg-btn sidebar-blank-btn"
                onClick={onNewBlankDoc}
                title="Új üres dokumentum létrehozása sablon nélkül"
              >
                <Plus size={13} />
                <span>Üres</span>
              </button>
              <button
                type="button"
                className="sidebar-seg-btn"
                onClick={onNewDoc}
                title="Új dokumentum létrehozása sablonból"
              >
                <LayoutTemplate size={12} />
                <span>Sablon</span>
              </button>
              <button
                type="button"
                className="sidebar-seg-btn"
                onClick={onImportDoc}
                title="Létező .tex fájl importálása a számítógépről"
              >
                <Upload size={12} />
                <span>Import</span>
              </button>
            </div>
          </div>

          {/* Keresőmező */}
          <div className="sidebar-search-box">
            <div className="search-input-wrap">
              <Search size={13} className="search-input-icon" />
              <input
                className="sidebar-search-input"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Dokumentum keresése..."
              />
            </div>
          </div>

          {/* Törzs */}
          <div className="sidebar-body">
            {/* Tantárgy / Mappa fa lista */}

            {/* Tantárgy / Mappa fa lista */}
            {Object.entries(filteredTree).map(([subject, node]) => {
              // Ha a node közvetlenül mappa objektum vagy régi tömb
              const folderNode = Array.isArray(node)
                ? { name: subject, path: '', subject, isFolder: true, files: node, folders: [], totalCount: node.length }
                : node
              return renderFolderNode(folderNode, 0)
            })}

            {Object.keys(filteredTree).length === 0 && (
              <div className="sidebar-empty-state" style={{ padding: '24px 14px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
                {searchTerm ? (
                  <div>Nincs a keresésnek megfelelő dokumentum.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
                    <Folder size={28} style={{ opacity: 0.3, marginBottom: 2 }} />
                    <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: 13 }}>Tiszta munkakörnyezet</div>
                    <div style={{ fontSize: 11, lineHeight: 1.4, color: 'var(--text-muted)' }}>
                      A munkakönyvtárad jelenleg üres. Hozz létre egy új kategóriát vagy kezdj egy üres dokumentummal!
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ fontSize: 11, padding: '5px 12px' }}
                        onClick={onPickLocalFolder || onOpenSettings}
                      >
                        <FolderOpen size={13} style={{ marginRight: 6 }} />
                        Mappa megnyitása
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ fontSize: 11, padding: '5px 12px' }}
                        onClick={() => {
                          const name = window.prompt('Új kategória / mappa neve (pl. Informatika, Kémia, Szakdolgozat):')
                          if (name && name.trim() && onCreateFolder) {
                            onCreateFolder(null, name.trim(), '')
                          }
                        }}
                      >
                        <FolderPlus size={13} style={{ marginRight: 6 }} />
                        + Új kategória
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Rendszerállapot Lábléc */}
          <div className="sidebar-footer-card">
            <div className="system-status-item">
              <div className="system-status-label">
                <Cpu size={12} />
                <span>AI Motor:</span>
              </div>
              <span style={{ color: apiOk ? 'var(--success)' : 'var(--error)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                {apiOk ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                {activeModel.replace('gemini-', '').toUpperCase()}
              </span>
            </div>
            <div className="system-status-item">
              <div className="system-status-label">
                <FileText size={12} />
                <span>TeX Live:</span>
              </div>
              <span style={{ color: 'var(--success)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                <CheckCircle2 size={12} />
                pdflatex
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Dokumentum áthelyezése modál */}
      {moveTargetFile && (
        <MoveDocModal
          file={moveTargetFile}
          availableFolders={availableFolders}
          onClose={() => setMoveTargetFile(null)}
          onConfirm={async (file, targetDir) => {
            setMoveTargetFile(null)
            await onMoveFile?.(file, targetDir)
          }}
        />
      )}
    </div>
  )
}
