import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Auth from './components/Auth'
import AppShell from './components/AppShell'
import Dashboard from './components/Dashboard'
import GroupDetailsWrapper from './components/GroupDetailsWrapper'
import LandingPage from './components/LandingPage'
import Profile from './components/Profile'
import ActivityList from './components/ActivityList'
import { NotificationProvider } from './contexts/NotificationContext'

function App() {
    const [session, setSession] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session)
            setLoading(false)
        })

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session)
        })

        return () => subscription.unsubscribe()
    }, [])

    if (loading) {
        return <div className="loading-state">Loading app...</div>
    }

    return (
        <Router>
            <Routes>
                {/* Global App Shell */}
                <Route element={
                    <NotificationProvider session={session}>
                        <AppShell session={session} />
                    </NotificationProvider>
                }>
                    {/* Public Routes */}
                    <Route path="/" element={<LandingPage session={session} />} />

                    <Route
                        path="/auth"
                        element={!session ? <Auth /> : <Navigate to="/dashboard" replace />}
                    />

                    {/* Protected Routes */}
                    <Route path="/dashboard" element={session ? <Dashboard session={session} /> : <Navigate to="/" replace />} />
                    <Route path="/activity" element={session ? <ActivityList /> : <Navigate to="/" replace />} />
                    <Route path="/group/:groupId" element={session ? <GroupDetailsWrapper session={session} /> : <Navigate to="/" replace />} />
                    <Route path="/profile" element={session ? <Profile session={session} /> : <Navigate to="/" replace />} />

                    {/* Catch all */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
            </Routes>
        </Router>
    )
}

export default App
