# AI Quota Monitor (AIQ)

See how much of your **5-hour** quota is left for **Antigravity**, **Claude Code** and **OpenAI Codex**, right in the VS Code status bar.

## Features

- Status bar item with the remaining percentage per pinned model, for example `Claude(5h): 58%  Codex(5h): 68%`.
- Click it to open a menu with every model, a progress bar and the time until reset.
- Click a model in the menu to pin or unpin it in the status bar.
- Warning icon below 20% and error icon when a quota is exhausted.
- Claude Code and Codex also show the 7-day weekly limit in the menu.

By default the status bar shows the first model of each provider (the 5-hour limit for Claude Code and Codex).

## Where the data comes from

Everything is read locally on your machine. Nothing is sent anywhere by this extension.

| Provider | Source |
| --- | --- |
| Antigravity | Local Antigravity language server (`agy.exe` / `language_server`), found by its process, queried on `127.0.0.1` with its own CSRF token. Antigravity must be running. |
| Claude Code | Runs the `claude` CLI in a short-lived process and asks it for the current usage. Claude Code must be installed and logged in. |
| Codex | The latest `rate_limits` entry in `~/.codex/sessions/**/*.jsonl`. Values update after your next Codex request. |

## Commands

| Command | Description |
| --- | --- |
| `AIQ: Show Quotas` | Open the quota menu |
| `AIQ: Refresh` | Refresh all providers now |

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `aiq.refreshInterval` | `60000` | Polling interval in milliseconds |
| `aiq.pinnedItems` | `[]` | Model ids pinned to the status bar (managed from the menu) |

## Troubleshooting

- **"Antigravity process not found"**: start Antigravity, the extension reads its local server.
- **"No Codex rate limit data yet"**: send one request in Codex so a session log with limits exists.
- **"Unable to read Claude Code usage"**: make sure `claude` is on your `PATH` and you are logged in.

## Notes

This is an unofficial tool. It relies on undocumented local interfaces of these products, which may change without notice.

## License

MIT (see the LICENSE file)
