#!/usr/bin/env node
/**
 * AgentOS Sync Daemon
 * 
 * File watcher that auto-syncs workspace files to AgentOS API.
 * - MD5 hash-based change detection (only syncs changed files)
 * - Debounced (2s) to batch rapid edits
 * - Full sync every 5 minutes as safety net
 * - Initial bulk sync on startup
 * 
 * Usage:
 *   node sync-daemon.mjs                    # Run daemon (watches + syncs)
 *   node sync-daemon.mjs --once             # Single sync then exit
 *   node sync-daemon.mjs --force            # Force sync all (ignore hashes)
 *   node sync-daemon.mjs --pre-compaction   # Force sync before compaction
 * 
 * Environment / Config:
 *   AGENTOS_API_KEY    (required) — or set in .env / config
 *   AGENTOS_AGENT_ID   (optional) — defaults to agent name from IDENTITY.md
 *   AGENTOS_API_URL    (optional) — defaults to https://agentos-api.fly.dev
 *   AGENTOS_WORKSPACE  (optional) — workspace root, defaults to cwd parent
 */

import { readFileSync, existsSync, statSync, readdirSync, watch, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, basename, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Config ──────────────────────────────────────────────────────────────────

function findWorkspace() {
  // Try env, then go up from script location to find workspace root
  if (process.env.AGENTOS_WORKSPACE) return resolve(process.env.AGENTOS_WORKSPACE);
  // Script is in agentos-skill/scripts/, workspace is two levels up
  const candidate = resolve(__dirname, '..', '..');
  if (existsSync(join(candidate, 'AGENTS.md')) || existsSync(join(candidate, 'SOUL.md'))) {
    return candidate;
  }
  return process.cwd();
}

const WORKSPACE = findWorkspace();

function loadEnvFile() {
  // Try multiple locations for .env
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
        // Strip quotes
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
const DEBOUNCE_MS = 2000;
const FULL_SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes
const STATE_FILE = join(__dirname, '..', '.sync-state.json');

if (!API_KEY) {
  console.error('❌ AGENTOS_API_KEY not set. Set it in environment or .env file.');
  process.exit(1);
}

// ── File Mapping ────────────────────────────────────────────────────────────

const FILE_MAP = {
  'SOUL.md':      { path: '/identity/soul',    tags: ['identity', 'core'],    importance: 1.0 },
  'USER.md':      { path: '/identity/user',    tags: ['identity', 'user'],    importance: 0.9 },
  'IDENTITY.md':  { path: '/identity/meta',    tags: ['identity'],            importance: 0.9 },
  'MEMORY.md':    { path: '/memory/long-term', tags: ['memory', 'curated'],   importance: 0.9 },
  'CONTEXT.md':   { path: '/memory/context',   tags: ['memory', 'context'],   importance: 0.7 },
  'AGENTS.md':    { path: '/config/agents',    tags: ['config'],              importance: 0.5 },
  'TOOLS.md':     { path: '/config/tools',     tags: ['config'],              importance: 0.5 },
  'HEARTBEAT.md': { path: '/config/heartbeat', tags: ['config'],              importance: 0.3 },
  'LEARNINGS.md': { path: '/knowledge/learnings', tags: ['knowledge', 'lessons'], importance: 0.8 },
};

function getMemoryDirMapping(filename) {
  // memory/2026-01-30.md → /memory/daily/2026-01-30
  const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
  if (dateMatch) {
    return { path: `/memory/daily/${dateMatch[1]}`, tags: ['memory', 'daily'], importance: 0.6 };
  }
  // memory/other-file.md → /knowledge/other-file
  const name = filename.replace(/\.md$/, '');
  return { path: `/knowledge/${name}`, tags: ['project'], importance: 0.5 };
}

// ── Agent ID ────────────────────────────────────────────────────────────────

function resolveAgentId() {
  if (process.env.AGENTOS_AGENT_ID) return process.env.AGENTOS_AGENT_ID;
  
  const clean = (s) => s.trim().replace(/\*+/g, '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  
  // Try IDENTITY.md — look for "**Name:** X" or "name: X" first, then heading
  for (const file of ['IDENTITY.md', 'SOUL.md']) {
    const fp = join(WORKSPACE, file);
    if (!existsSync(fp)) continue;
    const content = readFileSync(fp, 'utf-8');
    
    // Specific name field: "**Name:** Reggie" or "- **Name:** Reggie" or "name: Reggie"
    const nameField = content.match(/\*\*Name:\*\*\s*(.+)/i) || content.match(/^name:\s*(.+)/im);
    if (nameField) return clean(nameField[1]);
    
    // "You're X." or "You are X." in SOUL.md
    const youre = content.match(/You(?:'re| are)\s+([A-Z][a-z]+)/);
    if (youre) return clean(youre[1]);
  }
  
  return 'default';
}

const AGENT_ID = resolveAgentId();

// ── State Management ────────────────────────────────────────────────────────

let syncState = { hashes: {}, lastSync: null, syncCount: 0, errorCount: 0 };

function loadState() {
  try {
    if (existsSync(STATE_FILE)) {
      syncState = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch { /* fresh state */ }
}

function saveState() {
  try {
    writeFileSync(STATE_FILE, JSON.stringify(syncState, null, 2));
  } catch (e) {
    console.error('⚠️  Could not save sync state:', e.message);
  }
}

function md5(content) {
  return createHash('md5').update(content).digest('hex');
}

// ── API Calls ───────────────────────────────────────────────────────────────

async function apiCall(endpoint, body, retries = 2) {
  const url = `${API_URL}${endpoint}`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        if (attempt < retries && res.status >= 500) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      
      return await res.json();
    } catch (e) {
      if (attempt < retries && (e.name === 'TimeoutError' || e.code === 'ECONNRESET')) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
}

async function putMemory(agentosPath, value, tags, importance = 0.5) {
  const result = await apiCall('/v1/put', {
    agent_id: AGENT_ID,
    path: agentosPath,
    value,
    tags,
    importance,
    searchable: true,
  });
  // API returns { ok: true, version_id, created_at }
  return result;
}

// ── File Discovery ──────────────────────────────────────────────────────────

function discoverFiles() {
  const files = [];
  const seen = new Set();
  
  // Root-level mapped files (explicit mappings take priority)
  for (const [filename, mapping] of Object.entries(FILE_MAP)) {
    const fullPath = join(WORKSPACE, filename);
    if (existsSync(fullPath)) {
      files.push({ localPath: fullPath, filename, ...mapping });
      seen.add(filename);
    }
  }
  
  // Auto-discover ANY .md file in workspace root that isn't already mapped
  // This ensures new files (like custom LEARNINGS, PLANS, etc.) sync automatically
  const IGNORE_PATTERNS = [/^README\.md$/i, /^LICENSE/i, /^CHANGELOG/i, /^node_modules/];
  try {
    for (const entry of readdirSync(WORKSPACE)) {
      if (!entry.endsWith('.md')) continue;
      if (seen.has(entry)) continue;
      if (IGNORE_PATTERNS.some(p => p.test(entry))) continue;
      const fullPath = join(WORKSPACE, entry);
      if (!statSync(fullPath).isFile()) continue;
      // Auto-map: FILENAME.md → /knowledge/filename
      const slug = entry.replace(/\.md$/, '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
      files.push({
        localPath: fullPath,
        filename: entry,
        path: `/knowledge/${slug}`,
        tags: ['knowledge', 'auto-discovered'],
        importance: 0.5,
      });
      seen.add(entry);
    }
  } catch { /* ignore readdir errors */ }
  
  // memory/ directory
  const memDir = join(WORKSPACE, 'memory');
  if (existsSync(memDir) && statSync(memDir).isDirectory()) {
    for (const entry of readdirSync(memDir)) {
      if (!entry.endsWith('.md')) continue;
      const fullPath = join(memDir, entry);
      if (!statSync(fullPath).isFile()) continue;
      const mapping = getMemoryDirMapping(entry);
      files.push({ localPath: fullPath, filename: `memory/${entry}`, ...mapping });
    }
  }
  
  return files;
}

// ── Sync Logic ──────────────────────────────────────────────────────────────

async function syncFile(file, force = false) {
  try {
    const content = readFileSync(file.localPath, 'utf-8');
    if (!content.trim()) return false; // Skip empty files
    
    const hash = md5(content);
    
    // Skip if unchanged (unless forced)
    if (!force && syncState.hashes[file.filename] === hash) {
      return false;
    }
    
    await putMemory(file.path, content, file.tags, file.importance);
    
    syncState.hashes[file.filename] = hash;
    syncState.lastSync = new Date().toISOString();
    syncState.syncCount++;
    
    return true;
  } catch (e) {
    syncState.errorCount++;
    console.error(`  ❌ ${file.filename}: ${e.message}`);
    return false;
  }
}

async function fullSync(force = false) {
  const files = discoverFiles();
  const label = force ? '🔄 Force sync' : '🔄 Sync';
  console.log(`${label}: checking ${files.length} files...`);
  
  let synced = 0;
  let skipped = 0;
  
  for (const file of files) {
    const didSync = await syncFile(file, force);
    if (didSync) {
      synced++;
      console.log(`  ✅ ${file.filename} → ${file.path}`);
    } else {
      skipped++;
    }
  }
  
  saveState();
  console.log(`  Done: ${synced} synced, ${skipped} unchanged`);
  return synced;
}

// ── File Watching ───────────────────────────────────────────────────────────

function startWatcher() {
  let debounceTimer = null;
  const pendingChanges = new Set();
  
  function scheduleBatchSync() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const files = discoverFiles();
      const changed = [...pendingChanges];
      pendingChanges.clear();
      
      for (const changedFile of changed) {
        const file = files.find(f => f.localPath === changedFile || f.filename === changedFile);
        if (file) {
          const didSync = await syncFile(file);
          if (didSync) console.log(`  ⚡ ${file.filename} → ${file.path}`);
        }
      }
      saveState();
    }, DEBOUNCE_MS);
  }
  
  // Watch root workspace files
  const watchedNames = new Set(Object.keys(FILE_MAP));
  
  try {
    const rootWatcher = watch(WORKSPACE, { persistent: true }, (eventType, filename) => {
      if (filename && watchedNames.has(filename)) {
        pendingChanges.add(filename);
        scheduleBatchSync();
      }
    });
    rootWatcher.on('error', (e) => {
      if (e.code !== 'EPERM') console.error('Root watcher error:', e.message);
    });
  } catch (e) {
    console.warn('⚠️  Could not watch workspace root:', e.message);
  }
  
  // Watch memory/ directory
  const memDir = join(WORKSPACE, 'memory');
  if (existsSync(memDir)) {
    try {
      const memWatcher = watch(memDir, { persistent: true }, (eventType, filename) => {
        if (filename && filename.endsWith('.md')) {
          pendingChanges.add(join(memDir, filename));
          scheduleBatchSync();
        }
      });
      memWatcher.on('error', (e) => {
        if (e.code !== 'EPERM') console.error('Memory watcher error:', e.message);
      });
    } catch (e) {
      console.warn('⚠️  Could not watch memory/ directory:', e.message);
    }
  }
  
  console.log('👁️  File watcher active');
}

// ── Status ──────────────────────────────────────────────────────────────────

function printStatus() {
  const files = discoverFiles();
  console.log('\n📊 AgentOS Sync Status');
  console.log('─'.repeat(40));
  console.log(`  Agent ID:     ${AGENT_ID}`);
  console.log(`  API URL:      ${API_URL}`);
  console.log(`  Workspace:    ${WORKSPACE}`);
  console.log(`  Files tracked: ${files.length}`);
  console.log(`  Total syncs:  ${syncState.syncCount}`);
  console.log(`  Errors:       ${syncState.errorCount}`);
  console.log(`  Last sync:    ${syncState.lastSync || 'never'}`);
  console.log('─'.repeat(40));
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const isOnce = args.includes('--once');
  const isForce = args.includes('--force');
  const isPreCompaction = args.includes('--pre-compaction');
  const isStatus = args.includes('--status');
  
  loadState();
  
  console.log(`🧠 AgentOS Sync Daemon — agent: ${AGENT_ID}`);
  console.log(`   API: ${API_URL}`);
  console.log(`   Workspace: ${WORKSPACE}`);
  
  if (isStatus) {
    printStatus();
    process.exit(0);
  }
  
  if (isPreCompaction) {
    console.log('\n⚡ Pre-compaction: forcing full sync...');
    await fullSync(true);
    process.exit(0);
  }
  
  // Initial sync
  console.log('\n📤 Initial sync...');
  const synced = await fullSync(isForce);
  
  if (isOnce) {
    printStatus();
    process.exit(0);
  }
  
  // Start file watcher
  console.log('');
  startWatcher();
  
  // Periodic full sync
  setInterval(async () => {
    console.log('\n⏰ Periodic full sync...');
    await fullSync(false);
  }, FULL_SYNC_INTERVAL);
  
  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n🛑 Shutting down — final sync...');
    await fullSync(true);
    process.exit(0);
  };
  
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  
  printStatus();
  console.log('\n💤 Daemon running. Ctrl+C to stop.\n');
}

main().catch(e => {
  console.error('💥 Fatal error:', e);
  process.exit(1);
});
