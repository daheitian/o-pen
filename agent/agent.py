import os
import sys
import argparse
import asyncio
import sqlite3
from dotenv import load_dotenv
from google.antigravity import Agent, LocalAgentConfig

# Load environment variables from .env file (if present)
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env'))

DB_PATH = None

def get_db_connection():
    if not DB_PATH:
        raise ValueError("Database path not initialized.")
    return sqlite3.connect(DB_PATH)

def get_recent_notes(limit: int = 20) -> str:
    """Retrieves the most recent notes/cards from the database.
    Use this to see what the user has written recently.

    Args:
        limit: The maximum number of notes to retrieve. Defaults to 20.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, content, tags, created_at FROM notes ORDER BY created_at DESC LIMIT ?", 
            (limit,)
        )
        rows = cursor.fetchall()
        conn.close()
        
        if not rows:
            return "No recent notes found in database."
            
        result = "Recent notes:\n"
        for row in rows:
            note_id, content, tags, created_at = row
            result += f"- [Note ID {note_id}] ({created_at}) tags: {tags}\n  Content: {content}\n\n"
        return result
    except Exception as e:
        return f"Error retrieving recent notes: {str(e)}"

def search_notes(query: str) -> str:
    """Searches the note cards by matching the query string in contents or tags.
    Use this when the user asks about specific topics, keywords, or tags.

    Args:
        query: The keyword, phrase, or tag to search for.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        like_query = f"%{query}%"
        cursor.execute(
            "SELECT id, content, tags, created_at FROM notes WHERE content LIKE ? OR tags LIKE ? ORDER BY created_at DESC", 
            (like_query, like_query)
        )
        rows = cursor.fetchall()
        conn.close()
        
        if not rows:
            return f"No notes found matching the search query: '{query}'."
            
        result = f"Search results for '{query}':\n"
        for row in rows:
            note_id, content, tags, created_at = row
            result += f"- [Note ID {note_id}] ({created_at}) tags: {tags}\n  Content: {content}\n\n"
        return result
    except Exception as e:
        return f"Error searching notes: {str(e)}"

def get_note_stats() -> str:
    """Gets general statistics of the card notes database, such as the total number of notes and the list of unique tags."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM notes")
        total_notes = cursor.fetchone()[0]
        
        cursor.execute("SELECT tags FROM notes")
        rows = cursor.fetchall()
        conn.close()
        
        tags_set = set()
        for row in rows:
            if row[0]:
                import json
                try:
                    tags = json.loads(row[0])
                    for t in tags:
                        tags_set.add(t)
                except:
                    pass
        
        return f"Notes Statistics:\n- Total note cards: {total_notes}\n- Unique tags: {len(tags_set)} ({', '.join(sorted(tags_set)) if tags_set else 'None'})"
    except Exception as e:
        return f"Error getting notes statistics: {str(e)}"

async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", required=True, help="Path to SQLite notes.db file")
    parser.add_argument("--message", required=True, help="The user message to send to the agent")
    parser.add_argument("--conversation-id", default="default_chat", help="Conversation ID for persistence")
    args = parser.parse_args()
    
    global DB_PATH
    DB_PATH = os.path.abspath(args.db)
    
    # Setup conversation state directory under agent/history
    current_dir = os.path.dirname(os.path.abspath(__file__))
    history_dir = os.path.join(current_dir, "history")
    os.makedirs(history_dir, exist_ok=True)
    
    system_instructions = (
        "You are Pi-Mind Agent, a card-based personal knowledge assistant. Your goal is to help the user "
        "review, organize, connect, and analyze their card notes.\n\n"
        "You are equipped with tools to query the user's notes database. Whenever the user asks about their notes, "
        "what they have done, or requests summaries, you MUST call the appropriate database tool (e.g. search_notes, "
        "get_recent_notes, or get_note_stats) to gather the actual content. Do NOT guess or make up notes.\n\n"
        "Keep your responses friendly, concise, and structured. When you reference a note, make sure to mention its [Note ID X] "
        "so the user can trace it back. Answer in the same language as the user's message (default to Chinese if the message is in Chinese)."
    )
    
    config = LocalAgentConfig(
        system_instructions=system_instructions,
        tools=[get_recent_notes, search_notes, get_note_stats],
        save_dir=history_dir,
        conversation_id=args.conversation_id
    )
    
    try:
        # Run chat session and stream output to stdout
        async with Agent(config=config) as agent:
            response = await agent.chat(args.message)
            async for chunk in response:
                print(chunk, end="", flush=True)
    except Exception as e:
        print(f"\n[Agent Error] {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
