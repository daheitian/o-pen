import { Database } from 'bun:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store database at the project root for easy access by both the node server and python agent
const dbPath = path.resolve(__dirname, '../notes.db');
const db = new Database(dbPath);

// 1. Check if we need to migrate numeric IDs to UUIDs
try {
  const tableInfo = db.query("PRAGMA table_info(notes)").all();
  const idCol = tableInfo.find(col => col.name === 'id');
  
  if (idCol && idCol.type === 'INTEGER') {
    console.log('[Database Migration] Detected legacy INTEGER primary keys. Upgrading to UUID...');
    
    // Fetch all old data
    const notes = db.query('SELECT * FROM notes').all();
    const links = db.query('SELECT * FROM note_links').all();
    
    // Generate UUID mappings
    const idMap = new Map();
    notes.forEach(note => {
      idMap.set(note.id, crypto.randomUUID());
    });
    
    // Update double bracket link strings in contents
    notes.forEach(note => {
      let content = note.content;
      const matches = content.match(/\[\[(\d+)\]\]/g) || [];
      matches.forEach(m => {
        const oldNumId = parseInt(m.slice(2, -2), 10);
        const newUuid = idMap.get(oldNumId);
        if (newUuid) {
          content = content.replaceAll(`[[${oldNumId}]]`, `[[${newUuid}]]`);
        }
      });
      note.content = content;
      note.uuid = idMap.get(note.id);
    });
    
    // Rebuild tables with TEXT (UUID) schemas inside a transaction
    db.transaction(() => {
      db.exec(`
        DROP TABLE IF EXISTS note_links;
        DROP TABLE IF EXISTS notes;

        CREATE TABLE notes (
          id TEXT PRIMARY KEY,
          content TEXT NOT NULL,
          tags TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE note_links (
          source_id TEXT,
          target_id TEXT,
          PRIMARY KEY (source_id, target_id),
          FOREIGN KEY (source_id) REFERENCES notes(id) ON DELETE CASCADE,
          FOREIGN KEY (target_id) REFERENCES notes(id) ON DELETE CASCADE
        );
      `);

      const insertNote = db.query(`
        INSERT INTO notes (id, content, tags, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      notes.forEach(n => {
        insertNote.run(n.uuid, n.content, n.tags, n.created_at, n.updated_at);
      });

      const insertLink = db.query(`
        INSERT INTO note_links (source_id, target_id)
        VALUES (?, ?)
      `);
      links.forEach(l => {
        const newSource = idMap.get(l.source_id);
        const newTarget = idMap.get(l.target_id);
        if (newSource && newTarget) {
          insertLink.run(newSource, newTarget);
        }
      });
    })();
    
    console.log(`[Database Migration] Successfully converted ${notes.length} notes and ${links.length} links to UUID schemas.`);
  }
} catch (e) {
  console.error('[Database Migration] Legacy check or conversion failed:', e.message);
}

// 2. Initialize tables (using TEXT id for new setups)
db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
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
    source_id TEXT,
    target_id TEXT,
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
