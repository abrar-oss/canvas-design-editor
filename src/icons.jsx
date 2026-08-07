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
  Cursor:     p => <Svg {...p}><path d="M4.0369 4.6879C3.99743 4.59682 3.98626 4.49597 4.00484 4.39846C4.02342 4.30094 4.07088 4.21127 4.14108 4.14108C4.21127 4.07088 4.30094 4.02342 4.39846 4.00484C4.49597 3.98626 4.59682 3.99743 4.6879 4.0369L20.6879 10.5369C20.7852 10.5765 20.8675 10.6458 20.9232 10.7349C20.9789 10.824 21.0051 10.9283 20.9981 11.0331C20.9912 11.138 20.9514 11.2379 20.8844 11.3188C20.8174 11.3997 20.7266 11.4575 20.6249 11.4839L14.5009 13.0639C14.1549 13.1529 13.839 13.3329 13.5861 13.5852C13.3332 13.8376 13.1526 14.1531 13.0629 14.4989L11.4839 20.6249C11.4575 20.7266 11.3997 20.8174 11.3188 20.8844C11.2379 20.9514 11.138 20.9912 11.0331 20.9981C10.9283 21.0051 10.824 20.9789 10.7349 20.9232C10.6458 20.8675 10.5765 20.7852 10.5369 20.6879L4.0369 4.6879Z"/></Svg>,
  Move:       p => <Svg {...p}><path d="M5 9l-2 3 2 3M9 5l3-2 3 2M15 19l-3 2-3-2M19 9l2 3-2 3M12 3v18M3 12h18"/></Svg>,
  Frame:      p => <Svg {...p}><path d="M4 8h16M4 16h16M8 4v16M16 4v16"/></Svg>,
  // Auto-layout frame — stroked outline (matches the Frame icon's 1.5 weight):
  // a frame split into a tall left column and a stacked right column.
  AutoLayout: p => <Svg {...p}><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M10 4v16M10 12h10"/></Svg>,
  Rect:       p => <Svg {...p}><rect x="4" y="4" width="16" height="16" rx="1"/></Svg>,
  Ellipse:    p => <Svg {...p}><circle cx="12" cy="12" r="8"/></Svg>,
  Line:       p => <Svg {...p}><path d="M5 19L19 5"/></Svg>,
  // Scale tool — a corner with a diagonal double arrow (proportional resize).
  Scale:      p => <Svg {...p}><path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7"/></Svg>,
  Polygon:    p => <Svg {...p}><path d="M12 3L19.8 7.5L19.8 16.5L12 21L4.2 16.5L4.2 7.5Z"/></Svg>,
  Triangle:   p => <Svg {...p}><path d="M12 4l9 16H3z"/></Svg>,
  Pen:        p => <Svg {...p}><path d="M18 13L16.625 6.12601C16.5876 5.93899 16.4975 5.76656 16.3653 5.62907C16.2331 5.49157 16.0644 5.39475 15.879 5.35001L3.23501 2.02801C3.06843 1.98773 2.89431 1.99094 2.72933 2.03733C2.56436 2.08371 2.41407 2.17172 2.29289 2.29289C2.17172 2.41407 2.08371 2.56436 2.03733 2.72933C1.99094 2.89431 1.98773 3.06843 2.02801 3.23501L5.35001 15.879C5.39475 16.0644 5.49157 16.2331 5.62907 16.3653C5.76656 16.4975 5.93899 16.5876 6.12601 16.625L13 18M2.30001 2.30001L9.58601 9.58601M15.707 21.293C15.5195 21.4805 15.2652 21.5858 15 21.5858C14.7348 21.5858 14.4805 21.4805 14.293 21.293L12.707 19.707C12.5195 19.5195 12.4142 19.2652 12.4142 19C12.4142 18.7348 12.5195 18.4805 12.707 18.293L18.293 12.707C18.4805 12.5195 18.7348 12.4142 19 12.4142C19.2652 12.4142 19.5195 12.5195 19.707 12.707L21.293 14.293C21.4805 14.4805 21.5858 14.7348 21.5858 15C21.5858 15.2652 21.4805 15.5195 21.293 15.707L15.707 21.293ZM13 11C13 12.1046 12.1046 13 11 13C9.89544 13 9.00001 12.1046 9.00001 11C9.00001 9.89544 9.89544 9.00001 11 9.00001C12.1046 9.00001 13 9.89544 13 11Z"/></Svg>,
  Text:       p => <Svg {...p}><path d="M4 6V4h16v2M12 4v16M8 20h8"/></Svg>,
  Image:      p => <Svg {...p}>
    <path d="M12 22C9.34784 22 6.8043 20.9464 4.92893 19.0711C3.05357 17.1957 2 14.6522 2 12C2 9.34784 3.05357 6.8043 4.92893 4.92893C6.8043 3.05357 9.34784 2 12 2C14.6522 2 17.1957 2.94821 19.0711 4.63604C20.9464 6.32387 22 8.61305 22 11C22 12.3261 21.4732 13.5979 20.5355 14.5355C19.5979 15.4732 18.3261 16 17 16H14.75C14.425 16 14.1064 16.0905 13.83 16.2614C13.5535 16.4322 13.3301 16.6767 13.1848 16.9674C13.0394 17.2581 12.9779 17.5835 13.0071 17.9072C13.0363 18.2308 13.155 18.54 13.35 18.8L13.65 19.2C13.845 19.46 13.9637 19.7692 13.9929 20.0928C14.0221 20.4165 13.9606 20.7419 13.8152 21.0326C13.6699 21.3233 13.4465 21.5678 13.17 21.7386C12.8936 21.9095 12.575 22 12.25 22H12Z"/>
    <circle cx="13.5" cy="6.5" r="1.15" fill="currentColor" stroke="none"/>
    <circle cx="17.5" cy="10.5" r="1.15" fill="currentColor" stroke="none"/>
    <circle cx="6.5" cy="12.5" r="1.15" fill="currentColor" stroke="none"/>
    <circle cx="8.5" cy="7.5" r="1.15" fill="currentColor" stroke="none"/>
  </Svg>,
  Hand:       p => <Svg {...p}><path d="M18.0001 11V6C18.0001 5.46957 17.7894 4.96086 17.4143 4.58579C17.0392 4.21071 16.5305 4 16.0001 4C15.4697 4 14.961 4.21071 14.5859 4.58579C14.2108 4.96086 14.0001 5.46957 14.0001 6M14.0001 10V4C14.0001 3.46957 13.7894 2.96086 13.4143 2.58579C13.0392 2.21071 12.5305 2 12.0001 2C11.4697 2 10.961 2.21071 10.5859 2.58579C10.2108 2.96086 10.0001 3.46957 10.0001 4V6M10.0001 6V10.5M10.0001 6C10.0001 5.46957 9.78939 4.96086 9.41432 4.58579C9.03924 4.21071 8.53054 4 8.0001 4C7.46967 4 6.96096 4.21071 6.58589 4.58579C6.21082 4.96086 6.0001 5.46957 6.0001 6V14M18.0001 8C18.0001 7.46957 18.2108 6.96086 18.5859 6.58579C18.961 6.21071 19.4697 6 20.0001 6C20.5305 6 21.0392 6.21071 21.4143 6.58579C21.7894 6.96086 22.0001 7.46957 22.0001 8V14C22.0001 16.1217 21.1572 18.1566 19.657 19.6569C18.1567 21.1571 16.1218 22 14.0001 22H12.0001C9.2001 22 7.5001 21.14 6.0101 19.66L2.4101 16.06C2.06604 15.6789 1.88169 15.1802 1.89523 14.6669C1.90876 14.1537 2.11915 13.6653 2.48282 13.303C2.8465 12.9406 3.3356 12.7319 3.84888 12.7202C4.36215 12.7085 4.86027 12.8946 5.2401 13.24L7.0001 15"/></Svg>,
  Comment:    p => <Svg {...p}><path d="M21 12a8 8 0 01-11.7 7.1L4 20l1-4.7A8 8 0 1121 12z"/></Svg>,
  Star:       p => <Svg {...p}><path d="M12 3l2.6 6.3 6.9.6-5.2 4.5 1.6 6.6L12 17.7 6.1 21l1.6-6.6L2.5 9.9l6.9-.6z"/></Svg>,
  // Rating — a clean 5-point star (used by the Rating tool in the Swatch group).
  Rating:     p => <Svg {...p}><path d="M11.5248 2.29489C11.5687 2.20635 11.6364 2.13183 11.7203 2.07972C11.8042 2.02761 11.9011 2 11.9998 2C12.0986 2 12.1955 2.02761 12.2794 2.07972C12.3633 2.13183 12.431 2.20635 12.4748 2.29489L14.7848 6.97389C14.937 7.28186 15.1617 7.5483 15.4395 7.75035C15.7173 7.95239 16.04 8.08401 16.3798 8.13389L21.5458 8.88989C21.6437 8.90408 21.7357 8.94537 21.8113 9.00909C21.887 9.07282 21.9433 9.15644 21.9739 9.2505C22.0045 9.34456 22.0081 9.4453 21.9844 9.54133C21.9607 9.63736 21.9107 9.72485 21.8398 9.79389L18.1038 13.4319C17.8575 13.672 17.6731 13.9684 17.5667 14.2955C17.4602 14.6227 17.4349 14.9708 17.4928 15.3099L18.3748 20.4499C18.3921 20.5477 18.3816 20.6485 18.3443 20.7406C18.3071 20.8327 18.2448 20.9125 18.1644 20.9709C18.084 21.0293 17.9888 21.0639 17.8897 21.0708C17.7906 21.0777 17.6915 21.0566 17.6038 21.0099L12.9858 18.5819C12.6816 18.4221 12.343 18.3386 11.9993 18.3386C11.6557 18.3386 11.3171 18.4221 11.0128 18.5819L6.39585 21.0099C6.30818 21.0563 6.20924 21.0772 6.1103 21.0701C6.01135 21.0631 5.91636 21.0285 5.83614 20.9701C5.75592 20.9118 5.69368 20.8321 5.6565 20.7401C5.61933 20.6482 5.6087 20.5476 5.62585 20.4499L6.50685 15.3109C6.56504 14.9716 6.53983 14.6233 6.43338 14.2959C6.32694 13.9686 6.14245 13.672 5.89585 13.4319L2.15985 9.79489C2.08844 9.72593 2.03784 9.63829 2.01381 9.54197C1.98978 9.44565 1.99328 9.34451 2.02393 9.25008C2.05457 9.15566 2.11111 9.07174 2.18712 9.00788C2.26313 8.94402 2.35555 8.90279 2.45385 8.88889L7.61885 8.13389C7.9591 8.08439 8.28224 7.95295 8.56043 7.75088C8.83863 7.54881 9.06355 7.28216 9.21585 6.97389L11.5248 2.29489Z"/></Svg>,
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
  // Distribute icons: three equally-spaced boxes along an axis. The boxes are
  // inset from the edges so there is whitespace around them (rather than solid
  // full-height bars) — reading as "objects distributed with equal spacing".
  DistributeH: p => <SvgFill {...p}>
    <rect x="3.75"  y="5" width="3" height="14" rx="1"/>
    <rect x="10.5"  y="5" width="3" height="14" rx="1"/>
    <rect x="17.25" y="5" width="3" height="14" rx="1"/>
  </SvgFill>,
  DistributeV: p => <SvgFill {...p}>
    <rect x="5" y="3.75"  width="14" height="3" rx="1"/>
    <rect x="5" y="10.5"  width="14" height="3" rx="1"/>
    <rect x="5" y="17.25" width="14" height="3" rx="1"/>
  </SvgFill>,
  // Tidy — 2×2 grid of boxes with whitespace (auto-arrange into a grid).
  Tidy: p => <SvgFill {...p}>
    <rect x="5"  y="5"  width="6" height="6" rx="1.2"/>
    <rect x="13" y="5"  width="6" height="6" rx="1.2"/>
    <rect x="5"  y="13" width="6" height="6" rx="1.2"/>
    <rect x="13" y="13" width="6" height="6" rx="1.2"/>
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
