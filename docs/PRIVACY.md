# Privacy

OpenKartLine is designed to work locally without an account. Track projects and telemetry can still contain sensitive information, including precise locations, timestamps, schedules, device identifiers, and driving behavior.

## Product principles

- No telemetry or project upload occurs without an explicit user action.
- Local files remain the source of truth for the initial product.
- Importers preserve provenance and expose what will be exported.
- Logs avoid raw coordinates, filenames containing personal data, and complete imported records by default.
- Analytics and crash reporting are opt-in if they are ever introduced.
- Hosted sharing, accounts, or synchronization require a new privacy review and ADR.

## User responsibilities

Review projects before sharing. Remove unnecessary timestamps and metadata, confirm track imagery rights, and obtain consent from anyone whose information is represented. Public bug reports should use synthetic fixtures.

Deleting a local project removes only copies controlled by the user; exported files, backups, forks, issue attachments, or recipient copies may remain.

## Contributor responsibilities

Do not commit real telemetry or imagery without a documented lawful basis, redistribution permission, minimization review, and provenance record. Avoid fixtures that reveal a person's routine even when direct identifiers have been removed. Treat location histories as potentially re-identifiable.

## Future network features

Any hosted feature must document the operator, data categories, purpose, retention, deletion, access controls, subprocessors, cross-border processing, incident process, and applicable user rights before collection begins. This repository policy is not a substitute for a deployment-specific privacy notice.

Report accidental exposure using [SECURITY.md](../SECURITY.md).
