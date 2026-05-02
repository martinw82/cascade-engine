# Cascade Master: Project Export & Technical Brief
**Export Date:** April 29, 2026
**Project Status:** PRD / Technical Specification Phase

---

## 1. Initial Inquiry: The "Fallback Provider Cascade" Plugin
**User:**
I want to make a "plugin" that cascades through different API providers. I've got a good system working on my webbased GUI app, so during some backend process it uses a "fallback provider cascade" that currently works well. What I want to do is create the same thing as a kind of "plugin" for the different agent harness and CLI coding tools like claudecode/kilo code/opencode etc. Maybe the coding tools cli stuff is harder but the agent harness stuff like Openclaw/hermes/Piagent, I want those to have a fallback provider style plugin, where I have a number of API gateways and providers (like openrouter/kilo gateway/gemini/mistral/nvidia/etc) where each of them have varying rates and lmits of free api access, so basically I can run an ai agent or coding cli on auto and utilise the free tiers of all providers by either using one provider "slowly" or rotating through providers or just using the first and if it hits a limit or error cycling to the next.

**Assistant:**
The assistant suggested a **Virtual Gateway** approach (Local Proxy) rather than tool-specific plugins. This allows all CLI tools to point to `http://localhost:8080/v1`, using "Environment Hijacking" to route traffic through a custom brain that handles retries, cooldowns, and quota tracking.

---

## 2. Refinement: The Proxy Strategy
**User:**
so if we did it like that would we divert ALL traffic/requests through the proxy, and we could "ignore" the provider/model settings and just route through our cascade?

**Assistant:**
Confirmed that the proxy "blinds" the agents to the actual provider. It performs **Request Rewriting**. For example, a request for `gpt-4o` could be rewritten to `gemini-1.5-pro` on the fly based on availability.

---

## 3. Vision: The "Full Setup" Custom UI & Tracking
**User:**
yes we want the full setup custom version web ui tracking stats diagnostics everything!! some providers are tight, some are more open, some have low contet, some have high context, etc, we need to be aware of all of that, keep track of it all. if a provider like nvidia offers 40rpm on a free tier, and other providers offer 1, and other providers have daily or hourly limits, we can easily keep track of it all and have a fully dynamic system right? I think so. We want to use Kilo gateway, Openzen, nvidia, etc, all the providers we can, keeping track and having like a "weekly recap" as some models are temporarily free etc.

**Assistant:**
Proposed the **"Cascade Master"** architecture:
- **Manager-Worker Architecture**
- **Weighted Priority Queues**
- **Environment Hijacking** for Claude Code and other CLI tools.
- **Weekly Recap** features for tracking "Cash Saved" and provider performance.

---

## 4. Requirement Definition: Task-Awareness & UI Flexibility
**User:**
- **Task Aware:** Request header + keyword (e.g., if prompt contains "email" or has a header).
- **Concurrency:** Spillover + Queue. Needs to "know" theoretical limits.
- **Diagnostics:** Live log feed + static daily logs + high-level dashboard.
- **Stack:** Prefers Node/Fastify for extensibility.
- **DB:** Low memory (target: 1vCPU / 1GB RAM).
- **Organization:** Model-level control (not just provider-level).

---

## 5. FINAL PRD: Cascade Master Technical Brief

### Executive Summary
**Cascade Master** is a local proxy server that intercepts OpenAI/Anthropic-style API requests and routes them through a user-defined "cascade" of providers. It aims to eliminate "Rate Limit Exceeded" errors for developers by automatically falling back to available free-tier models while providing a rich UI for diagnostics and configuration.

### Technical Stack (Optimized for 1vCPU / 1GB RAM)
- **Runtime:** Node.js 22+ (LTS).
- **Server Framework:** **Fastify** (Extreme low overhead).
- **Database:** **SQLite (WAL Mode)** with **Drizzle ORM** (Zero background RAM).
- **State Management:** In-memory **LRU Caches** for real-time tracking.
- **Frontend:** **Next.js 15 (Static Export)**.
- **Communication:** **Server-Sent Events (SSE)** for live logs.

### Core Functional Requirements
1. **Model-Level Registry:** Input for RPM, TPM, Daily Quota, and Context Window.
2. **Task-Aware Engine:** Header checks and keyword matching (first 5 words) to switch cascades.
3. **Smart Queuing:** Fair-share queue with global concurrency caps.
4. **Transparent Retries:** If Provider A fails, the proxy tries Provider B before the client tool even knows there was a problem.

### Base Examples for Implementation
1. **The Free Tier Maximum:** Priority on high-limit providers like NVIDIA (40 RPM).
2. **The Context Specialist:** Triggers Gemini (1M context) for "Analyze" tasks.
3. **The Background Processor:** 1:1 rotation across "1 RPM" keys for long-running agent tasks.
