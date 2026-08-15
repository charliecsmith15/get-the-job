import React, { useEffect, useState } from 'react';

interface Props {
    clientId: string;
    onSignIn: (email: string) => void;
}

export const LoginScreen: React.FC<Props> = ({ clientId, onSignIn }) => {
    const [gisReady, setGisReady] = useState(false);

    useEffect(() => {
        const interval = setInterval(() => {
            if ((window as any).google?.accounts?.id) {
                clearInterval(interval);
                setGisReady(true);
            }
        }, 100);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!gisReady || !clientId) return;
        const g = (window as any).google.accounts.id;
        g.initialize({
            client_id: clientId,
            callback: (response: any) => {
                const payload = JSON.parse(atob(response.credential.split('.')[1]));
                onSignIn(payload.email);
            },
        });
        g.renderButton(document.getElementById('google-signin-btn'), {
            theme: 'outline',
            size: 'large',
            text: 'sign_in_with',
        });
    }, [gisReady, clientId, onSignIn]);

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-cream">
            <div className="crm-card rounded-2xl p-10 flex flex-col items-center max-w-sm w-full mx-4">
                <h1 className="text-2xl font-bold text-ink mb-1">Get the Job</h1>
                <p className="text-taupe text-sm mb-8 text-center">Sign in with your Google account to access your job search hub.</p>
                <div id="google-signin-btn" />
                {!gisReady && <p className="text-taupe text-xs mt-4">Loading...</p>}
            </div>
        </div>
    );
};
