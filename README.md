<<<<<<< HEAD
# AccessCheck Universal

**A local-first website accessibility auditing tool built with Node.js, Express, Playwright, Chromium, and axe-core.**

AccessCheck Universal scans one public webpage at a time, displays common automated accessibility findings, highlights affected DOM elements, links to remediation guidance, and exports a JSON report. It is a learning and portfolio project—not a WCAG certification product.

## Features

- Scan a public page using Chromium controlled by Playwright.
- Run axe-core checks tagged for WCAG 2 A/AA, WCAG 2.1 A/AA, WCAG 2.2 AA, and best practices.
- View violations, passes, incomplete checks, affected nodes, selectors, HTML snippets, impact levels, and guidance links.
- Filter violations by impact and export results as JSON.
- Apply local-use safety controls: local-only binding, HTTP/HTTPS-only targets, URL/DNS validation, private-destination blocking, request limits, rate limiting, one concurrent scan, and blocked popups/downloads/service workers.
- Run automated API smoke tests using Node's built-in test runner.

## Requirements

- Windows 10/11, macOS, or Linux
- Node.js 20 or newer (an active LTS release is recommended)
- Internet access for dependency/browser installation and scanning public websites

## Quick start

### 1. Get the code

Clone your repository or download this project, then open the project root—the folder containing `package.json`—in VS Code.

```bash
git clone https://github.com/YOUR-USERNAME/accesscheck-universal.git
cd accesscheck-universal
```

Replace `YOUR-USERNAME` with your GitHub username. If you downloaded a ZIP, extract it and open the folder that directly contains `package.json`.

### 2. Install dependencies

```bash
npm install
npx playwright install chromium
```

**Windows PowerShell note:** if PowerShell blocks `npm.ps1` because script execution is disabled, use `npm.cmd` and `npx.cmd` instead:

```powershell
npm.cmd install
npx.cmd playwright install chromium
```

### 3. Start the app

```bash
npm start
```

If PowerShell requires the Windows command form, run `npm.cmd start`. Open **http://127.0.0.1:3000** in your browser. Keep the terminal open while using the scanner. Press `Ctrl+C` in that terminal to stop it.

### 4. Run tests

```bash
npm test
```

PowerShell alternative: `npm.cmd test`. These smoke tests cover the health endpoint and rejection of malformed, unsupported, and localhost URLs; they are not a complete security or accessibility test suite.

## How to use

1. Enter a complete public URL starting with `https://` or `http://`.
2. Select **Scan website**.
3. Review violation rules and affected elements.
4. Open the manual-review section for checks axe-core could not conclusively evaluate.
5. Download the JSON report to preserve results.

Only one page is scanned; the tool does not crawl a whole site, log in, or interact with complex workflows. Some sites block automation, require consent, render content only after interaction, or may not scan successfully.

## Project structure

```text
accesscheck-universal/
├── public/
│   ├── index.html       # Scanner interface
│   ├── styles.css       # Responsive styling
│   └── app.js           # Scan UI, filters, and JSON export
├── tests/
│   └── server.test.js   # API smoke tests
├── .gitignore
├── CONTRIBUTING.md
├── LICENSE
├── package.json
├── README.md
├── SECURITY.md
└── server.js            # Local API, URL checks, Playwright, axe-core
```

## Technology choices

- **Node.js + Express:** local HTTP server and API endpoint.
- **Playwright + Chromium:** loads and inspects the rendered page.
- **axe-core:** runs automated accessibility rules in the page context.
- **HTML, CSS, vanilla JavaScript:** UI without a frontend framework.

## Safety and limitations

The server binds to `127.0.0.1` by default. It restricts URLs to HTTP/HTTPS and standard web ports, rejects credentials and local/internal hostnames, checks DNS results, revalidates browser network requests, limits network requests, restricts concurrency, rate-limits scan requests, and blocks service workers, popups, and downloads.

These are defensive controls for a local portfolio project, **not a guarantee that the tool is safe to host as a public service**. DNS rebinding and browser/network edge cases cannot be eliminated completely by application-level checks. Do not expose this server to the public internet, do not use it to scan private or authenticated pages, and scan only websites you are authorized to test. A hosted version would need stronger isolation and outbound network firewall controls.

Automated results are not a full WCAG conformance assessment. A zero-violation report does not prove a page is accessible. Manual testing should include keyboard-only navigation, visible focus, focus order, zoom/reflow, accessible names, form errors, screen-reader behavior, and realistic user workflows.

## Troubleshooting

- **`node` is not recognized:** install Node.js 20+ and reopen your terminal.
- **PowerShell blocks `npm.ps1`:** use `npm.cmd` and `npx.cmd`.
- **Chromium is missing:** run `npx playwright install chromium` (or `npx.cmd playwright install chromium`).
- **Port 3000 is busy:** in PowerShell, run `$env:PORT=3001; npm.cmd start`, then visit `http://127.0.0.1:3001`.
- **A site cannot be scanned:** it may block automation, have TLS/redirect issues, or exceed navigation/request limits. Do not disable URL safety checks to force a scan.
- **No violations found:** only the automated rules that ran passed; manual checks are still necessary.

## License

Released under the MIT License. See [`LICENSE`](LICENSE).
=======
# accesscheck-universal
Automated web accessibility auditing tool built with JavaScript, Node.js, Express.js, Playwright, and axe-core.
>>>>>>> 631e1c04a40d7ca64f1865e53ce6ee6bc62df103
