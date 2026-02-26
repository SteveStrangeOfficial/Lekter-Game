// app.js
(() => {
  const BOARD_IMAGE_PATH = "assets/board.png";
  const SPACE_COUNT = 37;
  const LS_COORDS_KEY = "lekter_coords_v1";

  const ROSTER = ["MC SKETCHY","AMADEUS","DJ NOTH?NG","BEARD","MR. C","KALIF"];
  const CHIP_COLORS = ["#ffffff", "#ffd400", "#ff2d2d", "#111111", "#ff4fd8", "#8a2be2"];

  const START_CASH = 100;
  const WIN_CASH = 200;

  // Debt rules
  const LOSE_DEBT = -200; // -$200 or less => eliminated

  // Camera follow behavior (no zoom-to-space)
  const FOLLOW_SCALE = 2.2;

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

  // Modal
  const modalBackdrop = el("modalBackdrop");
  const modalTitle = el("modalTitle");
  const modalBody = el("modalBody");
  const modalActions = el("modalActions");

  // Instruction card overlay
  const infoCard = el("infoCard");
  const infoTitle = el("infoTitle");
  const infoBody = el("infoBody");
  const infoOk = el("infoOk");

  // Card image popup
  const cardBackdrop = el("cardBackdrop");
  const cardImg = el("cardImg");
  const cardClose = el("cardClose");

  function setHint(t){ if (hint) hint.textContent = t; }

  function log(line){
    if (!logEl) return;
    const div = document.createElement("div");
    div.className = "line";
    div.textContent = line;
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
  }

  // Modal
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

  // Card popup
  function closeCard(){
    if(!cardBackdrop) return;
    cardImg.src = "";
    cardBackdrop.style.display = "none";
  }

  function openCardImage(cardNumber){
    if(!cardBackdrop) return;
    cardImg.src = `assets/cards/${cardNumber}.png`;
    cardBackdrop.style.display = "flex";
  }

  if(cardBackdrop){
    cardBackdrop.addEventListener("click", (e) => {
      if(e.target === cardBackdrop) closeCard();
    });
  }
  if(cardClose){
    cardClose.addEventListener("click", () => closeCard());
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal();
      hideInfo();
      closeCard();
    }
  });

  // Instruction card
  let infoResolver = null;

  function showInfo(title, body){
    return new Promise(resolve => {
      infoTitle.textContent = title ?? "";
      infoBody.textContent = body ?? "";
      infoCard.classList.remove("hidden");
      infoResolver = resolve;
    });
  }

  function hideInfo(){
    if (!infoCard) return;
    infoCard.classList.add("hidden");
    if (infoResolver) {
      const r = infoResolver;
      infoResolver = null;
      r();
    }
  }

  infoOk.addEventListener("click", () => hideInfo());

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

  // Board image
  const boardImg = new Image();
  let boardLoaded = false;
  boardImg.onload = () => { boardLoaded = true; };
  boardImg.onerror = () => { boardLoaded = false; setHint("Could not load assets/board.png"); };
  boardImg.src = BOARD_IMAGE_PATH;

  // Resize canvas
  function resizeCanvasToDisplaySize(){
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      cam.x = canvas.width * 0.5;
      cam.y = canvas.height * 0.5;
      cam.targetX = cam.x;
      cam.targetY = cam.y;
    }
  }

  window.addEventListener("resize", () => resizeCanvasToDisplaySize());

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
  };

  function nowMs(){ return performance.now(); }

  function setCameraTarget(centerX, centerY, scale){
    cam.targetX = centerX;
    cam.targetY = centerY;
    cam.targetScale = scale;
  }

  function followPlayer(player){
    setCameraTarget(player.ax, player.ay, FOLLOW_SCALE);
  }

  function updateCamera(dt){
    const k = 8;
    cam.scale += (cam.targetScale - cam.scale) * Math.min(1, dt * k);
    cam.x += (cam.targetX - cam.x) * Math.min(1, dt * k);
    cam.y += (cam.targetY - cam.y) * Math.min(1, dt * k);
  }

  // Spaces list
  const SPACE_TITLES = [
    "START / Living Room",
    "Expired peanut butter & matzoh",
    "Go to Meech's Bedroom Shop",
    "School of Rock script",
    "First of the Month",
    "Battle Rap",
    "Basement Suicide Attempt",
    "The Hookah Lounge",
    "You Bought Shisha",
    "Fake Family",
    "Sell Your Blood",
    "MC Sketchy's Closet of Shame",
    "Sound Check",
    "Ate Sour Pizza",
    "Darron Had a Seizure",
    "Robbed by Kalif",
    "Pack a Bowl",
    "You Blew It All",
    "Lose a Turn",
    "Practice Time",
    "Meech's Bedroom Shop",
    "Blackmail",
    "Basement Suicide Attempt",
    "Toothbrush",
    "High Tension Towers",
    "Feat. on the Track",
    "Orgy Night",
    "Practice Time",
    "One Hit Wonder",
    "The Russians",
    "Pack a Bowl",
    "Komar's Piss Jugs",
    "Lauren had a seizure",
    "MC Sketchy's Closet of Shame",
    "The Inferno",
    "Robbed by the Gash",
    "You Took Too Much"
  ];

  // Movement (NO FORK)
  // Normal movement: clockwise
  // CCW: ONLY Russians (choice) and Took Too Much (forced)
  // s0–s3 are only reachable from s0 path, main loop is s4..s36.
  function nextCW(pos){
    if(pos < 4) return pos + 1;     // s0->s1->s2->s3->s4
    if(pos === 36) return 4;        // loop back to s4
    return pos + 1;                 // s4..s35 -> +1
  }
  function prevCCW(pos){
    if(pos === 4) return 36;
    if(pos > 4) return pos - 1;
    if(pos === 0) return 0;
    return pos - 1;
  }

  // Cards (images: assets/cards/1.png ... assets/cards/18.png)
  const ONE_HIT_WONDERS = [
    { key:"mic_drop", title:"MIC DROP", text:"MIC DROP\n\nSHUT DOWN ANOTHER PLAYER'S TURN ON THE SPOT!\nMAKE THEM LOSE A TURN", kind:"mic_drop", img:1 },
    { key:"goat_tax", title:"GOAT TAX", text:"GOAT TAX\n\nDEMAND $10 FROM EVERY PLAYER", kind:"goat_tax", img:2 },
    { key:"encore", title:"ENCORE!", text:"ENCORE!\n\nTAKE ANOTHER TURN IMMEDIATELY", kind:"encore", img:3 },
    { key:"swap_666", title:"666 SWAP", text:"666 SWAP\n\nSWAP SPACES WITH ANY PLAYER", kind:"swap", img:4 },
    { key:"i_want_it_all", title:"I WANT IT ALL", text:"I WANT IT ALL\n\nCOLLECT $30 FROM THE BANK RIGHT NOW.", kind:"bank_collect", amount:30, img:5 },
  ];

  const BEDROOM_SHOP = [
    { key:"pass_s4_plus10", title:"MEECH APPRECIATES YOUR 'BUSINESS.'",
      text:"EVERY TIME YOU PASS THE \"FIRST OF THE MONTH\" COLLECT $10.\nMEECH APPRECIATES YOUR 'BUSINESS.'", img:6 },
    { key:"land_s20_plus5", title:"MEECH LEFT THE SAFE OPEN...",
      text:"MEECH LEFT THE SAFE OPEN...\n\nAS LONG AS YOU HAVE THIS CARD\nEVERY TIME YOU LAND ON\nMEECH'S BEDROOM SHOP,\nTAKE $5 FROM HIS SAFE", img:7 },
    { key:"swap_any_bedroom", title:"HEY BUDDY.....",
      text:"HEY BUDDY.....\n\nSWAP SPOTS WITH ANY PLAYER ON THE BOARD.\nMEECH MAKES THINGS HAPPEN\nWHEN YOU NEED IT MOST.", img:8 },
    { key:"virginia_slims", title:"VIRGINIA SLIMS",
      text:"MEECH BLESSES YOU\nWITH 24 PACKS OF\nVIRGINIA SLIMS.\n\n(THIS CARD DOES NOTHING EXCEPT GIVE YOU IN-GAME LUNG CANCER.)", img:9 },
    { key:"double_bank", title:"2X MONEY",
      text:"ANY MONEY YOU RECIEVE IS\n2X\nAS LONG AS YOU HAVE\nTHIS CARD", img:10 },
    { key:"may_plus1", title:"+1 MOVE",
      text:"AS LONG AS\nYOU HAVE THIS CARD,\nYOU MAY MOVE\nONE EXTRA SPACE\nPER TURN", img:11 },
  ];

  const CLOSET = [
    { title:"YOU HAD YOUR FIRST LESBIAN EXPERIENCE WITH KARA",
      text:"YOU HAD YOUR FIRST LESBIAN EXPERIENCE WITH KARA\n\nROLL 1-9\nYOU HATED IT AND -$5\n(AND ANY RESPECT YOU HAD FOR YOURSELF)\n\nROLL 10-20\nYOU LIKED IT AND +$10\n(BUT YOU LOSE ANY RESPECT YOU HAD FOR YOURSELF)",
      kind:"roll_bank", rules:[{min:1,max:9,pay:5},{min:10,max:20,collect:10}], img:12 },

    { title:"MARIA GOT DRUNK AND PASSED OUT NAKED IN YOUR BED",
      text:"MARIA GOT DRUNK AND PASSED OUT NAKED IN YOUR BED\n\nROLL 1-9\nSHE LETS YOU SLIP IT IN AND YOU NUT YOURSELF SWEETLY TO SLEEP\n+$10\n\nROLL 11-20\nYOUR GIRLFRIEND COMES HOME AND CRACKS A BOTTLE OVER YOUR HEAD\n-$10\n\nROLL 10\nYOU GET HER PREGNANT AND WON'T BE HAVING ANY OF THAT DRAMA\n-$100 FOR THE ABORTION",
      kind:"roll_bank_multi", rules:[{min:1,max:9,collect:10},{min:10,max:10,pay:100},{min:11,max:20,pay:10}], img:13 },

    { title:"PICK A PLAYER TO CLEAN THE CROCKPOT FULL OF 3 MONTH OLD SOUP AND MAGGOTS",
      text:"PICK A PLAYER TO CLEAN THE CROCKPOT FULL OF 3 MONTH OLD SOUP AND MAGGOTS\n\nROLL 1-9\nPLAYER -$5\n\nROLL 10-20\nPLAYER -$10",
      kind:"target_roll_pay_to_drawer", rules:[{min:1,max:9,pay:5},{min:10,max:20,pay:10}], img:14 },

    { title:"PARTH THREW UP ON THE FLOOR AND LEFT FOR INDIA.",
      text:"PARTH THREW UP ON THE FLOOR AND LEFT FOR INDIA.\n\nROLL 1-9\nYOU HAVE TO CLEAN IT UP\n-$10\n\nROLL 10-20\nLAY A NEWSPAPER ON IT AND LET HIM TAKE CARE OF IT IN 3 WEEKS\n+$20",
      kind:"roll_bank", rules:[{min:1,max:9,pay:10},{min:10,max:20,collect:20}], img:15 },

    { title:"BEARD BROUGHT HIS MOTHERS BROOM TO THE HOUSE",
      text:"BEARD BROUGHT HIS MOTHERS BROOM TO THE HOUSE\n\nROLL 1-9\nYOU UNLEASH THE UNHOLY SPIRIT OF LA LLORONA INTO THE HOUSE\n-$10\n\nROLL 10-20\nYOU SWEEP UP ALL THE ASH FROM THE HOOKAH COALS. PRAY A BLESSING, RETURN THE BROOM AND EVERYTHING IS FINE\n+$20",
      kind:"roll_bank", rules:[{min:1,max:9,pay:10},{min:10,max:20,collect:20}], img:16 },

    { title:"YOU SLIP ON KALIF'S PISS IN THE KITCHEN",
      text:"YOU SLIP ON KALIF'S PISS IN THE KITCHEN\n\nROLL 1-9\nBREAK YOUR ANKLE AND THE PISS SPLASHES IN YOUR MOUTH\n-$20\n\nROLL 10-20\nHE PASSES OUT AND YOU PISS ON HIS PANTS TO MAKE HIM THINK HE PISSED HIMSELF WHILE HE WAS BLACKED OUT BUT REALLY HE'S JUST BEEN MARINATING IN YOUR PISS FOR 6 HRS\n+$20",
      kind:"roll_bank", rules:[{min:1,max:9,pay:20},{min:10,max:20,collect:20}], img:17 },

    { title:"STEVE'S MOM DROPS OFF A BAG OF FOOD",
      text:"STEVE'S MOM DROPS OFF A BAG OF FOOD\n\nROLL 1-9\nIT'S CANNED BEETS & EXPIRED MATZAH\n-$10\n\nROLL 10-20\nIT'S A NEW BAG OF OREOS AND 3 BOXES OF THE GOOD MAC AND CHEESE\n+$10",
      kind:"roll_bank", rules:[{min:1,max:9,pay:10},{min:10,max:20,collect:10}], img:18 },
  ];

  const Phase = {
    Menu: "Menu",
    Mapping: "Mapping",
    StartTurn: "StartTurn",
    AfterRoll: "AfterRoll",
    Moving: "Moving",
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

  // Random draw each time
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
        const idx = Math.floor(Math.random() * this.cards.length);
        return this.cards.splice(idx, 1)[0];
      },
      putBackAndShuffle(card){
        this.cards.push(card);
        this.shuffle();
      }
    };
  }

  function currentPlayer(){ return state.game.players[state.game.turn]; }
  function hasBedroom(p, key){ return p.bedroom.some(c => c.key === key); }

  function tryEliminateIfInDebt(p, reason){
    if(!state.game || state.phase === Phase.GameOver) return;
    if(p.cash <= LOSE_DEBT){
      eliminatePlayer(p.id, reason ?? "Debt");
    }
  }

  function eliminatePlayer(playerId, reason){
    const g = state.game;
    if(!g || state.phase === Phase.GameOver) return;

    const idx = g.players.findIndex(pl => pl.id === playerId);
    if(idx === -1) return;

    const wasCurrent = (idx === g.turn);
    const eliminated = g.players[idx];

    log(`${eliminated.name} is eliminated (${reason}). Cash: $${eliminated.cash}.`);

    if(idx < g.turn) g.turn -= 1;

    g.players.splice(idx, 1);

    if(g.players.length === 1){
      const winner = g.players[0];
      state.phase = Phase.GameOver;
      openModal({
        title:"GAME OVER",
        body:`${winner.name} wins! (${eliminated.name} eliminated at $${eliminated.cash}.)`,
        actions:[{label:"OK"}]
      });
      log(`${winner.name} WINS!`);
      refreshPlayUI();
      return;
    }

    if(wasCurrent){
      if(g.turn >= g.players.length) g.turn = 0;
      state.phase = Phase.StartTurn;
      refreshPlayUI();
      openModal({
        title:"PLAYER ELIMINATED",
        body:`${eliminated.name} is out (${reason}). Game continues.`,
        actions:[{label:"OK"}]
      });
      startTurn();
      return;
    }

    if(g.turn >= g.players.length) g.turn = 0;
    refreshPlayUI();
  }

  function bankCollect(p, amount, reason){
    let amt = amount;
    if(hasBedroom(p, "double_bank")) amt *= 2;
    p.cash += amt;
    log(`${p.name} collects $${amt}${reason ? " ("+reason+")" : ""}.`);
    checkWinImmediate(p);
    tryEliminateIfInDebt(p, "Debt");
    refreshPlayUI();
  }

  function bankPay(p, amount, reason){
    p.cash -= amount;
    log(`${p.name} pays $${amount}${reason ? " ("+reason+")" : ""}.`);
    tryEliminateIfInDebt(p, reason ?? "Debt");
    refreshPlayUI();
  }

  function payPlayer(from, to, amount, reason){
    from.cash -= amount;
    to.cash += amount;
    log(`${from.name} pays ${to.name} $${amount}${reason ? " ("+reason+")" : ""}.`);
    checkWinImmediate(to);
    tryEliminateIfInDebt(from, reason ?? "Debt");
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

  // $10 pass bonus ONLY if player holds the Bedroom card
  function applyPassS4BonusIfCrossing(p, from, to){
    if(to === 4 && from !== 4 && hasBedroom(p, "pass_s4_plus10")){
      bankCollect(p, 10, "Pass First of the Month");
    }
  }

  async function computePath(startPos, steps, dir){
    let pos = startPos;
    const p = currentPlayer();
    const path = [];

    for(let i=0;i<steps;i++){
      const next = (dir === "cw") ? nextCW(pos) : prevCCW(pos);
      applyPassS4BonusIfCrossing(p, pos, next);
      pos = next;
      path.push(pos);
    }
    return path;
  }

  function animateAlongPath(player, pathIndices){
    return new Promise(resolve => {
      if(!pathIndices.length){ resolve(); return; }

      const pts = pathIndices.map(i => ({ i, ...getSpaceXY(i) }));

      let seg = 0;
      let sx = player.ax, sy = player.ay;

      const speed = 550;

      function animateSegment(){
        if(seg >= pts.length){
          resolve();
          return;
        }

        const target = pts[seg];
        const ex = target.x, ey = target.y;
        const dist = Math.hypot(ex - sx, ey - sy);
        const duration = Math.max(140, (dist / speed) * 1000);
        const t0 = nowMs();

        function step(){
          const t = (nowMs() - t0) / duration;
          const u = t >= 1 ? 1 : (1 - Math.pow(1 - t, 3));

          player.ax = sx + (ex - sx) * u;
          player.ay = sy + (ey - sy) * u;

          followPlayer(player);

          if(t >= 1){
            player.ax = ex; player.ay = ey;
            player.pos = target.i;
            sx = ex; sy = ey;
            seg++;
            requestAnimationFrame(animateSegment);
            return;
          }
          requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      }

      followPlayer(player);
      animateSegment();
    });
  }

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

  function canCurrentPlayerPlayNow(){
    if(!state.game) return false;
    const p = currentPlayer();
    const hasOneHit = p.oneHit.length > 0;
    const hasBedroomSwap = hasBedroom(p, "swap_any_bedroom");
    return hasOneHit || hasBedroomSwap;
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

    if(card.img) openCardImage(card.img);
    await showInfo(`One Hit Wonder: ${card.title}`, card.text);

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

      followPlayer(owner);

      log(`${owner.name} swaps positions with ${target.name}.`);
      checkWinImmediate(owner);
      checkWinImmediate(target);
      return;
    }

    if(card.kind === "goat_tax"){
      for(const p of g.players){
        if(p.id === owner.id) continue;
        payPlayer(p, owner, 10, "Goat Tax");
        if(state.phase === Phase.GameOver) return;
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

    followPlayer(p);

    const swapCard = p.bedroom.find(c => c.key === "swap_any_bedroom");
    if(swapCard?.img) openCardImage(swapCard.img);

    await showInfo("Bedroom Swap", "SWAP SPOTS WITH ANY PLAYER ON THE BOARD.");
    log(`${p.name} uses Bedroom Swap to swap with ${target.name}.`);
    checkWinImmediate(p);
    checkWinImmediate(target);
  }

  async function landThenResolve(resolveFn){
    state.phase = Phase.BeforeResolve;
    refreshPlayUI();

    if (canCurrentPlayerPlayNow()) {
      await decisionMomentMenu("Before resolving this space.");
      if(state.phase === Phase.GameOver) return;
    }

    state.phase = Phase.Resolving;
    refreshPlayUI();
    await resolveFn();
    if(state.phase === Phase.GameOver) return;

    state.phase = Phase.AfterResolve;
    refreshPlayUI();

    if (canCurrentPlayerPlayNow()) {
      await decisionMomentMenu("After resolving. You can play cards, then End Turn.");
    }
  }

  async function teleportThenResolve(dest){
    const p = currentPlayer();
    state.phase = Phase.Moving;
    refreshPlayUI();

    const path = [dest];
    await animateAlongPath(p, path);

    const usePlus = await maybeUsePlus1();
    if(usePlus){
      p.usedPlus1ThisTurn = true;
      const extraPath = await computePath(p.pos, 1, "cw");
      await animateAlongPath(p, extraPath);
      log(`${p.name} uses +1 Move.`);
    }

    await landThenResolve(async () => {
      await resolveSpace(p.pos);
    });
  }

  async function doForcedMove(steps, dir){
    const p = currentPlayer();
    state.phase = Phase.Moving;
    refreshPlayUI();

    const path = await computePath(p.pos, steps, dir);
    await animateAlongPath(p, path);

    const usePlus = await maybeUsePlus1();
    if(usePlus){
      p.usedPlus1ThisTurn = true;
      const extraPath = await computePath(p.pos, 1, "cw");
      await animateAlongPath(p, extraPath);
      log(`${p.name} uses +1 Move.`);
    }

    await landThenResolve(async () => {
      await resolveSpace(p.pos);
    });
  }

  // ----------------------------
  // Space effects
  // ----------------------------

  async function battleRap(){
    const p = currentPlayer();
    const opponent = await pickOtherPlayer(p, "Battle Rap: choose an opponent.");
    if(!opponent) return;

    const r1 = rollD20();
    const r2 = rollD20();
    await showInfo("Battle Rap", `Both players roll d20.\nWinner gets $20.\n\n${p.name}: ${r1}\n${opponent.name}: ${r2}`);

    if(r1 === r2){
      log("Tie. Nobody wins $20.");
      return;
    }
    const winner = r1 > r2 ? p : opponent;
    bankCollect(winner, 20, "Battle Rap win");
  }

  // UPDATED: s6 / s22 rule
  // 1-9: lose a turn
  // 10-20: draw a Bedroom Shop card
  async function basementAttempt(){
    const p = currentPlayer();
    const r = rollD20();

    await showInfo("Basement Suicide Attempt", "Roll d20.\n1-9: lose a turn\n10-20: draw a Bedroom Shop card.");
    log(`${p.name} rolls d20: ${r}`);

    if(r <= 9){
      p.loseTurn = true;
      log(`${p.name} loses a turn.`);
      return;
    }

    log(`${p.name} draws a Bedroom Shop card (Basement roll 10-20).`);
    await drawBedroomShop();
  }

  async function hookahLounge(){
    const p = currentPlayer();
    await showInfo("Hookah Lounge", "Another player shuffles a Spotify playlist.\nArtist correct: +$20\nSong correct: +$10\nBoth: +$30");

    const choice = await new Promise(resolve => {
      openModal({
        title:"Hookah Lounge",
        body:"What did you guess correctly?",
        actions:[
          {label:"Artist (+$20)", onClick:()=>resolve("artist")},
          {label:"Song (+$10)", onClick:()=>resolve("song")},
          {label:"Both (+$30)", onClick:()=>resolve("both")},
          {label:"None (+$0)", onClick:()=>resolve("none")}
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

    await showInfo("Fake Family", "Choose another player.\nBoth go to s0.\nBoth roll d20.\nWinner gets $20.");

    const s0 = getSpaceXY(0);
    p.pos = 0; p.ax = s0.x; p.ay = s0.y;
    opponent.pos = 0; opponent.ax = s0.x + 30; opponent.ay = s0.y;

    followPlayer(p);

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

    if(card.img) openCardImage(card.img);
    await showInfo(`Closet of Shame: ${card.title}`, card.text);
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

    await showInfo(label, "Choose what you lose:\nLose $10 OR lose 1 Bedroom resource card.");

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
      if(lost.img) openCardImage(lost.img);
      await showInfo("Lost Resource", lost.text ?? lost.title);
    }
  }

  async function blewItAll(){
    const p = currentPlayer();
    const g = state.game;

    await showInfo("You Blew It All", "All money goes back to the bank.\nAll Bedroom resources go to Kalif's stash.");
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

    if(card.img) openCardImage(card.img);
    await showInfo(`Bedroom Shop: ${card.title}`, card.text);

    log(`${p.name} gains BEDROOM SHOP card: ${card.title}`);
  }

  async function blackmail(){
    const p = currentPlayer();
    const target = await pickOtherPlayer(p, "Blackmail: choose a player.");
    if(!target) return;

    await showInfo("Blackmail", `${target.name} must choose:\nPay ${p.name} $10 OR lose a turn.`);

    const choice = await new Promise(resolve => {
      openModal({
        title:"Blackmail",
        body:`${target.name} chooses:\nPay ${p.name} $10, OR lose a turn.`,
        actions:[
          {label:`Pay $10`, onClick:()=>resolve("pay")},
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
    await showInfo("High Tension Towers", "Roll d20.\n1-9: lose a turn\n10-20: move ahead that many spaces.");

    const r = rollD20();
    log(`${p.name} rolls d20 for High Tension Towers: ${r}`);

    if(r <= 9){
      p.loseTurn = true;
      log(`${p.name} loses a turn.`);
      return;
    }

    log(`${p.name} moves ahead ${r} spaces (clockwise).`);
    await doForcedMove(r, "cw");
  }

  async function featOnTrack(){
    const p = currentPlayer();
    const g = state.game;

    await showInfo("Feat. on the Track", "Go to the nearest space (clockwise) that already has another player.\nThen resolve that space.");

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
        log(`${p.name} feats to nearest occupied space: s${pos} (${SPACE_TITLES[pos]}).`);
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
      const again = g.oneHitDeck.draw();
      if(again) p.oneHit.push(again);
      await showInfo("One Hit Wonder", "Drew a card.");
      return;
    }
    p.oneHit.push(card);
    if(card.img) openCardImage(card.img);
    await showInfo(`One Hit Wonder: ${card.title}`, card.text);
    log(`${p.name} draws ONE HIT WONDER: ${card.title}`);
  }

  // Russians is the ONLY place you choose direction.
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
    await showInfo("You Took Too Much", `Roll d20 and move backwards that many spaces.\nRolled: ${r}`);
    log(`${currentPlayer().name} rolls d20 for Roll Backwards: ${r}`);
    await doForcedMove(r, "ccw");
  }

  async function resolveSpace(spaceIndex){
    const g = state.game;
    const p = currentPlayer();

    await showInfo(`Space s${spaceIndex}: ${SPACE_TITLES[spaceIndex]}`, spaceInstructionText(spaceIndex));

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
        log(`${p.name} rolls again (${SPACE_TITLES[spaceIndex]}).`);
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
        await showInfo("Orgy Night", "Each player gets $10 from the bank.");
        for(const pl of g.players) bankCollect(pl, 10, "Orgy Night");
        return;

      case 28: await drawOneHit(); return;

      case 29: await russians(); return;

      case 31: bankPay(p, 10, "Komar's piss jugs"); return;

      case 34: {
        await showInfo("The Inferno", "Roll d20 5 times.\nReceive $1 per pip total.");
        let sum = 0;
        for(let i=0;i<5;i++) sum += rollD20();
        log(`${p.name} rolls Inferno total: ${sum}`);
        bankCollect(p, sum, "Inferno");
        return;
      }

      case 35: await robbedChoice("Robbed by the Gash", true); return;

      case 36: await tookTooMuch(); return;

      default: log(`${p.name} lands on ${SPACE_TITLES[spaceIndex]}. No effect.`); return;
    }
  }

  function spaceInstructionText(spaceIndex){
    switch(spaceIndex){
      case 0: return "Free space.";
      case 1: return "Collect $5 from the bank.";
      case 2: return "Transport to s20.";
      case 3: return "Lose a turn.";
      case 4: return "Win check: if cash in hand >= $200 you win.";
      case 5: return "Choose a player. Both roll d20. Highest wins $20 from the bank.";
      case 6:
      case 22: return "Roll d20.\n1-9: lose a turn\n10-20: draw a Bedroom Shop card.";
      case 7: return "Another player plays a random Spotify song.\nArtist correct: +$20\nSong correct: +$10\nBoth: +$30";
      case 8: return "Lose $5 to the bank.";
      case 9: return "Choose a player. Both go to s0.\nBoth roll d20.\nHighest wins $20 from the bank.";
      case 10: return "Roll d20. Collect that amount from the bank.";
      case 11:
      case 33: return "Draw a Closet of Shame card and follow it immediately.";
      case 12: return "Roll again.";
      case 13: return "Lose $5 to the bank.";
      case 14: return "Roll again.";
      case 15: return "Lose $10 OR lose 1 Bedroom resource card.";
      case 16: return "Transport to s7.";
      case 17: return "All money back to bank.\nAll Bedroom resources to Kalif's stash.";
      case 18: return "Lose a turn.";
      case 19:
      case 27: return "Transport to s34.";
      case 20: return "Draw a Bedroom Shop resource card.";
      case 21: return "Choose a player.\nThey pay you $10 OR lose a turn.";
      case 23: return "Lose $5 to the bank.";
      case 24: return "Roll d20.\n1-9: lose a turn\n10-20: move ahead that many spaces (clockwise).";
      case 25: return "Go to nearest occupied space clockwise, then resolve that space.";
      case 26: return "Each player gets $10 from the bank.";
      case 28: return "Draw a One Hit Wonder card (held, single-use).";
      case 29: return "Roll d20.\nChoose clockwise or counterclockwise.\nThis is the ONLY space with direction choice.";
      case 30: return "Transport to s7.";
      case 31: return "Lose $10 to the bank.";
      case 32: return "Roll again.";
      case 34: return "Roll d20 five times. Collect $1 per total pip.";
      case 35: return "Lose $10 OR lose 1 resource card to Kalif's stash.";
      case 36: return "Roll d20 and move backwards that many spaces.";
      default: return "Follow the rules for this space.";
    }
  }

  // Turn flow
  function startTurn(){
    if(!state.game || state.phase === Phase.GameOver) return;

    state.phase = Phase.StartTurn;
    const p = currentPlayer();
    p.usedPlus1ThisTurn = false;

    // If a player starts their turn already at/below lose threshold, eliminate them immediately.
    tryEliminateIfInDebt(p, "Debt");
    if(state.phase === Phase.GameOver) return;

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
    if(!state.game || state.phase !== Phase.StartTurn) return;

    const g = state.game;
    const p = currentPlayer();

    state.phase = Phase.AfterRoll;

    const movement = rollD20();
    g.lastRoll = movement;

    log(`${p.name} rolls d20 for movement: ${movement}`);
    refreshPlayUI();

    if (canCurrentPlayerPlayNow()) {
      await decisionMomentMenu("Right after roll (before movement).");
      if(state.phase === Phase.GameOver) return;
    }

    await doMoveByRoll(movement);
  }

  async function doMoveByRoll(steps){
    const p = currentPlayer();
    state.phase = Phase.Moving;
    refreshPlayUI();

    // Always clockwise on normal movement.
    const path = await computePath(p.pos, steps, "cw");
    await animateAlongPath(p, path);

    const usePlus = await maybeUsePlus1();
    if(usePlus){
      p.usedPlus1ThisTurn = true;
      const extraPath = await computePath(p.pos, 1, "cw");
      await animateAlongPath(p, extraPath);
      log(`${p.name} uses +1 Move.`);
    }

    await landThenResolve(async () => {
      await resolveSpace(p.pos);
    });
  }

  function endTurnInternal(skipExtraQueue){
    const g = state.game;
    if(!g || state.phase === Phase.GameOver) return;

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

  // New game
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

    followPlayer(state.game.players[0]);

    state.phase = Phase.StartTurn;
    showPlay();
    startTurn();
  }

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
    ctx.font = "800 10px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const label = player.name.length > 10 ? player.name.slice(0,10) : player.name;
    ctx.fillText(label, player.ax, player.ay);
  }

  function draw(){
    resizeCanvasToDisplaySize();

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

  // UI
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

    btnRoll.textContent = "ROLL d20";

    turnInfo.textContent =
      `Player: ${p.name}\n` +
      `Space: s${p.pos} (${SPACE_TITLES[p.pos]})\n` +
      `Cash: $${p.cash}\n` +
      `One Hit Wonders: ${p.oneHit.length}\n` +
      `Bedroom cards: ${p.bedroom.length}\n` +
      `Phase: ${state.phase}`;

    btnRoll.disabled = !(state.phase === Phase.StartTurn) || state.phase === Phase.GameOver;
    btnEndTurn.disabled = !(state.phase === Phase.AfterResolve || state.phase === Phase.StartTurn) || state.phase === Phase.GameOver;
    btnDecision.disabled = (state.phase === Phase.Moving || state.phase === Phase.Resolving || state.phase === Phase.GameOver);

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

  // Player selection UI
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

  // Mapping click handling
  function canvasToWorld(e){
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (canvas.width / rect.width);
    const py = (e.clientY - rect.top) * (canvas.height / rect.height);

    const wx = (px - (canvas.height*0 + (canvas.width*0.5 - cam.x * cam.scale))) / cam.scale;
    const wy = (py - (canvas.height*0 + (canvas.height*0.5 - cam.y * cam.scale))) / cam.scale;
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

  // Buttons
  btnMap.addEventListener("click", () => {
    state.phase = Phase.Mapping;
    state.mapIndex = COORDS.length;
    showMap();
  });

  btnPlay.addEventListener("click", () => newGame());

  btnBackMenu.addEventListener("click", () => {
    state.game = null;
    state.phase = Phase.Menu;
    closeCard();
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

  // Render loop
  let lastT = performance.now();
  function loop(t){
    const dt = (t - lastT) / 1000;
    lastT = t;
    updateCamera(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // Init
  closeModal();
  hideInfo();
  closeCard();
  buildPlayerPick();
  state.phase = Phase.Menu;
  showMenu();
  refreshMenuStatus();
  resizeCanvasToDisplaySize();
  requestAnimationFrame(loop);
})();
