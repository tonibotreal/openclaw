# Deploy Scripts (One-Shot)

Scripts in this directory are **automatically executed once** after a PR is merged and deployed via the GitHub webhook.

## Convention

- Place shell scripts here: `scripts/deploy/*.sh`
- Scripts run in **alphabetical order** (use numeric prefixes: `01-first.sh`, `02-second.sh`)
- Each script runs **only once** — tracked in `.executed-scripts.json`
- Scripts must exit `0` on success, non-zero on failure
- 2-minute timeout per script

## Example

```bash
#!/bin/bash
# 01-example-security-fix.sh
set -e
echo "Applying fix..."
# Commands here
echo "Done!"
```

## Lifecycle

1. Create script in `scripts/deploy/`
2. PR → Review → Merge
3. Webhook auto-executes new scripts
4. Script marked as executed (won't re-run)

## Re-running

Remove entry from `.executed-scripts.json` to re-run a script.
