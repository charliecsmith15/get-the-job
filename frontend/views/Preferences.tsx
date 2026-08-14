import React, { useState } from 'react';
import { useAppStore } from '../store';
import { Card, Button, Input, Textarea } from '../components/UI';
import { Settings, Save, Info, BookOpen, Plus, Trash2 } from 'lucide-react';

export const PreferencesView: React.FC = () => {
    const { preferences, updatePreferences, contextResources, addContextResource, deleteContextResource } = useAppStore();
    
    // Preferences State
    const [form, setForm] = useState(preferences);
    const [isSaved, setIsSaved] = useState(false);

    // Context Resource State
    const [isAddingContext, setIsAddingContext] = useState(false);
    const [newContext, setNewContext] = useState({ title: '', content: '' });

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
                    <p>Be as specific as possible. The more detail you provide, the better the AI can analyze job descriptions against your goals.</p>
                </div>

                <div className="space-y-4">
                    <Input 
                        label="Desired Roles" 
                        placeholder="e.g., Senior Frontend Engineer, React Developer"
                        value={form.desiredRoles}
                        onChange={e => setForm({...form, desiredRoles: e.target.value})}
                    />
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input 
                            label="Preferred Locations / Setup" 
                            placeholder="e.g., Remote only, Hybrid in NYC"
                            value={form.locations}
                            onChange={e => setForm({...form, locations: e.target.value})}
                        />
                        <Input 
                            label="Salary Expectations" 
                            placeholder="e.g., $150k base + equity"
                            value={form.salaryExpectation}
                            onChange={e => setForm({...form, salaryExpectation: e.target.value})}
                        />
                    </div>

                    <Textarea 
                        label="Dealbreakers (Red Flags)" 
                        rows={3}
                        placeholder="e.g., Mandatory 5 days in office, legacy tech stack, poor work-life balance..."
                        value={form.dealbreakers}
                        onChange={e => setForm({...form, dealbreakers: e.target.value})}
                    />

                    <Textarea 
                        label="Ideal Company Culture & Environment" 
                        rows={4}
                        placeholder="e.g., Collaborative team, strong engineering practices (CI/CD, testing), values mentorship..."
                        value={form.idealCulture}
                        onChange={e => setForm({...form, idealCulture: e.target.value})}
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
                        <Button icon={Plus} onClick={() => setIsAddingContext(true)}>Add Resource</Button>
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
