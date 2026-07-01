import { Database } from 'bun:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store database at the project root for easy access by both the node server and python agent
const dbPath = path.resolve(__dirname, '../notes.db');
const db = new Database(dbPath);

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    tags TEXT, -- JSON array of tags: '["work", "idea"]'
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL, -- 'user' or 'model'
    content TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS note_links (
    source_id INTEGER,
    target_id INTEGER,
    PRIMARY KEY (source_id, target_id),
    FOREIGN KEY (source_id) REFERENCES notes(id) ON DELETE CASCADE,
    FOREIGN KEY (target_id) REFERENCES notes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tags (
    name TEXT PRIMARY KEY,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

// Seeding tags table from existing notes tags
try {
  const notes = db.query('SELECT tags FROM notes').all();
  const allTags = new Set();
  notes.forEach(note => {
    if (note.tags) {
      try {
        const parsed = JSON.parse(note.tags);
        parsed.forEach(t => {
          if (t && typeof t === 'string' && t.trim() !== '') {
            allTags.add(t.trim());
          }
        });
      } catch (_) {}
    }
  });
  
  if (allTags.size > 0) {
    const insertStmt = db.query('INSERT OR IGNORE INTO tags (name) VALUES (?)');
    allTags.forEach(tag => {
      insertStmt.run(tag);
    });
    console.log(`[Database] Migrated and seeded ${allTags.size} tags into tags table.`);
  }
} catch (e) {
  console.error('[Database Migration] Seeding tags failed:', e.message);
}

console.log(`[Database] Initialized SQLite database at: ${dbPath}`);

export default db;
