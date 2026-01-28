import client from "prom-client";

export const register = new client.Registry();
client.collectDefaultMetrics({ register });

export const httpRequests = new client.Counter({
  name: "agentfs_http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["route", "method", "status"],
  registers: [register]
});

export const httpDuration = new client.Histogram({
  name: "agentfs_http_request_duration_ms",
  help: "HTTP request duration (ms)",
  labelNames: ["route", "method"],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  registers: [register]
});
