export interface ThemeAmbient {
  /** Primary light pool — the room's main light (graphite glow / theme tone). */
  pool: string;
  /** Secondary register pool — the theme's colour voice, right of center. */
  poolAlt: string;
  /** Deep mass #1 — the second, deeper register of the room. */
  deep: string;
  /** Deep mass #2 — companion of deep, slightly offset hue. */
  deepAlt: string;
  /** Luminous haze — the "air" bloom behind the content column + top light. */
  haze: string;
  /** Ink mixed over --mq-bg at the TOP of the floor gradient. */
  inkTop: string;
  /** Ink mixed over --mq-bg at the BOTTOM of the floor gradient. */
  inkFloor: string;
  /** Floor glow pool color (bottom of the room). */
  floor: string;
  /** Glass tint — the Liquid Glass hue for floating surfaces. */
  glass: string;
  /** Platinum reflection tint — subtly shifts the platinum family hue. */
  platinum: string;
  /** Full vignette color WITH alpha (outer edge of the room). */
  vignette: string;
  /** Grain opacity (0..0.05). */
  grain: number;
  /** WAVE dark base — the near-black tinted floor behind the liquid scene. */
  waveBase: string;
  /** WAVE anchor hue (deg 0..360) — used when artwork is achromatic. */
  waveHue: number;
}

export interface ThemeConfig {
  id: string;
  name: string;
  background: string;
  card: string;
  cardHover: string;
  accent: string;
  text: string;
  textMuted: string;
  border: string;
  inputBg: string;
  playerBg: string;
  navBg: string;
  gradient: string;
  glowColor: string;
  className?: string;
  /**
   * THEME-AWARE ENVIRONMENT (FINAL DESIGN COMPLETION §0):
   * a theme is not an accent swap — it is an ATMOSPHERE. The ambient
   * spec drives the normal background (light pools, deep masses, haze,
   * vignette, grain), the glass tint, the platinum reflection and the
   * WAVE base. Must stay CALM (strengths are fixed in CSS) — identity
   * through hue, never through loudness.
   */
  ambient: ThemeAmbient;
}

/* ── Ambient helpers ──────────────────────────────────────────────────
   Every ambient uses the SAME layer geometry (globals.css); only the
   COLORS change. Strengths stay global so no theme can turn neon. */
const amb = (
  pool: string, poolAlt: string, deep: string, deepAlt: string,
  haze: string, inkTop: string, inkFloor: string, floor: string,
  glass: string, platinum: string, waveHue: number, waveBase: string,
  grain = 0.035, vignette = "rgba(0, 0, 0, 0.32)",
): ThemeAmbient => ({
  pool, poolAlt, deep, deepAlt, haze, inkTop, inkFloor, floor,
  glass, platinum, vignette, grain, waveBase, waveHue,
});

