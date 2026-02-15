
import { X, ShieldAlert, AlertTriangle } from 'lucide-react'
import './SettleUpModal.css' // Reusing modal styles

export default function PaymentMethodSelector({ isOpen, onClose, paymentDetails }) {
    if (!isOpen) return null

    const { pa, pn, am, tr, tn, cu } = paymentDetails

    // App-specific URI schemes
    const apps = [
        {
            name: 'PhonePe',
            scheme: 'phonepe://pay',
            color: '#5f259f'
        },
        {
            name: 'Google Pay',
            scheme: 'gpay://upi/pay', // or tez://upi/pay
            color: '#1a73e8'
        },
        {
            name: 'Paytm',
            scheme: 'paytmmp://pay',
            color: '#00b9f5'
        },
        {
            name: 'Other UPI Apps',
            scheme: 'upi://pay',
            color: '#ffaa00'
        }
    ]

    const handleAppSelect = (scheme) => {
        // Construct URI
        // Note: Some apps might require specific parameter ordering or encoding, 
        // but generally standard UPI params work.
        const params = new URLSearchParams({
            pa,
            pn,
            am,
            tr,
            tn,
            cu
        }).toString()

        const url = `${scheme}?${params}`

        // Close the selector immediately so the UTR prompt is visible when/if they return
        onClose()

        window.location.href = url
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content payment-selector-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Select Payment App</h2>
                    <button className="close-button" onClick={onClose}>
                        <X size={24} />
                    </button>
                </div>

                <div className="modal-body">
                    <div className="security-note">
                        <ShieldAlert size={16} className="note-icon" />
                        <p>
                            <strong>Security Note:</strong> Your device may show a warning when opening external payment apps. This is standard behavior for web apps.
                        </p>
                    </div>

                    {/* <div className="limit-note">
                        <AlertTriangle size={16} className="note-icon" />
                        <p>
                            <strong>Limit Alert:</strong> New UPI transactions to unverified links may be limited to ₹2,000 in the first 24 hours.
                        </p>
                    </div> */}

                    <div className="app-list">
                        {apps.map((app) => (
                            <button
                                key={app.name}
                                className="app-button"
                                onClick={() => handleAppSelect(app.scheme)}
                                style={{
                                    '--app-color': app.color,
                                    borderLeft: `4px solid ${app.color}`
                                }}
                            >
                                <span className="app-name">{app.name}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
