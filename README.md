# UMiX Convert

UMiX Convert is a static HTML5, CSS3 and vanilla JavaScript application. Its browser-side tools use the checked-in files in `vendor/`; no build step or package installation is required.

## Run locally

From this folder, start any ordinary static HTTP server and open its URL. For example, with Node.js:

```powershell
npx --yes http-server .
```

Opening `index.html` directly also works for basic pages, but HTTP serving is recommended for production-like testing and browser security behavior.

## Production root

This repository root is the deployable site root. Deploy the HTML pages plus `css/`, `images/`, `js/`, and `vendor/`. Do not publish `backup-20261011-ui-audit/`, `qa-stage28-evidence/`, or the `qa-*.cjs` test runners; they are local audit material, not site content.

The site is provider-neutral and needs no rewrite rules, redirects, backend, framework, or build command. Root-relative hosting is supported by the existing relative asset paths.

## Current scope

The homepage, responsive navigation, tool discovery search/category filter, 30 tool routes, local vendor libraries, and browser-side conversion utilities are included. Conversion fidelity and format support remain tool-specific; see each tool page for its limitations.
