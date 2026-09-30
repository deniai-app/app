# @deni-ai/disposable-email-domains

Local (non-published) workspace package that bundles the disposable email domain
blocklist from
[disposable-email-domains/disposable-email-domains](https://github.com/disposable-email-domains/disposable-email-domains).

The domain list (`data/domains.json`) is the upstream **blocklist** minus the
upstream **allowlist**, merged with any locally-maintained **custom domains**
(`data/custom-domains.json`), deduplicated and sorted.

## Usage

```ts
import { isDisposableEmail } from "@deni-ai/disposable-email-domains";

isDisposableEmail("foo@mailinator.com"); // true
```

Also exported: `isDisposableDomain(domain)` and the `disposableDomains` set.

## Refreshing the domain list

```bash
# from the repo root
pnpm run disposable:refresh

# or from this package
pnpm run refresh
```

This re-fetches the latest lists from the upstream repo and rewrites
`data/domains.json`. Commit the updated file.

## Custom domains

Add domains the upstream blocklist is still missing to
`data/custom-domains.json` (a plain JSON array of bare domains):

```json
["spam.example.com", "throwaway.example.org"]
```

On the next `refresh`, custom domains are merged into `data/domains.json`. Any
custom domain that upstream has since added (or that is on the allowlist) is
pruned from `custom-domains.json` automatically, so the file only ever holds
domains upstream doesn't already cover.
