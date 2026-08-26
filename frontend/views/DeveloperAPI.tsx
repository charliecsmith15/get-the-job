import React, { useState } from 'react';
import { useAppStore } from '../store';
import { Card, Button, Textarea, Input } from '../components/UI';
import { Code2, Download, Upload, Terminal, Database, Server } from 'lucide-react';

export const DeveloperAPI: React.FC = () => {
    const store = useAppStore();
    const [importJson, setImportJson] = useState('');
    const [importError, setImportError] = useState<string | null>(null);
    
    const [dbUrl, setDbUrl] = useState(store.dbConfig.url);
    const [dbEnabled, setDbEnabled] = useState(store.dbConfig.enabled);

    const handleExport = () => {
        const state = {
            jobs: store.jobs,
            notes: store.notes,
            resumeTextBlocks: store.resumeTextBlocks,
            resumeEntries: store.resumeEntries,
            resumeLines: store.resumeLines,
            preferences: store.preferences,
            contextResources: store.contextResources,
            journalEntries: store.journalEntries,
            interviewQuestions: store.interviewQuestions,
        };
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `getthejob_export_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleImport = () => {
        try {
            const data = JSON.parse(importJson);
            store.importData(data);
            setImportJson('');
            setImportError(null);
            alert('Data imported successfully!');
        } catch (e) {
            setImportError('Invalid JSON format. Please check your input.');
        }
    };

    const handleSaveDbConfig = () => {
        store.updateDbConfig({ enabled: dbEnabled, url: dbUrl });
        alert('Database configuration saved! The app will now attempt to sync with this backend.');
    };

    return (
        <div className="max-w-4xl mx-auto crm-enter pb-12">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-ink flex items-center">
                    <Code2 className="w-6 h-6 mr-2 text-wood" />
                    Developer API & Database
                </h1>
                <p className="text-taupe mt-2">
                    Configure your SQL backend connection, export your data, or connect external tools (like Claude MCP).
                </p>
            </div>

            <div className="grid grid-cols-1 gap-6">
                {/* SQL Backend Configuration */}
                <Card className="p-6 border-wood bg-cream">
                    <h2 className="text-lg font-semibold text-ink mb-4 flex items-center">
                        <Database className="w-5 h-5 mr-2 text-wood-dark" /> SQL Backend Connection
                    </h2>
                    <p className="text-sm text-ink mb-6">
                        Connect Get the Job to your own REST API that writes to an actual SQL server (PostgreSQL, MySQL, etc.). When enabled, all changes will be synced to your database.
                    </p>
                    
                    <div className="space-y-4 max-w-xl">
                        <div className="flex items-center space-x-3">
                            <input 
                                type="checkbox" 
                                id="enableDb" 
                                checked={dbEnabled}
                                onChange={(e) => setDbEnabled(e.target.checked)}
                                className="w-4 h-4 text-wood rounded border-sand focus:ring-wood"
                            />
                            <label htmlFor="enableDb" className="text-sm font-medium text-ink">Enable SQL Backend Sync</label>
                        </div>
                        
                        <Input 
                            label="REST API Base URL" 
                            placeholder="http://localhost:3000/api" 
                            value={dbUrl}
                            onChange={(e) => setDbUrl(e.target.value)}
                            disabled={!dbEnabled}
                        />
                        
                        <Button icon={Server} onClick={handleSaveDbConfig}>Save Connection Settings</Button>
                    </div>

                    <div className="mt-8 pt-6 border-t border-sand">
                        <h3 className="text-sm font-semibold text-ink mb-2">Required SQL Schema</h3>
                        <p className="text-xs text-taupe mb-3">Your backend API should map to a SQL database with the following table structure:</p>
                        <div className="bg-forest p-4 rounded-lg overflow-x-auto">
                            <code className="text-xs text-sage-soft font-mono whitespace-pre">
{`CREATE TABLE jobs (
    id VARCHAR(50) PRIMARY KEY,
    title VARCHAR(255),
    company VARCHAR(255),
    status VARCHAR(50),
    url TEXT,
    description TEXT,
    dateAdded TIMESTAMP,
    matchScore INT,
    matchAnalysis TEXT,
    location VARCHAR(255),
    tags JSONB,
    dateApplied DATE,
    customFields JSONB
);

CREATE TABLE notes (
    id VARCHAR(50) PRIMARY KEY,
    jobId VARCHAR(50) REFERENCES jobs(id) ON DELETE CASCADE,
    type VARCHAR(50),
    title VARCHAR(255),
    content TEXT,
    date TIMESTAMP,
    isAiGenerated BOOLEAN DEFAULT FALSE
);

-- The single structured resume — see backend/resumeSections.js for the
-- section config these are keyed against.
CREATE TABLE resume_section_content (
    accountId INTEGER,
    sectionId VARCHAR(50),
    content TEXT,
    updatedAt TIMESTAMP,
    PRIMARY KEY (accountId, sectionId)
);

CREATE TABLE resume_entries (
    id VARCHAR(50) PRIMARY KEY,
    sectionId VARCHAR(50),
    heading VARCHAR(255),
    subheading VARCHAR(255),
    startDate VARCHAR(50),
    endDate VARCHAR(50),
    "order" INTEGER
);

CREATE TABLE resume_lines (
    id VARCHAR(50) PRIMARY KEY,
    sectionId VARCHAR(50),
    entryId VARCHAR(50) REFERENCES resume_entries(id) ON DELETE CASCADE,
    jobId VARCHAR(50) REFERENCES jobs(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    "order" INTEGER
);

CREATE TABLE context_resources (
    id VARCHAR(50) PRIMARY KEY,
    title VARCHAR(255),
    content TEXT,
    dateAdded TIMESTAMP
);

CREATE TABLE preferences (
    id INT PRIMARY KEY DEFAULT 1,
    petalsExercise TEXT
);

-- Search Journal: daily notes fed into AI context
CREATE TABLE journal_entries (
    id VARCHAR(50) PRIMARY KEY,
    date DATE NOT NULL,
    content TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Interview Prep: Q&A pairs fed into AI context
CREATE TABLE interview_questions (
    id VARCHAR(50) PRIMARY KEY,
    question TEXT NOT NULL,
    response TEXT,
    category VARCHAR(100) DEFAULT 'General',
    dateAdded TIMESTAMP DEFAULT NOW()
);`}
                            </code>
                        </div>

                        <div className="mt-6 pt-6 border-t border-sand">
                            <h3 className="text-sm font-semibold text-ink mb-2">Required API Endpoints</h3>
                            <p className="text-xs text-taupe mb-3">Your backend must expose the following REST endpoints. The app calls these when SQL sync is enabled.</p>
                            <div className="bg-forest p-4 rounded-lg overflow-x-auto">
                                <code className="text-xs text-sage-soft font-mono whitespace-pre">
{`-- Standard resources (jobs, notes, resume, context, preferences)
GET    /api/jobs                     → list all
POST   /api/jobs                     → create
PUT    /api/jobs/:id                 → update
DELETE /api/jobs/:id                 → delete

GET    /api/notes                    → list all
POST   /api/notes                    → create
DELETE /api/notes/:id                → delete

GET    /api/resume-config            → section definitions
GET    /api/resume                   → text blocks + entries + lines
PUT    /api/resume/text/:sectionId   → upsert a text-type section
POST   /api/resume/entries           → create an entry
PUT    /api/resume/entries/:id       → update an entry
DELETE /api/resume/entries/:id       → delete an entry
POST   /api/resume/lines             → create a line (baseline or job-scoped)
PUT    /api/resume/lines/:id         → update a line
DELETE /api/resume/lines/:id         → delete a line
GET    /api/resume-generations/:jobId → last AI selection for a job
PUT    /api/resume-generations/:jobId → save an AI selection for a job

GET    /api/context                  → list all
POST   /api/context                  → create
DELETE /api/context/:id              → delete

GET    /api/preferences              → get (single row, id=1)
PUT    /api/preferences              → upsert

-- Search Journal
GET    /api/journal                  → list all entries
POST   /api/journal                  → create entry
PUT    /api/journal/:id              → update entry
DELETE /api/journal/:id              → delete entry

-- Interview Prep
GET    /api/interview-questions      → list all questions
POST   /api/interview-questions      → create question
PUT    /api/interview-questions/:id  → update question
DELETE /api/interview-questions/:id  → delete question`}
                                </code>
                            </div>
                        </div>
                    </div>
                </Card>

                {/* JSON Export / Import */}
                <Card className="p-6">
                    <h2 className="text-lg font-semibold text-ink mb-4 flex items-center">
                        <Download className="w-5 h-5 mr-2 text-taupe" /> Data Export & Import
                    </h2>
                    <p className="text-sm text-ink mb-4">
                        Download your entire workspace as a JSON file, or import an existing JSON file to overwrite your current state.
                    </p>
                    
                    <div className="flex space-x-4 mb-6">
                        <Button icon={Download} onClick={handleExport}>Export JSON</Button>
                    </div>

                    <div className="border-t border-sand pt-6">
                        <h3 className="text-sm font-medium text-ink mb-2">Import JSON</h3>
                        <Textarea 
                            rows={6} 
                            placeholder='Paste JSON here...' 
                            value={importJson}
                            onChange={e => setImportJson(e.target.value)}
                            className="font-mono text-xs"
                        />
                        {importError && <p className="text-danger text-sm mt-2">{importError}</p>}
                        <div className="mt-3">
                            <Button variant="secondary" icon={Upload} onClick={handleImport} disabled={!importJson.trim()}>Import Data</Button>
                        </div>
                    </div>
                </Card>

                {/* MCP / Local API Instructions */}
                <Card className="p-6 bg-forest text-cream border-forest-soft">
                    <h2 className="text-lg font-semibold text-paper mb-4 flex items-center">
                        <Terminal className="w-5 h-5 mr-2 text-wood" /> Local API Access (MCP)
                    </h2>
                    <p className="text-sm mb-4 text-sage-soft">
                        The application state is exposed globally to the browser window, allowing local automation tools (like Puppeteer, Playwright, or local browser extensions) to act as an MCP bridge for Claude.
                    </p>
                    
                    <div className="bg-forest-soft p-4 rounded-lg border border-forest overflow-x-auto">
                        <code className="text-sm text-sage font-mono whitespace-pre">
{`// Access the API via the global window object
const api = window.GetTheJobAPI;

// Get full state
const state = api.getState();
console.log(state.jobs);

// Add a new job programmatically
api.addJob({
  title: "Senior Engineer",
  company: "Anthropic",
  status: "Saved",
  url: "https://anthropic.com/careers",
  description: "..."
});

// Update a job
api.updateJob("job_id_here", { status: "Applied" });

// Add a context resource
api.addContextResource({
  title: "New Criteria",
  content: "Must use React 18+"
});`}
                        </code>
                    </div>
                    <p className="text-sm mt-4 text-sage-soft">
                        To build an MCP server for Claude, you can write a local Node.js script that uses Puppeteer to connect to this running tab and executes the <code className="bg-forest px-1 rounded text-paper">window.GetTheJobAPI</code> methods. Alternatively, you can have your MCP server read and write the JSON export file directly.
                    </p>
                </Card>
            </div>
        </div>
    );
};
