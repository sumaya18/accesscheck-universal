const form = document.querySelector("#scan-form");
const urlInput = document.querySelector("#url-input");
const scanButton = document.querySelector("#scan-button");
const statusCard = document.querySelector("#status-card");
const statusTitle = document.querySelector("#status-title");
const statusMessage = document.querySelector("#status-message");
const results = document.querySelector("#results");
const violationsList = document.querySelector("#violations-list");
const incompleteList = document.querySelector("#incomplete-list");
const blockedList = document.querySelector("#blocked-list");
const impactFilter = document.querySelector("#impact-filter");
let latestReport = null;

document.querySelectorAll(".example-link").forEach(button => {
  button.addEventListener("click", () => {
    urlInput.value = button.dataset.url;
    urlInput.focus();
  });
});

function setStatus(title, message, kind = "") {
  statusTitle.textContent = title;
  statusMessage.textContent = message;
  statusCard.className = `status-card ${kind}`.trim();
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderFinding(item, isIncomplete = false) {
  const article = el("article", "finding");
  const head = el("div", "finding-head");
  const textWrap = el("div");
  textWrap.append(el("h4", "", item.help || item.id));
  textWrap.append(el("p", "", item.description || "Review this accessibility rule and its guidance."));
  const guidance = document.createElement("a");
  guidance.href = item.helpUrl || "https://www.w3.org/WAI/standards-guidelines/wcag/";
  guidance.target = "_blank";
  guidance.rel = "noopener noreferrer";
  guidance.textContent = "Read remediation guidance ↗";
  textWrap.append(guidance);
  head.append(textWrap, el("span", `impact ${item.impact || "needs-review"}`, item.impact || "Needs review"));
  article.append(head);

  (item.nodes || []).forEach(node => {
    const block = el("div", "node");
    const top = el("div", "node-top");
    top.append(el("span", "node-label", "Affected element"));
    top.append(el("code", "", (node.target || []).join(", ") || "Selector not provided"));
    block.append(top);
    if (node.html) block.append(el("pre", "", node.html));
    if (node.failureSummary) block.append(el("p", "failure", node.failureSummary));
    if (!node.failureSummary && isIncomplete) block.append(el("p", "", "Manual review is needed; automated checks could not determine whether this passes."));
    article.append(block);
  });
  if (item.totalAffectedNodes > (item.nodes || []).length) {
    article.append(el("p", "hint", `${item.totalAffectedNodes - item.nodes.length} additional affected elements omitted from this display.`));
  }
  return article;
}

function renderReport(report) {
  latestReport = report;
  results.classList.remove("hidden");
  document.querySelector("#violations-count").textContent = report.summary.violations;
  document.querySelector("#passes-count").textContent = report.summary.passes;
  document.querySelector("#incomplete-count").textContent = report.summary.incomplete;
  document.querySelector("#nodes-count").textContent = report.summary.affectedNodes;
  document.querySelector("#scan-meta").textContent = `${report.pageTitle || report.finalUrl} · ${new Date(report.scannedAt).toLocaleString()} · ${(report.durationMs / 1000).toFixed(1)}s`;
  document.querySelector("#incomplete-summary-count").textContent = report.incomplete.length;
  document.querySelector("#blocked-count").textContent = report.blockedRequests.length;
  renderViolations();
  incompleteList.replaceChildren();
  if (!report.incomplete.length) incompleteList.append(el("p", "hint", "No incomplete checks were returned by axe-core. Manual testing is still required."));
  report.incomplete.forEach(item => incompleteList.append(renderFinding(item, true)));
  blockedList.replaceChildren();
  if (!report.blockedRequests.length) blockedList.append(el("p", "hint", "No requests were blocked by the URL safety rules."));
  report.blockedRequests.forEach(item => {
    const p = el("p", "review-item", `${item.reason}: ${item.url}`);
    blockedList.append(p);
  });
}

function renderViolations() {
  if (!latestReport) return;
  const filter = impactFilter.value;
  const items = latestReport.violations.filter(item => filter === "all" || item.impact === filter);
  violationsList.replaceChildren();
  if (!items.length) {
    violationsList.append(el("div", "review-item", filter === "all" ? "No automated violations were found by the rules run. This does not prove full accessibility." : "No violations match this impact filter."));
    return;
  }
  items.forEach(item => violationsList.append(renderFinding(item)));
}
impactFilter.addEventListener("change", renderViolations);

form.addEventListener("submit", async event => {
  event.preventDefault();
  results.classList.add("hidden");
  scanButton.disabled = true;
  scanButton.textContent = "Scanning…";
  setStatus("Scan in progress", "Opening the page in Chromium and running axe-core. The initial page load has a 12-second timeout; some sites may take longer to finish loading checks.", "loading");
  try {
    const response = await fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: urlInput.value.trim() })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "The scan failed.");
    renderReport(payload);
    setStatus("Scan complete", `${payload.summary.violations} violation rule(s), ${payload.summary.passes} passing rule(s), ${payload.summary.incomplete} check(s) need manual review.`, "");
    document.querySelector("#results-heading").focus?.();
    results.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    setStatus("Scan could not complete", error.message || "Unexpected error. Check that the local backend is running.", "error");
  } finally {
    scanButton.disabled = false;
    scanButton.innerHTML = '<span aria-hidden="true">⌕</span> Scan website';
  }
});

document.querySelector("#download-button").addEventListener("click", () => {
  if (!latestReport) return;
  const blob = new Blob([JSON.stringify(latestReport, null, 2)], { type: "application/json" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = "accesscheck-universal-report.json";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
});
