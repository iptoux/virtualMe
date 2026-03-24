# Security Policy

## Supported versions

Only the latest commit on `main` is actively maintained.

## Reporting a vulnerability

**Do not open a public issue for security vulnerabilities.**

Report them privately via [GitHub's private vulnerability reporting](https://github.com/iptoux/virtualMe/security/advisories/new).

Include:
- A description of the vulnerability and its potential impact
- Steps to reproduce or a proof-of-concept
- Any suggested fix if you have one

You'll receive a response within 7 days. If the issue is confirmed, a fix will be prioritised and released as soon as possible. You'll be credited in the release notes unless you prefer otherwise.

## Scope

Things that are in scope:
- Credential leakage (X API keys, AI API keys)
- Remote code execution via the service REST/WebSocket API
- Unintended data exposure through the API

Things that are out of scope:
- The bot posting content you don't like (configure the persona prompt)
- X API rate limit exhaustion via misconfiguration (use the budget controls)
- Vulnerabilities in third-party dependencies (report those upstream)
