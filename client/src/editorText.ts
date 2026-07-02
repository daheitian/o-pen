export type TextEditResult = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
};

export function continueListItem(
  value: string,
  selectionStart: number,
  selectionEnd: number,
): TextEditResult | null {
  if (selectionStart !== selectionEnd) return null;

  const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
  const lineEndMatch = value.indexOf('\n', selectionStart);
  const lineEnd = lineEndMatch === -1 ? value.length : lineEndMatch;
  const lineBeforeCursor = value.slice(lineStart, selectionStart);
  const currentLine = value.slice(lineStart, lineEnd);
  const unorderedMatch = lineBeforeCursor.match(/^(\s*)([-*])\s(.*)$/);
  const orderedMatch = lineBeforeCursor.match(/^(\s*)(\d+)\.\s(.*)$/);
  const listMatch = unorderedMatch || orderedMatch;

  if (!listMatch) return null;

  if (/^\s*(?:[-*]|\d+\.)\s*$/.test(currentLine)) {
    return {
      value: value.slice(0, lineStart) + value.slice(lineEnd),
      selectionStart: lineStart,
      selectionEnd: lineStart,
    };
  }

  const [, indent, marker] = listMatch;
  const nextMarker = orderedMatch ? String(Number(marker) + 1) + '.' : marker;
  const prefix = `\n${indent}${nextMarker} `;
  const nextCursor = selectionStart + prefix.length;

  return {
    value: value.slice(0, selectionStart) + prefix + value.slice(selectionStart),
    selectionStart: nextCursor,
    selectionEnd: nextCursor,
  };
}
