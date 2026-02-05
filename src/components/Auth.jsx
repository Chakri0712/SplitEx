import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { Mail, Lock, User, ArrowRight, Loader2 } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import './Auth.css'

export default function Auth() {
    const location = useLocation()
    const [loading, setLoading] = useState(false)
    const [isLogin, setIsLogin] = useState(true)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [fullName, setFullName] = useState('')
    const [message, setMessage] = useState(null)
    const [error, setError] = useState(null)

    useEffect(() => {
        if (location.state?.mode === 'signup') {
            setIsLogin(false)
        }
    }, [location.state])

    // Clear form when switching modes
    useEffect(() => {
        setEmail('')
        setPassword('')
        setFullName('')
        setError(null)
        setMessage(null)
    }, [isLogin])

    const handleAuth = async (e) => {
        e.preventDefault()
        setLoading(true)
        setMessage(null)
        setError(null)

        try {
            if (isLogin) {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                })
                if (error) throw error
            } else {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        emailRedirectTo: window.location.origin,
                        data: {
                            full_name: fullName,
                            // avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=random`, // Removed to use generic icon
                        },
                    },
                })
                if (error) throw error
                // Show success view
                setMessage('Confirmation link has been sent to your registered email.')
                return // Exit early to keep message state for conditional render
            }
        } catch (error) {
            setError(error.message)
        } finally {
            setLoading(false)
        }
    }

    // Success View for Signup
    if (message && !isLogin && !error) {
        return (
            <div className="auth-container">
                <div className="auth-card success-view">
                    <div className="auth-header">
                        <h1>Check your inbox</h1>
                    </div>
                    <div className="success-content">
                        <div className="success-icon-bg">
                            <Mail size={40} className="success-icon-main" />
                        </div>
                        <p className="success-text">{message}</p>
                        <button
                            className="submit-btn full-width"
                            onClick={() => {
                                setMessage(null)
                                setIsLogin(true)
                            }}
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
                    <p>Split bills the easy way.</p>
                </div>

                <div className="auth-tabs">
                    <button
                        className={isLogin ? 'active' : ''}
                        onClick={() => setIsLogin(true)}
                    >
                        Login
                    </button>
                    <button
                        className={!isLogin ? 'active' : ''}
                        onClick={() => setIsLogin(false)}
                    >
                        Sign Up
                    </button>
                </div>

                <form onSubmit={handleAuth} className="auth-form">
                    {!isLogin && (
                        <div className="input-group">
                            <User size={20} />
                            <input
                                type="text"
                                placeholder="Full Name"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                required={!isLogin}
                            />
                        </div>
                    )}

                    <div className="input-group">
                        <Mail size={20} />
                        <input
                            type="email"
                            placeholder="Email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>

                    <div className="input-group">
                        <Lock size={20} />
                        <input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>

                    {error && <div className="error-message">{error}</div>}

                    <button type="submit" disabled={loading} className="submit-btn">
                        {loading ? <Loader2 className="spin" /> : (isLogin ? 'Login' : 'Sign Up')}
                        {!loading && <ArrowRight size={18} />}
                    </button>
                </form>
            </div>
        </div>
    )
}
