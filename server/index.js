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

// 1. Get all notes
app.get('/api/notes', (req, res) => {
  try {
    const stmt = db.query('SELECT * FROM notes ORDER BY created_at DESC');
    const notes = stmt.all();
    // Parse tags JSON string back to array
    const parsedNotes = notes.map(note => ({
      ...note,
      tags: note.tags ? JSON.parse(note.tags) : []
    }));
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
    const stmt = db.query(`
      INSERT INTO notes (content, tags, created_at, updated_at) 
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(content, tagsStr, timeStr, timeStr);
    
    // Return created note
    res.status(201).json({
      id: result.lastInsertRowid,
      content,
      tags,
      created_at: timeStr,
      updated_at: timeStr
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
    res.json({
      id: Number(id),
      content,
      tags,
      updated_at: timeStr
    });
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

// 5. Get application stats (heatmap + general counts)
app.get('/api/stats', (req, res) => {
  try {
    // Count notes
    const countStmt = db.query('SELECT COUNT(*) as count FROM notes');
    const totalNotes = countStmt.get().count;

    // Get unique tags and their frequency
    const tagsStmt = db.query('SELECT tags FROM notes');
    const allTagsRows = tagsStmt.all();
    const tagCounts = {};
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
