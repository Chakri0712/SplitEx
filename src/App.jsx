import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Auth from './components/Auth'
import Dashboard from './components/Dashboard'
import GroupDetailsWrapper from './components/GroupDetailsWrapper'
import LandingPage from './components/LandingPage'
import Profile from './components/Profile'

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
                {/* Public Route: Landing Page */}
                <Route path="/" element={<LandingPage session={session} />} />

                {/* Auth Route */}
                <Route
                    path="/auth"
                    element={!session ? <Auth /> : <Navigate to="/dashboard" replace />}
                />

                {/* Protected Dashboard */}
                <Route
                    path="/dashboard"
                    element={session ? <Dashboard session={session} /> : <Navigate to="/" replace />}
                />

                {/* Protected Group Details */}
                <Route
                    path="/group/:groupId"
                    element={session ? <GroupDetailsWrapper session={session} /> : <Navigate to="/" replace />}
                />

                {/* Protected Profile */}
                <Route
                    path="/profile"
                    element={session ? <Profile session={session} /> : <Navigate to="/" replace />}
                />

                {/* Catch all redirect */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </Router>
    )
}

export default App
