CELERITY NETWORKS - HOMEPAGE V2 PATCH

FILES CHANGED
  index.html                 Browser tab title now: Tech Training and Consultancy | Building Future-Ready Skills & Solutions
  src/main.jsx               Only the homepage return was replaced with <HomePage/>. All other routes/pages untouched.
  src/SupportChatbot.jsx     Structured menu-driven chatbot with WhatsApp / email / call hand-off.
  src/support-chatbot.css    A few extra rules appended (nothing existing removed).
FILES ADDED
  src/HomePage.jsx           New homepage (Analyst Builder style) incl. reviews carousel and FAQ.
  src/home-redesign.css      Homepage styles, all scoped under .cnh (cannot affect other pages).
  src/reviews.js             The reviews shown in the carousel. EDIT THIS FILE.

BEFORE GOING LIVE
  1. Open src/reviews.js and replace the sample reviews with real ones (with permission).
     Delete "placeholder: true" from each entry you replace; that removes the "Sample review" badge.
  2. Facebook link in the footer now points to your page.

APPLY ON WINDOWS (POWERSHELL)
  $Project = "C:\Users\USER\Downloads\celerity-networks-registration-v8\celerity-networks"
  $Patch = "$env:USERPROFILE\Downloads\celerity-homepage-v2-patch.zip"
  Expand-Archive -Path $Patch -DestinationPath $Project -Force
  Set-Location $Project
  npm run build
