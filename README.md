# Bionic for Zotero Reader (with Colorful Bionic Reading)

[![zotero target version](https://img.shields.io/badge/Zotero-7-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org)
[![Using Zotero Plugin Template](https://img.shields.io/badge/Using-Zotero%20Plugin%20Template-blue?style=flat-square&logo=github)](https://github.com/windingwind/zotero-plugin-template)
[![Fork of](https://img.shields.io/badge/Fork%20of-windingwind%2Fbionic--for--zotero-lightgrey?style=flat-square&logo=github)](https://github.com/windingwind/bionic-for-zotero)

**Bio**nic **read**ing **exper**ience **wi**th **Zot**ero.

<div align=center><img src="./docs/res/teaser.png" width="800px"></img></div>

> ### ℹ️ Notice about this fork / derivative
>
> This repository is a **modified fork / derivative** of the original upstream project
> **[windingwind/bionic-for-zotero](https://github.com/windingwind/bionic-for-zotero)**
> (which is the work of the original author, `windingwind`, and all contributors listed
> there). All of the core bionic-reading functionality, the plugin template structure,
> the PDF.js patching technique, the preferences pane, the build tooling, the locale
> infrastructure, etc. come from the original upstream project and remain under the
> original **AGPL** license.
>
> **My only contribution** in this fork has been to add the **Colorful Bionic Reading**
> feature (a palette-based, optional color overlay on the bionic-bold anchors), and the
> surrounding preference controls, default-palette presets, and a max-3 custom-color
> picker for it. That work was authored with the help of **Trae**
> (the AI coding assistant built into the TRAE IDE), following an implementation plan
> that was reviewed against the original codebase.
>
> If you intend to re-share, fork, modify, or redistribute this repository, please
> retain the attribution above, preserve the AGPL license from the upstream project,
> and continue to credit the original `windingwind/bionic-for-zotero` authors for the
> base bionic reader functionality.

## 🧩 Outline

[🧐 What is this?](#-what-is-this)

[🎨 Colorful Bionic Reading (this fork's addition)](#-colorful-bionic-reading-this-forks-addition)

[👋 Install](#-install)

[😎 Quick start](#-quick-start)

[🔧 Development](#-development)

[🔔 Disclaimer](#-disclaimer)

[🔎 My Zotero Plugins](#-my-zotero-plugins)

[🤗 Contributors](#-contributors)

## 🧐 What is this?

Bionic for Zotero is a Zotero plugin that implements a bionic reading experience in the Zotero reader.

### What is bionic reading?

Bionic Reading is a reading method designed to make it easier and faster to comprehend text by guiding the reader's eyes through bolded initial letters of words. This technique emphasizes the beginning of each word, allowing the brain to "fill in" the rest of the word and phrase intuitively, leveraging cognitive shortcuts.

**A**s **sho**wn **i**n **th**is **sent**ence, **t**he **bol**ded **init**ial **lett**ers **o**f **ea**ch **wo**rd **a**re **us**ed **t**o **gui**de **t**he **read**er's **ey**es **thro**ugh **t**he **te**xt, **mak**ing **i**t **eas**ier **t**o **compr**ehend.

### Why bionic reading works/doesn't work?

The effectiveness of Bionic Reading is a subject of ongoing debate, largely because it depends on individual differences in reading habits, cognitive processing, and preferences.

Want to know more? Check out the latest research on [Google Scholar](https://scholar.google.com/scholar?q=bionic%20reading).

## 🎨 Colorful Bionic Reading (this fork's addition)

On top of the original bold-weight bionic effect, this fork adds an **optional
Colorful Bionic Reading** mode. When enabled, only the **bionic anchor** (the
bolded first part of each word) gets recolored according to the selected
palette mode, while the rest of each word stays at its original text color.

Five coloring modes are available (Preferences → Bionic → Colorful Bionic):

| Mode | Effect |
|------|--------|
| **Rainbow** | The anchor of each successive word shifts to the next hue around the color wheel — good for visual word segmentation. |
| **Single Color** | Every bionic anchor uses one fixed accent color, tunable via the palette preset. |
| **Alternating** | Switches back and forth between two accent colors on successive words. |
| **Word Position** | The color of each anchor is determined by a deterministic hash of its position within the visible text run. |
| **Custom Palette** | Cycle through **up to 3 user-picked colors** selected directly from 3 native color pickers in the preferences pane. |

Shared controls also include:

- **Preset palette** — `Default` / `Pastel` / `Vivid` / `Monochrome Tones` for the non-custom modes.
- **Opacity (0.1 – 1.0)** — applies a uniform alpha multiplier so the color overlay does not overpower the paper color of the PDF.
- **Saturation (0 – 2.0)** — dims or intensifies the chosen palette (saturation `0` gives grayscale anchors, useful for accessibility).
- **Custom color pickers** — 3 swatches, stored as JSON behind the scenes. Any invalid entry or palette larger than 3 colors is automatically rolled back to the last valid value with an in-UI warning.

The preferences pane also renders a live preview of the combined weight + opacity + color settings so you can tune them before opening a PDF.

> 🔎 Attribution reminder: the colorful feature above is the **only** addition in this fork. Everything else (the bionic parser, PDF.js injection, toolbar toggle, observers, build system, etc.) is the original work of the upstream `windingwind/bionic-for-zotero` project. See the "Notice about this fork" block near the top of this document.

## 👋 Install

- Download the plugin (.xpi file) from below.
  - [Latest Stable](https://github.com/windingwind/bionic-for-zotero/releases/latest)
  - [All Releases](https://github.com/windingwind/bionic-for-zotero/releases)

  _Note_: If you're using Firefox as your browser, right-click the `.xpi` and select "Save As.."

- In Zotero click `Tools` in the top menu bar and then click `Plugins`
- Go to the Extensions page and then click the gear icon in the top right.
- Select `Install Add-on from file`.
- Browse to where you downloaded the `.xpi` file and select it.
- Finish!

## 😎 Quick start

1. Open a PDF in the Zotero reader.
2. The PDF will be displayed in bionic reading mode by default.
3. To toggle bionic reading mode, use the `View` menu in the top menu bar.

## 🔧 Development

This plugin is built based on the [Zotero Plugin Template](https://github.com/windingwind/zotero-plugin-template). See the setup and debug details there.

To start, run

```bash
git clone https://github.com/windingwind/bionic-for-zotero.git
cd bionic-for-zotero
npm install
npm run build
```

The plugin is built to `./builds/*.xpi`.

## 🔔 Disclaimer

Use this code under AGPL. No warranties are provided. Keep the laws of your locality in mind!

## 🔎 My Zotero Plugins

- [Better Notes for Zotero](https://github.com/windingwind/zotero-better-notes): Everything about note management. All in Zotero.
- [Translate for Zotero](https://github.com/windingwind/zotero-pdf-translate/): Translate PDF, EPub, webpage, metadata, annotations, notes to the target language. Support 20+ translate services.
- [Actions & Tags for Zotero](https://github.com/windingwind/zotero-tag): Customize your Zotero workflow.

## 🤗 Contributors

<a href="https://github.com/windingwind/bionic-for-zotero/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=windingwind/bionic-for-zotero" />
</a>
