import React, { useState, useEffect } from 'react'
import { X, Check, Clock, AlertCircle, Smartphone, HandCoins, Loader2 } from 'lucide-react'
import { supabase } from '../supabaseClient'
import './SettlementDetailsModal.css'

export default function SettlementDetailsModal({ expense, currentUser, members, onClose, onUpdate }) {
    const [loading, setLoading] = useState(true)
    const [updating, setUpdating] = useState(false)
    const [details, setDetails] = useState(null)
    const [receiver, setReceiver] = useState(null) // The actual receiver from expense_splits
    const [utrInput, setUtrInput] = useState('')
    const [showUtrForm, setShowUtrForm] = useState(false)

    // State for cancellation form visibility
    const [showCancelForm, setShowCancelForm] = useState(false)
    const [cancelReason, setCancelReason] = useState('')

    useEffect(() => {
        fetchSettlementDetails()
    }, [expense.id])

    const fetchSettlementDetails = async () => {
        try {
            // Fetch settlement details
            const { data, error } = await supabase
                .from('settlement_details')
                .select('*')
                .eq('expense_id', expense.id)
                .single()

            if (error && error.code !== 'PGRST116') throw error // PGRST116 = no rows found
            setDetails(data)

            // Fetch the receiver from expense_splits
            const { data: splits, error: splitsError } = await supabase
                .from('expense_splits')
                .select('user_id')
                .eq('expense_id', expense.id)
                .limit(1)
                .single()

            if (!splitsError && splits) {
                setReceiver(splits.user_id)
            }
        } catch (error) {
            console.error('Error fetching details:', error)
        } finally {
            setLoading(false)
        }
    }

    const getMemberName = (id) => {
        if (!id) return 'Unknown'
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
            case 'cancelled':
                return <span className="status-badge cancelled" style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca' }}><X size={14} /> Cancelled</span>
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
            // Calculate total pending + current settlement for this debt pair
            const payer = expense.paid_by
            const receiverId = receiver

            // Get all expenses between this payer and receiver
            const { data: allExpenses, error: expError } = await supabase
                .from('expenses')
                .select('id, paid_by, amount')
                .eq('group_id', expense.group_id)

            if (expError) throw expError

            const expenseIds = allExpenses?.map(e => e.id) || []

            // Get all splits
            const { data: allSplits, error: splitsError } = await supabase
                .from('expense_splits')
                .select('expense_id, user_id, owe_amount')
                .in('expense_id', expenseIds)

            if (splitsError) throw splitsError

            // Calculate actual debt: how much payer owes receiver
            let actualDebt = 0

            allExpenses.forEach(exp => {
                if (exp.paid_by === receiverId) {
                    // Receiver paid, check if payer owes
                    const split = allSplits.find(s => s.expense_id === exp.id && s.user_id === payer)
                    if (split) {
                        actualDebt += parseFloat(split.owe_amount)
                    }
                } else if (exp.paid_by === payer) {
                    // Payer paid, check if receiver owes (reduces debt)
                    const split = allSplits.find(s => s.expense_id === exp.id && s.user_id === receiverId)
                    if (split) {
                        actualDebt -= parseFloat(split.owe_amount)
                    }
                }
            })

            // Get all pending/confirmed settlements for this pair
            const { data: settlements, error: settError } = await supabase
                .from('settlement_details')
                .select('expense_id, settlement_status')
                .in('expense_id', expenseIds)
                .in('settlement_status', ['pending_utr', 'pending_confirmation', 'confirmed'])

            if (settError) throw settError

            // Calculate total settlement amount (pending + confirmed)
            let totalSettlements = 0
            settlements?.forEach(s => {
                const settleExp = allExpenses.find(e => e.id === s.expense_id)
                if (settleExp) {
                    totalSettlements += parseFloat(settleExp.amount)
                }
            })

            // Check if confirming this would exceed actual debt
            if (totalSettlements > actualDebt + 0.01) {
                const currency = expense.description?.match(/[A-Z]{3}/)?.[0] || 'INR'
                const excess = totalSettlements - actualDebt

                if (!confirm(
                    `Warning: Confirming this settlement will result in ${currency} ${excess.toFixed(2)} more than you're actually owed (${currency} ${actualDebt.toFixed(2)}).\n\n` +
                    `Total settlements: ${currency} ${totalSettlements.toFixed(2)}\n` +
                    `Actual debt: ${currency} ${actualDebt.toFixed(2)}\n\n` +
                    `Do you still want to continue?`
                )) {
                    setUpdating(false)
                    return
                }
            }

            // Proceed with confirmation
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
            onClose() // Close modal on success
        } catch (error) {
            console.error('Error confirming:', error)
            alert('Failed to confirm: ' + error.message)
        } finally {
            setUpdating(false)
        }
    }

    // Cancel Settlement
    const handleCancel = async () => {
        if (!cancelReason.trim()) return

        setUpdating(true)
        try {
            const { error } = await supabase
                .from('settlement_details')
                .update({
                    settlement_status: 'cancelled',
                    cancellation_reason: cancelReason.trim()
                })
                .eq('expense_id', expense.id)

            if (error) throw error

            await fetchSettlementDetails()
            setShowCancelForm(false)
            onUpdate()
        } catch (error) {
            console.error('Error cancelling:', error)
            alert('Failed to cancel: ' + error.message)
        } finally {
            setUpdating(false)
        }
    }

    // Check permissions - use actual receiver from expense_splits
    const isReceiver = receiver && receiver === currentUser.id
    const isPayer = expense.paid_by === currentUser.id

    // Actions Logic
    const canAddUtr = isPayer && details?.settlement_status === 'pending_utr'
    const canConfirm = isReceiver && details?.settlement_status === 'pending_confirmation'

    // Can cancel if pending
    const canCancel = (isPayer || isReceiver) &&
        (details?.settlement_status === 'pending_utr' || details?.settlement_status === 'pending_confirmation')

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
                    <h2>{showCancelForm ? 'Cancel Settlement' : 'Settlement Details'}</h2>
                    <button onClick={onClose} className="close-btn">
                        <X size={24} />
                    </button>
                </div>

                <div className="settlement-details-content">
                    {/* Show Cancel Form if active, otherwise show Details */}
                    {showCancelForm ? (
                        <div className="utr-form" style={{ borderColor: '#ef4444' }}>
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '12px', textAlign: 'center' }}>
                                Are you sure you want to cancel this settlement? This action cannot be undone.
                            </p>
                            <input
                                type="text"
                                placeholder="Reason (e.g. Wrong amount)"
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                className="utr-input"
                                style={{ borderColor: '#fca5a5' }}
                                autoFocus
                            />
                            <div className="utr-form-actions">
                                <button
                                    onClick={handleCancel}
                                    className="btn-save"
                                    style={{ background: '#ef4444', borderColor: '#ef4444' }}
                                    disabled={updating || !cancelReason.trim()}
                                >
                                    {updating ? <Loader2 className="spin" size={16} /> : 'Confirm Cancel'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
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

                            {/* Cancellation Reason if Cancelled */}
                            {details?.settlement_status === 'cancelled' && details.cancellation_reason && (
                                <div className="detail-row" style={{ alignItems: 'flex-start' }}>
                                    <span className="detail-label">Reason</span>
                                    <span className="detail-value" style={{ color: '#ef4444', fontSize: '0.9rem' }}>
                                        {details.cancellation_reason}
                                    </span>
                                </div>
                            )}

                            {/* Method */}
                            {details && (
                                <div className="detail-row">
                                    <span className="detail-label">Method</span>
                                    <span className="detail-value method">
                                        {getMethodIcon(details.payment_method)}
                                        {details.payment_method === 'upi' ? 'UPI' : 'Manual Settlement'}
                                    </span>
                                </div>
                            )}

                            {/* Initiated By (Payer) */}
                            <div className="detail-row">
                                <span className="detail-label">From</span>
                                <div className="detail-value">
                                    <span className="truncated-name">{getMemberName(expense.paid_by)}</span>
                                    <span className="timestamp">{formatDate(expense.created_at)}</span>
                                </div>
                            </div>

                            {/* To (Receiver) */}
                            {receiver && (
                                <div className="detail-row">
                                    <span className="detail-label">To</span>
                                    <span className="detail-value truncated-name">{getMemberName(receiver)}</span>
                                </div>
                            )}

                            {/* UTR Details */}
                            {details?.utr_reference && (
                                <div className="detail-row">
                                    <span className="detail-label">UTR / Ref</span>
                                    <span className="detail-value utr">{details.utr_reference}</span>
                                </div>
                            )}

                            {/* Confirmed By */}
                            {details?.confirmed_by && (
                                <div className="detail-row">
                                    <span className="detail-label">Confirmed by</span>
                                    <div className="detail-value">
                                        <span className="truncated-name">{getMemberName(details.confirmed_by)}</span>
                                        <span className="timestamp">{formatDate(details.confirmed_at)}</span>
                                    </div>
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

                            {/* UTR Form */}
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

                            {/* Confirm Button (Receiver only) */}
                            {canConfirm && (
                                <button
                                    className="confirm-btn"
                                    onClick={handleConfirm}
                                    disabled={updating}
                                >
                                    {updating ? <Loader2 className="spin" size={18} /> : (
                                        <>
                                            <Check size={18} />
                                            Confirm Received
                                        </>
                                    )}
                                </button>
                            )}

                            {/* Cancel Settlement Button - Visible at bottom */}
                            {canCancel && !showUtrForm && (
                                <button
                                    onClick={() => setShowCancelForm(true)}
                                    className="cancel-settlement-btn"
                                    style={{
                                        marginTop: '12px',
                                        width: '100%',
                                        padding: '10px',
                                        background: 'transparent',
                                        color: '#ef4444',
                                        border: '1px solid #ef4444',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        fontSize: '0.9rem',
                                        fontWeight: '500'
                                    }}
                                >
                                    Cancel Settlement
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
