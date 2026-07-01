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

export async function handleAgentChat(req, res) {
  const { message, conversationId = 'default_chat' } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    // 1. Save user message to SQLite database
    const userTime = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const saveUserStmt = db.query('INSERT INTO messages (role, content, created_at) VALUES (?, ?, ?)');
    saveUserStmt.run('user', message, userTime);

    // 2. Set headers for SSE streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Send initialization event
    res.write(`data: ${JSON.stringify({ type: 'start' })}\n\n`);

    // 3. Compile prompt for Pi Agent with instructions on tools instead of full DB dump
    const finalPrompt = `你是一个卡片笔记助手 Pi Agent。
你的任务是协助用户整理、搜索、建立和修改本地卡片笔记。

你可以通过以下插件工具直接与用户的 SQLite 数据库进行交互（无需在 Prompt 中堆砌所有卡片）：
1. \`create_note(content)\`: 创建一条新卡片笔记。
2. \`update_note(id, content)\`: 更新已有的卡片笔记内容。
3. \`delete_note(id)\`: 删除指定 ID 的卡片笔记。
4. \`search_notes(keyword, tag)\`: 搜索包含该关键词或特定标签的卡片。
5. \`list_recent_notes(limit)\`: 获取最近记录的几条卡片笔记，用来快速掌握用户近期的笔记动态。

规则：
1. **优先调用工具**：当用户的提问涉及查找笔记、总结笔记、创建、修改或删除笔记时，你必须根据需要主动调用相应的数据库工具（例如 \`search_notes\` 或 \`list_recent_notes\`），切勿凭空编造结果。
2. 在通过工具获得数据并分析后，再生成最终回答。回答中引用卡片时必须标注 \`[卡片 ID: x]\`。
3. 如果用户只是进行日常闲聊（如说“你好”、“谢谢”），直接友好互动即可，无需调用工具。
4. 保持回答简洁明了，用词亲切，使用中文回答。

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
        const saveModelStmt = db.query('INSERT INTO messages (role, content, created_at) VALUES (?, ?, ?)');
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
  const stmt = db.query('SELECT role, content, created_at FROM messages ORDER BY id ASC');
  return stmt.all();
}

export function clearAgentHistory() {
  db.query('DELETE FROM messages').run();
  
  // Clear conversation state history folder in agent to reset agent memory
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
    console.error('[Bridge] Error clearing agent persistence history:', e);
  }
}
