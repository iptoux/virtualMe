# Contributing to virtualMe

Thanks for taking the time to contribute. This document covers everything you need to get started.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [How to Contribute](#how-to-contribute)
- [Development Setup](#development-setup)
- [Commit Style](#commit-style)
- [Pull Request Guidelines](#pull-request-guidelines)

---

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold it.

---

## Getting Started

1. **Fork** the repository on GitHub
2. **Clone** your fork locally
3. **Create a branch** for your change (`git switch -c fix/my-fix`)
4. **Make your change**, test it
5. **Push** to your fork and open a Pull Request

---

## How to Contribute

### Bug reports

Use the [Bug Report](.github/ISSUE_TEMPLATE/bug_report.md) template. Include:
- Steps to reproduce
- Expected vs. actual behaviour
- Your environment (OS, Bun version, AI provider)
- Relevant log output from the dashboard

### Feature requests

Use the [Feature Request](.github/ISSUE_TEMPLATE/feature_request.md) template. Describe:
- The problem you're solving, not just the solution
- Any alternatives you've considered

### Code contributions

- Fix a bug, implement a feature, improve docs — all welcome
- For anything non-trivial, **open an issue first** to discuss the approach before writing code
- Keep changes focused — one concern per PR

---

## Development Setup

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.1
- [Rust + cargo](https://rustup.rs) (stable, for the Tauri dashboard)
- A working `service/.env` (see [README](README.md))

### Install

```bash
git clone https://github.com/iptoux/virtualMe.git
cd virtualMe
bun install
cd service && bun install
cd ../dashboard && bun install
```

### Run

```bash
# Service (from /service)
bun --watch src/index.ts

# Dashboard (from /dashboard)
bun tauri dev
```

### Type-check

```bash
# Service
cd service && bun build src/index.ts --target=bun

# Dashboard
cd dashboard && ./node_modules/.bin/tsc --noEmit
```

### Project layout

```
service/src/     # Headless bot — scheduler, AI client, X client, REST API, WebSocket
dashboard/src/   # Tauri desktop app — React 19, Tailwind v4, Radix UI
shared/          # Shared TypeScript types
```

---

## Commit Style

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add reply deduplication
fix: prevent text truncation when URL is appended
docs: update AI provider setup in README
refactor: extract OAuth signing into separate module
chore: bump bun lockfile
```

Keep the subject line under 72 characters. Use the body for context when the reason isn't obvious from the diff.

---

## Pull Request Guidelines

- **Target `main`** for all PRs
- **One concern per PR** — don't bundle unrelated fixes
- **Fill out the PR template** — describe what changed and why
- **Keep diffs small** — large PRs are hard to review and slow to merge
- **Don't break existing behaviour** without a good reason and a clear note in the PR
- PRs that add features without tests for the new code path will be asked to add them

If your PR fixes an open issue, reference it: `Closes #42`.
