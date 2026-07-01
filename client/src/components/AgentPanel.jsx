import React, { useState, useRef, useEffect } from 'react';

export default function AgentPanel({ 
  messages, 
  isThinking, 
  onSendMessage, 
  onClearHistory 
}) {
  const [input, setInput] = useState('');
  const chatEndRef = useRef(null);

  // Auto-scroll to bottom of chat when messages change or agent is thinking
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || isThinking) return;
    onSendMessage(input);
    setInput('');
  };

  const handleSuggestionClick = (suggestionText) => {
    if (isThinking) return;
    onSendMessage(suggestionText);
  };

  // Render markdown-like elements in chat bubble (lists, bold)
  const formatAgentResponse = (text) => {
    if (!text) return '';
    const lines = text.split('\n');
    return lines.map((line, idx) => {
      // Check if bullet
      const isBullet = line.trim().startsWith('- ') || line.trim().startsWith('* ');
      let content = isBullet ? line.trim().substring(2) : line;

      // Handle bold **text**
      const elements = [];
      const boldRegex = /\*\*(.*?)\*\*/g;
      const matches = [...content.matchAll(boldRegex)];
      let lastIdx = 0;

      if (matches.length === 0) {
        elements.push(content);
      } else {
        matches.forEach((m, matchIdx) => {
          const boldText = m[1];
          const matchStart = m.index;
          
          if (matchStart > lastIdx) {
            elements.push(content.substring(lastIdx, matchStart));
          }
          elements.push(<strong key={`bold-${matchIdx}`}>{boldText}</strong>);
          lastIdx = matchStart + m[0].length;
        });

        if (lastIdx < content.length) {
          elements.push(content.substring(lastIdx));
        }
      }

      if (isBullet) {
        return (
          <ul key={idx} style={{ margin: '4px 0 4px 16px', paddingLeft: '0' }}>
            <li style={{ listStyleType: 'disc' }}>{elements}</li>
          </ul>
        );
      }
      return <p key={idx} style={{ margin: '4px 0', minHeight: '1em' }}>{elements}</p>;
    });
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
