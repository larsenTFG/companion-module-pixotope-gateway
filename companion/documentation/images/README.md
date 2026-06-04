# HELP.md screenshots

Drop PNG screenshots here and reference them from `companion/HELP.md` with paths **relative to the
`companion/` folder**, e.g. `![Connection settings](documentation/images/config.png)`.

Companion serves the `companion/` folder as the help asset root, so this is the proven location that
renders in-app and ships inside the packaged module.

## Screenshots

- **config.png** — connection settings dialog. ✅ added & referenced
- **set-property.png** — Set Property action with a pasted editor URL + value. ✅ added & referenced
- **watch-variable.png** — button showing a live `$(pixotope:prop_…)` value. ✅ added & referenced
- **presets.png** — the Presets → Pixotope tab. ☐ still to capture

## Preset icon

- **preset-status.png** — a **72×72** PNG icon for the connection-status preset. Drop it here and it
  gets base64-embedded into `src/presets.ts` (`png64`). The source file lives here for reference; the
  icon itself ships inlined in the built module, not as a loose file.

Guidance: PNG, cropped tightly, ~600–1000 px wide for screenshots; exactly 72×72 for the preset icon
(transparent background is fine).