export const themes: Record<string, ThemeConfig> = {
  default: {
    id: "default",
    name: "Obsidian",
    background: "#0e0e0e",
    card: "#1a1a1a",
    cardHover: "#252525",
    accent: "#e03131",
    text: "#f5f5f5",
    textMuted: "#b8b8b8",
    border: "#333333",
    inputBg: "#1a1a1a",
    playerBg: "#151515",
    navBg: "#0e0e0eee",
    gradient: "radial-gradient(ellipse at 20% 50%, rgba(224,49,49,0.08) 0%, transparent 50%)",
    glowColor: "rgba(224,49,49,0.3)",
    // graphite + cold navy — the reference editorial room
    ambient: amb("#9aa3b2", "#44598a", "#2c3a67", "#37416b", "#b9c4dd",
      "#10141f", "#0c1018", "#6d7686", "#e2e8f0", "#8fa3c8", 226, "#05070d"),
  },
  ocean: {
    id: "ocean",
    name: "Abyss",
    background: "#0a1628",
    card: "#0f2035",
    cardHover: "#153050",
    accent: "#0ea5e9",
    text: "#e0f2fe",
    textMuted: "#9ec5e8",
    border: "#1e3a5f",
    inputBg: "#0f2035",
    playerBg: "#0b1929",
    navBg: "#0a1628ee",
    gradient: "radial-gradient(ellipse at 20% 50%, rgba(14,165,233,0.1) 0%, transparent 50%)",
    glowColor: "rgba(14,165,233,0.3)",
    // deep blue + cyan haze
    ambient: amb("#7fa8c9", "#2b6a9e", "#16406b", "#123257", "#a8d4e8",
      "#0a1626", "#081220", "#3f6e96", "#cfe4f2", "#9cc4de", 210, "#040a14"),
  },
  neon: {
    id: "neon",
    name: "Magenta",
    background: "#0a0a0a",
    card: "#141414",
    cardHover: "#1e1e1e",
    accent: "#f43f5e",
    text: "#fce7f3",
    textMuted: "#cc8899",
    border: "#2a1a2a",
    inputBg: "#141414",
    playerBg: "#0d0d0d",
    navBg: "#0a0a0aee",
    gradient: "radial-gradient(ellipse at 20% 50%, rgba(244,63,94,0.08) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(168,85,247,0.06) 0%, transparent 40%)",
    glowColor: "rgba(244,63,94,0.35)",
    // graphite + muted magenta/rose atmosphere
    ambient: amb("#a894ae", "#8a3a5c", "#47224a", "#3a1d40", "#d8b8d2",
      "#171320", "#120e18", "#6d5f74", "#ecd8e8", "#c894b4", 330, "#0d0510"),
  },
  sunset: {
    id: "sunset",
    name: "Ember",
    background: "#1a100a",
    card: "#261a10",
    cardHover: "#332218",
    accent: "#f97316",
    text: "#fef3c7",
    textMuted: "#cc9966",
    border: "#3d2a15",
    inputBg: "#261a10",
    playerBg: "#1e1409",
    navBg: "#1a100aee",
    gradient: "radial-gradient(ellipse at 20% 50%, rgba(249,115,22,0.1) 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(234,88,12,0.06) 0%, transparent 40%)",
    glowColor: "rgba(249,115,22,0.35)",
    // graphite + muted burgundy/amber
    ambient: amb("#b39a86", "#96502e", "#4a2a1c", "#3d241a", "#e0c4a4",
      "#1c1410", "#16100c", "#7a6250", "#f0dcc4", "#d4a884", 25, "#0e0806"),
  },
  aurora: {
    id: "aurora",
    name: "Borealis",
    background: "#0a0f14",
    card: "#101a22",
    cardHover: "#162530",
    accent: "#34d399",
    text: "#d1fae5",
    textMuted: "#7abba0",
    border: "#1a3028",
    inputBg: "#101a22",
    playerBg: "#0c1519",
    navBg: "#0a0f14ee",
    gradient: "radial-gradient(ellipse at 20% 50%, rgba(52,211,153,0.08) 0%, transparent 50%), radial-gradient(ellipse at 70% 30%, rgba(56,189,248,0.05) 0%, transparent 40%)",
    glowColor: "rgba(52,211,153,0.3)",
    // dark emerald + teal atmosphere
    ambient: amb("#8fb8a8", "#2d6e5e", "#16443c", "#123a35", "#b8e0d0",
      "#0a1614", "#081210", "#43705f", "#d0ece0", "#9ccab8", 160, "#040c0a"),
  },
  cyberpunk: {
    id: "cyberpunk",
    name: "Neon City",
    background: "#0d0015",
    card: "#1a0025",
    cardHover: "#260035",
    accent: "#ff2a6d",
    text: "#f0e6ff",
    textMuted: "#b899cc",
    border: "#3a1050",
    inputBg: "#1a0025",
    playerBg: "#0a0010",
    navBg: "#0d0015ee",
    gradient: "radial-gradient(ellipse at 20% 50%, rgba(255,42,109,0.1) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(5,217,232,0.06) 0%, transparent 40%)",
    glowColor: "rgba(255,42,109,0.35)",
    // deep violet + magenta whisper
    ambient: amb("#9a8ab8", "#7a2a6e", "#3a1466", "#2c1050", "#c0b0e8",
      "#120a1e", "#0d0716", "#5f5080", "#ddd0f0", "#b48fd8", 285, "#08040f"),
  },
  synthwave: {
    id: "synthwave",
    name: "Retro",
    background: "#120a20",
    card: "#1c1230",
    cardHover: "#261a40",
    accent: "#e040fb",
    text: "#f3e5f5",
    textMuted: "#aa8abf",
    border: "#352548",
    inputBg: "#1c1230",
    playerBg: "#0f0818",
    navBg: "#120a20ee",
    gradient: "radial-gradient(ellipse at 20% 50%, rgba(224,64,251,0.08) 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(255,110,64,0.05) 0%, transparent 40%)",
    glowColor: "rgba(224,64,251,0.3)",
    // deep indigo + violet atmosphere
    ambient: amb("#9a90c0", "#6a3a9e", "#32205e", "#2a1a4e", "#cdbaf0",
      "#120c20", "#0e0918", "#5c5085", "#ded2f4", "#b49ae0", 265, "#070512"),
  },
  midnight: {
    id: "midnight",
    name: "Eclipse",
    background: "#000000",
    card: "#0a0a0a",
    cardHover: "#141414",
    accent: "#ffffff",
    text: "#ffffff",
    textMuted: "#999999",
    border: "#1a1a1a",
    inputBg: "#0a0a0a",
    playerBg: "#050505",
    navBg: "#000000ee",
    gradient: "radial-gradient(ellipse at 20% 50%, rgba(255,255,255,0.03) 0%, transparent 50%)",
    glowColor: "rgba(255,255,255,0.15)",
    // pure graphite + silver — monochrome studio
    ambient: amb("#a8a8b0", "#565964", "#2a2c34", "#23252c", "#c8c8d2",
      "#101014", "#0c0c10", "#6a6a74", "#e4e4ea", "#b8b8c4", 220, "#050506",
      0.03, "rgba(0, 0, 0, 0.38)"),
  },
  black: {
    id: "black",
    name: "AMOLED",
    background: "#000000",
    card: "#080808",
    cardHover: "#111111",
    accent: "#e03131",
    text: "#e8e8e8",
    textMuted: "#8a8a8a",
    border: "#1a1a1a",
    inputBg: "#080808",
    playerBg: "#030303",
    navBg: "#000000ee",
    gradient: "radial-gradient(ellipse at 20% 50%, rgba(224,49,49,0.06) 0%, transparent 50%)",
    glowColor: "rgba(224,49,49,0.2)",
    // near-black + the faintest red whisper
    ambient: amb("#8a8a90", "#3a2a2e", "#1c1216", "#160f12", "#a8a8b0",
      "#0a0a0c", "#060608", "#4a4a50", "#d8d8de", "#989098", 350, "#030304",
      0.03, "rgba(0, 0, 0, 0.4)"),
  },
  "liquid-glass": {
    id: "liquid-glass",
    name: "Liquid Glass",
    background: "#0a0f1a",
    card: "rgba(255,255,255,0.06)",
    cardHover: "rgba(255,255,255,0.1)",
    accent: "#3b82f6",
    text: "#e0e8f0",
    textMuted: "#99bbdd",
    border: "rgba(255,255,255,0.1)",
    inputBg: "rgba(255,255,255,0.05)",
    playerBg: "rgba(10,15,26,0.85)",
    navBg: "rgba(10,15,26,0.9)",
    gradient: "radial-gradient(ellipse at 20% 50%, rgba(59,130,246,0.12) 0%, transparent 50%), radial-gradient(ellipse at 80% 30%, rgba(168,85,247,0.08) 0%, transparent 40%)",
    glowColor: "rgba(59,130,246,0.3)",
    // deep blue + blue/violet haze
    ambient: amb("#90b0d8", "#3a5a9e", "#1e3a6e", "#182e58", "#c0d8f0",
      "#0c1424", "#0a101c", "#4a6a9a", "#d8e8f8", "#a4c0e0", 220, "#050a16"),
  },
  sakura: {
    id: "sakura",
    name: "Sakura",
    background: "#1a1015",
    card: "#251a20",
    cardHover: "#302228",
    accent: "#f472b6",
    text: "#fce7f3",
    textMuted: "#cc9aaa",
    border: "#3d2a32",
    inputBg: "#251a20",
    playerBg: "#1e1318",
    navBg: "#1a1015ee",
    gradient: "radial-gradient(ellipse at 20% 50%, rgba(244,114,182,0.1) 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(251,113,133,0.06) 0%, transparent 40%)",
    glowColor: "rgba(244,114,182,0.35)",
    // warm graphite + rose
    ambient: amb("#b8a0ac", "#9e5068", "#4a2434", "#3e1e2c", "#e8c8d2",
      "#181016", "#120c10", "#7a6068", "#f0dce4", "#d8a4b4", 340, "#0c060a"),
  },
  frost: {
    id: "frost",
    name: "Frost",
    background: "#0c1520",
    card: "#121f30",
    cardHover: "#1a2a40",
    accent: "#38bdf8",
    text: "#e0f2fe",
    textMuted: "#8cb8d8",
    border: "#1e3450",
    inputBg: "#121f30",
    playerBg: "#0e1825",
    navBg: "#0c1520ee",
    gradient: "radial-gradient(ellipse at 20% 50%, rgba(56,189,248,0.1) 0%, transparent 50%), radial-gradient(ellipse at 80% 30%, rgba(165,180,252,0.06) 0%, transparent 40%)",
    glowColor: "rgba(56,189,248,0.3)",
    // steel blue + ice haze
    ambient: amb("#a0c0dc", "#4a7aa8", "#1e3f60", "#183450", "#d0e4f4",
      "#0c1622", "#0a121c", "#50748f", "#e0eef8", "#accbe0", 205, "#050b12"),
  },
  volcano: {
    id: "volcano",
    name: "Volcano",
    background: "#1a0a0a",
    card: "#251010",
    cardHover: "#301818",
    accent: "#ff4500",
    text: "#ffe4c4",
    textMuted: "#cc9980",
    border: "#3d2020",
    inputBg: "#251010",
    playerBg: "#1e0e0e",
    navBg: "#1a0a0aee",
    gradient: "radial-gradient(ellipse at 20% 50%, rgba(255,69,0,0.12) 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(255,140,0,0.06) 0%, transparent 40%)",
    glowColor: "rgba(255,69,0,0.35)",
    // dark maroon + ember
    ambient: amb("#b89080", "#8a3820", "#431812", "#361410", "#e0b8a0",
      "#170c0a", "#100806", "#6e4a3c", "#f0d8c8", "#d09470", 15, "#0b0403",
      0.035, "rgba(8, 2, 0, 0.34)"),
  },
  arctic: {
    id: "arctic",
    name: "Arctic",
    background: "#0a1520",
    card: "#101e2e",
    cardHover: "#162840",
    accent: "#88ccff",
    text: "#e8f4ff",
    textMuted: "#88b0cc",
    border: "#1a3050",
    inputBg: "#101e2e",
    playerBg: "#0c1825",
    navBg: "#0a1520ee",
    gradient: "radial-gradient(ellipse at 20% 50%, rgba(136,204,255,0.1) 0%, transparent 50%), radial-gradient(ellipse at 80% 30%, rgba(180,220,255,0.06) 0%, transparent 40%)",
    glowColor: "rgba(136,204,255,0.3)",
    // arctic blue + ice white air
    ambient: amb("#a8cce8", "#4a82b4", "#1c405e", "#16344e", "#d8ecfa",
      "#0a141f", "#081019", "#4a7494", "#e4f2fc", "#b0d4ec", 200, "#040a12"),
  },
  phantom: {
    id: "phantom",
    name: "Phantom",
    background: "#111111",
    card: "#1c1c1c",
    cardHover: "#262626",
    accent: "#a78bfa",
    text: "#e8e0f8",
    textMuted: "#aa99cc",
    border: "#2e2e2e",
    inputBg: "#1c1c1c",
    playerBg: "#161616",
    navBg: "#111111ee",
    gradient: "radial-gradient(ellipse at 20% 50%, rgba(167,139,250,0.1) 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(129,140,248,0.06) 0%, transparent 40%)",
    glowColor: "rgba(167,139,250,0.3)",
    // graphite + violet
    ambient: amb("#a294bc", "#5f4a99", "#2e2450", "#261e42", "#c8b8e4",
      "#100c1a", "#0c0914", "#5c5080", "#e0d8f0", "#b0a0d4", 260, "#060410"),
  },
  daylight: {
    id: "daylight",
    name: "Daylight",
    background: "#f8f9fa",
    card: "#ffffff",
    cardHover: "#f0f0f0",
    // P1 (theme audit): #e03131 on #f8f9fa = ~4.1:1 — below WCAG AA for the
    // 11px uppercase labels that use the accent in light mode. #c92a2a keeps
    // the red identity at ~5.3:1.
    accent: "#c92a2a",
    text: "#212529",
    textMuted: "#6c757d", // P1.4: was #868e96 (4.0:1 — below WCAG AA). Now 4.7:1.
    border: "#dee2e6",
    inputBg: "#ffffff",
    playerBg: "#ffffff",
    navBg: "rgba(248,249,250,0.95)",
    gradient: "radial-gradient(ellipse at 20% 50%, rgba(201,42,42,0.06) 0%, transparent 50%)",
    glowColor: "rgba(201,42,42,0.15)",
    // LIGHT room: silver daylight, soft blue-gray shadow pools, paper air
    ambient: amb("#dfe6f2", "#c4cee2", "#aeb9d0", "#b8c2d6", "#ffffff",
      "#ffffff", "#eceef4", "#c8d0de", "#ffffff", "#8fa3c8", 220, "#dfe3ec",
      0.022, "rgba(105, 112, 128, 0.14)"),
  },
  // ===== Seasonal Themes =====
  halloween: {
    id: "halloween",
    name: "Halloween",
    background: "#0d0a00",
    card: "#1a1508",
    cardHover: "#251e0d",
    accent: "#ff6600",
    text: "#fde68a",
    textMuted: "#ccaa44",
    border: "#3d2d00",
    inputBg: "#1a1508",
    playerBg: "#120f06",
    navBg: "#0d0a00ee",
    gradient: "radial-gradient(ellipse at 20% 50%, rgba(255,102,0,0.12) 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(180,83,9,0.08) 0%, transparent 40%)",
    glowColor: "rgba(255,102,0,0.35)",
    // dark umber + pumpkin ember
    ambient: amb("#b09a70", "#9e5810", "#40260a", "#341e08", "#dcc08c",
      "#171008", "#110b05", "#6e5a34", "#ecdcb4", "#cc9448", 30, "#0a0600",
      0.038, "rgba(6, 3, 0, 0.34)"),
  },
  newyear: {
    id: "newyear",
    name: "New Year",
    background: "#0a0510",
    card: "#150a20",
    cardHover: "#20102e",
    accent: "#fbbf24",
    text: "#fef3c7",
    textMuted: "#bbaa88",
    border: "#30253d",
    inputBg: "#150a20",
    playerBg: "#0f0818",
    navBg: "#0a0510ee",
    gradient: "radial-gradient(ellipse at 20% 50%, rgba(251,191,36,0.1) 0%, transparent 50%), radial-gradient(ellipse at 60% 30%, rgba(167,139,250,0.06) 0%, transparent 40%), radial-gradient(ellipse at 90% 80%, rgba(239,68,68,0.05) 0%, transparent 30%)",
    glowColor: "rgba(251,191,36,0.35)",
    // deep indigo night + gold candlelight
    ambient: amb("#a8a4c4", "#8a7434", "#2c2450", "#241e42", "#d0cce8",
      "#100c1c", "#0c0916", "#5c567e", "#e4e0f4", "#d4b464", 250, "#060410"),
  },
  valentine: {
    id: "valentine",
    name: "Valentine",
    background: "#150810",
    card: "#200d18",
    cardHover: "#2d1420",
    accent: "#f43f5e",
    text: "#fce7f3",
    textMuted: "#cc8899",
    border: "#3d1a2a",
    inputBg: "#200d18",
    playerBg: "#180a12",
    navBg: "#150810ee",
    gradient: "radial-gradient(ellipse at 20% 50%, rgba(244,63,94,0.12) 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(251,113,133,0.08) 0%, transparent 40%), radial-gradient(ellipse at 50% 20%, rgba(253,164,175,0.06) 0%, transparent 35%)",
    glowColor: "rgba(244,63,94,0.35)",
    // dark plum + rose
    ambient: amb("#bc98a8", "#9e3a54", "#47203a", "#3b1a30", "#ecc0d0",
      "#180e14", "#120a0e", "#7c5868", "#f4d8e0", "#dc9aac", 345, "#0c0508"),
  },
  spring: {
    id: "spring",
    name: "Spring",
    background: "#0a120a",
    card: "#101e10",
    cardHover: "#182a18",
    accent: "#4ade80",
    text: "#dcfce7",
    textMuted: "#88bb88",
    border: "#1a3520",
    inputBg: "#101e10",
    playerBg: "#0c150c",
    navBg: "#0a120aee",
    gradient: "radial-gradient(ellipse at 20% 50%, rgba(74,222,128,0.1) 0%, transparent 50%), radial-gradient(ellipse at 70% 30%, rgba(134,239,172,0.06) 0%, transparent 40%)",
    glowColor: "rgba(74,222,128,0.3)",
    // deep green + fresh air
    ambient: amb("#9cc494", "#3e8a4a", "#1c4a2e", "#164026", "#c8e8c0",
      "#0c140c", "#081008", "#4a7050", "#d8f0d0", "#a0cca0", 130, "#040a05"),
  },
  summer: {
    id: "summer",
    name: "Summer",
    background: "#151008",
    card: "#201a0d",
    cardHover: "#2d2412",
    accent: "#facc15",
    text: "#fef9c3",
    textMuted: "#bbaa66",
    border: "#3d3010",
    inputBg: "#201a0d",
    playerBg: "#181208",
    navBg: "#151008ee",
    gradient: "radial-gradient(ellipse at 20% 50%, rgba(250,204,21,0.12) 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(249,115,22,0.08) 0%, transparent 40%)",
    glowColor: "rgba(250,204,21,0.35)",
    // dark sand + warm gold
    ambient: amb("#c8b478", "#b07a20", "#4e3612", "#402c0e", "#f0dca4",
      "#181208", "#120d05", "#7c6838", "#f8ecc4", "#e0b45c", 45, "#0d0904"),
  },
  autumn: {
    id: "autumn",
    name: "Autumn",
    background: "#120a05",
    card: "#1e140a",
    cardHover: "#2a1c0f",
    accent: "#d97706",
    text: "#fef3c7",
    textMuted: "#bb9966",
    border: "#352510",
    inputBg: "#1e140a",
    playerBg: "#150e08",
    navBg: "#120a05ee",
    gradient: "radial-gradient(ellipse at 20% 50%, rgba(217,119,6,0.12) 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(180,83,9,0.08) 0%, transparent 40%)",
    glowColor: "rgba(217,119,6,0.35)",
    // dark umber + amber
    ambient: amb("#bc9a78", "#965418", "#452a10", "#38220c", "#e4c8a0",
      "#161008", "#100b06", "#74603f", "#f0dcbc", "#d0a060", 28, "#0a0603"),
  },
  stpatrick: {
    id: "stpatrick",
    name: "St. Patrick",
    background: "#050d05",
    card: "#0a1a0a",
    cardHover: "#122412",
    accent: "#22c55e",
    text: "#dcfce7",
    textMuted: "#77bb77",
    border: "#153015",
    inputBg: "#0a1a0a",
    playerBg: "#081208",
    navBg: "#050d05ee",
    gradient: "radial-gradient(ellipse at 20% 50%, rgba(34,197,94,0.12) 0%, transparent 50%), radial-gradient(ellipse at 80% 30%, rgba(74,222,128,0.06) 0%, transparent 40%)",
    glowColor: "rgba(34,197,94,0.35)",
    // deep emerald
    ambient: amb("#90c098", "#2a7a3e", "#14452a", "#103a22", "#b8e4c0",
      "#081208", "#060e06", "#3e6c4c", "#ccf0d4", "#84c898", 140, "#030a05"),
  },
  streaming: {
    id: "streaming",
    name: "Streaming",
    background: "#121212",
    card: "#1a1a2e",
    cardHover: "#252540",
    accent: "#e53e3e",
    text: "#ffffff",
    textMuted: "#a0aec0",
    border: "rgba(255,255,255,0.08)",
    inputBg: "#1a1a2e",
    playerBg: "#0d0d0d",
    navBg: "rgba(18,18,18,0.92)",
    gradient: "radial-gradient(ellipse at 20% 50%, rgba(229,62,62,0.08) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(128,90,213,0.06) 0%, transparent 40%)",
    glowColor: "rgba(229,62,62,0.3)",
    // graphite + red/violet media room
    ambient: amb("#a0a2b4", "#6e3a44", "#2c2438", "#241e30", "#c8c4dc",
      "#121018", "#0e0c12", "#5a5468", "#dcd8e8", "#a894c0", 255, "#07050c"),
  },
  easter: {
    id: "easter",
    name: "Easter",
    background: "#0f0a12",
    card: "#1a1220",
    cardHover: "#24192e",
    accent: "#c084fc",
    text: "#f3e8ff",
    textMuted: "#bb99cc",
    border: "#302040",
    inputBg: "#1a1220",
    playerBg: "#120e18",
    navBg: "#0f0a12ee",
    gradient: "radial-gradient(ellipse at 20% 50%, rgba(192,132,252,0.1) 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(232,121,249,0.06) 0%, transparent 40%), radial-gradient(ellipse at 50% 20%, rgba(251,191,36,0.04) 0%, transparent 30%)",
    glowColor: "rgba(192,132,252,0.3)",
    // dark violet + pastel air
    ambient: amb("#ac9cc8", "#7e5cc0", "#34245e", "#2a1e4e", "#d8ccf0",
      "#100a1c", "#0c0816", "#584c80", "#e4dcf4", "#b89ce0", 270, "#06040e"),
  },
  blood: {
    id: "blood",
    name: "Blood",
    background: "#080404",
    card: "#140a0a",
    cardHover: "#1e0f0f",
    accent: "#cc0000",
    text: "#f5e0e0",
    textMuted: "#b07070",
    border: "#2a0e0e",
    inputBg: "#140a0a",
    playerBg: "#0c0606",
    navBg: "#080404ee",
    gradient: "radial-gradient(ellipse at 20% 50%, rgba(204,0,0,0.12) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(139,0,0,0.08) 0%, transparent 40%), radial-gradient(ellipse at 50% 80%, rgba(180,0,0,0.05) 0%, transparent 35%)",
    glowColor: "rgba(204,0,0,0.4)",
    // near-black + crimson breath
    ambient: amb("#a8888c", "#7e1a22", "#38080e", "#2c060a", "#d0a8ac",
      "#140608", "#0e0406", "#603a3e", "#e8ccce", "#c05860", 355, "#070203",
      0.037, "rgba(10, 0, 0, 0.38)"),
  },
};

