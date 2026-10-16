# Stitch

Stitch is a Lumiverse extension for composing one definitive swipe from pieces of several existing swipes.

## Flow

1. **Select** — move swipe-by-swipe, click source-mapped paragraphs or HTML/display islands, or highlight a smaller slice inside one paragraph.
2. **Arrange** — drag the selected pieces into the final order. On touchscreens, drag the grip; scrolling remains available over the rest of each card. The grip also accepts Up/Down arrow keys, and each card has move buttons. Long text fades at the bottom; the compact **Read more** button expands the full source text. Island cards also have an eye button for their HTML preview.
3. **Edit** — work on one normal editable surface, or choose **Open expanded editor** to use Lumiverse's native editor. Applying returns the text to Stitch; cancelling keeps the previous draft. Save the result as a new native swipe.

Saving never overwrites the source swipes. Stitch snapshots the source swipe revision when the editor opens and refuses to write if the message changes underneath the session.

The Select view keeps exact source offsets while presenting prose as clickable `<p>` blocks. Lumiverse-style Shadow DOM HTML islands and paired `<!-- NAME_START --> … <!-- NAME_END -->` display-resolver envelopes are isolated as their own selectable blocks so hidden source cannot be accidentally swallowed by an adjacent paragraph.

Eye buttons appear only on HTML and resolved islands, in both Select and Arrange. They open static HTML previews through Spindle's public sandbox-frame API, with an **Exact source** disclosure. The preview canvas follows Lumiverse's current theme, with a system-theme fallback, and updates when the theme changes. Scripts, external resources, links and chat actions are disabled. Previewing does not change which pieces are selected or their stored source.

**Display-resolver limitation:** Lumiverse currently exposes resolver registration but no public API for replaying its complete display pipeline inside another extension. Resolved envelopes therefore show their stored source, which may be JSON or other non-HTML content; they do not reproduce extension-owned/regex-resolved chat output. Faithful resolved previews require a separate host preview API. Stitch does not import private core internals or reimplement that pipeline.

The editor requests Lumiverse's full available Spindle modal geometry and behaves as a near-fullscreen workspace. It honors `--app-interactive-safe-top` so desktop/PWA window chrome stays clear, and keeps an explicit close control in the modal header. Re-rendering a selection preserves the source pane and modal-body scroll positions so toggling a paragraph does not jump the reader back to the top.

## Permissions

Stitch requests only `chat_mutation`, used by its backend to read the canonical swipe set and append the finished result.

## Build

```sh
bun install
bun run typecheck
bun test
bun run build
```

Browser regression checks use controlled Spindle boundary mocks and synthetic content, without a running Lumiverse instance or personal chat data:

```sh
bun x playwright install chromium webkit
bun run test:browser
```

The checks exercise the actual extension frontend at 1280px, 390px and 320px widths in Chromium and WebKit, including a simulated 47px mobile safe top area. They cover text selection and offsets, keyboard/mouse ordering, Chromium touch dragging, preview dismissal/focus restoration, expanded-editor result/cancellation contracts, navigation and unload/remount. Screenshots go to ignored `test-results/`. `STITCH_BROWSERS=chromium` runs one engine. The native editor UI is mocked here; its real handoff, physical iPhone gestures, installed-PWA scrolling and live resolver output still require checking after installing the updated extension.

Lumiverse can also auto-build `src/backend.ts` and `src/frontend.ts` when installing from source.

## Publishing note

The extension repository is [kittyafterdark/Stitch](https://github.com/kittyafterdark/Stitch). Publish the source files, manifest and updated compiled entry points in `dist/`, which this repository already tracks. Development dependencies and browser screenshots are excluded from Git.

`MANIFEST.sha256` hashes the published text files in Git's canonical LF form.
