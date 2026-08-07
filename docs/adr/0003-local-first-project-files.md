# ADR 0003: Versioned local project files as the source of truth

- Status: Accepted
- Date: 2026-08-06

## Context

Users should be able to use the application without an account or cloud service. A mandatory database complicates backup, collaboration, reproducibility, and first-time installation.

## Decision

Use a versioned `.okl.json` manifest as the canonical project. Raw source references, processed settings, kart parameters, solver settings, and result metadata are explicit. A database may later index files or serve a hosted product, but it does not replace the portable format.

## Consequences

- Projects are inspectable, shareable, and easy to archive.
- Schema migrations and attachment handling must be designed early.
- Very large numeric arrays may require referenced binary attachments later.
- Privacy is improved because storage and sharing remain explicit user actions.
