import React, { useMemo } from 'react';
import { useAppStore } from '../store';
import { Card, Button } from '../components/UI';
import { Briefcase, Target, XCircle, Plus, ChevronRight } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis } from 'recharts';

const COLORS = ['#9a8d7a', '#7f927c', '#b7844d', '#31473a', '#9d4c45']; // Saved, Applied, Interviewing, Offer, Rejected

export const Dashboard: React.FC = () => {
    const { jobs, navigate } = useAppStore();

    const appliedCount = useMemo(() => jobs.filter(j => j.status !== 'Saved').length, [jobs]);
    const interviewingCount = useMemo(() => jobs.filter(j => j.status === 'Interviewing').length, [jobs]);
    const rejectedCount = useMemo(() => jobs.filter(j => j.status === 'Rejected').length, [jobs]);
    const interviewPct = appliedCount > 0 ? Math.round((interviewingCount / appliedCount) * 100) : 0;
    const rejectionPct = appliedCount > 0 ? Math.round((rejectedCount / appliedCount) * 100) : 0;

    const statusData = useMemo(() => {
        const counts = { Saved: 0, Applied: 0, Interviewing: 0, Offer: 0, Rejected: 0 };
        jobs.forEach(job => { counts[job.status]++; });
        return Object.entries(counts).map(([name, value]) => ({ name, value })).filter(d => d.value > 0);
    }, [jobs]);

    const recentJobs = useMemo(() => {
        return [...jobs].sort((a, b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime()).slice(0, 5);
    }, [jobs]);

    return (
        <div className="space-y-6 crm-enter">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-ink">Dashboard</h1>
                <Button icon={Plus} onClick={() => navigate('jobs')}>Add New Job</Button>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="p-6 flex items-center space-x-4">
                    <div className="p-3 bg-sage-soft text-forest rounded-lg">
                        <Briefcase className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-taupe">Total Applications</p>
                        <p className="text-2xl font-bold text-ink">{jobs.length}</p>
                    </div>
                </Card>
                <Card className="p-6 flex items-center space-x-4">
                    <div className="p-3 bg-sand text-wood-dark rounded-lg">
                        <Target className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-taupe">Active Interviews</p>
                        <div className="flex items-baseline gap-2">
                            <p className="text-2xl font-bold text-ink">{interviewingCount}</p>
                            <p className="text-sm font-medium text-taupe">{interviewPct}% interview rate</p>
                        </div>
                    </div>
                </Card>
                <Card className="p-6 flex items-center space-x-4">
                    <div className="p-3 bg-cream text-forest-soft rounded-lg border border-sand">
                        <XCircle className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-taupe">Rejections</p>
                        <div className="flex items-baseline gap-2">
                            <p className="text-2xl font-bold text-ink">{rejectedCount}</p>
                            <p className="text-sm font-medium text-taupe">{rejectionPct}% rejection rate</p>
                        </div>
                    </div>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Charts */}
                <Card className="p-6 lg:col-span-2">
                    <h2 className="text-lg font-semibold text-ink mb-4">Application Pipeline</h2>
                    {jobs.length > 0 ? (
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={statusData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={100} stroke="#9a8d7a" />
                                    <Tooltip cursor={{fill: 'rgba(154, 141, 122, 0.1)'}} contentStyle={{borderRadius: '8px', border: '1px solid #e9e0d0', backgroundColor: '#fffdf8', boxShadow: '0 4px 6px -1px rgba(31, 41, 34, 0.1)'}}/>
                                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                        {statusData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[['Saved', 'Applied', 'Interviewing', 'Offer', 'Rejected'].indexOf(entry.name)]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="h-64 flex items-center justify-center text-taupe">No data yet. Add some jobs!</div>
                    )}
                </Card>

                {/* Recent Activity */}
                <Card className="p-6">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-semibold text-ink">Recent Jobs</h2>
                        <button onClick={() => navigate('jobs')} className="text-sm text-wood hover:text-wood-dark font-medium">View All</button>
                    </div>
                    <div className="space-y-4">
                        {recentJobs.length > 0 ? recentJobs.map(job => (
                            <div key={job.id} className="flex items-center justify-between p-3 hover:bg-cream rounded-lg cursor-pointer transition-colors border border-transparent hover:border-sand" onClick={() => navigate('job-detail', job.id)}>
                                <div>
                                    <p className="font-medium text-ink truncate max-w-[150px]">{job.title}</p>
                                    <p className="text-sm text-taupe">{job.company}</p>
                                </div>
                                <ChevronRight className="w-4 h-4 text-taupe" />
                            </div>
                        )) : (
                            <p className="text-sm text-taupe text-center py-4">No recent jobs.</p>
                        )}
                    </div>
                </Card>
            </div>
        </div>
    );
};
