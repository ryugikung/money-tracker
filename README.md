# Minty — personal income & expense tracker

Plain HTML/CSS/JS app. No build step. Deploys straight to Vercel; data lives in Supabase.

## 1. Set up the database (once)

1. Open your Supabase project: https://xwubfpgwyswyyuqhdzwq.supabase.co
2. Go to **SQL Editor → New query**.
3. Paste the entire contents of `schema.sql` and click **Run**.

This creates the `categories`, `transactions`, and `preferences` tables, turns on Row Level
Security, and adds policies so each account can only see its own rows.

## 2. Turn on email/password sign-in

Go to **Authentication → Providers → Email** and make sure Email/Password is enabled.

Since this is a personal app:
- Leave **Allow new users to sign up** ON just long enough to create your one account.
- Sign up once from the deployed site.
- Then go back to **Authentication → Settings** and turn **Allow new users to sign up** OFF.
  Existing accounts can still sign in — new ones just can't register.

## 3. Deploy to Vercel

Push these files to a GitHub repo (keep it Private — it's your financial data):

```
index.html
styles.css
app.js
config.js
vercel.json
README.md
schema.sql   (optional — kept for reference, not needed by the site itself)
```

Then in Vercel: **Add New → Project → Import Git Repository** → select the repo → Deploy.
No framework or build command needed — it's static files.

## 4. Updating later

When you want a change, replace the relevant file(s) in GitHub and commit. Vercel
redeploys automatically. You only need to touch `schema.sql` again if the database
structure itself changes.

## About the Supabase key

`config.js` contains your **publishable** key (`sb_publishable_...`). This is safe to ship in
browser code — it's not a secret. It cannot bypass Row Level Security, so even though it's
visible in the page source, database access is still limited to whoever is signed in as you.
Never put a `sb_secret_...` or service-role key in these files.

## Features

- Email/password sign-in, one account per install
- Add, edit, delete transactions with date, time, category, and note
- Custom income/expense categories with your own colors
- Monthly calendar with per-day activity dots
- Dashboard: balance, income, expenses, transaction count, category breakdown
- Analytics view with month/year/all-time ranges
- Search and filter transactions
- Five appearance themes (Clean Light, Clean Dark, Lavender Milk, Peach Soda, Mint
  Cloud), saved per account
- Responsive layout for mobile
