import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { X, Loader2, Check, Clock, AlertCircle, Smartphone, HandCoins } from 'lucide-react'
import './SettlementDetailsModal.css'

export default function SettlementDetailsModal({ expense, currentUser, members, onClose, onUpdate }) {
    const [loading, setLoading] = useState(true)
    const [updating, setUpdating] = useState(false)
    const [details, setDetails] = useState(null)
    const [utrInput, setUtrInput] = useState('')
    const [showUtrForm, setShowUtrForm] = useState(false)

    useEffect(() => {
        fetchSettlementDetails()
    }, [expense.id])

    const fetchSettlementDetails = async () => {
        try {
            const { data, error } = await supabase
                .from('settlement_details')
                .select('*')
                .eq('expense_id', expense.id)
                .single()

            if (error && error.code !== 'PGRST116') throw error // PGRST116 = no rows found
            setDetails(data)
        } catch (error) {
            console.error('Error fetching settlement details:', error)
        } finally {
            setLoading(false)
        }
    }

    const getMemberName = (id) => {
        if (id === currentUser.id) return 'You'
        return members.find(m => m.id === id)?.name || 'Unknown'
    }

    const formatDate = (dateStr) => {
        if (!dateStr) return '-'
        return new Date(dateStr).toLocaleString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    const getStatusBadge = (status) => {
        switch (status) {
            case 'confirmed':
                return <span className="status-badge confirmed"><Check size={14} /> Confirmed</span>
            case 'pending_confirmation':
                return <span className="status-badge pending"><Clock size={14} /> Pending Confirmation</span>
            case 'pending_utr':
                return <span className="status-badge pending-utr"><AlertCircle size={14} /> UTR Required</span>
            case 'disputed':
                return <span className="status-badge disputed"><AlertCircle size={14} /> Disputed</span>
            default:
                return <span className="status-badge">{status}</span>
        }
    }

    const getMethodIcon = (method) => {
        return method === 'upi' ? <Smartphone size={16} /> : <HandCoins size={16} />
    }

    // Save UTR
    const handleSaveUtr = async () => {
        if (!utrInput.trim()) return

        setUpdating(true)
        try {
            const { error } = await supabase
                .from('settlement_details')
                .update({
                    utr_reference: utrInput.trim(),
                    settlement_status: 'pending_confirmation'
                })
                .eq('expense_id', expense.id)

            if (error) throw error

            await fetchSettlementDetails()
            setShowUtrForm(false)
            onUpdate()
        } catch (error) {
            console.error('Error saving UTR:', error)
            alert('Failed to save UTR: ' + error.message)
        } finally {
            setUpdating(false)
        }
    }

    // Confirm Settlement (for receiver)
    const handleConfirm = async () => {
        setUpdating(true)
        try {
            const { error } = await supabase
                .from('settlement_details')
                .update({
                    settlement_status: 'confirmed',
                    confirmed_by: currentUser.id,
                    confirmed_at: new Date().toISOString()
                })
                .eq('expense_id', expense.id)

            if (error) throw error

            await fetchSettlementDetails()
            onUpdate()
        } catch (error) {
            console.error('Error confirming settlement:', error)
            alert('Failed to confirm settlement: ' + error.message)
        } finally {
            setUpdating(false)
        }
    }

    // Check if current user is the receiver (the one who should confirm)
    const isReceiver = expense.paid_by !== currentUser.id
    const isPayer = expense.paid_by === currentUser.id

    // Can confirm if: receiver + status is pending_confirmation
    const canConfirm = isReceiver && details?.settlement_status === 'pending_confirmation'

    // Can add UTR if: payer + status is pending_utr
    const canAddUtr = isPayer && details?.settlement_status === 'pending_utr'

    if (loading) {
        return (
            <div className="modal-overlay">
                <div className="modal-card settlement-details-modal">
                    <div className="loading-state">
                        <Loader2 className="spin" size={24} />
                        <span>Loading...</span>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="modal-overlay">
            <div className="modal-card settlement-details-modal">
                <div className="modal-header">
                    <h2>Settlement Details</h2>
                    <button onClick={onClose} className="close-btn">
                        <X size={24} />
                    </button>
                </div>

                <div className="settlement-details-content">
                    {/* Amount */}
                    <div className="detail-row amount-row">
                        <span className="detail-label">Amount</span>
                        <span className="detail-value amount">{expense.amount}</span>
                    </div>

                    {/* Status */}
                    {details && (
                        <div className="detail-row">
                            <span className="detail-label">Status</span>
                            {getStatusBadge(details.settlement_status)}
                        </div>
                    )}

                    {/* Method */}
                    {details && (
                        <div className="detail-row">
                            <span className="detail-label">Method</span>
                            <span className="detail-value method">
                                {getMethodIcon(details.settlement_method)}
                                {details.settlement_method === 'upi' ? 'UPI Payment' : 'Manual Settlement'}
                            </span>
                        </div>
                    )}

                    {/* UTR Reference */}
                    {details?.utr_reference && (
                        <div className="detail-row">
                            <span className="detail-label">UTR/Reference</span>
                            <span className="detail-value utr">{details.utr_reference}</span>
                        </div>
                    )}

                    {/* Initiated By */}
                    {details && (
                        <div className="detail-row">
                            <span className="detail-label">Initiated by</span>
                            <span className="detail-value">
                                {getMemberName(details.initiated_by)}
                                <span className="timestamp">{formatDate(details.initiated_at)}</span>
                            </span>
                        </div>
                    )}

                    {/* Confirmed By */}
                    {details?.confirmed_by && (
                        <div className="detail-row">
                            <span className="detail-label">Confirmed by</span>
                            <span className="detail-value">
                                {getMemberName(details.confirmed_by)}
                                <span className="timestamp">{formatDate(details.confirmed_at)}</span>
                            </span>
                        </div>
                    )}

                    {/* No Details (legacy settlement) */}
                    {!details && (
                        <div className="no-details-msg">
                            This is a legacy settlement without tracking details.
                        </div>
                    )}

                    {/* Action Buttons */}
                    {canAddUtr && !showUtrForm && (
                        <button
                            onClick={() => setShowUtrForm(true)}
                            className="utr-btn"
                        >
                            Add UTR/Reference Number
                        </button>
                    )}

                    {showUtrForm && (
                        <div className="utr-form">
                            <input
                                type="text"
                                placeholder="Enter UTR/Reference number"
                                value={utrInput}
                                onChange={(e) => setUtrInput(e.target.value)}
                                className="utr-input"
                                autoFocus
                            />
                            <div className="utr-form-actions">
                                <button
                                    onClick={() => setShowUtrForm(false)}
                                    className="btn-cancel"
                                    disabled={updating}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveUtr}
                                    className="btn-save"
                                    disabled={updating || !utrInput.trim()}
                                >
                                    {updating ? <Loader2 className="spin" size={16} /> : 'Save'}
                                </button>
                            </div>
                        </div>
                    )}

                    {canConfirm && (
                        <button
                            onClick={handleConfirm}
                            disabled={updating}
                            className="confirm-btn"
                        >
                            {updating ? <Loader2 className="spin" size={16} /> : <Check size={18} />}
                            Confirm Settlement
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
