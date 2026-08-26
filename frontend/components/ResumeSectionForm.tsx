import React, { useState } from 'react';
import { useAppStore } from '../store';
import { Card, Button, Input, Textarea } from './UI';
import { Plus, Trash2 } from 'lucide-react';

interface ResumeSectionFormProps {
    mode: 'baseline' | 'job';
    jobId?: string;
}

const BULLET_MAX = 110;
const SUMMARY_MAX = 500;

const byOrder = <T extends { order: number }>(items: T[]): T[] => [...items].sort((a, b) => a.order - b.order);

// Character counter shown next to bullet line inputs
const CharCount: React.FC<{ count: number; max: number }> = ({ count, max }) => (
    <span className={`text-xs ml-1 tabular-nums ${count > max ? 'text-red-500 font-semibold' : 'text-taupe'}`}>
        {count}/{max}
    </span>
);

export const ResumeSectionForm: React.FC<ResumeSectionFormProps> = ({ mode, jobId }) => {
    const {
        resumeSections, resumeTextBlocks, resumeEntries, resumeLines,
        updateResumeText, addResumeEntry, updateResumeEntry, deleteResumeEntry,
        addResumeLine, updateResumeLine, deleteResumeLine,
    } = useAppStore();

    const [newLineDrafts, setNewLineDrafts] = useState<Record<string, string>>({});
    const draftKey = (sectionId: string, entryId?: string) => entryId ? `${sectionId}:${entryId}` : sectionId;

    const handleAddLine = async (sectionId: string, entryId: string | undefined, forJob: boolean) => {
        const key = draftKey(sectionId, entryId);
        const content = (newLineDrafts[key] || '').trim();
        if (!content) return;
        if (entryId && content.length > BULLET_MAX) return; // block save if over limit
        const siblingLines = resumeLines.filter(l => l.sectionId === sectionId && (l.entryId ?? undefined) === entryId);
        await addResumeLine({
            sectionId,
            entryId: entryId ?? null,
            jobId: forJob ? (jobId ?? null) : null,
            content,
            order: siblingLines.length,
        });
        setNewLineDrafts(prev => ({ ...prev, [key]: '' }));
    };

    const handleAddEntry = async (sectionId: string) => {
        const siblingEntries = resumeEntries.filter(e => e.sectionId === sectionId);
        return addResumeEntry({
            sectionId, heading: 'New entry', subheading: '', location: '', startDate: '', endDate: '', order: siblingEntries.length,
        });
    };

    const sections = byOrder(resumeSections);

    if (mode === 'job') {
        const lineSections = sections.filter(s => s.type !== 'text');
        return (
            <div className="space-y-6">
                {lineSections.map(section => {
                    const sectionEntries = section.type === 'entries' ? byOrder(resumeEntries.filter(e => e.sectionId === section.id)) : [];
                    const sectionListLines = section.type === 'list'
                        ? byOrder(resumeLines.filter(l => l.sectionId === section.id && !l.entryId))
                        : [];

                    return (
                        <div key={section.id}>
                            <h3 className="text-sm font-semibold text-ink mb-2">{section.label}</h3>

                            {section.type === 'entries' && (
                                <div className="space-y-3">
                                    {sectionEntries.map(entry => {
                                        const baselineLines = byOrder(resumeLines.filter(l => l.sectionId === section.id && l.entryId === entry.id && !l.jobId));
                                        const jobLines = byOrder(resumeLines.filter(l => l.sectionId === section.id && l.entryId === entry.id && l.jobId === jobId));
                                        const key = draftKey(section.id, entry.id);
                                        const draft = newLineDrafts[key] || '';
                                        const isExperience = section.id !== 'education';
                                        return (
                                            <Card key={entry.id} className="p-4">
                                                <p className="text-sm font-medium text-ink">{[entry.heading, entry.subheading].filter(Boolean).join(', ')}</p>
                                                {baselineLines.length > 0 && (
                                                    <ul className="mt-2 space-y-1 list-disc pl-5">
                                                        {baselineLines.map(l => <li key={l.id} className="text-xs text-taupe">{l.content}</li>)}
                                                    </ul>
                                                )}
                                                {jobLines.length > 0 && (
                                                    <ul className="mt-2 space-y-1">
                                                        {jobLines.map(l => (
                                                            <li key={l.id} className="flex items-center justify-between text-xs text-ink bg-cream rounded px-2 py-1">
                                                                <span>{l.content}</span>
                                                                <button onClick={() => deleteResumeLine(l.id)} className="text-taupe hover:text-danger ml-2"><Trash2 className="w-3 h-3" /></button>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                                {isExperience && (
                                                    <div className="mt-2">
                                                        <div className="flex space-x-2">
                                                            <input
                                                                className={`flex-1 px-2 py-1 border rounded text-xs bg-paper text-ink crm-focus ${draft.length > BULLET_MAX ? 'border-red-400' : 'border-sand'}`}
                                                                placeholder="Add a line for this job..."
                                                                value={draft}
                                                                onChange={e => setNewLineDrafts(prev => ({ ...prev, [key]: e.target.value }))}
                                                                onKeyDown={e => e.key === 'Enter' && handleAddLine(section.id, entry.id, true)}
                                                            />
                                                            <Button variant="ghost" onClick={() => handleAddLine(section.id, entry.id, true)} disabled={draft.length > BULLET_MAX}><Plus className="w-4 h-4" /></Button>
                                                        </div>
                                                        <CharCount count={draft.length} max={BULLET_MAX} />
                                                        {draft.length > BULLET_MAX && (
                                                            <p className="text-xs text-red-500 mt-1">Max {BULLET_MAX} characters — shorten before adding</p>
                                                        )}
                                                    </div>
                                                )}
                                            </Card>
                                        );
                                    })}
                                    {sectionEntries.length === 0 && <p className="text-xs text-taupe">No {section.label.toLowerCase()} entries in your baseline resume yet.</p>}
                                </div>
                            )}

                            {section.type === 'list' && (
                                <Card className="p-4">
                                    {sectionListLines.length > 0 && (
                                        <p className="text-xs text-taupe mb-2">Baseline: {sectionListLines.map(l => l.content).join(', ')}</p>
                                    )}
                                    <ul className="space-y-1">
                                        {byOrder(resumeLines.filter(l => l.sectionId === section.id && !l.entryId && l.jobId === jobId)).map(l => (
                                            <li key={l.id} className="flex items-center justify-between text-xs text-ink bg-cream rounded px-2 py-1">
                                                <span>{l.content}</span>
                                                <button onClick={() => deleteResumeLine(l.id)} className="text-taupe hover:text-danger ml-2"><Trash2 className="w-3 h-3" /></button>
                                            </li>
                                        ))}
                                    </ul>
                                    <div className="mt-2 flex space-x-2">
                                        <input
                                            className="flex-1 px-2 py-1 border border-sand rounded text-xs bg-paper text-ink crm-focus"
                                            placeholder={`Add a ${section.label.toLowerCase()} item for this job...`}
                                            value={newLineDrafts[draftKey(section.id)] || ''}
                                            onChange={e => setNewLineDrafts(prev => ({ ...prev, [draftKey(section.id)]: e.target.value }))}
                                            onKeyDown={e => e.key === 'Enter' && handleAddLine(section.id, undefined, true)}
                                        />
                                        <Button variant="ghost" onClick={() => handleAddLine(section.id, undefined, true)}><Plus className="w-4 h-4" /></Button>
                                    </div>
                                </Card>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    }

    // mode === 'baseline'
    return (
        <div className="space-y-8">
            {sections.map(section => {
                if (section.type === 'text') {
                    const block = resumeTextBlocks.find(t => t.sectionId === section.id);
                    const content = block?.content || '';
                    const isSummary = section.id === 'summary';
                    return (
                        <div key={section.id}>
                            <Textarea
                                label={section.label}
                                rows={section.id === 'header' ? 3 : 6}
                                value={content}
                                onChange={e => updateResumeText(section.id, e.target.value)}
                            />
                            {isSummary && (
                                <p className={`text-xs mt-1 text-right ${content.length > SUMMARY_MAX ? 'text-red-500 font-semibold' : 'text-taupe'}`}>
                                    {content.length}/{SUMMARY_MAX} characters
                                </p>
                            )}
                        </div>
                    );
                }

                if (section.type === 'entries') {
                    const isExperience = section.id !== 'education';
                    const sectionEntries = byOrder(resumeEntries.filter(e => e.sectionId === section.id));
                    return (
                        <div key={section.id}>
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="text-sm font-semibold text-ink">{section.label}</h3>
                                <Button variant="ghost" icon={Plus} onClick={() => handleAddEntry(section.id)}>Add {section.label.replace(/s$/, '')}</Button>
                            </div>
                            <div className="space-y-4">
                                {sectionEntries.map(entry => {
                                    const entryLines = byOrder(resumeLines.filter(l => l.sectionId === section.id && l.entryId === entry.id && !l.jobId));
                                    const key = draftKey(section.id, entry.id);
                                    const draft = newLineDrafts[key] || '';
                                    return (
                                        <Card key={entry.id} className="p-4">
                                            <div className="flex justify-between items-start gap-2 mb-3">
                                                <div className="flex flex-col gap-2 flex-1">
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <Input placeholder="Company" value={entry.heading} onChange={e => updateResumeEntry(entry.id, { heading: e.target.value })} />
                                                        <Input placeholder="Title" value={entry.subheading || ''} onChange={e => updateResumeEntry(entry.id, { subheading: e.target.value })} />
                                                    </div>
                                                    {isExperience && (
                                                        <>
                                                            <div className="grid grid-cols-2 gap-2">
                                                                <Input placeholder="Start date (e.g. Jan 2022)" value={entry.startDate || ''} onChange={e => updateResumeEntry(entry.id, { startDate: e.target.value })} />
                                                                <Input placeholder="End date (e.g. Mar 2024 or Present)" value={entry.endDate || ''} onChange={e => updateResumeEntry(entry.id, { endDate: e.target.value })} />
                                                            </div>
                                                            <Input placeholder="Location (e.g. New York, NY)" value={entry.location || ''} onChange={e => updateResumeEntry(entry.id, { location: e.target.value })} />
                                                        </>
                                                    )}
                                                </div>
                                                <button onClick={() => { if (confirm('Delete this entry and its lines?')) deleteResumeEntry(entry.id); }} className="text-taupe hover:text-danger p-1">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                            {isExperience && (
                                                <>
                                                    <ul className="space-y-1">
                                                        {entryLines.map(l => (
                                                            <li key={l.id} className="flex items-center space-x-2">
                                                                <input
                                                                    className="flex-1 px-2 py-1 border border-sand rounded text-xs bg-paper text-ink crm-focus"
                                                                    value={l.content}
                                                                    maxLength={BULLET_MAX}
                                                                    onChange={e => updateResumeLine(l.id, { content: e.target.value })}
                                                                />
                                                                <CharCount count={l.content.length} max={BULLET_MAX} />
                                                                <button onClick={() => deleteResumeLine(l.id)} className="text-taupe hover:text-danger"><Trash2 className="w-3 h-3" /></button>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                    <div className="mt-2">
                                                        <div className="flex space-x-2">
                                                            <input
                                                                className={`flex-1 px-2 py-1 border rounded text-xs bg-paper text-ink crm-focus ${draft.length > BULLET_MAX ? 'border-red-400' : 'border-sand'}`}
                                                                placeholder="Add a bullet line..."
                                                                value={draft}
                                                                onChange={e => setNewLineDrafts(prev => ({ ...prev, [key]: e.target.value }))}
                                                                onKeyDown={e => e.key === 'Enter' && handleAddLine(section.id, entry.id, false)}
                                                            />
                                                            <Button variant="ghost" onClick={() => handleAddLine(section.id, entry.id, false)} disabled={draft.length > BULLET_MAX}><Plus className="w-4 h-4" /></Button>
                                                        </div>
                                                        <CharCount count={draft.length} max={BULLET_MAX} />
                                                        {draft.length > BULLET_MAX && (
                                                            <p className="text-xs text-red-500 mt-1">Max {BULLET_MAX} characters — shorten before adding</p>
                                                        )}
                                                    </div>
                                                </>
                                            )}
                                        </Card>
                                    );
                                })}
                                {sectionEntries.length === 0 && <p className="text-xs text-taupe">No entries yet — click "Add {section.label.replace(/s$/, '')}" to add one.</p>}
                            </div>
                        </div>
                    );
                }

                // list
                const sectionLines = byOrder(resumeLines.filter(l => l.sectionId === section.id && !l.entryId && !l.jobId));
                const key = draftKey(section.id);
                return (
                    <div key={section.id}>
                        <h3 className="text-sm font-semibold text-ink mb-2">{section.label}</h3>
                        <Card className="p-4">
                            <ul className="space-y-1">
                                {sectionLines.map(l => (
                                    <li key={l.id} className="flex items-center space-x-2">
                                        <input
                                            className="flex-1 px-2 py-1 border border-sand rounded text-xs bg-paper text-ink crm-focus"
                                            value={l.content}
                                            onChange={e => updateResumeLine(l.id, { content: e.target.value })}
                                        />
                                        <button onClick={() => deleteResumeLine(l.id)} className="text-taupe hover:text-danger"><Trash2 className="w-3 h-3" /></button>
                                    </li>
                                ))}
                            </ul>
                            <div className="mt-2 flex space-x-2">
                                <input
                                    className="flex-1 px-2 py-1 border border-sand rounded text-xs bg-paper text-ink crm-focus"
                                    placeholder={`Add a ${section.label.toLowerCase()} item...`}
                                    value={newLineDrafts[key] || ''}
                                    onChange={e => setNewLineDrafts(prev => ({ ...prev, [key]: e.target.value }))}
                                    onKeyDown={e => e.key === 'Enter' && handleAddLine(section.id, undefined, false)}
                                />
                                <Button variant="ghost" onClick={() => handleAddLine(section.id, undefined, false)}><Plus className="w-4 h-4" /></Button>
                            </div>
                        </Card>
                    </div>
                );
            })}
        </div>
    );
};
