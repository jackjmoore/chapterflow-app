/**
 * Typefaces that ship inside the app.
 *
 * Every family here is published under the SIL Open Font License 1.1, which
 * permits bundling and embedding with no attribution shown to the writer.
 * They arrive as woff2 files through the fontsource packages, bundled by
 * Vite with the rest of the renderer, so they load from disk like any other
 * asset: nothing is fetched, and a manuscript set in one of them looks the
 * same on every machine the app runs on — unlike the operating-system fonts
 * in the same picker, which render only where they happen to be installed.
 *
 * Regular, italic, bold and bold italic, in the Latin and Latin Extended
 * subsets. Each subset is a separate @font-face with a unicode-range, so a
 * file is only read when a glyph it covers is on screen. Libre Caslon Text
 * has no bold italic and OpenDyslexic no Latin Extended subset; both fall
 * back to the browser's synthesis for the missing style.
 *
 * Imported once, from main.tsx. The picker's entries live in
 * toolbarOptions.ts and must name the same families.
 */
// Alegreya
import '@fontsource/alegreya/latin-400.css'
import '@fontsource/alegreya/latin-400-italic.css'
import '@fontsource/alegreya/latin-700.css'
import '@fontsource/alegreya/latin-700-italic.css'
import '@fontsource/alegreya/latin-ext-400.css'
import '@fontsource/alegreya/latin-ext-400-italic.css'
import '@fontsource/alegreya/latin-ext-700.css'
import '@fontsource/alegreya/latin-ext-700-italic.css'
// Atkinson Hyperlegible
import '@fontsource/atkinson-hyperlegible/latin-400.css'
import '@fontsource/atkinson-hyperlegible/latin-400-italic.css'
import '@fontsource/atkinson-hyperlegible/latin-700.css'
import '@fontsource/atkinson-hyperlegible/latin-700-italic.css'
import '@fontsource/atkinson-hyperlegible/latin-ext-400.css'
import '@fontsource/atkinson-hyperlegible/latin-ext-400-italic.css'
import '@fontsource/atkinson-hyperlegible/latin-ext-700.css'
import '@fontsource/atkinson-hyperlegible/latin-ext-700-italic.css'
// Courier Prime
import '@fontsource/courier-prime/latin-400.css'
import '@fontsource/courier-prime/latin-400-italic.css'
import '@fontsource/courier-prime/latin-700.css'
import '@fontsource/courier-prime/latin-700-italic.css'
import '@fontsource/courier-prime/latin-ext-400.css'
import '@fontsource/courier-prime/latin-ext-400-italic.css'
import '@fontsource/courier-prime/latin-ext-700.css'
import '@fontsource/courier-prime/latin-ext-700-italic.css'
// Crimson Pro
import '@fontsource/crimson-pro/latin-400.css'
import '@fontsource/crimson-pro/latin-400-italic.css'
import '@fontsource/crimson-pro/latin-700.css'
import '@fontsource/crimson-pro/latin-700-italic.css'
import '@fontsource/crimson-pro/latin-ext-400.css'
import '@fontsource/crimson-pro/latin-ext-400-italic.css'
import '@fontsource/crimson-pro/latin-ext-700.css'
import '@fontsource/crimson-pro/latin-ext-700-italic.css'
// EB Garamond
import '@fontsource/eb-garamond/latin-400.css'
import '@fontsource/eb-garamond/latin-400-italic.css'
import '@fontsource/eb-garamond/latin-700.css'
import '@fontsource/eb-garamond/latin-700-italic.css'
import '@fontsource/eb-garamond/latin-ext-400.css'
import '@fontsource/eb-garamond/latin-ext-400-italic.css'
import '@fontsource/eb-garamond/latin-ext-700.css'
import '@fontsource/eb-garamond/latin-ext-700-italic.css'
// Libre Baskerville
import '@fontsource/libre-baskerville/latin-400.css'
import '@fontsource/libre-baskerville/latin-400-italic.css'
import '@fontsource/libre-baskerville/latin-700.css'
import '@fontsource/libre-baskerville/latin-700-italic.css'
import '@fontsource/libre-baskerville/latin-ext-400.css'
import '@fontsource/libre-baskerville/latin-ext-400-italic.css'
import '@fontsource/libre-baskerville/latin-ext-700.css'
import '@fontsource/libre-baskerville/latin-ext-700-italic.css'
// Libre Caslon Text
import '@fontsource/libre-caslon-text/latin-400.css'
import '@fontsource/libre-caslon-text/latin-400-italic.css'
import '@fontsource/libre-caslon-text/latin-700.css'
import '@fontsource/libre-caslon-text/latin-ext-400.css'
import '@fontsource/libre-caslon-text/latin-ext-400-italic.css'
import '@fontsource/libre-caslon-text/latin-ext-700.css'
// Literata
import '@fontsource/literata/latin-400.css'
import '@fontsource/literata/latin-400-italic.css'
import '@fontsource/literata/latin-700.css'
import '@fontsource/literata/latin-700-italic.css'
import '@fontsource/literata/latin-ext-400.css'
import '@fontsource/literata/latin-ext-400-italic.css'
import '@fontsource/literata/latin-ext-700.css'
import '@fontsource/literata/latin-ext-700-italic.css'
// Lora
import '@fontsource/lora/latin-400.css'
import '@fontsource/lora/latin-400-italic.css'
import '@fontsource/lora/latin-700.css'
import '@fontsource/lora/latin-700-italic.css'
import '@fontsource/lora/latin-ext-400.css'
import '@fontsource/lora/latin-ext-400-italic.css'
import '@fontsource/lora/latin-ext-700.css'
import '@fontsource/lora/latin-ext-700-italic.css'
// Merriweather
import '@fontsource/merriweather/latin-400.css'
import '@fontsource/merriweather/latin-400-italic.css'
import '@fontsource/merriweather/latin-700.css'
import '@fontsource/merriweather/latin-700-italic.css'
import '@fontsource/merriweather/latin-ext-400.css'
import '@fontsource/merriweather/latin-ext-400-italic.css'
import '@fontsource/merriweather/latin-ext-700.css'
import '@fontsource/merriweather/latin-ext-700-italic.css'
// OpenDyslexic
import '@fontsource/opendyslexic/latin-400.css'
import '@fontsource/opendyslexic/latin-400-italic.css'
import '@fontsource/opendyslexic/latin-700.css'
import '@fontsource/opendyslexic/latin-700-italic.css'
// Source Sans 3
import '@fontsource/source-sans-3/latin-400.css'
import '@fontsource/source-sans-3/latin-400-italic.css'
import '@fontsource/source-sans-3/latin-700.css'
import '@fontsource/source-sans-3/latin-700-italic.css'
import '@fontsource/source-sans-3/latin-ext-400.css'
import '@fontsource/source-sans-3/latin-ext-400-italic.css'
import '@fontsource/source-sans-3/latin-ext-700.css'
import '@fontsource/source-sans-3/latin-ext-700-italic.css'
// Source Serif 4
import '@fontsource/source-serif-4/latin-400.css'
import '@fontsource/source-serif-4/latin-400-italic.css'
import '@fontsource/source-serif-4/latin-700.css'
import '@fontsource/source-serif-4/latin-700-italic.css'
import '@fontsource/source-serif-4/latin-ext-400.css'
import '@fontsource/source-serif-4/latin-ext-400-italic.css'
import '@fontsource/source-serif-4/latin-ext-700.css'
import '@fontsource/source-serif-4/latin-ext-700-italic.css'
// Spectral
import '@fontsource/spectral/latin-400.css'
import '@fontsource/spectral/latin-400-italic.css'
import '@fontsource/spectral/latin-700.css'
import '@fontsource/spectral/latin-700-italic.css'
import '@fontsource/spectral/latin-ext-400.css'
import '@fontsource/spectral/latin-ext-400-italic.css'
import '@fontsource/spectral/latin-ext-700.css'
import '@fontsource/spectral/latin-ext-700-italic.css'
// Vollkorn
import '@fontsource/vollkorn/latin-400.css'
import '@fontsource/vollkorn/latin-400-italic.css'
import '@fontsource/vollkorn/latin-700.css'
import '@fontsource/vollkorn/latin-700-italic.css'
import '@fontsource/vollkorn/latin-ext-400.css'
import '@fontsource/vollkorn/latin-ext-400-italic.css'
import '@fontsource/vollkorn/latin-ext-700.css'
import '@fontsource/vollkorn/latin-ext-700-italic.css'
