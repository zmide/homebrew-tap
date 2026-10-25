# Tile UI Vue registry sources

Button, Input, and Badge were installed with shadcn 4.22.1 from the official
`https://vue.tileui.zmorg.cn/r/{name}.json` registry. Their shared `core.ts`,
`utils.ts`, SCSS modules, and `web/styles/` support files came from the same
registry. These are Vue components, not React components; they do not require a
Tailwind runtime. The site continues to load its Kumo npm theme rather than the
registry's optional default theme or CLI-generated `styles/registry.css`.

## Local integration adaptations

- **Button:** declares a typed `click` event and emits the original `MouseEvent`
  from the native button. This makes `onClick` available to Vue TSX callers.
  Native disabled/loading behavior and ordinary attribute fallthrough remain
  unchanged, and the declared listener is not also forwarded through `$attrs`.
- **Input:** types `update:modelValue` as a string and `keydown` as a
  `KeyboardEvent`. The native input emits the original key event, not the wrapper
  div, preserving `preventDefault()` and avoiding duplicate listeners. An explicit
  `autocomplete` prop is forwarded to that input. Other attributes and native
  input listeners retain the registry's existing forwarding behavior.
- **Shared core:** supports Nuxt's strict `noUncheckedIndexedAccess` without
  weakening project compiler settings. Missing chart labels become empty strings
  (including preservation of valid numeric zero labels); path helpers guard
  missing endpoints; nested form writes stop when their path segments are
  exhausted; validators iterate key/function entries together; sidebar lookup
  skips missing items. Field-array conversion rejects missing IDs with a
  `RangeError` instead of returning invalid entries. Store swap/move reject
  non-integer/out-of-range indices, and their local non-null assertions rely on
  those checks plus `getFieldArrayIds` filling every array slot.

Badge and the registry SCSS are unchanged. Integration and edge-case regression
coverage lives in `web/tests/registry.test.ts`.

## Updating from upstream

Run `pnpm --dir web ui:add @tile-ui/button @tile-ui/input @tile-ui/badge` to fetch
the registry items. **Review overwrite prompts carefully:** registry updates can
replace the local adaptations above, including the shared core. Compare the
upstream changes, retain or reapply only the necessary adaptations, and run
`pnpm --dir web type:check` and `pnpm --dir web test` afterward. Keep
`web/components.json` pointed at the official Vue registry; temporary networking
workarounds must not be committed as registry URLs.
