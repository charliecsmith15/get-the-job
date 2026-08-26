import { ResumeSectionConfig, ResumeTextBlock, ResumeEntry, ResumeLine } from '../types';

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

export const getCandidateLines = (lines: ResumeLine[], jobId: string | null): ResumeLine[] =>
    lines.filter(l => !l.jobId || l.jobId === jobId);

export function renderResumeMarkdown(
    sections: ResumeSectionConfig[],
    textBlocks: ResumeTextBlock[],
    entries: ResumeEntry[],
    lines: ResumeLine[],
    includedLineIds?: Set<string> | null
): string {
    const sortedSections = byOrder(sections);
    const parts: string[] = [];

    for (const section of sortedSections) {
        if (section.type === 'text') {
            const block = textBlocks.find(t => t.sectionId === section.id);
            const content = block?.content?.trim();
            if (!content) continue;
            // The 'header' section is the resume's name/contact block — it
            // sits at the top with no section heading of its own.
            parts.push(section.id === 'header' ? content : `## ${section.label}\n\n${content}`);
            continue;
        }

        if (section.type === 'entries') {
            const sectionEntries = byOrder(entries.filter(e => e.sectionId === section.id));
            const entryBlocks: string[] = [];
            for (const entry of sectionEntries) {
                const entryLines = byOrder(lines.filter(l => l.sectionId === section.id && l.entryId === entry.id))
                    .filter(l => !includedLineIds || includedLineIds.has(l.id));
                if (!entryLines.length) continue; // drop entries left with zero included lines
                const dateRange = [entry.startDate, entry.endDate].filter(Boolean).join(' – ');
                const heading = [entry.heading, entry.subheading].filter(Boolean).join(', ');
                const headingLine = dateRange ? `**${heading}** (${dateRange})` : `**${heading}**`;
                entryBlocks.push([headingLine, ...entryLines.map(l => `- ${l.content}`)].join('\n'));
            }
            if (entryBlocks.length) parts.push(`## ${section.label}\n\n${entryBlocks.join('\n\n')}`);
            continue;
        }

        if (section.type === 'list') {
            const sectionLines = byOrder(lines.filter(l => l.sectionId === section.id && !l.entryId))
                .filter(l => !includedLineIds || includedLineIds.has(l.id));
            if (sectionLines.length) parts.push(`## ${section.label}\n\n${sectionLines.map(l => l.content).join(', ')}`);
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
    totalCharBudget: number
): { includedLineIds: Set<string>; markdown: string } {
    const included = new Set(selections.filter(s => s.include).map(s => s.lineId));
    let markdown = renderResumeMarkdown(sections, textBlocks, entries, lines, included);

    if (markdown.length <= totalCharBudget) {
        return { includedLineIds: included, markdown };
    }

    const trimOrder = selections
        .filter(s => included.has(s.lineId))
        .sort((a, b) => a.priority - b.priority);

    for (const s of trimOrder) {
        if (markdown.length <= totalCharBudget) break;
        included.delete(s.lineId);
        markdown = renderResumeMarkdown(sections, textBlocks, entries, lines, included);
    }

    return { includedLineIds: included, markdown };
}