// Seasonal theme metadata for feature flags
export const seasonalThemes = [
  { key: "halloween", name: "Halloween", theme: "halloween", description: "Тыквенно-оранжевая тема с тёмным фоном", months: [10], icon: "🎃" },
  { key: "newyear", name: "New Year / Christmas", theme: "newyear", description: "Новогодняя тема с золотым и красным акцентом", months: [12, 1], icon: "🎄" },
  { key: "valentine", name: "Valentine", theme: "valentine", description: "Розовая тема ко Дню святого Валентина", months: [2], icon: "💝" },
  { key: "spring", name: "Spring", theme: "spring", description: "Зелёная весенняя тема", months: [3, 4, 5], icon: "🌸" },
  { key: "summer", name: "Summer", theme: "summer", description: "Яркая летняя тема с жёлтым акцентом", months: [6, 7, 8], icon: "☀️" },
  { key: "autumn", name: "Autumn", theme: "autumn", description: "Осенняя тёплая тема с оранжевым акцентом", months: [9, 10, 11], icon: "🍂" },
  { key: "stpatrick", name: "St. Patrick", theme: "stpatrick", description: "Изумрудная тема ко Дню святого Патрика", months: [3], icon: "🍀" },
  { key: "easter", name: "Easter", theme: "easter", description: "Пастельная фиолетово-золотая тема к Пасхе", months: [3, 4], icon: "🐣" },
];

