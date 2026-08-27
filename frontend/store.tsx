import React, { createContext, useContext, useState, useRef, ReactNode, useEffect, useMemo } from 'react';
import { Job, JobAnalysis, Note, Preferences, ContextResource, ViewState, DbConfig, SyncStatus, JournalEntry, InterviewQuestion, JobSource, ResumeSectionConfig, ResumeTextBlock, ResumeEntry, ResumeLine, ResumeGeneration } from './types';
import { createApiClient } from './services/api';
import { renderResumeMarkdown } from './services/resumeRenderer';

interface AppState {
    jobs: Job[];
    notes: Note[];
    resumeSections: ResumeSectionConfig[];
    resumeCharBudget: number;
    resumeTextBlocks: ResumeTextBlock[];
    resumeEntries: ResumeEntry[];
    resumeLines: ResumeLine[];
    resumeGenerations: ResumeGeneration[];
    resumeRawImport: string | null;
    resumeMarkdown: string;
    resumeIsDirty: boolean;
    preferences: Preferences;
    contextResources: ContextResource[];
    journalEntries: JournalEntry[];
    interviewQuestions: InterviewQuestion[];
    jobAnalyses: JobAnalysis[];
    jobSources: JobSource[];
    currentView: ViewState;
    selectedJobId: string | null;
    dbConfig: DbConfig;
    syncStatus: SyncStatus;
}

interface AppContextType extends AppState {
    addJob: (job: Omit<Job, 'id' | 'dateAdded'>) => Promise<Job>;
    updateJob: (id: string, updates: Partial<Job>) => void;
    deleteJob: (id: string) => void;
    addNote: (note: Omit<Note, 'id' | 'date'>) => void;
    deleteNote: (id: string) => void;
    updateResumeText: (sectionId: string, content: string) => void;
    saveResumeRawImport: (content: string) => void;
    addResumeEntry: (entry: Omit<ResumeEntry, 'id'>) => Promise<ResumeEntry>;
    updateResumeEntry: (id: string, updates: Partial<ResumeEntry>) => void;
    deleteResumeEntry: (id: string) => void;
    addResumeLine: (line: Omit<ResumeLine, 'id'>) => Promise<ResumeLine>;
    updateResumeLine: (id: string, updates: Partial<ResumeLine>) => void;
    deleteResumeLine: (id: string) => void;
    saveResume: () => Promise<void>;
    saveResumeGeneration: (jobId: string, selectedLineIds: string[], renderedMarkdown: string) => void;
    updatePreferences: (prefs: Preferences) => void;
    addContextResource: (resource: Omit<ContextResource, 'id' | 'dateAdded'>) => void;
    deleteContextResource: (id: string) => void;
    addJournalEntry: (entry: Omit<JournalEntry, 'id'>) => void;
    updateJournalEntry: (id: string, updates: Partial<JournalEntry>) => void;
    deleteJournalEntry: (id: string) => void;
    addInterviewQuestion: (q: Omit<InterviewQuestion, 'id' | 'dateAdded'>) => void;
    updateInterviewQuestion: (id: string, updates: Partial<InterviewQuestion>) => void;
    deleteInterviewQuestion: (id: string) => void;
    setJobAnalysis: (jobId: string, data: Pick<JobAnalysis, 'score' | 'pros' | 'cons' | 'fitReason' | 'resumeEdits'>) => void;
    deleteJobAnalysis: (jobId: string) => void;
    addJobSource: (source: Omit<JobSource, 'id' | 'dateAdded'>) => void;
    updateJobSource: (id: string, updates: Partial<Pick<JobSource, 'label' | 'url'>>) => void;
    deleteJobSource: (id: string) => void;
    navigate: (view: ViewState, jobId?: string) => void;
    importData: (data: any) => void;
    updateDbConfig: (config: DbConfig) => void;
}

const initialPreferences: Preferences = {
    petalsExercise: '',
};

