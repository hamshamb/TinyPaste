# TinyPaste brand assets

The project logo is supplied in light- and dark-theme variants.

| Theme | Web preview | Editable source |
| --- | --- | --- |
| Dark | [`tinypaste-logo-dark.png`](tinypaste-logo-dark.png) | [`tinypaste-logo-dark.af`](tinypaste-logo-dark.af) |
| Light | [`tinypaste-logo-light.png`](tinypaste-logo-light.png) | [`tinypaste-logo-light.af`](tinypaste-logo-light.af) |

The `.af` files are the original Affinity documents. The PNG files are their embedded 512×341
previews, extracted without resizing or recompression so GitHub and other browsers can render them.

The root README uses a `<picture>` element with `prefers-color-scheme` to select the matching
variant automatically. Keep the filenames stable when replacing the artwork so documentation links
continue to work.

For production UI use, export directly from the Affinity source as SVG or a transparent PNG at the
required dimensions. The embedded previews have an opaque white canvas and are intended primarily
for repository documentation.
