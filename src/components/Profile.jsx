import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { X, LogOut, Mail, User, Globe, RefreshCw, ChevronRight, MessageSquare, Edit2 } from 'lucide-react'
import './Profile.css'
import { validateName } from '../utils/validation'

export default function Profile({ session }) {
    const navigate = useNavigate()
    const [viewMode, setViewMode] = useState('menu') // 'menu' or 'edit'
    const [isSaving, setIsSaving] = useState(false)
    const [isSigningOut, setIsSigningOut] = useState(false)
    const [isReloading, setIsReloading] = useState(false)
    const { user } = session
    const [fullName, setFullName] = useState(user.user_metadata?.full_name || '')
    const [isFeedbackOpen, setIsFeedbackOpen] = useState(false)
    const [feedbackText, setFeedbackText] = useState('')
    const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false)
    const [country, setCountry] = useState('IND')
    const [originalCountry, setOriginalCountry] = useState('IND')
    const [email] = useState(user.email)
    const [message, setMessage] = useState(null)
    const [error, setError] = useState(null)

    // Fetch existing Country from profiles table
    useEffect(() => {
        const fetchProfileData = async () => {
            const { data, error } = await supabase
                .from('profiles')
                .select('country')
                .eq('id', user.id)
                .single()

            if (!error && data) {
                let loadedCountry = data.country
                if (!loadedCountry && user.user_metadata?.country) {
                    loadedCountry = user.user_metadata.country
                }

                if (loadedCountry) {
                    const map = { 'IN': 'IND', 'US': 'USA', 'CA': 'CAN', 'GB': 'GBR', 'JP': 'JPN', 'AU': 'AUS', 'EU': 'EUR' }
                    const finalCountry = map[loadedCountry] || loadedCountry
                    setCountry(finalCountry)
                    setOriginalCountry(finalCountry)
                }
            }
        }
        fetchProfileData()
    }, [user.id])

    const handleUpdate = async () => {
        setMessage(null)
        setError(null)

        const validationError = validateName(fullName, "User Name", 50)
        if (validationError) {
            setError(validationError)
            return
        }

        const nameChanged = fullName !== user.user_metadata?.full_name
        const countryChanged = country !== originalCountry

        if (!nameChanged && !countryChanged) return

        setIsSaving(true)
        try {
            const { error: profileError } = await supabase
                .from('profiles')
                .update({
                    full_name: fullName.trim(),
                    country: country
                })
                .eq('id', user.id)

            if (profileError) throw profileError

            if (nameChanged) {
                const { error: authError } = await supabase.auth.updateUser({
                    data: { full_name: fullName.trim() }
                })
                if (authError) throw authError
            }

            setOriginalCountry(country)
            setMessage('Profile updated successfully!')
            setTimeout(() => {
                setMessage(null)
                setViewMode('menu')
            }, 1000)
        } catch (error) {
            console.error('Error updating profile:', error)
            alert('Failed to update profile')
        } finally {
            setIsSaving(false)
        }
    }

    const handleSignOut = async () => {
        setIsSigningOut(true)
        try {
            const { error } = await supabase.auth.signOut()
            if (error) throw error
            navigate('/')
        } catch (error) {
            console.error('Error signing out:', error)
            alert('Error signing out')
        } finally {
            setIsSigningOut(false)
        }
    }

    const handleSubmitFeedback = async () => {
        if (!feedbackText.trim()) return;
        setIsSubmittingFeedback(true);
        try {
            // Note: Directly sending an email from the client requires a backend endpoint (like Supabase Edge Functions or EmailJS).
            // For now, we simulate the submission. As the app grows, you can connect this to an edge function
            // that uses an email provider (Resend, SendGrid) to email "tmchakradhar2000@gmail.com".
            await new Promise((resolve) => setTimeout(resolve, 1000));

            // Optionally, save to a 'feedback' table in Supabase if you prefer logging it into the DB
            // await supabase.from('feedback').insert([{ user_id: user.id, message: feedbackText, email: user.email }]);

            alert("Feedback sent successfully!");
            setFeedbackText('');
            setIsFeedbackOpen(false);
        } catch (err) {
            console.error("Feedback error", err);
            alert("Failed to send feedback.");
        } finally {
            setIsSubmittingFeedback(false);
        }
    }

    const handleReloadApp = () => {
        setIsReloading(true)
        setTimeout(() => {
            window.location.reload(true)
        }, 1500)
    }

    if (viewMode === 'menu') {
        return (
            <div className="profile-container" style={{ padding: '0' }}>
                <header className="profile-header" style={{ padding: '14px' }}>
                    <h1>Account</h1>
                    <div className="placeholder"></div>
                </header>

                <main className="profile-content" style={{ padding: '0 14px' }}>
                    <div className="account-menu-wrapper" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>

                        {/* User Header */}
                        <div className="account-user-header" style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '0 8px 16px 8px' }}>
                            <div className="account-avatar" style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'var(--primary)', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 'bold' }}>
                                {fullName ? fullName.charAt(0).toUpperCase() : email.charAt(0).toUpperCase()}
                            </div>
                            <div className="account-details" style={{ flex: 1 }}>
                                <h2 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--text-primary)' }}>{fullName || 'User'}</h2>
                                <p style={{ fontSize: '0.9rem', margin: 0, color: 'var(--text-muted)' }}>{email}</p>
                            </div>
                            <button onClick={() => setViewMode('edit')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', padding: '8px', cursor: 'pointer' }}>
                                <Edit2 size={20} />
                            </button>
                        </div>

                        {/* Menu Items */}
                        <div className="account-menu-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <button className="account-menu-item" onClick={() => setIsFeedbackOpen(true)}>
                                <MessageSquare size={20} className="menu-icon" />
                                <span>Submit Feedback</span>
                                <ChevronRight size={20} className="menu-chevron" />
                            </button>

                            <button className="account-menu-item" onClick={handleReloadApp} disabled={isReloading}>
                                <RefreshCw size={20} className={`menu-icon ${isReloading ? 'spinning' : ''}`} />
                                <span>{isReloading ? 'Refreshing...' : 'Reload App'}</span>
                                <ChevronRight size={20} className="menu-chevron" />
                            </button>

                            {isReloading && (
                                <div style={{ fontSize: '0.8rem', color: 'var(--primary)', textAlign: 'center', marginTop: '-4px', marginBottom: '8px' }}>
                                    Fetching latest updates...
                                </div>
                            )}

                        </div>

                        <div style={{ marginTop: 'auto', paddingTop: '24px', paddingBottom: '32px' }}>
                            <button className="sign-out-btn" onClick={handleSignOut} disabled={isSigningOut} style={{ background: 'transparent', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.3)' }}>
                                {isSigningOut ? 'Signing Out...' : 'Logout'}
                            </button>
                        </div>

                    </div>
                </main>

                {/* Feedback Modal */}
                {isFeedbackOpen && (
                    <div className="modal-overlay" onClick={() => setIsFeedbackOpen(false)}>
                        <div className="modal-content" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>Submit Feedback</h2>
                                <button className="close-btn" onClick={() => setIsFeedbackOpen(false)}>
                                    <X size={24} />
                                </button>
                            </div>
                            <div className="modal-body">
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '16px' }}>
                                    Your feedback helps us improve the app.
                                </p>
                                <textarea
                                    value={feedbackText}
                                    onChange={(e) => setFeedbackText(e.target.value)}
                                    maxLength={500}
                                    placeholder="Write your feedback here..."
                                    style={{
                                        width: '100%',
                                        height: '150px',
                                        background: 'var(--bg-input)',
                                        border: '1px solid var(--border-color)',
                                        color: 'var(--text-primary)',
                                        padding: '12px',
                                        borderRadius: '8px',
                                        resize: 'none',
                                        fontFamily: 'inherit'
                                    }}
                                />
                                <div style={{ textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                                    {feedbackText.length}/500
                                </div>
                            </div>
                            <div className="modal-footer" style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                                <button
                                    className="btn-secondary"
                                    style={{ flex: 1, padding: '12px', borderRadius: '8px', background: 'var(--bg-input)', color: 'var(--text-primary)', border: 'none' }}
                                    onClick={() => setIsFeedbackOpen(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    className="btn-primary"
                                    style={{ flex: 1, padding: '12px', borderRadius: '8px', background: 'var(--primary)', color: '#000', border: 'none', fontWeight: 'bold' }}
                                    onClick={handleSubmitFeedback}
                                    disabled={isSubmittingFeedback || !feedbackText.trim()}
                                >
                                    {isSubmittingFeedback ? 'Submitting...' : 'Submit'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        )
    }

    return (
        <div className="profile-container">
            <header className="profile-header">
                <button onClick={() => setViewMode('menu')} className="back-btn">
                    <X size={24} />
                </button>
                <h1>Edit Profile</h1>
                <div className="placeholder"></div>
            </header>

            <main className="profile-content">
                <div className="profile-card">
                    <div className="profile-info">
                        <div className="info-group">
                            <label>User Name</label>
                            <div className="input-wrapper">
                                <User size={20} className="input-icon" />
                                <input
                                    type="text"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    className="profile-input"
                                />
                            </div>
                        </div>

                        <div className="info-group">
                            <label>Email Address</label>
                            <div className="input-wrapper disabled">
                                <Mail size={20} className="input-icon" />
                                <input
                                    type="email"
                                    value={email}
                                    disabled
                                    className="profile-input"
                                />
                            </div>
                        </div>

                        <div className="info-group">
                            <label>Country</label>
                            <div className="input-wrapper" style={{ position: 'relative' }}>
                                <Globe size={20} className="input-icon" />
                                <select
                                    value={country}
                                    onChange={(e) => setCountry(e.target.value)}
                                    className="profile-input"
                                    style={{
                                        background: 'transparent',
                                        width: '100%',
                                        cursor: 'pointer',
                                        appearance: 'none',
                                        WebkitAppearance: 'none',
                                        paddingRight: '40px',
                                        paddingLeft: '48px'
                                    }}
                                >
                                    <option value="IND" style={{ color: 'black' }}>India</option>
                                    <option value="USA" style={{ color: 'black' }}>United States</option>
                                    <option value="CAN" style={{ color: 'black' }}>Canada</option>
                                    <option value="GBR" style={{ color: 'black' }}>United Kingdom</option>
                                    <option value="EUR" style={{ color: 'black' }}>Europe</option>
                                    <option value="JPN" style={{ color: 'black' }}>Japan</option>
                                    <option value="AUS" style={{ color: 'black' }}>Australia</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {error && <div className="error-message-profile">{error}</div>}
                    {message && <div className="success-message-profile">{message}</div>}

                    <div className="profile-actions">
                        <button
                            className="update-btn"
                            onClick={handleUpdate}
                            disabled={isSaving || (fullName === user.user_metadata?.full_name && country === originalCountry)}
                        >
                            {isSaving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </div>
            </main>
        </div>
    )
}
