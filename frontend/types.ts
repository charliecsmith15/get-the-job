export type JobStatus = 'Saved' | 'Applied' | 'Interviewing' | 'Offer' | 'Rejected';

export interface Job {
    id: string;
    title: string;
    company: string;
    status: JobStatus;
    url: string;
    description: string;
    dateAdded: string;
    location?: string;
    source?: string;
    tags?: string[];
    dateApplied?: string;
    customFields?: Record<string, string>;
}

export interface PetalAlignment {
    name: string;
    summary: string;
    alignment: 'aligned' | 'not-aligned' | 'unsure';
}

export interface JobAnalysis {
    id: string;
    jobId: string;
    score: number;
    petals: PetalAlignment[];
    resumeEdits: string[];
    missingExperience: string[];
    createdAt: string;
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

export type ResumeSectionType = 'text' | 'entries' | 'list';

export interface ResumeSectionConfig {
    id: string;
    label: string;
    type: ResumeSectionType;
    order: number;
}

export interface ResumeTextBlock {
    sectionId: string;
    content: string;
    updatedAt: string;
}

export interface ResumeEntry {
    id: string;
    sectionId: string;
    heading: string;
    subheading?: string;
    startDate?: string;
    endDate?: string;
    order: number;
}

export interface ResumeLine {
    id: string;
    sectionId: string;
    entryId?: string | null;
    jobId?: string | null;
    content: string;
    order: number;
}

export interface ResumeGeneration {
    jobId: string;
    selectedLineIds: string[];
    renderedMarkdown: string;
    createdAt: string;
    updatedAt: string;
}

export interface Preferences {
    petalsExercise: string;
    linkedInProfile?: string;
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

export type ViewState = 'dashboard' | 'chatbot' | 'jobs' | 'job-detail' | 'resumes' | 'preferences' | 'developer' | 'journal' | 'interview-prep' | 'sources';

export interface JobSource {
    id: string;
    label: string;
    url: string;
    dateAdded: string;
}

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
