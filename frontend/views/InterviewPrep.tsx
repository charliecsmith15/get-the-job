import React, { useState } from 'react';
import { useAppStore } from '../store';
import { Card, Button, Input, Textarea } from '../components/UI';
import { MessageCircle, Plus, Trash2, Save, X, Edit2, ChevronDown, ChevronUp } from 'lucide-react';

const CATEGORIES = ['General', 'Behavioural', 'Technical', 'Leadership', 'Culture Fit', 'Situational'];

export const InterviewPrepView: React.FC = () => {
    const { interviewQuestions, addInterviewQuestion, updateInterviewQuestion, deleteInterviewQuestion } = useAppStore();

    const [isAdding, setIsAdding] = useState(false);
    const [newQ, setNewQ] = useState({ question: '', response: '', category: 'General' });
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editData, setEditData] = useState({ question: '', response: '', category: 'General' });
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [filterCategory, setFilterCategory] = useState('All');

    const handleAdd = () => {
        if (!newQ.question.trim() || !newQ.response.trim()) return;
        addInterviewQuestion(newQ);
        setNewQ({ question: '', response: '', category: 'General' });
        setIsAdding(false);
    };

    const startEdit = (q: typeof interviewQuestions[0]) => {
        setEditingId(q.id);
        setEditData({ question: q.question, response: q.response, category: q.category });
        setExpandedId(q.id);
    };

    const handleEditSave = (id: string) => {
        updateInterviewQuestion(id, editData);
        setEditingId(null);
    };

    const filtered = filterCategory === 'All'
        ? interviewQuestions
        : interviewQuestions.filter(q => q.category === filterCategory);

    const grouped = CATEGORIES.reduce((acc, cat) => {
        const qs = filtered.filter(q => q.category === cat);
        if (qs.length) acc[cat] = qs;
        return acc;
    }, {} as Record<string, typeof interviewQuestions>);

    return (
        <div className="max-w-3xl mx-auto crm-enter pb-12">
            <div className="mb-8 flex justify-between items-start">
                <div>
                    <h1 className="text-2xl font-bold text-ink flex items-center">
                        <MessageCircle className="w-6 h-6 mr-2 text-wood" />
                        Interview Prep
                    </h1>
                    <p className="text-taupe mt-2">
                        Store your standard questions and answers — the AI companion uses these when coaching you.
                    </p>
                </div>
                {!isAdding && (
                    <Button icon={Plus} onClick={() => setIsAdding(true)}>Add Question</Button>
                )}
            </div>

            {isAdding && (
                <Card className="p-6 mb-8 border-wood crm-enter">
                    <div className="space-y-4">
                        <div className="flex items-center space-x-3">
                            <label className="text-sm font-medium text-ink whitespace-nowrap">Category</label>
                            <select
                                value={newQ.category}
                                onChange={e => setNewQ({ ...newQ, category: e.target.value })}
                                className="px-3 py-1.5 border border-sand rounded-lg bg-paper text-ink text-sm crm-focus"
                            >
                                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                            </select>
                        </div>
                        <Textarea
                            label="Question"
                            rows={2}
                            placeholder="e.g. Tell me about a time you led a difficult project..."
                            value={newQ.question}
                            onChange={e => setNewQ({ ...newQ, question: e.target.value })}
                        />
                        <Textarea
                            label="Your Response"
                            rows={6}
                            placeholder="Write your prepared answer here. Be as detailed as you like — the AI will reference this when coaching you."
                            value={newQ.response}
                            onChange={e => setNewQ({ ...newQ, response: e.target.value })}
                        />
                        <div className="flex justify-end space-x-2 pt-2">
                            <Button variant="ghost" icon={X} onClick={() => { setIsAdding(false); setNewQ({ question: '', response: '', category: 'General' }); }}>
                                Cancel
                            </Button>
                            <Button icon={Save} onClick={handleAdd} disabled={!newQ.question.trim() || !newQ.response.trim()}>
                                Save Question
                            </Button>
                        </div>
                    </div>
                </Card>
            )}

            {/* Category filter */}
            {interviewQuestions.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-6">
                    {['All', ...CATEGORIES].map(cat => (
                        <button
                            key={cat}
                            onClick={() => setFilterCategory(cat)}
                            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                                filterCategory === cat
                                    ? 'bg-wood text-paper'
                                    : 'bg-sand text-taupe hover:bg-forest hover:text-paper'
                            }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            )}

            {filtered.length === 0 && !isAdding && (
                <div className="text-center p-16 border-2 border-dashed border-sand rounded-xl text-taupe bg-cream/50">
                    No questions yet. Click "Add Question" to build your prep library.
                </div>
            )}

            <div className="space-y-6">
                {Object.entries(grouped).map(([category, questions]) => (
                    <div key={category}>
                        <h2 className="text-xs font-semibold text-taupe uppercase tracking-widest mb-3">{category}</h2>
                        <div className="space-y-3">
                            {questions.map(q => (
                                <Card key={q.id} className="overflow-visible">
                                    {editingId === q.id ? (
                                        <div className="p-5 space-y-4">
                                            <div className="flex items-center space-x-3">
                                                <label className="text-sm font-medium text-ink whitespace-nowrap">Category</label>
                                                <select
                                                    value={editData.category}
                                                    onChange={e => setEditData({ ...editData, category: e.target.value })}
                                                    className="px-3 py-1.5 border border-sand rounded-lg bg-paper text-ink text-sm crm-focus"
                                                >
                                                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                                                </select>
                                            </div>
                                            <Textarea
                                                label="Question"
                                                rows={2}
                                                value={editData.question}
                                                onChange={e => setEditData({ ...editData, question: e.target.value })}
                                            />
                                            <Textarea
                                                label="Your Response"
                                                rows={6}
                                                value={editData.response}
                                                onChange={e => setEditData({ ...editData, response: e.target.value })}
                                            />
                                            <div className="flex justify-end space-x-2">
                                                <Button variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                                                <Button icon={Save} onClick={() => handleEditSave(q.id)}>Save</Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div>
                                            <button
                                                className="w-full text-left p-5 flex justify-between items-start"
                                                onClick={() => setExpandedId(expandedId === q.id ? null : q.id)}
                                            >
                                                <p className="text-sm font-semibold text-ink pr-4">{q.question}</p>
                                                <div className="flex items-center space-x-2 flex-shrink-0">
                                                    <button
                                                        onClick={e => { e.stopPropagation(); startEdit(q); }}
                                                        className="p-1.5 text-taupe hover:text-ink transition-colors rounded"
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={e => { e.stopPropagation(); deleteInterviewQuestion(q.id); }}
                                                        className="p-1.5 text-taupe hover:text-danger transition-colors rounded"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                    {expandedId === q.id
                                                        ? <ChevronUp className="w-4 h-4 text-taupe" />
                                                        : <ChevronDown className="w-4 h-4 text-taupe" />
                                                    }
                                                </div>
                                            </button>
                                            {expandedId === q.id && (
                                                <div className="px-5 pb-5 border-t border-sand pt-4 crm-enter">
                                                    <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed">{q.response}</p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </Card>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
