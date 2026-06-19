---
name: sellinpublic-image-style
description: >
  Generate Sell In Public visual assets in the brand's cinematic omniscient
  isometric illustration style. Use when creating or iterating blog hero images,
  website backgrounds, social graphics, campaign visuals, or aesthetic B2B scenes
  that should look like polished semi-realistic cartoon/animated concept art.
  Trigger on requests for "Sell In Public image style", "SIP art style",
  "isometric office", "aerial isometric", "omnipotent view", "golden-hour office",
  "blog image", "background image", or any request to generate and save a
  branded graphic image for this repo.
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
   `public/assets/generated/sip-art/<descriptive-slug>.png` unless the user names
   another destination.
7. Report the saved absolute path and the final prompt used.

## Style Defaults

Use the current house style unless the user overrides it:

- Aerial isometric, omniscient, architectural axonometric view.
- Golden hour sunset unless another time is requested.
- Semi-realistic cartoon-painted digital illustration.
- Medium-low detail density: clean surfaces, readable silhouettes, breathing room.
- Cinematic reflections, warm individual lights, and polished material rendering.
- No readable text, logos, watermarks, distorted anatomy, or cluttered trinkets.

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
