import { AccountProfile, ResumeSectionConfig, ResumeTextBlock, ResumeEntry, ResumeLine } from '../types';

// Pure, deterministic resume rendering. The AI never emits the final
// document — it only selects which candidate lines to include (see
// selectResumeLines in gemini.ts) — so section order and line order here
// always come from the backend config and each row's "order" column,
// never from anything the AI returns.

export interface LineSelection {
    lineId: string;
    include: boolean;
    priority: number; // used only by trimToBudget's backstop, never for display order
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

export const getCandidateLines = (lines: ResumeLine[], jobId: string | null): ResumeLine[] =>
    lines.filter(l => !l.jobId || l.jobId === jobId);

export function renderResumeMarkdown(
    sections: ResumeSectionConfig[],
    textBlocks: ResumeTextBlock[],
    entries: ResumeEntry[],
    lines: ResumeLine[],
    includedLineIds?: Set<string> | null,
    accountProfile?: AccountProfile | null
): string {
    const sortedSections = byOrder(sections);
    const parts: string[] = [];

    if (accountProfile) {
        const name = [accountProfile.firstName, accountProfile.lastName].filter(Boolean).join(' ');
        const contactParts = [accountProfile.phoneNumber, accountProfile.displayEmail, accountProfile.linkedin].filter(Boolean);
        const headerLines = [name, contactParts.join(' • ')].filter(Boolean);
        if (headerLines.length) parts.push(headerLines.join('\n'));
    }

    for (const section of sortedSections) {
        if (section.id === 'header') continue; // now auto-generated from accountProfile

        if (section.type === 'text') {
            const block = textBlocks.find(t => t.sectionId === section.id);
            const content = block?.content?.trim();
            if (!content) continue;
            parts.push(`## ${section.label}\n\n${content}`);
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
                    // Education: school name + degree only, no dates or bullets required
                    const educParts = [entry.heading, entry.subheading].filter(Boolean);
                    entryBlocks.push(educParts.join('\n'));
                    continue;
                }

                // Experience and other entries-type sections
                const entryLines = byOrder(lines.filter(l => l.sectionId === section.id && l.entryId === entry.id))
                    .filter(l => !includedLineIds || includedLineIds.has(l.id));
                if (!entryLines.length) continue;

                const dateRange = [entry.startDate, entry.endDate].filter(Boolean).join(' – ');
                const heading = [entry.heading, entry.subheading].filter(Boolean).join(', ');
                // ||| is the two-column separator: left = company+title bold, right = dates
                const headerLine = dateRange ? `**${heading}** ||| ${dateRange}` : `**${heading}**`;
                const blockLines = [headerLine];
                if (entry.location) blockLines.push(`:: ${entry.location}`);
                blockLines.push(...entryLines.map(l => `- ${l.content}`));
                entryBlocks.push(blockLines.join('\n'));
            }

            if (entryBlocks.length) parts.push(`## ${section.label}\n\n${entryBlocks.join('\n\n')}`);
            continue;
        }

        if (section.type === 'list') {
            const SKILL_CATS = ['skills:', 'tools:', 'certifications:'];
            let sectionLines = byOrder(lines.filter(l => l.sectionId === section.id && !l.entryId))
                .filter(l => !includedLineIds || includedLineIds.has(l.id));
            if (section.id === 'skills') {
                sectionLines = sectionLines.filter(l => SKILL_CATS.some(c => l.content.toLowerCase().startsWith(c)));
            }
            if (sectionLines.length) {
                const formatted = sectionLines.map(l => {
                    const colon = l.content.indexOf(':');
                    if (colon > 0) return `**${l.content.slice(0, colon)}:**${l.content.slice(colon + 1)}`;
                    return l.content;
                });
                parts.push(`## ${section.label}\n\n${formatted.join('\n')}`);
            }
        }
    }

    return parts.join('\n\n');
}

// Hard backstop for the generation flow: if the AI's selection still
// renders over budget, trim included lines lowest-priority-first,
// recomputing length after each removal. LLMs aren't reliable at exact
// character-count arithmetic, so this can't be left to the AI alone.
export function trimToBudget(
    sections: ResumeSectionConfig[],
    textBlocks: ResumeTextBlock[],
    entries: ResumeEntry[],
    lines: ResumeLine[],
    selections: LineSelection[],
    totalCharBudget: number,
    accountProfile?: AccountProfile | null
): { includedLineIds: Set<string>; markdown: string } {
    const included = new Set(selections.filter(s => s.include).map(s => s.lineId));
    let markdown = renderResumeMarkdown(sections, textBlocks, entries, lines, included, accountProfile);

    if (markdown.length <= totalCharBudget) {
        return { includedLineIds: included, markdown };
    }

    const trimOrder = selections
        .filter(s => included.has(s.lineId))
        .sort((a, b) => a.priority - b.priority);

    for (const s of trimOrder) {
        if (markdown.length <= totalCharBudget) break;
        included.delete(s.lineId);
        markdown = renderResumeMarkdown(sections, textBlocks, entries, lines, included, accountProfile);
    }

    return { includedLineIds: included, markdown };
}
