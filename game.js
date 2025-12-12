// =========================================
// Tiered Incremental — Additive Runes + Start Screen
// - Runes are additive extras: total = 1 + sum(count * (mult - 1))
// - Roll cost 25 Item1
// - Costs only increase when clicking (clicks tracked)
// - Passive gen, no auto-buy, testing panel included
// - Start screen shows controls & starts the game loop
// - FIX: manual buys for ALL tiers now respect rune multipliers (decimal amounts)
// =========================================

// ===== CONFIG - EDIT THESE =====

const ITEM_SETUP = [
  { name: "Item 1", baseCost: 10, scaling: 1.5 },
  { name: "Item 2", baseCost: 10, scaling: 1.45 },
  { name: "Item 3", baseCost: 10, scaling: 1.40 },
  { name: "Item 4", baseCost: 10, scaling: 1.35 },
  { name: "Item 5", baseCost: 10, scaling: 1.30 },
  { name: "Item 6", baseCost: 10, scaling: 1.25 },
  { name: "Item 7", baseCost: 10, scaling: 1.20 },
  { name: "Item 8", baseCost: 10, scaling: 1.15 },
  { name: "Item 9", baseCost: 10, scaling: 1.10 },
  { name: "Item 10", baseCost: 10, scaling: 1.05 }
];

const COIN_SPEED_MULTIPLIER = 0.25;
const TICK_MS = 100;

// RUNE POOL: each boost uses 'mult' (e.g. 2.00 or 1.50)
// The additive rule is implemented as explained above.
const RUNE_POOL = {
  common: {
    chance: 60,
    label: "Common",
    boosts: [ { itemIndex: 0, mult: 1.50 } ] // 1.5x to Item1
  },
  uncommon: {
    chance: 25,
    label: "Uncommon",
    boosts: [ { itemIndex: 0, mult: 1.55 }, { itemIndex: 1, mult: 1.10 } ]
  },
  rare: {
    chance: 10,
    label: "Rare",
    boosts: [ { itemIndex: 0, mult: 1.60 }, { itemIndex: 1, mult: 1.20 } ]
  },
  epic: {
    chance: 4,
    label: "Epic",
    boosts: [ { itemIndex: 0, mult: 1.85 }, { itemIndex: 1, mult: 1.50 }, { itemIndex: 2, mult: 1.25 } ]
  },
  legendary: {
    chance: .9,
    label: "Legendary",
    boosts: [ { itemIndex: 0, mult: 2.00 }, { itemIndex: 1, mult: 1.80 }, { itemIndex: 2, mult: 1.60 }, { itemIndex: 3, mult: 1.30 } ]
  },
  mythic: {
    chance: .1,
    label: "Mythic",
    boosts: [ { itemIndex: 0, mult: 4.50 }, { itemIndex: 1, mult: 2.50 }, { itemIndex: 2, mult: 2.00 }, { itemIndex: 3, mult: 1.50 }, { itemIndex: 4, mult: 1.25 } ]
  }
};

// Roll cost (Item1)
const ROLL_COST_ITEM1 = 25;

// ===== END CONFIG =====

// ---------- State ----------
const items = [];
let coins = 10;
let coinsPerSecond = 0;

// rune inventory
const runeInventory = { common:0, uncommon:0, rare:0, epic:0, legendary:0, mythic:0  };

// precomputed pick array
const _runeEntries = Object.keys(RUNE_POOL).map(k => ({ key: k, chance: RUNE_POOL[k].chance }));
function _chooseRuneKey() {
  const total = _runeEntries.reduce((s,e)=>s+e.chance,0);
  let r = Math.random() * total;
  for (const e of _runeEntries) {
    r -= e.chance;
    if (r <= 0) return e.key;
  }
  return _runeEntries[_runeEntries.length-1].key;
}

