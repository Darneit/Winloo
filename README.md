# Winloo Frontend Website

A static, frontend-only rebuild of the Winloo Group website using the approved editorial/industrial design direction.

## Pages
- `index.html` — Home
- `about.html` — About
- `architecture.html` — Architecture
- `interior.html` — Interior & Fit-Out
- `bim.html` — BIM & Engineering
- `lighting.html` — Lighting
- `contracting.html` — Contracting & Industrial Works
- `projects.html` — Projects
- `contact.html` — Contact
- `404.html`, `privacy.html`, `terms.html`

## Run locally
From the project folder:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Editing
- Global styling: `assets/css/style.css`
- Shared interactions: `assets/js/main.js`
- Images: `assets/images/`
- Logo assets: `assets/logo/`
- Navigation/footer markup is repeated in each static HTML page for maximum host compatibility.
- Contact details are present in `contact.html` and repeated in the footer of each page.

## Form behavior
The contact form performs client-side HTML validation only. It does not send data. On valid submission it shows: “Form submission will be enabled when the backend is connected.”

## Backend
No backend, database, authentication, email integration, CMS, Supabase, Firebase, API routes or serverless functions are included.

## Source basis
Content was derived from the supplied Winloo company profile and the current Winloo public website. The profile is used for company background, contracting capabilities, resources, industries, industrial project scopes and contact details; the public website is used for architecture, interior, lighting and BIM service material. Unsupported legal policies, social links, certifications, dates, metrics and project values were not invented.

## Deployment
This project is suitable for GitHub Pages, Netlify, Cloudflare Pages or standard static hosting. Upload the project root as the published directory.
