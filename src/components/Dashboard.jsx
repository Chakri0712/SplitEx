import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useNavigate, useLocation } from 'react-router-dom'
import { Plus, Users, LogOut, ExternalLink, UserPlus, User } from 'lucide-react'
import CreateGroupModal from './CreateGroupModal'
import JoinGroupModal from './JoinGroupModal'
import './Dashboard.css'

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
                <div className="header-left">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <select
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                            className="dashboard-filter-dropdown"
                        >
                            {CATEGORY_FILTERS.map(cat => (
                                <option key={cat} value={cat}>
                                    {cat === 'All' ? 'All Groups' : cat}
                                </option>
                            ))}
                        </select>
                    </div>
                    <p>Welcome, {session.user.user_metadata?.full_name || 'User'}</p>
                </div>
                <div className="header-actions" style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={() => setIsJoinModalOpen(true)}
                        className="btn-icon-round"
                        title="Join Group"
                        style={{ width: '36px', height: '36px', background: 'rgba(255,255,255,0.1)', color: 'var(--text-primary)' }}
                    >
                        <UserPlus size={18} />
                    </button>
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="btn-icon-round"
                        title="Create Group"
                        style={{ width: '36px', height: '36px', background: 'var(--primary)', color: '#000' }}
                    >
                        <Plus size={20} strokeWidth={2.5} />
                    </button>
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
                            <div className="group-item-left">
                                <div className="group-icon-small">
                                    {group.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="group-info-row">
                                    <h3>{group.name}</h3>
                                    <span className="currency-badge-small">{group.currency}</span>
                                </div>
                            </div>
                            <div className="group-item-right">
                                {/* Chevron or balance preview can go here */}
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="chevron-icon"><path d="m9 18 6-6-6-6" /></svg>
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
