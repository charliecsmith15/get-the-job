export type DownloadFormat = 'md' | 'pdf' | 'doc';

function markdownToHTML(md: string): string {
    const lines = md.split('\n');
    const out: string[] = [];
    let inList = false;
    let listType = 'ul';

    const escapeHTML = (s: string) =>
        s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const inlineFormat = (s: string) =>
        escapeHTML(s)
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>');

    const flushList = () => {
        if (inList) {
            out.push(`</${listType}>`);
            inList = false;
        }
    };

    for (const raw of lines) {
        const line = raw.trimEnd();
        if (/^# /.test(line)) {
            flushList();
            out.push(`<h1>${inlineFormat(line.slice(2))}</h1>`);
        } else if (/^## /.test(line)) {
            flushList();
            out.push(`<h2>${inlineFormat(line.slice(3))}</h2>`);
        } else if (/^### /.test(line)) {
            flushList();
            out.push(`<h3>${inlineFormat(line.slice(4))}</h3>`);
        } else if (/^[-*] /.test(line)) {
            if (!inList || listType !== 'ul') { flushList(); out.push('<ul>'); inList = true; listType = 'ul'; }
            out.push(`<li>${inlineFormat(line.slice(2))}</li>`);
        } else if (/^\d+\. /.test(line)) {
            if (!inList || listType !== 'ol') { flushList(); out.push('<ol>'); inList = true; listType = 'ol'; }
            out.push(`<li>${inlineFormat(line.replace(/^\d+\. /, ''))}</li>`);
        } else if (/^---+$/.test(line.trim())) {
            flushList();
            out.push('<hr>');
        } else if (line.trim() === '') {
            flushList();
        } else {
            flushList();
            out.push(`<p>${inlineFormat(line)}</p>`);
        }
    }
    flushList();
    return out.join('\n');
}

const RESUME_STYLES = `
  body { font-family: Georgia, 'Times New Roman', serif; max-width: 780px; margin: 0 auto; padding: 48px 40px; color: #1a1a1a; font-size: 11pt; line-height: 1.5; }
  h1 { font-size: 22pt; margin: 0 0 4px; border-bottom: 2px solid #333; padding-bottom: 6px; }
  h2 { font-size: 13pt; margin: 18px 0 4px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #ccc; padding-bottom: 2px; }
  h3 { font-size: 11pt; margin: 12px 0 2px; font-style: italic; }
  p { margin: 4px 0; }
  ul, ol { margin: 4px 0; padding-left: 20px; }
  li { margin: 2px 0; }
  hr { border: none; border-top: 1px solid #ccc; margin: 12px 0; }
  strong { font-weight: bold; }
  @media print { body { padding: 0; } @page { margin: 1.5cm; } }
`;

function buildHTMLDocument(content: string, title: string): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>${RESUME_STYLES}</style>
</head>
<body>
${markdownToHTML(content)}
</body>
</html>`;
}

export function downloadResume(content: string, baseName: string, format: DownloadFormat) {
    const safeBase = baseName.replace(/[^a-z0-9]/gi, '_').toLowerCase();

    if (format === 'md') {
        const blob = new Blob([content], { type: 'text/markdown' });
        triggerDownload(blob, `${safeBase}.md`);
        return;
    }

    const html = buildHTMLDocument(content, baseName);

    if (format === 'doc') {
        const blob = new Blob([html], { type: 'application/msword' });
        triggerDownload(blob, `${safeBase}.doc`);
        return;
    }

    if (format === 'pdf') {
        const w = window.open('', '_blank');
        if (!w) { alert('Please allow pop-ups to download as PDF.'); return; }
        w.document.write(html);
        w.document.close();
        w.onload = () => { w.focus(); w.print(); };
    }
}

function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
