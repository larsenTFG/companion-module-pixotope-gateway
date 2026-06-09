# companion-module-pixotope-gateway

![Version](https://img.shields.io/github/package-json/v/bitfocus/companion-module-pixotope-gateway)
![License](https://img.shields.io/github/license/bitfocus/companion-module-pixotope-gateway)

Control [Pixotope](https://www.pixotope.com/) virtual production graphics from Bitfocus
**Companion** and **Buttons** via the **Pixotope Gateway** HTTP API.

User documentation is in **[companion/HELP.md](./companion/HELP.md)** (the same text Companion shows
in-app). See [LICENSE](./LICENSE) for licensing.

## Compatibility

- Bitfocus **Companion 4.x** (tested on 4.3.3) and Bitfocus **Buttons** (tested on 1.6.x).
- Module runtime: **Node 22**, `nodejs-ipc` (the stable Companion module API).
- Pixotope with **Pixotope Gateway** reachable over the network.

## Features

- **Set Property / Get Property** — paste the URL copied from the editor's right-click menu; no
  manual field entry.
- **Store: Set Value** — write show-wide settings to the Pixotope Store.
- **Raw API Request** — send any Topic/Message captured from the Director API Log.
- **Feedbacks** — Gateway connection status, "property differs from default", and live
  "watch property/Store value → variable".
- Polling is optimised for live use: only watched values are polled, with a configurable refresh
  interval and a pooled keep-alive connection.

## Getting started (developers)

```sh
yarn          # install dependencies
yarn build    # compile once to dist/
yarn dev      # recompile on change
yarn package  # build a distributable pkg/ + .tgz
```

To develop against Companion/Buttons, set the **Developer modules path** in the launcher to the
folder that _contains_ this module, then run `yarn dev`. The app loads it live and reloads on
rebuild — no re-import needed.

## Changelog

### 1.0.2

- Added the **Engine: Call Event (Blueprint)** action — trigger Blueprint events (CallFunction),
  with function arguments passed as a JSON array (e.g. `[10,"HELLO"]`).
- Added Raw API Request usage examples and Call Event argument guidance to the in-app help.

### 1.0.1

- Initial release: Set/Get Property, Store value, Raw API Request, connection & property feedbacks,
  and live property/Store variable watching.
