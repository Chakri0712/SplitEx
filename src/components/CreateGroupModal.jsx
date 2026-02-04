
import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { X, Loader2, Check } from 'lucide-react'
import './CreateGroupModal.css'

const CURRENCIES = [
    { code: 'USD', symbol: '$', name: 'US Dollar' },
    { code: 'EUR', symbol: '€', name: 'Euro' },
    { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
    { code: 'GBP', symbol: '£', name: 'British Pound' },
    { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
]

import { validateName } from '../utils/validation'

export default function CreateGroupModal({ userId, onClose, onGroupCreated }) {
    const [loading, setLoading] = useState(false)
    const [name, setName] = useState('')
    const [currency, setCurrency] = useState('USD')
    const [error, setError] = useState(null)

    const handleCreate = async (e) => {
        e.preventDefault()
        setError(null)

        // Validation
        const validationError = validateName(name, "Group Name", 50)
        if (validationError) {
            setError(validationError)
            return
        }

        setLoading(true)
        try {
            // 1. Create the Group
            const { data: group, error: groupError } = await supabase
                .from('groups')
                .insert({
                    name: name.trim(),
                    created_by: userId,
                    currency: currency,
                    invite_code: Math.random().toString(36).substring(2, 8).toUpperCase()
                })
                .select()
                .single()

            if (groupError) throw groupError

            // 2. Add creator as a member
            const { error: memberError } = await supabase
                .from('group_members')
                .insert({
                    group_id: group.id,
                    user_id: userId
                })

            if (memberError) {
                // If member creation fails, try to cleanup the group to avoid orphans
                await supabase.from('groups').delete().eq('id', group.id)
                throw memberError
            }

            onGroupCreated(group)
            onClose()
        } catch (error) {
            console.error('Error creating group:', error)
            alert(`Failed to create group: ${error.message || error.details || JSON.stringify(error)}`)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="modal-overlay">
            <div className="modal-card">
                <div className="modal-header">
                    <h2>New Group</h2>
                    <button onClick={onClose} className="close-btn">
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleCreate} className="modal-form">
                    <div className="form-group">
                        <label>Group Name</label>
                        <input
                            type="text"
                            placeholder="e.g. Vegas Trip"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            autoFocus
                            required
                        />
                        {error && <div className="error-text" style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: '6px' }}>{error}</div>}
                    </div>

                    <div className="form-group">
                        <label>Currency</label>
                        <div className="currency-grid">
                            {CURRENCIES.map((c) => (
                                <button
                                    key={c.code}
                                    type="button"
                                    className={`currency-btn ${currency === c.code ? 'active' : ''}`}
                                    onClick={() => setCurrency(c.code)}
                                >
                                    <span className="symbol">{c.symbol}</span>
                                    <span className="code">{c.code}</span>
                                    {currency === c.code && <Check size={16} className="check-icon" />}
                                </button>
                            ))}
                        </div>
                    </div>

                    <button type="submit" disabled={loading} className="create-btn">
                        {loading ? <Loader2 className="spin" /> : 'Create Group'}
                    </button>
                </form>
            </div>
        </div>
    )
}
