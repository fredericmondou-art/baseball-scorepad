const STORAGE_KEY = "baseballScorepadData";
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

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

document.addEventListener("DOMContentLoaded", initApp);

function initApp() {
  loadData();
  setupNavigation();
  setupForms();
  setupLiveActions();
  setupDefensiveOutModal();
  setupAddBatterModal();
  setupSegmentedGameForm();
  renderRunLimitSettings();
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
    const game = getCurrentGame();
    if (!game) return showToast("Aucune partie en cours.");
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
  $("#finishGameBtn").addEventListener("click", finishGame);
  $("#oppPlusBtn").addEventListener("click", () => adjustOpponentScore(1));
  $("#oppMinusBtn").addEventListener("click", () => adjustOpponentScore(-1));
  $("#printBtn").addEventListener("click", () => window.print());
  $("#resetDataBtn").addEventListener("click", resetAllData);
  $("#exportDataBtn").addEventListener("click", exportData);
  $("#importDataInput").addEventListener("change", importData);
  $("#runLimitEnabled").addEventListener("change", renderRunLimitSettings);
  $("#opponentTrackingMode").addEventListener("change", renderLineupModeSettings);
}

function setupLiveActions() {
  $$(".action-grid [data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.action === "out") {
        openDefensiveOutModal();
        return;
      }
      recordAtBat(button.dataset.action);
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
  $("#useExistingBatterBtn").addEventListener("click", addTeamBatterDuringGame);
  $("#quickAddTeamBatterBtn").addEventListener("click", addTeamBatterDuringGame);
  $("#addOpponentDuringGameBtn").addEventListener("click", addOpponentBatterDuringGame);
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
    homeAway: game.homeAway || "local",
    innings,
    linkedGameId: game.linkedGameId || null,
    lineup: Array.isArray(game.lineup) ? game.lineup : [],
    opponentLineup: Array.isArray(game.opponentLineup) ? game.opponentLineup : [],
    atBats: normalizeAtBats(game.atBats),
    opponentAtBats: normalizeAtBats(game.opponentAtBats),
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
    runLimitEnabled: migratedRunLimit.runLimitEnabled,
    runLimitPerInning: migratedRunLimit.runLimitPerInning,
    runLimitAppliesToLastInning: migratedRunLimit.runLimitAppliesToLastInning,
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
    notes: $("#calendarNotes").value.trim()
  };

  if (!payload.date || !payload.opponent) {
    return showToast("La date et l'adversaire sont obligatoires.", "warning");
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
  const upcoming = events.filter((event) => event.status === "À venir");
  const played = events.filter((event) => event.status === "Joué");
  const cancelled = events.filter((event) => event.status === "Annulé");
  const next = upcoming[0];

  $("#calendarSummary").innerHTML = `
    <div class="stat-card"><span>Matchs à venir</span><strong>${upcoming.length}</strong></div>
    <div class="stat-card"><span>Matchs joués</span><strong>${played.length}</strong></div>
    <div class="stat-card"><span>Matchs annulés</span><strong>${cancelled.length}</strong></div>
    <div class="stat-card wide-stat"><span>Prochain match</span><strong>${next ? `${formatDate(next.date)} ${next.time || ""} vs ${next.opponent}` : "Aucun"}</strong></div>
  `;

  $("#calendarCount").textContent = `${events.length} match${events.length > 1 ? "s" : ""}`;
  $("#calendarList").innerHTML = events.length ? events.map((event) => `
    <div class="calendar-item ${event.status === "Joué" ? "played" : ""} ${event.status === "Annulé" ? "cancelled" : ""}">
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
        <button class="small-btn primary-btn" onclick="createGameFromCalendarEvent('${event.id}')">${event.linkedGameId ? "Ouvrir partie" : "Créer partie"}</button>
      </div>
    </div>
  `).join("") : `<div class="empty-state">Aucun match prévu. Ajoutez le premier événement du calendrier.</div>`;
}

