export type AgentOSClientOpts = {
  baseUrl: string;
  apiKey: string;
  agentId?: string;
};

export type PutOpts = {
  path: string;
  value: unknown;
  ttlSeconds?: number;
  tags?: string[];
  importance?: number;
  searchable?: boolean;
  idempotencyKey?: string;
};

export type PutResult = {
  ok: boolean;
  version_id: string;
  created_at: string;
};

export type GetResult = {
  found: boolean;
  path?: string;
  value?: unknown;
  version_id?: string;
  created_at?: string;
  expires_at?: string | null;
  tags?: string[];
};

export type DeleteResult = {
  ok: boolean;
  deleted: boolean;
  version_id: string;
  created_at: string;
};

export type ListItem = {
  path: string;
  type: "file" | "dir";
};

export type ListResult = {
  items: ListItem[];
};

export type GlobResult = {
  paths: string[];
};

export type HistoryVersion = {
  version_id: string;
  created_at: string;
  value: unknown;
  expires_at: string | null;
  deleted_at: string | null;
};

export type HistoryResult = {
  versions: HistoryVersion[];
};

export type SearchResult = {
  path: string;
  value: unknown;
  tags: string[];
  similarity: number;
  version_id: string;
  created_at: string;
};

export type SearchResponse = {
  results: SearchResult[];
  note?: string;
};

export type SearchOpts = {
  query: string;
  limit?: number;
  pathPrefix?: string;
  tagsAny?: string[];
};

type RequestOpts = {
  idempotencyKey?: string;
};

async function post<T>(
  baseUrl: string,
  apiKey: string,
  path: string,
  body: unknown,
  opts?: RequestOpts
): Promise<T> {
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
  if (opts?.idempotencyKey) {
    headers["Idempotency-Key"] = opts.idempotencyKey;
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  const json = await res.json();
  if (!res.ok) {
    const err = new Error((json as { error?: { message?: string } })?.error?.message || `HTTP ${res.status}`);
    (err as Error & { statusCode?: number }).statusCode = res.status;
    throw err;
  }
  return json as T;
}

export class AgentOSClient {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly agentId: string;

  constructor(opts: AgentOSClientOpts) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.apiKey = opts.apiKey;
    this.agentId = opts.agentId || "default";
  }

  put(args: PutOpts): Promise<PutResult> {
    return post<PutResult>(
      this.baseUrl,
      this.apiKey,
      "/v1/put",
      {
        agent_id: this.agentId,
        path: args.path,
        value: args.value,
        ttl_seconds: args.ttlSeconds,
        tags: args.tags,
        importance: args.importance,
        searchable: args.searchable
      },
      { idempotencyKey: args.idempotencyKey }
    );
  }

  get(path: string): Promise<GetResult> {
    return post<GetResult>(this.baseUrl, this.apiKey, "/v1/get", {
      agent_id: this.agentId,
      path
    });
  }

  delete(path: string, opts?: { idempotencyKey?: string }): Promise<DeleteResult> {
    return post<DeleteResult>(
      this.baseUrl,
      this.apiKey,
      "/v1/delete",
      { agent_id: this.agentId, path },
      { idempotencyKey: opts?.idempotencyKey }
    );
  }

  list(prefix: string): Promise<ListResult> {
    return post<ListResult>(this.baseUrl, this.apiKey, "/v1/list", {
      agent_id: this.agentId,
      prefix
    });
  }

  glob(pattern: string): Promise<GlobResult> {
    return post<GlobResult>(this.baseUrl, this.apiKey, "/v1/glob", {
      agent_id: this.agentId,
      pattern
    });
  }

  history(path: string, limit = 20): Promise<HistoryResult> {
    return post<HistoryResult>(this.baseUrl, this.apiKey, "/v1/history", {
      agent_id: this.agentId,
      path,
      limit
    });
  }

  search(args: SearchOpts): Promise<SearchResponse> {
    return post<SearchResponse>(this.baseUrl, this.apiKey, "/v1/search", {
      agent_id: this.agentId,
      query: args.query,
      limit: args.limit,
      path_prefix: args.pathPrefix,
      tags_any: args.tagsAny
    });
  }
}
