import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { X, Loader2, ArrowRight, Trash2, Smartphone, HandCoins } from 'lucide-react'
import './SettleUpModal.css'

// export default function SettleUpModal({ group, currentUser, onClose, onPaymentRecorded, expenseToEdit = null, onDelete }) {
export default function SettleUpModal({ group, currentUser, members, onClose, onPaymentRecorded, expenseToEdit = null, onDelete }) {
    const [loading, setLoading] = useState(false)
    // const [members, setMembers] = useState([]) // removing local state
    const [debts, setDebts] = useState({}) // { [payerId]: { [receiverId]: amount } }

    // Form State
    const [payer, setPayer] = useState(currentUser.id)
    const [receiver, setReceiver] = useState('')
    const [amount, setAmount] = useState('')

    // Settlement Flow State
    const [showUtrPrompt, setShowUtrPrompt] = useState(false)
    const [utrReference, setUtrReference] = useState('')
    const [pendingExpenseId, setPendingExpenseId] = useState(null)

    useEffect(() => {
        // fetchMembers() // removing call
        fetchDebts()
    }, [])

    // ...

    // const fetchMembers = async () => { ... } // Removed

    const fetchDebts = async () => {
        const { data: expenses } = await supabase
            .from('expenses')
            .select('id, paid_by, amount')
            .eq('group_id', group.id)

        if (!expenses || expenses.length === 0) return

        const expenseIds = expenses.map(e => e.id)
        const { data: splits } = await supabase
            .from('expense_splits')
            .select('expense_id, user_id, owe_amount')
            .in('expense_id', expenseIds)

        if (!splits) return

        const netBalances = {}
        splits.forEach(split => {
            const expense = expenses.find(e => e.id === split.expense_id)
            if (!expense) return
            const payerId = expense.paid_by
            const debtorId = split.user_id
            const amt = parseFloat(split.owe_amount)
            if (payerId === debtorId) return

            // Debtor owes Payer
            if (!netBalances[debtorId]) netBalances[debtorId] = {}
            if (!netBalances[debtorId][payerId]) netBalances[debtorId][payerId] = 0
            netBalances[debtorId][payerId] += amt

            // Symmetry
            if (!netBalances[payerId]) netBalances[payerId] = {}
            if (!netBalances[payerId][debtorId]) netBalances[payerId][debtorId] = 0
            netBalances[payerId][debtorId] -= amt
        })
        setDebts(netBalances)
    }

    // Load Expense Data for Editing
    useEffect(() => {
        if (expenseToEdit) {
            setPayer(expenseToEdit.paid_by)
            setAmount(expenseToEdit.amount) // Ensure amount is set
            // Fetch the receiver (who owes 100% of this split)
            fetchReceiver(expenseToEdit.id)
        }
    }, [expenseToEdit])

    const fetchReceiver = async (expenseId) => {
        const { data } = await supabase
            .from('expense_splits')
            .select('user_id')
            .eq('expense_id', expenseId)
            .limit(1)
            .single()

        if (data) {
            setReceiver(data.user_id)
        }
    }

    // Filter Receivers safely
    const availableReceivers = useMemo(() => {
        return members.filter(m => {
            if (m.id === payer) return false // Prevent self

            // In Edit Mode, allow everyone (except self) to prevent locking out historic data
            if (expenseToEdit) return true

            // Smart Filter: Only show if Payer owes this person > 0
            const payerDebts = debts[payer] || {}
            return (payerDebts[m.id] || 0) > 0.01
        })
    }, [members, payer, debts, expenseToEdit])

    // Handle Payer Change - Reset Receiver to avoid invalid state
    const handlePayerChange = (newPayer) => {
        setPayer(newPayer)
        setReceiver('') // Reset receiver to force user to choose again from valid list
    }

    // Auto-select receiver only if currently blank and there is exactly 1 option (UX enhancement)
    // Or just default to first available to be helpful
    useEffect(() => {
        if (!expenseToEdit && !receiver && availableReceivers.length > 0) {
            setReceiver(availableReceivers[0].id)
        }
    }, [availableReceivers, receiver, expenseToEdit])

    // Create Settlement Record (shared logic)
    const createSettlementRecord = async (method) => {
        const receiverName = members.find(m => m.id === receiver)?.name || 'Someone'
        const description = `Settlement to ${receiverName}`

        const { data: expense, error: expenseError } = await supabase
            .from('expenses')
            .insert({
                group_id: group.id,
                paid_by: payer,
                amount: parseFloat(amount),
                description: description,
                category: 'settlement',
                date: new Date().toISOString()
            })
            .select()
            .single()

        if (expenseError) throw expenseError

        const { error: splitError } = await supabase
            .from('expense_splits')
            .insert({
                expense_id: expense.id,
                user_id: receiver,
                owe_amount: parseFloat(amount)
            })

        if (splitError) throw splitError

        return expense.id
    }

    // Insert Settlement Details
    const insertSettlementDetails = async (expenseId, method, status, utr = null) => {
        const { error } = await supabase
            .from('settlement_details')
            .insert({
                expense_id: expenseId,
                settlement_method: method,
                settlement_status: status,
                utr_reference: utr,
                initiated_by: currentUser.id
            })

        if (error) throw error
    }

    // Get max amount user can settle (amount owed to receiver)
    const getMaxSettleAmount = () => {
        if (!payer || !receiver) return Infinity
        const payerDebts = debts[payer] || {}
        return payerDebts[receiver] || 0
    }

    // Handle Manual Settlement
    const handleManualSettle = async () => {
        if (!amount || !receiver) return

        const maxAmount = getMaxSettleAmount()
        if (parseFloat(amount) > maxAmount + 0.01) {
            alert(`You can only settle up to ${group.currency} ${maxAmount.toFixed(2)} that you owe.`)
            return
        }

        setLoading(true)
        try {
            const expenseId = await createSettlementRecord('manual')
            await insertSettlementDetails(expenseId, 'manual', 'pending_confirmation')

            onPaymentRecorded()
            onClose()
        } catch (error) {
            console.error('Error settling up:', error)
            alert('Failed to record settlement: ' + error.message)
        } finally {
            setLoading(false)
        }
    }

    // Handle UPI Settlement
    const handleUpiSettle = async () => {
        if (!amount || !receiver) return

        const maxAmount = getMaxSettleAmount()
        if (parseFloat(amount) > maxAmount + 0.01) {
            alert(`You can only settle up to ${group.currency} ${maxAmount.toFixed(2)} that you owe.`)
            return
        }

        setLoading(true)
        try {
            const expenseId = await createSettlementRecord('upi')
            await insertSettlementDetails(expenseId, 'upi', 'pending_utr')
            setPendingExpenseId(expenseId)

            // Generate UPI Intent Link
            const upiAmount = parseFloat(amount).toFixed(2)
            const note = encodeURIComponent(`SplitEx Settlement - ${group.name}`)
            const upiLink = `upi://pay?am=${upiAmount}&cu=INR&tn=${note}`

            // Open UPI App
            window.location.href = upiLink

            // Show UTR prompt after a short delay (user comes back from UPI app)
            setTimeout(() => {
                setShowUtrPrompt(true)
                setLoading(false)
            }, 1000)

        } catch (error) {
            console.error('Error initiating UPI payment:', error)
            alert('Failed to initiate UPI payment: ' + error.message)
            setLoading(false)
        }
    }

    // Validate UTR format (12-16 numeric digits)
    const validateUtr = (utr) => {
        const cleanUtr = utr.trim()
        if (!/^\d+$/.test(cleanUtr)) {
            return 'UTR must contain only numbers'
        }
        if (cleanUtr.length < 12 || cleanUtr.length > 16) {
            return 'UTR must be between 12-16 digits'
        }
        return null
    }

    // Save UTR Reference
    const handleSaveUtr = async () => {
        const utrError = validateUtr(utrReference)
        if (utrError) {
            alert(utrError)
            return
        }

        setLoading(true)
        try {
            const { error } = await supabase
                .from('settlement_details')
                .update({
                    utr_reference: utrReference.trim(),
                    settlement_status: 'pending_confirmation'
                })
                .eq('expense_id', pendingExpenseId)

            if (error) throw error

            onPaymentRecorded()
            onClose()
        } catch (error) {
            console.error('Error saving UTR:', error)
            alert('Failed to save UTR: ' + error.message)
        } finally {
            setLoading(false)
        }
    }

    // Cancel UTR - Close modal, settlement stays as pending_utr (user can add UTR later)
    const handleCancelUtr = () => {
        onPaymentRecorded()
        onClose()
    }

    // Edit Mode: Update existing settlement
    const handleUpdate = async (e) => {
        e.preventDefault()
        if (!amount || !receiver) return

        setLoading(true)
        try {
            const receiverName = members.find(m => m.id === receiver)?.name || 'Someone'
            const description = `Settlement to ${receiverName}`

            const { error: updateError } = await supabase
                .from('expenses')
                .update({
                    paid_by: payer,
                    amount: parseFloat(amount),
                    description: description
                })
                .eq('id', expenseToEdit.id)

            if (updateError) throw updateError

            await supabase.from('expense_splits').delete().eq('expense_id', expenseToEdit.id)

            const { error: splitError } = await supabase
                .from('expense_splits')
                .insert({
                    expense_id: expenseToEdit.id,
                    user_id: receiver,
                    owe_amount: parseFloat(amount)
                })

            if (splitError) throw splitError

            onPaymentRecorded()
            onClose()
        } catch (error) {
            console.error('Error updating settlement:', error)
            alert('Failed to update settlement: ' + error.message)
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async () => {
        if (onDelete && expenseToEdit) {
            onDelete(expenseToEdit.id)
            onClose()
        }
    }

    // Check if UPI is available (only for INR)
    const isUpiAvailable = group.currency === 'INR'

    // UTR Prompt Screen
    if (showUtrPrompt) {
        return (
            <div className="modal-overlay">
                <div className="modal-card">
                    <div className="modal-header">
                        <h2>Enter UTR/Reference</h2>
                        <button onClick={handleCancelUtr} className="close-btn">
                            <X size={24} />
                        </button>
                    </div>

                    <div className="modal-form" style={{ textAlign: 'center' }}>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                            Enter the transaction reference number from your payment app to confirm this settlement.
                        </p>

                        <input
                            type="text"
                            placeholder="e.g. 402345678912"
                            value={utrReference}
                            onChange={(e) => setUtrReference(e.target.value)}
                            className="amount-input"
                            style={{ textAlign: 'center', fontSize: '1.1rem' }}
                            autoFocus
                        />

                        <button
                            onClick={handleSaveUtr}
                            disabled={loading}
                            className="create-btn settle-btn"
                            style={{ marginTop: '1.5rem' }}
                        >
                            {loading ? <Loader2 className="spin" /> : 'Save & Complete'}
                        </button>

                        <button
                            onClick={handleCancelUtr}
                            disabled={loading}
                            className="cancel-btn"
                            style={{
                                marginTop: '1rem',
                                background: 'rgba(239, 68, 68, 0.1)',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                color: '#ef4444',
                                cursor: 'pointer',
                                fontSize: '0.9rem',
                                padding: '10px 16px',
                                borderRadius: '10px',
                                width: '100%'
                            }}
                        >
                            Cancel Settlement
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="modal-overlay">
            <div className="modal-card">
                <div className="modal-header">
                    <h2>{expenseToEdit ? 'Edit Settlement' : 'Settle Up'}</h2>
                    <button onClick={onClose} className="close-btn">
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={expenseToEdit ? handleUpdate : (e) => e.preventDefault()} className="modal-form">

                    <div className="settle-flow">
                        <div className="flow-item">
                            <label>Payer</label>
                            <select
                                value={payer}
                                onChange={(e) => handlePayerChange(e.target.value)}
                                className="user-select"
                                disabled={!!expenseToEdit}
                                style={{ opacity: expenseToEdit ? 0.7 : 1, cursor: expenseToEdit ? 'not-allowed' : 'pointer' }}
                            >
                                {members.map(member => (
                                    <option key={member.id} value={member.id}>
                                        {member.id === currentUser.id ? 'You' : member.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flow-arrow">
                            <ArrowRight size={24} />
                        </div>

                        <div className="flow-item">
                            <label>Receiver</label>
                            {availableReceivers.length > 0 ? (
                                <select
                                    value={receiver}
                                    onChange={(e) => setReceiver(e.target.value)}
                                    className="user-select"
                                    disabled={!!expenseToEdit}
                                    style={{ opacity: expenseToEdit ? 0.7 : 1, cursor: expenseToEdit ? 'not-allowed' : 'pointer' }}
                                >
                                    {availableReceivers.map(member => (
                                        <option key={member.id} value={member.id}>
                                            {member.id === currentUser.id ? 'You' : member.name}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <div className="no-debts-msg">
                                    {payer === currentUser.id ? "You don't owe anyone!" : "They don't owe anyone."}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="form-group amount-group">
                        <label>Amount ({group.currency})</label>
                        <input
                            type="number"
                            inputMode="decimal"
                            placeholder="0.00"
                            step="0.01"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            onKeyDown={(e) => ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()}
                            required
                            className="amount-input settle-input"
                            autoFocus
                        />
                    </div>

                    {/* Edit Mode: Single Update Button */}
                    {expenseToEdit ? (
                        <>
                            <button type="submit" disabled={loading} className="create-btn settle-btn">
                                {loading ? <Loader2 className="spin" /> : 'Update Settlement'}
                            </button>
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={loading}
                                className="delete-expense-btn"
                                style={{ marginTop: '1rem', width: '100%', padding: '12px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', fontWeight: '600' }}
                            >
                                <Trash2 size={18} /> Delete Settlement
                            </button>
                        </>
                    ) : (
                        /* Create Mode: Dual Settlement Buttons */
                        <div className="settlement-options">
                            <button
                                type="button"
                                onClick={handleManualSettle}
                                disabled={loading || !amount || !receiver}
                                className="settle-option-btn manual"
                            >
                                <HandCoins size={20} />
                                <span>Settle Manually</span>
                            </button>

                            {isUpiAvailable && (
                                <button
                                    type="button"
                                    onClick={handleUpiSettle}
                                    disabled={loading || !amount || !receiver}
                                    className="settle-option-btn upi"
                                >
                                    <Smartphone size={20} />
                                    <span>Pay via UPI</span>
                                </button>
                            )}
                        </div>
                    )}
                </form>
            </div>
        </div>
    )
}

