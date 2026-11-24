# Claude Code — OddsClub

**Start here:** `docs/HANDOFF.md` (requirements, fixed decisions, environment), then `docs/ARCHITECTURE.md`,
then the latest entries in `docs/PROGRESS.md`. The approved design is `design/prototype/oddsclub-prototype.html`.

Rules: use pnpm only; Claude cannot install packages (ask the owner to run `pnpm add …`); type-check with
`node node_modules/typescript/bin/tsc --noEmit -p .`; log every session in `docs/PROGRESS.md`.

This project uses the Payload CMS skill at `.claude/skills/payload/`.
Start with `.claude/skills/payload/SKILL.md` for a quick reference, then see `.claude/skills/payload/reference/` for detailed docs.
