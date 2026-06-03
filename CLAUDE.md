# CoachPulse - nioquant

## Project
Garmin Connect IQ data field. AI coaching cues on-watch using the user's own API key (OpenAI, Anthropic, or Google). No server-side data collection. All data stays on device and goes directly to the AI provider.

## Key files
- /coachpulse/privacy-policy.html - global privacy compliance, updated June 2026
- /coachpulse/index.html - product landing page; links to privacy-policy.html via relative href
- /index.html - root landing page for nioquant.com; lists all products
- /sitemap.xml - lists canonical URLs; does not include privacy policy pages individually
- /CNAME - custom domain: nioquant.com

## Privacy architecture
Data controller: Nioquant, obrt za usluge, vl. Fran Čudina, Zagreb, Štefanićeva ulica 1, Croatia.
Legal basis: Article 6(1)(b) performance of contract for general data; Article 9(2)(a) explicit consent for health and biometric data.
No server receives user data. International transfers go directly from the user's device to the chosen AI provider.

## Repo structure
GitHub Pages site at nioquant.com. Each product has its own subdirectory:
- /coachpulse/ - Garmin Connect IQ data field (AI coaching)
- /racketscore/ - racket sports scoring app
- /tictactoe/, /connect4/, /dotsandboxes/ - Garmin watch games
- /raindrop/, /3dtime/, /simple3dtime/ - Garmin watch faces
- /scanplan/, /raman/ - other tools
- /assets/ - shared images organised by product subdirectory

Privacy policies live at /<product>/privacy-policy.html. The sidebar in each privacy policy page links to the others using root-relative paths (/coachpulse/privacy-policy.html etc.).

## Garmin Connect IQ store
CoachPulse app ID: e8e7a400-f711-495c-b9a5-eaed8cc5f349
Store URL: https://apps.garmin.com/apps/e8e7a400-f711-495c-b9a5-eaed8cc5f349
The privacy policy URL in the store listing (https://nioquant.com/coachpulse/privacy-policy.html) must be updated manually in the Garmin Developer Portal whenever the filename changes. It matches the canonical link in the current file.

## Style rules
No em dashes anywhere in content. Hyphens are fine.
