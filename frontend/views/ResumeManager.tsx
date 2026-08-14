import React, { useState } from 'react';
import { useAppStore } from '../store';
import { Card, Button, Input, Textarea } from '../components/UI';
import { FileText, Plus, Trash2, Save, X, Download } from 'lucide-react';
import { Resume } from '../types';

export const ResumeManager: React.FC = () => {
    const { resumes, addResume, updateResume, deleteResume } = useAppStore();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Partial<Resume>>({});
    const [isAdding, setIsAdding] = useState(false);

    const handleEdit = (resume: Resume) => {
        setEditingId(resume.id);
        setEditForm(resume);
        setIsAdding(false);
    };

    const handleSave = () => {
        if (editingId) {
            updateResume(editingId, editForm);
            setEditingId(null);
        } else if (isAdding) {
            if (editForm.name && editForm.content) {
                addResume(editForm as Omit<Resume, 'id' | 'lastUpdated'>);
                setIsAdding(false);
            }
        }
    };

    const handleCancel = () => {
        setEditingId(null);
        setIsAdding(false);
        setEditForm({});
    };

    const handleExport = (resume: Resume, e: React.MouseEvent) => {
        e.stopPropagation();
        const blob = new Blob([resume.content], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${resume.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="max-w-5xl mx-auto crm-enter duration-500">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-ink">Resume Database</h1>
                    <p className="text-taupe text-sm mt-1">Manage your base resumes to use for AI tailoring.</p>
                </div>
                {!isAdding && !editingId && (
                    <Button icon={Plus} onClick={() => { setIsAdding(true); setEditForm({ name: '', targetRole: '', content: '' }); }}>
                        Add Resume
                    </Button>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* List Column */}
                <div className="lg:col-span-1 space-y-4">
                    {resumes.map(resume => (
                        <Card 
                            key={resume.id} 
                            className={`p-4 cursor-pointer transition-all ${editingId === resume.id ? 'ring-2 ring-wood border-transparent' : 'hover:border-wood'}`}
                            onClick={() => !isAdding && handleEdit(resume)}
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex items-center space-x-3">
                                    <div className="p-2 bg-sage-soft text-forest rounded-lg">
                                        <FileText className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="font-medium text-ink">{resume.name}</h3>
                                        <p className="text-xs text-taupe">{resume.targetRole}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="mt-3 text-xs text-taupe flex justify-between items-center">
                                <span>Updated: {new Date(resume.lastUpdated).toLocaleDateString()}</span>
                                <div className="flex space-x-2">
                                    <button onClick={(e) => handleExport(resume, e)} className="text-taupe hover:text-wood" title="Export as Markdown">
                                        <Download className="w-4 h-4" />
                                    </button>
                                    {editingId !== resume.id && (
                                        <button onClick={(e) => { e.stopPropagation(); if(confirm('Delete?')) deleteResume(resume.id); }} className="text-taupe hover:text-danger" title="Delete">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </Card>
                    ))}
                    {resumes.length === 0 && !isAdding && (
                        <div className="text-center p-8 border-2 border-dashed border-sand rounded-xl text-taupe">
                            No resumes added yet.
                        </div>
                    )}
                </div>

                {/* Editor Column */}
                <div className="lg:col-span-2">
                    {(editingId || isAdding) ? (
                        <Card className="p-6 crm-enter">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-lg font-semibold text-ink">{isAdding ? 'New Resume' : 'Edit Resume'}</h2>
                                <div className="flex space-x-2">
                                    <Button variant="ghost" icon={X} onClick={handleCancel}>Cancel</Button>
                                    <Button icon={Save} onClick={handleSave}>Save</Button>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <Input 
                                        label="Resume Name (e.g., Frontend 2024)" 
                                        value={editForm.name || ''} 
                                        onChange={e => setEditForm({...editForm, name: e.target.value})} 
                                    />
                                    <Input 
                                        label="Target Role" 
                                        value={editForm.targetRole || ''} 
                                        onChange={e => setEditForm({...editForm, targetRole: e.target.value})} 
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-ink mb-1">Resume Content (Markdown/Text)</label>
                                    <p className="text-xs text-taupe mb-2">Paste the text content of your resume here. This is used by the AI to suggest tailoring.</p>
                                    <textarea 
                                        className="w-full px-3 py-2 border border-sand rounded-lg bg-paper text-ink crm-focus font-mono text-sm h-96 crm-scrollbar"
                                        value={editForm.content || ''}
                                        onChange={e => setEditForm({...editForm, content: e.target.value})}
                                    />
                                </div>
                            </div>
                        </Card>
                    ) : (
                        <div className="h-full flex items-center justify-center text-taupe border-2 border-dashed border-sand rounded-xl bg-cream/50">
                            Select a resume to edit or add a new one.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
