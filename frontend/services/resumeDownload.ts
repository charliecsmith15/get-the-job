import { AccountProfile, ResumeSectionConfig, ResumeTextBlock, ResumeEntry, ResumeLine } from '../types';

export type DownloadFormat = 'md' | 'pdf' | 'doc';

export interface StructuredResumeData {
    sections: ResumeSectionConfig[];
    textBlocks: ResumeTextBlock[];
    entries: ResumeEntry[];
    lines: ResumeLine[];
    includedLineIds?: Set<string> | null;
    accountProfile?: AccountProfile | null;
}

const byOrder = <T extends { order: number }>(items: T[]): T[] =>
    [...items].sort((a, b) => a.order - b.order);

const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
function parseDateVal(s?: string): number {
    if (!s) return 0;
    const parts = s.trim().toLowerCase().split(/\s+/);
    const year = parseInt(parts.find(p => /^\d{4}$/.test(p)) ?? '0');
    const mi = MONTHS.indexOf(parts.find(p => MONTHS.includes(p)) ?? '');
    return year * 12 + (mi >= 0 ? mi : 0);
}
const byStartDateDesc = (a: ResumeEntry, b: ResumeEntry) =>
    parseDateVal(b.startDate) - parseDateVal(a.startDate);

function escapeHTML(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Auto-link emails and URLs in the contact line
function formatContactLine(text: string): string {
    const escaped = escapeHTML(text);
    return escaped
        .replace(/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/g, m => `<a href="mailto:${m}">${m}</a>`)
        .replace(/(https?:\/\/[^\s•&]+|(?:linkedin|github)\.com\/[^\s•&]+)/g, m => {
            const href = m.startsWith('http') ? m : `https://${m}`;
            return `<a href="${href}">${m}</a>`;
        });
}

// Bold the category label (text before first colon)
function formatCategoryLine(content: string): string {
    const colon = content.indexOf(':');
    if (colon > 0) {
        return `<strong>${escapeHTML(content.slice(0, colon))}:</strong>${escapeHTML(content.slice(colon + 1))}`;
    }
    return escapeHTML(content);
}

const RESUME_STYLES = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
    font-family: Calibri, 'Gill Sans MT', 'Gill Sans', Arial, sans-serif;
    font-size: 10.5pt;
    color: #000;
    max-width: 780px;
    margin: 0 auto;
    padding: 0.85in 0.7in;
    line-height: 1.4;
}
.header-name {
    text-align: center;
    font-weight: bold;
    font-size: 16pt;
    font-variant: small-caps;
    margin-bottom: 4px;
}
.header-contact {
    text-align: center;
    font-size: 10pt;
    margin-bottom: 14px;
}
.header-contact a { color: #0563C1; text-decoration: underline; }
.section-header {
    font-weight: bold;
    font-size: 10.5pt;
    text-transform: uppercase;
    margin-top: 14px;
    margin-bottom: 0;
    letter-spacing: 0.01em;
}
.section-rule {
    border: none;
    border-top: 1.5px solid #000;
    margin: 0 0 6px;
}
.section-text { font-size: 10.5pt; margin-bottom: 6px; }
.exp-entry { margin-bottom: 14pt; }
.entry-header {
    width: 100%;
    border-collapse: collapse;
    border: none;
    font-size: 10.5pt;
}
.entry-header td { padding: 0; vertical-align: baseline; border: none; }
.entry-heading { font-weight: bold; }
.entry-date {
    text-align: right;
    white-space: nowrap;
    font-weight: normal;
    width: 1%;
    padding-left: 8px !important;
}
.entry-location { font-size: 10.5pt; margin-bottom: 0; }
.exp-entry ul { margin: 0 0 0 0.25in; list-style-type: disc; }
.exp-entry li { margin: 1px 0; font-size: 10.5pt; }
.edu-entry { margin-bottom: 6px; }
.edu-school { font-size: 10.5pt; margin: 0; padding: 0; }
.edu-degree { font-size: 10.5pt; margin: 0; padding: 0; }
.additional-info p { margin: 2px 0; font-size: 10.5pt; }
@page WordSection1 {
    margin-top: 0.85in; margin-bottom: 0.85in;
    margin-left: 0.7in; margin-right: 0.7in;
}
div.WordSection1 { page: WordSection1; }
@page { margin: 0.85in 0.7in; }
@media print { body { padding: 0; } }
`;

function buildHTMLFromData(data: StructuredResumeData, title: string): string {
    const { sections, textBlocks, entries, lines, includedLineIds, accountProfile } = data;
    const sortedSections = byOrder(sections);
    const bodyParts: string[] = [];

    // Header auto-generated from account profile
    if (accountProfile) {
        const name = [accountProfile.firstName, accountProfile.lastName].filter(Boolean).join(' ');
        const contactParts = [accountProfile.phoneNumber, accountProfile.displayEmail, accountProfile.linkedin].filter(Boolean);
        if (name || contactParts.length) {
            bodyParts.push(
                (name ? `<div class="header-name">${escapeHTML(name)}</div>` : '') +
                (contactParts.length ? `<div class="header-contact">${formatContactLine(contactParts.join(' • '))}</div>` : '')
            );
        }
    }

    for (const section of sortedSections) {
        if (section.id === 'header') continue; // legacy — now auto-generated above

        if (section.type === 'text') {
            const block = textBlocks.find(t => t.sectionId === section.id);
            const content = block?.content?.trim();
            if (!content) continue;

            bodyParts.push(
                `<div class="section-header">${escapeHTML(section.label.toUpperCase())}</div>` +
                `<hr class="section-rule">` +
                `<p class="section-text">${escapeHTML(content)}</p>`
            );
            continue;
        }

        if (section.type === 'entries') {
            const unsorted = byOrder(entries.filter(e => e.sectionId === section.id));
            const sectionEntries = section.id === 'experience'
                ? [...unsorted].sort(byStartDateDesc)
                : unsorted;
            const entryBlocks: string[] = [];

            for (const entry of sectionEntries) {
                if (section.id === 'education') {
                    entryBlocks.push(
                        `<div class="edu-entry">` +
                        `<div class="edu-school">${escapeHTML(entry.heading)}</div>` +
                        (entry.subheading ? `<div class="edu-degree">${escapeHTML(entry.subheading)}</div>` : '') +
                        `</div>`
                    );
                    continue;
                }

                const entryLines = byOrder(lines.filter(l => l.sectionId === section.id && l.entryId === entry.id))
                    .filter(l => !includedLineIds || includedLineIds.has(l.id));
                if (!entryLines.length) continue;

                const heading = [entry.heading, entry.subheading].filter(Boolean).join(', ');
                const dateRange = [entry.startDate, entry.endDate].filter(Boolean).join(' – ');
                const bulletItems = entryLines.map(l => `<li>${escapeHTML(l.content)}</li>`).join('');

                entryBlocks.push(
                    `<div class="exp-entry">` +
                    `<table class="entry-header"><tr>` +
                    `<td class="entry-heading">${escapeHTML(heading)}</td>` +
                    (dateRange ? `<td class="entry-date">${escapeHTML(dateRange)}</td>` : '') +
                    `</tr></table>` +
                    (entry.location ? `<div class="entry-location">${escapeHTML(entry.location)}</div>` : '') +
                    `<ul>${bulletItems}</ul>` +
                    `</div>`
                );
            }

            if (entryBlocks.length) {
                bodyParts.push(
                    `<div class="section-header">${escapeHTML(section.label.toUpperCase())}</div>` +
                    `<hr class="section-rule">` +
                    `<div class="entries">${entryBlocks.join('')}</div>`
                );
            }
            continue;
        }

        if (section.type === 'list') {
            const sectionLines = byOrder(lines.filter(l => l.sectionId === section.id && !l.entryId))
                .filter(l => !includedLineIds || includedLineIds.has(l.id));
            if (!sectionLines.length) continue;

            const lineItems = sectionLines.map(l => `<p>${formatCategoryLine(l.content)}</p>`).join('');
            bodyParts.push(
                `<div class="section-header">${escapeHTML(section.label.toUpperCase())}</div>` +
                `<hr class="section-rule">` +
                `<div class="additional-info">${lineItems}</div>`
            );
        }
    }

    return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <title>${escapeHTML(title)}</title>
  <xml><w:WordDocument><w:View>Normal</w:View></w:WordDocument></xml>
  <style>${RESUME_STYLES}</style>
</head>
<body>
<div class="WordSection1">
${bodyParts.join('\n')}
</div>
</body>
</html>`;
}

