import { X, Smartphone } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import './UpiPromptBanner.css'

export default function UpiPromptBanner({ onDismiss, userId }) {
    const navigate = useNavigate()

    const handleAddNow = () => {
        navigate('/profile')
        onDismiss()
    }

    return (
        <div className="upi-prompt-banner">
            <div className="banner-content">
                <Smartphone size={20} className="banner-icon" />
                <p className="banner-message">
                    Add your UPI ID for instant settlements
                </p>
            </div>
            <div className="banner-actions">
                <button onClick={handleAddNow} className="banner-btn primary">
                    Add Now
                </button>
                <button onClick={onDismiss} className="banner-btn secondary">
                    <X size={16} />
                </button>
            </div>
        </div>
    )
}
