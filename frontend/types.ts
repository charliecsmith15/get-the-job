export type JobStatus = 'Saved' | 'Applied' | 'Interviewing' | 'Offer' | 'Rejected';

export interface Job {
    id: string;
    title: string;
    company: string;
    status: JobStatus;
    url: string;
    description: string;
    dateAdded: string;
    matchScore?: number;
    matchAnalysis?: string;
    location?: string;
    tags?: string[];
    dateApplied?: string;
    customFields?: Record<string, string>;
}

export interface Note {
    id: string;
    jobId: string;
    type: 'General' | 'Call' | 'Interview' | 'Assignment';
    title: string;
    content: string;
    date: string;
    isAiGenerated?: boolean;
}

export interface Resume {
    id: string;
    name: string;
    content: string;
    targetRole: string;
    lastUpdated: string;
}

export interface Preferences {
    petalsExercise: string;
}

export interface ContextResource {
    id: string;
    title: string;
    content: string;
    dateAdded: string;
}

export interface JournalEntry {
    id: string;
    date: string;
    content: string;
}

export interface InterviewQuestion {
    id: string;
    question: string;
    response: string;
    category: string;
    dateAdded: string;
}

export type ViewState = 'dashboard' | 'chatbot' | 'jobs' | 'job-detail' | 'resumes' | 'preferences' | 'developer' | 'journal' | 'interview-prep';

export interface DbConfig {
    enabled: boolean;
    url: string;
}

export type SyncStatus = 'idle' | 'syncing' | 'error';

declare global {
    interface Window {
        GetTheJobAPI: any;
    }
}