// Fallback markdown-to-HTML for when structured data isn't available (.md download
// or old stored generations without structured data passed through).
function markdownToHTML(md: string): string {
    const lines = md.split('\n');
    const out: string[] = [];
    let inList = false;

    const escapeHTMLInline = (s: string) =>
        s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const inlineFormat = (s: string) =>
        escapeHTMLInline(s)
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>');

    const flushList = () => { if (inList) { out.push('</ul>'); inList = false; } };

    for (const raw of lines) {
        const line = raw.trimEnd();
        if (/^## /.test(line)) {
            flushList();
            out.push(`<div class="section-header">${inlineFormat(line.slice(3))}</div><hr class="section-rule">`);
        } else if (/ \|\|\| /.test(line)) {
            flushList();
            const [left, right] = line.split(' ||| ');
            out.push(`<table class="entry-header"><tr><td class="entry-heading">${inlineFormat(left)}</td><td class="entry-date">${escapeHTMLInline(right.trim())}</td></tr></table>`);
        } else if (/^:: /.test(line)) {
            flushList();
            out.push(`<div class="entry-location">${inlineFormat(line.slice(3))}</div>`);
        } else if (/^[-*] /.test(line)) {
            if (!inList) { out.push('<ul>'); inList = true; }
            out.push(`<li>${inlineFormat(line.slice(2))}</li>`);
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

function buildHTMLFromMarkdown(content: string, title: string): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHTML(title)}</title>
  <style>${RESUME_STYLES}</style>
</head>
<body>
${markdownToHTML(content)}
</body>
</html>`;
}

export function downloadResume(
    content: string,
    baseName: string,
    format: DownloadFormat,
    structured?: StructuredResumeData
) {
    const safeBase = baseName.replace(/[^a-z0-9]/gi, '_').toLowerCase();

    if (format === 'md') {
        triggerDownload(new Blob([content], { type: 'text/markdown' }), `${safeBase}.md`);
        return;
    }

    const html = structured
        ? buildHTMLFromData(structured, baseName)
        : buildHTMLFromMarkdown(content, baseName);

    if (format === 'doc') {
        triggerDownload(new Blob([html], { type: 'application/msword' }), `${safeBase}.doc`);
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
