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

    useEffect(() => {
        if (!session?.user) {
            setNotifications([])
            setUnreadCount(0)
            return
        }

        const userId = session.user.id

        // 1. Fetch initial notifications
        const fetchNotifications = async () => {
            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(50)

            if (!error && data) {
                setNotifications(data)
                setUnreadCount(data.filter(n => !n.is_read).length)
            }
        }

        fetchNotifications()

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

                    // Add to list
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


    const clearNotifications = () => {
        setNotifications([])
        setUnreadCount(0)
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
