import { useState, useEffect } from 'react';
import { requestNotificationPermission } from '../utils/firebase';
import { Bell } from 'lucide-react';

export default function PushNotificationPrompt({ userId }) {
    const [showPrompt, setShowPrompt] = useState(false);
    const [status, setStatus] = useState('idle');

    useEffect(() => {
        // Check if the browser supports notifications
        if (!('Notification' in window)) {
            return;
        }

        // Only show prompt if permission hasn't been granted or denied yet
        if (Notification.permission === 'default') {
            setShowPrompt(true);
        }
    }, []);

    const handleEnable = async () => {
        setStatus('loading');
        // VAPID key from Firebase Console -> Cloud Messaging -> Web Push certificates
        const vapidKey = "BA5TM6V-YUt3bZGdjfLhtEyZqCb3md5tjzHVcPJCwZGIr3uzltyUtHk_HrAKnK4UMqSaq5WagcFlXVYLvA6ts2I";

        const token = await requestNotificationPermission(userId, vapidKey);

        if (token) {
            setShowPrompt(false);
            setStatus('success');
        } else {
            setStatus('error');
            // If they dismissed it, they remain in 'default' state, so we close prompt temporarily
            setShowPrompt(false);
        }
    };

    if (!showPrompt) return null;

    return (
        <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                    background: 'rgba(255, 215, 0, 0.1)',
                    padding: '10px',
                    borderRadius: '50%',
                    color: 'var(--primary)'
                }}>
                    <Bell size={20} />
                </div>
                <div>
                    <h4 style={{ margin: 0, fontSize: '15px', color: '#fff' }}>Enable Notifications</h4>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                        Get instant alerts for new expenses and settlements.
                    </p>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
                <button
                    onClick={() => setShowPrompt(false)}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-secondary)',
                        fontSize: '13px',
                        cursor: 'pointer',
                        padding: '8px 12px'
                    }}
                >
                    Later
                </button>
                <button
                    onClick={handleEnable}
                    disabled={status === 'loading'}
                    style={{
                        background: 'var(--primary)',
                        color: '#000',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '8px 16px',
                        fontSize: '13px',
                        fontWeight: '600',
                        cursor: status === 'loading' ? 'not-allowed' : 'pointer',
                        opacity: status === 'loading' ? 0.7 : 1
                    }}
                >
                    {status === 'loading' ? 'Enabling...' : 'Enable'}
                </button>
            </div>
        </div>
    );
}
