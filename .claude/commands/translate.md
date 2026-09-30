Sync translations between `messages/en.json` and `messages/ja.json`.

1. Run `pnpm run build` before reading the translation files so extracted messages are current.
2. Read `messages/en.json` and `messages/ja.json`.
3. Add any keys present in `en.json` but missing in `ja.json`.
4. Fill any `ja.json` values that are empty strings using natural Japanese.
5. Remove keys from `ja.json` that no longer exist in `en.json`.
6. Preserve the same key order as `en.json`.
7. Keep brand names untranslated.
8. Keep placeholders such as `{count}`, `{name}`, and `{date}` intact.
9. Keep ICU plural syntax intact.
