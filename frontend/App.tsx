import React from 'react';
import { AppProvider, useAppStore } from './store';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './views/Dashboard';
import { JobBoard } from './views/JobBoard';
import { JobDetail } from './views/JobDetail';
import { ResumeManager } from './views/ResumeManager';
import { PreferencesView } from './views/Preferences';
import { DeveloperAPI } from './views/DeveloperAPI';
import { ChatbotView } from './views/ChatbotView';

const MainContent: React.FC = () => {
    const { currentView } = useAppStore();

    const renderView = () => {
        switch (currentView) {
            case 'dashboard': return <Dashboard />;
            case 'chatbot': return <ChatbotView />;
            case 'jobs': return <JobBoard />;
            case 'job-detail': return <JobDetail />;
            case 'resumes': return <ResumeManager />;
            case 'preferences': return <PreferencesView />;
            case 'developer': return <DeveloperAPI />;
            default: return <Dashboard />;
        }
    };

    return (
        <div className="flex h-screen bg-transparent overflow-hidden relative">
            <Sidebar />
            <main className="flex-1 overflow-y-auto p-8 crm-scrollbar crm-grid">
                {renderView()}
            </main>
        </div>
    );
};

const App: React.FC = () => {
    return (
        <AppProvider>
            <MainContent />
        </AppProvider>
    );
};

export default App;
