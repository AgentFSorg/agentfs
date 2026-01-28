import { spawn } from "node:child_process";
import net from "node:net";

const METRICS_TOKEN = "smoke-metrics-token";

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function pickFreePort() {
  if (process.env.SMOKE_PORT) return Number(process.env.SMOKE_PORT);

  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  await new Promise((resolve) => server.close(resolve));
  if (!port) throw new Error("Failed to allocate a free port for smoke test");
  return port;
}

async function waitForHealthy(base, timeoutMs = 15_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${base}/healthz`);
      if (res.ok) return;
    } catch {
      // ignore until ready
    }
    await sleep(200);
  }
  throw new Error(`API did not become healthy within ${timeoutMs}ms`);
}

async function main() {
  const port = await pickFreePort();
  const base = `http://127.0.0.1:${port}`;

  const child = spawn("pnpm", ["--filter", "@agentfs/api", "exec", "tsx", "src/index.ts"], {
    stdio: "inherit",
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "production",
      ENABLE_METRICS: "true",
      METRICS_TOKEN
    }
  });

  try {
    const exited = new Promise((_, reject) => {
      child.once("exit", (code, signal) => {
        reject(new Error(`API process exited early (code=${code}, signal=${signal})`));
      });
      child.once("error", (err) => {
        reject(err);
      });
    });
    await Promise.race([waitForHealthy(base, 60_000), exited]);

    const health = await fetch(`${base}/healthz`);
    if (!health.ok) throw new Error(`/healthz failed: ${health.status}`);

    const metricsNoAuth = await fetch(`${base}/metrics`);
    if (metricsNoAuth.status !== 401) {
      throw new Error(`/metrics expected 401 without auth, got ${metricsNoAuth.status}`);
    }

    const metricsAuth = await fetch(`${base}/metrics`, {
      headers: { Authorization: `Bearer ${METRICS_TOKEN}` }
    });
    if (!metricsAuth.ok) throw new Error(`/metrics expected 200 with auth, got ${metricsAuth.status}`);

    console.log("smoke: ok");
  } finally {
    child.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error("smoke: failed", err);
  process.exit(1);
});
