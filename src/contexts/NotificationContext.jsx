import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import Toast from '../components/Toast'

const NotificationContext = createContext()

export function useNotifications() {
    return useContext(NotificationContext)
}

export function NotificationProvider({ children, session }) {
    const [notifications, setNotifications] = useState([])
    const [unreadCount, setUnreadCount] = useState(0)
    const [toast, setToast] = useState(null)

    // Helper to show toast
    const showToast = (message, type = 'info') => {
        setToast({ message, type, id: Date.now() })
    }

    // Close toast
    const closeToast = () => setToast(null)

    // 4. Local Cleared State (Now DB Persisted)
    const clearNotifications = async () => {
        if (!session?.user?.id) return

        const now = new Date().toISOString()

        // Optimistic Update
        setNotifications([])
        setUnreadCount(0)

        // DB Update
        const { error } = await supabase
            .from('profiles')
            .update({ cleared_at: now })
            .eq('id', session.user.id)

        if (error) {
            console.error('Error updating cleared_at:', error)
            showToast('Failed to clear activity permanently', 'error')
        }
    }

    useEffect(() => {
        if (!session?.user) {
            setNotifications([])
            setUnreadCount(0)
            return
        }

        const userId = session.user.id

        // 1. Fetch initial notifications & cleared_at
        const fetchData = async () => {
            // Fetch cleared_at from profile
            const { data: profileData } = await supabase
                .from('profiles')
                .select('cleared_at')
                .eq('id', userId)
                .single()

            const clearedTime = profileData?.cleared_at

            // Fetch notifications
            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(50)

            if (!error && data) {
                // Filter out notifications older than clearedTime
                const validNotifications = clearedTime
                    ? data.filter(n => new Date(n.created_at) > new Date(clearedTime))
                    : data

                setNotifications(validNotifications)
                setUnreadCount(validNotifications.filter(n => !n.is_read).length)
            }
        }

        fetchData()

        // 2. Subscribe to Realtime changes
        const subscription = supabase
            .channel('public:notifications')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${userId}`,
                },
                (payload) => {
                    const newNotification = payload.new

                    // Always show new incoming notifications (they are newer than clearedTime)
                    setNotifications(prev => [newNotification, ...prev])
                    setUnreadCount(prev => prev + 1)

                    // Show Toast
                    showToast(newNotification.message)
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(subscription)
        }
    }, [session])

    const markAsRead = async (notificationId) => {
        // Optimistic update
        setNotifications(prev =>
            prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
        )
        setUnreadCount(prev => Math.max(0, prev - 1))

        // Backend update
        await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('id', notificationId)
    }

    const markAllAsRead = async () => {
        if (!session?.user) return

        // Optimistic
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
        setUnreadCount(0)

        // Backend
        await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('user_id', session.user.id)
            .eq('is_read', false)
    }

    const value = {
        notifications,
        unreadCount,
        markAsRead,
        markAllAsRead,
        clearNotifications,
        showToast
    }

    return (
        <NotificationContext.Provider value={value}>
            {children}
            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={closeToast}
                />
            )}
        </NotificationContext.Provider>
    )
}
