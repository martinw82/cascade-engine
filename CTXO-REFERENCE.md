# Ctxo Easy Reference Index

## What It Is

Ctxo is an MCP server that gives AI agents a pre-built map of this codebase: every symbol, every import/call/inheritance edge, git history with intent classification, and change-health scoring. Instead of the agent reading files one-by-one and grepping blindly, it calls one Ctxo tool and gets the full picture in <500ms.

## How It's Wired Up

| File | Purpose |
|---|---|
| `.ctxo/index/` | The symbol graph, edges, co-change data, communities, boundary violations |
| `.ctxo/config.yaml` | Index settings (ignore patterns, etc.) |
| `.mcp.json` | Registers Ctxo as an MCP server so AI clients auto-connect |
| `CLAUDE.md` | Instructions telling the AI agent to use Ctxo tools before editing |
| `.cursor/rules/ctxo.mdc` | Same instructions, for Cursor |

## Index Status (current snapshot)

- **2446 files indexed** (TypeScript/JS via `@ctxo/lang-typescript` plugin)
- **166 co-changing file pairs** detected from git history
- **149 community clusters** (modularity 0.835 — strong structure)
- **4 boundary violations** found (medium severity)
- **0 drift events** yet (need snapshot history to accumulate)

## The 14 MCP Tools — Quick Reference

### Before ANY Edit (safety net)

| Tool | What it does | Why |
|---|---|---|
| `get_blast_radius` | Shows everything that depends on a symbol | **Prevents breaking callers/importers** |
| `get_why_context` | Checks git history for reverts, anti-patterns, churn | **Prevents reintroducing known-bad code** |

### Before Starting a Task

| Task Type | Tool to call first |
|---|---|
| Bug fix | `get_context_for_task(taskType: "fix")` |
| New feature | `get_context_for_task(taskType: "extend")` |
| Refactor | `get_context_for_task(taskType: "refactor")` |
| Understand code | `get_context_for_task(taskType: "understand")` |

### Before Reviewing a PR/Diff

| Tool | What it does |
|---|---|
| `get_pr_impact` | Full risk assessment: co-change analysis + blast radius + health scores |

### When Exploring Code

| Tool | Instead of... |
|---|---|
| `search_symbols` | Grepping source files |
| `get_ranked_context` | Manually browsing directories |
| `get_logic_slice` | Reading N files to trace transitive deps |

### Structure & Dependencies

| Tool | What it reveals |
|---|---|
| `find_importers` | Full reverse dependency graph (everything that imports a symbol) |
| `get_class_hierarchy` | extends/implements chains (invisible to text search) |
| `get_architectural_overlay` | Layer boundaries, community clusters, what violates them |
| `get_symbol_importance` | PageRank score: which symbols are most central/critical |

### History & Cleanup

| Tool | What it reveals |
|---|---|
| `get_why_context` | Revert history, anti-patterns, churn rate for any symbol |
| `get_changed_symbols` | What symbols changed between two commits |
| `get_change_intelligence` | Change health scores, risk assessment per symbol |
| `find_dead_code` | Unused exports, unreachable code |

## How to Make Sure Fixing One Thing Doesn't Break Another

### The Golden Workflow

```
1. Call get_blast_radius(<symbol>)  ─── see what depends on it
2. Call get_why_context(<symbol>)    ─── see if it was reverted before
3. Call get_logic_slice(<symbol>)    ─── see its full transitive dep tree
4. Make the edit
5. Call get_pr_impact()              ─── validate nothing broke
```

### Why Blast Radius Matters

`get_blast_radius` isn't just "who calls this function". It traces the full transitive closure: if you change function `foo`, and `bar` calls `foo`, and `baz` imports `bar`, Ctxo tells you all three are in the blast zone. A grep would miss the indirect chain.

### Why Git Intent Matters

`get_why_context` surfaces:
- **Reverts** — a previous commit was rolled back. Don't reintroduce the same change.
- **Anti-patterns** — Ctxo flags patterns associated with bugs (e.g., mutation of function params, complex conditionals).
- **Churn rate** — files that change often are high-risk; changes there need extra scrutiny.

### Why Co-Change Analysis Matters

Ctxo mined git history and found **166 file pairs** that are frequently changed together. If you edit one file in a co-changing pair, the other likely needs a matching change. `get_pr_impact` checks this automatically.

### Boundary Violations

The index found **4 boundary violations** currently. These are cross-layer dependencies that shouldn't exist. When making changes, `get_architectural_overlay` shows you the intended layer boundaries so you don't introduce new violations.

## CLI Commands for Maintenance

| Command | When to run |
|---|---|
| `ctxo index` | After significant code changes (re-index the graph) |
| `ctxo watch` | Start file watcher for auto re-indexing |
| `ctxo status` | Check index freshness / manifest |
| `ctxo doctor` | Health check all subsystems |
| `ctxo visualize` | Generate interactive dependency graph HTML |
| `ctxo verify-index` | CI gate: fail if index is stale |