const mockJobs: Job[] = [
    { 
        id: '1', 
        title: 'Senior React Engineer', 
        company: 'TechNova', 
        status: 'Interviewing', 
        url: 'https://example.com/job1', 
        description: 'Looking for a strong React developer with experience in performance optimization and architecture...', 
        dateAdded: new Date().toISOString(),
        location: 'Remote (US)',
        tags: ['React', 'Frontend', 'Senior'],
        dateApplied: new Date(Date.now() - 86400000 * 5).toISOString().split('T')[0],
        customFields: { 'Recruiter': 'Jane Doe', 'Salary Range': '$150k - $170k' }
    },
    { 
        id: '2', 
        title: 'Frontend Lead', 
        company: 'Designify', 
        status: 'Applied', 
        url: 'https://example.com/job2', 
        description: 'Lead a team of 4 frontend engineers building our next-gen design tool...', 
        dateAdded: new Date(Date.now() - 86400000).toISOString(),
        location: 'New York, NY (Hybrid)',
        tags: ['Leadership', 'Design Systems'],
        dateApplied: new Date(Date.now() - 86400000).toISOString().split('T')[0]
    },
];

const mockNotes: Note[] = [
    { id: 'n1', jobId: '1', type: 'Interview', title: 'First Round with Hiring Manager', content: 'First round with hiring manager went well. Discussed React architecture.', date: new Date().toISOString() },
    { id: 'n2', jobId: '1', type: 'Call', title: 'Recruiter Screen', content: 'Salary expectations align. Fully remote role.', date: new Date(Date.now() - 86400000).toISOString() },
];

// Offline/no-backend fallback only — mirrors backend/resumeSections.js.
// Whenever the DB is reachable, GET /api/resume-config is authoritative and
// overwrites this on load, per the "sections change on the backend" design.
const DEFAULT_RESUME_SECTIONS: ResumeSectionConfig[] = [
    { id: 'header', label: 'Contact Info', type: 'text', order: 0 },
    { id: 'summary', label: 'Summary', type: 'text', order: 1 },
    { id: 'experience', label: 'Experience', type: 'entries', order: 2 },
    { id: 'education', label: 'Education', type: 'entries', order: 3 },
    { id: 'skills', label: 'Skills', type: 'list', order: 4 },
];
const DEFAULT_RESUME_CHAR_BUDGET = 4000;

const mockResumeTextBlocks: ResumeTextBlock[] = [
    { sectionId: 'header', content: 'John Doe\njohn.doe@example.com', updatedAt: new Date().toISOString() },
];
const mockResumeEntries: ResumeEntry[] = [
    { id: 're1', sectionId: 'experience', heading: 'Senior Frontend Engineer', subheading: 'Acme Corp', order: 0 },
];
const mockResumeLines: ResumeLine[] = [
    { id: 'rl1', sectionId: 'experience', entryId: 're1', content: 'Led migration to a component-driven design system.', order: 0 },
];

