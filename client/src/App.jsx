import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import NoteFeed from './components/NoteFeed';
import AgentPanel from './components/AgentPanel';
import './App.css';

const API_BASE = 'http://localhost:5005/api';

export default function App() {
  const [notes, setNotes] = useState([]);
  const [stats, setStats] = useState({ totalNotes: 0, totalTags: 0, tagFrequency: {}, heatmap: [] });
  const [messages, setMessages] = useState([]);
  const [activeTag, setActiveTag] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isThinking, setIsThinking] = useState(false);

  // Fetch all initial data
  useEffect(() => {
    fetchNotes();
    fetchStats();
    fetchChatHistory();
  }, []);

  const fetchNotes = async () => {
    try {
      const res = await fetch(`${API_BASE}/notes`);
      const data = await res.json();
      setNotes(data);
    } catch (err) {
      console.error('Failed to fetch notes:', err);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/stats`);
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  const fetchChatHistory = async () => {
    try {
      const res = await fetch(`${API_BASE}/agent/history`);
      const data = await res.json();
      setMessages(data);
    } catch (err) {
      console.error('Failed to fetch chat history:', err);
    }
  };

  // Add a new note
  const handleAddNote = async (content) => {
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
  const handleUpdateNote = async (id, content) => {
    try {
      const res = await fetch(`${API_BASE}/notes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        await fetchNotes();
        await fetchStats();
      }
    } catch (err) {
      console.error('Failed to update note:', err);
    }
  };

  // Delete a note
  const handleDeleteNote = async (id) => {
    if (!window.confirm('确定要删除这条笔记吗？')) return;
    try {
      const res = await fetch(`${API_BASE}/notes/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await fetchNotes();
        await fetchStats();
      }
    } catch (err) {
      console.error('Failed to delete note:', err);
    }
  };

  // Send message to AI Agent and read SSE stream
  const handleSendMessage = async (messageText) => {
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
        body: JSON.stringify({ message: messageText }),
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
              }
            } catch (e) {
              // Ignore partial JSON parsing errors that sometimes happen at chunk boundaries
            }
          }
        }
      }
    } catch (err) {
      console.error('Agent chat failed:', err);
      setMessages(prev => [
        ...prev,
        { role: 'model', content: `[连接助手失败]: ${err.message}`, created_at: `2026-07-01 ${userTime}` }
      ]);
    } finally {
      setIsThinking(false);
      // Refresh stats in case the agent updated notes or tags
      fetchStats();
    }
  };

  const handleClearHistory = async () => {
    if (!window.confirm('确定要清除聊天记录吗？这也会重置智能体的短期记忆。')) return;
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

  return (
    <div className="app-container">
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
      />

      {/* 3. Right Agent Interaction Area */}
      <AgentPanel 
        messages={messages}
        isThinking={isThinking}
        onSendMessage={handleSendMessage}
        onClearHistory={handleClearHistory}
      />
    </div>
  );
}
