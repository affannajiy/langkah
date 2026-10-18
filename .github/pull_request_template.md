## What and why

<!-- What this changes, and the guide section it follows (docs/Langkah Tech Stack.md). Link the issue. -->

## How I tested it

<!-- Emulator or phone, and the steps. Screenshots for anything visible. -->

## Checklist

- [ ] `npm run typecheck` and `npm run lint` pass inside `app/`
- [ ] New UI text is in both `en.json` and `ms.json`, nothing hard-coded
- [ ] Matches the screen PNGs in `docs/screens/`; 48 dp targets, 4.5:1 contrast, not colour alone
- [ ] Schema changes are in a new migration, with RLS on any new table
- [ ] No secrets, and no new dependency or paid service (or it was agreed in the issue)
- [ ] `CHANGELOG.md` and the docs are updated if behaviour changed
