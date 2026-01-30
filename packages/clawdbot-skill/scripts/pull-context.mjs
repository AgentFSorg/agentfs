#!/usr/bin/env node
/**
 * AgentOS Context Puller
 * 
 * Fetches latest memories from AgentOS on cold start / post-compaction.
 * Writes fetched content back to workspace files so the agent has full context.
 * 
 * Usage:
 *   node pull-context.mjs                  # Pull all memories, write to workspace
 *   node pull-context.mjs --dry-run        # Show what would be pulled (no writes)
 *   node pull-context.mjs --dump           # Dump all memories (display only)
 *   node pull-context.mjs --path /memory/long-term   # Pull specific path
 *   node pull-context.mjs --summary        # Brief summary of what's stored
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
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

// ── Reverse File Mapping (AgentOS path → workspace file) ────────────────────

const REVERSE_MAP = {
  '/identity/soul':    'SOUL.md',
  '/identity/user':    'USER.md',
  '/identity/meta':    'IDENTITY.md',
  '/memory/long-term': 'MEMORY.md',
  '/memory/context':   'CONTEXT.md',
  '/config/agents':    'AGENTS.md',
  '/config/tools':     'TOOLS.md',
  '/config/heartbeat': 'HEARTBEAT.md',
  '/knowledge/learnings': 'LEARNINGS.md',
};

function agentosPathToLocal(agentosPath) {
  // Direct mapping
  if (REVERSE_MAP[agentosPath]) {
    return join(WORKSPACE, REVERSE_MAP[agentosPath]);
  }
  // Daily memory: /memory/daily/2026-01-30 → memory/2026-01-30.md
  const dailyMatch = agentosPath.match(/^\/memory\/daily\/(\d{4}-\d{2}-\d{2})$/);
  if (dailyMatch) {
    return join(WORKSPACE, 'memory', `${dailyMatch[1]}.md`);
  }
  // Knowledge: /knowledge/something
  // Check if it maps to a root-level .md file first, then fall back to memory/
  const knowledgeMatch = agentosPath.match(/^\/knowledge\/(.+)$/);
  if (knowledgeMatch) {
    const slug = knowledgeMatch[1];
    // Try to find a matching root .md file (case-insensitive slug match)
    try {
      for (const entry of readdirSync(WORKSPACE)) {
        if (!entry.endsWith('.md')) continue;
        const entrySlug = entry.replace(/\.md$/, '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
        if (entrySlug === slug) {
          return join(WORKSPACE, entry);
        }
      }
    } catch { /* fall through */ }
    // Default: put in memory/ directory
    return join(WORKSPACE, 'memory', `${slug}.md`);
  }
  return null;
}

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

// ── Pull Logic ──────────────────────────────────────────────────────────────

function md5(content) {
  return createHash('md5').update(content).digest('hex');
}

