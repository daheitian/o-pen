import { useState, useEffect } from 'react';
import type { KeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import ConfirmDeleteDialog from './ConfirmDeleteDialog';
import RenameTagDialog from './RenameTagDialog';
import type { Stats, TagInfo } from '../types';

type SidebarProps = {
  stats: Stats;
  activeTag: string | null;
  setActiveTag: (tag: string | null) => void;
  noteCount: number;
  onRefreshData?: () => void;
};

export default function Sidebar({ stats, activeTag, setActiveTag, noteCount, onRefreshData }: SidebarProps) {
  const { totalTags = 0, tagFrequency = {}, heatmap = [] } = stats;
  
  // Tag Manager States
  const [showTagManager, setShowTagManager] = useState(false);
  const [tagList, setTagList] = useState<TagInfo[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [editingTagName, setEditingTagName] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [deleteTagTarget, setDeleteTagTarget] = useState<string | null>(null);
  const [renameTagTarget, setRenameTagTarget] = useState<string | null>(null);

  // Fetch tags directly from DB when Tag Manager is opened
  const fetchTags = async () => {
    try {
      const res = await fetch('http://localhost:5005/api/tags');
      if (res.ok) {
        const data = await res.json() as TagInfo[];
        setTagList(data);
      }
    } catch (err) {
      console.error('[Sidebar] Failed to fetch tags:', err);
    }
  };

  useEffect(() => {
    if (showTagManager) {
      fetchTags();
    }
  }, [showTagManager]);

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    try {
      const res = await fetch('http://localhost:5005/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTagName })
      });
      if (res.ok) {
        setNewTagName('');
        await fetchTags();
        if (onRefreshData) onRefreshData();
      }
    } catch (err) {
      console.error('[Sidebar] Failed to create tag:', err);
    }
  };

  const handleRenameTag = async (oldName: string) => {
    const trimmed = editingValue.trim().replace(/^#/, '');
    if (!trimmed || oldName === trimmed) {
      setEditingTagName(null);
      return;
    }
    try {
      const res = await fetch(`http://localhost:5005/api/tags/${oldName}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName: trimmed })
      });
      if (res.ok) {
        setEditingTagName(null);
        await fetchTags();
        if (activeTag === oldName) {
          setActiveTag(trimmed);
        }
        if (onRefreshData) onRefreshData();
      }
    } catch (err) {
      console.error('[Sidebar] Failed to rename tag:', err);
    }
  };

  const deleteTag = async (name: string) => {
    try {
      const res = await fetch(`http://localhost:5005/api/tags/${name}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await fetchTags();
        if (activeTag === name) {
          setActiveTag(null);
        }
        if (onRefreshData) onRefreshData();
      }
    } catch (err) {
      console.error('[Sidebar] Failed to delete tag:', err);
    }
  };

  const requestDeleteTag = (name: string) => {
    setContextMenu(null);
    setRenameTagTarget(null);
    setDeleteTagTarget(name);
  };

  const requestRenameTag = (name: string) => {
    setDeleteTagTarget(null);
    setRenameTagTarget(name);
    setContextMenu(null);
  };

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tagName: string } | null>(null);

  const handleContextMenu = (e: ReactMouseEvent<HTMLElement>, tagName: string) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      tagName
    });
  };

  useEffect(() => {
    const handleCloseMenu = () => {
      if (contextMenu) setContextMenu(null);
    };
    window.addEventListener('click', handleCloseMenu);
    return () => window.removeEventListener('click', handleCloseMenu);
  }, [contextMenu]);

  const renameTag = async (oldName: string, newName: string) => {
    const trimmed = newName.replace(/^#/, '');
    if (!trimmed || oldName === trimmed) return;
    try {
      const res = await fetch(`http://localhost:5005/api/tags/${oldName}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName: trimmed })
      });
      if (res.ok) {
        if (activeTag === oldName) {
          setActiveTag(trimmed);
        }
        await fetchTags();
        if (onRefreshData) onRefreshData();
      }
    } catch (err) {
      console.error('[Sidebar] Context rename tag failed:', err);
    }
  };

  const handleContextCopy = (tagName: string) => {
    navigator.clipboard.writeText(`#${tagName}`).catch(err => {
      console.error('[Sidebar] Copy failed:', err);
    });
  };

  // Generate date cells for the contribution heatmap (past 12 weeks = 84 days)
  const renderHeatmap = () => {
    const cells: ReactNode[] = [];
    const today = new Date();
    
    // Create map of date string -> count for fast lookup
    const heatmapMap: Record<string, number> = {};
    heatmap.forEach(item => {
      heatmapMap[item.date] = item.count;
    });

    // Go back 83 days to cover 12 full weeks
    for (let i = 83; i >= 0; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const count = heatmapMap[dateStr] || 0;
      
      let levelClass = '';
      if (count === 1) levelClass = 'level-1';
      else if (count >= 2 && count <= 3) levelClass = 'level-2';
      else if (count >= 4 && count <= 5) levelClass = 'level-3';
      else if (count >= 6) levelClass = 'level-4';

      cells.push(
        <div
          key={dateStr}
          className={`heatmap-cell ${levelClass}`}
          title={`${dateStr}: ${count} notes`}
        />
      );
    }
    return cells;
  };

  // Get month labels to show under the heatmap
  const getMonthLabels = () => {
    const today = new Date();
    const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
    
    const date1 = new Date(); date1.setDate(today.getDate() - 60);
    const date2 = new Date(); date2.setDate(today.getDate() - 30);
    
    return (
      <div className="heatmap-months">
        <span>{monthNames[date1.getMonth()]}</span>
        <span>{monthNames[date2.getMonth()]}</span>
        <span>{monthNames[today.getMonth()]}</span>
      </div>
    );
  };

  return (
    <aside className="sidebar-column">
      {/* Profile */}
      <div className="profile-section">
        <img 
          src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80" 
          alt="Avatar" 
          className="profile-avatar"
        />
        <div className="profile-info">
          <h3>Neonity2026</h3>
          <span>PRO</span>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-item">
          <span className="stat-val">{noteCount}</span>
          <span className="stat-lbl">笔记</span>
        </div>
        <div className="stat-item">
          <span className="stat-val">{totalTags}</span>
          <span className="stat-lbl">标签</span>
        </div>
        <div className="stat-item">
          <span className="stat-val">{heatmap.length}</span>
          <span className="stat-lbl">活跃天</span>
        </div>
      </div>

      {/* Heatmap */}
      <div className="heatmap-section">
        <div className="heatmap-title">笔记热力图 (过去12周)</div>
        <div className="heatmap-grid">
          {renderHeatmap()}
        </div>
        {getMonthLabels()}
      </div>

      {/* Navigation */}
      <ul className="sidebar-menu">
        <li 
          className={`menu-item ${!activeTag ? 'active' : ''}`}
          onClick={() => setActiveTag(null)}
        >
          <span>📁 全部笔记</span>
          <span className="menu-count">{noteCount}</span>
        </li>
      </ul>

      {/* Tag List Header */}
      <div className="tag-list-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: '16px' }}>
        <span>全部标签</span>
        <span 
          title="管理标签" 
          onClick={() => setShowTagManager(true)}
          style={{ cursor: 'pointer', fontSize: '14px', transition: 'var(--transition)' }}
          className="action-icon"
        >
          ⚙️
        </span>
      </div>

      {/* Tag List */}
      <div className="sidebar-tags">
        {Object.entries(tagFrequency).length === 0 ? (
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>暂无标签</span>
        ) : (
          Object.entries(tagFrequency).map(([tag, freq]) => (
            <span
              key={tag}
              className={`tag-badge ${activeTag === tag ? 'active' : ''}`}
              onClick={() => setActiveTag(tag === activeTag ? null : tag)}
              onContextMenu={(e) => handleContextMenu(e, tag)}
              style={{
                backgroundColor: activeTag === tag ? 'var(--primary-color)' : '',
                color: activeTag === tag ? 'white' : ''
              }}
            >
              #{tag} ({freq})
            </span>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="sidebar-footer">
        <span style={{ cursor: 'pointer' }} onClick={() => setShowTagManager(true)}>⚙️ 标签管理</span>
        <span>🚪 退出</span>
      </div>

      {/* Tag Manager Modal backdrop */}
      {showTagManager && (
        <div className="modal-backdrop" onClick={() => setShowTagManager(false)}>
          <div className="tag-manager-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>标签管理</h4>
              <button className="close-btn" onClick={() => setShowTagManager(false)}>✕</button>
            </div>
            
            {/* Add Tag Section */}
            <div className="add-tag-box">
              <input 
                type="text" 
                placeholder="输入标签名并回车新建..." 
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleCreateTag()}
              />
              <button onClick={handleCreateTag}>新建</button>
            </div>
            
            {/* Tags List */}
            <div className="modal-tag-list">
              {tagList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '13px' }}>
                  暂无标签，在正文中使用 #标签 或点击上方新建。
                </div>
              ) : (
                tagList.map(tag => (
                  <div key={tag.name} className="modal-tag-item">
                    {editingTagName === tag.name ? (
                      <input 
                        type="text" 
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleRenameTag(tag.name)}
                        autoFocus
                      />
                    ) : (
                      <span className="tag-name-display">
                        #{tag.name} <span className="tag-count">({tag.count})</span>
                      </span>
                    )}
                    
                    <div className="tag-item-actions">
                      {editingTagName === tag.name ? (
                        <>
                          <button title="保存" onClick={() => handleRenameTag(tag.name)}>💾</button>
                          <button title="取消" onClick={() => setEditingTagName(null)}>✕</button>
                        </>
                      ) : (
                        <>
                          <button title="重命名" onClick={() => { setEditingTagName(tag.name); setEditingValue(tag.name); }}>✏️</button>
                          <button title="删除标签" onClick={() => requestDeleteTag(tag.name)} className="delete-btn">🗑️</button>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tag Badge Context Menu */}
      {contextMenu && (
        <div 
          className="tag-context-menu" 
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
        >
          <div 
            className="context-menu-item"
            onClick={() => requestRenameTag(contextMenu.tagName)}
          >
            ✏️ 重命名标签
          </div>
          <div 
            className="context-menu-item delete"
            onClick={() => requestDeleteTag(contextMenu.tagName)}
          >
            🗑️ 删除标签
          </div>
          <div 
            className="context-menu-item"
            onClick={() => handleContextCopy(contextMenu.tagName)}
          >
            📋 复制标签名
          </div>
        </div>
      )}

      {deleteTagTarget && (
        <ConfirmDeleteDialog
          title={`删除标签 #${deleteTagTarget}？`}
          description="这会从所有关联卡片的文本中移去标签符号（保留纯文字）。"
          confirmLabel="删除标签"
          preview={`#${deleteTagTarget}`}
          onCancel={() => setDeleteTagTarget(null)}
          onConfirm={() => {
            const name = deleteTagTarget;
            if (!name) return;
            setDeleteTagTarget(null);
            void deleteTag(name);
          }}
        />
      )}

      {renameTagTarget && (
        <RenameTagDialog
          tagName={renameTagTarget}
          onCancel={() => setRenameTagTarget(null)}
          onConfirm={(newName) => {
            const oldName = renameTagTarget;
            if (!oldName) return;
            setRenameTagTarget(null);
            void renameTag(oldName, newName);
          }}
        />
      )}
    </aside>
  );
}
