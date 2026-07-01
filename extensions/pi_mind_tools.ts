import { DatabaseSync } from "node:sqlite";
import path from "path";
import fs from "fs";
import { randomUUID } from "node:crypto";
import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// Helper: Extract tags from content (same logic as backend)
function extractTags(content: string): string[] {
  if (!content) return [];
  const tagRegex = /#([a-zA-Z0-9_\u4e00-\u9fa5-]+)/g;
  const matches = content.match(tagRegex);
  if (!matches) return [];
  return [...new Set(matches.map(m => m.slice(1)))];
}

// Helper: Extract links to other cards (e.g. [[uuid]])
function extractLinks(content: string): string[] {
  if (!content) return [];
  const linkRegex = /\[\[([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\]\]/gi;
  const matches = [...content.matchAll(linkRegex)];
  return [...new Set(matches.map(m => m[1].toLowerCase()))];
}

// Helper: Update card links in note_links table
function updateNoteLinks(db: DatabaseSync, sourceId: string, targetIds: string[]) {
  // 1. Delete existing links from this card
  const deleteStmt = db.prepare('DELETE FROM note_links WHERE source_id = ?');
  deleteStmt.run(sourceId);
  
  // 2. Insert new valid links
  if (targetIds.length > 0) {
    const insertStmt = db.prepare('INSERT OR IGNORE INTO note_links (source_id, target_id) VALUES (?, ?)');
    for (const targetId of targetIds) {
      // Check if target card actually exists to avoid broken links
      const checkStmt = db.prepare('SELECT 1 FROM notes WHERE id = ?');
      const exists = checkStmt.get(targetId);
      if (exists) {
        insertStmt.run(sourceId, targetId);
      }
    }
  }
}

export default function (pi: ExtensionAPI) {
  const dbPath = path.resolve(process.cwd(), "notes.db");
  
  // Only register the tools if notes.db exists in the current directory
  if (!fs.existsSync(dbPath)) {
    return;
  }

  // 1. Tool to create note
  pi.registerTool({
    name: "create_note",
    description: "Creates a new note card in the user's database. If the user asks you to save, create, write, or record a thought, idea, action item, or note card, call this tool.",
    parameters: Type.Object({
      content: Type.String({ description: "The text content of the note card. You can include hashtags (e.g. #idea), markdown bold or lists, and link references using double brackets e.g. [[uuid]]." })
    }),
    execute: async (toolCallId, { content }) => {
      try {
        const db = new DatabaseSync(dbPath);
        const tags = extractTags(content);
        const tagsStr = JSON.stringify(tags);
        const timeStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
        const uuid = randomUUID();
        
        const stmt = db.prepare(`
          INSERT INTO notes (id, content, tags, created_at, updated_at) 
          VALUES (?, ?, ?, ?, ?)
        `);
        stmt.run(uuid, content, tagsStr, timeStr, timeStr);
        
        // Update links inside the card
        const targetIds = extractLinks(content);
        updateNoteLinks(db, uuid, targetIds);
        
        // Sync tags with tags table
        if (tags.length > 0) {
          const insertTagStmt = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
          for (const tag of tags) {
            insertTagStmt.run(tag);
          }
        }
        
        db.close();
        
        return {
          content: [{
            type: "text",
            text: `Successfully created note card [Note ID: ${uuid}]. Content: "${content}"`
          }]
        };
      } catch (err: any) {
        return {
          content: [{
            type: "text",
            text: `Error creating note: ${err.message}`
          }]
        };
      }
    }
  });

  // 2. Tool to update note
  pi.registerTool({
    name: "update_note",
    description: "Modifies or updates the text content of an existing note card in the database by its ID.",
    parameters: Type.Object({
      id: Type.String({ description: "The UUID of the note card to update." }),
      content: Type.String({ description: "The new content for the note card. You can include links to other notes using [[uuid]]." })
    }),
    execute: async (toolCallId, { id, content }) => {
      try {
        const db = new DatabaseSync(dbPath);
        const tags = extractTags(content);
        const tagsStr = JSON.stringify(tags);
        const timeStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
        
        const stmt = db.prepare(`
          UPDATE notes 
          SET content = ?, tags = ?, updated_at = ? 
          WHERE id = ?
        `);
        stmt.run(content, tagsStr, timeStr, id);
        
        // Update links inside the card
        const targetIds = extractLinks(content);
        updateNoteLinks(db, id, targetIds);
        
        // Sync tags with tags table
        if (tags.length > 0) {
          const insertTagStmt = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
          for (const tag of tags) {
            insertTagStmt.run(tag);
          }
        }
        
        db.close();
        
        return {
          content: [{
            type: "text",
            text: `Successfully updated note card [Note ID: ${id}]. New content: "${content}"`
          }]
        };
      } catch (err: any) {
        return {
          content: [{
            type: "text",
            text: `Error updating note: ${err.message}`
          }]
        };
      }
    }
  });

  // 3. Tool to delete note
  pi.registerTool({
    name: "delete_note",
    description: "Deletes a note card from the database by its ID.",
    parameters: Type.Object({
      id: Type.String({ description: "The UUID of the note card to delete." })
    }),
    execute: async (toolCallId, { id }) => {
      try {
        const db = new DatabaseSync(dbPath);
        const stmt = db.prepare("DELETE FROM notes WHERE id = ?");
        stmt.run(id);
        db.close();
        
        return {
          content: [{
            type: "text",
            text: `Successfully deleted note card [Note ID: ${id}]`
          }]
        };
      } catch (err: any) {
        return {
          content: [{
            type: "text",
            text: `Error deleting note: ${err.message}`
          }]
        };
      }
    }
  });

  // 4. Tool to search notes
  pi.registerTool({
    name: "search_notes",
    description: "Searches note cards in the user's database by keyword (text match) or by tag (e.g. #idea). Use this when user asks about specific topics, questions, or notes they took.",
    parameters: Type.Object({
      keyword: Type.Optional(Type.String({ description: "Sub-string keyword to look up inside note content." })),
      tag: Type.Optional(Type.String({ description: "Tag name to match (do not include the hash sign '#')." }))
    }),
    execute: async (toolCallId, { keyword, tag }) => {
      try {
        if (!keyword && !tag) {
          return {
            content: [{ type: "text", text: "Error: You must provide at least a keyword or a tag to search." }]
          };
        }

        const db = new DatabaseSync(dbPath);
        let query = "SELECT id, content, created_at FROM notes WHERE 1=1";
        const params: any[] = [];

        if (keyword) {
          query += " AND content LIKE ?";
          params.push(`%${keyword}%`);
        }
        if (tag) {
          query += " AND tags LIKE ?";
          params.push(`%"${tag}"%`);
        }
        query += " ORDER BY created_at DESC LIMIT 30";

        const stmt = db.prepare(query);
        const rows = stmt.all(...params) as { id: string; content: string; created_at: string }[];
        db.close();

        if (rows.length === 0) {
          return {
            content: [{ type: "text", text: `No notes found matching search query (keyword: "${keyword || 'none'}", tag: "${tag || 'none'}").` }]
          };
        }

        const formatted = rows.map(r => `[卡片 ID: ${r.id}] (时间: ${r.created_at})\n内容: ${r.content}`).join("\n\n---\n\n");
        return {
          content: [{
            type: "text",
            text: `Search results:\n\n${formatted}`
          }]
        };
      } catch (err: any) {
        return {
          content: [{
            type: "text",
            text: `Error searching notes: ${err.message}`
          }]
        };
      }
    }
  });

  // 5. Tool to list recent notes
  pi.registerTool({
    name: "list_recent_notes",
    description: "Retrieves the most recently created or updated note cards. Use this to get an overview of recent notes or context if the user asks about recent logs.",
    parameters: Type.Object({
      limit: Type.Optional(Type.Number({ description: "Max number of notes to retrieve. Default is 10." }))
    }),
    execute: async (toolCallId, { limit }) => {
      try {
        const db = new DatabaseSync(dbPath);
        const actualLimit = limit || 10;
        
        const stmt = db.prepare(`
          SELECT id, content, created_at 
          FROM notes 
          ORDER BY created_at DESC 
          LIMIT ?
        `);
        const rows = stmt.all(actualLimit) as { id: string; content: string; created_at: string }[];
        db.close();

        if (rows.length === 0) {
          return {
            content: [{ type: "text", text: "The database is empty. User hasn't created any cards yet." }]
          };
        }

        const formatted = rows.map(r => `[卡片 ID: ${r.id}] (时间: ${r.created_at})\n内容: ${r.content}`).join("\n\n---\n\n");
        return {
          content: [{
            type: "text",
            text: `Most recent ${rows.length} notes:\n\n${formatted}`
          }]
        };
      } catch (err: any) {
        return {
          content: [{
            type: "text",
            text: `Error retrieving recent notes: ${err.message}`
          }]
        };
      }
    }
  });
}
