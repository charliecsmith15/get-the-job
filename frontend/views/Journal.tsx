import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../store';
import { Card, Button, Textarea } from '../components/UI';
import { BookOpen, Plus, Trash2, Mic, MicOff, Save, X, Edit2 } from 'lucide-react';

const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
};

const todayISO = () => new Date().toISOString().split('T')[0];

export const JournalView: React.FC = () => {
    const { journalEntries, addJournalEntry, updateJournalEntry, deleteJournalEntry } = useAppStore();

    const [isAdding, setIsAdding] = useState(false);
    const [draft, setDraft] = useState('');
    const [draftDate, setDraftDate] = useState(todayISO());
    const [isRecording, setIsRecording] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState('');

    const recognitionRef = useRef<any>(null);

    const startRecording = () => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert('Voice input is not supported in this browser. Try Chrome.');
            return;
        }
        const rec = new SpeechRecognition();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = 'en-US';

        let finalTranscript = draft;

        rec.onresult = (event: any) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const t = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += (finalTranscript ? ' ' : '') + t;
                } else {
                    interim = t;
                }
            }
            setDraft(finalTranscript + (interim ? ' ' + interim : ''));
        };

        rec.onend = () => {
            setIsRecording(false);
            setDraft(finalTranscript);
        };

        recognitionRef.current = rec;
        rec.start();
        setIsRecording(true);
    };

    const stopRecording = () => {
        recognitionRef.current?.stop();
        setIsRecording(false);
    };

    const handleSave = () => {
        if (!draft.trim()) return;
        addJournalEntry({ date: draftDate, content: draft.trim() });
        setDraft('');
        setDraftDate(todayISO());
        setIsAdding(false);
    };

    const handleEditSave = (id: string) => {
        updateJournalEntry(id, { content: editContent });
        setEditingId(null);
    };

    const sorted = [...journalEntries].sort((a, b) => b.date.localeCompare(a.date));

    return (
        <div className="max-w-3xl mx-auto crm-enter pb-12">
            <div className="mb-8 flex justify-between items-start">
                <div>
                    <h1 className="text-2xl font-bold text-ink flex items-center">
                        <BookOpen className="w-6 h-6 mr-2 text-wood" />
                        Search Journal
                    </h1>
                    <p className="text-taupe mt-2">
                        Daily notes on your search — used as context by the AI companion.
                    </p>
                </div>
                {!isAdding && (
                    <Button icon={Plus} onClick={() => setIsAdding(true)}>New Entry</Button>
                )}
            </div>

            {isAdding && (
                <Card className="p-6 mb-8 border-wood crm-enter">
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <input
                                type="date"
                                value={draftDate}
                                onChange={e => setDraftDate(e.target.value)}
                                className="px-3 py-1.5 border border-sand rounded-lg bg-paper text-ink text-base md:text-sm crm-focus"
                            />
                            <button
                                onClick={isRecording ? stopRecording : startRecording}
                                className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                    isRecording
                                        ? 'bg-danger text-paper animate-pulse'
                                        : 'bg-sand text-ink hover:bg-wood hover:text-paper'
                                }`}
                            >
                                {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                                <span>{isRecording ? 'Stop Recording' : 'Voice Input'}</span>
                            </button>
                        </div>

                        <Textarea
                            rows={8}
                            placeholder="What happened today with your job search? Any interviews, applications, thoughts, or leads..."
                            value={draft}
                            onChange={e => setDraft(e.target.value)}
                        />

                        <div className="flex justify-end space-x-2 pt-2">
                            <Button variant="ghost" icon={X} onClick={() => { setIsAdding(false); setDraft(''); stopRecording(); }}>
                                Cancel
                            </Button>
                            <Button icon={Save} onClick={handleSave} disabled={!draft.trim()}>
                                Save Entry
                            </Button>
                        </div>
                    </div>
                </Card>
            )}

            <div className="space-y-4">
                {sorted.length === 0 && !isAdding && (
                    <div className="text-center p-16 border-2 border-dashed border-sand rounded-xl text-taupe bg-cream/50">
                        No journal entries yet. Click "New Entry" to start logging your search.
                    </div>
                )}

                {sorted.map(entry => (
                    <Card key={entry.id} className="p-6">
                        {editingId === entry.id ? (
                            <div className="space-y-3">
                                <Textarea
                                    rows={6}
                                    value={editContent}
                                    onChange={e => setEditContent(e.target.value)}
                                />
                                <div className="flex justify-end space-x-2">
                                    <Button variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                                    <Button icon={Save} onClick={() => handleEditSave(entry.id)}>Save</Button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="flex justify-between items-start mb-3">
                                    <p className="text-sm font-semibold text-wood">{formatDate(entry.date)}</p>
                                    <div className="flex space-x-1">
                                        <button
                                            onClick={() => { setEditingId(entry.id); setEditContent(entry.content); }}
                                            className="p-1.5 text-taupe hover:text-ink transition-colors rounded"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => deleteJournalEntry(entry.id)}
                                            className="p-1.5 text-taupe hover:text-danger transition-colors rounded"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                                <p className="text-ink text-sm whitespace-pre-wrap leading-relaxed">{entry.content}</p>
                            </>
                        )}
                    </Card>
                ))}
            </div>
        </div>
    );
};
