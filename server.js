const express = require("express");
const path = require("path");
const dns = require("node:dns").promises;
const { URL } = require("node:url");
const { isIP: nodeIsIP } = require("node:net");
const { chromium } = require("playwright");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const AXE_PATH = require.resolve("axe-core/axe.min.js");

app.disable("x-powered-by");
app.use(express.json({ limit: "10kb" }));
app.use(express.static(PUBLIC_DIR, { extensions: ["html"] }));

const MAX_URL_LENGTH = 2048;
const MAX_REQUESTS = 150;
const NAVIGATION_TIMEOUT_MS = 12000;
const MAX_CONCURRENT_SCANS = 1;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 3;
let activeScans = 0;
const rateBuckets = new Map();

function isPublicAddress(address) {
  // ipaddr/net is intentionally not used for classification: Node's isIP
  // validates syntax, while the built-in URL below is checked with
  // explicit IPv4/IPv6 range rules.
  const version = nodeIsIP(address);
  if (!version) return false;

  if (version === 4) {
    const parts = address.split(".").map(Number);
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    if (a >= 224) return false;
    if (a === 192 && b === 0) return false;
    if (a === 192 && b === 2) return false;
    if (a === 198 && (b === 51)) return false;
    if (a === 203 && b === 0) return false;
    return true;
  }

  const lower = address.toLowerCase();
  // Permit only globally routable IPv6 unicast space (2000::/3), excluding
  // documentation, benchmarking, ORCHID, mapped IPv4, and 6to4/Teredo.
  if (!lower.startsWith("2") && !lower.startsWith("3")) return false;
  if (lower.startsWith("2001:db8:")) return false;
  if (lower.startsWith("2001:10:") || lower.startsWith("2001:20:")) return false;
  if (lower.startsWith("2002:") || lower.startsWith("2001:0000:")) return false;
  if (lower.startsWith("::ffff:") || lower === "::1" || lower === "::") return false;
  return true;
}

function isForbiddenHostname(hostname) {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (!h || h === "localhost" || h.endsWith(".localhost")) return true;
  if (h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".test")) return true;
  if (h === "metadata.google.internal" || h === "metadata.google") return true;
  if (h.endsWith(".home") || h.endsWith(".lan")) return true;
  return false;
}

async function validateTarget(raw) {
  if (typeof raw !== "string" || raw.length > MAX_URL_LENGTH) {
    throw new Error("Enter a URL shorter than 2,048 characters.");
  }
  let url;
  try { url = new URL(raw.trim()); } catch { throw new Error("Enter a valid full URL, including https://."); }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP and HTTPS URLs are allowed.");
  if (url.username || url.password) throw new Error("URLs containing usernames or passwords are not allowed.");
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("For safety, only standard web ports 80 and 443 are allowed.");
  if (isForbiddenHostname(url.hostname)) throw new Error("Local and internal hostnames cannot be scanned.");
  if (nodeIsIP(url.hostname)) {
    if (!isPublicAddress(url.hostname)) throw new Error("Private or reserved IP addresses cannot be scanned.");
  } else {
    let records;
    try { records = await dns.lookup(url.hostname, { all: true, verbatim: true }); }
    catch { throw new Error("The hostname could not be resolved."); }
    if (!records.length || records.some(record => !isPublicAddress(record.address))) {
      throw new Error("The hostname resolves to a private or reserved address and was blocked.");
    }
  }
  url.hash = "";
  return url.toString();
}

function rateLimit(req, res, next) {
  const key = req.ip || req.socket.remoteAddress || "local";
  const now = Date.now();
  const existing = rateBuckets.get(key) || [];
  const fresh = existing.filter(t => now - t < RATE_WINDOW_MS);
  if (fresh.length >= RATE_MAX) return res.status(429).json({ error: "Scan limit reached. Try again in a minute (maximum 3 scans per minute)." });
  fresh.push(now);
  rateBuckets.set(key, fresh);
  next();
}

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "AccessCheck Universal" }));