function getSortedCalendarEvents() {
  return [...appData.calendar].sort((a, b) => `${a.date || "9999"} ${a.time || ""}`.localeCompare(`${b.date || "9999"} ${b.time || ""}`));
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
    opponent: event.opponent,
    field: event.field,
    homeAway: event.homeAway,
    innings: DEFAULT_INNINGS,
    linkedGameId: event.id,
    opponentTrackingMode: "simple",
    lineupMode: "prepared",
    opponentLineupMode: "dynamic",
    runLimitEnabled: false,
    runLimitPerInning: null,
    runLimitAppliesToLastInning: true,
    status: "brouillon"
  });

  appData.games.push(game);
  appData.currentGameId = game.id;
  event.linkedGameId = game.id;
  saveData();
  showScreen("lineup");
  showToast("Partie créée depuis le calendrier.", "success");
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

function buildGame({ date, opponent, field, homeAway, innings, opponentTrackingMode, lineupMode = "prepared", opponentLineupMode = "dynamic", runLimitEnabled = false, runLimitPerInning = null, runLimitAppliesToLastInning = true, status, linkedGameId }) {
  return normalizeGame({
    id: createId("game"),
    date,
    opponent,
    field,
    homeAway,
    innings,
    linkedGameId,
    lineup: [],
    opponentLineup: [],
    atBats: [],
    opponentAtBats: [],
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
    runLimitEnabled,
    runLimitPerInning,
    runLimitAppliesToLastInning,
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

  game.opponentLineup.push({
    id: createId("opp"),
    number,
    label: `Adversaire #${number}`
  });
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
        <div class="player-main">${escapeHtml(opponentBatterName(batter))}</div>
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
    if (game.currentOpponentBatterIndex >= game.opponentLineup.length) game.currentOpponentBatterIndex = 0;
    return game.opponentLineup[game.currentOpponentBatterIndex] || null;
  }
  if (game.currentBatterIndex >= game.lineup.length) game.currentBatterIndex = 0;
  return findPlayer(game.lineup[game.currentBatterIndex]) || null;
}

function getNextBatter(game) {
  const side = getBattingSide(game);
  if (side === "opponent") {
    if (!game.opponentLineup.length) return null;
    return game.opponentLineup[(game.currentOpponentBatterIndex + 1) % game.opponentLineup.length];
  }
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
  $("#addBatterSideLabel").textContent = side === "opponent" ? "Adversaire au bâton" : "Notre équipe au bâton";
  $("#teamBatterPanel").classList.toggle("hidden", side === "opponent");
  $("#opponentBatterPanel").classList.toggle("hidden", side !== "opponent");
  renderExistingBatterOptions();
  $("#quickBatterNumber").value = "";
  $("#quickBatterFirstName").value = "";
  $("#quickBatterLastName").value = "";
  $("#quickBatterPosition").value = "";
  $("#dynamicOpponentNumber").value = "";
  $("#addBatterModal").classList.remove("hidden");
}

function closeAddBatterModal() {
  $("#addBatterModal").classList.add("hidden");
}

function renderExistingBatterOptions() {
  const game = getCurrentGame();
  const currentIds = new Set(game?.lineup || []);
  const players = appData.team.players.filter((player) => player.active !== false);
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
  const batter = {
    id: createId("opp"),
    number,
    label: `Adversaire #${number}`
  };
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

function openDefensiveOutModal() {
  const game = getCurrentGame();
  if (game && !ensureCurrentBatter(game)) return;
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

  recordAtBat("out", play);
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

function recordAtBat(action, defensePlay = null) {
  const game = getCurrentGame();
  if (game && !ensureCurrentBatter(game)) return;
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
  getAtBatList(game, side).push(atBat);
  nextBatter(game, side);
  updateCurrentGame(game);
  renderAll();
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
  updateCurrentGame(game);
  renderAll();
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
  updateCurrentGame(game);
  renderAll();
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
  updateCurrentGame(game);
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
  if (!game) {
    $("#liveScoreboard").innerHTML = `<div class="empty-state">Aucune partie créée.</div>`;
    $("#liveInfo").innerHTML = `<div class="empty-state">Créez une partie et un alignement pour afficher le match en direct.</div>`;
    $("#outsDots").innerHTML = renderOutDots(0);
    renderBases(null);
    return;
  }

  game.currentBattingSide = getBattingSide(game);
  const battingSide = game.currentBattingSide;
  const batter = getCurrentBatter(game);
  const next = getNextBatter(game);
  const lastAction = getLastActionLabel(game);
  const battingLabel = battingSide === "team" ? "Notre équipe au bâton" : "Adversaire au bâton";
  const modeLabel = game.opponentTrackingMode === "complete" ? "Mode complet" : "Mode simplifié";

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
    ["Manche", `${game.currentInning}`],
    ["Demi", game.half],
    ["Retraits", `${game.outs} / 3`],
    ["Limite", runLimitDescription(game)],
    ["Points cette demi-manche", game.runLimitEnabled && game.runLimitPerInning ? `${getCurrentHalfInningRuns(game)} / ${game.runLimitPerInning}` : `${getCurrentHalfInningRuns(game)}`],
    ["Frappeur actuel", batter ? displayBatterName(batter, battingSide) : "-"],
    ["Prochain frappeur", next ? displayBatterName(next, battingSide) : "-"],
    ["Dernière action", lastAction],
    ["Statut", game.status]
  ]);

  $("#oppPlusBtn").disabled = !(battingSide === "opponent" || game.opponentTrackingMode === "simple");
  $("#oppMinusBtn").disabled = false;
  $$(".hit-actions button").forEach((button) => {
    button.disabled = battingSide === "opponent" && game.opponentTrackingMode === "simple";
  });

  $("#outsDots").innerHTML = renderOutDots(game.outs);
  renderBases(game);
}

function getLastActionLabel(game) {
  const lastTeamAtBat = game.atBats[game.atBats.length - 1] || null;
  const lastOpponentAtBat = game.opponentAtBats[game.opponentAtBats.length - 1] || null;
  const last = [lastTeamAtBat, lastOpponentAtBat]
    .filter(Boolean)
    .sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")))[0];
  if (!last) return "-";
  if (last.defensePlay?.code) return `Retrait ${last.defensePlay.code}`;
  return last.result || "-";
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
  $("#currentBatterField").textContent = batter ? displayShortBatterName(batter, side) : "-";
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
        <ol>${game.opponentLineup.map((batter) => `<li>${escapeHtml(opponentBatterName(batter))}</li>`).join("") || "<li>Aucun alignement adverse.</li>"}</ol>
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

function renderHome() {
  const game = getCurrentGame();
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

function opponentBatterName(batter) {
  if (!batter) return "Adversaire";
  return batter.label || `Adversaire #${batter.number || "-"}`;
}

function displayBatterName(batter, side) {
  return side === "opponent" ? opponentBatterName(batter) : formatPlayer(batter);
}

function displayShortBatterName(batter, side) {
  return side === "opponent" ? `#${batter.number || "-"}` : shortPlayerName(batter);
}

function runnerName(playerId, game = getCurrentGame()) {
  if (!playerId) return "Vide";
  const player = findPlayer(playerId);
  if (player) return shortPlayerName(player);
  return opponentRunnerName(playerId, game);
}

function opponentRunnerName(playerId, game = getCurrentGame()) {
  const batter = findOpponentBatter(game, playerId);
  return batter ? `#${batter.number || "-"}` : "Vide";
}

function statPlayerName(playerId, side) {
  const game = getGameForDisplay();
  if (side === "opponent") {
    return opponentBatterName(findOpponentBatter(game, playerId));
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
