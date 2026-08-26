---
name: GitHub large-file writes
description: Large HTML updates through the Replit GitHub connection can be blocked by the security proxy even when reads and small config commits work.
---

Large HTML file writes through the GitHub integration may return a Cloudflare 403 from the Replit security proxy, while reads and small configuration commits succeed.

**Why:** The proxy can reject the request before GitHub receives it, so repeated retries and alternate Git blob endpoints do not reliably help.

**How to apply:** If the source repository is not present locally, use a project with the repository checked out or give the user a minimal manual GitHub edit path; verify the branch SHA before reporting success.