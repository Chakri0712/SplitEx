
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

    // Amount input validation handler
    const handleAmountChange = (e) => {
        const value = e.target.value
        // Allow empty, numbers, and max 2 decimal places
        if (value === '' || /^\d*\.?\d{0,2}$/.test(value)) {
            setAmount(value)
        }
    }

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

    const fetchExistingSplits = async (expenseId) => {
        const { data } = await supabase
            .from('expense_splits')
            .select('user_id, owe_amount')
            .eq('expense_id', expenseId)

        if (data && data.length > 0) {
            // Check if equal
            const total = parseFloat(expenseToEdit.amount) || 0
            const expectedShare = total / members.length

            // Heuristic: If count matches members AND amounts are equal
            const isAllEqual = data.length === members.length && data.every(s => Math.abs(s.owe_amount - expectedShare) < 0.05)

            if (isAllEqual) {
                setSplitMode('EQUAL')
            } else {
                setSplitMode('UNEQUAL')
                const splitsMap = {}
                data.forEach(s => {
                    // Store as string for formatting
                    splitsMap[s.user_id] = s.owe_amount.toFixed(2)
                })
                setCustomSplits(splitsMap)

                // Initialize involved/locked based on existing splits
                const involved = new Set()
                data.forEach(s => {
                    if (s.owe_amount > 0) involved.add(s.user_id)
                })
                setInvolvedMembers(involved)
            }
        }
    }

    // State for smart splitting
    const [lockedMembers, setLockedMembers] = useState(new Set())
    const [involvedMembers, setInvolvedMembers] = useState(new Set())

    const handleCustomSplitChange = (userId, value) => {
        // Strict 2 decimal place validation for input
        if (value && !/^\d*\.?\d{0,2}$/.test(value)) {
            return // Ignore invalid input
        }

        // Allow raw input update for smooth typing (e.g. "25.")
        const newSplits = { ...customSplits, [userId]: value }

        const total = parseFloat(amount) || 0

        // 1. Update the manual entry & Add to locked set
        const newLocked = new Set(lockedMembers)
        newLocked.add(userId)
        setLockedMembers(newLocked)

        // 3. Calculate remaining amount for unlocked members
        // Sum of all locked members (including the one just edited)
        let lockedSum = 0
        members.forEach(m => {
            if (newLocked.has(m.id)) {
                // Use parsed values for sum
                const val = parseFloat(newSplits[m.id]) || 0
                lockedSum += val
            }
        })

        // Prevent negative remaining
        const remaining = Math.max(0, total - lockedSum)

        // 4. Distribute remaining among unlocked members
        const unlockedMembers = members.filter(m => !newLocked.has(m.id) && involvedMembers.has(m.id))

        if (unlockedMembers.length > 0) {
            const share = Math.max(0, remaining / unlockedMembers.length)
            const shareFixed = share.toFixed(2) // STRING

            // Distribute to all unlocked
            unlockedMembers.forEach(m => {
                newSplits[m.id] = shareFixed
            })

            // Fix rounding error on the last unlocked member
            if (unlockedMembers.length > 0) {
                let currentSum = 0
                // We need to sum the splits of INVOLVED members to check against TOTAL
                members.forEach(m => {
                    if (involvedMembers.has(m.id)) {
                        currentSum += parseFloat(newSplits[m.id]) || 0
                    }
                })

                // If we are strictly distributing TOTAL (and assuming all involved covers total)
                // But lockedSum might be < Total.

                const diff = total - currentSum

                if (Math.abs(diff) > 0.001) {
                    const lastMember = unlockedMembers[unlockedMembers.length - 1]
                    const lastVal = parseFloat(newSplits[lastMember.id]) || 0
                    // Prevent negative adjustment
                    const newVal = Math.max(0, lastVal + diff)
                    newSplits[lastMember.id] = newVal.toFixed(2)
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
            const currentTotal = Object.values(customSplits).reduce((a, b) => a + (parseFloat(b) || 0), 0)
            if (Math.abs(currentTotal - totalAmount) > 0.1) {
                setError(`Split amounts must equal the total amount (${totalAmount}). Current total: ${currentTotal.toFixed(2)}`)
                return
            }

            // Validate individual split inputs
            for (const userId in customSplits) {
                const splitVal = parseFloat(customSplits[userId]) || 0;
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
                        date: new Date(date).toISOString(),
                        created_by: currentUser.id
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
                    owe_amount: parseFloat(customSplits[member.id]) || 0
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
    const isZeroAmount = totalAmount <= 0

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
                            type="text"
                            inputMode="decimal"
                            placeholder="0.00"
                            value={amount}
                            onChange={handleAmountChange}
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
                                onClick={() => {
                                    setSplitMode('EQUAL')
                                    setCustomSplits({})
                                    setInvolvedMembers(new Set())
                                    setLockedMembers(new Set())
                                }}
                            >
                                Split Equally
                            </button>
                            <button
                                type="button"
                                className={`toggle-btn ${splitMode === 'UNEQUAL' ? 'active' : ''}`}
                                onClick={() => {
                                    setSplitMode('UNEQUAL')
                                    const total = parseFloat(amount) || 0

                                    // If total is 0, just init everyone as involved with 0
                                    if (total === 0) {
                                        const initialSplits = {}
                                        const allInvolved = new Set()
                                        members.forEach(m => {
                                            initialSplits[m.id] = "0.00"
                                            allInvolved.add(m.id)
                                        })
                                        setCustomSplits(initialSplits)
                                        setInvolvedMembers(allInvolved)
                                        setLockedMembers(new Set())
                                        return
                                    }

                                    // Distribute equally initially
                                    const share = (total / members.length).toFixed(2) // STRING
                                    const initialSplits = {}
                                    const allInvolved = new Set()

                                    members.forEach(m => {
                                        initialSplits[m.id] = share
                                        allInvolved.add(m.id)
                                    })

                                    // Fix rounding for last person
                                    const currentSum = members.length * parseFloat(share)
                                    const diff = total - currentSum
                                    if (Math.abs(diff) > 0.001 && members.length > 0) {
                                        const lastId = members[members.length - 1].id
                                        const lastVal = parseFloat(share) + diff
                                        initialSplits[lastId] = lastVal.toFixed(2)
                                    }

                                    setCustomSplits(initialSplits)
                                    setInvolvedMembers(allInvolved)
                                    setLockedMembers(new Set()) // Reset locks logic
                                }}
                            >
                                Split Unequally
                            </button>
                        </div>

                        {splitMode === 'UNEQUAL' && (
                            <div className="member-split-row select-all-row" style={{ borderBottom: '1px dashed var(--border-color)', marginBottom: '8px', paddingBottom: '8px' }}>
                                <div className="split-left">
                                    <input
                                        type="checkbox"
                                        checked={involvedMembers.size === members.length && members.length > 0}
                                        disabled={isZeroAmount}
                                        onChange={(e) => {
                                            const isChecked = e.target.checked
                                            const total = parseFloat(amount) || 0

                                            if (isChecked) {
                                                // Select All: Re-distribute equally among all
                                                const newInvolved = new Set(members.map(m => m.id))
                                                const share = (total / members.length).toFixed(2) // STRING
                                                const newSplits = {}

                                                members.forEach(m => {
                                                    newSplits[m.id] = share
                                                })

                                                // Fix rounding
                                                let currentSum = members.length * parseFloat(share)
                                                // Using simple math can have floating point issues, let's just sum it properly
                                                // actually simpler: currentSum is approx total

                                                const diff = total - currentSum
                                                if (Math.abs(diff) > 0.001 && members.length > 0) {
                                                    const lastId = members[members.length - 1].id
                                                    const lastVal = parseFloat(share) + diff
                                                    newSplits[lastId] = lastVal.toFixed(2)
                                                }

                                                setCustomSplits(newSplits)
                                                setInvolvedMembers(newInvolved)
                                                setLockedMembers(new Set())
                                            } else {
                                                // Deselect All: Clear everything
                                                const newSplits = {}
                                                members.forEach(m => newSplits[m.id] = "0.00")
                                                setCustomSplits(newSplits)
                                                setInvolvedMembers(new Set())
                                                setLockedMembers(new Set())
                                            }
                                        }}
                                        style={{ width: '18px', height: '18px', accentColor: 'var(--primary)', cursor: 'pointer', marginRight: '12px' }}
                                    />
                                    <span className="member-name-split" style={{ fontWeight: 600 }}>Select All</span>
                                </div>
                                <div className="split-right">
                                    {/* Removed Validation Message */}
                                </div>
                            </div>
                        )}

                        <div className="members-split-list">
                            {members.map(member => {
                                const isChecked = involvedMembers.has(member.id)

                                return (
                                    <div key={member.id} className="member-split-row">
                                        <div className="split-left">
                                            {/* Checkbox for inclusion */}
                                            {splitMode === 'UNEQUAL' && (
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    disabled={isZeroAmount}
                                                    onChange={(e) => {
                                                        const isChecked = e.target.checked
                                                        const userId = member.id
                                                        const total = parseFloat(amount) || 0

                                                        let newInvolved = new Set(involvedMembers)
                                                        let newLocked = new Set(lockedMembers)
                                                        let newSplits = { ...customSplits }

                                                        if (!isChecked) {
                                                            // Uncheck: Remove from involved, set to 0, unlock
                                                            newInvolved.delete(userId)
                                                            newSplits[userId] = "0.00"
                                                            newLocked.delete(userId)
                                                        } else {
                                                            // Check: Add to involved, unlock (so it takes a share)
                                                            newInvolved.add(userId)
                                                            newLocked.delete(userId)
                                                        }

                                                        setInvolvedMembers(newInvolved)
                                                        setLockedMembers(newLocked)

                                                        // REDISTRIBUTE among NEW involved members
                                                        // 1. Calculate sum of LOCKED members who are also INVOLVED
                                                        let lockedSum = 0
                                                        members.forEach(m => {
                                                            if (newInvolved.has(m.id) && newLocked.has(m.id)) {
                                                                lockedSum += parseFloat(newSplits[m.id]) || 0
                                                            }
                                                        })

                                                        const remaining = Math.max(0, total - lockedSum)

                                                        // 2. Identify Unlocked & Involved members
                                                        const activeUnlockedMembers = members.filter(m => newInvolved.has(m.id) && !newLocked.has(m.id))

                                                        if (activeUnlockedMembers.length > 0) {
                                                            const share = Math.max(0, remaining / activeUnlockedMembers.length)
                                                            const shareFixed = share.toFixed(2)

                                                            activeUnlockedMembers.forEach(m => {
                                                                newSplits[m.id] = shareFixed
                                                            })

                                                            // Fix rounding
                                                            let currentSum = 0
                                                            // Sum locked involved
                                                            members.forEach(m => {
                                                                if (newInvolved.has(m.id) && newLocked.has(m.id)) {
                                                                    currentSum += parseFloat(newSplits[m.id]) || 0
                                                                }
                                                            })
                                                            // Sum unlocked involved
                                                            activeUnlockedMembers.forEach(m => {
                                                                currentSum += parseFloat(newSplits[m.id]) || 0
                                                            })

                                                            const diff = total - currentSum
                                                            if (Math.abs(diff) > 0.001) {
                                                                const lastMember = activeUnlockedMembers[activeUnlockedMembers.length - 1]
                                                                const lastVal = parseFloat(newSplits[lastMember.id]) || 0
                                                                newSplits[lastMember.id] = (Math.max(0, lastVal + diff)).toFixed(2)
                                                            }
                                                        }

                                                        setCustomSplits(newSplits)
                                                    }}
                                                    style={{ width: '18px', height: '18px', accentColor: 'var(--primary)', cursor: 'pointer', marginRight: '12px' }}
                                                />
                                            )}
                                            {/* Avatar or Icon could go here */}
                                            <span className={`member-name-split ${(!isChecked || isZeroAmount) && splitMode === 'UNEQUAL' ? 'unchecked' : ''}`}>
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
                                                    step="0.01"
                                                    placeholder="0.00"
                                                    value={customSplits[member.id] || ''}
                                                    onChange={(e) => handleCustomSplitChange(member.id, e.target.value)}
                                                    onKeyDown={(e) => ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()}
                                                    onBlur={(e) => {
                                                        const val = parseFloat(e.target.value)
                                                        if (!isNaN(val)) {
                                                            handleCustomSplitChange(member.id, val.toFixed(2))
                                                        }
                                                    }}
                                                    disabled={!isChecked || isZeroAmount}
                                                    className={`custom-amount-input ${(!isChecked || isZeroAmount) ? 'disabled' : ''}`}
                                                />
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
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
