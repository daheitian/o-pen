import { useState, useRef, useEffect } from 'react';
import type { FormEvent, MouseEvent as ReactMouseEvent } from 'react';
import { marked } from 'marked';
import type { ChatMessage, Note } from '../types';

// Configure marked options
marked.setOptions({
  gfm: true,
  breaks: true
});

type AgentPanelProps = {
  messages: ChatMessage[];
  isThinking: boolean;
  contextNotes?: Note[];
  onSendMessage: (messageText: string) => void;
  onClearHistory: () => void;
  onRemoveContextNote: (id: string) => void;
  onClearContextNotes: () => void;
};

export default function AgentPanel({ 
  messages, 
  isThinking, 
  contextNotes = [],
  onSendMessage, 
  onClearHistory,
  onRemoveContextNote,
  onClearContextNotes
}: AgentPanelProps) {
  const [input, setInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom of chat when messages change or agent is thinking
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isThinking) return;
    onSendMessage(input);
    setInput('');
  };

  const handleSuggestionClick = (suggestionText: string) => {
    if (isThinking) return;
    onSendMessage(suggestionText);
  };

  const handleChatClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    const target = (e.target as Element).closest('.chat-card-link');
    if (target) {
      const cardId = target.getAttribute('data-id');
      if (cardId) {
        const element = document.getElementById(`note-card-${cardId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.classList.add('glow-highlight');
          setTimeout(() => {
            element.classList.remove('glow-highlight');
          }, 2000);
        }
      }
    }
  };

  // Render markdown in chat bubble using marked
  const formatAgentResponse = (text: string) => {
    if (!text) return '';
    
    // Parse double bracket card links [[ID]]
    const processedText = text.replace(/\[\[(\d+)\]\]/g, '<span class="chat-card-link" data-id="$1">🔗 卡片 #$1</span>');
    
    // Parse markdown to HTML safely (marked parses standard markdown format)
    const html = marked.parse(processedText) as string;
    return (
      <div 
        className="markdown-body"
        dangerouslySetInnerHTML={{ __html: html }}
        onClick={handleChatClick}
      />
    );
  };

  const suggestions = [
    '总结我最近的笔记',
    '列出我笔记中的核心主题',
    '根据现有卡片推荐新标签',
    '帮我列出近期的行动清单'
  ];

  return (
    <aside className="agent-column">
      {/* Header */}
      <div className="agent-header">
        <div className="agent-title">
          <span>🤖</span> Pi Agent 助手
        </div>
        <div className="agent-status-banner">
          <span>
            状态: {isThinking ? (
              <span>
                <span className="status-dot thinking" /> 智能体分析中...
              </span>
            ) : (
              <span>
                <span className="status-dot" /> 在线 (可提问)
              </span>
            )}
          </span>
          {messages.length > 0 && (
            <button className="clear-history-btn" onClick={onClearHistory} disabled={isThinking}>
              清除历史
            </button>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="agent-chat-area">
        {messages.length === 0 ? (
          <div style={{
            textAlign: 'center',
            color: 'var(--text-light)',
            marginTop: '40px',
            fontSize: '13px',
            lineHeight: '1.6',
            padding: '0 20px'
          }}>
            <p style={{ fontSize: '24px', marginBottom: '12px' }}>💡</p>
            <p>我是你的 <b>Pi Agent</b> 卡片智能助手。</p>
            <p style={{ marginTop: '8px' }}>我可以直接访问你的卡片数据库，回答关于你笔记内容的提问、总结归纳主题或提供行动建议。</p>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div key={index} className={`chat-bubble ${msg.role}`}>
              <div className="chat-bubble-header">
                <span>{msg.role === 'user' ? '你' : 'Pi Agent'}</span>
                <span>{msg.created_at?.split(' ')[1] || ''}</span>
              </div>
              <div className="chat-bubble-content">
                {msg.role === 'user' ? <p>{msg.content}</p> : formatAgentResponse(msg.content)}
              </div>
            </div>
          ))
        )}
        {isThinking && (
          <div className="chat-bubble model" style={{ opacity: 0.7 }}>
            <div className="chat-bubble-header">
              <span>Pi Agent</span>
            </div>
            <div className="chat-bubble-content">
              <p>正在思考和查询数据库中，请稍候...</p>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Suggestions */}
      <div className="agent-suggestions">
        <div className="suggestions-title">💡 推荐操作</div>
        <div className="suggestions-list">
          {suggestions.map((s, idx) => (
            <button 
              key={idx} 
              className="suggestion-pill"
              onClick={() => handleSuggestionClick(s)}
              disabled={isThinking}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {contextNotes.length > 0 && (
        <div className="agent-context-area">
          <div className="agent-context-header">
            <span>上下文</span>
            <button type="button" onClick={onClearContextNotes} disabled={isThinking}>清空</button>
          </div>
          <div className="agent-context-list">
            {contextNotes.map(note => (
              <span key={note.id} className="agent-context-chip" title={note.content}>
                <span>卡片 #{note.id.slice(0, 8)}</span>
                <button
                  type="button"
                  title="移除上下文"
                  onClick={() => onRemoveContextNote(note.id)}
                  disabled={isThinking}
                >
                  x
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Input Form */}
      <form className="agent-input-area" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder={isThinking ? '智能体思考中...' : '询问关于笔记的问题...'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isThinking}
        />
        <button type="submit" className="agent-send-btn" disabled={!input.trim() || isThinking}>
          发送
        </button>
      </form>
    </aside>
  );
}
