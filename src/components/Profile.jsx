import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { X, LogOut, Mail, User, Globe } from 'lucide-react'
import './Profile.css'
import { validateName } from '../utils/validation'

export default function Profile({ session }) {
    const navigate = useNavigate()
    const [isSaving, setIsSaving] = useState(false)
    const [isSigningOut, setIsSigningOut] = useState(false)
    const { user } = session
    const [fullName, setFullName] = useState(user.user_metadata?.full_name || '')
    // const [upiId, setUpiId] = useState('') // Removed
    // const [originalUpiId, setOriginalUpiId] = useState('') // Removed
    const [country, setCountry] = useState('IND') // Default to India (3-letter ISO)
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
                // Fallback to auth metadata if profile is empty
                if (!loadedCountry && user.user_metadata?.country) {
                    loadedCountry = user.user_metadata.country
                }

                if (loadedCountry) {
                    // Map 2-letter to 3-letter if needed (migration support)
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

        // Validation
        const validationError = validateName(fullName, "Full Name", 50)
        if (validationError) {
            setError(validationError)
            return
        }

        const nameChanged = fullName !== user.user_metadata?.full_name
        const countryChanged = country !== originalCountry

        if (!nameChanged && !countryChanged) return

        setIsSaving(true)
        try {
            // 1. Update public profile (name, country)
            const { error: profileError } = await supabase
                .from('profiles')
                .update({
                    full_name: fullName.trim(),
                    country: country
                })
                .eq('id', user.id)

            if (profileError) throw profileError

            // 2. Update auth metadata (only for name)
            if (nameChanged) {
                const { error: authError } = await supabase.auth.updateUser({
                    data: { full_name: fullName.trim() }
                })
                if (authError) throw authError
            }

            setOriginalCountry(country)
            setMessage('Profile updated successfully!')
            setTimeout(() => setMessage(null), 3000)
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

    return (
        <div className="profile-container">
            <header className="profile-header">
                <button onClick={() => navigate(-1)} className="back-btn">
                    <X size={24} />
                </button>
                <h1>My Profile</h1>
                <div className="placeholder"></div> {/* For spacing alignment */}
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
                                        paddingLeft: '48px' // Make room for the Globe icon
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

                        {/* UPI Section Removed */}
                    </div>

                    {error && <div className="error-message-profile">{error}</div>}
                    {message && <div className="success-message-profile">{message}</div>}

                    <div className="profile-actions">
                        <button
                            className="update-btn"
                            onClick={handleUpdate}
                            disabled={isSaving || isSigningOut || (fullName === user.user_metadata?.full_name && country === originalCountry)}
                        >
                            {isSaving ? 'Saving...' : 'Save Changes'}
                        </button>

                        <button
                            className="sign-out-btn"
                            onClick={handleSignOut}
                            disabled={isSaving || isSigningOut}
                        >
                            <LogOut size={20} />
                            {isSigningOut ? 'Signing Out...' : 'Sign Out'}
                        </button>
                    </div>
                </div>
            </main>
        </div>
    )
}
