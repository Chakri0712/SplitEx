
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { X, LogOut, Save, Trash2, Copy, Check, User } from 'lucide-react'
import './CreateGroupModal.css'
import './GroupSettingsModal.css'

import { validateName } from '../utils/validation'

export default function GroupSettingsModal({ group, currentUser, onClose, onGroupUpdated, onGroupLeft }) {
    const [loading, setLoading] = useState(false)
    const [name, setName] = useState(group.name)
    const [currency, setCurrency] = useState(group.currency)
    const [copied, setCopied] = useState(false)
    const [members, setMembers] = useState([])
    const [memberCount, setMemberCount] = useState(0)
    const [error, setError] = useState(null)

    useEffect(() => {
        const fetchMembers = async () => {
            try {
                const { data, error } = await supabase
                    .from('group_members')
                    .select(`
                        joined_at,
                        user_id,
                        profile:user_id ( full_name, avatar_url )
                    `)
                    .eq('group_id', group.id)
                    .order('joined_at', { ascending: true })

                if (!error && data) {
                    setMembers(data)
                    setMemberCount(data.length)
                }
            } catch (err) {
                console.error('Error fetching members:', err)
            }
        }
        fetchMembers()
    }, [group.id])

    const handleCopyCode = () => {
        navigator.clipboard.writeText(group.invite_code)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const handleUpdate = async (e) => {
        e.preventDefault()
        setError(null)

        const validationError = validateName(name, "Group Name", 50)
        if (validationError) {
            setError(validationError)
            return
        }

        if (name.trim() === group.name && currency === group.currency) return

        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('groups')
                .update({ name: name.trim(), currency: currency })
                .eq('id', group.id)
                .select()
                .single()

            if (error) throw error

            onGroupUpdated(data)
            onClose()
        } catch (error) {
            console.error('Error updating group:', error)
            alert('Failed to update group')
        } finally {
            setLoading(false)
        }
    }

    const handleLeaveGroup = async () => {
        setLoading(true)
        try {
            // Calculate user's balance in this group
            const { data: expenses, error: expError } = await supabase
                .from('expenses')
                .select('id, paid_by, amount')
                .eq('group_id', group.id)

            if (expError) throw expError

            const expenseIds = expenses?.map(e => e.id) || []

            const { data: splits, error: splitsError } = await supabase
                .from('expense_splits')
                .select('expense_id, user_id, owe_amount')
                .in('expense_id', expenseIds)

            if (splitsError) throw splitsError

            // Calculate balance: (what they paid) - (what they owe)
            let balance = 0

            expenses?.forEach(exp => {
                if (exp.paid_by === currentUser.id) {
                    balance += parseFloat(exp.amount)
                }
            })

            splits?.forEach(split => {
                if (split.user_id === currentUser.id) {
                    balance -= parseFloat(split.owe_amount)
                }
            })

            // Prevent leaving if they owe money (balance < -0.01 to account for rounding)
            if (balance < -0.01) {
                alert(
                    `You cannot leave this group because you owe ${group.currency} ${Math.abs(balance).toFixed(2)}.\n\n` +
                    `Please settle your debts before leaving the group.`
                )
                setLoading(false)
                return
            }

            if (!confirm('Are you sure you want to leave this group? You will lose access to expense history.')) {
                setLoading(false)
                return
            }

            const { error: deleteError } = await supabase
                .from('group_members')
                .delete()
                .eq('group_id', group.id)
                .eq('user_id', currentUser.id)

            if (deleteError) {
                console.error('DELETE ERROR:', deleteError)
                throw deleteError
            }

            onGroupLeft()
            onClose()
        } catch (error) {
            console.error('Error leaving group:', error)
            alert(`Failed to leave group: ${error.message || JSON.stringify(error)}`)
        } finally {
            setLoading(false)
        }
    }

    const handleDeleteGroup = async () => {
        if (!confirm('Are you sure you want to PERMANENTLY delete this group? This cannot be undone.')) return

        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('groups')
                .delete()
                .eq('id', group.id)
                .select()

            if (error) throw error
            if (!data || data.length === 0) {
                throw new Error('Permission denied. Database policy prevented deletion.')
            }

            onGroupLeft()
            onClose()
        } catch (error) {
            console.error('Error deleting group:', error)
            alert('Failed to delete group')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="modal-overlay">
            <div className="modal-card settings-modal">
                <div className="modal-header">
                    <h2>Group Settings</h2>
                    <button onClick={onClose} className="close-btn">
                        <X size={24} />
                    </button>
                </div>

                <div className="modal-content mt-4">

                    {/* Invite Code Section */}
                    <div className="setting-section invite-section">
                        <label className="section-label">
                            INVITE CODE
                        </label>
                        <div className="invite-row">
                            <div className="code-display">
                                {group.invite_code}
                            </div>
                            <button
                                onClick={handleCopyCode}
                                className={`copy-btn ${copied ? 'copied' : ''}`}
                                title="Copy Code"
                            >
                                {copied ? <Check size={20} /> : <Copy size={20} />}
                            </button>
                        </div>
                        <p className="section-help">
                            Share this code with friends to let them join.
                        </p>
                    </div>

                    {/* Members List Section */}
                    <div className="setting-section members-section">
                        <label className="section-label">
                            MEMBERS ({members.length})
                        </label>
                        <div className="members-list-scroll">
                            {members.map((member) => (
                                <div key={member.user_id} className="member-row">
                                    <div className="member-avatar-placeholder">
                                        <User size={20} className="default-avatar-icon" />
                                    </div>
                                    <div className="member-info">
                                        <span className="member-name">
                                            {member.profile?.full_name || 'Unknown User'}
                                            {member.user_id === currentUser.id && <span className="you-badge">(You)</span>}
                                        </span>
                                        <span className="member-joined">
                                            Joined {new Date(member.joined_at).toLocaleDateString()}
                                        </span>
                                    </div>
                                    {group.created_by === member.user_id && (
                                        <span className="admin-badge">Admin</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <form onSubmit={handleUpdate} className="modal-form">
                        <div className="form-group">
                            <label>Group Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                                disabled={group.created_by !== currentUser.id} // Disable for non-admins
                                className={group.created_by !== currentUser.id ? 'input-disabled' : ''}
                            />
                            {error && <div className="error-text" style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: '6px' }}>{error}</div>}
                        </div>

                        <div className="form-group">
                            <label>Currency</label>
                            <select
                                value={currency}
                                onChange={(e) => setCurrency(e.target.value)}
                                disabled={group.created_by !== currentUser.id && memberCount !== 1}
                                className="currency-select"
                            >
                                <option value="USD">USD - US Dollar</option>
                                <option value="INR">INR - Indian Rupee</option>
                                <option value="EUR">EUR - Euro</option>
                                <option value="GBP">GBP - British Pound</option>
                            </select>
                        </div>

                        {(group.created_by === currentUser.id || memberCount === 1) && (
                            <button
                                type="submit"
                                disabled={loading || (name === group.name && currency === group.currency)}
                                className="save-btn mb-8"
                            >
                                {loading ? <div className="spin"></div> : 'Save Changes'}
                            </button>
                        )}
                    </form>

                    <div className="danger-zone">
                        <button
                            onClick={handleLeaveGroup}
                            disabled={loading}
                            className="leave-btn"
                        >
                            <LogOut size={18} /> Leave Group
                        </button>

                        {/* Show Delete button for Admin OR if only 1 member (themselves) */}
                        {(group.created_by === currentUser.id || memberCount === 1) && (
                            <button
                                onClick={handleDeleteGroup}
                                disabled={loading}
                                style={{
                                    marginTop: '12px',
                                    color: '#ef4444',
                                    background: 'rgba(239, 68, 68, 0.1)',
                                    width: '100%',
                                    padding: '12px',
                                    borderRadius: '10px',
                                    fontWeight: '600',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    border: 'none',
                                    cursor: 'pointer'
                                }}
                            >
                                <Trash2 size={18} /> Delete Group
                            </button>
                        )}
                    </div>

                </div>
            </div>
        </div>
    )
}
