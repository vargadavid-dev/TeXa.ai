import React, { useState, useEffect } from 'react'
import axios from 'axios'
import {
  Settings,
  Folder,
  Key,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Loader2,
  X,
  ShieldCheck,
  RefreshCw,
  FolderOpen,
  HardDrive,
  FolderCheck,
  Unlink,
  RotateCcw,
  Lightbulb,
  Trash2,
  Info
} from 'lucide-react'
import { apiKeyManager } from '../utils/apiKeyManager'
import { localWorkspace } from '../utils/localWorkspaceManager'

export default function SettingsModal({
  isOpen,
  onClose,
  onWorkspaceChanged,
  onApiKeyChanged,
  addNotif,
  initialTab = 'workspace'
}) {
  const [activeTab, setActiveTab] = useState(initialTab === 'apikey' ? 'apikey' : 'workspace') // 'workspace' | 'apikey'

  // Helyi (Saját gép) Workspace állapot
  const [localDirName, setLocalDirName] = useState('')
  const [localDirHandle, setLocalDirHandle] = useState(null)
  const [isSupportedBrowser, setIsSupportedBrowser] = useState(true)
  const [selectingLocalDir, setSelectingLocalDir] = useState(false)
  const [workspaceStats, setWorkspaceStats] = useState({ foldersCount: 0, filesCount: 0 })
  const [workspaceError, setWorkspaceError] = useState('')

  // Szerver-oldali Munkakönyvtár állapot (Safari és natív macOS támogatáshoz)
  const [serverConfig, setServerConfig] = useState(null)
  const [customPathInput, setCustomPathInput] = useState('')
  const [showManualPath, setShowManualPath] = useState(false)
  const [savingPath, setSavingPath] = useState(false)

  // API kulcs állapot
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [testingKey, setTestingKey] = useState(false)
  const [keyValidation, setKeyValidation] = useState(null) // null | { valid: boolean, message: string }

  const fetchServerConfig = async () => {
    try {
      const res = await axios.get('/api/config')
      if (res.data?.success) {
        setServerConfig(res.data)
        if (res.data.projectsRootDirectory) {
          setCustomPathInput(res.data.projectsRootDirectory)
        }
      }
    } catch (err) {
      console.warn('Hiba a szerver munkakönyvtár lekérésekor:', err)
    }
  }

  useEffect(() => {
    if (isOpen) {
      if (initialTab === 'workspace' || initialTab === 'apikey') {
        setActiveTab(initialTab)
      }
      const supported = localWorkspace.isSupported()
      setIsSupportedBrowser(supported)
      checkSavedLocalWorkspace()
      fetchServerConfig()
      setApiKeyInput(apiKeyManager.getKey())
      setKeyValidation(null)
      setWorkspaceError('')
    }
  }, [isOpen, initialTab])

  const checkSavedLocalWorkspace = async () => {
    try {
      const saved = await localWorkspace.getSavedDirectory()
      if (saved) {
        const handle = saved.handle || saved
        setLocalDirHandle(handle)
        setLocalDirName(handle.name)
        try {
          const tree = await localWorkspace.readDirectoryTree(handle)
          setWorkspaceStats({ foldersCount: tree.folders.length, filesCount: tree.totalCount })
        } catch {
          // Ha még nincs újra engedélyezve a futó munkamenetben
        }
      } else {
        setLocalDirHandle(null)
        setLocalDirName('')
      }
    } catch (e) {
      console.warn('Hiba a helyi mappa betöltésekor:', e)
    }
  }

  // Mappa kiválasztása a számítógépen
  const handlePickLocalDirectory = async () => {
    setSelectingLocalDir(true)
    setWorkspaceError('')
    try {
      if (localWorkspace.isSupported()) {
        try {
          const handle = await localWorkspace.selectDirectory()
          if (handle) {
            setLocalDirHandle(handle)
            setLocalDirName(handle.name)
            const tree = await localWorkspace.readDirectoryTree(handle)
            setWorkspaceStats({ foldersCount: tree.folders.length, filesCount: tree.totalCount })
            if (addNotif) {
              addNotif(`Munkakönyvtár csatlakoztatva: ${handle.name}`, 'success')
            }
            if (onWorkspaceChanged) {
              onWorkspaceChanged(handle)
            }
            return
          }
        } catch (pickErr) {
          if (pickErr.name === 'AbortError') return
          console.warn('Mappa választó hiba:', pickErr)
        }
      } else {
        setWorkspaceError('A böngésződ (Safari/Firefox) nem támogatja a közvetlen merevlemez-mappahozzáférést. A bal oldali sávban lévő fájlokat közvetlenül tudod szerkeszteni, új fájlokat pedig az „Importálás” gombbal tölthetsz be!')
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        const msg = err.message || 'Nem sikerült kiválasztani a mappát'
        setWorkspaceError(msg)
      }
    } finally {
      setSelectingLocalDir(false)
    }
  }

  const handleSaveCustomPath = async (pathOverride = null) => {
    const targetPath = (typeof pathOverride === 'string' ? pathOverride : customPathInput).trim()
    if (!targetPath) {
      setWorkspaceError('Kérlek adj meg egy érvényes mappa elérési utat!')
      return
    }
    setSavingPath(true)
    setWorkspaceError('')
    try {
      const res = await axios.post('/api/config/workspace', {
        projectsRootDirectory: targetPath
      })
      if (res.data?.success) {
        setServerConfig(prev => ({
          ...prev,
          projectsRootDirectory: res.data.projectsRootDirectory,
          stats: res.data.stats,
          isDefault: res.data.isDefault
        }))
        setCustomPathInput(res.data.projectsRootDirectory)
        const parts = res.data.projectsRootDirectory.split(/[\/\\]/).filter(Boolean)
        const folderName = parts[parts.length - 1] || 'Munkakönyvtár'
        if (addNotif) {
          addNotif(`Munkakönyvtár beállítva: ${folderName}`, 'success')
        }
        if (onWorkspaceChanged) {
          onWorkspaceChanged(null)
        }
      }
    } catch (err) {
      setWorkspaceError(err.response?.data?.error || err.message || 'Hiba a mappa beállításakor')
    } finally {
      setSavingPath(false)
    }
  }

  const handleResetDefault = async () => {
    setSelectingLocalDir(true)
    setWorkspaceError('')
    try {
      if (localDirHandle) {
        await localWorkspace.disconnectDirectory()
        setLocalDirHandle(null)
        setLocalDirName('')
      }
      const res = await axios.post('/api/config/reset-default')
      if (res.data?.success) {
        setServerConfig(prev => ({
          ...prev,
          projectsRootDirectory: res.data.projectsRootDirectory,
          stats: res.data.stats,
          isDefault: true
        }))
        setCustomPathInput(res.data.projectsRootDirectory)
        if (addNotif) {
          addNotif('Visszaállítva az alapértelmezett projektek mappára!', 'info')
        }
        if (onWorkspaceChanged) {
          onWorkspaceChanged(null)
        }
      }
    } catch (err) {
      setWorkspaceError(err.response?.data?.error || err.message || 'Hiba a visszaállítás során')
    } finally {
      setSelectingLocalDir(false)
    }
  }

  const handleDisconnectLocalDirectory = async () => {
    await localWorkspace.disconnectDirectory()
    setLocalDirHandle(null)
    setLocalDirName('')
    setWorkspaceStats({ foldersCount: 0, filesCount: 0 })
    if (addNotif) {
      addNotif('Helyi böngésző munkakönyvtár leválasztva, visszaállítva a szerver mappára.', 'info')
    }
    if (onWorkspaceChanged) {
      onWorkspaceChanged(null)
    }
  }

  const handleTestAndSaveKey = async () => {
    const trimmed = apiKeyInput.trim().replace(/^Bearer\s+/i, '').trim()
    if (trimmed !== apiKeyInput) {
      setApiKeyInput(trimmed)
    }
    if (!trimmed) {
      apiKeyManager.clearKey()
      setKeyValidation({ valid: false, message: 'API kulcs törölve. Az AI funkciókhoz új kulcs megadása szükséges.' })
      if (onApiKeyChanged) onApiKeyChanged()
      if (addNotif) addNotif('Saját API kulcs eltávolítva.', 'info')
      return
    }

    setTestingKey(true)
    setKeyValidation(null)

    try {
      const res = await axios.post('/api/ai/validate-key', { apiKey: trimmed }, {
        headers: { 'x-gemini-api-key': trimmed }
      })

      if (res.data.valid) {
        apiKeyManager.setKey(trimmed)
        setKeyValidation({ valid: true, message: 'API kulcs érvényes és működőképes!' })
        if (addNotif) addNotif('Saját Gemini API kulcs sikeresen elmentve!', 'success')
        if (onApiKeyChanged) onApiKeyChanged()
      } else {
        setKeyValidation({ valid: false, message: res.data.error || 'A kulcs ellenőrzése sikertelen.' })
      }
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || 'Hiba történt a kulcs ellenőrzése során.'
      setKeyValidation({ valid: false, message: errMsg })
    } finally {
      setTestingKey(false)
    }
  }

  const handleClearKey = () => {
    setApiKeyInput('')
    apiKeyManager.clearKey()
    setKeyValidation(null)
    if (onApiKeyChanged) onApiKeyChanged()
    if (addNotif) addNotif('Saját API kulcs törölve.', 'info')
  }

  if (!isOpen) return null

  const hasCustomKey = apiKeyManager.hasCustomKey()

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal settings-modal"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="modal-header">
          <div className="settings-header-left">
            <div className="settings-header-icon">
              <Settings size={18} />
            </div>
            <div>
              <h3 className="settings-header-title">Rendszerbeállítások &amp; Munkakörnyezet</h3>
              <p className="settings-header-subtitle">
                Projektek főkönyvtára a gépen és egyéni Gemini API kulcs kezelése
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn-subtle modal-close-btn"
            onClick={onClose}
            title="Bezárás"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Tabs */}
        <div className="settings-tabs-strip">
          <div className="settings-tabs-segmented">
            <button
              type="button"
              className={`settings-tab-btn ${activeTab === 'workspace' ? 'active' : ''}`}
              onClick={() => setActiveTab('workspace')}
            >
              <Folder size={14} />
              <span>Munkakönyvtár</span>
            </button>
            <button
              type="button"
              className={`settings-tab-btn ${activeTab === 'apikey' ? 'active' : ''}`}
              onClick={() => setActiveTab('apikey')}
            >
              <Key size={14} />
              <span>Gemini API Kulcs (BYOK)</span>
              {hasCustomKey && (
                <span className="settings-tab-dot" />
              )}
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="modal-body settings-modal-body">
          {activeTab === 'workspace' && (() => {
            const hasLocalHandle = Boolean(localDirHandle)
            const activePath = hasLocalHandle ? null : serverConfig?.projectsRootDirectory
            const activeName = hasLocalHandle
              ? localDirName
              : (serverConfig?.projectsRootDirectory
                  ? serverConfig.projectsRootDirectory.split(/[\/\\]/).filter(Boolean).pop()
                  : 'projektek')
            const activeStats = hasLocalHandle ? workspaceStats : (serverConfig?.stats || { foldersCount: 0, filesCount: 0 })
            const isDefaultDir = !hasLocalHandle && (serverConfig?.isDefault ?? true)

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Status card */}
                <div className={`settings-status-banner ${activeName ? 'active' : 'inactive'}`}>
                  <div className="settings-status-banner-left">
                    <div className="settings-status-banner-icon">
                      {activeName ? <FolderCheck size={20} /> : <HardDrive size={20} />}
                    </div>
                    <div>
                      <div className="settings-status-banner-title">
                        {activeName || 'Nincs csatlakoztatva helyi mappa'}
                      </div>
                      <div className="settings-status-banner-subtitle">
                        {activePath || (hasLocalHandle ? 'Mappa a számítógéped merevlemezén (a böngésző megjegyezte)' : 'Válassz ki egy mappát a saját gépeden (pl. Dokumentumok/LaTeX)')}
                      </div>
                    </div>
                  </div>

                  <span className={`settings-status-badge ${activeName ? 'active' : 'inactive'}`}>
                    <span className="settings-status-badge-dot" />
                    {activeName ? 'Csatlakoztatva' : 'Nincs kiválasztva'}
                  </span>
                </div>

                {activeName && (
                  <div className="settings-stats-row">
                    <span>Talált almappák: <strong style={{ color: '#f5f5f7' }}>{activeStats.foldersCount} db</strong></span>
                    <span>LaTeX (.tex) fájlok: <strong style={{ color: '#f5f5f7' }}>{activeStats.filesCount} db</strong></span>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handlePickLocalDirectory}
                    disabled={selectingLocalDir}
                    style={{ fontSize: 12, padding: '7px 14px' }}
                  >
                    {selectingLocalDir ? (
                      <Loader2 size={14} className="spinner" style={{ marginRight: 6 }} />
                    ) : (
                      <FolderOpen size={14} style={{ marginRight: 6 }} />
                    )}
                    Mappa tallózása a számítógépen
                  </button>

                  {!isDefaultDir && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={handleResetDefault}
                      disabled={selectingLocalDir}
                      style={{ fontSize: 12, color: 'var(--text-muted)' }}
                      title="Visszaállítás az alapértelmezett projektek mappára"
                    >
                      <RotateCcw size={13} style={{ marginRight: 4 }} />
                      Alapértelmezett visszaállítása
                    </button>
                  )}

                  {hasLocalHandle && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={handleDisconnectLocalDirectory}
                      style={{ fontSize: 12, color: '#f87171' }}
                      title="Mappa leválasztása"
                    >
                      <Unlink size={13} style={{ marginRight: 4 }} />
                      Leválasztás
                    </button>
                  )}
                </div>

                {/* Mappa elérési útja és gyors választó */}
                <div className="settings-guide-card">
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>Munkakönyvtár elérési útja a saját gépeden:</span>
                    <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>Abszolút útvonal vagy ~/</span>
                  </div>

                  <div className="settings-api-input-group">
                    <input
                      type="text"
                      className="form-input settings-api-key-input"
                      value={customPathInput}
                      onChange={e => {
                        setCustomPathInput(e.target.value)
                        setWorkspaceError('')
                      }}
                      placeholder="pl. /Users/.../Documents/LaTeX vagy ~/Documents/LaTeX"
                      style={{ flex: 1 }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleSaveCustomPath()
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-primary settings-action-btn"
                      onClick={() => handleSaveCustomPath()}
                      disabled={savingPath || !customPathInput.trim()}
                    >
                      {savingPath ? <Loader2 size={13} className="spinner" /> : 'Alkalmazás'}
                    </button>
                  </div>

                  {/* Gyors gombok / javaslatok */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 2 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 2 }}>Gyors választás:</span>
                    {(serverConfig?.suggestions || [
                      { name: 'Alapértelmezett (projektek)', path: serverConfig?.defaultDirectory || '' }
                    ]).map((sug, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => {
                          setCustomPathInput(sug.path)
                          handleSaveCustomPath(sug.path)
                        }}
                        disabled={savingPath}
                        style={{
                          fontSize: 11,
                          padding: '3.5px 9px',
                          background: customPathInput === sug.path ? 'var(--accent-dim)' : 'rgba(255, 255, 255, 0.05)',
                          border: `0.5px solid ${customPathInput === sug.path ? 'var(--accent)' : 'rgba(255, 255, 255, 0.12)'}`,
                          color: customPathInput === sug.path ? '#ffffff' : 'var(--text-secondary)',
                          borderRadius: 6
                        }}
                      >
                        {sug.name}
                      </button>
                    ))}
                  </div>
                </div>

                {workspaceError && (
                  <div className="settings-val-box invalid">
                    <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                    <span>{workspaceError}</span>
                  </div>
                )}

                {/* Safe storage notice */}
                <div className="settings-guide-note">
                  <ShieldCheck size={16} style={{ flexShrink: 0, color: 'var(--accent-light)', marginTop: 2 }} />
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                      100% Adatvédelem és Saját Tárhely
                    </div>
                    A fájljaid kizárólag a te számítógépeden tárolódnak. A szerver soha nem menti el a dokumentumaidat, csak a fordításhoz szükséges pillanatnyi szöveget kapja meg. Legközelebb a böngésző automatikusan felajánlja a folytatást ugyanezzel a mappával.
                  </div>
                </div>
            </div>
            )
          })()}

          {activeTab === 'apikey' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* API Status Banner */}
              <div className={`settings-status-banner ${hasCustomKey ? 'active' : 'inactive'}`}>
                <div className="settings-status-banner-left">
                  <div className="settings-status-banner-icon">
                    <ShieldCheck size={20} />
                  </div>
                  <div>
                    <div className="settings-status-banner-title">
                      {hasCustomKey
                        ? 'Saját Gemini API Kulcs Aktív'
                        : 'Nincs Beállítva Gemini API Kulcs'}
                    </div>
                    <div className="settings-status-banner-subtitle">
                      {hasCustomKey
                        ? `Maszkolt kulcs: ${apiKeyManager.getMaskedKey()} • Kizárólag a te böngésződben tárolva`
                        : 'Az AI generáláshoz és javításhoz add meg a saját ingyenes Google AI Studio kulcsodat'}
                    </div>
                  </div>
                </div>
                <span className={`settings-status-badge ${hasCustomKey ? 'active' : 'inactive'}`}>
                  <span className="settings-status-badge-dot" />
                  {hasCustomKey ? 'Aktív' : 'Nincs megadva'}
                </span>
              </div>

              {/* Input field */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ marginBottom: 6, fontWeight: 600, color: 'var(--text-primary)' }}>
                  Saját Google Gemini API Kulcs:
                </label>
                <div className="settings-api-input-group">
                  <div className="settings-api-input-wrap">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={apiKeyInput}
                      onChange={e => {
                        setApiKeyInput(e.target.value)
                        setKeyValidation(null)
                      }}
                      placeholder="AIzaSy... (illeszd be a Google AI Studio kulcsodat)"
                      className="form-input settings-api-key-input"
                    />
                    <button
                      type="button"
                      className="settings-eye-btn"
                      onClick={() => setShowKey(!showKey)}
                      title={showKey ? 'Kulcs elrejtése' : 'Kulcs megjelenítése'}
                    >
                      {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>

                  <button
                    type="button"
                    className="btn btn-primary settings-action-btn"
                    onClick={handleTestAndSaveKey}
                    disabled={testingKey}
                  >
                    {testingKey ? (
                      <>
                        <Loader2 size={14} className="spinner" />
                        <span>Tesztelés...</span>
                      </>
                    ) : (
                      <span>Tesztelés &amp; Mentés</span>
                    )}
                  </button>

                  {apiKeyInput && (
                    <button
                      type="button"
                      className="btn btn-secondary settings-delete-btn"
                      onClick={handleClearKey}
                      title="Kulcs törlése"
                    >
                      <Trash2 size={13} />
                      <span>Törlés</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Validation Result Box */}
              {keyValidation && (
                <div className={`settings-val-box ${keyValidation.valid ? 'valid' : 'invalid'}`}>
                  {keyValidation.valid ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                  <span>{keyValidation.message}</span>
                </div>
              )}

              {/* Guide card: How to get an API key */}
              <div className="settings-guide-card">
                <div className="settings-guide-header">
                  <div className="settings-guide-title">
                    <Lightbulb size={15} style={{ color: '#fbbf24' }} />
                    <span>Nincs még saját Gemini kulcsod?</span>
                  </div>
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="settings-guide-link"
                  >
                    <span>Google AI Studio megnyitása</span>
                    <ExternalLink size={12} />
                  </a>
                </div>

                <div className="settings-guide-steps">
                  <div className="settings-guide-step">
                    <span className="settings-guide-step-num">1</span>
                    <span>Nyisd meg a fenti hivatalos linket és jelentkezz be a meglévő Google fiókoddal.</span>
                  </div>
                  <div className="settings-guide-step">
                    <span className="settings-guide-step-num">2</span>
                    <span>Kattints a kék <strong>"Create API key"</strong> gombra.</span>
                  </div>
                  <div className="settings-guide-step">
                    <span className="settings-guide-step-num">3</span>
                    <span>Másold ki az <code className="settings-code-pill">AIzaSy...</code> kezdetű kulcsot és illeszd be a fenti mezőbe!</span>
                  </div>
                </div>

                <div className="settings-guide-note">
                  <Info size={14} style={{ flexShrink: 0, color: 'var(--accent-light)', marginTop: 1 }} />
                  <span>A Google havi bőkezű <strong>ingyenes kvótát</strong> biztosít bankkártya megadása nélkül! A kulcsod kizárólag a saját böngésződben tárolódik.</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="settings-modal-footer">
          <button
            type="button"
            className="btn btn-primary"
            onClick={onClose}
            style={{ padding: '6px 22px' }}
          >
            Kész
          </button>
        </div>
      </div>
    </div>
  )
}
