# Dependency & Override Documentation

This document explains the technical rationale and security justifications for the pinned `pnpm.overrides` defined in `package.json`.

---

## `pnpm.overrides` Rationale

| Package | Pinned Version | Rationale & Security Justification |
| :--- | :--- | :--- |
| `flatted` | `3.4.2` | Resolves prototype pollution vulnerability in transitive serialization dependencies. |
| `minimatch@3` | `3.1.3` | Pinned to fix ReDoS (Regular Expression Denial of Service) vulnerability in legacy glob matching dependencies used by linting/formatting tools. |
| `esbuild@<0.25.0` | `0.25.2` | Fixes remote code execution and dev-server SSR vulnerability in older esbuild bundled by Vite/Next build toolchain. |
| `form-data` | `^4.0.6` | Prevents CRLF injection and multipart boundaries corruption in HTTP client dependencies. |
| `vite` | `8.1.5` | Ensures dev server and Vitest test runner share modern bundling security patches and fixes SSR memory leaks. |
| `axios` | `^1.18.1` | Pinned to patch SSRF (Server-Side Request Forgery) and prototype pollution CVEs in upstream financial sync SDKs. |
| `undici` | `^7.28.0` | Patches HTTP request smuggling and CRLF injection vulnerabilities in Node.js global fetch backend. |
| `sharp` | `^0.35.0` | Upgrades libvips native image processing library to prevent memory buffer overflow vulnerabilities when processing SVG and user avatars. |
| `postcss` | `^8.5.22` | Fixes line-return parsing vulnerabilities and CSS AST injection flaws in Tailwind CSS build pipeline. |

---

## Review & Retirement Policy
Whenever core dependencies (Next.js, Tailwind, Vitest) are upgraded during major milestones, run `pnpm audit` and review whether upstream packages have bumped their minimum sub-dependency requirements, allowing corresponding entries in `pnpm.overrides` to be safely retired.

