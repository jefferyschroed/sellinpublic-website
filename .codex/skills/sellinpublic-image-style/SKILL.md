---
name: sellinpublic-image-style
description: >
  Generate Sell In Public visual assets as raster images. Use when creating or
  iterating blog hero images, website backgrounds, social graphics, campaign
  visuals, or branded abstract B2B visuals for this repo. Trigger on requests
  for "Sell In Public image style", "SIP art style", "blog image", "hero image",
  "mesh gradient", "liquid glass", "background image", or any request to
  generate and save a branded graphic image for this repo.
---

# Sell In Public Image Style

Generate raster images using the built-in `image_gen` tool, then save selected
finals into this repo when the user wants a usable asset.

## Workflow

1. Read `references/style-guide.md` before writing the prompt.
2. For blog heroes, wait until the article draft or `article.blocks.json` exists.
   Build the prompt from the article content, or from a concise article excerpt
   or summary when the full post is too long. Do not finalize a hero prompt from
   only a title, keyword, or outline unless the user explicitly asks for a
   placeholder concept.
3. Use `references/prompt-template.md` to turn the article source context into
   one simple visual metaphor with one or two relevant elements. Preserve
   explicit user constraints, but do not choose from a fixed motif registry.
4. Treat any provided or bundled images as style references only unless the user
   clearly asks for an edit.
5. Generate 1 image by default. Generate 3 variants when the user asks to explore
   direction, compare options, or says "a few".
6. Inspect the output for flatness, head-on perspective, simplicity, article
   relevance, one- or two-color background restraint, consistent white outline
   weight, density, text/logos, and brand fit. Iterate once with a targeted prompt
   if the output misses a core requirement.
7. For repo-bound blog heroes, save the selected original PNG under
   `public/assets/blog/<post-slug>/hero-generated.png`, then create
   `public/assets/blog/<post-slug>/hero-generated.webp` and optimize the PNG
   fallback. Use the WebP path as the publishable image source in packet
   metadata, generated HTML, and blog index cards. For non-blog assets, save to
   `public/assets/generated/sip-art/<descriptive-slug>.png` unless the user
   names another destination.
8. Record the final prompt in the packet `asset-manifest.json` notes or
   `final_prompt` field, or in a post-local `image-brief.md` referenced by the
   manifest. Report the saved absolute path and the final prompt used.

## Style Defaults

Use the current blog hero style unless the user overrides it:

- Flat head-on liquid-glass mesh hero with matte translucency, simple mesh
  gradients, and no angled or isometric perspective.
- One simple article-derived visual metaphor with one or two relevant elements:
  a simple flat liquid-glass UI surface, a relevant icon, or a clear
  relationship between two shapes when the article calls for it.
- Consistent white outline weight across panels, icons, and text-like marks.
- Low visual density, clean negative space, one main background color plus at
  most one close complementary mesh color, subtle grain, and no hard gradient
  edges.
- Wide landscape blog composition near `1600x700`, with clean negative space and
  no baked-in readable text. Publish the WebP derivative, not the PNG source.
- No glow, bloom, flares, light trails, shiny/specular/reflection cues, angled
  views, isometric views, tilted panels, perspective depth, scattered nodes,
  random lines, icon clouds, fake dashboards full of metrics, overcomplicated
  UIs, generic LinkedIn-post-card defaults, glossy 3D objects, bokeh/orbs,
  readable text, logos, or watermarks.
- No SVG-drawn substitutes for blog heroes. Use a generated PNG asset unless the
  user explicitly asks for vector output.

## Saving Behavior

When using built-in `image_gen`, first look for the generated file in the normal
Codex generated-image output location. If a file path is available, copy the
chosen final into the repo path.

If the built-in tool displays only a preview and no accessible filesystem path,
do not claim the asset was saved. Say that the preview is available in-thread and
ask whether to regenerate through an explicit file-output path such as the image
CLI fallback if the user needs a checked-in artifact.

Never overwrite an existing asset unless the user explicitly requests it. Use a
versioned sibling filename such as `<slug>-v2.png` when needed.

## Reference Assets

Bundled style references live in `assets/references/`. Inspect them only when a
task requires closer brand composition matching; the current flat liquid-glass
style guide overrides older lighting or rendering cues in those images:

- `cloud-garden-night.png`
- `courtyard-laundry-night.png`
- `hillside-city-blue-hour.png`
- `ocean-kitchen-day.png`
- `garden-computer-night.png`
- `countryside-lounge-day.png`

Use these images to understand broad brand composition, not to copy subjects or
reintroduce glow, bloom, flares, glossy reflections, or busy motifs.
