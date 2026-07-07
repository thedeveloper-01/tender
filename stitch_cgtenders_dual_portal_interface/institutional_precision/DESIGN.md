---
name: Institutional Precision
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#45464d'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#76777d'
  outline-variant: '#c6c6cd'
  surface-tint: '#565e74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#131b2e'
  on-primary-container: '#7c839b'
  inverse-primary: '#bec6e0'
  secondary: '#006c49'
  on-secondary: '#ffffff'
  secondary-container: '#6cf8bb'
  on-secondary-container: '#00714d'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#001a42'
  on-tertiary-container: '#3980f4'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2fd'
  primary-fixed-dim: '#bec6e0'
  on-primary-fixed: '#131b2e'
  on-primary-fixed-variant: '#3f465c'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#d8e2ff'
  tertiary-fixed-dim: '#adc6ff'
  on-tertiary-fixed: '#001a42'
  on-tertiary-fixed-variant: '#004395'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 20px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
  label-sm:
    fontFamily: Inter
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 12px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  container-margin: 16px
  gutter: 12px
---

## Brand & Style

This design system is engineered for **Institutional Precision**, catering to government contractors, PSU entities, and procurement officers who require high-density data visualization and rapid decision-making capabilities. The brand personality is authoritative, systematic, and reliable, evoking an emotional response of security and professional efficiency.

The visual style is a hybrid of **Corporate Modernism** and **Functional Minimalism**. It prioritizes information hierarchy over decorative elements, utilizing a structured grid to manage complex tender metadata. The aesthetic is clean and "engineered," ensuring that technical data remains the primary focus while maintaining a premium, enterprise-grade feel. High whitespace efficiency allows for data-dense layouts without sacrificing legibility.

## Colors

The palette is anchored by deep institutional blues and functional status indicators.

*   **Primary (Deep Blue):** Used for branding, primary navigation, and headers to establish authority.
*   **Secondary (Emerald Green):** Specifically reserved for 'Exempted' status markers and positive validation states.
*   **Tertiary (Action Blue):** Used for interactive elements, links, and secondary buttons to differentiate from structural branding.
*   **Neutral (Slate Grays):** A comprehensive range of grays used for borders, secondary text, and background layering to create a clear interface structure.

The default color mode is **light**, providing maximum contrast for text-heavy data tables and technical documentation.

## Typography

The design system utilizes **Inter** across all levels to leverage its exceptional legibility in high-density UI environments. The hierarchy is strictly enforced to help users scan through tender lists efficiently.

*   **PSU Entities:** Rendered in `label-md` or `label-sm` with uppercase transformation to distinguish the organization from the tender content.
*   **Tender Titles:** Rendered in `headline-sm` or `body-lg` (bold) to ensure they are the first point of visual entry.
*   **Technical Metadata:** (Dates, EMD amounts, IDs) use `body-sm` or `label-sm` for maximum data density without clutter.

## Layout & Spacing

This design system employs a **fluid grid** model optimized for mobile-first responsiveness. 

*   **Mobile (0-599px):** 4-column grid with 16px side margins. Content is primarily stacked, with horizontal scrolling reserved for secondary data tables.
*   **Tablet (600-1023px):** 8-column grid with 24px margins. Introduction of sidebar-constrained layouts for GeM filters.
*   **Desktop (1024px+):** 12-column grid. Full-width layouts for PSU tender management to accommodate extensive data columns.

The spacing rhythm is based on a **4px baseline grid**, ensuring tight, professional alignment for data-dense components.

## Elevation & Depth

To maintain a professional and organized look, the design system avoids heavy shadows. Instead, it utilizes **Tonal Layers** and **Low-Contrast Outlines** to define hierarchy.

*   **Surface Level 0 (Background):** Used for the main application background.
*   **Surface Level 1 (Cards/Containers):** Pure white background with a 1px border in a light neutral gray (#E2E8F0). No shadow.
*   **Surface Level 2 (Modals/Popovers):** Subtle ambient shadow (Blur 8px, Opacity 4%) to indicate temporary interaction.

Separation between sections is achieved through subtle background color shifts rather than physical depth.

## Shapes

The shape language is **Soft (Level 1)**. This subtle rounding (4px for base elements) balances the corporate rigors of the data with a modern, approachable feel. 

*   **Input Fields & Buttons:** 4px radius.
*   **Tender Cards:** 8px radius (`rounded-lg`) to provide a distinct container feel.
*   **Status Pills:** Fully rounded (pill-shaped) to distinguish them from interactive buttons.

## Components

### Navigation
*   **Dual-Tab Architecture:** Top-level navigation using a segmented tab style. The active state is indicated by the Primary Deep Blue background with white text, while the inactive state uses a light gray background.
*   **Active State Indicator:** A 2px bottom bar in Action Blue for sub-navigation links.

### Controls
*   **Dropdowns:** Minimalist design with a 1px border and a subtle chevron icon. Uses `body-md` for selection text.
*   **Segmented Toggles:** Used for EMD status (All / Paid / Exempted). The "Exempted" active state utilizes the Secondary Emerald Green to signify status.

### Cards
*   **Tender Cards:** Optimized for mobile scanning. Layout includes a top row for the PSU logo and Entity Name, a middle section for the Tender Title (bold), and a bottom metadata row (Date, Value, Status) using a 3-column split.
*   **Layout Adapters:** On mobile, cards are full-width. On tablet/desktop with sidebars, cards transition to a condensed vertical stack.

### Inputs & Forms
*   **Data Density:** Input fields use a condensed height (36px-40px) to maximize vertical space. Labels are positioned above the field in `label-md` bold.

### Status Indicators
*   **Exempted Pill:** Emerald Green background (10% opacity) with Emerald Green text.
*   **Active/Open Pill:** Action Blue background (10% opacity) with Action Blue text.