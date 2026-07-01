import { DatabaseSync } from "node:sqlite";
import path from "path";
import fs from "fs";
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
      content: Type.String({ description: "The text content of the note card. You can include hashtags (e.g. #idea) and markdown bold or lists." })
    }),
    execute: async (toolCallId, { content }) => {
      try {
        const db = new DatabaseSync(dbPath);
        const tags = extractTags(content);
        const tagsStr = JSON.stringify(tags);
        const timeStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
        
        const stmt = db.prepare(`
          INSERT INTO notes (content, tags, created_at, updated_at) 
          VALUES (?, ?, ?, ?)
        `);
        stmt.run(content, tagsStr, timeStr, timeStr);
        
        // Get last inserted rowid
        const lastIdStmt = db.prepare("SELECT last_insert_rowid() AS id");
        const lastIdResult = lastIdStmt.get() as { id: number };
        db.close();
        
        return {
          content: [{
            type: "text",
            text: `Successfully created note card [Note ID: ${lastIdResult.id}]. Content: "${content}"`
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
      id: Type.Number({ description: "The ID of the note card to update." }),
      content: Type.String({ description: "The new content for the note card." })
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
      id: Type.Number({ description: "The ID of the note card to delete." })
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
}
