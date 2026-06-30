/* global React */
// Minimal SVG icon set — all 1.5px stroke, currentColor.
const Svg = ({ size = 16, children, style = {}, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
       style={style} {...rest}>{children}</svg>
);
// Solid filled variant — uses fill instead of stroke.
const SvgFill = ({ size = 16, children, style = {}, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"
       stroke="none" style={style} {...rest}>{children}</svg>
);

const Icon = {
  Cursor:     p => <Svg {...p}><path d="M5 3l6 16 2-7 7-2z"/></Svg>,
  Move:       p => <Svg {...p}><path d="M5 9l-2 3 2 3M9 5l3-2 3 2M15 19l-3 2-3-2M19 9l2 3-2 3M12 3v18M3 12h18"/></Svg>,
  Frame:      p => <Svg {...p}><path d="M4 8h16M4 16h16M8 4v16M16 4v16"/></Svg>,
  // Auto-layout frame — Figma-style glyph (four quadrants of differing size).
  AutoLayout: ({ size = 16, style = {}, ...rest }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style} {...rest}>
      <path fillRule="evenodd" clipRule="evenodd"
            d="M11 21H5C4.45 21 3.97917 20.8042 3.5875 20.4125C3.19583 20.0208 3 19.55 3 19V5C3 4.45 3.19583 3.97917 3.5875 3.5875C3.97917 3.19583 4.45 3 5 3H11V21ZM9 19V5H5V19H9ZM13 11V3H19C19.55 3 20.0208 3.19583 20.4125 3.5875C20.8042 3.97917 21 4.45 21 5V11H13ZM15 9H19V5H15V9ZM13 21V13H21V19C21 19.55 20.8042 20.0208 20.4125 20.4125C20.0208 20.8042 19.55 21 19 21H13ZM15 19H19V15H15V19Z"
            fill="currentColor"/>
    </svg>
  ),
  Rect:       p => <Svg {...p}><rect x="4" y="4" width="16" height="16" rx="1"/></Svg>,
  Ellipse:    p => <Svg {...p}><circle cx="12" cy="12" r="8"/></Svg>,
  Line:       p => <Svg {...p}><path d="M5 19L19 5"/></Svg>,
  Polygon:    p => <Svg {...p}><path d="M12 3l2.6 6.3 6.9.6-5.2 4.5 1.6 6.6L12 17.7 6.1 21l1.6-6.6L2.5 9.9l6.9-.6z"/></Svg>,
  Triangle:   p => <Svg {...p}><path d="M12 4l9 16H3z"/></Svg>,
  Pen:        p => <Svg {...p}><path d="M4 20l4-1 10-10a2.83 2.83 0 0 0-4-4L4 15v5zM13 7l4 4"/></Svg>,
  Text:       p => <Svg {...p}><path d="M4 6V4h16v2M12 4v16M8 20h8"/></Svg>,
  Image:      p => <Svg {...p}><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M21 16l-5-5L5 19"/></Svg>,
  Hand:       p => <Svg {...p}><path d="M6 11V6a1.5 1.5 0 013 0v5M9 11V4.5a1.5 1.5 0 013 0V11M12 11V5a1.5 1.5 0 013 0v6M15 11V7a1.5 1.5 0 013 0v7a6 6 0 01-6 6h-1.5a6 6 0 01-5-2.7L4 14a1.8 1.8 0 012.8-2.3L9 14"/></Svg>,
  Comment:    p => <Svg {...p}><path d="M21 12a8 8 0 01-11.7 7.1L4 20l1-4.7A8 8 0 1121 12z"/></Svg>,
  Star:       p => <Svg {...p}><path d="M12 3l2.6 6.3 6.9.6-5.2 4.5 1.6 6.6L12 17.7 6.1 21l1.6-6.6L2.5 9.9l6.9-.6z"/></Svg>,
  Slice:      p => <Svg {...p}><path d="M14 4l-9 9 4 4 9-9zM5 13l-2 7 7-2"/></Svg>,

  Plus:       p => <Svg {...p}><path d="M12 5v14M5 12h14"/></Svg>,
  Minus:      p => <Svg {...p}><path d="M5 12h14"/></Svg>,
  Close:      p => <Svg {...p}><path d="M6 6l12 12M18 6L6 18"/></Svg>,
  Chevron:    p => <Svg {...p}><path d="M6 9l6 6 6-6"/></Svg>,
  Check:      p => <Svg {...p}><path d="M5 12l5 5L20 6"/></Svg>,
  ChevronR:   p => <Svg {...p}><path d="M9 18l6-6-6-6"/></Svg>,
  Search:     p => <Svg {...p}><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></Svg>,
  Eye:        p => <Svg {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></Svg>,
  EyeOff:     p => <Svg {...p}><path d="M3 3l18 18M10.5 10.7A3 3 0 0015 15M9.4 5.6A10.6 10.6 0 0112 5c6.5 0 10 7 10 7a17.4 17.4 0 01-3.5 4.3M6.6 6.6A17.3 17.3 0 002 12s3.5 7 10 7a10 10 0 004.6-1"/></Svg>,
  Lock:       p => <Svg {...p}><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></Svg>,
  Unlock:     p => <Svg {...p}><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 017.9-1"/></Svg>,
  Share:      p => <Svg {...p}><path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v14"/></Svg>,
  Play:       p => <Svg {...p}><path d="M6 4l14 8-14 8V4z"/></Svg>,
  More:       p => <Svg {...p}><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></Svg>,
  MoreV:      p => <Svg {...p}><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></Svg>,
  Grid:       p => <Svg {...p}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></Svg>,
  Layers:     p => <Svg {...p}><path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 18l9 5 9-5"/></Svg>,
  Asset:      p => <Svg {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 8h3v3H8zM13 8h3v3h-3zM8 13h3v3H8zM13 13h3v3h-3z"/></Svg>,
  Home:       p => <Svg {...p}><path d="M3 11l9-8 9 8v10a1 1 0 01-1 1h-5v-7h-6v7H4a1 1 0 01-1-1z"/></Svg>,
  Theme:      p => <Svg {...p}><circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h9"/></Svg>,
  Sliders:    p => <Svg {...p}><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><circle cx="4" cy="12" r="2"/><circle cx="12" cy="10" r="2"/><circle cx="20" cy="14" r="2"/></Svg>,
  // Panel toggle — rounded rectangle with a left sidebar divider.
  PanelLeft:  p => <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></Svg>,

  // Inspector-specific
  // Text-align icons: three horizontal lines of decreasing length anchored
  // to the appropriate side. Used in the Typography section's align toggle.
  AlignLeft:   p => <Svg {...p}><path d="M21 5H3M15 12H3M17 19H3"/></Svg>,
  AlignCenter: p => <Svg {...p}><path d="M21 5H3M17 12H7M19 19H5"/></Svg>,
  AlignRight:  p => <Svg {...p}><path d="M21 5H3M21 12H9M21 19H7"/></Svg>,
  AlignTop:    p => <Svg {...p}><path d="M4 4h16M7 8h4v10H7zM13 8h4v7h-4z"/></Svg>,
  AlignMid:    p => <Svg {...p}><path d="M4 12h16M7 7h4v10H7zM13 9h4v6h-4z"/></Svg>,
  AlignBottom: p => <Svg {...p}><path d="M4 20h16M7 6h4v10H7zM13 9h4v7h-4z"/></Svg>,
  // Distribute icons: equal-gap layout of 3 boxes along an axis.
  DistributeH: p => <SvgFill {...p}>
    <path d="M2 22V2H4V22H2ZM10.5 17V7H13.5V17H10.5ZM20 22V2H22V22H20Z"/>
  </SvgFill>,
  DistributeV: p => <SvgFill {...p}>
    <path d="M2 22V20H22V22H2ZM7 13.5V10.5H17V13.5H7ZM2 4V2H22V4H2Z"/>
  </SvgFill>,
  // Tidy — wand/sparkle suggesting auto layout.
  Tidy: p => <SvgFill {...p}>
    <path d="M8.5 10.5H5C4.45 10.5 3.97917 10.3042 3.5875 9.9125C3.19583 9.52083 3 9.05 3 8.5V5C3 4.45 3.19583 3.97917 3.5875 3.5875C3.97917 3.19583 4.45 3 5 3H8.5C9.05 3 9.52083 3.19583 9.9125 3.5875C10.3042 3.97917 10.5 4.45 10.5 5V8.5C10.5 9.05 10.3042 9.52083 9.9125 9.9125C9.52083 10.3042 9.05 10.5 8.5 10.5ZM5 8.5H8.5V5H5V8.5ZM8.5 21H5C4.45 21 3.97917 20.8042 3.5875 20.4125C3.19583 20.0208 3 19.55 3 19V15.5C3 14.95 3.19583 14.4792 3.5875 14.0875C3.97917 13.6958 4.45 13.5 5 13.5H8.5C9.05 13.5 9.52083 13.6958 9.9125 14.0875C10.3042 14.4792 10.5 14.95 10.5 15.5V19C10.5 19.55 10.3042 20.0208 9.9125 20.4125C9.52083 20.8042 9.05 21 8.5 21ZM5 19H8.5V15.5H5V19ZM19 10.5H15.5C14.95 10.5 14.4792 10.3042 14.0875 9.9125C13.6958 9.52083 13.5 9.05 13.5 8.5V5C13.5 4.45 13.6958 3.97917 14.0875 3.5875C14.4792 3.19583 14.95 3 15.5 3H19C19.55 3 20.0208 3.19583 20.4125 3.5875C20.8042 3.97917 21 4.45 21 5V8.5C21 9.05 20.8042 9.52083 20.4125 9.9125C20.0208 10.3042 19.55 10.5 19 10.5ZM15.5 8.5H19V5H15.5V8.5ZM19 21H15.5C14.95 21 14.4792 20.8042 14.0875 20.4125C13.6958 20.0208 13.5 19.55 13.5 19V15.5C13.5 14.95 13.6958 14.4792 14.0875 14.0875C14.4792 13.6958 14.95 13.5 15.5 13.5H19C19.55 13.5 20.0208 13.6958 20.4125 14.0875C20.8042 14.4792 21 14.95 21 15.5V19C21 19.55 20.8042 20.0208 20.4125 20.4125C20.0208 20.8042 19.55 21 19 21ZM15.5 19H19V15.5H15.5V19Z"/>
  </SvgFill>,

  // Solid filled align variants for inspector position grid
  AlignLeftSolid:   p => <SvgFill {...p}><path d="M2 22V2H4V22H2ZM6 17V14H16V17H6ZM6 10V7H22V10H6Z"/></SvgFill>,
  AlignCenterSolid: p => <SvgFill {...p}><path d="M11 22V17H6V14H11V10H3V7H11V2H13V7H21V10H13V14H18V17H13V22H11Z"/></SvgFill>,
  AlignRightSolid:  p => <SvgFill {...p}><path d="M20 22V2H22V22H20ZM8 17V14H18V17H8ZM2 10V7H18V10H2Z"/></SvgFill>,
  AlignTopSolid:    p => <SvgFill {...p}><path d="M7 22V6H10V22H7ZM14 16V6H17V16H14ZM2 4V2H22V4H2Z"/></SvgFill>,
  AlignMidSolid:    p => <SvgFill {...p}><path d="M7 21V13H2V11H7V3H10V11H14V6H17V11H22V13H17V18H14V13H10V21H7Z"/></SvgFill>,
  AlignBottomSolid: p => <SvgFill {...p}><path d="M2 22V20H22V22H2ZM7 18V2H10V18H7ZM14 18V8H17V18H14Z"/></SvgFill>,

  ArrowRight: p => <Svg {...p}><path d="M5 12h14M13 6l6 6-6 6"/></Svg>,
  ArrowDown:  p => <Svg {...p}><path d="M12 5v14M6 13l6 6 6-6"/></Svg>,
  Corners:    p => <Svg {...p}><path d="M4 10V5a1 1 0 011-1h5M14 4h5a1 1 0 011 1v5M20 14v5a1 1 0 01-1 1h-5M10 20H5a1 1 0 01-1-1v-5"/></Svg>,
  // Pin / absolute-position — a thumbtack.
  Pin:        p => <Svg {...p}><path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6z"/></Svg>,
  Link:       p => <Svg {...p}><path d="M10 14a4 4 0 005.66 0l3-3a4 4 0 10-5.66-5.66l-1.5 1.5M14 10a4 4 0 00-5.66 0l-3 3a4 4 0 105.66 5.66l1.5-1.5"/></Svg>,
  Rotate:     p => <Svg {...p}><path d="M3 3V21"/><path d="M21 21H3"/><path d="M14.5 19.7C14.5 14 10 9.4 4.3 9.4"/></Svg>,
  // Text-box growing modes — auto width, auto height, fixed.
  SizeAutoW:  p => <Svg {...p}><path d="M3 5V19"/><path d="M21 12H7"/><path d="M15 6L21 12L15 18"/></Svg>,
  SizeAutoH:  p => <Svg {...p}><path d="M3 3V21"/><path d="M21 3V21"/><path d="M8 7.67H16"/><path d="M8 12.67H14.33"/><path d="M8 17.67H12.67"/></Svg>,
  SizeFixed:  p => <Svg {...p}><rect x="3.77" y="2.5" width="16.46" height="18" rx="2.08"/><path d="M8.38 6.65H15.61"/><path d="M8.38 11.27H14.08"/><path d="M8.38 15.88H11"/></Svg>,
  // Stroke weight — three bars showing increasing weight (top: thin solid line,
  // middle & bottom: hollow rectangles with progressively taller heights).
  StrokeWeight: ({ size = 16, style = {}, ...rest }) => (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" style={style} {...rest}>
      <mask id="sw-m1" fill="white">
        <rect x="3" y="11" width="12" height="4" rx="1"/>
      </mask>
      <rect x="3" y="11" width="12" height="4" rx="1" stroke="currentColor" strokeWidth="2.2" mask="url(#sw-m1)"/>
      <mask id="sw-m2" fill="white">
        <rect x="3" y="6" width="12" height="3" rx="1"/>
      </mask>
      <rect x="3" y="6" width="12" height="3" rx="1" stroke="currentColor" strokeWidth="2.2" mask="url(#sw-m2)"/>
      <rect x="3.25" y="3.25" width="11.5" height="0.5" rx="0.25" stroke="currentColor" strokeWidth="0.5"/>
    </svg>
  ),
  // Stroke advanced-settings — two vertical sliders with knobs (matches TypeSetting style).
  StrokeSetting: p => <Svg {...p}>
    <line x1="6" y1="4" x2="6" y2="20"/>
    <line x1="17" y1="4" x2="17" y2="20"/>
    <circle cx="17" cy="10" r="3" fill="white"/>
    <circle cx="6" cy="14" r="3" fill="white"/>
  </Svg>,
  // Individual sides — 2x2 grid (one cell filled) representing per-side stroke control.
  IndividualSides: ({ size = 16, style = {}, ...rest }) => (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" style={style} {...rest}>
      <path fillRule="evenodd" clipRule="evenodd"
            d="M2.25 15.75V2.25H15.75V15.75H2.25ZM14.25 14.25V9.75H9.75V14.25H14.25ZM14.25 3.75H9.75V8.25H14.25V3.75ZM3.75 3.75V8.25H8.25V3.75H3.75ZM3.75 14.25H8.25V9.75H3.75V14.25Z"
            fill="currentColor"/>
    </svg>
  ),
  // Stroke join styles — drawn as the inner corner of an L-shape.
  JoinMiter: p => <Svg {...p}><path d="M5 19V5H19"/></Svg>,
  JoinRound: p => <Svg {...p}><path d="M5 19V11a6 6 0 0 1 6-6h8"/></Svg>,
  JoinBevel: p => <Svg {...p}><path d="M5 19V9L9 5H19"/></Svg>,
  // Flip width-profile direction (mirror-handle icon).
  FlipHandle: p => <Svg {...p}><path d="M12 4v16M7 9L4 12l3 3M17 9l3 3-3 3"/></Svg>,
  // Effects popover — drop-shadow (overlapping squares), blur (dot grid), spread (sun-burst).
  Droplet: ({ size = 16, style = {}, ...rest }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style} {...rest}>
      <path d="M4 22C3.45 22 2.97917 21.8042 2.5875 21.4125C2.19583 21.0208 2 20.55 2 20V8C2 7.45 2.19583 6.97917 2.5875 6.5875C2.97917 6.19583 3.45 6 4 6H6V4C6 3.45 6.19583 2.97917 6.5875 2.5875C6.97917 2.19583 7.45 2 8 2H20C20.55 2 21.0208 2.19583 21.4125 2.5875C21.8042 2.97917 22 3.45 22 4V16C22 16.55 21.8042 17.0208 21.4125 17.4125C21.0208 17.8042 20.55 18 20 18H18V20C18 20.55 17.8042 21.0208 17.4125 21.4125C17.0208 21.8042 16.55 22 16 22H4ZM8 16H20V4H8V16Z"
            fill="currentColor"/>
    </svg>
  ),
  BlurDots: p => <SvgFill {...p}>
    <circle cx="6"  cy="6"  r="1.4"/><circle cx="12" cy="6"  r="1.4"/><circle cx="18" cy="6"  r="1.4"/>
    <circle cx="6"  cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/>
    <circle cx="6"  cy="18" r="1.4"/><circle cx="12" cy="18" r="1.4"/><circle cx="18" cy="18" r="1.4"/>
  </SvgFill>,
  Spread: p => <Svg {...p}>
    <circle cx="12" cy="12" r="2.5"/>
    <path d="M12 4v2M12 18v2M4 12h2M18 12h2M6 6l1.5 1.5M16.5 16.5L18 18M6 18l1.5-1.5M16.5 7.5L18 6"/>
  </Svg>,
  // Per-type effect icons (used in the Effects-type dropdown + section row).
  FxDropShadow: p => <Svg {...p}>
    <rect x="3" y="3" width="13" height="13" rx="2"/>
    <path d="M16 9h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-3" opacity="0.55"/>
  </Svg>,
  FxInnerShadow: p => <Svg {...p}>
    <rect x="4" y="4" width="16" height="16" rx="2"/>
    <path d="M6 11V8a2 2 0 0 1 2-2h3"/>
  </Svg>,
  FxLayerBlur: p => <Svg {...p}>
    <rect x="3" y="3" width="18" height="18" rx="3" strokeDasharray="2.5 2"/>
    <rect x="7" y="7" width="10" height="10" rx="1.5"/>
  </Svg>,
  FxBackgroundBlur: p => <Svg {...p}>
    <rect x="3" y="3" width="13" height="13" rx="2" strokeDasharray="2 2" opacity="0.6"/>
    <rect x="9" y="9" width="12" height="12" rx="2"/>
  </Svg>,
  FxNoise: p => <SvgFill {...p}>
    <circle cx="5"  cy="6"  r="1"/>
    <circle cx="10" cy="4"  r="0.9"/>
    <circle cx="16" cy="7"  r="1.1"/>
    <circle cx="20" cy="5"  r="0.8"/>
    <circle cx="7"  cy="11" r="1.1"/>
    <circle cx="13" cy="10" r="0.9"/>
    <circle cx="19" cy="13" r="1"/>
    <circle cx="4"  cy="16" r="0.9"/>
    <circle cx="11" cy="17" r="1.1"/>
    <circle cx="17" cy="19" r="1"/>
    <circle cx="6"  cy="20" r="0.8"/>
    <circle cx="14" cy="21" r="0.9"/>
  </SvgFill>,
  FxGlass: p => <Svg {...p}>
    <path d="M6 5h11l-1 14H7z"/>
    <path d="M9 8l-1 9" opacity="0.6"/>
    <path d="M13 8l-0.8 9" opacity="0.4"/>
  </Svg>,
  // Line-height: capital A with a horizontal bar above and below.
  LineHeight: p => <Svg {...p}><path d="M4 5h16M4 19h16M9 16l3-8 3 8M10.2 13.5h3.6"/></Svg>,
  // Letter-spacing: |A| — vertical bars on either side of an A.
  LetterSpacing: p => <Svg {...p}><path d="M4 5v14M20 5v14M9 16l3-8 3 8M10.2 13.5h3.6"/></Svg>,
  // Vertical-align (top/middle/bottom) — arrow + anchor line.
  VAlignTop: p => <Svg {...p}><path d="M5 5h14M12 9v10M8 13l4-4 4 4"/></Svg>,
  VAlignMid: p => <Svg {...p}><path d="M5 12h14M10 6l2-2 2 2M10 18l2 2 2-2M12 4v6M12 14v6"/></Svg>,
  VAlignBot: p => <Svg {...p}><path d="M5 19h14M12 5v10M8 11l4 4 4-4"/></Svg>,
  // Type setting — two vertical sliders with knobs at different positions.
  // Opens the advanced typography settings popover.
  TypeSetting: p => <Svg {...p}><line x1="6" y1="4" x2="6" y2="20"/><line x1="17" y1="4" x2="17" y2="20"/><circle cx="17" cy="10" r="3" fill="white"/><circle cx="6" cy="14" r="3" fill="white"/></Svg>,
  // Text decoration variants
  Underline: p => <Svg {...p}><path d="M7 4v8a5 5 0 0010 0V4M5 20h14"/></Svg>,
  Strike:    p => <Svg {...p}><path d="M4 12h16M17 6a4 4 0 00-4-2c-2 0-4 1.5-4 4 0 1.4.8 2.5 2 3M7 18a4 4 0 004 2c2 0 4-1.5 4-4 0-.3 0-.6-.1-.9"/></Svg>,
  // Text-case glyphs (used inside the popover, not as standalone icons)
  ListBullet: p => <Svg {...p}><circle cx="5" cy="7" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="5" cy="17" r="1"/><path d="M10 7h10M10 12h10M10 17h10"/></Svg>,
  ListNumber: p => <Svg {...p}><path d="M10 7h10M10 12h10M10 17h10M4 5v4M3 9h2M4 11v.01M5 13h-1c-1 0-1 1 0 1h1c1 0 1 1 0 1H3"/></Svg>,
  Flip:       p => <Svg {...p}><path d="M12 3v18M6 7l-3 5 3 5M18 7l3 5-3 5"/></Svg>,
  // Rotate clockwise (90° CW). Circular arrow with a notch at top-right.
  RotateCW: p => <Svg {...p}><path d="M21 12C21 13.78 20.4722 15.5201 19.4832 17.0001C18.4943 18.4802 17.0887 19.6337 15.4442 20.3149C13.7996 20.9961 11.99 21.1743 10.2442 20.8271C8.49836 20.4798 6.89472 19.6226 5.63604 18.364C4.37737 17.1053 3.5202 15.5016 3.17294 13.7558C2.82567 12.01 3.0039 10.2004 3.68509 8.55585C4.36628 6.91131 5.51983 5.50571 6.99987 4.51677C8.47991 3.52784 10.22 3 12 3C14.52 3 16.93 4 18.74 5.74L21 8M16 8H21V3"/></Svg>,
  // Flip horizontal: two mirrored chevrons either side of a vertical axis.
  FlipH:    p => <Svg {...p}><path d="M12 22V2M3 7L8 12L3 17V7ZM21 7L16 12L21 17V7Z"/></Svg>,
  // Flip vertical: two mirrored chevrons either side of a horizontal axis.
  FlipV:    p => <Svg {...p}><path d="M22 12H2M17 3L12 8L7 3H17ZM17 21L12 16L7 21H17Z"/></Svg>,
  Copy:       p => <Svg {...p}><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></Svg>,
  BlendMode:  p => <Svg {...p}><path d="M12 3a9 9 0 000 18 6 6 0 010-12 6 6 0 000-6z"/></Svg>,
  Download:   p => <Svg {...p}><path d="M12 3v13M7 11l5 5 5-5M4 21h16"/></Svg>,
  Undo:       p => <Svg {...p}><path d="M3 10h11a5 5 0 010 10h-3M3 10l5-5M3 10l5 5"/></Svg>,
  Redo:       p => <Svg {...p}><path d="M21 10H10a5 5 0 000 10h3M21 10l-5-5M21 10l-5 5"/></Svg>,
};

export { Icon };