const mockContextResources: ContextResource[] = [
    { id: 'c1', title: 'Ideal Engineering Culture', content: 'I want to work in a place that values async communication.', dateAdded: new Date().toISOString() }
];

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [jobs, setJobs] = useState<Job[]>(mockJobs);
    const [notes, setNotes] = useState<Note[]>(mockNotes);
    const [resumeSections, setResumeSections] = useState<ResumeSectionConfig[]>(DEFAULT_RESUME_SECTIONS);
    const [resumeCharBudget, setResumeCharBudget] = useState<number>(DEFAULT_RESUME_CHAR_BUDGET);
    const [resumeTextBlocks, setResumeTextBlocks] = useState<ResumeTextBlock[]>(mockResumeTextBlocks);
    const [resumeEntries, setResumeEntries] = useState<ResumeEntry[]>(mockResumeEntries);
    const [resumeLines, setResumeLines] = useState<ResumeLine[]>(mockResumeLines);
    const [resumeGenerations, setResumeGenerations] = useState<ResumeGeneration[]>([]);
    const [resumeRawImport, setResumeRawImport] = useState<string | null>(null);
    const [preferences, setPreferences] = useState<Preferences>(initialPreferences);
    const [contextResources, setContextResources] = useState<ContextResource[]>(mockContextResources);
    const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
    const [interviewQuestions, setInterviewQuestions] = useState<InterviewQuestion[]>([]);
    const [jobAnalyses, setJobAnalyses] = useState<JobAnalysis[]>([]);
    const [jobSources, setJobSources] = useState<JobSource[]>(() => {
        const saved = localStorage.getItem('getthejob_sources');
        return saved ? JSON.parse(saved) : [];
    });
    const [currentView, setCurrentView] = useState<ViewState>('dashboard');
    const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
    
    const [resumeIsDirty, setResumeIsDirty] = useState(false);
    // IDs that exist in the DB — populated on load, updated after saveResume
    const committedEntryIds = useRef<Set<string>>(new Set());
    const committedLineIds = useRef<Set<string>>(new Set());
    // Baseline entries/lines deleted locally but not yet DELETEd from DB
    const pendingDeleteEntryIds = useRef<string[]>([]);
    const pendingDeleteLineIds = useRef<string[]>([]);

    const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
    const [dbConfig, setDbConfig] = useState<DbConfig>(() => {
        const saved = localStorage.getItem('getthejob_db_config');
        if (saved) return JSON.parse(saved);
        return { enabled: false, url: 'http://localhost:3000/api' };
    });

    // Fetch backend URL from server config on mount — works on any device
    useEffect(() => {
        fetch('/config')
            .then(r => r.json())
            .then(({ backendUrl }) => {
                if (backendUrl) {
                    const config = { enabled: true, url: backendUrl };
                    setDbConfig(config);
                    localStorage.setItem('getthejob_db_config', JSON.stringify(config));
                }
            })
            .catch(() => {});
    }, []);

    const apiClient = useMemo(() => createApiClient(dbConfig.url), [dbConfig.url]);

    // The baseline rendered resume (no per-job lines) — used as "the resume"
    // everywhere outside of a specific job's tailoring flow: foundational AI
    // context, interview questions, the chatbot, "Get Advice", and export.
    const resumeMarkdown = useMemo(
        () => renderResumeMarkdown(resumeSections, resumeTextBlocks, resumeEntries, resumeLines.filter(l => !l.jobId)),
        [resumeSections, resumeTextBlocks, resumeEntries, resumeLines]
    );

    // Fetch initial data if DB is enabled
    useEffect(() => {
        if (dbConfig.enabled) {
            setSyncStatus('syncing');
            Promise.all([
                apiClient.getJobs().catch(() => []),
                apiClient.getNotes().catch(() => []),
                apiClient.getContextResources().catch(() => []),
                apiClient.getPreferences().catch(() => null),
                apiClient.getJournalEntries().catch(() => []),
                apiClient.getInterviewQuestions().catch(() => []),
                apiClient.getJobAnalyses().catch(() => []),
                apiClient.getResumeConfig().catch(() => null),
                apiClient.getResume().catch(() => null),
                apiClient.getResumeGenerations().catch(() => []),
                apiClient.getResumeRawImport().catch(() => null),
            ]).then(([j, n, c, p, je, iq, ja, rc, r, rg, ri]) => {
                if (j.length) setJobs(j);
                if (n.length) setNotes(n);
                if (c.length) setContextResources(c);
                if (p && Object.keys(p).length > 0) setPreferences(p);
                if (je.length) setJournalEntries(je);
                if (iq.length) setInterviewQuestions(iq);
                if (ja.length) setJobAnalyses(ja);
                if (rc) { setResumeSections(rc.sections); setResumeCharBudget(rc.totalCharBudget); }
                if (r) {
                    setResumeTextBlocks(r.textBlocks);
                    setResumeEntries(r.entries);
                    setResumeLines(r.lines);
                    committedEntryIds.current = new Set(r.entries.map((e: ResumeEntry) => e.id));
                    committedLineIds.current = new Set(r.lines.map((l: ResumeLine) => l.id));
                }
                if (rg.length) setResumeGenerations(rg);
                if (ri) setResumeRawImport(ri.content);
                setSyncStatus('idle');
            }).catch(err => {
                console.error("Failed to fetch from SQL backend:", err);
                setSyncStatus('error');
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dbConfig.enabled, dbConfig.url]);

    const updateDbConfig = (config: DbConfig) => {
        setDbConfig(config);
        localStorage.setItem('getthejob_db_config', JSON.stringify(config));
    };

    const generateId = () => Math.random().toString(36).substr(2, 9);

    const addJob = async (jobData: Omit<Job, 'id' | 'dateAdded'>): Promise<Job> => {
        const newJob: Job = { ...jobData, id: generateId(), dateAdded: new Date().toISOString() };
        setJobs(prev => [newJob, ...prev]); // Optimistic update

        if (dbConfig.enabled) {
            setSyncStatus('syncing');
            try {
                await apiClient.createJob(newJob);
                setSyncStatus('idle');
            } catch (e) {
                console.error(e);
                setSyncStatus('error');
            }
        }
        return newJob;
    };

    const updateJob = async (id: string, updates: Partial<Job>) => {
        setJobs(prev => prev.map(job => job.id === id ? { ...job, ...updates } : job));

        if (dbConfig.enabled) {
            setSyncStatus('syncing');
            try {
                // Send the full merged job so partial updates don't null out other columns
                const currentJob = jobs.find(j => j.id === id);
                const fullJob = currentJob ? { ...currentJob, ...updates } : updates;
                await apiClient.updateJob(id, fullJob);
                setSyncStatus('idle');
            } catch (e) {
                console.error(e);
                setSyncStatus('error');
            }
        }
    };

    const deleteJob = async (id: string) => {
        setJobs(prev => prev.filter(job => job.id !== id));
        setNotes(prev => prev.filter(note => note.jobId !== id));
        if (selectedJobId === id) navigate('jobs');

        if (dbConfig.enabled) {
            setSyncStatus('syncing');
            try {
                await apiClient.deleteJob(id);
                setSyncStatus('idle');
            } catch (e) {
                console.error(e);
                setSyncStatus('error');
            }
        }
    };

    const addNote = async (noteData: Omit<Note, 'id' | 'date'>) => {
        const newNote: Note = { ...noteData, id: generateId(), date: new Date().toISOString() };
        setNotes(prev => [newNote, ...prev]);

        if (dbConfig.enabled) {
            setSyncStatus('syncing');
            try {
                await apiClient.createNote(newNote);
                setSyncStatus('idle');
            } catch (e) {
                console.error(e);
                setSyncStatus('error');
            }
        }
    };

    const deleteNote = async (id: string) => {
        setNotes(prev => prev.filter(note => note.id !== id));

        if (dbConfig.enabled) {
            setSyncStatus('syncing');
            try {
                await apiClient.deleteNote(id);
                setSyncStatus('idle');
            } catch (e) {
                console.error(e);
                setSyncStatus('error');
            }
        }
    };

    const updateResumeText = (sectionId: string, content: string) => {
        const updatedAt = new Date().toISOString();
        setResumeTextBlocks(prev =>
            prev.find(t => t.sectionId === sectionId)
                ? prev.map(t => t.sectionId === sectionId ? { ...t, content, updatedAt } : t)
                : [...prev, { sectionId, content, updatedAt }]
        );
        setResumeIsDirty(true);
    };

    const saveResumeRawImport = async (content: string) => {
        setResumeRawImport(content);

        if (dbConfig.enabled) {
            setSyncStatus('syncing');
            try { await apiClient.saveResumeRawImport(content); setSyncStatus('idle'); }
            catch (e) { console.error(e); setSyncStatus('error'); }
        }
    };

    const addResumeEntry = async (entryData: Omit<ResumeEntry, 'id'>): Promise<ResumeEntry> => {
        const newEntry: ResumeEntry = { ...entryData, id: generateId() };
        setResumeEntries(prev => [...prev, newEntry]);
        setResumeIsDirty(true);
        return newEntry;
    };

    const updateResumeEntry = (id: string, updates: Partial<ResumeEntry>) => {
        setResumeEntries(prev => prev.map(en => en.id === id ? { ...en, ...updates } : en));
        setResumeIsDirty(true);
    };

    const deleteResumeEntry = (id: string) => {
        // Also queue any committed lines belonging to this entry for deletion
        resumeLines.filter(l => l.entryId === id && !l.jobId).forEach(l => {
            if (committedLineIds.current.has(l.id)) pendingDeleteLineIds.current.push(l.id);
        });
        setResumeEntries(prev => prev.filter(en => en.id !== id));
        setResumeLines(prev => prev.filter(l => l.entryId !== id));
        if (committedEntryIds.current.has(id)) pendingDeleteEntryIds.current.push(id);
        setResumeIsDirty(true);
    };

    const addResumeLine = async (lineData: Omit<ResumeLine, 'id'>): Promise<ResumeLine> => {
        const newLine: ResumeLine = { ...lineData, id: generateId() };
        setResumeLines(prev => [...prev, newLine]);

        if (lineData.jobId) {
            // Per-job line (from JobDetail): sync immediately
            if (dbConfig.enabled) {
                setSyncStatus('syncing');
                try { await apiClient.createResumeLine(newLine); setSyncStatus('idle'); }
                catch (e) { console.error(e); setSyncStatus('error'); }
            }
        } else {
            setResumeIsDirty(true);
        }
        return newLine;
    };

    const updateResumeLine = (id: string, updates: Partial<ResumeLine>) => {
        setResumeLines(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
        setResumeIsDirty(true);
    };

    const deleteResumeLine = async (id: string) => {
        const line = resumeLines.find(l => l.id === id);
        setResumeLines(prev => prev.filter(l => l.id !== id));

        if (line?.jobId) {
            // Per-job line: sync immediately
            if (dbConfig.enabled) {
                setSyncStatus('syncing');
                try { await apiClient.deleteResumeLine(id); setSyncStatus('idle'); }
                catch (e) { console.error(e); setSyncStatus('error'); }
            }
        } else {
            if (committedLineIds.current.has(id)) pendingDeleteLineIds.current.push(id);
            setResumeIsDirty(true);
        }
    };

    const saveResume = async () => {
        if (!dbConfig.enabled) { setResumeIsDirty(false); return; }
        setSyncStatus('syncing');
        try {
            for (const tb of resumeTextBlocks) {
                await apiClient.updateResumeText(tb.sectionId, tb.content);
            }
            for (const entry of resumeEntries) {
                if (committedEntryIds.current.has(entry.id)) {
                    await apiClient.updateResumeEntry(entry.id, entry);
                } else {
                    await apiClient.createResumeEntry(entry);
                    committedEntryIds.current.add(entry.id);
                }
            }
            for (const id of pendingDeleteEntryIds.current) {
                await apiClient.deleteResumeEntry(id);
                committedEntryIds.current.delete(id);
            }
            pendingDeleteEntryIds.current = [];

            for (const line of resumeLines.filter(l => !l.jobId)) {
                if (committedLineIds.current.has(line.id)) {
                    await apiClient.updateResumeLine(line.id, line);
                } else {
                    await apiClient.createResumeLine(line);
                    committedLineIds.current.add(line.id);
                }
            }
            for (const id of pendingDeleteLineIds.current) {
                await apiClient.deleteResumeLine(id);
                committedLineIds.current.delete(id);
            }
            pendingDeleteLineIds.current = [];

            setResumeIsDirty(false);
            setSyncStatus('idle');
        } catch (e) {
            console.error(e);
            setSyncStatus('error');
        }
    };

    const saveResumeGeneration = async (jobId: string, selectedLineIds: string[], renderedMarkdown: string) => {
        const now = new Date().toISOString();
        setResumeGenerations(prev => {
            const existing = prev.find(g => g.jobId === jobId);
            const generation: ResumeGeneration = { jobId, selectedLineIds, renderedMarkdown, createdAt: existing?.createdAt ?? now, updatedAt: now };
            return existing ? prev.map(g => g.jobId === jobId ? generation : g) : [...prev, generation];
        });

        if (dbConfig.enabled) {
            setSyncStatus('syncing');
            try { await apiClient.saveResumeGeneration(jobId, { selectedLineIds, renderedMarkdown }); setSyncStatus('idle'); }
            catch (e) { console.error(e); setSyncStatus('error'); }
        }
    };

    const addContextResource = async (resourceData: Omit<ContextResource, 'id' | 'dateAdded'>) => {
        const newResource: ContextResource = { ...resourceData, id: generateId(), dateAdded: new Date().toISOString() };
        setContextResources(prev => [newResource, ...prev]);

        if (dbConfig.enabled) {
            setSyncStatus('syncing');
            try {
                await apiClient.createContextResource(newResource);
                setSyncStatus('idle');
            } catch (e) {
                console.error(e);
                setSyncStatus('error');
            }
        }
    };

    const deleteContextResource = async (id: string) => {
        setContextResources(prev => prev.filter(res => res.id !== id));

        if (dbConfig.enabled) {
            setSyncStatus('syncing');
            try {
                await apiClient.deleteContextResource(id);
                setSyncStatus('idle');
            } catch (e) {
                console.error(e);
                setSyncStatus('error');
            }
        }
    };

    const updatePreferencesState = async (prefs: Preferences) => {
        setPreferences(prefs);

        if (dbConfig.enabled) {
            setSyncStatus('syncing');
            try {
                await apiClient.updatePreferences(prefs);
                setSyncStatus('idle');
            } catch (e) {
                console.error(e);
                setSyncStatus('error');
            }
        }
    };

    const addJournalEntry = async (entryData: Omit<JournalEntry, 'id'>) => {
        const newEntry: JournalEntry = { ...entryData, id: generateId() };
        setJournalEntries(prev => [newEntry, ...prev]);
        if (dbConfig.enabled) {
            setSyncStatus('syncing');
            try { await apiClient.createJournalEntry(newEntry); setSyncStatus('idle'); }
            catch (e) { console.error(e); setSyncStatus('error'); }
        }
    };

    const updateJournalEntry = async (id: string, updates: Partial<JournalEntry>) => {
        setJournalEntries(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
        if (dbConfig.enabled) {
            setSyncStatus('syncing');
            try { await apiClient.updateJournalEntry(id, updates); setSyncStatus('idle'); }
            catch (e) { console.error(e); setSyncStatus('error'); }
        }
    };

    const deleteJournalEntry = async (id: string) => {
        setJournalEntries(prev => prev.filter(e => e.id !== id));
        if (dbConfig.enabled) {
            setSyncStatus('syncing');
            try { await apiClient.deleteJournalEntry(id); setSyncStatus('idle'); }
            catch (e) { console.error(e); setSyncStatus('error'); }
        }
    };

    const addInterviewQuestion = async (data: Omit<InterviewQuestion, 'id' | 'dateAdded'>) => {
        const newQ: InterviewQuestion = { ...data, id: generateId(), dateAdded: new Date().toISOString() };
        setInterviewQuestions(prev => [newQ, ...prev]);
        if (dbConfig.enabled) {
            setSyncStatus('syncing');
            try { await apiClient.createInterviewQuestion(newQ); setSyncStatus('idle'); }
            catch (e) { console.error(e); setSyncStatus('error'); }
        }
    };

    const updateInterviewQuestion = async (id: string, updates: Partial<InterviewQuestion>) => {
        setInterviewQuestions(prev => prev.map(q => q.id === id ? { ...q, ...updates } : q));
        if (dbConfig.enabled) {
            setSyncStatus('syncing');
            try { await apiClient.updateInterviewQuestion(id, updates); setSyncStatus('idle'); }
            catch (e) { console.error(e); setSyncStatus('error'); }
        }
    };

    const deleteInterviewQuestion = async (id: string) => {
        setInterviewQuestions(prev => prev.filter(q => q.id !== id));
        if (dbConfig.enabled) {
            setSyncStatus('syncing');
            try { await apiClient.deleteInterviewQuestion(id); setSyncStatus('idle'); }
            catch (e) { console.error(e); setSyncStatus('error'); }
        }
    };

    const setJobAnalysis = async (jobId: string, data: Pick<JobAnalysis, 'score' | 'pros' | 'cons' | 'fitReason' | 'resumeEdits'>) => {
        const existing = jobAnalyses.find(a => a.jobId === jobId);
        const analysis: JobAnalysis = {
            id: existing?.id ?? generateId(),
            jobId,
            createdAt: existing?.createdAt ?? new Date().toISOString(),
            ...data
        };
        setJobAnalyses(prev =>
            prev.find(a => a.jobId === jobId)
                ? prev.map(a => a.jobId === jobId ? analysis : a)
                : [...prev, analysis]
        );
        if (dbConfig.enabled) {
            try { await apiClient.upsertJobAnalysis(analysis); }
            catch (e) { console.error(e); }
        }
    };

    const deleteJobAnalysis = async (jobId: string) => {
        setJobAnalyses(prev => prev.filter(a => a.jobId !== jobId));
        if (dbConfig.enabled) {
            try { await apiClient.deleteJobAnalysis(jobId); }
            catch (e) { console.error(e); }
        }
    };

    const addJobSource = (sourceData: Omit<JobSource, 'id' | 'dateAdded'>) => {
        setJobSources(prev => {
            const updated = [{ ...sourceData, id: generateId(), dateAdded: new Date().toISOString() }, ...prev];
            localStorage.setItem('getthejob_sources', JSON.stringify(updated));
            return updated;
        });
    };

    const updateJobSource = (id: string, updates: Partial<Pick<JobSource, 'label' | 'url'>>) => {
        setJobSources(prev => {
            const updated = prev.map(s => s.id === id ? { ...s, ...updates } : s);
            localStorage.setItem('getthejob_sources', JSON.stringify(updated));
            return updated;
        });
    };

    const deleteJobSource = (id: string) => {
        setJobSources(prev => {
            const updated = prev.filter(s => s.id !== id);
            localStorage.setItem('getthejob_sources', JSON.stringify(updated));
            return updated;
        });
    };

    const navigate = (view: ViewState, jobId?: string) => {
        setCurrentView(view);
        if (jobId !== undefined) {
            setSelectedJobId(jobId);
        }
    };

    const importData = (data: any) => {
        if (data.jobs) setJobs(data.jobs);
        if (data.notes) setNotes(data.notes);
        if (data.resumeTextBlocks) setResumeTextBlocks(data.resumeTextBlocks);
        if (data.resumeEntries) setResumeEntries(data.resumeEntries);
        if (data.resumeLines) setResumeLines(data.resumeLines);
        if (data.preferences) setPreferences(data.preferences);
        if (data.contextResources) setContextResources(data.contextResources);
    };

    // Expose API to window for MCP / external tools
    useEffect(() => {
        window.GetTheJobAPI = {
            getState: () => ({ jobs, notes, resumeTextBlocks, resumeEntries, resumeLines, preferences, contextResources }),
            importData,
            addJob,
            updateJob,
            deleteJob,
            addNote,
            addContextResource
        };
    }, [jobs, notes, resumeTextBlocks, resumeEntries, resumeLines, preferences, contextResources]);

    return (
        <AppContext.Provider value={{
            jobs, notes,
            resumeSections, resumeCharBudget, resumeTextBlocks, resumeEntries, resumeLines, resumeGenerations, resumeRawImport, resumeMarkdown, resumeIsDirty,
            preferences, contextResources, journalEntries, interviewQuestions, jobAnalyses, jobSources,
            currentView, selectedJobId, dbConfig, syncStatus,
            addJob, updateJob, deleteJob, addNote, deleteNote,
            updateResumeText, saveResumeRawImport,
            addResumeEntry, updateResumeEntry, deleteResumeEntry,
            addResumeLine, updateResumeLine, deleteResumeLine,
            saveResume, saveResumeGeneration,
            updatePreferences: updatePreferencesState,
            addContextResource, deleteContextResource,
            addJournalEntry, updateJournalEntry, deleteJournalEntry,
            addInterviewQuestion, updateInterviewQuestion, deleteInterviewQuestion,
            setJobAnalysis, deleteJobAnalysis,
            addJobSource, updateJobSource, deleteJobSource,
            navigate, importData, updateDbConfig
        }}>
            {children}
        </AppContext.Provider>
    );
};

export const useAppStore = () => {
    const context = useContext(AppContext);
    if (!context) throw new Error('useAppStore must be used within an AppProvider');
    return context;
};
