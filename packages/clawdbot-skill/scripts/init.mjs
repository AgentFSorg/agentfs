#!/usr/bin/env node
/**
 * AgentOS Skill — Initialization Script
 * 
 * Run once after installing the skill. Creates required workspace files
 * and validates the environment.
 * 
 * Usage:
 *   node agentos-skill/scripts/init.mjs
 *   node agentos-skill/scripts/init.mjs --force    # Overwrite existing files
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function findWorkspace() {
  if (process.env.AGENTOS_WORKSPACE) return resolve(process.env.AGENTOS_WORKSPACE);
  const candidate = resolve(__dirname, '..', '..');
  if (existsSync(join(candidate, 'AGENTS.md')) || existsSync(join(candidate, 'SOUL.md'))) {
    return candidate;
  }
  return process.cwd();
}

const WORKSPACE = findWorkspace();
const force = process.argv.includes('--force');

console.log(`🧠 AgentOS Skill — Initialization`);
console.log(`   Workspace: ${WORKSPACE}\n`);

// ── Required Files ──────────────────────────────────────────────────────

const REQUIRED_FILES = {
  'LEARNINGS.md': `# LEARNINGS.md — Mistakes & Lessons Learned

> **CRITICAL FILE** — Read before every task. Update after every task.
> This file is your immune system. Every mistake recorded here is one you'll never make again.

## How to Use This File

### Before Starting Any Task
1. Search this file for keywords related to your task
2. Check AgentOS: \`node agentos-skill/scripts/search.mjs "your task keywords"\`
3. Note any relevant past mistakes to avoid

### After Completing Any Task
Add an entry with:
- **Date** and short title
- **What happened** (the bug, mistake, or lesson)
- **Impact** (what broke or was at risk)
- **Root cause** (why it happened)
- **Fix** (what you did to solve it)
- **Lesson** (what to do differently next time)

### After Any Mistake or Bug Fix
Same format as above — document it IMMEDIATELY while context is fresh.

---

## Template

### YYYY-MM-DD: Short Description
- **What happened:**
- **Impact:**
- **Root cause:**
- **Fix:**
- **Lesson:**

---

*Update this file religiously. Future-you will thank present-you.*
`,

  'CONTEXT.md': `# CONTEXT.md — Current Working State

> This file survives context compaction. Update it before compaction happens.
> After compaction, this is the FIRST file you read to restore working memory.

## Last Updated
<!-- Update this timestamp every time you write to this file -->

## Active Session
<!-- Who you're talking to, what channel, what's happening -->

## Current Task
<!-- What you're actively working on -->

## Recent Decisions
<!-- Key decisions made this session that future-you needs to know -->

## Pending Work
<!-- What still needs to be done -->

## Important Notes
<!-- Anything that doesn't fit above but future-you needs -->
`,

  'MEMORY.md': `# MEMORY.md — Long-Term Memory

> Your curated knowledge. Not raw logs — distilled wisdom.
> Review and update periodically. Remove outdated info.
> This is what makes you YOU across sessions.

## About Your Human
<!-- Key facts about who you're working with -->

## Key Decisions
<!-- Important decisions that affect ongoing work -->

## Project Context
<!-- Active projects, their status, architecture notes -->

## Lessons Learned
<!-- High-level patterns — for detailed bugs, see LEARNINGS.md -->
`,
};

// ── Create Files ────────────────────────────────────────────────────────

let created = 0;
let skipped = 0;

for (const [filename, content] of Object.entries(REQUIRED_FILES)) {
  const filepath = join(WORKSPACE, filename);
  
  if (existsSync(filepath) && !force) {
    console.log(`  ⏭️  ${filename} (exists, skipping)`);
    skipped++;
    continue;
  }
  
  writeFileSync(filepath, content);
  console.log(`  ✅ ${filename} (created)`);
  created++;
}

// Create memory/ directory
const memDir = join(WORKSPACE, 'memory');
if (!existsSync(memDir)) {
  mkdirSync(memDir, { recursive: true });
  console.log(`  ✅ memory/ (directory created)`);
}

// ── Validate Environment ────────────────────────────────────────────────

console.log(`\n📋 Environment Check:`);

// Check .env
const envLocations = [
  join(WORKSPACE, '.env'),
  join(WORKSPACE, 'agentos-skill', '.env'),
];
let envFound = false;
for (const loc of envLocations) {
  if (existsSync(loc)) {
    const content = readFileSync(loc, 'utf-8');
    if (content.includes('AGENTOS_API_KEY')) {
      console.log(`  ✅ API key found in ${loc}`);
      envFound = true;
      break;
    }
  }
}
if (!envFound) {
  console.log(`  ❌ AGENTOS_API_KEY not found — add it to .env`);
}

// Check scripts
const scripts = ['pull-context.mjs', 'sync-daemon.mjs', 'search.mjs'];
for (const script of scripts) {
  const sp = join(__dirname, script);
  if (existsSync(sp)) {
    console.log(`  ✅ ${script}`);
  } else {
    console.log(`  ❌ ${script} (MISSING)`);
  }
}

// ── Summary ─────────────────────────────────────────────────────────────

console.log(`\n📊 Init complete: ${created} created, ${skipped} skipped`);

if (created > 0) {
  console.log(`\n🚀 Next steps:`);
  console.log(`   1. Set AGENTOS_API_KEY in .env (if not done)`);
  console.log(`   2. Run: node agentos-skill/scripts/pull-context.mjs`);
  console.log(`   3. Run: node agentos-skill/scripts/sync-daemon.mjs &`);
  console.log(`   4. Read SKILL.md for the full intelligence protocol`);
}
