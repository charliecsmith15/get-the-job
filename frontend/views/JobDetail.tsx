import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { Card, Button, Badge, Textarea, Input, renderBold, renderMarkdown } from '../components/UI';
import { ArrowLeft, ExternalLink, Trash2, Sparkles, MessageSquare, FileText, CheckCircle2, XCircle, Loader2, Target, Download, Save, MapPin, Calendar, Tag, Plus, X, ScrollText, Mic, ChevronDown, ChevronUp, Pencil } from 'lucide-react';
import { analyzeJobMatch, generateInterviewQuestions, selectResumeLines, getRelevantTechnicalQuestions, RESUME_ADVICE_SYSTEM_INSTRUCTION, RESUME_ADVICE_USER_PROMPT } from '../services/gemini';
import { renderResumeMarkdown, trimToBudget, getCandidateLines } from '../services/resumeRenderer';
import { downloadResume, DownloadFormat } from '../services/resumeDownload';
import { ResumeSectionForm } from '../components/ResumeSectionForm';
import { Job, ResumeEntry, ResumeLine } from '../types';

export const JobDetail: React.FC = () => {
    const {
        jobs, notes, preferences, contextResources, journalEntries, interviewQuestions, jobAnalyses, selectedJobId, navigate, updateJob, deleteJob, addNote, updateNote, deleteNote, setJobAnalysis, jobSources, addInterviewQuestion,
        accountProfile, resumeSections, resumeCharBudget, resumeTextBlocks, resumeEntries, resumeLines, resumeMarkdown, resumeGenerations, saveResumeGeneration,
        addResumeLine, deleteResumeLine,
    } = useAppStore();
    const [activeTab, setActiveTab] = useState<'details' | 'ai' | 'resume' | 'interview' | 'notes'>('details');
    
    // Edit State
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState<Partial<Job>>({});
    const [tagsInput, setTagsInput] = useState('');
    const [customFieldsList, setCustomFieldsList] = useState<{key: string, value: string}[]>([]);

    const [newNote, setNewNote] = useState({ type: 'General' as const, title: '', content: '' });
    const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
    const [editNoteForm, setEditNoteForm] = useState({ type: 'General' as 'General' | 'Call' | 'Interview' | 'Assignment', title: '', content: '' });
    
    // AI States
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
    const [isGeneratingResume, setIsGeneratingResume] = useState(false);
    
    const [aiQuestions, setAiQuestions] = useState<string | null>(null);
    const [savedAiQuestions, setSavedAiQuestions] = useState<Set<number>>(new Set());
    const [relevantTechnicalIds, setRelevantTechnicalIds] = useState<string[] | null>(null);
    const [isCheckingRelevance, setIsCheckingRelevance] = useState(false);
    const [includedLineIds, setIncludedLineIds] = useState<Set<string> | null>(null);
    const [tailoredSummary, setTailoredSummary] = useState('');
    const [newBulletDrafts, setNewBulletDrafts] = useState<Record<string, string>>({});
    const [stagedBullets, setStagedBullets] = useState<Record<string, string[]>>({});

    const job = jobs.find(j => j.id === selectedJobId);
    const jobNotes = notes.filter(n => n.jobId === selectedJobId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    useEffect(() => {
        if (!job?.description || jobAnalyses.find(a => a.jobId === job.id)) return;
        setIsAnalyzing(true);
        analyzeJobMatch(job.description, preferences, contextResources, journalEntries, resumeMarkdown)
            .then(result => setJobAnalysis(job.id, result))
            .catch(() => {})
            .finally(() => setIsAnalyzing(false));
    }, [job?.id]);

    // Load this job's last saved resume generation (if any) so reopening
    // the job re-shows it, including any manual checkbox overrides.
    useEffect(() => {
        const existing = job ? resumeGenerations.find(g => g.jobId === job.id) : null;
        setIncludedLineIds(existing ? new Set(existing.selectedLineIds) : null);
    }, [job?.id]);

    useEffect(() => {
        const baseline = resumeTextBlocks.find(t => t.sectionId === 'summary')?.content ?? '';
        setTailoredSummary(job?.customFields?._tailoredSummary ?? baseline);
    }, [job?.id]);

    useEffect(() => {
        const technicalQs = interviewQuestions.filter(q => q.category === 'Technical' && q.response?.trim());
        if (!job?.description || !technicalQs.length) {
            setRelevantTechnicalIds([]);
            return;
        }
        setIsCheckingRelevance(true);
        getRelevantTechnicalQuestions(job.description, technicalQs.map(q => ({ id: q.id, question: q.question })))
            .then(ids => setRelevantTechnicalIds(ids))
            .catch(() => setRelevantTechnicalIds(technicalQs.map(q => q.id)))
            .finally(() => setIsCheckingRelevance(false));
    }, [job?.id]);

    if (!job) {
        return <div className="p-8 text-center text-taupe">Job not found. <Button variant="ghost" onClick={() => navigate('jobs')}>Go back</Button></div>;
    }

    const startEditing = () => {
        setEditForm(job);
        setTagsInput(job.tags?.join(', ') || '');
        setCustomFieldsList(Object.entries(job.customFields || {}).filter(([k]) => !k.startsWith('_')).map(([k, v]) => ({key: k, value: v})));
        setIsEditing(true);
    };

    const handleSaveDetails = () => {
        const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
        const customFields = {
            ...customFieldsList.reduce((acc, curr) => {
                if (curr.key.trim()) acc[curr.key.trim()] = curr.value;
                return acc;
            }, {} as Record<string, string>),
            ...Object.fromEntries(Object.entries(job.customFields || {}).filter(([k]) => k.startsWith('_'))),
        };

        updateJob(job.id, {
            ...editForm,
            tags,
            customFields
        });
        setIsEditing(false);
    };

    const handleAddNote = () => {
        if (newNote.title.trim() && newNote.content.trim()) {
            addNote({ jobId: job.id, type: newNote.type, title: newNote.title, content: newNote.content });
            setNewNote({ type: 'General', title: '', content: '' });
        }
    };

    const handleAnalyzeMatch = async () => {
        if (!job.description) return alert("Please add a job description first.");
        setIsAnalyzing(true);
        try {
            const result = await analyzeJobMatch(job.description, preferences, contextResources, journalEntries, resumeMarkdown);
            setJobAnalysis(job.id, result);
        } catch (error) {
            alert("Failed to analyze match. Check console or API key.");
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleGenerateQuestions = async () => {
        if (!job.description) return alert("Please add a job description first.");
        setIsGeneratingQuestions(true);
        setSavedAiQuestions(new Set());
        try {
            const result = await generateInterviewQuestions(job.description, preferences, interviewQuestions, resumeMarkdown);
            setAiQuestions(result);
        } catch (error) {
            alert("Failed to generate questions.");
        } finally {
            setIsGeneratingQuestions(false);
        }
    };


    // The AI only selects which candidate lines to include — it never
    // rewrites the resume. We then deterministically render the result and
    // trim to the length budget if the selection still comes in over it.
    const handleGenerateResume = async () => {
        if (!job.description) return alert("Please add a job description first.");

        setIsGeneratingResume(true);
        try {
            const candidateLines = getCandidateLines(resumeLines, job.id).map(l => ({ id: l.id, sectionId: l.sectionId, entryId: l.entryId, content: l.content }));
            const entriesForPrompt = resumeEntries.map(e => ({ id: e.id, sectionId: e.sectionId, heading: e.heading, subheading: e.subheading }));
            const selections = await selectResumeLines(
                job.description, resumeSections, entriesForPrompt, candidateLines, resumeCharBudget,
                resumeMarkdown, preferences, contextResources, journalEntries
            );
            const { includedLineIds: trimmed } = trimToBudget(resumeSections, resumeTextBlocks, resumeEntries, resumeLines, selections, resumeCharBudget, accountProfile);
            setIncludedLineIds(trimmed);
            } catch (error) {
            alert("Failed to generate tailored resume.");
        } finally {
            setIsGeneratingResume(false);
        }
    };

    const toggleGeneratedLine = (lineId: string) => {
        setIncludedLineIds(prev => {
            const next = new Set(prev ?? []);
            if (next.has(lineId)) next.delete(lineId); else next.add(lineId);
            return next;
        });
    };

    const tailoredTextBlocks = resumeTextBlocks.map(t =>
        t.sectionId === 'summary' && tailoredSummary ? { ...t, content: tailoredSummary } : t
    );
    const generatedMarkdown = includedLineIds
        ? renderResumeMarkdown(resumeSections, tailoredTextBlocks, resumeEntries, resumeLines, includedLineIds, accountProfile)
        : null;

    const [showDownloadMenu, setShowDownloadMenu] = useState(false);
    const [resumeEditsOpen, setResumeEditsOpen] = useState(true);
    const [promptOpen, setPromptOpen] = useState(false);

    const handleExportGeneratedResume = (format: DownloadFormat) => {
        if (!generatedMarkdown) return;
        downloadResume(
            generatedMarkdown,
            `${job.company}_${accountProfile.firstName}_${accountProfile.lastName}`,
            format,
            { sections: resumeSections, textBlocks: resumeTextBlocks, entries: resumeEntries, lines: resumeLines, includedLineIds, accountProfile }
        );
        setShowDownloadMenu(false);
    };

    const handleSaveGeneratedResume = async () => {
        if (!includedLineIds) return;

        const newLineIds = new Set(includedLineIds);
        const extraLines: ResumeLine[] = [];
        const hasStagedBullets = Object.values(stagedBullets).some(arr => arr.length > 0);

        if (hasStagedBullets) {
            for (const [entryId, bullets] of Object.entries(stagedBullets)) {
                if (!bullets.length) continue;
                const siblingLines = resumeLines.filter(l => l.sectionId === 'experience' && l.entryId === entryId);
                for (let i = 0; i < bullets.length; i++) {
                    const newLine = await addResumeLine({
                        sectionId: 'experience',
                        entryId,
                        jobId: job.id,
                        content: bullets[i],
                        order: siblingLines.length + i,
                    });
                    newLineIds.add(newLine.id);
                    extraLines.push(newLine);
                }
            }
            setStagedBullets({});
            setIncludedLineIds(newLineIds);
        }

        const allLines = extraLines.length ? [...resumeLines, ...extraLines] : resumeLines;
        const markdownToSave = renderResumeMarkdown(resumeSections, tailoredTextBlocks, resumeEntries, allLines, newLineIds, accountProfile);
        saveResumeGeneration(job.id, Array.from(newLineIds), markdownToSave);
        alert("Saved!");
    };

    const handleAddJobBullet = (entry: ResumeEntry) => {
        const content = (newBulletDrafts[entry.id] || '').trim();
        if (!content || content.length > 110) return;
        setStagedBullets(prev => ({ ...prev, [entry.id]: [...(prev[entry.id] || []), content] }));
        setNewBulletDrafts(prev => ({ ...prev, [entry.id]: '' }));
    };

    const rawAnalysis = jobAnalyses.find(a => a.jobId === job.id) ?? null;
    const analysis = rawAnalysis ? {
        ...rawAnalysis,
        fitReason: Array.isArray(rawAnalysis.fitReason) ? rawAnalysis.fitReason : [rawAnalysis.fitReason as unknown as string],
        resumeEdits: Array.isArray(rawAnalysis.resumeEdits) ? rawAnalysis.resumeEdits : [rawAnalysis.resumeEdits as unknown as string],
        missingExperience: Array.isArray(rawAnalysis.missingExperience) ? rawAnalysis.missingExperience : (rawAnalysis.missingExperience ? [rawAnalysis.missingExperience as unknown as string] : []),
    } : null;

    return (
        <div className="max-w-5xl mx-auto crm-enter pb-12">
            {/* Header */}
            <div className="mb-6">
                {/* Top row: back button + actions */}
                <div className="flex items-center justify-between mb-3">
                    <button onClick={() => navigate('jobs')} className="p-2 hover:bg-sand rounded-full transition-colors text-taupe">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex items-center space-x-2">
                        <select
                            className="px-2 py-1.5 border border-sand rounded-lg text-sm font-medium bg-paper text-ink crm-focus"
                            value={job.status}
                            onChange={(e) => updateJob(job.id, { status: e.target.value as any })}
                        >
                            {['Saved', 'Applied', 'Interviewing', 'Offer', 'Rejected'].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <button
                            onClick={() => { if(confirm('Delete this job?')) deleteJob(job.id); }}
                            className="p-2 rounded-lg text-danger hover:bg-danger/10 transition-colors"
                            title="Delete job"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                </div>
                {/* Title block */}
                <div className="pl-1">
                    <h1 className="text-xl sm:text-2xl font-bold text-ink flex flex-wrap items-center gap-2">
                        {job.title}
                        {analysis && (
                            <Badge color={analysis.score > 80 ? 'green' : analysis.score > 50 ? 'yellow' : 'red'}>
                                {analysis.score}% Match
                            </Badge>
                        )}
                    </h1>
                    <p className="text-base sm:text-lg text-taupe">{job.company}</p>
                </div>
            </div>

            {/* Tabs — sticky on mobile so they stay accessible while scrolling content */}
            <div className="sticky top-0 z-10 bg-paper/95 backdrop-blur-sm -mx-4 px-4 sm:mx-0 sm:px-0 sm:static sm:bg-transparent sm:backdrop-blur-none">
                <div className="flex border-b border-sand mb-6">
                    {[
                        { id: 'details', label: 'Details', shortLabel: 'Details', icon: FileText },
                        { id: 'ai', label: 'Match Insights', shortLabel: 'Insights', icon: Sparkles },
                        { id: 'resume', label: 'Resume Edits', shortLabel: 'Resume', icon: ScrollText },
                        { id: 'interview', label: 'Interview Prep', shortLabel: 'Interview', icon: Mic },
                        { id: 'notes', label: 'Notes & Events', shortLabel: 'Notes', icon: MessageSquare }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex items-center px-3 sm:px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id ? 'border-wood text-wood' : 'border-transparent text-taupe hover:text-ink hover:border-sand'}`}
                        >
                            <tab.icon className="w-4 h-4 sm:mr-2 flex-shrink-0" />
                            <span className="hidden sm:inline">{tab.label}</span>
                            <span className="sm:hidden ml-1">{tab.shortLabel}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab Content */}
            <div className="mt-6">
                {/* DETAILS TAB */}
                {activeTab === 'details' && (
                    <Card className="p-6">
                        {isEditing ? (
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <Input label="Job Title *" value={editForm.title || ''} onChange={e => setEditForm({...editForm, title: e.target.value})} />
                                    <Input label="Company *" value={editForm.company || ''} onChange={e => setEditForm({...editForm, company: e.target.value})} />
                                    <Input label="Location" value={editForm.location || ''} onChange={e => setEditForm({...editForm, location: e.target.value})} />
                                    <Input label="Date Applied" type="date" value={editForm.dateApplied || ''} onChange={e => setEditForm({...editForm, dateApplied: e.target.value})} />
                                    <Input label="Job URL" type="url" value={editForm.url || ''} onChange={e => setEditForm({...editForm, url: e.target.value})} />
                                    <Input label="Tags (comma separated)" value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder="e.g., React, Remote, Startup" />
                                    {jobSources.length > 0 && (
                                        <div>
                                            <label className="block text-sm font-medium text-ink mb-1">Source</label>
                                            <select className="w-full px-3 py-2 border border-sand rounded-lg bg-paper text-ink crm-focus text-sm" value={editForm.source ?? ''} onChange={e => setEditForm({...editForm, source: e.target.value})}>
                                                <option value="">— none —</option>
                                                {jobSources.map(s => <option key={s.id} value={s.label}>{s.label}</option>)}
                                            </select>
                                        </div>
                                    )}
                                </div>
                                
                                <div className="space-y-3 border-t border-sand pt-4">
                                    <label className="block text-sm font-medium text-ink">Custom Fields</label>
                                    {customFieldsList.map((field, idx) => (
                                        <div key={idx} className="flex space-x-2 items-center">
                                            <Input placeholder="Field Name (e.g., Recruiter)" value={field.key} onChange={e => {
                                                const newList = [...customFieldsList];
                                                newList[idx].key = e.target.value;
                                                setCustomFieldsList(newList);
                                            }} />
                                            <Input placeholder="Value" value={field.value} onChange={e => {
                                                const newList = [...customFieldsList];
                                                newList[idx].value = e.target.value;
                                                setCustomFieldsList(newList);
                                            }} />
                                            <button onClick={() => setCustomFieldsList(customFieldsList.filter((_, i) => i !== idx))} className="text-taupe hover:text-danger p-2">
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                    <Button variant="secondary" icon={Plus} onClick={() => setCustomFieldsList([...customFieldsList, {key: '', value: ''}])}>
                                        Add Custom Field
                                    </Button>
                                </div>

                                <div className="border-t border-sand pt-4">
                                    <Textarea label="Job Description" rows={10} value={editForm.description || ''} onChange={e => setEditForm({...editForm, description: e.target.value})} placeholder="Paste the full job description here for better AI analysis..." />
                                </div>

                                <div className="flex justify-end space-x-2 pt-4">
                                    <Button variant="ghost" onClick={() => setIsEditing(false)}>Cancel</Button>
                                    <Button onClick={handleSaveDetails}>Save Changes</Button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-8">
                                <div className="flex justify-between items-start">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
                                        <div>
                                            <h3 className="text-xs font-medium text-taupe uppercase tracking-wider mb-1">Job URL</h3>
                                            {job.url ? (
                                                <a href={job.url} target="_blank" rel="noopener noreferrer" className="text-wood hover:underline flex items-center text-sm">
                                                    {job.url} <ExternalLink className="w-3 h-3 ml-1" />
                                                </a>
                                            ) : <span className="text-taupe italic text-sm">No URL provided</span>}
                                        </div>
                                        
                                        {job.location && (
                                            <div>
                                                <h3 className="text-xs font-medium text-taupe uppercase tracking-wider mb-1">Location</h3>
                                                <p className="text-ink text-sm flex items-center"><MapPin className="w-4 h-4 mr-1 text-taupe"/> {job.location}</p>
                                            </div>
                                        )}

                                        {job.dateApplied && (
                                            <div>
                                                <h3 className="text-xs font-medium text-taupe uppercase tracking-wider mb-1">Date Applied</h3>
                                                <p className="text-ink text-sm flex items-center"><Calendar className="w-4 h-4 mr-1 text-taupe"/> {new Date(job.dateApplied).toLocaleDateString()}</p>
                                            </div>
                                        )}

                                        {job.source && (
                                            <div>
                                                <h3 className="text-xs font-medium text-taupe uppercase tracking-wider mb-1">Source</h3>
                                                <p className="text-ink text-sm">{job.source}</p>
                                            </div>
                                        )}

                                        {job.tags && job.tags.length > 0 && (
                                            <div>
                                                <h3 className="text-xs font-medium text-taupe uppercase tracking-wider mb-1">Tags</h3>
                                                <div className="flex flex-wrap gap-2">
                                                    {job.tags.map(tag => (
                                                        <span key={tag} className="text-xs px-2 py-1 bg-sand/50 text-ink rounded-md flex items-center">
                                                            <Tag className="w-3 h-3 mr-1 text-taupe"/> {tag}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {job.customFields && Object.keys(job.customFields).length > 0 && (
                                            <div className="col-span-full grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4 mt-2 pt-4 border-t border-sand/50">
                                                {Object.entries(job.customFields).map(([key, value]) => (
                                                    <div key={key}>
                                                        <h3 className="text-xs font-medium text-taupe uppercase tracking-wider mb-1">{key}</h3>
                                                        <p className="text-ink text-sm">{value}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <Button variant="secondary" onClick={startEditing}>Edit Details</Button>
                                </div>
                                
                                <div className="pt-6 border-t border-sand">
                                    <h3 className="text-sm font-medium text-taupe uppercase tracking-wider mb-3">Job Description</h3>
                                    {job.description ? (
                                        <div className="prose prose-sm max-w-none text-ink whitespace-pre-wrap bg-cream p-5 rounded-lg border border-sand">
                                            {job.description}
                                        </div>
                                    ) : (
                                        <div className="text-center py-8 bg-cream rounded-lg border border-dashed border-sand">
                                            <p className="text-taupe mb-2">No description added yet.</p>
                                            <Button variant="secondary" onClick={startEditing}>Add Description</Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </Card>
                )}

                {/* NOTES TAB */}
                {activeTab === 'notes' && (
                    <div className="space-y-6">
                        <div className="space-y-4">
                            {jobNotes.length === 0 ? (
                                <Card className="p-8 text-center text-taupe">No notes yet. Add one to track your progress!</Card>
                            ) : (
                                jobNotes.map(note => (
                                    <Card key={note.id} className="p-4">
                                        {editingNoteId === note.id ? (
                                            <div className="space-y-3">
                                                <select
                                                    className="w-full px-3 py-2 border border-sand rounded-lg bg-paper text-ink crm-focus text-sm"
                                                    value={editNoteForm.type}
                                                    onChange={e => setEditNoteForm({ ...editNoteForm, type: e.target.value as any })}
                                                >
                                                    <option value="General">General Note</option>
                                                    <option value="Call">Call Notes</option>
                                                    <option value="Interview">Interview Prep/Notes</option>
                                                    <option value="Assignment">Take-home Assignment</option>
                                                </select>
                                                <Input
                                                    placeholder="Note Title"
                                                    value={editNoteForm.title}
                                                    onChange={e => setEditNoteForm({ ...editNoteForm, title: e.target.value })}
                                                />
                                                <Textarea
                                                    rows={6}
                                                    placeholder="Write your note body here..."
                                                    value={editNoteForm.content}
                                                    onChange={e => setEditNoteForm({ ...editNoteForm, content: e.target.value })}
                                                />
                                                <div className="flex gap-2">
                                                    <Button
                                                        className="flex-1"
                                                        onClick={() => {
                                                            updateNote({ ...note, ...editNoteForm });
                                                            setEditingNoteId(null);
                                                        }}
                                                        disabled={!editNoteForm.title.trim() || !editNoteForm.content.trim()}
                                                    >
                                                        Save
                                                    </Button>
                                                    <Button variant="secondary" onClick={() => setEditingNoteId(null)}>Cancel</Button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex justify-between items-start mb-2">
                                                    <div className="flex items-center space-x-2">
                                                        <Badge color={note.type === 'Interview' ? 'yellow' : note.type === 'Assignment' ? 'blue' : note.type === 'Call' ? 'green' : 'gray'}>{note.type}</Badge>
                                                        <span className="text-xs text-taupe">{new Date(note.date).toLocaleDateString()}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => {
                                                                setEditingNoteId(note.id);
                                                                setEditNoteForm({ type: note.type, title: note.title, content: note.content });
                                                            }}
                                                            className="text-taupe hover:text-ink"
                                                        >
                                                            <Pencil className="w-4 h-4" />
                                                        </button>
                                                        <button onClick={() => deleteNote(note.id)} className="text-taupe hover:text-danger"><Trash2 className="w-4 h-4" /></button>
                                                    </div>
                                                </div>
                                                <h4 className="font-semibold text-ink mb-1 flex items-center">
                                                    {note.title}
                                                    {note.isAiGenerated && <Sparkles className="w-3 h-3 ml-2 text-wood" title="AI Generated" />}
                                                </h4>
                                                <p className="text-ink whitespace-pre-wrap text-sm">{note.content}</p>
                                            </>
                                        )}
                                    </Card>
                                ))
                            )}
                        </div>
                        <Card className="p-6">
                            <h3 className="font-semibold text-ink mb-4">Add Note</h3>
                            <div className="space-y-3">
                                <select
                                    className="w-full px-3 py-2 border border-sand rounded-lg bg-paper text-ink crm-focus text-sm"
                                    value={newNote.type}
                                    onChange={e => setNewNote({...newNote, type: e.target.value as any})}
                                >
                                    <option value="General">General Note</option>
                                    <option value="Call">Call Notes</option>
                                    <option value="Interview">Interview Prep/Notes</option>
                                    <option value="Assignment">Take-home Assignment</option>
                                </select>
                                <Input
                                    placeholder="Note Title"
                                    value={newNote.title}
                                    onChange={e => setNewNote({...newNote, title: e.target.value})}
                                />
                                <Textarea
                                    rows={8}
                                    placeholder="Write your note body here..."
                                    value={newNote.content}
                                    onChange={e => setNewNote({...newNote, content: e.target.value})}
                                />
                                <Button className="w-full" onClick={handleAddNote} disabled={!newNote.title.trim() || !newNote.content.trim()}>Save Note</Button>
                            </div>
                        </Card>
                    </div>
                )}

                {/* MATCH INSIGHTS TAB */}
                {activeTab === 'ai' && (
                    <div className="space-y-6">
                        {!job.description && (
                            <div className="bg-sand border border-wood text-wood-dark p-4 rounded-lg flex items-start">
                                <Sparkles className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                                <p>AI features require a job description. Please add one in the Details tab first.</p>
                            </div>
                        )}

                        <Card className="p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-lg font-semibold text-ink flex items-center"><Target className="w-5 h-5 mr-2 text-wood"/> Job Match Analysis</h2>
                                <Button variant="secondary" onClick={handleAnalyzeMatch} disabled={isAnalyzing || !job.description}>
                                    {isAnalyzing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin"/> Analyzing...</> : 'Analyze Match'}
                                </Button>
                            </div>

                            {analysis ? (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <h4 className="font-medium text-sage flex items-center mb-2"><CheckCircle2 className="w-4 h-4 mr-1"/> Pros</h4>
                                            <ul className="space-y-2">
                                                {analysis.pros.map((pro, i) => <li key={i} className="text-sm text-ink flex items-start"><span className="mr-2 text-sage">•</span>{renderBold(pro)}</li>)}
                                            </ul>
                                        </div>
                                        <div>
                                            <h4 className="font-medium text-danger flex items-center mb-2"><XCircle className="w-4 h-4 mr-1"/> Potential Concerns</h4>
                                            <ul className="space-y-2">
                                                {analysis.cons.map((con, i) => <li key={i} className="text-sm text-ink flex items-start"><span className="mr-2 text-danger">•</span>{renderBold(con)}</li>)}
                                            </ul>
                                        </div>
                                    </div>
                                    <div className="space-y-4 pt-4 border-t border-sand">
                                        <div>
                                            <h4 className="font-medium text-ink mb-2">Why am I a good fit for this role?</h4>
                                            <ul className="bg-cream p-4 rounded-lg space-y-2">
                                                {analysis.fitReason.map((point, i) => (
                                                    <li key={i} className="text-sm text-ink flex items-start"><span className="mr-2 text-sage flex-shrink-0">•</span>{renderBold(point)}</li>
                                                ))}
                                            </ul>
                                        </div>
                                        {analysis.missingExperience.length > 0 && (
                                            <div>
                                                <h4 className="font-medium text-ink mb-2">What from my experience is missing?</h4>
                                                <ol className="bg-cream p-4 rounded-lg space-y-3">
                                                    {analysis.missingExperience.map((item, i) => (
                                                        <li key={i} className="text-sm text-ink flex items-start">
                                                            <span className="mr-2 font-medium text-wood flex-shrink-0">{i + 1}.</span>{renderBold(item)}
                                                        </li>
                                                    ))}
                                                </ol>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <p className="text-taupe text-sm">Click analyze to see how well this job matches your career preferences.</p>
                            )}
                        </Card>
                    </div>
                )}

                {/* RESUME EDITS TAB */}
                {activeTab === 'resume' && (
                    <div className="space-y-6">
                        {!job.description && (
                            <div className="bg-sand border border-wood text-wood-dark p-4 rounded-lg flex items-start">
                                <Sparkles className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                                <p>AI features require a job description. Please add one in the Details tab first.</p>
                            </div>
                        )}

                        {analysis && analysis.resumeEdits.length > 0 && (
                            <Card className="p-0 overflow-hidden">
                                <button
                                    className="w-full flex justify-between items-center px-6 py-4 text-left hover:bg-cream/50 transition-colors"
                                    onClick={() => setResumeEditsOpen(v => !v)}
                                >
                                    <h2 className="font-medium text-ink">What particular edits should be made to my base resume?</h2>
                                    {resumeEditsOpen ? <ChevronUp className="w-4 h-4 text-taupe flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-taupe flex-shrink-0" />}
                                </button>
                                {resumeEditsOpen && (
                                    <ol className="mx-6 mb-5 bg-cream p-4 rounded-lg space-y-3">
                                        {analysis.resumeEdits.map((edit, i) => (
                                            <li key={i} className="text-sm text-ink flex items-start">
                                                <span className="mr-2 font-medium text-wood flex-shrink-0">{i + 1}.</span>{renderBold(edit)}
                                            </li>
                                        ))}
                                    </ol>
                                )}
                            </Card>
                        )}

                        <Card className="p-0 overflow-hidden">
                            <button
                                className="w-full flex justify-between items-center px-6 py-4 text-left hover:bg-cream/50 transition-colors"
                                onClick={() => setPromptOpen(v => !v)}
                            >
                                <h2 className="font-medium text-ink">Prompt sent to Gemini</h2>
                                {promptOpen ? <ChevronUp className="w-4 h-4 text-taupe flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-taupe flex-shrink-0" />}
                            </button>
                            {promptOpen && (
                                <div className="mx-6 mb-5 space-y-3">
                                    <div>
                                        <p className="text-xs font-semibold text-taupe uppercase tracking-wide mb-1">System instruction</p>
                                        <pre className="text-xs text-ink bg-cream rounded-lg p-3 whitespace-pre-wrap font-mono">{RESUME_ADVICE_SYSTEM_INSTRUCTION}</pre>
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold text-taupe uppercase tracking-wide mb-1">User prompt</p>
                                        <pre className="text-xs text-ink bg-cream rounded-lg p-3 whitespace-pre-wrap font-mono">{RESUME_ADVICE_USER_PROMPT}</pre>
                                    </div>
                                </div>
                            )}
                        </Card>

                        <Card className="p-6">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-lg font-semibold text-ink">Tailor Resume</h2>
                                <Button variant="primary" onClick={handleGenerateResume} disabled={isGeneratingResume || !job.description}>
                                    {isGeneratingResume ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Generating...</> : 'Generate Resume'}
                                </Button>
                            </div>

                            {includedLineIds && (
                                <div className="flex justify-between items-center mb-6 pb-6 border-b border-sand crm-enter">
                                    <span className={`text-xs font-medium ${(generatedMarkdown?.length || 0) > resumeCharBudget ? 'text-danger' : 'text-taupe'}`}>
                                        {generatedMarkdown?.length || 0} / {resumeCharBudget} characters
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <Button variant="primary" onClick={handleSaveGeneratedResume}>Save Resume</Button>
                                        <div className="relative">
                                            <Button variant="secondary" className="!px-3 !py-1.5 !text-xs" onClick={() => setShowDownloadMenu(v => !v)}>
                                                <Download className="w-3 h-3 mr-1.5" />Download Resume
                                            </Button>
                                            {showDownloadMenu && (
                                                <div className="absolute right-0 bottom-full mb-1 bg-white border border-sand rounded-lg shadow-lg z-10 text-sm overflow-hidden">
                                                    {(['md', 'pdf', 'doc'] as DownloadFormat[]).map(fmt => (
                                                        <button key={fmt} onClick={() => handleExportGeneratedResume(fmt)} className="block w-full text-left px-4 py-2 hover:bg-cream uppercase text-xs font-medium text-stone">
                                                            {fmt === 'pdf' ? 'PDF (print)' : fmt === 'doc' ? 'Word (.doc)' : 'Markdown (.md)'}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Summary */}
                            <div className="mb-6">
                                <div className="flex justify-between items-center mb-1">
                                    <h3 className="text-sm font-semibold text-ink">Summary</h3>
                                    <span className="text-xs text-taupe italic">Saved per job — won't affect your base resume</span>
                                </div>
                                <Textarea
                                    rows={4}
                                    value={tailoredSummary}
                                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTailoredSummary(e.target.value)}
                                    onBlur={() => updateJob(job.id, { customFields: { ...job.customFields, _tailoredSummary: tailoredSummary } })}
                                    placeholder="Tailored summary for this role..."
                                />
                                <p className={`text-xs mt-1 text-right ${tailoredSummary.length > 500 ? 'text-red-500 font-semibold' : 'text-taupe'}`}>
                                    {tailoredSummary.length}/500
                                </p>
                            </div>

                            {/* Professional Experience */}
                            <div>
                                <h3 className="text-sm font-semibold text-ink mb-3">Professional Experience</h3>
                                <div className="space-y-3">
                                    {resumeEntries
                                        .filter(e => e.sectionId === 'experience')
                                        .sort((a, b) => a.order - b.order)
                                        .map(entry => {
                                            const candidateLines = getCandidateLines(resumeLines, job.id)
                                                .filter(l => l.sectionId === 'experience' && l.entryId === entry.id)
                                                .sort((a, b) => a.order - b.order);
                                            const bulletDraft = newBulletDrafts[entry.id] || '';
                                            const dateRange = [entry.startDate, entry.endDate].filter(Boolean).join(' – ');
                                            return (
                                                <Card key={entry.id} className="p-4">
                                                    <div className="mb-2">
                                                        <span className="text-sm font-medium text-ink">
                                                            {[entry.heading, entry.subheading].filter(Boolean).join(', ')}
                                                        </span>
                                                        {dateRange && <span className="text-xs text-taupe ml-2">{dateRange}</span>}
                                                    </div>
                                                    <ul className="space-y-1.5 mb-3">
                                                        {candidateLines.map(l => (
                                                            <li key={l.id} className="flex items-start gap-2 text-xs">
                                                                {includedLineIds !== null && (
                                                                    <input
                                                                        type="checkbox"
                                                                        className="mt-0.5 flex-shrink-0"
                                                                        checked={includedLineIds.has(l.id)}
                                                                        onChange={() => toggleGeneratedLine(l.id)}
                                                                    />
                                                                )}
                                                                <span className={`flex-1 leading-relaxed ${includedLineIds !== null && !includedLineIds.has(l.id) ? 'text-taupe line-through' : 'text-ink'}`}>
                                                                    {l.content}
                                                                </span>
                                                                {l.jobId && (
                                                                    <>
                                                                        <span className="text-forest text-xs flex-shrink-0">(added)</span>
                                                                        <button onClick={() => deleteResumeLine(l.id)} className="text-taupe hover:text-danger flex-shrink-0">
                                                                            <Trash2 className="w-3 h-3" />
                                                                        </button>
                                                                    </>
                                                                )}
                                                            </li>
                                                        ))}
                                                        {(stagedBullets[entry.id] || []).map((content, i) => (
                                                            <li key={`staged-${i}`} className="flex items-start gap-2 text-xs">
                                                                {includedLineIds !== null && (
                                                                    <input type="checkbox" className="mt-0.5 flex-shrink-0" checked disabled />
                                                                )}
                                                                <span className="flex-1 leading-relaxed text-ink italic">{content}</span>
                                                                <span className="text-wood text-xs flex-shrink-0">unsaved</span>
                                                                <button
                                                                    onClick={() => setStagedBullets(prev => ({ ...prev, [entry.id]: prev[entry.id].filter((_, idx) => idx !== i) }))}
                                                                    className="text-taupe hover:text-danger flex-shrink-0"
                                                                >
                                                                    <Trash2 className="w-3 h-3" />
                                                                </button>
                                                            </li>
                                                        ))}
                                                        {candidateLines.length === 0 && (stagedBullets[entry.id] || []).length === 0 && (
                                                            <li className="text-xs text-taupe italic">No bullets yet.</li>
                                                        )}
                                                    </ul>
                                                    <div className="flex gap-2">
                                                        <input
                                                            className={`flex-1 px-2 py-1.5 border rounded text-xs bg-paper text-ink crm-focus ${bulletDraft.length > 110 ? 'border-red-400' : 'border-sand'}`}
                                                            placeholder="Add a bullet for this job..."
                                                            value={bulletDraft}
                                                            onChange={e => setNewBulletDrafts(prev => ({ ...prev, [entry.id]: e.target.value }))}
                                                            onKeyDown={e => e.key === 'Enter' && handleAddJobBullet(entry)}
                                                        />
                                                        <Button variant="ghost" onClick={() => handleAddJobBullet(entry)} disabled={!bulletDraft.trim() || bulletDraft.length > 110}>
                                                            <Plus className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                    {bulletDraft.length > 110 && (
                                                        <p className="text-xs text-red-500 mt-1">{bulletDraft.length}/110 — shorten before adding</p>
                                                    )}
                                                </Card>
                                            );
                                        })}
                                    {resumeEntries.filter(e => e.sectionId === 'experience').length === 0 && (
                                        <p className="text-xs text-taupe">No experience entries in your base resume yet.</p>
                                    )}
                                </div>
                            </div>
                        </Card>
                    </div>
                )}

                {/* INTERVIEW PREP TAB */}
                {activeTab === 'interview' && (
                    <div className="space-y-6">
                        {!job.description && (
                            <div className="bg-sand border border-wood text-wood-dark p-4 rounded-lg flex items-start">
                                <Sparkles className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                                <p>AI features require a job description. Please add one in the Details tab first.</p>
                            </div>
                        )}

                        <Card className="p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-lg font-semibold text-ink">Interview Prep</h2>
                                <Button variant="secondary" onClick={handleGenerateQuestions} disabled={isGeneratingQuestions || !job.description}>
                                    {isGeneratingQuestions ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Generate Qs'}
                                </Button>
                            </div>

                            {(() => {
                                const relevantSaved = interviewQuestions.filter(q =>
                                    q.category === 'Technical' &&
                                    q.response?.trim() &&
                                    relevantTechnicalIds?.includes(q.id)
                                );
                                if (isCheckingRelevance) return (
                                    <div className="mb-5 flex items-center gap-2 text-sm text-taupe">
                                        <Loader2 className="w-4 h-4 animate-spin" /> Checking saved prep relevance...
                                    </div>
                                );
                                if (!relevantSaved.length) return null;
                                return (
                                    <div className="mb-5">
                                        <h3 className="text-xs font-semibold text-taupe uppercase tracking-wider mb-3">From Your Saved Prep</h3>
                                        <ul className="space-y-3">
                                            {relevantSaved.map(q => (
                                                <li key={q.id} className="text-sm bg-cream rounded-lg p-3 space-y-1">
                                                    <p className="font-medium text-ink">{q.question}</p>
                                                    <p className="text-taupe">{q.response}</p>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                );
                            })()}

                            {aiQuestions ? (
                                <div>
                                    <h3 className="text-xs font-semibold text-taupe uppercase tracking-wider mb-3">AI Suggested Questions</h3>
                                    <ul className="space-y-3">
                                        {aiQuestions.split('\n').filter(l => l.trim()).map((line, i) => (
                                            <li key={i} className="text-sm text-ink flex items-start justify-between gap-2">
                                                <span>{renderBold(line)}</span>
                                                {savedAiQuestions.has(i) ? (
                                                    <CheckCircle2 className="w-4 h-4 text-sage flex-shrink-0 mt-0.5" />
                                                ) : (
                                                    <button
                                                        title="Save to Interview Prep"
                                                        className="text-taupe hover:text-wood flex-shrink-0 mt-0.5"
                                                        onClick={() => {
                                                            addInterviewQuestion({ question: line.replace(/^\d+\.\s*/, '').replace(/^[-*]\s*/, ''), response: '', category: 'General' });
                                                            setSavedAiQuestions(prev => new Set(prev).add(i));
                                                        }}
                                                    >
                                                        <Plus className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : (
                                <p className="text-taupe text-sm">Generate potential interview questions based on the job description.</p>
                            )}
                        </Card>
                    </div>
                )}
            </div>
        </div>
    );
};
