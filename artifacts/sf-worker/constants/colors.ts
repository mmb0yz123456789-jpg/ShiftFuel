/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    // Legacy aliases
    text: "#1F1F1F",
    tint: "#0D3B3B",

    // Core surfaces
    background: "#F7F7F5",
    foreground: "#1F1F1F",

    // Cards / elevated surfaces
    card: "#FFFFFF",
    cardForeground: "#1F1F1F",

    // Primary action color — ShiftFuel teal
    primary: "#0D3B3B",
    primaryForeground: "#FFFFFF",
    primaryDark: "#062727",

    // Secondary / sage
    secondary: "#EAF2EA",
    secondaryForeground: "#0D3B3B",

    // Muted / subdued elements
    muted: "#EAF2EA",
    mutedForeground: "#5F6F6D",

    // Accent — ShiftFuel coral
    accent: "#FF6B5A",
    accentForeground: "#FFFFFF",
    accentDark: "#E85445",

    // Destructive actions
    destructive: "#B42318",
    destructiveForeground: "#FFFFFF",

    // Borders and input outlines
    border: "#D9E3DF",
    input: "#D9E3DF",

    // Extra brand tokens
    sage: "#A7BFA6",
    sageLight: "#EAF2EA",
    green: "#1F7A45",
    charcoal: "#1F1F1F",
    muted2: "#5F6F6D",
  },

  radius: 12,
};

export default colors;
