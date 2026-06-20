# Sell In Public Image Style Guide

## Name

Use this working name internally: **SIP Flat Liquid Mesh Hero**.

## Core Look

Create generated PNG blog heroes with flat head-on liquid-glass mesh graphics:
matte translucency, simple flat UI forms, clean white linework, and softly
blended mesh gradient backgrounds using one main color plus at most one close
complementary color. The style should feel modern, editorial, calm, and useful
without becoming a screenshot, infographic, glossy 3D render, or generic AI hero
image.

## Composition

Default to a wide landscape editorial hero:

- Target a wide, short composition close to `1600x700`.
- Use one central or slightly off-center flat liquid-glass subject that relates
  to the article topic at a glance.
- Present the glass/white graphic completely head-on, like a flat interface
  viewed straight from the front.
- Keep the graphic simple enough to read as a concept, not an infographic.
- Leave quiet gradient space around the focal element.
- Use a few white text-like lines, simple icons, or relationship marks only when
  they make the subject more specific.
- Keep all white outlines visually consistent in weight.
- Avoid repeated defaults. Do not use a LinkedIn-style post card unless the
  article content specifically makes a post, profile, or feed object the right
  metaphor.
- Do not use flow lines, dense connectors, scattered nodes, icon clouds, random
  app icons, fake dashboards full of metrics, or many small panels.
- Do not use isometric, angled, tilted, three-quarter, oblique, floating-depth,
  or perspective UI compositions.

## Background And Color

The background carries the mood.

Prefer:

- blended mesh gradients that feel calm and organic
- one main color plus at most one close complementary mesh color
- close color pairings such as sky/blue, turquoise/mint, lavender/periwinkle,
  rose/coral, soft green/mint, or peach/apricot
- subtle grain and diffusion
- translucent white linework over soft color fields

Avoid:

- three or more background color families
- rainbow or multi-color mesh gradients
- dark navy/slate dominance
- beige-only or single-hue palettes
- harsh orange/blue contrast unless the article needs that tension and the blend
  still stays soft
- hard corporate gradients
- decorative orbs or bokeh blobs as standalone decoration
- hard gradient edges
- high-contrast busy backgrounds

## Liquid Glass Graphics

The foreground should feel like refined glass UI, not a screenshot.

Use:

- matte translucent panels or shapes
- consistent white outlines
- simple flat liquid-glass UI surfaces
- head-on front-facing composition only
- a few simple icon-like marks only when they clarify the concept
- white text-like lines and outlines with no readable words
- no readable text unless the user explicitly provides exact text

Avoid:

- shiny/specular/reflection cues
- glow, bloom, flares, light trails, or lens effects
- glossy 3D objects
- isometric, angled, tilted, or three-quarter UI views
- fake product screenshots or metric-heavy dashboards
- many disconnected UI fragments

## Blog Topic Translation

Generate the blog hero prompt after the article draft or `article.blocks.json`
exists. Use the article itself as source context, not just the keyword.

Extract:

- the main reader problem
- the article's central relationship, contrast, or operating idea
- one concrete object, workflow, or metaphor that appears in the article
- the tone the hero should support

Then infer one simple visual metaphor. Give the image model creative freedom
inside the style, but keep the subject to one or two relevant elements. Do not
maintain a fixed motif registry. Do not force every LinkedIn, founder, employee,
measurement, or AI-search article into the same post-card pattern.

Do not fake real LinkedIn UI, logos, company marks, or metrics.

## Rendering

Use:

- Generated raster PNG output.
- Flat liquid-glass mesh style with matte translucency.
- Crisp simple head-on forms over a softly blended two-color mesh gradient.
- Sophisticated restraint, saturation, and contrast.
- White outlines with consistent weight.

Avoid:

- SVG or hand-coded stand-ins for blog heroes.
- Flat vector graphics.
- Corporate stock-photo realism.
- Glossy 3D render style.
- Isometric, angled, tilted, or perspective render style.
- Cluttered trinkets.
- Fake screenshots.
- Random icon constellations, tangled flows, scattered nodes, random lines, or
  many disconnected UI fragments.
- Generic LinkedIn-post-card defaults.

## Universal Negative Constraints

Always include constraints against:

- Readable text.
- Logos and watermarks.
- Fake metrics or fake interface screenshots.
- Excessive clutter and dense decorative noise.
- Scattered nodes, random lines, icon clouds, and overcomplicated UIs.
- Repeated default LinkedIn-post-card composition when the article does not
  specifically require it.
- Glow, bloom, flares, light trails, shiny/specular/reflection cues, glossy 3D
  objects, bokeh/orbs, and hard gradient edges.
- More than two background colors, and any angled, isometric, tilted, or
  perspective view of the glass/white graphic.
- SVG/vector output when a blog hero PNG is required.
