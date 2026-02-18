import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { getCurrencySymbol } from '../utils/currency'
import { X, Loader2, ArrowRight, Trash2, HandCoins } from 'lucide-react'
import './SettleUpModal.css'

export default function SettleUpModal({ group, currentUser, members, debts: propDebts, onClose, onPaymentRecorded, expenseToEdit = null, onDelete, initialData = null }) {
    const [loading, setLoading] = useState(false)
    const [localDebts, setLocalDebts] = useState({}) // { [payerId]: { [receiverId]: amount } }

    // Use prop debts if available, otherwise local debts
    const debts = propDebts || localDebts

    // Check if selections should be locked (from debt card click)
    const isLocked = initialData?.locked || false

    // Form State - initialize directly from initialData if present
    const [payer, setPayer] = useState(() => {
        if (expenseToEdit) return expenseToEdit.paid_by
        if (initialData?.payer) return initialData.payer
        return currentUser.id
    })
    const [receiver, setReceiver] = useState(() => {
        if (initialData?.receiver) return initialData.receiver
        return ''
    })
    const [amount, setAmount] = useState(() => {
        if (expenseToEdit) return parseFloat(expenseToEdit.amount).toFixed(2)
        if (initialData?.amount) return parseFloat(initialData.amount).toFixed(2)
        return ''
    })
    const [description, setDescription] = useState(() => {
        if (expenseToEdit) return expenseToEdit.description || ''
        return ''
    })

    // Amount input validation handler
    const handleAmountChange = (e) => {
        const value = e.target.value
        // Allow empty, numbers, and max 2 decimal places
        if (value === '' || /^\d*\.?\d{0,2}$/.test(value)) {
            setAmount(value)
        }
    }

    useEffect(() => {
        // fetchMembers() // removing call
        if (!propDebts) {
            fetchDebts()
        }
    }, [propDebts])

    // ...

    // const fetchMembers = async () => { ... } // Removed

    const fetchDebts = async () => {
        const { data: expenses } = await supabase
            .from('expenses')
            .select('id, paid_by, amount, category')
            .eq('group_id', group.id)

        if (!expenses || expenses.length === 0) return

        // Get settlement statuses for settlement expenses
        const settlementExpenses = expenses.filter(e => e.category === 'settlement')
        let cancelledSettlementIds = []

        if (settlementExpenses.length > 0) {
            const { data: settlementDetails } = await supabase
                .from('settlement_details')
                .select('expense_id, settlement_status')
                .in('expense_id', settlementExpenses.map(e => e.id))

            // Filter out cancelled settlements
            if (settlementDetails) {
                cancelledSettlementIds = settlementDetails
                    .filter(s => s.settlement_status === 'cancelled')
                    .map(s => s.expense_id)
            }
        }

        // Exclude cancelled settlements from debt calculation
        const validExpenses = expenses.filter(e => !cancelledSettlementIds.includes(e.id))
        const expenseIds = validExpenses.map(e => e.id)

        if (expenseIds.length === 0) return

        const { data: splits } = await supabase
            .from('expense_splits')
            .select('expense_id, user_id, owe_amount')
            .in('expense_id', expenseIds)

        if (!splits) return

        const netBalances = {}
        const validExpenseMap = new Map()
        validExpenses.forEach(e => validExpenseMap.set(e.id, e))

        splits.forEach(split => {
            const expense = validExpenseMap.get(split.expense_id)
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
        setLocalDebts(netBalances)
    }

    // Load Expense Data for Editing or Initial Data
    useEffect(() => {
        if (expenseToEdit) {
            setPayer(expenseToEdit.paid_by)
            setAmount(parseFloat(expenseToEdit.amount).toFixed(2)) // Ensure amount is set
            setDescription(expenseToEdit.description || '')
            // Fetch the receiver (who owes 100% of this split)
            fetchReceiver(expenseToEdit.id)
        } else if (initialData) {
            // Explicitly set each field with fallbacks, prioritizing initialData
            const initPayer = initialData.payer || currentUser.id
            const initReceiver = initialData.receiver || ''
            const initAmount = initialData.amount ? parseFloat(initialData.amount).toFixed(2) : ''

            console.log('Initializing SettleUpModal:', { initPayer, initReceiver, initAmount, initialData })

            setPayer(initPayer)
            setReceiver(initReceiver)
            setAmount(initAmount)
            setDescription('')
        }
    }, [expenseToEdit, initialData, currentUser.id])

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
        const finalDescription = description.trim() || `Settlement to ${receiverName}`

        const { data: expense, error: expenseError } = await supabase
            .from('expenses')
            .insert({
                group_id: group.id,
                paid_by: payer,
                amount: parseFloat(amount),
                description: finalDescription,
                category: 'settlement',
                created_by: currentUser.id
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
        const insertData = {
            expense_id: expenseId,
            settlement_method: method,
            settlement_status: status,
            utr_reference: utr,
            initiated_by: currentUser.id
        }

        if (status === 'confirmed') {
            insertData.confirmed_by = currentUser.id
            insertData.confirmed_at = new Date().toISOString()
        }

        const { error } = await supabase
            .from('settlement_details')
            .insert(insertData)

        if (error) throw error
    }

    // Get max amount user can settle (amount owed to receiver)
    const getMaxSettleAmount = () => {
        if (!payer || !receiver) return Infinity
        const payerDebts = debts[payer] || {}
        return payerDebts[receiver] || 0
    }

    // Handle Settle Up (Unified)
    const handleSettleUp = async () => {
        if (!amount || !receiver) return

        // 1. Mandatory Note Validation
        if (!description.trim()) {
            alert('Please add a note to describe this settlement.')
            return
        }

        // 2. Amount Validation
        const maxAmount = getMaxSettleAmount()
        if (parseFloat(amount) > maxAmount + 0.01) {
            if (maxAmount <= 0) {
                alert('You have pending settlements that cover your dues. Please ask the receiver to confirm or cancel them before creating a new settlement.')
            } else {
                alert(`You can only settle up to ${group.currency} ${maxAmount.toFixed(2)} that you owe.`)
            }
            return
        }

        // 3. Determine Method (Full vs Partial)
        // If amount is within 0.01 of the total debt, consider it a full settlement
        const isFullKey = parseFloat(amount) >= (maxAmount - 0.01)
        const settlementMethod = isFullKey ? 'full' : 'partial'

        // 4. Determine Status (Auto-confirm if Receiver initiated)
        const isSelfSettled = currentUser.id === receiver
        const initialStatus = isSelfSettled ? 'confirmed' : 'pending_confirmation'

        setLoading(true)
        try {
            const expenseId = await createSettlementRecord(settlementMethod)
            await insertSettlementDetails(expenseId, settlementMethod, initialStatus)

            onPaymentRecorded()
            onClose()
        } catch (error) {
            console.error('Error settling up:', error)
            alert('Failed to record settlement: ' + error.message)
        } finally {
            setLoading(false)
        }
    }

    // Edit Mode: Update existing settlement
    const handleUpdate = async (e) => {
        e.preventDefault()
        if (!amount || !receiver) return

        setLoading(true)
        try {
            const receiverName = members.find(m => m.id === receiver)?.name || 'Someone'
            const finalDescription = description.trim() || `Settlement to ${receiverName}`

            const { error: expenseError } = await supabase
                .from('expenses')
                .update({
                    paid_by: payer,
                    amount: parseFloat(amount),
                    description: finalDescription
                })
                .eq('id', expenseToEdit.id)

            if (expenseError) throw expenseError

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
                        {/* Payer and Receiver Selection */}
                        <div className="flow-item">
                            <label>Payer</label>
                            <select
                                value={payer}
                                onChange={(e) => handlePayerChange(e.target.value)}
                                className="user-select"
                                disabled={!!expenseToEdit || isLocked}
                                style={{ opacity: (expenseToEdit || isLocked) ? 0.7 : 1, cursor: (expenseToEdit || isLocked) ? 'not-allowed' : 'pointer' }}
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
                                    disabled={!!expenseToEdit || isLocked}
                                    style={{ opacity: (expenseToEdit || isLocked) ? 0.7 : 1, cursor: (expenseToEdit || isLocked) ? 'not-allowed' : 'pointer' }}
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

                    <div className="input-section">
                        <div className="amount-group">
                            <label>Amount</label>
                            <div className="currency-input">
                                <span className="currency-symbol">{getCurrencySymbol(group.currency)}</span>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="0.00"
                                    value={amount}
                                    onChange={handleAmountChange}
                                />
                            </div>
                        </div>

                        <div className="form-group" style={{ marginTop: '1rem' }}>
                            <label>Note (Mandatory)</label>
                            <input
                                type="text"
                                placeholder="Add a short note..."
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                maxLength={100}
                                required
                                className="description-input"
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '8px',
                                    background: 'var(--bg-input)',
                                    color: 'var(--text-primary)'
                                }}
                            />
                            <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                {description.length}/100
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons */}
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
                        /* Create Mode: Single Settle Up Button */
                        <div className="settlement-options">
                            <button
                                type="button"
                                onClick={handleSettleUp}
                                disabled={loading || !amount || !receiver || parseFloat(amount) <= 0 || !description.trim()}
                                className="settle-option-btn manual"
                                style={{ width: '100%' }}
                            >
                                <HandCoins size={20} />
                                <span>Settle Up</span>
                            </button>
                        </div>
                    )}
                </form>
            </div>
        </div>
    )
}
