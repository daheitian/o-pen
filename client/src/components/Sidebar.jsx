import React from 'react';

export default function Sidebar({ stats, activeTag, setActiveTag, noteCount }) {
  const { totalTags = 0, tagFrequency = {}, heatmap = [] } = stats;

  // Generate date cells for the contribution heatmap (past 12 weeks = 84 days)
  const renderHeatmap = () => {
    const cells = [];
    const today = new Date();
    
    // Create map of date string -> count for fast lookup
    const heatmapMap = {};
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
    const labels = [];
    const today = new Date();
    const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
    
    // We display 3 month labels approximately spread out
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

      {/* Tag List */}
      <div className="tag-list-header">全部标签</div>
      <div className="sidebar-tags">
        {Object.entries(tagFrequency).length === 0 ? (
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>暂无标签</span>
        ) : (
          Object.entries(tagFrequency).map(([tag, freq]) => (
            <span
              key={tag}
              className={`tag-badge ${activeTag === tag ? 'active' : ''}`}
              onClick={() => setActiveTag(tag === activeTag ? null : tag)}
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
        <span>⚙️ 设置</span>
        <span>🚪 退出</span>
      </div>
    </aside>
  );
}
