import { useState, useEffect, Suspense, lazy } from 'react'
import { supabase } from './supabaseClient'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import AppShell from './components/AppShell'
import LandingPage from './components/LandingPage'
import { NotificationProvider } from './contexts/NotificationContext'

// Lazy-loaded route components — only downloaded when the route is visited
const Auth = lazy(() => import('./components/Auth'))
const Dashboard = lazy(() => import('./components/Dashboard'))
const GroupDetailsWrapper = lazy(() => import('./components/GroupDetailsWrapper'))
const Profile = lazy(() => import('./components/Profile'))
const ActivityList = lazy(() => import('./components/ActivityList'))
const FriendsSummary = lazy(() => import('./components/FriendsSummary'))
const ResetPassword = lazy(() => import('./components/ResetPassword'))

function App() {
    const [session, setSession] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const timeout = new Promise((resolve) => setTimeout(() => resolve({ data: { session: null } }), 5000))

        Promise.race([supabase.auth.getSession(), timeout]).then(({ data: { session } }) => {
            setSession(session)
            setLoading(false)
        })

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session)
            setLoading(false)
        })

        return () => subscription.unsubscribe()
    }, [])

    if (loading) {
        return <div className="loading-state">Loading app...</div>
    }

    return (
        <Router>
            <Suspense fallback={<div className="loading-state">Loading...</div>}>
                <Routes>
                    {/* Standalone Auth Routes (no AppShell) */}
                    <Route
                        path="/auth"
                        element={!session ? <Auth /> : <Navigate to="/dashboard" replace />}
                    />
                    <Route path="/reset-password" element={<ResetPassword />} />

                    {/* Global App Shell */}
                    <Route element={
                        <NotificationProvider session={session}>
                            <AppShell session={session} />
                        </NotificationProvider>
                    }>
                        {/* Public Routes */}
                        <Route path="/" element={<LandingPage session={session} />} />

                        {/* Protected Routes */}
                        <Route path="/dashboard" element={session ? <Dashboard session={session} /> : <Navigate to="/" replace />} />
                        <Route path="/activity" element={session ? <ActivityList /> : <Navigate to="/" replace />} />
                        <Route path="/group/:groupId" element={session ? <GroupDetailsWrapper session={session} /> : <Navigate to="/" replace />} />
                        <Route path="/profile" element={session ? <Profile session={session} /> : <Navigate to="/" replace />} />
                        <Route path="/friends" element={session ? <FriendsSummary session={session} /> : <Navigate to="/" replace />} />

                        {/* Catch all */}
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Route>
                </Routes>
            </Suspense>
        </Router>
    )
}

export default App
