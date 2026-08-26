import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../store';
import { MessageCircle, X, Send, Bot, Loader2 } from 'lucide-react';
import { chatWithCompanion } from '../services/gemini';
import { Card } from './UI';

interface ChatMessage {
    role: 'user' | 'model';
    text: string;
}

export const Chatbot: React.FC = () => {
    const store = useAppStore();
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([
        { role: 'model', text: "Hello, place any question about your job search here." }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
        }
    }, [messages, isOpen, isLoading]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMsg = input.trim();
        setInput('');
        const newMessages: ChatMessage[] = [...messages, { role: 'user', text: userMsg }];
        setMessages(newMessages);
        setIsLoading(true);

        try {
            // Pass the current state to the gemini service
            const state = {
                jobs: store.jobs,
                notes: store.notes,
                resumeMarkdown: store.resumeMarkdown,
                preferences: store.preferences,
                contextResources: store.contextResources
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

    return (
        <>
            {/* FAB — desktop only */}
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    className="hidden md:flex fixed bottom-6 right-6 w-14 h-14 bg-brand-600 text-white rounded-full shadow-lg hover:bg-brand-700 hover:scale-105 transition-all items-center justify-center z-50"
                    title="Chat with Search Assistant"
                >
                    <MessageCircle className="w-6 h-6" />
                </button>
            )}

            {/* Chat Window — desktop only */}
            {isOpen && (
                <Card className="hidden md:flex fixed bottom-6 right-6 w-96 h-[600px] max-h-[80vh] flex-col shadow-2xl z-50 border-slate-200 animate-in slide-in-from-bottom-4 duration-300">
                    {/* Header */}
                    <div className="bg-slate-900 text-white p-4 flex justify-between items-center rounded-t-xl">
                        <div className="flex items-center space-x-2">
                            <Bot className="w-5 h-5 text-brand-400" />
                            <h3 className="font-semibold">Career Search Assistant</h3>
                        </div>
                        <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 custom-scrollbar">
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                                    msg.role === 'user' 
                                    ? 'bg-brand-600 text-white rounded-br-none' 
                                    : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none shadow-sm'
                                }`}>
                                    <div className="whitespace-pre-wrap">{msg.text}</div>
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="flex justify-start">
                                <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm flex items-center space-x-2">
                                    <Loader2 className="w-4 h-4 text-brand-500 animate-spin" />
                                    <span className="text-sm text-slate-500">Thinking...</span>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="p-3 bg-white border-t border-slate-200 rounded-b-xl">
                        <form 
                            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                            className="flex items-center space-x-2"
                        >
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Ask about your job search..."
                                className="flex-1 px-4 py-2 border border-slate-300 rounded-full focus:outline-none focus:ring-2 focus:ring-brand-500 text-base md:text-sm"
                                disabled={isLoading}
                            />
                            <button 
                                type="submit"
                                disabled={!input.trim() || isLoading}
                                className="w-10 h-10 bg-brand-600 text-white rounded-full flex items-center justify-center hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                            >
                                <Send className="w-4 h-4 ml-0.5" />
                            </button>
                        </form>
                    </div>
                </Card>
            )}
        </>
    );
};
