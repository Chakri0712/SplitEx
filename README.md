# SplitEx 💸

> **Split bills. Track debts. Settle smart.**

SplitEx is a premium, mobile-first Progressive Web App (PWA) for managing shared expenses across friend groups. Built with a sleek **Midnight Black + Gold** theme, it delivers a native app experience entirely in the browser — complete with real-time notifications, smart splitting, and a full settlement workflow.

**Live App →** [https://split-ex-bay.vercel.app](https://split-ex-bay.vercel.app)

---

## ✨ Features

### 💰 Expense Management
- Add expenses with description, amount, category, date, and payer
- **Equal Split** — auto-divides cost among all members
- **Unequal Split** — "Smart Lock" lets you fix specific amounts; the remainder auto-distributes to others
- Edit or delete expenses (any group member)

### 🤝 Settlements
- Full settlement workflow: Initiate → Submit UTR → Confirm → Done
- Dispute and cancel flows with status tracking
- Cross-group balance view on the **Friends** page (see net balances with any person across all mutual groups)
- UPI ID support on profiles for easy payment reference
- Users are blocked from leaving a group if they have an outstanding balance

### 🔔 Real-Time Notifications
- In-app notification bell with unread count badge
- Notifications for: expense added/edited/deleted, settlement created/updated/cancelled
- Powered by **Supabase Realtime** (PostgreSQL triggers → push to client)
- Auto-cleanup: notifications older than 2 days are purged automatically

### 👥 Groups
- Create groups with custom currency and invite code
- Join groups via 6-character invite code
- Group settings: rename, change currency, manage members
- Group admin can delete the group when all members have left

### 🔐 Auth
- Email + password sign-up and login
- Email confirmation on sign-up
- **Forgot Password** → reset link sent via email (Brevo SMTP)
- Secure reset password page (`/reset-password`)

### 📱 PWA
- Installable on iOS and Android (Add to Home Screen)
- Offline-capable shell via Workbox service worker
- Optimized with code splitting — only downloads the JS for the page you visit

### 🎨 UI / UX
- **Midnight Black + Gold** premium theme
- Framer Motion animations throughout
- Fully responsive — designed mobile-first
- Dark mode native (no toggle needed)

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite 7 |
| Routing | React Router v7 |
| Animations | Framer Motion |
| Icons | Lucide React |
| Styling | Vanilla CSS (CSS Variables) |
| Backend / DB | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Email (SMTP) | Brevo (via Supabase custom SMTP) |
| Realtime | Supabase Realtime |
| PWA | vite-plugin-pwa (Workbox) |
| Hosting | Vercel |

---

## 🚀 Getting Started

### Prerequisites
- Node.js v18+
- npm
- A Supabase project ([free tier works fine](https://supabase.com))

### 1. Clone & Install

```bash
git clone https://github.com/your-username/splitex.git
cd splitex
npm install
```

### 2. Environment Variables

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

Both values are in your Supabase dashboard under **Settings → API**.

### 3. Database Setup

In your Supabase project, open the **SQL Editor** and run `restore_schema.sql` in full. This creates all tables, RLS policies, functions, and triggers — including the notification system.

> **Tables created:** `profiles`, `groups`, `group_members`, `expenses`, `expense_splits`, `settlement_details`, `notifications`

### 4. Supabase Auth Configuration

In **Authentication → URL Configuration**:
- **Site URL**: `http://localhost:5173` (update to your production URL after deploy)
- **Redirect URLs**: Add `http://localhost:5173/**` and your production URL `/**`

### 5. Run Locally

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

> **Tip:** Run `npm run dev --host` to access from your phone on the same Wi-Fi network.

---

## 📱 User Flow

```
Sign Up / Login
    └── Confirm email
         └── Dashboard (your groups)
              ├── Create Group  ──→  Share invite code with friends
              ├── Join Group   ──→  Enter invite code
              └── Group View
                   ├── Expenses tab  ──→  Add / Edit / Delete bills
                   ├── Balances tab  ──→  See who owes whom
                   └── Settle Up     ──→  Submit UTR → Confirm payment
```

---

## 🔒 Security

- **Row Level Security (RLS)** on every table — users only see data for groups they belong to
- All database mutations go through Supabase's authenticated client — the anon key is safe to expose
- RLS `is_member_of()` function used as a reusable guard across policies
- Debt protection: leaving a group with outstanding balances is blocked at the UI and database level

---

## 🗂️ Project Structure

```
src/
├── components/        # All page and modal components
├── contexts/          # NotificationContext (Supabase Realtime)
├── utils/             # Shared helpers
├── supabaseClient.js  # Supabase client initialisation
├── App.jsx            # Routes
└── index.css          # Global design tokens (CSS variables)

restore_schema.sql     # Full DB schema + triggers + policies
admin_queries.sql      # Useful admin/debug queries
```

---

Built with ❤️ using React + Supabase
