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
2. If the user provides a short idea, expand it into the style using
   `references/prompt-template.md`. Preserve explicit user constraints.
3. Treat any provided or bundled images as style references only unless the user
   clearly asks for an edit.
4. Generate 1 image by default. Generate 3 variants when the user asks to explore
   direction, compare options, or says "a few".
5. Inspect the output for camera angle, density, lighting, anatomy, text/logos,
   and brand fit. Iterate once with a targeted prompt if the output misses a
   core requirement.
6. For repo-bound assets, save the selected image under
   `public/assets/blog/<post-slug>/hero-generated.png` for blog heroes, or
   `public/assets/generated/sip-art/<descriptive-slug>.png` for non-blog assets
   unless the user names another destination.
7. Report the saved absolute path and the final prompt used.

## Style Defaults

Use the current blog hero style unless the user overrides it:

- Warm Japanese-inspired blended mesh gradient background with only a few
  neighboring colors. Prefer coral, apricot, peach, rose, salmon, and soft
  lavender. Avoid harsh orange/blue contrast.
- One simple focused liquid-glass UI object that summarizes the article topic.
  Do not make icon constellations, source-node maps, or flow-line diagrams.
- Bright white translucent text-like lines, icons, and outlines on the glass
  object, close to polished product-marketing glass UI examples.
- Thin white strokes, frosted panels, soft glows, subtle grain, and calm depth.
- Wide landscape blog composition near `1600x700`, with clean negative space and
  no baked-in readable text.
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

Bundled style references live in `assets/references/`. Inspect them when a task
requires closer style matching:

- `cloud-garden-night.png`
- `courtyard-laundry-night.png`
- `hillside-city-blue-hour.png`
- `ocean-kitchen-day.png`
- `garden-computer-night.png`
- `countryside-lounge-day.png`

Use these images to understand the rendering language, not to copy subjects.
