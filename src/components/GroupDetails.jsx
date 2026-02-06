
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { ArrowLeft, Plus, Receipt, Settings, Banknote, Trash2, Pencil, Info } from 'lucide-react'
import AddExpenseModal from './AddExpenseModal'
import SettleUpModal from './SettleUpModal'
import GroupSettingsModal from './GroupSettingsModal'
import SettlementDetailsModal from './SettlementDetailsModal'
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
    const [activeTab, setActiveTab] = useState('expenses')
    const [members, setMembers] = useState([])
    const [memberSpending, setMemberSpending] = useState([])
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
          paid_by_profile:paid_by (full_name)
        `)
                .eq('group_id', currentGroup.id)
                .order('date', { ascending: false })

            if (expensesError) throw expensesError
            setExpenses(expensesData || [])

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
                return
            }

            const { data: splits, error: splitsErr } = await supabase
                .from('expense_splits')
                .select('user_id, owe_amount, expense_id')
                .in('expense_id', expenseIds)

            if (splitsErr) throw splitsErr

            // COLLECT ALL INVOLVED USERS (Current Members + Historical Payers + Split Participants)
            const allInvolvedUserIds = new Set()

            // Add current members
            membersData?.forEach(m => allInvolvedUserIds.add(m.user_id))

            // Add expense payers
            expensesData?.forEach(e => allInvolvedUserIds.add(e.paid_by))

            // Add split people
            splits?.forEach(s => allInvolvedUserIds.add(s.user_id))

            const uniqueUserIds = Array.from(allInvolvedUserIds)

            // Fetch profiles for everyone involved
            const { data: profilesData, error: profilesError } = await supabase
                .from('profiles')
                .select('id, full_name, avatar_url')
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
            // We iterate over uniqueUserIds so we include everyone
            const historicalMembers = uniqueUserIds.map(uid => {
                const profile = profilesMap[uid]
                const isCurrent = currentMemberIds.has(uid)
                return {
                    id: uid,
                    name: (profile?.full_name || 'Unknown') + (!isCurrent ? ' (Left)' : ''),
                    avatar: profile?.avatar_url,
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

            expensesData?.forEach(exp => {
                totalExpenses += parseFloat(exp.amount)
            })

            splits?.forEach(split => {
                if (!spendingMap[split.user_id]) {
                    spendingMap[split.user_id] = 0
                }
                spendingMap[split.user_id] += parseFloat(split.owe_amount)
            })

            const spendingArray = historicalMembers.map(member => ({
                ...member,
                spent: spendingMap[member.id] || 0,
                percentage: totalExpenses > 0 ? ((spendingMap[member.id] || 0) / totalExpenses) * 100 : 0
            })).sort((a, b) => b.spent - a.spent)

            setMemberSpending(spendingArray)

            let myNet = 0
            expensesData.forEach(exp => {
                if (exp.paid_by === session.user.id) {
                    myNet += parseFloat(exp.amount)
                }
            })
            splits.forEach(split => {
                if (split.user_id === session.user.id) {
                    myNet -= parseFloat(split.owe_amount)
                }
            })
            setBalance(myNet)

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
        if (!window.confirm('Are you sure you want to delete this expense?')) return

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
    }

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

            <div className="balances-card">
                <div className="balance-header">
                    <h3>Your Balance</h3>
                    {Math.abs(balance) > 0.01 && (
                        <button className="settle-up-link" onClick={() => setIsSettleModalOpen(true)}>
                            Settle Up
                        </button>
                    )}
                </div>

                {balance === 0 ? (
                    <p className="empty-balance">You are all settled up!</p>
                ) : (
                    <div className={`balance-item ${balance > 0 ? 'positive' : 'negative'}`}>
                        {balance > 0 ? 'You are owed ' : 'You owe '}
                        <strong>
                            {currentGroup.currency === 'USD' ? '$' : currentGroup.currency === 'EUR' ? '€' : currentGroup.currency === 'INR' ? '₹' : currentGroup.currency}
                            {Math.abs(balance).toFixed(2)}
                        </strong>
                    </div>
                )}
            </div>

            {/* Tab Navigation */}
            <div className="tab-navigation">
                <button
                    className={`tab-btn ${activeTab === 'expenses' ? 'active' : ''}`}
                    onClick={() => setActiveTab('expenses')}
                >
                    <Receipt size={18} />
                    Expenses
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
                        <h2>Expenses</h2>
                        <button
                            className="add-expense-btn"
                            onClick={() => setIsExpenseModalOpen(true)}
                        >
                            <Plus size={20} /> Add Expense
                        </button>
                    </div>

                    {loading ? (
                        <div className="loading">Loading expenses...</div>
                    ) : expenses.length === 0 ? (
                        <div className="empty-state">
                            <p>No expenses yet.</p>
                            <p className="sub-text">Tap "+ Add Expense" to get started.</p>
                        </div>
                    ) : (
                        <div className="expenses-list">
                            {expenses.map((expense) => (
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
                                        <h4>{expense.description}</h4>
                                        <p>
                                            {expense.paid_by === session.user.id
                                                ? 'You'
                                                : expense.paid_by_profile?.full_name?.split(' ')[0] || 'Unknown'} paid
                                        </p>
                                    </div>
                                    <div className="expense-amount">
                                        <span className="amount">
                                            {currentGroup.currency === 'USD' ? '$' :
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
                                                className="action-btn edit"
                                                onClick={() => handleEditExpense(expense)}
                                                title="Edit"
                                            >
                                                <Pencil size={18} />
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
                                    {currentGroup.currency === 'USD' ? '$' :
                                        currentGroup.currency === 'EUR' ? '€' :
                                            currentGroup.currency === 'INR' ? '₹' : currentGroup.currency}
                                    {expenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0).toFixed(2)}
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
                                                    {currentGroup.currency === 'USD' ? '$' :
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
                    group={currentGroup}
                    currentUser={session.user}
                    members={members}
                    onClose={closeExpenseModal}
                    onExpenseAdded={handleDataChanged}
                    expenseToEdit={expenseToEdit}
                    onDelete={handleDeleteExpense}
                />
            )}

            {isSettleModalOpen && (
                <SettleUpModal
                    group={currentGroup}
                    currentUser={session.user}
                    members={members}
                    onClose={closeSettleModal}
                    onPaymentRecorded={handleDataChanged}
                    expenseToEdit={expenseToEdit}
                    onDelete={handleDeleteExpense}
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
                    onClose={() => setSelectedSettlement(null)}
                    onUpdate={handleDataChanged}
                />
            )}
        </div>
    )
}
