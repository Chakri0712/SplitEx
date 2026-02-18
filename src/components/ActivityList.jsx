import React from 'react'
import { useNotifications } from '../contexts/NotificationContext'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCircle, ArrowLeft } from 'lucide-react'
import './ActivityList.css'

export default function ActivityList() {
    const { notifications, markAsRead, markAllAsRead } = useNotifications()
    const navigate = useNavigate()

    const handleNotificationClick = (n) => {
        if (!n.is_read) markAsRead(n.id)

        if (n.data?.group_id) {
            navigate(`/group/${n.data.group_id}`)
        }
    }

    if (notifications.length === 0) {
        return (
            <div className="activity-container">
                <div className="activity-header">
                    <div className="header-title-row">
                        <button className="back-btn" onClick={() => navigate(-1)}>
                            <ArrowLeft size={24} />
                        </button>
                        <h2>Activity</h2>
                    </div>
                </div>
                <div className="activity-empty-state">
                    <Bell size={48} className="empty-icon" />
                    <p>No recent activity</p>
                </div>
            </div>
        )
    }

    return (
        <div className="activity-container">
            <div className="activity-header">
                <div className="header-title-row">
                    <button className="back-btn" onClick={() => navigate(-1)}>
                        <ArrowLeft size={24} />
                    </button>
                    <h2>Activity</h2>
                </div>
                <button className="mark-all-btn" onClick={markAllAsRead}>
                    <CheckCircle size={16} /> Mark all read
                </button>
            </div>

            <div className="activity-list">
                {notifications.map((n) => (
                    <div
                        key={n.id}
                        className={`activity-item ${!n.is_read ? 'unread' : ''}`}
                        onClick={() => handleNotificationClick(n)}
                    >
                        <div className="activity-icon">
                            {/* Icon based on type */}
                            {n.type.includes('expense') ? '💸' : '🤝'}
                        </div>
                        <div className="activity-content">
                            <h4>{n.title}</h4>
                            <p>{n.message}</p>
                            <span className="activity-time">
                                {new Date(n.created_at).toLocaleString()}
                            </span>
                        </div>
                        {!n.is_read && <div className="unread-dot" />}
                    </div>
                ))}
            </div>
        </div>
    )
}
