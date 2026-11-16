# Paste-ready edge functions

These two files are the `supabase/functions/api` and `supabase/functions/tick` sources bundled into
one file each, so they can be pasted straight into the Supabase dashboard editor
(**Edge Functions → Deploy a new function → Via Editor**) with no CLI and no build step.

| File | Deploy it as a function named |
|---|---|
| `edge-function-api.ts` | `api` |
| `edge-function-tick.ts` | `tick` |

They are generated — edit the real sources in `supabase/functions/` and regenerate with:

```bash
npx esbuild supabase/functions/api/index.ts  --bundle --format=esm --platform=neutral --target=es2022 --external:jsr:* --outfile=deploy/edge-function-api.ts
npx esbuild supabase/functions/tick/index.ts --bundle --format=esm --platform=neutral --target=es2022 --external:jsr:* --outfile=deploy/edge-function-tick.ts
```
