CELERITY NETWORKS WEBSITE ENHANCEMENT PATCH
Date: 25 November 2026

This patch is designed for the current Celerity Networks project after applying the
celerity-preview-deployment-patch-20261125.zip patch. It does not include .dev.vars,
.env files, credentials, .git data, node_modules, or dist output.

WHAT THIS PATCH CHANGES
1. Adds editable dataset and competition records. Admins can reopen a saved record,
   update its details, replace its data file if needed, and publish it later without
   re-uploading the original file.
2. Adds optional PNG/JPG/WEBP thumbnail uploads (5 MB maximum) for datasets and
   competitions. Images are stored in private R2 keys and served only when the
   associated resource is public. Draft and archived thumbnails are not publicly served.
3. Adds migration 0012_resource_thumbnails.sql for thumbnail_key columns.
4. Adds migration 0013_competition_update_audit.sql. The migration preserves existing
   audit history and permits the immutable `updated` audit event required when editing
   a published competition.
5. Refines the shared public-page navigation and visual language across the homepage,
   Dataset Hub, Competitions gallery and competition detail pages.
4. Automatically publishes a competition as Upcoming when its start time is in the
   future, Live/Active when its start time has arrived, and Completed after its end.
   Drafts remain private. Registration is blocked after the competition end date.
5. Displays dataset descriptions and learning objectives on the Dataset Hub and
   redesigns the page with responsive cards, thumbnail imagery, filters and a cleaner
   resource-library layout. The Dataset Hub has no multi-tab page navigation.
6. Reduces homepage navigation to What We Do, Datasets, Competitions and About Us.
7. Adds a lightweight Celerity FAQ chatbot with quick replies and hand-off links to
   email, WhatsApp and phone. Contact/enquiry calls to action open the chatbot first.
8. Allows the admin API to validate more than one Cloudflare Access audience. This is
   useful if separate Access applications are used for /admin* and /api/admin/*.
9. Adds automated tests for draft editing, publication timing, thumbnail validation,
   private draft-image handling and multiple Access audiences.

APPLY ON WINDOWS (POWERSHELL)
Run from PowerShell:

$Project = "C:\Users\USER\Downloads\celerity-networks-registration-v8\celerity-networks"
$Patch = "$env:USERPROFILE\Downloads\celerity-website-enhancement-patch-20261125.zip"
Expand-Archive -Path $Patch -DestinationPath $Project -Force
Set-Location $Project
node --test
npm run build
git diff --check

If your project folder is in a different location, change only the $Project path.
Do not replace or upload .dev.vars. This patch does not need local secrets.

PREVIEW DATABASE MIGRATION ONLY
After the source tests and build pass, apply the new migration to the Preview D1 database:

npx wrangler d1 migrations apply celerity-preview-registrations --remote --env preview
npx wrangler d1 migrations list celerity-preview-registrations --remote --env preview

This update includes migration 0013_competition_update_audit.sql. Apply all pending
Preview migrations using the same command above. Verify that no migrations remain.

Do not run this against celerity-student-registrations or use --env production at this stage.

PREVIEW CLOUDFLARE CONFIGURATION
In Cloudflare Dashboard, open Workers & Pages > celeritynetworks > Settings > Variables
and Secrets, then select the Preview environment. Verify these values are configured:
- RESEND_API_KEY (secret)
- RESEND_FROM_EMAIL (verified sender address in Resend)
- VERIFICATION_SECRET (secret, long random value)
- RATE_LIMIT_SALT (secret, at least 32 random characters; required by student enrolment rate limiting)
Also verify Preview bindings point to:
- D1 REGISTRATIONS: celerity-preview-registrations
- R2 DATASETS_BUCKET: celerity-preview-datasets
The local .dev.vars file is not uploaded by `wrangler pages deploy`.
Never paste secret values into chat or source files. Both RATE_LIMIT_SALT and VERIFICATION_SECRET
are required for their respective public registration rate-limit flows. RESEND_API_KEY and
RESEND_FROM_EMAIL are required for email verification flows.

CLOUDFLARE ACCESS CONFIGURATION
The public website hostname must not be protected by a site-wide Access application.
Restrict Access to the admin paths only:
- /admin* (admin dashboard)
- /api/admin/* (admin API)
Keep public pages and participant-facing endpoints outside those Access applications.
If Cloudflare Access requires separate applications for those two paths, configure both
with the same admin allow policy and add both application AUD values to the relevant
CLOUDFLARE_ACCESS_AUD variable as a comma-separated list. Preview and Production have
separate Access audiences, so update the Preview variable for Preview apps and the
Production variable for Production apps. Keep the Cloudflare Access JWT middleware enabled.

PREVIEW DEPLOYMENT
Only after the Preview migration and Preview configuration are verified:

npm run build
npx wrangler pages deploy dist --project-name celeritynetworks --branch preview

Then test public homepage access, competition registration and email verification,
admin access, dataset editing/publishing, competition editing/publishing, and thumbnail
visibility on the Preview URL. Use disposable test records for any delete tests.

PRODUCTION HAS NOT BEEN DEPLOYED OR MIGRATED BY THIS PATCH.
Do not deploy production or apply production migrations until Preview validation is
complete and the owner explicitly approves.

VALIDATION NOTE
The automated Node test suite passed in the patch workspace. A production Vite build
could not be run in this Linux workspace because the uploaded node_modules contains
only the Windows Rolldown native binding. Run `npm run build` in the user's Windows
PowerShell project environment before deploying.
