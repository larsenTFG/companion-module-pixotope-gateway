# companion-module-pixotope-gateway

Control [Pixotope](https://www.pixotope.com/) virtual production graphics from Bitfocus Companion
and Buttons via the **Pixotope Gateway** HTTP API.

The module can set and read object properties in the Pixotope engine, read show-wide values from
the Pixotope Store, and keep Companion variables updated live. See
[companion/HELP.md](./companion/HELP.md) for usage and [LICENSE](./LICENSE) for licensing.

## Features

- **Set Property** / **Get Property** — paste a property URL copied from the editor right-click menu.
- **Store: Set Value** — write show-wide settings to the Pixotope Store.
- **Raw API Request** — send any Topic/Message captured from the Director API Log.
- **Feedbacks** — Gateway connection status, "property differs from default", and live
  "watch property/store value → variable".

## Getting started

Running `yarn` installs dependencies. Build once with `yarn build`, or use `yarn dev` to recompile
on change. To develop against Companion, point Companion's _Developer modules path_ at the folder
containing this module.
