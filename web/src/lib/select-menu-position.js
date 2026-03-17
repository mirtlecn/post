const DESKTOP_MENU_GAP = 10;
const MOBILE_MENU_GAP = 4;
const MOBILE_BREAKPOINT = 768;
const VIEWPORT_PADDING = 16;
const FALLBACK_MENU_HEIGHT = 360;

export function computeSelectMenuPosition({
  rect,
  menuHeight = FALLBACK_MENU_HEIGHT,
  viewportWidth,
  viewportHeight,
}) {
  const width = rect.width;
  const maxLeft = Math.max(VIEWPORT_PADDING, viewportWidth - width - VIEWPORT_PADDING);
  const left = Math.min(Math.max(rect.left, VIEWPORT_PADDING), maxLeft);
  const preferTop = viewportWidth <= MOBILE_BREAKPOINT;
  const menuGap = preferTop ? MOBILE_MENU_GAP : DESKTOP_MENU_GAP;
  const topSpace = rect.top - VIEWPORT_PADDING;
  const bottomSpace = viewportHeight - rect.bottom - VIEWPORT_PADDING;
  const canOpenTop = topSpace >= menuHeight + menuGap;
  const shouldOpenTop = preferTop ? canOpenTop || topSpace > bottomSpace : false;
  const top = shouldOpenTop
    ? Math.max(VIEWPORT_PADDING, rect.top - menuHeight - menuGap)
    : Math.min(viewportHeight - menuHeight - VIEWPORT_PADDING, rect.bottom + menuGap);

  return {
    left,
    top: Math.max(VIEWPORT_PADDING, top),
    width,
  };
}
