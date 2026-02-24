import React from 'react'
import { createPortal } from 'react-dom'
import { X, Pencil, Trash2, Calendar, User, CreditCard } from 'lucide-react'
import { getCurrencySymbol } from '../utils/currency'
import { formatDate, getMemberName } from '../utils/formatters'
import './AddExpenseModal.css' // Reusing modal styles

export default function ExpenseDetailsModal({ expense, group, members, currentUser, onClose, onEdit, onDelete }) {
    if (!expense) return null

    const getDisplayName = (id) => getMemberName(id, currentUser.id, members)

    const currencySymbol = getCurrencySymbol(group.currency)

    // Calculate splits if available (passed in expense object or need fetching? 
    // Usually GroupDetails fetches basic info. We might need to pass splits or fetch them here if not present.
    // For now, let's assume parent passes enhanced stats or we just show basic info + Edit button to see splits)

    // Actually, distinct visual for "Who was involved" is nice. 
    // But since `GroupDetails` doesn't fetch splits for *every* expense in the list (only aggregates), 
    // we might just show the basic info and let "Edit" show the deep split details.
    // OR we can fetch splits here. Let's do a quick fetch for full details to be useful.

    return createPortal(
        <div className="modal-overlay">
            <div className="modal-card">
                <div className="modal-header">
                    <h2>Expense Details</h2>
                    <button onClick={onClose} className="close-btn">
                        <X size={20} />
                    </button>
                </div>

                <div className="expense-details-content" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '0.5rem 0' }}>

                    {/* Amount & Description */}
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '2.5rem', fontWeight: '800', color: 'var(--primary)' }}>
                            {currencySymbol}{expense.amount}
                        </div>
                        <div style={{ fontSize: '1.2rem', fontWeight: '600', color: 'var(--text-primary)', marginTop: '0.5rem' }}>
                            {expense.description}
                        </div>
                    </div>

                    {/* Metadata Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', background: 'var(--bg-input)', padding: '1rem', borderRadius: '12px' }}>
                        <div className="detail-item">
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <CreditCard size={14} /> Paid By
                            </span>
                            <span style={{ fontWeight: '600', fontSize: '1rem' }}>{getDisplayName(expense.paid_by)}</span>
                        </div>

                        <div className="detail-item">
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <User size={14} /> Added By
                            </span>
                            <span style={{ fontWeight: '600', fontSize: '1rem' }}>
                                {expense.created_by ? getDisplayName(expense.created_by) : <span style={{ fontStyle: 'italic', opacity: 0.7 }}>Unknown</span>}
                            </span>
                        </div>

                        <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Calendar size={14} /> Date
                            </span>
                            <span style={{ fontWeight: '600', fontSize: '1rem' }}>{formatDate(expense.date)}</span>
                        </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                        <button
                            onClick={() => {
                                onEdit(expense)
                                onClose()
                            }}
                            className="create-btn"
                            style={{ flex: 1, marginTop: 0 }}
                        >
                            <Pencil size={18} style={{ marginRight: '8px' }} /> Edit Expense
                        </button>

                        <button
                            onClick={async () => {
                                if (window.confirm('Are you sure you want to delete this expense?')) {
                                    await onDelete(expense.id)
                                    onClose()
                                }
                            }}
                            className="delete-expense-btn"
                            style={{ flex: 1, marginTop: 0, background: 'var(--bg-input)', color: '#ef4444' }}
                        >
                            <Trash2 size={18} />
                        </button>
                    </div>

                </div>
            </div>
        </div>,
        document.getElementById('modal-root')
    )
}
