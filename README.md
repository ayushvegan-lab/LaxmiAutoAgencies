# Sales Billing Desk

Sales visits, orders, billing confirmation and approvals for three kinds of user
(salesperson, billing, admin). The database is Supabase (Postgres); the web app and
its three small server functions run on Vercel.

```
public/index.html     the web app (one page, no build step)
api/config.js         gives the page its Supabase address and publishable key
api/login.js          signs a user in by username and password
api/users.js          creates and edits logins (admin only)
lib/supabase.js       shared code for the server functions
supabase/schema.sql   tables, access rules and order rules for the database
```

## Set up (about 15 minutes)

### 1. Supabase: create the database
1. Sign in at supabase.com and create a new project. Pick the region closest to you
   (for India, Mumbai). Save the database password somewhere safe.
2. Open **SQL Editor**, start a new query, paste the whole of `supabase/schema.sql`
   and choose **Run**. It should finish with "Success".
3. Open **Project Settings > API Keys** (the **Connect** button also shows these) and copy three values:
   - **Project URL**, like `https://abcdefgh.supabase.co`
   - **Publishable key**, starts with `sb_publishable_` (on older projects: the `anon` key)
   - **Secret key**, starts with `sb_secret_` (on older projects: the `service_role` key).
     Keep this one private. It is only ever stored in Vercel.

### 2. GitHub: upload the code
1. Create a new private repository on github.com.
2. Choose **uploading an existing file** and drag in everything from this folder
   (`public`, `api`, `lib`, `supabase`, `README.md`). Commit.

### 3. Vercel: put the app online
1. Sign in at vercel.com with GitHub, choose **Add New > Project** and import the repository.
2. Framework preset: **Other**. Leave the build settings empty.
3. Under **Environment Variables** add:

   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | the Project URL |
   | `SUPABASE_PUBLISHABLE_KEY` | the publishable (or anon) key |
   | `SUPABASE_SECRET_KEY` | the secret (or service_role) key |

4. Choose **Deploy**. Vercel gives you a web address such as `your-app.vercel.app`.

### 4. First use
1. Open the web address. Because no admin exists yet, the page asks you to
   **create the admin login**. Do this yourself straight away.
2. Sign in as admin and add stock items (with category and litres or nos per quantity),
   customers, and a login for each salesperson and the billing person.
3. Give your staff the web address, their username and their password.

## How access is enforced
The rules live in the database, so they hold even if someone bypasses the page:
- A salesperson can read and add only their own visits and orders.
- Billing can read all orders and record billing, but cannot bill an order that is
  waiting for approval, cannot approve, and cannot change ordered quantities.
- Billed quantity can never be more than ordered quantity.
- Only the admin can change items, customers and users, and approve or reopen orders.
- Switching a login off blocks it immediately.

## How data is kept
Every visit and order is a row in Postgres and is never deleted by the app, except when
the admin deletes an order or a salesperson cancels an order that is not yet billed.
The page loads only the period you choose (this month by default) plus all orders that
are still open, so it stays fast as history grows.

Things to know about Supabase plans (check their current pricing page):
- The free plan has a database size limit and pauses a project that is not used for a while.
  For daily business use, the paid plan avoids pausing and includes daily backups.
- To keep your own copy, export tables from **Table Editor** as CSV at any time.

## Troubleshooting
- **"The app is not connected to its database yet"**: an environment variable is missing
  or misspelt in Vercel. Fix it under Settings > Environment Variables, then redeploy.
- **"The app cannot reach its database"**: the secret key or URL is wrong, or
  `schema.sql` was not run.
- **Creating a user fails with an email error**: usernames are stored in Supabase as
  `username@<your Vercel address>`. If Supabase rejects that address, add an environment
  variable `LOGIN_DOMAIN` in Vercel with a domain you own (for example `yourcompany.in`)
  and redeploy. No email is ever sent to these addresses.
- **Order numbers** come from the database (`SO-0001`, `SO-0002`, …). A cancelled or
  failed order can leave a gap in the sequence.
