/** SVG challenge card for Telegram sendPhoto (dark 98+ mood). */

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapLines(text: string, maxLen: number, maxLines: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length > maxLen && line) {
      lines.push(line);
      line = w;
      if (lines.length >= maxLines) break;
    } else {
      line = next;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    const last = lines[maxLines - 1];
    lines[maxLines - 1] = `${last.slice(0, maxLen - 1)}…`;
  }
  return lines.length ? lines : ['…'];
}

export function buildChallengeCardSvg(params: {
  senderName: string;
  banText: string;
  durationLabel: string;
}): Buffer {
  const sender = escapeXml(params.senderName.slice(0, 40));
  const lines = wrapLines(
    params.banText.replace(/^🚫\s*/, ''),
    22,
    4,
  ).map(escapeXml);
  const duration = escapeXml(params.durationLabel);
  const lineYs = [200, 232, 264, 296].slice(0, lines.length);
  const textNodes = lines
    .map(
      (ln, i) =>
        `<text x="400" y="${lineYs[i]}" text-anchor="middle" fill="#f5f0ff" font-size="26" font-weight="700" font-family="system-ui,sans-serif">${ln}</text>`,
    )
    .join('\n');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="480" viewBox="0 0 800 480">
  <defs>
    <radialGradient id="glow" cx="50%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#9b59b6" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#0f0f0f" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1a1228"/>
      <stop offset="100%" stop-color="#0a0a0a"/>
    </linearGradient>
  </defs>
  <rect width="800" height="480" fill="url(#bg)"/>
  <ellipse cx="400" cy="160" rx="320" ry="200" fill="url(#glow)"/>
  <text x="400" y="96" text-anchor="middle" fill="#e8e0f0" font-size="28" font-weight="700" font-family="system-ui,sans-serif">🚫 ${sender}</text>
  ${textNodes}
  <text x="400" y="380" text-anchor="middle" fill="#9b59b6" font-size="18" font-family="system-ui,sans-serif">на ${duration}</text>
</svg>`;

  return Buffer.from(svg, 'utf-8');
}
