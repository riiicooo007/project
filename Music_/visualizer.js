/* ==========================================================
   Web Audio Visualizer
   - Web Audio API (AnalyserNode) + HTML5 Canvas
   - Thanh bass đối xứng: bass ở giữa, treble ra hai bên,
     mỗi thanh nảy lên/xuống đối xứng qua đường trung tâm
   ========================================================== */
(() => {
  "use strict";

  /* ---------- DOM ---------- */
  const $ = (id) => document.getElementById(id);
  const canvas = $("viz");
  const g = canvas.getContext("2d");
  const audio = $("audio");
  const bgEl = $("bg");

  const ui = {
    bgLayers: document.querySelectorAll("#bg .bg-layer"),
    bgThumbs: $("bgThumbs"),
    bgCount: $("bgCount"),
    bgPrev: $("bgPrev"),
    bgNext: $("bgNext"),
    bgClear: $("bgClear"),
    panel: $("panel"),
    hint: $("hint"),
    dropzone: $("dropzone"),
    trackName: $("trackName"),
    status: $("status"),
    playBtn: $("playBtn"),
    progress: $("progress"),
    volume: $("volume"),
    curTime: $("curTime"),
    durTime: $("durTime"),
    audioInput: $("audioInput"),
    bgInput: $("bgInput"),
    settingsBtn: $("settingsBtn"),
    settings: $("settings"),
    hideBtn: $("hideBtn"),
    showPanel: $("showPanel"),
    palette: $("palette"),
    colors: [$("color0"), $("color1"), $("color2")],
    prevBtn: $("prevBtn"),
    nextBtn: $("nextBtn"),
    shuffleBtn: $("shuffleBtn"),
    repeatBtn: $("repeatBtn"),
    queueBtn: $("queueBtn"),
    queue: $("queue"),
    queueList: $("queueList"),
    queueEmpty: $("queueEmpty"),
    queueCount: $("queueCount"),
    clearQueueBtn: $("clearQueueBtn"),
    flash: $("flash"),
    modeSelect: $("mode"),
    fullscreenBtn: $("fullscreenBtn"),
  };

  /* ---------- Cài đặt ---------- */
  const PALETTES = {
    neon: ["#22d3ee", "#e879f9", "#7c3aed"],
    cyan: ["#67e8f9", "#22d3ee", "#2563eb"],
    magenta: ["#f9a8d4", "#e879f9", "#7c3aed"],
    sunset: ["#fbbf24", "#fb7185", "#a855f7"],
    aurora: ["#4ade80", "#22d3ee", "#3b82f6"],
  };

  const DEFAULTS = {
    autoBg: false,
    bgInterval: 15,
    barWidth: 6,
    gap: 3,
    glow: 25,
    sensitivity: 1.2,
    smoothing: 0.8,
    overlay: 0.55,
    volume: 0.8,
    shuffle: false,
    repeat: "off",
    mode: "bars", // 'bars' | 'radial' | 'wave'
    fxIntensity: 1,
    flash: true,
    shake: true,
    particles: true,
    autoColor: false,
    autoHide: true,
    palette: "neon",
    colors: PALETTES.neon.slice(),
  };

  const STORE_KEY = "audio-visualizer-settings-v1";
  const settings = loadSettings();

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
      return Object.assign({}, DEFAULTS, saved, {
        colors:
          Array.isArray(saved.colors) && saved.colors.length === 3
            ? saved.colors
            : DEFAULTS.colors.slice(),
      });
    } catch (_) {
      return Object.assign({}, DEFAULTS, { colors: DEFAULTS.colors.slice() });
    }
  }
  function saveSettings() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(settings));
    } catch (_) {
      /* bỏ qua */
    }
  }

  /* ---------- Web Audio ---------- */
  let actx = null;
  let analyser = null;
  let freq = new Uint8Array(1024); // sẽ thay bằng frequencyBinCount thật khi khởi tạo audio
  let timeData = new Uint8Array(2048); // dữ liệu sóng âm (dùng cho kiểu "Sóng")
  let beatAnalyser = null;
  let beatFreq = new Uint8Array(1024);
  function initAudio() {
    if (actx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    actx = new AC();
    analyser = actx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.minDecibels = -90;
    analyser.maxDecibels = -10;
    analyser.smoothingTimeConstant = settings.smoothing;
    const source = actx.createMediaElementSource(audio);
    source.connect(analyser);
    analyser.connect(actx.destination);
    beatAnalyser = actx.createAnalyser();
    beatAnalyser.fftSize = 2048;
    beatAnalyser.minDecibels = -90;
    beatAnalyser.maxDecibels = -10;
    beatAnalyser.smoothingTimeConstant = 0.2; // ít làm mượt để thấy đột biến
    source.connect(beatAnalyser);
    beatFreq = new Uint8Array(beatAnalyser.frequencyBinCount);
    freq = new Uint8Array(analyser.frequencyBinCount);
    timeData = new Uint8Array(analyser.fftSize);
  }

  /* ---------- Phát nhạc ---------- */
  const ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
  const ICON_PAUSE =
    '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';

  let audioUrl = null;
  
  let bgImage = null; // ảnh nền hiện tại (để lấy màu chủ đạo)
  let seeking = false;

  function setStatus(msg, isError = false) {
    ui.status.textContent = msg;
    ui.status.classList.toggle("error", isError);
    if (msg) {
      clearTimeout(setStatus._t);
      setStatus._t = setTimeout(() => {
        ui.status.textContent = "";
      }, 3500);
    }
  }

  function isAudioFile(file) {
    return (
      file.type.startsWith("audio/") ||
      /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(file.name)
    );
  }
  function isImageFile(file) {
    return (
      file.type.startsWith("image/") ||
      /\.(jpe?g|png|gif|webp|avif|bmp)$/i.test(file.name)
    );
  }

  /* ---------- Danh sách phát (queue) ---------- */
  const queue = []; // { id, name, url }
  const playedIds = new Set(); // shuffle: các bài đã phát trong vòng này
  let playHistory = []; // id các bài đã phát (cho nút "Trước" khi shuffle)
  let current = -1; // chỉ số bài đang chọn
  let nextId = 1;
  let queueFinished = false; // đã phát hết danh sách (lặp lại tắt)
  let errorStreak = 0;
  let queueAutoOpened = false;
  let shuffleOn = !!settings.shuffle;
  let repeatMode = ["off", "all", "one"].includes(settings.repeat)
    ? settings.repeat
    : "off";

  function addFiles(files) {
    const valid = files.filter(isAudioFile);
    if (!valid.length) {
      setStatus("File không phải âm thanh hợp lệ", true);
      return;
    }
    if (valid.length > 1) {
      valid.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true }),
      );
    }
    const first = queue.length;
    valid.forEach((file) => {
      queue.push({
        id: nextId++,
        name: file.name.replace(/\.[^.]+$/, ""),
        url: URL.createObjectURL(file),
      });
    });
    const skipped = files.length - valid.length;
    setStatus(
      `Đã thêm ${valid.length} bài` +
        (skipped ? `, bỏ qua ${skipped} file không hợp lệ` : ""),
    );

    // Lần đầu có từ 2 bài trở lên thì tự mở danh sách cho người dùng thấy
    if (queue.length > 1 && !queueAutoOpened) {
      queueAutoOpened = true;
      setQueueOpen(true);
    }
    // Chưa phát gì (hoặc đã phát hết) -> phát ngay bài đầu tiên vừa thêm
    if (current === -1 || queueFinished) playIndex(first);
    else renderQueue();
  }

  function playIndex(i, pushHistory = true) {
    const item = queue[i];
    if (!item) return;
    if (queueFinished) {
      playedIds.clear();
      playHistory = [];
    }
    if (pushHistory && current !== -1 && queue[current] && current !== i) {
      playHistory.push(queue[current].id);
      if (playHistory.length > 100) playHistory.shift();
    }
    queueFinished = false;
    current = i;
    playedIds.add(item.id);

    audio.src = item.url;
    ui.trackName.textContent = item.name;
    ui.hint.classList.add("hidden");
    ui.progress.value = 0;
    updateRangeFill(ui.progress);
    ui.curTime.textContent = "0:00";
    ui.durTime.textContent = "0:00";
    if ("mediaSession" in navigator && window.MediaMetadata) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: item.name });
    }
    renderQueue();
    play();
  }

  // Chọn bài kế tiếp. auto = true khi bài hiện tại tự kết thúc. Trả về -1 nếu hết danh sách.
  function pickNext(auto) {
    const n = queue.length;
    if (!n) return -1;
    if (auto && repeatMode === "one") return current;

    if (shuffleOn && n > 1) {
      const pool = [];
      for (let i = 0; i < n; i++) {
        if (i !== current && !playedIds.has(queue[i].id)) pool.push(i);
      }
      if (!pool.length) {
        if (auto && repeatMode !== "all") return -1;
        playedIds.clear();
        if (queue[current]) playedIds.add(queue[current].id);
        for (let i = 0; i < n; i++) if (i !== current) pool.push(i);
      }
      return pool[Math.floor(Math.random() * pool.length)];
    }

    if (current + 1 < n) return current + 1;
    return repeatMode === "all" || !auto ? 0 : -1;
  }

  function playNext() {
    const n = pickNext(false);
    if (n !== -1) playIndex(n);
  }

  function playPrev() {
    if (!queue.length) return;
    if (current === -1) {
      playIndex(0, false);
      return;
    }
    // Đã nghe quá 3 giây thì "Trước" sẽ phát lại bài hiện tại
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }

    if (shuffleOn) {
      while (playHistory.length) {
        const id = playHistory.pop();
        const idx = queue.findIndex((q) => q.id === id);
        if (idx !== -1) {
          playIndex(idx, false);
          return;
        }
      }
      audio.currentTime = 0;
      return;
    }
    let p = current - 1;
    if (p < 0) p = repeatMode === "all" ? queue.length - 1 : -1;
    if (p === -1) {
      audio.currentTime = 0;
      return;
    }
    playIndex(p, false);
  }

  function stopPlayback() {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    current = -1;
    queueFinished = false;
    ui.trackName.textContent = "Chưa chọn bài hát";
    ui.progress.value = 0;
    updateRangeFill(ui.progress);
    ui.curTime.textContent = "0:00";
    ui.durTime.textContent = "0:00";
    ui.playBtn.innerHTML = ICON_PLAY;
    if (!queue.length) ui.hint.classList.remove("hidden");
    renderQueue();
  }

  function removeAt(i) {
    const item = queue[i];
    if (!item) return;
    const wasCurrent = i === current;
    queue.splice(i, 1);
    playedIds.delete(item.id);
    playHistory = playHistory.filter((id) => id !== item.id);

    if (!wasCurrent) {
      if (i < current) current--;
      renderQueue();
    } else if (!queue.length) {
      stopPlayback();
    } else if (i < queue.length) {
      current = -1; // bài kế tiếp đã dồn vào vị trí i
      playIndex(i, false);
    } else if (repeatMode === "all") {
      current = -1;
      playIndex(0, false);
    } else {
      stopPlayback();
    }
    URL.revokeObjectURL(item.url);
  }

  function clearQueue() {
    if (!queue.length) return;
    queue.forEach((q) => URL.revokeObjectURL(q.url));
    queue.length = 0;
    playedIds.clear();
    playHistory = [];
    stopPlayback();
    setStatus("Đã xoá danh sách phát");
  }

  function syncPlayingClass() {
    ui.queueList.classList.toggle("playing", !audio.paused && !audio.ended);
  }

  function renderQueue() {
    ui.queueCount.textContent = String(queue.length);
    ui.queueEmpty.hidden = queue.length > 0;
    ui.clearQueueBtn.disabled = queue.length === 0;
    ui.queueList.textContent = "";

    const frag = document.createDocumentFragment();
    queue.forEach((item, i) => {
      const li = document.createElement("li");
      li.className = "q-item" + (i === current ? " active" : "");
      li.dataset.index = String(i);
      li.tabIndex = 0;
      li.title = item.name;
      li.innerHTML =
        '<span class="q-index"></span>' +
        '<span class="q-eq"><i></i><i></i><i></i></span>' +
        '<span class="q-name"></span>' +
        '<button class="q-remove" type="button" title="Xoá khỏi danh sách" aria-label="Xoá khỏi danh sách">' +
        '<svg class="ico" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        "</button>";
      li.querySelector(".q-index").textContent = String(i + 1);
      li.querySelector(".q-name").textContent = item.name; // textContent: an toàn với tên file lạ
      frag.appendChild(li);
    });
    ui.queueList.appendChild(frag);

    const active = ui.queueList.querySelector(".q-item.active");
    if (active && ui.queue.classList.contains("open"))
      active.scrollIntoView({ block: "nearest" });
    syncPlayingClass();
  }

  function setQueueOpen(open) {
    ui.queue.classList.toggle("open", open);
    ui.queueBtn.classList.toggle("active", open);
    ui.queueBtn.setAttribute("aria-expanded", String(open));
    if (open) renderQueue();
  }

  function syncModeButtons() {
    ui.shuffleBtn.classList.toggle("active", shuffleOn);
    ui.shuffleBtn.setAttribute("aria-pressed", String(shuffleOn));
    ui.shuffleBtn.title = shuffleOn ? "Ngẫu nhiên: bật" : "Ngẫu nhiên: tắt";
    ui.repeatBtn.classList.toggle("active", repeatMode !== "off");
    ui.repeatBtn.dataset.mode = repeatMode;
    ui.repeatBtn.title =
      repeatMode === "off"
        ? "Lặp lại: tắt"
        : repeatMode === "all"
          ? "Lặp lại: cả danh sách"
          : "Lặp lại: một bài";
  }

  ui.queueList.addEventListener("click", (e) => {
    const li = e.target.closest(".q-item");
    if (!li) return;
    const i = Number(li.dataset.index);
    if (e.target.closest(".q-remove")) removeAt(i);
    else if (i === current) togglePlay();
    else playIndex(i);
  });
  ui.queueList.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const li = e.target.closest(".q-item");
    
    if (li && e.target === li) {
      e.preventDefault();
      playIndex(Number(li.dataset.index));
    }
  });

  ui.shuffleBtn.addEventListener("click", () => {
    shuffleOn = !shuffleOn;
    if (shuffleOn) {
      playedIds.clear();
      if (queue[current]) playedIds.add(queue[current].id);
    }
    settings.shuffle = shuffleOn;
    syncModeButtons();
    saveSettings();
  });
  ui.repeatBtn.addEventListener("click", () => {
    repeatMode =
      repeatMode === "off" ? "all" : repeatMode === "all" ? "one" : "off";
    settings.repeat = repeatMode;
    syncModeButtons();
    saveSettings();
  });
  ui.prevBtn.addEventListener("click", playPrev);
  ui.nextBtn.addEventListener("click", playNext);
  ui.clearQueueBtn.addEventListener("click", clearQueue);
  ui.queueBtn.addEventListener("click", () =>
    setQueueOpen(!ui.queue.classList.contains("open")),
  );

  if ("mediaSession" in navigator) {
    try {
      navigator.mediaSession.setActionHandler("previoustrack", playPrev);
      navigator.mediaSession.setActionHandler("nexttrack", playNext);
    } catch (_) {
      /* trình duyệt không hỗ trợ */
    }
  }

  syncModeButtons();
  renderQueue();

   /* ---------- Nhiều ảnh nền ---------- */
  const bgList = []; // { id, name, url, img }
  let bgIndex = -1;
  let bgLayer = 0;
  let bgTimer = null;
  let bgNextId = 1;

  function addBackgrounds(files) {
    const valid = files.filter(isImageFile);
    if (!valid.length) {
      setStatus("File không phải ảnh hợp lệ", true);
      return;
    }
    valid.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true }),
    );
    const first = bgList.length;
    valid.forEach((file) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.src = url;
      bgList.push({ id: bgNextId++, name: file.name, url, img });
    });
    setStatus(`Đã thêm ${valid.length} ảnh nền`);
    showBg(first);
  }

  function showBg(i) {
    if (!bgList.length) {
      bgIndex = -1;
      bgImage = null;
      ui.bgLayers.forEach((l) => l.classList.remove("show"));
      renderBgThumbs();
      restartBgTimer();
      return;
    }
    bgIndex = (i + bgList.length) % bgList.length;
    const item = bgList[bgIndex];
    bgLayer = 1 - bgLayer;
    const next = ui.bgLayers[bgLayer];
    const prev = ui.bgLayers[1 - bgLayer];
    next.style.backgroundImage = `url("${item.url}")`;
    next.style.zIndex = 2;
    prev.style.zIndex = 1;
    next.classList.add("show");
    clearTimeout(showBg._t);
    showBg._t = setTimeout(() => prev.classList.remove("show"), 1000);

    bgImage = item.img;
    if (settings.autoColor) {
      if (item.img.complete && item.img.naturalWidth) applyAutoColor(item.img);
      else
        item.img.addEventListener("load", () => applyAutoColor(item.img), {
          once: true,
        });
    }
    renderBgThumbs();
    restartBgTimer();
  }

  function removeBg(i) {
    const item = bgList[i];
    if (!item) return;
    bgList.splice(i, 1);
    setTimeout(() => URL.revokeObjectURL(item.url), 1500); // chờ hiệu ứng mờ dần xong
    if (!bgList.length) showBg(0);
    else if (i === bgIndex) showBg(Math.min(i, bgList.length - 1));
    else {
      if (i < bgIndex) bgIndex--;
      renderBgThumbs();
    }
  }

  function clearBgs() {
    if (!bgList.length) return;
    const urls = bgList.map((b) => b.url);
    bgList.length = 0;
    setTimeout(() => urls.forEach((u) => URL.revokeObjectURL(u)), 1500);
    showBg(0);
    setStatus("Đã xoá ảnh nền");
  }

  function restartBgTimer() {
    clearInterval(bgTimer);
    bgTimer = null;
    if (settings.autoBg && bgList.length > 1)
      bgTimer = setInterval(
        () => showBg(bgIndex + 1),
        settings.bgInterval * 1000,
      );
  }

  function renderBgThumbs() {
    ui.bgCount.textContent = String(bgList.length);
    ui.bgThumbs.textContent = "";
    if (!bgList.length) {
      const e = document.createElement("div");
      e.className = "bg-empty";
      e.textContent = "Chưa có ảnh nền. Bấm “Ảnh nền” hoặc kéo thả nhiều ảnh vào.";
      ui.bgThumbs.appendChild(e);
      return;
    }
    bgList.forEach((item, i) => {
      const d = document.createElement("div");
      d.className = "bg-thumb" + (i === bgIndex ? " active" : "");
      d.dataset.index = String(i);
      d.title = item.name;
      d.style.backgroundImage = `url("${item.url}")`;
      d.innerHTML = '<span class="x" title="Xoá ảnh">×</span>';
      ui.bgThumbs.appendChild(d);
    });
  }

  ui.bgThumbs.addEventListener("click", (e) => {
    const t = e.target.closest(".bg-thumb");
    if (!t) return;
    const i = Number(t.dataset.index);
    if (e.target.closest(".x")) removeBg(i);
    else showBg(i);
  });
  ui.bgPrev.addEventListener("click", () => showBg(bgIndex - 1));
  ui.bgNext.addEventListener("click", () => showBg(bgIndex + 1));
  ui.bgClear.addEventListener("click", clearBgs);
  renderBgThumbs();

  /* ---------- Lấy màu chủ đạo từ ảnh nền ---------- */
  function rgbToHsl(r, g2, b) {
    r /= 255;
    g2 /= 255;
    b /= 255;
    const mx = Math.max(r, g2, b);
    const mn = Math.min(r, g2, b);
    const l = (mx + mn) / 2;
    const d = mx - mn;
    if (d === 0) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    let h;
    if (mx === r) h = ((g2 - b) / d) % 6;
    else if (mx === g2) h = (b - r) / d + 2;
    else h = (r - g2) / d + 4;
    return [(h * 60 + 360) % 360, s, l];
  }

  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let rr = 0,
      gg = 0,
      bb = 0;
    if (h < 60) {
      rr = c;
      gg = x;
    } else if (h < 120) {
      rr = x;
      gg = c;
    } else if (h < 180) {
      gg = c;
      bb = x;
    } else if (h < 240) {
      gg = x;
      bb = c;
    } else if (h < 300) {
      rr = x;
      bb = c;
    } else {
      rr = c;
      bb = x;
    }
    const hex = (v) =>
      Math.round((v + m) * 255)
        .toString(16)
        .padStart(2, "0");
    return "#" + hex(rr) + hex(gg) + hex(bb);
  }

  function extractPalette(img) {
    const S = 48;
    const cv = document.createElement("canvas");
    cv.width = S;
    cv.height = S;
    const cc = cv.getContext("2d", { willReadFrequently: true });
    cc.drawImage(img, 0, 0, S, S);
    let data;
    try {
      data = cc.getImageData(0, 0, S, S).data;
    } catch (_) {
      return null;
    }

    const B = 12; // chia vòng màu thành 12 nhóm, mỗi nhóm 30 độ
    const buckets = Array.from({ length: B }, () => ({ w: 0, sat: 0 }));
    for (let i = 0; i < data.length; i += 4) {
      const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
      if (s < 0.2 || l < 0.15 || l > 0.88) continue; // bỏ màu xám, quá tối, quá sáng
      const bk = buckets[Math.floor(h / 30) % B];
      const w = s * (1 - Math.abs(2 * l - 1));
      bk.w += w;
      bk.sat += s * w;
    }
    const ranked = buckets
      .map((b, i) => ({ hue: i * 30 + 15, w: b.w }))
      .filter((b) => b.w > 0)
      .sort((a, b) => b.w - a.w);
    if (!ranked.length) return null;

    // Chọn tối đa 3 màu cách nhau ít nhất 45 độ trên vòng màu
    const picks = [];
    for (const b of ranked) {
      const far = picks.every((p) => {
        const d = Math.abs(p - b.hue);
        return Math.min(d, 360 - d) >= 45;
      });
      if (far) picks.push(b.hue);
      if (picks.length === 3) break;
    }
    // Ảnh ít màu: sinh thêm màu lân cận cho đủ 3
    const fallback = [picks[0] + 40, picks[0] - 40];
    while (picks.length < 3) picks.push(fallback[picks.length - 1]);
    return [
      hslToHex(picks[0], 0.9, 0.6),
      hslToHex(picks[1], 0.85, 0.62),
      hslToHex(picks[2], 0.8, 0.55),
    ];
  }

  function applyAutoColor(img) {
    const cols = extractPalette(img);
    if (!cols) {
      setStatus("Ảnh không có màu nổi bật để lấy", true);
      return;
    }
    settings.colors = cols;
    settings.palette = "custom";
    ui.palette.value = "custom";
    ui.colors.forEach((c, i) => {
      c.value = cols[i];
    });
    colorsDirty = true;
    saveSettings();
    setStatus("Đã lấy màu từ ảnh nền");
  }

  async function play() {
    if (!audio.getAttribute("src")) {
      // Chưa chọn bài: có queue thì phát bài đầu, chưa có thì mở hộp thoại chọn file
      if (queue.length) playIndex(0, false);
      else ui.audioInput.click();
      return;
    }
    try {
      initAudio();
      if (actx.state === "suspended") await actx.resume();
      await audio.play();
    } catch (err) {
      if (err && err.name === "AbortError") return; // bị ngắt vì chuyển bài nhanh
      setStatus("Không thể phát file này", true);
      console.error(err);
    }
  }

  function togglePlay() {
    // Đã phát hết danh sách -> bấm Play sẽ phát lại từ bài đầu
    if (queueFinished && queue.length) {
      playedIds.clear();
      playIndex(0, false);
      return;
    }
    if (audio.paused) play();
    else audio.pause();
  }

  function fmtTime(s) {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec < 10 ? "0" : ""}${sec}`;
  }

  function updateRangeFill(input) {
    const min = parseFloat(input.min) || 0;
    const max = parseFloat(input.max) || 100;
    const pct = ((parseFloat(input.value) - min) / (max - min)) * 100;
    input.style.setProperty("--fill", pct + "%");
  }

  ui.playBtn.innerHTML = ICON_PLAY;
  ui.playBtn.addEventListener("click", togglePlay);
  audio.addEventListener("play", () => {
    ui.playBtn.innerHTML = ICON_PAUSE;
    syncPlayingClass();
  });
  audio.addEventListener("pause", () => {
    ui.playBtn.innerHTML = ICON_PLAY;
    syncPlayingClass();
  });
  audio.addEventListener("playing", () => {
    errorStreak = 0;
  });
  audio.addEventListener("ended", () => {
    // Hết bài -> tự chuyển sang bài kế tiếp trong danh sách
    const n = pickNext(true);
    if (n === -1) {
      queueFinished = true;
      ui.playBtn.innerHTML = ICON_PLAY;
      audio.currentTime = 0;
      syncPlayingClass();
    } else if (n === current) {
      audio.currentTime = 0; // lặp lại một bài
      play();
    } else {
      playIndex(n);
    }
  });
  audio.addEventListener("loadedmetadata", () => {
    ui.durTime.textContent = fmtTime(audio.duration);
  });
  audio.addEventListener("error", () => {
    if (current === -1 || !audio.getAttribute("src")) return;
    setStatus("Không đọc được file này, bỏ qua bài", true);
    errorStreak++;
    // Tự bỏ qua bài lỗi (dừng nếu mọi bài liên tiếp đều lỗi để tránh lặp vô hạn)
    if (queue.length > 1 && errorStreak < queue.length) {
      const n = pickNext(true);
      if (n !== -1 && n !== current) {
        setTimeout(() => {
          if (audio.error) playIndex(n);
        }, 600);
      }
    }
  });

  audio.addEventListener("timeupdate", () => {
    ui.curTime.textContent = fmtTime(audio.currentTime);
    if (!seeking && audio.duration) {
      ui.progress.value = Math.round(
        (audio.currentTime / audio.duration) * 1000,
      );
      updateRangeFill(ui.progress);
    }
  });

  ui.progress.addEventListener("input", () => {
    seeking = true;
    updateRangeFill(ui.progress);
    if (audio.duration) {
      const t = (ui.progress.value / 1000) * audio.duration;
      ui.curTime.textContent = fmtTime(t);
    }
  });
  ui.progress.addEventListener("change", () => {
    if (audio.duration)
      audio.currentTime = (ui.progress.value / 1000) * audio.duration;
    seeking = false;
  });

  ui.volume.value = settings.volume;
  audio.volume = settings.volume;
  updateRangeFill(ui.volume);
  ui.volume.addEventListener("input", () => {
    audio.volume = parseFloat(ui.volume.value);
    settings.volume = audio.volume;
    updateRangeFill(ui.volume);
    saveSettings();
  });

  ui.audioInput.addEventListener("change", (e) => {
    const files = Array.from(e.target.files);
    if (files.length) addFiles(files);
    e.target.value = "";
  });
   ui.bgInput.addEventListener("change", (e) => {
    const files = Array.from(e.target.files);
    if (files.length) addBackgrounds(files);
    e.target.value = "";
  });

  /* ---------- Kéo & thả ---------- */
  let dragDepth = 0;
  const hasFiles = (e) =>
    e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files");

  window.addEventListener("dragenter", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth++;
    ui.dropzone.classList.add("active");
  });
  window.addEventListener("dragover", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });
  window.addEventListener("dragleave", (e) => {
    if (!hasFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) ui.dropzone.classList.remove("active");
  });
  window.addEventListener("drop", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    ui.dropzone.classList.remove("active");
    const files = Array.from(e.dataTransfer.files);
    const audioFiles = files.filter(isAudioFile);
    const imageFiles = files.filter(isImageFile);
    if (imageFiles.length) addBackgrounds(imageFiles);
    if (audioFiles.length) addFiles(audioFiles);
    if (!audioFiles.length && !imageFiles.length)
      setStatus("Định dạng file không được hỗ trợ", true);
  });

  /* ---------- Cài đặt visualizer (UI) ---------- */
  const rangeInputs = document.querySelectorAll(
    '#settings input[type="range"][data-key]',
  );

  function applyOverlay() {
    document.documentElement.style.setProperty(
      "--overlay-alpha",
      settings.overlay,
    );
  }

  function showValue(input) {
    const out = input.closest(".field").querySelector("output");
    if (!out) return;
    const v = parseFloat(input.value);
    const key = input.dataset.key;
    if (key === "barWidth" || key === "gap" || key === "glow")
      out.textContent = v + "px";
    else if (key === "overlay" || key === "smoothing")
      out.textContent = Math.round(v * 100) + "%";
    else if (key === "bgInterval") out.textContent = v + "s";
    else out.textContent = v.toFixed(2).replace(/0$/, "");

  }

  rangeInputs.forEach((input) => {
    const key = input.dataset.key;
    input.value = settings[key];
    showValue(input);
    updateRangeFill(input);
    input.addEventListener("input", () => {
      settings[key] = parseFloat(input.value);
      showValue(input);
      updateRangeFill(input);
      if (key === "smoothing" && analyser)
        analyser.smoothingTimeConstant = settings.smoothing;
      if (key === "overlay") applyOverlay();
      if (key === "bgInterval") restartBgTimer();
      if (key === "barWidth" || key === "gap") colorsDirty = true;
      saveSettings();
    });
  });

  ui.palette.value = settings.palette;
  ui.colors.forEach((c, i) => {
    c.value = settings.colors[i];
  });

  ui.palette.addEventListener("change", () => {
    settings.palette = ui.palette.value;
    if (PALETTES[settings.palette]) {
      settings.colors = PALETTES[settings.palette].slice();
      ui.colors.forEach((c, i) => {
        c.value = settings.colors[i];
      });
    }
    colorsDirty = true;
    saveSettings();
  });
  ui.colors.forEach((c, i) => {
    c.addEventListener("input", () => {
      settings.colors[i] = c.value;
      settings.palette = "custom";
      ui.palette.value = "custom";
      colorsDirty = true;
      saveSettings();
    });
  });

  ui.settingsBtn.addEventListener("click", () => {
    const open = ui.settings.classList.toggle("open");
    ui.settingsBtn.setAttribute("aria-expanded", String(open));
  });

  /* ---------- Hiệu ứng: kiểu hiển thị, công tắc, tự ẩn, toàn màn hình ---------- */
  if (!["bars", "radial", "wave"].includes(settings.mode))
    settings.mode = "bars";
  ui.modeSelect.value = settings.mode;
  ui.modeSelect.addEventListener("change", () => {
    settings.mode = ui.modeSelect.value;
    saveSettings();
  });

  document
    .querySelectorAll('#settings input[type="checkbox"][data-fx]')
    .forEach((box) => {
      const key = box.dataset.fx;
      box.checked = !!settings[key];
      box.addEventListener("change", () => {
        settings[key] = box.checked;
        saveSettings();
        if (key === "autoColor" && box.checked) {
          if (bgImage) applyAutoColor(bgImage);
          else setStatus("Hãy chọn ảnh nền để lấy màu", true);
        }
        if (key === "particles" && !box.checked) particles.length = 0;
      });
    });

  // Tự ẩn bảng điều khiển khi đang phát và không có thao tác
  let lastActivity = performance.now();
  let panelHover = false;
  let isIdle = false;
  ["mousemove", "mousedown", "touchstart", "keydown", "wheel"].forEach((ev) => {
    window.addEventListener(
      ev,
      () => {
        lastActivity = performance.now();
      },
      { passive: true },
    );
  });
  ui.panel.addEventListener("mouseenter", () => {
    panelHover = true;
  });
  ui.panel.addEventListener("mouseleave", () => {
    panelHover = false;
  });

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {
        setStatus("Trình duyệt không cho phép toàn màn hình", true);
      });
    }
  }
  ui.fullscreenBtn.addEventListener("click", toggleFullscreen);

  function setPanelHidden(hidden) {
    ui.panel.classList.toggle("hidden", hidden);
    ui.showPanel.classList.toggle("visible", hidden);
  }
  ui.hideBtn.addEventListener("click", () => setPanelHidden(true));
  ui.showPanel.addEventListener("click", () => setPanelHidden(false));

  window.addEventListener("keydown", (e) => {
    const tag = (e.target.tagName || "").toUpperCase();
    if (tag === "INPUT" && e.target.type !== "range") return;
    if (tag === "SELECT" || tag === "TEXTAREA") return;
    if (e.code === "Space" && tag !== "BUTTON") {
      e.preventDefault();
      togglePlay();
    } else if (e.key === "h" || e.key === "H") {
      setPanelHidden(!ui.panel.classList.contains("hidden"));
    } else if (e.key === "n" || e.key === "N") {
      playNext();
    } else if (e.key === "p" || e.key === "P") {
      playPrev();
    } else if (e.key === "f" || e.key === "F") {
      toggleFullscreen();
    } else if (e.key === "b" || e.key === "B") {
      showBg(bgIndex + 1);
    }
  });

  applyOverlay();

  /* ---------- Canvas ---------- */
  let W = 0,
    H = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    colorsDirty = true;
  }
  window.addEventListener("resize", resize);

  /* ---------- Màu từng thanh ---------- */
  let colorsDirty = true;
  let barColors = [];
  let levels = new Float32Array(0);

  function hexToRgb(hex) {
    const h = hex.replace("#", "");
    const n = parseInt(
      h.length === 3
        ? h
            .split("")
            .map((c) => c + c)
            .join("")
        : h,
      16,
    );
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function colorAt(t) {
    // t: 0 (trung tâm / bass) -> 1 (rìa / treble)
    const stops = settings.colors.map(hexToRgb);
    const pos = Math.min(Math.max(t, 0), 1) * (stops.length - 1);
    const i = Math.min(Math.floor(pos), stops.length - 2);
    const f = pos - i;
    const a = stops[i],
      b = stops[i + 1];
    return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)},${Math.round(a[1] + (b[1] - a[1]) * f)},${Math.round(a[2] + (b[2] - a[2]) * f)})`;
  }

  function rebuildColors(half) {
    barColors = new Array(half);
    for (let i = 0; i < half; i++)
      barColors[i] = colorAt(i / Math.max(1, half - 1));
    colorsDirty = false;
    ui.flash.style.background = `radial-gradient(circle at 50% 50%, ${settings.colors[0]} 0%, transparent 65%)`;
  }

  /* ---------- Vẽ ---------- */
  let bassAvg = 0;
  let pulse = 0;
  let smoothBass = 0;
  let lastBeat = 0;
  let lastHalf = 0;

  const hasRoundRect = typeof g.roundRect === "function";

  function drawBar(x, y, w, h) {
    if (hasRoundRect && w >= 4) {
      g.beginPath();
      g.roundRect(x, y, w, h, Math.min(w / 2, 6));
      g.fill();
    } else {
      g.fillRect(x, y, w, h);
    }
  }

  /* ---------- Kiểu vòng tròn ---------- */
  function drawRadial(o) {
    const { cx, cy, half, barW, gap, glow, scale } = o;
    const m = Math.min(W, H);
    const r = m * 0.16 * (1 + smoothBass * 0.12 + pulse * 0.08);
    const maxLen = m * 0.24 * scale;
    const nSide = Math.max(
      12,
      Math.min(half, Math.floor((Math.PI * r) / (barW + gap))),
    );
    const glowBlur = glow * (0.6 + smoothBass * 0.9 + pulse * 0.4);

    g.save();
    g.translate(cx, cy);

    // Vòng sáng ở giữa
    g.lineWidth = 2;
    g.strokeStyle = hexA(settings.colors[0], 0.55);
    g.shadowColor = settings.colors[0];
    g.shadowBlur = glow * (0.5 + smoothBass);
    g.beginPath();
    g.arc(0, 0, r - 4, 0, Math.PI * 2);
    g.stroke();

    // Bass ở đỉnh vòng, treble xuống dưới, đối xứng trái/phải
    for (let j = 0; j < nSide; j++) {
      const li = Math.min(half - 1, Math.floor((j / nSide) * half));
      const lv = levels[li];
      const len = Math.max(2, lv * maxLen);
      const color = barColors[li];
      g.fillStyle = color;
      g.shadowColor = color;
      g.shadowBlur = glowBlur * Math.min(1, 0.35 + lv * 1.5);
      const a = ((j + 0.5) / nSide) * Math.PI;
      for (const dir of [1, -1]) {
        g.save();
        g.rotate(dir * a);
        drawBar(-barW / 2, -(r + len), barW, len); // hướng ra ngoài
        g.globalAlpha = 0.45;
        drawBar(-barW / 2, -r, barW, Math.min(len * 0.35, r * 0.5)); // phản chiếu vào trong
        g.restore();
      }
    }
    g.restore();
  }

  /* ---------- Kiểu sóng (oscilloscope) ---------- */
  function drawWave(o) {
    const { cx, cy, visW, maxHalfH, glow, scale, t, playing } = o;
    const N = Math.max(48, Math.floor(visW / 5));
    const left = cx - visW / 2;
    const amp = maxHalfH * settings.sensitivity * scale;
    const [c0, c1, c2] = settings.colors;

    const grad = g.createLinearGradient(left, 0, left + visW, 0);
    grad.addColorStop(0, c2);
    grad.addColorStop(0.25, c1);
    grad.addColorStop(0.5, c0);
    grad.addColorStop(0.75, c1);
    grad.addColorStop(1, c2);

    const ys = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let v;
      if (playing) {
        const idx = Math.floor((i / (N - 1)) * (timeData.length - 1));
        v = (timeData[idx] - 128) / 128;
      } else {
        v =
          Math.sin(t * 1.4 + i * 0.12) * 0.04 +
          Math.sin(t * 0.7 + i * 0.05) * 0.03;
      }
      const edge = Math.sin((i / (N - 1)) * Math.PI); // thu hai đầu về đường giữa
      ys[i] = Math.max(
        -maxHalfH * 1.3,
        Math.min(maxHalfH * 1.3, v * amp * edge),
      );
    }
    const px = (i) => left + (i / (N - 1)) * visW;

    g.save();
    g.lineJoin = "round";
    g.lineCap = "round";
    g.lineWidth = Math.max(2, settings.barWidth * 0.5);
    g.strokeStyle = grad;
    g.shadowColor = c0;
    g.shadowBlur = glow * (0.6 + smoothBass * 0.9 + pulse * 0.4);
    for (const dir of [1, -1]) {
      g.beginPath();
      for (let i = 0; i < N; i++) {
        const y = cy + ys[i] * dir;
        if (i === 0) g.moveTo(px(i), y);
        else g.lineTo(px(i), y);
      }
      g.stroke();
    }

    // Tô mờ vùng giữa hai đường sóng
    g.shadowBlur = 0;
    g.globalAlpha = 0.12;
    g.fillStyle = grad;
    g.beginPath();
    for (let i = 0; i < N; i++) {
      if (i === 0) g.moveTo(px(i), cy + ys[i]);
      else g.lineTo(px(i), cy + ys[i]);
    }
    for (let i = N - 1; i >= 0; i--) g.lineTo(px(i), cy - ys[i]);
    g.closePath();
    g.fill();
    g.restore();
  }

  /* ---------- Hạt phát sáng ---------- */
  const particles = [];
  let lastFrameTime = 0;

  function spawnParticles(n, x, y, speed) {
    for (let i = 0; i < n && particles.length < 500; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = speed * (0.4 + Math.random());
      particles.push({
        x,
        y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 0.3,
        life: 1,
        decay: 0.006 + Math.random() * 0.012,
        size: 1 + Math.random() * 2.5,
        c: Math.random(),
      });
    }
  }

  function drawParticles(dt) {
    g.save();
    g.globalCompositeOperation = "lighter";
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.985;
      p.vy = p.vy * 0.985 - 0.01 * dt; // trôi nhẹ lên trên
      p.life -= p.decay * dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      g.globalAlpha = Math.min(1, p.life);
      g.fillStyle =
        barColors[
          Math.min(barColors.length - 1, Math.floor(p.c * barColors.length))
        ] || "#fff";
      g.beginPath();
      g.arc(p.x, p.y, p.size * (0.5 + p.life * 0.5), 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
    /* ---------- Bắt beat đa dải (spectral flux) ---------- */
  const BEAT_K = 2.0; // nhỏ hơn = nhạy hơn (thử 1.5 – 3)
  const BEAT_BANDS = [
    { lo: 20, hi: 150, w: 1.0 }, // bass / kick
    { lo: 150, hi: 500, w: 0.9 }, // low-mid: snare, thân giọng
    { lo: 500, hi: 2000, w: 1.0 }, // mid: lời, lead
    { lo: 2000, hi: 6000, w: 1.0 }, // high-mid: phụ âm, clap
    { lo: 6000, hi: 14000, w: 1.0 }, // treble: hi-hat
  ].map((b) => ({ ...b, mean: 0, vari: 0, last: 0 }));
  let prevFreq = null;

  // Trả về độ mạnh beat (0 = không có beat)
  function detectBeat(now) {
    beatAnalyser.getByteFrequencyData(beatFreq);
    const bHz = actx.sampleRate / 2 / beatFreq.length;
    let strength = 0;

    for (const b of BEAT_BANDS) {
      const lo = Math.max(1, Math.floor(b.lo / bHz));
      const hi = Math.min(beatFreq.length - 1, Math.ceil(b.hi / bHz));
      let flux = 0,
        en = 0;
      for (let k = lo; k <= hi; k++) {
        en += beatFreq[k];
        if (prevFreq) {
          const d = beatFreq[k] - prevFreq[k];
          if (d > 0) flux += d; // chỉ tính phần tăng đột ngột
        }
      }
      const n = hi - lo + 1;
      flux /= n * 255;
      en /= n * 255;

      if (prevFreq) {
        const thr = b.mean + BEAT_K * Math.sqrt(b.vari) + 0.012;
        if (en > 0.1 && flux > thr && now - b.last > 110) {
          b.last = now;
          strength = Math.max(strength, Math.min(1, 0.55 + (flux - thr) * 12 * b.w));
        }
        const diff = flux - b.mean;
        b.mean += diff * 0.04;
        b.vari += (diff * diff - b.vari) * 0.04;
      }
    }
    if (!prevFreq) prevFreq = new Uint8Array(beatFreq.length);
    prevFreq.set(beatFreq);
    return strength;
  }
  function binValue(pos) {
    // nội suy tuyến tính giữa hai bin
    const i = Math.floor(pos);
    const f = pos - i;
    const a = freq[Math.min(i, freq.length - 1)];
    const b = freq[Math.min(i + 1, freq.length - 1)];
    return a + (b - a) * f;
  }

  function frame(now) {
    requestAnimationFrame(frame);

    const t = now / 1000;
    const playing =
      !!analyser && !audio.paused && !audio.ended && audio.readyState > 2;
    if (playing) {
      analyser.getByteFrequencyData(freq);
      if (settings.mode === "wave") analyser.getByteTimeDomainData(timeData);
    }

    const barW = settings.barWidth;
    const gap = settings.gap;
    const step = barW + gap;
    const visW = Math.min(W * 0.92, 1300);
    const half = Math.max(8, Math.min(160, Math.floor(visW / 2 / step)));

    if (half !== lastHalf) {
      lastHalf = half;
      levels = new Float32Array(half);
      colorsDirty = true;
    }
    if (colorsDirty) rebuildColors(half);

    /* --- Bass & beat --- */
    let bass = 0;
    if (playing) {
      for (let i = 1; i <= 6; i++) bass += freq[i];
      bass /= 6 * 255;
    }
        let beat = false;
    let onset = 0;
    if (playing) onset = detectBeat(now);
    else prevFreq = null; // tạm dừng thì bỏ mẫu cũ để lần phát lại không báo beat giả
    if (onset > 0 && now - lastBeat > 90) {
      pulse = Math.max(pulse, onset);
      lastBeat = now;
      beat = true;
    }
    pulse *= 0.9;
    smoothBass += (bass - smoothBass) * 0.25;

    // Nền nảy nhẹ theo bass
    const fx = settings.fxIntensity;
    const shk = settings.shake ? pulse * 7 * fx : 0;
    const sx = shk ? (Math.random() - 0.5) * shk : 0;
    const sy = shk ? (Math.random() - 0.5) * shk : 0;
    bgEl.style.transform = `translate(${sx.toFixed(2)}px, ${sy.toFixed(2)}px) scale(${(1 + smoothBass * 0.04 + pulse * 0.01).toFixed(4)})`;
    canvas.style.transform = shk
      ? `translate(${(-sx * 0.6).toFixed(2)}px, ${(-sy * 0.6).toFixed(2)}px)`
      : "";
    ui.flash.style.opacity = settings.flash
      ? Math.min(0.5, pulse * 0.28 * fx).toFixed(3)
      : "0";

    /* --- Tính mức từng thanh --- */
    const nyquist = (actx ? actx.sampleRate : 44100) / 2;
    const binHz = nyquist / freq.length;
    const minBin = 1;
    const maxBin = Math.max(
      minBin + 8,
      Math.min(freq.length - 1, Math.floor(14000 / binHz)),
    );
    const mapBin = (u) => minBin + (maxBin - minBin) * Math.pow(u, 2.2);

    for (let i = 0; i < half; i++) {
      let target;
      if (playing) {
        const a = mapBin(i / half);
        const b = mapBin((i + 1) / half);
        let v;
        if (b - a < 1) {
          v = binValue((a + b) / 2);
        } else {
          let sum = 0,
            n = 0;
          for (
            let k = Math.floor(a);
            k <= Math.ceil(b) && k < freq.length;
            k++
          ) {
            sum += freq[k];
            n++;
          }
          v = sum / Math.max(1, n);
        }
        target =
          Math.pow(v / 255, 1.4) *
          settings.sensitivity *
          (1 + (i / half) * 0.8);
        target = Math.min(target, 1);
      } else {
        // Hiệu ứng nghỉ nhẹ nhàng khi chưa phát
        target = 0.03 + 0.025 * (Math.sin(t * 1.6 - i * 0.22) + 1);
      }
      const lv = levels[i];
      levels[i] = lv + (target - lv) * (target > lv ? 0.6 : 0.18);
    }

    /* --- Vẽ --- */
    g.clearRect(0, 0, W, H);
    const cx = W / 2;
    const cy = H / 2 - Math.min(40, H * 0.04); // nhích lên một chút để tránh panel
    const maxHalfH = Math.min(H * 0.36, 380);
    const glow = settings.glow;

    // Quầng sáng phía sau, phản ứng theo bass
    if (smoothBass > 0.02 || pulse > 0.02) {
      const r = Math.max(
        120,
        Math.min(W, H) * (0.28 + smoothBass * 0.25 + pulse * 0.08),
      );
      const rg = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      rg.addColorStop(
        0,
        hexA(
          settings.colors[0],
          Math.min(0.35, smoothBass * 0.45 + pulse * 0.15),
        ),
      );
      rg.addColorStop(1, hexA(settings.colors[0], 0));
      g.fillStyle = rg;
      g.fillRect(cx - r, cy - r, r * 2, r * 2);
    }

    // Đường trung tâm
    const lineW = half * step;
    const lg = g.createLinearGradient(cx - lineW, 0, cx + lineW, 0);
    lg.addColorStop(0, hexA(settings.colors[2], 0));
    lg.addColorStop(0.5, hexA(settings.colors[0], 0.8));
    lg.addColorStop(1, hexA(settings.colors[2], 0));
    g.save();
    g.shadowBlur = glow * 0.6;
    g.shadowColor = settings.colors[0];
    g.fillStyle = lg;
    if (settings.mode === "bars")
      g.fillRect(cx - lineW, cy - 0.75, lineW * 2, 1.5);
    g.restore();

    // Các kiểu hiển thị
    const scale = 1 + pulse * 0.25;
    const o = {
      cx,
      cy,
      half,
      step,
      barW,
      gap,
      maxHalfH,
      scale,
      glow,
      visW,
      t,
      playing,
    };
    if (settings.mode === "radial") drawRadial(o);
    else if (settings.mode === "wave") drawWave(o);

    // Kiểu thanh (mặc định)
    g.save();
    const barCount =
      settings.mode === "radial" || settings.mode === "wave" ? 0 : half;
    for (let i = 0; i < barCount; i++) {
      const h = Math.max(1.5, levels[i] * maxHalfH * scale);
      const color = barColors[i];
      g.fillStyle = color;
      g.shadowColor = color;
      g.shadowBlur =
        glow *
        (0.6 + smoothBass * 0.9 + pulse * 0.4) *
        Math.min(1, 0.35 + levels[i] * 1.5);

      const off = gap / 2 + i * step;
      drawBar(cx + off, cy - h, barW, h * 2); // bên phải
      drawBar(cx - off - barW, cy - h, barW, h * 2); // bên trái (đối xứng)
    }
    g.restore();

    // Hạt phát sáng: nổ khi có beat, rải nhẹ theo bass
    if (settings.particles) {
      const dt = Math.min(3, (now - lastFrameTime) / 16.667) || 1;
      if (beat) spawnParticles(Math.round(28 * fx), cx, cy, 3 + smoothBass * 5);
      if (playing && Math.random() < smoothBass * 1.5 * fx) {
        spawnParticles(
          1 + Math.round(smoothBass * 2),
          cx + (Math.random() - 0.5) * visW * 0.8,
          cy,
          0.8 + smoothBass * 2,
        );
      }
      drawParticles(dt);
    }
    lastFrameTime = now;

    // Tự ẩn bảng điều khiển khi đang phát nhạc mà không có thao tác
    const idle =
      settings.autoHide && playing && !panelHover && now - lastActivity > 4000;
    if (idle !== isIdle) {
      isIdle = idle;
      ui.panel.classList.toggle("idle", idle);
      document.body.classList.toggle("idle", idle);
    }
  }

  function hexA(hex, a) {
    const [r, gg, b] = hexToRgb(hex);
    return `rgba(${r},${gg},${b},${a})`;
  }

  resize();
  requestAnimationFrame(frame);
})();
