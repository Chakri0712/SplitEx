import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { X, Loader2, ArrowRight, Trash2 } from 'lucide-react'
import './SettleUpModal.css'

export default function SettleUpModal({ group, currentUser, onClose, onPaymentRecorded, expenseToEdit = null, onDelete }) {
    const [loading, setLoading] = useState(false)
    const [members, setMembers] = useState([])
    const [debts, setDebts] = useState({}) // { [payerId]: { [receiverId]: amount } }

    // Form State
    const [payer, setPayer] = useState(currentUser.id)
    const [receiver, setReceiver] = useState('')
    const [amount, setAmount] = useState('')

    useEffect(() => {
        fetchMembers()
        fetchDebts()
    }, [])

    // Load Expense Data for Editing
    useEffect(() => {
        if (expenseToEdit) {
            setPayer(expenseToEdit.paid_by)
            setAmount(expenseToEdit.amount)
            // Fetch the receiver (who owes 100% of this split)
            fetchReceiver(expenseToEdit.id)
        }
    }, [expenseToEdit])


    const fetchMembers = async () => {
        const { data } = await supabase
            .from('group_members')
            .select('user_id, profiles(full_name, avatar_url)')
            .eq('group_id', group.id)

        if (data) {
            const formattedMembers = data.map(m => ({
                id: m.user_id,
                name: m.profiles.full_name || 'Unknown',
                avatar: m.profiles.avatar_url
            }))
            setMembers(formattedMembers)
        }
    }

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

    const handleSettle = async (e) => {
        e.preventDefault()
        if (!amount || !receiver) return

        setLoading(true)
        try {
            const payerName = members.find(m => m.id === payer)?.name || 'Someone'
            const receiverName = members.find(m => m.id === receiver)?.name || 'Someone'
            const description = `Payment to ${receiverName}`

            let expenseId = expenseToEdit?.id

            if (expenseToEdit) {
                // UPDATE
                const { error: updateError } = await supabase
                    .from('expenses')
                    .update({
                        paid_by: payer,
                        amount: parseFloat(amount),
                        description: description
                    })
                    .eq('id', expenseId)

                if (updateError) throw updateError
                await supabase.from('expense_splits').delete().eq('expense_id', expenseId)
            } else {
                // CREATE
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
                expenseId = expense.id
            }

            const { error: splitError } = await supabase
                .from('expense_splits')
                .insert({
                    expense_id: expenseId,
                    user_id: receiver,
                    owe_amount: parseFloat(amount)
                })

            if (splitError) throw splitError

            onPaymentRecorded()
            onClose()
        } catch (error) {
            console.error('Error settling up:', error)
            alert('Failed to record payment: ' + error.message)
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

    return (
        <div className="modal-overlay">
            <div className="modal-card">
                <div className="modal-header">
                    <h2>{expenseToEdit ? 'Edit Payment' : 'Settle Up'}</h2>
                    <button onClick={onClose} className="close-btn">
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSettle} className="modal-form">

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
                            placeholder="0.00"
                            step="0.01"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            required
                            className="amount-input settle-input"
                            autoFocus
                        />
                    </div>

                    <button type="submit" disabled={loading} className="create-btn settle-btn">
                        {loading ? <Loader2 className="spin" /> : (expenseToEdit ? 'Update Payment' : 'Record Payment')}
                    </button>

                    {expenseToEdit && (
                        <button
                            type="button"
                            onClick={handleDelete}
                            disabled={loading}
                            className="delete-expense-btn"
                            style={{ marginTop: '1rem', width: '100%', padding: '12px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', fontWeight: '600' }}
                        >
                            <Trash2 size={18} /> Delete Payment
                        </button>
                    )}
                </form>
            </div>
        </div>
    )
}