export function applyThemeToDOM(theme: ThemeConfig, customAccent?: string) {
  const root = document.documentElement;
  const accent = customAccent || theme.accent;

  root.style.setProperty("--mq-bg", theme.background);
  root.style.setProperty("--mq-card", theme.card);
  root.style.setProperty("--mq-card-hover", theme.cardHover);
  root.style.setProperty("--mq-accent", accent);
  root.style.setProperty("--mq-text", theme.text);
  root.style.setProperty("--mq-text-muted", theme.textMuted);
  root.style.setProperty("--mq-border", theme.border);
  root.style.setProperty("--mq-input-bg", theme.inputBg);
  root.style.setProperty("--mq-player-bg", theme.playerBg);
  root.style.setProperty("--mq-nav-bg", theme.navBg);
  root.style.setProperty("--mq-gradient", theme.gradient);
  root.style.setProperty("--mq-glow", theme.glowColor);

  /* ── THEME-AWARE ENVIRONMENT (§0): the atmosphere layer ──
     Registered @property colors (globals.css) so the whole room
     cross-fades as one material system during a theme switch. */
  const a = theme.ambient;
  root.style.setProperty("--mq-amb-pool", a.pool);
  root.style.setProperty("--mq-amb-pool-alt", a.poolAlt);
  root.style.setProperty("--mq-amb-deep", a.deep);
  root.style.setProperty("--mq-amb-deep-alt", a.deepAlt);
  root.style.setProperty("--mq-amb-haze", a.haze);
  root.style.setProperty("--mq-amb-ink-top", a.inkTop);
  root.style.setProperty("--mq-amb-ink-floor", a.inkFloor);
  root.style.setProperty("--mq-amb-floor", a.floor);
  root.style.setProperty("--mq-amb-glass", a.glass);
  root.style.setProperty("--mq-amb-platinum", a.platinum);
  root.style.setProperty("--mq-amb-vignette", a.vignette);
  root.style.setProperty("--mq-amb-grain", String(a.grain));
  root.style.setProperty("--mq-wave-base", a.waveBase);
  root.style.setProperty("--mq-wave-anchor-h", String(a.waveHue));

  // P1.2: Set --mq-accent-rgb so rgba(var(--mq-accent-rgb), α) works
  // Previously this was never set — the static "224,49,49" from
  // design-tokens.css always won, making alpha-blended accents red
  // regardless of the active theme.
  const rgb = hexToRgb(accent);
  if (rgb) {
    root.style.setProperty("--mq-accent-rgb", `${rgb.r}, ${rgb.g}, ${rgb.b}`);
  }

  // Remove all theme classes
  const allThemeClasses = ["ocean-theme", "neon-theme", "sunset-theme", "aurora-theme", "cyberpunk-theme", "synthwave-theme", "midnight-theme", "black-theme", "liquid-glass-theme", "sakura-theme", "frost-theme", "volcano-theme", "arctic-theme", "phantom-theme", "daylight-theme", "halloween-theme", "newyear-theme", "valentine-theme", "spring-theme", "summer-theme", "autumn-theme", "stpatrick-theme", "easter-theme", "streaming-theme", "blood-theme"];
  allThemeClasses.forEach(c => root.classList.remove(c));
  if (theme.className) {
    root.classList.add(theme.className);
  }

  // ── Theme-switch choreography ──
  // Smooth color transition on large surfaces ONLY, applied transiently
  // (the previous always-on blanket rule overrode every component's own
  // transition timing). First application (initial load) skips the
  // animation — no flash of intermediate colors on boot.
  // FINAL DESIGN COMPLETION §1: the choreography window now covers the
  // full 850ms registered-property cross-fade (was 450ms) so background,
  // cards, glass tint and accent arrive as ONE material system.
  if (!root.dataset.mqThemeApplied) {
    root.dataset.mqThemeApplied = "1";
  } else {
    root.classList.add("mq-theme-switch");
    window.setTimeout(() => root.classList.remove("mq-theme-switch"), 1000);
  }
}

/** Convert a hex color (#rrggbb or #rgb) to {r, g, b}. Returns null on invalid input. */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const cleaned = hex.replace("#", "").trim();
  if (cleaned.length === 3) {
    const r = parseInt(cleaned[0] + cleaned[0], 16);
    const g = parseInt(cleaned[1] + cleaned[1], 16);
    const b = parseInt(cleaned[2] + cleaned[2], 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return { r, g, b };
  }
  if (cleaned.length === 6) {
    const r = parseInt(cleaned.slice(0, 2), 16);
    const g = parseInt(cleaned.slice(2, 4), 16);
    const b = parseInt(cleaned.slice(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return { r, g, b };
  }
  return null;
}
