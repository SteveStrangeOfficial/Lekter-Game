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

  // Camera
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

  const btnNewGame = el("btnNewGame"); // not used (menu-only)
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
  function setHint(t){ hint.textContent = t; }

  function log(line, dim=false){
    const div = document.createElement("div");
    div.className = "line" + (dim ? " dim" : "");
    div.textContent = line;
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function openModal({title, body, actions}){
    modalTitle.textContent = title;
    modalBody.textContent = body;
    modalActions.innerHTML = "";
    for (const a of actions){
      const b = document.createElement("button");
      b.textContent = a.label;
      if (a.danger) b.classList.add("danger");
      b.onclick = () => { closeModal(); a.onClick?.(); };
      modalActions.appendChild(b);
    }
    modalBackdrop.classList.remove("hidden");
  }
  function closeModal(){ modalBackdrop.classList.add("hidden"); }

  function showMenu(){
    menuPanel.classList.remove("hidden");
    playPanel.classList.add("hidden");
    mapPanel.classList.add("hidden");
    setHint("Main Menu. Map the board first, then Play.");
    refreshMenuStatus();
    draw();
  }
  function showMap(){
    menuPanel.classList.add("hidden");
    playPanel.classList.add("hidden");
    mapPanel.classList.remove("hidden");
    setHint("Mapping: click s0 → s36 in order.");
    refreshMapUI();
    draw();
  }
  function showPlay(){
    menuPanel.classList.add("hidden");
    mapPanel.classList.add("hidden");
    playPanel.classList.remove("hidden");
    setHint("Play. Decision Menu is where cards and optional +1 happen.");
    refreshPlayUI();
    draw();
  }

  // ----------------------------
  // Board image (repo asset)
  // ----------------------------
  const boardImg = new Image();
  let boardLoaded = false;
  boardImg.onload = () => { boardLoaded = true; draw(); };
  boardImg.onerror = () => { boardLoaded = false; setHint("Could not load assets/board.png"); draw(); };
  boardImg.src = BOARD_IMAGE_PATH;

  // ----------------------------
  // Coordinates mapping
  // ----------------------------
  /** @type {{x:number,y:number}[]} */
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

    // Fallback: circle layout
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
  // Spaces and rules
  // ----------------------------
  const SPACES = [
    "START / Living Room",
    "You found expired peanut butter & matzoh",
    "Go to Meech's Bedroom Shop",
    "DJ & Beard recite School of Rock",
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
    "Kalif rubbed his balls on your toothbrush",
    "High Tension Towers",
    "Feat. on the Track",
    "Orgy Night",
    "Practice Time",
    "One Hit Wonder",
    "The Russians",
    "Pack a Bowl",
    "You found Komar's piss jugs",
    "Lauren had a seizure",
    "MC Sketchy's Closet of Shame",
    "The Inferno",
    "Robbed by the Gash",
    "You Took Too Much (Roll Backwards)"
  ];

  // Movement graph:
  // Main clockwise: s0->s1->...->s36->s4
  // Normal: s4->s5
  function nextCW(pos){
    if(pos === 36) return 4;
    if(pos === 4) return 5;
    return (pos + 1) % SPACE_COUNT;
  }

  function prevCCW(pos){
    // Used only for Russians and Roll Backwards
    if(pos === 4) return 36;      // backward from s4 goes to s36
    if(pos === 5) return 4;
    if(pos === 0) return 3;       // from s0 backward goes to s3 (the “up path” side)
    return pos - 1;
  }

  // Fork rule:
  // Fork prompt only when crossing into s4 from s3 while moving clockwise.
  // Win check any time you LAND on s4 (even backward or looping).
  function isForkCrossCW(from, to){
    return from === 3 && to === 4;
  }

  // ----------------------------
  // Decks (full text)
  // ----------------------------
  const BEDROOM_SHOP = [
    {
      key:"pass_s4_plus10",
      title:"MEECH APPRECIATES YOUR 'BUSINESS.'",
      text:"EVERY TIME YOU PASS THE \"FIRST OF THE MONTH\" COLLECT $10.\nMEECH APPRECIATES YOUR 'BUSINESS.'"
    },
    {
      key:"land_s20_plus5",
      title:"MEECH LEFT THE SAFE OPEN...",
      text:"MEECH LEFT THE SAFE OPEN...\n\nAS LONG AS YOU HAVE THIS CARD\nEVERY TIME YOU LAND ON\nMEECH'S BEDROOM SHOP,\nTAKE $5 FROM HIS SAFE"
    },
    {
      key:"swap_any_bedroom",
      title:"HEY BUDDY.....",
      text:"HEY BUDDY.....\n\nSWAP SPOTS WITH ANY PLAYER ON THE BOARD.\nMEECH MAKES THINGS HAPPEN\nWHEN YOU NEED IT MOST."
    },
    {
      key:"virginia_slims",
      title:"VIRGINIA SLIMS",
      text:"MEECH BLESSES YOU\nWITH 24 PACKS OF\nVIRGINIA SLIMS.\n\n(THIS CARD DOES NOTHING EXCEPT GIVE YOU IN-GAME LUNG CANCER.)"
    },
    {
      key:"double_bank",
      title:"2X MONEY",
      text:"ANY MONEY YOU RECIEVE IS\n2X\nAS LONG AS YOU HAVE\nTHIS CARD"
    },
    {
      key:"may_plus1",
      title:"+1 MOVE",
      text:"AS LONG AS\nYOU HAVE THIS CARD,\nYOU MAY MOVE\nONE EXTRA SPACE\nPER TURN"
    },
  ];

  const CLOSET = [
    {
      title:"YOU HAD YOUR FIRST LESBIAN EXPERIENCE WITH KARA",
      text:"YOU HAD YOUR FIRST LESBIAN EXPERIENCE WITH KARA\n\nROLL 1-9\nYOU HATED IT AND -$5\n(AND ANY RESPECT YOU HAD FOR YOURSELF)\n\nROLL 10-20\nYOU LIKED IT AND +$10\n(BUT YOU LOSE ANY RESPECT YOU HAD FOR YOURSELF)",
      kind:"roll_bank",
      rules:[{min:1,max:9,pay:5},{min:10,max:20,collect:10}]
    },
    {
      title:"MARIA GOT DRUNK AND PASSED OUT NAKED IN YOUR BED",
      text:"MARIA GOT DRUNK AND PASSED OUT NAKED IN YOUR BED\n\nROLL 1-9\nSHE LETS YOU SLIP IT IN AND YOU NUT YOURSELF SWEETLY TO SLEEP\n+$10\n\nROLL 11-20\nYOUR GIRLFRIEND COMES HOME AND CRACKS A BOTTLE OVER YOUR HEAD\n-$10\n\nROLL 10\nYOU GET HER PREGNANT AND WON'T BE HAVING ANY OF THAT DRAMA\n-$100 FOR THE ABORTION",
      kind:"roll_bank_multi",
      rules:[{min:1,max:9,collect:10},{min:10,max:10,pay:100},{min:11,max:20,pay:10}]
    },
    {
      title:"PICK A PLAYER TO CLEAN THE CROCKPOT FULL OF 3 MONTH OLD SOUP AND MAGGOTS",
      text:"PICK A PLAYER TO CLEAN THE CROCKPOT FULL OF 3 MONTH OLD SOUP AND MAGGOTS\n\nROLL 1-9\nPLAYER -$5\n\nROLL 10-20\nPLAYER -$10",
      kind:"target_roll_pay_to_drawer",
      rules:[{min:1,max:9,pay:5},{min:10,max:20,pay:10}]
    },
    {
      title:"PARTH THREW UP ON THE FLOOR AND LEFT FOR INDIA.",
      text:"PARTH THREW UP ON THE FLOOR AND LEFT FOR INDIA.\n\nROLL 1-9\nYOU HAVE TO CLEAN IT UP\n-$10\n\nROLL 10-20\nLAY A NEWSPAPER ON IT AND LET HIM TAKE CARE OF IT IN 3 WEEKS\n+$20",
      kind:"roll_bank",
      rules:[{min:1,max:9,pay:10},{min:10,max:20,collect:20}]
    },
    {
      title:"BEARD BROUGHT HIS MOTHERS BROOM TO THE HOUSE",
      text:"BEARD BROUGHT HIS MOTHERS BROOM TO THE HOUSE\n\nROLL 1-9\nYOU UNLEASH THE UNHOLY SPIRIT OF LA LLORONA INTO THE HOUSE\n-$10\n\nROLL 10-20\nYOU SWEEP UP ALL THE ASH FROM THE HOOKAH COALS. PRAY A BLESSING, RETURN THE BROOM AND EVERYTHING IS FINE\n+$20",
      kind:"roll_bank",
      rules:[{min:1,max:9,pay:10},{min:10,max:20,collect:20}]
    },
    {
      title:"YOU SLIP ON KALIF'S PISS IN THE KITCHEN",
      text:"YOU SLIP ON KALIF'S PISS IN THE KITCHEN\n\nROLL 1-9\nBREAK YOUR ANKLE AND THE PISS SPLASHES IN YOUR MOUTH\n-$20\n\nROLL 10-20\nHE PASSES OUT AND YOU PISS ON HIS PANTS TO MAKE HIM THINK HE PISSED HIMSELF WHILE HE WAS BLACKED OUT BUT REALLY HE'S JUST BEEN MARINATING IN YOUR PISS FOR 6 HRS\n+$20",
      kind:"roll_bank",
      rules:[{min:1,max:9,pay:20},{min:10,max:20,collect:20}]
    },
    {
      title:"STEVE'S MOM DROPS OFF A BAG OF FOOD",
      text:"STEVE'S MOM DROPS OFF A BAG OF FOOD\n\nROLL 1-9\nIT'S CANNED BEETS & EXPIRED MATZAH\n-$10\n\nROLL 10-20\nIT'S A NEW BAG OF OREOS AND 3 BOXES OF THE GOOD MAC AND CHEESE\n+$10",
      kind:"roll_bank",
      rules:[{min:1,max:9,pay:10},{min:10,max:20,collect:10}]
    }
  ];

  const ONE_HIT_WONDERS = [
    {
      key:"mic_drop",
      title:"MIC DROP",
      text:"MIC DROP\n\nSHUT DOWN ANOTHER PLAYER'S TURN ON THE SPOT!\nMAKE THEM LOSE A TURN",
      kind:"mic_drop"
    },
    {
      key:"goat_tax",
      title:"GOAT TAX",
      text:"GOAT TAX\n\nDEMAND $10 FROM EVERY PLAYER",
      kind:"goat_tax"
    },
    {
      key:"encore",
      title:"ENCORE!",
      text:"ENCORE!\n\nTAKE ANOTHER TURN IMMEDIATELY",
      kind:"encore"
    },
    {
      key:"swap_666",
      title:"666 SWAP",
      text:"666 SWAP\n\nSWAP SPACES WITH ANY PLAYER",
      kind:"swap"
    },
    {
      key:"i_want_it_all",
      title:"I WANT IT ALL",
      text:"I WANT IT ALL\n\nCOLLECT $30 FROM THE BANK RIGHT NOW.",
      kind:"bank_collect",
      amount:30
    }
  ];

  // ----------------------------
  // Game state
  // ----------------------------
  const Phase = {
    Menu: "Menu",
    Mapping: "Mapping",
    StartTurn: "StartTurn",
    BeforeRoll: "BeforeRoll",
    AfterRoll: "AfterRoll",            // decision moment after roll, before movement
    Moving: "Moving",
    LandedZooming: "LandedZooming",    // 6-second zoom
    BeforeResolve: "BeforeResolve",    // decision moment before resolving
    Resolving: "Resolving",
    AfterResolve: "AfterResolve",      // decision moment after resolving
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

  function newGame(){
    const chosen = [...state.selected];
    if(chosen.length < 2){
      openModal({ title:"Need players", body:"Pick at least 2 players.", actions:[{label:"OK"}]});
      return;
    }
    if(!haveCoords()){
      openModal({ title:"Board not mapped", body:"You need to map the board before playing.\n\nClick: Map the board", actions:[{label:"OK"}]});
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
        bedroom: [],     // persistent cards
        oneHit: [],      // held single-use
        usedPlus1ThisTurn: false,
        // animated chip position
        ax: p0.x, ay: p0.y,
        tx: p0.x, ty: p0.y,
      };
    });

    const g = {
      players,
      turn: 0,
      phase: Phase.StartTurn,
      lastRoll: null,
      pendingResolve: null,   // {spaceIndex, afterMoveCallback?}
      moving: false,
      kalifStash: [],

      bedroomDeck: makeDeck(BEDROOM_SHOP),
      closetDeck: makeDeck(CLOSET),
      oneHitDeck: makeDeck(ONE_HIT_WONDERS),

      // used for fork choice while computing movement
      forkChoice: null, // "up"|"straight" for the current movement computation
    };

    g.bedroomDeck.shuffle();
    g.closetDeck.shuffle();
    g.oneHitDeck.shuffle();

    state.game = g;
    state.phase = Phase.StartTurn;

    logEl.innerHTML = "";
    log("New game started.");
    showPlay();
    startTurn();
  }

  function currentPlayer(){ return state.game.players[state.game.turn]; }

  // ----------------------------
  // Money rules (2X only for bank collections, not player transfers)
  // ----------------------------
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

  // ----------------------------
  // Win check
  // ----------------------------
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

  // ----------------------------
  // Dice
  // ----------------------------
  function rollD20(){ return 1 + Math.floor(Math.random() * 20); }

  // ----------------------------
  // Movement computation (step-by-step logic, single slide animation)
  // ----------------------------
  async function chooseForkIfNeeded(){
    // only asked during movement computation when crossing s3->s4 clockwise
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
    // Only on clockwise crossing s3->s4
    if(from === 3 && to === 4 && hasBedroom(p, "pass_s4_plus10")){
      bankCollect(p, 10, "Pass First of the Month");
    }
  }

  async function computeDestination(startPos, steps, dir){
    // returns final position after counting steps, with fork logic only when moving CW and crossing s3->s4
    let pos = startPos;
    const p = currentPlayer();

    for(let i=0;i<steps;i++){
      let next = (dir === "cw") ? nextCW(pos) : prevCCW(pos);

      if(dir === "cw" && isForkCrossCW(pos, next)){
        // entering s4 from s3 in CW direction counts as a step
        applyPassS4BonusIfCrossing(p, pos, next);
        pos = 4;

        // decide which way to leave s4 for subsequent step(s)
        const choice = await chooseForkIfNeeded();
        // We do NOT automatically move further here; the loop continues with remaining steps.
        // But we need to set pos so that the next step goes correctly.
        // If "up", nextCW(s4) is s5 normally, but "up" means s4->s3 on the next step.
        // We'll handle by setting a temporary rule: on the very next CW step after choosing "up", go to s3 instead of s5.
        // We'll implement by rewriting the next calculation for the NEXT iteration only.
        // To keep this loop clean, we use a flag:
        p._forkMode = choice; // "up" or "straight"
        continue;
      }

      // If player just chose forkMode=up and is at s4 and moving CW, override next to go to s3
      if(dir === "cw" && pos === 4 && p._forkMode === "up"){
        next = 3;
        // After taking the up exit once, revert to normal CW behavior
        p._forkMode = null;
      } else if(dir === "cw" && pos === 4 && p._forkMode === "straight"){
        // straight means normal s4->s5
        p._forkMode = null;
      }

      // Passing bonus also applies when you cross s3->s4 in the normal flow (without special handling),
      // but in our logic above we already handled s3->s4 by setting pos=4 and continue.
      pos = next;
    }

    p._forkMode = null;
    return pos;
  }

  // ----------------------------
  // Sliding animation + zoom + delayed resolve (6 sec)
  // ----------------------------
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
        const u = t >= 1 ? 1 : (1 - Math.pow(1 - t, 3)); // easeOutCubic
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

  function delay(ms){
    return new Promise(res => setTimeout(res, ms));
  }

  async function landWithZoomThenResolve(spaceIndex, resolveFn){
    // Zoom for 6 seconds, then resolve
    zoomToSpace(spaceIndex, ZOOM_MS);
    state.phase = Phase.LandedZooming;
    refreshPlayUI();

    await delay(ZOOM_MS);

    // back to normal automatically via camera timer
    state.phase = Phase.BeforeResolve;
    refreshPlayUI();

    // Decision moment before resolve (One Hit Wonders + optional +1 handled via Decision Menu)
    await decisionMomentMenu("Before resolving this space.");

    // If game ended due to card played during decision moment, stop
    if(state.phase === Phase.GameOver) return;

    state.phase = Phase.Resolving;
    refreshPlayUI();
    await resolveFn();
    if(state.phase === Phase.GameOver) return;

    state.phase = Phase.AfterResolve;
    refreshPlayUI();

    await decisionMomentMenu("After resolving. You can play cards, then End Turn.");
  }

  // ----------------------------
  // Optional +1 movement (Bedroom card) - applies to everything including teleports
  // ----------------------------
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

  // ----------------------------
  // Decision Menu (cards + bedroom active swap + one-hit play)
  // Any player can play One Hit Wonders at decision moments,
  // but Mic Drop is restricted to: start of target turn OR right after they roll.
  // ----------------------------
  function getMicDropWindow(){
    // allowed phases for mic drop: StartTurn or AfterRoll (right after roll before movement)
    return state.phase === Phase.StartTurn || state.phase === Phase.AfterRoll;
  }

  async function decisionMomentMenu(context){
    // Only show if game is active and not game over
    if(!state.game || state.phase === Phase.GameOver) return;

    // enable Decision Menu button for current player, but we also allow others via modal list
    return new Promise(resolve => {
      openModal({
        title:"Decision Moment",
        body:`${context}\n\nChoose an option.`,
        actions:[
          { label:"Continue", onClick: () => resolve() },
          {
            label:"Play One Hit Wonder",
            onClick: async () => { await openOneHitSelector(); resolve(); }
          },
          {
            label:"Use Bedroom Swap (if you have it)",
            onClick: async () => { await tryBedroomSwap(); resolve(); }
          },
        ]
      });
    });
  }

  async function openOneHitSelector(){
    const g = state.game;

    // Pick which player's hand is playing a card
    const playerOptions = g.players.filter(p => p.oneHit.length > 0);
    if(playerOptions.length === 0){
      openModal({ title:"No cards", body:"No one has any One Hit Wonder cards.", actions:[{label:"OK"}]});
      return;
    }

    const who = await new Promise(resolve => {
      openModal({
        title:"Choose player hand",
        body:"Who is playing a One Hit Wonder?",
        actions: playerOptions.map(p => ({
          label: `${p.name} (${p.oneHit.length})`,
          onClick: () => resolve(p)
        })).concat([{label:"Cancel", danger:true, onClick:()=>resolve(null)}])
      });
    });
    if(!who) return;

    // Show their cards
    const chosenCard = await new Promise(resolve => {
      const actions = who.oneHit.map((c, idx) => ({
        label: c.title,
        onClick: () => resolve({card:c, index:idx})
      }));
      actions.push({ label:"Cancel", danger:true, onClick: () => resolve(null) });
      openModal({
        title:`${who.name} - One Hit Wonders`,
        body:"Pick a card to play.\n\n" + who.oneHit.map(c => `• ${c.title}`).join("\n"),
        actions
      });
    });
    if(!chosenCard) return;

    const { card, index } = chosenCard;

    // Enforce Mic Drop timing rule
    if(card.kind === "mic_drop" && !getMicDropWindow()){
      openModal({
        title:"Mic Drop timing",
        body:"Mic Drop can only be played at the START of a player’s turn or RIGHT AFTER they roll (before movement).",
        actions:[{label:"OK"}]
      });
      return;
    }

    // Play the card
    await resolveOneHit(who, card, index);
  }

  async function resolveOneHit(owner, card, handIndex){
    const g = state.game;

    // Remove from hand (single-use)
    owner.oneHit.splice(handIndex, 1);

    // Return to deck and shuffle immediately (no discard pile)
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

      // snap animated coords to new spaces
      const pA = getSpaceXY(owner.pos);
      owner.ax = pA.x; owner.ay = pA.y;
      const pB = getSpaceXY(target.pos);
      target.ax = pB.x; target.ay = pB.y;

      log(`${owner.name} swaps positions with ${target.name}.`);
      // If someone landed on s4 due to swap and has $200, win check immediately
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
      // Choose target
      const target = await pickOtherPlayer(owner, "Choose a player to Mic Drop.");
      if(!target) return;

      // If it's their start turn OR right after roll: they lose THAT turn immediately (turn ends)
      target.loseTurn = true;

      // If target is current player and it is their turn right now, end it immediately
      const cur = currentPlayer();
      if(cur.id === target.id){
        log(`${target.name} gets MIC DROPPED and loses this turn immediately.`);
        endTurnInternal(true);
      } else {
        log(`${target.name} gets MIC DROPPED and will lose their next turn.`);
      }
      return;
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

    const pA = getSpaceXY(p.pos); p.ax = pA.x; p.ay = pA.y;
    const pB = getSpaceXY(target.pos); target.ax = pB.x; target.ay = pB.y;

    log(`${p.name} uses Bedroom Swap to swap with ${target.name}.`);
    checkWinImmediate(p);
    checkWinImmediate(target);
  }

  async function pickOtherPlayer(owner, prompt){
    const g = state.game;
    const options = g.players.filter(p => p.id !== owner.id);
    return new Promise(resolve => {
      openModal({
        title:"Choose player",
        body:prompt,
        actions: options.map(p => ({
          label: p.name,
          onClick: () => resolve(p)
        })).concat([{label:"Cancel", danger:true, onClick:()=>resolve(null)}])
      });
    });
  }

  // ----------------------------
  // Turn flow
  // ----------------------------
  function startTurn(){
    if(!state.game) return;
    if(state.phase === Phase.GameOver) return;

    state.phase = Phase.StartTurn;
    const p = currentPlayer();
    p.usedPlus1ThisTurn = false;
    state.game.lastRoll = null;

    log(`Turn: ${p.name}`);
    refreshPlayUI();

    // Decision moment at start of turn
    // (Mic Drop allowed here)
    // Player can open Decision Menu anytime via button too
  }

  async function doRoll(){
    const g = state.game;
    const p = currentPlayer();
    if(state.phase !== Phase.BeforeRoll && state.phase !== Phase.StartTurn) return;

    state.phase = Phase.AfterRoll;
    g.lastRoll = rollD20();
    log(`${p.name} rolls d20: ${g.lastRoll}`);
    refreshPlayUI();

    // Decision moment right after roll (Mic Drop allowed here)
    await decisionMomentMenu("Right after roll (before movement).");

    if(state.phase === Phase.GameOver) return;

    // Begin movement
    await doMoveByRoll(g.lastRoll);
  }

  async function doMoveByRoll(steps){
    const p = currentPlayer();
    state.phase = Phase.Moving;
    refreshPlayUI();

    const startPos = p.pos;
    const dest = await computeDestination(startPos, steps, "cw");
    await animateMoveTo(p, dest);

    // Optional +1 after movement (including normal moves)
    const usePlus = await maybeUsePlus1();
    if(usePlus){
      p.usedPlus1ThisTurn = true;
      const extraDest = await computeDestination(p.pos, 1, "cw");
      await animateMoveTo(p, extraDest);
      log(`${p.name} uses +1 Move.`);
    }

    // Now zoom + resolve after 6 seconds
    await landWithZoomThenResolve(p.pos, async () => {
      await resolveSpace(p.pos);
    });

    refreshPlayUI();
  }

  function endTurnInternal(skipExtraQueue = false){
    const g = state.game;
    if(!g) return;

    const p = currentPlayer();

    // extra turn mechanic: if queued and not being forcibly skipped
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
    if(state.phase !== Phase.AfterResolve && state.phase !== Phase.BeforeRoll && state.phase !== Phase.StartTurn) {
      // allow end only when stable
      openModal({ title:"Not yet", body:"You can end your turn after resolving (or at a stable decision moment).", actions:[{label:"OK"}]});
      return;
    }
    endTurnInternal(false);
  }

  // ----------------------------
  // Space resolution (runs AFTER zoom)
  // ----------------------------
  async function resolveSpace(spaceIndex){
    const g = state.game;
    const p = currentPlayer();

    // Win check happens any time you land on s4
    if(spaceIndex === 4){
      log(`${p.name} landed on First of the Month.`);
      checkWinImmediate(p);
      return;
    }

    switch(spaceIndex){
      case 0: // free
        log(`${p.name} is in the Living Room. Free space.`);
        return;

      case 1: // +$5
        bankCollect(p, 5, "Expired peanut butter & matzoh");
        return;

      case 2: // transport to s20
        log(`${p.name} is transported to Meech's Bedroom Shop (s20).`);
        await teleportThenResolve(20);
        return;

      case 3: // lose a turn
        p.loseTurn = true;
        log(`${p.name} loses a turn (School of Rock).`);
        return;

      case 5: // battle rap
        await battleRap();
        return;

      case 6: // basement attempt: roll d20; 1-9 lose turn; 10-20 steal resource card from bedroom shop
      case 22:
        await basementAttempt();
        return;

      case 7: // hookah lounge minigame: manual correctness, but we implement as prompt
        await hookahLounge();
        return;

      case 8:
        bankPay(p, 5, "You bought Shisha");
        return;

      case 9: // fake family: choose player, both to s0, roll, winner +$20
        await fakeFamily();
        return;

      case 10: // sell blood: roll d20, win rolled in $
        {
          const r = rollD20();
          log(`${p.name} rolls d20 for Sell Your Blood: ${r}`);
          bankCollect(p, r, "Sell Your Blood");
        }
        return;

      case 11:
      case 33:
        await drawCloset();
        return;

      case 12: // roll again
      case 14: // roll again
      case 32: // roll again
        log(`${p.name} rolls again (${SPACES[spaceIndex]}).`);
        // after resolve, allow immediate new roll by setting phase stable and calling doRoll
        state.phase = Phase.BeforeRoll;
        refreshPlayUI();
        await doRoll();
        return;

      case 13:
        bankPay(p, 5, "Ate Sour Pizza");
        return;

      case 15: // robbed by Kalif: lose $10 OR 1 resource card
        await robbedChoice("Robbed by Kalif", false);
        return;

      case 16: // pack a bowl: transport to s7
      case 30:
        log(`${p.name} is transported to The Hookah Lounge (s7).`);
        await teleportThenResolve(7);
        return;

      case 17: // blew it all: money to bank, resources to stash
        await blewItAll();
        return;

      case 18:
        p.loseTurn = true;
        log(`${p.name} loses a turn.`);
        return;

      case 19:
      case 27:
        log(`${p.name} is transported to The Inferno (s34).`);
        await teleportThenResolve(34);
        return;

      case 20: // bedroom shop: draw resource
        await drawBedroomShop();
        return;

      case 21: // blackmail: choose player pay you $10 or lose turn
        await blackmail();
        return;

      case 23:
        bankPay(p, 5, "Toothbrush");
        return;

      case 24: // towers: roll d20, 1-9 lose turn, 10-20 move ahead that many spaces
        await highTensionTowers();
        return;

      case 25: // feat: transport to nearest space with a player on it, then follow action of that spot
        await featOnTrack();
        return;

      case 26: // orgy night: each player gets $10 (bank)
        for(const pl of g.players){
          bankCollect(pl, 10, "Orgy Night");
        }
        return;

      case 28: // one hit wonder: draw card, hold
        await drawOneHit();
        return;

      case 29: // russians: roll d20 and move that many spaces either direction
        await russians();
        return;

      case 31:
        bankPay(p, 10, "Komar's piss jugs");
        return;

      case 34: // inferno: roll d20 5 times receive $1 per number
        {
          let sum = 0;
          for(let i=0;i<5;i++){
            const r = rollD20();
            sum += r;
          }
          log(`${p.name} rolls Inferno (5x d20) total: ${sum}`);
          bankCollect(p, sum, "Inferno");
        }
        return;

      case 35: // robbed by the gash: lose $10 OR 1 resource to stash
        await robbedChoice("Robbed by the Gash", true);
        return;

      case 36: // roll d20 and move backwards that many spaces
        await tookTooMuch();
        return;

      default:
        log(`${p.name} lands on ${SPACES[spaceIndex]}. No effect.`);
        return;
    }
  }

  // Teleport that still qualifies for +1 optional (including teleports) and zoom+resolve only once at final
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

    await landWithZoomThenResolve(p.pos, async () => {
      await resolveSpace(p.pos);
    });
  }

  // ----------------------------
  // Complex space effects
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
    // steal a resource card from any player who has one, else nothing
    const victims = state.game.players.filter(pl => pl.id !== p.id && pl.bedroom.length > 0);
    if(victims.length === 0){
      log("No one has a Bedroom Shop resource to steal.");
      return;
    }
    const victim = await new Promise(resolve => {
      openModal({
        title:"Steal a resource",
        body:"Choose who to steal 1 Bedroom Shop resource card from.",
        actions: victims.map(v => ({label:v.name,onClick:()=>resolve(v)})).concat([{label:"Cancel",danger:true,onClick:()=>resolve(null)}])
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
    // Move both chips to s0 instantly (no zoom/resolve on s0; this is within an effect)
    const s0 = getSpaceXY(0);

    p.pos = 0; p.ax = s0.x; p.ay = s0.y;
    opponent.pos = 0; opponent.ax = s0.x + 30; opponent.ay = s0.y + 0;

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
      if(rule && rule.pay){
        // target pays the drawer (player-to-player)
        payPlayer(target, p, rule.pay, "Closet of Shame");
      }
      return;
    }

    if(card.kind === "roll_bank" || card.kind === "roll_bank_multi"){
      const r = rollD20();
      log(`Roll d20: ${r}`);
      const rule = card.rules.find(x => r >= x.min && r <= x.max);
      if(rule?.pay) bankPay(p, rule.pay, "Closet of Shame");
      if(rule?.collect) bankCollect(p, rule.collect, "Closet of Shame");
      return;
    }
  }

  async function robbedChoice(label, toStash){
    const p = currentPlayer();
    const canLoseResource = p.bedroom.length > 0;
    const choice = await new Promise(resolve => {
      const actions = [];
      actions.push({ label:"Lose $10", onClick:()=>resolve("money") });
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
      return;
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
    // Bedroom deck: no discard rules specified. We’ll cycle it by putting back + shuffle to keep variety.
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
        body:`${target.name} must choose: pay ${p.name} $10, or lose a turn.`,
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
    // move ahead r spaces
    log(`${p.name} moves ahead ${r} spaces.`);
    await doForcedMove(r, "cw");
  }

  async function featOnTrack(){
    const p = currentPlayer();
    const g = state.game;

    // find nearest space forward (clockwise) that has a player on it (excluding self)
    const occupied = new Set(g.players.filter(pl => pl.id !== p.id).map(pl => pl.pos));
    if(occupied.size === 0){
      log("No other players on the board? (Somehow). Nothing happens.");
      return;
    }

    let steps = 0;
    let pos = p.pos;
    while(steps < 200){
      const nxt = nextCW(pos);
      steps++;
      pos = nxt;
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
    // One hit deck: draw and keep; deck shrinks until cards are played back in
    // If deck empties, we’ll re-seed it by recreating (safe fallback)
    if(!card){
      g.oneHitDeck = makeDeck(ONE_HIT_WONDERS);
      g.oneHitDeck.shuffle();
      const card2 = g.oneHitDeck.draw();
      p.oneHit.push(card2);
      log(`${p.name} draws ONE HIT WONDER: ${card2.title}`);
      return;
    }

    p.oneHit.push(card);
    log(`${p.name} draws ONE HIT WONDER: ${card.title}`);
  }

  async function russians(){
    const p = currentPlayer();
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
    const p = currentPlayer();
    const r = rollD20();
    log(`${p.name} rolls d20 for Roll Backwards: ${r}`);
    await doForcedMove(r, "ccw");
  }

  async function doForcedMove(steps, dir){
    // forced movement that still allows optional +1 (including teleports rule)
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

    await landWithZoomThenResolve(p.pos, async () => {
      await resolveSpace(p.pos);
    });
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

    // text color for contrast
    const darkBg = (player.color === "#111111" || player.color === "#8a2be2" || player.color === "#ff2d2d");
    ctx.fillStyle = darkBg ? "#ffffff" : "#111111";

    ctx.font = "800 10px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const label = player.name.length > 10 ? player.name.slice(0,10) : player.name;
    ctx.fillText(label, player.ax, player.ay);
  }

  function draw(){
    // clear
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,canvas.width,canvas.height);

    // camera transform
    ctx.setTransform(
      cam.scale, 0,
      0, cam.scale,
      canvas.width * 0.5 - cam.x * cam.scale,
      canvas.height * 0.5 - cam.y * cam.scale
    );

    // board
    if(boardLoaded){
      ctx.drawImage(boardImg, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = "#070a10";
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle = "#9fb0c8";
      ctx.font = "16px system-ui";
      ctx.fillText("Missing assets/board.png", 20, 40);
    }

    // mapping markers
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
      // next crosshair
      const nxt = state.mapIndex;
      if(nxt < SPACE_COUNT){
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.lineWidth = 2;
        const pt = getSpaceXY(nxt);
        ctx.beginPath();
        ctx.moveTo(pt.x-12, pt.y);
        ctx.lineTo(pt.x+12, pt.y);
        ctx.moveTo(pt.x, pt.y-12);
        ctx.lineTo(pt.x, pt.y+12);
        ctx.stroke();
      }
    }

    // chips
    if(state.game){
      for(const p of state.game.players){
        drawChip(p);
      }
    }
  }

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
  requestAnimationFrame(loop);

  // ----------------------------
  // UI refresh
  // ----------------------------
  function refreshMenuStatus(){
    const mapped = haveCoords();
    menuStatus.textContent = mapped
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

    // enable controls
    const canRoll = (state.phase === Phase.StartTurn || state.phase === Phase.BeforeRoll);
    btnRoll.disabled = !canRoll || state.phase === Phase.GameOver;
    btnEndTurn.disabled = !(state.phase === Phase.AfterResolve || state.phase === Phase.StartTurn || state.phase === Phase.BeforeRoll) || state.phase === Phase.GameOver;

    btnDecision.disabled = (state.phase === Phase.Moving || state.phase === Phase.LandedZooming || state.phase === Phase.Resolving || state.phase === Phase.GameOver);

    // player cards
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
  // Player selection UI (menu)
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

        // enforce 2–6
        if(state.selected.size < 2){
          // allow, but Play will block
        }
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

    // invert camera transform
    const wx = (px - (canvas.width*0.5 - cam.x * cam.scale)) / cam.scale;
    const wy = (py - (canvas.height*0.5 - cam.y * cam.scale)) / cam.scale;
    return {x: wx, y: wy};
  }

  canvas.addEventListener("click", (e) => {
    if(state.phase !== Phase.Mapping) return;

    const {x,y} = canvasToWorld(e);
    const idx = state.mapIndex;

    // Force sequential
    if(idx >= SPACE_COUNT) return;

    COORDS[idx] = {x: Math.round(x), y: Math.round(y)};
    state.mapIndex += 1;

    if(state.mapIndex >= SPACE_COUNT){
      saveCoords();
      state.phase = Phase.Menu;
      openModal({
        title:"Mapping complete",
        body:"Board mapping saved. Returning to main menu.",
        actions:[{label:"OK", onClick: () => showMenu()}]
      });
      return;
    }

    saveCoords();
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
    state.mapIndex = COORDS.length; // resume if partial mapping exists
    showMap();
  });

  btnPlay.addEventListener("click", () => {
    if(!haveCoords()){
      openModal({ title:"Board not mapped", body:"Click “Map the board” first.", actions:[{label:"OK"}]});
      return;
    }
    // Start a new game every time you hit Play!
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
    if(state.phase !== Phase.StartTurn && state.phase !== Phase.BeforeRoll) return;
    state.phase = Phase.BeforeRoll;
    refreshPlayUI();
    await doRoll();
    if(state.phase !== Phase.GameOver) {
      // after resolving, player can end turn
      refreshPlayUI();
    }
  });

  btnEndTurn.addEventListener("click", () => endTurn());

  btnDecision.addEventListener("click", async () => {
    if(!state.game) return;
    if(state.phase === Phase.Moving || state.phase === Phase.LandedZooming || state.phase === Phase.Resolving) return;
    await decisionMomentMenu("Manual decision menu.");
    refreshPlayUI();
  });

  // ----------------------------
  // Init
  // ----------------------------
  buildPlayerPick();
  showMenu();
})();
