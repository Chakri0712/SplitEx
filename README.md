# SplitEx 💸

**SplitEx** is a modern, premium web application for splitting expenses with friends and groups. Built with a "Mobile First" approach, it offers a seamless experience for tracking shared costs, settling debts, and managing group finances with a sleek, dark-themed UI.

![SplitEx Dashboard](https://via.placeholder.com/800x400?text=SplitEx+App+Preview)

## ✨ Key Features

-   **Create & Join Groups**: Easily create groups with custom currencies or join existing ones via invite codes.
-   **Expense Tracking**: Add expenses with details (amount, payer, date, description) and support for unequal splits.
-   **Smart Splitting**:
    -   **Equal Splits**: Automatically divides costs among all members.
    -   **Unequal Splits**: "Smart Lock" feature allows you to set specific amounts for some members while automatically redistributing the remainder to others.
-   **Balances & Settlements**:
    -   View net balances (who owes whom).
    -   "Settle Up" functionality to record payments between members.
    -   Prevents users from leaving groups if they have outstanding debts.
-   **Modern UI/UX**:
    -   **"Midnight Black + Gold"** Premium Theme.
    -   Mobile-responsive design.
    -   Dark mode native support.
    -   Clean, list-based dashboard and expense views.

## 🛠️ Tech Stack

-   **Frontend**: React (Vite)
-   **Styling**: Vanilla CSS (CSS Variables for theming)
-   **Backend / Database**: Supabase (PostgreSQL)
-   **Authentication**: Supabase Auth
-   **Icons**: Lucide React
-   **Hosting**: Vercel / Netlify (Recommended)

## 🚀 Getting Started

### Prerequisites

-   Node.js (v16 or higher)
-   npm or yarn
-   A Supabase project (Free tier works great)

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/splitex.git
    cd splitex
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Environment Setup:**
    Create a `.env` file in the root directory:
    ```env
    VITE_SUPABASE_URL=your_supabase_project_url
    VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
    ```

4.  **Database Setup:**
    Run the SQL scripts provided in `master_schema.sql` in your Supabase SQL Editor to set up tables and Row Level Security (RLS) policies.

5.  **Run Locally:**
    ```bash
    npm run dev
    ```
    Open `http://localhost:5173` to view the app.

    > **Tip:** To access the app from your mobile device on the same network, run:
    > ```bash
    > npm run dev --host
    > ```
    > This exposes the app on your local IP address (e.g., `http://192.168.1.5:5173`).

## 📱 User Flow

1.  **Sign Up/Login**: Users authenticate via email/password.
2.  **Dashboard**: View a list of all your groups.
3.  **Create/Join Group**: Start a new expense group or enter a code to join one.
4.  **Add Expense**:
    -   Click "+" to add a bill.
    -   Select who paid and how to split (Equal/Unequal).
5.  **Settle Up**:
    -   Go to the "Balances" tab.
    -   See who owes you or whom you owe.
    -   Click "Settle" to record a payment.

## 🔒 Security

-   **RLS Policies**: Data is secured using Row Level Security. Users can only see groups they are members of.
-   **Debt Protection**: Users are prevented from leaving a group if they still owe money to others.

---
Built with ❤️ by [Your Name]
