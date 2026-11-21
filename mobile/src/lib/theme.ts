// CareScout look for mobile. Pine is the site's brand colour (frontend/tailwind.config.js),
// the rest is tuned for small screens: a cool mist background and a mint "pulse" accent
export const colors = {
  pine: "#0F6B58", // buttons, active things
  pineDeep: "#093A31", // hero panel
  pineSoft: "#E3F1EC", // light fills behind icons / done steps
  pulse: "#5EE2B0", // the ECG line + live state
  ink: "#10231F", // main text
  mist: "#F1F5F3", // screen background
  line: "#DCE5E1", // borders and dividers
  white: "#FFFFFF",
  muted: "#5B6E68", // secondary text
  faint: "#93A39E", // timestamps, hints
  coral: "#D6404A", // errors / not accepting
  coralSoft: "#FDECEC",
  amber: "#E39B2D",
  sky: "#2C7FB8",
  skySoft: "#E8F2F9",
};

// font family names have to match the keys loaded in app/_layout.tsx
export const fonts = {
  display: "BricolageGrotesque_800ExtraBold",
  displayMid: "BricolageGrotesque_600SemiBold",
  body: "InstrumentSans_400Regular",
  bodyMedium: "InstrumentSans_500Medium",
  bodySemi: "InstrumentSans_600SemiBold",
  bodyBold: "InstrumentSans_700Bold",
  mono: "JetBrainsMono_500Medium",
};

export const radius = { sm: 10, md: 14, lg: 20, pill: 999 };

// soft card shadow, boxShadow works on iOS, Android (new arch) and web
export const cardShadow = { boxShadow: "0 1px 2px rgba(16, 35, 31, 0.06), 0 4px 14px rgba(16, 35, 31, 0.05)" };
