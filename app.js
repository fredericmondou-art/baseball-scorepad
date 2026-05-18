const STORAGE_KEY = "baseballScorepadData";
const SUPABASE_URL = "https://sfjtbcpsepyjpjsgdmsb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmanRiY3BzZXB5anBqc2dkbXNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDE3NzIsImV4cCI6MjA5NDY3Nzc3Mn0.Yjdry3UljJsdFDeDa2onyBoePR023OCLjw05f2Klw14";
const POSITIONS = ["", "P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH", "SUB"];
const DEFAULT_INNINGS = 7;
const DEFENSIVE_POSITIONS = [
  { number: 1, abbr: "P", label: "lanceur", className: "pos-p" },
  { number: 2, abbr: "C", label: "receveur", className: "pos-c" },
  { number: 3, abbr: "1B", label: "1er but", className: "pos-1b" },
  { number: 4, abbr: "2B", label: "2e but", className: "pos-2b" },
  { number: 5, abbr: "3B", label: "3e but", className: "pos-3b" },
  { number: 6, abbr: "SS", label: "arrêt-court", className: "pos-ss" },
  { number: 7, abbr: "LF", label: "champ gauche", className: "pos-lf" },
  { number: 8, abbr: "CF", label: "champ centre", className: "pos-cf" },
  { number: 9, abbr: "RF", label: "champ droit", className: "pos-rf" }
];
const DEFENSIVE_OUT_TYPES = {
  fly: "Fly",
  groundout: "Au sol",
  unassisted: "Non assisté",
  doubleplay: "Double jeu"
};
const FIELD_POINTS = {
  home: { x: 50, y: 82 },
  "1B": { x: 72, y: 62 },
  "2B": { x: 50, y: 42 },
  "3B": { x: 28, y: 62 },
  "1": { x: 50, y: 66 },
  "2": { x: 50, y: 88 },
  "3": { x: 76, y: 60 },
  "4": { x: 58, y: 50 },
  "5": { x: 24, y: 60 },
  "6": { x: 42, y: 50 },
  "7": { x: 25, y: 25 },
  "8": { x: 50, y: 18 },
  "9": { x: 75, y: 25 },
  "outfield-left": { x: 28, y: 18 },
  "outfield-center": { x: 50, y: 12 },
  "outfield-right": { x: 72, y: 18 },
  "outfield-deep": { x: 50, y: 5 }
};

let appData = {
  team: {
    name: "Mon équipe",
    players: []
  },
  games: [],
  calendar: [],
  currentGameId: null
};

let pwaReady = false;
let defensiveOutState = {
  type: "fly",
  positions: []
};
let addBatterState = {
  side: "team",
  replace: false
};
let pendingAction = null;
let supabaseClient = null;
let spectatorMode = false;
let spectatorGameState = null;
let spectatorPlayByPlay = [];
let spectatorSubscriptions = [];

// Pour un usage public à grande échelle, sécuriser les écritures avec authentification, code marqueur ou Edge Function.
if (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY) {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

document.addEventListener("DOMContentLoaded", initApp);

function initApp() {
  const watchId = new URLSearchParams(window.location.search).get("watch");
  if (watchId) {
    spectatorMode = true;
    renderSpectatorMode(watchId);
    return;
  }

  loadData();
  setupNavigation();
  setupForms();
  setupLiveActions();
  setupDefensiveOutModal();
  setupAddBatterModal();
  setupSegmentedGameForm();
  renderRunLimitSettings();
  renderCalendarRunLimitSettings();
  renderLineupModeSettings();
  setupOfflineStatus();
  registerServiceWorker();
  fillPositionSelect();
  fillQuickBatterPositionSelect();
  setDefaultGameDate();
  renderAll();
}

function setupNavigation() {
  $$("[data-screen]").forEach((button) => {
    button.addEventListener("click", () => showScreen(button.dataset.screen));
  });

  $("#continueGameBtn").addEventListener("click", () => {
    openMatchForCurrentGame();
  });
  $("#homeLineupBtn").addEventListener("click", openLineupForCurrentGame);
}

function showScreen(screenName) {
  if (screenName === "lineup" && !canOpenLineup()) return;
  $$(".screen").forEach((screen) => screen.classList.remove("active"));
  const screen = $(`#screen-${screenName}`);
  if (screen) screen.classList.add("active");

  $$(".nav-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.screen === screenName);
  });

  renderAll();
}

function openCalendar(message) {
  if (message) showToast(message, "info");
  showScreen("calendar");
}

function canOpenLineup() {
  if (getCurrentGame()) return true;
  showToast("Créez d'abord une partie à partir du calendrier.", "warning");
  openCalendar();
  return false;
}

function canOpenMatch() {
  return true;
}

function openLineupForCurrentGame() {
  if (!canOpenLineup()) return;
  showScreen("lineup");
}

function openMatchForCurrentGame() {
  const game = getCurrentGame();
  if (!game) {
    showToast("Aucune partie active. Créez une partie à partir du calendrier.", "warning");
    showScreen("live");
    return;
  }
  showScreen("live");
}

function setupForms() {
  $("#playerForm").addEventListener("submit", savePlayerFromForm);
  $("#cancelPlayerEditBtn").addEventListener("click", resetPlayerForm);
  $("#calendarForm").addEventListener("submit", saveCalendarEventFromForm);
  $("#cancelCalendarEditBtn").addEventListener("click", resetCalendarForm);
  $("#gameForm").addEventListener("submit", createGame);
  $("#opponentBatterForm").addEventListener("submit", addOpponentBatter);
  $("#settingsForm").addEventListener("submit", saveSettings);
  $("#startGameBtn").addEventListener("click", startCurrentGame);
  $("#undoBtn").addEventListener("click", undoLastAction);
  $("#endHalfBtn").addEventListener("click", () => endHalfInning(true));
  $("#changeBatterBtn").addEventListener("click", () => replaceCurrentBatter());
  $("#lockTeamLineupBtn").addEventListener("click", lockTeamLineupManually);
  $("#lockOpponentLineupBtn").addEventListener("click", lockOpponentLineupManually);
  $("#finishGameBtn").addEventListener("click", finishGame);
  $("#oppPlusBtn").addEventListener("click", () => adjustOpponentScore(1));
  $("#oppMinusBtn").addEventListener("click", () => adjustOpponentScore(-1));
  $("#printBtn").addEventListener("click", () => window.print());
  $("#resetDataBtn").addEventListener("click", resetAllData);
  $("#exportDataBtn").addEventListener("click", exportData);
  $("#importDataInput").addEventListener("change", importData);
  $("#runLimitEnabled").addEventListener("change", renderRunLimitSettings);
  $("#calendarRunLimitEnabled").addEventListener("change", renderCalendarRunLimitSettings);
  $("#opponentTrackingMode").addEventListener("change", renderLineupModeSettings);
}

function setupLiveActions() {
  $$(".action-grid [data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.action === "out") {
        confirmBatterBeforeAction("defensiveOut");
        return;
      }
      confirmBatterBeforeAction(button.dataset.action);
    });
  });
}

function setupDefensiveOutModal() {
  $$("[data-defensive-type]").forEach((button) => {
    button.addEventListener("click", () => setDefensiveOutType(button.dataset.defensiveType));
  });
  $("#confirmDefensiveOutBtn").addEventListener("click", confirmDefensiveOut);
  $("#resetDefensiveOutBtn").addEventListener("click", resetDefensiveSequence);
  $("#cancelDefensiveOutBtn").addEventListener("click", closeDefensiveOutModal);
  $("#closeDefensiveOutBtn").addEventListener("click", closeDefensiveOutModal);
  renderInteractiveField();
}

function setupAddBatterModal() {
  $("#cancelAddBatterBtn").addEventListener("click", closeAddBatterModal);
  $("#cancelAddBatterTopBtn").addEventListener("click", closeAddBatterModal);
  $("#confirmExpectedBatterBtn").addEventListener("click", executePendingActionForConfirmedBatter);
  $("#changeExpectedBatterBtn").addEventListener("click", () => openBatterConfirmModal(addBatterState.side, pendingAction?.actionType, true));
  $("#useExistingBatterBtn").addEventListener("click", confirmTeamBatterSelection);
  $("#quickAddTeamBatterBtn").addEventListener("click", confirmTeamBatterSelection);
  $("#addOpponentDuringGameBtn").addEventListener("click", confirmOpponentBatterNumber);
  $("#batterSearchInput").addEventListener("input", renderExistingBatterOptions);
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
  window.addEventListener("online", () => {
    updateOfflineStatus();
    const game = getCurrentGame();
    if (game) {
      syncPendingLiveEvents(game);
      syncLiveGameState(game);
    }
  });
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
        showToast("PWA non disponible avec ce mode d'ouverture.", "warning");
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

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
}

function loadData() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      appData = {
        team: {
          name: parsed.team?.name || "Mon équipe",
          players: Array.isArray(parsed.team?.players) ? parsed.team.players : []
        },
        games: Array.isArray(parsed.games) ? parsed.games : [],
        calendar: Array.isArray(parsed.calendar) ? parsed.calendar : [],
        currentGameId: parsed.currentGameId || null
      };
    } catch (error) {
      console.warn("Sauvegarde locale illisible.", error);
    }
  }

  migrateData();
  saveData();
}

function migrateData() {
  if (!Array.isArray(appData.calendar)) appData.calendar = [];
  appData.team.players = appData.team.players.map((player) => ({
    id: player.id || createId("player"),
    number: player.number || "",
    firstName: player.firstName || "",
    lastName: player.lastName || "",
    position: player.position || "",
    active: player.active !== false
  }));

  appData.calendar = appData.calendar.map((event) => ({
    id: event.id || createId("cal"),
    date: event.date || "",
    time: event.time || "",
    opponent: event.opponent || "",
    field: event.field || "",
    homeAway: event.homeAway || "local",
    gameType: event.gameType || "Saison",
    innings: Number(event.innings || DEFAULT_INNINGS),
    opponentTrackingMode: event.opponentTrackingMode || "simple",
    lineupMode: event.lineupMode === "dynamic" ? "dynamic" : "prepared",
    opponentLineupMode: event.opponentLineupMode === "prepared" ? "prepared" : "dynamic",
    runLimitEnabled: event.runLimitEnabled === true,
    runLimitPerInning: event.runLimitPerInning ? Number(event.runLimitPerInning) : null,
    runLimitAppliesToLastInning: event.runLimitAppliesToLastInning !== false,
    notes: event.notes || "",
    status: event.status || "À venir",
    linkedGameId: event.linkedGameId || null
  }));

  appData.games = appData.games.map((game) => normalizeGame(game));
}

function normalizeGame(game) {
  const innings = Number(game.innings || DEFAULT_INNINGS);
  const migratedRunLimit = migrateRunLimitSettings(game);
  const migratedLineupModes = migrateLineupModes(game);
  return {
    id: game.id || createId("game"),
    date: game.date || "",
    opponent: game.opponent || "",
    field: game.field || "",
    time: game.time || "",
    gameType: game.gameType || "",
    notes: game.notes || "",
    homeAway: game.homeAway || "local",
    innings,
    linkedGameId: game.linkedGameId || null,
    lineup: Array.isArray(game.lineup) ? game.lineup : [],
    opponentLineup: migrateOpponentPlayerLabels(game),
    atBats: normalizeAtBats(game.atBats),
    opponentAtBats: normalizeAtBats(game.opponentAtBats),
    playByPlay: Array.isArray(game.playByPlay) ? game.playByPlay : [],
    scoreTeam: Number(game.scoreTeam || 0),
    scoreOpponent: Number(game.scoreOpponent || 0),
    inningScores: Array.isArray(game.inningScores) ? game.inningScores : createInningScores(innings),
    currentInning: Number(game.currentInning || 1),
    half: game.half || "haut",
    outs: Number(game.outs || 0),
    bases: game.bases || { first: null, second: null, third: null },
    currentBatterIndex: Number(game.currentBatterIndex || 0),
    currentOpponentBatterIndex: Number(game.currentOpponentBatterIndex || 0),
    currentBattingSide: game.currentBattingSide || "team",
    opponentTrackingMode: game.opponentTrackingMode || "simple",
    lineupMode: migratedLineupModes.lineupMode,
    opponentLineupMode: migratedLineupModes.opponentLineupMode,
    teamLineupLocked: typeof game.teamLineupLocked === "boolean" ? game.teamLineupLocked : (Array.isArray(game.lineup) && game.lineup.length >= 9),
    opponentLineupLocked: typeof game.opponentLineupLocked === "boolean" ? game.opponentLineupLocked : (Array.isArray(game.opponentLineup) && game.opponentLineup.length >= 9),
    teamLineupLockReason: game.teamLineupLockReason || null,
    opponentLineupLockReason: game.opponentLineupLockReason || null,
    teamLineupBuildCompleteByRepeat: game.teamLineupBuildCompleteByRepeat !== false,
    opponentLineupBuildCompleteByRepeat: game.opponentLineupBuildCompleteByRepeat !== false,
    runLimitEnabled: migratedRunLimit.runLimitEnabled,
    runLimitPerInning: migratedRunLimit.runLimitPerInning,
    runLimitAppliesToLastInning: migratedRunLimit.runLimitAppliesToLastInning,
    liveEnabled: game.liveEnabled === true,
    publicGameId: game.publicGameId || null,
    liveShareUrl: game.liveShareUrl || null,
    liveLastAction: game.liveLastAction || "",
    pendingLiveEvents: Array.isArray(game.pendingLiveEvents) ? game.pendingLiveEvents : [],
    history: Array.isArray(game.history) ? game.history : [],
    status: game.status || "préparation"
  };
}

function migrateLineupModes(game) {
  return {
    lineupMode: game.lineupMode === "dynamic" ? "dynamic" : "prepared",
    opponentLineupMode: game.opponentLineupMode === "prepared" ? "prepared" : "dynamic"
  };
}

function migrateRunLimitSettings(game) {
  return {
    runLimitEnabled: game.runLimitEnabled === true,
    runLimitPerInning: game.runLimitPerInning ? Number(game.runLimitPerInning) : null,
    runLimitAppliesToLastInning: game.runLimitAppliesToLastInning !== false
  };
}

function getOpponentTeamName(game = getCurrentGame()) {
  return String(game?.opponent || game?.opponentName || game?.opponent_name || "Adversaire").trim() || "Adversaire";
}

