import client from "prom-client";

export const register = new client.Registry();
client.collectDefaultMetrics({ register });

export const httpRequests = new client.Counter({
  name: "agentos_http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["route", "method", "status"],
  registers: [register]
});

export const httpDuration = new client.Histogram({
  name: "agentos_http_request_duration_ms",
  help: "HTTP request duration (ms)",
  labelNames: ["route", "method"],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  registers: [register]
});

export const embeddingJobs = new client.Counter({
  name: "agentos_embedding_jobs_total",
  help: "Total embedding jobs by status",
  labelNames: ["status"],
  registers: [register]
});

export const quotaDenials = new client.Counter({
  name: "agentos_quota_denials_total",
  help: "Total quota denials by type",
  labelNames: ["type"],
  registers: [register]
});
