
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { getCurrencySymbol } from '../utils/currency'
import { HandCoins, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2 } from 'lucide-react'
import './FriendsSummary.css'

export default function FriendsSummary({ session }) {
    const [loading, setLoading] = useState(true)
    const [friendNets, setFriendNets] = useState([]) // [{ friendId, name, currency, netAmount, groupBreakdown, hasPending }]
    const [expandedFriend, setExpandedFriend] = useState(null)
    const [settleTarget, setSettleTarget] = useState(null) // friend object to settle with
    const [settling, setSettling] = useState(false)
    const [confirmTarget, setConfirmTarget] = useState(null) // pending batch to confirm
    const [confirming, setConfirming] = useState(false)
    const [toast, setToast] = useState(null)

    const showToast = (msg, type = 'info') => {
        setToast({ msg, type })
        setTimeout(() => setToast(null), 3500)
    }

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const userId = session.user.id

            // 1. All groups I am a member of
            const { data: memberRows, error: memberErr } = await supabase
                .from('group_members')
                .select('group_id, groups(id, name, currency)')
                .eq('user_id', userId)

            if (memberErr) throw memberErr

            const groups = (memberRows || []).map(r => r.groups).filter(Boolean)
            if (groups.length === 0) {
                setFriendNets([])
                return
            }

            const groupIds = groups.map(g => g.id)
            const groupMap = {}
            groups.forEach(g => { groupMap[g.id] = g })

            // 2. Fetch all expenses, splits, members, settlement_details in parallel
            const [expRes, splitRes, allMembersRes, settlRes] = await Promise.all([
                supabase
                    .from('expenses')
                    .select('id, group_id, paid_by, amount, category')
                    .in('group_id', groupIds),
                supabase
                    .from('expense_splits')
                    .select('expense_id, user_id, owe_amount'),
                supabase
                    .from('group_members')
                    .select('group_id, user_id, profiles(id, full_name)')
                    .in('group_id', groupIds),
                supabase
                    .from('settlement_details')
                    .select('expense_id, settlement_status, cross_group_batch_id, initiated_by, confirmed_by')
            ])

            if (expRes.error) throw expRes.error
            if (splitRes.error) throw splitRes.error
            if (allMembersRes.error) throw allMembersRes.error
            // settlement_details error is tolerated — not all expenses have one

            const expenses = expRes.data || []
            const allSplits = splitRes.data || []
            const allMemberRows = allMembersRes.data || []
            const allSettlements = settlRes.data || []

            // 3. Build profile map from group_members
            const profileMap = {}
            allMemberRows.forEach(m => {
                if (m.profiles) profileMap[m.user_id] = m.profiles
            })

            // 4. Build settlement status map keyed by expense_id
            const settlStatusMap = {}
            allSettlements.forEach(s => {
                settlStatusMap[s.expense_id] = s
            })

            // 5. Exclude unconfirmed settlements from debt calculation
            const excludedExpenseIds = new Set()
            allSettlements.forEach(s => {
                if (s.settlement_status !== 'confirmed') {
                    excludedExpenseIds.add(s.expense_id)
                }
            })

            // 6. Build groupId → set of member userIds
            const groupMemberMap = {}
            allMemberRows.forEach(m => {
                if (!groupMemberMap[m.group_id]) groupMemberMap[m.group_id] = new Set()
                groupMemberMap[m.group_id].add(m.user_id)
            })

            // 7. For each friend, collect which groups they share with me
            const friendGroupsMap = {} // { friendId: Set<groupId> }
            allMemberRows.forEach(m => {
                if (m.user_id === userId) return
                if (!friendGroupsMap[m.user_id]) friendGroupsMap[m.user_id] = new Set()
                friendGroupsMap[m.user_id].add(m.group_id)
            })

            // 8. Active expenses and splits (filtered)
            const activeExpenses = expenses.filter(e => !excludedExpenseIds.has(e.id))
            const activeExpenseMap = new Map()
            activeExpenses.forEach(e => activeExpenseMap.set(e.id, e))

            const activeSplits = allSplits.filter(s => activeExpenseMap.has(s.expense_id))

            // 9. Build per-group netBalances: { groupId: { payerId: { debtorId: netAmt } } }
            //    netBalances[groupId][debtorId][payerId] = amount debtor owes payer (positive)
            const perGroupNets = {}

            activeExpenses.forEach(exp => {
                if (!perGroupNets[exp.group_id]) perGroupNets[exp.group_id] = {}
            })

            activeSplits.forEach(split => {
                const exp = activeExpenseMap.get(split.expense_id)
                if (!exp) return

                const gid = exp.group_id
                const payerId = exp.paid_by
                const debtorId = split.user_id
                const amt = parseFloat(split.owe_amount)

                if (payerId === debtorId) return

                if (!perGroupNets[gid]) perGroupNets[gid] = {}
                if (!perGroupNets[gid][debtorId]) perGroupNets[gid][debtorId] = {}
                if (!perGroupNets[gid][debtorId][payerId]) perGroupNets[gid][debtorId][payerId] = 0
                perGroupNets[gid][debtorId][payerId] += amt

                if (!perGroupNets[gid][payerId]) perGroupNets[gid][payerId] = {}
                if (!perGroupNets[gid][payerId][debtorId]) perGroupNets[gid][payerId][debtorId] = 0
                perGroupNets[gid][payerId][debtorId] -= amt
            })

            // 10. For each friend: check currency consistency, then aggregate net
            const results = []

            for (const [friendId, sharedGroupIds] of Object.entries(friendGroupsMap)) {
                const sharedGroups = Array.from(sharedGroupIds).map(gid => groupMap[gid]).filter(Boolean)

                // Currency consistency check — all shared groups must use the same currency
                const currencies = [...new Set(sharedGroups.map(g => g.currency))]
                if (currencies.length !== 1) continue // mixed currencies — skip entirely

                const currency = currencies[0]

                // Build per-group breakdown of net between me and this friend
                let totalNet = 0
                const groupBreakdown = []

                sharedGroups.forEach(g => {
                    const gNet = perGroupNets[g.id] || {}
                    // Read only from userId's perspective:
                    // positive → I owe friend, negative → friend owes me
                    const net = (gNet[userId] && gNet[userId][friendId]) || 0

                    if (Math.abs(net) > 0.009) {
                        groupBreakdown.push({ groupId: g.id, groupName: g.name, net })
                        totalNet += net
                    }
                })

                if (Math.abs(totalNet) < 0.01) continue // no meaningful debt

                // 11. Check for pending settlements between me and this friend across shared groups
                const sharedExpenseIds = activeExpenses
                    .filter(e => sharedGroupIds.has(e.group_id))
                    .map(e => e.id)

                // Also check ALL expenses (including excluded) for pending status
                const allSharedExpenseIds = expenses
                    .filter(e => sharedGroupIds.has(e.group_id))
                    .map(e => e.id)

                const pendingSettlements = allSettlements.filter(s =>
                    allSharedExpenseIds.includes(s.expense_id) &&
                    (s.settlement_status === 'pending_utr' || s.settlement_status === 'pending_confirmation') &&
                    (s.initiated_by === userId || s.initiated_by === friendId)
                )

                // Check for pending cross-group batch initiated BY THIS friend TO ME
                const pendingIncomingBatch = allSettlements.find(s =>
                    allSharedExpenseIds.includes(s.expense_id) &&
                    s.settlement_status === 'pending_confirmation' &&
                    s.cross_group_batch_id &&
                    s.initiated_by === friendId
                )

                const friendName = profileMap[friendId]?.full_name || 'Unknown'

                results.push({
                    friendId,
                    name: friendName,
                    currency,
                    netAmount: totalNet,
                    groupBreakdown,
                    hasPending: pendingSettlements.length > 0,
                    pendingIncomingBatch: pendingIncomingBatch || null
                })
            }

            // Sort: people who owe me first (negative net), then people I owe (positive net)
            results.sort((a, b) => a.netAmount - b.netAmount)

            setFriendNets(results)
        } catch (err) {
            console.error('FriendsSummary fetchData error:', err)
            showToast('Failed to load friends data', 'error')
        } finally {
            setLoading(false)
        }
    }, [session.user.id])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    // --- Settle flow ---
    const handleSettleConfirm = async () => {
        if (!settleTarget || settling) return
        setSettling(true)
        try {
            const userId = session.user.id
            const batchId = crypto.randomUUID()
            const now = new Date().toISOString()

            for (const { groupId, groupName, net } of settleTarget.groupBreakdown) {
                if (Math.abs(net) < 0.01) continue

                // net > 0 means I owe friend → I am payer, friend is receiver
                // net < 0 means friend owes me → friend is payer, I am receiver
                const iAmPayer = net > 0
                const payerId = iAmPayer ? userId : settleTarget.friendId
                const receiverId = iAmPayer ? settleTarget.friendId : userId
                const amount = Math.abs(net).toFixed(2)

                // Insert settlement expense
                const { data: expData, error: expErr } = await supabase
                    .from('expenses')
                    .insert({
                        group_id: groupId,
                        paid_by: payerId,
                        amount,
                        description: 'Settled in cross-view',
                        category: 'settlement',
                        date: now,
                        created_by: userId
                    })
                    .select('id')
                    .single()

                if (expErr) throw expErr

                const expenseId = expData.id

                // Insert expense_split for the receiver (they are being paid)
                const { error: splitErr } = await supabase
                    .from('expense_splits')
                    .insert({
                        expense_id: expenseId,
                        user_id: receiverId,
                        owe_amount: amount
                    })

                if (splitErr) throw splitErr

                // Insert settlement_details
                const { error: settlErr } = await supabase
                    .from('settlement_details')
                    .insert({
                        expense_id: expenseId,
                        settlement_method: 'manual',
                        settlement_status: 'pending_confirmation',
                        initiated_by: userId,
                        initiated_at: now,
                        cross_group_batch_id: batchId
                    })

                if (settlErr) throw settlErr
            }

            showToast('Settlement initiated! Waiting for confirmation.', 'success')
            setSettleTarget(null)
            await fetchData()
        } catch (err) {
            console.error('Settle error:', err)
            showToast('Failed to initiate settlement. Please try again.', 'error')
        } finally {
            setSettling(false)
        }
    }

    // --- Confirm batch flow (receiver) ---
    const handleBatchConfirm = async () => {
        if (!confirmTarget || confirming) return
        setConfirming(true)
        try {
            const batchId = confirmTarget.cross_group_batch_id
            const now = new Date().toISOString()

            // Find all settlement_details with this batch_id
            const { data: batchRecords, error: batchErr } = await supabase
                .from('settlement_details')
                .select('id')
                .eq('cross_group_batch_id', batchId)

            if (batchErr) throw batchErr

            // Confirm each one
            await Promise.all((batchRecords || []).map(rec =>
                supabase
                    .from('settlement_details')
                    .update({
                        settlement_status: 'confirmed',
                        confirmed_by: session.user.id,
                        confirmed_at: now
                    })
                    .eq('id', rec.id)
            ))

            showToast('Settlement confirmed! Debts cleared.', 'success')
            setConfirmTarget(null)
            await fetchData()
        } catch (err) {
            console.error('Confirm batch error:', err)
            showToast('Failed to confirm settlement. Please try again.', 'error')
        } finally {
            setConfirming(false)
        }
    }

    return (
        <div className="friends-container">
            <header className="friends-header">
                <h1>Friends</h1>
                <p className="friends-subtitle">Net balances across all shared groups</p>
            </header>

            {/* Toast */}
            {toast && (
                <div className={`friends-toast ${toast.type}`}>{toast.msg}</div>
            )}

            {loading ? (
                <div className="friends-loading">Loading...</div>
            ) : friendNets.length === 0 ? (
                <div className="friends-empty">
                    <HandCoins size={48} opacity={0.3} />
                    <p>No shared balances found.</p>
                    <span>You're all settled up across all groups!</span>
                </div>
            ) : (
                <div className="friends-list">
                    {friendNets.map(friend => {
                        const iOwe = friend.netAmount > 0
                        const currSym = getCurrencySymbol(friend.currency)
                        const isExpanded = expandedFriend === friend.friendId
                        const hasIncoming = !!friend.pendingIncomingBatch

                        return (
                            <div key={friend.friendId} className={`friend-card ${iOwe ? 'owe' : 'owed'}`}>
                                {/* Card Header */}
                                <div
                                    className="friend-card-header"
                                    onClick={() => setExpandedFriend(isExpanded ? null : friend.friendId)}
                                >
                                    <div className="friend-avatar">
                                        {friend.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="friend-info">
                                        <span className="friend-name">{friend.name}</span>
                                        <span className={`friend-label ${iOwe ? 'negative' : 'positive'}`}>
                                            {iOwe ? 'You owe' : 'Owes you'}
                                        </span>
                                    </div>
                                    <div className="friend-right">
                                        <span className={`friend-net-amount ${iOwe ? 'negative' : 'positive'}`}>
                                            {currSym}{Math.abs(friend.netAmount).toFixed(2)}
                                        </span>
                                        {isExpanded
                                            ? <ChevronUp size={18} className="chevron" />
                                            : <ChevronDown size={18} className="chevron" />
                                        }
                                    </div>
                                </div>

                                {/* Expanded breakdown */}
                                {isExpanded && (
                                    <div className="friend-breakdown">
                                        <div className="breakdown-list">
                                            {friend.groupBreakdown.map(gb => (
                                                <div key={gb.groupId} className="breakdown-row">
                                                    <span className="breakdown-group">{gb.groupName}</span>
                                                    <span className={`breakdown-amount ${gb.net > 0 ? 'negative' : 'positive'}`}>
                                                        {gb.net > 0 ? '-' : '+'}{currSym}{Math.abs(gb.net).toFixed(2)}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Incoming pending batch — receiver confirms */}
                                        {hasIncoming && (
                                            <div className="pending-incoming">
                                                <AlertTriangle size={16} />
                                                <span>{friend.name.split(' ')[0]} has initiated a settlement — waiting for your confirmation.</span>
                                                <button
                                                    className="btn-confirm"
                                                    onClick={() => setConfirmTarget(friend.pendingIncomingBatch)}
                                                >
                                                    <CheckCircle2 size={16} /> Confirm
                                                </button>
                                            </div>
                                        )}

                                        {/* Pending guard — block settle if any pending exists */}
                                        {friend.hasPending && !hasIncoming && (
                                            <div className="pending-warning">
                                                <AlertTriangle size={16} />
                                                <span>A settlement with {friend.name.split(' ')[0]} is pending. Resolve it in the group view first.</span>
                                            </div>
                                        )}

                                        {/* Settle button — only shown when no pending */}
                                        {!friend.hasPending && (
                                            <button
                                                className="btn-settle"
                                                onClick={() => setSettleTarget(friend)}
                                            >
                                                <HandCoins size={16} />
                                                Settle {currSym}{Math.abs(friend.netAmount).toFixed(2)} with {friend.name.split(' ')[0]}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Settle Confirmation Sheet */}
            {settleTarget && (
                <div className="modal-overlay" onClick={() => setSettleTarget(null)}>
                    <div className="settle-sheet" onClick={e => e.stopPropagation()}>
                        <h3>Settle with {settleTarget.name.split(' ')[0]}</h3>
                        <p className="settle-total">
                            Total: <strong>{getCurrencySymbol(settleTarget.currency)}{Math.abs(settleTarget.netAmount).toFixed(2)}</strong>
                        </p>

                        <div className="settle-breakdown">
                            <span className="settle-breakdown-title">Breakdown by group</span>
                            {settleTarget.groupBreakdown.map(gb => (
                                <div key={gb.groupId} className="settle-breakdown-row">
                                    <span>{gb.groupName}</span>
                                    <span className={gb.net > 0 ? 'negative' : 'positive'}>
                                        {getCurrencySymbol(settleTarget.currency)}{Math.abs(gb.net).toFixed(2)}
                                    </span>
                                </div>
                            ))}
                        </div>

                        <div className="settle-note">
                            <p>A settlement will be auto-created in each group. The other person must confirm.</p>
                            <p>For partial settlements, go to the individual group view.</p>
                        </div>

                        <div className="settle-actions">
                            <button className="btn-cancel" onClick={() => setSettleTarget(null)}>
                                Cancel
                            </button>
                            <button className="btn-confirm-settle" onClick={handleSettleConfirm} disabled={settling}>
                                {settling ? 'Settling...' : 'Confirm & Settle'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Batch Confirm Sheet */}
            {confirmTarget && (
                <div className="modal-overlay" onClick={() => setConfirmTarget(null)}>
                    <div className="settle-sheet" onClick={e => e.stopPropagation()}>
                        <h3>Confirm Settlement</h3>
                        <p className="settle-note">
                            Confirming this will mark all related group-level settlements as confirmed and clear the debts.
                        </p>
                        <div className="settle-actions">
                            <button className="btn-cancel" onClick={() => setConfirmTarget(null)}>
                                Cancel
                            </button>
                            <button className="btn-confirm-settle" onClick={handleBatchConfirm} disabled={confirming}>
                                {confirming ? 'Confirming...' : 'Confirm'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
