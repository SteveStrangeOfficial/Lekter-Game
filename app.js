(() => {
  // ----------------------------
  // Constants / Storage
  // ----------------------------
  const BOARD_IMAGE_PATH = "assets/board.png";
  const SPACE_COUNT = 37;
  const LS_COORDS_KEY = "lekter_coords_v1";

  const ROSTER = ["MC SKETCHY","AMADEUS","DJ NOTH?NG","BEARD","MR. C","KALIF"];
  const CHIP_COLORS = ["#ffffff", "#ffd400", "#ff2d2d", "#111111", "#ff4fd8", "#8a2be2"];

  const START_CASH = 100;
  const WIN_CASH = 200;

  const ZOOM_SCALE = 2.2;
  const ZOOM_MS = 6000;

  // ----------------------------
  // DOM
  // ----------------------------
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

  // ----------------------------
  // UI helpers
  // ----------------------------
  function setHint(t){ if (hint) hint.textContent = t; }

  function log(line){
    if (!logEl) return;
    const div = document.createElement("div");
    div.className = "line";
    div.textContent = line;
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
  }

  // MODAL FIX: never rely on class toggles. Use inline display.
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

  modalBackdrop.addEventListener("click", (e) => {
    if (e.target === modalBackdrop) closeModal();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  function showMenu(){
    menuPanel.classList.remove("hidden");
    playPanel.classList.add("hidden");
    mapPanel.classList.add("hidden");
    setHint("Main Menu. Map the board first, then Play.");
    refreshMenuStatus();
  }
  function showMap(){
    menuPanel.classList.add("hidden");
    playPanel.classList.add("hidden");
    mapPanel.classList.remove("hidden");
    setHint("Mapping: click s0 → s36 in order.");
    refreshMapUI();
  }
  function showPlay(){
    menuPanel.classList.add("hidden");
    mapPanel.classList.add("hidden");
    playPanel.classList.remove("hidden");
    setHint("Play. Use Decision Menu for cards and optional +1 move.");
    refreshPlayUI();
  }

  // ----------------------------
  // Board image
  // ----------------------------
  const boardImg = new Image();
  let boardLoaded = false;
  boardImg.onload = () => { boardLoaded = true; };
  boardImg.onerror = () => { boardLoaded = false; setHint("Could not load assets/board.png"); };
  boardImg.src = BOARD_IMAGE_PATH;

  // ----------------------------
  // Coordinates mapping
  // ----------------------------
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

    // fallback circle
    const cx = canvas.width * 0.5;
    const cy = canvas.height * 0.5;
    const r = Math.min(canvas.width, canvas.height) * 0.34;
    const ang = (Math.PI * 2) * (i / SPACE_COUNT) - Math.PI * 0.5;
    return { x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r };
  }

  // ----------------------------
  // Camera / zoom
  // ----------------------------
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

  // ----------------------------
  // Spaces
  // ----------------------------
  const SPACES = [
    "START / Living Room",
    "Expired peanut butter & matzoh (+$5)",
    "Go to Meech's Bedroom Shop (to s20)",
    "School of Rock script (lose a turn)",
    "First of the Month (win check)",
    "Battle Rap",
    "Basement Suicide Attempt",
    "The Hookah Lounge",
    "You Bought Shisha (-$5)",
    "Fake Family",
    "Sell Your Blood",
    "MC Sketchy's Closet of Shame",
    "Sound Check (roll again)",
    "Ate Sour Pizza (-$5)",
    "Darron Had a Seizure (roll again)",
    "Robbed by Kalif",
    "Pack a Bowl (to s7)",
    "You Blew It All",
    "Lose a Turn",
    "Practice Time (to s34)",
    "Meech's Bedroom Shop",
    "Blackmail",
    "Basement Suicide Attempt",
    "Toothbrush (-$5)",
    "High Tension Towers",
    "Feat. on the Track",
    "Orgy Night",
    "Practice Time (to s34)",
    "One Hit Wonder",
    "The Russians",
    "Pack a Bowl (to s7)",
    "Komar's Piss Jugs (-$10)",
    "Lauren had a seizure (roll again)",
    "MC Sketchy's Closet of Shame",
    "The Inferno",
    "Robbed by the Gash",
    "You Took Too Much (roll backwards)"
  ];

  // Main clockwise ring: s0->...->s36->s4, and s4->s5
  function nextCW(pos){
    if(pos === 36) return 4;
    if(pos === 4) return 5;
    return (pos + 1) % SPACE_COUNT;
  }
  function prevCCW(pos){
    if(pos === 4) return 36;
    if(pos === 0) return 3;
    return pos - 1;
  }
  function isForkCrossCW(from, to){
    return from === 3 && to === 4;
  }

  // ----------------------------
  // Decks (full text)
  // ----------------------------
  const BEDROOM_SHOP = [
    { key:"pass_s4_plus10", title:"MEECH APPRECIATES YOUR 'BUSINESS.'",
      text:"EVERY TIME YOU PASS THE \"FIRST OF THE MONTH\" COLLECT $10.\nMEECH APPRECIATES YOUR 'BUSINESS.'" },
    { key:"land_s20_plus5", title:"MEECH LEFT THE SAFE OPEN...",
      text:"MEECH LEFT THE SAFE OPEN...\n\nAS LONG AS YOU HAVE THIS CARD\nEVERY TIME YOU LAND ON\nMEECH'S BEDROOM SHOP,\nTAKE $5 FROM HIS SAFE" },
    { key:"swap_any_bedroom", title:"HEY BUDDY.....",
      text:"HEY BUDDY.....\n\nSWAP SPOTS WITH ANY PLAYER ON THE BOARD.\nMEECH MAKES THINGS HAPPEN\nWHEN YOU NEED IT MOST." },
    { key:"virginia_slims", title:"VIRGINIA SLIMS",
      text:"MEECH BLESSES YOU\nWITH 24 PACKS OF\nVIRGINIA SLIMS.\n\n(THIS CARD DOES NOTHING EXCEPT GIVE YOU IN-GAME LUNG CANCER.)" },
    { key:"double_bank", title:"2X MONEY",
      text:"ANY MONEY YOU RECIEVE IS\n2X\nAS LONG AS YOU HAVE\nTHIS CARD" },
    { key:"may_plus1", title:"+1 MOVE",
      text:"AS LONG AS\nYOU HAVE THIS CARD,\nYOU MAY MOVE\nONE EXTRA SPACE\nPER TURN" },
  ];

  const CLOSET = [
    { title:"YOU HAD YOUR FIRST LESBIAN EXPERIENCE WITH KARA",
      text:"YOU HAD YOUR FIRST LESBIAN EXPERIENCE WITH KARA\n\nROLL 1-9\nYOU HATED IT AND -$5\n(AND ANY RESPECT YOU HAD FOR YOURSELF)\n\nROLL 10-20\nYOU LIKED IT AND +$10\n(BUT YOU LOSE ANY RESPECT YOU HAD FOR YOURSELF)",
      kind:"roll_bank", rules:[{min:1,max:9,pay:5},{min:10,max:20,collect:10}] },
    { title:"MARIA GOT DRUNK AND PASSED OUT NAKED IN YOUR BED",
      text:"MARIA GOT DRUNK AND PASSED OUT NAKED IN YOUR BED\n\nROLL 1-9\nSHE LETS YOU SLIP IT IN AND YOU NUT YOURSELF SWEETLY TO SLEEP\n+$10\n\nROLL 11-20\nYOUR GIRLFRIEND COMES HOME AND CRACKS A BOTTLE OVER YOUR HEAD\n-$10\n\nROLL 10\nYOU GET HER PREGNANT AND WON'T BE HAVING ANY OF THAT DRAMA\n-$100 FOR THE ABORTION",
      kind:"roll_bank_multi", rules:[{min:1,max:9,collect:10},{min:10,max:10,pay:100},{min:11,max:20,pay:10}] },
    { title:"CROCKPOT MAGGOTS",
      text:"PICK A PLAYER TO CLEAN THE CROCKPOT FULL OF 3 MONTH OLD SOUP AND MAGGOTS\n\nROLL 1-9\nPLAYER -$5\n\nROLL 10-20\nPLAYER -$10",
      kind:"target_roll_pay_to_drawer", rules:[{min:1,max:9,pay:5},{min:10,max:20,pay:10}] },
    { title:"PARTH THREW UP AND LEFT FOR INDIA.",
      text:"PARTH THREW UP ON THE FLOOR AND LEFT FOR INDIA.\n\nROLL 1-9\nYOU HAVE TO CLEAN IT UP\n-$10\n\nROLL 10-20\nLAY A NEWSPAPER ON IT AND LET HIM TAKE CARE OF IT IN 3 WEEKS\n+$20",
      kind:"roll_bank", rules:[{min:1,max:9,pay:10},{min:10,max:20,collect:20}] },
    { title:"BEARD'S MOTHER'S BROOM",
      text:"BEARD BROUGHT HIS MOTHERS BROOM TO THE HOUSE\n\nROLL 1-9\nYOU UNLEASH THE UNHOLY SPIRIT OF LA LLORONA INTO THE HOUSE\n-$10\n\nROLL 10-20\nYOU SWEEP UP ALL THE ASH FROM THE HOOKAH COALS. PRAY A BLESSING, RETURN THE BROOM AND EVERYTHING IS FINE\n+$20",
      kind:"roll_bank", rules:[{min:1,max:9,pay:10},{min:10,max:20,collect:20}] },
    { title:"SLIP ON KALIF'S PISS",
      text:"YOU SLIP ON KALIF'S PISS IN THE KITCHEN\n\nROLL 1-9\nBREAK YOUR ANKLE AND THE PISS SPLASHES IN YOUR MOUTH\n-$20\n\nROLL 10-20\n...MARINATING IN YOUR PISS FOR 6 HRS\n+$20",
      kind:"roll_bank", rules:[{min:1,max:9,pay:20},{min:10,max:20,collect:20}] },
    { title:"STEVE'S MOM DROPS OFF A BAG OF FOOD",
      text:"STEVE'S MOM DROPS OFF A BAG OF FOOD\n\nROLL 1-9\nIT'S CANNED BEETS & EXPIRED MATZAH\n-$10\n\nROLL 10-20\nIT'S A NEW BAG OF OREOS AND 3 BOXES OF THE GOOD MAC AND CHEESE\n+$10",
      kind:"roll_bank", rules:[{min:1,max:9,pay:10},{min:10,max:20,collect:10}] },
  ];

  const ONE_HIT_WONDERS = [
    { key:"mic_drop", title:"MIC DROP",
      text:"MIC DROP\n\nSHUT DOWN ANOTHER PLAYER'S TURN ON THE SPOT!\nMAKE THEM LOSE A TURN", kind:"mic_drop" },
    { key:"goat_tax", title:"GOAT TAX",
      text:"GOAT TAX\n\nDEMAND $10 FROM EVERY PLAYER", kind:"goat_tax" },
    { key:"encore", title:"ENCORE!",
      text:"ENCORE!\n\nTAKE ANOTHER TURN IMMEDIATELY", kind:"encore" },
    { key:"swap_666", title:"666 SWAP",
      text:"666 SWAP\n\nSWAP SPACES WITH ANY PLAYER", kind:"swap" },
    { key:"i_want_it_all", title:"I WANT IT ALL",
      text:"I WANT IT ALL\n\nCOLLECT $30 FROM THE BANK RIGHT NOW.", kind:"bank_collect", amount:30 },
  ];

  // ----------------------------
  // Game state
  // ----------------------------
  const Phase = {
    Menu: "Menu",
    Mapping: "Mapping",
    StartTurn: "StartTurn",
    AfterRoll: "AfterRoll",
    Moving: "Moving",
    Zooming: "Zooming",
    BeforeResolve: "BeforeResolve",
    Resolving: "Resolving",
    AfterResolve: "AfterResolve",
    GameOver: "GameOver",
  };

  let state = {
    phase: Phase.Menu,
    selected: new Set(ROSTER.slice(0,2)),
    mapIndex: 0,
    game: null,
  };

  function makeDeck(cards){
    const d = cards.map(c => ({...c}));
    return {
      cards: d,
      shuffle(){
        for(let i=this.cards.length-1;i>0;i--){
          const j = Math.floor(Math.random()*(i+1));
          [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
      },
      draw(){
        if(!this.cards.length) return null;
        return this.cards.shift();
      },
      putBackAndShuffle(card){
        this.cards.push(card);
        this.shuffle();
      }
    };
  }

  function currentPlayer(){ return state.game.players[state.game.turn]; }

  function hasBedroom(p, key){ return p.bedroom.some(c => c.key === key); }

  function bankCollect(p, amount, reason){
    let amt = amount;
    if(hasBedroom(p, "double_bank")) amt *= 2;
    p.cash += amt;
    log(`${p.name} collects $${amt}${reason ? " ("+reason+")" : ""}.`);
    checkWinImmediate(p);
    refreshPlayUI();
  }

  function bankPay(p, amount, reason){
    const amt = Math.min(p.cash, amount);
    p.cash -= amt;
    log(`${p.name} pays $${amt}${reason ? " ("+reason+")" : ""}.`);
    refreshPlayUI();
  }

  function payPlayer(from, to, amount, reason){
    const amt = Math.min(from.cash, amount);
    from.cash -= amt;
    to.cash += amt;
    log(`${from.name} pays ${to.name} $${amt}${reason ? " ("+reason+")" : ""}.`);
    checkWinImmediate(to);
    refreshPlayUI();
  }

  function checkWinImmediate(p){
    if(!state.game || state.phase === Phase.GameOver) return;
    if(p.pos === 4 && p.cash >= WIN_CASH){
      state.phase = Phase.GameOver;
      openModal({
        title:"GAME OVER",
        body:`${p.name} wins by landing on First of the Month with $${p.cash} cash in hand.`,
        actions:[{label:"OK"}]
      });
      log(`${p.name} WINS!`);
      refreshPlayUI();
    }
  }

  function rollD20(){ return 1 + Math.floor(Math.random() * 20); }

  async function chooseForkIfNeeded(){
    return new Promise(resolve => {
      openModal({
        title:"Fork at First of the Month (s4)",
        body:"You are passing First of the Month from the clockwise direction.\nChoose your path.",
        actions:[
          { label:"Go UP (toward Living Room)", onClick: () => resolve("up") },
          { label:"Keep going (clockwise)", onClick: () => resolve("straight") },
        ]
      });
    });
  }

  function applyPassS4BonusIfCrossing(p, from, to){
    if(from === 3 && to === 4 && hasBedroom(p, "pass_s4_plus10")){
      bankCollect(p, 10, "Pass First of the Month");
    }
  }

  async function computeDestination(startPos, steps, dir){
    let pos = startPos;
    const p = currentPlayer();

    for(let i=0;i<steps;i++){
      let next = (dir === "cw") ? nextCW(pos) : prevCCW(pos);

      if(dir === "cw" && isForkCrossCW(pos, next)){
        applyPassS4BonusIfCrossing(p, pos, next);
        pos = 4;
        const choice = await chooseForkIfNeeded();
        p._forkMode = choice;
        continue;
      }

      if(dir === "cw" && pos === 4 && p._forkMode === "up"){
        next = 3;
        p._forkMode = null;
      } else if(dir === "cw" && pos === 4 && p._forkMode === "straight"){
        p._forkMode = null;
      }

      pos = next;
    }

    p._forkMode = null;
    return pos;
  }

  function animateMoveTo(player, destIndex){
    return new Promise(resolve => {
      const target = getSpaceXY(destIndex);
      player.tx = target.x; player.ty = target.y;

      const sx = player.ax, sy = player.ay;
      const ex = player.tx, ey = player.ty;

      const dist = Math.hypot(ex - sx, ey - sy);
      const duration = Math.max(350, Math.min(1400, dist * 1.2));
      const t0 = nowMs();

      function step(){
        const t = (nowMs() - t0) / duration;
        const u = t >= 1 ? 1 : (1 - Math.pow(1 - t, 3));
        player.ax = sx + (ex - sx) * u;
        player.ay = sy + (ey - sy) * u;

        if(t >= 1){
          player.ax = ex; player.ay = ey;
          player.pos = destIndex;
          resolve();
          return;
        }
        requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }

  function delay(ms){ return new Promise(res => setTimeout(res, ms)); }

  async function maybeUsePlus1(){
    const p = currentPlayer();
    if(!hasBedroom(p, "may_plus1")) return false;
    if(p.usedPlus1ThisTurn) return false;

    return new Promise(resolve => {
      openModal({
        title:"+1 Move",
        body:"You have the +1 Move card.\nDo you want to move 1 extra space clockwise now?",
        actions:[
          { label:"No", onClick: () => resolve(false) },
          { label:"Yes (+1 CW)", onClick: () => resolve(true) },
        ]
      });
    });
  }

  function getMicDropWindow(){
    return state.phase === Phase.StartTurn || state.phase === Phase.AfterRoll;
  }

  async function decisionMomentMenu(context){
    if(!state.game || state.phase === Phase.GameOver) return;

    return new Promise(resolve => {
      openModal({
        title:"Decision Moment",
        body:`${context}\n\nChoose an option.`,
        actions:[
          { label:"Continue", onClick: () => resolve() },
          { label:"Play One Hit Wonder", onClick: async () => { await openOneHitSelector(); resolve(); } },
          { label:"Use Bedroom Swap (if you have it)", onClick: async () => { await tryBedroomSwap(); resolve(); } },
        ]
      });
    });
  }

  async function pickOtherPlayer(owner, prompt){
    const g = state.game;
    const options = g.players.filter(p => p.id !== owner.id);
    return new Promise(resolve => {
      openModal({
        title:"Choose player",
        body:prompt,
        actions: options.map(p => ({ label: p.name, onClick: () => resolve(p) }))
          .concat([{label:"Cancel", danger:true, onClick:()=>resolve(null)}])
      });
    });
  }

  async function openOneHitSelector(){
    const g = state.game;
    const holders = g.players.filter(p => p.oneHit.length > 0);
    if(holders.length === 0){
      openModal({ title:"No cards", body:"No one has any One Hit Wonder cards.", actions:[{label:"OK"}]});
      return;
    }

    const who = await new Promise(resolve => {
      openModal({
        title:"Choose player hand",
        body:"Who is playing a One Hit Wonder?",
        actions: holders.map(p => ({ label: `${p.name} (${p.oneHit.length})`, onClick: () => resolve(p) }))
          .concat([{label:"Cancel", danger:true, onClick:()=>resolve(null)}])
      });
    });
    if(!who) return;

    const chosen = await new Promise(resolve => {
      const actions = who.oneHit.map((c, idx) => ({
        label: c.title,
        onClick: () => resolve({card:c, index:idx})
      }));
      actions.push({ label:"Cancel", danger:true, onClick: () => resolve(null) });

      openModal({
        title:`${who.name} - One Hit Wonders`,
        body: who.oneHit.map(c => `${c.title}\n\n${c.text}`).join("\n\n----------------\n\n"),
        actions
      });
    });
    if(!chosen) return;

    const { card, index } = chosen;

    if(card.kind === "mic_drop" && !getMicDropWindow()){
      openModal({
        title:"Mic Drop timing",
        body:"Mic Drop can only be played at the START of a player’s turn or RIGHT AFTER they roll (before movement).",
        actions:[{label:"OK"}]
      });
      return;
    }

    await resolveOneHit(who, card, index);
  }

  async function resolveOneHit(owner, card, handIndex){
    const g = state.game;

    owner.oneHit.splice(handIndex, 1);
    g.oneHitDeck.putBackAndShuffle(card);

    log(`${owner.name} plays ONE HIT WONDER: ${card.title}`);

    if(card.kind === "bank_collect"){
      bankCollect(owner, card.amount, card.title);
      return;
    }

    if(card.kind === "encore"){
      owner.extraTurnQueued += 1;
      log(`${owner.name} queues an extra turn.`);
      return;
    }

    if(card.kind === "swap"){
      const target = await pickOtherPlayer(owner, "Choose a player to swap positions with.");
      if(!target) return;
      const a = owner.pos;
      owner.pos = target.pos;
      target.pos = a;

      const pA = getSpaceXY(owner.pos);
      owner.ax = pA.x; owner.ay = pA.y;
      const pB = getSpaceXY(target.pos);
      target.ax = pB.x; target.ay = pB.y;

      log(`${owner.name} swaps positions with ${target.name}.`);
      checkWinImmediate(owner);
      checkWinImmediate(target);
      return;
    }

    if(card.kind === "goat_tax"){
      for(const p of g.players){
        if(p.id === owner.id) continue;
        payPlayer(p, owner, 10, "Goat Tax");
      }
      return;
    }

    if(card.kind === "mic_drop"){
      const target = await pickOtherPlayer(owner, "Choose a player to Mic Drop.");
      if(!target) return;

      target.loseTurn = true;

      const cur = currentPlayer();
      if(cur.id === target.id){
        log(`${target.name} gets MIC DROPPED and loses this turn immediately.`);
        endTurnInternal(true);
      } else {
        log(`${target.name} gets MIC DROPPED and will lose their next turn.`);
      }
    }
  }

  async function tryBedroomSwap(){
    const p = currentPlayer();
    if(!hasBedroom(p, "swap_any_bedroom")){
      openModal({ title:"No swap card", body:"You don’t have the Bedroom Shop swap card.", actions:[{label:"OK"}]});
      return;
    }
    const target = await pickOtherPlayer(p, "Choose a player to swap positions with (Bedroom Shop).");
    if(!target) return;

    const a = p.pos;
    p.pos = target.pos;
    target.pos = a;

    const pA = getSpaceXY(p.pos);
    p.ax = pA.x; p.ay = pA.y;
    const pB = getSpaceXY(target.pos);
    target.ax = pB.x; target.ay = pB.y;

    log(`${p.name} uses Bedroom Swap to swap with ${target.name}.`);
    checkWinImmediate(p);
    checkWinImmediate(target);
  }

  async function landWithZoomThenResolve(resolveFn){
    const p = currentPlayer();

    zoomToSpace(p.pos, ZOOM_MS);
    state.phase = Phase.Zooming;
    refreshPlayUI();

    await delay(ZOOM_MS);

    state.phase = Phase.BeforeResolve;
    refreshPlayUI();

    await decisionMomentMenu("Before resolving this space.");
    if(state.phase === Phase.GameOver) return;

    state.phase = Phase.Resolving;
    refreshPlayUI();
    await resolveFn();
    if(state.phase === Phase.GameOver) return;

    state.phase = Phase.AfterResolve;
    refreshPlayUI();

    await decisionMomentMenu("After resolving. You can play cards, then End Turn.");
  }

  async function teleportThenResolve(dest){
    const p = currentPlayer();
    state.phase = Phase.Moving;
    refreshPlayUI();

    await animateMoveTo(p, dest);

    const usePlus = await maybeUsePlus1();
    if(usePlus){
      p.usedPlus1ThisTurn = true;
      const extraDest = await computeDestination(p.pos, 1, "cw");
      await animateMoveTo(p, extraDest);
      log(`${p.name} uses +1 Move.`);
    }

    await landWithZoomThenResolve(async () => {
      await resolveSpace(p.pos);
    });
  }

  async function doForcedMove(steps, dir){
    const p = currentPlayer();
    state.phase = Phase.Moving;
    refreshPlayUI();

    const dest = await computeDestination(p.pos, steps, dir);
    await animateMoveTo(p, dest);

    const usePlus = await maybeUsePlus1();
    if(usePlus){
      p.usedPlus1ThisTurn = true;
      const extraDest = await computeDestination(p.pos, 1, "cw");
      await animateMoveTo(p, extraDest);
      log(`${p.name} uses +1 Move.`);
    }

    await landWithZoomThenResolve(async () => {
      await resolveSpace(p.pos);
    });
  }

  // ----------------------------
  // Complex spaces
  // ----------------------------
  async function battleRap(){
    const p = currentPlayer();
    const opponent = await pickOtherPlayer(p, "Battle Rap: choose an opponent.");
    if(!opponent) return;

    const r1 = rollD20();
    const r2 = rollD20();
    log(`${p.name} rolls ${r1}. ${opponent.name} rolls ${r2}.`);

    if(r1 === r2){
      log("Tie. Nobody wins $20.");
      return;
    }
    const winner = r1 > r2 ? p : opponent;
    bankCollect(winner, 20, "Battle Rap win");
  }

  async function basementAttempt(){
    const p = currentPlayer();
    const r = rollD20();
    log(`${p.name} rolls d20: ${r} (${SPACES[p.pos]})`);

    if(r <= 9){
      p.loseTurn = true;
      log(`${p.name} loses a turn.`);
      return;
    }

    const victims = state.game.players.filter(pl => pl.id !== p.id && pl.bedroom.length > 0);
    if(victims.length === 0){
      log("No one has a Bedroom Shop resource to steal.");
      return;
    }

    const victim = await new Promise(resolve => {
      openModal({
        title:"Steal a resource",
        body:"Choose who to steal 1 Bedroom Shop resource card from.",
        actions: victims.map(v => ({label:v.name, onClick:()=>resolve(v)}))
          .concat([{label:"Cancel", danger:true, onClick:()=>resolve(null)}])
      });
    });
    if(!victim) return;

    const stolen = victim.bedroom.splice(Math.floor(Math.random()*victim.bedroom.length),1)[0];
    p.bedroom.push(stolen);
    log(`${p.name} steals Bedroom resource from ${victim.name}: ${stolen.title}`);
  }

  async function hookahLounge(){
    const p = currentPlayer();
    const choice = await new Promise(resolve => {
      openModal({
        title:"Hookah Lounge",
        body:"Another player plays a random Spotify song.\nChoose what you guessed correctly:",
        actions:[
          {label:"Got ARTIST (+$20)", onClick:()=>resolve("artist")},
          {label:"Got SONG (+$10)", onClick:()=>resolve("song")},
          {label:"Got BOTH (+$30)", onClick:()=>resolve("both")},
          {label:"Got NONE (+$0)", onClick:()=>resolve("none")}
        ]
      });
    });

    if(choice === "artist") bankCollect(p, 20, "Hookah Lounge");
    else if(choice === "song") bankCollect(p, 10, "Hookah Lounge");
    else if(choice === "both") bankCollect(p, 30, "Hookah Lounge");
    else log(`${p.name} gets nothing from Hookah Lounge.`);
  }

  async function fakeFamily(){
    const p = currentPlayer();
    const opponent = await pickOtherPlayer(p, "Fake Family: choose an opponent.");
    if(!opponent) return;

    log(`Both players go to Living Room (s0).`);
    const s0 = getSpaceXY(0);

    p.pos = 0; p.ax = s0.x; p.ay = s0.y;
    opponent.pos = 0; opponent.ax = s0.x + 30; opponent.ay = s0.y;

    const r1 = rollD20();
    const r2 = rollD20();
    log(`${p.name} rolls ${r1}. ${opponent.name} rolls ${r2}.`);

    if(r1 === r2){
      log("Tie. Nobody wins $20.");
      return;
    }
    const winner = r1 > r2 ? p : opponent;
    bankCollect(winner, 20, "Fake Family win");
  }

  async function drawCloset(){
    const p = currentPlayer();
    const g = state.game;

    const card = g.closetDeck.draw();
    g.closetDeck.putBackAndShuffle(card);

    log(`${p.name} draws CLOSET OF SHAME: ${card.title}`);

    if(card.kind === "target_roll_pay_to_drawer"){
      const target = await pickOtherPlayer(p, "Choose a player for this card.");
      if(!target) return;

      const r = rollD20();
      log(`Roll d20: ${r}`);
      const rule = card.rules.find(x => r >= x.min && r <= x.max);
      if(rule?.pay){
        payPlayer(target, p, rule.pay, "Closet of Shame");
      }
      return;
    }

    const r = rollD20();
    log(`Roll d20: ${r}`);
    const rule = card.rules.find(x => r >= x.min && r <= x.max);
    if(rule?.pay) bankPay(p, rule.pay, "Closet of Shame");
    if(rule?.collect) bankCollect(p, rule.collect, "Closet of Shame");
  }

  async function robbedChoice(label, toStash){
    const p = currentPlayer();
    const canLoseResource = p.bedroom.length > 0;

    const choice = await new Promise(resolve => {
      const actions = [
        { label:"Lose $10", onClick:()=>resolve("money") },
      ];
      if(canLoseResource) actions.push({ label:"Lose 1 resource card", onClick:()=>resolve("resource") });
      actions.push({ label:"Cancel", danger:true, onClick:()=>resolve(null) });
      openModal({ title:label, body:"Choose what you lose.", actions });
    });
    if(!choice) return;

    if(choice === "money"){
      bankPay(p, 10, label);
      return;
    }
    if(choice === "resource"){
      const lost = p.bedroom.splice(Math.floor(Math.random()*p.bedroom.length),1)[0];
      if(toStash){
        state.game.kalifStash.push(lost);
        log(`${p.name} loses a resource to Kalif's stash: ${lost.title}`);
      } else {
        log(`${p.name} loses a resource: ${lost.title}`);
      }
    }
  }

  async function blewItAll(){
    const p = currentPlayer();
    const g = state.game;

    log(`${p.name} BLEW IT ALL. Money to bank. Resources to Kalif's stash.`);
    p.cash = 0;

    while(p.bedroom.length){
      g.kalifStash.push(p.bedroom.pop());
    }
    refreshPlayUI();
  }

  async function drawBedroomShop(){
    const p = currentPlayer();
    const g = state.game;

    const card = g.bedroomDeck.draw();
    g.bedroomDeck.putBackAndShuffle(card);

    p.bedroom.push(card);
    log(`${p.name} gains BEDROOM SHOP card: ${card.title}`);
  }

  async function blackmail(){
    const p = currentPlayer();
    const target = await pickOtherPlayer(p, "Blackmail: choose a player.");
    if(!target) return;

    const choice = await new Promise(resolve => {
      openModal({
        title:"Blackmail",
        body:`${target.name} chooses:\nPay ${p.name} $10, OR lose a turn.`,
        actions:[
          {label:`Pay $10 to ${p.name}`, onClick:()=>resolve("pay")},
          {label:"Lose a turn", onClick:()=>resolve("turn")}
        ]
      });
    });

    if(choice === "pay"){
      payPlayer(target, p, 10, "Blackmail");
    } else {
      target.loseTurn = true;
      log(`${target.name} chooses to lose a turn.`);
    }
  }

  async function highTensionTowers(){
    const p = currentPlayer();
    const r = rollD20();
    log(`${p.name} rolls d20 for High Tension Towers: ${r}`);

    if(r <= 9){
      p.loseTurn = true;
      log(`${p.name} loses a turn.`);
      return;
    }

    log(`${p.name} moves ahead ${r} spaces.`);
    await doForcedMove(r, "cw");
  }

  async function featOnTrack(){
    const p = currentPlayer();
    const g = state.game;

    const occupied = new Set(g.players.filter(pl => pl.id !== p.id).map(pl => pl.pos));
    if(occupied.size === 0){
      log("No other players on the board. Nothing happens.");
      return;
    }

    let steps = 0;
    let pos = p.pos;
    while(steps < 200){
      pos = nextCW(pos);
      steps++;
      if(occupied.has(pos)){
        log(`${p.name} feats to nearest occupied space: s${pos} (${SPACES[pos]}).`);
        await teleportThenResolve(pos);
        return;
      }
    }
  }

  async function drawOneHit(){
    const p = currentPlayer();
    const g = state.game;

    const card = g.oneHitDeck.draw();
    if(!card){
      g.oneHitDeck = makeDeck(ONE_HIT_WONDERS);
      g.oneHitDeck.shuffle();
      p.oneHit.push(g.oneHitDeck.draw());
      log(`${p.name} draws ONE HIT WONDER.`);
      return;
    }
    p.oneHit.push(card);
    log(`${p.name} draws ONE HIT WONDER: ${card.title}`);
  }

  async function russians(){
    const r = rollD20();
    const dir = await new Promise(resolve => {
      openModal({
        title:"The Russians",
        body:`Roll d20 = ${r}\nChoose direction to move ${r} spaces.`,
        actions:[
          {label:"Clockwise", onClick:()=>resolve("cw")},
          {label:"Counterclockwise", onClick:()=>resolve("ccw")}
        ]
      });
    });

    await doForcedMove(r, dir);
  }

  async function tookTooMuch(){
    const r = rollD20();
    log(`${currentPlayer().name} rolls d20 for Roll Backwards: ${r}`);
    await doForcedMove(r, "ccw");
  }

  // ----------------------------
  // Resolve a space (after zoom)
  // ----------------------------
  async function resolveSpace(spaceIndex){
    const g = state.game;
    const p = currentPlayer();

    if(spaceIndex === 4){
      log(`${p.name} landed on First of the Month.`);
      checkWinImmediate(p);
      return;
    }

    switch(spaceIndex){
      case 0: log(`${p.name} is in the Living Room. Free space.`); return;
      case 1: bankCollect(p, 5, "Expired peanut butter & matzoh"); return;
      case 2: log(`${p.name} is transported to Meech's Bedroom Shop (s20).`); await teleportThenResolve(20); return;
      case 3: p.loseTurn = true; log(`${p.name} loses a turn (School of Rock).`); return;

      case 5: await battleRap(); return;
      case 6:
      case 22: await basementAttempt(); return;

      case 7: await hookahLounge(); return;
      case 8: bankPay(p, 5, "You bought Shisha"); return;

      case 9: await fakeFamily(); return;

      case 10: {
        const r = rollD20();
        log(`${p.name} rolls d20 for Sell Your Blood: ${r}`);
        bankCollect(p, r, "Sell Your Blood");
        return;
      }

      case 11:
      case 33: await drawCloset(); return;

      case 12:
      case 14:
      case 32:
        log(`${p.name} rolls again (${SPACES[spaceIndex]}).`);
        state.phase = Phase.StartTurn;
        refreshPlayUI();
        await doRoll();
        return;

      case 13: bankPay(p, 5, "Ate Sour Pizza"); return;
      case 15: await robbedChoice("Robbed by Kalif", false); return;

      case 16:
      case 30: log(`${p.name} is transported to The Hookah Lounge (s7).`); await teleportThenResolve(7); return;

      case 17: await blewItAll(); return;
      case 18: p.loseTurn = true; log(`${p.name} loses a turn.`); return;

      case 19:
      case 27: log(`${p.name} is transported to The Inferno (s34).`); await teleportThenResolve(34); return;

      case 20:
        await drawBedroomShop();
        if(hasBedroom(p, "land_s20_plus5")) bankCollect(p, 5, "Meech left the safe open");
        return;

      case 21: await blackmail(); return;
      case 23: bankPay(p, 5, "Toothbrush"); return;

      case 24: await highTensionTowers(); return;
      case 25: await featOnTrack(); return;

      case 26:
        for(const pl of g.players) bankCollect(pl, 10, "Orgy Night");
        return;

      case 28: await drawOneHit(); return;
      case 29: await russians(); return;

      case 31: bankPay(p, 10, "Komar's piss jugs"); return;

      case 34: {
        let sum = 0;
        for(let i=0;i<5;i++) sum += rollD20();
        log(`${p.name} rolls Inferno (5x d20) total: ${sum}`);
        bankCollect(p, sum, "Inferno");
        return;
      }

      case 35: await robbedChoice("Robbed by the Gash", true); return;
      case 36: await tookTooMuch(); return;
      default: log(`${p.name} lands on ${SPACES[spaceIndex]}. No effect.`); return;
    }
  }

  // ----------------------------
  // Turn flow
  // ----------------------------
  function startTurn(){
    if(!state.game || state.phase === Phase.GameOver) return;

    state.phase = Phase.StartTurn;
    const p = currentPlayer();
    p.usedPlus1ThisTurn = false;
    state.game.lastRoll = null;

    log(`Turn: ${p.name}`);

    if(p.loseTurn){
      p.loseTurn = false;
      log(`${p.name} loses a turn.`);
      endTurnInternal(false);
      return;
    }

    refreshPlayUI();
  }

  async function doRoll(){
    const g = state.game;
    const p = currentPlayer();

    state.phase = Phase.AfterRoll;
    g.lastRoll = rollD20();
    log(`${p.name} rolls d20: ${g.lastRoll}`);
    refreshPlayUI();

    await decisionMomentMenu("Right after roll (before movement).");
    if(state.phase === Phase.GameOver) return;

    await doMoveByRoll(g.lastRoll);
  }

  async function doMoveByRoll(steps){
    const p = currentPlayer();
    state.phase = Phase.Moving;
    refreshPlayUI();

    const dest = await computeDestination(p.pos, steps, "cw");
    await animateMoveTo(p, dest);

    const usePlus = await maybeUsePlus1();
    if(usePlus){
      p.usedPlus1ThisTurn = true;
      const extraDest = await computeDestination(p.pos, 1, "cw");
      await animateMoveTo(p, extraDest);
      log(`${p.name} uses +1 Move.`);
    }

    await landWithZoomThenResolve(async () => {
      await resolveSpace(p.pos);
    });
  }

  function endTurnInternal(skipExtraQueue){
    const g = state.game;
    if(!g) return;

    const p = currentPlayer();

    if(!skipExtraQueue && p.extraTurnQueued > 0){
      p.extraTurnQueued -= 1;
      log(`${p.name} takes an EXTRA TURN!`);
      startTurn();
      return;
    }

    g.turn = (g.turn + 1) % g.players.length;
    startTurn();
  }

  function endTurn(){
    if(state.phase === Phase.GameOver) return;
    if(!(state.phase === Phase.AfterResolve || state.phase === Phase.StartTurn)){
      openModal({ title:"Not yet", body:"End your turn after resolving, or at the start of your turn.", actions:[{label:"OK"}]});
      return;
    }
    endTurnInternal(false);
  }

  // ----------------------------
  // New game
  // ----------------------------
  function newGame(){
    const chosen = [...state.selected];

    if(chosen.length < 2){
      openModal({ title:"Need players", body:"Pick at least 2 players.", actions:[{label:"OK"}]});
      return;
    }
    if(!haveCoords()){
      openModal({ title:"Board not mapped", body:"Click “Map the board” first.", actions:[{label:"OK"}]});
      return;
    }

    const players = chosen.map((name, idx) => {
      const p0 = getSpaceXY(0);
      return {
        id: idx,
        name,
        color: CHIP_COLORS[idx],
        pos: 0,
        cash: START_CASH,
        loseTurn: false,
        extraTurnQueued: 0,
        bedroom: [],
        oneHit: [],
        usedPlus1ThisTurn: false,
        ax: p0.x, ay: p0.y,
        tx: p0.x, ty: p0.y,
        _forkMode: null,
      };
    });

    state.game = {
      players,
      turn: 0,
      lastRoll: null,
      bedroomDeck: makeDeck(BEDROOM_SHOP),
      closetDeck: makeDeck(CLOSET),
      oneHitDeck: makeDeck(ONE_HIT_WONDERS),
      kalifStash: [],
    };

    state.game.bedroomDeck.shuffle();
    state.game.closetDeck.shuffle();
    state.game.oneHitDeck.shuffle();

    logEl.innerHTML = "";
    log("New game started.");
    state.phase = Phase.StartTurn;
    showPlay();
    startTurn();
  }

  // ----------------------------
  // Drawing
  // ----------------------------
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
    ctx.font = "800 10px system-ui, -apple-system, Segoe UI, Roboto, Arial";
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

    if(state.phase === Phase.Mapping){
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

    if(state.game){
      for(const p of state.game.players){
        drawChip(p);
      }
    }
  }

  // ----------------------------
  // UI refresh
  // ----------------------------
  function refreshMenuStatus(){
    menuStatus.textContent = haveCoords()
      ? "Board mapped: YES. You can Play."
      : "Board mapped: NO. Click “Map the board” first.";
  }

  function refreshMapUI(){
    mapNext.textContent = `s${state.mapIndex}`;
    coordsOut.value = JSON.stringify(COORDS, null, 2);
  }

  function refreshPlayUI(){
    if(!state.game) return;
    const g = state.game;
    const p = currentPlayer();

    turnInfo.textContent =
      `Player: ${p.name}\n` +
      `Space: s${p.pos} (${SPACES[p.pos]})\n` +
      `Cash: $${p.cash}\n` +
      `One Hit Wonders: ${p.oneHit.length}\n` +
      `Bedroom cards: ${p.bedroom.length}\n` +
      `Phase: ${state.phase}`;

    btnRoll.disabled = !(state.phase === Phase.StartTurn) || state.phase === Phase.GameOver;
    btnEndTurn.disabled = !(state.phase === Phase.AfterResolve || state.phase === Phase.StartTurn) || state.phase === Phase.GameOver;
    btnDecision.disabled = (state.phase === Phase.Moving || state.phase === Phase.Zooming || state.phase === Phase.Resolving || state.phase === Phase.GameOver);

    playersStatus.innerHTML = "";
    for(const pl of g.players){
      const div = document.createElement("div");
      div.className = "pcard";
      const bedroomTitles = pl.bedroom.map(c => c.title).join(", ") || "None";
      const oneHitTitles = pl.oneHit.map(c => c.title).join(", ") || "None";
      div.innerHTML =
        `<div class="name">${pl.name}</div>` +
        `<div class="meta">Cash: $${pl.cash} • Space: s${pl.pos}</div>` +
        `<div class="meta">Lose turn: ${pl.loseTurn ? "YES" : "no"} • Extra turns: ${pl.extraTurnQueued}</div>` +
        `<div class="meta">Bedroom: ${bedroomTitles}</div>` +
        `<div class="meta">One Hit: ${oneHitTitles}</div>`;
      playersStatus.appendChild(div);
    }
  }

  // ----------------------------
  // Player selection UI
  // ----------------------------
  function buildPlayerPick(){
    playerPick.innerHTML = "";
    for(const name of ROSTER){
      const label = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = state.selected.has(name);
      cb.onchange = () => {
        if(cb.checked) state.selected.add(name);
        else state.selected.delete(name);
        if(state.selected.size > 6){
          cb.checked = false;
          state.selected.delete(name);
        }
      };
      label.appendChild(cb);
      const span = document.createElement("span");
      span.textContent = name;
      label.appendChild(span);
      playerPick.appendChild(label);
    }
  }

  // ----------------------------
  // Mapping events
  // ----------------------------
  function canvasToWorld(e){
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (canvas.width / rect.width);
    const py = (e.clientY - rect.top) * (canvas.height / rect.height);

    const wx = (px - (canvas.width*0.5 - cam.x * cam.scale)) / cam.scale;
    const wy = (py - (canvas.height*0.5 - cam.y * cam.scale)) / cam.scale;
    return {x: wx, y: wy};
  }

  canvas.addEventListener("click", (e) => {
    if(state.phase !== Phase.Mapping) return;

    const {x,y} = canvasToWorld(e);
    const idx = state.mapIndex;
    if(idx >= SPACE_COUNT) return;

    COORDS[idx] = {x: Math.round(x), y: Math.round(y)};
    state.mapIndex += 1;
    saveCoords();

    if(state.mapIndex >= SPACE_COUNT){
      setHint("Mapping complete. Returning to main menu.");
      state.phase = Phase.Menu;
      setCameraTarget(canvas.width*0.5, canvas.height*0.5, 1);
      showMenu();
      return;
    }

    refreshMapUI();
  });

  btnUndo.addEventListener("click", () => {
    if(state.phase !== Phase.Mapping) return;
    if(state.mapIndex <= 0) return;
    state.mapIndex -= 1;
    COORDS.pop();
    saveCoords();
    refreshMapUI();
  });

  btnClear.addEventListener("click", () => {
    if(state.phase !== Phase.Mapping) return;
    COORDS = [];
    state.mapIndex = 0;
    saveCoords();
    refreshMapUI();
  });

  // ----------------------------
  // Buttons / navigation
  // ----------------------------
  btnMap.addEventListener("click", () => {
    state.phase = Phase.Mapping;
    state.mapIndex = COORDS.length;
    showMap();
  });

  btnPlay.addEventListener("click", () => {
    newGame();
  });

  btnBackMenu.addEventListener("click", () => {
    state.game = null;
    state.phase = Phase.Menu;
    showMenu();
  });

  btnBackMenu2.addEventListener("click", () => {
    state.phase = Phase.Menu;
    showMenu();
  });

  btnRoll.addEventListener("click", async () => {
    if(!state.game) return;
    if(state.phase !== Phase.StartTurn) return;
    await doRoll();
  });

  btnEndTurn.addEventListener("click", () => endTurn());

  btnDecision.addEventListener("click", async () => {
    if(!state.game) return;
    if(btnDecision.disabled) return;
    await decisionMomentMenu("Manual decision menu.");
    refreshPlayUI();
  });

  // ----------------------------
  // Render loop
  // ----------------------------
  let lastT = performance.now();
  function loop(t){
    const dt = (t - lastT) / 1000;
    lastT = t;
    updateCamera(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // ----------------------------
  // Init
  // ----------------------------
  closeModal();
  buildPlayerPick();
  state.phase = Phase.Menu;
  showMenu();
  refreshMenuStatus();
  requestAnimationFrame(loop);
})();
