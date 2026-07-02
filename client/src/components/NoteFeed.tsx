import { useState, useRef, useEffect } from 'react';
import type { ChangeEvent, FormEvent, KeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import ConfirmDeleteDialog from './ConfirmDeleteDialog';
import NoteCardEditor from './NoteCardEditor';
import type { Note } from '../types';

type NoteFeedProps = {
  notes: Note[];
  activeTag: string | null;
  setActiveTag: (tag: string | null) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onAddNote: (content: string) => void;
  onUpdateNote: (id: string, content: string) => void;
  onDeleteNote: (id: string) => void;
  onMentionNote: (note: Note) => void;
  onAiAddTags: (note: Note) => void;
  onTogglePinNote: (note: Note) => void;
};

export default function NoteFeed({ 
  notes, 
  activeTag, 
  setActiveTag, 
  searchQuery, 
  setSearchQuery, 
  onAddNote, 
  onUpdateNote, 
  onDeleteNote,
  onMentionNote,
  onAiAddTags,
  onTogglePinNote
}: NoteFeedProps) {
  const [newContent, setNewContent] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [noteContextMenu, setNoteContextMenu] = useState<{ x: number; y: number; note: Note } | null>(null);
  const [deleteTargetNote, setDeleteTargetNote] = useState<Note | null>(null);
  
  // Linker states
  const [showLinker, setShowLinker] = useState(false);
  const [linkerSearch, setLinkerSearch] = useState('');
  const [linkerTriggerIdx, setLinkerTriggerIdx] = useState(-1);
  const [selectedLinkerIndex, setSelectedLinkerIndex] = useState(0);
  
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const noteContextMenuRef = useRef<HTMLDivElement | null>(null);

  // Close suggestions on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Element;
      if (showLinker && !target.closest('.card-linker-dropdown') && !target.closest('.card-editor textarea')) {
        setShowLinker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showLinker]);

  useEffect(() => {
    const closeMenu = (event: MouseEvent) => {
      const menu = noteContextMenuRef.current;
      if (menu && event.target instanceof Node && !menu.contains(event.target)) {
        setNoteContextMenu(null);
      }
    };
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setNoteContextMenu(null);
    };

    document.addEventListener('mousedown', closeMenu);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', closeMenu);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const insertCardLink = (targetId: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    const value = textarea.value;
    const before = value.slice(0, linkerTriggerIdx);
    const after = value.slice(textarea.selectionEnd);
    
    const linkString = `[[${targetId}]] `;
    const newValue = before + linkString + after;
    
    setNewContent(newValue);
    setShowLinker(false);
    setLinkerSearch('');
    
    // Focus back and place cursor after [[ID]]
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = linkerTriggerIdx + linkString.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const handleTextareaChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setNewContent(value);

    const cursorIdx = e.target.selectionStart;
    const textBeforeCursor = value.slice(0, cursorIdx);
    
    // Find the last index of "[[" before the cursor
    const lastDoubleBracketIdx = textBeforeCursor.lastIndexOf('[[');
    
    if (lastDoubleBracketIdx !== -1) {
      const queryPart = textBeforeCursor.slice(lastDoubleBracketIdx + 2);
      const hasSpace = /\s/.test(queryPart);
      const isClosed = queryPart.includes(']]');
      
      if (!hasSpace && !isClosed) {
        setShowLinker(true);
        setLinkerSearch(queryPart);
        setLinkerTriggerIdx(lastDoubleBracketIdx);
        setSelectedLinkerIndex(0);
      } else {
        setShowLinker(false);
      }
    } else {
      setShowLinker(false);
    }
  };

  const linkerSuggestions = showLinker ? notes.filter(note => {
    const search = linkerSearch.toLowerCase();
    return (
      note.id.toString().includes(search) ||
      note.content.toLowerCase().includes(search) ||
      note.tags.some(tag => tag.toLowerCase().includes(search))
    );
  }).slice(0, 5) : [];

  const handleImageUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('image', file);
    
    try {
      const res = await fetch('http://localhost:5005/api/upload', {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        const data = await res.json() as { url: string };
        insertText(`![image](${data.url})`);
      } else {
        alert('图片上传失败，请重试。');
      }
    } catch (err) {
      console.error('Upload error:', err);
      alert('上传图片出错，请检查后端服务连接。');
    }
  };

  // Auto-resize editor textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [newContent]);

  // Handle toolbar actions
  const insertText = (before: string, after = '') => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selected = text.substring(start, end);
    const replacement = before + selected + after;
    
    setNewContent(text.substring(0, start) + replacement + text.substring(end));
    
    // Focus back and set selection
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
    }, 0);
  };

  const createNote = () => {
    if (!newContent.trim()) return;
    onAddNote(newContent);
    setNewContent('');
  };

  const handleCreate = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    createNote();
  };

  const handleStartEdit = (note: Note) => {
    setEditingId(note.id);
    setEditingContent(note.content);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingContent('');
  };

  const handleNoteContextMenu = (e: ReactMouseEvent<HTMLDivElement>, note: Note) => {
    e.preventDefault();
    setNoteContextMenu({
      x: e.clientX,
      y: e.clientY,
      note
    });
  };

  const handleSaveEdit = (id: string) => {
    if (!editingContent.trim()) return;
    onUpdateNote(id, editingContent);
    setEditingId(null);
    setEditingContent('');
  };

  const handleCardLinkClick = (targetId: string) => {
    const element = document.getElementById(`note-card-${targetId}`);
    if (element) {
      // 1. Smooth scroll
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // 2. Glow effect animation
      element.classList.add('glow-highlight');
      setTimeout(() => {
        element.classList.remove('glow-highlight');
      }, 2000);
    } else {
      alert(`未找到卡片 (${targetId.slice(0, 8)})，可能该卡片已被删除`);
    }
  };

  // Helper to parse formatting (bold, tags, bullets, images, links, card links)
  const renderFormattedText = (text: string): ReactNode => {
    if (!text) return null;
    const lines = text.split('\n');
    
    return lines.map((line, idx) => {
      const isBullet = line.trim().startsWith('- ') || line.trim().startsWith('* ');
      const content = isBullet ? line.trim().substring(2) : line;
      
      const elements: ReactNode[] = [];
      const regex = /(\*\*.*?\*\*|#[a-zA-Z0-9_\u4e00-\u9fa5-]+|!\[.*?\]\(.*?\)|https?:\/\/[a-zA-Z0-9][-a-zA-Z0-9@:%._+~#=/?&()]*|\[\[[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\]\])/gi;
      const matches = [...content.matchAll(regex)];
      let lastIdx = 0;

      if (matches.length === 0) {
        elements.push(content);
      } else {
        matches.forEach((m, matchIdx) => {
          const matchText = m[0];
          const matchStart = m.index ?? 0;
          
          if (matchStart > lastIdx) {
            elements.push(content.substring(lastIdx, matchStart));
          }
          
          if (matchText.startsWith('**') && matchText.endsWith('**')) {
            const boldText = matchText.slice(2, -2);
            elements.push(<strong key={`bold-${matchIdx}`}>{boldText}</strong>);
          } else if (matchText.startsWith('#')) {
            const tagName = matchText.slice(1);
            elements.push(
              <span 
                key={`tag-${matchIdx}`} 
                className="card-tag" 
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveTag(tagName);
                }}
              >
                {matchText}
              </span>
            );
          } else if (matchText.startsWith('![') && matchText.endsWith(')')) {
            const urlMatch = matchText.match(/!\[(.*?)\]\((.*?)\)/);
            if (urlMatch) {
              const alt = urlMatch[1];
              const url = urlMatch[2];
              elements.push(
                <img 
                  key={`img-${matchIdx}`} 
                  src={url} 
                  alt={alt} 
                  style={{
                    maxWidth: '100%',
                    maxHeight: '300px',
                    borderRadius: 'var(--radius-sm)',
                    marginTop: '8px',
                    display: 'block',
                    border: '1px solid var(--border-color)'
                  }} 
                />
              );
            }
          } else if (matchText.startsWith('http://') || matchText.startsWith('https://')) {
            elements.push(
              <a 
                key={`link-${matchIdx}`} 
                href={matchText} 
                target="_blank" 
                rel="noopener noreferrer"
                className="card-link"
                style={{
                  color: 'var(--primary-color)',
                  textDecoration: 'underline',
                  wordBreak: 'break-all',
                  fontWeight: '500'
                }}
              >
                {matchText}
              </a>
            );
          } else if (matchText.startsWith('[[') && matchText.endsWith(']]')) {
            const targetId = matchText.slice(2, -2);
            elements.push(
              <span 
                key={`card-link-${matchIdx}`}
                className="card-link-pill"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCardLinkClick(targetId);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '2px',
                  backgroundColor: 'rgba(var(--primary-rgb), 0.1)',
                  color: 'var(--primary-color)',
                  padding: '1px 6px',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  fontWeight: '500',
                  border: '1px solid rgba(var(--primary-rgb), 0.2)',
                  fontSize: '0.9em',
                  userSelect: 'none'
                }}
              >
                🔗 卡片 #${targetId.slice(0, 8)}
              </span>
            );
          }
          lastIdx = matchStart + matchText.length;
        });

        if (lastIdx < content.length) {
          elements.push(content.substring(lastIdx));
        }
      }

      if (isBullet) {
        return (
          <ul key={idx} className="card-bullet-list" style={{ margin: '4px 0 4px 16px', paddingLeft: '5px' }}>
            <li style={{ listStyleType: 'disc' }}>{elements}</li>
          </ul>
        );
      }
      return <p key={idx} style={{ minHeight: '1.2em', margin: '4px 0' }}>{elements}</p>;
    });
  };

  // Filter notes locally by tag and search query
  const filteredNotes = notes.filter(note => {
    const matchesTag = !activeTag || note.tags.includes(activeTag);
    const matchesSearch = !searchQuery || 
      note.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesTag && matchesSearch;
  });

  return (
    <main className="feed-column">
      {/* Top Header Bar */}
      <div className="header-bar">
        <div className="header-title">
          {activeTag ? `#${activeTag}` : '全部笔记'}
        </div>
        <div className="search-box">
          <span>🔍</span>
          <input 
            type="text" 
            placeholder="搜索笔记或标签..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)' }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="feed-content">
        {/* Editor Box */}
        {!activeTag && (
          <form className="card-editor" onSubmit={handleCreate}>
            <div style={{ position: 'relative', width: '100%', display: 'flex', flexDirection: 'column' }}>
              <textarea
                ref={textareaRef}
                placeholder="在这里记录你的想法... 输入 [[ 可关联卡片，支持 #标签，**加粗**"
                value={newContent}
                onChange={handleTextareaChange}
                onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
                  if (showLinker && linkerSuggestions.length > 0) {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setSelectedLinkerIndex((prev) => (prev + 1) % linkerSuggestions.length);
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setSelectedLinkerIndex((prev) => (prev - 1 + linkerSuggestions.length) % linkerSuggestions.length);
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      const selectedSuggestion = linkerSuggestions[selectedLinkerIndex];
                      if (selectedSuggestion) insertCardLink(selectedSuggestion.id);
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setShowLinker(false);
                    }
                  } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    createNote();
                  }
                }}
              />
              
              {showLinker && linkerSuggestions.length > 0 && (
                <div className="card-linker-dropdown">
                  {linkerSuggestions.map((suggestion, index) => {
                    const previewText = suggestion.content.length > 40
                      ? suggestion.content.slice(0, 40) + '...'
                      : suggestion.content;
                    return (
                      <div
                        key={suggestion.id}
                        className={`linker-suggestion-item ${index === selectedLinkerIndex ? 'active' : ''}`}
                        onClick={() => insertCardLink(suggestion.id)}
                      >
                        <span className="linker-id-badge">#ID: {suggestion.id.slice(0, 8)}</span>
                        <span className="linker-text-preview">{previewText}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="editor-footer">
              <div className="editor-toolbar">
                <button type="button" className="toolbar-btn" title="插入标签" onClick={() => insertText('#')}>
                  #
                </button>
                <button type="button" className="toolbar-btn" title="文字加粗" onClick={() => insertText('**', '**')}>
                  Aa
                </button>
                <button type="button" className="toolbar-btn" title="无序列表" onClick={() => insertText('- ')}>
                  •—
                </button>
                <button type="button" className="toolbar-btn" title="上传图片" onClick={handleImageUploadClick}>
                  🖼️
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept="image/*" 
                  style={{ display: 'none' }} 
                />
              </div>
              <button type="submit" className="submit-btn" disabled={!newContent.trim()}>
                发送 (⌘+Enter)
              </button>
            </div>
          </form>
        )}

        {/* Note Cards Feed */}
        <div className="note-cards-list">
          {filteredNotes.length === 0 ? (
            <div className="empty-state">
              <p>📭 没有找到笔记</p>
            </div>
          ) : (
            filteredNotes.map(note => (
              <div
                key={note.id}
                id={`note-card-${note.id}`}
                className={`note-card${note.is_pinned ? ' pinned' : ''}`}
                onContextMenu={(e) => handleNoteContextMenu(e, note)}
              >
                {editingId === note.id ? (
                  <NoteCardEditor
                    value={editingContent}
                    onChange={setEditingContent}
                    onCancel={handleCancelEdit}
                    onSave={() => handleSaveEdit(note.id)}
                  />
                ) : (
                  /* Display Mode */
                  <>
                    <div className="card-header">
                      <div className="card-meta">
                        <span className="card-time">{note.created_at}</span>
                        {note.is_pinned && <span className="pin-badge">置顶</span>}
                      </div>
                    </div>
                    <div className="card-body">
                      {renderFormattedText(note.content)}
                    </div>

                    {/* Render Links and Backlinks */}
                    {((note.links && note.links.length > 0) || (note.backlinks && note.backlinks.length > 0)) && (
                      <div className="card-relations" style={{
                        marginTop: '12px',
                        paddingTop: '8px',
                        borderTop: '1px dashed var(--border-color)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        fontSize: '12px'
                      }}>
                        {note.links && note.links.length > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ color: 'var(--text-light)', fontWeight: '500' }}>引用了:</span>
                            {note.links.map(linkId => (
                              <span 
                                key={`relation-link-${linkId}`}
                                className="relation-pill"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCardLinkClick(linkId);
                                }}
                                style={{
                                  backgroundColor: 'rgba(var(--primary-rgb), 0.1)',
                                  color: 'var(--primary-color)',
                                  padding: '2px 6px',
                                  borderRadius: 'var(--radius-sm)',
                                  cursor: 'pointer',
                                  fontWeight: '500',
                                  border: '1px solid rgba(var(--primary-rgb), 0.2)'
                                }}
                              >
                                🔗 #{linkId.slice(0, 8)}
                              </span>
                            ))}
                          </div>
                        )}
                        {note.backlinks && note.backlinks.length > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ color: 'var(--text-light)', fontWeight: '500' }}>被引用:</span>
                            {note.backlinks.map(linkId => (
                              <span 
                                key={`relation-backlink-${linkId}`}
                                className="relation-pill"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCardLinkClick(linkId);
                                }}
                                style={{
                                  backgroundColor: 'rgba(52, 199, 89, 0.1)',
                                  color: '#34c759',
                                  padding: '2px 6px',
                                  borderRadius: 'var(--radius-sm)',
                                  cursor: 'pointer',
                                  fontWeight: '500',
                                  border: '1px solid rgba(52, 199, 89, 0.2)'
                                }}
                              >
                                ↩️ #{linkId.slice(0, 8)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))
          )}
        </div>

        {noteContextMenu && (
          <div
            ref={noteContextMenuRef}
            className="tag-context-menu note-context-menu"
            style={{ top: `${noteContextMenu.y}px`, left: `${noteContextMenu.x}px` }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div
              className="context-menu-item"
              onClick={() => {
                onTogglePinNote(noteContextMenu.note);
                setNoteContextMenu(null);
              }}
            >
              {noteContextMenu.note.is_pinned ? '取消置顶' : '置顶卡片'}
            </div>
            <div
              className="context-menu-item"
              onClick={() => {
                handleStartEdit(noteContextMenu.note);
                setNoteContextMenu(null);
              }}
            >
              ✏️ 编辑卡片
            </div>
            <div
              className="context-menu-item"
              onClick={() => {
                onMentionNote(noteContextMenu.note);
                setNoteContextMenu(null);
              }}
            >
              @ 加入助手上下文
            </div>
            <div
              className="context-menu-item"
              onClick={() => {
                onAiAddTags(noteContextMenu.note);
                setNoteContextMenu(null);
              }}
            >
              AI添加标签
            </div>
            <div
              className="context-menu-item delete"
              onClick={() => {
                setDeleteTargetNote(noteContextMenu.note);
                setNoteContextMenu(null);
              }}
            >
              🗑️ 删除卡片
            </div>
          </div>
        )}
        {deleteTargetNote && (
          <ConfirmDeleteDialog
            title="确认删除卡片？"
            description="删除后无法恢复，这张卡片会从开发笔记中移除。"
            confirmLabel="确认删除"
            preview={deleteTargetNote.content.trim() || '空白卡片'}
            onCancel={() => setDeleteTargetNote(null)}
            onConfirm={() => {
              onDeleteNote(deleteTargetNote.id);
              setDeleteTargetNote(null);
            }}
          />
        )}
      </div>
    </main>
  );
}