// ---------- Init items ----------
function initItems() {
  ITEM_SETUP.forEach((cfg, idx) => {
    items.push({
      id: `item${idx+1}`,
      name: cfg.name,
      count: 0,                // float
      baseCost: Math.max(1, Math.floor(cfg.baseCost || 10)),
      cost: idx === 0 ? Math.max(1, Math.floor(cfg.baseCost || 10)) : undefined,
      costInItems: idx === 0 ? undefined : Math.max(1, Math.floor(cfg.baseCost || 10)),
      scaling: typeof cfg.scaling === "number" ? Math.max(1.01, cfg.scaling) : 1.15,
      clicks: 0               // manual purchase count (affects price only)
    });
  });
}

// ---------- UI refs ----------
const itemsContainer = document.getElementById("items");
const runesPanel = document.getElementById("runesPanel");
const startScreen = document.getElementById("startScreen");
const gameRoot = document.getElementById("gameRoot");

// ---------- Build UI ----------
function buildUI() {
  // Items
  itemsContainer.innerHTML = "";
  items.forEach((it, idx) => {
    const div = document.createElement("div");
    div.className = "item";
    div.id = `${it.id}_wrap`;

    const left = document.createElement("div");
    left.className = "left";

    const buyBtn = document.createElement("button");
    buyBtn.id = `${it.id}Btn`;
    buyBtn.onclick = () => idx === 0 ? buyItem1() : buyHigherTier(idx);
    left.appendChild(buyBtn);

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML = `
      <div><strong>${it.name}</strong> &nbsp; count: <span id="${it.id}Count">0</span></div>
      <div id="${it.id}CostWrap" style="margin-top:4px;color:#9aa">
        ${idx === 0 ? 'Cost (coins): ' : 'Cost (lower tier): '}<span id="${it.id}Cost">-</span>
      </div>
      <div id="${it.id}Boost" style="margin-top:6px;color:#9fd;font-size:12px"></div>
      <div id="${it.id}PerClick" style="margin-top:4px;color:#9aa;font-size:12px"></div>
    `;
    div.appendChild(left);
    div.appendChild(meta);
    itemsContainer.appendChild(div);
  });

  // Runes UI (roll + inventory)
  runesPanel.innerHTML = "";
  const root = document.createElement("div");
  root.className = "runes";
  const row = document.createElement("div");
  row.className = "row";

  const rollBox = document.createElement("div");
  rollBox.className = "rune-box";
  rollBox.innerHTML = `<div class="small">Roll a Rune (cost: ${ROLL_COST_ITEM1} ${items[0]?.name || 'Item 1'})</div>
    <div style="margin-top:6px;"><button id="rollRuneBtn" class="primary">Roll Rune</button></div>
    <div id="lastRoll" class="small" style="margin-top:6px;color:var(--muted)"></div>`;
  row.appendChild(rollBox);

  const invBox = document.createElement("div");
  invBox.className = "rune-box";
  invBox.innerHTML = `<div class="small">Rune Inventory</div>
    <div id="runeInventoryList" style="margin-top:8px"></div>
    <div style="margin-top:8px;"><button id="openInv" class="secondary">Open Inventory</button></div>`;
  row.appendChild(invBox);

  root.appendChild(row);

  const invPanel = document.createElement("div");
  invPanel.id = "runeInventoryPanel";
  invPanel.style.display = "none";
  invPanel.style.marginTop = "10px";
  invPanel.style.padding = "8px";
  invPanel.style.border = "1px solid rgba(255,255,255,0.04)";
  invPanel.style.borderRadius = "8px";
  invPanel.style.background = "rgba(0,0,0,0.02)";
  invPanel.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
    <strong>Rune Inventory</strong><button id="closeInv" class="secondary">Close</button></div>
    <div id="invContents" style="margin-top:8px"></div>`;
  root.appendChild(invPanel);

  runesPanel.appendChild(root);

  // hook buttons
  document.getElementById("rollRuneBtn").onclick = () => doRuneRoll();
  document.getElementById("openInv").onclick = () => {
    document.getElementById("runeInventoryPanel").style.display = "block";
    refreshInventoryPanel();
  };
  document.getElementById("closeInv").onclick = () => {
    document.getElementById("runeInventoryPanel").style.display = "none";
  };
}

// ---------- Rune logic ----------
function doRuneRoll() {
  if (!items[0]) return alert("No Item1 defined.");
  if (items[0].count < ROLL_COST_ITEM1) {
    const el = document.getElementById("lastRoll");
    el.innerText = `Not enough ${items[0].name} to roll (need ${ROLL_COST_ITEM1}).`;
    return;
  }

  // spend Item1 (float)
  items[0].count -= ROLL_COST_ITEM1;

  const key = _chooseRuneKey();
  runeInventory[key] = (runeInventory[key] || 0) + 1;

  const el = document.getElementById("lastRoll");
  el.innerText = `You rolled: ${RUNE_POOL[key].label} rune!`;

  updateCoinsPerSecond();
  refreshDisplay();
  refreshInventoryList();
}

// additive extras rule:
// totalMultiplier = 1 + sum( count * (mult - 1) )
function runeMultiplierForItemIndex(idx) {
  let extra = 0; // sum of (mult - 1) * count
  for (const key of Object.keys(runeInventory)) {
    const cnt = runeInventory[key] || 0;
    if (cnt <= 0) continue;
    const def = RUNE_POOL[key];
    if (!def) continue;
    for (const b of def.boosts) {
      if (b.itemIndex === idx) {
        extra += cnt * (b.mult - 1);
      }
    }
  }
  return 1 + extra; // e.g. 2.5 when extra is 1.5
}

// ---------- Gameplay rules ----------

// Manual buy amount (decimal): base * additive multiplier
function purchaseAmountForIndex(idx) {
  const base = 1;
  const mult = runeMultiplierForItemIndex(idx); // additive formula already applied
  return base * mult; // decimal
}

// coins/sec (Item1): include sqrt scaling and rune additive multiplier
function updateCoinsPerSecond() {
  const i0 = items[0];
  const perItemBase = 1;
  const selfGrowth = Math.floor(Math.sqrt(i0.count));
  const perItem = (perItemBase + selfGrowth) * runeMultiplierForItemIndex(0);
  coinsPerSecond = i0.count * perItem * COIN_SPEED_MULTIPLIER;
}

// passive generation: higher tiers produce prev-tier. receiver multiplier uses additive rule
function passiveGeneratePrevious(dtSeconds) {
  for (let i = 1; i < items.length; i++) {
    const genCount = items[i].count;
    if (genCount <= 0) continue;
    const baseRate = 1;
    const receiverMult = runeMultiplierForItemIndex(i - 1);
    const gainPerSecondEach = baseRate * receiverMult;
    const gain = genCount * gainPerSecondEach * dtSeconds * COIN_SPEED_MULTIPLIER;
    items[i - 1].count += gain;
  }
}

// ---------- Buying (pricing tied to clicks) ----------
function buyItem1() {
  const it = items[0];
  if (coins < it.cost) return;
  coins -= it.cost;

  const amt = purchaseAmountForIndex(0);
  it.count += amt;

  it.clicks = (it.clicks || 0) + 1;
  it.cost = Math.floor(it.baseCost * Math.pow(it.scaling, Math.log2(it.clicks + 1)));
  if (it.cost < 1) it.cost = 1;

  updateCoinsPerSecond();
  refreshDisplay();
}

function buyHigherTier(index) {
  if (index <= 0) return;
  const it = items[index];
  const lower = items[index - 1];
  if (lower.count < it.costInItems) return;

  lower.count -= it.costInItems;

  // FIX: apply rune multiplier to the purchased amount for higher tiers as well
  const amt = purchaseAmountForIndex(index); // decimal, e.g. 1.6
  it.count += amt;

  // clicks & pricing
  it.clicks = (it.clicks || 0) + 1;
  it.costInItems = Math.ceil(it.baseCost * Math.pow(it.scaling, it.clicks));

  // reset lower tiers counts & clicks & prices
  for (let i = 0; i < index; i++) {
    items[i].count = 0;
    items[i].clicks = 0;
    if (i === 0) items[i].cost = items[i].baseCost;
    else items[i].costInItems = items[i].baseCost;
  }

  coins = 10;
  items[index - 1].count += 1; // immediate previous tier grant (unchanged)

  updateCoinsPerSecond();
  refreshDisplay();
}

// ---------- Inventory UI helpers ----------
function refreshInventoryList() {
  const list = document.getElementById("runeInventoryList");
  if (!list) return;
  list.innerHTML = "";
  for (const key of Object.keys(RUNE_POOL)) {
    const def = RUNE_POOL[key];
    const cnt = runeInventory[key] || 0;
    const div = document.createElement("div");
    div.className = "small";
    div.innerHTML = `<span class="${key==='mythic'?'rarity-mythic': key==='legendary'?'rarity-legend': key==='epic'?'rarity-epic': key==='rare'?'rarity-rare': key==='uncommon'?'rarity-uncommon':'rarity-common'}"><strong>${def.label}</strong></span>: <span style="margin-left:6px">${cnt}</span>`;
    list.appendChild(div);
  }
}

function refreshInventoryPanel() {
  const contents = document.getElementById("invContents");
  if (!contents) return;
  contents.innerHTML = "";
  for (const key of Object.keys(RUNE_POOL)) {
    const def = RUNE_POOL[key];
    const cnt = runeInventory[key] || 0;

    const container = document.createElement("div");
    container.style.marginBottom = "10px";

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    header.innerHTML = `<div><strong class="${key==='mythic'?'rarity-mythic': key==='legendary'?'rarity-legend': key==='epic'?'rarity-epic': key==='rare'?'rarity-rare': key==='uncommon'?'rarity-uncommon':'rarity-common'}">${def.label}</strong></div>
                        <div style="text-align:right"><div style="font-size:18px">${cnt}</div></div>`;
    container.appendChild(header);

    // stacked boosts (show additive extras and per-rune multiplier)
    const boostsWrap = document.createElement("div");
    boostsWrap.style.marginTop = "6px";
    boostsWrap.style.paddingLeft = "8px";
    for (const b of def.boosts) {
      const itemName = items[b.itemIndex] ? items[b.itemIndex].name : `Item ${b.itemIndex+1}`;
      const line = document.createElement("div");
      line.className = "small";
      line.innerText = `x${b.mult.toFixed(2)} → ${itemName}`;
      boostsWrap.appendChild(line);
    }
    container.appendChild(boostsWrap);

    contents.appendChild(container);
  }
}

// ---------- Display helpers ----------
function fmtCount(n) {
  if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
  return n.toFixed(2);
}

function refreshDisplay() {
  document.getElementById("coins").innerText = fmtCount(coins);

  items.forEach((it, idx) => {
    document.getElementById(it.id + "Count").innerText = fmtCount(it.count);
    const costSpan = document.getElementById(it.id + "Cost");
    if (idx === 0) costSpan.innerText = it.cost;
    else costSpan.innerText = it.costInItems;

    const totalMult = runeMultiplierForItemIndex(idx);
    const boostEl = document.getElementById(it.id + "Boost");
    const perClickEl = document.getElementById(it.id + "PerClick");
    boostEl.innerText = `Boost: +${((totalMult - 1) * 100).toFixed(2)}%  (x${totalMult.toFixed(3)})`;
    perClickEl.innerText = `Per click: +${purchaseAmountForIndex(idx).toFixed(3)}`;

    const buyBtn = document.getElementById(it.id + "Btn");
    if (idx === 0) buyBtn.innerText = `Buy ${it.name} (Cost: ${it.cost} coins)`;
    else buyBtn.innerText = `Buy ${it.name} (Cost: ${it.costInItems} ${items[idx-1].name})`;
  });

  refreshInventoryList();
}

// ---------- Tick & start control ----------
let lastTick = performance.now();
let gameInterval = null;

function tick() {
  const now = performance.now();
  const dt = Math.max(0, (now - lastTick) / 1000);
  lastTick = now;

  updateCoinsPerSecond();
  coins += coinsPerSecond * dt;

  passiveGeneratePrevious(dt);

  refreshDisplay();
}

function startGameLoop() {
  if (gameInterval) clearInterval(gameInterval);
  lastTick = performance.now();
  gameInterval = setInterval(tick, TICK_MS);
}

// ---------- Start / Init ----------
initItems();
buildUI();

// show start screen; start button will show gameRoot and begin loop
document.getElementById("startBtn").onclick = () => {
  startScreen.style.display = "none";
  gameRoot.style.display = "block";
  updateCoinsPerSecond();
  refreshDisplay();
  startGameLoop();
};

// pre-create testing panel but keep the game loop stopped until start pressed
if (typeof TESTING !== "undefined" && TESTING) createTestingPanel();

// ---------- Testing panel (unchanged) ----------
function createTestingPanel() {
  const wrap = document.getElementById("testingPanelWrapper");
  wrap.innerHTML = "";
  const panel = document.createElement("div");
  panel.style.margin = "10px 0";
  panel.style.padding = "10px";
  panel.style.border = "1px dashed rgba(255,255,255,0.06)";
  panel.style.borderRadius = "8px";
  panel.style.background = "rgba(255,255,255,0.01)";

  const title = document.createElement("div");
  title.style.marginBottom = "6px";
  title.style.color = "#9aa";
  title.innerText = "TESTING PANEL — set item counts for quick testing";
  panel.appendChild(title);

  items.forEach((it, idx) => {
    const row = document.createElement("div");
    row.style.margin = "4px 0";
    const label = document.createElement("label");
    label.style.marginRight = "8px";
    label.innerText = `${it.name} count: `;
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.value = Math.floor(it.count);
    input.style.width = "80px";
    input.id = `test_input_${idx}`;
    row.appendChild(label);
    row.appendChild(input);
    panel.appendChild(row);
  });

  const btnSet = document.createElement("button");
  btnSet.innerText = "Apply test counts";
  btnSet.onclick = () => {
    items.forEach((it, idx) => {
      const val = Math.max(0, parseFloat(document.getElementById(`test_input_${idx}`).value) || 0);
      it.count = val;
      if (idx === 0) {
        if (!it.clicks) it.cost = it.baseCost;
      } else {
        if (!it.clicks) it.costInItems = it.baseCost;
      }
    });
    updateCoinsPerSecond();
    refreshDisplay();
  };
  btnSet.style.marginRight = "8px";
  panel.appendChild(btnSet);

  const btnClear = document.createElement("button");
  btnClear.innerText = "Clear test counts";
  btnClear.onclick = () => {
    items.forEach((it, idx) => {
      it.count = 0;
      it.clicks = 0;
      if (idx === 0) it.cost = it.baseCost;
      else it.costInItems = it.baseCost;
    });
    updateCoinsPerSecond();
    refreshDisplay();
  };
  panel.appendChild(btnClear);

  wrap.appendChild(panel);
}

// ---------- helper to ensure coins/sec and UI initially correct if user bypasses start ----
function updateCoinsPerSecond() {
  const i0 = items[0];
  const perItemBase = 1;
  const selfGrowth = Math.floor(Math.sqrt(i0.count));
  const perItem = (perItemBase + selfGrowth) * runeMultiplierForItemIndex(0);
  coinsPerSecond = i0.count * perItem * COIN_SPEED_MULTIPLIER;
}


