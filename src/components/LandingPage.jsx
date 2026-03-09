
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Activity, Users2, Bell } from 'lucide-react';
import './LandingPage.css';

export default function LandingPage({ session }) {
    const navigate = useNavigate();

    const handleGetStarted = () => {
        if (session) {
            navigate('/dashboard');
        } else {
            navigate('/auth');
        }
    };

    const handleSignUp = () => {
        navigate('/auth', { state: { mode: 'signup' } });
    };

    return (
        <div className="landing-container">
            {/* Navbar */}
            <nav className="landing-nav">
                <div className="logo">SplitEx</div>
                <div className="nav-links">
                    {/* Navigation removed per user request */}
                </div>
            </nav>

            {/* Hero Section */}
            <section className="hero-section">
                <div className="hero-content">

                    <h1>
                        The easiest way to <br />
                        share expenses
                    </h1>
                    <p className="hero-subtext">
                        Track bills, shared expenses, and debts with friends.
                        Simple, fast, and free.
                    </p>

                    <div className="hero-actions">
                        <button className="cta-btn primary" onClick={handleGetStarted}>
                            {session ? 'Go to Dashboard' : 'Get Started'} <ArrowRight size={20} />
                        </button>
                    </div>
                </div>

                {/* Hero Visual / Mockup */}
                {/* Hero Visual removed per user request */}
            </section>

            {/* Features Grid */}
            <section id="features" className="features-section">
                <h2>Features</h2>
                <div className="features-grid">
                    <div className="feature-card">
                        <CheckCircle2 className="feature-icon" />
                        <h3>Smart Splits</h3>
                        <p>Split equally, unequally, or by custom shares. We handle the math.</p>
                    </div>
                    <div className="feature-card">
                        <CheckCircle2 className="feature-icon" />
                        <h3>Verified Settlements</h3>
                        <p>Payments stay "Pending" until the receiver confirms. Everyone is held responsible.</p>
                    </div>
                    <div className="feature-card">
                        <CheckCircle2 className="feature-icon" />
                        <h3>Group Management</h3>
                        <p>Create groups, invite friends via code, and track expenses together.</p>
                    </div>
                    <div className="feature-card">
                        <CheckCircle2 className="feature-icon" />
                        <h3>Real-time Balances</h3>
                        <p>See who owes you and who you owe instantly. Always up to date.</p>
                    </div>
                    <div className="feature-card">
                        <CheckCircle2 className="feature-icon" />
                        <h3>Mobile Optimized</h3>
                        <p>Native mobile app feel. Works on any device, anywhere.</p>
                    </div>
                    <div className="feature-card">
                        <Activity className="feature-icon" />
                        <h3>Activity Feed</h3>
                        <p>See a live feed of all group activity — expenses, settlements, and edits — in one place.</p>
                    </div>
                    <div className="feature-card">
                        <Users2 className="feature-icon" />
                        <h3>Cross-Group Settlements</h3>
                        <p>Settle debts across multiple groups in one tap. Net balances with friends, no matter how many groups you share.</p>
                    </div>
                    <div className="feature-card">
                        <Bell className="feature-icon" />
                        <h3>Push Notifications</h3>
                        <p>Get instant alerts when friends add expenses or settle up even when you are away from the app.</p>
                    </div>
                </div>
            </section>
        </div>
    );
}
