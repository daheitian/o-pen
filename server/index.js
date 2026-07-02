import express from 'express';
import cors from 'cors';
import db from './db.js';
import { handleAgentChat, getAgentHistory, clearAgentHistory } from './agent_bridge.js';

import os from 'os';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Setup upload directory in ~/.pi-mind/assets
const uploadDir = path.join(os.homedir(), '.pi-mind/assets');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({ storage });

const app = express();
const PORT = process.env.PORT || 5005;

app.use(cors());
app.use(express.json());

// Serve static assets from ~/.pi-mind/assets
app.use('/assets', express.static(uploadDir));

// 9. Upload image attachment
app.post('/api/upload', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const fileUrl = `http://localhost:${PORT}/assets/${req.file.filename}`;
    res.json({ url: fileUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper: Extract tags from content (e.g. #tag-name)
function extractTags(content) {
  if (!content) return [];
  const tagRegex = /#([a-zA-Z0-9_\u4e00-\u9fa5-]+)/g;
  const matches = content.match(tagRegex);
  if (!matches) return [];
  return [...new Set(matches.map(m => m.slice(1)))];
}

// Helper: Extract links to other cards (e.g. [[uuid]] or {{uuid}})
function extractLinks(content) {
  if (!content) return [];
  const linkRegex = /(?:\[\[|\{\{)([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(?:\]\]|\}\})/gi;
  const matches = [...content.matchAll(linkRegex)];
  return [...new Set(matches.map(m => m[1].toLowerCase()))];
}

// Helper: Update card links in note_links table
function updateNoteLinks(sourceId, targetIds) {
  // 1. Delete existing links from this card
  db.query('DELETE FROM note_links WHERE source_id = ?').run(sourceId);
  
  // 2. Insert new valid links
  if (targetIds.length > 0) {
    const insertStmt = db.query('INSERT OR IGNORE INTO note_links (source_id, target_id) VALUES (?, ?)');
    for (const targetId of targetIds) {
      // Check if target card actually exists to avoid broken links
      const exists = db.query('SELECT 1 FROM notes WHERE id = ?').get(targetId);
      if (exists) {
        insertStmt.run(sourceId, targetId);
      }
    }
  }
}

function serializeNote(note, links = [], backlinks = []) {
  return {
    ...note,
    tags: note.tags ? JSON.parse(note.tags) : [],
    links,
    backlinks,
    is_pinned: Boolean(note.is_pinned)
  };
}

// 1. Get all notes
app.get('/api/notes', (req, res) => {
  try {
    const stmt = db.query('SELECT * FROM notes ORDER BY is_pinned DESC, created_at DESC');
    const notes = stmt.all();
    
    // Fetch all link relations in one go to avoid N+1 query performance bottleneck
    const allLinks = db.query('SELECT source_id, target_id FROM note_links').all();
    
    // Group links by source and target
    const linksMap = {};
    const backlinksMap = {};
    
    allLinks.forEach(rel => {
      const src = rel.source_id;
      const tgt = rel.target_id;
      
      if (!linksMap[src]) linksMap[src] = [];
      linksMap[src].push(tgt);
      
      if (!backlinksMap[tgt]) backlinksMap[tgt] = [];
      backlinksMap[tgt].push(src);
    });

    // Parse tags JSON string back to array and associate links/backlinks
    const parsedNotes = notes.map(note => serializeNote(
      note,
      linksMap[note.id] || [],
      backlinksMap[note.id] || []
    ));
    res.json(parsedNotes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Create note
app.post('/api/notes', (req, res) => {
  const { content, created_at } = req.body;
  if (!content) {
    return res.status(400).json({ error: 'Content is required' });
  }
  const tags = extractTags(content);
  const tagsStr = JSON.stringify(tags);

  try {
    // Optionally accept created_at from client for historical mock data (e.g., for heatmap testing)
    const timeStr = created_at || new Date().toISOString().replace('T', ' ').substring(0, 19);
    const uuid = crypto.randomUUID();
    const stmt = db.query(`
      INSERT INTO notes (id, content, tags, created_at, updated_at) 
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(uuid, content, tagsStr, timeStr, timeStr);
    
    // Update links inside the card
    const targetIds = extractLinks(content);
    updateNoteLinks(uuid, targetIds);
    
    // Sync tags with tags table
    if (tags.length > 0) {
      const insertTagStmt = db.query('INSERT OR IGNORE INTO tags (name) VALUES (?)');
      tags.forEach(tag => insertTagStmt.run(tag));
    }
    
    const finalLinks = db.query('SELECT target_id FROM note_links WHERE source_id = ?').all(uuid).map(r => r.target_id);

    // Return created note
    res.status(201).json({
      id: uuid,
      content,
      tags,
      links: finalLinks,
      backlinks: [],
      created_at: timeStr,
      updated_at: timeStr,
      is_pinned: false
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Update note
app.put('/api/notes/:id', (req, res) => {
  const { id } = req.params;
  const { content } = req.body;
  if (!content) {
    return res.status(400).json({ error: 'Content is required' });
  }
  const tags = extractTags(content);
  const tagsStr = JSON.stringify(tags);
  const timeStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

  try {
    const stmt = db.query(`
      UPDATE notes 
      SET content = ?, tags = ?, updated_at = ? 
      WHERE id = ?
    `);
    const result = stmt.run(content, tagsStr, timeStr, id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }
    
    // Update links inside the card
    const targetIds = extractLinks(content);
    updateNoteLinks(id, targetIds);
    
    // Sync tags with tags table
    if (tags.length > 0) {
      const insertTagStmt = db.query('INSERT OR IGNORE INTO tags (name) VALUES (?)');
      tags.forEach(tag => insertTagStmt.run(tag));
    }
    
    const finalLinks = db.query('SELECT target_id FROM note_links WHERE source_id = ?').all(id).map(r => r.target_id);
    const finalBacklinks = db.query('SELECT source_id FROM note_links WHERE target_id = ?').all(id).map(r => r.source_id);
    const currentNote = db.query('SELECT created_at, is_pinned FROM notes WHERE id = ?').get(id);

    res.json({
      id: id,
      content,
      tags,
      links: finalLinks,
      backlinks: finalBacklinks,
      created_at: currentNote.created_at,
      updated_at: timeStr,
      is_pinned: Boolean(currentNote.is_pinned)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3.5. Pin or unpin a note
app.patch('/api/notes/:id/pin', (req, res) => {
  const { id } = req.params;
  const { is_pinned } = req.body;

  if (typeof is_pinned !== 'boolean') {
    return res.status(400).json({ error: 'is_pinned boolean is required' });
  }

  const timeStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

  try {
    const stmt = db.query(`
      UPDATE notes
      SET is_pinned = ?, updated_at = ?
      WHERE id = ?
    `);
    const result = stmt.run(is_pinned ? 1 : 0, timeStr, id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }

    const note = db.query('SELECT * FROM notes WHERE id = ?').get(id);
    const finalLinks = db.query('SELECT target_id FROM note_links WHERE source_id = ?').all(id).map(r => r.target_id);
    const finalBacklinks = db.query('SELECT source_id FROM note_links WHERE target_id = ?').all(id).map(r => r.source_id);

    res.json(serializeNote(note, finalLinks, finalBacklinks));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Delete note
app.delete('/api/notes/:id', (req, res) => {
  const { id } = req.params;
  try {
    const stmt = db.query('DELETE FROM notes WHERE id = ?');
    const result = stmt.run(id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }
    res.json({ success: true, message: 'Note deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== TAG MANAGEMENT ENDPOINTS ====================

// 6. Get all tags with their counts
app.get('/api/tags', (req, res) => {
  try {
    const allTags = db.query('SELECT name FROM tags ORDER BY name ASC').all();
    
    // Count frequencies from notes
    const notes = db.query('SELECT tags FROM notes').all();
    const tagCounts = {};
    notes.forEach(note => {
      if (note.tags) {
        try {
          const parsed = JSON.parse(note.tags);
          parsed.forEach(t => {
            tagCounts[t] = (tagCounts[t] || 0) + 1;
          });
        } catch (_) {}
      }
    });
    
    const result = allTags.map(t => ({
      name: t.name,
      count: tagCounts[t.name] || 0
    }));
    
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Create a new tag
app.post('/api/tags', (req, res) => {
  let { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Tag name is required' });
  name = name.trim().replace(/^#/, '');
  if (!name) return res.status(400).json({ error: 'Invalid tag name' });
  
  try {
    db.query('INSERT OR IGNORE INTO tags (name) VALUES (?)').run(name);
    res.status(201).json({ name, count: 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Rename a tag globally in all cards
app.put('/api/tags/:name', (req, res) => {
  const { name } = req.params;
  let { newName } = req.body;
  if (!newName) return res.status(400).json({ error: 'New name is required' });
  newName = newName.trim().replace(/^#/, '');
  if (!newName) return res.status(400).json({ error: 'Invalid new name' });

  if (name === newName) {
    return res.json({ success: true, message: 'Tag name unchanged' });
  }

  try {
    // 1. Get all notes that contain the tag
    const notes = db.query('SELECT id, content, tags FROM notes').all();
    const notesToUpdate = notes.filter(n => {
      try {
        const parsed = JSON.parse(n.tags || '[]');
        return parsed.includes(name);
      } catch (_) {
        return false;
      }
    });

    // 2. Perform global replace of tag name inside each card's content
    const tagRegex = new RegExp('#' + name + '(?![a-zA-Z0-9_\\u4e00-\\u9fa5-])', 'g');
    const updateNoteStmt = db.query('UPDATE notes SET content = ?, tags = ?, updated_at = ? WHERE id = ?');
    
    notesToUpdate.forEach(note => {
      const updatedContent = note.content.replace(tagRegex, '#' + newName);
      const newTags = extractTags(updatedContent);
      const timeStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
      updateNoteStmt.run(updatedContent, JSON.stringify(newTags), timeStr, note.id);
    });

    // 3. Update tags table
    db.query('DELETE FROM tags WHERE name = ?').run(name);
    db.query('INSERT OR IGNORE INTO tags (name) VALUES (?)').run(newName);

    res.json({ 
      success: true, 
      message: `Tag renamed from #${name} to #${newName} in ${notesToUpdate.length} cards.` 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Untag a tag globally (replaces #tag with tag in text content)
app.delete('/api/tags/:name', (req, res) => {
  const { name } = req.params;
  try {
    // 1. Delete tag from tags table
    db.query('DELETE FROM tags WHERE name = ?').run(name);

    // 2. Get notes containing this tag
    const notes = db.query('SELECT id, content, tags FROM notes').all();
    const notesToUpdate = notes.filter(n => {
      try {
        const parsed = JSON.parse(n.tags || '[]');
        return parsed.includes(name);
      } catch (_) {
        return false;
      }
    });

    // 3. Replace '#tag' with 'tag' in card texts, re-extract, and update
    const tagRegex = new RegExp('#' + name + '(?![a-zA-Z0-9_\\u4e00-\\u9fa5-])', 'g');
    const updateNoteStmt = db.query('UPDATE notes SET content = ?, tags = ?, updated_at = ? WHERE id = ?');

    notesToUpdate.forEach(note => {
      const updatedContent = note.content.replace(tagRegex, name);
      const newTags = extractTags(updatedContent);
      const timeStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
      updateNoteStmt.run(updatedContent, JSON.stringify(newTags), timeStr, note.id);
    });

    res.json({ 
      success: true, 
      message: `Tag #${name} deleted. Untagged ${notesToUpdate.length} cards.` 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Get application stats (heatmap + general counts)
app.get('/api/stats', (req, res) => {
  try {
    // Count notes
    const countStmt = db.query('SELECT COUNT(*) as count FROM notes');
    const totalNotes = countStmt.get().count;

    // Get unique tags and their frequency
    const allTags = db.query('SELECT name FROM tags').all();
    const tagCounts = {};
    allTags.forEach(t => {
      tagCounts[t.name] = 0;
    });

    const tagsStmt = db.query('SELECT tags FROM notes');
    const allTagsRows = tagsStmt.all();
    allTagsRows.forEach(row => {
      if (row.tags) {
        try {
          const tags = JSON.parse(row.tags);
          tags.forEach(tag => {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          });
        } catch (_) {}
      }
    });

    // Heatmap: Count notes per day
    // SQLite substring to get YYYY-MM-DD
    const heatmapStmt = db.query(`
      SELECT substr(created_at, 1, 10) as date, COUNT(*) as count 
      FROM notes 
      GROUP BY date 
      ORDER BY date ASC
    `);
    const heatmapData = heatmapStmt.all();

    res.json({
      totalNotes,
      totalTags: Object.keys(tagCounts).length,
      tagFrequency: tagCounts,
      heatmap: heatmapData
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Agent Chat Endpoint (handles chat streaming/Bridge to Python Agent)
app.post('/api/agent/chat', handleAgentChat);

// 7. Get Agent chat history
app.get('/api/agent/history', (req, res) => {
  try {
    const history = getAgentHistory();
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Clear Agent history
app.post('/api/agent/clear', (req, res) => {
  try {
    clearAgentHistory();
    res.json({ success: true, message: 'Chat history cleared' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`[Server] Running on http://localhost:${PORT}`);
});
