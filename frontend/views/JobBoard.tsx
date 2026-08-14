import React, { useState } from 'react';
import { useAppStore } from '../store';
import { JobStatus, Job } from '../types';
import { Card, Button, Badge, Input } from '../components/UI';
import { Plus, ExternalLink, Search, MapPin, Calendar, ChevronRight } from 'lucide-react';

const COLUMNS: JobStatus[] = ['Saved', 'Applied', 'Interviewing', 'Offer', 'Rejected'];

export const JobBoard: React.FC = () => {
    const { jobs, addJob, updateJob, navigate } = useAppStore();
    const [isAdding, setIsAdding] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [newJob, setNewJob] = useState<Partial<Job>>({ title: '', company: '', status: 'Saved', url: '', description: '' });

    const handleAddJob = (e: React.FormEvent) => {
        e.preventDefault();
        if (newJob.title && newJob.company) {
            addJob(newJob as Omit<Job, 'id' | 'dateAdded'>);
            setIsAdding(false);
            setNewJob({ title: '', company: '', status: 'Saved', url: '', description: '' });
        }
    };

    const filteredJobs = jobs.filter(job =>
        job.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        job.company.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getStatusColor = (status: JobStatus) => {
        switch (status) {
            case 'Saved': return 'gray';
            case 'Applied': return 'blue';
            case 'Interviewing': return 'yellow';
            case 'Offer': return 'green';
            case 'Rejected': return 'red';
            default: return 'gray';
        }
    };

    const AddJobForm = () => (
        <Card className="mb-4 p-4 border-wood bg-cream crm-enter">
            <form onSubmit={handleAddJob} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input label="Job Title *" required value={newJob.title} onChange={e => setNewJob({ ...newJob, title: e.target.value })} />
                    <Input label="Company *" required value={newJob.company} onChange={e => setNewJob({ ...newJob, company: e.target.value })} />
                    <Input label="URL" type="url" value={newJob.url} onChange={e => setNewJob({ ...newJob, url: e.target.value })} />
                    <div>
                        <label className="block text-sm font-medium text-ink mb-1">Initial Status</label>
                        <select
                            className="w-full px-3 py-2 border border-sand rounded-lg bg-paper text-ink crm-focus text-sm"
                            value={newJob.status}
                            onChange={e => setNewJob({ ...newJob, status: e.target.value as JobStatus })}
                        >
                            {COLUMNS.map(col => <option key={col} value={col}>{col}</option>)}
                        </select>
                    </div>
                </div>
                <div className="flex justify-end space-x-2">
                    <Button variant="ghost" type="button" onClick={() => setIsAdding(false)}>Cancel</Button>
                    <Button type="submit">Save Job</Button>
                </div>
            </form>
        </Card>
    );

    return (
        <div className="h-full flex flex-col crm-enter">

            {/* ── Mobile header ── */}
            <div className="md:hidden mb-4 space-y-3">
                <div className="flex justify-between items-center">
                    <h1 className="text-xl font-bold text-ink">Job Board</h1>
                    <Button icon={Plus} onClick={() => setIsAdding(true)}>Add Job</Button>
                </div>
                <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-taupe" />
                    <input
                        type="text"
                        placeholder="Search jobs..."
                        className="w-full pl-9 pr-4 py-2.5 border border-sand rounded-lg bg-paper text-ink crm-focus text-sm"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* ── Desktop header ── */}
            <div className="hidden md:flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-ink">Job Board</h1>
                <div className="flex space-x-4">
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-taupe" />
                        <input
                            type="text"
                            placeholder="Search jobs..."
                            className="pl-9 pr-4 py-2 border border-sand rounded-lg bg-paper text-ink crm-focus text-sm"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Button icon={Plus} onClick={() => setIsAdding(true)}>Add Job</Button>
                </div>
            </div>

            {isAdding && <AddJobForm />}

            {/* ── Mobile: flat list view ── */}
            <div className="md:hidden flex-1 overflow-y-auto space-y-3">
                {filteredJobs.length === 0 ? (
                    <div className="text-center p-12 border-2 border-dashed border-sand rounded-xl text-taupe bg-cream/50">
                        No jobs yet. Tap "Add Job" to get started.
                    </div>
                ) : (
                    [...filteredJobs]
                        .sort((a, b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime())
                        .map(job => (
                            <Card
                                key={job.id}
                                className="p-4 cursor-pointer active:opacity-80 transition-opacity"
                                onClick={() => navigate('job-detail', job.id)}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-2 mb-1">
                                            <h4 className="font-semibold text-ink leading-tight">{job.title}</h4>
                                            {job.matchScore && (
                                                <span className={`flex-shrink-0 text-xs font-bold px-1.5 py-0.5 rounded ${job.matchScore > 80 ? 'bg-sage text-paper' : job.matchScore > 50 ? 'bg-wood text-paper' : 'bg-danger text-paper'}`}>
                                                    {job.matchScore}%
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-taupe">{job.company}</p>
                                        <div className="flex items-center gap-3 mt-2">
                                            <Badge color={getStatusColor(job.status)}>{job.status}</Badge>
                                            {job.location && (
                                                <span className="text-xs text-taupe flex items-center">
                                                    <MapPin className="w-3 h-3 mr-0.5" />{job.location}
                                                </span>
                                            )}
                                        </div>
                                        {job.dateApplied && (
                                            <p className="text-xs text-taupe flex items-center mt-1.5">
                                                <Calendar className="w-3 h-3 mr-1" />Applied {new Date(job.dateApplied).toLocaleDateString()}
                                            </p>
                                        )}
                                    </div>
                                    <ChevronRight className="w-5 h-5 text-taupe flex-shrink-0 mt-0.5" />
                                </div>
                            </Card>
                        ))
                )}
            </div>

            {/* ── Desktop: kanban view ── */}
            <div className="hidden md:block flex-1 overflow-x-auto pb-4">
                <div className="flex space-x-4 min-w-max h-full">
                    {COLUMNS.map(column => (
                        <div key={column} className="w-80 flex flex-col bg-cream/60 rounded-xl p-3 border border-sand">
                            <div className="flex justify-between items-center mb-3 px-1">
                                <h3 className="font-semibold text-ink">{column}</h3>
                                <Badge color={getStatusColor(column)}>{filteredJobs.filter(j => j.status === column).length}</Badge>
                            </div>
                            <div className="flex-1 overflow-y-auto space-y-3 pr-1 crm-scrollbar">
                                {filteredJobs.filter(job => job.status === column).map(job => (
                                    <Card key={job.id} className="p-4 cursor-pointer group crm-card-hover">
                                        <div onClick={() => navigate('job-detail', job.id)}>
                                            <div className="flex justify-between items-start mb-2">
                                                <h4 className="font-medium text-ink leading-tight">{job.title}</h4>
                                                {job.matchScore && (
                                                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${job.matchScore > 80 ? 'bg-sage text-paper' : job.matchScore > 50 ? 'bg-wood text-paper' : 'bg-danger text-paper'}`}>
                                                        {job.matchScore}%
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-sm text-taupe mb-2">{job.company}</p>
                                            {job.location && (
                                                <p className="text-xs text-taupe flex items-center mt-1">
                                                    <MapPin className="w-3 h-3 mr-1" />{job.location}
                                                </p>
                                            )}
                                            {job.dateApplied && (
                                                <p className="text-xs text-taupe flex items-center mt-1">
                                                    <Calendar className="w-3 h-3 mr-1" />Applied: {new Date(job.dateApplied).toLocaleDateString()}
                                                </p>
                                            )}
                                            {job.tags && job.tags.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mt-3">
                                                    {job.tags.slice(0, 3).map(tag => (
                                                        <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-sand/50 text-ink rounded-md">{tag}</span>
                                                    ))}
                                                    {job.tags.length > 3 && <span className="text-[10px] px-1.5 py-0.5 text-taupe">+{job.tags.length - 3}</span>}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex justify-between items-center mt-3 pt-3 border-t border-sand">
                                            <select
                                                className="text-xs bg-transparent text-taupe hover:text-ink focus:outline-none cursor-pointer"
                                                value={job.status}
                                                onChange={e => updateJob(job.id, { status: e.target.value as JobStatus })}
                                                onClick={e => e.stopPropagation()}
                                            >
                                                {COLUMNS.map(col => <option key={col} value={col}>Move to {col}</option>)}
                                            </select>
                                            {job.url && (
                                                <a href={job.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-taupe hover:text-wood">
                                                    <ExternalLink className="w-4 h-4" />
                                                </a>
                                            )}
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
