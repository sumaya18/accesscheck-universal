const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");

const port = 3217;
const baseUrl = `http://127.0.0.1:${port}`;
let server;

async function waitForServer() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error("Test server did not start within 10 seconds.");
}

before(async () => {
  server = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
    windowsHide: true
  });
  await waitForServer();
});

after(() => {
  if (server && !server.killed) server.kill();
});

test("health endpoint reports the service is running", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.service, "AccessCheck Universal");
});

test("scan endpoint rejects malformed URL input", async () => {
  const response = await fetch(`${baseUrl}/api/scan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: "not a url" }) });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /valid full URL/i);
});

test("scan endpoint rejects non-HTTP protocols", async () => {
  const response = await fetch(`${baseUrl}/api/scan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: "file:///C:/Windows/win.ini" }) });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /only HTTP and HTTPS/i);
});

test("scan endpoint blocks localhost targets", async () => {
  const response = await fetch(`${baseUrl}/api/scan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: "http://localhost:3000" }) });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /local and internal hostnames/i);
});
