# Minty — Income & Expense Tracker

A static HTML/CSS/JavaScript finance tracker using **Supabase** for authentication + Postgres storage and **Vercel** for hosting.

## Features

- Email/password sign in and account creation
- Income and expense transactions with date + time
- Custom expense/income categories and colors
- Day, month, and year overview
- Balance, income, expenses, transaction count
- Doughnut/pie-style expense chart powered by Chart.js
- Monthly transaction calendar
- Search/filter transactions
- Edit/delete transactions
- Five themes: Clean Light, Clean Dark, Lavender Milk, Peach Soda, Mint Cloud
- Responsive layout for desktop and mobile
- Row Level Security so each user can access only their own records

## 1. Set up Supabase

1. Open your Supabase project.
2. Go to **SQL Editor**.
3. Paste and run the full contents of `schema.sql`.
4. Go to **Authentication → Providers** and make sure Email is enabled.
5. For easiest testing, you can disable email confirmation in your Auth email-provider settings. If confirmation stays enabled, users need to confirm their email after sign-up.

The project URL and browser-safe publishable key are already placed in `config.js`.

> Never put a Supabase secret/service-role key in this project. This frontend is public. The publishable key is intentionally browser-safe; RLS protects the data.

## 2. Test locally

Because this app loads dependencies from CDNs, serve the folder with a small local web server instead of double-clicking `index.html`.

### Python

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## 3. Deploy to Vercel

### Easiest: Vercel Drop

Upload the whole project folder or the ZIP file to Vercel Drop. It is a static site and needs no build command.

### Git workflow

Push these files to a GitHub repository, import the repository into Vercel, and deploy. Framework preset can remain **Other** / static.

## Files

- `index.html` — app structure
- `styles.css` — responsive UI and all themes
- `app.js` — auth, database CRUD, views, calendar, chart
- `config.js` — Supabase project URL + publishable key
- `schema.sql` — database tables, policies, trigger/default categories

## Database model

### `transactions`
- `user_id`
- `category_id`
- `type` (`income` / `expense`)
- `amount`
- `note`
- `occurred_at`

### `categories`
- `user_id`
- `name`
- `type`
- `color`

### `preferences`
- `user_id`
- `theme`
- `currency`

All three tables have Row Level Security policies based on `auth.uid()`.
