# Celerity Networks Ltd website

Responsive React + Vite website for Celerity Networks Ltd. The site includes a student registration page at `/register` and a Cloudflare Pages Function that validates submissions, stores them in Cloudflare D1, applies basic abuse controls, and sends a confirmation email to the student plus a notification to the company through Resend.

## Run the website locally

1. Open this folder in VS Code.
2. Open Terminal and run:

   ```powershell
   npm.cmd install
   npm.cmd run dev
   ```

3. Open the local URL printed by Vite, usually `http://localhost:5173/`.

The Vite development server does not automatically run Cloudflare Pages Functions. The registration endpoint will only work after the Cloudflare D1 and Resend setup below, or when using the Cloudflare Pages local development tooling. Do not collect real student details until you have tested the deployed endpoint.

## Production setup: Cloudflare Pages + D1 + Resend

### 1. Create the D1 database

From this project directory, run:

```bash
npx wrangler d1 create celerity-student-registrations
```

Cloudflare prints a database ID. Replace `REPLACE_WITH_YOUR_CLOUDFLARE_D1_DATABASE_ID` in `wrangler.toml` with that ID. Do not publish a made-up ID. Then apply the schema:

```bash
npx wrangler d1 migrations apply celerity-student-registrations --remote
```

The migration creates `student_registrations` and a small rate-limit table. The database is accessed only by the server-side Pages Function, not by browser JavaScript.

### 2. Configure the Cloudflare Pages project

In Cloudflare, open **Workers & Pages → your Pages project → Settings → Bindings** and confirm the D1 database binding is named exactly `REGISTRATIONS`. If the project is already connected to GitHub, set the build command to `npm run build` and the build output directory to `dist`. The Pages project root should be this folder, the one containing `package.json`, `wrangler.toml`, `functions/`, and `src/`.

The `functions/api/register.js` file is deployed as `POST /api/register`.

### 3. Set up email delivery with Resend

1. Create an account at https://resend.com.
2. Add a domain you own and complete the DNS verification steps Resend provides. Do not use a sender address on a domain you do not control.
3. Create a Resend API key.
4. In the Cloudflare Pages project, open **Settings → Variables and Secrets** and add these for the Production environment (and Preview only if you want to test there):
   - `RESEND_API_KEY`: the Resend API key, stored as a secret.
   - `RESEND_FROM_EMAIL`: a sender identity verified by Resend, for example `Celerity Networks <registrations@YOUR-VERIFIED-DOMAIN>`.
   - `RATE_LIMIT_SALT`: a long, randomly generated secret used to hash source IPs for rate limiting. Keep it private.
5. Redeploy the Pages project after adding or changing environment variables.

The function sends new-registration notifications to `celeritynetworksltd@gmail.com` and a confirmation email to the student. The sender domain must be verified for reliable production delivery. Until email is configured, the API deliberately returns a service-unavailable response rather than pretending a registration was processed.

### 4. Test before publishing

Use a test email address you control and submit a test registration. Confirm all of the following:

- The form displays a success message only after the server saves the registration.
- A row appears in the D1 `student_registrations` table.
- The student receives a confirmation email.
- `celeritynetworksltd@gmail.com` receives the notification.
- Invalid fields and repeated submissions are rejected.
- The registration page works on mobile and desktop.

Check Cloudflare Pages Function logs and the Resend email logs if something fails. A temporary email provider failure does not remove a registration already saved in D1; the success response warns that email may be delayed.

## Student data and access

Student details are stored in Cloudflare D1 and are not sent to the browser as a database listing. Only staff with access to the Cloudflare account and D1 database should view the records. Use individual staff accounts and multifactor authentication, collect only details needed for enrolment, and establish a retention/deletion schedule. Do not commit API keys or student data to GitHub. This version does not process payments or provide a separate staff dashboard; authorised staff can inspect records using Cloudflare's D1 console or CLI.

## Production build

```powershell
npm.cmd run build
```

The static frontend output is written to `dist/`. Cloudflare Pages also deploys the `functions/` directory as server-side routes.
