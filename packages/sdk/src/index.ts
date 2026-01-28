export type AgentFSClientOpts = {
  baseUrl: string;
  apiKey: string;
  agentId?: string;
};

async function post<T>(baseUrl: string, apiKey: string, path: string, body: any): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`);
  return json as T;
}

export class AgentFSClient {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly agentId: string;

  constructor(opts: AgentFSClientOpts) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.apiKey = opts.apiKey;
    this.agentId = opts.agentId || "default";
  }

  put(args: { path: string; value: any; ttlSeconds?: number; tags?: string[]; importance?: number; searchable?: boolean }) {
    return post(this.baseUrl, this.apiKey, "/v1/put", {
      agent_id: this.agentId,
      path: args.path,
      value: args.value,
      ttl_seconds: args.ttlSeconds,
      tags: args.tags,
      importance: args.importance,
      searchable: args.searchable
    });
  }

  get(path: string) {
    return post(this.baseUrl, this.apiKey, "/v1/get", { agent_id: this.agentId, path });
  }

  delete(path: string) {
    return post(this.baseUrl, this.apiKey, "/v1/delete", { agent_id: this.agentId, path });
  }

  list(prefix: string) {
    return post(this.baseUrl, this.apiKey, "/v1/list", { agent_id: this.agentId, prefix });
  }

  glob(pattern: string) {
    return post(this.baseUrl, this.apiKey, "/v1/glob", { agent_id: this.agentId, pattern });
  }

  history(path: string, limit = 20) {
    return post(this.baseUrl, this.apiKey, "/v1/history", { agent_id: this.agentId, path, limit });
  }

  search(args: { query: string; limit?: number; pathPrefix?: string; tagsAny?: string[] }) {
    return post(this.baseUrl, this.apiKey, "/v1/search", {
      agent_id: this.agentId,
      query: args.query,
      limit: args.limit,
      path_prefix: args.pathPrefix,
      tags_any: args.tagsAny
    });
  }
}
