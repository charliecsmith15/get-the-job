import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../store';
import { Send, Bot, Loader2, Save, X } from 'lucide-react';
import { chatWithCompanion } from '../services/gemini';
import { Card, Button, Input, Textarea } from '../components/UI';
import { Note } from '../types';

interface ChatMessage {
    role: 'user' | 'model';
    text: string;
}

export const ChatbotView: React.FC = () => {
    const store = useAppStore();
    const [messages, setMessages] = useState<ChatMessage[]>([
        { role: 'model', text: "Hi! I'm your Get the Job AI companion. I have access to your job board, preferences, and notes. How can I help you with your job search today?" }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Export Modal State
    const [exportModalOpen, setExportModalOpen] = useState(false);
    const [exportData, setExportData] = useState({
        jobId: '',
        type: 'General' as Note['type'],
        title: 'AI Insight',
        content: ''
    });

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoading]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMsg = input.trim();
        setInput('');
        const newMessages: ChatMessage[] = [...messages, { role: 'user', text: userMsg }];
        setMessages(newMessages);
        setIsLoading(true);

        try {
            const state = {
                jobs: store.jobs,
                notes: store.notes,
                resumes: store.resumes,
                preferences: store.preferences,
                contextResources: store.contextResources,
                journalEntries: store.journalEntries,
                interviewQuestions: store.interviewQuestions,
            };
            
            // We only pass previous messages to history, excluding the one we just added to UI
            const history = messages.map(m => ({ role: m.role, text: m.text }));
            
            const responseText = await chatWithCompanion(userMsg, history, state);
            
            setMessages([...newMessages, { role: 'model', text: responseText }]);
        } catch (error) {
            console.error("Chat error:", error);
            setMessages([...newMessages, { role: 'model', text: "Sorry, I encountered an error connecting to the AI. Please check your API key and try again." }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleOpenExport = (text: string) => {
        setExportData({
            jobId: store.jobs.length > 0 ? store.jobs[0].id : '',
            type: 'General',
            title: 'AI Insight',
            content: text
        });
        setExportModalOpen(true);
    };

    const handleSaveNote = () => {
        if (!exportData.jobId) {
            alert("Please select a job to save this note to.");
            return;
        }
        if (!exportData.title.trim() || !exportData.content.trim()) {
            alert("Title and content are required.");
            return;
        }

        store.addNote({
            jobId: exportData.jobId,
            type: exportData.type,
            title: exportData.title,
            content: exportData.content,
            isAiGenerated: true
        });
        
        setExportModalOpen(false);
        alert("Note saved successfully!");
    };

    return (
        <div className="h-full flex flex-col crm-enter max-w-5xl mx-auto w-full relative">
            <div className="mb-4 sm:mb-6">
                <h1 className="text-xl sm:text-2xl font-bold text-ink flex items-center">
                    <Bot className="w-6 h-6 sm:w-7 sm:h-7 mr-3 text-wood" />
                    AI Career Companion
                </h1>
                <p className="text-taupe mt-1 text-sm hidden sm:block">
                    Chat with your personalized AI assistant. It has full context of your job board, notes, resumes, and preferences to give you tailored advice.
                </p>
            </div>

            <Card className="flex-1 flex flex-col min-h-0 overflow-hidden shadow-sm border-sand relative">
                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6 bg-cream crm-scrollbar">
                    {messages.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[80%] rounded-2xl px-5 py-4 text-sm ${
                                msg.role === 'user' 
                                ? 'bg-wood text-paper rounded-br-none shadow-md' 
                                : 'bg-paper border border-sand text-ink rounded-bl-none shadow-sm'
                            }`}>
                                <div className="whitespace-pre-wrap leading-relaxed">{msg.text}</div>
                                
                                {/* Export Button for Model Messages */}
                                {msg.role === 'model' && (
                                    <div className="mt-3 pt-3 border-t border-sand/50 flex justify-end">
                                        <button
                                            onClick={() => handleOpenExport(msg.text)}
                                            className="text-xs text-taupe hover:text-wood flex items-center transition-colors"
                                            title="Save this response as a note"
                                        >
                                            <Save className="w-3 h-3 mr-1" /> Save as Note
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex justify-start">
                            <div className="bg-paper border border-sand rounded-2xl rounded-bl-none px-5 py-4 shadow-sm flex items-center space-x-3">
                                <Loader2 className="w-5 h-5 text-wood animate-spin" />
                                <span className="text-sm text-taupe font-medium">Analyzing your workspace...</span>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-4 bg-paper border-t border-sand">
                    <form 
                        onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                        className="flex items-center space-x-3 max-w-4xl mx-auto"
                    >
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Ask for interview tips, resume advice, or job match analysis..."
                            className="flex-1 px-5 py-3 border border-sand rounded-full bg-paper text-ink crm-focus text-sm shadow-sm"
                            disabled={isLoading}
                        />
                        <button 
                            type="submit"
                            disabled={!input.trim() || isLoading}
                            className="w-12 h-12 bg-wood text-paper rounded-full flex items-center justify-center hover:bg-wood-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0 shadow-md"
                        >
                            <Send className="w-5 h-5 ml-0.5" />
                        </button>
                    </form>
                </div>
            </Card>

            {/* Export Modal */}
            {exportModalOpen && (
                <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <Card className="w-full max-w-lg p-6 shadow-2xl crm-enter">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-bold text-ink flex items-center">
                                <Save className="w-5 h-5 mr-2 text-wood" /> Save AI Response to Notes
                            </h2>
                            <button onClick={() => setExportModalOpen(false)} className="text-taupe hover:text-ink">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-ink mb-1">Target Job</label>
                                <select 
                                    className="w-full px-3 py-2 border border-sand rounded-lg bg-paper text-ink crm-focus text-sm"
                                    value={exportData.jobId}
                                    onChange={e => setExportData({...exportData, jobId: e.target.value})}
                                >
                                    <option value="" disabled>Select a job...</option>
                                    {store.jobs.map(j => (
                                        <option key={j.id} value={j.id}>{j.title} at {j.company}</option>
                                    ))}
                                </select>
                                {store.jobs.length === 0 && (
                                    <p className="text-xs text-danger mt-1">You need to add a job to your Job Board first.</p>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-ink mb-1">Note Type</label>
                                    <select 
                                        className="w-full px-3 py-2 border border-sand rounded-lg bg-paper text-ink crm-focus text-sm"
                                        value={exportData.type}
                                        onChange={e => setExportData({...exportData, type: e.target.value as Note['type']})}
                                    >
                                        <option value="General">General Note</option>
                                        <option value="Call">Call Notes</option>
                                        <option value="Interview">Interview Prep/Notes</option>
                                        <option value="Assignment">Take-home Assignment</option>
                                    </select>
                                </div>
                                <Input 
                                    label="Note Title" 
                                    value={exportData.title}
                                    onChange={e => setExportData({...exportData, title: e.target.value})}
                                />
                            </div>

                            <Textarea 
                                label="Note Content" 
                                rows={6}
                                value={exportData.content}
                                onChange={e => setExportData({...exportData, content: e.target.value})}
                                className="font-sans"
                            />
                        </div>

                        <div className="mt-6 flex justify-end space-x-3">
                            <Button variant="ghost" onClick={() => setExportModalOpen(false)}>Cancel</Button>
                            <Button onClick={handleSaveNote} disabled={!exportData.jobId || !exportData.title || !exportData.content}>
                                Save Note
                            </Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
};
