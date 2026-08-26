import React, { useState } from 'react';
import { useAppStore } from '../store';
import { Card, Button, Textarea } from '../components/UI';
import { FileText, Upload, Loader2 } from 'lucide-react';
import { ResumeSectionForm } from '../components/ResumeSectionForm';
import { parseResumeIntoSections } from '../services/gemini';

export const ResumeManager: React.FC = () => {
    const {
        resumeSections, resumeTextBlocks, resumeEntries, resumeLines, resumeRawImport,
        saveResumeRawImport, updateResumeText, addResumeEntry, addResumeLine,
    } = useAppStore();

    const hasContent = resumeTextBlocks.length > 0 || resumeEntries.length > 0 || resumeLines.length > 0;
    const [showImport, setShowImport] = useState(!hasContent);
    const [rawText, setRawText] = useState(resumeRawImport || '');
    const [isParsing, setIsParsing] = useState(false);

    const handleParse = async () => {
        if (!rawText.trim()) return;
        setIsParsing(true);
        try {
            const parsed = await parseResumeIntoSections(rawText, resumeSections);
            await saveResumeRawImport(rawText);

            for (const tb of parsed.textBlocks) {
                await updateResumeText(tb.sectionId, tb.content);
            }
            for (const en of parsed.entries) {
                const entry = await addResumeEntry({
                    sectionId: en.sectionId,
                    heading: en.heading,
                    subheading: en.subheading || '',
                    startDate: en.startDate || '',
                    endDate: en.endDate || '',
                    order: resumeEntries.filter(e => e.sectionId === en.sectionId).length,
                });
                for (let i = 0; i < en.lines.length; i++) {
                    await addResumeLine({ sectionId: en.sectionId, entryId: entry.id, jobId: null, content: en.lines[i], order: i });
                }
            }
            for (const li of parsed.listItems) {
                await addResumeLine({
                    sectionId: li.sectionId, entryId: null, jobId: null, content: li.content,
                    order: resumeLines.filter(l => l.sectionId === li.sectionId && !l.entryId).length,
                });
            }
            setShowImport(false);
        } catch (error) {
            alert('Failed to parse resume. Check console for details.');
            console.error(error);
        } finally {
            setIsParsing(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto crm-enter duration-500 pb-12">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-ink">Resume</h1>
                <p className="text-taupe text-sm mt-1">Your single resume, broken into sections. Tailor it per job from that job's page.</p>
            </div>

            {!hasContent && !showImport ? null : showImport ? (
                <Card className="p-6 mb-8 crm-enter">
                    <div className="flex items-center space-x-2 mb-3">
                        <Upload className="w-5 h-5 text-wood" />
                        <h2 className="text-lg font-semibold text-ink">Import your resume</h2>
                    </div>
                    <p className="text-taupe text-sm mb-4">
                        Paste your resume text below. The AI will propose a structured split into the sections below — nothing is invented, only reorganized — and you can review and edit everything afterward. This adds to what's already there; it won't remove existing sections.
                    </p>
                    <Textarea
                        rows={12}
                        placeholder="Paste your resume text here..."
                        value={rawText}
                        onChange={e => setRawText(e.target.value)}
                    />
                    <div className="flex justify-end space-x-2 mt-4">
                        {hasContent && <Button variant="ghost" onClick={() => setShowImport(false)}>Cancel</Button>}
                        <Button icon={isParsing ? undefined : FileText} onClick={handleParse} disabled={isParsing || !rawText.trim()}>
                            {isParsing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Parse into sections'}
                        </Button>
                    </div>
                </Card>
            ) : (
                <div className="mb-6 flex justify-end">
                    <Button variant="secondary" icon={Upload} onClick={() => setShowImport(true)}>Import more text</Button>
                </div>
            )}

            {hasContent && (
                <Card className="p-6">
                    <ResumeSectionForm mode="baseline" />
                </Card>
            )}
        </div>
    );
};
