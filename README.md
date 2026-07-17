# noodle-embed

**Embed a [nanoodle](https://nanoodle.com) workflow in any page.** One ES
module, zero dependencies. Drop a share link into a `<noodle-embed>` tag and
readers see the workflow — nodes, wires, labels — rendered read-only right in
your post, with an **Open in nanoodle →** button that loads the real thing on
their canvas, ready to run or remix.

```html
<script type="module" src="noodle-embed.mjs"></script>
<noodle-embed src="https://nanoodle.com/#g=H4sIAAAA..."></noodle-embed>
```

That's the whole integration.

## Why this exists

A nanoodle share link carries the **entire workflow inside the URL fragment**
— nothing is uploaded, nothing is hosted. That's great for privacy and
terrible for previews: pasted into a blog post, the link is just a wall of
base64. noodle-embed decodes that fragment **locally in the reader's
browser** (no fetch, no analytics, nothing leaves the page — the same promise
nanoodle itself makes) and draws the graph, so the workflow is visible where
your readers already are.

## Usage

```html
<script type="module" src="noodle-embed.mjs"></script>

<!-- a workflow link (#g= / #j=) or an app link (#a=) -->
<noodle-embed src="https://nanoodle.com/#g=..."></noodle-embed>

<!-- taller canvas for stacked graphs (default 340, clamped 160–1200) -->
<noodle-embed src="https://nanoodle.com/play#a=..." height="480"></noodle-embed>
```

Attributes:

| attribute | what it does |
|---|---|
| `src` | A nanoodle share URL, or a bare `#g=...` fragment. All four fragment tags are understood: `#g=` (gzip graph), `#j=` (plain graph), `#a=` (gzip app), `#a=u` (plain app). App embeds show the app's name. |
| `height` | Canvas height in px. Default `340`, clamped to `160–1200`. |

Behavior worth knowing:

- **Read-only viewer.** Field contents (prompts, uploads) are never shown —
  only structure: node cards with their type emoji/label (or custom name) and
  the wires between them. Running happens one click away, in nanoodle.
- **Graceful fallback.** An undecodable `src` still renders the frame and the
  Open-in-nanoodle button — a broken preview never becomes a dead end.
- **Full share URLs only.** `link.nanoodle.com` short links can't be decoded
  without a network round-trip, so embed the full-length link (the graph is
  in the fragment). The share popover's copy button gives you exactly that.
- **Self-contained.** No external requests of any kind, so it works under
  strict CSPs (`default-src 'self'`) and in offline docs.

## Development

```bash
npm test          # node --test — decode, layout, fallback logic (Node ≥ 20)
open demo.html    # serve the folder and eyeball the element
```

The pure helpers (`decodeShareUrl`, `layoutGraph`, `openUrl`, `TYPE_META`)
are exported for reuse and tests; the custom element registers itself only in
browsers.

## Roadmap

- Live run inside the embed via [nanoodle-js](https://github.com/nanoodlecom/nanoodle-js)
  (`nanoodle/browser`), bring-your-own-key — the engine already runs in
  browsers; the embed just needs a key affordance that meets the privacy bar.
- npm publish + CDN copy-paste snippet.

## License

MIT — see [LICENSE](LICENSE). Not affiliated with NanoGPT. Build workflows at
[nanoodle.com](https://nanoodle.com).
