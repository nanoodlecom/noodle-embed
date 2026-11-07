# Changelog

## 0.1.1

- Cancel superseded or disconnected share decodes and prevent stale renders.
- Show a usable fallback for missing/removed sources and reject unsafe link schemes.
- Redraw cached graphs when height or container width changes.
- Bound encoded/plain payloads and handle malformed geometry and unknown type names.
- Require patched Node runtimes: 22.23.4, 24.22.1, or 26.12.1 and newer within
  the ranges declared in `package.json`. Browser use still needs no Node runtime.

## 0.1.0

- Initial dependency-free, read-only nanoodle workflow embed.
