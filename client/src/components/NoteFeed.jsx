import React, { useState, useRef, useEffect } from 'react';

export default function NoteFeed({ 
  notes, 
  activeTag, 
  setActiveTag, 
  searchQuery, 
  setSearchQuery, 
  onAddNote, 
  onUpdateNote, 
  onDeleteNote 
}) {
  const [newContent, setNewContent] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingContent, setEditingContent] = useState('');
  
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleImageUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('image', file);
    
    try {
      const res = await fetch('http://localhost:5005/api/upload', {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
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
  const insertText = (before, after = '') => {
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

  const handleCreate = (e) => {
    e.preventDefault();
    if (!newContent.trim()) return;
    onAddNote(newContent);
    setNewContent('');
  };

  const handleStartEdit = (note) => {
    setEditingId(note.id);
    setEditingContent(note.content);
  };

  const handleSaveEdit = (id) => {
    if (!editingContent.trim()) return;
    onUpdateNote(id, editingContent);
    setEditingId(null);
    setEditingContent('');
  };

  const handleCardLinkClick = (targetId) => {
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
      alert(`未找到卡片 #${targetId}，可能该卡片已被删除`);
    }
  };

  // Helper to parse formatting (bold, tags, bullets, images, links, card links)
  const renderFormattedText = (text) => {
    if (!text) return null;
    const lines = text.split('\n');
    
    return lines.map((line, idx) => {
      const isBullet = line.trim().startsWith('- ') || line.trim().startsWith('* ');
      const content = isBullet ? line.trim().substring(2) : line;
      
      const elements = [];
      const regex = /(\*\*.*?\*\*|#[a-zA-Z0-9_\u4e00-\u9fa5-]+|!\[.*?\]\(.*?\)|https?:\/\/[a-zA-Z0-9][-a-zA-Z0-9@:%._\+~#=/?&()]*|\[\[\d+\]\])/g;
      const matches = [...content.matchAll(regex)];
      let lastIdx = 0;

      if (matches.length === 0) {
        elements.push(content);
      } else {
        matches.forEach((m, matchIdx) => {
          const matchText = m[0];
          const matchStart = m.index;
          
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
                🔗 卡片 #{targetId}
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
            <textarea
              ref={textareaRef}
              placeholder="在这里记录你的想法... 支持使用 #标签，以及 **加粗** 和 - 列表列表"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  handleCreate(e);
                }
              }}
            />
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
              <div key={note.id} id={`note-card-${note.id}`} className="note-card">
                {editingId === note.id ? (
                  /* Editing Mode */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <textarea
                      value={editingContent}
                      onChange={(e) => setEditingContent(e.target.value)}
                      style={{
                        width: '100%',
                        minHeight: '100px',
                        border: '1px solid var(--primary-color)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '8px',
                        outline: 'none',
                        fontSize: '14px',
                        fontFamily: 'inherit'
                      }}
                    />
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button 
                        onClick={() => setEditingId(null)}
                        className="submit-btn" 
                        style={{ backgroundColor: 'var(--text-light)' }}
                      >
                        取消
                      </button>
                      <button 
                        onClick={() => handleSaveEdit(note.id)}
                        className="submit-btn"
                      >
                        保存
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Display Mode */
                  <>
                    <div className="card-header">
                      <span className="card-time">{note.created_at}</span>
                      <div className="card-actions">
                        <span 
                          className="action-icon" 
                          title="编辑笔记"
                          onClick={() => handleStartEdit(note)}
                        >
                          ✏️
                        </span>
                        <span 
                          className="action-icon delete-icon" 
                          title="删除笔记"
                          onClick={() => onDeleteNote(note.id)}
                        >
                          🗑️
                        </span>
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
                                🔗 #{linkId}
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
                                ↩️ #{linkId}
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
      </div>
    </main>
  );
}
