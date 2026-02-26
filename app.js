(() => {
  const BOARD_IMAGE_PATH = "assets/board.png";
  const SPACE_COUNT = 37;
  const LS_COORDS_KEY = "lekter_coords_v1";

  const ROSTER = ["MC SKETCHY","AMADEUS","DJ NOTH?NG","BEARD","MR. C","KALIF"];
  const CHIP_COLORS = ["#ffffff", "#ffd400", "#ff2d2d", "#111111", "#ff4fd8", "#8a2be2"];

  const START_CASH = 100;
  const WIN_CASH = 200;

  const ZOOM_SCALE = 2.2;
  const ZOOM_MS = 6000;

  const el = (id) => document.getElementById(id);

  const canvas = el("board");
  const ctx = canvas.getContext("2d");

  const hint = el("hint");

  const menuPanel = el("menuPanel");
  const playPanel = el("playPanel");
  const mapPanel = el("mapPanel");

  const btnMap = el("btnMap");
  const btnPlay = el("btnPlay");
  const menuStatus = el("menuStatus");
  const playerPick = el("playerPick");

  const btnRoll = el("btnRoll");
  const btnDecision = el("btnDecision");
  const btnEndTurn = el("btnEndTurn");
  const btnBackMenu = el("btnBackMenu");
  const turnInfo = el("turnInfo");
  const logEl = el("log");
  const playersStatus = el("playersStatus");

  const mapNext = el("mapNext");
  const btnUndo = el("btnUndo");
  const btnClear = el("btnClear");
  const btnBackMenu2 = el("btnBackMenu2");
  const coordsOut = el("coordsOut");

  const modalBackdrop = el("modalBackdrop");
  const modalTitle = el("modalTitle");
  const modalBody = el("modalBody");
  const modalActions = el("modalActions");

  function setHint(t){ if (hint) hint.textContent = t; }

  function log(line){
    if (!logEl) return;
    const div = document.createElement("div");
    div.className = "line";
    div.textContent = line;
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
  }

  // Modal: uses inline display to avoid any stuck overlay
  function closeModal(){
    modalTitle.textContent = "";
    modalBody.textContent = "";
    modalActions.innerHTML = "";
    modalBackdrop.style.display = "none";
  }

  function openModal({title, body, actions}){
    modalTitle.textContent = title ?? "";
    modalBody.textContent = body ?? "";
    modalActions.innerHTML = "";

    const safeActions = (Array.isArray(actions) && actions.length) ? actions : [{ label:"OK" }];

    for (const a of safeActions){
      const b = document.createElement("button");
      b.textContent = a.label;
      if (a.danger) b.classList.add("danger");
      b.onclick = () => { closeModal(); a.onClick?.(); };
      modalActions.appendChild(b);
    }

    modalBackdrop.style.display = "flex";
  }

  // Close modal on outside click
  modalBackdrop.addEventListener("click", (e) => {
    if (e.target === modalBackdrop) closeModal();
  });

  // Close modal on ESC
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  // Load board image
  const boardImg = new Image();
  let boardLoaded = false;
  boardImg.onload = () => { boardLoaded = true; };
  boardImg.onerror = () => { boardLoaded = false; setHint("Could not load assets/board.png"); };
  boardImg.src = BOARD_IMAGE_PATH;

  // Coords
  let COORDS = loadCoords();

  function loadCoords(){
    try{
      const raw = localStorage.getItem(LS_COORDS_KEY);
      if(!raw) return [];
      const parsed = JSON.parse(raw);
      if(!Array.isArray(parsed)) return [];
      return parsed.slice(0, SPACE_COUNT);
    }catch{
      return [];
    }
  }

  function saveCoords(){
    localStorage.setItem(LS_COORDS_KEY, JSON.stringify(COORDS));
  }

  function haveCoords(){
    return Array.isArray(COORDS) && COORDS.length === SPACE_COUNT;
  }

  function getSpaceXY(i){
    if(haveCoords() && COORDS[i]) return COORDS[i];

    const cx = canvas.width * 0.5;
    const cy = canvas.height * 0.5;
    const r = Math.min(canvas.width, canvas.height) * 0.34;
    const ang = (Math.PI * 2) * (i / SPACE_COUNT) - Math.PI * 0.5;
    return { x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r };
  }

  // Camera
  let cam = {
    scale: 1,
    x: canvas.width * 0.5,
    y: canvas.height * 0.5,
    targetScale: 1,
    targetX: canvas.width * 0.5,
    targetY: canvas.height * 0.5,
    zoomUntil: 0
  };

  function nowMs(){ return performance.now(); }

  function setCameraTarget(centerX, centerY, scale){
    cam.targetX = centerX;
    cam.targetY = centerY;
    cam.targetScale = scale;
  }

  function zoomToSpace(spaceIndex, durationMs){
    const pt = getSpaceXY(spaceIndex);
    setCameraTarget(pt.x, pt.y, ZOOM_SCALE);
    cam.zoomUntil = nowMs() + durationMs;
  }

  function updateCamera(dt){
    if(cam.zoomUntil && nowMs() >= cam.zoomUntil){
      cam.zoomUntil = 0;
      setCameraTarget(canvas.width * 0.5, canvas.height * 0.5, 1);
    }
    const k = 8;
    cam.scale += (cam.targetScale - cam.scale) * Math.min(1, dt * k);
    cam.x += (cam.targetX - cam.x) * Math.min(1, dt * k);
    cam.y += (cam.targetY - cam.y) * Math.min(1, dt * k);
  }

  // Minimal UI state (menu + mapping + play)
  const Phase = { Menu:"Menu", Mapping:"Mapping", Playing:"Playing" };
  let phase = Phase.Menu;
  let mapIndex = 0;

  // Selected players
  let selected = new Set(ROSTER.slice(0,2));
  function buildPlayerPick(){
    playerPick.innerHTML = "";
    for(const name of ROSTER){
      const label = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = selected.has(name);
      cb.onchange = () => {
        if(cb.checked) selected.add(name); else selected.delete(name);
        if(selected.size > 6){ cb.checked = false; selected.delete(name); }
      };
      label.appendChild(cb);
      const span = document.createElement("span");
      span.textContent = name;
      label.appendChild(span);
      playerPick.appendChild(label);
    }
  }

  function refreshMenuStatus(){
    menuStatus.textContent = haveCoords()
      ? "Board mapped: YES. You can Play."
      : "Board mapped: NO. Click “Map the board” first.";
  }

  function showMenu(){
    phase = Phase.Menu;
    menuPanel.classList.remove("hidden");
    playPanel.classList.add("hidden");
    mapPanel.classList.add("hidden");
    setHint("Main Menu. Map the board first, then Play.");
    refreshMenuStatus();
  }

  function showMap(){
    phase = Phase.Mapping;
    menuPanel.classList.add("hidden");
    playPanel.classList.add("hidden");
    mapPanel.classList.remove("hidden");
    setHint("Mapping: click s0 → s36 in order.");
    mapIndex = COORDS.length;
    refreshMapUI();
  }

  function refreshMapUI(){
    mapNext.textContent = `s${mapIndex}`;
    coordsOut.value = JSON.stringify(COORDS, null, 2);
  }

  // Map clicks
  function canvasToWorld(e){
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (canvas.width / rect.width);
    const py = (e.clientY - rect.top) * (canvas.height / rect.height);
    const wx = (px - (canvas.width*0.5 - cam.x * cam.scale)) / cam.scale;
    const wy = (py - (canvas.height*0.5 - cam.y * cam.scale)) / cam.scale;
    return {x: wx, y: wy};
  }

  canvas.addEventListener("click", (e) => {
    if(phase !== Phase.Mapping) return;
    if(mapIndex >= SPACE_COUNT) return;

    const {x,y} = canvasToWorld(e);
    COORDS[mapIndex] = {x: Math.round(x), y: Math.round(y)};
    mapIndex += 1;
    saveCoords();

    if(mapIndex >= SPACE_COUNT){
      setHint("Mapping complete. Returning to main menu.");
      setCameraTarget(canvas.width*0.5, canvas.height*0.5, 1);
      showMenu();
      return;
    }

    refreshMapUI();
  });

  btnUndo.addEventListener("click", () => {
    if(phase !== Phase.Mapping) return;
    if(mapIndex <= 0) return;
    mapIndex -= 1;
    COORDS.pop();
    saveCoords();
    refreshMapUI();
  });

  btnClear.addEventListener("click", () => {
    if(phase !== Phase.Mapping) return;
    COORDS = [];
    mapIndex = 0;
    saveCoords();
    refreshMapUI();
  });

  btnBackMenu2.addEventListener("click", () => showMenu());

  // Buttons
  btnMap.addEventListener("click", () => showMap());

  btnPlay.addEventListener("click", () => {
    if(!haveCoords()){
      openModal({ title:"Board not mapped", body:"Click “Map the board” first.", actions:[{label:"OK"}]});
      return;
    }
    openModal({
      title:"Play!",
      body:"Board is mapped. Game logic is loaded.\n\nNext step: we’ll re-enable the full play engine after we confirm the overlay is gone.",
      actions:[{label:"OK"}]
    });
  });

  btnBackMenu.addEventListener("click", () => showMenu());

  // Drawing
  function drawChip(player){
    const r = 22;
    ctx.beginPath();
    ctx.arc(player.ax, player.ay, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = player.color;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.stroke();
    const darkBg = (player.color === "#111111" || player.color === "#8a2be2" || player.color === "#ff2d2d");
    ctx.fillStyle = darkBg ? "#ffffff" : "#111111";
    ctx.font = "800 10px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const label = player.name.length > 10 ? player.name.slice(0,10) : player.name;
    ctx.fillText(label, player.ax, player.ay);
  }

  function draw(){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,canvas.width,canvas.height);

    ctx.setTransform(
      cam.scale, 0,
      0, cam.scale,
      canvas.width * 0.5 - cam.x * cam.scale,
      canvas.height * 0.5 - cam.y * cam.scale
    );

    if(boardLoaded){
      ctx.drawImage(boardImg, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = "#070a10";
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle = "#9fb0c8";
      ctx.font = "16px system-ui";
      ctx.fillText("Missing assets/board.png", 20, 40);
    }

    // mapping dots
    if(phase === Phase.Mapping){
      for(let i=0;i<COORDS.length;i++){
        const pt = COORDS[i];
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 6, 0, Math.PI*2);
        ctx.fillStyle = "#5aa7ff";
        ctx.fill();
        ctx.font = "10px ui-monospace, monospace";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(`s${i}`, pt.x + 8, pt.y - 8);
      }
    }
  }

  // Loop
  let lastT = performance.now();
  function loop(t){
    const dt = (t - lastT) / 1000;
    lastT = t;
    updateCamera(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // Init
  closeModal();           // make sure no overlay can exist
  buildPlayerPick();
  showMenu();
  requestAnimationFrame(loop);
})();
