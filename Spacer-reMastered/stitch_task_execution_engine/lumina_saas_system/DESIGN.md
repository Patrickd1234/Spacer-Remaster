---
name: Lumina SaaS System
colors:
  surface: '#101509'
  surface-dim: '#101509'
  surface-bright: '#363b2d'
  surface-container-lowest: '#0b1005'
  surface-container-low: '#191d11'
  surface-container: '#1d2115'
  surface-container-high: '#272c1e'
  surface-container-highest: '#323729'
  on-surface: '#e0e5d0'
  on-surface-variant: '#c2caae'
  inverse-surface: '#e0e5d0'
  inverse-on-surface: '#2d3224'
  outline: '#8c947b'
  outline-variant: '#424934'
  surface-tint: '#96da00'
  primary: '#ffffff'
  on-primary: '#223600'
  primary-container: '#aff82a'
  on-primary-container: '#4a6f00'
  inverse-primary: '#466800'
  secondary: '#c4c6d0'
  on-secondary: '#2d3038'
  secondary-container: '#464951'
  on-secondary-container: '#b6b8c1'
  tertiary: '#ffffff'
  on-tertiary: '#352d41'
  tertiary-container: '#eaddf8'
  on-tertiary-container: '#6a6077'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#aff82a'
  primary-fixed-dim: '#96da00'
  on-primary-fixed: '#121f00'
  on-primary-fixed-variant: '#344e00'
  secondary-fixed: '#e0e2ec'
  secondary-fixed-dim: '#c4c6d0'
  on-secondary-fixed: '#191c22'
  on-secondary-fixed-variant: '#44474e'
  tertiary-fixed: '#eaddf8'
  tertiary-fixed-dim: '#cec2dc'
  on-tertiary-fixed: '#1f182b'
  on-tertiary-fixed-variant: '#4b4358'
  background: '#101509'
  on-background: '#e0e5d0'
  surface-variant: '#323729'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '500'
    lineHeight: 28px
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
    lineHeight: 18px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  sidebar-width: 260px
  gutter: 20px
---

## Brand & Style

The brand personality is **technical, high-performance, and focused**. It targets power users in project management and software development who require high information density without cognitive overload. 

The design style is **Corporate Modern with a "Midnight" twist**. It utilizes deep charcoal surfaces to reduce eye strain, paired with a singular neon accent to guide the eye toward primary actions. The aesthetic is clean and systematic, emphasizing logical grouping and data hierarchy over decorative elements. It evokes a sense of "Mission Control"—authoritative, real-time, and precise.

## Colors

The palette is anchored by **Deep Charcoal (#0F1115)** as the base canvas. Secondary surfaces use slightly lighter grays to create "containers" that distinguish the sidebar, header, and workspace cards. 

The **Neon Green (#B6FF33)** serves as the "Action Signal." It is reserved for high-priority interactions: the 'Home' active state, 'New Task' buttons, and completion indicators. 

**Semantic Status Colors:**
- **Urgent:** Vivid Red for immediate attention.
- **In Review:** Warm Amber for pending states.
- **In Progress:** Electric Blue for active work.
- **Done:** Emerald Green for successful completion.

Neutral grays are used for borders (#2D3139) and secondary text (#9499A1) to maintain a refined, low-contrast background environment that lets content shine.

## Typography

The design system uses **Inter** exclusively to ensure maximum legibility and a neutral, professional tone. 

**Hierarchy Strategy:**
- **Headlines:** Use semi-bold weights with slight negative letter-spacing to appear compact and authoritative.
- **Body:** Standardized at 14px for most dashboard content to balance density and readability.
- **Labels:** Utilized for metadata like "Urgent," "Assignee," or "Project Group." Often paired with all-caps and increased tracking for distinctiveness at small scales.
- **Mono-weights:** Use Inter's tabular figures for data viz and progress percentages to prevent layout shifting during real-time updates.

## Layout & Spacing

The system employs a **Fluid-Fixed Hybrid Grid**. 
- **The Navigation Sidebar** is a fixed 260px width to ensure tools are always accessible.
- **The Main Content Area** is fluid, using a 12-column system for large displays and a single-column reflow for mobile.

**Spacing Rhythm:**
A strict 4px base unit is used. 16px (md) is the standard padding for cards and containers. 24px (lg) is used for major section margins. Information density is kept high by using 8px (sm) gutters between related metadata elements (e.g., an avatar and its presence indicator).

## Elevation & Depth

In this dark-mode system, depth is conveyed through **Tonal Layering** rather than heavy shadows. 

1.  **Level 0 (Background):** #0F1115 - The deepest layer, used for the main application backdrop.
2.  **Level 1 (Sidebar/Header):** Slightly lighter or matching the background with a #2D3139 right/bottom border.
3.  **Level 2 (Cards/Containers):** #1C1F26 - Used for Kanban cards and chat bubbles. This creates a subtle "lift."
4.  **Level 3 (Popovers/Modals):** #252932 - Combined with a subtle 1px stroke (#3E4450) and a soft, diffused ambient shadow (Black, 40% opacity, 20px blur) to indicate the highest point of interaction.

Interactive states (hover) use a subtle lightening of the surface hex or a thin #B6FF33 left-border accent for list items.

## Shapes

The design system utilizes **Rounded (0.5rem)** geometry.
- **Cards & Input Fields:** 8px (0.5rem) corner radius to feel modern but structured.
- **Avatars:** 100% (Circular) to clearly distinguish human elements from functional UI components.
- **Buttons:** 8px for standard actions; Pill-shaped (100px) specifically for "Status Labels" or "Chips" to provide visual variety.
- **Progress Bars:** Fully rounded (Pill) ends to emphasize a fluid "loading" metaphor.

## Components

### Navigation & Workspace
- **Sidebar:** Nested lists for project groups. Active states use the neon green as a vertical bar or a subtle background tint.
- **Workspace Switcher:** A prominent dropdown at the top of the sidebar with a clear chevron icon.

### Data Visualization
- **Kanban Cards:** Contain a project tag, task name, truncated description, and a progress bar. 
- **Progress Bars:** Background track is #2D3139; the active fill is #B6FF33 or the relevant semantic status color.
- **Sparklines:** Minimalist stroke graphs without axes, used for quick activity summaries.

### Messaging
- **Chat Bubbles:** Incoming messages are #1C1F26; outgoing messages use a dark navy or a primary-tinted gray.
- **Presence Indicators:** 8px circles at the bottom right of avatars. Green = Active, Gray = Offline, Red = DND.

### Forms & Inputs
- **Inputs:** Dark backgrounds with a 1px border (#2D3139). On focus, the border transitions to #B6FF33.
- **Buttons:**
    - **Primary:** Neon Green background with dark text.
    - **Secondary/Outline:** Transparent background with a light gray border.
    - **Ghost:** No border/background until hover.

### Members & Roles
- **Circular Avatars:** Stacked in a "pile" for task assignees (max 3 displayed + "X more").
- **Admin Badges:** Small text labels using the `label-sm` style with a subtle border to indicate user rights.