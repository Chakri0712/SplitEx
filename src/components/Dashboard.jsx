
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useNavigate } from 'react-router-dom'
import { Plus, Users, LogOut, ExternalLink, UserPlus, User } from 'lucide-react'
import CreateGroupModal from './CreateGroupModal'
import JoinGroupModal from './JoinGroupModal'
import './Dashboard.css'

export default function Dashboard({ session, onGroupSelect }) {
    const navigate = useNavigate() // Needed for navigation
    const [groups, setGroups] = useState([])
    const [loading, setLoading] = useState(true)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isJoinModalOpen, setIsJoinModalOpen] = useState(false)

    const [isActionMenuOpen, setIsActionMenuOpen] = useState(false)

    useEffect(() => {
        fetchGroups()
    }, [])

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
        setIsActionMenuOpen(false)
        fetchGroups()
    }

    const toggleActionMenu = () => setIsActionMenuOpen(!isActionMenuOpen)

    return (
        <div className="dashboard-container">
            <header className="dashboard-header">
                <div className="header-left">
                    <h1>My Groups</h1>
                    <p>Welcome, {session.user.user_metadata?.full_name || 'User'}</p>
                </div>
                <button onClick={() => navigate('/profile')} className="profile-btn-header" title="My Profile">
                    <div className="header-avatar-placeholder">
                        <User size={20} />
                    </div>
                </button>
            </header>

            {loading ? (
                <div className="loading-state">Loading groups...</div>
            ) : (
                <div className="groups-list">
                    {groups.length === 0 && (
                        <div className="empty-state">
                            <p>No groups yet. Create a new one or join an existing group using the + button</p>
                        </div>
                    )}

                    {groups.map((group) => (
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

            {/* Floating Action Button & Menu */}
            <div className="fab-container">
                {isActionMenuOpen && (
                    <div className="fab-menu">
                        <button onClick={() => setIsModalOpen(true)} className="fab-menu-item">
                            <Plus size={20} /> Create New Group
                        </button>
                        <button onClick={() => setIsJoinModalOpen(true)} className="fab-menu-item">
                            <UserPlus size={20} /> Join with Code
                        </button>
                    </div>
                )}
                <button
                    className={`fab-main ${isActionMenuOpen ? 'open' : ''}`}
                    onClick={toggleActionMenu}
                >
                    <Plus size={24} />
                </button>
            </div>

            {/* Modals Overlay Logic - Clicking outside FAB menu closes it */}
            {isActionMenuOpen && (
                <div className="fab-overlay" onClick={() => setIsActionMenuOpen(false)}></div>
            )}

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
