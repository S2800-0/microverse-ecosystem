// Terrain for a map painting, traced by hand as simple shapes (in % of the map):
// the stream as a thick line, boulders as circles, tree stands as polygons.
// It's rasterised to a grid so animals know where they can walk and where the water is.

export const T = { GRASS: 0, WATER: 1, ROCK: 2, TREE: 3 };

// traced from maps/spring.png (1672×941); the other season maps reuse it because seasons are tints
export const SPRING_TERRAIN = {
  aspect: 1672 / 941,
  water: { width: 4.2, points: [[27, 0], [26, 6], [18, 14], [12, 22], [11, 31], [14, 40], [19, 49], [27, 58], [37, 66], [47, 72], [56, 77], [66, 82], [75, 85], [84, 88], [91, 93], [100, 99]] },
  rocks: [[81, 22, 5.5], [90, 58, 5], [36, 59, 2.6], [43, 12, 2.6], [60, 8, 2.4], [69, 78, 2.2], [24, 91, 7], [5, 70, 5], [56, 85, 2]],
  trees: [
    [[0, 0], [9, 0], [8, 30], [6, 55], [10, 72], [0, 80]],          // left edge
    [[0, 62], [12, 62], [22, 70], [34, 74], [40, 100], [0, 100]],   // bottom-left forest
    [[33, 0], [100, 0], [100, 6], [70, 10], [50, 9], [33, 5]],      // top band
    [[73, 8], [86, 8], [86, 28], [73, 26]],                          // conifer stand, upper right
    [[93, 0], [100, 0], [100, 62], [94, 55]],                        // right edge
    [[45, 74], [60, 80], [62, 100], [44, 100]],                      // birches below the stream
  ],
};

// traced from maps/v2/spring.png; summer, autumn, winter and drought share this layout (checked by difference-blending)
export const MEADOW_V2_TERRAIN = {
  aspect: 1672 / 941,
  water: [
    { width: 3.2, points: [[37, 0], [35, 5], [31, 9], [28, 14], [23.5, 18], [19, 20.5], [15, 24], [11.5, 26.5], [9.5, 31], [7, 34], [0, 36]] },
    { width: 3.6, points: [[100, 55], [95, 57.5], [93, 61], [96.5, 65], [94, 70], [87.5, 73], [82.5, 76], [78, 79], [75, 84], [74.5, 89], [70, 93.5], [65, 97], [60, 100]] },
  ],
  rocks: [[84, 35, 5.5], [89.5, 38.5, 3.5], [35, 78, 3.5], [26, 84, 4.5], [32.5, 88, 3], [25.5, 5, 2], [32, 10, 1.8]],
  trees: [
    [[0, 0], [22, 0], [20, 10], [12, 20], [10, 40], [14, 45], [22, 48], [26, 60], [32, 68], [30, 76], [40, 82], [42, 100], [0, 100]],
    [[36, 0], [48, 0], [48, 14], [40, 15], [36, 10]],
    [[52, 0], [60, 0], [60, 8], [52, 8]],
    [[55, 0], [100, 0], [100, 50], [96, 48], [90, 45], [82, 31], [72, 33], [64, 26], [62, 18], [56, 18]],
    [[86, 72], [100, 68], [100, 100], [84, 100]],
  ],
};

export function buildTerrain(spec = SPRING_TERRAIN, cols = 160) {
  if (!Number.isSafeInteger(cols) || cols < 8 || cols > 512 || !Number.isFinite(spec.aspect) || spec.aspect <= 0) throw new Error('Invalid terrain dimensions.');
  const rows = Math.round(cols / spec.aspect);
  const cells = new Uint8Array(cols * rows);
  const cx = (i) => ((i % cols) + 0.5) / cols * 100, cy = (i) => (Math.floor(i / cols) + 0.5) / rows * 100;
  const ax = spec.aspect; // distances measured in screen-like units (x stretched by aspect)
  const distSeg = (px, py, [x0, y0], [x1, y1]) => {
    const vx = (x1 - x0) * ax, vy = y1 - y0, wx = (px - x0) * ax, wy = py - y0;
    const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy || 1)));
    return Math.hypot(wx - vx * t, wy - vy * t) / ax;
  };
  const inPoly = (x, y, poly) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  for (let i = 0; i < cells.length; i++) {
    const x = cx(i), y = cy(i);
    if (spec.trees.some(p => inPoly(x, y, p))) cells[i] = T.TREE;
    if (spec.rocks.some(([rx, ry, r]) => Math.hypot(x - rx, (y - ry) / ax) < r)) cells[i] = T.ROCK;
    for (const w of [].concat(spec.water)) {
      const pts = w.points;
      for (let k = 0; k < pts.length - 1; k++) if (distSeg(x, y, pts[k], pts[k + 1]) < w.width / 2) { cells[i] = T.WATER; break; }
    }
  }
  // one-cell margin so bodies don't overlap obstacles
  const blocked = new Uint8Array(cells.length);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    let b = 0;
    for (let dy = -1; dy <= 1 && !b; dy++) for (let dx = -1; dx <= 1 && !b; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && cells[ny * cols + nx] !== T.GRASS) b = 1;
    }
    blocked[y * cols + x] = b;
  }
  // walkable grass cells two cells from water: places to drink, with the direction of the water
  const shore = [];
  for (let y = 2; y < rows - 2; y++) for (let x = 2; x < cols - 2; x++) {
    if (blocked[y * cols + x]) continue;
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
      if (cells[(y + dy) * cols + x + dx] === T.WATER) { shore.push({ x: (x + 0.5) / cols * 100, y: (y + 0.5) / rows * 100, face: dx > 0 ? 1 : dx < 0 ? -1 : (x < cols / 2 ? -1 : 1) }); break; }
    }
  }
  const at = (xPct, yPct) => {
    const x = Math.min(cols - 1, Math.max(0, Math.floor(xPct / 100 * cols)));
    const y = Math.min(rows - 1, Math.max(0, Math.floor(yPct / 100 * rows)));
    return y * cols + x;
  };
  return {
    cols, rows, cells, shore,
    kind: (x, y) => cells[at(x, y)],
    walkable: (x, y) => Number.isFinite(x) && Number.isFinite(y) && x>=0 && y>=0 && x<100 && y<100 && !blocked[at(x, y)],
    clear(x0, y0, x1, y1) {
      if (![x0,y0,x1,y1].every(Number.isFinite) || [x0,y0,x1,y1].some(v=>v<0||v>=100)) return false;
      const n = Math.ceil(Math.hypot((x1 - x0) / 100 * cols, (y1 - y0) / 100 * rows) * 2) + 1;
      for (let i = 0; i <= n; i++) { const t = i / n; if (blocked[at(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)]) return false; }
      return true;
    },
    debugCanvas() {
      const d = document.createElement("canvas"); d.width = cols; d.height = rows;
      const c = d.getContext("2d"), im = c.createImageData(cols, rows);
      const COL = [[0, 0, 0, 0], [40, 120, 255, 150], [230, 230, 230, 170], [0, 90, 30, 150]];
      for (let i = 0; i < cells.length; i++) for (let j = 0; j < 4; j++) im.data[i * 4 + j] = COL[cells[i]][j];
      c.putImageData(im, 0, 0); return d;
    },
  };
}
