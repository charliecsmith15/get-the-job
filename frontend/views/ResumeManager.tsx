import React, { useState } from 'react';
import { useAppStore } from '../store';
import { Card, Button, Input, Textarea } from '../components/UI';
import { FileText, Upload, Loader2, Save } from 'lucide-react';
import { ResumeSectionForm } from '../components/ResumeSectionForm';
import { parseResumeIntoSections } from '../services/gemini';

export const ResumeManager: React.FC = () => {
    const {
        accountProfile, updateAccountProfile,
        resumeSections, resumeTextBlocks, resumeEntries, resumeLines, resumeRawImport,
        saveResumeRawImport, updateResumeText, addResumeEntry, addResumeLine,
        resumeIsDirty, saveResume,
    } = useAppStore();

    const hasContent = resumeTextBlocks.length > 0 || resumeEntries.length > 0 || resumeLines.length > 0;
    const [showImport, setShowImport] = useState(!hasContent);
    const [rawText, setRawText] = useState(resumeRawImport || '');
    const [isParsing, setIsParsing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

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

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await saveResume();
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto crm-enter duration-500 pb-12">
            <div className="mb-6 flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-ink">Resume</h1>
                    <p className="text-taupe text-sm mt-1">Your single resume, broken into sections. Tailor it per job from that job's page.</p>
                </div>
                {hasContent && (
                    <div className="flex items-center gap-3 mt-1">
                        {resumeIsDirty && !isSaving && (
                            <span className="text-xs text-amber-600 font-medium">Unsaved changes</span>
                        )}
                        <Button
                            icon={isSaving ? undefined : Save}
                            onClick={handleSave}
                            disabled={isSaving || !resumeIsDirty}
                        >
                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
                        </Button>
                    </div>
                )}
            </div>

            <Card className="p-6 mb-6">
                <h2 className="text-sm font-semibold text-ink mb-3">Contact Info</h2>
                <p className="text-xs text-taupe mb-4">Automatically included at the top of every resume download.</p>
                <div className="grid grid-cols-2 gap-3">
                    <Input placeholder="First name" value={accountProfile.firstName} onChange={e => updateAccountProfile({ firstName: e.target.value })} />
                    <Input placeholder="Last name" value={accountProfile.lastName} onChange={e => updateAccountProfile({ lastName: e.target.value })} />
                    <Input placeholder="Phone number" value={accountProfile.phoneNumber} onChange={e => updateAccountProfile({ phoneNumber: e.target.value })} />
                    <Input placeholder="Display email" value={accountProfile.displayEmail} onChange={e => updateAccountProfile({ displayEmail: e.target.value })} />
                    <div className="col-span-2">
                        <Input placeholder="LinkedIn URL" value={accountProfile.linkedin} onChange={e => updateAccountProfile({ linkedin: e.target.value })} />
                    </div>
                </div>
            </Card>

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
