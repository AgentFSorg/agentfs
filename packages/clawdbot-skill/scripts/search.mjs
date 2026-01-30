#!/usr/bin/env node
/**
 * AgentOS Semantic Search
 * 
 * Search across all agent memories using semantic similarity.
 * 
 * Usage:
 *   node search.mjs "solana trading strategy"
 *   node search.mjs "what does the user prefer" --limit 5
 *   node search.mjs --agents                       # List all agents
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Config ──────────────────────────────────────────────────────────────────

function findWorkspace() {
  if (process.env.AGENTOS_WORKSPACE) return resolve(process.env.AGENTOS_WORKSPACE);
  const candidate = resolve(__dirname, '..', '..');
  if (existsSync(join(candidate, 'AGENTS.md')) || existsSync(join(candidate, 'SOUL.md'))) {
    return candidate;
  }
  return process.cwd();
}

const WORKSPACE = findWorkspace();

function loadEnvFile() {
  const locations = [
    join(WORKSPACE, '.env'),
    join(WORKSPACE, 'agentos-skill', '.env'),
    join(__dirname, '..', '.env'),
  ];
  for (const loc of locations) {
    if (existsSync(loc)) {
      const content = readFileSync(loc, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}

loadEnvFile();

const API_KEY = process.env.AGENTOS_API_KEY;
const API_URL = (process.env.AGENTOS_API_URL || 'https://agentos-api.fly.dev').replace(/\/$/, '');

if (!API_KEY) {
  console.error('❌ AGENTOS_API_KEY not set.');
  process.exit(1);
}

// ── Agent ID ────────────────────────────────────────────────────────────────

function resolveAgentId() {
  if (process.env.AGENTOS_AGENT_ID) return process.env.AGENTOS_AGENT_ID;
  const clean = (s) => s.trim().replace(/\*+/g, '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  for (const file of ['IDENTITY.md', 'SOUL.md']) {
    const fp = join(WORKSPACE, file);
    if (!existsSync(fp)) continue;
    const content = readFileSync(fp, 'utf-8');
    const nameField = content.match(/\*\*Name:\*\*\s*(.+)/i) || content.match(/^name:\s*(.+)/im);
    if (nameField) return clean(nameField[1]);
    const youre = content.match(/You(?:'re| are)\s+([A-Z][a-z]+)/);
    if (youre) return clean(youre[1]);
  }
  return 'default';
}

const AGENT_ID = resolveAgentId();

// ── API ─────────────────────────────────────────────────────────────────────

async function apiCall(endpoint, body) {
  const res = await fetch(`${API_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  
  return res.json();
}

// ── Search ──────────────────────────────────────────────────────────────────

async function search(query, limit = 10) {
  console.log(`🔍 Searching: "${query}" (agent: ${AGENT_ID})\n`);
  
  const result = await apiCall('/v1/search', {
    agent_id: AGENT_ID,
    query,
    limit,
  });
  
  const results = result.results || [];
  
  if (results.length === 0) {
    console.log('No results found.');
    if (result.error) console.log('Error:', result.error);
    return;
  }
  
  console.log(`Found ${results.length} results:\n`);
  
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const score = r.score != null ? ` (score: ${r.score.toFixed(3)})` : (r.similarity != null ? ` (similarity: ${r.similarity.toFixed(3)})` : '');
    const tags = typeof r.tags === 'string' ? JSON.parse(r.tags) : (r.tags || []);
    console.log(`${i + 1}. ${r.path}${score}`);
    console.log(`   Tags: ${tags.join(', ')}`);
    
    // Show preview (first 300 chars)
    const preview = (r.value || '').trim().slice(0, 300).replace(/\n/g, '\n   ');
    console.log(`   ${preview}`);
    if ((r.value || '').length > 300) console.log('   ...');
    console.log('');
  }
}

async function listAgents() {
  console.log('👥 Listing agents...\n');
  
  const result = await apiCall('/v1/agents', {});
  
  const agents = result.agents || [];
  if (agents.length === 0) {
    console.log('No agents found.');
    return;
  }
  
  for (const agent of agents) {
    const marker = agent === AGENT_ID ? ' ← (current)' : '';
    console.log(`  • ${agent}${marker}`);
  }
  console.log(`\nTotal: ${agents.length} agents`);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--agents')) {
    await listAgents();
    return;
  }
  
  // Parse limit
  let limit = 10;
  const limitIdx = args.indexOf('--limit');
  if (limitIdx !== -1 && args[limitIdx + 1]) {
    limit = parseInt(args[limitIdx + 1], 10) || 10;
  }
  
  // Get query (first non-flag argument)
  const query = args.find(a => !a.startsWith('--'));
  
  if (!query) {
    console.log('Usage: node search.mjs "your query" [--limit N] [--agents]');
    process.exit(1);
  }
  
  await search(query, limit);
}

main().catch(e => {
  console.error('💥 Error:', e.message);
  process.exit(1);
});
