import React from 'react';
import { useAppStore } from '../store';
import { LayoutDashboard, KanbanSquare, FileText, Settings, Briefcase, Code2, Database, MessageSquare, BookOpen, MessageCircle } from 'lucide-react';

export const Sidebar: React.FC = () => {
    const { currentView, navigate, dbConfig, syncStatus } = useAppStore();

    const navItems = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'chatbot', label: 'AI Companion', icon: MessageSquare },
        { id: 'jobs', label: 'Job Board', icon: KanbanSquare },
        { id: 'resumes', label: 'Resumes', icon: FileText },
        { id: 'journal', label: 'Search Journal', icon: BookOpen },
        { id: 'interview-prep', label: 'Interview Prep', icon: MessageCircle },
        { id: 'preferences', label: 'Preferences & Context', icon: Settings },
        { id: 'developer', label: 'Developer API & DB', icon: Code2 },
    ];

    return (
        <div className="hidden md:flex w-64 bg-forest text-cream flex-col h-screen sticky top-0 shadow-xl z-10">
            <div className="p-6 flex items-center space-x-3 text-paper">
                <div className="bg-wood p-2 rounded-lg">
                    <Briefcase className="w-6 h-6" />
                </div>
                <span className="text-xl font-bold tracking-tight">CareerNexus</span>
            </div>

            <nav className="flex-1 px-4 space-y-1 mt-4">
                {navItems.map(item => {
                    const isActive = currentView === item.id || (item.id === 'jobs' && currentView === 'job-detail');
                    return (
                        <button
                            key={item.id}
                            onClick={() => navigate(item.id as any)}
                            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                                isActive 
                                ? 'bg-forest-soft text-paper font-medium' 
                                : 'hover:bg-forest-soft hover:text-paper text-sage-soft'
                            }`}
                        >
                            <item.icon className={`w-5 h-5 ${isActive ? 'text-paper' : 'text-sage-soft'}`} />
                            <span>{item.label}</span>
                        </button>
                    );
                })}
            </nav>

            <div className="p-4 m-4 space-y-3">
                {/* AI Status */}
                <div className="bg-forest-soft p-3 rounded-xl border border-forest">
                    <div className="flex items-center space-x-2 text-sm text-sage-soft mb-1">
                        <div className="w-2 h-2 rounded-full bg-sage"></div>
                        <span>AI Assistant Active</span>
                    </div>
                    <p className="text-xs text-taupe">Powered by Gemini 2.5 Flash</p>
                </div>

                {/* DB Status */}
                <div className="bg-forest-soft p-3 rounded-xl border border-forest">
                    <div className="flex items-center space-x-2 text-sm text-sage-soft mb-1">
                        <Database className="w-3 h-3" />
                        <span className="font-medium">Storage Mode</span>
                    </div>
                    <div className="flex items-center space-x-2 text-xs text-taupe">
                        <div className={`w-2 h-2 rounded-full ${
                            !dbConfig.enabled ? 'bg-taupe' : 
                            syncStatus === 'error' ? 'bg-danger' : 
                            syncStatus === 'syncing' ? 'bg-wood animate-pulse' : 'bg-sage'
                        }`}></div>
                        <span>
                            {!dbConfig.enabled ? 'Local Memory' : 
                             syncStatus === 'error' ? 'SQL Sync Error' : 
                             syncStatus === 'syncing' ? 'Syncing to SQL...' : 'SQL Synced'}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};
