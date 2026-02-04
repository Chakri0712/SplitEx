# 🚀 End-to-End Deployment Guide for SplitEx

This guide covers how to deploy the **SplitEx** application from your local machine to the web.

## Phase 1: Git & GitHub Setup

1.  **Initialize Git:**
    Open your terminal in the project folder:
    ```bash
    git init
    ```

2.  **Create `.gitignore`:**
    (Already created) Ensure it includes `node_modules`, `.env`, `.DS_Store`, etc.

3.  **Commit Code:**
    ```bash
    git add .
    git commit -m "Initial commit of SplitEx"
    ```

4.  **Push to GitHub:**
    -   Go to [GitHub.com](https://github.com) and create a new repository (e.g., `splitex-app`).
    -   Copy the "Remote URL".
    -   Run:
        ```bash
        git remote add origin https://github.com/YOUR_USERNAME/splitex-app.git
        git branch -M main
        git push -u origin main
        ```

---

## Phase 2: Backend (Supabase)

If you haven't already set up a production Supabase project:

1.  **Create Project:**
    -   Go to [Supabase.com](https://supabase.com).
    -   Create a new project.
    -   Note down the **Project URL** and **anon public key** (Settings -> API).

2.  **Database Schema:**
    -   Go to the **SQL Editor** in Supabase.
    -   Copy the content of your local `master_schema.sql`.
    -   Paste and run it to create the Tables and Policies.

3.  **Authentication Settings:**
    -   Go to **Authentication -> URL Configuration**.
    -   **Site URL**: Initially `http://localhost:5173`. You will update this to your production URL later (e.g., `https://splitex.vercel.app`).
    -   **Redirect URLs**: Add your production URL + `/**`.

---

## Phase 3: Frontend Deployment (Vercel)

We recommend **Vercel** for hosting React/Vite apps.

1.  **Sign Up/Login:** Go to [Vercel.com](https://vercel.com) and login with GitHub.
2.  **Add New Project:** Click "Add New..." -> "Project".
3.  **Import Repository:** Select your `splitex-app` repo from the list.
4.  **Configure Build:**
    -   **Framework Preset**: Vite (should detect automatically).
    -   **Root Directory**: `./` (default).
    -   **Build Command**: `npm run build` (default).
    -   **Output Directory**: `dist` (default).
5.  **Environment Variables:**
    Expand the "Environment Variables" section and add:
    -   `VITE_SUPABASE_URL`: (Your Supabase Project URL)
    -   `VITE_SUPABASE_ANON_KEY`: (Your Supabase Anon Key)
6.  **Deploy:** Click "Deploy".

Vercel will build your app and give you a live URL (e.g., `https://splitex-app.vercel.app`).

---

## Phase 4: Final Configuration

1.  **Update Supabase Auth Redirects:**
    -   Copy your new Vercel URL (e.g., `https://splitex-app.vercel.app`).
    -   Go back to **Supabase Dashboard -> Authentication -> URL Configuration**.
    -   Update **Site URL** to your Vercel URL.
    -   Add `https://splitex-app.vercel.app/**` to **Redirect URLs**.

2.  **Test Production:**
    -   Open your Vercel URL.
    -   Sign up/Login.
    -   Create a group and test the flow.

**🎉 Congratulations! SplitEx is now live!**
