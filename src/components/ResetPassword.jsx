import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { Lock, ArrowRight, Loader2, CheckCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import './Auth.css'
import './ResetPassword.css'

export default function ResetPassword() {
    const navigate = useNavigate()
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(false)
    const [sessionReady, setSessionReady] = useState(false)

    useEffect(() => {
        // Supabase JS v2 automatically parses the #access_token from the URL hash
        // and fires an AUTH_STATE_CHANGE with event 'PASSWORD_RECOVERY'
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'PASSWORD_RECOVERY') {
                setSessionReady(true)
            }
        })

        // Also check if a session already exists (e.g. page refreshed)
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) setSessionReady(true)
        })

        return () => subscription.unsubscribe()
    }, [])

    const handleReset = async (e) => {
        e.preventDefault()
        setError(null)

        if (password !== confirmPassword) {
            setError('Passwords do not match.')
            return
        }
        if (password.length < 6) {
            setError('Password must be at least 6 characters.')
            return
        }

        setLoading(true)
        try {
            const { error } = await supabase.auth.updateUser({ password })
            // Treat "same password" as success — user knows their password, that's fine
            if (error && !error.message.toLowerCase().includes('different')) throw error
            setSuccess(true)
            await supabase.auth.signOut()
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    if (success) {
        return (
            <div className="auth-container">
                <div className="auth-card success-view">
                    <div className="auth-header">
                        <h1>All done!</h1>
                    </div>
                    <div className="success-content">
                        <div className="success-icon-bg">
                            <CheckCircle size={40} className="success-icon-main" />
                        </div>
                        <p className="success-text">Your password has been updated. You can now log in with your new password.</p>
                        <button
                            className="submit-btn full-width"
                            onClick={() => navigate('/auth')}
                        >
                            Go to Login
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    if (!sessionReady) {
        return (
            <div className="auth-container">
                <div className="auth-card">
                    <div className="auth-header">
                        <h1>SplitEx</h1>
                        <p>This link is invalid or has expired.</p>
                    </div>
                    <div className="reset-error-state">
                        <p className="reset-hint">Please request a new password reset link.</p>
                        <button
                            className="submit-btn full-width"
                            onClick={() => navigate('/auth')}
                        >
                            Back to Login
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="auth-container">
            <div className="auth-card">
                <div className="auth-header">
                    <h1>SplitEx</h1>
                    <p>Enter your new password below.</p>
                </div>

                <form onSubmit={handleReset} className="auth-form">
                    <div className="input-group">
                        <Lock size={20} />
                        <input
                            type="password"
                            placeholder="New Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>

                    <div className="input-group">
                        <Lock size={20} />
                        <input
                            type="password"
                            placeholder="Confirm New Password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                        />
                    </div>

                    {error && <div className="error-message">{error}</div>}

                    <button type="submit" disabled={loading} className="submit-btn">
                        {loading ? <Loader2 className="spin" /> : 'Update Password'}
                        {!loading && <ArrowRight size={18} />}
                    </button>
                </form>
            </div>
        </div>
    )
}
