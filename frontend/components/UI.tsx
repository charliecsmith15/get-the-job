import React from 'react';
import { LucideIcon } from 'lucide-react';

// Renders **bold** markdown as <strong> inline. Preserves line breaks via whitespace-pre-wrap on the parent.
export const renderBold = (text: string | null | undefined): React.ReactNode => {
    if (!text) return text ?? null;
    const parts = text.split(/\*\*(.*?)\*\*/gs);
    return parts.map((part, i) => i % 2 === 1 ? <strong key={i}>{part}</strong> : part);
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
