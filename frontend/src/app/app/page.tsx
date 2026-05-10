"use client";
import "./solver.css";
import { useState, useEffect, useRef, useCallback } from "react";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";

/* ── SVG icon components ─────────────────────────────────────────────────── */
const SunIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);
const MoonIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/>
  </svg>
);
const PlayIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5,3 19,12 5,21"/>
  </svg>
);
const StopIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <rect x="3" y="3" width="18" height="18"/>
  </svg>
);
const DiceIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="3"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/>
    <circle cx="16" cy="8" r="1.5" fill="currentColor"/><circle cx="8" cy="16" r="1.5" fill="currentColor"/>
    <circle cx="16" cy="16" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>
  </svg>
);
const ClockIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/>
  </svg>
);
const PinIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
  </svg>
);
const LinkIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
);
const DownloadIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);
const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);
const GithubIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.17c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.33-1.76-1.33-1.76-1.09-.74.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.8 1.3 3.49 1 .11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.31-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.66 1.66.24 2.87.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12 12 0 0 0 12 0z"/>
  </svg>
);
const BrushIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/>
    <path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1 1 2.48 1.02 3.5 1.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-2.5-3.02z"/>
  </svg>
);
const TypeIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4,7 4,4 20,4 20,7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>
  </svg>
);
const TrophyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="8,21 12,17 16,21"/><line x1="12" y1="17" x2="12" y2="11"/>
    <path d="M7 4H17l-1 7a5 5 0 0 1-8 0L7 4z"/>
    <path d="M17 4h2a2 2 0 0 1 2 2v1a5 5 0 0 1-5 4.9"/><path d="M7 4H5a2 2 0 0 0-2 2v1a5 5 0 0 0 5 4.9"/>
  </svg>
);
const LightbulbIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="22" x2="14" y2="22"/>
    <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/>
  </svg>
);
const CheckIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20,6 9,17 4,12"/>
  </svg>
);
const TrashIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/>
    <path d="M9 6V4h6v2"/>
  </svg>
);
const ResetIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1,4 1,10 7,10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/>
  </svg>
);
const CoffeeIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
    <line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>
  </svg>
);

/* ── Types ─────────────────────────────────────────────────────────────── */
interface Solution { n: string; x: string; y: string; }
interface HistoryItem {
  id: string; equation: string; nMin: string; nMax: string; nDenom: string;
  xMode: string; xMin: string; xMax: string; pinned: boolean;
  solCount: number; timestamp: number; mode: string;
  xScaleFactor?: string; xCenterExpr?: string; xHalfWidth?: string;
  xDivisorPoly?: string; xDivisorMax?: string;
  xStartExpr?: string; xEndExpr?: string; xStepExpr?: string;
  genEq?: string; genXMin?: string; genXMax?: string; genYMin?: string; genYMax?: string;
  skipZeroN?: boolean; skipZeroX?: boolean;
}

/* ── Constants ──────────────────────────────────────────────────────────── */
const HISTORY_KEY = "ecs-search-history";
const MAX_HISTORY = 50;
const BMC_KEY     = "ecs-bmc-hidden-until";

const MATH_FACTS = [
  "The Birch and Swinnerton-Dyer conjecture, one of the Millennium Prize Problems, predicts that the rank of an elliptic curve equals the order of vanishing of its L-function at s=1.",
  "Andrew Wiles proved Fermat's Last Theorem in 1995 by proving the modularity theorem for semistable elliptic curves.",
  "Every elliptic curve over ℚ has a finitely generated abelian group of rational points (Mordell's theorem, 1922).",
  "The congruent number problem asks which positive integers are areas of right triangles with rational sides — it is equivalent to asking when y²=x³−n²x has a rational point with y≠0.",
  "The j-invariant classifies elliptic curves up to isomorphism over an algebraically closed field.",
  "Hasse's theorem bounds the number of points on an elliptic curve over 𝔽ₚ: |#E(𝔽ₚ) − (p+1)| ≤ 2√p.",
  "The group law on an elliptic curve is given by the chord-tangent process, making it the only smooth projective curve with a group structure.",
  "Nagell-Lutz theorem: if (x,y) is a torsion point of an elliptic curve y²=x³+ax+b with integer a,b, then x,y are integers and either y=0 or y² divides 4a³+27b².",
  "The Taniyama-Shimura conjecture (now the modularity theorem) states every elliptic curve over ℚ is modular.",
  "Mazur's torsion theorem: the torsion subgroup of an elliptic curve over ℚ is isomorphic to ℤ/nℤ for n∈{1,…,10,12} or ℤ/2ℤ × ℤ/2nℤ for n∈{1,2,3,4}.",
  "NumPy evaluates millions of integers per second using SIMD CPU instructions — perfect-square detection over a vector is O(n) in practice.",
  "SymPy's symbolic engine converts your Python expression to a compiled NumPy lambda in a single call.",
  "Server-Sent Events (SSE) use a persistent HTTP connection to push data from server to browser without WebSockets.",
];

const EXAMPLES = [
  { name:"Congruent Number Curve", expr:"x**3 - n**2*x", nm:"-10", nx:"10", xm:"-100", xx:"100", nd:"1", desc:"y²=x³−n²x. Integer points exist iff n is a congruent number.", mode:"ec" },
  { name:"Weierstrass y²=x³+n", expr:"x**3 + n", nm:"-5", nx:"20", xm:"-50", xx:"50", nd:"1", desc:"Classic family. For n=1: Fermat's last theorem case.", mode:"ec" },
  { name:"y²=x³−x+n", expr:"x**3 - x + n", nm:"-8", nx:"8", xm:"-30", xx:"30", nd:"1", desc:"Varies the constant shift n across a fixed cubic.", mode:"ec" },
  { name:"Congruent (rational n)", expr:"x**3 - n**2*x", nm:"0", nx:"6", xm:"-200", xx:"200", nd:"6", desc:"Same curve but n runs over multiples of 1/6.", mode:"ec" },
  { name:"y²=x³+n²x+n", expr:"x**3 + n**2*x + n", nm:"-5", nx:"5", xm:"-50", xx:"50", nd:"1", desc:"Both linear and quadratic n-dependence.", mode:"ec" },
  { name:"y²=x³−n³", expr:"x**3 - n**3", nm:"-6", nx:"6", xm:"-80", xx:"80", nd:"1", desc:"Related to Fermat: asks when x³−n³ is a perfect square.", mode:"ec" },
  { name:"Hardy–Ramanujan 1729", expr:"x**3 - 1729*n**3", nm:"1", nx:"50", nd:"1", xMode:"window", xCenterExpr:"icbrt(1729*n**3)", xHalfWidth:"5000", desc:"1729=12³+1³=10³+9³. Smart Window mode.", mode:"ec" },
  { name:"Pythagorean triples", eq:"x**2 + y**2 = n**2", nm:"1", nx:"30", xm:"0", xx:"30", ym:"-100", yx:"100", desc:"All triples with legs ≤30.", mode:"gen" },
  { name:"Sum of two cubes", eq:"x**3 + y**3 = n", nm:"1", nx:"2000", xm:"-15", xx:"15", ym:"-100", yx:"100", desc:"Which n=sum of two integer cubes? Finds 1729.", mode:"gen" },
  { name:"y³−y=x⁴−2x−2", eq:"y**3 - y = x**4 - 2*x - 2", nm:"0", nx:"0", xm:"-100", xx:"100", ym:"-100", yx:"100", desc:"Degree 3 in y, degree 4 in x.", mode:"gen" },
];

const WP_THEMES = [
  { id:"elliptic",  label:"Elliptic Curves" },
  { id:"lattice",   label:"Integer Lattice" },
  { id:"roses",     label:"Polar Roses" },
  { id:"lissajous", label:"Lissajous" },
  { id:"spirals",   label:"Spirals" },
  { id:"none",      label:"None" },
];

