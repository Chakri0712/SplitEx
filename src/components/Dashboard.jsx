import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useNavigate, useLocation } from 'react-router-dom'
import { Plus, Users, LogOut, ExternalLink, UserPlus, User } from 'lucide-react'
import CreateGroupModal from './CreateGroupModal'
import JoinGroupModal from './JoinGroupModal'
import './Dashboard.css'
import FilterSelect from './FilterSelect'

const CATEGORY_FILTERS = [
    'All',
    'Food',
    'Travel',
    'Sports',
    'Personal'
]

export default function Dashboard({ session, onGroupSelect }) {
    const navigate = useNavigate()
    const location = useLocation()
    const [groups, setGroups] = useState([])
    const [selectedCategory, setSelectedCategory] = useState('All')
    const [loading, setLoading] = useState(true)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isJoinModalOpen, setIsJoinModalOpen] = useState(false)
    const [isActionMenuOpen, setIsActionMenuOpen] = useState(false)

    useEffect(() => {
        fetchGroups()
    }, [location.key])

    const fetchGroups = async () => {
        try {
            const { data, error } = await supabase
                .from('groups')
                .select(`
          *,
          group_members!inner (user_id)
        `)
                .eq('group_members.user_id', session.user.id)
                .order('created_at', { ascending: false })

            if (error) throw error
            setGroups(data || [])
        } catch (error) {
            console.error('Error fetching groups:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleGroupAction = () => {
        fetchGroups()
    }

    const filteredGroups = selectedCategory === 'All'
        ? groups
        : groups.filter(g => (g.category || 'Personal') === selectedCategory)

    return (
        <div className="dashboard-container">
            <header className="dashboard-header">
                <div className="header-left" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: '1.2rem', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                        Welcome, {session.user.user_metadata?.full_name?.split(' ')[0] || 'User'}
                    </p>
                    <FilterSelect
                        label="Groups"
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        options={CATEGORY_FILTERS.map(cat => ({ value: cat, label: cat === 'All' ? 'All' : cat }))}
                    />
                </div>
                <div className="header-actions" style={{ position: 'relative' }}>
                    <button
                        onClick={() => setIsActionMenuOpen(prev => !prev)}
                        className="btn-icon-round"
                        title="Group Actions"
                        style={{ width: '36px', height: '36px', background: 'var(--primary)', color: '#000' }}
                    >
                        <Plus size={20} strokeWidth={2.5} />
                    </button>
                    {isActionMenuOpen && (
                        <>
                            <div
                                onClick={() => setIsActionMenuOpen(false)}
                                style={{ position: 'fixed', inset: 0, zIndex: 99, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
                            />
                            <div style={{
                                position: 'absolute',
                                top: '44px',
                                right: 0,
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '12px',
                                overflow: 'hidden',
                                zIndex: 100,
                                minWidth: '160px',
                                boxShadow: '0 8px 24px rgba(0,0,0,0.3)'
                            }}>
                                <button
                                    onClick={() => { setIsModalOpen(true); setIsActionMenuOpen(false) }}
                                    style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '12px 16px', background: 'none', border: 'none', color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: '600', cursor: 'pointer', borderBottom: '1px solid var(--border-color)' }}
                                >
                                    <Plus size={16} color="var(--primary)" /> Create Group
                                </button>
                                <button
                                    onClick={() => { setIsJoinModalOpen(true); setIsActionMenuOpen(false) }}
                                    style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '12px 16px', background: 'none', border: 'none', color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: '600', cursor: 'pointer' }}
                                >
                                    <UserPlus size={16} color="var(--primary)" /> Join Group
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </header>

            {loading ? (
                <div className="loading-state">Loading groups...</div>
            ) : (
                <div className="groups-list">
                    {filteredGroups.length === 0 && (
                        <div className="empty-state">
                            <p>{groups.length === 0 ? "No groups yet. Create a new one or join an existing group using the buttons above" : `No '${selectedCategory}' groups found.`}</p>
                        </div>
                    )}

                    {filteredGroups.map((group) => (
                        <div
                            key={group.id}
                            className="group-list-item"
                            onClick={() => navigate(`/group/${group.id}`)}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
                                <div className="group-info-row" style={{ flex: 1, paddingRight: '12px' }}>
                                    <h3>{group.name}</h3>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                                        <span className="currency-badge-small">{group.currency}</span>
                                        {group.category && group.category !== 'Personal' && (
                                            <span className="group-category-badge">{group.category}</span>
                                        )}
                                    </div>
                                </div>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '2px' }}><path d="m9 18 6-6-6-6" /></svg>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modals */}

            {isModalOpen && (
                <CreateGroupModal
                    userId={session.user.id}
                    onClose={() => {
                        setIsModalOpen(false)
                        setIsActionMenuOpen(false)
                    }}
                    onGroupCreated={handleGroupAction}
                />
            )}

            {isJoinModalOpen && (
                <JoinGroupModal
                    onClose={() => {
                        setIsJoinModalOpen(false)
                        setIsActionMenuOpen(false)
                    }}
                    onGroupJoined={handleGroupAction}
                />
            )}
        </div>
    )
}
