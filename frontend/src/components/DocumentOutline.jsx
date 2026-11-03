import { useState, useMemo } from 'react'
import {
  ListTree,
  X,
  Search,
  BookOpen,
  Bookmark,
  Layers,
  Presentation,
  CheckSquare,
  Sparkles,
  HelpCircle,
  Square,
  Image,
  Table,
  ArrowRight,
  ChevronRight,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  RefreshCw
} from 'lucide-react'

/**
 * Lineáris outline elemek fa-struktúrába (hierarchiába) szervezése a szintek (level) alapján.
 */
function buildOutlineTree(flatItems) {
  const root = []
  const stack = []

  for (const item of flatItems) {
    const node = { ...item, children: [] }

    while (stack.length > 0 && stack[stack.length - 1].level >= item.level) {
      stack.pop()
    }

    if (stack.length === 0) {
      root.push(node)
    } else {
      stack[stack.length - 1].children.push(node)
    }

    stack.push(node)
  }

  return root
}

/**
 * Keresés szűrése a fában (a találatok szüleit megtartva).
 */
function filterOutlineTree(nodes, query) {
  if (!query) return nodes
  const q = query.toLowerCase()

  function matchNode(node) {
    const isMatch =
      node.title.toLowerCase().includes(q) || node.type.toLowerCase().includes(q)
    const filteredChildren = (node.children || []).map(matchNode).filter(Boolean)

    if (isMatch || filteredChildren.length > 0) {
      return {
        ...node,
        children: filteredChildren
      }
    }
    return null
  }

  return nodes.map(matchNode).filter(Boolean)
}

