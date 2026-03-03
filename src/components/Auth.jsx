import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { Mail, Lock, User, ArrowRight, Loader2, Eye, EyeOff } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import './Auth.css'

export default function Auth() {
    const location = useLocation()
    const [loading, setLoading] = useState(false)
    const [isLogin, setIsLogin] = useState(true)
    const [isForgotPassword, setIsForgotPassword] = useState(false)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
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
        setIsForgotPassword(false)
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
                // Auto-detect country
                let detectedCountry = 'IND' // Default to India
                try {
                    const response = await fetch('https://ipapi.co/json/')
                    const data = await response.json()
                    // Prefer ISO3 code (IND, USA) to match DB preference
                    if (data.country_code_iso3) {
                        detectedCountry = data.country_code_iso3
                    } else if (data.country_code) {
                        // Fallback mapping if only 2-letter code is available
                        const map = { 'IN': 'IND', 'US': 'USA', 'CA': 'CAN', 'GB': 'GBR', 'JP': 'JPN', 'AU': 'AUS' }
                        detectedCountry = map[data.country_code] || data.country_code
                    }
                } catch (err) {
                    console.warn('Country detection failed, defaulting to IND', err)
                }

                // Check if user already exists
                const { count, error: checkError } = await supabase
                    .from('profiles')
                    .select('*', { count: 'exact', head: true })
                    .eq('email', email)

                if (count > 0) {
                    throw new Error('User already exists. Please login.')
                }

                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        emailRedirectTo: window.location.origin,
                        data: {
                            full_name: fullName,
                            country: detectedCountry,
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

    const handleForgotPassword = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError(null)
        setMessage(null)

        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/reset-password`,
            })
            if (error) throw error
            setMessage('Password reset link has been sent to your email.')
        } catch (error) {
            setError(error.message)
        } finally {
            setLoading(false)
        }
    }

    // Success View for Signup or Forgot Password
    if (message && !error) {
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
                                setIsForgotPassword(false)
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

    // Forgot Password View
    if (isForgotPassword) {
        return (
            <div className="auth-container">
                <div className="auth-card">
                    <div className="auth-header">
                        <h1>SplitEx</h1>
                        <p>Enter your email to reset your password.</p>
                    </div>

                    <form onSubmit={handleForgotPassword} className="auth-form">
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

                        {error && <div className="error-message">{error}</div>}

                        <button type="submit" disabled={loading} className="submit-btn">
                            {loading ? <Loader2 className="spin" /> : 'Send Reset Link'}
                            {!loading && <ArrowRight size={18} />}
                        </button>
                    </form>

                    <button
                        className="forgot-link"
                        onClick={() => {
                            setIsForgotPassword(false)
                            setError(null)
                            setEmail('')
                        }}
                    >
                        ← Back to Login
                    </button>
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
                                placeholder="User Name"
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
                            type={showPassword ? 'text' : 'password'}
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                        <button
                            type="button"
                            className="password-toggle-btn"
                            onClick={() => setShowPassword(!showPassword)}
                            aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                        </button>
                    </div>

                    {error && <div className="error-message">{error}</div>}

                    {isLogin && (
                        <button
                            type="button"
                            className="forgot-link"
                            onClick={() => {
                                setIsForgotPassword(true)
                                setError(null)
                                setPassword('')
                            }}
                        >
                            Forgot Password? Reset here
                        </button>
                    )}

                    <button type="submit" disabled={loading} className="submit-btn">
                        {loading ? <Loader2 className="spin" /> : (isLogin ? 'Login' : 'Sign Up')}
                        {!loading && <ArrowRight size={18} />}
                    </button>
                </form>
            </div>
        </div>
    )
}
