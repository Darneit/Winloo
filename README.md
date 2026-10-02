# Winloo Contracting Company LLP Website

Static production-ready frontend for Winloo, centered on industrial contracting, steel, piping, civil and infrastructure capabilities.

## Main pages
- Home
- About
- Services
- Projects
- Careers
- Contact

## Source basis
The official Winloo company profile is the primary factual source. The existing approved website is retained as a secondary source for the Design & Digital Engineering project subsection. Unsupported certification, vendor-status, project-value and client-relationship claims are intentionally avoided.

## Forms
The site is static. Project and career forms validate in-browser and open a pre-filled email to `info@winloogroup.com`. File selections must be attached manually to the email draft. The markup is structured so a server-side endpoint can replace this fallback without redesigning the forms.

## Deployment
Publish the repository root on Cloudflare Pages. No build command is required.

## Before final-domain launch
`robots.txt` currently blocks crawling because the present deployment is staging. Change it to `Allow: /` after the final custom domain is connected and verified.