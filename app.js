const STORAGE_KEY = "baseballScorepadData";
const POSITIONS = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH", "SUB"];

let appData = {
  team: {
    name: "Mon équipe",
    players: []
  },
  games: [],
  currentGameId: null
};

let pwaReady = false;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

document.addEventListener("DOMContentLoaded", initApp);

function initApp() {
  loadData();
  setupNavigation();
  setupForms();
  setupLiveActions();
  setupSegmentedGameForm();
  setupOfflineStatus();
  registerServiceWorker();
  fillPositionSelect();
  setDefaultGameDate();
  renderAll();
}

// Navigation interne sans rechargement.
function setupNavigation() {
  $$("[data-screen]").forEach((button) => {
    button.addEventListener("click", () => showScreen(button.dataset.screen));
  });

  $("#continueGameBtn").addEventListener("click", () => {
    const game = getCurrentGame();
    if (!game) {
      showToast("Aucune partie en cours.");
      return;
    }
    showScreen(game.lineup.length >= 9 ? "live" : "lineup");
  });
}

function showScreen(screenName) {
  $$(".screen").forEach((screen) => screen.classList.remove("active"));
  const screen = $(`#screen-${screenName}`);
  if (screen) screen.classList.add("active");

  $$(".nav-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.screen === screenName);
  });

  renderAll();
}

function setupForms() {
  $("#playerForm").addEventListener("submit", addPlayer);
  $("#gameForm").addEventListener("submit", createGame);
  $("#settingsForm").addEventListener("submit", saveSettings);
  $("#startGameBtn").addEventListener("click", startCurrentGame);
  $("#undoBtn").addEventListener("click", undoLastAction);
  $("#endHalfBtn").addEventListener("click", () => endHalfInning(true));
  $("#finishGameBtn").addEventListener("click", finishGame);
  $("#oppPlusBtn").addEventListener("click", () => adjustOpponentScore(1));
  $("#oppMinusBtn").addEventListener("click", () => adjustOpponentScore(-1));
  $("#printBtn").addEventListener("click", () => window.print());
  $("#resetDataBtn").addEventListener("click", resetAllData);
  $("#exportDataBtn").addEventListener("click", exportData);
  $("#importDataInput").addEventListener("change", importData);
}

function setupLiveActions() {
  $$(".action-grid [data-action]").forEach((button) => {
    button.addEventListener("click", () => recordOffensiveAction(button.dataset.action));
  });
}

function setupSegmentedGameForm() {
  $$("[data-home-away]").forEach((button) => {
    button.addEventListener("click", () => {
      $("#gameHomeAway").value = button.dataset.homeAway;
      $$("[data-home-away]").forEach((item) => {
        item.classList.toggle("active", item === button);
      });
    });
  });
}

function setupOfflineStatus() {
  window.addEventListener("online", updateOfflineStatus);
  window.addEventListener("offline", updateOfflineStatus);
  updateOfflineStatus();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    pwaReady = false;
    updateOfflineStatus();
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js")
      .then((registration) => {
        pwaReady = Boolean(registration.active || registration.waiting || registration.installing);
        updateOfflineStatus();

        navigator.serviceWorker.ready.then(() => {
          pwaReady = true;
          updateOfflineStatus();
          showToast("Mode hors ligne prêt.", "success");
        });
      })
      .catch(() => {
        pwaReady = false;
        updateOfflineStatus();
        showToast("PWA non disponible avec ce mode d’ouverture.", "warning");
      });
  });
}

function updateOfflineStatus() {
  const isOnline = navigator.onLine;
  const networkText = isOnline ? "Connexion disponible" : "Hors ligne";
  const settingsNetworkText = isOnline ? "En ligne" : "Hors ligne";
  const pwaText = pwaReady ? "Mode hors ligne prêt" : "PWA en préparation";
  const settingsPwaText = pwaReady ? "Prête" : "En préparation";

  if ($("#networkStatus")) {
    $("#networkStatus").textContent = networkText;
    $("#networkStatus").classList.toggle("status-save", isOnline);
    $("#networkStatus").classList.toggle("status-warning", !isOnline);
  }

  if ($("#pwaStatus")) {
    $("#pwaStatus").textContent = pwaText;
    $("#pwaStatus").classList.toggle("status-save", pwaReady);
    $("#pwaStatus").classList.toggle("status-neutral", !pwaReady);
  }

  if ($("#settingsNetworkStatus")) $("#settingsNetworkStatus").textContent = settingsNetworkText;
  if ($("#settingsPwaStatus")) $("#settingsPwaStatus").textContent = settingsPwaText;
}

