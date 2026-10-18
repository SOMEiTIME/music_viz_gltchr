const focusMargin = 0.04;

//returns drawImage's source and destination rects: a vw x vh video cropped to fill a
//cw x ch canvas at its real shape, centered on focus ({ left, right } as fractions of the
//video's width, or null for the center). If the canvas is too narrow for the whole focus
//column (a portrait phone), it shows all of the column and letterboxes instead
export function videoDrawRect(vw, vh, cw, ch, focus) {
  if (!vw || !vh) {
    return null;
  }

  const canvasAspect = cw / ch;
  let sw = vw;
  let sh = vw / canvasAspect;
  if (canvasAspect < vw / vh) {
    sh = vh;
    sw = vh * canvasAspect;
  }

  let centerX = vw / 2;
  let dh = ch;
  if (focus) {
    const columnWidth = (focus.right - focus.left + focusMargin * 2) * vw;
    centerX = (focus.left + focus.right) / 2 * vw;
    if (sw < columnWidth) {
      sw = Math.min(vw, columnWidth);
      sh = vh;
      dh = cw * sh / sw;
    }
  }

  const sx = Math.min(vw - sw, Math.max(0, centerX - sw / 2));
  const sy = (vh - sh) / 2;
  return [sx, sy, sw, sh, 0, (ch - dh) / 2, cw, dh];
}
