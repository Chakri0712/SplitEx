
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { X, Loader2, Trash2 } from 'lucide-react'
import './AddExpenseModal.css'

import { validateName, validateAmount } from '../utils/validation'

// export default function AddExpenseModal({ group, currentUser, onClose, onExpenseAdded, expenseToEdit = null, onDelete }) {
export default function AddExpenseModal({ group, currentUser, members, onClose, onExpenseAdded, expenseToEdit = null, onDelete }) {
    const [loading, setLoading] = useState(false)
    // const [members, setMembers] = useState([]) // removing local state
    const [error, setError] = useState(null)

    // Form State
    const [description, setDescription] = useState('')
    const [amount, setAmount] = useState('')
    const [paidBy, setPaidBy] = useState(currentUser.id)
    const [date, setDate] = useState(new Date().toISOString().split('T')[0])

    // Split State
    const [splitMode, setSplitMode] = useState('EQUAL') // 'EQUAL' or 'UNEQUAL'
    const [customSplits, setCustomSplits] = useState({})

    // useEffect(() => {
    //     fetchMembers()
    // }, [])

    // Load Expense Data & Splits for Editing
    useEffect(() => {
        if (expenseToEdit && members.length > 0) {
            setDescription(expenseToEdit.description)
            setAmount(expenseToEdit.amount)
            setPaidBy(expenseToEdit.paid_by)
            setDate(new Date(expenseToEdit.date).toISOString().split('T')[0])
            fetchExistingSplits(expenseToEdit.id)
        }
    }, [expenseToEdit, members])

    // const fetchMembers = async () => { ... } // Removed

    const fetchExistingSplits = async (expenseId) => {
        const { data } = await supabase
            .from('expense_splits')
            .select('user_id, owe_amount')
            .eq('expense_id', expenseId)

        if (data && data.length > 0) {
            // Check if equal
            const firstAmount = data[0].owe_amount
            const count = data.length
            const total = parseFloat(expenseToEdit.amount) || 0
            const expectedShare = total / members.length // Assuming all members for equal check

            // Heuristic: If count matches members AND amounts are equal
            const isAllEqual = data.length === members.length && data.every(s => Math.abs(s.owe_amount - expectedShare) < 0.05)

            if (isAllEqual) {
                setSplitMode('EQUAL')
            } else {
                setSplitMode('UNEQUAL')
                const splitsMap = {}
                data.forEach(s => {
                    splitsMap[s.user_id] = s.owe_amount
                })
                setCustomSplits(splitsMap)
            }
        }
    }

    // State for smart splitting
    const [lockedMembers, setLockedMembers] = useState(new Set())

    const handleCustomSplitChange = (userId, value) => {
        const newVal = parseFloat(value) || 0
        const total = parseFloat(amount) || 0

        // 1. Update the manual entry
        const newSplits = { ...customSplits, [userId]: newVal }

        // 2. Add to locked set
        const newLocked = new Set(lockedMembers)
        newLocked.add(userId)
        setLockedMembers(newLocked)

        // 3. Calculate remaining amount for unlocked members
        // Sum of all locked members (including the one just edited)
        let lockedSum = 0
        members.forEach(m => {
            if (newLocked.has(m.id)) {
                lockedSum += newSplits[m.id] || 0
            }
        })

        const remaining = total - lockedSum

        // 4. Distribute remaining among unlocked members
        const unlockedMembers = members.filter(m => !newLocked.has(m.id))

        if (unlockedMembers.length > 0) {
            const share = Math.max(0, remaining / unlockedMembers.length) // Prevent negative auto-fill? Or allow it? strict math says allow.
            // Actually, keep it simple math. If negative, let it be negative, validation will catch.
            // But usually nice to truncate to 2 decimals.
            const shareFixed = parseFloat(share.toFixed(2))

            // Distribute to all unlocked
            unlockedMembers.forEach(m => {
                newSplits[m.id] = shareFixed
            })

            // Fix rounding error on the last unlocked member
            if (unlockedMembers.length > 0) {
                // Recalculate current sum
                const currentSum = Object.values(newSplits).reduce((a, b) => a + b, 0)
                const diff = total - currentSum

                if (Math.abs(diff) > 0.001) {
                    const lastMember = unlockedMembers[unlockedMembers.length - 1]
                    newSplits[lastMember.id] = parseFloat((newSplits[lastMember.id] + diff).toFixed(2))
                }
            }
        }

        setCustomSplits(newSplits)
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError(null)

        // 1. Validate Description
        const descError = validateName(description, "Description", 100)
        if (descError) {
            setError(descError)
            return
        }

        // 2. Validate Amount
        const amountError = validateAmount(amount)
        if (amountError) {
            setError(amountError)
            return
        }

        const totalAmount = parseFloat(amount)

        // 3. Validate Unequal Splits
        if (splitMode === 'UNEQUAL') {
            const currentTotal = Object.values(customSplits).reduce((a, b) => a + b, 0)
            if (Math.abs(currentTotal - totalAmount) > 0.1) {
                setError(`Split amounts must equal the total amount (${totalAmount}). Current total: ${currentTotal.toFixed(2)}`)
                return
            }

            // Validate individual split inputs
            for (const userId in customSplits) {
                const splitVal = customSplits[userId];
                // Check for negative split values
                if (splitVal < 0) {
                    setError("Split amounts cannot be negative.")
                    return
                }
            }
        }

        setLoading(true)
        try {
            let expenseId = expenseToEdit?.id

            if (expenseToEdit) {
                // UPDATE FLOW
                const { error: updateError } = await supabase
                    .from('expenses')
                    .update({
                        paid_by: paidBy,
                        amount: totalAmount,
                        description: description.trim(),
                        date: new Date(date).toISOString()
                    })
                    .eq('id', expenseId)

                if (updateError) throw updateError

                // Delete old splits
                await supabase.from('expense_splits').delete().eq('expense_id', expenseId)

            } else {
                // CREATE FLOW
                const { data: expense, error: expenseError } = await supabase
                    .from('expenses')
                    .insert({
                        group_id: group.id,
                        paid_by: paidBy,
                        amount: totalAmount,
                        description: description.trim(),
                        date: new Date(date).toISOString()
                    })
                    .select()
                    .single()

                if (expenseError) throw expenseError
                expenseId = expense.id
            }

            // Create Splits
            let splits = []
            if (splitMode === 'EQUAL') {
                const splitAmount = parseFloat((totalAmount / members.length).toFixed(2)) // Initial rough split

                // create basic equal splits
                splits = members.map(member => ({
                    expense_id: expenseId,
                    user_id: member.id,
                    owe_amount: splitAmount
                }))

                // Fix penny rounding error
                const currentSum = splits.reduce((sum, s) => sum + s.owe_amount, 0)
                const diff = parseFloat((totalAmount - currentSum).toFixed(2))

                if (diff !== 0) {
                    // Add diff to the first person (or random)
                    splits[0].owe_amount = parseFloat((splits[0].owe_amount + diff).toFixed(2))
                }

            } else {
                // UNEQUAL
                splits = members.map(member => ({
                    expense_id: expenseId,
                    user_id: member.id,
                    owe_amount: customSplits[member.id] || 0
                }))
            }

            const { error: splitError } = await supabase
                .from('expense_splits')
                .insert(splits)

            if (splitError) throw splitError

            onExpenseAdded()
            onClose()
        } catch (error) {
            console.error('Error adding expense:', error)
            alert('Failed to add expense: ' + error.message)
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

    // Calculation for UI
    const totalAmount = parseFloat(amount) || 0
    const equalShare = members.length > 0 ? (totalAmount / members.length).toFixed(2) : '0.00'

    // Validation Calc for Amount Mode
    const currentCustomTotal = Object.values(customSplits).reduce((a, b) => a + b, 0)
    const remainingSplit = totalAmount - currentCustomTotal

    return (
        <div className="modal-overlay">
            <div className="modal-card">
                <div className="modal-header">
                    <h2>{expenseToEdit ? 'Edit Expense' : 'Add Expense'}</h2>
                    <button onClick={onClose} className="close-btn">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="modal-form">


                    <div className="form-group">
                        <label>Description</label>
                        <input
                            type="text"
                            placeholder="e.g. Dinner"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            autoFocus
                            required
                        />
                    </div>

                    <div className="form-group">
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
                            className="amount-input"
                        />
                    </div>

                    <div className="form-group" style={{ display: 'flex', gap: '10px' }}>
                        <div style={{ flex: 1 }}>
                            <label>Paid By</label>
                            <select
                                value={paidBy}
                                onChange={(e) => setPaidBy(e.target.value)}
                                className="payer-select"
                            >
                                {members.map(member => (
                                    <option key={member.id} value={member.id}>
                                        {member.id === currentUser.id ? 'You' : member.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div style={{ flex: 1 }}>
                            <label>Date</label>
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="payer-select"
                            />
                        </div>
                    </div>

                    {/* Reverted Split Logic: Toggle + Always Visible List */}
                    <div className="split-section-container">
                        <div className="split-mode-toggle">
                            <button
                                type="button"
                                className={`toggle-btn ${splitMode === 'EQUAL' ? 'active' : ''}`}
                                onClick={() => setSplitMode('EQUAL')}
                            >
                                Split Equally
                            </button>
                            <button
                                type="button"
                                className={`toggle-btn ${splitMode === 'UNEQUAL' ? 'active' : ''}`}
                                onClick={() => {
                                    setSplitMode('UNEQUAL')
                                    // Initialize with equal splits for better UX
                                    if (Object.keys(customSplits).length === 0 && amount) {
                                        const total = parseFloat(amount) || 0
                                        const share = parseFloat((total / members.length).toFixed(2))
                                        const initialSplits = {}
                                        members.forEach(m => initialSplits[m.id] = share)

                                        // Fix rounding for last person
                                        const currentSum = members.length * share
                                        const diff = parseFloat((total - currentSum).toFixed(2))
                                        if (diff !== 0 && members.length > 0) {
                                            const lastId = members[members.length - 1].id
                                            initialSplits[lastId] = parseFloat((share + diff).toFixed(2))
                                        }

                                        setCustomSplits(initialSplits)
                                        setLockedMembers(new Set()) // Reset locks logic
                                    }
                                }}
                            >
                                Split Unequally
                            </button>
                        </div>

                        {splitMode === 'UNEQUAL' && (
                            <div className={`split-validation ${Math.abs(remainingSplit) < 0.1 ? 'success' : 'error'}`}>
                                {Math.abs(remainingSplit) < 0.1
                                    ? '✅ Matches Total'
                                    : `Remaining: ${remainingSplit.toFixed(2)}`}
                            </div>
                        )}

                        <div className="members-split-list">
                            {members.map(member => (
                                <div key={member.id} className="member-split-row">
                                    <div className="split-left">
                                        {/* Avatar or Icon could go here */}
                                        <span className="member-name-split">
                                            {member.id === currentUser.id ? 'You' : member.name}
                                        </span>
                                    </div>
                                    <div className="split-right">
                                        {splitMode === 'EQUAL' ? (
                                            <span className="share-amount">
                                                {equalShare}
                                            </span>
                                        ) : (
                                            <input
                                                type="number"
                                                inputMode="decimal"
                                                placeholder="0.00"
                                                value={customSplits[member.id] || ''}
                                                onChange={(e) => handleCustomSplitChange(member.id, e.target.value)}
                                                onKeyDown={(e) => ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()}
                                                className="custom-amount-input"
                                            />
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {error && <div className="error-banner" style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', padding: '10px', borderRadius: '8px', marginBottom: '1rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>{error}</div>}

                    <button type="submit" disabled={loading} className="create-btn">
                        {loading ? <Loader2 className="spin" /> : (expenseToEdit ? 'Update Expense' : 'Save Expense')}
                    </button>

                    {expenseToEdit && (
                        <button
                            type="button"
                            onClick={handleDelete}
                            disabled={loading}
                            className="delete-expense-btn"
                        >
                            <Trash2 size={18} /> Delete
                        </button>
                    )}
                </form>
            </div>
        </div>
    )
}
