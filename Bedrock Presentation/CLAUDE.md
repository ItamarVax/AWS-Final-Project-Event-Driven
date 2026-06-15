<!-- BEGIN DARWIN (generated — do not edit between markers) -->
# Project Context

## Overview
A student-led, ~24-minute presentation on **AWS Bedrock** ("Managed Generative AI on AWS") for the course *Introduction to Cloud and Serverless Development with AWS*. The deck is authored as standalone HTML slides and exported to PowerPoint. Part 1 covers what Bedrock is and how it works; Part 2 covers Bedrock in practice plus a live demo on a real BigID PII-classification pipeline.

## Key Modules
- `slides/` — 16 standalone HTML slides (`01-title.html` … `16-wrap-qa.html`), one file per slide.
- `assets/chrome.css` — the shared design system ("Anthropic-paper" aesthetic): warm cream paper, deep ink, restrained ember accent, fixed type scale, and utility classes (`.serif`, `.sans`, `.mono`, `.eyebrow`, `.meta`, `.page-num`, `.codeblock`, `.paper-grain`).
- `manifest.json` — slide playlist + canvas spec (1920×1080) driving render/export order.
- `bedrock-presentation-outline.md` — full speaker outline (timing, ownership, per-slide notes).
- `slide-text.md` — editable plain-text copy extracted from the slides.
- `AWS-Bedrock-Presentation.pptx` / `AWS-Bedrock-Text-Editable.pptx` — generated PowerPoint exports.

## Entry Points
- Preview a slide: open any `slides/NN-*.html` directly in a browser (each links `../assets/chrome.css`).
- Slide order / canvas: defined in `manifest.json` (`playlist`, `canvas: 1920×1080`).
- PPTX exports are generated artifacts produced by an external render tool — not built from a local CLI.

## Architecture
Each slide is a self-contained HTML document at a fixed **1920×1080** canvas. Layout is absolute-positioned (`position:absolute` with explicit `left/top/width` and `z-index`). Every visual element carries `data-object="true"` plus a `data-object-type` of either `shape` or `textbox` — these markers drive the HTML→PPTX export, so they must be preserved. Styling comes from `assets/chrome.css` via CSS custom properties; slides reference the design tokens rather than redefining colors or type.

## Project-Specific Safety
- **Preserve slide structure integrity**: keep the 1920×1080 canvas dimensions, the `data-object` / `data-object-type` markers, and `z-index` layering intact on every element — the PPTX export depends on them.
- Treat the `.pptx` files as generated outputs; edit the HTML/markdown sources, not the exports.
- Stay on-palette: use the `chrome.css` CSS variables and type scale rather than hardcoding off-system colors or font sizes.
- Scope of this Darwin setup is **slides + design** (`slides/*.html`, `assets/chrome.css`); markdown docs and `.pptx` exports are secondary.

# Code Quality Standards

This is an HTML/CSS presentation deck, not a code project — "quality" here means **slide structure integrity** and **design-system fidelity**.

## Slide Structure (primary standard)
- Keep the slide canvas at **1920×1080** (`.slide-container` width/height and the `data-screen-label` wrapper).
- Every visual element must keep its `data-object="true"` attribute and a valid `data-object-type` — only two values are used in this deck: `shape` and `textbox`. Do not invent new values or drop these markers; the HTML→PPTX export relies on them.
- Preserve absolute positioning (`position:absolute`, explicit `left`/`top`/`width`) and `z-index` layering. When adding an element, give it explicit coordinates and a `z-index` consistent with siblings.
- Each slide is a self-contained document that links `../assets/chrome.css`. Keep that link; do not inline the full stylesheet per slide.

## Design-System Fidelity
- Use the `chrome.css` CSS variables for color: `--paper`, `--paper-deep`, `--ink`, `--ink-soft`, `--ink-mute`, `--ember`, `--ember-deep`, `--gold`, and the `--code-*` tokens. Avoid hardcoded hex values that drift off-palette.
- Use the defined type scale: `--t-display` 96 / `--t-h1` 64 / `--t-h2` 44 / `--t-h3` 32 / `--t-body` 26 / `--t-small` 20 / `--t-meta` 16.
- Prefer the existing utility classes — `.serif`, `.sans`, `.mono`, `.eyebrow`, `.meta`, `.page-num`, `.codeblock`, `.paper-grain` — over ad-hoc inline font/family declarations.

## Consistency
- Keep `manifest.json`'s `playlist` in sync with the actual files in `slides/`.
- When slide copy changes, keep `slide-text.md` aligned with what's rendered (and re-export the `.pptx` as a follow-up, not by hand-editing the export).

## Quality Commands
There is no linter/formatter/test runner in this project. Verification is visual: open the affected `slides/NN-*.html` in a browser at 1920×1080 and confirm layout, palette, and type scale.

# Development Commands

This project has no package manager, build system, or test runner. The workflow is author HTML → preview in a browser → export to PPTX via an external render tool.

## Setup
No install step. Clone/open the directory; slides reference `assets/chrome.css` by relative path.

## Preview
- Open a single slide: open `slides/NN-*.html` in a browser (renders at the 1920×1080 canvas).
- Quick local server (optional), e.g.:
  ```
  python3 -m http.server 8000
  ```
  then browse to `http://localhost:8000/slides/01-title.html`.

## Slide Order
- Edit `manifest.json` → `playlist` to add, remove, or reorder slides. Keep it in sync with the files in `slides/`.

## Export (PPTX)
- `AWS-Bedrock-Presentation.pptx` and `AWS-Bedrock-Text-Editable.pptx` are generated from the HTML by an external render/export tool, not a local CLI. Regenerate via that tool after slide edits; do not hand-edit the `.pptx` files.

## Verify
- Visual check only: open the changed slide(s) at 1920×1080 and confirm structure (`data-object` markers, z-index), palette (chrome.css vars), and type scale.
<!-- END DARWIN -->
