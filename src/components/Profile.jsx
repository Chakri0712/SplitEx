import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { X, LogOut, Mail, User, Smartphone } from 'lucide-react'
import './Profile.css'
import { validateName } from '../utils/validation'

// No changes needed for Profile.jsx regarding "lettering in member icon" as it only uses form inputs. StartLine/EndLine are dummy.
// Check GroupDetails.jsx instead.
export default function Profile({ session }) {
    const navigate = useNavigate()
    const [isSaving, setIsSaving] = useState(false)
    const [isSigningOut, setIsSigningOut] = useState(false)
    const { user } = session
    const [fullName, setFullName] = useState(user.user_metadata?.full_name || '')
    const [upiId, setUpiId] = useState('')
    const [originalUpiId, setOriginalUpiId] = useState('')
    const [email] = useState(user.email)
    const [message, setMessage] = useState(null)
    const [error, setError] = useState(null)

    // Fetch existing UPI ID from profiles table
    useEffect(() => {
        const fetchUpiId = async () => {
            const { data, error } = await supabase
                .from('profiles')
                .select('upi_id')
                .eq('id', user.id)
                .single()

            if (!error && data?.upi_id) {
                setUpiId(data.upi_id)
                setOriginalUpiId(data.upi_id)
            }
        }
        fetchUpiId()
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

        // Basic UPI ID validation (optional field)
        if (upiId && !/^[\w.]+@[\w]+$/.test(upiId.trim())) {
            setError('Invalid UPI ID format (e.g., name@upi or 9876543210@ybl)')
            return
        }

        const nameChanged = fullName !== user.user_metadata?.full_name
        const upiChanged = upiId !== originalUpiId

        if (!nameChanged && !upiChanged) return

        setIsSaving(true)
        try {
            // 1. Update public profile (name and UPI ID)
            const { error: profileError } = await supabase
                .from('profiles')
                .update({
                    full_name: fullName.trim(),
                    upi_id: upiId.trim() || null
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

            setOriginalUpiId(upiId.trim())
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
                            <label>UPI ID</label>
                            <div className={`input-wrapper ${!upiId ? 'missing-upi' : ''}`}>
                                <Smartphone size={20} className="input-icon" />
                                <input
                                    type="text"
                                    value={upiId}
                                    onChange={(e) => setUpiId(e.target.value)}
                                    placeholder="1234567890@upi"
                                    className="profile-input"
                                />
                            </div>
                            <span className="input-helper">Add your UPI ID so others can pay you directly</span>
                        </div>
                    </div>

                    {error && <div className="error-message-profile">{error}</div>}
                    {message && <div className="success-message-profile">{message}</div>}

                    <div className="profile-actions">
                        <button
                            className="update-btn"
                            onClick={handleUpdate}
                            disabled={isSaving || isSigningOut || (fullName === user.user_metadata?.full_name && upiId === originalUpiId)}
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
