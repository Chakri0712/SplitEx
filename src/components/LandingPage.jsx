
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Github, CheckCircle2 } from 'lucide-react';
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
                    <a href="#features">Features</a>
                    {!session && (
                        <button className="signup-link-nav" onClick={handleSignUp}>
                            Sign Up
                        </button>
                    )}
                    <button className="login-link" onClick={() => navigate('/auth')}>
                        {session ? 'Dashboard' : 'Login'}
                    </button>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="hero-section">
                <div className="hero-content">

                    <h1>
                        The easiest way to <br />
                        share expenses <span className="highlight">fairly</span>.
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
                <div className="hero-visual">
                    <div className="phone-mockup">
                        <div className="screen-content">
                            <div className="mockup-header">
                                <span>9:41</span>
                                <span>Balances</span>
                            </div>
                            <div className="mockup-body">
                                <div className="mockup-card">
                                    <div className="avatar pink">C</div>
                                    <div className="info">
                                        <span>Charlie</span>
                                        <span className="sub">you owe</span>
                                    </div>
                                    <span className="amount negative">USD 45.00</span>
                                </div>
                                <div className="mockup-card">
                                    <div className="avatar blue">D</div>
                                    <div className="info">
                                        <span>Diana</span>
                                        <span className="sub">you get</span>
                                    </div>
                                    <span className="amount positive">USD 120.00</span>
                                </div>
                            </div>
                            <div className="mockup-nav"></div>
                        </div>
                        <div className="glow-effect"></div>
                    </div>
                </div>
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
                        <h3>Instant UPI Payments</h3>
                        <p>Pay friends directly via UPI with one tap. Made for India. 🇮🇳</p>
                    </div>
                    <div className="feature-card">
                        <CheckCircle2 className="feature-icon" />
                        <h3>Settlement Verification</h3>
                        <p>Track payment confirmations with UTR references. No more "Did you pay?" messages.</p>
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
                </div>
            </section>
        </div>
    );
}
