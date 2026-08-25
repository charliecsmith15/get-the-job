import React from 'react';
import { LucideIcon } from 'lucide-react';

export const renderBold = (text: string | null | undefined): React.ReactNode => {
    if (!text) return text ?? null;
    const parts = text.split(/\*\*(.*?)\*\*/gs);
    return parts.map((part, i) => i % 2 === 1 ? <strong key={i}>{part}</strong> : part);
};

// Renders a markdown string into React nodes, handling headers, lists, bold, and paragraphs.
export const renderMarkdown = (text: string | null | undefined): React.ReactNode => {
    if (!text) return null;

    const inline = (line: string, key: number): React.ReactNode => {
        const parts = line.split(/\*\*(.*?)\*\*/g);
        return <React.Fragment key={key}>{parts.map((p, i) => i % 2 === 1 ? <strong key={i}>{p}</strong> : p)}</React.Fragment>;
    };

    const elements: React.ReactNode[] = [];
    let listItems: React.ReactNode[] = [];
    let listType: 'ul' | 'ol' = 'ul';
    let k = 0;

    const flushList = () => {
        if (!listItems.length) return;
        const Tag = listType;
        const cls = listType === 'ul' ? 'list-disc pl-5 space-y-1' : 'list-decimal pl-5 space-y-1';
        elements.push(<Tag key={k++} className={cls}>{listItems}</Tag>);
        listItems = [];
    };

    for (const raw of text.split('\n')) {
        const line = raw.trimEnd();
        if (/^### /.test(line)) {
            flushList();
            elements.push(<p key={k++} className="text-xs font-bold uppercase tracking-wide text-taupe mt-3 mb-0.5">{line.slice(4)}</p>);
        } else if (/^## /.test(line)) {
            flushList();
            elements.push(<p key={k++} className="text-sm font-semibold text-ink mt-3 mb-0.5">{line.slice(3)}</p>);
        } else if (/^# /.test(line)) {
            flushList();
            elements.push(<p key={k++} className="text-sm font-bold text-ink mt-3 mb-0.5">{line.slice(2)}</p>);
        } else if (/^[-*] /.test(line)) {
            if (listType !== 'ul' && listItems.length) flushList();
            listType = 'ul';
            listItems.push(<li key={k++} className="text-sm text-ink">{inline(line.slice(2), k++)}</li>);
        } else if (/^\d+\. /.test(line)) {
            if (listType !== 'ol' && listItems.length) flushList();
            listType = 'ol';
            listItems.push(<li key={k++} className="text-sm text-ink">{inline(line.replace(/^\d+\. /, ''), k++)}</li>);
        } else if (line.trim() === '') {
            flushList();
        } else {
            flushList();
            elements.push(<p key={k++} className="text-sm text-ink">{inline(line, k++)}</p>);
        }
    }
    flushList();
    return <div className="space-y-1">{elements}</div>;
};

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode; className?: string }> = ({ children, className = '', ...props }) => (
    <div className={`crm-card rounded-xl overflow-hidden ${className}`} {...props}>
        {children}
    </div>
);

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost', icon?: LucideIcon }> = ({ children, variant = 'primary', icon: Icon, className = '', ...props }) => {
    const baseStyle = "inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";
    const variants = {
        primary: "bg-wood text-paper hover:bg-wood-dark focus:ring-wood",
        secondary: "bg-paper text-ink border border-sand hover:bg-cream focus:ring-wood",
        danger: "bg-danger text-paper hover:opacity-90 focus:ring-danger",
        ghost: "bg-transparent text-taupe hover:bg-sand hover:text-ink focus:ring-taupe"
    };

    return (
        <button className={`${baseStyle} ${variants[variant]} ${className}`} {...props}>
            {Icon && <Icon className={`w-4 h-4 ${children ? 'mr-2' : ''}`} />}
            {children}
        </button>
    );
};

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label?: string }> = ({ label, className = '', ...props }) => (
    <div className="w-full">
        {label && <label className="block text-sm font-medium text-ink mb-1">{label}</label>}
        <input
            className={`w-full px-3 py-2 border border-sand rounded-lg bg-paper text-ink crm-focus sm:text-sm ${className}`}
            {...props}
        />
    </div>
);

export const Textarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }> = ({ label, className = '', ...props }) => (
    <div className="w-full">
        {label && <label className="block text-sm font-medium text-ink mb-1">{label}</label>}
        <textarea
            className={`w-full px-3 py-2 border border-sand rounded-lg bg-paper text-ink crm-focus sm:text-sm ${className}`}
            {...props}
        />
    </div>
);

export const Badge: React.FC<{ children: React.ReactNode; color?: 'blue' | 'green' | 'yellow' | 'red' | 'gray' }> = ({ children, color = 'gray' }) => {
    const colors = {
        blue: 'bg-sage-soft text-forest',
        green: 'bg-sage text-paper',
        yellow: 'bg-wood text-paper',
        red: 'bg-danger text-paper',
        gray: 'bg-sand text-ink'
    };
    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[color]}`}>
            {children}
        </span>
    );
};
