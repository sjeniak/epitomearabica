(() => {
  const COLS = 10;
  const ROWS = 20;
  const overlay = document.getElementById("tetrisOverlay");
  const boardEl = document.getElementById("tetrisBoard");
  const nextEl = document.getElementById("tetrisNext");
  if (!overlay || !boardEl || !nextEl) return;

  const linesEl = document.getElementById("tetrisLines");
  const scoreEl = document.getElementById("tetrisScore");
  const tempoEl = document.getElementById("tetrisTempo");
  const closeBtn = document.getElementById("tetrisClose");
  const restartBtn = document.getElementById("tetrisRestart");

  const SHAPES = {
    I: [
      [[0, 1], [1, 1], [2, 1], [3, 1]],
      [[2, 0], [2, 1], [2, 2], [2, 3]],
      [[0, 2], [1, 2], [2, 2], [3, 2]],
      [[1, 0], [1, 1], [1, 2], [1, 3]],
    ],
    O: [
      [[1, 0], [2, 0], [1, 1], [2, 1]],
      [[1, 0], [2, 0], [1, 1], [2, 1]],
      [[1, 0], [2, 0], [1, 1], [2, 1]],
      [[1, 0], [2, 0], [1, 1], [2, 1]],
    ],
    T: [
      [[1, 0], [0, 1], [1, 1], [2, 1]],
      [[1, 0], [1, 1], [2, 1], [1, 2]],
      [[0, 1], [1, 1], [2, 1], [1, 2]],
      [[1, 0], [0, 1], [1, 1], [1, 2]],
    ],
    S: [
      [[1, 0], [2, 0], [0, 1], [1, 1]],
      [[1, 0], [1, 1], [2, 1], [2, 2]],
      [[1, 1], [2, 1], [0, 2], [1, 2]],
      [[0, 0], [0, 1], [1, 1], [1, 2]],
    ],
    Z: [
      [[0, 0], [1, 0], [1, 1], [2, 1]],
      [[2, 0], [1, 1], [2, 1], [1, 2]],
      [[0, 1], [1, 1], [1, 2], [2, 2]],
      [[1, 0], [0, 1], [1, 1], [0, 2]],
    ],
    J: [
      [[0, 0], [0, 1], [1, 1], [2, 1]],
      [[1, 0], [2, 0], [1, 1], [1, 2]],
      [[0, 1], [1, 1], [2, 1], [2, 2]],
      [[1, 0], [1, 1], [0, 2], [1, 2]],
    ],
    L: [
      [[2, 0], [0, 1], [1, 1], [2, 1]],
      [[1, 0], [1, 1], [1, 2], [2, 2]],
      [[0, 1], [1, 1], [2, 1], [0, 2]],
      [[0, 0], [1, 0], [1, 1], [1, 2]],
    ],
  };

  const KEYS = Object.keys(SHAPES);

  const PALETTE = {
    I: { body: ["#d7b57a", "#9a7540"], crease: "#5c4324", glow: "#f3e0b8" },
    O: { body: ["#e3c58a", "#c4a36a"], crease: "#6a4e28", glow: "#fff1c9" },
    T: { body: ["#8a5a32", "#3f2414"], crease: "#1c1008", glow: "#c4a36a" },
    S: { body: ["#c48a4a", "#6d3f1c"], crease: "#2a160c", glow: "#e8c48a" },
    Z: { body: ["#6b3a22", "#2c160e"], crease: "#120804", glow: "#c4a36a" },
    J: { body: ["#a67c4a", "#4a3018"], crease: "#241608", glow: "#e3c58a" },
    L: { body: ["#b8894e", "#5a3518"], crease: "#27180c", glow: "#f0d7a4" },
  };

  const TEMPO = ["Calm", "Brisk", "Hurried", "Fierce", "Ristretto"];

  let grid, piece, nextType, bag, lines, score, over, paused, open;
  let lastDrop = 0;
  let raf = 0;
  let lastFocus = null;

  const emptyGrid = () => Array.from({ length: ROWS }, () => Array(COLS).fill(null));

  const fillBag = () => {
    const next = [...KEYS];
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    bag.push(...next);
  };

  const takeType = () => {
    if (bag.length === 0) fillBag();
    return bag.shift();
  };

  const spawnFrom = (type) => ({ type, rot: 0, x: 3, y: 0 });

  const cellsOf = (p) => SHAPES[p.type][p.rot].map(([x, y]) => [p.x + x, p.y + y]);

  const hits = (p) =>
    cellsOf(p).some(([x, y]) => x < 0 || x >= COLS || y >= ROWS || (y >= 0 && grid[y][x]));

  const lock = () => {
    cellsOf(piece).forEach(([x, y]) => {
      if (y >= 0) grid[y][x] = piece.type;
    });
    let cleared = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
      if (grid[y].every(Boolean)) {
        grid.splice(y, 1);
        grid.unshift(Array(COLS).fill(null));
        cleared += 1;
        y += 1;
      }
    }
    if (cleared) {
      lines += cleared;
      score += [0, 100, 300, 500, 800][cleared] * level();
      updateHud();
    }
    piece = spawnFrom(nextType);
    nextType = takeType();
    if (hits(piece)) {
      over = true;
      paused = true;
    }
  };

  const level = () => Math.floor(lines / 10) + 1;

  const interval = () => Math.max(110, 820 - (level() - 1) * 150);

  const tempoName = () => TEMPO[Math.min(TEMPO.length - 1, level() - 1)];

  const updateHud = () => {
    if (linesEl) linesEl.textContent = String(lines);
    if (scoreEl) scoreEl.textContent = String(score);
    if (tempoEl) tempoEl.textContent = over ? "Settled" : tempoName();
    overlay.dataset.tempo = over ? "Settled" : tempoName();
    overlay.dataset.level = String(level());
  };

  const move = (dx, dy) => {
    if (over || paused) return false;
    const next = { ...piece, x: piece.x + dx, y: piece.y + dy };
    if (hits(next)) return false;
    piece = next;
    return true;
  };

  const rotate = () => {
    if (over || paused) return;
    const next = { ...piece, rot: (piece.rot + 1) % 4 };
    const kicks = [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1]];
    for (const [kx, ky] of kicks) {
      const tried = { ...next, x: piece.x + kx, y: piece.y + ky };
      if (!hits(tried)) {
        piece = tried;
        return;
      }
    }
  };

  const hardDrop = () => {
    if (over || paused) return;
    let dist = 0;
    while (move(0, 1)) dist += 1;
    score += dist * 2;
    lock();
    updateHud();
  };

  const softDrop = () => {
    if (!move(0, 1)) lock();
    else score += 1;
    updateHud();
  };

  const drawBean = (ctx, cx, cy, size, type, ghost) => {
    const pal = PALETTE[type] || PALETTE.T;
    const seed = Math.abs(Math.sin(cx * 12.9898 + cy * 78.233) * 43758.5453);
    const rot = (seed % 1) * 0.16 - 0.08;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.globalAlpha = ghost ? 0.28 : 1;
    const r = size * 0.42;
    const rx = r;
    const ry = r * 0.94;
    ctx.beginPath();
    ctx.ellipse(0, size * 0.04, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.fill();
    const g = ctx.createRadialGradient(-rx * 0.28, -ry * 0.32, r * 0.08, 0, 0, r);
    g.addColorStop(0, pal.glow);
    g.addColorStop(0.42, pal.body[0]);
    g.addColorStop(1, pal.body[1]);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = ghost ? "rgba(196,163,106,0.45)" : pal.body[0];
    ctx.lineWidth = Math.max(1, size * 0.045);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-rx * 0.22, -ry * 0.42);
    ctx.quadraticCurveTo(rx * 0.08, 0, -rx * 0.12, ry * 0.48);
    ctx.strokeStyle = pal.crease;
    ctx.lineWidth = Math.max(1.4, size * 0.08);
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(-rx * 0.26, -ry * 0.28, rx * 0.22, ry * 0.18, -0.35, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,245,220,0.28)";
    ctx.fill();
    ctx.restore();
  };

  const isPhone = () => window.matchMedia("(max-width: 720px)").matches;

  const fitCanvas = (canvas, cssW, cssH) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  };

  const drawBoard = () => {
    const stage = document.querySelector(".tetris-stage");
    let w;
    let h;
    if (isPhone() && stage) {
      const sw = stage.clientWidth;
      const sh = stage.clientHeight;
      if (sw < 40 || sh < 40) return;
      w = Math.floor(Math.min(sw, sh / 2));
      h = w * 2;
      boardEl.style.width = `${w}px`;
      boardEl.style.height = `${h}px`;
      boardEl.style.left = `${Math.max(0, Math.floor((sw - w) / 2))}px`;
      boardEl.style.top = `${Math.max(0, Math.floor((sh - h) / 2))}px`;
    } else {
      boardEl.style.width = "";
      boardEl.style.height = "";
      boardEl.style.left = "";
      boardEl.style.top = "";
      const rect = boardEl.getBoundingClientRect();
      w = Math.max(160, rect.width);
      h = w * 2;
    }
    const ctx = fitCanvas(boardEl, w, h);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#070605";
    ctx.fillRect(0, 0, w, h);
    const cell = w / COLS;
    ctx.strokeStyle = "rgba(196,163,106,0.08)";
    ctx.lineWidth = 1;
    for (let x = 1; x < COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * cell, 0);
      ctx.lineTo(x * cell, h);
      ctx.stroke();
    }
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (grid[y][x]) {
          drawBean(ctx, (x + 0.5) * cell, (y + 0.5) * cell, cell, grid[y][x], false);
        }
      }
    }
    if (piece && !over) {
      let ghost = { ...piece };
      while (!hits({ ...ghost, y: ghost.y + 1 })) ghost.y += 1;
      if (ghost.y !== piece.y) {
        cellsOf(ghost).forEach(([x, y]) => {
          if (y >= 0) drawBean(ctx, (x + 0.5) * cell, (y + 0.5) * cell, cell, piece.type, true);
        });
      }
      cellsOf(piece).forEach(([x, y]) => {
        if (y >= 0) drawBean(ctx, (x + 0.5) * cell, (y + 0.5) * cell, cell, piece.type, false);
      });
    }
    if (over) {
      ctx.fillStyle = "rgba(7,6,5,0.62)";
      ctx.fillRect(0, h * 0.38, w, h * 0.22);
      ctx.fillStyle = "#e3c58a";
      ctx.font = "italic 22px 'Cormorant Garamond', serif";
      ctx.textAlign = "center";
      ctx.fillText("The roast is spent", w / 2, h * 0.5);
      ctx.font = "12px Outfit, sans-serif";
      ctx.fillStyle = "rgba(239,228,210,0.7)";
      ctx.fillText("New roast to play again", w / 2, h * 0.5 + 28);
    }
  };

  const drawNext = () => {
    const rect = nextEl.getBoundingClientRect();
    const side = Math.max(36, Math.round(rect.width || 56));
    const ctx = fitCanvas(nextEl, side, side);
    ctx.clearRect(0, 0, side, side);
    ctx.fillStyle = "#070605";
    ctx.fillRect(0, 0, side, side);
    const cells = SHAPES[nextType][0];
    const xs = cells.map((c) => c[0]);
    const ys = cells.map((c) => c[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = maxX - minX + 1;
    const spanY = maxY - minY + 1;
    const pad = side * 0.14;
    const inner = Math.max(8, side - pad * 2);
    const cell = inner / Math.max(spanX, spanY, 2);
    const ox = (side - spanX * cell) / 2;
    const oy = (side - spanY * cell) / 2;
    cells.forEach(([x, y]) => {
      drawBean(
        ctx,
        ox + (x - minX + 0.5) * cell,
        oy + (y - minY + 0.5) * cell,
        cell,
        nextType,
        false
      );
    });
  };

  const render = () => {
    drawBoard();
    drawNext();
  };

  const tick = (now) => {
    if (open && !paused && !over && now - lastDrop >= interval()) {
      if (!move(0, 1)) lock();
      lastDrop = now;
      updateHud();
    }
    if (open) render();
    raf = requestAnimationFrame(tick);
  };

  const reset = () => {
    grid = emptyGrid();
    bag = [];
    fillBag();
    nextType = takeType();
    piece = spawnFrom(takeType());
    lines = 0;
    score = 0;
    over = false;
    paused = false;
    lastDrop = performance.now();
    updateHud();
    render();
  };

  const setOpen = (value) => {
    open = value;
    overlay.hidden = !value;
    overlay.classList.toggle("is-open", value);
    document.body.style.overflow = value || document.querySelector(".nav-drawer.is-open") ? "hidden" : "";
    if (value) {
      lastFocus = document.activeElement;
      overlay.focus({ preventScroll: true });
      cancelAnimationFrame(raf);
      requestAnimationFrame(() => {
        reset();
        raf = requestAnimationFrame(tick);
      });
    } else {
      paused = true;
      cancelAnimationFrame(raf);
      if (location.hash === "#fun") history.replaceState(null, "", location.pathname + location.search);
      if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
    }
  };

  document.querySelectorAll("[data-tetris-open]").forEach((el) => {
    el.addEventListener("click", (event) => {
      event.preventDefault();
      setOpen(true);
    });
  });

  closeBtn?.addEventListener("click", () => setOpen(false));
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) setOpen(false);
  });
  restartBtn?.addEventListener("click", reset);

  const holdTimers = new Map();

  const act = (name) => {
    if (name === "left") move(-1, 0);
    else if (name === "right") move(1, 0);
    else if (name === "down") softDrop();
    else if (name === "rotate") rotate();
    else if (name === "drop") hardDrop();
    render();
  };

  const startHold = (name, btn) => {
    act(name);
    btn.classList.add("is-held");
    stopHold(name);
    const delay = name === "rotate" || name === "drop" ? 99999 : 280;
    const repeat = name === "down" ? 70 : 90;
    const t = window.setTimeout(() => {
      const id = window.setInterval(() => act(name), repeat);
      holdTimers.set(name, id);
    }, delay);
    holdTimers.set(name + "-d", t);
  };

  const stopHold = (name, btn) => {
    btn?.classList.remove("is-held");
    const id = holdTimers.get(name);
    const d = holdTimers.get(name + "-d");
    if (id) clearInterval(id);
    if (d) clearTimeout(d);
    holdTimers.delete(name);
    holdTimers.delete(name + "-d");
  };

  overlay.querySelectorAll("[data-tetris]").forEach((btn) => {
    const name = btn.getAttribute("data-tetris");
    const down = (event) => {
      event.preventDefault();
      startHold(name, btn);
    };
    const up = (event) => {
      event.preventDefault();
      stopHold(name, btn);
    };
    btn.addEventListener("pointerdown", down);
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointerleave", up);
    btn.addEventListener("pointercancel", up);
    btn.addEventListener("contextmenu", (event) => event.preventDefault());
  });

  document.addEventListener("keydown", (event) => {
    if (!open) return;
    const map = {
      ArrowLeft: "left",
      ArrowRight: "right",
      ArrowDown: "down",
      ArrowUp: "rotate",
      KeyZ: "rotate",
      KeyX: "rotate",
      Space: "drop",
    };
    if (event.code === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.code === "KeyP") {
      paused = !paused;
      event.preventDefault();
      return;
    }
    if (map[event.code]) {
      event.preventDefault();
      act(map[event.code]);
    }
  });

  window.addEventListener("resize", () => {
    if (open) render();
  });
  window.visualViewport?.addEventListener("resize", () => {
    if (open) render();
  });
  const stageEl = document.querySelector(".tetris-stage");
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => {
      if (open) render();
    });
    if (stageEl) ro.observe(stageEl);
    ro.observe(nextEl);
  }

  if (location.hash === "#fun") setOpen(true);

  window.__epitomeTetris = {
    open: () => setOpen(true),
    close: () => setOpen(false),
    reset,
    state: () => ({ lines, score, level: level(), interval: interval(), over, tempo: tempoName() }),
    setLines: (count) => {
      lines = Math.max(0, count | 0);
      updateHud();
      render();
      return window.__epitomeTetris.state();
    },
  };
})();