function formatOpponentPlayerLabel(number, game = getCurrentGame()) {
  const cleanNumber = String(number || "").replace(/^#/, "").trim() || "-";
  return `#${cleanNumber}, ${getOpponentTeamName(game)}`;
}

function getOpponentPlayerNumber(batter) {
  if (!batter) return "";
  if (typeof batter === "string") {
    return batter.match(/#?(\d{1,3})/)?.[1] || batter.replace(/^#/, "").trim();
  }
  return String(batter.number || batter.label?.match(/#?(\d{1,3})/)?.[1] || "").trim();
}

function createOpponentPlayer(number, game = getCurrentGame(), id = null) {
  const cleanNumber = String(number || "").replace(/^#/, "").trim();
  return {
    id: id || createId("opp"),
    number: cleanNumber,
    teamName: getOpponentTeamName(game),
    label: formatOpponentPlayerLabel(cleanNumber, game)
  };
}

function migrateOpponentPlayerLabels(game) {
  const lineup = Array.isArray(game?.opponentLineup) ? game.opponentLineup : [];
  return lineup.map((batter) => {
    const number = getOpponentPlayerNumber(batter);
    const migrated = createOpponentPlayer(number, game, batter.id || createId("opp"));
    return {
      ...batter,
      ...migrated
    };
  });
}

function normalizeAtBats(atBats) {
  return Array.isArray(atBats) ? atBats.map((atBat) => ({
    ...atBat,
    defensePlay: atBat.defensePlay || null
  })) : [];
}

function getCurrentGame() {
  return appData.games.find((game) => game.id === appData.currentGameId) || null;
}

function updateCurrentGame(updatedGame) {
  const index = appData.games.findIndex((game) => game.id === updatedGame.id);
  if (index >= 0) {
    appData.games[index] = normalizeGame(updatedGame);
    saveData();
  }
}

function getGameForDisplay() {
  return getCurrentGame() || appData.games[appData.games.length - 1] || null;
}

function normalizeGameStatus(status) {
  const value = String(status || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ");
  if (["en cours", "started", "in progress", "in_progress"].includes(value)) return "in_progress";
  if (["preparation", "brouillon", "draft", "partie creee"].includes(value)) return "preparation";
  if (["terminee", "termine", "completed", "joue", "jouee"].includes(value)) return "completed";
  if (["annule", "annulee", "cancelled", "canceled"].includes(value)) return "cancelled";
  return value || "preparation";
}

function canOpenLiveMatch(game) {
  return normalizeGameStatus(game?.status) === "in_progress";
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

function fillPositionSelect() {
  $("#playerPosition").innerHTML = POSITIONS.map((position) => {
    const label = position || "Aucune position";
    return `<option value="${position}">${label}</option>`;
  }).join("");
}

function fillQuickBatterPositionSelect() {
  if (!$("#quickBatterPosition")) return;
  $("#quickBatterPosition").innerHTML = POSITIONS.map((position) => {
    const label = position || "Aucune position";
    return `<option value="${position}">${label}</option>`;
  }).join("");
}

function savePlayerFromForm(event) {
  event.preventDefault();
  const editingId = $("#editingPlayerId").value;
  const number = $("#playerNumber").value.trim();
  const firstName = $("#playerFirstName").value.trim();
  const lastName = $("#playerLastName").value.trim();
  const position = $("#playerPosition").value || "";
  const active = $("#playerActive").checked;

  if (!number) return showToast("Le numéro est obligatoire.", "warning");
  if (!firstName && !lastName) return showToast("Ajoutez au moins un prénom ou un nom.", "warning");

  const duplicate = appData.team.players.some((player) => (
    player.active !== false && active && player.number === number && player.id !== editingId
  ));
  if (duplicate) return showToast("Deux joueurs actifs ne peuvent pas avoir le même numéro.", "warning");

  if (editingId) {
    const player = appData.team.players.find((item) => item.id === editingId);
    if (!player) return showToast("Joueur introuvable.", "error");
    Object.assign(player, { number, firstName, lastName, position, active });
    saveData();
    resetPlayerForm();
    renderAll();
    return showToast("Joueur modifié avec succès", "success");
  }

  appData.team.players.push({
    id: createId("player"),
    number,
    firstName,
    lastName,
    position,
    active
  });
  saveData();
  resetPlayerForm();
  renderAll();
  showToast("Joueur ajouté.", "success");
}

function editPlayer(playerId) {
  const player = findPlayer(playerId);
  if (!player) return;
  $("#editingPlayerId").value = player.id;
  $("#playerNumber").value = player.number || "";
  $("#playerFirstName").value = player.firstName || "";
  $("#playerLastName").value = player.lastName || "";
  $("#playerPosition").value = player.position || "";
  $("#playerActive").checked = player.active !== false;
  $("#playerFormTitle").textContent = "Modifier un joueur";
  $("#playerSubmitBtn").textContent = "Sauvegarder les modifications";
  $("#cancelPlayerEditBtn").classList.remove("hidden");
  showScreen("players");
}

function resetPlayerForm() {
  $("#playerForm").reset();
  $("#editingPlayerId").value = "";
  $("#playerPosition").value = "";
  $("#playerActive").checked = true;
  $("#playerFormTitle").textContent = "Ajouter un joueur";
  $("#playerSubmitBtn").textContent = "Ajouter le joueur";
  $("#cancelPlayerEditBtn").classList.add("hidden");
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
    <div class="player-card ${player.active === false ? "muted-card" : ""}">
      <div class="jersey-number">${escapeHtml(player.number || "-")}</div>
      <div>
        <div class="player-main">${escapeHtml(formatPlayer(player))}</div>
        <div class="player-meta">
          <span class="mini-badge">${escapeHtml(formatPosition(player.position))}</span>
          <span>${player.active === false ? "Inactif" : "Actif"}</span>
        </div>
      </div>
      <div class="row-actions">
        <button class="small-btn secondary-btn" onclick="editPlayer('${player.id}')">Modifier</button>
        <button class="small-btn danger-btn" onclick="deletePlayer('${player.id}')">Supprimer</button>
      </div>
    </div>
  `).join("") : `<div class="empty-state">Aucun joueur pour le moment. Ajoutez vos joueurs avant de créer une partie.</div>`;
}

function saveCalendarEventFromForm(event) {
  event.preventDefault();
  const editingId = $("#editingCalendarId").value;
  const payload = {
    date: $("#calendarDate").value,
    time: $("#calendarTime").value,
    opponent: $("#calendarOpponent").value.trim(),
    field: $("#calendarField").value.trim(),
    homeAway: $("#calendarHomeAway").value,
    gameType: $("#calendarGameType").value,
    status: $("#calendarStatus").value,
    innings: Math.max(1, Number($("#calendarInnings").value || DEFAULT_INNINGS)),
    opponentTrackingMode: $("#calendarOpponentTrackingMode").value,
    lineupMode: $("#calendarLineupMode").value,
    opponentLineupMode: $("#calendarOpponentLineupMode").value,
    runLimitEnabled: $("#calendarRunLimitEnabled").checked,
    runLimitPerInning: $("#calendarRunLimitEnabled").checked ? Number($("#calendarRunLimitPerInning").value || 5) : null,
    runLimitAppliesToLastInning: !$("#calendarRunLimitSkipLast").checked,
    notes: $("#calendarNotes").value.trim()
  };

  if (!payload.date || !payload.opponent) {
    return showToast("La date et l'adversaire sont obligatoires.", "warning");
  }
  if (payload.runLimitEnabled && (!payload.runLimitPerInning || payload.runLimitPerInning < 1 || payload.runLimitPerInning > 20)) {
    return showToast("La limite doit être entre 1 et 20 points.", "warning");
  }

  if (editingId) {
    const existing = appData.calendar.find((item) => item.id === editingId);
    if (!existing) return showToast("Événement introuvable.", "error");
    Object.assign(existing, payload);
    saveData();
    resetCalendarForm();
    renderAll();
    return showToast("Match modifié.", "success");
  }

  appData.calendar.push({
    id: createId("cal"),
    ...payload,
    linkedGameId: null
  });
  saveData();
  resetCalendarForm();
  renderAll();
  showToast("Match ajouté au calendrier.", "success");
}

function renderCalendar() {
  const events = getSortedCalendarEvents();
  const upcoming = events.filter((event) => normalizeGameStatus(event.status) !== "completed" && normalizeGameStatus(event.status) !== "cancelled");
  const played = events.filter((event) => normalizeGameStatus(event.status) === "completed");
  const cancelled = events.filter((event) => normalizeGameStatus(event.status) === "cancelled");
  const next = upcoming[0];

  $("#calendarSummary").innerHTML = `
    <div class="stat-card"><span>Matchs à venir</span><strong>${upcoming.length}</strong></div>
    <div class="stat-card"><span>Matchs joués</span><strong>${played.length}</strong></div>
    <div class="stat-card"><span>Matchs annulés</span><strong>${cancelled.length}</strong></div>
    <div class="stat-card wide-stat"><span>Prochain match</span><strong>${next ? `${formatDate(next.date)} ${next.time || ""} vs ${next.opponent}` : "Aucun"}</strong></div>
  `;

  $("#calendarCount").textContent = `${events.length} match${events.length > 1 ? "s" : ""}`;
  $("#calendarList").innerHTML = events.length ? events.map((event) => `
    <div class="calendar-item ${normalizeGameStatus(event.status) === "completed" ? "played" : ""} ${normalizeGameStatus(event.status) === "cancelled" ? "cancelled" : ""}">
      <div>
        <div class="player-main">${escapeHtml(formatDate(event.date))} ${escapeHtml(event.time || "")} · ${escapeHtml(event.opponent)}</div>
        <div class="player-meta">
          <span class="mini-badge">${escapeHtml(event.homeAway)}</span>
          <span class="mini-badge">${escapeHtml(event.gameType)}</span>
          <span class="mini-badge">${escapeHtml(event.status)}</span>
          <span>${escapeHtml(event.field || "Terrain à confirmer")}</span>
        </div>
        ${event.notes ? `<p class="item-notes">${escapeHtml(event.notes)}</p>` : ""}
      </div>
      <div class="row-actions">
        <button class="small-btn secondary-btn" onclick="editCalendarEvent('${event.id}')">Modifier</button>
        <button class="small-btn danger-btn" onclick="deleteCalendarEvent('${event.id}')">Supprimer</button>
        ${calendarEventActions(event)}
      </div>
    </div>
  `).join("") : `<div class="empty-state">Aucun match prévu. Ajoutez le premier événement du calendrier.</div>`;
}

function getSortedCalendarEvents() {
  return [...appData.calendar].sort((a, b) => `${a.date || "9999"} ${a.time || ""}`.localeCompare(`${b.date || "9999"} ${b.time || ""}`));
}

function calendarEventActions(event) {
  const linkedGame = event.linkedGameId ? appData.games.find((game) => game.id === event.linkedGameId) : null;
  if (!linkedGame) {
    return `<button class="small-btn primary-btn" onclick="createGameFromCalendarEvent('${event.id}')">Créer partie</button>`;
  }
  if (normalizeGameStatus(linkedGame.status) === "completed") {
    return `<button class="small-btn primary-btn" onclick="openReportForGame('${linkedGame.id}')">Voir rapport</button>`;
  }
  return `
    <button class="small-btn secondary-btn" onclick="openLinkedGameLineup('${linkedGame.id}')">Préparer alignement</button>
    <button class="small-btn primary-btn" onclick="openLinkedGameMatch('${linkedGame.id}')">Ouvrir match</button>
  `;
}

function editCalendarEvent(eventId) {
  const event = appData.calendar.find((item) => item.id === eventId);
  if (!event) return;
  $("#editingCalendarId").value = event.id;
  $("#calendarDate").value = event.date || "";
  $("#calendarTime").value = event.time || "";
  $("#calendarOpponent").value = event.opponent || "";
  $("#calendarField").value = event.field || "";
  $("#calendarHomeAway").value = event.homeAway || "local";
  $("#calendarGameType").value = event.gameType || "Saison";
  $("#calendarStatus").value = event.status || "À venir";
  $("#calendarInnings").value = event.innings || DEFAULT_INNINGS;
  $("#calendarOpponentTrackingMode").value = event.opponentTrackingMode || "simple";
  $("#calendarLineupMode").value = event.lineupMode || "prepared";
  $("#calendarOpponentLineupMode").value = event.opponentLineupMode || "dynamic";
  $("#calendarRunLimitEnabled").checked = event.runLimitEnabled === true;
  $("#calendarRunLimitPerInning").value = event.runLimitPerInning || 5;
  $("#calendarRunLimitSkipLast").checked = event.runLimitEnabled === true && event.runLimitAppliesToLastInning === false;
  renderCalendarRunLimitSettings();
  $("#calendarNotes").value = event.notes || "";
  $("#calendarFormTitle").textContent = "Modifier un match prévu";
  $("#calendarSubmitBtn").textContent = "Sauvegarder les modifications";
  $("#cancelCalendarEditBtn").classList.remove("hidden");
  showScreen("calendar");
}

function resetCalendarForm() {
  $("#calendarForm").reset();
  $("#editingCalendarId").value = "";
  $("#calendarHomeAway").value = "local";
  $("#calendarGameType").value = "Saison";
  $("#calendarStatus").value = "À venir";
  $("#calendarInnings").value = DEFAULT_INNINGS;
  $("#calendarOpponentTrackingMode").value = "simple";
  $("#calendarLineupMode").value = "prepared";
  $("#calendarOpponentLineupMode").value = "dynamic";
  $("#calendarRunLimitEnabled").checked = false;
  $("#calendarRunLimitPerInning").value = 5;
  $("#calendarRunLimitSkipLast").checked = false;
  renderCalendarRunLimitSettings();
  $("#calendarFormTitle").textContent = "Ajouter un match prévu";
  $("#calendarSubmitBtn").textContent = "Ajouter au calendrier";
  $("#cancelCalendarEditBtn").classList.add("hidden");
}

function deleteCalendarEvent(eventId) {
  if (!confirm("Supprimer ce match du calendrier?")) return;
  appData.calendar = appData.calendar.filter((event) => event.id !== eventId);
  saveData();
  renderAll();
  showToast("Match supprimé du calendrier.", "warning");
}

function createGameFromCalendarEvent(eventId) {
  const event = appData.calendar.find((item) => item.id === eventId);
  if (!event) return;

  if (event.linkedGameId && appData.games.some((game) => game.id === event.linkedGameId)) {
    appData.currentGameId = event.linkedGameId;
    saveData();
    showScreen("lineup");
    return;
  }

  const game = buildGame({
    date: event.date,
    time: event.time,
    opponent: event.opponent,
    field: event.field,
    gameType: event.gameType,
    notes: event.notes,
    homeAway: event.homeAway,
    innings: event.innings || DEFAULT_INNINGS,
    linkedGameId: event.id,
    opponentTrackingMode: event.opponentTrackingMode || "simple",
    lineupMode: event.lineupMode || "prepared",
    opponentLineupMode: event.opponentLineupMode || "dynamic",
    runLimitEnabled: event.runLimitEnabled === true,
    runLimitPerInning: event.runLimitEnabled ? event.runLimitPerInning : null,
    runLimitAppliesToLastInning: event.runLimitAppliesToLastInning !== false,
    status: "brouillon"
  });

  appData.games.push(game);
  appData.currentGameId = game.id;
  event.linkedGameId = game.id;
  event.status = "Partie créée";
  saveData();
  openLineupForCurrentGame();
  showToast("Partie créée depuis le calendrier.", "success");
}

function openLinkedGameLineup(gameId) {
  appData.currentGameId = gameId;
  saveData();
  openLineupForCurrentGame();
}

function openLinkedGameMatch(gameId) {
  appData.currentGameId = gameId;
  saveData();
  openMatchForCurrentGame();
}

function openReportForGame(gameId) {
  appData.currentGameId = gameId;
  saveData();
  showScreen("report");
}

function openReportForCurrentGame() {
  const game = getCurrentGame() || appData.games[appData.games.length - 1] || null;
  if (!game) return showToast("Aucun rapport disponible.", "warning");
  appData.currentGameId = game.id;
  saveData();
  showScreen("report");
}

function setDefaultGameDate() {
  $("#gameDate").value = new Date().toISOString().slice(0, 10);
}

function renderRunLimitSettings() {
  const enabled = $("#runLimitEnabled")?.checked || false;
  if (!$("#runLimitPerInning")) return;
  $("#runLimitPerInning").disabled = !enabled;
  $("#runLimitPerInning").required = enabled;
  $("#runLimitValueWrap").classList.toggle("muted-card", !enabled);
}

function renderCalendarRunLimitSettings() {
  const enabled = $("#calendarRunLimitEnabled")?.checked || false;
  if (!$("#calendarRunLimitPerInning")) return;
  $("#calendarRunLimitPerInning").disabled = !enabled;
  $("#calendarRunLimitPerInning").required = enabled;
  $("#calendarRunLimitValueWrap").classList.toggle("muted-card", !enabled);
}

function renderLineupModeSettings() {
  if (!$("#opponentLineupMode")) return;
  const complete = $("#opponentTrackingMode").value === "complete";
  $("#opponentLineupMode").disabled = !complete;
  if (!complete) $("#opponentLineupMode").value = "dynamic";
}

function validateRunLimitSettings() {
  const enabled = $("#runLimitEnabled").checked;
  const value = Number($("#runLimitPerInning").value || 5);
  if (!enabled) {
    return {
      runLimitEnabled: false,
      runLimitPerInning: null,
      runLimitAppliesToLastInning: true
    };
  }
  if (!Number.isFinite(value) || value < 1 || value > 20) {
    showToast("La limite doit être entre 1 et 20 points.", "warning");
    return null;
  }
  return {
    runLimitEnabled: true,
    runLimitPerInning: value,
    runLimitAppliesToLastInning: !$("#runLimitSkipLast").checked
  };
}

function applyRunLimitToGameForm(game) {
  $("#runLimitEnabled").checked = game.runLimitEnabled === true;
  $("#runLimitPerInning").value = game.runLimitPerInning || 5;
  $("#runLimitSkipLast").checked = game.runLimitEnabled === true && game.runLimitAppliesToLastInning === false;
  renderRunLimitSettings();
}

function createGame(event) {
  event.preventDefault();
  const runLimitSettings = validateRunLimitSettings();
  if (!runLimitSettings) return;
  const game = buildGame({
    date: $("#gameDate").value,
    opponent: $("#gameOpponent").value.trim(),
    field: $("#gameField").value.trim(),
    homeAway: $("#gameHomeAway").value,
    innings: Math.max(1, Number($("#gameInnings").value || DEFAULT_INNINGS)),
    opponentTrackingMode: $("#opponentTrackingMode").value,
    lineupMode: $("#lineupMode").value,
    opponentLineupMode: $("#opponentLineupMode").value,
    ...runLimitSettings,
    status: "préparation",
    linkedGameId: null
  });

  appData.games.push(game);
  appData.currentGameId = game.id;
  saveData();
  event.target.reset();
  setDefaultGameDate();
  $("#gameHomeAway").value = "local";
  $("#opponentTrackingMode").value = "simple";
  $("#lineupMode").value = "prepared";
  $("#opponentLineupMode").value = "dynamic";
  renderLineupModeSettings();
  applyRunLimitToGameForm({ runLimitEnabled: false, runLimitPerInning: null, runLimitAppliesToLastInning: true });
  $$("[data-home-away]").forEach((button) => {
    button.classList.toggle("active", button.dataset.homeAway === "local");
  });
  showScreen("lineup");
  showToast("Partie créée.", "success");
}

function buildGame({ date, time = "", opponent, field, gameType = "", notes = "", homeAway, innings, opponentTrackingMode, lineupMode = "prepared", opponentLineupMode = "dynamic", runLimitEnabled = false, runLimitPerInning = null, runLimitAppliesToLastInning = true, status, linkedGameId }) {
  return normalizeGame({
    id: createId("game"),
    date,
    time,
    opponent,
    field,
    gameType,
    notes,
    homeAway,
    innings,
    linkedGameId,
    lineup: [],
    opponentLineup: [],
    atBats: [],
    opponentAtBats: [],
    playByPlay: [],
    scoreTeam: 0,
    scoreOpponent: 0,
    inningScores: createInningScores(innings),
    currentInning: 1,
    half: "haut",
    outs: 0,
    bases: { first: null, second: null, third: null },
    currentBatterIndex: 0,
    currentOpponentBatterIndex: 0,
    currentBattingSide: "team",
    opponentTrackingMode,
    lineupMode,
    opponentLineupMode,
    teamLineupLocked: lineupMode === "prepared",
    opponentLineupLocked: opponentLineupMode === "prepared",
    teamLineupLockReason: lineupMode === "prepared" ? "prepared" : null,
    opponentLineupLockReason: opponentLineupMode === "prepared" ? "prepared" : null,
    teamLineupBuildCompleteByRepeat: true,
    opponentLineupBuildCompleteByRepeat: true,
    runLimitEnabled,
    runLimitPerInning,
    runLimitAppliesToLastInning,
    liveEnabled: false,
    publicGameId: null,
    liveShareUrl: null,
    liveLastAction: "",
    pendingLiveEvents: [],
    history: [],
    status
  });
}

function createInningScores(innings) {
  return Array.from({ length: innings }, (_, index) => ({
    inning: index + 1,
    team: 0,
    opponent: 0
  }));
}

function addToLineup(playerId) {
  const game = getCurrentGame();
  if (!game) return showToast("Créez d'abord une partie.", "warning");
  if (game.lineup.includes(playerId)) return showToast("Ce joueur est déjà dans l'alignement.", "warning");
  game.lineup.push(playerId);
  updateCurrentGame(game);
  renderAll();
}

function removeFromLineup(playerId) {
  const game = getCurrentGame();
  if (!game) return;
  game.lineup = game.lineup.filter((id) => id !== playerId);
  updateCurrentGame(game);
  renderAll();
}

function addOpponentBatter(event) {
  event.preventDefault();
  const game = getCurrentGame();
  if (!game) return showToast("Créez d'abord une partie.", "warning");
  const number = $("#opponentBatterNumber").value.trim();
  if (!number) return showToast("Le numéro adverse est obligatoire.", "warning");

  game.opponentLineup.push(createOpponentPlayer(number, game));
  $("#opponentBatterNumber").value = "";
  updateCurrentGame(game);
  renderAll();
}

function removeOpponentBatter(batterId) {
  const game = getCurrentGame();
  if (!game) return;
  game.opponentLineup = game.opponentLineup.filter((batter) => batter.id !== batterId);
  game.currentOpponentBatterIndex = Math.min(game.currentOpponentBatterIndex, Math.max(0, game.opponentLineup.length - 1));
  updateCurrentGame(game);
  renderAll();
}

function startCurrentGame() {
  const game = getCurrentGame();
  if (!game) return;
  if (game.lineupMode !== "dynamic" && game.lineup.length < 9) {
    showToast("L'alignement doit contenir au moins 9 joueurs.", "warning");
    return;
  }

  if (game.opponentTrackingMode === "complete" && game.opponentLineupMode !== "dynamic" && game.opponentLineup.length < 9) {
    const ok = confirm("L'alignement adverse contient moins de 9 frappeurs. Démarrer quand même?");
    if (!ok) return;
  }

  snapshotGame(game);
  game.status = "en cours";
  game.currentBatterIndex = 0;
  game.currentOpponentBatterIndex = 0;
  game.currentInning = 1;
  game.half = "haut";
  game.outs = 0;
  game.bases = { first: null, second: null, third: null };
  game.currentBattingSide = getBattingSide(game);
  updateCurrentGame(game);
  syncLiveGameState(game);
  showScreen("live");
  showToast(game.lineupMode === "dynamic" ? "Partie démarrée. L'alignement sera construit pendant la partie." : "Partie démarrée.", "success");
}

function renderLineup() {
  const game = getCurrentGame();
  const lineup = game?.lineup || [];
  const selected = new Set(lineup);
  const available = appData.team.players.filter((player) => player.active !== false && !selected.has(player.id));

  $("#availablePlayers").innerHTML = game?.lineupMode === "dynamic"
    ? `<div class="empty-state">Alignement dynamique activé. Les frappeurs seront ajoutés pendant la partie.</div>`
    : available.length ? available.map((player) => `
    <div class="list-item">
      <div class="jersey-number">${escapeHtml(player.number || "-")}</div>
      <div>
        <div class="player-main">${escapeHtml(formatPlayer(player))}</div>
        <div class="player-meta"><span class="mini-badge">${escapeHtml(formatPosition(player.position))}</span></div>
      </div>
      <button class="small-btn primary-btn" onclick="addToLineup('${player.id}')">Ajouter</button>
    </div>
  `).join("") : `<div class="empty-state">Aucun joueur disponible. Ajoutez des joueurs ou retirez-en de l'alignement.</div>`;

  $("#lineupList").innerHTML = lineup.length ? lineup.map((playerId, index) => {
    const player = findPlayer(playerId);
    return `
      <div class="lineup-item">
        <div class="lineup-rank">${index + 1}</div>
        <div>
          <div class="player-main">${escapeHtml(player ? formatPlayer(player) : "Joueur supprimé")}</div>
          <div class="player-meta"><span class="mini-badge">${escapeHtml(formatPosition(player?.position))}</span></div>
        </div>
        <button class="small-btn" onclick="removeFromLineup('${playerId}')">Retirer</button>
      </div>
    `;
  }).join("") : `<div class="empty-state">Aucun alignement prêt. Sélectionnez au moins 9 joueurs dans l'ordre des frappeurs.</div>`;

  $("#lineupCount").textContent = `${lineup.length} joueur${lineup.length > 1 ? "s" : ""}`;
  $("#startGameBtn").disabled = game?.lineupMode !== "dynamic" && lineup.length < 9;
  renderOpponentLineup();
}

function renderOpponentLineup() {
  const game = getCurrentGame();
  const section = $("#opponentLineupSection");
  if (!game || game.opponentTrackingMode !== "complete") {
    section.classList.add("hidden");
    return;
  }

  section.classList.remove("hidden");
  $("#opponentLineupCount").textContent = `${game.opponentLineup.length} adversaire${game.opponentLineup.length > 1 ? "s" : ""}`;
  $("#opponentLineupList").innerHTML = game.opponentLineup.length ? game.opponentLineup.map((batter, index) => `
    <div class="lineup-item opponent-item">
      <div class="lineup-rank">${index + 1}</div>
      <div>
        <div class="player-main">${escapeHtml(opponentBatterName(batter, game))}</div>
        <div class="player-meta"><span class="mini-badge opponent-badge">Adversaire</span></div>
      </div>
      <button class="small-btn" onclick="removeOpponentBatter('${batter.id}')">Retirer</button>
    </div>
  `).join("") : `<div class="empty-state">Ajoutez les numéros adverses si vous voulez suivre chaque frappeur.</div>`;
}

function getBattingSide(game) {
  if (game.homeAway === "visiteur") {
    return game.half === "haut" ? "team" : "opponent";
  }
  return game.half === "haut" ? "opponent" : "team";
}

function getCurrentBatter(game) {
  const side = getBattingSide(game);
  if (side === "opponent") {
    if (game.opponentLineupMode === "dynamic" && !game.opponentLineupLocked && game.currentOpponentBatterIndex >= game.opponentLineup.length) return null;
    if (game.currentOpponentBatterIndex >= game.opponentLineup.length) game.currentOpponentBatterIndex = 0;
    return game.opponentLineup[game.currentOpponentBatterIndex] || null;
  }
  if (game.lineupMode === "dynamic" && !game.teamLineupLocked && game.currentBatterIndex >= game.lineup.length) return null;
  if (game.currentBatterIndex >= game.lineup.length) game.currentBatterIndex = 0;
  return findPlayer(game.lineup[game.currentBatterIndex]) || null;
}

function getNextBatter(game) {
  const side = getBattingSide(game);
  if (side === "opponent") {
    if (game.opponentLineupMode === "dynamic" && !game.opponentLineupLocked) return null;
    if (!game.opponentLineup.length) return null;
    return game.opponentLineup[(game.currentOpponentBatterIndex + 1) % game.opponentLineup.length];
  }
  if (game.lineupMode === "dynamic" && !game.teamLineupLocked) return null;
  if (!game.lineup.length) return null;
  return findPlayer(game.lineup[(game.currentBatterIndex + 1) % game.lineup.length]) || null;
}

function ensureCurrentBatter(game) {
  const side = getBattingSide(game);
  if (side === "opponent" && game.opponentTrackingMode === "simple") return true;
  const batter = getCurrentBatter(game);
  if (batter) return true;
  openAddBatterModal(side);
  return false;
}

function openAddBatterModal(side = getBattingSide(getCurrentGame()), replace = false) {
  addBatterState = { side, replace };
  $("#addBatterTitle").textContent = side === "opponent" ? "Confirmer le frappeur adverse" : "Confirmer le frappeur de notre équipe";
  $("#addBatterSideLabel").textContent = side === "opponent" ? "Adversaire au bâton" : "Notre équipe au bâton";
  $("#expectedBatterPanel").classList.add("hidden");
  $("#teamBatterPanel").classList.toggle("hidden", side === "opponent");
  $("#opponentBatterPanel").classList.toggle("hidden", side !== "opponent");
  $("#batterSearchInput").value = "";
  renderExistingBatterOptions();
  $("#quickBatterNumber").value = "";
  $("#quickBatterFirstName").value = "";
  $("#quickBatterLastName").value = "";
  $("#quickBatterPosition").value = "";
  $("#dynamicOpponentNumber").value = "";
  $("#addBatterModal").classList.remove("hidden");
}

function closeAddBatterModal() {
  pendingAction = null;
  $("#addBatterModal").classList.add("hidden");
}

function renderExistingBatterOptions() {
  const game = getCurrentGame();
  const currentIds = new Set(game?.lineup || []);
  const players = findTeamPlayerBySearch($("#batterSearchInput")?.value || "");
  $("#existingBatterSelect").innerHTML = players.length ? players.map((player) => (
    `<option value="${player.id}">${escapeHtml(formatPlayer(player))}${currentIds.has(player.id) ? " (déjà dans l'ordre)" : ""}</option>`
  )).join("") : `<option value="">Aucun joueur disponible</option>`;
}

function addTeamBatterDuringGame(event) {
  const game = getCurrentGame();
  if (!game) return;
  const fromQuickAdd = event?.target?.id === "quickAddTeamBatterBtn";
  let playerId = $("#existingBatterSelect").value;

  if (fromQuickAdd) {
    const number = $("#quickBatterNumber").value.trim();
    if (!number) return showToast("Le numéro est obligatoire.", "warning");
    const player = {
      id: createId("player"),
      number,
      firstName: $("#quickBatterFirstName").value.trim(),
      lastName: $("#quickBatterLastName").value.trim(),
      position: $("#quickBatterPosition").value || "",
      active: true
    };
    appData.team.players.push(player);
    playerId = player.id;
  }

  if (!playerId) return showToast("Sélectionnez un joueur.", "warning");
  setCurrentLineupBatter(game, "team", playerId);
  updateCurrentGame(game);
  saveData();
  closeAddBatterModal();
  renderAll();
  showToast("Frappeur ajouté.", "success");
}

function addOpponentBatterDuringGame() {
  const game = getCurrentGame();
  if (!game) return;
  const number = $("#dynamicOpponentNumber").value.trim();
  if (!number) return showToast("Le numéro adverse est obligatoire.", "warning");
  const batter = createOpponentPlayer(number, game);
  setCurrentLineupBatter(game, "opponent", batter);
  updateCurrentGame(game);
  closeAddBatterModal();
  renderAll();
  showToast("Frappeur adverse ajouté.", "success");
}

function setCurrentLineupBatter(game, side, playerOrBatter) {
  if (side === "opponent") {
    const batter = playerOrBatter;
    if (addBatterState.replace && game.opponentLineup.length) {
      game.opponentLineup[game.currentOpponentBatterIndex] = batter;
    } else {
      game.opponentLineup.push(batter);
      game.currentOpponentBatterIndex = game.opponentLineup.length - 1;
    }
    return;
  }

  const playerId = playerOrBatter;
  const existingIndex = game.lineup.indexOf(playerId);
  if (addBatterState.replace && game.lineup.length) {
    game.lineup[game.currentBatterIndex] = playerId;
  } else if (existingIndex >= 0) {
    game.currentBatterIndex = existingIndex;
  } else {
    game.lineup.push(playerId);
    game.currentBatterIndex = game.lineup.length - 1;
  }
}

function replaceCurrentBatter(side = null) {
  const game = getCurrentGame();
  if (!game) return showToast("Aucune partie active.", "warning");
  openAddBatterModal(side || getBattingSide(game), true);
}

function confirmBatterBeforeAction(actionType, defensePlay = null) {
  const game = getCurrentGame();
  if (!game || game.status === "terminée") return showToast("Aucune partie active.", "warning");
  const side = getBattingSide(game);
  pendingAction = { actionType, defensePlay };
  if (side === "opponent" && game.opponentTrackingMode === "simple") {
    executePendingActionForConfirmedBatter();
    return true;
  }
  openBatterConfirmModal(side, actionType);
  return false;
}

function openBatterConfirmModal(side = getBattingSide(getCurrentGame()), actionType = pendingAction?.actionType, forceChoose = false) {
  const game = getCurrentGame();
  if (!game) return;
  addBatterState = { side, replace: forceChoose };
  const locked = side === "opponent" ? game.opponentLineupLocked : game.teamLineupLocked;
  const expected = getExpectedBatter(game, side);
  const showExpected = !forceChoose && locked && expected;
  $("#addBatterTitle").textContent = side === "opponent" ? "Confirmer le frappeur adverse" : "Confirmer le frappeur de notre équipe";
  $("#addBatterSideLabel").textContent = side === "opponent" ? "Adversaire au bâton" : "Notre équipe au bâton";
  $("#expectedBatterPanel").classList.toggle("hidden", !showExpected);
  $("#teamBatterPanel").classList.toggle("hidden", showExpected || side === "opponent");
  $("#opponentBatterPanel").classList.toggle("hidden", showExpected || side !== "opponent");
  $("#expectedBatterText").textContent = expected ? displayBatterName(expected, side, game) : "-";
  $("#batterSearchInput").value = "";
  renderExistingBatterOptions();
  $("#quickBatterNumber").value = "";
  $("#quickBatterFirstName").value = "";
  $("#quickBatterLastName").value = "";
  $("#quickBatterPosition").value = "";
  $("#dynamicOpponentNumber").value = "";
  $("#addBatterModal").classList.remove("hidden");
}

function executePendingActionForConfirmedBatter() {
  const action = pendingAction;
  pendingAction = null;
  closeAddBatterModal();
  if (!action) return;
  if (action.actionType === "defensiveOut") {
    openDefensiveOutModal(true);
    return;
  }
  recordAtBat(action.actionType, action.defensePlay || null, true);
}

function confirmTeamBatterSelection(event) {
  const fromQuickAdd = event?.target?.id === "quickAddTeamBatterBtn";
  let playerId = $("#existingBatterSelect").value;
  if (fromQuickAdd) {
    const number = $("#quickBatterNumber").value.trim();
    const firstName = $("#quickBatterFirstName").value.trim();
    const lastName = $("#quickBatterLastName").value.trim();
    if (!number && !firstName && !lastName) return showToast("Entrez au moins un numéro ou un nom.", "warning");
    const existingQuickPlayer = appData.team.players.find((player) => {
      if (player.active === false) return false;
      const sameNumber = number && String(player.number) === String(number);
      const sameName = (firstName || lastName)
        && String(player.firstName || "").toLowerCase() === firstName.toLowerCase()
        && String(player.lastName || "").toLowerCase() === lastName.toLowerCase();
      return sameNumber || sameName;
    });
    if (existingQuickPlayer) {
      playerId = existingQuickPlayer.id;
    } else {
      const player = {
        id: createId("player"),
        number,
        firstName,
        lastName,
        position: $("#quickBatterPosition").value || "",
        active: true
      };
      appData.team.players.push(player);
      playerId = player.id;
    }
  }
  if (!playerId) return showToast("Sélectionnez un joueur.", "warning");
  addTeamBatterToDynamicLineup(playerId);
  executePendingActionForConfirmedBatter();
}

function confirmOpponentBatterNumber() {
  const number = $("#dynamicOpponentNumber").value.trim();
  if (!number) return showToast("Le numéro adverse est obligatoire.", "warning");
  addOpponentBatterToDynamicLineup(number);
  executePendingActionForConfirmedBatter();
}

function findTeamPlayerBySearch(value) {
  const search = String(value || "").trim().toLowerCase();
  if (!search) return appData.team.players.filter((player) => player.active !== false);
  return appData.team.players.filter((player) => (
    player.active !== false &&
    [player.number, player.firstName, player.lastName, formatPlayer(player)]
      .some((item) => String(item || "").toLowerCase().includes(search))
  ));
}

function findOpponentBatterByNumber(number) {
  const game = getCurrentGame();
  return game?.opponentLineup.find((batter) => String(batter.number) === String(number)) || null;
}

function addTeamBatterToDynamicLineup(playerId) {
  const game = getCurrentGame();
  if (!game) return;
  const existingIndex = game.lineup.indexOf(playerId);
  if (existingIndex >= 0 && game.lineupMode === "dynamic" && !game.teamLineupLocked && game.teamLineupBuildCompleteByRepeat) {
    lockTeamLineup("repeat");
    game.currentBatterIndex = existingIndex;
  } else if (addBatterState.replace && game.lineup.length) {
    game.lineup[game.currentBatterIndex] = playerId;
  } else if (existingIndex >= 0) {
    game.currentBatterIndex = existingIndex;
  } else {
    game.lineup.push(playerId);
    game.currentBatterIndex = game.lineup.length - 1;
  }
  updateCurrentGame(game);
  saveData();
  renderAll();
}

function addOpponentBatterToDynamicLineup(number) {
  const game = getCurrentGame();
  if (!game) return;
  const existingIndex = game.opponentLineup.findIndex((batter) => String(batter.number) === String(number));
  if (existingIndex >= 0 && game.opponentLineupMode === "dynamic" && !game.opponentLineupLocked && game.opponentLineupBuildCompleteByRepeat) {
    lockOpponentLineup("repeat");
    game.currentOpponentBatterIndex = existingIndex;
  } else if (addBatterState.replace && game.opponentLineup.length) {
    const batter = existingIndex >= 0 ? game.opponentLineup[existingIndex] : createOpponentPlayer(number, game);
    game.opponentLineup[game.currentOpponentBatterIndex] = batter;
  } else if (existingIndex >= 0) {
    game.currentOpponentBatterIndex = existingIndex;
  } else {
    const batter = createOpponentPlayer(number, game);
    game.opponentLineup.push(batter);
    game.currentOpponentBatterIndex = game.opponentLineup.length - 1;
  }
  updateCurrentGame(game);
  renderAll();
}

function lockTeamLineup(reason = "manual") {
  const game = getCurrentGame();
  if (!game) return;
  if (!game.lineup.length) return showToast("Ajoutez au moins un frappeur avant de verrouiller.", "warning");
  game.teamLineupLocked = true;
  game.teamLineupLockReason = reason;
  showToast(reason === "repeat" ? "Alignement de notre équipe verrouillé automatiquement" : "Alignement de notre équipe verrouillé", "success");
}

function lockOpponentLineup(reason = "manual") {
  const game = getCurrentGame();
  if (!game) return;
  if (!game.opponentLineup.length) return showToast("Ajoutez au moins un frappeur adverse avant de verrouiller.", "warning");
  game.opponentLineupLocked = true;
  game.opponentLineupLockReason = reason;
  showToast(reason === "repeat" ? "Alignement adverse verrouillé automatiquement" : "Alignement adverse verrouillé", "success");
}

function lockTeamLineupManually() {
  const game = getCurrentGame();
  if (!game) return showToast("Aucune partie active.", "warning");
  lockTeamLineup("manual");
  updateCurrentGame(game);
  renderAll();
}

function lockOpponentLineupManually() {
  const game = getCurrentGame();
  if (!game) return showToast("Aucune partie active.", "warning");
  if (game.opponentTrackingMode !== "complete") return showToast("Le suivi adverse complet n'est pas actif.", "warning");
  lockOpponentLineup("manual");
  updateCurrentGame(game);
  renderAll();
}

function getExpectedBatter(game, side) {
  if (side === "opponent") {
    if (!game.opponentLineup.length) return null;
    if (game.opponentLineupMode === "dynamic" && !game.opponentLineupLocked && game.currentOpponentBatterIndex >= game.opponentLineup.length) return null;
    if (game.currentOpponentBatterIndex >= game.opponentLineup.length) game.currentOpponentBatterIndex = 0;
    return game.opponentLineup[game.currentOpponentBatterIndex] || null;
  }
  if (!game.lineup.length) return null;
  if (game.lineupMode === "dynamic" && !game.teamLineupLocked && game.currentBatterIndex >= game.lineup.length) return null;
  if (game.currentBatterIndex >= game.lineup.length) game.currentBatterIndex = 0;
  return findPlayer(game.lineup[game.currentBatterIndex]) || null;
}

function advanceBatterIndex(game, side) {
  if (side === "opponent") {
    if (game.opponentLineupLocked && game.opponentLineup.length) {
      game.currentOpponentBatterIndex = (game.currentOpponentBatterIndex + 1) % game.opponentLineup.length;
    } else {
      game.currentOpponentBatterIndex = game.opponentLineup.length;
    }
    return;
  }
  if (game.teamLineupLocked && game.lineup.length) {
    game.currentBatterIndex = (game.currentBatterIndex + 1) % game.lineup.length;
  } else {
    game.currentBatterIndex = game.lineup.length;
  }
}

function openDefensiveOutModal(batterConfirmed = false) {
  const game = getCurrentGame();
  if (!batterConfirmed) return confirmBatterBeforeAction("defensiveOut");
  if (!game || game.status === "terminÃ©e") return showToast("Aucune partie active.", "warning");

  const side = getBattingSide(game);
  if (side === "team" && game.lineup.length < 1) return showToast("Aucun alignement.", "warning");
  if (side === "opponent" && game.opponentTrackingMode === "simple") {
    return showToast("Mode simplifiÃ©: utilisez +1 adversaire pour les points.", "warning");
  }
  if (side === "opponent" && game.opponentLineup.length < 1) {
    return showToast("Ajoutez au moins un frappeur adverse.", "warning");
  }

  defensiveOutState = { type: "fly", positions: [] };
  $("#defensiveOutModal").classList.remove("hidden");
  renderInteractiveField();
}

function closeDefensiveOutModal() {
  $("#defensiveOutModal").classList.add("hidden");
  resetDefensiveSequence();
}

function setDefensiveOutType(type) {
  defensiveOutState.type = type;
  defensiveOutState.positions = [];
  renderInteractiveField();
}

function addDefensivePosition(positionNumber) {
  const number = Number(positionNumber);
  if (!number) return;

  if (defensiveOutState.type === "fly" || defensiveOutState.type === "unassisted") {
    defensiveOutState.positions = [number];
  } else {
    defensiveOutState.positions.push(number);
  }
  renderInteractiveField();
}

function resetDefensiveSequence() {
  defensiveOutState.positions = [];
  renderInteractiveField();
}

function generateDefensivePlay(type, positions) {
  const cleanPositions = positions.map(Number).filter(Boolean);
  const code = defensivePlayCode(type, cleanPositions);
  return {
    type,
    code,
    positions: cleanPositions,
    label: defensivePlayLabel(type, cleanPositions, code)
  };
}

function defensivePlayCode(type, positions) {
  if (!positions.length) return "";
  if (type === "fly") return `F${positions[0]}`;
  if (type === "unassisted") return `${positions[0]}U`;
  return positions.join("-");
}

function defensivePlayLabel(type, positions, code) {
  if (!positions.length) return "SÃ©lectionnez une position.";
  if (type === "doubleplay") return `Double jeu ${code}`;
  const first = defensivePositionLabel(positions[0]);
  const last = defensivePositionLabel(positions[positions.length - 1]);
  if (type === "fly") return `Fly out au ${first}`;
  if (type === "unassisted") return `Retrait non assistÃ© du ${first}`;
  if (positions.length === 1) return `Retrait au sol vers le ${first}`;
  return `Retrait au sol de ${defensiveFromLabel(positions[0])} vers le ${last}`;
}

function defensivePositionLabel(positionNumber) {
  return DEFENSIVE_POSITIONS.find((position) => position.number === Number(positionNumber))?.label || positionNumber;
}

function defensiveFromLabel(positionNumber) {
  const label = defensivePositionLabel(positionNumber);
  return label === "arrêt-court" ? "l'arrêt-court" : `du ${label}`;
}

function confirmDefensiveOut() {
  const play = generateDefensivePlay(defensiveOutState.type, defensiveOutState.positions);
  const minimum = defensiveOutState.type === "doubleplay" || defensiveOutState.type === "groundout" ? 2 : 1;
  if (play.positions.length < minimum || !play.code) {
    return showToast("SÃ©lectionnez la sÃ©quence du retrait.", "warning");
  }

  recordAtBat("out", play, true);
  closeDefensiveOutModal();
}

function renderInteractiveField() {
  const field = $("#interactiveField");
  if (!field) return;
  const play = generateDefensivePlay(defensiveOutState.type, defensiveOutState.positions);

  $$("[data-defensive-type]").forEach((button) => {
    button.classList.toggle("active", button.dataset.defensiveType === defensiveOutState.type);
  });

  field.innerHTML = `
    <div class="interactive-diamond"></div>
    ${DEFENSIVE_POSITIONS.map((position) => {
      const selectedIndex = defensiveOutState.positions.findIndex((item) => item === position.number);
      return `
        <button type="button" class="defensive-position ${position.className} ${selectedIndex >= 0 ? "selected" : ""}" data-position-number="${position.number}">
          <strong>${position.number}</strong>
          <span>${position.abbr}</span>
          ${selectedIndex >= 0 ? `<em>${selectedIndex + 1}</em>` : ""}
        </button>
      `;
    }).join("")}
  `;

  $$(".defensive-position").forEach((button) => {
    button.addEventListener("click", () => addDefensivePosition(button.dataset.positionNumber));
  });

  $("#defensiveTypePreview").textContent = DEFENSIVE_OUT_TYPES[defensiveOutState.type] || "-";
  $("#defensiveSequencePreview").textContent = defensiveOutState.positions.length ? defensiveOutState.positions.join(" â†’ ") : "-";
  $("#defensiveCodePreview").textContent = play.code || "-";
  $("#defensiveLabelPreview").textContent = play.label || "-";
}

function recordOffensiveAction(action) {
  recordAtBat(action);
}

function recordAtBat(action, defensePlay = null, batterConfirmed = false) {
  const game = getCurrentGame();
  if (!batterConfirmed) return confirmBatterBeforeAction(action, defensePlay);
  if (!game || game.status === "terminée") return showToast("Aucune partie active.", "warning");

  const side = getBattingSide(game);
  game.currentBattingSide = side;
  if (side === "team" && game.lineup.length < 1) return showToast("Aucun alignement.", "warning");
  if (side === "opponent" && game.opponentTrackingMode === "simple") {
    return showToast("Mode simplifié: utilisez +1 adversaire pour les points.", "warning");
  }
  if (side === "opponent" && game.opponentLineup.length < 1) {
    return showToast("Ajoutez au moins un frappeur adverse.", "warning");
  }

  snapshotGame(game);
  const batterId = side === "team" ? game.lineup[game.currentBatterIndex] : game.opponentLineup[game.currentOpponentBatterIndex].id;
  let runsScored = 0;
  let outsAdded = 0;
  const atBat = makeAtBat(game, batterId, action, side);

  if (action === "single") {
    runsScored = advanceRunners(game, 1, side);
    placeBatter(game, batterId, "first");
    Object.assign(atBat, { ab: 1, hit: 1, single: 1 });
  }

  if (action === "double") {
    runsScored = advanceRunners(game, 2, side);
    placeBatter(game, batterId, "second");
    Object.assign(atBat, { ab: 1, hit: 1, double: 1 });
  }

  if (action === "triple") {
    runsScored = scoreAllRunners(game, side);
    placeBatter(game, batterId, "third");
    Object.assign(atBat, { ab: 1, hit: 1, triple: 1 });
  }

  if (action === "hr") {
    runsScored = scoreAllRunners(game, side) + scoreRun(game, batterId, side);
    clearBases(game);
    Object.assign(atBat, { ab: 1, hit: 1, hr: 1, run: 1 });
  }

  if (action === "bb") {
    runsScored = walkBatter(game, batterId, side);
    atBat.bb = 1;
  }

  if (action === "out") {
    outsAdded = defensePlay?.type === "doubleplay" ? 2 : 1;
    Object.assign(atBat, {
      ab: 1,
      outsAdded,
      defensePlay
    });
    addOuts(game, outsAdded);
  }

  if (action === "error") {
    runsScored = advanceRunners(game, 1, side);
    placeBatter(game, batterId, "first");
    atBat.ab = 1;
  }

  if (action === "sacrifice") {
    runsScored = advanceRunners(game, 1, side);
    outsAdded = 1;
    Object.assign(atBat, { outsAdded: 1 });
    addOuts(game, 1);
  }

  atBat.rbi = runsScored;
  const batter = side === "opponent" ? findOpponentBatter(game, batterId) : findPlayer(batterId);
  const actionInfo = {
    inning: game.currentInning,
    half: game.half,
    battingSide: side,
    batter: batter ? displayBatterName(batter, side, game) : runnerName(batterId, game),
    result: liveResultLabel(action),
    defensePlay: defensePlay?.code || "",
    runsScored,
    createdAt: new Date().toISOString()
  };
  actionInfo.description = buildPlayByPlayDescription(actionInfo);
  const playEvent = createPlayByPlayEvent(game, actionInfo);
  game.playByPlay.unshift(playEvent);
  game.playByPlay = game.playByPlay.slice(0, 120);
  game.liveLastAction = playEvent.description;
  getAtBatList(game, side).push(atBat);
  advanceBatterIndex(game, side);
  updateCurrentGame(game);
  syncLiveGameState(game);
  publishPlayByPlayEvent(game, playEvent);
  renderAll();
  playGameAnimation(playEvent.animation);
  showToast(actionFeedback(action, runsScored, defensePlay), action === "error" ? "warning" : "success");

  if (runsScored > 0) {
    checkRunLimitAfterScoring(game);
  }

  if (outsAdded && game.outs >= 3 && confirm("Trois retraits. Changer de demi-manche?")) {
    endHalfInning(false);
  }
}

function actionFeedback(action, runsScored, defensePlay = null) {
  const runText = runsScored > 0 ? ` · ${runsScored} point${runsScored > 1 ? "s" : ""} marqué${runsScored > 1 ? "s" : ""}` : "";
  if (action === "out" && defensePlay?.code) {
    const prefix = defensePlay.type === "doubleplay" ? "Double jeu" : "Retrait";
    return `${prefix} ${defensePlay.code} enregistré`;
  }
  const labels = {
    single: "Simple enregistré",
    double: "Double enregistré",
    triple: "Triple enregistré",
    hr: "Circuit!",
    bb: "But sur balles enregistré",
    out: "Retrait ajouté",
    error: "Erreur enregistrée",
    sacrifice: "Sacrifice enregistré"
  };
  return `${labels[action] || "Action enregistrée"}${runText}`;
}

function makeAtBat(game, playerId, result, side) {
  return {
    id: createId("ab"),
    playerId,
    side,
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
    defensePlay: null,
    timestamp: new Date().toISOString()
  };
}

function advanceRunners(game, basesToAdvance, side) {
  let runs = 0;
  ["third", "second", "first"].forEach((base) => {
    const runnerId = game.bases[base];
    if (!runnerId) return;
    game.bases[base] = null;
    const destination = destinationBase(base, basesToAdvance);
    if (destination === "home") {
      runs += scoreRun(game, runnerId, side);
    } else {
      game.bases[destination] = runnerId;
    }
  });
  return runs;
}

function walkBatter(game, batterId, side) {
  let runs = 0;
  if (game.bases.first && game.bases.second && game.bases.third) {
    runs += scoreRun(game, game.bases.third, side);
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

function scoreAllRunners(game, side) {
  let runs = 0;
  ["third", "second", "first"].forEach((base) => {
    if (game.bases[base]) {
      runs += scoreRun(game, game.bases[base], side);
      game.bases[base] = null;
    }
  });
  return runs;
}

function scoreRun(game, playerId, side) {
  ensureInningScore(game, game.currentInning);
  const inning = game.inningScores[game.currentInning - 1];
  if (side === "opponent") {
    game.scoreOpponent += 1;
    inning.opponent += 1;
  } else {
    game.scoreTeam += 1;
    inning.team += 1;
  }
  markRunForPlayer(game, playerId, side);
  return 1;
}

function getCurrentHalfInningRuns(game) {
  if (!game) return 0;
  ensureInningScore(game, game.currentInning);
  const inning = game.inningScores[game.currentInning - 1] || { team: 0, opponent: 0 };
  return getBattingSide(game) === "opponent" ? Number(inning.opponent || 0) : Number(inning.team || 0);
}

function isRunLimitReached(game) {
  if (!game?.runLimitEnabled || !game.runLimitPerInning) return false;
  if (game.runLimitAppliesToLastInning === false && game.currentInning >= game.innings) return false;
  return getCurrentHalfInningRuns(game) >= Number(game.runLimitPerInning);
}

function checkRunLimitAfterScoring(game) {
  if (!isRunLimitReached(game)) return false;
  return promptRunLimitReached(game);
}

function promptRunLimitReached(game) {
  const limit = Number(game.runLimitPerInning);
  const shouldEnd = confirm(`Limite de ${limit} points atteinte pour cette demi-manche. Voulez-vous terminer la demi-manche maintenant ?`);
  if (shouldEnd) {
    endHalfInning(false);
  }
  return shouldEnd;
}

function runLimitDescription(game) {
  if (!game?.runLimitEnabled || !game.runLimitPerInning) return "Aucune";
  const suffix = game.runLimitAppliesToLastInning === false ? ", sauf dernière manche" : "";
  return `${game.runLimitPerInning} points / manche${suffix}`;
}

function markRunForPlayer(game, playerId, side) {
  const list = getAtBatList(game, side);
  for (let index = list.length - 1; index >= 0; index -= 1) {
    if (list[index].playerId === playerId) {
      list[index].run += 1;
      return;
    }
  }
}

function getAtBatList(game, side) {
  return side === "opponent" ? game.opponentAtBats : game.atBats;
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

function nextBatter(game, side) {
  if (side === "opponent") {
    if (game.opponentLineup.length) {
      game.currentOpponentBatterIndex = (game.currentOpponentBatterIndex + 1) % game.opponentLineup.length;
    }
    return;
  }
  if (game.lineup.length) {
    game.currentBatterIndex = (game.currentBatterIndex + 1) % game.lineup.length;
  }
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
  game.currentBattingSide = getBattingSide(game);
  const playEvent = createPlayByPlayEvent(game, {
    inning: game.currentInning,
    half: game.half,
    battingSide: game.currentBattingSide,
    result: "Changement de demi-manche",
    description: `Changement de demi-manche : ${game.half} ${game.currentInning}e`
  });
  game.playByPlay.unshift(playEvent);
  game.playByPlay = game.playByPlay.slice(0, 120);
  game.liveLastAction = playEvent.description;
  updateCurrentGame(game);
  syncLiveGameState(game);
  publishPlayByPlayEvent(game, playEvent);
  renderAll();
  playGameAnimation(playEvent.animation);
  showToast("Demi-manche changée.", "info");
}

function adjustOpponentScore(delta) {
  const game = getCurrentGame();
  if (!game) return;
  snapshotGame(game);
  ensureInningScore(game, game.currentInning);
  const inning = game.inningScores[game.currentInning - 1];
  if (delta < 0 && inning.opponent === 0) {
    game.history.pop();
    return showToast("Aucun point adverse à retirer dans cette manche.", "warning");
  }
  inning.opponent = Math.max(0, inning.opponent + delta);
  game.scoreOpponent = game.inningScores.reduce((total, row) => total + (row.opponent || 0), 0);
  let playEvent = null;
  if (delta > 0) {
    playEvent = createPlayByPlayEvent(game, {
      inning: game.currentInning,
      half: game.half,
      battingSide: "opponent",
      result: "Point adverse",
      runsScored: delta,
      description: `${game.opponent || "Adversaire"} : ${delta} point${delta > 1 ? "s" : ""} ajouté${delta > 1 ? "s" : ""}`
    });
    game.playByPlay.unshift(playEvent);
    game.playByPlay = game.playByPlay.slice(0, 120);
    game.liveLastAction = playEvent.description;
  }
  updateCurrentGame(game);
  syncLiveGameState(game);
  if (playEvent) publishPlayByPlayEvent(game, playEvent);
  renderAll();
  if (playEvent) playGameAnimation(playEvent.animation);
  showToast("Score adverse ajusté.", "info");
  if (delta > 0 && game.runLimitEnabled && game.runLimitPerInning && !(game.runLimitAppliesToLastInning === false && game.currentInning >= game.innings)) {
    const limit = Number(game.runLimitPerInning);
    if (inning.opponent > limit) {
      alert(`Attention : la limite est de ${limit} points par manche. Vous avez entré ${inning.opponent} points.`);
    }
    if (getBattingSide(game) === "opponent" && inning.opponent >= limit) {
      promptRunLimitReached(game);
    }
  }
}

function finishGame() {
  const game = getCurrentGame();
  if (!game) return;
  if (!confirm("Terminer la partie?")) return;
  snapshotGame(game);
  game.status = "terminée";
  const calendarEvent = appData.calendar.find((event) => event.linkedGameId === game.id || event.id === game.linkedGameId);
  if (calendarEvent) calendarEvent.status = "Joué";
  const playEvent = createPlayByPlayEvent(game, {
    inning: game.currentInning,
    half: game.half,
    battingSide: game.currentBattingSide,
    result: "Fin de partie",
    description: `Fin de partie : ${appData.team.name} ${game.scoreTeam} - ${game.scoreOpponent} ${game.opponent || "Adversaire"}`
  });
  game.playByPlay.unshift(playEvent);
  game.playByPlay = game.playByPlay.slice(0, 120);
  game.liveLastAction = playEvent.description;
  updateCurrentGame(game);
  syncLiveGameState(game);
  publishPlayByPlayEvent(game, playEvent);
  saveData();
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
  if (!game || !canOpenLiveMatch(game)) {
    renderMatchScreen(game);
    $("#outsDots").innerHTML = renderOutDots(0);
    renderBases(null);
    renderPlayByPlay(game);
    return;
  }

  renderMatchScreen(game);
  game.currentBattingSide = getBattingSide(game);
  const battingSide = game.currentBattingSide;
  const batter = getCurrentBatter(game);
  const next = getNextBatter(game);
  const lastAction = getLastActionLabel(game);
  const battingLabel = battingSide === "team" ? "Notre équipe au bâton" : "Adversaire au bâton";
  const modeLabel = game.opponentTrackingMode === "complete" ? "Mode complet" : "Mode simplifié";
  const lineupStatus = lineupStatusLabel(game, battingSide);
  const addedBatters = battingSide === "team" ? game.lineup.length : game.opponentLineup.length;
  renderLiveBroadcastPanel(game);

  $("#liveScoreboard").innerHTML = `
    <div class="scoreboard">
      <div class="score-row ${battingSide === "team" ? "batting-row" : ""}">
        <span class="score-team-name">${escapeHtml(appData.team.name)} <em>Notre équipe</em></span>
        <strong class="score-number">${game.scoreTeam}</strong>
      </div>
      <div class="score-row ${battingSide === "opponent" ? "batting-row" : ""}">
        <span class="score-team-name">${escapeHtml(game.opponent || "Adversaire")} <em>Adversaire</em></span>
        <strong class="score-number">${game.scoreOpponent}</strong>
      </div>
    </div>
  `;

  $("#liveInfo").innerHTML = gameCards([
    ["Équipe au bâton", battingLabel],
    ["Mode adverse", modeLabel],
    ["Alignement", lineupStatus],
    ["Frappeurs ajoutés", `${addedBatters}`],
    ["Manche", `${game.currentInning}`],
    ["Demi", game.half],
    ["Retraits", `${game.outs} / 3`],
    ["Limite", runLimitDescription(game)],
    ["Points cette demi-manche", game.runLimitEnabled && game.runLimitPerInning ? `${getCurrentHalfInningRuns(game)} / ${game.runLimitPerInning}` : `${getCurrentHalfInningRuns(game)}`],
    ["Frappeur actuel", batter ? displayBatterName(batter, battingSide, game) : "À confirmer"],
    ["Prochain frappeur", next ? displayBatterName(next, battingSide, game) : "À confirmer"],
    ["Dernière action", lastAction],
    ["Statut", game.status]
  ]);

  $("#oppPlusBtn").disabled = !(battingSide === "opponent" || game.opponentTrackingMode === "simple");
  $("#oppMinusBtn").disabled = false;
  $("#lockTeamLineupBtn").disabled = game.teamLineupLocked || !game.lineup.length;
  $("#lockOpponentLineupBtn").disabled = game.opponentTrackingMode !== "complete" || game.opponentLineupLocked || !game.opponentLineup.length;
  $$(".hit-actions button").forEach((button) => {
    button.disabled = battingSide === "opponent" && game.opponentTrackingMode === "simple";
  });

  $("#outsDots").innerHTML = renderOutDots(game.outs);
  renderAnimatedField(game);
  renderBases(game);
  renderPlayByPlay(game);
}

function renderMatchScreen(game = getCurrentGame()) {
  const liveLayout = $("#liveLayout");
  const stateContainer = $("#matchStateContainer");
  if (!liveLayout || !stateContainer) return;

  const status = normalizeGameStatus(game?.status);
  if (game && status === "in_progress") {
    liveLayout.classList.remove("hidden");
    stateContainer.innerHTML = "";
    return;
  }

  liveLayout.classList.add("hidden");
  if ($("#liveBroadcastPanel")) $("#liveBroadcastPanel").innerHTML = "";
  if (!game) {
    stateContainer.innerHTML = renderNoActiveMatchState();
  } else if (status === "completed") {
    stateContainer.innerHTML = renderCompletedGameState(game);
  } else {
    stateContainer.innerHTML = renderGamePreparationState(game);
  }
}

function renderNoActiveMatchState() {
  return `
    <div class="match-state-card">
      <h2>Aucun match en cours</h2>
      <p>Pour marquer une partie, créez d'abord un match à partir du calendrier, puis démarrez la partie.</p>
      <div class="form-actions">
        <button class="primary-btn" onclick="openCalendar()">Ouvrir le calendrier</button>
        ${appData.games.some((game) => normalizeGameStatus(game.status) === "preparation") ? `<button onclick="openFirstPreparationGame()">Voir les parties en préparation</button>` : ""}
      </div>
    </div>
  `;
}

function renderGamePreparationState(game) {
  return `
    <div class="match-state-card">
      <h2>Partie en préparation</h2>
      <p>Cette partie n'est pas encore démarrée. Préparez l'alignement ou démarrez le match.</p>
      <div class="score-summary compact-summary">
        ${summaryRows([
          ["Adversaire", game.opponent || "Adversaire"],
          ["Date", formatDate(game.date)],
          ["Statut", game.status || "préparation"]
        ])}
      </div>
      <div class="form-actions">
        <button onclick="openLineupForCurrentGame()">Préparer l'alignement</button>
        <button class="primary-btn" onclick="startCurrentGame()">Démarrer le match</button>
      </div>
    </div>
  `;
}

function renderCompletedGameState(game) {
  return `
    <div class="match-state-card">
      <h2>Partie terminée</h2>
      <p>Cette partie est terminée. Vous pouvez consulter le rapport ou créer une nouvelle partie.</p>
      <div class="score-summary compact-summary">
        ${summaryRows([
          ["Adversaire", game.opponent || "Adversaire"],
          ["Score final", `${appData.team.name} ${game.scoreTeam} - ${game.scoreOpponent} ${game.opponent || "Adversaire"}`],
          ["Date", formatDate(game.date)]
        ])}
      </div>
      <div class="form-actions">
        <button class="primary-btn" onclick="openReportForCurrentGame()">Voir rapport</button>
        <button onclick="openCalendar()">Ouvrir le calendrier</button>
      </div>
    </div>
  `;
}

function openFirstPreparationGame() {
  const game = appData.games.find((item) => normalizeGameStatus(item.status) === "preparation");
  if (!game) return openCalendar();
  appData.currentGameId = game.id;
  saveData();
  showScreen("live");
}

function lineupStatusLabel(game, side) {
  const dynamic = side === "opponent" ? game.opponentLineupMode === "dynamic" : game.lineupMode === "dynamic";
  const locked = side === "opponent" ? game.opponentLineupLocked : game.teamLineupLocked;
  if (!dynamic) return "Alignement préparé";
  return locked ? "Alignement verrouillé" : "Alignement en construction";
}

function lineupReportStatus(game, side) {
  const dynamic = side === "opponent" ? game.opponentLineupMode === "dynamic" : game.lineupMode === "dynamic";
  const locked = side === "opponent" ? game.opponentLineupLocked : game.teamLineupLocked;
  const reason = side === "opponent" ? game.opponentLineupLockReason : game.teamLineupLockReason;
  if (!dynamic) return "Préparé avant la partie";
  if (!locked) return "Construit pendant la partie, non verrouillé";
  return reason === "repeat"
    ? "Construit pendant la partie, verrouillé automatiquement au retour du premier frappeur"
    : "Construit pendant la partie, verrouillé manuellement";
}

function getLastActionLabel(game) {
  if (game.playByPlay?.length) return game.playByPlay[0].description || "-";
  const lastTeamAtBat = game.atBats[game.atBats.length - 1] || null;
  const lastOpponentAtBat = game.opponentAtBats[game.opponentAtBats.length - 1] || null;
  const last = [lastTeamAtBat, lastOpponentAtBat]
    .filter(Boolean)
    .sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")))[0];
  if (!last) return "-";
  if (last.defensePlay?.code) return `Retrait ${last.defensePlay.code}`;
  return last.result || "-";
}

function createPlayByPlayEvent(game, actionInfo) {
  const event = {
    id: createId("pbp"),
    inning: actionInfo.inning || game.currentInning,
    half: actionInfo.half || game.half,
    battingSide: actionInfo.battingSide || getBattingSide(game),
    batter: actionInfo.batter || "",
    result: actionInfo.result || "",
    defensePlay: actionInfo.defensePlay || "",
    runsScored: Number(actionInfo.runsScored || 0),
    description: actionInfo.description || buildPlayByPlayDescription(actionInfo),
    createdAt: actionInfo.createdAt || new Date().toISOString()
  };
  event.animation = actionInfo.animation || buildPlayAnimation(event, game);
  return event;
}

function buildPlayAnimation(actionInfo, game = null) {
  const result = String(actionInfo.result || "").toLowerCase();
  const code = actionInfo.defensePlay || "";
  if (code) {
    const positions = code.replace(/^F/i, "").replace(/U$/i, "").split("-").map((item) => item.trim()).filter(Boolean);
    const isFly = /^F/i.test(code);
    const isDoublePlay = positions.length >= 3 || result.includes("double");
    return {
      type: isDoublePlay ? "doubleplay" : isFly ? "flyout" : "groundout",
      code,
      ballPath: ["home", ...positions],
      runnerMovements: [],
      highlightPositions: positions.map(Number).filter(Boolean),
      message: `${isDoublePlay ? "Double jeu" : "Retrait"} ${code}`,
      duration: isDoublePlay ? 4200 : 3200
    };
  }
  if (result.includes("simple")) return playAnimation("single", actionInfo, ["home", "outfield-right"], [{ runner: actionInfo.batter, from: "home", to: "1B" }], `Simple de ${actionInfo.batter}`, 3000);
  if (result.includes("double")) return playAnimation("double", actionInfo, ["home", "outfield-center"], [{ runner: actionInfo.batter, from: "home", to: "2B" }], `Double de ${actionInfo.batter}`, 3200);
  if (result.includes("triple")) return playAnimation("triple", actionInfo, ["home", "outfield-left"], [{ runner: actionInfo.batter, from: "home", to: "3B" }], `Triple de ${actionInfo.batter}`, 3400);
  if (result.includes("circuit")) return playAnimation("homerun", actionInfo, ["home", "outfield-deep"], [{ runner: actionInfo.batter, from: "home", to: "home", via: ["1B", "2B", "3B"] }], "Circuit !", 4200);
  if (result.includes("bb")) return playAnimation("walk", actionInfo, [], [{ runner: actionInfo.batter, from: "home", to: "1B" }], "But sur balles", 2600);
  if (result.includes("erreur")) return playAnimation("error", actionInfo, ["home", "6"], [{ runner: actionInfo.batter, from: "home", to: "1B" }], actionInfo.description || "Erreur", 3000);
  if (result.includes("sacrifice")) return playAnimation("sacrifice", actionInfo, ["home", "outfield-center"], [], actionInfo.description || "Sacrifice", 3000);
  if (result.includes("changement")) return playAnimation("half", actionInfo, ["home", "2B"], [], actionInfo.description || "Changement de demi-manche", 2500);
  if (result.includes("fin")) return playAnimation("final", actionInfo, ["home", "outfield-center"], [], "Fin de partie", 3200);
  return playAnimation("generic", actionInfo, ["home", "outfield-center"], [], actionInfo.description || actionInfo.result || "Action", 2800);
}

function playAnimation(type, actionInfo, ballPath, runnerMovements, message, duration = 3000) {
  return {
    type,
    code: actionInfo.defensePlay || "",
    ballPath,
    runnerMovements,
    highlightPositions: [],
    message,
    duration
  };
}

function renderPlayByPlay(game) {
  const panel = $("#markerPlayByPlay");
  if (!panel) return;
  const events = game?.playByPlay || [];
  panel.innerHTML = `
    <div class="card-title-row">
      <h3>Play-by-Play</h3>
      <span class="pill">${events.length} action${events.length > 1 ? "s" : ""}</span>
    </div>
    <div class="play-by-play-list">
      ${events.length ? events.slice(0, 20).map(renderPlayByPlayItem).join("") : `<div class="empty-state">Les actions du match apparaîtront ici.</div>`}
    </div>
  `;
}

function renderPlayByPlayItem(event) {
  return `
    <div class="play-by-play-item">
      <strong>${escapeHtml(event.half || "-")} ${escapeHtml(String(event.inning || "-"))}e — ${escapeHtml(event.battingSide === "opponent" ? "Adversaire" : "Notre équipe")}</strong>
      <span>${escapeHtml(event.description || "-")}</span>
    </div>
  `;
}

function getFieldPointPosition(pointKey) {
  return FIELD_POINTS[String(pointKey)] || null;
}

function renderFieldPositions(highlightPositions = []) {
  const highlights = new Set(highlightPositions.map(Number));
  return DEFENSIVE_POSITIONS.map((position) => {
    const point = getFieldPointPosition(String(position.number));
    if (!point) return "";
    return `
      <span class="field-position-marker ${highlights.has(position.number) ? "active" : ""}" style="left:${point.x}%;top:${point.y}%">
        <strong>${position.number}</strong><em>${position.abbr}</em>
      </span>
    `;
  }).join("");
}

function renderAnimatedField(game) {
  const layer = $("#fieldStaticLayer");
  if (!layer) return;
  layer.innerHTML = `
    <div class="field-foul-line first-line"></div>
    <div class="field-foul-line third-line"></div>
    <div class="field-mound"><span></span></div>
    <div class="home-plate-shape"></div>
    <div class="batters-box left-box"></div>
    <div class="batters-box right-box"></div>
    <div class="base-path path-home-first"></div>
    <div class="base-path path-first-second"></div>
    <div class="base-path path-second-third"></div>
    <div class="base-path path-third-home"></div>
    <div class="field-positions-layer">${renderFieldPositions()}</div>
  `;
}

function playGameAnimation(animation, layerSelector = "#fieldAnimationLayer") {
  const layer = document.querySelector(layerSelector);
  if (!layer || !animation) return;
  const path = animation.ballPath || [];
  const points = path.map(getFieldPointPosition).filter(Boolean);
  const lines = drawTrajectory(points);
  const highlights = highlightFieldPositions(animation.highlightPositions || []);
  const ball = animateBallPath(points, animation.type);
  const runners = animateRunnerMovements(animation.runnerMovements || []);
  layer.innerHTML = `
    ${showActionOverlay(animation.message || "Action", animation.type)}
    ${lines}
    ${highlights}
    ${ball}
    ${runners}
  `;
  layer.classList.add("playing", `animation-${animation.type || "generic"}`);
  window.clearTimeout(layer._animationTimer);
  layer._animationTimer = window.setTimeout(() => {
    layer.className = "field-animation-layer";
    layer.innerHTML = "";
  }, Number(animation.duration || 3200));
}

function animateBallPath(points, type = "generic") {
  if (!points.length) return "";
  return points.map((point, index) => `
    <span class="animated-ball ${type}" style="--x:${point.x}%;--y:${point.y}%;--delay:${index * 220}ms"></span>
  `).join("");
}

function drawTrajectory(points) {
  return points.slice(1).map((point, index) => renderAnimationLine(points[index], point, index)).join("");
}

function highlightFieldPositions(positions) {
  return positions.map((position) => {
    const point = getFieldPointPosition(String(position));
    if (!point) return "";
    return `<span class="field-highlight" style="left:${point.x}%;top:${point.y}%">${position}</span>`;
  }).join("");
}

function animateRunnerMovements(runnerMovements) {
  return runnerMovements.map((movement, index) => {
    const route = [movement.from, ...(movement.via || []), movement.to].map(getFieldPointPosition).filter(Boolean);
    if (route.length < 2) return "";
    return route.map((point, stepIndex) => `
      <span class="animated-runner step-${stepIndex}" style="--x:${point.x}%;--y:${point.y}%;--delay:${(index * 120) + (stepIndex * 260)}ms">${escapeHtml(runnerToken(movement.runner))}</span>
    `).join("") + (movement.to === "home" ? `<span class="run-plus-one" style="left:${route.at(-1).x}%;top:${route.at(-1).y}%">+1</span>` : "");
  }).join("");
}

function runnerToken(runner) {
  const number = String(runner || "").match(/#\d+/)?.[0];
  return number || String(runner || "R").trim().charAt(0).toUpperCase() || "R";
}

function showActionOverlay(message, type = "generic") {
  return `<div class="animation-message ${type}">${escapeHtml(message)}</div>`;
}

function renderAnimationLine(start, end, index = 0) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.sqrt((dx * dx) + (dy * dy));
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  return `<span class="field-path-line" style="left:${start.x}%;top:${start.y}%;width:${length}%;transform:rotate(${angle}deg);--delay:${index * 160}ms"></span>`;
}

function buildLiveGameState(game) {
  const side = getBattingSide(game);
  const currentBatter = getCurrentBatter(game);
  return {
    public_game_id: game.publicGameId,
    home_team: game.homeAway === "local" ? appData.team.name : (game.opponent || "Adversaire"),
    away_team: game.homeAway === "visiteur" ? appData.team.name : (game.opponent || "Adversaire"),
    team_name: appData.team.name,
    opponent_name: game.opponent || "Adversaire",
    score_team: game.scoreTeam || 0,
    score_opponent: game.scoreOpponent || 0,
    current_inning: game.currentInning || 1,
    half: game.half || "haut",
    outs: game.outs || 0,
    bases: {
      first: liveBaseName(game.bases?.first, game),
      second: liveBaseName(game.bases?.second, game),
      third: liveBaseName(game.bases?.third, game)
    },
    // Si la colonne manque dans Supabase:
    // alter table public.live_games add column if not exists inning_scores jsonb default '{}'::jsonb;
    inning_scores: game.inningScores || [],
    current_batter: currentBatter ? displayBatterName(currentBatter, side, game) : "",
    batting_side: side,
    status: normalizeGameStatus(game.status),
    last_action: game.liveLastAction || getLastActionLabel(game),
    updated_at: new Date().toISOString()
  };
}

function liveBaseName(playerId, game) {
  if (!playerId) return null;
  const name = runnerName(playerId, game);
  return name === "Vide" ? null : name;
}

async function syncLiveGameState(game) {
  if (!supabaseClient || !game?.liveEnabled || !game.publicGameId || !navigator.onLine) return false;
  const payload = buildLiveGameState(game);
  try {
    const { error } = await supabaseClient
      .from("live_games")
      .upsert(payload, { onConflict: "public_game_id" });
    if (error?.message?.includes("inning_scores")) {
      const { inning_scores, ...fallbackPayload } = payload;
      const retry = await supabaseClient.from("live_games").upsert(fallbackPayload, { onConflict: "public_game_id" });
      if (retry.error) throw retry.error;
      return true;
    }
    if (error) throw error;
    return true;
  } catch (error) {
    console.warn("Live game sync failed", error);
    return false;
  }
}

async function publishPlayByPlayEvent(game, actionInfo) {
  if (!game?.liveEnabled || !game.publicGameId) return false;
  const event = {
    public_game_id: game.publicGameId,
    inning: actionInfo.inning || game.currentInning,
    half: actionInfo.half || game.half,
    batting_side: actionInfo.battingSide || getBattingSide(game),
    batter: actionInfo.batter || "",
    result: actionInfo.result || "",
    defense_play: actionInfo.defensePlay || "",
    runs_scored: Number(actionInfo.runsScored || 0),
    description: actionInfo.description || "",
    // Si la colonne manque dans Supabase:
    // alter table public.play_by_play add column if not exists animation jsonb default '{}'::jsonb;
    animation: actionInfo.animation || {},
    created_at: actionInfo.createdAt || new Date().toISOString()
  };

  if (!supabaseClient || !navigator.onLine) {
    queuePendingLiveEvent(game, event);
    return false;
  }

  try {
    const { error } = await supabaseClient.from("play_by_play").insert(event);
    if (error?.message?.includes("animation")) {
      const { animation, ...fallbackEvent } = event;
      const retry = await supabaseClient.from("play_by_play").insert(fallbackEvent);
      if (retry.error) throw retry.error;
      return true;
    }
    if (error) throw error;
    return true;
  } catch (error) {
    console.warn("Play-by-play publish failed", error);
    queuePendingLiveEvent(game, event);
    return false;
  }
}

function queuePendingLiveEvent(game, event) {
  game.pendingLiveEvents = Array.isArray(game.pendingLiveEvents) ? game.pendingLiveEvents : [];
  game.pendingLiveEvents.push(event);
  updateCurrentGame(game);
}

async function syncPendingLiveEvents(game) {
  if (!supabaseClient || !game?.liveEnabled || !game.publicGameId || !navigator.onLine || !game.pendingLiveEvents?.length) return false;
  const pending = [...game.pendingLiveEvents];
  try {
    const { error } = await supabaseClient.from("play_by_play").insert(pending);
    if (error?.message?.includes("animation")) {
      const retry = await supabaseClient.from("play_by_play").insert(pending.map(({ animation, ...event }) => event));
      if (retry.error) throw retry.error;
      game.pendingLiveEvents = [];
      updateCurrentGame(game);
      showToast("Ã‰vÃ©nements live synchronisÃ©s.", "success");
      return true;
    }
    if (error) throw error;
    game.pendingLiveEvents = [];
    updateCurrentGame(game);
    showToast("Événements live synchronisés.", "success");
    return true;
  } catch (error) {
    console.warn("Pending live sync failed", error);
    return false;
  }
}

function buildPlayByPlayDescription(actionInfo) {
  const runs = actionInfo.runsScored > 0 ? `, ${actionInfo.runsScored} point${actionInfo.runsScored > 1 ? "s" : ""} marqué${actionInfo.runsScored > 1 ? "s" : ""}` : "";
  return `${actionInfo.batter} : ${actionInfo.result}${actionInfo.defensePlay ? ` ${actionInfo.defensePlay}` : ""}${runs}`;
}

function liveResultLabel(action) {
  return {
    single: "Simple",
    double: "Double",
    triple: "Triple",
    hr: "Circuit",
    bb: "BB",
    out: "Retrait",
    error: "Erreur",
    sacrifice: "Sacrifice"
  }[action] || action;
}

function renderLiveBroadcastPanel(game) {
  const panel = $("#liveBroadcastPanel");
  if (!panel) return;
  if (game.liveEnabled && (!game.publicGameId || !game.liveShareUrl)) {
    ensureLiveShareFields(game);
    updateCurrentGame(game);
  }
  const liveState = game.liveEnabled ? (navigator.onLine ? "Live actif" : "Live en attente de connexion") : "Live inactif";
  const shareUrl = game.liveShareUrl || "";
  panel.innerHTML = `
    <div class="live-broadcast-card ${game.liveEnabled ? "active" : ""}">
      <div>
        <span class="mini-badge">${escapeHtml(liveState)}</span>
        <h3>Diffusion live</h3>
        <p>${game.liveEnabled ? "Lien public pour les parents." : "Publier le score et le play-by-play en direct."}</p>
      </div>
      ${shareUrl ? `
        <label class="share-link-label">URL parent spectateur
          <input class="share-link-input" value="${escapeHtml(shareUrl)}" readonly onclick="this.select()">
        </label>
        <a class="share-link-text" href="${escapeHtml(shareUrl)}" target="_blank" rel="noopener">${escapeHtml(shareUrl)}</a>
      ` : ""}
      <div class="home-card-actions">
        <button class="primary-btn" onclick="enableLiveBroadcast()">${game.liveEnabled ? "Synchroniser" : "Activer diffusion live"}</button>
        ${shareUrl ? `<button onclick="copyLiveShareLink()">Copier le lien</button><button onclick="openSpectatorLink()">Ouvrir comme spectateur</button>` : ""}
      </div>
    </div>
  `;
}

function ensureLiveShareFields(game) {
  if (!game.publicGameId) game.publicGameId = generatePublicGameId();
  game.liveShareUrl = `${window.location.origin}${window.location.pathname}?watch=${game.publicGameId}`;
  return game.liveShareUrl;
}

function generatePublicGameId() {
  let code = "";
  do {
    code = Math.random().toString(36).slice(2, 8).toUpperCase();
  } while (appData.games.some((game) => game.publicGameId === code));
  return code;
}

function enableLiveBroadcast() {
  const game = getCurrentGame();
  if (!game) return showToast("Aucune partie active.", "warning");
  game.liveEnabled = true;
  ensureLiveShareFields(game);
  updateCurrentGame(game);
  renderAll();
  syncLiveGameState(game);
  syncPendingLiveEvents(game);
  showToast("Diffusion live activée.", "success");
}

function copyLiveShareLink() {
  const game = getCurrentGame();
  if (!game?.liveShareUrl) return;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(game.liveShareUrl);
    showToast("Lien live copié.", "success");
    return;
  }
  const input = document.querySelector(".share-link-input");
  input?.select();
  document.execCommand("copy");
  showToast("Lien live copié.", "success");
}

function openSpectatorLink() {
  const game = getCurrentGame();
  if (!game?.liveShareUrl) return;
  window.open(game.liveShareUrl, "_blank");
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
  $("#baseFirst").textContent = game ? runnerName(game.bases.first, game) : empty;
  $("#baseSecond").textContent = game ? runnerName(game.bases.second, game) : empty;
  $("#baseThird").textContent = game ? runnerName(game.bases.third, game) : empty;
  const side = game ? getBattingSide(game) : "team";
  const batter = game ? getCurrentBatter(game) : null;
  $("#currentBatterField").textContent = batter ? displayShortBatterName(batter, side, game) : "-";
  $(".base-first").classList.toggle("occupied", Boolean(game?.bases.first));
  $(".base-second").classList.toggle("occupied", Boolean(game?.bases.second));
  $(".base-third").classList.toggle("occupied", Boolean(game?.bases.third));
}

function calculateStats(game) {
  if (!game) return [];
  return calculateStatsForSide(game, "team");
}

function calculateOpponentStats(game) {
  if (!game || game.opponentTrackingMode !== "complete") return [];
  return calculateStatsForSide(game, "opponent");
}

function calculateStatsForSide(game, side) {
  const ids = side === "opponent"
    ? game.opponentLineup.map((batter) => batter.id)
    : (game.lineup.length ? game.lineup : appData.team.players.map((player) => player.id));
  const statsMap = new Map(ids.map((playerId) => [playerId, emptyStat(playerId)]));

  getAtBatList(game, side).forEach((atBat) => {
    if (!statsMap.has(atBat.playerId)) statsMap.set(atBat.playerId, emptyStat(atBat.playerId));
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

function emptyStat(playerId) {
  return {
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
  };
}

function renderStats() {
  const game = getGameForDisplay();
  const stats = calculateStats(game);
  const opponentStats = calculateOpponentStats(game);
  const totals = getStatsTotals(stats);
  $("#statsSummary").innerHTML = stats.length ? `
    <div class="stat-card"><span>Total AB</span><strong>${totals.ab}</strong></div>
    <div class="stat-card"><span>Coups sûrs</span><strong>${totals.hit}</strong></div>
    <div class="stat-card"><span>BB</span><strong>${totals.bb}</strong></div>
    <div class="stat-card"><span>PP</span><strong>${totals.rbi}</strong></div>
    <div class="stat-card"><span>Moyenne équipe</span><strong>${formatAverage(totals.hit, totals.ab)}</strong></div>
  ` : `<div class="empty-state">Aucune statistique disponible. Marquez une partie pour remplir ce tableau.</div>`;

  $("#statsBody").innerHTML = renderStatsRows(stats, "team");
  $("#opponentStatsSection").classList.toggle("hidden", !game || game.opponentTrackingMode !== "complete");
  $("#opponentStatsBody").innerHTML = opponentStats.length ? renderStatsRows(opponentStats, "opponent") : `<tr><td colspan="11">Aucune statistique adverse.</td></tr>`;
}

function renderStatsRows(stats, side) {
  const totals = getStatsTotals(stats);
  const rows = stats.map((stat) => `
    <tr>
      <td>${escapeHtml(statPlayerName(stat.playerId, side))}</td>
      <td>${stat.ab}</td><td>${stat.hit}</td><td>${stat.single}</td><td>${stat.double}</td>
      <td>${stat.triple}</td><td>${stat.hr}</td><td>${stat.bb}</td><td>${stat.rbi}</td>
      <td>${stat.run}</td><td class="avg-cell">${stat.avg}</td>
    </tr>
  `).join("");

  const totalLabel = side === "opponent" ? "Total adversaire" : "Total équipe";
  const totalRow = stats.length ? `
    <tr class="total-row">
      <td>${totalLabel}</td>
      <td>${totals.ab}</td><td>${totals.hit}</td><td>${totals.single}</td><td>${totals.double}</td>
      <td>${totals.triple}</td><td>${totals.hr}</td><td>${totals.bb}</td><td>${totals.rbi}</td>
      <td>${totals.run}</td><td class="avg-cell">${formatAverage(totals.hit, totals.ab)}</td>
    </tr>
  ` : "";

  return stats.length ? `${rows}${totalRow}` : `<tr><td colspan="11">Aucune statistique disponible.</td></tr>`;
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

function renderReport() {
  const game = getGameForDisplay();
  if (!game) {
    $("#reportContent").innerHTML = `<div class="report-section"><p>Aucune partie à afficher.</p></div>`;
    return;
  }

  const opponentComplete = game.opponentTrackingMode === "complete";
  const teamStatsRows = renderStatsRows(calculateStats(game), "team");
  const opponentStatsRows = renderStatsRows(calculateOpponentStats(game), "opponent");

  $("#reportContent").innerHTML = `
    <section class="report-section">
      <h3>${escapeHtml(appData.team.name)} vs ${escapeHtml(game.opponent || "-")}</h3>
      <div class="summary-list">
        ${summaryRows([
          ["Date", game.date || "-"],
          ["Terrain", game.field || "-"],
          ["Local/Visiteur", game.homeAway],
          ["Mode adverse", game.opponentTrackingMode === "complete" ? "Complet" : "Simplifié"],
          ["Alignement", game.lineupMode === "dynamic" ? "Construit pendant la partie" : "Préparé avant la partie"],
          ["Statut alignement", lineupReportStatus(game, "team")],
          ...(opponentComplete ? [["Statut alignement adverse", lineupReportStatus(game, "opponent")]] : []),
          ["Limite de points par manche", runLimitDescription(game)],
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
      <h3>Alignement de notre équipe</h3>
      <ol>${game.lineup.map((id) => `<li>${escapeHtml(runnerName(id, game))}</li>`).join("") || "<li>Aucun alignement.</li>"}</ol>
    </section>
    ${opponentComplete ? `
      <section class="report-section">
        <h3>Alignement adverse</h3>
        <ol>${game.opponentLineup.map((batter) => `<li>${escapeHtml(opponentBatterName(batter, game))}</li>`).join("") || "<li>Aucun alignement adverse.</li>"}</ol>
      </section>
    ` : ""}
    ${renderAtBatsReportSection("Présences au bâton de notre équipe", game.atBats, "team", game)}
    ${opponentComplete ? renderAtBatsReportSection("Présences au bâton adverses", game.opponentAtBats, "opponent", game) : ""}
    <section class="report-section table-wrap">
      <h3>Statistiques de notre équipe</h3>
      ${statsTable(teamStatsRows)}
    </section>
    ${opponentComplete ? `
      <section class="report-section table-wrap">
        <h3>Statistiques adverses</h3>
        ${statsTable(opponentStatsRows)}
      </section>
    ` : ""}
  `;
}

function renderAtBatsReportSection(title, atBats, side, game) {
  return `
    <section class="report-section table-wrap">
      <h3>${title}</h3>
      <table>
        <thead><tr><th>Manche</th><th>Joueur</th><th>Résultat</th><th>Jeu défensif</th><th>AB</th><th>PP</th><th>P</th></tr></thead>
        <tbody>${atBats.length ? atBats.map((atBat) => `
          <tr>
            <td>${atBat.inning} ${escapeHtml(atBat.half)}</td>
            <td>${escapeHtml(side === "opponent" ? opponentRunnerName(atBat.playerId, game) : runnerName(atBat.playerId, game))}</td>
            <td>${escapeHtml(atBat.result)}</td>
            <td>${escapeHtml(atBat.defensePlay?.code || "-")}</td>
            <td>${atBat.ab}</td>
            <td>${atBat.rbi}</td>
            <td>${atBat.run}</td>
          </tr>
        `).join("") : `<tr><td colspan="6">Aucune présence au bâton.</td></tr>`}</tbody>
      </table>
    </section>
  `;
}

function statsTable(rows) {
  return `
    <table>
      <thead><tr><th>Joueur</th><th>AB</th><th>H</th><th>1B</th><th>2B</th><th>3B</th><th>HR</th><th>BB</th><th>PP</th><th>P</th><th>MOY</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

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
    calendar: [],
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
      if (!imported.team || !Array.isArray(imported.games)) throw new Error("Format invalide");
      if (!confirm("Importer ces données et remplacer la sauvegarde actuelle?")) return;
      appData = {
        team: {
          name: imported.team.name || "Mon équipe",
          players: Array.isArray(imported.team.players) ? imported.team.players : []
        },
        games: imported.games,
        calendar: Array.isArray(imported.calendar) ? imported.calendar : [],
        currentGameId: imported.currentGameId || null
      };
      migrateData();
      saveData();
      renderAll();
      showToast("Données importées.", "success");
    } catch (error) {
      showToast("Le fichier JSON n'est pas valide.", "error");
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

function renderAll() {
  renderHeader();
  renderHome();
  renderPlayers();
  renderCalendar();
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

function renderHomeLegacy() {
  const game = getCurrentGame();
  if ($("#currentGameHomeText")) {
    $("#currentGameHomeText").textContent = game
      ? `${game.opponent || "Adversaire"} · ${game.date || "-"} · ${game.status}`
      : "Aucune partie active. Allez au calendrier pour créer une partie.";
  }
  if ($("#homeLineupBtn")) $("#homeLineupBtn").disabled = !game;
  if ($("#continueGameBtn")) {
    $("#continueGameBtn").textContent = game ? "Ouvrir le match" : "Aller au calendrier";
  }
  $("#homeSummary").innerHTML = summaryRows([
    ["Équipe", appData.team.name],
    ["Joueurs", appData.team.players.length],
    ["Matchs calendrier", appData.calendar.length],
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

function renderHomeScreen() {
  const record = calculateTeamRecord();
  const upcoming = getUpcomingCalendarEvents(5);

  $("#homeTopGrid").innerHTML = `
    <article class="home-card dashboard-card">
      <h3>Fiche de l'équipe</h3>
      <div class="record-grid">
        ${recordStat("Victoires", record.wins)}
        ${recordStat("Défaites", record.losses)}
        ${recordStat("Nuls", record.ties)}
        ${recordStat("Matchs joués", record.gamesPlayed)}
        ${recordStat("Pourcentage", record.winPercentage)}
      </div>
    </article>
    ${getCurrentGameSummary()}
    <article class="home-card dashboard-card">
      <h3>Résumé rapide</h3>
      <div class="score-summary compact-summary">
        ${summaryRows([
          ["Joueurs", appData.team.players.length],
          ["Parties sauvegardées", appData.games.length],
          ["Matchs calendrier", appData.calendar.length]
        ])}
      </div>
    </article>
  `;

  $("#homeUpcoming").innerHTML = `
    <article class="home-card dashboard-card wide-dashboard-card">
      <div class="card-title-row">
        <h3>5 prochains matchs</h3>
        <button class="small-btn primary-btn" onclick="openCalendar()">Ouvrir le calendrier</button>
      </div>
      <div class="upcoming-list">
        ${upcoming.length ? upcoming.map(renderUpcomingEvent).join("") : `<div class="empty-state">Aucun match à venir. Ajoutez un match dans le calendrier.</div>`}
      </div>
    </article>
  `;

  $("#homeQuickActions").innerHTML = `
    <button class="primary-btn" onclick="openCalendar()">Calendrier</button>
    <button onclick="showScreen('players')">Joueurs</button>
    <button onclick="showScreen('stats')">Stats</button>
    <button onclick="openReportForCurrentGame()">Rapport</button>
  `;
}

function renderHome() {
  renderHomeScreen();
}

function recordStat(label, value) {
  return `<div class="record-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

function calculateTeamRecord() {
  const completed = appData.games.filter((game) => normalizeGameStatus(game.status) === "completed");
  const totals = completed.reduce((record, game) => {
    const team = Number(game.scoreTeam || 0);
    const opponent = Number(game.scoreOpponent || 0);
    if (team > opponent) record.wins += 1;
    else if (team < opponent) record.losses += 1;
    else record.ties += 1;
    return record;
  }, { wins: 0, losses: 0, ties: 0 });
  const gamesPlayed = totals.wins + totals.losses + totals.ties;
  const decisions = totals.wins + totals.losses;
  return {
    ...totals,
    gamesPlayed,
    winPercentage: decisions ? formatWinningPercentage(totals.wins / decisions) : ".000"
  };
}

function formatWinningPercentage(value) {
  if (value >= 1) return "1.000";
  return value.toFixed(3).replace(/^0/, "");
}

function getUpcomingCalendarEvents(limit = 5) {
  const today = new Date().toISOString().slice(0, 10);
  return getSortedCalendarEvents()
    .filter((event) => {
      const status = normalizeGameStatus(event.status);
      return (event.date || "") >= today && status !== "cancelled" && status !== "completed";
    })
    .slice(0, limit);
}

function getCurrentGameSummary() {
  const game = getCurrentGame();
  if (game && normalizeGameStatus(game.status) !== "completed") {
    const status = normalizeGameStatus(game.status);
    const detail = status === "in_progress"
      ? `Manche ${game.currentInning} ${game.half} · ${appData.team.name} ${game.scoreTeam} - ${game.scoreOpponent} ${game.opponent || "Adversaire"}`
      : `${formatDate(game.date)} · ${game.status}`;
    const actions = status === "in_progress"
      ? `<button class="primary-btn" onclick="showScreen('live')">Ouvrir le match</button>`
      : `<button onclick="openLineupForCurrentGame()">Préparer l'alignement</button><button class="primary-btn" onclick="showScreen('live')">Voir l'état match</button>`;
    return `
      <article class="home-card dashboard-card">
        <h3>Partie actuelle</h3>
        <p>${escapeHtml(game.opponent || "Adversaire")}</p>
        <p class="home-detail">${escapeHtml(detail)}</p>
        <div class="home-card-actions">${actions}</div>
      </article>
    `;
  }

  const lastCompleted = [...appData.games].reverse().find((game) => normalizeGameStatus(game.status) === "completed");
  if (lastCompleted) {
    return `
      <article class="home-card dashboard-card">
        <h3>Dernière partie terminée</h3>
        <p>${escapeHtml(appData.team.name)} ${lastCompleted.scoreTeam} - ${lastCompleted.scoreOpponent} ${escapeHtml(lastCompleted.opponent || "Adversaire")}</p>
        <div class="home-card-actions">
          <button class="primary-btn" onclick="openReportForGame('${lastCompleted.id}')">Voir rapport</button>
        </div>
      </article>
    `;
  }

  return `
    <article class="home-card dashboard-card">
      <h3>Partie actuelle</h3>
      <p>Aucune partie active.</p>
      <div class="home-card-actions">
        <button class="primary-btn" onclick="openCalendar()">Aller au calendrier</button>
      </div>
    </article>
  `;
}

function renderUpcomingEvent(event) {
  const linkedGame = event.linkedGameId ? appData.games.find((game) => game.id === event.linkedGameId) : null;
  const action = !linkedGame
    ? `<button class="small-btn primary-btn" onclick="createGameFromCalendarEvent('${event.id}')">Créer partie</button>`
    : canOpenLiveMatch(linkedGame)
      ? `<button class="small-btn primary-btn" onclick="openLinkedGameMatch('${linkedGame.id}')">Ouvrir match</button>`
      : `<button class="small-btn secondary-btn" onclick="openLinkedGameLineup('${linkedGame.id}')">Préparer alignement</button>`;
  return `
    <div class="upcoming-item">
      <div>
        <strong>${escapeHtml(formatDate(event.date))}${event.time ? ` · ${escapeHtml(event.time)}` : ""} · ${escapeHtml(event.opponent || "Adversaire")}</strong>
        <div class="player-meta">
          <span class="mini-badge">${escapeHtml(event.homeAway || "local")}</span>
          <span class="mini-badge">${escapeHtml(event.gameType || "Saison")}</span>
          <span>${escapeHtml(event.field || "Terrain à confirmer")}</span>
        </div>
      </div>
      <div class="row-actions">${action}</div>
    </div>
  `;
}

function renderSpectatorMode(publicGameId) {
  document.querySelector(".app-header")?.classList.add("hidden");
  document.querySelector("main")?.classList.add("hidden");
  const root = $("#spectatorRoot");
  root.classList.remove("hidden");
  root.innerHTML = `
    <div class="spectator-shell">
      <div class="spectator-card">
        <p class="eyebrow">Baseball ScorePad</p>
        <h1>Match en direct</h1>
        <p id="spectatorConnection">Connexion au live...</p>
      </div>
      <div id="spectatorContent" class="spectator-grid"></div>
    </div>
  `;
  loadSpectatorGame(publicGameId);
  subscribeSpectatorGame(publicGameId);
}

async function loadSpectatorGame(publicGameId) {
  if (!supabaseClient) {
    $("#spectatorConnection").textContent = "Supabase n'est pas disponible.";
    return;
  }
  try {
    const [{ data: game, error: gameError }, { data: events, error: eventsError }] = await Promise.all([
      supabaseClient.from("live_games").select("*").eq("public_game_id", publicGameId).maybeSingle(),
      supabaseClient.from("play_by_play").select("*").eq("public_game_id", publicGameId).order("created_at", { ascending: false }).limit(50)
    ]);
    if (gameError) throw gameError;
    if (eventsError) throw eventsError;
    spectatorGameState = game;
    spectatorPlayByPlay = events || [];
    $("#spectatorConnection").textContent = game ? "Connecté au live" : "Aucun match live trouvé.";
    renderSpectatorContent();
    if (spectatorPlayByPlay[0]) window.setTimeout(() => playGameAnimation(getSpectatorAnimation(spectatorPlayByPlay[0]), "#spectatorAnimationLayer"), 50);
  } catch (error) {
    console.warn("Spectator load failed", error);
    $("#spectatorConnection").textContent = "Impossible de charger le match live.";
  }
}

function subscribeSpectatorGame(publicGameId) {
  if (!supabaseClient) return;
  spectatorSubscriptions.forEach((channel) => supabaseClient.removeChannel(channel));
  spectatorSubscriptions = [
    supabaseClient.channel(`live-game-${publicGameId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_games", filter: `public_game_id=eq.${publicGameId}` }, (payload) => {
        spectatorGameState = payload.new;
        $("#spectatorConnection").textContent = "Mis à jour en direct";
        renderSpectatorContent();
      })
      .subscribe(),
    supabaseClient.channel(`play-by-play-${publicGameId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "play_by_play", filter: `public_game_id=eq.${publicGameId}` }, (payload) => {
        spectatorPlayByPlay = [payload.new, ...spectatorPlayByPlay].slice(0, 50);
        renderSpectatorContent();
        window.setTimeout(() => playGameAnimation(getSpectatorAnimation(payload.new), "#spectatorAnimationLayer"), 50);
      })
      .subscribe()
  ];
}

function renderSpectatorContent() {
  const container = $("#spectatorContent");
  if (!container) return;
  if (!spectatorGameState) {
    container.innerHTML = `<div class="spectator-card"><p>Aucune donnée live pour le moment.</p></div>`;
    return;
  }
  const bases = spectatorGameState.bases || {};
  container.innerHTML = `
    <section class="spectator-card spectator-score">
      <div><span>${escapeHtml(spectatorGameState.team_name || "Notre équipe")}</span><strong>${spectatorGameState.score_team || 0}</strong></div>
      <div><span>${escapeHtml(spectatorGameState.opponent_name || "Adversaire")}</span><strong>${spectatorGameState.score_opponent || 0}</strong></div>
    </section>
    <section class="spectator-card">
      <h2>Situation</h2>
      <div class="score-summary compact-summary">
        ${summaryRows([
          ["Manche", `${spectatorGameState.current_inning || 1} - ${spectatorGameState.half || "-"}`],
          ["Retraits", spectatorGameState.outs || 0],
          ["Frappeur", spectatorGameState.current_batter || "-"],
          ["Coureurs", spectatorBasesText(bases)]
        ])}
      </div>
      <h3>Dernière action</h3>
      <p>${escapeHtml(spectatorGameState.last_action || "-")}</p>
    </section>
    <section class="spectator-card spectator-feed">
      <h2>Play-by-play</h2>
      ${spectatorPlayByPlay.length ? spectatorPlayByPlay.map((event) => `
        <div class="feed-item">
          <strong>${escapeHtml(event.half || "")} ${escapeHtml(String(event.inning || ""))}e</strong>
          <span>${escapeHtml(event.description || event.result || "-")}</span>
        </div>
      `).join("") : `<p>Aucun événement publié.</p>`}
    </section>
  `;
}

function renderSpectatorContent() {
  const container = $("#spectatorContent");
  if (!container) return;
  if (!spectatorGameState) {
    container.innerHTML = `<div class="spectator-card"><p>Aucune donnée live pour le moment.</p></div>`;
    return;
  }
  container.innerHTML = `
    ${renderSpectatorAnimatedField(spectatorGameState)}
    ${renderInningScoreboard(spectatorGameState)}
    ${renderSpectatorPlayByPlay(spectatorPlayByPlay)}
  `;
}

function renderSpectatorScoreboard(liveGame) {
  const team = liveGame.team_name || "Notre équipe";
  const opponent = liveGame.opponent_name || "Adversaire";
  const battingTeam = liveGame.batting_side === "opponent" ? opponent : team;
  return `
    <section class="virtual-scoreboard">
      <div class="scoreboard-title">Virtual Scoreboard</div>
      <div class="scoreboard-teams">
        <div><span>${escapeHtml(team)}</span><strong>${liveGame.score_team ?? 0}</strong></div>
        <div><span>${escapeHtml(opponent)}</span><strong>${liveGame.score_opponent ?? 0}</strong></div>
      </div>
      <div class="scoreboard-meta">
        <span>${escapeHtml(liveGame.half || "—")} de la ${escapeHtml(String(liveGame.current_inning || "—"))}e manche</span>
        <span>${renderOutsIndicator(liveGame.outs || 0)}</span>
        <span>Au bâton : ${escapeHtml(battingTeam)}</span>
        <span>Frappeur : ${escapeHtml(liveGame.current_batter || "—")}</span>
        <span>Statut : ${escapeHtml(liveGame.status || "—")}</span>
      </div>
      ${renderBaseDiamond(liveGame.bases || {})}
      <div class="scoreboard-last-action">${escapeHtml(liveGame.last_action || "Aucune action récente")}</div>
    </section>
  `;
}

function renderBaseDiamond(bases = {}) {
  return `
    <div class="scoreboard-bases" aria-label="Bases occupées">
      <span class="score-base second ${bases.second ? "occupied" : ""}">2B</span>
      <span class="score-base third ${bases.third ? "occupied" : ""}">3B</span>
      <span class="score-base first ${bases.first ? "occupied" : ""}">1B</span>
    </div>
  `;
}

function renderInningScoreboard(liveGame) {
  const scores = Array.isArray(liveGame.inning_scores) ? liveGame.inning_scores : [];
  if (!scores.length) {
    return `
      <section class="spectator-card table-wrap">
        <h2>Score par manche</h2>
        <p>Total : ${escapeHtml(liveGame.team_name || "Notre équipe")} ${liveGame.score_team || 0} - ${liveGame.score_opponent || 0} ${escapeHtml(liveGame.opponent_name || "Adversaire")}</p>
      </section>
    `;
  }
  return `
    <section class="spectator-card table-wrap">
      <h2>Score par manche</h2>
      <table class="inning-scoreboard">
        <thead><tr><th>Équipe</th>${scores.map((row) => `<th>${row.inning}</th>`).join("")}<th>Total</th></tr></thead>
        <tbody>
          <tr><td>${escapeHtml(liveGame.team_name || "Notre équipe")}</td>${scores.map((row) => `<td>${row.team || 0}</td>`).join("")}<td>${liveGame.score_team || 0}</td></tr>
          <tr><td>${escapeHtml(liveGame.opponent_name || "Adversaire")}</td>${scores.map((row) => `<td>${row.opponent || 0}</td>`).join("")}<td>${liveGame.score_opponent || 0}</td></tr>
        </tbody>
      </table>
    </section>
  `;
}

function renderOutsIndicator(outs = 0) {
  return `<span class="scoreboard-outs">${[0, 1, 2].map((index) => `<i class="${index < Number(outs) ? "active" : ""}"></i>`).join("")}</span>`;
}

function renderSpectatorAnimatedField(liveGame) {
  return `
    <section class="spectator-card spectator-field-card">
      <div class="card-title-row">
        <h2>Terrain animé</h2>
        <span class="mini-badge">${escapeHtml(spectatorBasesText(liveGame.bases || {}))}</span>
      </div>
      <div class="spectator-diamond">
        <div class="infield"></div>
        <div class="field-static-layer">
          <div class="field-foul-line first-line"></div>
          <div class="field-foul-line third-line"></div>
          <div class="field-mound"><span></span></div>
          <div class="home-plate-shape"></div>
          <div class="batters-box left-box"></div>
          <div class="batters-box right-box"></div>
          <div class="base-path path-home-first"></div>
          <div class="base-path path-first-second"></div>
          <div class="base-path path-second-third"></div>
          <div class="base-path path-third-home"></div>
          <div class="field-positions-layer">${renderFieldPositions()}</div>
        </div>
        <div id="spectatorAnimationLayer" class="field-animation-layer"></div>
        ${renderEmbeddedMiniScoreboard(liveGame)}
        <div class="base base-second ${liveGame.bases?.second ? "occupied" : ""}"><strong>2B</strong><span>${escapeHtml(liveGame.bases?.second || "Vide")}</span></div>
        <div class="base base-third ${liveGame.bases?.third ? "occupied" : ""}"><strong>3B</strong><span>${escapeHtml(liveGame.bases?.third || "Vide")}</span></div>
        <div class="base base-first ${liveGame.bases?.first ? "occupied" : ""}"><strong>1B</strong><span>${escapeHtml(liveGame.bases?.first || "Vide")}</span></div>
        <div class="base base-home"><strong>Marbre</strong><span>${escapeHtml(liveGame.current_batter || "—")}</span></div>
      </div>
    </section>
  `;
}

function renderSpectatorAnimatedField(liveGame) {
  return `
    <section class="spectator-card spectator-field-card spectator-field-redesign">
      <div class="card-title-row">
        <h2>Terrain animé</h2>
        <span class="mini-badge">${escapeHtml(spectatorBasesText(liveGame.bases || {}))}</span>
      </div>
      <div class="spectator-svg-field-wrap">
        ${renderSpectatorFieldSvg(liveGame)}
        <div id="spectatorAnimationLayer" class="field-animation-layer"></div>
        ${renderEmbeddedMiniScoreboard(liveGame)}
      </div>
    </section>
  `;
}

function renderSpectatorFieldSvg(liveGame) {
  const bases = normalizeBasesData(liveGame.bases || {});
  return `
    <svg class="spectator-field-svg" viewBox="0 0 1000 720" role="img" aria-label="Terrain de baseball en direct">
      <defs>
        <linearGradient id="spectatorGrass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#287348"></stop>
          <stop offset="52%" stop-color="#4f9a55"></stop>
          <stop offset="100%" stop-color="#75b865"></stop>
        </linearGradient>
        <pattern id="spectatorMowPattern" width="74" height="74" patternUnits="userSpaceOnUse" patternTransform="rotate(22)">
          <rect width="37" height="74" fill="#ffffff" opacity="0.055"></rect>
          <rect x="37" width="37" height="74" fill="#000000" opacity="0.045"></rect>
        </pattern>
        <filter id="spectatorSoftShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#0f1f2b" flood-opacity="0.24"></feDropShadow>
        </filter>
      </defs>
      <g class="field-base-layer">
        <rect width="1000" height="720" rx="28" fill="url(#spectatorGrass)"></rect>
        <rect width="1000" height="720" rx="28" fill="url(#spectatorMowPattern)" opacity="0.75"></rect>
        <path d="M86 108 Q500 -24 914 108" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="8"></path>
        <path d="M500 650 L766 410 L500 214 L234 410 Z" fill="#c58650" stroke="#8f5a34" stroke-width="8" filter="url(#spectatorSoftShadow)"></path>
        <path d="M500 650 L766 410 M766 410 L500 214 M500 214 L234 410 M234 410 L500 650" stroke="#efd0aa" stroke-width="18" stroke-linecap="round" opacity="0.82"></path>
        <path d="M500 650 L940 240" stroke="#f8fafc" stroke-width="5" opacity="0.9"></path>
        <path d="M500 650 L60 240" stroke="#f8fafc" stroke-width="5" opacity="0.9"></path>
        <path d="M250 390 Q500 292 750 390" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="5"></path>
        <ellipse cx="500" cy="490" rx="70" ry="45" fill="#b87542" stroke="#8f5a34" stroke-width="5" filter="url(#spectatorSoftShadow)"></ellipse>
        <rect x="474" y="486" width="52" height="10" rx="5" fill="#f8fafc"></rect>
        <polygon points="500,650 522,636 522,610 478,610 478,636" fill="#f8fafc" stroke="#cbd5e1" stroke-width="3"></polygon>
        <rect x="428" y="595" width="44" height="88" rx="5" fill="none" stroke="#f8fafc" stroke-width="4" opacity="0.8"></rect>
        <rect x="528" y="595" width="44" height="88" rx="5" fill="none" stroke="#f8fafc" stroke-width="4" opacity="0.8"></rect>
        <rect x="748" y="392" width="32" height="32" transform="rotate(45 764 408)" fill="#f8fafc" stroke="#cbd5e1" stroke-width="3"></rect>
        <rect x="484" y="196" width="32" height="32" transform="rotate(45 500 212)" fill="#f8fafc" stroke="#cbd5e1" stroke-width="3"></rect>
        <rect x="220" y="392" width="32" height="32" transform="rotate(45 236 408)" fill="#f8fafc" stroke="#cbd5e1" stroke-width="3"></rect>
      </g>
      ${renderDefensivePositions()}
      ${renderBaseRunners(bases)}
    </svg>
  `;
}

function renderDefensivePositions() {
  const positions = [
    ["P", 500, 490],
    ["C", 500, 684],
    ["1B", 818, 390],
    ["2B", 612, 310],
    ["3B", 182, 390],
    ["SS", 388, 310],
    ["LF", 250, 150],
    ["CF", 500, 94],
    ["RF", 750, 150]
  ];
  return `
    <g class="defensive-positions-layer">
      ${positions.map(([label, x, y]) => `
        <g class="svg-defense-marker" transform="translate(${x} ${y})">
          <circle r="28"></circle>
          <text text-anchor="middle" dominant-baseline="central">${label}</text>
        </g>
      `).join("")}
    </g>
  `;
}

function renderBaseRunners(bases) {
  const basePoints = [
    ["home", 500, 650, "H", null],
    ["first", 830, 430, "1B", bases.first],
    ["second", 500, 172, "2B", bases.second],
    ["third", 170, 430, "3B", bases.third]
  ];
  return `
    <g class="runner-layer">
      ${basePoints.map(([key, x, y, label, runner]) => {
        const number = getRunnerNumber(runner);
        return `
          <g class="svg-runner-base ${number ? "occupied" : ""}" data-base="${key}" transform="translate(${x} ${y})">
            <circle r="25"></circle>
            <text text-anchor="middle" dominant-baseline="central">${escapeHtml(number || label)}</text>
          </g>
        `;
      }).join("")}
    </g>
  `;
}

function normalizeBasesData(bases = {}) {
  return {
    first: bases.first || null,
    second: bases.second || null,
    third: bases.third || null
  };
}

function getRunnerNumber(baseValue) {
  if (!baseValue) return null;
  if (typeof baseValue === "object") {
    return baseValue.number || getRunnerNumber(baseValue.label || baseValue.name || baseValue.value);
  }
  const text = String(baseValue).trim();
  if (!text || text.toLowerCase() === "vide" || text === "—" || text === "â€”") return null;
  const number = text.match(/#?(\d{1,3})/)?.[1];
  return number || text.slice(0, 3).toUpperCase();
}

function renderEmbeddedMiniScoreboard(liveGame) {
  const team = liveGame.team_name || "Notre équipe";
  const opponent = liveGame.opponent_name || "Adversaire";
  const batter = liveGame.current_batter || "—";
  const lastAction = liveGame.last_action || "Aucune action";
  return `
    <aside class="mini-broadcast-scoreboard" aria-label="Tableau de pointage compact">
      <div class="mini-score-teams">
        <span>${escapeHtml(getTeamShortName(team))}</span><strong>${liveGame.score_team ?? 0}</strong>
        <span>${escapeHtml(getTeamShortName(opponent))}</span><strong>${liveGame.score_opponent ?? 0}</strong>
      </div>
      <div class="mini-score-state">
        <span>${escapeHtml(liveGame.half || "—")} ${escapeHtml(String(liveGame.current_inning || "—"))}e</span>
        ${renderCompactOutsIndicator(liveGame.outs || 0)}
      </div>
      ${renderCompactBaseDiamond(liveGame.bases || {})}
      <div class="mini-score-detail">Batteur : ${escapeHtml(batter)}</div>
      <div class="mini-score-last">Dernière : ${escapeHtml(shortenText(lastAction, 34))}</div>
    </aside>
  `;
}

function getTeamShortName(name) {
  const clean = String(name || "—").trim();
  if (!clean) return "—";
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return words.map((word) => word[0]).join("").slice(0, 3).toUpperCase();
  return clean.slice(0, 3).toUpperCase();
}

function renderCompactBaseDiamond(bases = {}) {
  return `
    <div class="mini-bases" aria-label="Bases occupées">
      <span class="mini-base second ${bases.second ? "occupied" : ""}"></span>
      <span class="mini-base third ${bases.third ? "occupied" : ""}"></span>
      <span class="mini-base first ${bases.first ? "occupied" : ""}"></span>
    </div>
  `;
}

function renderCompactOutsIndicator(outs = 0) {
  return `<span class="mini-outs">${[0, 1, 2].map((index) => `<i class="${index < Number(outs) ? "active" : ""}"></i>`).join("")}</span>`;
}

function shortenText(value, maxLength = 34) {
  const text = String(value || "");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function renderSpectatorPlayByPlay(events = []) {
  return `
    <section class="spectator-card spectator-feed">
      <h2>Play-by-play</h2>
      ${events.length ? events.map((event, index) => `
        <div class="feed-item ${index === 0 ? "latest" : ""}">
          <strong>${escapeHtml(event.half || "")} ${escapeHtml(String(event.inning || ""))}e</strong>
          <span>${escapeHtml(event.description || event.result || "-")}</span>
        </div>
      `).join("") : `<p>Aucun événement publié.</p>`}
    </section>
  `;
}

function getSpectatorAnimation(event) {
  if (event?.animation && Object.keys(event.animation).length) return event.animation;
  return buildPlayAnimation({
    result: event?.result || "",
    defensePlay: event?.defense_play || "",
    batter: event?.batter || "",
    description: event?.description || ""
  });
}

function spectatorBasesText(bases) {
  const occupied = [
    bases.first && "1B",
    bases.second && "2B",
    bases.third && "3B"
  ].filter(Boolean);
  return occupied.length ? occupied.join(" et ") : "Aucun";
}

function findPlayer(playerId) {
  return appData.team.players.find((player) => player.id === playerId) || null;
}

function findOpponentBatter(game, batterId) {
  return game?.opponentLineup.find((batter) => batter.id === batterId) || null;
}

function formatPlayer(player) {
  const number = player.number ? `#${player.number} ` : "";
  const name = `${player.firstName || ""} ${player.lastName || ""}`.trim();
  return `${number}${name || "Joueur sans nom"}`.trim();
}

function shortPlayerName(player) {
  const initial = player.firstName ? `${player.firstName.charAt(0)}. ` : "";
  return `${initial}${player.lastName || player.firstName || `#${player.number}` || ""}`.trim();
}

function opponentBatterName(batter, game = getGameForDisplay()) {
  if (!batter) return "Adversaire";
  return formatOpponentPlayerLabel(getOpponentPlayerNumber(batter), game);
}

function displayBatterName(batter, side, game = getGameForDisplay()) {
  return side === "opponent" ? opponentBatterName(batter, game) : formatPlayer(batter);
}

function displayShortBatterName(batter, side, game = getGameForDisplay()) {
  return side === "opponent" ? opponentBatterName(batter, game) : shortPlayerName(batter);
}

function runnerName(playerId, game = getCurrentGame()) {
  if (!playerId) return "Vide";
  const player = findPlayer(playerId);
  if (player) return shortPlayerName(player);
  return opponentRunnerName(playerId, game);
}

function opponentRunnerName(playerId, game = getCurrentGame()) {
  const batter = findOpponentBatter(game, playerId);
  return batter ? opponentBatterName(batter, game) : "Vide";
}

function statPlayerName(playerId, side) {
  const game = getGameForDisplay();
  if (side === "opponent") {
    return opponentBatterName(findOpponentBatter(game, playerId), game);
  }
  const player = findPlayer(playerId);
  return player ? formatPlayer(player) : "Joueur supprimé";
}

function formatPosition(position) {
  return position || "Non attitrée";
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

function formatDate(value) {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
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
