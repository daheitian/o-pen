import { useState, useRef, useEffect } from 'react';
import type { ChangeEvent, ClipboardEvent, FormEvent, KeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import ConfirmDeleteDialog from './ConfirmDeleteDialog';
import NoteCardEditor from './NoteCardEditor';
import { continueListItem } from '../editorText';
import { getClipboardImageFiles, uploadImageFile } from '../imageUpload';
import type { Note } from '../types';

type ListKind = 'ordered' | 'unordered';

type ListItem = {
  content: string;
  children: ListNode[];
};

type ListNode = {
  kind: ListKind;
  items: ListItem[];
};

type CardInsertMode = 'link' | 'embed';

const IMAGE_PREVIEW_MIN_SCALE = 0.5;
const IMAGE_PREVIEW_MAX_SCALE = 3;
const IMAGE_PREVIEW_SCALE_STEP = 0.25;

const clampImagePreviewScale = (scale: number) => (
  Math.min(IMAGE_PREVIEW_MAX_SCALE, Math.max(IMAGE_PREVIEW_MIN_SCALE, Number(scale.toFixed(2))))
);

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
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null);
  const [previewScale, setPreviewScale] = useState(1);
  
  // Linker states
  const [showLinker, setShowLinker] = useState(false);
  const [linkerMode, setLinkerMode] = useState<CardInsertMode>('link');
  const [linkerSearch, setLinkerSearch] = useState('');
  const [linkerTriggerIdx, setLinkerTriggerIdx] = useState(-1);
  const [selectedLinkerIndex, setSelectedLinkerIndex] = useState(0);
  
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const noteContextMenuRef = useRef<HTMLDivElement | null>(null);

  const openImagePreview = (src: string, alt: string) => {
    setPreviewScale(1);
    setPreviewImage({ src, alt });
  };

  const closeImagePreview = () => {
    setPreviewImage(null);
    setPreviewScale(1);
  };

  const zoomImagePreview = (delta: number) => {
    setPreviewScale((scale) => clampImagePreviewScale(scale + delta));
  };

  const getNoteShareText = (note: Note) => {
    const content = note.content.trim() || '空白卡片';
    const tags = note.tags.map(tag => `#${tag}`).join(' ');
    return tags ? `${content}\n\n${tags}` : content;
  };

  const copyShareText = async (text: string) => {
    if (!navigator.clipboard?.writeText) {
      throw new Error('Clipboard API is unavailable');
    }
    await navigator.clipboard.writeText(text);
    alert('卡片内容已复制，可以粘贴分享。');
  };

  const handleShareNote = async (note: Note) => {
    const text = getNoteShareText(note);

    try {
      if (navigator.share) {
        await navigator.share({ title: 'Pi Mind 卡片', text });
        return;
      }
      await copyShareText(text);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('[NoteFeed] Share failed:', err);
      try {
        await copyShareText(text);
      } catch (clipboardErr) {
        console.error('[NoteFeed] Copy share text failed:', clipboardErr);
        alert('分享失败，请手动复制卡片内容。');
      }
    }
  };

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
      if (e.key === 'Escape') {
        setNoteContextMenu(null);
        setPreviewImage(null);
        setPreviewScale(1);
        return;
      }

      if (!previewImage) return;
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setPreviewScale((scale) => clampImagePreviewScale(scale + IMAGE_PREVIEW_SCALE_STEP));
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        setPreviewScale((scale) => clampImagePreviewScale(scale - IMAGE_PREVIEW_SCALE_STEP));
      } else if (e.key === '0') {
        e.preventDefault();
        setPreviewScale(1);
      }
    };

    document.addEventListener('mousedown', closeMenu);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', closeMenu);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [previewImage]);

  const insertCardReference = (targetId: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    const value = textarea.value;
    const before = value.slice(0, linkerTriggerIdx);
    const after = value.slice(textarea.selectionEnd);
    
    const referenceString = linkerMode === 'embed' ? `{{${targetId}}} ` : `[[${targetId}]] `;
    const newValue = before + referenceString + after;
    
    setNewContent(newValue);
    setShowLinker(false);
    setLinkerSearch('');
    
    // Focus back and place cursor after the inserted reference.
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = linkerTriggerIdx + referenceString.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const handleTextareaChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setNewContent(value);

    const cursorIdx = e.target.selectionStart;
    const textBeforeCursor = value.slice(0, cursorIdx);
    
    const triggers: Array<{ token: string; mode: CardInsertMode; closeToken: string }> = [
      { token: '[[', mode: 'link', closeToken: ']]' },
      { token: '{{', mode: 'embed', closeToken: '}}' },
    ];
    const activeTrigger = triggers
      .map(trigger => ({ ...trigger, index: textBeforeCursor.lastIndexOf(trigger.token) }))
      .filter(trigger => trigger.index !== -1)
      .sort((a, b) => b.index - a.index)[0];
    
    if (activeTrigger) {
      const queryPart = textBeforeCursor.slice(activeTrigger.index + activeTrigger.token.length);
      const hasSpace = /\s/.test(queryPart);
      const isClosed = queryPart.includes(activeTrigger.closeToken);
      
      if (!hasSpace && !isClosed) {
        setShowLinker(true);
        setLinkerMode(activeTrigger.mode);
        setLinkerSearch(queryPart);
        setLinkerTriggerIdx(activeTrigger.index);
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

  const uploadAndInsertImages = async (files: File[]) => {
    if (files.length === 0) return;

    try {
      const urls = await Promise.all(files.map(file => uploadImageFile(file)));
      insertText(urls.map(url => `![image](${url})`).join('\n'));
    } catch (err) {
      console.error('Upload error:', err);
      alert('上传图片出错，请检查后端服务连接。');
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(file => file.type.startsWith('image/'));
    await uploadAndInsertImages(files);
    e.target.value = '';
  };

  const handlePaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const imageFiles = getClipboardImageFiles(e.clipboardData);
    if (imageFiles.length === 0) return;

    e.preventDefault();
    await uploadAndInsertImages(imageFiles);
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

  const adjustListIndent = (outdent = false) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const value = textarea.value;
    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
    const lineEndMatch = value.indexOf('\n', selectionEnd);
    const lineEnd = lineEndMatch === -1 ? value.length : lineEndMatch;
    const block = value.slice(lineStart, lineEnd);
    let delta = 0;

    const nextBlock = block.split('\n').map((line) => {
      if (outdent) {
        if (line.startsWith('  ')) {
          delta -= 2;
          return line.slice(2);
        }
        if (line.startsWith('\t')) {
          delta -= 1;
          return line.slice(1);
        }
        return line;
      }
      delta += 2;
      return `  ${line}`;
    }).join('\n');

    setNewContent(value.slice(0, lineStart) + nextBlock + value.slice(lineEnd));

    setTimeout(() => {
      textarea.focus();
      const nextStart = Math.max(lineStart, selectionStart + (outdent ? Math.max(delta, -2) : 2));
      textarea.setSelectionRange(nextStart, Math.max(nextStart, selectionEnd + delta));
    }, 0);
  };

  const continueListOnEnter = () => {
    const textarea = textareaRef.current;
    if (!textarea) return false;

    const result = continueListItem(textarea.value, textarea.selectionStart, textarea.selectionEnd);
    if (!result) return false;

    setNewContent(result.value);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
    }, 0);

    return true;
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

  const getEmbeddedNotePreview = (note: Note) => {
    const preview = note.content
      .replace(/\{\{[a-f0-9-]{36}\}\}/gi, '[嵌入卡片]')
      .replace(/\[\[([a-f0-9-]{36})\]\]/gi, '卡片 #$1')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .slice(0, 4)
      .join('\n');

    return preview || '空白卡片';
  };

  const renderEmbeddedNote = (targetId: string, key: string) => {
    const embeddedNote = notes.find(note => note.id === targetId);

    if (!embeddedNote) {
      return (
        <span key={key} className="card-embed missing">
          未找到嵌入卡片 #{targetId.slice(0, 8)}
        </span>
      );
    }

    return (
      <span
        key={key}
        className="card-embed"
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          handleCardLinkClick(targetId);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleCardLinkClick(targetId);
          }
        }}
      >
        <span className="card-embed-header">
          <span>嵌入卡片</span>
          <span>#{targetId.slice(0, 8)}</span>
        </span>
        <span className="card-embed-content">
          {getEmbeddedNotePreview(embeddedNote)}
        </span>
      </span>
    );
  };

  const renderInlineContent = (content: string): ReactNode[] => {
      const elements: ReactNode[] = [];
      const regex = /(\*\*.*?\*\*|#[a-zA-Z0-9_\u4e00-\u9fa5-]+|!\[.*?\]\(.*?\)|https?:\/\/[a-zA-Z0-9][-a-zA-Z0-9@:%._+~#=/?&()]*|\[\[[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\]\]|\{\{[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\}\})/gi;
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
                <span
                  key={`img-${matchIdx}`}
                  className="card-image-frame"
                  role="button"
                  tabIndex={0}
                  aria-label={alt ? `全屏查看图片：${alt}` : '全屏查看图片'}
                  onClick={(e) => {
                    e.stopPropagation();
                    openImagePreview(url, alt);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openImagePreview(url, alt);
                    }
                  }}
                >
                  <img src={url} alt={alt} className="card-image" />
                </span>
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
          } else if (matchText.startsWith('{{') && matchText.endsWith('}}')) {
            const targetId = matchText.slice(2, -2).toLowerCase();
            elements.push(renderEmbeddedNote(targetId, `card-embed-${matchIdx}`));
          }
          lastIdx = matchStart + matchText.length;
        });

        if (lastIdx < content.length) {
          elements.push(content.substring(lastIdx));
        }
      }

      return elements;
  };

  const renderListItems = (list: ListNode, keyPrefix: string, depth = 0): ReactNode => {
    const ListTag = list.kind === 'ordered' ? 'ol' : 'ul';

    return (
      <ListTag key={keyPrefix} className={`card-list ${list.kind} depth-${Math.min(depth, 3)}`}>
        {list.items.map((item, idx) => (
          <li key={`${keyPrefix}-${idx}`}>
            <span>{renderInlineContent(item.content)}</span>
            {item.children.map((child, childIdx) => renderListItems(child, `${keyPrefix}-${idx}-${childIdx}`, depth + 1))}
          </li>
        ))}
      </ListTag>
    );
  };

  const renderListBlock = (lines: string[], keyPrefix: string): ReactNode => {
    const roots: ListNode[] = [];
    const stack: ListNode[] = [];

    lines.forEach((line) => {
      const match = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
      if (!match) return;

      let level = Math.floor(match[1].replace(/\t/g, '  ').length / 2);
      const kind: ListKind = /\d+\./.test(match[2]) ? 'ordered' : 'unordered';
      const item: ListItem = { content: match[3], children: [] };

      while (level > 0 && !stack[level - 1]?.items.length) {
        level -= 1;
      }

      if (level === 0) {
        const lastRoot = roots[roots.length - 1];
        const target = lastRoot?.kind === kind ? lastRoot : { kind, items: [] };
        if (target !== lastRoot) roots.push(target);
        target.items.push(item);
        stack[0] = target;
        stack.length = 1;
        return;
      }

      const parent = stack[level - 1].items.at(-1);
      if (!parent) return;

      const lastChild = parent.children[parent.children.length - 1];
      const target = lastChild?.kind === kind ? lastChild : { kind, items: [] };
      if (target !== lastChild) parent.children.push(target);
      target.items.push(item);
      stack[level] = target;
      stack.length = level + 1;
    });

    return roots.map((root, idx) => renderListItems(root, `${keyPrefix}-${idx}`));
  };

  // Helper to parse formatting (bold, tags, bullets, images, links, card links)
  const renderFormattedText = (text: string): ReactNode => {
    if (!text) return null;
    const lines = text.split('\n');
    const nodes: ReactNode[] = [];
    let listBuffer: string[] = [];

    const flushList = () => {
      if (listBuffer.length === 0) return;
      nodes.push(renderListBlock(listBuffer, `list-${nodes.length}`));
      listBuffer = [];
    };

    lines.forEach((line, idx) => {
      if (/^\s*(?:[-*]|\d+\.)\s+/.test(line)) {
        listBuffer.push(line);
        return;
      }

      flushList();
      nodes.push(
        <p key={`p-${idx}`} style={{ minHeight: '1.2em', margin: '4px 0' }}>
          {renderInlineContent(line)}
        </p>
      );
    });

    flushList();
    return nodes;
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
                placeholder="在这里记录你的想法... 输入 [[ 引用卡片，{{ 嵌入卡片，支持 #标签，**加粗**"
                value={newContent}
                onChange={handleTextareaChange}
                onPaste={handlePaste}
                onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
                  if (e.key === 'Tab') {
                    e.preventDefault();
                    adjustListIndent(e.shiftKey);
                  } else if (showLinker && linkerSuggestions.length > 0) {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setSelectedLinkerIndex((prev) => (prev + 1) % linkerSuggestions.length);
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setSelectedLinkerIndex((prev) => (prev - 1 + linkerSuggestions.length) % linkerSuggestions.length);
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      const selectedSuggestion = linkerSuggestions[selectedLinkerIndex];
                      if (selectedSuggestion) insertCardReference(selectedSuggestion.id);
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setShowLinker(false);
                    }
                  } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    createNote();
                  } else if (e.key === 'Enter' && continueListOnEnter()) {
                    e.preventDefault();
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
                        onClick={() => insertCardReference(suggestion.id)}
                      >
                        <span className="linker-id-badge">
                          {linkerMode === 'embed' ? '嵌入' : '引用'} #{suggestion.id.slice(0, 8)}
                        </span>
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
                <button type="button" className="toolbar-btn" title="有序列表" onClick={() => insertText('1. ')}>
                  1.
                </button>
                <button type="button" className="toolbar-btn" title="减少缩进" onClick={() => adjustListIndent(true)}>
                  ⇤
                </button>
                <button type="button" className="toolbar-btn" title="增加缩进" onClick={() => adjustListIndent()}>
                  ⇥
                </button>
                <button type="button" className="toolbar-btn" title="上传图片" onClick={handleImageUploadClick}>
                  🖼️
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept="image/*" 
                  multiple
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
                    notes={notes}
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
                      <div className="card-actions">
                        <button
                          type="button"
                          className="action-icon"
                          title="分享卡片"
                          aria-label="分享卡片"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleShareNote(note);
                          }}
                        >
                          ↗
                        </button>
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
                void handleShareNote(noteContextMenu.note);
                setNoteContextMenu(null);
              }}
            >
              ↗ 分享卡片
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
        {previewImage && (
          <div
            className="image-preview-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label={previewImage.alt ? `图片预览：${previewImage.alt}` : '图片预览'}
            onClick={closeImagePreview}
            onWheel={(e) => {
              e.preventDefault();
              zoomImagePreview(e.deltaY > 0 ? -IMAGE_PREVIEW_SCALE_STEP : IMAGE_PREVIEW_SCALE_STEP);
            }}
          >
            <div className="image-preview-toolbar" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="image-preview-tool"
                aria-label="缩小图片"
                disabled={previewScale <= IMAGE_PREVIEW_MIN_SCALE}
                onClick={() => zoomImagePreview(-IMAGE_PREVIEW_SCALE_STEP)}
              >
                -
              </button>
              <span className="image-preview-scale">{Math.round(previewScale * 100)}%</span>
              <button
                type="button"
                className="image-preview-tool"
                aria-label="放大图片"
                disabled={previewScale >= IMAGE_PREVIEW_MAX_SCALE}
                onClick={() => zoomImagePreview(IMAGE_PREVIEW_SCALE_STEP)}
              >
                +
              </button>
              <button
                type="button"
                className="image-preview-tool reset"
                aria-label="重置图片缩放"
                onClick={() => setPreviewScale(1)}
              >
                重置
              </button>
            </div>
            <button
              type="button"
              className="image-preview-close"
              aria-label="关闭图片预览"
              onClick={(e) => {
                e.stopPropagation();
                closeImagePreview();
              }}
            >
              ×
            </button>
            <img
              src={previewImage.src}
              alt={previewImage.alt}
              className="image-preview-content"
              style={{ transform: `scale(${previewScale})` }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </div>
    </main>
  );
}
