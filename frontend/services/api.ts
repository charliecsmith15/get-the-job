import { Job, JobAnalysis, Note, Preferences, AccountProfile, ContextResource, JournalEntry, InterviewQuestion, ResumeSectionConfig, ResumeTextBlock, ResumeEntry, ResumeLine, ResumeGeneration } from '../types';

/**
 * API Client for communicating with the SQL Backend.
 * 
 * EXPECTED SQL SCHEMA (PostgreSQL/MySQL):
 * 
 * CREATE TABLE jobs (
 *   id VARCHAR(50) PRIMARY KEY,
 *   title VARCHAR(255),
 *   company VARCHAR(255),
 *   status VARCHAR(50),
 *   url TEXT,
 *   description TEXT,
 *   dateAdded TIMESTAMP,
 *   matchScore INT,
 *   matchAnalysis TEXT,
 *   location VARCHAR(255),
 *   tags JSONB,
 *   dateApplied DATE,
 *   customFields JSONB
 * );
 * 
 * CREATE TABLE notes (
 *   id VARCHAR(50) PRIMARY KEY,
 *   jobId VARCHAR(50) REFERENCES jobs(id) ON DELETE CASCADE,
 *   type VARCHAR(50),
 *   title VARCHAR(255),
 *   content TEXT,
 *   date TIMESTAMP,
 *   isAiGenerated BOOLEAN DEFAULT FALSE
 * );
 * 
 * The single structured resume is spread across a few tables — see
 * backend/schema.sql (resume_section_content, resume_entries, resume_lines,
 * resume_raw_import, resume_generations) and backend/resumeSections.js for
 * the section config they're keyed against.
 *
 * CREATE TABLE context_resources (
 *   id VARCHAR(50) PRIMARY KEY,
 *   title VARCHAR(255),
 *   content TEXT,
 *   dateAdded TIMESTAMP
 * );
 * 
 * CREATE TABLE preferences (
 *   id INT PRIMARY KEY DEFAULT 1,
 *   petalsExercise TEXT
 * );
 *
 * CREATE TABLE journal_entries (
 *   id VARCHAR(50) PRIMARY KEY,
 *   date DATE NOT NULL,
 *   content TEXT,
 *   created_at TIMESTAMP DEFAULT NOW()
 * );
 *
 * CREATE TABLE interview_questions (
 *   id VARCHAR(50) PRIMARY KEY,
 *   question TEXT NOT NULL,
 *   response TEXT,
 *   category VARCHAR(100) DEFAULT 'General',
 *   dateAdded TIMESTAMP DEFAULT NOW()
 * );
 */

// sessionStorage key holding the signed Google ID token from sign-in.
// Shared with App.tsx / LoginScreen so every request can carry it.
export const ID_TOKEN_STORAGE_KEY = 'getthejob_id_token';

