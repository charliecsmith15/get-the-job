import React, { createContext, useContext, useState, ReactNode, useEffect, useMemo } from 'react';
import { Job, Note, Resume, Preferences, ContextResource, ViewState, DbConfig, SyncStatus } from './types';
import { createApiClient } from './services/api';

interface AppState {
    jobs: Job[];
    notes: Note[];
    resumes: Resume[];
    preferences: Preferences;
    contextResources: ContextResource[];
    currentView: ViewState;
    selectedJobId: string | null;
    dbConfig: DbConfig;
    syncStatus: SyncStatus;
}

interface AppContextType extends AppState {
    addJob: (job: Omit<Job, 'id' | 'dateAdded'>) => void;
    updateJob: (id: string, updates: Partial<Job>) => void;
    deleteJob: (id: string) => void;
    addNote: (note: Omit<Note, 'id' | 'date'>) => void;
    deleteNote: (id: string) => void;
    addResume: (resume: Omit<Resume, 'id' | 'lastUpdated'>) => void;
    updateResume: (id: string, updates: Partial<Resume>) => void;
    deleteResume: (id: string) => void;
    updatePreferences: (prefs: Preferences) => void;
    addContextResource: (resource: Omit<ContextResource, 'id' | 'dateAdded'>) => void;
    deleteContextResource: (id: string) => void;
    navigate: (view: ViewState, jobId?: string) => void;
    importData: (data: any) => void;
    updateDbConfig: (config: DbConfig) => void;
}

const initialPreferences: Preferences = {
    desiredRoles: "Senior Frontend Engineer, Full Stack Developer",
    locations: "Remote, Hybrid (New York)",
    salaryExpectation: "$140k - $180k",
    dealbreakers: "No equity, mandatory 5 days in office, legacy tech stack (jQuery, AngularJS)",
    idealCulture: "Collaborative, values work-life balance, strong engineering practices (CI/CD, testing)."
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

const mockResumes: Resume[] = [
    { id: 'r1', name: 'Frontend Focused - 2024', targetRole: 'Frontend Engineer', content: '# John Doe\n\n## Experience\n**Senior Frontend Engineer**', lastUpdated: new Date().toISOString() },
];

const mockContextResources: ContextResource[] = [
    { id: 'c1', title: 'Ideal Engineering Culture', content: 'I want to work in a place that values async communication.', dateAdded: new Date().toISOString() }
];

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [jobs, setJobs] = useState<Job[]>(mockJobs);
    const [notes, setNotes] = useState<Note[]>(mockNotes);
    const [resumes, setResumes] = useState<Resume[]>(mockResumes);
    const [preferences, setPreferences] = useState<Preferences>(initialPreferences);
    const [contextResources, setContextResources] = useState<ContextResource[]>(mockContextResources);
    const [currentView, setCurrentView] = useState<ViewState>('dashboard');
    const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
    
    const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
    const [dbConfig, setDbConfig] = useState<DbConfig>(() => {
        const saved = localStorage.getItem('careernexus_db_config');
        return saved ? JSON.parse(saved) : { enabled: false, url: 'http://localhost:3000/api' };
    });

    const apiClient = useMemo(() => createApiClient(dbConfig.url), [dbConfig.url]);

    // Fetch initial data if DB is enabled
    useEffect(() => {
        if (dbConfig.enabled) {
            setSyncStatus('syncing');
            Promise.all([
                apiClient.getJobs().catch(() => []),
                apiClient.getNotes().catch(() => []),
                apiClient.getResumes().catch(() => []),
                apiClient.getContextResources().catch(() => []),
                apiClient.getPreferences().catch(() => null)
            ]).then(([j, n, r, c, p]) => {
                if (j.length) setJobs(j);
                if (n.length) setNotes(n);
                if (r.length) setResumes(r);
                if (c.length) setContextResources(c);
                if (p && Object.keys(p).length > 0) setPreferences(p);
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
        localStorage.setItem('careernexus_db_config', JSON.stringify(config));
    };

    const generateId = () => Math.random().toString(36).substr(2, 9);

    const addJob = async (jobData: Omit<Job, 'id' | 'dateAdded'>) => {
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
    };

    const updateJob = async (id: string, updates: Partial<Job>) => {
        setJobs(prev => prev.map(job => job.id === id ? { ...job, ...updates } : job));
        
        if (dbConfig.enabled) {
            setSyncStatus('syncing');
            try {
                await apiClient.updateJob(id, updates);
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

    const addResume = async (resumeData: Omit<Resume, 'id' | 'lastUpdated'>) => {
        const newResume: Resume = { ...resumeData, id: generateId(), lastUpdated: new Date().toISOString() };
        setResumes(prev => [newResume, ...prev]);

        if (dbConfig.enabled) {
            setSyncStatus('syncing');
            try {
                await apiClient.createResume(newResume);
                setSyncStatus('idle');
            } catch (e) {
                console.error(e);
                setSyncStatus('error');
            }
        }
    };

    const updateResume = async (id: string, updates: Partial<Resume>) => {
        setResumes(prev => prev.map(res => res.id === id ? { ...res, ...updates, lastUpdated: new Date().toISOString() } : res));

        if (dbConfig.enabled) {
            setSyncStatus('syncing');
            try {
                await apiClient.updateResume(id, updates);
                setSyncStatus('idle');
            } catch (e) {
                console.error(e);
                setSyncStatus('error');
            }
        }
    };

    const deleteResume = async (id: string) => {
        setResumes(prev => prev.filter(res => res.id !== id));

        if (dbConfig.enabled) {
            setSyncStatus('syncing');
            try {
                await apiClient.deleteResume(id);
                setSyncStatus('idle');
            } catch (e) {
                console.error(e);
                setSyncStatus('error');
            }
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

    const navigate = (view: ViewState, jobId?: string) => {
        setCurrentView(view);
        if (jobId !== undefined) {
            setSelectedJobId(jobId);
        }
    };

    const importData = (data: any) => {
        if (data.jobs) setJobs(data.jobs);
        if (data.notes) setNotes(data.notes);
        if (data.resumes) setResumes(data.resumes);
        if (data.preferences) setPreferences(data.preferences);
        if (data.contextResources) setContextResources(data.contextResources);
    };

    // Expose API to window for MCP / external tools
    useEffect(() => {
        window.CareerNexusAPI = {
            getState: () => ({ jobs, notes, resumes, preferences, contextResources }),
            importData,
            addJob,
            updateJob,
            deleteJob,
            addNote,
            addResume,
            updateResume,
            addContextResource
        };
    }, [jobs, notes, resumes, preferences, contextResources]);

    return (
        <AppContext.Provider value={{
            jobs, notes, resumes, preferences, contextResources, currentView, selectedJobId, dbConfig, syncStatus,
            addJob, updateJob, deleteJob, addNote, deleteNote,
            addResume, updateResume, deleteResume, updatePreferences: updatePreferencesState,
            addContextResource, deleteContextResource, navigate, importData, updateDbConfig
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
