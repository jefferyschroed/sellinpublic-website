# Prompt Template

Use this after the blog article draft or `article.blocks.json` exists. Replace
bracketed fields, keep the article excerpt concise, and remove irrelevant lines.
Do not create a fixed motif registry; let the article content determine the
visual metaphor.

```text
Use case: stylized-concept
Asset type: [wide blog hero / website background / social graphic / campaign visual]
Source context from article: [3 to 8 sentences from draft.md, article.blocks.json,
or a concise summary of the finished article. Include the main reader problem,
central idea, and any concrete metaphor or workflow the article uses.]

Primary request: Create one simple visual metaphor inferred from the article
source context. Use one or two relevant elements only: a simple flat
liquid-glass UI surface, a relevant icon, or a clear relationship between two
shapes. Do not default to a generic LinkedIn post card unless the article itself
is specifically about a post, profile, or feed object.

Style reference: Use the Sell In Public Flat Liquid Mesh Hero style: generated
raster PNG, softly blended mesh gradient background using one main color plus at
most one close complementary color, matte translucent liquid-glass shapes, simple
head-on flat UI, consistent white outline weight, clean negative space, and
subtle grain.

Composition: Wide landscape hero near 1600x700. Place one central or slightly
off-center subject with quiet space around it. Keep the graphic readable as a
single concept, not an infographic or screenshot.

Scene/backdrop: Soft mesh gradient with one main color plus one close
complementary color at most. Blend colors smoothly without hard edges. Avoid
multi-color mesh palettes.

Subject: [one article-derived metaphor]. Keep markings abstract and non-readable:
short white lines, simple shapes, or one relevant icon only when useful. Present
the graphic completely flat and head-on, with no angled or isometric view.

Detail density: Low. Simple, spacious, and specific. Avoid decorative filler.

Constraints: Generated raster PNG style only. No readable text, logos,
watermarks, exact LinkedIn UI, fake metrics, scattered nodes, random lines, icon
clouds, fake dashboards full of metrics, overcomplicated UIs, generic
LinkedIn-post-card default, glossy 3D objects, glow, bloom, flares, light trails,
shiny/specular/reflection cues, bokeh/orbs, hard gradient edges, SVG/vector look,
photoreal stock-photo look, more than two background colors, angled perspective,
isometric view, tilted panels, or three-quarter UI view.
```

After generation, record the final prompt in `asset-manifest.json` or in
`image-brief.md` referenced by the manifest so QA can audit the prompt against
the finished image.
