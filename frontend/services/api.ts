import { Job, Note, Resume, Preferences, ContextResource, JournalEntry, InterviewQuestion } from '../types';

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
 * CREATE TABLE resumes (
 *   id VARCHAR(50) PRIMARY KEY,
 *   name VARCHAR(255),
 *   content TEXT,
 *   targetRole VARCHAR(255),
 *   lastUpdated TIMESTAMP
 * );
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

export const createApiClient = (baseUrl: string) => {
    const headers = { 'Content-Type': 'application/json' };
    
    const handleResponse = async (res: Response) => {
        if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
        // Return empty object for 204 No Content, otherwise parse JSON
        if (res.status === 204) return {};
        const text = await res.text();
        return text ? JSON.parse(text) : {};
    };

    return {
        // Jobs
        getJobs: (): Promise<Job[]> => fetch(`${baseUrl}/jobs`).then(handleResponse),
        createJob: (job: Job): Promise<void> => fetch(`${baseUrl}/jobs`, { method: 'POST', headers, body: JSON.stringify(job) }).then(handleResponse),
        updateJob: (id: string, job: Partial<Job>): Promise<void> => fetch(`${baseUrl}/jobs/${id}`, { method: 'PUT', headers, body: JSON.stringify(job) }).then(handleResponse),
        deleteJob: (id: string): Promise<void> => fetch(`${baseUrl}/jobs/${id}`, { method: 'DELETE' }).then(handleResponse),
        
        // Notes
        getNotes: (): Promise<Note[]> => fetch(`${baseUrl}/notes`).then(handleResponse),
        createNote: (note: Note): Promise<void> => fetch(`${baseUrl}/notes`, { method: 'POST', headers, body: JSON.stringify(note) }).then(handleResponse),
        deleteNote: (id: string): Promise<void> => fetch(`${baseUrl}/notes/${id}`, { method: 'DELETE' }).then(handleResponse),
        
        // Resumes
        getResumes: (): Promise<Resume[]> => fetch(`${baseUrl}/resumes`).then(handleResponse),
        createResume: (resume: Resume): Promise<void> => fetch(`${baseUrl}/resumes`, { method: 'POST', headers, body: JSON.stringify(resume) }).then(handleResponse),
        updateResume: (id: string, resume: Partial<Resume>): Promise<void> => fetch(`${baseUrl}/resumes/${id}`, { method: 'PUT', headers, body: JSON.stringify(resume) }).then(handleResponse),
        deleteResume: (id: string): Promise<void> => fetch(`${baseUrl}/resumes/${id}`, { method: 'DELETE' }).then(handleResponse),
        
        // Context Resources
        getContextResources: (): Promise<ContextResource[]> => fetch(`${baseUrl}/context`).then(handleResponse),
        createContextResource: (resource: ContextResource): Promise<void> => fetch(`${baseUrl}/context`, { method: 'POST', headers, body: JSON.stringify(resource) }).then(handleResponse),
        deleteContextResource: (id: string): Promise<void> => fetch(`${baseUrl}/context/${id}`, { method: 'DELETE' }).then(handleResponse),
        
        // Preferences (Single object)
        getPreferences: (): Promise<Preferences> => fetch(`${baseUrl}/preferences`).then(handleResponse),
        updatePreferences: (prefs: Preferences): Promise<void> => fetch(`${baseUrl}/preferences`, { method: 'PUT', headers, body: JSON.stringify(prefs) }).then(handleResponse),

        // Journal Entries
        getJournalEntries: (): Promise<JournalEntry[]> => fetch(`${baseUrl}/journal`).then(handleResponse),
        createJournalEntry: (entry: JournalEntry): Promise<void> => fetch(`${baseUrl}/journal`, { method: 'POST', headers, body: JSON.stringify(entry) }).then(handleResponse),
        updateJournalEntry: (id: string, entry: Partial<JournalEntry>): Promise<void> => fetch(`${baseUrl}/journal/${id}`, { method: 'PUT', headers, body: JSON.stringify(entry) }).then(handleResponse),
        deleteJournalEntry: (id: string): Promise<void> => fetch(`${baseUrl}/journal/${id}`, { method: 'DELETE' }).then(handleResponse),

        // Interview Questions
        getInterviewQuestions: (): Promise<InterviewQuestion[]> => fetch(`${baseUrl}/interview-questions`).then(handleResponse),
        createInterviewQuestion: (q: InterviewQuestion): Promise<void> => fetch(`${baseUrl}/interview-questions`, { method: 'POST', headers, body: JSON.stringify(q) }).then(handleResponse),
        updateInterviewQuestion: (id: string, q: Partial<InterviewQuestion>): Promise<void> => fetch(`${baseUrl}/interview-questions/${id}`, { method: 'PUT', headers, body: JSON.stringify(q) }).then(handleResponse),
        deleteInterviewQuestion: (id: string): Promise<void> => fetch(`${baseUrl}/interview-questions/${id}`, { method: 'DELETE' }).then(handleResponse),
    };
};
