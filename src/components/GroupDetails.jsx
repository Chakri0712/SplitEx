
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useSearchParams } from 'react-router-dom'
import { ArrowLeft, Plus, Receipt, Settings, Banknote, Trash2, Pencil, Info, HandCoins, ArrowRight } from 'lucide-react'
import AddExpenseModal from './AddExpenseModal'
import SettleUpModal from './SettleUpModal'
import GroupSettingsModal from './GroupSettingsModal'
import SettlementDetailsModal from './SettlementDetailsModal'
import ExpenseDetailsModal from './ExpenseDetailsModal'
import './GroupDetails.css'

export default function GroupDetails({ session, group, onBack }) {
    const [expenses, setExpenses] = useState([])
    const [loading, setLoading] = useState(true)
    const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false)
    const [expenseToEdit, setExpenseToEdit] = useState(null)
    const [isSettleModalOpen, setIsSettleModalOpen] = useState(false)
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
    const [balance, setBalance] = useState(0)
    const [currentGroup, setCurrentGroup] = useState(group)
    const [searchParams, setSearchParams] = useSearchParams()

    // Derive active tab from URL, default to 'expenses'
    const activeTab = searchParams.get('tab') || 'expenses'

    // Helper to update tab
    const setActiveTab = (tab) => {
        setSearchParams({ tab, filter: expenseFilter })
    }

    const [expenseFilter, setExpenseFilter] = useState(searchParams.get('filter') || 'expenses')
    // Settlements Filter State: 'all' or 'my'
    const [settlementsFilterMode, setSettlementsFilterMode] = useState('my') // Start with "Mine"
    const [selectedExpenseForDetails, setSelectedExpenseForDetails] = useState(null)

    const updateExpenseFilter = (filter) => {
        setExpenseFilter(filter)
        setSearchParams({ tab: activeTab, filter })
    }

    const [members, setMembers] = useState([])
    const [memberSpending, setMemberSpending] = useState([])
    const [debts, setDebts] = useState({}) // { [payerId]: { [receiverId]: amount } }
    const [initialSettlementData, setInitialSettlementData] = useState(null)
    const [selectedSettlement, setSelectedSettlement] = useState(null)

    useEffect(() => {
        fetchData()
    }, [currentGroup.id])

    const fetchData = async () => {
        try {
            const { data: expensesData, error: expensesError } = await supabase
                .from('expenses')
                .select(`
          *,
          paid_by_profile:paid_by (full_name),
          created_by_profile:created_by (full_name)
        `)
                .eq('group_id', currentGroup.id)
                .order('date', { ascending: false })

            if (expensesError) throw expensesError

            // Fetch current members
            const { data: membersData, error: membersError } = await supabase
                .from('group_members')
                .select('user_id, profiles(full_name, avatar_url)')
                .eq('group_id', currentGroup.id)

            if (membersError) throw membersError

            const expenseIds = (expensesData || []).map(e => e.id)
            if (expenseIds.length === 0) {
                // If no expenses, just show current members
                const formattedMembers = (membersData || []).map(m => ({
                    id: m.user_id,
                    name: m.profiles?.full_name || 'Unknown',
                    avatar: m.profiles?.avatar_url
                }))
                setMembers(formattedMembers)
                setBalance(0)
                setMemberSpending([])
                setExpenses([])
                return
            }

            const { data: splits, error: splitsErr } = await supabase
                .from('expense_splits')
                .select('user_id, owe_amount, expense_id')
                .in('expense_id', expenseIds)

            if (splitsErr) throw splitsErr

            // Fetch ALL settlement details for these expenses to track status
            let settlementStatusMap = {}
            let excludedExpenseIds = new Set()

            if (expenseIds && expenseIds.length > 0) {
                const { data: allSettlements } = await supabase
                    .from('settlement_details')
                    .select('expense_id, settlement_status, settlement_method')
                    .in('expense_id', expenseIds)

                allSettlements?.forEach(s => {
                    settlementStatusMap[s.expense_id] = {
                        status: s.settlement_status,
                        method: s.settlement_method
                    }
                    // Exclude from calculations if not confirmed
                    if (s.settlement_status !== 'confirmed') {
                        excludedExpenseIds.add(s.expense_id)
                    }
                })
            }

            // Enhanced expenses with settlement status and involved check
            const enhancedExpenses = (expensesData || []).map(e => {
                // Determine if currentUser is involved in this expense (via splits)
                const mySplit = splits?.find(s => s.expense_id === e.id && s.user_id === session.user.id)
                // Find receiver (the one who split matches but is not the payer)
                const receiverSplit = splits?.find(s => s.expense_id === e.id && s.user_id !== e.paid_by)

                return {
                    ...e,
                    settlement_status: settlementStatusMap[e.id]?.status,
                    settlement_method: settlementStatusMap[e.id]?.method,
                    is_involved: e.paid_by === session.user.id || !!mySplit,
                    receiver_id: receiverSplit?.user_id
                }
            })

            setExpenses(enhancedExpenses)

            // Filter out unconfirmed settlements for calculations
            const activeExpenses = expensesData?.filter(e => !excludedExpenseIds.has(e.id)) || []
            const activeSplits = splits?.filter(s => !excludedExpenseIds.has(s.expense_id)) || []

            // COLLECT ALL INVOLVED USERS (Current Members + Historical Payers + Split Participants)
            const allInvolvedUserIds = new Set()

            // Add current members
            membersData?.forEach(m => allInvolvedUserIds.add(m.user_id))

            // Add expense payers
            activeExpenses.forEach(e => allInvolvedUserIds.add(e.paid_by))

            // Add split people
            activeSplits.forEach(s => allInvolvedUserIds.add(s.user_id))

            const uniqueUserIds = Array.from(allInvolvedUserIds)

            // Fetch profiles for everyone involved
            const { data: profilesData, error: profilesError } = await supabase
                .from('profiles')
                .select('id, full_name, avatar_url, upi_id, country')
                .in('id', uniqueUserIds)

            if (profilesError) throw profilesError

            // Map profiles to a friendly objects map
            const profilesMap = {}
            profilesData?.forEach(p => {
                profilesMap[p.id] = p
            })

            // Identify current member IDs for tagging ex-members if needed (optional)
            const currentMemberIds = new Set(membersData?.map(m => m.user_id))

            // Build the final member list for display
            const historicalMembers = uniqueUserIds.map(uid => {
                const profile = profilesMap[uid]
                const isCurrent = currentMemberIds.has(uid)
                return {
                    id: uid,
                    name: (profile?.full_name || 'Unknown') + (!isCurrent ? ' (Left)' : ''),
                    avatar: profile?.avatar_url,
                    upiId: profile?.upi_id || null,
                    country: profile?.country || 'US',
                    isCurrent: isCurrent
                }
            })

            // Sort: Current members first, then others
            historicalMembers.sort((a, b) => {
                if (a.isCurrent && !b.isCurrent) return -1
                if (!a.isCurrent && b.isCurrent) return 1
                return a.name.localeCompare(b.name)
            })

            setMembers(historicalMembers)

            // Calculate member spending based on their SHARE (owe_amount)
            const spendingMap = {}
            let totalExpenses = 0

            activeExpenses.forEach(exp => {
                if (exp.category !== 'settlement') {
                    totalExpenses += parseFloat(exp.amount)
                }
            })

            activeSplits.forEach(split => {
                const expense = activeExpenses.find(e => e.id === split.expense_id)
                if (expense && expense.category !== 'settlement') {
                    if (!spendingMap[split.user_id]) {
                        spendingMap[split.user_id] = 0
                    }
                    spendingMap[split.user_id] += parseFloat(split.owe_amount)
                }
            })

            const spendingArray = historicalMembers.map(member => ({
                ...member,
                spent: spendingMap[member.id] || 0,
                percentage: totalExpenses > 0 ? ((spendingMap[member.id] || 0) / totalExpenses) * 100 : 0
            })).sort((a, b) => b.spent - a.spent)

            setMemberSpending(spendingArray)

            let myNet = 0

            // Debt Calculation Logic (Net Balances)
            const netBalances = {}

            activeExpenses.forEach(exp => {
                const payerId = exp.paid_by

                if (exp.paid_by === session.user.id) {
                    myNet += parseFloat(exp.amount)
                }

                // Initialize balance map
                if (!netBalances[payerId]) netBalances[payerId] = {}
            })

            activeSplits.forEach(split => {
                const debtorId = split.user_id
                const expense = activeExpenses.find(e => e.id === split.expense_id)
                if (!expense) return

                const payerId = expense.paid_by
                const amt = parseFloat(split.owe_amount)

                if (split.user_id === session.user.id) {
                    myNet -= parseFloat(split.owe_amount)
                }

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

            setBalance(myNet)
            setDebts(netBalances)

        } catch (error) {
            console.error('Error fetching data:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleDataChanged = () => {
        fetchData()
    }

    const handleGroupUpdated = (updatedGroup) => {
        setCurrentGroup(updatedGroup)
    }

    const handleEditExpense = (expense) => {
        setExpenseToEdit(expense)
        if (expense.category === 'settlement') {
            setIsSettleModalOpen(true)
        } else {
            setIsExpenseModalOpen(true)
        }
    }

    const handleDeleteExpense = async (expenseId) => {
        try {
            const { error } = await supabase
                .from('expenses')
                .delete()
                .eq('id', expenseId)

            if (error) throw error
            handleDataChanged()
        } catch (error) {
            console.error('Error deleting expense:', error)
            alert('Failed to delete expense')
        }
    }

    const closeExpenseModal = () => {
        setIsExpenseModalOpen(false)
        setExpenseToEdit(null)
    }

    const closeSettleModal = () => {
        setIsSettleModalOpen(false)
        setExpenseToEdit(null)
        setInitialSettlementData(null)
    }

    const openSettleModalWithData = (data) => {
        setInitialSettlementData(data)
        setIsSettleModalOpen(true)
    }

    // --- RENDER LOGIC for Filtered List ---
    const filteredExpenses = expenses.filter(e => {
        if (expenseFilter === 'expenses') return e.category !== 'settlement'

        // Settlement Filter Logic
        if (e.category === 'settlement') {
            if (settlementsFilterMode === 'all') return true
            // "My Settlements" = Involved as Payer OR Receiver
            if (settlementsFilterMode === 'my') return e.is_involved
            // "Others" = NOT Involved
            if (settlementsFilterMode === 'others') return !e.is_involved

            return true
        }
        return false
    })

    return (
        <div className="details-container">
            <header className="details-header">
                <button onClick={onBack} className="back-btn">
                    <ArrowLeft size={24} />
                </button>
                <div className="header-info">
                    <h1>{currentGroup.name}</h1>
                    <span className="currency-tag">{currentGroup.currency}</span>
                </div>
                <button
                    className="settings-btn"
                    title="Group Settings"
                    onClick={() => setIsSettingsModalOpen(true)}
                >
                    <Settings size={24} />
                </button>
            </header>

            {/* Tab Navigation */}
            <div className="tab-navigation">
                <button
                    className={`tab-btn ${activeTab === 'expenses' ? 'active' : ''}`}
                    onClick={() => setActiveTab('expenses')}
                >
                    <Receipt size={18} />
                    Transactions
                </button>
                <button
                    className={`tab-btn ${activeTab === 'balances' ? 'active' : ''}`}
                    onClick={() => setActiveTab('balances')}
                >
                    <Banknote size={18} />
                    Balances
                </button>
            </div>

            {/* Expenses Tab */}
            {activeTab === 'expenses' && (
                <div className="expenses-section">
                    <div className="section-header">
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <select
                                className="expense-filter-dropdown"
                                value={expenseFilter}
                                onChange={(e) => updateExpenseFilter(e.target.value)}
                            >
                                <option value="expenses">Expenses</option>
                                <option value="settlements">Settlements</option>
                            </select>
                            {/* Settlement Filter Dropdown - In the Corner */}
                            {expenseFilter === 'settlements' && (
                                <select
                                    className="settlement-filter-dropdown"
                                    value={settlementsFilterMode}
                                    onChange={(e) => setSettlementsFilterMode(e.target.value)}
                                >
                                    <option value="all">All</option>
                                    <option value="my">Mine</option>
                                    <option value="others">Others</option>
                                </select>
                            )}
                        </div>

                        {expenseFilter === 'expenses' && (
                            <button
                                className="add-expense-btn"
                                onClick={() => setIsExpenseModalOpen(true)}
                            >
                                <Plus size={20} /> Add Expense
                            </button>
                        )}
                    </div>

                    {/* Show Debts Summary when filtering by Settlements */}
                    {expenseFilter === 'settlements' && (
                        <div className="debts-section-preview">
                            {Object.keys(debts).length === 0 ? (
                                <div className="empty-debts">
                                    <p>✨ You are all settled up! No pending debts.</p>
                                </div>
                            ) : (
                                <>
                                    {/* 1. Debts involving YOU */}
                                    {(() => {
                                        const myDebts = debts[session.user.id] || {}
                                        const otherUsers = members.filter(m => m.id !== session.user.id)
                                        let hasDebts = false

                                        const debtCards = otherUsers.map(user => {
                                            const amountIOwe = myDebts[user.id] || 0
                                            const amountTheyOwe = (debts[user.id] || {})[session.user.id] || 0

                                            if (amountIOwe > 0.01) {
                                                hasDebts = true
                                                return (
                                                    <div key={user.id} className="debt-card owe" onClick={() => openSettleModalWithData({ receiver: user.id, amount: amountIOwe, locked: true })}>
                                                        <div className="debt-info">
                                                            <div className="debt-text">
                                                                <span>You owe <strong>{user.name}</strong></span>
                                                            </div>
                                                        </div>
                                                        <span className="debt-amount negative">
                                                            {currentGroup.currency === 'USD' || currentGroup.currency === 'CAD' ? '$' : currentGroup.currency === 'EUR' ? '€' : currentGroup.currency === 'INR' ? '₹' : currentGroup.currency}
                                                            {amountIOwe.toFixed(2)}
                                                        </span>
                                                    </div>
                                                )
                                            }

                                            if (amountTheyOwe > 0.01) {
                                                hasDebts = true
                                                return (
                                                    <div key={user.id} className="debt-card owed" onClick={() => openSettleModalWithData({ payer: user.id, receiver: session.user.id, amount: amountTheyOwe, locked: true })} style={{ cursor: 'pointer' }}>
                                                        <div className="debt-info">
                                                            <div className="debt-text">
                                                                <span><strong>{user.name}</strong> owes you</span>
                                                            </div>
                                                        </div>
                                                        <span className="debt-amount positive">
                                                            {currentGroup.currency === 'USD' || currentGroup.currency === 'CAD' ? '$' : currentGroup.currency === 'EUR' ? '€' : currentGroup.currency === 'INR' ? '₹' : currentGroup.currency}
                                                            {amountTheyOwe.toFixed(2)}
                                                        </span>
                                                    </div>
                                                )
                                            }
                                            return null
                                        })

                                        if (!hasDebts) {
                                            return (
                                                <div className="empty-debts">
                                                    <p>✨ You are all settled up! No pending debts.</p>
                                                </div>
                                            )
                                        }

                                        return debtCards
                                    })()}
                                </>
                            )}
                        </div>
                    )}

                    {loading ? (
                        <div className="loading">Loading...</div>
                    ) : filteredExpenses.length === 0 ? (
                        <div className="empty-state">
                            <p>No {expenseFilter} found.</p>
                            {expenseFilter === 'expenses' && (
                                <p className="sub-text">Tap "+ Add Expense" to get started.</p>
                            )}
                        </div>
                    ) : (
                        <div className="expenses-list">
                            {filteredExpenses.map((expense) => (
                                <div key={expense.id} className={`expense-item ${expense.category === 'settlement' ? 'settlement-item' : ''}`}>
                                    <div className="expense-date">
                                        <span className="month">
                                            {new Date(expense.date).toLocaleDateString('en-US', { month: 'short' })}
                                        </span>
                                        <span className="day">
                                            {new Date(expense.date).getDate()}
                                        </span>
                                    </div>
                                    <div className="expense-icon">
                                        {expense.category === 'settlement' ? <Banknote size={24} /> : <Receipt size={24} />}
                                    </div>
                                    <div className="expense-info">
                                        <h4>
                                            {expense.category === 'settlement' ? (() => {
                                                const receiver = members.find(m => m.id === expense.receiver_id)
                                                const receiverName = receiver ? receiver.name.split(' ')[0] : 'Unknown'
                                                return `Settlement to ${receiverName}`
                                            })() : expense.description}
                                        </h4>
                                        <p>
                                            {expense.category === 'settlement' ? (
                                                /* Status Display instead of Notes */
                                                <span style={{
                                                    fontSize: '0.85em',
                                                    fontWeight: '600',
                                                    display: 'block',
                                                    marginBottom: '2px',
                                                    color: expense.settlement_status === 'confirmed' ? '#10b981' :
                                                        expense.settlement_status === 'cancelled' ? '#ef4444' :
                                                            '#f59e0b'
                                                }}>
                                                    {expense.settlement_status === 'confirmed' ? 'Confirmed' :
                                                        expense.settlement_status === 'cancelled' ? 'Cancelled' :
                                                            expense.settlement_status === 'pending_confirmation' ? 'Pending Confirmation' :
                                                                'Pending UTR'}
                                                </span>
                                            ) : null}

                                            <span style={{ color: 'var(--text-secondary)' }}>
                                                {expense.paid_by === session.user.id
                                                    ? 'You'
                                                    : expense.paid_by_profile?.full_name?.split(' ')[0] || 'Unknown'} paid
                                            </span>
                                        </p>
                                    </div>
                                    <div className="expense-amount">
                                        <span className="amount">
                                            {currentGroup.currency === 'USD' || currentGroup.currency === 'CAD' ? '$' :
                                                currentGroup.currency === 'EUR' ? '€' :
                                                    currentGroup.currency === 'INR' ? '₹' : currentGroup.currency}
                                            {expense.amount}
                                        </span>
                                    </div>
                                    <div className="expense-actions">
                                        {expense.category === 'settlement' ? (
                                            <button
                                                className="action-btn info"
                                                onClick={() => setSelectedSettlement(expense)}
                                                title="View Details"
                                            >
                                                <Info size={18} />
                                            </button>
                                        ) : (
                                            <button
                                                className="action-btn info"
                                                onClick={() => setSelectedExpenseForDetails(expense)}
                                                title="View Details"
                                            >
                                                <Info size={18} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Balances Tab */}
            {activeTab === 'balances' && (
                <div className="balances-view">
                    {loading ? (
                        <div className="loading">Loading balances...</div>
                    ) : (
                        <>
                            {/* Total Expenses Card */}
                            <div className="total-card">
                                <h3>Total Group Expenses</h3>
                                <div className="total-amount">
                                    {currentGroup.currency === 'USD' || currentGroup.currency === 'CAD' ? '$' :
                                        currentGroup.currency === 'EUR' ? '€' :
                                            currentGroup.currency === 'INR' ? '₹' : currentGroup.currency}
                                    {expenses
                                        .filter(exp => exp.category !== 'settlement')
                                        .reduce((sum, exp) => sum + parseFloat(exp.amount), 0).toFixed(2)}
                                </div>
                            </div>

                            {/* Member Spending List */}
                            {memberSpending.length > 0 && expenses.length > 0 && (
                                <div className="member-spending-list">
                                    <h3>Members share</h3>
                                    {memberSpending.map((member, index) => {
                                        const colors = [
                                            'var(--primary)',
                                            'var(--primary-hover)',
                                            '#d4a574',
                                            '#b8935e',
                                            '#9c8048',
                                            '#806d32'
                                        ]
                                        return (
                                            <div key={member.id} className="member-spending-item">
                                                <div className="member-color" style={{ backgroundColor: colors[index % colors.length] }}></div>
                                                <div className="member-info">
                                                    <span className="member-name">
                                                        {member.id === session.user.id ? 'You' : member.name}
                                                    </span>
                                                    <span className="member-percentage">{member.percentage.toFixed(1)}%</span>
                                                </div>
                                                <div className="member-amount">
                                                    {currentGroup.currency === 'USD' || currentGroup.currency === 'CAD' ? '$' :
                                                        currentGroup.currency === 'EUR' ? '€' :
                                                            currentGroup.currency === 'INR' ? '₹' : currentGroup.currency}
                                                    {member.spent.toFixed(2)}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}

                            {expenses.length === 0 && (
                                <div className="empty-state">
                                    <p>No expenses yet.</p>
                                    <p className="sub-text">Add expenses to see spending breakdown.</p>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {isExpenseModalOpen && (
                <AddExpenseModal
                    isOpen={isExpenseModalOpen}
                    onClose={closeExpenseModal}
                    group={currentGroup}
                    currentUser={session.user}
                    members={members}
                    onExpenseAdded={handleDataChanged}
                    expenseToEdit={expenseToEdit}
                    onDelete={handleDeleteExpense}
                />
            )}

            {isSettleModalOpen && (
                <SettleUpModal
                    isOpen={isSettleModalOpen}
                    onClose={closeSettleModal}
                    group={currentGroup}
                    currentUser={session.user}
                    members={members}
                    onPaymentRecorded={handleDataChanged}
                    initialData={initialSettlementData}
                />
            )}

            {isSettingsModalOpen && (
                <GroupSettingsModal
                    group={currentGroup}
                    currentUser={session.user}
                    onClose={() => setIsSettingsModalOpen(false)}
                    onGroupUpdated={handleGroupUpdated}
                    onGroupLeft={onBack}
                />
            )}

            {selectedSettlement && (
                <SettlementDetailsModal
                    expense={selectedSettlement}
                    currentUser={session.user}
                    members={members}
                    group={currentGroup}
                    onClose={() => setSelectedSettlement(null)}
                    onUpdate={handleDataChanged}
                />
            )}

            {selectedExpenseForDetails && (
                <ExpenseDetailsModal
                    expense={selectedExpenseForDetails}
                    group={currentGroup}
                    members={members}
                    currentUser={session.user}
                    onClose={() => setSelectedExpenseForDetails(null)}
                    onEdit={handleEditExpense}
                    onDelete={handleDeleteExpense}
                />
            )}
        </div>
    )
}