app.post("/api/scan", rateLimit, async (req, res) => {
  if (activeScans >= MAX_CONCURRENT_SCANS) {
    return res.status(429).json({ error: "A scan is already running. Please try again when it finishes." });
  }

  let target;
  try { target = await validateTarget(req.body?.url); }
  catch (error) { return res.status(400).json({ error: error.message }); }

  activeScans++;
  let browser;
  let requestCount = 0;
  const blockedRequests = [];
  const startedAt = Date.now();

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      ignoreHTTPSErrors: false,
      acceptDownloads: false,
      serviceWorkers: "block",
      viewport: { width: 1365, height: 900 }
    });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);
    page.setDefaultTimeout(5000);
    page.on("popup", popup => popup.close().catch(() => {}));
    page.on("download", download => download.cancel().catch(() => {}));

    await page.route("**/*", async route => {
      const request = route.request();
      const requestUrl = request.url();
      requestCount++;
      if (requestCount > MAX_REQUESTS) {
        blockedRequests.push({ url: requestUrl.slice(0, 180), reason: "Request limit reached" });
        return route.abort("blockedbyclient");
      }

      let parsed;
      try { parsed = new URL(requestUrl); } catch {
        blockedRequests.push({ url: requestUrl.slice(0, 180), reason: "Invalid request URL" });
        return route.abort("blockedbyclient");
      }

      // Permit in-page data/blob resources only; all network requests are revalidated.
      if (["data:", "blob:", "about:"].includes(parsed.protocol)) return route.continue();
      if (!["http:", "https:"].includes(parsed.protocol) ||
          (parsed.port && !["80", "443"].includes(parsed.port)) ||
          isForbiddenHostname(parsed.hostname)) {
        blockedRequests.push({ url: requestUrl.slice(0, 180), reason: "Non-public or unsupported destination" });
        return route.abort("blockedbyclient");
      }

      try {
        if (nodeIsIP(parsed.hostname)) {
          if (!isPublicAddress(parsed.hostname)) throw new Error("Private IP");
        } else {
          const records = await dns.lookup(parsed.hostname, { all: true, verbatim: true });
          if (!records.length || records.some(record => !isPublicAddress(record.address))) throw new Error("Private DNS result");
        }
      } catch {
        blockedRequests.push({ url: requestUrl.slice(0, 180), reason: "Private, reserved, or unresolvable destination" });
        return route.abort("blockedbyclient");
      }
      return route.continue();
    });

    const navResponse = await page.goto(target, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
    if (!navResponse) throw new Error("The site did not return a navigable response.");
    if (navResponse.status() >= 400) throw new Error(`The site returned HTTP ${navResponse.status()}.`);
    await page.waitForTimeout(1000);

    // Load the locally installed axe-core package, not a remote script from the target.
    await page.addScriptTag({ path: AXE_PATH });
    const axeResults = await page.evaluate(async () => {
      return await window.axe.run(document, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]
        }
      });
    });

    const simplify = item => ({
      id: item.id,
      impact: item.impact || "needs-review",
      help: item.help,
      description: item.description,
      helpUrl: item.helpUrl,
      tags: item.tags,
      nodes: item.nodes.slice(0, 30).map(node => ({
        target: node.target,
        html: node.html.slice(0, 500),
        failureSummary: node.failureSummary || "",
        any: (node.any || []).map(check => ({ message: check.message, data: check.data })),
        all: (node.all || []).map(check => ({ message: check.message, data: check.data })),
        none: (node.none || []).map(check => ({ message: check.message, data: check.data }))
      })),
      totalAffectedNodes: item.nodes.length,
      nodesTruncated: item.nodes.length > 30
    });

    res.json({
      scannedUrl: target,
      finalUrl: page.url(),
      pageTitle: await page.title().catch(() => ""),
      scannedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      requestCount,
      limits: { maxRequests: MAX_REQUESTS, navigationTimeoutMs: NAVIGATION_TIMEOUT_MS, maxConcurrentScans: MAX_CONCURRENT_SCANS },
      summary: {
        violations: axeResults.violations.length,
        passes: axeResults.passes.length,
        incomplete: axeResults.incomplete.length,
        inapplicable: axeResults.inapplicable.length,
        affectedNodes: axeResults.violations.reduce((n, item) => n + item.nodes.length, 0)
      },
      violations: axeResults.violations.map(simplify),
      incomplete: axeResults.incomplete.slice(0, 40).map(simplify),
      blockedRequests: blockedRequests.slice(0, 20),
      disclaimer: "Automated results are not a full WCAG conformance assessment. Manually test keyboard use, focus order, screen-reader behavior, content meaning, and real user workflows."
    });
    await context.close();
  } catch (error) {
    const message = error.name === "TimeoutError"
      ? "The scan timed out. The site may be slow or may block automated browsers."
      : (error.message || "The scan failed.");
    if (!res.headersSent) res.status(422).json({ error: message, requestCount, blockedRequests: blockedRequests.slice(0, 10) });
  } finally {
    if (browser) await browser.close().catch(() => {});
    activeScans--;
  }
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`AccessCheck Universal is running at http://127.0.0.1:${PORT}`);
  console.log("Local-only server. Keep this terminal open while scanning.");
});
