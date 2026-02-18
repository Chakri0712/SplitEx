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
            <Suspense fallback={<div className="loading-state">Loading...</div>}>
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
            </Suspense>
        </Router>
    )
}

export default App