export const createApiClient = (baseUrl: string) => {
    // Read the token fresh on every request rather than once at client
    // creation, since sign-in can happen after the client is constructed.
    const authHeaders = () => {
        const token = sessionStorage.getItem(ID_TOKEN_STORAGE_KEY);
        return {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };
    };
    const headers = authHeaders();

    const handleResponse = async (res: Response) => {
        if (res.status === 401) {
            // Google ID tokens expire (~1hr) — force a fresh sign-in rather
            // than surfacing a confusing API error.
            sessionStorage.removeItem(ID_TOKEN_STORAGE_KEY);
            sessionStorage.removeItem('getthejob_auth');
            window.location.reload();
            throw new Error('Session expired — please sign in again');
        }
        if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
        // Return empty object for 204 No Content, otherwise parse JSON
        if (res.status === 204) return {};
        const text = await res.text();
        return text ? JSON.parse(text) : {};
    };

    return {
        // Account profile
        getMe: (): Promise<{ email: string; isDemo: boolean } & Partial<AccountProfile>> =>
            fetch(`${baseUrl}/me`, { headers: authHeaders() }).then(handleResponse),
        updateAccountProfile: (profile: Partial<AccountProfile>): Promise<void> =>
            fetch(`${baseUrl}/me/profile`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify(profile) }).then(handleResponse),

        // Jobs
        getJobs: (): Promise<Job[]> => fetch(`${baseUrl}/jobs`, { headers }).then(handleResponse),
        createJob: (job: Job): Promise<void> => fetch(`${baseUrl}/jobs`, { method: 'POST', headers, body: JSON.stringify(job) }).then(handleResponse),
        updateJob: (id: string, job: Partial<Job>): Promise<void> => fetch(`${baseUrl}/jobs/${id}`, { method: 'PUT', headers, body: JSON.stringify(job) }).then(handleResponse),
        deleteJob: (id: string): Promise<void> => fetch(`${baseUrl}/jobs/${id}`, { method: 'DELETE', headers }).then(handleResponse),
        
        // Notes
        getNotes: (): Promise<Note[]> => fetch(`${baseUrl}/notes`, { headers }).then(handleResponse),
        createNote: (note: Note): Promise<void> => fetch(`${baseUrl}/notes`, { method: 'POST', headers, body: JSON.stringify(note) }).then(handleResponse),
        updateNote: (note: Note): Promise<Note> => fetch(`${baseUrl}/notes/${note.id}`, { method: 'PUT', headers, body: JSON.stringify(note) }).then(handleResponse),
        deleteNote: (id: string): Promise<void> => fetch(`${baseUrl}/notes/${id}`, { method: 'DELETE', headers }).then(handleResponse),
        
        // Resume — a single structured resume per account
        getResumeConfig: (): Promise<{ sections: ResumeSectionConfig[]; totalCharBudget: number }> => fetch(`${baseUrl}/resume-config`, { headers }).then(handleResponse),
        getResume: (): Promise<{ textBlocks: ResumeTextBlock[]; entries: ResumeEntry[]; lines: ResumeLine[] }> => fetch(`${baseUrl}/resume`, { headers }).then(handleResponse),
        getResumeRawImport: (): Promise<{ content: string; importedAt: string } | null> => fetch(`${baseUrl}/resume/raw-import`, { headers }).then(handleResponse),
        saveResumeRawImport: (content: string): Promise<void> => fetch(`${baseUrl}/resume/raw-import`, { method: 'PUT', headers, body: JSON.stringify({ content }) }).then(handleResponse),
        updateResumeText: (sectionId: string, content: string): Promise<void> => fetch(`${baseUrl}/resume/text/${sectionId}`, { method: 'PUT', headers, body: JSON.stringify({ content }) }).then(handleResponse),
        createResumeEntry: (entry: ResumeEntry): Promise<void> => fetch(`${baseUrl}/resume/entries`, { method: 'POST', headers, body: JSON.stringify(entry) }).then(handleResponse),
        updateResumeEntry: (id: string, entry: Partial<ResumeEntry>): Promise<void> => fetch(`${baseUrl}/resume/entries/${id}`, { method: 'PUT', headers, body: JSON.stringify(entry) }).then(handleResponse),
        deleteResumeEntry: (id: string): Promise<void> => fetch(`${baseUrl}/resume/entries/${id}`, { method: 'DELETE', headers }).then(handleResponse),
        createResumeLine: (line: ResumeLine): Promise<void> => fetch(`${baseUrl}/resume/lines`, { method: 'POST', headers, body: JSON.stringify(line) }).then(handleResponse),
        updateResumeLine: (id: string, line: Partial<ResumeLine>): Promise<void> => fetch(`${baseUrl}/resume/lines/${id}`, { method: 'PUT', headers, body: JSON.stringify(line) }).then(handleResponse),
        deleteResumeLine: (id: string): Promise<void> => fetch(`${baseUrl}/resume/lines/${id}`, { method: 'DELETE', headers }).then(handleResponse),

        // Resume Generations — the last AI line-selection + rendered Markdown per job
        getResumeGenerations: (): Promise<ResumeGeneration[]> => fetch(`${baseUrl}/resume-generations`, { headers }).then(handleResponse),
        getResumeGeneration: (jobId: string): Promise<ResumeGeneration | null> => fetch(`${baseUrl}/resume-generations/${jobId}`, { headers }).then(handleResponse),
        saveResumeGeneration: (jobId: string, generation: { selectedLineIds: string[]; renderedMarkdown: string }): Promise<void> => fetch(`${baseUrl}/resume-generations/${jobId}`, { method: 'PUT', headers, body: JSON.stringify(generation) }).then(handleResponse),

        // Additional Context
        getContextResources: (): Promise<ContextResource[]> => fetch(`${baseUrl}/context`, { headers }).then(handleResponse),
        createContextResource: (resource: ContextResource): Promise<void> => fetch(`${baseUrl}/context`, { method: 'POST', headers, body: JSON.stringify(resource) }).then(handleResponse),
        deleteContextResource: (id: string): Promise<void> => fetch(`${baseUrl}/context/${id}`, { method: 'DELETE', headers }).then(handleResponse),
        
        // Preferences (Single object)
        getPreferences: (): Promise<Preferences> => fetch(`${baseUrl}/preferences`, { headers }).then(handleResponse),
        updatePreferences: (prefs: Preferences): Promise<void> => fetch(`${baseUrl}/preferences`, { method: 'PUT', headers, body: JSON.stringify(prefs) }).then(handleResponse),

        // Journal Entries
        getJournalEntries: (): Promise<JournalEntry[]> => fetch(`${baseUrl}/journal`, { headers }).then(handleResponse),
        createJournalEntry: (entry: JournalEntry): Promise<void> => fetch(`${baseUrl}/journal`, { method: 'POST', headers, body: JSON.stringify(entry) }).then(handleResponse),
        updateJournalEntry: (id: string, entry: Partial<JournalEntry>): Promise<void> => fetch(`${baseUrl}/journal/${id}`, { method: 'PUT', headers, body: JSON.stringify(entry) }).then(handleResponse),
        deleteJournalEntry: (id: string): Promise<void> => fetch(`${baseUrl}/journal/${id}`, { method: 'DELETE', headers }).then(handleResponse),

        // Interview Questions
        getInterviewQuestions: (): Promise<InterviewQuestion[]> => fetch(`${baseUrl}/interview-questions`, { headers }).then(handleResponse),
        createInterviewQuestion: (q: InterviewQuestion): Promise<void> => fetch(`${baseUrl}/interview-questions`, { method: 'POST', headers, body: JSON.stringify(q) }).then(handleResponse),
        updateInterviewQuestion: (id: string, q: Partial<InterviewQuestion>): Promise<void> => fetch(`${baseUrl}/interview-questions/${id}`, { method: 'PUT', headers, body: JSON.stringify(q) }).then(handleResponse),
        deleteInterviewQuestion: (id: string): Promise<void> => fetch(`${baseUrl}/interview-questions/${id}`, { method: 'DELETE', headers }).then(handleResponse),

        // Job Analyses
        getJobAnalyses: (): Promise<JobAnalysis[]> => fetch(`${baseUrl}/job-analyses`, { headers }).then(handleResponse),
        upsertJobAnalysis: (analysis: JobAnalysis): Promise<void> => fetch(`${baseUrl}/job-analyses/${analysis.jobId}`, { method: 'PUT', headers, body: JSON.stringify(analysis) }).then(handleResponse),
        deleteJobAnalysis: (jobId: string): Promise<void> => fetch(`${baseUrl}/job-analyses/${jobId}`, { method: 'DELETE', headers }).then(handleResponse),
    };
};
