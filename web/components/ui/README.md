# Tile UI Vue sources

Button, Input and Badge originate from the official Tile UI Vue registry,
`https://vue.tileui.zmorg.cn/r/{name}.json`, installed through shadcn 4.22.1.
Retain the root `THIRD_PARTY_NOTICES.md` when redistributing adapted source.

Local adaptations:

- Button emits a typed native click exactly once for Vue TSX callers.
- Input emits typed model/keyboard events, forwards autocomplete and native
  listeners, and retains accessible error/helper associations.
- `lib/core.ts` and `lib/utils.ts` contain only helpers/types required by these
  three components. Unused upstream chart, form and sidebar implementations are
  intentionally excluded. `web/tests/registry.test.ts` covers retained behavior.
- The site loads `@tile-ui/theme-kumo/theme.scss`, not a Tailwind runtime or
  the registry's optional default theme. `web/styles/registry.css` is only the
  CLI token-output target configured in `web/components.json`; it is not loaded.

To fetch upstream component updates:

```sh
pnpm --dir web ui:add @tile-ui/button @tile-ui/input @tile-ui/badge
```

Review overwrite prompts and diffs: upstream updates can replace adapted
components and reintroduce the full shared core/styles. Reapply only needed
changes, preserve the official registry URL, and run type checks and tests.
