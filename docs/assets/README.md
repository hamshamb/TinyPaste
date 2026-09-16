# TinyPaste brand assets

The project logo is supplied in light- and dark-theme variants.

| Artwork | Intended background | Web preview | Editable source |
| --- | --- | --- | --- |
| Dark mark | Light UI | [`tinypaste-logo-dark.png`](tinypaste-logo-dark.png) | [`tinypaste-logo-dark.af`](tinypaste-logo-dark.af) |
| Light mark | Dark UI | [`tinypaste-logo-light.png`](tinypaste-logo-light.png) | [`tinypaste-logo-light.af`](tinypaste-logo-light.af) |

The `.af` files are the original Affinity documents. The PNG files are their embedded 512×341
previews, extracted without resizing or recompression so GitHub and other browsers can render them.

The root README uses a `<picture>` element with `prefers-color-scheme` to select the contrasting
variant automatically. The website header uses the same assets from `public/brand/`, keyed to the
app's explicit `.dark` class. Keep the filenames stable when replacing the artwork so those
references continue to work.

The embedded previews have an opaque white canvas. The compact website header clips that canvas at
render time without altering the artwork; for larger production placements, export directly from
the Affinity source as SVG or a transparent PNG at the required dimensions.
