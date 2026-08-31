# Changelog

All notable changes to this skill are documented here. Format loosely
follows [Keep a Changelog](https://keepachangelog.com/).

## 1.0.0

- Initial release: five-phase reverse-engineering workflow (enumerate →
  classify → verify live → choose format/protocol → write spec with
  provenance), generator-comparison and format-selection reference docs,
  and a starter-repo checklist for scaffolding a generated SDK.
- `scripts/verify_endpoints.ts` — replay captured examples against the
  live API (Python, stdlib only).
- `scripts/verify_endpoints.ts --adapter` — same, plus drives a
  generated client through a pluggable adapter and cross-checks its
  output against the raw response.
