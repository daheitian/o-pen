import { useState, useEffect } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import Sidebar from './components/Sidebar';
import NoteFeed from './components/NoteFeed';
import AgentPanel from './components/AgentPanel';
import ConfirmDeleteDialog from './components/ConfirmDeleteDialog';
import type { ChatMessage, Note, NoteChanges, Stats } from './types';
import './App.css';

const API_BASE = 'http://localhost:5005/api';

const sortNotes = (items: Note[]) => [...items].sort((a, b) => (
  Number(Boolean(b.is_pinned)) - Number(Boolean(a.is_pinned)) ||
  (b.created_at || '').localeCompare(a.created_at || '')
));

export default function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [stats, setStats] = useState<Stats>({ totalNotes: 0, totalTags: 0, tagFrequency: {}, heatmap: [] });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [agentContextNotes, setAgentContextNotes] = useState<Note[]>([]);
  const [showClearHistoryConfirm, setShowClearHistoryConfirm] = useState(false);

  // Resize sidebars
  const [leftWidth, setLeftWidth] = useState(260);
  const [rightWidth, setRightWidth] = useState(360);

  const handleLeftMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = leftWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(180, Math.min(450, startWidth + (moveEvent.clientX - startX)));
      setLeftWidth(newWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const handleRightMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = rightWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(280, Math.min(600, startWidth - (moveEvent.clientX - startX)));
      setRightWidth(newWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  // Fetch all initial data
  useEffect(() => {
    fetchNotes();
    fetchStats();
    fetchChatHistory();
  }, []);

  const fetchNotes = async () => {
    try {
      const res = await fetch(`${API_BASE}/notes`);
      const data = await res.json() as Note[];
      setNotes(sortNotes(data));
    } catch (err) {
      console.error('Failed to fetch notes:', err);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/stats`);
      const data = await res.json() as Stats;
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  const fetchChatHistory = async () => {
    try {
      const res = await fetch(`${API_BASE}/agent/history`);
      const data = await res.json() as ChatMessage[];
      setMessages(data);
    } catch (err) {
      console.error('Failed to fetch chat history:', err);
    }
  };

  const applyNoteChanges = ({ notes: changedNotes = [], deletedIds = [] }: NoteChanges) => {
    const deleted = new Set(deletedIds);
    const changedMap = new Map(changedNotes.map(note => [note.id, note]));

    setNotes(prev => {
      const byId = new Map(
        prev
          .filter(note => !deleted.has(note.id))
          .map(note => [note.id, note])
      );

      changedNotes.forEach(note => byId.set(note.id, note));

      return sortNotes([...byId.values()]);
    });

    setAgentContextNotes(prev => prev
      .filter(note => !deleted.has(note.id))
      .map(note => changedMap.get(note.id) || note)
    );
  };

  // Add a new note
  const handleAddNote = async (content: string) => {
    try {
      const res = await fetch(`${API_BASE}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        await fetchNotes();
        await fetchStats();
      }
    } catch (err) {
      console.error('Failed to create note:', err);
    }
  };

  // Update a note
  const handleUpdateNote = async (id: string, content: string) => {
    try {
      const res = await fetch(`${API_BASE}/notes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        setAgentContextNotes(prev => prev.map(note => (
          note.id === id ? { ...note, content } : note
        )));
        await fetchNotes();
        await fetchStats();
      }
    } catch (err) {
      console.error('Failed to update note:', err);
    }
  };

  // Delete a note
  const handleDeleteNote = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/notes/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setAgentContextNotes(prev => prev.filter(note => note.id !== id));
        await fetchNotes();
        await fetchStats();
      }
    } catch (err) {
      console.error('Failed to delete note:', err);
    }
  };

  // Pin or unpin a note without refreshing the whole feed
  const handleTogglePinNote = async (note: Note) => {
    try {
      const res = await fetch(`${API_BASE}/notes/${note.id}/pin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_pinned: !note.is_pinned }),
      });
      if (res.ok) {
        const updatedNote = await res.json() as Note;
        applyNoteChanges({ notes: [updatedNote] });
      }
    } catch (err) {
      console.error('Failed to toggle note pin:', err);
    }
  };

  // Send message to AI Agent and read SSE stream
  const handleSendMessage = async (messageText: string, contextNotes = agentContextNotes) => {
    if (!messageText.trim()) return;

    // Display user message instantly
    const userTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg = { role: 'user', content: messageText, created_at: `2026-07-01 ${userTime}` };
    
    setMessages(prev => [...prev, userMsg]);
    setIsThinking(true);

    try {
      const response = await fetch(`${API_BASE}/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          contextNotes
        }),
      });

      if (!response.body) {
        throw new Error('No readable stream available in response.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      let modelText = '';
      
      // Add empty initial model response card
      setMessages(prev => [...prev, { role: 'model', content: '', created_at: `2026-07-01 ${userTime}` }]);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const rawText = decoder.decode(value);
        // SSE formatting parser: data: {...}\n\n
        const lines = rawText.split('\n');
        for (const line of lines) {
          if (line.trim().startsWith('data: ')) {
            try {
              const data = JSON.parse(line.trim().substring(6));
              if (data.type === 'chunk') {
                modelText += data.text;
                // Update the last message in the feed with the new text chunk
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    content: modelText
                  };
                  return updated;
                });
              } else if (data.type === 'error') {
                modelText += `\n[Agent Error] ${data.error}`;
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    content: modelText
                  };
                  return updated;
                });
              } else if (data.type === 'notes_changed') {
                applyNoteChanges(data);
              }
            } catch {
              // Ignore partial JSON parsing errors that sometimes happen at chunk boundaries
            }
          }
        }
      }
    } catch (err) {
      console.error('Agent chat failed:', err);
      setMessages(prev => [
        ...prev,
        { role: 'model', content: `[连接助手失败]: ${err instanceof Error ? err.message : String(err)}`, created_at: `2026-07-01 ${userTime}` }
      ]);
    } finally {
      setIsThinking(false);
      // Refresh stats in case the agent updated notes or tags
      fetchStats();
    }
  };

  const handleClearHistory = () => {
    setShowClearHistoryConfirm(true);
  };

  const confirmClearHistory = async () => {
    try {
      const res = await fetch(`${API_BASE}/agent/clear`, {
        method: 'POST',
      });
      if (res.ok) {
        setMessages([]);
      }
    } catch (err) {
      console.error('Failed to clear history:', err);
    }
  };

  const handleMentionNote = (note: Note) => {
    setAgentContextNotes(prev => (
      prev.some(item => item.id === note.id)
        ? prev
        : [...prev, note]
    ));
  };

  const handleAiAddTags = (note: Note) => {
    if (isThinking) {
      alert('Pi Agent 正在思考中，请稍后再执行。');
      return;
    }

    handleSendMessage(
      `请直接为当前上下文卡片添加合适标签，无需确认。只调用 update_note 更新卡片 ID ${note.id}；保留原文和已有 #标签，只追加缺失的 2 到 5 个 #标签。`,
      [note]
    );
  };

  const handleRemoveContextNote = (id: string) => {
    setAgentContextNotes(prev => prev.filter(note => note.id !== id));
  };

  return (
    <div 
      className="app-container"
      style={{ gridTemplateColumns: `${leftWidth}px 4px 1fr 4px ${rightWidth}px` }}
    >
      {/* 1. Left Sidebar */}
      <Sidebar 
        stats={stats} 
        activeTag={activeTag} 
        setActiveTag={setActiveTag} 
        noteCount={notes.length}
        onRefreshData={() => {
          fetchNotes();
          fetchStats();
        }}
      />

      {/* Left Resizer */}
      <div className="resizer resizer-left" onMouseDown={handleLeftMouseDown} />

      {/* 2. Middle Notes Feed */}
      <NoteFeed 
        notes={notes}
        activeTag={activeTag}
        setActiveTag={setActiveTag}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onAddNote={handleAddNote}
        onUpdateNote={handleUpdateNote}
        onDeleteNote={handleDeleteNote}
        onMentionNote={handleMentionNote}
        onAiAddTags={handleAiAddTags}
        onTogglePinNote={handleTogglePinNote}
      />

      {/* Right Resizer */}
      <div className="resizer resizer-right" onMouseDown={handleRightMouseDown} />

      {/* 3. Right Agent Panel */}
      <AgentPanel 
        messages={messages}
        isThinking={isThinking}
        contextNotes={agentContextNotes}
        onSendMessage={handleSendMessage}
        onClearHistory={handleClearHistory}
        onRemoveContextNote={handleRemoveContextNote}
        onClearContextNotes={() => setAgentContextNotes([])}
      />
      {showClearHistoryConfirm && (
        <ConfirmDeleteDialog
          title="清除聊天记录？"
          description="这也会重置智能体的短期记忆。"
          confirmLabel="清除"
          onCancel={() => setShowClearHistoryConfirm(false)}
          onConfirm={() => {
            setShowClearHistoryConfirm(false);
            void confirmClearHistory();
          }}
        />
      )}
    </div>
  );
}
