import { spawn } from "node:child_process";

const PORT = Number(process.env.SMOKE_PORT || 8799);
const BASE = `http://127.0.0.1:${PORT}`;
const METRICS_TOKEN = "smoke-metrics-token";

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function waitForHealthy(timeoutMs = 15_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/healthz`);
      if (res.ok) return;
    } catch {
      // ignore until ready
    }
    await sleep(200);
  }
  throw new Error(`API did not become healthy within ${timeoutMs}ms`);
}

async function main() {
  const child = spawn("pnpm", ["--filter", "@agentfs/api", "exec", "tsx", "src/index.ts"], {
    stdio: "inherit",
    env: {
      ...process.env,
      PORT: String(PORT),
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
    });
    await Promise.race([waitForHealthy(30_000), exited]);

    const health = await fetch(`${BASE}/healthz`);
    if (!health.ok) throw new Error(`/healthz failed: ${health.status}`);

    const metricsNoAuth = await fetch(`${BASE}/metrics`);
    if (metricsNoAuth.status !== 401) {
      throw new Error(`/metrics expected 401 without auth, got ${metricsNoAuth.status}`);
    }

    const metricsAuth = await fetch(`${BASE}/metrics`, {
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
