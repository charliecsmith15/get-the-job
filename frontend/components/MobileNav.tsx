import React from 'react';
import { useAppStore } from '../store';
import { MessageSquare, BookOpen, KanbanSquare } from 'lucide-react';

const NAV_ITEMS = [
    { id: 'jobs', label: 'Jobs', icon: KanbanSquare },
    { id: 'chatbot', label: 'AI Coach', icon: MessageSquare },
    { id: 'journal', label: 'Journal', icon: BookOpen },
];

export const MobileNav: React.FC = () => {
    const { currentView, navigate } = useAppStore();

    return (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-forest border-t border-forest-soft z-40">
            <div className="flex">
                {NAV_ITEMS.map(item => {
                    const isActive = currentView === item.id || (item.id === 'jobs' && currentView === 'job-detail');
                    return (
                        <button
                            key={item.id}
                            onClick={() => navigate(item.id as any)}
                            className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-colors ${
                                isActive ? 'text-paper' : 'text-sage-soft'
                            }`}
                        >
                            <item.icon className={`w-6 h-6 ${isActive ? 'text-wood' : 'text-sage-soft'}`} />
                            <span className={`text-[10px] font-medium ${isActive ? 'text-paper' : 'text-sage-soft'}`}>
                                {item.label}
                            </span>
                        </button>
                    );
                })}
            </div>
        </nav>
    );
};
