
import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { X, Loader2, ArrowRight } from 'lucide-react'
import './CreateGroupModal.css' // Reuse styling

export default function JoinGroupModal({ onClose, onGroupJoined }) {
    const [loading, setLoading] = useState(false)
    const [code, setCode] = useState('')
    const [error, setError] = useState(null)

    const handleJoin = async (e) => {
        e.preventDefault()

        // Prevent API call if code is invalid
        if (!code || !code.trim() || code.includes(' ') || code.length !== 6) {
            return
        }

        setLoading(true)
        setError(null)

        try {
            // Call the RPC function we just created
            const { data, error: rpcError } = await supabase
                .rpc('join_group_by_code', { invite_code_input: code.trim().toUpperCase() })

            if (rpcError) throw rpcError

            onGroupJoined()
            onClose()
        } catch (err) {
            console.error('Error joining group:', err)
            setError(err.message || 'Failed to join group')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="modal-overlay">
            <div className="modal-card">
                <div className="modal-header">
                    <h2>Join Group</h2>
                    <button onClick={onClose} className="close-btn">
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleJoin} className="modal-form">
                    <div className="form-group">
                        <label>Invite Code</label>
                        <input
                            type="text"
                            placeholder="e.g. A1B2C3"
                            value={code}
                            onChange={(e) => setCode(e.target.value.toUpperCase())}
                            autoFocus
                            required
                            maxLength={6}
                            style={{ letterSpacing: '2px', textTransform: 'uppercase' }}
                        />
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                            6 characters, no spaces or special characters
                        </span>
                    </div>

                    {error && <div className="error-message" style={{ color: 'red', marginBottom: '10px' }}>{error}</div>}

                    <button type="submit" disabled={loading || !code.trim() || code.includes(' ') || code.length !== 6} className="create-btn">
                        {loading ? <Loader2 className="spin" /> : 'Join Group'}
                    </button>
                </form>
            </div>
        </div>
    )
}