async function pullAll(dryRun = false) {
  console.log(`📥 Pulling memories for agent: ${AGENT_ID}`);
  console.log(`   API: ${API_URL}\n`);
  
  const result = await apiCall('/v1/dump', { agent_id: AGENT_ID, limit: 200 });
  
  // API returns { entries: [...] }
  const memories = result.entries || result.memories || [];
  
  if (memories.length === 0) {
    console.log('⚠️  No memories found.');
    return;
  }
  
  console.log(`Found ${memories.length} memories.\n`);
  
  let written = 0;
  let skipped = 0;
  let unmapped = 0;
  
  for (const mem of memories) {
    const localPath = agentosPathToLocal(mem.path);
    
    if (!localPath) {
      unmapped++;
      if (dryRun) console.log(`  ⏭️  ${mem.path} (no local mapping)`);
      continue;
    }
    
    // Ensure value is always a string
    const memValue = typeof mem.value === 'object' && mem.value !== null
      ? JSON.stringify(mem.value, null, 2)
      : String(mem.value || '');
    
    const relPath = localPath.startsWith(WORKSPACE) ? localPath.slice(WORKSPACE.length + 1) : localPath;
    
    // Check if local file exists and is different
    if (existsSync(localPath)) {
      const localContent = readFileSync(localPath, 'utf-8');
      const localHash = md5(localContent);
      const remoteHash = md5(memValue);
      
      if (localHash === remoteHash) {
        skipped++;
        continue;
      }
      
      // Local file exists but is different — don't overwrite without flag
      // In pull mode, remote wins (this is a restore operation)
      if (dryRun) {
        console.log(`  📝 ${relPath} ← ${mem.path} (CHANGED, would update)`);
        continue;
      }
    } else {
      if (dryRun) {
        console.log(`  📝 ${relPath} ← ${mem.path} (NEW, would create)`);
        continue;
      }
    }
    
    // Write the file
    const dir = dirname(localPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    
    writeFileSync(localPath, memValue);
    console.log(`  ✅ ${relPath} ← ${mem.path}`);
    written++;
  }
  
  console.log(`\n📊 Summary: ${written} written, ${skipped} unchanged, ${unmapped} unmapped`);
}

async function pullPath(agentosPath) {
  console.log(`📥 Pulling: ${agentosPath} for agent: ${AGENT_ID}\n`);
  
  const result = await apiCall('/v1/get', { agent_id: AGENT_ID, path: agentosPath });
  
  // API returns { found: true, path, value, version_id, created_at, tags }
  if (!result.found) {
    console.log('⚠️  Not found.');
    console.log('   Response:', JSON.stringify(result, null, 2));
    return;
  }
  
  const tags = typeof result.tags === 'string' ? JSON.parse(result.tags) : (result.tags || []);
  console.log(`Path:  ${result.path}`);
  console.log(`Tags:  ${tags.join(', ')}`);
  console.log(`Created: ${result.created_at || 'unknown'}`);
  console.log('─'.repeat(50));
  console.log(result.value);
}

async function dumpAll() {
  console.log(`📦 Dumping all memories for agent: ${AGENT_ID}\n`);
  
  const result = await apiCall('/v1/dump', { agent_id: AGENT_ID, limit: 200 });
  const entries = result.entries || result.memories || [];
  
  if (entries.length === 0) {
    console.log('⚠️  No memories found.');
    return;
  }
  
  for (const mem of entries) {
    const tags = typeof mem.tags === 'string' ? JSON.parse(mem.tags) : (mem.tags || []);
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`Path: ${mem.path}`);
    console.log(`Tags: ${tags.join(', ')}`);
    console.log(`Size: ${(mem.value || '').length} chars`);
    console.log('─'.repeat(60));
    const preview = (mem.value || '').slice(0, 200);
    console.log(preview + (mem.value && mem.value.length > 200 ? '...' : ''));
  }
  
  console.log(`\n\n📊 Total: ${entries.length} memories`);
}

async function showSummary() {
  console.log(`📊 AgentOS Memory Summary — agent: ${AGENT_ID}\n`);
  
  const result = await apiCall('/v1/dump', { agent_id: AGENT_ID, limit: 200 });
  const memories = result.entries || result.memories || [];
  
  if (memories.length === 0) {
    console.log('No memories stored yet.');
    return;
  }
  
  const byTag = {};
  let totalChars = 0;
  
  for (const mem of memories) {
    totalChars += (typeof mem.value === 'string' ? mem.value.length : 0);
    const tags = typeof mem.tags === 'string' ? JSON.parse(mem.tags) : (mem.tags || ['untagged']);
    for (const tag of tags) {
      byTag[tag] = (byTag[tag] || 0) + 1;
    }
  }
  
  console.log(`  Memories:    ${memories.length}`);
  console.log(`  Total size:  ${(totalChars / 1024).toFixed(1)} KB`);
  console.log(`  Tags:`);
  for (const [tag, count] of Object.entries(byTag).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${tag}: ${count}`);
  }
  console.log(`\n  Paths:`);
  for (const mem of memories) {
    const size = (mem.value || '').length;
    console.log(`    ${mem.path} (${size} chars)`);
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--dump')) {
    await dumpAll();
  } else if (args.includes('--summary')) {
    await showSummary();
  } else if (args.includes('--path')) {
    const pathIdx = args.indexOf('--path');
    const path = args[pathIdx + 1];
    if (!path) { console.error('Usage: --path /memory/long-term'); process.exit(1); }
    await pullPath(path);
  } else {
    const dryRun = args.includes('--dry-run');
    await pullAll(dryRun);
  }
}

main().catch(e => {
  console.error('💥 Error:', e.message);
  process.exit(1);
});