function OutlineTreeNode({
  node,
  depth,
  collapsedIds,
  toggleCollapse,
  onJumpToLine,
  getItemIcon
}) {
  const isCollapsed = collapsedIds.has(node.id)
  const hasChildren = node.children && node.children.length > 0

  return (
    <div className="outline-node-container">
      <div
        className={`outline-item level-${node.level} type-${node.type} ${
          isCollapsed ? 'is-collapsed' : ''
        }`}
        onClick={() => onJumpToLine(node.line)}
        onDoubleClick={(e) => {
          if (hasChildren) {
            e.stopPropagation()
            toggleCollapse(node.id)
          }
        }}
        title={`${node.title} (Sor: ${node.line}) — Kattints az ugráshoz${
          hasChildren ? ' · Dupla kattintás az összecsukáshoz' : ''
        }`}
      >
        {/* Vízszintes fa-vezetők (Tree Indent Guides) */}
        {node.level > 0 && (
          <div className="outline-indent-guides">
            {Array.from({ length: node.level }).map((_, idx) => (
              <span
                key={idx}
                className={`outline-tree-guide ${idx === node.level - 1 ? 'last-guide' : ''}`}
              />
            ))}
          </div>
        )}

        {/* Összecsukó / Kinyitó gomb (>) a fejezeteknél és csoportoknál */}
        {hasChildren ? (
          <button
            className={`outline-collapse-btn ${isCollapsed ? 'collapsed' : 'expanded'}`}
            onClick={(e) => {
              e.stopPropagation()
              toggleCollapse(node.id)
            }}
            title={isCollapsed ? 'Kinyitás' : 'Összecsukás'}
          >
            {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          </button>
        ) : (
          <span className="outline-collapse-spacer" />
        )}

        <div className="outline-item-icon">{getItemIcon(node.type)}</div>

        {/* Szintjelző címke (H1, H2, H3) */}
        {node.type === 'section' && <span className="outline-level-pill h1">§</span>}
        {node.type === 'subsection' && <span className="outline-level-pill h2">H2</span>}
        {node.type === 'subsubsection' && <span className="outline-level-pill h3">H3</span>}

        <div className="outline-item-title">{node.title}</div>

        {/* Összecsukott állapotban megjelenő elemszám badge */}
        {hasChildren && isCollapsed && (
          <span
            className="outline-child-count-pill"
            title={`${node.children.length} beágyazott elem összecsukva`}
          >
            {node.children.length}
          </span>
        )}

        <div className="outline-item-line">L{node.line}</div>
        <ArrowRight size={11} className="outline-item-arrow" />
      </div>

      {/* Gyermek elemek megjelenítése, ha nincs összecsukva */}
      {!isCollapsed && hasChildren && (
        <div className="outline-children-wrap">
          {node.children.map((child) => (
            <OutlineTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              collapsedIds={collapsedIds}
              toggleCollapse={toggleCollapse}
              onJumpToLine={onJumpToLine}
              getItemIcon={getItemIcon}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function DocumentOutline({
  outline,
  onJumpToLine,
  onClose,
  width,
  onFixStructure,
  isFixingStructure
}) {
  const [search, setSearch] = useState('')
  const [collapsedIds, setCollapsedIds] = useState(new Set())

  // Fa-struktúra felépítése a lineáris outline listából
  const tree = useMemo(() => buildOutlineTree(outline), [outline])

  // Szűrt fa keresés esetén
  const filteredTree = useMemo(() => {
    return filterOutlineTree(tree, search.trim())
  }, [tree, search])

  // Egy adott elem összecsukásának / kinyitásának váltása
  const toggleCollapse = (id) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // Összes fejezet összecsukása
  const handleCollapseAll = () => {
    const parentIds = []
    const collectParents = (nodes) => {
      for (const node of nodes) {
        if (node.children && node.children.length > 0) {
          parentIds.push(node.id)
          collectParents(node.children)
        }
      }
    }
    collectParents(tree)
    setCollapsedIds(new Set(parentIds))
  }

  // Összes fejezet kinyitása
  const handleExpandAll = () => {
    setCollapsedIds(new Set())
  }

  const getItemIcon = (type) => {
    switch (type) {
      case 'part':
      case 'chapter':
        return <BookOpen size={13} color="#8ec5ff" />
      case 'section':
        return <Bookmark size={13} color="#64a8ff" />
      case 'subsection':
        return <Layers size={12} color="#38bdf8" />
      case 'subsubsection':
        return <Layers size={11} color="#94a3b8" />
      case 'frame':
        return <Presentation size={13} color="#c084fc" />
      case 'theorem':
        return <Sparkles size={12} color="#fbbf24" />
      case 'definition':
        return <HelpCircle size={12} color="#34d399" />
      case 'task':
        return <CheckSquare size={12} color="#38bdf8" />
      case 'example':
        return <Bookmark size={12} color="#2dd4bf" />
      case 'proof':
        return <Bookmark size={12} color="#a78bfa" />
      case 'box':
        return <Square size={12} color="#bf5af2" />
      case 'figure':
        return <Image size={12} color="#f472b6" />
      case 'table':
        return <Table size={12} color="#fb923c" />
      default:
        return <Bookmark size={12} color="#94a3b8" />
    }
  }

  return (
    <div className="outline-panel" style={width ? { width: `${width}px` } : undefined}>
      {/* Fejléc */}
      <div className="outline-header">
        <div className="outline-title">
          <ListTree size={15} color="var(--accent-light)" />
          <span>Szerkezeti Fa (TOC)</span>
          <span className="sidebar-count-badge">{outline.length}</span>
        </div>

        <div className="outline-header-actions">
          <button
            className="btn-subtle"
            onClick={handleCollapseAll}
            title="Összes fejezet összecsukása"
            style={{ padding: '3px 6px' }}
          >
            <ChevronsDownUp size={13} />
          </button>
          <button
            className="btn-subtle"
            onClick={handleExpandAll}
            title="Összes fejezet kinyitása"
            style={{ padding: '3px 6px' }}
          >
            <ChevronsUpDown size={13} />
          </button>
          {onClose && (
            <button
              className="btn-subtle"
              onClick={onClose}
              title="Vázlat panel bezárása"
              style={{ padding: '3px 6px' }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Keresőmező */}
      <div className="outline-search-wrap">
        <Search size={13} className="outline-search-icon" />
        <input
          type="text"
          className="outline-search-input"
          placeholder="Keresés a vázlatban..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button className="outline-search-clear" onClick={() => setSearch('')}>
            <X size={12} />
          </button>
        )}
      </div>

      {/* Intelligens TOC és Szintek javítása gomb a Vázlat panelben */}
      {onFixStructure && (
        <div className="outline-fix-bar">
          <button
            type="button"
            className="outline-fix-btn"
            onClick={onFixStructure}
            disabled={isFixingStructure}
            title="Dokumentum átnézése és javítása a TOC alapján (számozások és szintek normalizálása)"
          >
            {isFixingStructure ? (
              <>
                <RefreshCw size={12} className="spinner" />
                <span>TOC & szintek javítása...</span>
              </>
            ) : (
              <>
                <Sparkles size={12} color="var(--accent-light, #38bdf8)" />
                <span>TOC és szintek javítása</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Fa-struktúrájú, összecsukható elemek listája */}
      <div className="outline-list">
        {filteredTree.length === 0 ? (
          <div className="outline-empty">
            {search
              ? 'Nincs találat a keresésre.'
              : 'Még nincsenek azonosítható fejezetek vagy tételek.'}
          </div>
        ) : (
          filteredTree.map((node) => (
            <OutlineTreeNode
              key={node.id}
              node={node}
              depth={0}
              collapsedIds={collapsedIds}
              toggleCollapse={toggleCollapse}
              onJumpToLine={onJumpToLine}
              getItemIcon={getItemIcon}
            />
          ))
        )}
      </div>
    </div>
  )
}