// Sauvegarde locale.
function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
}

function loadData() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return;

  try {
    const parsed = JSON.parse(saved);
    appData = {
      team: {
        name: parsed.team?.name || "Mon équipe",
        players: Array.isArray(parsed.team?.players) ? parsed.team.players : []
      },
      games: Array.isArray(parsed.games) ? parsed.games : [],
      currentGameId: parsed.currentGameId || null
    };
  } catch (error) {
    console.warn("Sauvegarde locale illisible.", error);
  }
}

function getCurrentGame() {
  return appData.games.find((game) => game.id === appData.currentGameId) || null;
}

function updateCurrentGame(updatedGame) {
  const index = appData.games.findIndex((game) => game.id === updatedGame.id);
  if (index >= 0) {
    appData.games[index] = updatedGame;
    saveData();
  }
}

function getGameForDisplay() {
  return getCurrentGame() || appData.games[appData.games.length - 1] || null;
}

function snapshotGame(game) {
  const copy = structuredCloneSafe(game);
  copy.history = [];
  game.history.push(copy);
  if (game.history.length > 60) game.history.shift();
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

// Joueurs.
function fillPositionSelect() {
  $("#playerPosition").innerHTML = POSITIONS.map((position) => (
    `<option value="${position}">${position}</option>`
  )).join("");
}

function addPlayer(event) {
  event.preventDefault();
  const player = {
    id: createId("player"),
    number: $("#playerNumber").value.trim(),
    firstName: $("#playerFirstName").value.trim(),
    lastName: $("#playerLastName").value.trim(),
    position: $("#playerPosition").value,
    active: true
  };

  appData.team.players.push(player);
  saveData();
  event.target.reset();
  $("#playerPosition").value = "P";
  renderAll();
  showToast("Joueur ajouté.", "success");
}

function deletePlayer(playerId) {
  if (!confirm("Supprimer ce joueur?")) return;
  appData.team.players = appData.team.players.filter((player) => player.id !== playerId);
  appData.games.forEach((game) => {
    game.lineup = game.lineup.filter((id) => id !== playerId);
  });
  saveData();
  renderAll();
  showToast("Joueur supprimé.", "warning");
}

function renderPlayers() {
  const players = appData.team.players;
  $("#playersCount").textContent = `${players.length} joueur${players.length > 1 ? "s" : ""}`;
  $("#playersList").innerHTML = players.length ? players.map((player) => `
    <div class="player-card">
      <div class="jersey-number">${escapeHtml(player.number || "-")}</div>
      <div>
        <div class="player-main">${escapeHtml(`${player.firstName} ${player.lastName}`)}</div>
        <div class="player-meta">
          <span class="mini-badge">${escapeHtml(player.position)}</span>
          <span>Actif</span>
        </div>
      </div>
      <button class="small-btn danger-btn" onclick="deletePlayer('${player.id}')">Supprimer</button>
    </div>
  `).join("") : `<div class="empty-state">Aucun joueur pour le moment. Ajoutez vos joueurs avant de créer une partie.</div>`;
}

// Partie.
function setDefaultGameDate() {
  $("#gameDate").value = new Date().toISOString().slice(0, 10);
}

function createGame(event) {
  event.preventDefault();
  const innings = Math.max(1, Number($("#gameInnings").value || 7));
  const game = {
    id: createId("game"),
    date: $("#gameDate").value,
    opponent: $("#gameOpponent").value.trim(),
    field: $("#gameField").value.trim(),
    homeAway: $("#gameHomeAway").value,
    innings,
    lineup: [],
    atBats: [],
    scoreTeam: 0,
    scoreOpponent: 0,
    inningScores: createInningScores(innings),
    currentInning: 1,
    half: "haut",
    outs: 0,
    bases: { first: null, second: null, third: null },
    currentBatterIndex: 0,
    history: [],
    status: "préparation"
  };

  appData.games.push(game);
  appData.currentGameId = game.id;
  saveData();
  event.target.reset();
  setDefaultGameDate();
  $("#gameHomeAway").value = "local";
  $$("[data-home-away]").forEach((button) => {
    button.classList.toggle("active", button.dataset.homeAway === "local");
  });
  showScreen("lineup");
  showToast("Partie créée.", "success");
}

function createInningScores(innings) {
  return Array.from({ length: innings }, (_, index) => ({
    inning: index + 1,
    team: 0,
    opponent: 0
  }));
}

// Alignement.
function addToLineup(playerId) {
  const game = getCurrentGame();
  if (!game) return showToast("Créez d’abord une partie.", "warning");
  if (game.lineup.includes(playerId)) return showToast("Ce joueur est déjà dans l’alignement.", "warning");
  game.lineup.push(playerId);
  updateCurrentGame(game);
  renderAll();
  showToast("Demi-manche changée.", "info");
}

function removeFromLineup(playerId) {
  const game = getCurrentGame();
  if (!game) return;
  game.lineup = game.lineup.filter((id) => id !== playerId);
  updateCurrentGame(game);
  renderAll();
  showToast("Score adverse ajusté.", "info");
}

function startCurrentGame() {
  const game = getCurrentGame();
  if (!game || game.lineup.length < 9) {
    showToast("L’alignement doit contenir au moins 9 joueurs.", "warning");
    return;
  }

  snapshotGame(game);
  game.status = "en cours";
  game.currentBatterIndex = 0;
  game.currentInning = 1;
  game.half = "haut";
  game.outs = 0;
  game.bases = { first: null, second: null, third: null };
  updateCurrentGame(game);
  showScreen("live");
  showToast("Partie démarrée.", "success");
}

function renderLineup() {
  const game = getCurrentGame();
  const lineup = game?.lineup || [];
  const selected = new Set(lineup);
  const available = appData.team.players.filter((player) => player.active && !selected.has(player.id));

  $("#availablePlayers").innerHTML = available.length ? available.map((player) => `
    <div class="list-item">
      <div class="jersey-number">${escapeHtml(player.number || "-")}</div>
      <div>
        <div class="player-main">${escapeHtml(`${player.firstName} ${player.lastName}`)}</div>
        <div class="player-meta"><span class="mini-badge">${escapeHtml(player.position)}</span></div>
      </div>
      <button class="small-btn primary-btn" onclick="addToLineup('${player.id}')">Ajouter</button>
    </div>
  `).join("") : `<div class="empty-state">Aucun joueur disponible. Ajoutez des joueurs ou retirez-en de l’alignement.</div>`;

  $("#lineupList").innerHTML = lineup.length ? lineup.map((playerId, index) => {
    const player = findPlayer(playerId);
    return `
      <div class="lineup-item">
        <div class="lineup-rank">${index + 1}</div>
        <div>
          <div class="player-main">${escapeHtml(player ? formatPlayer(player) : "Joueur supprimé")}</div>
          <div class="player-meta"><span class="mini-badge">${escapeHtml(player?.position || "-")}</span></div>
        </div>
        <button class="small-btn" onclick="removeFromLineup('${playerId}')">Retirer</button>
      </div>
    `;
  }).join("") : `<div class="empty-state">Aucun alignement prêt. Sélectionnez au moins 9 joueurs dans l’ordre des frappeurs.</div>`;

  $("#lineupCount").textContent = `${lineup.length} joueur${lineup.length > 1 ? "s" : ""}`;
  $("#startGameBtn").disabled = lineup.length < 9;
}

// Match en direct et actions offensives.
function recordOffensiveAction(action) {
  const game = getCurrentGame();
  if (!game || game.status === "terminée") return showToast("Aucune partie active.", "warning");
  if (game.lineup.length < 1) return showToast("Aucun alignement.", "warning");

  snapshotGame(game);
  const batterId = game.lineup[game.currentBatterIndex];
  let runsScored = 0;
  let outsAdded = 0;
  let atBat = makeAtBat(game, batterId, action);

  if (action === "single") {
    runsScored = advanceRunners(game, 1);
    placeBatter(game, batterId, "first");
    atBat.ab = 1;
    atBat.hit = 1;
    atBat.single = 1;
  }

  if (action === "double") {
    runsScored = advanceRunners(game, 2);
    placeBatter(game, batterId, "second");
    atBat.ab = 1;
    atBat.hit = 1;
    atBat.double = 1;
  }

  if (action === "triple") {
    runsScored = scoreAllRunners(game);
    placeBatter(game, batterId, "third");
    atBat.ab = 1;
    atBat.hit = 1;
    atBat.triple = 1;
  }

  if (action === "hr") {
    runsScored = scoreAllRunners(game) + scoreRun(game, batterId);
    clearBases(game);
    atBat.ab = 1;
    atBat.hit = 1;
    atBat.hr = 1;
    atBat.run = 1;
  }

  if (action === "bb") {
    runsScored = walkBatter(game, batterId);
    atBat.bb = 1;
  }

  if (action === "out") {
    outsAdded = 1;
    atBat.ab = 1;
    atBat.outsAdded = 1;
    addOuts(game, 1);
  }

  if (action === "error") {
    runsScored = advanceRunners(game, 1);
    placeBatter(game, batterId, "first");
    atBat.ab = 1;
  }

  if (action === "sacrifice") {
    runsScored = advanceRunners(game, 1);
    outsAdded = 1;
    atBat.outsAdded = 1;
    addOuts(game, 1);
  }

  atBat.rbi = runsScored;
  game.atBats.push(atBat);
  nextBatter(game);
  updateCurrentGame(game);
  renderAll();
  showToast(actionFeedback(action, runsScored), action === "error" ? "warning" : "success");

  if (outsAdded && game.outs >= 3 && confirm("Trois retraits. Changer de demi-manche?")) {
    endHalfInning(false);
  }
}

function actionFeedback(action, runsScored) {
  const runText = runsScored > 0 ? ` · ${runsScored} point${runsScored > 1 ? "s" : ""} marqué${runsScored > 1 ? "s" : ""}` : "";
  const labels = {
    single: "Simple enregistré",
    double: "Double enregistré",
    triple: "Triple enregistré",
    hr: "Circuit !",
    bb: "But sur balles enregistré",
    out: "Retrait ajouté",
    error: "Erreur enregistrée",
    sacrifice: "Sacrifice enregistré"
  };
  return `${labels[action] || "Action enregistrée"}${runText}`;
}

function makeAtBat(game, playerId, result) {
  return {
    id: createId("ab"),
    playerId,
    inning: game.currentInning,
    half: game.half,
    result: resultLabel(result),
    ab: 0,
    hit: 0,
    single: 0,
    double: 0,
    triple: 0,
    hr: 0,
    bb: 0,
    rbi: 0,
    run: 0,
    outsAdded: 0,
    timestamp: new Date().toISOString()
  };
}

function advanceRunners(game, basesToAdvance) {
  let runs = 0;
  const order = ["third", "second", "first"];
  order.forEach((base) => {
    const runnerId = game.bases[base];
    if (!runnerId) return;
    game.bases[base] = null;
    const destination = destinationBase(base, basesToAdvance);
    if (destination === "home") {
      runs += scoreRun(game, runnerId);
    } else {
      game.bases[destination] = runnerId;
    }
  });
  return runs;
}

function walkBatter(game, batterId) {
  let runs = 0;
  if (game.bases.first && game.bases.second && game.bases.third) {
    runs += scoreRun(game, game.bases.third);
    game.bases.third = game.bases.second;
    game.bases.second = game.bases.first;
  } else if (game.bases.first && game.bases.second) {
    game.bases.third = game.bases.second;
    game.bases.second = game.bases.first;
  } else if (game.bases.first) {
    game.bases.second = game.bases.first;
  }
  game.bases.first = batterId;
  return runs;
}

function destinationBase(base, advance) {
  const index = { first: 1, second: 2, third: 3 }[base] + advance;
  if (index >= 4) return "home";
  return ["", "first", "second", "third"][index];
}

function scoreAllRunners(game) {
  let runs = 0;
  ["third", "second", "first"].forEach((base) => {
    if (game.bases[base]) {
      runs += scoreRun(game, game.bases[base]);
      game.bases[base] = null;
    }
  });
  return runs;
}

function scoreRun(game, playerId) {
  game.scoreTeam += 1;
  ensureInningScore(game, game.currentInning);
  game.inningScores[game.currentInning - 1].team += 1;
  markRunForPlayer(game, playerId);
  return 1;
}

function markRunForPlayer(game, playerId) {
  for (let index = game.atBats.length - 1; index >= 0; index -= 1) {
    if (game.atBats[index].playerId === playerId) {
      game.atBats[index].run += 1;
      return;
    }
  }
}

function placeBatter(game, batterId, base) {
  game.bases[base] = batterId;
}

function clearBases(game) {
  game.bases = { first: null, second: null, third: null };
}

function addOuts(game, amount) {
  game.outs = Math.min(3, game.outs + amount);
}

function nextBatter(game) {
  game.currentBatterIndex = (game.currentBatterIndex + 1) % game.lineup.length;
}

function endHalfInning(shouldSnapshot) {
  const game = getCurrentGame();
  if (!game) return;
  if (shouldSnapshot) snapshotGame(game);

  game.outs = 0;
  clearBases(game);
  if (game.half === "haut") {
    game.half = "bas";
  } else {
    game.half = "haut";
    game.currentInning += 1;
    ensureInningScore(game, game.currentInning);
  }
  updateCurrentGame(game);
  renderAll();
}

function adjustOpponentScore(delta) {
  const game = getCurrentGame();
  if (!game) return;
  snapshotGame(game);
  game.scoreOpponent = Math.max(0, game.scoreOpponent + delta);
  ensureInningScore(game, game.currentInning);
  const inning = game.inningScores[game.currentInning - 1];
  inning.opponent = Math.max(0, inning.opponent + delta);
  updateCurrentGame(game);
  renderAll();
}

function finishGame() {
  const game = getCurrentGame();
  if (!game) return;
  if (!confirm("Terminer la partie?")) return;
  snapshotGame(game);
  game.status = "terminée";
  updateCurrentGame(game);
  renderAll();
  showToast("Partie terminée.", "success");
}

function undoLastAction() {
  const game = getCurrentGame();
  if (!game || !game.history.length) return showToast("Aucune action à annuler.", "warning");
  const previous = game.history.pop();
  previous.history = game.history;
  updateCurrentGame(previous);
  renderAll();
  showToast("Dernière action annulée.", "warning");
}

function ensureInningScore(game, inning) {
  while (game.inningScores.length < inning) {
    game.inningScores.push({
      inning: game.inningScores.length + 1,
      team: 0,
      opponent: 0
    });
  }
}

function renderLive() {
  const game = getCurrentGame();
  if (!game) {
    $("#liveScoreboard").innerHTML = `<div class="empty-state">Aucune partie créée.</div>`;
    $("#liveInfo").innerHTML = `<div class="empty-state">Créez une partie et un alignement pour afficher le match en direct.</div>`;
    $("#outsDots").innerHTML = renderOutDots(0);
    renderBases(null);
    return;
  }

  const batter = findPlayer(game.lineup[game.currentBatterIndex]);
  const next = findPlayer(game.lineup[(game.currentBatterIndex + 1) % game.lineup.length]);
  $("#liveScoreboard").innerHTML = `
    <div class="scoreboard">
      <div class="score-row">
        <span class="score-team-name">${escapeHtml(appData.team.name)}</span>
        <strong class="score-number">${game.scoreTeam}</strong>
      </div>
      <div class="score-row">
        <span class="score-team-name">${escapeHtml(game.opponent || "Adversaire")}</span>
        <strong class="score-number">${game.scoreOpponent}</strong>
      </div>
    </div>
  `;
  $("#liveInfo").innerHTML = gameCards([
    ["Adversaire", game.opponent || "-"],
    ["Manche", `${game.currentInning}`],
    ["Demi", game.half],
    ["Retraits", `${game.outs} / 3`],
    ["Frappeur", batter ? formatPlayer(batter) : "-"],
    ["Prochain", next ? formatPlayer(next) : "-"],
    ["Statut", game.status]
  ]);
  $("#outsDots").innerHTML = renderOutDots(game.outs);
  renderBases(game);
}

function gameCards(rows) {
  return rows.map(([label, value]) => `
    <div class="game-card">
      <span>${escapeHtml(String(label))}</span>
      <strong>${escapeHtml(String(value))}</strong>
    </div>
  `).join("");
}

function renderOutDots(outs) {
  return [0, 1, 2].map((index) => (
    `<span class="out-dot ${index < outs ? "active" : ""}"></span>`
  )).join("");
}

function renderBases(game) {
  const empty = "Vide";
  $("#baseFirst").textContent = game ? runnerName(game.bases.first) : empty;
  $("#baseSecond").textContent = game ? runnerName(game.bases.second) : empty;
  $("#baseThird").textContent = game ? runnerName(game.bases.third) : empty;
  const batter = game ? findPlayer(game.lineup[game.currentBatterIndex]) : null;
  $("#currentBatterField").textContent = batter ? shortPlayerName(batter) : "-";
  $(".base-first").classList.toggle("occupied", Boolean(game?.bases.first));
  $(".base-second").classList.toggle("occupied", Boolean(game?.bases.second));
  $(".base-third").classList.toggle("occupied", Boolean(game?.bases.third));
}

// Statistiques.
function calculateStats(game) {
  if (!game) return [];
  const playerIds = game.lineup.length ? game.lineup : appData.team.players.map((player) => player.id);
  const statsMap = new Map(playerIds.map((playerId) => [playerId, {
    playerId,
    ab: 0,
    hit: 0,
    single: 0,
    double: 0,
    triple: 0,
    hr: 0,
    bb: 0,
    rbi: 0,
    run: 0,
    avg: ".000"
  }]));

  game.atBats.forEach((atBat) => {
    if (!statsMap.has(atBat.playerId)) {
      statsMap.set(atBat.playerId, {
        playerId: atBat.playerId,
        ab: 0,
        hit: 0,
        single: 0,
        double: 0,
        triple: 0,
        hr: 0,
        bb: 0,
        rbi: 0,
        run: 0,
        avg: ".000"
      });
    }
    const stat = statsMap.get(atBat.playerId);
    stat.ab += atBat.ab || 0;
    stat.hit += atBat.hit || 0;
    stat.single += atBat.single || 0;
    stat.double += atBat.double || 0;
    stat.triple += atBat.triple || 0;
    stat.hr += atBat.hr || 0;
    stat.bb += atBat.bb || 0;
    stat.rbi += atBat.rbi || 0;
    stat.run += atBat.run || 0;
  });

  return Array.from(statsMap.values()).map((stat) => ({
    ...stat,
    avg: formatAverage(stat.hit, stat.ab)
  }));
}

function renderStats() {
  const game = getGameForDisplay();
  const stats = calculateStats(game);
  const totals = getStatsTotals(stats);
  $("#statsSummary").innerHTML = stats.length ? `
    <div class="stat-card"><span>Total AB</span><strong>${totals.ab}</strong></div>
    <div class="stat-card"><span>Coups sûrs</span><strong>${totals.hit}</strong></div>
    <div class="stat-card"><span>BB</span><strong>${totals.bb}</strong></div>
    <div class="stat-card"><span>PP</span><strong>${totals.rbi}</strong></div>
    <div class="stat-card"><span>Moyenne équipe</span><strong>${formatAverage(totals.hit, totals.ab)}</strong></div>
  ` : `<div class="empty-state">Aucune statistique disponible. Marquez une partie pour remplir ce tableau.</div>`;

  const playerRows = stats.map((stat) => {
    const player = findPlayer(stat.playerId);
    return `
      <tr>
        <td>${escapeHtml(player ? formatPlayer(player) : "Joueur supprimé")}</td>
        <td>${stat.ab}</td>
        <td>${stat.hit}</td>
        <td>${stat.single}</td>
        <td>${stat.double}</td>
        <td>${stat.triple}</td>
        <td>${stat.hr}</td>
        <td>${stat.bb}</td>
        <td>${stat.rbi}</td>
        <td>${stat.run}</td>
        <td class="avg-cell">${stat.avg}</td>
      </tr>
    `;
  }).join("");

  const totalRow = stats.length ? `
    <tr class="total-row">
      <td>Total équipe</td>
      <td>${totals.ab}</td>
      <td>${totals.hit}</td>
      <td>${totals.single}</td>
      <td>${totals.double}</td>
      <td>${totals.triple}</td>
      <td>${totals.hr}</td>
      <td>${totals.bb}</td>
      <td>${totals.rbi}</td>
      <td>${totals.run}</td>
      <td class="avg-cell">${formatAverage(totals.hit, totals.ab)}</td>
    </tr>
  ` : "";

  $("#statsBody").innerHTML = stats.length ? `${playerRows}${totalRow}` : `<tr><td colspan="11">Aucune statistique disponible.</td></tr>`;
}

function getStatsTotals(stats) {
  return stats.reduce((totals, stat) => {
    totals.ab += stat.ab;
    totals.hit += stat.hit;
    totals.single += stat.single;
    totals.double += stat.double;
    totals.triple += stat.triple;
    totals.hr += stat.hr;
    totals.bb += stat.bb;
    totals.rbi += stat.rbi;
    totals.run += stat.run;
    return totals;
  }, { ab: 0, hit: 0, single: 0, double: 0, triple: 0, hr: 0, bb: 0, rbi: 0, run: 0 });
}

function formatAverage(hit, ab) {
  if (!ab) return ".000";
  const average = hit / ab;
  if (average >= 1) return "1.000";
  return average.toFixed(3).replace(/^0/, "");
}

// Rapport imprimable.
function renderReport() {
  const game = getGameForDisplay();
  if (!game) {
    $("#reportContent").innerHTML = `<div class="report-section"><p>Aucune partie à afficher.</p></div>`;
    return;
  }

  const statsRows = calculateStats(game).map((stat) => {
    const player = findPlayer(stat.playerId);
    return `
      <tr>
        <td>${escapeHtml(player ? formatPlayer(player) : "Joueur supprimé")}</td>
        <td>${stat.ab}</td><td>${stat.hit}</td><td>${stat.single}</td><td>${stat.double}</td>
        <td>${stat.triple}</td><td>${stat.hr}</td><td>${stat.bb}</td><td>${stat.rbi}</td>
        <td>${stat.run}</td><td>${stat.avg}</td>
      </tr>
    `;
  }).join("");

  $("#reportContent").innerHTML = `
    <section class="report-section">
      <h3>${escapeHtml(appData.team.name)} vs ${escapeHtml(game.opponent || "-")}</h3>
      <div class="summary-list">
        ${summaryRows([
          ["Date", game.date || "-"],
          ["Terrain", game.field || "-"],
          ["Local/Visiteur", game.homeAway],
          ["Pointage", `${appData.team.name} ${game.scoreTeam} - ${game.scoreOpponent} ${game.opponent}`],
          ["Statut", game.status]
        ])}
      </div>
    </section>
    <section class="report-section table-wrap">
      <h3>Score par manche</h3>
      <table>
        <thead><tr><th>Manche</th>${game.inningScores.map((row) => `<th>${row.inning}</th>`).join("")}<th>Total</th></tr></thead>
        <tbody>
          <tr><td>${escapeHtml(appData.team.name)}</td>${game.inningScores.map((row) => `<td>${row.team}</td>`).join("")}<td>${game.scoreTeam}</td></tr>
          <tr><td>${escapeHtml(game.opponent || "Adversaire")}</td>${game.inningScores.map((row) => `<td>${row.opponent}</td>`).join("")}<td>${game.scoreOpponent}</td></tr>
        </tbody>
      </table>
    </section>
    <section class="report-section">
      <h3>Alignement</h3>
      <ol>${game.lineup.map((id) => `<li>${escapeHtml(runnerName(id))}</li>`).join("")}</ol>
    </section>
    <section class="report-section table-wrap">
      <h3>Présences au bâton</h3>
      <table>
        <thead><tr><th>Manche</th><th>Joueur</th><th>Résultat</th><th>AB</th><th>PP</th><th>P</th></tr></thead>
        <tbody>${game.atBats.length ? game.atBats.map((atBat) => `
          <tr>
            <td>${atBat.inning} ${escapeHtml(atBat.half)}</td>
            <td>${escapeHtml(runnerName(atBat.playerId))}</td>
            <td>${escapeHtml(atBat.result)}</td>
            <td>${atBat.ab}</td>
            <td>${atBat.rbi}</td>
            <td>${atBat.run}</td>
          </tr>
        `).join("") : `<tr><td colspan="6">Aucune présence au bâton.</td></tr>`}</tbody>
      </table>
    </section>
    <section class="report-section table-wrap">
      <h3>Statistiques individuelles</h3>
      <table>
        <thead><tr><th>Joueur</th><th>AB</th><th>H</th><th>1B</th><th>2B</th><th>3B</th><th>HR</th><th>BB</th><th>PP</th><th>P</th><th>MOY</th></tr></thead>
        <tbody>${statsRows || `<tr><td colspan="11">Aucune statistique.</td></tr>`}</tbody>
      </table>
    </section>
  `;
}

// Paramètres.
function saveSettings(event) {
  event.preventDefault();
  appData.team.name = $("#teamNameInput").value.trim() || "Mon équipe";
  saveData();
  renderAll();
  showToast("Paramètres sauvegardés.", "success");
}

function resetAllData() {
  if (!confirm("Réinitialiser toutes les données? Cette action est permanente.")) return;
  appData = {
    team: { name: "Mon équipe", players: [] },
    games: [],
    currentGameId: null
  };
  saveData();
  renderAll();
  showScreen("home");
  showToast("Données réinitialisées.", "warning");
}

function exportData() {
  const payload = JSON.stringify(appData, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `baseball-scorepad-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("Données JSON exportées.", "success");
}

function importData(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!imported.team || !Array.isArray(imported.games)) {
        throw new Error("Format invalide");
      }
      if (!confirm("Importer ces données et remplacer la sauvegarde actuelle?")) return;
      appData = {
        team: {
          name: imported.team.name || "Mon équipe",
          players: Array.isArray(imported.team.players) ? imported.team.players : []
        },
        games: imported.games,
        currentGameId: imported.currentGameId || null
      };
      saveData();
      renderAll();
      showToast("Données importées.", "success");
    } catch (error) {
      showToast("Le fichier JSON n’est pas valide.", "error");
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsText(file);
}

function renderSettings() {
  $("#teamNameInput").value = appData.team.name;
  const bytes = new Blob([localStorage.getItem(STORAGE_KEY) || ""]).size;
  $("#storageState").textContent = `Sauvegarde active dans ce navigateur. Taille approximative : ${bytes} octets.`;
}

// Rendus globaux et utilitaires.
function renderAll() {
  renderHeader();
  renderHome();
  renderPlayers();
  renderLineup();
  renderLive();
  renderStats();
  renderReport();
  renderSettings();
}

function renderHeader() {
  const game = getCurrentGame();
  $("#headerTeam").textContent = appData.team.name || "Mon équipe";
  $("#headerGameStatus").textContent = game
    ? `${game.opponent || "Adversaire"} · ${game.status}`
    : "Aucune partie";
}

function renderHome() {
  const game = getCurrentGame();
  $("#homeSummary").innerHTML = summaryRows([
    ["Équipe", appData.team.name],
    ["Joueurs", appData.team.players.length],
    ["Parties sauvegardées", appData.games.length],
    ["Partie actuelle", game ? `${game.opponent} (${game.status})` : "Aucune"]
  ]);
}

function summaryRows(rows) {
  return rows.map(([label, value]) => `
    <div class="summary-row">
      <span>${escapeHtml(String(label))}</span>
      <strong>${escapeHtml(String(value))}</strong>
    </div>
  `).join("");
}

function findPlayer(playerId) {
  return appData.team.players.find((player) => player.id === playerId) || null;
}

function formatPlayer(player) {
  const number = player.number ? `#${player.number} ` : "";
  return `${number}${player.firstName} ${player.lastName}`;
}

function shortPlayerName(player) {
  const initial = player.firstName ? `${player.firstName.charAt(0)}. ` : "";
  return `${initial}${player.lastName || player.firstName || ""}`.trim();
}

function runnerName(playerId) {
  const player = findPlayer(playerId);
  return player ? shortPlayerName(player) : "Vide";
}

function resultLabel(action) {
  const labels = {
    single: "Simple",
    double: "Double",
    triple: "Triple",
    hr: "Circuit",
    bb: "BB",
    out: "Retrait",
    error: "Erreur",
    sacrifice: "Sacrifice"
  };
  return labels[action] || action;
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message, type = "info") {
  const toast = $("#toast");
  toast.textContent = message;
  toast.className = "";
  toast.classList.add(type);
  toast.classList.add("visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("visible"), 2200);
}
