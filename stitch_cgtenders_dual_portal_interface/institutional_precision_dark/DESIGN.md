---
name: Institutional Precision Dark
colors:
  surface: '#051424'
  surface-dim: '#051424'
  surface-bright: '#2c3a4c'
  surface-container-lowest: '#010f1f'
  surface-container-low: '#0d1c2d'
  surface-container: '#122131'
  surface-container-high: '#1c2b3c'
  surface-container-highest: '#273647'
  on-surface: '#d4e4fa'
  on-surface-variant: '#c2c6d6'
  inverse-surface: '#d4e4fa'
  inverse-on-surface: '#233143'
  outline: '#8c909f'
  outline-variant: '#424754'
  surface-tint: '#adc6ff'
  primary: '#adc6ff'
  on-primary: '#002e6a'
  primary-container: '#4d8eff'
  on-primary-container: '#00285d'
  inverse-primary: '#005ac2'
  secondary: '#4edea3'
  on-secondary: '#003824'
  secondary-container: '#00a572'
  on-secondary-container: '#00311f'
  tertiary: '#ffb786'
  on-tertiary: '#502400'
  tertiary-container: '#df7412'
  on-tertiary-container: '#461f00'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#adc6ff'
  on-primary-fixed: '#001a42'
  on-primary-fixed-variant: '#004395'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#ffdcc6'
  tertiary-fixed-dim: '#ffb786'
  on-tertiary-fixed: '#311400'
  on-tertiary-fixed-variant: '#723600'
  background: '#051424'
  on-background: '#d4e4fa'
  surface-variant: '#273647'
typography:
  display-lg:
    fontFamily: Hanken Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base-unit: 4px
  container-padding-desktop: 32px
  container-padding-mobile: 16px
  gutter: 24px
  component-gap: 12px
---

## Brand & Style
This design system is engineered for high-stakes institutional environments where clarity, speed of cognition, and professional authority are paramount. The brand personality is disciplined, analytical, and reliable. 

The aesthetic follows a **Corporate / Modern** direction with a focus on deep-space layering. By utilizing a dark color mode, we reduce eye strain for long-session power users while maintaining a premium, "command center" feel. The interface prioritizes high information density without sacrificing legibility, using subtle border definitions and tonal shifts rather than aggressive shadows to organize data.

## Colors
The palette is rooted in deep navy and slate tones to provide a stable, low-light foundation. 

- **Primary Blue (#3b82f6):** Used exclusively for primary actions, active states, and critical navigation markers.
- **Emerald Green (#10b981):** Reserved for EMD status markers, positive growth trends, and "Success" system feedback.
- **Surface Strategy:** The base background uses #0f172a. Elevated containers or cards move to #1e293b to create natural depth.
- **Typography:** Primary data and headers utilize #f8fafc (Off-white) for maximum contrast against the dark background, while metadata and labels use #94a3b8 (Slate 400) to maintain visual hierarchy.

## Typography
The typography system balances modern geometric shapes with technical precision. 

- **Headlines:** Hanken Grotesk provides a sharp, contemporary feel for titles and dashboard headers.
- **Body:** Inter is used for all long-form text and UI controls due to its exceptional legibility in dark mode and high x-height.
- **Technical Labels:** JetBrains Mono is utilized for status tags, EMD markers, and numerical data to evoke a sense of precision and data-driven accuracy.
- **Scale:** On mobile, headline sizes scale down to prevent excessive wrapping, while body text remains consistent at 14px-16px for accessibility.

## Layout & Spacing
The design system employs a **Fixed Grid** philosophy for dashboard views to ensure predictable data alignment, switching to a fluid model for mobile content.

- **Grid:** A 12-column grid is standard for desktop (1440px max-width).
- **Rhythm:** An 8px linear scale governs all spacing (4, 8, 16, 24, 32, 48, 64).
- **Responsive Behavior:** 
    - **Desktop:** 32px external margins, 24px gutters.
    - **Tablet:** 24px external margins, 16px gutters.
    - **Mobile:** 16px external margins, 12px gutters. Side-by-side elements generally reflow to a vertical stack unless representing status/value pairs.

## Elevation & Depth
In this dark mode environment, depth is communicated through **Tonal Layers** rather than heavy shadows to avoid "muddy" interfaces.

- **Level 0 (Background):** #0f172a - The canvas.
- **Level 1 (Cards/Surfaces):** #1e293b - Main content containers. Use a 1px solid border of #334155 (Slate 700) to define edges.
- **Level 2 (Modals/Popovers):** #1e293b - Elevated via a subtle 10% white inner glow on the top edge and a deep, spread-out shadow (rgba(0,0,0, 0.4)).
- **Interactions:** Hover states on interactive rows should use a subtle background tint of #334155.

## Shapes
The shape language is **Soft (0.25rem)**, reflecting a professional and architectural tone. 

- **Standard Elements:** Buttons, input fields, and small cards use a 4px (0.25rem) radius.
- **Large Containers:** Dashboard widgets and main layout sections use 8px (0.5rem) for a more defined structure.
- **Status Tags:** Use a slightly higher radius (12px) to differentiate them from functional buttons.

## Components
- **Buttons:** Primary buttons are solid #3b82f6 with white text. Secondary buttons use a ghost style with a #334155 border and #f8fafc text.
- **Status Markers (EMD):** Utilize the emerald green (#10b981) for text and icons, paired with a 10% opacity background of the same color for high visibility without glare.
- **Input Fields:** Backgrounds are #0f172a (inset look) with a #334155 border. On focus, the border transitions to #3b82f6.
- **Data Tables:** Use horizontal dividers only (#1e293b). Header rows should have a slightly darker tint or a bolder font weight in JetBrains Mono.
- **Cards:** No outer shadows. Instead, use a subtle 1px border (#334155) to separate the #1e293b surface from the #0f172a background.
- **Chips/Badges:** Monospaced typography (JetBrains Mono) at 11px, capitalized, with high-contrast background tints.