---
name: shadcn
description: Add, update, compose, or debug shadcn/ui components, registries, and presets.
user-invocable: false
allowed-tools: Bash(npx shadcn@latest *), Bash(pnpm dlx shadcn@latest *), Bash(bunx --bun shadcn@latest *)
---

# shadcn/ui

Use installed components and project conventions first. Inspect components.json
and the affected source; use the project's runner (pnpm here) for CLI operations.
Run shadcn info when aliases, primitive base, or registry configuration are unclear.

Preserve local component customizations. Preview registry updates with add
--dry-run and --diff before applying them. Overwriting customized components needs
authorization; an explicit overwrite request already provides it. Use configured
registries or a requested registry; clarify only when the choice is ambiguous.

For unfamiliar APIs, use shadcn docs <component> and read the returned documentation.
Match the installed primitive base (Radix or Base UI), imports, and icon library.
Check added source and affected consumers for API and accessibility regressions.

Read only the references needed for the task:

- [Forms](rules/forms.md): field grouping, validation, and input composition.
- [Composition](rules/composition.md): groups, overlays, and component structure.
- [Chat](rules/chat.md): chat primitives when available and relevant to the requested UI.
- [Icons](rules/icons.md): icon composition.
- [Styling](rules/styling.md): variants and theme tokens.
- [Primitive differences](rules/base-vs-radix.md): Radix versus Base UI APIs.
- [CLI](cli.md): commands and preset operations; use the CLI to decode preset codes.
- [Registries](registry.md): authoring or configuring registries.
- [Customization](customization.md): theming and component extensions.

For preset changes, preserve the current primitive base and local customizations.
Resolve whether the requested change covers theme, fonts, or full components
before applying a destructive replacement. Do not treat reference examples as a
reason to restyle unrelated code.
