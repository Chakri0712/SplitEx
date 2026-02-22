# 🚀 SplitEx — Deployment Guide

This guide walks you through deploying SplitEx from scratch: database, email, and frontend hosting.

---

## Phase 1 — Git & GitHub

```bash
# In the project folder:
git init
git add .
git commit -m "Initial commit of SplitEx"
```

Create a new repo on [GitHub](https://github.com/new) (e.g. `splitex-app`), then:

```bash
git remote add origin https://github.com/YOUR_USERNAME/splitex-app.git
git branch -M main
git push -u origin main
```

---

## Phase 2 — Supabase Backend

### 2a. Create Project
1. Go to [supabase.com](https://supabase.com) and create a new project.
2. Note your **Project URL** and **anon public key** from **Settings → API**.

### 2b. Run the Database Schema
1. Open **SQL Editor** in your Supabase dashboard.
2. Copy the full contents of `restore_schema.sql` and run it.

This creates all tables, functions, RLS policies, and triggers:

| Table | Purpose |
|---|---|
| `profiles` | Synced from `auth.users` via trigger |
| `groups` | Expense groups |
| `group_members` | Group membership |
| `expenses` | All expense records |
| `expense_splits` | Individual share per user per expense |
| `settlement_details` | Settlement workflow state |
| `notifications` | Real-time in-app notifications |

### 2c. Auth URL Configuration
Go to **Authentication → URL Configuration**:

| Setting | Value |
|---|---|
| **Site URL** | `http://localhost:5173` *(update after deploy)* |
| **Redirect URLs** | `http://localhost:5173/**` |

> You will update both of these to your Vercel URL in Phase 4.

### 2d. Enable Realtime
Go to **Database → Replication** and ensure the `notifications` table is enabled for Realtime. The `restore_schema.sql` script attempts this automatically, but verify it in the dashboard.

---

## Phase 3 — Email (Brevo SMTP)

SplitEx uses **Brevo** (formerly Sendinblue) as the SMTP provider for Supabase auth emails (sign-up confirmation, password reset).

### 3a. Create a Brevo Account
1. Sign up at [brevo.com](https://www.brevo.com) (free tier: 300 emails/day).
2. Go to **SMTP & API → SMTP**.
3. Note your **SMTP server**, **port**, **login**, and **master password** (or create an SMTP key).

Typical Brevo SMTP settings:
```
Host:     smtp-relay.brevo.com
Port:     587
Login:    your-brevo-account@email.com
Password: your-brevo-smtp-key
```

### 3b. Configure in Supabase
1. In Supabase, go to **Authentication → Providers → Email**.
2. Scroll down to **SMTP Settings** and enable **Custom SMTP**.
3. Fill in the Brevo credentials from above.
4. Set **Sender name** (e.g. `SplitEx`) and **Sender email** (must be a verified sender in Brevo).
5. Save.

### 3c. Customise Email Templates *(optional)*
In **Authentication → Email Templates**, you can customise the subject and body for:
- **Confirm signup**
- **Reset password** — the link will redirect to `{{ .SiteURL }}/reset-password`
- **Magic link**, **Change email**, etc.

---

## Phase 4 — Frontend Deployment (Vercel)

1. Go to [vercel.com](https://vercel.com) and login with GitHub.
2. Click **Add New → Project** and import your `splitex-app` repo.
3. Vercel will auto-detect Vite. Confirm the settings:

| Setting | Value |
|---|---|
| Framework Preset | Vite |
| Root Directory | `./` |
| Build Command | `npm run build` |
| Output Directory | `dist` |

4. Under **Environment Variables**, add:

| Key | Value |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon key |

5. Click **Deploy**.

Vercel will build and give you a live URL, e.g. `https://split-ex-bay.vercel.app`.

---

## Phase 5 — Final Configuration

### 5a. Update Supabase Auth URLs
Go back to **Authentication → URL Configuration** and update:

| Setting | Value |
|---|---|
| **Site URL** | `https://your-app.vercel.app` |
| **Redirect URLs** | Add `https://your-app.vercel.app/**` |

> This is required for password reset links to redirect to your live app instead of localhost.

### 5b. Smoke Test
- [ ] Visit your Vercel URL
- [ ] Sign up with a new email — confirm the email arrives and is styled correctly
- [ ] Login with your credentials
- [ ] Create a group and add an expense
- [ ] Invite another user via the invite code
- [ ] Test Settle Up workflow
- [ ] Use **Forgot Password** — confirm reset email arrives and the reset page works
- [ ] Check the notification bell updates in real time across two sessions

---

## 🔁 Redeployments

Push any code change to `main` and Vercel redeploys automatically. No manual steps needed.

```bash
git add .
git commit -m "your change description"
git push
```

---

**🎉 SplitEx is live!**
