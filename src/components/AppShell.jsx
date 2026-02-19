import React from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Home, User, Activity, Users2 } from 'lucide-react'
import { useNotifications } from '../contexts/NotificationContext'
import './AppShell.css'

export default function AppShell({ session }) {
    const navigate = useNavigate()
    const location = useLocation()
    const { unreadCount } = useNotifications()

    // Determine active tab based on path
    const getActiveTab = (path) => {
        if (path === '/') return 'home'
        if (path === '/dashboard') return 'home' // Dashboard is now the "Home" view for users
        if (path === '/activity') return 'activity'
        if (path === '/friends') return 'friends'
        if (path.startsWith('/group/')) return 'home' // Groups are part of Home flow
        if (path === '/profile') return 'profile'
        return 'home'
    }

    const activeTab = getActiveTab(location.pathname)

    return (
        <div className="app-shell">
            {/* Main Scrollable Content */}
            <main className="shell-content">
                <Outlet />
            </main>

            {/* Bottom Navigation - Only visible if logged in */}
            {session && (
                <nav className={`bottom-nav ${location.pathname.startsWith('/group/') ? 'nav-3col' : ''}`}>
                    <button
                        className={`nav-tab ${activeTab === 'home' ? 'active' : ''}`}
                        onClick={() => navigate('/dashboard')}
                    >
                        {activeTab === 'home' && <div className="nav-indicator" />}
                        <Home size={24} strokeWidth={activeTab === 'home' ? 2.5 : 2} />
                        <span>Home</span>
                    </button>

                    <button
                        className={`nav-tab ${activeTab === 'activity' ? 'active' : ''}`}
                        onClick={() => navigate('/activity')}
                        style={{ position: 'relative' }}
                    >
                        {activeTab === 'activity' && <div className="nav-indicator" />}
                        <Activity size={24} strokeWidth={activeTab === 'activity' ? 2.5 : 2} />
                        <span>Activity</span>
                        {unreadCount > 0 && (
                            <span className="nav-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
                        )}
                    </button>

                    {!location.pathname.startsWith('/group/') && (
                        <button
                            className={`nav-tab ${activeTab === 'friends' ? 'active' : ''}`}
                            onClick={() => navigate('/friends')}
                        >
                            {activeTab === 'friends' && <div className="nav-indicator" />}
                            <Users2 size={24} strokeWidth={activeTab === 'friends' ? 2.5 : 2} />
                            <span>Friends</span>
                        </button>
                    )}

                    <button
                        className={`nav-tab ${activeTab === 'profile' ? 'active' : ''}`}
                        onClick={() => navigate('/profile')}
                    >
                        {activeTab === 'profile' && <div className="nav-indicator" />}
                        <User size={24} strokeWidth={activeTab === 'profile' ? 2.5 : 2} />
                        <span>Profile</span>
                    </button>
                </nav>
            )}
        </div>
    )
}
