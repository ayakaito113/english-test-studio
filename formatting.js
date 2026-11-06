/**
 * Formatting rules shared by the on-screen preview and Word export.
 * Per-question conditions live alongside the question, not in the section heading.
 * This does not modify or upload the private problem-bank data.
 */
export function parseInstruction(value) {
  const headingLines = [];
  const conditions = [];
  for (const line of String(value ?? '').split(/\r?\n/)) {
    const part = line.trim();
    if (!part) continue;
    const match = part.match(/^条件\s*[:：]\s*(.*)$/);
    if (match) {
      if (match[1].trim()) conditions.push(match[1].trim());
    } else {
      headingLines.push(part);
    }
  }
  return {
    heading: headingLines.join(' ').replace(/(?:…{2,}|\.{4,}|[・･]{3,})/g, '空所').replace(/[ \t]+/g, ' ').replace(/([，、])[ \t]+(?=空所)/g, '$1').trim(),
    condition: conditions.join('／')
  };
}

export function formatQuestionText(question) {
  const text = String(question.text ?? '');
  const {condition} = parseInstruction(question.instruction);
  if (!condition) return text;
  const label = `［${condition}］`;
  if (text.includes(label) || text.includes(`[${condition}]`)) return text;
  const newline = text.search(/\r?\n/);
  return newline < 0
    ? `${text.trimEnd()} ${label}`
    : `${text.slice(0, newline).trimEnd()} ${label}${text.slice(newline)}`;
}
