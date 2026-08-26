import React, { useState } from 'react';
import { useAppStore } from '../store';
import { Card, Button, Input } from '../components/UI';
import { Globe, Plus, Trash2, ExternalLink, Edit2, X, Check } from 'lucide-react';

export const SourcesView: React.FC = () => {
    const { jobSources, addJobSource, updateJobSource, deleteJobSource } = useAppStore();

    const [isAdding, setIsAdding] = useState(false);
    const [newLabel, setNewLabel] = useState('');
    const [newUrl, setNewUrl] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editLabel, setEditLabel] = useState('');
    const [editUrl, setEditUrl] = useState('');

    const normalizeUrl = (url: string) =>
        url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;

    const handleAdd = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newLabel.trim() || !newUrl.trim()) return;
        addJobSource({ label: newLabel.trim(), url: normalizeUrl(newUrl.trim()) });
        setNewLabel('');
        setNewUrl('');
        setIsAdding(false);
    };

    const startEdit = (source: { id: string; label: string; url: string }) => {
        setEditingId(source.id);
        setEditLabel(source.label);
        setEditUrl(source.url);
    };

    const handleSaveEdit = (id: string) => {
        if (!editLabel.trim() || !editUrl.trim()) return;
        updateJobSource(id, { label: editLabel.trim(), url: normalizeUrl(editUrl.trim()) });
        setEditingId(null);
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-ink flex items-center gap-2">
                        <Globe className="w-6 h-6 text-wood" /> Job Sites
                    </h1>
                    <p className="text-taupe text-sm mt-1">Job sites and boards you're actively using in your search.</p>
                </div>
                {!isAdding && (
                    <Button onClick={() => setIsAdding(true)}>
                        <Plus className="w-4 h-4 mr-2" /> Add Source
                    </Button>
                )}
            </div>

            {isAdding && (
                <Card className="p-5">
                    <form onSubmit={handleAdd} className="space-y-3">
                        <Input
                            placeholder="Label (e.g. LinkedIn)"
                            value={newLabel}
                            onChange={e => setNewLabel(e.target.value)}
                            autoFocus
                        />
                        <Input
                            placeholder="URL (e.g. linkedin.com/jobs)"
                            value={newUrl}
                            onChange={e => setNewUrl(e.target.value)}
                        />
                        <div className="flex gap-2 justify-end">
                            <Button variant="ghost" type="button" onClick={() => { setIsAdding(false); setNewLabel(''); setNewUrl(''); }}>
                                Cancel
                            </Button>
                            <Button type="submit">Save</Button>
                        </div>
                    </form>
                </Card>
            )}

            {jobSources.length === 0 && !isAdding ? (
                <Card className="p-10 text-center">
                    <Globe className="w-10 h-10 text-taupe mx-auto mb-3" />
                    <p className="text-taupe">No sources yet. Add job sites you're using in your search.</p>
                </Card>
            ) : (
                <div className="space-y-3">
                    {jobSources.map(source => (
                        <Card key={source.id} className="p-4">
                            {editingId === source.id ? (
                                <div className="space-y-2">
                                    <Input value={editLabel} onChange={e => setEditLabel(e.target.value)} />
                                    <Input value={editUrl} onChange={e => setEditUrl(e.target.value)} />
                                    <div className="flex gap-2 justify-end">
                                        <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                                            <X className="w-4 h-4" />
                                        </Button>
                                        <Button size="sm" onClick={() => handleSaveEdit(source.id)}>
                                            <Check className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="bg-cream p-2 rounded-lg flex-shrink-0">
                                            <Globe className="w-4 h-4 text-wood" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-medium text-ink">{source.label}</p>
                                            <a
                                                href={source.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-sm text-wood hover:underline flex items-center gap-1 truncate"
                                            >
                                                {source.url} <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                            </a>
                                        </div>
                                    </div>
                                    <div className="flex gap-1 flex-shrink-0">
                                        <Button variant="ghost" size="sm" onClick={() => startEdit(source)}>
                                            <Edit2 className="w-4 h-4" />
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => deleteJobSource(source.id)}>
                                            <Trash2 className="w-4 h-4 text-danger" />
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
};
