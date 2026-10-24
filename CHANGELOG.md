# Changelog

## 0.1.3

- Claude Code: send a Claude Code user agent to the usage API, which otherwise answers 429.

## 0.1.2

- Claude Code: read 5-hour and weekly limits from the OAuth usage API (a fresh CLI process reports no limits), CLI kept as a fallback.

## 0.1.1

- Antigravity: find the `agy.exe --hub` process and query every listening port over HTTPS and HTTP (fixes "No data available").
- Codex: read the real 5-hour and weekly limits from the Codex session logs instead of estimating them.
- Claude Code: show an explicit error instead of a made-up 100% when usage cannot be read.
- Menu shows the reason when a provider has no data.
- Add extension icon, README and license.

## 0.1.0

- Initial version: status bar quota for Antigravity, Claude Code and Codex.