const FONT_OPTIONS = [
  { id:"helvetica", label:"Helvetica Neue",  stack:'"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { id:"georgia",   label:"Georgia",         stack:'Georgia, "Times New Roman", serif' },
  { id:"courier",   label:"Courier New",     stack:'"Courier New", Courier, monospace' },
  { id:"trebuchet", label:"Trebuchet MS",    stack:'"Trebuchet MS", "Gill Sans", sans-serif' },
  { id:"palatino",  label:"Palatino",        stack:'Palatino, "Palatino Linotype", "Book Antiqua", serif' },
  { id:"menlo",     label:"Menlo / Consolas",stack:'Menlo, Consolas, "DejaVu Sans Mono", monospace' },
];

const FONT_SIZES = [
  { id:"xs",  label:"XS",  px:"12px" },
  { id:"sm",  label:"SM",  px:"13px" },
  { id:"md",  label:"MD",  px:"14px" },
  { id:"lg",  label:"LG",  px:"15px" },
  { id:"xl",  label:"XL",  px:"16px" },
  { id:"xxl", label:"XXL", px:"18px" },
];

/* ── Utility ─────────────────────────────────────────────────────────────── */
function escHtml(s: string) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
function fmtNum(v: number) {
  if (!Number.isFinite(v)) return "";
  const a = Math.abs(v);
  if (a >= 1e15) return v.toExponential(2);
  if (a >= 10000) return v.toExponential(1);
  if (a >= 100) return Math.round(v).toString();
  if (Number.isInteger(v)) return v.toString();
  return v.toFixed(1);
}
function computeHeight(x: string, y: string): string {
  try {
    const bx = BigInt(x.replace(/^-/, "").split("/")[0]);
    const by = BigInt(y.replace(/^-/, "").split("/")[0]);
    const m = bx > by ? bx : by;
    if (m <= 1n) return "0";
    let bits = 0; let v = m;
    while (v > 0n) { v >>= 1n; bits++; }
    return bits.toString();
  } catch { return ""; }
}

/* ══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════════════════ */
export default function SolverPage() {
  const { theme, toggle: toggleTheme } = useTheme();
  const isDark = theme === "dark";

  /* ── Form state ──────────────────────────────────────────────────────── */
  const [solverMode, setSolverMode] = useState<"ec"|"gen">("ec");
  const [ecVarMode, setEcVarMode]   = useState<"2var"|"3var">("3var");
  const [genVarMode, setGenVarMode] = useState<"2var"|"3var">("3var");
  const [expr, setExpr]   = useState("x**3 - n**2*x");
  const [nMin, setNMin]   = useState("-10");
  const [nMax, setNMax]   = useState("10");
  const [nDenom, setNDenom] = useState("1");
  const [nSingle, setNSingle] = useState("1");
  const [xMode, setXMode] = useState("fixed");
  const [xMin, setXMin]   = useState("-1000");
  const [xMax, setXMax]   = useState("1000");
  const [xScaleFactor, setXScaleFactor]   = useState("15");
  const [xCenterExpr, setXCenterExpr]     = useState("12*n");
  const [xHalfWidth, setXHalfWidth]       = useState("5000");
  const [xDivisorPoly, setXDivisorPoly]   = useState("");
  const [xDivisorMax, setXDivisorMax]     = useState("1000000");
  const [xStartExpr, setXStartExpr]       = useState("-1000");
  const [xEndExpr, setXEndExpr]           = useState("1000");
  const [xStepExpr, setXStepExpr]         = useState("1");
  const [skipZeroN, setSkipZeroN] = useState(false);
  const [skipZeroX, setSkipZeroX] = useState(false);
  // Gen mode
  const [genEq, setGenEq]     = useState("y**3 - y = x**4 - 2*x - 2");
  const [genXMin, setGenXMin] = useState("-50");
  const [genXMax, setGenXMax] = useState("50");
  const [genYMin, setGenYMin] = useState("-1000");
  const [genYMax, setGenYMax] = useState("1000");
  // LaTeX
  const [latexPreview, setLatexPreview] = useState("");
  const [latexError, setLatexError]     = useState(false);
  const [latexPaste, setLatexPaste]     = useState("");
  const [latexStatus, setLatexStatus]   = useState("");
  const [latexStatusOk, setLatexStatusOk] = useState(false);

  /* ── Search state ─────────────────────────────────────────────────────── */
  const [isSearching, setIsSearching] = useState(false);
  const [progress, setProgress]       = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [statusMsg, setStatusMsg]     = useState("Enter a curve expression and click Run Search.");
  const [statusCls, setStatusCls]     = useState("status-idle");
  const [solutions, setSolutions]     = useState<Solution[]>([]);
  const [showTable, setShowTable]     = useState(false);
  const [showEmpty, setShowEmpty]     = useState(false);
  const [warning, setWarning]         = useState("");
  const [nSummary, setNSummary]       = useState<string[]>([]);
  const [nTested, setNTested]         = useState(0);
  const [pointFilter, setPointFilter] = useState<"all"|"integer"|"rational">("all");
  const [curveInfoRows, setCurveInfoRows] = useState<any[]>([]);

  /* ── Plot state ───────────────────────────────────────────────────────── */
  const [plotData, setPlotData]   = useState<any>(null);
  const [viewport, setViewport]   = useState<{xMin:number;xMax:number;yMin:number;yMax:number}|null>(null);
  const [showPlot, setShowPlot]   = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [plotN, setPlotN]         = useState("");
  const [plotCaption, setPlotCaption] = useState("");
  const [groupLawResult, setGroupLawResult] = useState("");
  const [glP, setGlP] = useState("O");
  const [glQ, setGlQ] = useState("O");

  /* ── UI state ─────────────────────────────────────────────────────────── */
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory]         = useState<HistoryItem[]>([]);
  const [wpTheme, setWpTheme]         = useState("elliptic");
  const [showWpPicker, setShowWpPicker] = useState(false);
  const [wpPickerPos, setWpPickerPos]   = useState({ top: 0, right: 0 });
  const [toast, setToast]             = useState("");
  const [showBmc, setShowBmc]         = useState(false);
  const [factIdx, setFactIdx]         = useState(0);

  /* ── Font picker state ────────────────────────────────────────────────── */
  const [fontId, setFontId]           = useState("helvetica");
  const [fontSizeId, setFontSizeId]   = useState("md");
  const [showFontPicker, setShowFontPicker] = useState(false);
  const [fontPickerPos, setFontPickerPos]   = useState({ top: 0, right: 0 });

  /* ── Refs ─────────────────────────────────────────────────────────────── */
  const evtSourceRef  = useRef<EventSource|null>(null);
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const bgCanvasRef   = useRef<HTMLCanvasElement>(null);
  const allSolsRef    = useRef<Solution[]>([]);
  const nTotalRef     = useRef(0);
  const searchMetaRef = useRef<any>({});
  const rafRef        = useRef<number>(0);
  const canvasEventsRef = useRef(false);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout>|null>(null);
  const plotSolsRef   = useRef<{x:string;y:string}[]>([]);
  const viewportRef   = useRef<{xMin:number;xMax:number;yMin:number;yMax:number}|null>(null);
  const plotDataRef   = useRef<any>(null);
  const showLabelsRef = useRef(true);
  const filterRef     = useRef<"all"|"integer"|"rational">("all");

  /* ── Apply font preference to entire page ────────────────────────────── */
  useEffect(() => {
    const font = FONT_OPTIONS.find(f => f.id === fontId);
    const size = FONT_SIZES.find(s => s.id === fontSizeId);
    const html = document.documentElement;
    // rem units are relative to <html> font-size — must set here, not body
    if (size) html.style.fontSize = size.px;
    // Every element uses var(--font-mono) or var(--font-sans) explicitly,
    // so override both CSS variables so they all pick up the chosen font
    if (font) {
      html.style.setProperty("--font-mono", font.stack);
      html.style.setProperty("--font-sans", font.stack);
    }
    return () => {
      html.style.fontSize = "";
      html.style.removeProperty("--font-mono");
      html.style.removeProperty("--font-sans");
    };
  }, [fontId, fontSizeId]);
  useEffect(() => { viewportRef.current = viewport; }, [viewport]);
  useEffect(() => { plotDataRef.current = plotData; }, [plotData]);
  useEffect(() => { showLabelsRef.current = showLabels; }, [showLabels]);
  useEffect(() => { filterRef.current = pointFilter; }, [pointFilter]);

  /* ── Load persisted data on mount ────────────────────────────────────── */
  useEffect(() => {
    try { setHistory(JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]")); } catch {}
    const wp = localStorage.getItem("wpTheme") || "elliptic";
    setWpTheme(wp);
    const fid = localStorage.getItem("ecs-font") || "helvetica";
    const fsid = localStorage.getItem("ecs-font-size") || "md";
    setFontId(fid); setFontSizeId(fsid);
    const hideUntil = parseInt(localStorage.getItem(BMC_KEY) || "0", 10);
    setShowBmc(Date.now() > hideUntil);
    const p = new URLSearchParams(window.location.search);
    if (p.get("expr")) {
      setExpr(p.get("expr")!);
      if (p.get("n_min")) setNMin(p.get("n_min")!);
      if (p.get("n_max")) setNMax(p.get("n_max")!);
      if (p.get("n_denom")) setNDenom(p.get("n_denom")!);
    }
  }, []);

  /* ── Math facts rotator ──────────────────────────────────────────────── */
  useEffect(() => {
    const id = setInterval(() => setFactIdx(i => (i + 1) % MATH_FACTS.length), 9000);
    return () => clearInterval(id);
  }, []);

  /* ── Wallpaper canvas animation ──────────────────────────────────────── */
  useEffect(() => {
    const canvas = bgCanvasRef.current;
    if (!canvas) return;
    if (wpTheme === "none") { const ctx = canvas.getContext("2d")!; ctx.clearRect(0, 0, canvas.width, canvas.height); cancelAnimationFrame(rafRef.current); return; }
    const ctx = canvas.getContext("2d")!;
    let W = 0, H = 0, t = 0;
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      canvas!.width  = W * dpr; canvas!.height = H * dpr;
      canvas!.style.width = W + "px"; canvas!.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);
    const dark = () => document.documentElement.getAttribute("data-theme") === "dark";

    const strands = Array.from({length:7}, (_, i) => ({
      a: [-1,-2.5,0,-3,1,-1.5,0.5][i],
      b: [1,2,-1,4,-2,0.5,1.5][i],
      ox: Math.random(), oy: 0.15 + Math.random()*0.7,
      dx: [0.018,-0.012,0.009,-0.016,0.011,-0.007,0.014][i]*(0.7+Math.random()*0.6),
      dy: [0.011,0.008,-0.014,0.006,0.013,-0.009,-0.010][i]*(0.7+Math.random()*0.6),
      scale: 0.22 + Math.random()*0.28,
    }));

    function drawElliptic() {
      const d = dark();
      ctx.clearRect(0, 0, W, H);
      const colors = d
        ? ["rgba(163,113,247,0.12)","rgba(88,166,255,0.09)","rgba(63,185,80,0.08)"]
        : ["rgba(130,80,223,0.10)","rgba(9,105,218,0.08)","rgba(26,127,55,0.07)"];
      strands.forEach((s, i) => {
        s.ox = (s.ox + s.dx / W + 1) % 1;
        s.oy = Math.max(0.1, Math.min(0.9, s.oy + s.dy / H));
        if (s.oy < 0.12 || s.oy > 0.88) s.dy *= -1;
        const cx = s.ox * W, cy = s.oy * H, sc = s.scale * Math.min(W, H);
        ctx.beginPath(); ctx.strokeStyle = colors[i % 3]; ctx.lineWidth = 1.5;
        for (let xi = -sc; xi <= sc; xi += sc / 120) {
          const rhs = xi*xi*xi + s.a*xi + s.b;
          if (rhs >= 0) {
            const y = Math.sqrt(rhs);
            ctx.moveTo(cx + xi, cy - y * sc / 2);
            ctx.lineTo(cx + xi, cy + y * sc / 2);
          }
        }
        ctx.stroke();
      });
    }

    function drawLattice() {
      const d = dark();
      ctx.clearRect(0, 0, W, H);
      const sp = 48; const off = t * 0.3 % sp;
      ctx.strokeStyle = d ? "rgba(88,166,255,0.07)" : "rgba(9,105,218,0.06)";
      ctx.lineWidth = 0.8;
      for (let x = -off; x < W + sp; x += sp) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = -off; y < H + sp; y += sp) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      ctx.fillStyle = d ? "rgba(163,113,247,0.15)" : "rgba(130,80,223,0.12)";
      for (let x = -off; x < W + sp; x += sp)
        for (let y2 = -off; y2 < H + sp; y2 += sp) {
          ctx.beginPath(); ctx.arc(x, y2, 2, 0, Math.PI*2); ctx.fill();
        }
    }

    function drawRoses() {
      const d = dark();
      ctx.clearRect(0, 0, W, H);
      const pts: [number,number,number,number][] = [[W*0.25,H*0.4,5,0.6],[W*0.7,H*0.6,3,0.8],[W*0.5,H*0.25,7,0.4]];
      pts.forEach(([cx,cy,k,sc]) => {
        ctx.beginPath(); ctx.strokeStyle = d ? "rgba(163,113,247,0.12)" : "rgba(130,80,223,0.10)"; ctx.lineWidth = 1.2;
        for (let th = 0; th < Math.PI * 2; th += 0.01) {
          const r = (sc * Math.min(W,H) * 0.22) * Math.cos(k * (th + t * 0.005));
          const x = cx + r * Math.cos(th), y = cy + r * Math.sin(th);
          th === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      });
    }

    function drawLissajous() {
      const d = dark();
      ctx.clearRect(0, 0, W, H);
      const segs: [number,number,number][] = [[3,2,0],[5,4,1],[4,3,2]];
      segs.forEach(([a,b,phi]) => {
        ctx.beginPath(); ctx.strokeStyle = d ? `rgba(88,166,255,0.11)` : `rgba(9,105,218,0.09)`; ctx.lineWidth = 1.2;
        const R = Math.min(W,H) * 0.28;
        for (let i = 0; i <= 1000; i++) {
          const th = (i / 1000) * Math.PI * 2;
          const x = W/2 + R * Math.sin(a * th + t*0.003 + phi);
          const y = H/2 + R * Math.sin(b * th);
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      });
    }

    function drawSpirals() {
      const d = dark();
      ctx.clearRect(0, 0, W, H);
      const centers: [number,number][] = [[W*0.3,H*0.5],[W*0.7,H*0.4]];
      centers.forEach(([cx,cy]) => {
        ctx.beginPath(); ctx.strokeStyle = d ? "rgba(63,185,80,0.10)" : "rgba(26,127,55,0.08)"; ctx.lineWidth = 1.2;
        for (let th = 0; th < 16 * Math.PI; th += 0.05) {
          const r = th * 5 + t * 0.08;
          const x = cx + r * Math.cos(th); const y = cy + r * Math.sin(th);
          th === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          if (r > Math.min(W,H) * 0.5) break;
        }
        ctx.stroke();
      });
    }

    const drawFns: Record<string, ()=>void> = {
      elliptic: drawElliptic, lattice: drawLattice,
      roses: drawRoses, lissajous: drawLissajous, spirals: drawSpirals,
    };

    function loop() {
      t++;
      (drawFns[wpTheme] || drawElliptic)();
      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener("resize", resize); };
  }, [wpTheme, theme]);

  /* ── LaTeX preview ────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!expr) return;
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => fetchLatexPreview(expr), 400);
    return () => { if (previewTimerRef.current) clearTimeout(previewTimerRef.current); };
  }, [expr]);

  async function fetchLatexPreview(e: string) {
    try {
      const r = await fetch("/api/latex", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({expr:e}) });
      const d = await r.json();
      if (d.ok) { setLatexPreview(d.latex); setLatexError(false); }
      else { setLatexPreview(d.error); setLatexError(true); }
    } catch { setLatexPreview("Preview unavailable"); setLatexError(false); }
  }

  async function convertLatex() {
    if (!latexPaste.trim()) { setLatexStatus("Paste a LaTeX expression first."); setLatexStatusOk(false); return; }
    setLatexStatus("Converting…"); setLatexStatusOk(false);
    try {
      const r = await fetch("/api/from_latex", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({latex: latexPaste, mode: solverMode}) });
      const d = await r.json();
      if (d.ok) {
        if (solverMode === "gen") setGenEq(d.eq || d.expr);
        else setExpr(d.expr);
        setLatexStatus("Loaded!"); setLatexStatusOk(true);
      } else { setLatexStatus("Error: " + d.error); setLatexStatusOk(false); }
    } catch { setLatexStatus("Request failed — is the server running?"); setLatexStatusOk(false); }
  }

  /* ── Build search URL ─────────────────────────────────────────────────── */
  function buildSearchURL(): string {
    const is2var = ecVarMode === "2var";
    const p = new URLSearchParams({
      expr: expr.trim(),
      n_min: is2var ? nSingle : nMin,
      n_max: is2var ? nSingle : nMax,
      n_denom: is2var ? "1" : nDenom,
    });
    if (xMode === "autoscale") p.set("x_scale", xScaleFactor);
    else if (xMode === "window") { p.set("x_center_expr", xCenterExpr); p.set("x_window", xHalfWidth); }
    else if (xMode === "divisor") { p.set("x_divisor_poly", xDivisorPoly); p.set("x_divisor_max", xDivisorMax); }
    else if (xMode === "exprrange") { p.set("x_start_expr", xStartExpr); p.set("x_end_expr", xEndExpr); p.set("x_step_expr", xStepExpr || "1"); }
    else { p.set("x_min", xMin); p.set("x_max", xMax); }
    if (skipZeroN) p.set("skip_zero_n", "1");
    if (skipZeroX) p.set("skip_zero_x", "1");
    return "/api/search?" + p.toString();
  }

  function buildDiophURL(): string {
    const p = new URLSearchParams({
      eq: genEq.trim(), x_min: genXMin, x_max: genXMax,
      y_min: genYMin, y_max: genYMax,
      n_min: nMin, n_max: nMax, n_denom: nDenom,
    });
    if (skipZeroN) p.set("skip_zero_n", "1");
    if (skipZeroX) p.set("skip_zero_x", "1");
    return "/api/diophantine?" + p.toString();
  }

  /* ── Stop search ─────────────────────────────────────────────────────── */
  const stopSearch = useCallback(() => {
    if (evtSourceRef.current) { evtSourceRef.current.close(); evtSourceRef.current = null; }
    setIsSearching(false);
    setStatusMsg("Search stopped by user."); setStatusCls("status-idle");
    setProgress(0);
  }, []);

  /* ── Start search ────────────────────────────────────────────────────── */
  const startSearch = useCallback(() => {
    if (evtSourceRef.current) { evtSourceRef.current.close(); evtSourceRef.current = null; }
    allSolsRef.current = [];
    nTotalRef.current = 0;
    setSolutions([]); setShowTable(false); setShowEmpty(false);
    setProgress(0); setProgressMsg(""); setWarning("");
    setNSummary([]); setNTested(0);
    setShowPlot(false); setPlotData(null); setViewport(null);
    plotSolsRef.current = []; plotDataRef.current = null; viewportRef.current = null;
    setCurveInfoRows([]);

    searchMetaRef.current = {
      mode: solverMode, equation: solverMode==="gen" ? genEq.trim() : `y² = ${expr.trim()}`,
      nMin: ecVarMode==="2var" ? nSingle : nMin,
      nMax: ecVarMode==="2var" ? nSingle : nMax,
      nDenom: ecVarMode==="2var" ? "1" : nDenom,
      xMode, xMin, xMax, xScaleFactor, xCenterExpr, xHalfWidth,
      xDivisorPoly, xDivisorMax, xStartExpr, xEndExpr, xStepExpr,
      genEq: genEq.trim(), genXMin, genXMax, genYMin, genYMax,
      skipZeroN, skipZeroX, startedAt: Date.now(),
    };

    setIsSearching(true);
    setStatusMsg("Starting search…"); setStatusCls("status-running");

    const url = solverMode === "gen" ? buildDiophURL() : buildSearchURL();
    const es = new EventSource(url);
    evtSourceRef.current = es;
    let found = 0;

    es.onmessage = (ev) => {
      let msg: any;
      try { msg = JSON.parse(ev.data); } catch { return; }
      switch (msg.type) {
        case "heartbeat": return;
        case "warning": setWarning(msg.message); break;
        case "start":
          nTotalRef.current = msg.n_count;
          setStatusMsg(`Searching ${(msg.n_count||0).toLocaleString()} n-values × ${(msg.x_count||0).toLocaleString()} x-values…`);
          setStatusCls("status-running");
          break;
        case "progress":
          setProgress(msg.pct);
          setProgressMsg(`Progress: ${msg.pct}%  |  n = ${msg.n}  |  solutions: ${msg.solutions}`);
          break;
        case "solutions":
          if (!msg.data?.length) break;
          setShowTable(true);
          setSolutions(prev => {
            const next = [...prev, ...msg.data];
            allSolsRef.current = next; found = next.length;
            return next;
          });
          break;
        case "curve_info":
          setCurveInfoRows(prev => [...prev, msg]);
          break;
        case "done":
          es.close(); evtSourceRef.current = null;
          setIsSearching(false);
          setProgress(100);
          if (msg.n_with_solutions) { setNSummary(msg.n_with_solutions); setNTested(nTotalRef.current); }
          if (allSolsRef.current.length === 0) {
            setShowEmpty(true);
            setStatusMsg("Search complete — no integer points found."); setStatusCls("status-done");
          } else {
            setStatusMsg(`Done! Found ${allSolsRef.current.length} solution${allSolsRef.current.length!==1?"s":""}.`);
            setStatusCls("status-done");
            setProgressMsg(`Complete — ${allSolsRef.current.length} total solutions.`);
          }
          saveToHistory(allSolsRef.current.length);
          setTimeout(() => loadPlot(), 80);
          break;
        case "error":
          es.close(); evtSourceRef.current = null;
          setIsSearching(false);
          setStatusMsg("Error: " + msg.message); setStatusCls("status-error");
          break;
      }
    };

    es.onerror = () => {
      const cap = es;
      setTimeout(() => {
        if (evtSourceRef.current === cap) {
          cap.close(); evtSourceRef.current = null;
          setIsSearching(false);
          setStatusMsg(found > 0
            ? `Connection lost — ${found} result(s) found before interruption.`
            : "Connection error — search interrupted."
          );
          setStatusCls("status-error");
        }
      }, 0);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solverMode, ecVarMode, expr, nMin, nMax, nDenom, nSingle, xMode, xMin, xMax,
      xScaleFactor, xCenterExpr, xHalfWidth, xDivisorPoly, xDivisorMax,
      xStartExpr, xEndExpr, xStepExpr, skipZeroN, skipZeroX,
      genEq, genXMin, genXMax, genYMin, genYMax]);

  /* ── Save to history ──────────────────────────────────────────────────── */
  function saveToHistory(solCount: number) {
    const meta = searchMetaRef.current;
    const item: HistoryItem = {
      id: Date.now().toString(),
      equation: meta.equation,
      nMin: meta.nMin, nMax: meta.nMax, nDenom: meta.nDenom,
      xMode: meta.xMode, xMin: meta.xMin, xMax: meta.xMax,
      xScaleFactor: meta.xScaleFactor, xCenterExpr: meta.xCenterExpr,
      xHalfWidth: meta.xHalfWidth, xDivisorPoly: meta.xDivisorPoly,
      xDivisorMax: meta.xDivisorMax, xStartExpr: meta.xStartExpr,
      xEndExpr: meta.xEndExpr, xStepExpr: meta.xStepExpr,
      pinned: false, solCount, timestamp: Date.now(), mode: meta.mode,
      genEq: meta.genEq, genXMin: meta.genXMin, genXMax: meta.genXMax,
      genYMin: meta.genYMin, genYMax: meta.genYMax,
      skipZeroN: meta.skipZeroN, skipZeroX: meta.skipZeroX,
    };
    setHistory(prev => {
      const next = [item, ...prev.filter(h => h.equation !== item.equation).slice(0, MAX_HISTORY - 1)];
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  }

  function loadHistoryItem(h: HistoryItem) {
    if (h.mode === "gen") {
      setSolverMode("gen"); setGenEq(h.genEq || "");
      setGenXMin(h.genXMin || "-50"); setGenXMax(h.genXMax || "50");
      setGenYMin(h.genYMin || "-1000"); setGenYMax(h.genYMax || "1000");
    } else {
      setSolverMode("ec");
      if (h.equation.startsWith("y²")) setExpr(h.equation.replace("y² = ","").trim());
      setXMode(h.xMode || "fixed"); setXMin(h.xMin); setXMax(h.xMax);
      if (h.xScaleFactor) setXScaleFactor(h.xScaleFactor);
      if (h.xCenterExpr) setXCenterExpr(h.xCenterExpr);
      if (h.xHalfWidth) setXHalfWidth(h.xHalfWidth);
      if (h.xDivisorPoly) setXDivisorPoly(h.xDivisorPoly);
      if (h.xDivisorMax) setXDivisorMax(h.xDivisorMax);
      if (h.xStartExpr) setXStartExpr(h.xStartExpr);
      if (h.xEndExpr) setXEndExpr(h.xEndExpr);
      if (h.xStepExpr) setXStepExpr(h.xStepExpr);
    }
    setNMin(h.nMin); setNMax(h.nMax); setNDenom(h.nDenom);
    if (h.skipZeroN !== undefined) setSkipZeroN(h.skipZeroN);
    if (h.skipZeroX !== undefined) setSkipZeroX(h.skipZeroX);
    setShowHistory(false);
  }

  function deleteHistoryItem(id: string) {
    setHistory(prev => { const next = prev.filter(h => h.id !== id); localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); return next; });
  }
  function pinHistoryItem(id: string) {
    setHistory(prev => { const next = prev.map(h => h.id===id ? {...h, pinned: !h.pinned} : h); localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); return next; });
  }
  function clearHistory() {
    setHistory([]); localStorage.removeItem(HISTORY_KEY);
  }

  /* ── Load random / example curve ──────────────────────────────────────── */
  function loadRandomCurve() {
    const ecExamples = EXAMPLES.filter(e => e.mode === "ec");
    const pick = ecExamples[Math.floor(Math.random() * ecExamples.length)];
    loadExample(pick);
    showToast("Random curve loaded");
  }

  function loadExample(ex: typeof EXAMPLES[0]) {
    if (ex.mode === "gen") {
      setSolverMode("gen");
      if ((ex as any).eq) setGenEq((ex as any).eq);
      if (ex.nm) setNMin(String(ex.nm)); if (ex.nx) setNMax(String(ex.nx));
      if ((ex as any).xm) setGenXMin(String((ex as any).xm));
      if ((ex as any).xx) setGenXMax(String((ex as any).xx));
      if ((ex as any).ym) setGenYMin(String((ex as any).ym));
      if ((ex as any).yx) setGenYMax(String((ex as any).yx));
    } else {
      setSolverMode("ec");
      if (ex.expr) setExpr(ex.expr);
      if (ex.nm) setNMin(String(ex.nm)); if (ex.nx) setNMax(String(ex.nx));
      if ((ex as any).nd) setNDenom(String((ex as any).nd));
      if ((ex as any).xMode) {
        setXMode((ex as any).xMode);
        if ((ex as any).xCenterExpr) setXCenterExpr((ex as any).xCenterExpr);
        if ((ex as any).xHalfWidth) setXHalfWidth(String((ex as any).xHalfWidth));
      } else {
        setXMode("fixed");
        if ((ex as any).xm) setXMin(String((ex as any).xm));
        if ((ex as any).xx) setXMax(String((ex as any).xx));
      }
    }
  }

  /* ── Plot ─────────────────────────────────────────────────────────────── */
  async function loadPlot() {
    const sols = allSolsRef.current;
    const isGen = searchMetaRef.current.mode === "gen";
    let xMinP = isGen ? parseFloat(searchMetaRef.current.genXMin||"-50")||(-50) : parseFloat(searchMetaRef.current.xMin||"-1000")||(-1000);
    let xMaxP = isGen ? parseFloat(searchMetaRef.current.genXMax||"50")||(50) : parseFloat(searchMetaRef.current.xMax||"1000")||(1000);
    const solXs = sols.map(s => parseFloat(s.x)).filter(Number.isFinite);
    if (solXs.length) {
      const lo = Math.min(...solXs), hi = Math.max(...solXs);
      const pad = Math.max(5, (hi-lo)*0.15);
      xMinP = Math.min(xMinP, lo-pad); xMaxP = Math.max(xMaxP, hi+pad);
    }
    const span = xMaxP - xMinP;
    if (span > 4000) { const cx = (xMinP+xMaxP)/2; xMinP=cx-200; xMaxP=cx+200; }

    let pN: string;
    let solsForN: {x:string;y:string}[];
    if (sols.length > 0) {
      pN = String(sols[0].n);
      solsForN = sols.filter(s => String(s.n) === pN).map(s => ({x:s.x,y:s.y}));
    } else {
      pN = searchMetaRef.current.nMin || "0";
      solsForN = [];
    }
    plotSolsRef.current = solsForN;

    const body: any = { mode: isGen?"gen":"ec", n_val: pN, x_min: xMinP, x_max: xMaxP, solutions: solsForN };
    if (isGen) body.eq = searchMetaRef.current.genEq;
    else body.expr = searchMetaRef.current.equation?.replace("y² = ","").trim() || expr.trim();

    try {
      const r = await fetch("/api/plot", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) });
      const d = await r.json();
      if (d.ok) {
        const hasSomething = d.pos_segments?.length || d.neg_segments?.length || solsForN.length > 0;
        if (hasSomething) {
          setPlotData(d); plotDataRef.current = d;
          const vp = { xMin: d.x_min, xMax: d.x_max, yMin: d.y_min, yMax: d.y_max };
          setViewport(vp); viewportRef.current = vp;
          setPlotN(pN);
          setShowPlot(true);
        }
      }
    } catch {}
  }

  /* ── Render plot ──────────────────────────────────────────────────────── */
  const renderPlot = useCallback(() => {
    const canvas = canvasRef.current;
    const pd = plotDataRef.current;
    const vp = viewportRef.current;
    if (!canvas || !pd || !vp) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const container = canvas.parentElement;
    const W = Math.max(300, Math.min(container ? container.clientWidth - 2 : 700, 900));
    const H = Math.round(W * 0.5);
    canvas.width = W*dpr; canvas.height = H*dpr;
    canvas.style.width = W+"px"; canvas.style.height = H+"px";
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    const PAD = { L:52, R:20, T:22, B:36 };
    const PW = W-PAD.L-PAD.R, PH = H-PAD.T-PAD.B;
    const { xMin:x_min, xMax:x_max, yMin:y_min, yMax:y_max } = vp;
    const { pos_segments=[], neg_segments=[] } = pd;
    const darkMode = document.documentElement.getAttribute("data-theme") === "dark";

    const tx = (x: number) => PAD.L + (x - x_min)/(x_max - x_min)*PW;
    const ty = (y: number) => PAD.T + (1 - (y - y_min)/(y_max - y_min))*PH;

    ctx.fillStyle = darkMode ? "#161b22" : "#ffffff";
    ctx.fillRect(0,0,W,H);

    ctx.strokeStyle = darkMode ? "#21262d" : "#e5e7eb";
    ctx.lineWidth = 1; ctx.setLineDash([3,4]);
    for (let i=0;i<=8;i++) { const gx=PAD.L+(i/8)*PW; ctx.beginPath(); ctx.moveTo(gx,PAD.T); ctx.lineTo(gx,PAD.T+PH); ctx.stroke(); }
    for (let i=0;i<=6;i++) { const gy=PAD.T+(i/6)*PH; ctx.beginPath(); ctx.moveTo(PAD.L,gy); ctx.lineTo(PAD.L+PW,gy); ctx.stroke(); }
    ctx.setLineDash([]);

    ctx.strokeStyle = darkMode ? "#8b949e" : "#9ca3af"; ctx.lineWidth = 1.2;
    if (x_min<=0 && 0<=x_max) { const ax=tx(0); ctx.beginPath(); ctx.moveTo(ax,PAD.T); ctx.lineTo(ax,PAD.T+PH); ctx.stroke(); }
    if (y_min<=0 && 0<=y_max) { const ay=ty(0); ctx.beginPath(); ctx.moveTo(PAD.L,ay); ctx.lineTo(PAD.L+PW,ay); ctx.stroke(); }

    ctx.fillStyle = darkMode ? "#8b949e" : "#6b7280";
    ctx.font = "11px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "top";
    for (let i=0;i<=8;i+=2) ctx.fillText(fmtNum(x_min+(i/8)*(x_max-x_min)), PAD.L+(i/8)*PW, PAD.T+PH+4);
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (let i=0;i<=6;i+=2) ctx.fillText(fmtNum(y_max-(i/6)*(y_max-y_min)), PAD.L-4, PAD.T+(i/6)*PH);

    ctx.save();
    ctx.beginPath(); ctx.rect(PAD.L,PAD.T,PW,PH); ctx.clip();
    ctx.strokeStyle = darkMode ? "#60a5fa" : "#2563eb"; ctx.lineWidth = 2; ctx.lineJoin = "round";
    const drawSeg = (seg: number[][]) => {
      if (seg.length < 2) return;
      ctx.beginPath(); ctx.moveTo(tx(seg[0][0]), ty(seg[0][1]));
      for (let i=1;i<seg.length;i++) ctx.lineTo(tx(seg[i][0]), ty(seg[i][1]));
      ctx.stroke();
    };
    for (const seg of pos_segments) drawSeg(seg);
    for (const seg of neg_segments) drawSeg(seg);

    const isInt = (v: string) => !v.includes("/") && Number.isFinite(Number(v)) && Number.isInteger(Number(v));
    const f = filterRef.current;
    const visSols = plotSolsRef.current.filter(s => {
      if (f === "all") return true;
      const ii = isInt(s.x) && isInt(s.y);
      return f === "integer" ? ii : !ii;
    });
    for (const { x, y } of visSols) {
      const fx = parseFloat(x), fy = parseFloat(y);
      if (!Number.isFinite(fx) || !Number.isFinite(fy)) continue;
      const px = tx(fx), py = ty(fy);
      ctx.fillStyle = "#ef4444"; ctx.strokeStyle = darkMode ? "#161b22" : "#fff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px,py,6,0,Math.PI*2); ctx.fill(); ctx.stroke();
      if (showLabelsRef.current) {
        const label = `(${fmtNum(fx)}, ${fmtNum(fy)})`;
        ctx.font = "bold 11px sans-serif";
        const tw = ctx.measureText(label).width;
        let lx = px+8, ly = py-10;
        if (lx+tw+4 > PAD.L+PW) lx = px-tw-8;
        ctx.fillStyle = darkMode ? "rgba(22,27,34,.82)" : "rgba(255,255,255,.82)";
        ctx.fillRect(lx-2,ly-11,tw+4,14);
        ctx.fillStyle = darkMode ? "#f0f6fc" : "#111827";
        ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
        ctx.fillText(label, lx, ly);
      }
    }
    ctx.restore();

    ctx.strokeStyle = darkMode ? "#30363d" : "#d1d5db"; ctx.lineWidth = 1;
    ctx.strokeRect(PAD.L,PAD.T,PW,PH);
    setPlotCaption(`Curve for n = ${pd.n_val}  |  ${visSols.length} point${visSols.length!==1?"s":""} highlighted`);
  }, []);

  useEffect(() => {
    if (showPlot && plotData && viewport) renderPlot();
  }, [showPlot, plotData, viewport, showLabels, pointFilter, renderPlot]);

  /* ── Canvas zoom / pan ────────────────────────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvasEventsRef.current) return;
    canvasEventsRef.current = true;
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const vp = viewportRef.current; if (!vp) return;
      const rect = canvas.getBoundingClientRect();
      const W = canvas.offsetWidth, H = canvas.offsetHeight;
      const PW = W-72, PH = H-58;
      const mx = e.clientX-rect.left, my = e.clientY-rect.top;
      const cx = vp.xMin + (mx-52)/PW*(vp.xMax-vp.xMin);
      const cy = vp.yMax - (my-22)/PH*(vp.yMax-vp.yMin);
      const ff = e.deltaY > 0 ? 1.25 : 0.8;
      const nv = { xMin:cx-(cx-vp.xMin)*ff, xMax:cx+(vp.xMax-cx)*ff, yMin:cy-(cy-vp.yMin)*ff, yMax:cy+(vp.yMax-cy)*ff };
      viewportRef.current = nv; setViewport(nv); renderPlot();
    }, {passive:false});
    let drag: any = null;
    canvas.addEventListener("mousedown", (e) => { if (e.button !== 0) return; drag = { x:e.clientX, y:e.clientY, vp:{...viewportRef.current!} }; });
    canvas.addEventListener("mousemove", (e) => {
      if (!drag) return;
      const vp = drag.vp; const W = canvas.offsetWidth, H = canvas.offsetHeight; const PW = W-72, PH = H-58;
      const dx = (e.clientX-drag.x)/PW*(vp.xMax-vp.xMin);
      const dy = (e.clientY-drag.y)/PH*(vp.yMax-vp.yMin);
      const nv = {xMin:vp.xMin-dx,xMax:vp.xMax-dx,yMin:vp.yMin+dy,yMax:vp.yMax+dy};
      viewportRef.current = nv; setViewport(nv); renderPlot();
    });
    const end = () => { drag = null; };
    canvas.addEventListener("mouseup", end); canvas.addEventListener("mouseleave", end);
  }, [showPlot, renderPlot]);

  /* ── Group law calculator ─────────────────────────────────────────────── */
  async function computeGroupLaw() {
    const sols = allSolsRef.current;
    const getPoint = (v: string) => {
      if (v === "O") return { x:"O", y:"O" };
      const idx = parseInt(v, 10);
      if (!isNaN(idx) && sols[idx]) return { x:sols[idx].x, y:sols[idx].y };
      return { x:"O", y:"O" };
    };
    const P = getPoint(glP), Q = getPoint(glQ);
    try {
      const r = await fetch("/api/group_law", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ expr: expr.trim(), n_val: plotN, P, Q }),
      });
      const d = await r.json();
      if (d.ok) setGroupLawResult(`P + Q = (${d.x}, ${d.y})`);
      else setGroupLawResult("Error: " + d.error);
    } catch { setGroupLawResult("Request failed."); }
  }

  /* ── Export ───────────────────────────────────────────────────────────── */
  function exportCSV() {
    const rows = ["#,n,x,y", ...solutions.map((s,i) => `${i+1},${s.n},${s.x},${s.y}`)];
    const blob = new Blob([rows.join("\n")], {type:"text/csv"});
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "elliptic_solutions.csv"; a.click();
  }

  function exportLatex() {
    const rows = solutions.map(s => `  (${s.n}, ${s.x}, ${s.y})`).join(",\n");
    const tex = `\\begin{align*}\n  \\text{Curve:} &\\quad ${searchMetaRef.current.equation || "y^2 = f(n,x)"} \\\\\n  \\text{Solutions:} &\\quad \\{${rows}\\}\n\\end{align*}`;
    const blob = new Blob([tex], {type:"text/plain"});
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "elliptic_solutions.tex"; a.click();
  }

  function exportBibTeX() {
    const bib = `@misc{elliptic-curve-solver-${Date.now()},\n  title  = {Integer points on ${escHtml(searchMetaRef.current.equation||"parametric elliptic curve")}},\n  author = {{Elliptic Curve Solver}},\n  year   = {${new Date().getFullYear()}},\n  note   = {Found by elliptic-curve-solver},\n  url    = {https://elliptic-curve-solver.onrender.com}\n}`;
    const blob = new Blob([bib], {type:"text/plain"});
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "elliptic_solutions.bib"; a.click();
  }

  function shareURL() {
    const p = new URLSearchParams({ expr: expr.trim(), n_min: nMin, n_max: nMax, n_denom: nDenom, x_min: xMin, x_max: xMax });
    const url = window.location.origin + "/app?" + p.toString();
    navigator.clipboard.writeText(url).then(() => showToast("URL copied to clipboard!")).catch(() => showToast("Copy failed"));
  }

  /* ── Toast ────────────────────────────────────────────────────────────── */
  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }

  /* ── Filtered solutions ──────────────────────────────────────────────── */
  const filteredSols = solutions.filter(s => {
    if (pointFilter === "all") return true;
    const isInt = (v: string) => !v.includes("/") && Number.isFinite(Number(v)) && Number.isInteger(Number(v));
    const ii = isInt(s.x) && isInt(s.y);
    return pointFilter === "integer" ? ii : !ii;
  });

  /* ── Solutions table rows ─────────────────────────────────────────────── */
  function renderSolutionsTable() {
    const rows: React.ReactNode[] = [];
    let lastN: string | null = null;
    filteredSols.forEach((sol, i) => {
      if (sol.n !== lastN) {
        lastN = sol.n;
        rows.push(<tr key={"g"+sol.n+i} className="n-group-row"><td colSpan={6}>n = {sol.n}</td></tr>);
      }
      rows.push(
        <tr key={i} className="new-row">
          <td>{i+1}</td>
          <td>{sol.n}</td>
          <td>{sol.x}</td>
          <td>{sol.y}</td>
          <td className="cell-height">{computeHeight(sol.x, sol.y)}</td>
          <td className="cell-valid"><CheckIcon /> verified</td>
        </tr>
      );
    });
    return rows;
  }

  /* ── Curve info ───────────────────────────────────────────────────────── */
  function renderCurveInfoRow(ci: any, idx: number) {
    const def = (v: any) => v !== undefined && v !== null ? String(v) : "—";
    return (
      <tr key={"ci"+idx} className="curve-info-row">
        <td colSpan={6}>
          <details className="curve-info-card">
            <summary className="ci-summary">
              <span className="ci-label">Curve invariants — n = {def(ci.n)}</span>
              {ci.curve_class && <span className="ci-badge">{ci.curve_class}</span>}
            </summary>
            <div className="ci-body">
              {ci.A !== undefined && (
                <div className="ci-section">
                  <div className="ci-sh">Short Weierstrass</div>
                  <div className="ci-kv"><span className="ci-key">Equation</span><span className="ci-val">{def(ci.short_weierstrass)}</span></div>
                  <div className="ci-kv"><span className="ci-key">A</span><span className="ci-val">{def(ci.A)}</span></div>
                  <div className="ci-kv"><span className="ci-key">B</span><span className="ci-val">{def(ci.B)}</span></div>
                </div>
              )}
              {ci.discriminant !== undefined && (
                <div className="ci-section">
                  <div className="ci-sh">Invariants</div>
                  <div className="ci-kv"><span className="ci-key">Discriminant Δ</span><span className="ci-val">{def(ci.discriminant)}</span></div>
                  <div className="ci-kv"><span className="ci-key">j-invariant</span><span className="ci-val">{def(ci.j_invariant)}</span></div>
                </div>
              )}
            </div>
          </details>
        </td>
      </tr>
    );
  }

  /* ════════════════════════════════════════════════════════════════════════
     RENDER
     ════════════════════════════════════════════════════════════════════════ */
  return (
    <>
      {/* ── Animated background canvas ── */}
      <canvas ref={bgCanvasRef} className="bg-canvas" aria-hidden />

      {/* ── BMC floating button ── */}
      {showBmc && (
        <a className="bmc-float" href="https://www.buymeacoffee.com/placeholder" target="_blank" rel="noopener noreferrer" aria-label="Buy me a coffee">
          <CoffeeIcon />
          <span>Buy me a coffee</span>
          <button className="bmc-close" type="button" aria-label="Dismiss" onClick={(e) => {
            e.preventDefault(); e.stopPropagation();
            setShowBmc(false);
            localStorage.setItem(BMC_KEY, String(Date.now() + 7*24*60*60*1000));
          }}><CloseIcon /></button>
        </a>
      )}

      {/* ── Font picker menu ── */}
      {showFontPicker && (
        <div className="wp-picker-menu" style={{top: fontPickerPos.top + "px", right: fontPickerPos.right + "px", minWidth:200}}>
          <div className="wp-picker-label">Typeface</div>
          {FONT_OPTIONS.map(f => (
            <button key={f.id} className={"wp-opt" + (fontId===f.id?" active":"")} type="button"
              style={{fontFamily: f.stack}}
              onClick={() => { setFontId(f.id); localStorage.setItem("ecs-font", f.id); }}>
              {f.label}
            </button>
          ))}
          <div className="wp-picker-label" style={{marginTop:6}}>Size</div>
          <div style={{display:"flex", gap:3, padding:"4px 8px 6px"}}>
            {FONT_SIZES.map(s => (
              <button key={s.id}
                type="button"
                onClick={() => { setFontSizeId(s.id); localStorage.setItem("ecs-font-size", s.id); }}
                style={{
                  flex:1, padding:"4px 2px", border: "1px solid var(--border)",
                  background: fontSizeId===s.id ? "var(--text)" : "transparent",
                  color: fontSizeId===s.id ? "var(--bg)" : "var(--text-dim)",
                  fontSize:".65rem", cursor:"pointer", fontFamily:"var(--font-mono)",
                }}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Wallpaper picker menu ── */}
      {showWpPicker && (
        <div className="wp-picker-menu" style={{top: wpPickerPos.top + "px", right: wpPickerPos.right + "px"}}>
          <div className="wp-picker-label">Background</div>
          {WP_THEMES.map(wt => (
            <button key={wt.id} className={"wp-opt" + (wpTheme===wt.id?" active":"")} type="button"
              onClick={() => { setWpTheme(wt.id); localStorage.setItem("wpTheme", wt.id); setShowWpPicker(false); }}>
              {wt.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Header ── */}
      <header className="site-header above-canvas">
        <div className="header-inner">
          <Link href="/" className="logo-group" style={{textDecoration:"none",color:"inherit"}}>
            <span className="logo-icon">∮</span>
            <div>
              <div className="site-title">Elliptic Curve Solver</div>
              <div className="site-sub">y² = f(n, x) — find integer points</div>
            </div>
          </Link>
          <nav className="header-nav">
            <Link className="nav-link" href="/">Home</Link>
            <a className="btn-github" href="https://github.com/JAgbanwa/elliptic-curve-solver-app-or-website" target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"center",gap:"5px",textDecoration:"none"}}>
              <GithubIcon /> GitHub
            </a>
            <button className="btn-icon" type="button" title="Font & size" onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setFontPickerPos({top: r.bottom+6, right: window.innerWidth-r.right});
              setShowFontPicker(!showFontPicker);
              setShowWpPicker(false);
            }}>
              <TypeIcon />
            </button>
            <button className="btn-icon" type="button" title="Choose background" onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setWpPickerPos({top: r.bottom+6, right: window.innerWidth-r.right});
              setShowWpPicker(!showWpPicker);
              setShowFontPicker(false);
            }}>
              <BrushIcon />
            </button>
            <button className="btn-theme" type="button" onClick={toggleTheme} title="Toggle theme">
              {isDark ? <SunIcon /> : <MoonIcon />}
              {isDark ? "Light" : "Dark"}
            </button>
          </nav>
        </div>
      </header>

      {/* ── History Drawer ── */}
      {showHistory && (
        <>
          <div className="history-backdrop" onClick={() => setShowHistory(false)} />
          <div className="history-drawer" role="dialog" aria-modal aria-label="Search history">
            <div className="history-drawer-header">
              <span className="history-drawer-title">Search History</span>
              <button className="history-clear-btn" type="button" onClick={clearHistory}>Clear all</button>
              <button className="history-close-btn" type="button" aria-label="Close" onClick={() => setShowHistory(false)}><CloseIcon /></button>
            </div>
            <div className="history-list">
              {history.length === 0 && <p style={{color:"var(--text-dim)",padding:"20px",fontSize:".82rem"}}>No searches yet.</p>}
              {history.map(h => (
                <div key={h.id} className="history-item" onClick={() => loadHistoryItem(h)}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div className="history-item-eq">{h.equation}</div>
                    <div className="history-item-actions" onClick={e => e.stopPropagation()}>
                      <button className={"history-action-btn"+(h.pinned?" pinned":"")} type="button" title="Pin" onClick={() => pinHistoryItem(h.id)}><PinIcon /></button>
                      <button className="history-action-btn del" type="button" title="Delete" onClick={() => deleteHistoryItem(h.id)}><TrashIcon /></button>
                    </div>
                  </div>
                  <div className="history-item-meta">
                    n: [{h.nMin}, {h.nMax}] · {h.solCount} solution{h.solCount!==1?"s":""} · {new Date(h.timestamp).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Main App ── */}
      <main className="main-grid above-canvas" id="app">

        {/* ─── Left panel: inputs ─────────────────────────────────────────── */}
        <aside className="panel">
          <div className="panel-title">Configure Search</div>

          {/* Solver mode tabs */}
          <div className="solver-tabs">
            <button className={"solver-tab"+(solverMode==="ec"?" active":"")} type="button" onClick={() => setSolverMode("ec")}>y² = f(n, x)</button>
            <button className={"solver-tab"+(solverMode==="gen"?" active":"")} type="button" onClick={() => setSolverMode("gen")}>General Diophantine</button>
          </div>

          {/* EC mode */}
          {solverMode === "ec" && (
            <>
              <div className="var-tabs">
                <button className={"var-tab"+(ecVarMode==="2var"?" active":"")} type="button" onClick={() => setEcVarMode("2var")}><strong>2 unknowns</strong> y²=f(x)</button>
                <button className={"var-tab"+(ecVarMode==="3var"?" active":"")} type="button" onClick={() => setEcVarMode("3var")}><strong>3 unknowns</strong> y²=f(n,x)</button>
              </div>

              <div className="param-section">
                <label className="param-label" htmlFor="expr-input">Right-hand side — y² = <strong>{ecVarMode==="3var"?"f(n, x)":"f(x)"}</strong></label>
                <input id="expr-input" className="text-input" type="text" value={expr} onChange={e => setExpr(e.target.value)} placeholder="e.g. x**3 - n**2*x" autoComplete="off" spellCheck={false} />
                <div className={"preview-box"+(latexError?" error":"")}>
                  {latexPreview
                    ? <span style={{fontSize:"1.05rem"}}>y² = {latexPreview}</span>
                    : <span className="dim">LaTeX preview loads here…</span>
                  }
                </div>
                <details className="latex-import">
                  <summary>Paste LaTeX equation</summary>
                  <div className="latex-import-body">
                    <label className="param-label" htmlFor="latex-paste">Your LaTeX</label>
                    <textarea id="latex-paste" className="latex-textarea" rows={3} spellCheck={false} placeholder="e.g. y^2 = x^3 + ax + b" value={latexPaste} onChange={e => setLatexPaste(e.target.value)} />
                    <div className="latex-import-row">
                      <button className="btn btn-ghost btn-sm" type="button" onClick={convertLatex}>Convert to Python</button>
                      {latexStatus && <span className={"latex-status"+(latexStatusOk?" ok":" err")}>{latexStatus}</span>}
                    </div>
                  </div>
                </details>
                <p className="hint">Use Python syntax: <code>**</code> for powers, <code>*</code> for multiplication.</p>
              </div>

              {ecVarMode === "2var" ? (
                <div className="param-section">
                  <label className="param-label" htmlFor="n-single">Fixed n value</label>
                  <input id="n-single" className="num-input" type="text" value={nSingle} onChange={e => setNSingle(e.target.value)} />
                </div>
              ) : (
                <div className="param-section">
                  <div className="range-group">
                    <div className="range-field"><label className="param-label">n min</label><input className="num-input" type="text" value={nMin} onChange={e => setNMin(e.target.value)} /></div>
                    <div className="range-field"><label className="param-label">n max</label><input className="num-input" type="text" value={nMax} onChange={e => setNMax(e.target.value)} /></div>
                    <div className="range-field"><label className="param-label">n denom</label><input className="num-input" type="number" value={nDenom} min={1} max={100} onChange={e => setNDenom(e.target.value)} /></div>
                  </div>
                </div>
              )}

              <div className="param-section">
                <label className="param-label" htmlFor="x-mode">x search mode</label>
                <select id="x-mode" className="mode-select" value={xMode} onChange={e => setXMode(e.target.value)}>
                  <option value="fixed">Fixed range</option>
                  <option value="autoscale">Auto-scale x by |n|</option>
                  <option value="window">Smart window (big-integer)</option>
                  <option value="divisor">Divisor search (x | P(n))</option>
                  <option value="exprrange">Expression range + step</option>
                </select>
                {xMode === "fixed" && (
                  <div style={{marginTop:8}}>
                    <div className="range-group two-col">
                      <div className="range-field"><label className="param-label">x min</label><input className="num-input" type="number" value={xMin} onChange={e => setXMin(e.target.value)} /></div>
                      <div className="range-field"><label className="param-label">x max</label><input className="num-input" type="number" value={xMax} onChange={e => setXMax(e.target.value)} /></div>
                    </div>
                  </div>
                )}
                {xMode === "autoscale" && (
                  <div style={{marginTop:8}}>
                    <label className="param-label">Scale factor k (x ∈ [−k|n|, k|n|])</label>
                    <input className="num-input" type="number" value={xScaleFactor} min={1} max={500} onChange={e => setXScaleFactor(e.target.value)} />
                  </div>
                )}
                {xMode === "window" && (
                  <div style={{marginTop:8}}>
                    <label className="param-label">Center expression (in n)</label>
                    <input className="text-input" type="text" value={xCenterExpr} onChange={e => setXCenterExpr(e.target.value)} placeholder="e.g. 12*n" style={{marginBottom:6}} />
                    <label className="param-label">Half-width h</label>
                    <input className="num-input" type="number" value={xHalfWidth} min={1} onChange={e => setXHalfWidth(e.target.value)} />
                    <p className="hint">x ∈ [center−h, center+h]. Exact big-integer arithmetic.</p>
                  </div>
                )}
                {xMode === "divisor" && (
                  <div style={{marginTop:8}}>
                    <label className="param-label">Numerator polynomial P(n)</label>
                    <input className="text-input" type="text" value={xDivisorPoly} onChange={e => setXDivisorPoly(e.target.value)} placeholder="e.g. 36*n**3 + 54*n**2" spellCheck={false} />
                    <label className="param-label" style={{marginTop:8}}>Max |divisor|</label>
                    <input className="num-input" type="number" value={xDivisorMax} min={1} onChange={e => setXDivisorMax(e.target.value)} />
                  </div>
                )}
                {xMode === "exprrange" && (
                  <div style={{marginTop:8}}>
                    <label className="param-label">x start (expr in n)</label>
                    <input className="text-input" type="text" value={xStartExpr} onChange={e => setXStartExpr(e.target.value)} placeholder="e.g. n**2" spellCheck={false} style={{marginBottom:6}} />
                    <label className="param-label">x end</label>
                    <input className="text-input" type="text" value={xEndExpr} onChange={e => setXEndExpr(e.target.value)} placeholder="e.g. n**2 + 1000" spellCheck={false} style={{marginBottom:6}} />
                    <label className="param-label">Step</label>
                    <input className="text-input" type="text" value={xStepExpr} onChange={e => setXStepExpr(e.target.value)} placeholder="1" spellCheck={false} />
                    <p className="hint">Supports <code>icbrt()</code>, <code>abs()</code>.</p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Gen mode */}
          {solverMode === "gen" && (
            <>
              <div className="var-tabs">
                <button className={"var-tab"+(genVarMode==="2var"?" active":"")} type="button" onClick={() => setGenVarMode("2var")}><strong>2 unknowns</strong> F(n,x)=0</button>
                <button className={"var-tab"+(genVarMode==="3var"?" active":"")} type="button" onClick={() => setGenVarMode("3var")}><strong>3 unknowns</strong> F(n,x,y)=0</button>
              </div>
              <div className="param-section">
                <label className="param-label" htmlFor="gen-eq">Full equation</label>
                <input id="gen-eq" className="text-input" type="text" value={genEq} onChange={e => setGenEq(e.target.value)} placeholder="e.g. y**3 - y = x**4 - 2*x - 2" autoComplete="off" spellCheck={false} />
                <p className="hint">Enter as <code>LHS = RHS</code>. Use <code>**</code> for powers.</p>
              </div>
              <div className="param-section">
                <div className="range-group">
                  <div className="range-field"><label className="param-label">n min</label><input className="num-input" type="text" value={nMin} onChange={e => setNMin(e.target.value)} /></div>
                  <div className="range-field"><label className="param-label">n max</label><input className="num-input" type="text" value={nMax} onChange={e => setNMax(e.target.value)} /></div>
                  <div className="range-field"><label className="param-label">n denom</label><input className="num-input" type="number" value={nDenom} min={1} onChange={e => setNDenom(e.target.value)} /></div>
                </div>
              </div>
              <div className="param-section">
                <div className="range-group two-col">
                  <div className="range-field"><label className="param-label">x min</label><input className="num-input" type="number" value={genXMin} onChange={e => setGenXMin(e.target.value)} /></div>
                  <div className="range-field"><label className="param-label">x max</label><input className="num-input" type="number" value={genXMax} onChange={e => setGenXMax(e.target.value)} /></div>
                </div>
              </div>
              {genVarMode === "3var" && (
                <div className="param-section">
                  <div className="range-group two-col">
                    <div className="range-field"><label className="param-label">y min</label><input className="num-input" type="number" value={genYMin} onChange={e => setGenYMin(e.target.value)} /></div>
                    <div className="range-field"><label className="param-label">y max</label><input className="num-input" type="number" value={genYMax} onChange={e => setGenYMax(e.target.value)} /></div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Exclude checkboxes */}
          <div className="param-section">
            <label className="param-label">Exclude from results</label>
            <div className="checkbox-row">
              <label className="chk-label"><input type="checkbox" checked={skipZeroN} onChange={e => setSkipZeroN(e.target.checked)} /><span>Skip n = 0</span></label>
              <label className="chk-label"><input type="checkbox" checked={skipZeroX} onChange={e => setSkipZeroX(e.target.checked)} /><span>Skip x = 0</span></label>
            </div>
          </div>

          {/* Examples accordion */}
          <details className="examples-accordion">
            <summary className="examples-accordion-summary">Example curves</summary>
            <div className="examples-accordion-body">
              {EXAMPLES.map((ex, i) => (
                <button key={i} type="button" className="example-quick-btn"
                  onClick={() => { loadExample(ex); }}
                  title={ex.desc}>
                  <span className="eqb-name">{ex.name}</span>
                  <span className="eqb-expr">{ex.expr || (ex as any).eq}</span>
                </button>
              ))}
            </div>
          </details>

          {/* Action buttons */}
          <div className="btn-row">
            <button className="btn btn-ghost btn-sm" type="button" onClick={loadRandomCurve} title="Random famous curve" style={{display:"flex",alignItems:"center",gap:"5px"}}>
              <DiceIcon /> Random
            </button>
            <button className="btn btn-primary" type="button" disabled={isSearching} onClick={startSearch}>
              <PlayIcon /> Run Search
            </button>
            <button className="btn btn-danger btn-sm" type="button" disabled={!isSearching} onClick={stopSearch}>
              <StopIcon /> Stop
            </button>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => {
              stopSearch();
              setSolutions([]); setShowTable(false); setShowEmpty(false);
              setStatusMsg("Enter a curve expression and click Run Search.");
              setStatusCls("status-idle"); setProgress(0); setShowPlot(false);
              setNSummary([]); setCurveInfoRows([]);
            }}>Clear</button>
            <button className="btn-history" type="button" onClick={() => setShowHistory(true)}>
              <ClockIcon /> History
              {history.length > 0 && <span className="history-badge">{history.length}</span>}
            </button>
          </div>
        </aside>

        {/* ─── Right panel: results ────────────────────────────────────────── */}
        <section className="panel panel-results">
          {/* Progress bar */}
          {(isSearching || progress > 0) && (
            <div className="progress-header">
              <div className="progress-bar-wrap"><div className="progress-bar-fill" style={{width:progress+"%"}} /></div>
              <div className="progress-stats">{progressMsg || "Searching…"}</div>
            </div>
          )}

          {/* Warning */}
          {warning && <div className="warning-banner">⚠ {warning}</div>}

          {/* Status */}
          <div className={"status-area "+statusCls}>{statusMsg}</div>

          {/* N summary */}
          {nSummary.length > 0 && (
            <div style={{marginBottom:14}}>
              <div className="n-summary-title">Rational n with integral points</div>
              <div className="n-summary-header"><span className="n-summary-count">{nSummary.length}</span> of {nTested.toLocaleString()} n-values tested:</div>
              <div className="n-chips-row">{nSummary.map((n,i) => <span key={i} className="n-chip">{String(n)}</span>)}</div>
            </div>
          )}

          {/* Results table */}
          {showTable && (
            <div>
              <div className="table-header-row">
                <div className="table-title">
                  {pointFilter==="rational"?"ℚ Rational Points Found":pointFilter==="integer"?"ℤ Integer Points Found":"All Rational Points Found"}
                </div>
                <div className="table-actions">
                  <span className="badge">{filteredSols.length} solution{filteredSols.length!==1?"s":""}</span>
                  <div className="export-group">
                    <button className="btn btn-ghost btn-sm" type="button" onClick={exportCSV}><DownloadIcon /> CSV</button>
                    <button className="btn btn-ghost btn-sm" type="button" onClick={exportLatex}><DownloadIcon /> LaTeX</button>
                    <button className="btn btn-ghost btn-sm" type="button" onClick={exportBibTeX}><DownloadIcon /> BibTeX</button>
                    <button className="btn btn-ghost btn-sm" type="button" onClick={shareURL} style={{display:"flex",alignItems:"center",gap:"4px"}}><LinkIcon /> Share</button>
                    <button className="btn btn-ghost btn-sm" type="button" style={{display:"flex",alignItems:"center",gap:"4px"}} onClick={() => { saveToHistory(solutions.length); showToast("Search pinned!"); }}><PinIcon /> Pin</button>
                  </div>
                  <div className="pt-filter-group">
                    {(["all","integer","rational"] as const).map(f => (
                      <button key={f} className={"pt-filter-btn"+(pointFilter===f?" active":"")} type="button" onClick={() => setPointFilter(f)}>
                        {f==="all"?"All":f==="integer"?"ℤ Integer":"ℚ Rational"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr><th>#</th><th>n</th><th>x</th><th>y</th><th title="Height: log₂(max(|x|,|y|,1)) bits">h(P) bits</th><th>Verify</th></tr>
                  </thead>
                  <tbody>
                    {renderSolutionsTable()}
                    {curveInfoRows.map((ci, i) => renderCurveInfoRow(ci, i))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Curve visualization */}
          {showPlot && plotData && viewport && (
            <div className="plot-section">
              <div className="plot-header">
                <div className="plot-title">Curve Visualization</div>
                <span className="plot-n-label">n = {plotN}</span>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => setShowPlot(false)}>Hide</button>
              </div>
              <div className="plot-toolbar">
                <button className="btn btn-ghost btn-xs" type="button" onClick={() => {
                  const vp = viewportRef.current; if (!vp) return;
                  const cx=(vp.xMin+vp.xMax)/2,cy=(vp.yMin+vp.yMax)/2;
                  const nv={xMin:cx-(cx-vp.xMin)*.8,xMax:cx+(vp.xMax-cx)*.8,yMin:cy-(cy-vp.yMin)*.8,yMax:cy+(vp.yMax-cy)*.8};
                  setViewport(nv); viewportRef.current=nv; renderPlot();
                }}>＋ Zoom in</button>
                <button className="btn btn-ghost btn-xs" type="button" onClick={() => {
                  const vp = viewportRef.current; if (!vp) return;
                  const cx=(vp.xMin+vp.xMax)/2,cy=(vp.yMin+vp.yMax)/2;
                  const nv={xMin:cx-(cx-vp.xMin)*1.25,xMax:cx+(vp.xMax-cx)*1.25,yMin:cy-(cy-vp.yMin)*1.25,yMax:cy+(vp.yMax-cy)*1.25};
                  setViewport(nv); viewportRef.current=nv; renderPlot();
                }}>－ Zoom out</button>
                <button className="btn btn-ghost btn-xs" type="button" onClick={() => {
                  const vp={xMin:plotData.x_min,xMax:plotData.x_max,yMin:plotData.y_min,yMax:plotData.y_max};
                  setViewport(vp); viewportRef.current=vp; renderPlot();
                }}><ResetIcon /> Reset</button>
                <button className="btn btn-ghost btn-xs" type="button" onClick={() => { setShowLabels(v => !v); showLabelsRef.current = !showLabelsRef.current; renderPlot(); }}>
                  {showLabels ? "Hide labels" : "Show labels"}
                </button>
                <div className="pt-filter-group" style={{marginLeft:"auto"}}>
                  {(["all","integer","rational"] as const).map(f => (
                    <button key={f} className={"pt-filter-btn"+(pointFilter===f?" active":"")} type="button" onClick={() => { setPointFilter(f); filterRef.current=f; renderPlot(); }}>
                      {f==="all"?"All":f==="integer"?"ℤ":"ℚ"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="plot-container">
                <canvas ref={canvasRef} id="curve-canvas" />
              </div>
              <p className="plot-caption">{plotCaption} — scroll to zoom, drag to pan</p>

              {/* Group law calculator */}
              {solutions.length > 0 && solverMode === "ec" && (
                <div className="group-law-section">
                  <div className="group-law-title">Group Law Calculator</div>
                  <p className="hint">Compute P ⊕ Q on this elliptic curve using exact rational arithmetic.</p>
                  <div className="group-law-inputs">
                    <div>
                      <label className="param-label">Point P</label>
                      <select className="mode-select" value={glP} onChange={e => setGlP(e.target.value)}>
                        <option value="O">O (point at infinity)</option>
                        {solutions.slice(0,200).map((s,i) => <option key={i} value={String(i)}>({s.x}, {s.y}) n={s.n}</option>)}
                      </select>
                    </div>
                    <span className="gl-op-badge">⊕</span>
                    <div>
                      <label className="param-label">Point Q</label>
                      <select className="mode-select" value={glQ} onChange={e => setGlQ(e.target.value)}>
                        <option value="O">O (point at infinity)</option>
                        {solutions.slice(0,200).map((s,i) => <option key={i} value={String(i)}>({s.x}, {s.y}) n={s.n}</option>)}
                      </select>
                    </div>
                    <button className="btn btn-primary btn-sm" type="button" onClick={computeGroupLaw}>Compute</button>
                  </div>
                  {groupLawResult && <div className="gl-result">{groupLawResult}</div>}
                </div>
              )}
            </div>
          )}

          {/* Empty state */}
          {showEmpty && (
            <div className="empty-state">
              <span className="empty-icon">∅</span>
              <p>No integer points found in the given range.</p>
              <p className="dim" style={{marginTop:6}}>Try widening the x or n range, or adjusting the curve.</p>
              <div className="math-fact-card">
                <div className="math-fact-label"><LightbulbIcon /> Did you know?</div>
                <div className="math-fact-text">{MATH_FACTS[factIdx]}</div>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="site-footer above-canvas">
        <div className="footer-inner">
          <div className="footer-brand"><span className="logo-icon" style={{fontSize:"1.2rem"}}>∮</span><span className="footer-name">Elliptic Curve Solver</span></div>
          <div className="footer-links">
            <Link href="/">Home</Link>
            <a href="https://github.com/JAgbanwa/elliptic-curve-solver-app-or-website" target="_blank" rel="noopener">GitHub</a>
            <a href="https://en.wikipedia.org/wiki/Elliptic_curve" target="_blank" rel="noopener">What is an elliptic curve?</a>
          </div>
          <p className="footer-copy">Flask · SymPy · NumPy · Next.js</p>
        </div>
      </footer>

      {/* ── Toast ── */}
      {toast && <div className="copy-toast">{toast}</div>}

      {/* ── Picker backdrops ── */}
      {showWpPicker && <div style={{position:"fixed",inset:0,zIndex:190}} onClick={() => setShowWpPicker(false)} />}
      {showFontPicker && <div style={{position:"fixed",inset:0,zIndex:190}} onClick={() => setShowFontPicker(false)} />}
    </>
  );
}
