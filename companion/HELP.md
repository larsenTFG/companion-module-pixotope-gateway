## Pixotope (Gateway API)

Control Pixotope virtual production graphics from Companion by sending commands to the
**Pixotope Gateway** HTTP API.

### Requirements

- A running Pixotope system with **Pixotope Gateway** reachable on the network.
- Network access from the Companion host to the Gateway machine.

The Gateway exposes a single publish endpoint:

```
http://{Gateway IP}:{Port}/gateway/{API Version}/publish
```

### Connection settings

| Field                 | Description                                                     | Default          |
| --------------------- | --------------------------------------------------------------- | ---------------- |
| Gateway IP            | IP address of the machine running Pixotope Gateway              | `127.0.0.1`      |
| Gateway Port          | Gateway HTTP port                                               | `16208`          |
| Gateway API Version   | Version segment of the publish URL; match your Pixotope install | `2.2.0`          |
| Default Engine Target | Service name used when an action's target is left blank         | `~LOCAL~-Engine` |
| State Poll Interval   | How often (ms) to check the connection; `0` disables polling    | `1000`           |

The connection indicator turns green once Gateway responds.

### Actions

| Action                              | What it does                                                         |
| ----------------------------------- | -------------------------------------------------------------------- |
| **Engine: Set Property**            | Set a property value (text, colour, transform, asset reference)      |
| **Engine: Get Property**            | Read a property value into a Companion variable for display/feedback |
| **Store: Set Value**                | Set a show-wide value in the Pixotope Store                          |
| **Raw API Request**                 | Send any Topic/Message — paste payloads from the Director API Log    |
| **Clear stored property variables** | Remove all `$(pixotope:prop_*)` variables created at runtime         |

**Set Property**, **Get Property**, and the **Property differs from default** feedback all take a
single **Editor URL**: right-click the property in the editor, copy its URL, and paste it in.
Set Property adds a value; Get Property adds a variable name. The URL field accepts Companion
variables, so you can build it dynamically.

### Tip: capture exact payloads

Two easy ways to grab the exact call you need:

- **Editor right-click** — in the Pixotope editor, right-click a property on an object to copy
  its Gateway URL, e.g.
  `…/publish?Type=Call&Target=~LOCAL~-Engine&Method=GetProperty&ParamObjectSearch=DirectionalLight_0.LightComponent0&ParamPropertyPath=Intensity`.
  Paste it into the **Engine: Set Property** or **Engine: Get Property** action.
- **Director API Log** — open the **API Log** tab, perform the action in the UI, then copy the
  logged Topic/Message JSON into the **Raw API Request** action.

The `Param<Key>` query-string convention (e.g. `ParamObjectSearch`) maps to `Message.Params.<Key>`,
so the right-click URL and the JSON payload describe the same call.

### Feedbacks

- **Gateway connection OK** — turns the button green while Gateway is reachable.
- **Engine: Property differs from default** — paste a property's editor URL; the module polls that
  property and turns the button orange while its value differs from its default.
- **Engine: Watch property → variable (live)** — paste a property's editor URL and a variable name;
  the module polls that property (~1s) and keeps `$(pixotope:prop_<name>)` updated with its current
  value. Applies no styling — add it to any button and read the variable anywhere (other buttons,
  triggers, text). Use this when you want a self-updating value rather than the press-to-refresh
  **Engine: Get Property** action.
- **Store: Watch value → variable (live)** — like the property watcher, but reads a value from the
  Pixotope **Store** (a `Get` on a state path, e.g. `State.General.CompositingColorSpace`) rather
  than an engine property. Enter the state path, the service (`Store` by default), and a variable
  name; the value is kept live in `$(pixotope:prop_<name>)`.

### Variables

- `$(pixotope:connection_status)` — `Connected` / `Disconnected` / `Connecting`
- `$(pixotope:gateway_url)` — the resolved publish URL
- `$(pixotope:prop_<name>)` — a property value, kept live by **Engine: Watch property → variable**
  or set on demand by **Engine: Get Property**. Module variables are global, so reference it from
  any button, trigger, or text field. These are created at runtime (not predefined) and exist for
  the session. Removing a **Watch** feedback removes its variable automatically (if no other
  feedback uses it); the **Clear stored property variables** action removes them all at once.

### Authentication

The Pixotope Gateway API is designed for trusted studio LANs and does not use API keys.
Keep the Gateway on a protected network.
