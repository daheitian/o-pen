import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';
import fs from 'fs';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the pi-minimax wrapper script in ~/.pi/agent/bin/pi-minimax
const homeDir = os.homedir();
const piMinimaxPath = path.join(homeDir, '.pi/agent/bin/pi-minimax');

// Helper: Fetch all card notes from the SQLite database to build the context prompt
function getNotesContextMarkdown() {
  try {
    const stmt = db.prepare('SELECT id, content, created_at FROM notes ORDER BY created_at DESC LIMIT 30');
    const rows = stmt.all();
    if (rows.length === 0) {
      return '用户目前没有任何卡片笔记。';
    }
    return rows.map(r => `- [卡片 ID: ${r.id}] (创建于: ${r.created_at})\n  内容: ${r.content}`).join('\n\n');
  } catch (err) {
    console.error('[Bridge] Error fetching notes context:', err);
    return '获取笔记上下文失败。';
  }
}

export async function handleAgentChat(req, res) {
  const { message, conversationId = 'default_chat' } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    // 1. Save user message to SQLite database
    const userTime = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const saveUserStmt = db.prepare('INSERT INTO messages (role, content, created_at) VALUES (?, ?, ?)');
    saveUserStmt.run('user', message, userTime);

    // 2. Set headers for SSE streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Send initialization event
    res.write(`data: ${JSON.stringify({ type: 'start' })}\n\n`);

    // 3. Compile context from cards and build the final prompt
    const notesContext = getNotesContextMarkdown();
    const finalPrompt = `你是一个卡片笔记助手 Pi Agent。下面是用户的卡片笔记内容作为你的参考上下文：

${notesContext}

---
规则：
1. 你的回答必须基于上述卡片笔记内容。如果用户的提问跟上述笔记内容相关，请结构化解答并主动引用相关的 [卡片 ID: x]。
2. 如果用户只是进行日常问候，你可以友好地问好，并说明你是卡片笔记助手。
3. 如果用户问的内容在上述笔记中没有提及，请礼貌地指出该内容不存在于笔记中。
4. 保持回答简洁明了，用词亲切。
5. 必须使用中文回答。

用户问题：${message}`;

    console.log(`[Bridge] Spawning Pi Agent executable at: ${piMinimaxPath}`);
    
    // Check if the script exists before spawning
    if (!fs.existsSync(piMinimaxPath)) {
      throw new Error(`Pi Agent executable not found at: ${piMinimaxPath}`);
    }

    // 4. Spawn the pi-minimax process
    const pyProcess = spawn(piMinimaxPath, [
      '-a',                           // Trust project-local files
      '--session-id', conversationId, // Maintain session trajectory history
      '-p', finalPrompt               // The prompt
    ], {
      env: {
        ...process.env,
        HOME: homeDir
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let fullResponse = '';
    let errorOutput = '';

    // Handle stdout chunks (streaming output from the agent)
    pyProcess.stdout.on('data', (data) => {
      const chunk = data.toString();
      fullResponse += chunk;
      res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`);
    });

    // Handle stderr (errors from the agent)
    pyProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
      console.error(`[Pi Agent Stderr] ${data.toString()}`);
    });

    // Process finished
    pyProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`[Bridge] Pi Agent exited with code ${code}. Error: ${errorOutput}`);
        res.write(`data: ${JSON.stringify({ type: 'error', error: errorOutput || 'Agent failed to respond.' })}\n\n`);
        res.end();
        return;
      }

      // 5. Save model response to database
      try {
        const modelTime = new Date().toISOString().replace('T', ' ').substring(0, 19);
        const saveModelStmt = db.prepare('INSERT INTO messages (role, content, created_at) VALUES (?, ?, ?)');
        saveModelStmt.run('model', fullResponse, modelTime);
      } catch (err) {
        console.error('[Bridge] Failed to save agent message to DB:', err);
      }

      res.write(`data: ${JSON.stringify({ type: 'done', text: fullResponse })}\n\n`);
      res.end();
    });

  } catch (err) {
    console.error('[Bridge] Chat handle error:', err);
    res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
    res.end();
  }
}

export function getAgentHistory() {
  const stmt = db.prepare('SELECT role, content, created_at FROM messages ORDER BY id ASC');
  return stmt.all();
}

export function clearAgentHistory() {
  db.prepare('DELETE FROM messages').run();
  
  // Clear conversation state history folder in python agent to reset agent memory
  const historyDir = path.resolve(__dirname, '../agent/history');
  try {
    if (fs.existsSync(historyDir)) {
      const files = fs.readdirSync(historyDir);
      for (const file of files) {
        fs.unlinkSync(path.join(historyDir, file));
      }
      console.log('[Bridge] Cleared Agent persistence directory');
    }
  } catch (e) {
    console.error('[Bridge] Error clearing python agent persistence history:', e);
  }
}
