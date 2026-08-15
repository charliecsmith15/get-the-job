import React, { useState, useEffect, useCallback } from 'react';
import { AppProvider, useAppStore } from './store';
import { Sidebar } from './components/Sidebar';
import { LoginScreen } from './components/LoginScreen';
import { Dashboard } from './views/Dashboard';
import { JobBoard } from './views/JobBoard';
import { JobDetail } from './views/JobDetail';
import { ResumeManager } from './views/ResumeManager';
import { PreferencesView } from './views/Preferences';
import { DeveloperAPI } from './views/DeveloperAPI';
import { ChatbotView } from './views/ChatbotView';
import { JournalView } from './views/Journal';
import { InterviewPrepView } from './views/InterviewPrep';
import { MobileNav } from './components/MobileNav';

const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

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
            case 'journal': return <JournalView />;
            case 'interview-prep': return <InterviewPrepView />;
            default: return <Dashboard />;
        }
    };

    return (
        <div className="flex h-screen bg-transparent overflow-hidden relative">
            <Sidebar />
            <main className="flex-1 overflow-y-auto p-4 sm:p-8 pb-24 md:pb-8 crm-scrollbar crm-grid">
                {renderView()}
            </main>
            <MobileNav />
        </div>
    );
};

type AuthState = 'checking' | 'unauthenticated' | 'authorized' | 'denied';

const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [authState, setAuthState] = useState<AuthState>('checking');

    useEffect(() => {
        const saved = sessionStorage.getItem('getthejob_auth');
        setAuthState(saved && ALLOWED_EMAILS.includes(saved) ? 'authorized' : 'unauthenticated');
    }, []);

    const handleSignIn = useCallback((email: string) => {
        if (ALLOWED_EMAILS.includes(email)) {
            sessionStorage.setItem('getthejob_auth', email);
            setAuthState('authorized');
        } else {
            setAuthState('denied');
        }
    }, []);

    if (authState === 'checking') return null;

    if (authState === 'authorized') return <>{children}</>;

    if (authState === 'denied') return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-cream">
            <div className="crm-card rounded-2xl p-10 flex flex-col items-center max-w-sm w-full mx-4 text-center">
                <h1 className="text-xl font-bold text-ink mb-2">Access Denied</h1>
                <p className="text-taupe text-sm mb-6">Your Google account is not authorized to access this app.</p>
                <button onClick={() => setAuthState('unauthenticated')} className="text-sm text-wood underline">
                    Try a different account
                </button>
            </div>
        </div>
    );

    return <LoginScreen clientId={process.env.GOOGLE_CLIENT_ID || ''} onSignIn={handleSignIn} />;
};

const App: React.FC = () => {
    return (
        <AuthGate>
            <AppProvider>
                <MainContent />
            </AppProvider>
        </AuthGate>
    );
};

export default App;
