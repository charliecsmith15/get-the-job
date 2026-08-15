import React, { useState } from 'react';
import { useAppStore } from '../store';
import { Card, Button, Textarea, Input } from '../components/UI';
import { Settings, Save, Info, BookOpen, Plus, Trash2, HardDrive } from 'lucide-react';

export const PreferencesView: React.FC = () => {
    const { preferences, updatePreferences, contextResources, addContextResource, deleteContextResource } = useAppStore();
    
    // Preferences State
    const [form, setForm] = useState(preferences);
    const [isSaved, setIsSaved] = useState(false);

    // Context Resource State
    const [isAddingContext, setIsAddingContext] = useState(false);
    const [newContext, setNewContext] = useState({ title: '', content: '' });
    const [isImportingFromDrive, setIsImportingFromDrive] = useState(false);

    const importFileFromDrive = async (file: any, accessToken: string) => {
        setIsImportingFromDrive(true);
        try {
            const exportMimeTypes: Record<string, string> = {
                'application/vnd.google-apps.document': 'text/plain',
                'application/vnd.google-apps.spreadsheet': 'text/csv',
            };
            const exportMime = exportMimeTypes[file.mimeType];
            const url = exportMime
                ? `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=${exportMime}`
                : `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
            const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
            if (!response.ok) throw new Error('Failed to fetch file content');
            const content = await response.text();
            addContextResource({ title: file.name, content });
        } catch (err) {
            console.error('Drive import failed:', err);
        } finally {
            setIsImportingFromDrive(false);
        }
    };

    const handleGoogleDriveImport = () => {
        const g = (window as any).google;
        if (!g?.accounts?.oauth2) {
            alert('Google Sign-In is still loading. Please wait a moment and try again.');
            return;
        }
        const tokenClient = g.accounts.oauth2.initTokenClient({
            client_id: process.env.GOOGLE_CLIENT_ID || '',
            scope: 'https://www.googleapis.com/auth/drive.readonly',
            callback: (tokenResponse: any) => {
                if (tokenResponse.error || !tokenResponse.access_token) return;
                (window as any).gapi.load('picker', () => {
                    const picker = new g.picker.PickerBuilder()
                        .addView(new g.picker.DocsView().setIncludeFolders(false))
                        .setOAuthToken(tokenResponse.access_token)
                        .setDeveloperKey(process.env.GOOGLE_API_KEY || '')
                        .setCallback(async (data: any) => {
                            if (data.action === g.picker.Action.PICKED) {
                                await importFileFromDrive(data.docs[0], tokenResponse.access_token);
                            }
                        })
                        .build();
                    picker.setVisible(true);
                });
            },
        });
        tokenClient.requestAccessToken();
    };

    const handleSavePreferences = () => {
        updatePreferences(form);
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 3000);
    };

    const handleAddContext = () => {
        if (newContext.title && newContext.content) {
            addContextResource(newContext);
            setNewContext({ title: '', content: '' });
            setIsAddingContext(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto crm-enter pb-12">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-ink flex items-center">
                    <Settings className="w-6 h-6 mr-2 text-wood" />
                    Preferences & Context
                </h1>
                <p className="text-taupe mt-2">
                    Define what you are looking for. This context is used by the AI to qualify job opportunities and calculate match scores.
                </p>
            </div>

            {/* Core Preferences Section */}
            <Card className="p-6 space-y-6 mb-12">
                <div className="bg-sage-soft text-forest p-4 rounded-lg flex items-start text-sm">
                    <Info className="w-5 h-5 mr-3 flex-shrink-0 mt-0.5" />
                    <p>Paste your completed Petals Exercise below. The AI uses this as its primary context when scoring job matches and answering questions in the companion.</p>
                </div>

                <div className="space-y-4">
                    <Textarea
                        label="Completed Petals Exercise"
                        rows={16}
                        placeholder="Paste your completed Petals Exercise here. This is your single source of truth for what your ideal job looks like — the AI will use this as context when analysing job matches and answering questions."
                        value={form.petalsExercise}
                        onChange={e => setForm({...form, petalsExercise: e.target.value})}
                    />
                </div>

                <div className="pt-4 border-t border-sand flex justify-end items-center space-x-4">
                    {isSaved && <span className="text-sage text-sm font-medium crm-enter">Preferences saved!</span>}
                    <Button icon={Save} onClick={handleSavePreferences}>Save Preferences</Button>
                </div>
            </Card>

            {/* Context Resources Section */}
            <div>
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h2 className="text-xl font-bold text-ink flex items-center">
                            <BookOpen className="w-5 h-5 mr-2 text-wood" />
                            Context Resources
                        </h2>
                        <p className="text-taupe text-sm mt-1">
                            Add free-form notes, documents, or criteria that further define your ideal job.
                        </p>
                    </div>
                    {!isAddingContext && (
                        <div className="flex space-x-2">
                            <Button variant="secondary" icon={HardDrive} onClick={handleGoogleDriveImport} disabled={isImportingFromDrive}>
                                {isImportingFromDrive ? 'Importing...' : 'Import from Drive'}
                            </Button>
                            <Button icon={Plus} onClick={() => setIsAddingContext(true)}>Add Resource</Button>
                        </div>
                    )}
                </div>

                {isAddingContext && (
                    <Card className="p-6 mb-6 border-wood bg-cream crm-enter">
                        <div className="space-y-4">
                            <Input 
                                label="Resource Title" 
                                placeholder="e.g., My Ideal Engineering Culture" 
                                value={newContext.title} 
                                onChange={e => setNewContext({...newContext, title: e.target.value})} 
                            />
                            <Textarea 
                                label="Content" 
                                rows={5} 
                                placeholder="Paste your notes, criteria, or links here..." 
                                value={newContext.content} 
                                onChange={e => setNewContext({...newContext, content: e.target.value})} 
                            />
                            <div className="flex justify-end space-x-2 pt-2">
                                <Button variant="ghost" onClick={() => setIsAddingContext(false)}>Cancel</Button>
                                <Button onClick={handleAddContext} disabled={!newContext.title || !newContext.content}>Save Resource</Button>
                            </div>
                        </div>
                    </Card>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {contextResources.map(resource => (
                        <Card key={resource.id} className="p-5 flex flex-col">
                            <div className="flex justify-between items-start mb-3">
                                <h3 className="font-semibold text-ink">{resource.title}</h3>
                                <button 
                                    onClick={() => { if(confirm('Delete this resource?')) deleteContextResource(resource.id); }} 
                                    className="text-taupe hover:text-danger transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                            <p className="text-sm text-ink whitespace-pre-wrap flex-1 line-clamp-6">
                                {resource.content}
                            </p>
                            <div className="mt-4 pt-3 border-t border-sand text-xs text-taupe">
                                Added {new Date(resource.dateAdded).toLocaleDateString()}
                            </div>
                        </Card>
                    ))}
                    {contextResources.length === 0 && !isAddingContext && (
                        <div className="col-span-full text-center p-12 border-2 border-dashed border-sand rounded-xl text-taupe bg-cream/50">
                            No context resources added yet. Click "Add Resource" to get started.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
