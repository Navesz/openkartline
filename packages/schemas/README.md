# Shared schemas

This directory stores checked-in, language-neutral schemas for portable OpenKartLine artifacts.

## Current contract

- `okl-project-0.1.0.schema.json`: editable local project used by the web import/export flow.

The web TypeScript representation is in `apps/web/src/domain/types.ts`. API schemas are stricter, separate Pydantic models and are published as OpenAPI by the local service. See [Data formats](../../docs/DATA_FORMATS.md).

The project schema is pre-1.0. Generated language bindings, unknown-field preservation, migration fixtures, and schema-diff compatibility gates remain roadmap work; the repository does not claim those are complete.
