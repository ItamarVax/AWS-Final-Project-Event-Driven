---
name: new-slide
description: Scaffold a new structurally-correct HTML slide for the AWS Bedrock deck and register it in manifest.json. Use when adding a slide, duplicating slide layout, or asking how slides are structured in this project.
---

# new-slide

Create a new slide for this deck that conforms to the project's structure and design system, then wire it into the playlist.

## When to use
- The user wants to add a slide, split a slide, or duplicate an existing layout.
- The user asks how slides in `slides/` are put together.

## Slide anatomy (must match existing slides)

Every slide is a standalone HTML document at a fixed **1920×1080** canvas:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{Short title} — AWS Bedrock</title>
<link rel="stylesheet" href="../assets/chrome.css">
</head>
<body style="margin:0;padding:0;overflow:hidden;">
<div class="slide-container paper-grain" style="position:relative;width:1920px;height:1080px;overflow:hidden;background:#F4EFE6;" data-screen-label="NN {Title}">

  <!-- every element: absolute-positioned, data-object markers, explicit z-index -->
  <div data-object="true" data-object-type="textbox" style="position:absolute;left:120px;top:78px;width:900px;z-index:10;">
    <div class="sans" style="font-size:16px;font-weight:600;letter-spacing:0.22em;color:#1A1714;text-transform:uppercase;">…</div>
  </div>

  <div data-object="true" data-object-type="shape" style="position:absolute;left:120px;top:120px;width:1680px;height:1px;background:#1A1714;z-index:1;"></div>

</div>
</body>
</html>
```

## Non-negotiable rules
1. **Canvas**: `.slide-container` stays `width:1920px;height:1080px`. Keep `data-screen-label="NN Title"`.
2. **Markers**: every visual element gets `data-object="true"` and a `data-object-type` of either `shape` or `textbox` (these two only — the HTML→PPTX export depends on them).
3. **Positioning**: absolute (`position:absolute`, explicit `left`/`top`/`width`) with an explicit `z-index` consistent with sibling elements (hairlines/rules ~`z-index:1`, text ~`z-index:10`).
4. **Design tokens** (from `assets/chrome.css`): use the palette and type scale rather than off-system values.
   - Colors: `--paper #F4EFE6`, `--paper-deep #ECE5D6`, `--ink #1A1714`, `--ink-soft #4A433B`, `--ink-mute #847B6E`, `--ember #B8472A`, `--ember-deep #8E331C`, `--gold #A88030`, plus `--code-*` for code blocks.
   - Type scale: display 96 / h1 64 / h2 44 / h3 32 / body 26 / small 20 / meta 16.
   - Utility classes: `.serif` (headlines/body serif), `.sans` (Inter labels/eyebrows), `.mono` (JetBrains Mono), `.codeblock`, `.eyebrow`, `.meta`, `.page-num`, `.paper-grain`.
5. **Stylesheet link**: keep `<link rel="stylesheet" href="../assets/chrome.css">`; do not inline the full stylesheet.

## Steps
1. Pick the slide number `NN` and filename `slides/NN-<kebab-title>.html` (zero-padded, matching the existing naming, e.g. `08-tool-use.html`).
2. Copy the structure of the nearest existing slide with a similar layout rather than starting blank — it keeps margins (typical content gutter `left:120px`, top hairline at `top:120px`, content width `1680px`) consistent.
3. Fill in copy. Cross-check `bedrock-presentation-outline.md` for the intended content/notes and update `slide-text.md` with the new copy.
4. **Register in `manifest.json`**: add the filename to the `playlist` array at the correct position so order is preserved.
5. Verify visually: open `slides/NN-*.html` in a browser at 1920×1080 and confirm layout, palette, type, and that no element is missing its `data-object` markers.

## Don'ts
- Don't change the canvas size or drop `data-object` markers.
- Don't hardcode off-palette colors or arbitrary font sizes when a token exists.
- Don't hand-edit the `.pptx` files — they're regenerated from the HTML by the external export tool.
