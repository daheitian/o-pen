import { unified } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeHighlight from 'rehype-highlight';
import rehypeStringify from 'rehype-stringify';

/**
 * Markdown 渲染引擎
 * 将 Markdown 文本转换为 HTML，支持：
 * - GitHub Flavored Markdown (GFM)
 * - 代码块语法高亮
 * - 表格、删除线、任务列表等
 */

const processor = unified()
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeHighlight, {
    detect: true,
    ignoreMissing: true,
  })
  .use(rehypeStringify);

/**
 * 将 Markdown 转换为 HTML
 * @param markdown - Markdown 源文本
 * @returns HTML 字符串
 */
export async function markdownToHtml(markdown: string): Promise<string> {
  try {
    const file = await processor.process(markdown);
    return String(file);
  } catch (error) {
    console.error('Markdown rendering error:', error);
    // 错误时返回纯文本，用 <pre> 包装
    return `<pre>${escapeHtml(markdown)}</pre>`;
  }
}

/**
 * HTML 转义
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}

/**
 * 从 Markdown 中提取标题（H1-H6）用于大纲导航
 * @param markdown - Markdown 源文本
 * @returns 标题数组
 */
export function extractHeadings(markdown: string): Array<{
  level: number;
  text: string;
  id: string;
}> {
  const lines = markdown.split('\n');
  const headings: Array<{ level: number; text: string; id: string }> = [];
  let counter = 0;

  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const text = match[2].trim();
      const id = `heading-${counter++}`;
      headings.push({ level, text, id });
    }
  }

  return headings;
}

/**
 * 获取 Markdown 的纯文本预览（用于卡片摘要）
 * @param markdown - Markdown 源文本
 * @param maxLength - 最大长度，默认 200
 * @returns 纯文本预览
 */
export function getMarkdownPreview(markdown: string, maxLength: number = 200): string {
  // 移除 Markdown 语法符号
  let text = markdown
    .replace(/^#+\s+/gm, '') // 移除标题
    .replace(/\*\*|__/g, '') // 移除加粗
    .replace(/\*|_/g, '') // 移除斜体
    .replace(/~~(.+?)~~/g, '$1') // 移除删除线
    .replace(/`(.+?)`/g, '$1') // 移除代码块标记
    .replace(/\[(.+?)\]\(.+?\)/g, '$1') // 移除链接但保留文本
    .replace(/[#\-\+\*]\s+/g, '') // 移除列表标记
    .trim();

  // 只取第一行或前 N 个字符
  const firstLine = text.split('\n')[0];
  return firstLine.length > maxLength ? firstLine.substring(0, maxLength) + '...' : firstLine;
}

/**
 * 检查内容是否包含 Markdown 语法
 */
export function isMarkdown(text: string): boolean {
  const markdownPatterns = [
    /^#+\s+/m, // 标题
    /\*\*|__/m, // 加粗
    /\*|_/m, // 斜体
    /~~.+?~~/m, // 删除线
    /```/m, // 代码块
    /\[.+?\]\(.+?\)/m, // 链接
    /^[-*+]\s+/m, // 列表
    /^\d+\.\s+/m, // 有序列表
    /\|.+\|/m, // 表格
  ];

  return markdownPatterns.some((pattern) => pattern.test(text));
}
