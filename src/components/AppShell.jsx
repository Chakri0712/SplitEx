import React from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Home, User, Activity } from 'lucide-react'
import './AppShell.css'

export default function AppShell({ session }) {
    const navigate = useNavigate()
    const location = useLocation()

    // Determine active tab based on path
    const getActiveTab = (path) => {
        if (path === '/') return 'home'
        if (path === '/dashboard') return 'activity'
        if (path.startsWith('/group/')) return 'activity'
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
                <nav className="bottom-nav">
                    <button
                        className={`nav-tab ${activeTab === 'home' ? 'active' : ''}`}
                        onClick={() => navigate('/')}
                    >
                        {activeTab === 'home' && <div className="nav-indicator" />}
                        <Home size={24} strokeWidth={activeTab === 'home' ? 2.5 : 2} />
                        <span>Home</span>
                    </button>

                    <button
                        className={`nav-tab ${activeTab === 'activity' ? 'active' : ''}`}
                        onClick={() => navigate('/dashboard')}
                    >
                        {activeTab === 'activity' && <div className="nav-indicator" />}
                        <Activity size={24} strokeWidth={activeTab === 'activity' ? 2.5 : 2} />
                        <span>Activity</span>
                    </button>

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
