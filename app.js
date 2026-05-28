const STORAGE_KEY = "baseballScorepadData";
const APP_VERSION_FALLBACK = "2026-05-28-v2";
const APP_VERSION_STORAGE_KEY = "baseballScorepadAppVersion";
const DEFAULT_ADMIN_PASSWORD = "changer-moi";
const ADMIN_PASSWORD_STORAGE_KEY = "baseballScorepadAdminPassword";
const ADMIN_SESSION_KEY = "baseballScorepadAdminAuthenticated";
const DEVICE_ID_STORAGE_KEY = "baseballScorepadDeviceId";
const RESET_GENERATION_STORAGE_KEY = "baseballScorePadResetGeneration";
const SCORER_HEARTBEAT_MS = 25000;
const SCORER_LOCK_TIMEOUT_MS = 5 * 60 * 1000;
const SUPABASE_URL = "https://sfjtbcpsepyjpjsgdmsb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmanRiY3BzZXB5anBqc2dkbXNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDE3NzIsImV4cCI6MjA5NDY3Nzc3Mn0.Yjdry3UljJsdFDeDa2onyBoePR023OCLjw05f2Klw14";
const TEAM_BRANDING = {
  teamName: "Titans de la ChaudiÃ¨re-Ouest",
  shortName: "TITANS",
  logoPath: "assets/titans-logo.png",
  colors: {
    primary: "#2F7D46",
    primaryDark: "#1E5B33",
    white: "#FFFFFF",
    silver: "#D9DEE5",
    charcoal: "#22303C"
  }
};
const POSITIONS = ["", "P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH", "SUB"];
const DEFAULT_INNINGS = 7;
const MIN_LINEUP_SIZE = 8;
const DEFAULT_LINEUP_SIZE = 9;
const MAX_LINEUP_SIZE = 14;
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
  settings: {
    markerPassword: DEFAULT_ADMIN_PASSWORD,
    markerPasswordCloudSyncedAt: null
  },
  currentGameId: null
};

function getDefaultAppData() {
  return {
    team: {
      name: "Mon Ã©quipe",
      players: []
    },
    games: [],
    calendar: [],
    settings: {
      markerPassword: DEFAULT_ADMIN_PASSWORD,
      markerPasswordCloudSyncedAt: null
    },
    currentGameId: null
  };
}

let pwaReady = false;
let appVersion = APP_VERSION_FALLBACK;
let remoteAppVersion = APP_VERSION_FALLBACK;
let defensiveOutState = {
  type: "fly",
  positions: []
};
let addBatterState = {
  side: "team",
  replace: false
};
let pendingAction = null;
let pendingRunnerMovementAction = null;
let activeMobileScorerTab = "situation";
let activeStatsView = "season";
let selectedStatsGameId = null;
let selectedStatsPlayerId = null;
let statsCloudPlayersRequested = false;
let supabaseClient = null;
let cloudGameSubscription = null;
let spectatorMode = false;
let spectatorGameState = null;
let spectatorPlayByPlay = [];
let spectatorSubscriptions = [];
let cloudSyncTimers = {};
let scorerHeartbeatTimer = null;
let scorerReadOnlyMode = false;
let safeMobileMode = false;
let markerPasswordCloudStatus = "local";
let cloudResetChecked = false;
let lastResetCompletion = null;
let appDiagnostics = {
  loadTime: new Date().toISOString(),
  errors: [],
  logs: []
};

// Pour un usage public à grande échelle, sécuriser les écritures avec authentification, code marqueur ou Edge Function.
if (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY) {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  appLog("Client Supabase chargé", "success");
} else {
  appLog("Client Supabase absent", "warning");
}

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

window.addEventListener("error", (event) => {
  captureAppError({
    message: event.message || "Erreur JavaScript",
    file: event.filename || "",
    line: event.lineno || "",
    column: event.colno || "",
    stack: event.error?.stack || ""
  });
});

window.addEventListener("unhandledrejection", (event) => {
  captureAppError({
    message: event.reason?.message || String(event.reason || "Promesse rejetée"),
    file: "",
    line: "",
    column: "",
    stack: event.reason?.stack || ""
  });
});

document.addEventListener("DOMContentLoaded", initApp);

async function initApp() {
  const params = new URLSearchParams(window.location.search);
  const watchId = params.get("watch");
  const resumeId = params.get("resume");
  if (isDebugMode()) {
    appLog("Démarrage de l'application en mode diagnostic", "info");
    document.body.classList.add("debug-mode");
    renderDebugPanel();
  }
  if (watchId) {
    spectatorMode = true;
    renderSpectatorMode(watchId);
    if (isDebugMode()) runAppDiagnostics();
    return;
  }

  loadData();
  await checkCloudResetGeneration();
  if (supabaseClient) loadMarkerPasswordFromCloud({ silent: true, startup: true });
  initializePublicData();
  setupPublicNavigation();
  setupNavigation();
  setupForms();
  setupLiveActions();
  setupDefensiveOutModal();
  setupOutOptionsModal();
  setupAddBatterModal();
  setupRunnerMovementModal();
  setupEditRunnersModal();
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
  checkForAppUpdate();
  if (isDebugMode()) runAppDiagnostics();
  if (resumeId) handleResumeParamOnLoad(resumeId);
}

function setupNavigation() {
  $$("[data-screen]").forEach((button) => {
    button.addEventListener("click", () => showScreen(button.dataset.screen));
  });

  $("#continueGameBtn")?.addEventListener("click", () => {
    openMatchForCurrentGame();
  });
  $("#homeLineupBtn")?.addEventListener("click", openLineupForCurrentGame);
}

function setupPublicNavigation() {
  const nav = $(".top-nav");
  if (!nav || nav.dataset.publicReady === "true") return;
  nav.innerHTML = `
    <button class="nav-btn active" data-screen="home"><span>H</span> Accueil</button>
    <button class="nav-btn" data-screen="public-live"><span>L</span> Match live</button>
    <button class="nav-btn" data-screen="stats"><span>%</span> Stats</button>
    <button class="nav-btn" data-screen="admin"><span>A</span> Admin</button>
  `;
  nav.dataset.publicReady = "true";
}

function showScreen(screenName) {
  appLog(`Navigation vers ${screenName}`, "info");
  if (isAdminScreen(screenName) && !isAdminAuthenticated()) {
    screenName = "admin";
  }
  if (screenName === "lineup" && !canOpenLineup()) return;
  $$(".screen").forEach((screen) => screen.classList.remove("active"));
  const screen = $(`#screen-${screenName}`);
  if (screen) screen.classList.add("active");

  $$(".nav-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.screen === screenName);
  });

  renderAll();
}

function isAdminScreen(screenName) {
  return ["players", "calendar", "lineup", "live", "report", "settings"].includes(screenName);
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
  if (isAdminAuthenticated() && normalizeGameStatus(game.status) === "in_progress") acquireScorerLock(game);
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
  $("#settingsMarkerPasswordForm")?.addEventListener("submit", updateSettingsMarkerPassword);
  $("#startGameBtn").addEventListener("click", startCurrentGame);
  $("#undoBtn").addEventListener("click", undoLastAction);
  $("#endHalfBtn").addEventListener("click", () => endHalfInning(true));
  $("#changeBatterBtn").addEventListener("click", () => replaceCurrentBatter());
  $("#editRunnersBtn").addEventListener("click", openEditRunnersModal);
  $("#lockTeamLineupBtn").addEventListener("click", lockTeamLineupManually);
  $("#lockOpponentLineupBtn").addEventListener("click", lockOpponentLineupManually);
  $("#unlockTeamLineupBtn").addEventListener("click", unlockTeamLineup);
  $("#unlockOpponentLineupBtn").addEventListener("click", unlockOpponentLineup);
  $("#finishGameBtn").addEventListener("click", finishGame);
  $("#oppPlusBtn").addEventListener("click", () => adjustOpponentScore(1));
  $("#oppMinusBtn").addEventListener("click", () => adjustOpponentScore(-1));
  $("#printBtn").addEventListener("click", () => window.print());
  $("#loadCloudGamesBtn")?.addEventListener("click", loadGamesFromCloud);
  $("#syncMarkerPasswordCloudBtn")?.addEventListener("click", () => loadMarkerPasswordFromCloud());
  $("#forceAppUpdateBtn")?.addEventListener("click", forceAppUpdate);
  $("#resetDataBtn").addEventListener("click", openResetConfirmationModal);
  $("#cancelResetStep1Btn")?.addEventListener("click", closeResetConfirmationModal);
  $("#continueResetStep1Btn")?.addEventListener("click", showResetConfirmationStep2);
  $("#cancelResetStep2Btn")?.addEventListener("click", closeResetConfirmationModal);
  $("#confirmResetStep2Btn")?.addEventListener("click", handleCompleteResetConfirm);
  $("#resetReturnHomeBtn")?.addEventListener("click", () => showScreen("home"));
  $("#resetCreateGameBtn")?.addEventListener("click", () => showScreen("calendar"));
  $("#resetAddPlayersBtn")?.addEventListener("click", () => showScreen("players"));
  $("#exportDataBtn").addEventListener("click", exportData);
  $("#importDataInput").addEventListener("change", importData);
  $("#exportCurrentGameBtn")?.addEventListener("click", exportCurrentGame);
  $("#importGameInput")?.addEventListener("change", importGameFile);
  $("#closeResumeGameBtn")?.addEventListener("click", closeResumeGameModal);
  $("#cancelResumeGameBtn")?.addEventListener("click", closeResumeGameModal);
  $("#loadResumeGameBtn")?.addEventListener("click", () => loadGameFromCloud($("#resumeGameCode").value));
  $("#runLimitEnabled").addEventListener("change", renderRunLimitSettings);
  $("#calendarRunLimitEnabled").addEventListener("change", renderCalendarRunLimitSettings);
  $("#opponentTrackingMode").addEventListener("change", renderLineupModeSettings);
  $("#lineupExpectedSettings").addEventListener("change", updateExpectedLineupCountsFromLineupScreen);
  $$(".stats-view-btn").forEach((button) => {
    button.addEventListener("click", () => {
      activeStatsView = button.dataset.statsView || "season";
      renderStats();
    });
  });
}

function setupLiveActions() {
  $$(".action-grid [data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.action === "out") {
        openOutOptionsModal();
        return;
      }
      confirmBatterBeforeAction(button.dataset.action);
    });
  });
}

function setupOutOptionsModal() {
  $("#closeOutOptionsBtn").addEventListener("click", closeOutOptionsModal);
  $("#cancelOutOptionsBtn").addEventListener("click", closeOutOptionsModal);
  $$("[data-out-option]").forEach((button) => {
    button.addEventListener("click", () => selectOutType(button.dataset.outOption));
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

function setupRunnerMovementModal() {
  $("#confirmRunnerMovementBtn").addEventListener("click", confirmRunnerMovementModal);
  $("#cancelRunnerMovementBtn").addEventListener("click", closeRunnerMovementModal);
  $("#closeRunnerMovementBtn").addEventListener("click", closeRunnerMovementModal);
  $("#runnerMovementRows").addEventListener("change", updateRunnerMovementModalState);
}

function setupEditRunnersModal() {
  $("#confirmEditRunnersBtn").addEventListener("click", applyManualBaseEdit);
  $("#cancelEditRunnersBtn").addEventListener("click", closeEditRunnersModal);
  $("#closeEditRunnersBtn").addEventListener("click", closeEditRunnersModal);
  $("#editRunnersRows").addEventListener("change", renderManualRunnerNumberInputs);
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
  window.addEventListener("online", async () => {
    updateOfflineStatus();
    await checkCloudResetGeneration();
    if (!cloudResetChecked) return;
    const game = getCurrentGame();
    if (game) {
      syncPendingLiveEvents(game);
      syncLiveGameState(game);
    }
    syncPendingCloudSaves();
  });
  window.addEventListener("offline", updateOfflineStatus);
  updateOfflineStatus();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    pwaReady = false;
    updateOfflineStatus();
    appLog("Service worker absent", "warning");
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js")
      .then((registration) => {
        pwaReady = Boolean(registration.active || registration.waiting || registration.installing);
        updateOfflineStatus();
        appLog(`Service worker enregistré : ${registration.scope}`, "success");

        navigator.serviceWorker.ready.then(() => {
          pwaReady = true;
          updateOfflineStatus();
          appLog("Service worker actif", "success");
          showToast("Mode hors ligne prêt.", "success");
        });
      })
      .catch(() => {
        pwaReady = false;
        updateOfflineStatus();
        appLog("Erreur service worker", "error");
        showToast("PWA non disponible avec ce mode d'ouverture.", "warning");
      });
  });
}

async function getAppVersion() {
  try {
    const response = await fetch(`./version.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Version fetch failed");
    const versionInfo = await response.json();
    remoteAppVersion = versionInfo.version || APP_VERSION_FALLBACK;
    appVersion = remoteAppVersion;
    renderAppVersion(versionInfo);
    return versionInfo;
  } catch (error) {
    appVersion = localStorage.getItem(APP_VERSION_STORAGE_KEY) || APP_VERSION_FALLBACK;
    renderAppVersion({ version: appVersion, updatedAt: "" });
    return { version: appVersion, updatedAt: "" };
  }
}

async function checkForAppUpdate() {
  const previousVersion = localStorage.getItem(APP_VERSION_STORAGE_KEY);
  const versionInfo = await getAppVersion();
  const currentVersion = versionInfo.version || APP_VERSION_FALLBACK;
  if (previousVersion && previousVersion !== currentVersion) {
    showUpdateAvailableBanner(currentVersion);
  } else {
    localStorage.setItem(APP_VERSION_STORAGE_KEY, currentVersion);
  }
}

function renderAppVersion(versionInfo = { version: appVersion, updatedAt: "" }) {
  const versionText = versionInfo.updatedAt
    ? `Version : ${versionInfo.version} · ${versionInfo.updatedAt}`
    : `Version : ${versionInfo.version || APP_VERSION_FALLBACK}`;
  if ($("#appVersionText")) $("#appVersionText").textContent = versionText;
}

function showUpdateAvailableBanner(version) {
  let banner = $("#appUpdateBanner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "appUpdateBanner";
    banner.className = "app-update-banner";
    document.body.appendChild(banner);
  }
  banner.innerHTML = `
    <span>Nouvelle version disponible : ${escapeHtml(version)}</span>
    <button type="button" onclick="applyAppUpdate()">Mettre à jour</button>
    <button type="button" class="secondary-btn" onclick="dismissAppUpdateBanner()">Plus tard</button>
  `;
  banner.classList.add("visible");
}

function dismissAppUpdateBanner() {
  $("#appUpdateBanner")?.classList.remove("visible");
}

async function clearAppCachesAndServiceWorkers() {
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }
}

async function applyAppUpdate() {
  localStorage.setItem(APP_VERSION_STORAGE_KEY, remoteAppVersion || appVersion || APP_VERSION_FALLBACK);
  await clearAppCachesAndServiceWorkers();
  window.location.reload();
}

async function forceAppUpdate() {
  const confirmed = confirm("Cette action va vider le cache de l'application et recharger la dernière version. Vos données locales peuvent rester dans localStorage, mais assurez-vous que la sauvegarde cloud est active.");
  if (!confirmed) return;
  await clearAppCachesAndServiceWorkers();
  showToast("Cache vidé. Rechargement de la dernière version.", "success");
  window.location.reload();
}

function isDebugMode() {
  return new URLSearchParams(window.location.search).get("debug") === "1";
}

function appLog(message, type = "info") {
  appDiagnostics.logs.unshift({
    message,
    type,
    time: new Date().toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  });
  appDiagnostics.logs = appDiagnostics.logs.slice(0, 20);
  if (isDebugMode()) renderDebugPanel();
}

function captureAppError(errorInfo) {
  appDiagnostics.errors.unshift({
    ...errorInfo,
    time: new Date().toISOString()
  });
  appDiagnostics.errors = appDiagnostics.errors.slice(0, 5);
  appLog(`Erreur capturée : ${errorInfo.message}`, "error");
}

function renderDebugPanel(snapshot = appDiagnostics.lastSnapshot || null) {
  if (!isDebugMode()) return;
  if (!document.body) return;
  let panel = $("#debugPanel");
  if (!panel) {
    panel = document.createElement("section");
    panel.id = "debugPanel";
    panel.className = "debug-panel";
    document.body.prepend(panel);
  }
  const game = getCurrentGame?.() || null;
  const rows = snapshot?.rows || [
    ["Version de l'app", appVersion || APP_VERSION_FALLBACK],
    ["Chargement", appDiagnostics.loadTime],
    ["Internet", navigator.onLine ? "En ligne" : "Hors ligne"],
    ["Largeur écran", `${window.innerWidth}px`],
    ["Matchs locaux", appData?.games?.length || 0],
    ["Joueurs locaux", appData?.team?.players?.length || 0],
    ["Partie active", game ? "Oui" : "Non"],
    ["currentGameId", appData?.currentGameId || "—"],
    ["publicGameId", game?.publicGameId || "—"]
  ];
  panel.innerHTML = `
    <div class="debug-title-row">
      <div>
        <p class="eyebrow">Diagnostic</p>
        <h2>Diagnostic Baseball ScorePad</h2>
      </div>
      <div class="debug-actions">
        <button type="button" onclick="runAppDiagnostics()">Relancer tests</button>
        <button type="button" onclick="enableSafeMobileMode()">Activer mode mobile sécuritaire</button>
        <button type="button" class="warning-btn" onclick="forceAppUpdate()">Vider cache PWA</button>
      </div>
    </div>
    <div class="debug-grid">
      ${rows.map(([label, value]) => `<div><span>${escapeHtml(String(label))}</span><strong>${escapeHtml(String(value ?? "—"))}</strong></div>`).join("")}
    </div>
    <div class="debug-columns">
      <section>
        <h3>Tests boutons marqueur</h3>
        <div class="debug-list">${renderDebugButtonTests(snapshot?.buttons || testScorerButtons())}</div>
      </section>
      <section>
        <h3>Dernière erreur JavaScript</h3>
        ${renderDebugErrors()}
      </section>
      <section>
        <h3>Logs internes</h3>
        ${renderDebugLogs()}
      </section>
    </div>
  `;
}

async function runAppDiagnostics() {
  if (!isDebugMode()) return;
  appLog("Diagnostic lancé", "info");
  const [storage, serviceWorker, supabaseStatus, assets] = await Promise.all([
    testLocalStorage(),
    testServiceWorkerAndCaches(),
    testSupabaseConnection(),
    testAssetLoading()
  ]);
  const game = getCurrentGame();
  const rows = [
    ["Version de l'app", appVersion || APP_VERSION_FALLBACK],
    ["Date/heure chargement", appDiagnostics.loadTime],
    ["Appareil", detectDeviceType()],
    ["Largeur écran", `${window.innerWidth}px`],
    ["Statut Internet", navigator.onLine ? "En ligne" : "Hors ligne"],
    ["Service worker", serviceWorker.summary],
    ["Cache PWA", `${serviceWorker.cacheCount} cache(s) : ${serviceWorker.cacheNames.join(", ") || "aucun"}`],
    ["localStorage", storage.ok ? "OK" : `Erreur — ${storage.error}`],
    ["Supabase client", supabaseClient ? "Chargé" : "Absent"],
    ["Supabase connexion", supabaseStatus.ok ? "OK" : `Erreur — ${supabaseStatus.error}`],
    ["manifest.json", assets.manifest],
    ["version.json", assets.version],
    ["app.js chargé", "Oui"],
    ["style.css chargé", assets.style],
    ["Nombre de matchs locaux", appData.games.length],
    ["Nombre de joueurs locaux", appData.team.players.length],
    ["Partie active", game ? "Oui" : "Non"],
    ["currentGameId", appData.currentGameId || "—"],
    ["publicGameId", game?.publicGameId || "—"]
  ];
  appDiagnostics.lastSnapshot = { rows, buttons: testScorerButtons() };
  renderDebugPanel(appDiagnostics.lastSnapshot);
}

async function testSupabaseConnection() {
  if (!window.supabase) return { ok: false, error: "window.supabase absent" };
  if (!supabaseClient) return { ok: false, error: "supabaseClient absent" };
  try {
    const { error } = await supabaseClient.from("saved_games_cloud").select("public_game_id").limit(1);
    if (error) throw error;
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

function testLocalStorage() {
  try {
    const key = "__scorepad_debug_test__";
    localStorage.setItem(key, "ok");
    const ok = localStorage.getItem(key) === "ok";
    localStorage.removeItem(key);
    return ok ? { ok: true } : { ok: false, error: "lecture différente de l'écriture" };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

async function testServiceWorkerAndCaches() {
  const supported = "serviceWorker" in navigator;
  const cacheNames = "caches" in window ? await caches.keys() : [];
  if (!supported) return { summary: "Absent", cacheCount: cacheNames.length, cacheNames };
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const scope = registrations[0]?.scope || "aucun scope actif";
    return {
      summary: registrations.length ? `Actif/supporté — ${registrations.length} registration(s), ${scope}` : "Supporté, aucune registration",
      cacheCount: cacheNames.length,
      cacheNames
    };
  } catch (error) {
    return { summary: `Erreur — ${error.message || error}`, cacheCount: cacheNames.length, cacheNames };
  }
}

async function testAssetLoading() {
  const fetchStatus = async (url) => {
    try {
      const response = await fetch(`${url}?ts=${Date.now()}`, { cache: "no-store" });
      return response.ok ? "Accessible" : `Erreur HTTP ${response.status}`;
    } catch (error) {
      return `Erreur — ${error.message || error}`;
    }
  };
  const styleLoaded = Boolean([...document.styleSheets].find((sheet) => String(sheet.href || "").includes("style.css")));
  return {
    manifest: await fetchStatus("manifest.json"),
    version: await fetchStatus("version.json"),
    style: styleLoaded ? "Oui" : "Non détecté"
  };
}

function testScorerButtons() {
  const tests = [
    ["Simple", "Simple"],
    ["Double", "Double"],
    ["BB", "BB"],
    ["K", "K"],
    ["Retrait", "Retrait"],
    ["Plus", "Plus"],
    ["Modifier les coureurs", "Modifier les coureurs"],
    ["Fin de demi-manche", "Fin demi-manche"]
  ];
  const buttons = $$("button");
  return tests.map(([label, text]) => ({
    label,
    found: buttons.some((button) => button.textContent.trim().toLowerCase().includes(text.toLowerCase()))
  }));
}

function renderDebugButtonTests(tests) {
  return tests.map((test) => `<div><span>${escapeHtml(test.label)}</span><strong class="${test.found ? "debug-ok" : "debug-error"}">${test.found ? "trouvé" : "absent"}</strong></div>`).join("");
}

function renderDebugErrors() {
  if (!appDiagnostics.errors.length) return `<p class="debug-empty">Aucune erreur capturée.</p>`;
  const error = appDiagnostics.errors[0];
  return `
    <pre class="debug-error-box">${escapeHtml([
      error.message,
      error.file ? `${error.file}:${error.line}:${error.column}` : "",
      error.stack || ""
    ].filter(Boolean).join("\n"))}</pre>
  `;
}

function renderDebugLogs() {
  if (!appDiagnostics.logs.length) return `<p class="debug-empty">Aucun log.</p>`;
  return `<ol class="debug-log-list">${appDiagnostics.logs.map((log) => `<li class="${escapeHtml(log.type)}"><span>${escapeHtml(log.time)}</span> ${escapeHtml(log.message)}</li>`).join("")}</ol>`;
}

function detectDeviceType() {
  const ua = navigator.userAgent || "";
  if (/ipad|tablet/i.test(ua)) return "Tablette";
  if (/iphone|android.*mobile|mobile/i.test(ua)) return "Cellulaire";
  return "Ordinateur";
}

function enableSafeMobileMode() {
  safeMobileMode = true;
  document.body.classList.add("safe-mobile-mode");
  activeMobileScorerTab = "scoring";
  appLog("Mode mobile sécuritaire activé", "warning");
  renderAll();
  renderDebugPanel();
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

function canUploadAfterResetCheck() {
  if (cloudResetChecked) return true;
  console.warn("Synchronisation bloquÃ©e : vÃ©rification reset cloud non complÃ©tÃ©e.");
  return false;
}

function saveLocalData() {
  saveData();
}

function saveGameEverywhere(game, options = {}) {
  if (!game) return;
  const {
    syncLive = false,
    playEvent = null,
    publishPlayByPlay = Boolean(playEvent),
    cloud = true
  } = options;
  saveLocalData();
  if (!canUploadAfterResetCheck()) {
    updateSyncStatusUI(game);
    return;
  }
  if (syncLive) syncLiveGameState(game);
  if (publishPlayByPlay && playEvent) publishPlayByPlayEvent(game, playEvent);
  if (cloud) scheduleCloudSave(game);
  updateSyncStatusUI(game);
}

function updateSyncStatusUI(game = getCurrentGame()) {
  if (!game) return;
  if ($("#liveBroadcastPanel") && getCurrentGame()?.id === game.id) renderLiveBroadcastPanel(game);
  if ($("#mobileSituationDetails") && getCurrentGame()?.id === game.id) renderMobileSituationDetails(game);
  if ($("#screen-stats")?.classList.contains("active")) renderStats();
}

function loadData() {
  appLog("Chargement localStorage", "info");
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
        settings: {
          markerPassword: parsed.settings?.markerPassword || localStorage.getItem(ADMIN_PASSWORD_STORAGE_KEY) || DEFAULT_ADMIN_PASSWORD,
          markerPasswordCloudSyncedAt: parsed.settings?.markerPasswordCloudSyncedAt || null
        },
        currentGameId: parsed.currentGameId || null
      };
    } catch (error) {
      console.warn("Sauvegarde locale illisible.", error);
    }
  }

  migrateData();
  saveData();
  appLog(`localStorage chargé : ${appData.games.length} partie(s), ${appData.team.players.length} joueur(s)`, "success");
}

function migrateData() {
  if (!Array.isArray(appData.calendar)) appData.calendar = [];
  if (!appData.settings || typeof appData.settings !== "object") appData.settings = {};
  appData.settings.markerPassword = appData.settings.markerPassword || localStorage.getItem(ADMIN_PASSWORD_STORAGE_KEY) || DEFAULT_ADMIN_PASSWORD;
  appData.settings.markerPasswordCloudSyncedAt = appData.settings.markerPasswordCloudSyncedAt || null;
  localStorage.setItem(ADMIN_PASSWORD_STORAGE_KEY, appData.settings.markerPassword);
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
    expectedTeamBattersCount: clampLineupSize(event.expectedTeamBattersCount),
    expectedOpponentBattersCount: clampLineupSize(event.expectedOpponentBattersCount),
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
  const existingLineup = Array.isArray(game.lineup) ? game.lineup : [];
  const migratedOpponentLineup = migrateOpponentPlayerLabels(game);
  const expectedTeamBattersCount = migrateExpectedLineupSize(game.expectedTeamBattersCount, existingLineup);
  const expectedOpponentBattersCount = migrateExpectedLineupSize(game.expectedOpponentBattersCount, migratedOpponentLineup);
  const teamLineupLocked = migratedLineupModes.lineupMode === "dynamic"
    ? Boolean(game.teamLineupLocked && game.teamLineupLockReason)
    : true;
  const opponentLineupLocked = migratedLineupModes.opponentLineupMode === "dynamic"
    ? Boolean(game.opponentLineupLocked && game.opponentLineupLockReason)
    : true;
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
    lineup: existingLineup,
    opponentLineup: migratedOpponentLineup,
    atBats: normalizeAtBats(game.atBats),
    opponentAtBats: normalizeAtBats(game.opponentAtBats),
    teamSnapshot: game.teamSnapshot || null,
    playByPlay: Array.isArray(game.playByPlay) ? game.playByPlay : [],
    scoreTeam: Number(game.scoreTeam || 0),
    scoreOpponent: Number(game.scoreOpponent || 0),
    inningScores: Array.isArray(game.inningScores) ? game.inningScores : createInningScores(innings),
    currentInning: Number(game.currentInning || 1),
    half: game.half || "haut",
    outs: Number(game.outs || 0),
    bases: normalizeGameBases(game.bases),
    currentBatterIndex: Number(game.currentBatterIndex || 0),
    currentOpponentBatterIndex: Number(game.currentOpponentBatterIndex || 0),
    currentBattingSide: game.currentBattingSide || "team",
    opponentTrackingMode: game.opponentTrackingMode || "simple",
    lineupMode: migratedLineupModes.lineupMode,
    opponentLineupMode: migratedLineupModes.opponentLineupMode,
    teamLineupLocked,
    opponentLineupLocked,
    teamLineupLockReason: game.teamLineupLockReason || null,
    opponentLineupLockReason: game.opponentLineupLockReason || null,
    teamLineupBuildCompleteByRepeat: game.teamLineupBuildCompleteByRepeat !== false,
    opponentLineupBuildCompleteByRepeat: game.opponentLineupBuildCompleteByRepeat !== false,
    expectedTeamBattersCount,
    expectedOpponentBattersCount,
    autoLockLineupAfterExpectedCount: game.autoLockLineupAfterExpectedCount !== false,
    runLimitEnabled: migratedRunLimit.runLimitEnabled,
    runLimitPerInning: migratedRunLimit.runLimitPerInning,
    runLimitAppliesToLastInning: migratedRunLimit.runLimitAppliesToLastInning,
    liveEnabled: game.liveEnabled === true,
    publicGameId: game.publicGameId || null,
    liveShareUrl: game.liveShareUrl || null,
    liveLastAction: game.liveLastAction || "",
    pendingLiveEvents: Array.isArray(game.pendingLiveEvents) ? game.pendingLiveEvents : [],
    cloudSaveStatus: game.cloudSaveStatus || "local",
    cloudUpdatedAt: game.cloudUpdatedAt || null,
    pendingCloudSave: game.pendingCloudSave === true,
    history: Array.isArray(game.history) ? game.history : [],
    status: game.status || "préparation"
  };
}

function normalizeGameBases(bases) {
  const source = bases && typeof bases === "object" ? bases : {};
  return {
    first: source.first || null,
    second: source.second || null,
    third: source.third || null
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

function clampLineupSize(value, fallback = DEFAULT_LINEUP_SIZE) {
  const number = Number(value || fallback);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(MAX_LINEUP_SIZE, Math.max(MIN_LINEUP_SIZE, Math.round(number)));
}

function migrateExpectedLineupSize(value, lineup = []) {
  if (value) return clampLineupSize(value);
  const count = Array.isArray(lineup) ? lineup.length : 0;
  if (count >= MIN_LINEUP_SIZE && count <= MAX_LINEUP_SIZE) return count;
  return DEFAULT_LINEUP_SIZE;
}

function validateLineupSize(value, label = "L'alignement") {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    showToast(`${label} doit contenir un nombre de frappeurs valide.`, "warning");
    return null;
  }
  if (number < MIN_LINEUP_SIZE) {
    showToast(`${label} doit contenir au moins ${MIN_LINEUP_SIZE} frappeurs.`, "warning");
    return null;
  }
  if (number > MAX_LINEUP_SIZE) {
    showToast(`${label} ne peut pas dÃ©passer ${MAX_LINEUP_SIZE} frappeurs.`, "warning");
    return null;
  }
  return Math.round(number);
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

function normalizeCloudPlayer(player) {
  const id = player?.playerId || player?.id;
  if (!id) return null;
  const now = new Date().toISOString();
  const firstName = player.firstName || "";
  const lastName = player.lastName || "";
  const number = String(player.number || "").replace(/^#/, "").trim();
  return {
    id,
    playerId: id,
    number,
    firstName,
    lastName,
    name: player.name || `${firstName} ${lastName}`.trim(),
    position: player.position || "",
    active: player.active !== false && player.status !== "inactive",
    status: player.status || (player.active === false ? "inactive" : "active"),
    createdAt: player.createdAt || now,
    updatedAt: player.updatedAt || now
  };
}

function isPlayerInfoComplete(player) {
  return Boolean(player && (player.firstName || player.lastName || player.name || player.number));
}

function preferPlayerData(localPlayer, cloudPlayer) {
  const local = normalizeCloudPlayer(localPlayer) || {};
  const cloud = normalizeCloudPlayer(cloudPlayer) || {};
  const localScore = ["number", "firstName", "lastName", "name", "position"].filter((key) => local[key]).length;
  const cloudScore = ["number", "firstName", "lastName", "name", "position"].filter((key) => cloud[key]).length;
  const newerCloud = new Date(cloud.updatedAt || 0).getTime() > new Date(local.updatedAt || 0).getTime();
  const base = cloudScore > localScore || newerCloud ? { ...local, ...cloud } : { ...cloud, ...local };
  ["number", "firstName", "lastName", "name", "position"].forEach((key) => {
    if (!base[key]) base[key] = local[key] || cloud[key] || "";
  });
  return base;
}

function mergeCloudPlayersIntoLocal(cloudPlayers = []) {
  let changed = false;
  cloudPlayers.map(normalizeCloudPlayer).filter(Boolean).forEach((cloudPlayer) => {
    const index = appData.team.players.findIndex((player) => player.id === cloudPlayer.id || player.playerId === cloudPlayer.id);
    if (index >= 0) {
      const merged = preferPlayerData(appData.team.players[index], cloudPlayer);
      if (JSON.stringify(appData.team.players[index]) !== JSON.stringify(merged)) {
        appData.team.players[index] = merged;
        changed = true;
      }
    } else if (isPlayerInfoComplete(cloudPlayer)) {
      appData.team.players.push(cloudPlayer);
      changed = true;
    }
  });
  if (changed) saveData();
  return changed;
}

function createBatterSnapshot(playerId, side = "team", game = getCurrentGame()) {
  if (side === "opponent") {
    const batter = findOpponentBatter(game, playerId);
    const number = getOpponentPlayerNumber(batter);
    return {
      playerId,
      batterId: playerId,
      number,
      firstName: "",
      lastName: "",
      name: opponentBatterName(batter, game),
      displayName: opponentBatterName(batter, game)
    };
  }
  const player = findPlayer(playerId);
  const displayName = getPlayerDisplayName(playerId, null);
  return {
    playerId,
    batterId: playerId,
    number: player?.number || "",
    firstName: player?.firstName || "",
    lastName: player?.lastName || "",
    name: player ? `${player.firstName || ""} ${player.lastName || ""}`.trim() : "",
    displayName
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
    strikeout: Number(atBat.strikeout || 0),
    defensePlay: atBat.defensePlay || null
  })) : [];
}

function getCurrentGame() {
  return appData.games.find((game) => game.id === appData.currentGameId) || null;
}

function updateCurrentGame(updatedGame, options = {}) {
  const index = appData.games.findIndex((game) => game.id === updatedGame.id);
  if (index >= 0) {
    const normalized = normalizeGame(updatedGame);
    appData.games[index] = normalized;
    saveGameEverywhere(normalized, options);
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
    Object.assign(player, { number, firstName, lastName, position, active, updatedAt: new Date().toISOString() });
    saveData();
    syncPlayersToCloud();
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
    active,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  saveData();
  syncPlayersToCloud();
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
  syncPlayersToCloud();
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
    expectedTeamBattersCount: validateLineupSize($("#calendarExpectedTeamBatters").value, "L'alignement"),
    expectedOpponentBattersCount: validateLineupSize($("#calendarExpectedOpponentBatters").value, "L'alignement adverse"),
    runLimitEnabled: $("#calendarRunLimitEnabled").checked,
    runLimitPerInning: $("#calendarRunLimitEnabled").checked ? Number($("#calendarRunLimitPerInning").value || 5) : null,
    runLimitAppliesToLastInning: !$("#calendarRunLimitSkipLast").checked,
    notes: $("#calendarNotes").value.trim()
  };

  if (!payload.date || !payload.opponent) {
    return showToast("La date et l'adversaire sont obligatoires.", "warning");
  }
  if (!payload.expectedTeamBattersCount || !payload.expectedOpponentBattersCount) return;
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
  $("#calendarExpectedTeamBatters").value = event.expectedTeamBattersCount || DEFAULT_LINEUP_SIZE;
  $("#calendarExpectedOpponentBatters").value = event.expectedOpponentBattersCount || DEFAULT_LINEUP_SIZE;
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
  $("#calendarExpectedTeamBatters").value = DEFAULT_LINEUP_SIZE;
  $("#calendarExpectedOpponentBatters").value = DEFAULT_LINEUP_SIZE;
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
  if (!isAdminAuthenticated()) return showScreen("admin");
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
    expectedTeamBattersCount: event.expectedTeamBattersCount || DEFAULT_LINEUP_SIZE,
    expectedOpponentBattersCount: event.expectedOpponentBattersCount || DEFAULT_LINEUP_SIZE,
    runLimitEnabled: event.runLimitEnabled === true,
    runLimitPerInning: event.runLimitEnabled ? event.runLimitPerInning : null,
    runLimitAppliesToLastInning: event.runLimitAppliesToLastInning !== false,
    status: "brouillon"
  });

  appData.games.push(game);
  appData.currentGameId = game.id;
  event.linkedGameId = game.id;
  event.status = "Partie créée";
  saveGameEverywhere(game);
  openLineupForCurrentGame();
  showToast("Partie créée depuis le calendrier.", "success");
}

function openLinkedGameLineup(gameId) {
  if (!isAdminAuthenticated()) return showScreen("admin");
  appData.currentGameId = gameId;
  saveData();
  openLineupForCurrentGame();
}

function openLinkedGameMatch(gameId) {
  if (!isAdminAuthenticated()) return showScreen("admin");
  appData.currentGameId = gameId;
  saveData();
  openMatchForCurrentGame();
}

function openReportForGame(gameId) {
  if (!isAdminAuthenticated()) return openGameStats(gameId);
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
  const expectedTeamBattersCount = validateLineupSize($("#expectedTeamBatters").value, "L'alignement");
  const expectedOpponentBattersCount = validateLineupSize($("#expectedOpponentBatters").value, "L'alignement adverse");
  if (!expectedTeamBattersCount || !expectedOpponentBattersCount) return;
  const game = buildGame({
    date: $("#gameDate").value,
    opponent: $("#gameOpponent").value.trim(),
    field: $("#gameField").value.trim(),
    homeAway: $("#gameHomeAway").value,
    innings: Math.max(1, Number($("#gameInnings").value || DEFAULT_INNINGS)),
    opponentTrackingMode: $("#opponentTrackingMode").value,
    lineupMode: $("#lineupMode").value,
    opponentLineupMode: $("#opponentLineupMode").value,
    expectedTeamBattersCount,
    expectedOpponentBattersCount,
    ...runLimitSettings,
    status: "préparation",
    linkedGameId: null
  });

  appData.games.push(game);
  appData.currentGameId = game.id;
  saveGameEverywhere(game);
  event.target.reset();
  setDefaultGameDate();
  $("#gameHomeAway").value = "local";
  $("#opponentTrackingMode").value = "simple";
  $("#lineupMode").value = "prepared";
  $("#opponentLineupMode").value = "dynamic";
  $("#expectedTeamBatters").value = DEFAULT_LINEUP_SIZE;
  $("#expectedOpponentBatters").value = DEFAULT_LINEUP_SIZE;
  renderLineupModeSettings();
  applyRunLimitToGameForm({ runLimitEnabled: false, runLimitPerInning: null, runLimitAppliesToLastInning: true });
  $$("[data-home-away]").forEach((button) => {
    button.classList.toggle("active", button.dataset.homeAway === "local");
  });
  showScreen("lineup");
  showToast("Partie créée.", "success");
}

function buildGame({ date, time = "", opponent, field, gameType = "", notes = "", homeAway, innings, opponentTrackingMode, lineupMode = "prepared", opponentLineupMode = "dynamic", expectedTeamBattersCount = DEFAULT_LINEUP_SIZE, expectedOpponentBattersCount = DEFAULT_LINEUP_SIZE, runLimitEnabled = false, runLimitPerInning = null, runLimitAppliesToLastInning = true, status, linkedGameId }) {
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
    expectedTeamBattersCount,
    expectedOpponentBattersCount,
    autoLockLineupAfterExpectedCount: true,
    runLimitEnabled,
    runLimitPerInning,
    runLimitAppliesToLastInning,
    liveEnabled: false,
    publicGameId: null,
    liveShareUrl: null,
    liveLastAction: "",
    pendingLiveEvents: [],
    cloudSaveStatus: "local",
    cloudUpdatedAt: null,
    pendingCloudSave: false,
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
  if (game.lineup.length >= MAX_LINEUP_SIZE) return showToast(`L'alignement ne peut pas dÃ©passer ${MAX_LINEUP_SIZE} frappeurs.`, "warning");
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

  if (game.opponentLineup.length >= MAX_LINEUP_SIZE) return showToast(`L'alignement adverse ne peut pas dÃ©passer ${MAX_LINEUP_SIZE} frappeurs.`, "warning");
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
  if (game.lineupMode !== "dynamic" && game.lineup.length < game.expectedTeamBattersCount) {
    showToast(`L'alignement doit contenir ${game.expectedTeamBattersCount} frappeurs.`, "warning");
    return;
  }

  if (game.opponentTrackingMode === "complete" && game.opponentLineupMode !== "dynamic" && game.opponentLineup.length < game.expectedOpponentBattersCount) {
    const ok = confirm(`L'alignement adverse contient moins de ${game.expectedOpponentBattersCount} frappeurs. Démarrer quand même?`);
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
  prepareScoringSession(game);
  updateCurrentGame(game, { syncLive: true });
  showScreen("live");
  showToast(game.lineupMode === "dynamic" ? "Partie démarrée. L'alignement sera construit pendant la partie." : "Partie démarrée.", "success");
}

function renderLineup() {
  const game = getCurrentGame();
  const lineup = game?.lineup || [];
  const selected = new Set(lineup);
  const available = appData.team.players.filter((player) => player.active !== false && !selected.has(player.id));
  if (game) renderExpectedLineupSettings(game);

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
          <div class="player-main">${escapeHtml(getPlayerDisplayName(playerId))}</div>
          <div class="player-meta"><span class="mini-badge">${escapeHtml(formatPosition(player?.position))}</span></div>
        </div>
        <button class="small-btn" onclick="removeFromLineup('${playerId}')">Retirer</button>
      </div>
    `;
  }).join("") : `<div class="empty-state">Aucun alignement prêt. Sélectionnez ${game?.expectedTeamBattersCount || DEFAULT_LINEUP_SIZE} frappeurs dans l'ordre.</div>`;

  $("#lineupCount").textContent = `${lineup.length} / ${game?.expectedTeamBattersCount || DEFAULT_LINEUP_SIZE} frappeur${lineup.length > 1 ? "s" : ""}`;
  $("#lineupExpectedHint").textContent = `${game?.expectedTeamBattersCount || DEFAULT_LINEUP_SIZE} prÃ©vus`;
  $("#startGameBtn").disabled = game?.lineupMode !== "dynamic" && lineup.length < game.expectedTeamBattersCount;
  renderOpponentLineup();
}

function renderExpectedLineupSettings(game) {
  const canEditTeam = normalizeGameStatus(game.status) !== "in_progress" || !game.teamLineupLocked;
  const canEditOpponent = normalizeGameStatus(game.status) !== "in_progress" || !game.opponentLineupLocked;
  $("#lineupExpectedSettings").innerHTML = `
    <label>Nombre de frappeurs prÃ©vu
      <input id="lineupExpectedTeamBatters" type="number" min="${MIN_LINEUP_SIZE}" max="${MAX_LINEUP_SIZE}" value="${game.expectedTeamBattersCount}" ${canEditTeam ? "" : "disabled"}>
    </label>
    <label>Nombre de frappeurs adverses prÃ©vu
      <input id="lineupExpectedOpponentBatters" type="number" min="${MIN_LINEUP_SIZE}" max="${MAX_LINEUP_SIZE}" value="${game.expectedOpponentBattersCount}" ${canEditOpponent ? "" : "disabled"}>
    </label>
    <div class="lineup-expected-summary">
      <strong>Frappeurs ajoutÃ©s : ${game.lineup.length} / ${game.expectedTeamBattersCount}</strong>
      <span>Adversaire : ${game.opponentLineup.length} / ${game.expectedOpponentBattersCount}</span>
    </div>
  `;
}

function updateExpectedLineupCountsFromLineupScreen(event) {
  if (!event.target.matches("#lineupExpectedTeamBatters, #lineupExpectedOpponentBatters")) return;
  const game = getCurrentGame();
  if (!game) return;
  if (event.target.id === "lineupExpectedTeamBatters") {
    const value = validateLineupSize(event.target.value, "L'alignement");
    if (!value) return renderLineup();
    game.expectedTeamBattersCount = value;
  } else {
    const value = validateLineupSize(event.target.value, "L'alignement adverse");
    if (!value) return renderLineup();
    game.expectedOpponentBattersCount = value;
  }
  updateCurrentGame(game);
  renderLineup();
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
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    appData.team.players.push(player);
    syncPlayersToCloud();
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
    if (game.lineup.length >= MAX_LINEUP_SIZE) {
      showToast(`L'alignement ne peut pas dÃ©passer ${MAX_LINEUP_SIZE} frappeurs.`, "warning");
      return false;
    }
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
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      appData.team.players.push(player);
      syncPlayersToCloud();
      playerId = player.id;
    }
  }
  if (!playerId) return showToast("Sélectionnez un joueur.", "warning");
  const confirmed = addTeamBatterToDynamicLineup(playerId);
  if (!confirmed) return;
  executePendingActionForConfirmedBatter();
}

function confirmOpponentBatterNumber() {
  const number = $("#dynamicOpponentNumber").value.trim();
  if (!number) return showToast("Le numéro adverse est obligatoire.", "warning");
  const confirmed = addOpponentBatterToDynamicLineup(number);
  if (!confirmed) return;
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
  if (!game) return false;
  const existingIndex = game.lineup.indexOf(playerId);
  if (existingIndex >= 0 && game.lineupMode === "dynamic" && !game.teamLineupLocked && game.teamLineupBuildCompleteByRepeat) {
    const ok = confirm("Ce frappeur existe dÃ©jÃ  dans l'ordre. Voulez-vous verrouiller l'alignement et commencer le prochain tour?");
    if (!ok) return false;
    lockTeamLineup("repeat");
    game.currentBatterIndex = existingIndex;
  } else if (addBatterState.replace && game.lineup.length) {
    game.lineup[game.currentBatterIndex] = playerId;
  } else if (existingIndex >= 0) {
    game.currentBatterIndex = existingIndex;
  } else {
    game.lineup.push(playerId);
    game.currentBatterIndex = game.lineup.length - 1;
    maybePromptLineupLockAfterExpectedCount(game, "team");
  }
  updateCurrentGame(game);
  saveData();
  renderAll();
  return true;
}

function addOpponentBatterToDynamicLineup(number) {
  const game = getCurrentGame();
  if (!game) return false;
  const existingIndex = game.opponentLineup.findIndex((batter) => String(batter.number) === String(number));
  if (existingIndex >= 0 && game.opponentLineupMode === "dynamic" && !game.opponentLineupLocked && game.opponentLineupBuildCompleteByRepeat) {
    const ok = confirm("Ce frappeur adverse existe dÃ©jÃ  dans l'ordre. Voulez-vous verrouiller l'alignement adverse et commencer le prochain tour?");
    if (!ok) return false;
    lockOpponentLineup("repeat");
    game.currentOpponentBatterIndex = existingIndex;
  } else if (addBatterState.replace && game.opponentLineup.length) {
    const batter = existingIndex >= 0 ? game.opponentLineup[existingIndex] : createOpponentPlayer(number, game);
    game.opponentLineup[game.currentOpponentBatterIndex] = batter;
  } else if (existingIndex >= 0) {
    game.currentOpponentBatterIndex = existingIndex;
  } else {
    if (game.opponentLineup.length >= MAX_LINEUP_SIZE) {
      showToast(`L'alignement adverse ne peut pas dÃ©passer ${MAX_LINEUP_SIZE} frappeurs.`, "warning");
      return false;
    }
    const batter = createOpponentPlayer(number, game);
    game.opponentLineup.push(batter);
    game.currentOpponentBatterIndex = game.opponentLineup.length - 1;
    maybePromptLineupLockAfterExpectedCount(game, "opponent");
  }
  updateCurrentGame(game);
  renderAll();
  return true;
}

function lockTeamLineup(reason = "manual") {
  const game = getCurrentGame();
  if (!game) return;
  if (game.lineup.length < MIN_LINEUP_SIZE) return showToast(`Il faut au moins ${MIN_LINEUP_SIZE} frappeurs pour verrouiller l'alignement.`, "warning");
  game.teamLineupLocked = true;
  game.teamLineupLockReason = reason;
  showToast(reason === "repeat" ? "Alignement de notre équipe verrouillé automatiquement" : "Alignement de notre équipe verrouillé", "success");
}

function lockOpponentLineup(reason = "manual") {
  const game = getCurrentGame();
  if (!game) return;
  if (game.opponentLineup.length < MIN_LINEUP_SIZE) return showToast(`Il faut au moins ${MIN_LINEUP_SIZE} frappeurs adverses pour verrouiller l'alignement.`, "warning");
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

function lockTeamLineup(reason = "manual") {
  const game = getCurrentGame();
  if (!game) return false;
  if (game.lineupMode !== "dynamic") return showToast("L'alignement de notre Ã©quipe est dÃ©jÃ  prÃ©parÃ©.", "warning");
  if (game.teamLineupLocked) return false;
  if (game.lineup.length < MIN_LINEUP_SIZE) return showToast(`Il faut au moins ${MIN_LINEUP_SIZE} frappeurs pour verrouiller l'alignement.`, "warning");
  if (reason === "manual" && game.lineup.length < game.expectedTeamBattersCount) {
    const ok = confirm(`L'alignement contient seulement ${game.lineup.length} frappeur${game.lineup.length > 1 ? "s" : ""} sur ${game.expectedTeamBattersCount} prÃ©vus. Voulez-vous quand mÃªme le verrouiller?`);
    if (!ok) return false;
  }
  game.teamLineupLocked = true;
  game.teamLineupLockReason = reason;
  showToast(reason === "repeat" ? "Alignement de notre Ã©quipe verrouillÃ© automatiquement" : "Alignement de notre Ã©quipe verrouillÃ©", "success");
  return true;
}

function lockOpponentLineup(reason = "manual") {
  const game = getCurrentGame();
  if (!game) return false;
  if (game.opponentLineupMode !== "dynamic") return showToast("L'alignement adverse est dÃ©jÃ  prÃ©parÃ©.", "warning");
  if (game.opponentLineupLocked) return false;
  if (game.opponentLineup.length < MIN_LINEUP_SIZE) return showToast(`Il faut au moins ${MIN_LINEUP_SIZE} frappeurs adverses pour verrouiller l'alignement.`, "warning");
  if (reason === "manual" && game.opponentLineup.length < game.expectedOpponentBattersCount) {
    const ok = confirm(`L'alignement adverse contient seulement ${game.opponentLineup.length} frappeur${game.opponentLineup.length > 1 ? "s" : ""} sur ${game.expectedOpponentBattersCount} prÃ©vus. Voulez-vous quand mÃªme le verrouiller?`);
    if (!ok) return false;
  }
  game.opponentLineupLocked = true;
  game.opponentLineupLockReason = reason;
  showToast(reason === "repeat" ? "Alignement adverse verrouillÃ© automatiquement" : "Alignement adverse verrouillÃ©", "success");
  return true;
}

function lockTeamLineupManually() {
  const game = getCurrentGame();
  if (!game) return showToast("Aucune partie active.", "warning");
  if (lockTeamLineup("manual")) {
    updateCurrentGame(game);
    renderAll();
  }
}

function lockOpponentLineupManually() {
  const game = getCurrentGame();
  if (!game) return showToast("Aucune partie active.", "warning");
  if (game.opponentTrackingMode !== "complete") return showToast("Le suivi adverse complet n'est pas actif.", "warning");
  if (lockOpponentLineup("manual")) {
    updateCurrentGame(game);
    renderAll();
  }
}

function unlockTeamLineup() {
  const game = getCurrentGame();
  if (!game || !game.teamLineupLocked) return;
  if (!confirm("Voulez-vous dÃ©verrouiller l'alignement?")) return;
  game.teamLineupLocked = false;
  game.teamLineupLockReason = null;
  updateCurrentGame(game);
  renderAll();
  showToast("Alignement dÃ©verrouillÃ©.", "success");
}

function unlockOpponentLineup() {
  const game = getCurrentGame();
  if (!game || !game.opponentLineupLocked) return;
  if (!confirm("Voulez-vous dÃ©verrouiller l'alignement adverse?")) return;
  game.opponentLineupLocked = false;
  game.opponentLineupLockReason = null;
  updateCurrentGame(game);
  renderAll();
  showToast("Alignement adverse dÃ©verrouillÃ©.", "success");
}

function maybePromptLineupLockAfterExpectedCount(game, side) {
  if (!game.autoLockLineupAfterExpectedCount) return;
  if (side === "team") {
    if (game.lineupMode !== "dynamic" || game.teamLineupLocked) return;
    if (game.lineup.length !== game.expectedTeamBattersCount) return;
    if (confirm(`L'alignement contient maintenant ${game.expectedTeamBattersCount} frappeurs. Voulez-vous le verrouiller?`)) {
      lockTeamLineup("manual");
    }
    return;
  }
  if (game.opponentLineupMode !== "dynamic" || game.opponentLineupLocked) return;
  if (game.opponentLineup.length !== game.expectedOpponentBattersCount) return;
  if (confirm(`L'alignement adverse contient maintenant ${game.expectedOpponentBattersCount} frappeurs. Voulez-vous le verrouiller?`)) {
    lockOpponentLineup("manual");
  }
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

function openOutOptionsModal() {
  appLog("Ouverture options de retrait", "info");
  if (!ensureAdminBeforeScoring()) return;
  $("#outOptionsModal").classList.remove("hidden");
}

function closeOutOptionsModal() {
  $("#outOptionsModal").classList.add("hidden");
}

function selectOutType(type) {
  closeOutOptionsModal();
  if (type === "defensive") return confirmBatterBeforeAction("defensiveOut");
  if (type === "strikeout") return confirmBatterBeforeAction("strikeout");
  if (type === "sacrifice") return confirmBatterBeforeAction("sacrifice");
  if (type === "fielderschoice") return confirmBatterBeforeAction("fielderschoice");
  if (type === "doubleplay") return confirmBatterBeforeAction("doubleplay");
  if (type === "runnerout") return confirmBatterBeforeAction("runnerout");
}

function recordAtBat(action, defensePlay = null, batterConfirmed = false, confirmedMovements = null, confirmedRbi = null) {
  const game = getCurrentGame();
  if (!batterConfirmed) return confirmBatterBeforeAction(action, defensePlay);
  if (game && !canCurrentDeviceScore(game)) return showToast("Mode lecture seule : prenez le relais pour scorer cette partie.", "warning");
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

  const batterId = side === "team" ? game.lineup[game.currentBatterIndex] : game.opponentLineup[game.currentOpponentBatterIndex].id;
  if (usesRunnerMovementModal(action) && !confirmedMovements) {
    openRunnerMovementModal(action, buildDefaultRunnerMovements(action, game, batterId), {
      batterId,
      defensePlay,
      side
    });
    return;
  }

  snapshotGame(game);
  let runsScored = 0;
  let outsAdded = 0;
  const atBat = makeAtBat(game, batterId, action, side);

  if (confirmedMovements) {
    setAtBatResultStats(atBat, action);
    const appliedMovements = applyRunnerMovements(game, confirmedMovements, action, confirmedRbi, atBat, side);
    runsScored = appliedMovements.runsScored;
    outsAdded = appliedMovements.outsAdded;
  }

  if (!confirmedMovements && action === "single") {
    runsScored = advanceRunners(game, 1, side);
    placeBatter(game, batterId, "first");
    Object.assign(atBat, { ab: 1, hit: 1, single: 1 });
  }

  if (!confirmedMovements && action === "double") {
    runsScored = advanceRunners(game, 2, side);
    placeBatter(game, batterId, "second");
    Object.assign(atBat, { ab: 1, hit: 1, double: 1 });
  }

  if (!confirmedMovements && action === "triple") {
    runsScored = scoreAllRunners(game, side);
    placeBatter(game, batterId, "third");
    Object.assign(atBat, { ab: 1, hit: 1, triple: 1 });
  }

  if (!confirmedMovements && action === "hr") {
    runsScored = scoreAllRunners(game, side) + scoreRun(game, batterId, side);
    clearBases(game);
    Object.assign(atBat, { ab: 1, hit: 1, hr: 1, run: 1 });
  }

  if (!confirmedMovements && action === "bb") {
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

  if (action === "strikeout") {
    const strikeoutPlay = defensePlay || buildStrikeoutDefensePlay();
    outsAdded = 1;
    setAtBatResultStats(atBat, action);
    Object.assign(atBat, {
      outsAdded,
      defensePlay: strikeoutPlay
    });
    defensePlay = strikeoutPlay;
    addOuts(game, outsAdded);
  }

  if (!confirmedMovements && action === "error") {
    runsScored = advanceRunners(game, 1, side);
    placeBatter(game, batterId, "first");
    atBat.ab = 1;
  }

  if (!confirmedMovements && action === "sacrifice") {
    runsScored = advanceRunners(game, 1, side);
    outsAdded = 1;
    Object.assign(atBat, { outsAdded: 1 });
    addOuts(game, 1);
  }

  if (action === "fielderschoice") {
    defensePlay = defensePlay || buildFielderChoiceDefensePlay(confirmedMovements || []);
    atBat.defensePlay = defensePlay;
  }
  if (action === "doubleplay") {
    defensePlay = defensePlay || buildDoublePlayDefensePlay();
    atBat.defensePlay = defensePlay;
  }

  atBat.rbi = confirmedMovements ? clampRbiValue(confirmedRbi) : runsScored;
  const batter = side === "opponent" ? findOpponentBatter(game, batterId) : findPlayer(batterId);
  const actionInfo = {
    inning: game.currentInning,
    half: game.half,
    battingSide: side,
    batter: batter ? displayBatterName(batter, side, game) : runnerName(batterId, game),
    result: liveResultLabel(action),
    defensePlay: defensePlay?.code || "",
    runsScored,
    runnerMovements: confirmedMovements || [],
    rbi: atBat.rbi,
    createdAt: new Date().toISOString()
  };
  actionInfo.description = buildPlayByPlayDescription(actionInfo, confirmedMovements, atBat.rbi);
  if (confirmedMovements) actionInfo.animation = buildConfirmedMovementAnimation(actionInfo, confirmedMovements);
  atBat.actionType = action;
  atBat.runnerMovements = confirmedMovements ? confirmedMovements.map(normalizeRunnerMovement) : [];
  const playEvent = createPlayByPlayEvent(game, actionInfo);
  game.playByPlay.unshift(playEvent);
  game.playByPlay = game.playByPlay.slice(0, 120);
  game.liveLastAction = playEvent.description;
  getAtBatList(game, side).push(atBat);
  advanceBatterIndex(game, side);
  updateCurrentGame(game, { syncLive: true, playEvent });
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

function usesRunnerMovementModal(action) {
  return ["single", "double", "triple", "hr", "bb", "error", "sacrifice", "fielderschoice", "doubleplay", "runnerout"].includes(action);
}

function recordStrikeout() {
  recordAtBat("strikeout");
}

function recordFielderChoice() {
  recordAtBat("fielderschoice");
}

function buildStrikeoutDefensePlay() {
  return {
    type: "strikeout",
    code: "K",
    positions: [],
    label: "Retrait sur 3 prises"
  };
}

function buildFielderChoiceDefensePlay(movements = []) {
  const outs = calculateOutsFromMovements(movements);
  return {
    type: outs > 1 ? "doubleplay" : "fielder_choice",
    code: outs > 1 ? "DP" : "FC",
    positions: [],
    label: outs > 1 ? "Double jeu sur choix défensif" : "Choix défensif"
  };
}

function buildDoublePlayDefensePlay(code = "") {
  return {
    type: "doubleplay",
    code: String(code || "DP").trim() || "DP",
    positions: String(code || "").split("-").map(Number).filter(Boolean),
    label: "Double jeu"
  };
}

function setAtBatResultStats(atBat, action) {
  if (action === "single") Object.assign(atBat, { ab: 1, hit: 1, single: 1 });
  if (action === "double") Object.assign(atBat, { ab: 1, hit: 1, double: 1 });
  if (action === "triple") Object.assign(atBat, { ab: 1, hit: 1, triple: 1 });
  if (action === "hr") Object.assign(atBat, { ab: 1, hit: 1, hr: 1 });
  if (action === "bb") atBat.bb = 1;
  if (action === "error" || action === "fielderschoice" || action === "runnerout" || action === "doubleplay") atBat.ab = 1;
  if (action === "strikeout") Object.assign(atBat, { ab: 1, strikeout: 1 });
}

function buildDefaultRunnerMovements(actionType, game, batterId = null) {
  const side = getBattingSide(game);
  const batterRunnerId = batterId || (side === "team"
    ? game.lineup[game.currentBatterIndex]
    : game.opponentLineup[game.currentOpponentBatterIndex]?.id);
  const batter = side === "opponent" ? findOpponentBatter(game, batterRunnerId) : findPlayer(batterRunnerId);
  const defaults = [];
  const byBase = [
    ["third", "3B"],
    ["second", "2B"],
    ["first", "1B"]
  ];
  let runnerOutAssigned = false;

  byBase.forEach(([baseKey, from]) => {
    const runnerId = game.bases[baseKey];
    if (!runnerId) return;
    let destination = defaultRunnerDestination(actionType, from, game);
    if (actionType === "runnerout") {
      destination = runnerOutAssigned ? "stay" : "out";
      runnerOutAssigned = true;
    }
    defaults.push(makeRunnerMovement(runnerId, movementRunnerLabel(runnerId, game), from, destination, false));
  });

  defaults.push(makeRunnerMovement(
    batterRunnerId,
    batter ? displayBatterName(batter, side, game) : movementRunnerLabel(batterRunnerId, game),
    "home",
    defaultBatterDestination(actionType),
    true
  ));
  return defaults;
}

function makeRunnerMovement(runnerId, runnerLabel, from, to, isBatter) {
  return normalizeRunnerMovement({
    runnerId,
    runnerLabel,
    from,
    to,
    isBatter
  });
}

function normalizeRunnerMovement(movement) {
  const to = movement.to || "stay";
  return {
    runnerId: movement.runnerId,
    runnerLabel: movement.runnerLabel || "Coureur",
    from: movement.from || "home",
    to,
    scored: to === "home",
    out: to === "out",
    outAt: to === "out" ? (movement.outAt || defaultOutAt(movement)) : "",
    isBatter: movement.isBatter === true
  };
}

function defaultOutAt(movement) {
  if (movement.isBatter) return "1B";
  if (movement.from === "1B") return "2B";
  if (movement.from === "2B") return "3B";
  return "home";
}

function defaultBatterDestination(actionType) {
  return {
    single: "1B",
    double: "2B",
    triple: "3B",
    hr: "home",
    bb: "1B",
    error: "1B",
    sacrifice: "out",
    fielderschoice: "1B",
    runnerout: "1B",
    doubleplay: "out"
  }[actionType] || "1B";
}

function defaultRunnerDestination(actionType, from, game) {
  if (actionType === "fielderschoice") {
    if (from === "1B") return "out";
    return "stay";
  }
  if (actionType === "runnerout") return "out";
  if (actionType === "doubleplay") return from === "1B" ? "out" : "stay";
  if (actionType === "triple" || actionType === "hr") return "home";
  if (actionType === "double") return from === "1B" ? "3B" : "home";
  if (actionType === "bb") return defaultWalkRunnerDestination(from, game);
  if (from === "3B") return "home";
  if (from === "2B") return "3B";
  return "2B";
}

function defaultWalkRunnerDestination(from, game) {
  if (from === "3B") return game.bases.first && game.bases.second && game.bases.third ? "home" : "stay";
  if (from === "2B") return game.bases.first && game.bases.second ? "3B" : "stay";
  return game.bases.first ? "2B" : "stay";
}

function movementRunnerLabel(runnerId, game) {
  const player = findPlayer(runnerId);
  if (player) return formatPlayer(player);
  return opponentRunnerName(runnerId, game);
}

function calculateRunsFromMovements(movements) {
  return movements.filter((movement) => movement.to === "home").length;
}

function calculateOutsFromMovements(movements) {
  return movements.filter((movement) => movement.to === "out").length;
}

function calculateDefaultRbi(actionType, movements) {
  const runs = calculateRunsFromMovements(movements);
  if (["single", "double", "triple", "hr"].includes(actionType)) return Math.min(4, runs);
  if (actionType === "error") return 0;
  if (actionType === "sacrifice") return runs ? 1 : 0;
  if (actionType === "bb") return Math.min(4, runs);
  if (actionType === "fielderschoice") return 0;
  if (actionType === "runnerout" || actionType === "doubleplay") return 0;
  return 0;
}

function clampRbiValue(value) {
  const number = Number(value || 0);
  return Math.min(4, Math.max(0, Number.isFinite(number) ? Math.round(number) : 0));
}

function validateRunnerMovements(movements) {
  const validTo = new Set(["out", "1B", "2B", "3B", "home", "stay"]);
  const baseOrder = { "1B": 1, "2B": 2, "3B": 3, home: 4 };
  const occupied = new Set();
  for (const movement of movements) {
    if (!movement.runnerId || !validTo.has(movement.to)) return "Chaque coureur doit avoir une destination valide.";
    const finalBase = movement.to === "stay" ? movement.from : movement.to;
    if (["1B", "2B", "3B"].includes(finalBase)) {
      if (occupied.has(finalBase)) return "Deux coureurs ne peuvent pas terminer sur le même but.";
      occupied.add(finalBase);
    }
    if (!movement.isBatter && movement.to !== "stay" && baseOrder[movement.to] && baseOrder[movement.to] < baseOrder[movement.from]) {
      return "Un coureur ne peut pas reculer vers un but précédent.";
    }
  }
  return "";
}

function applyRunnerMovements(game, movements, actionType, rbi, atBat, side) {
  const normalized = movements.map(normalizeRunnerMovement);
  clearBases(game);
  let runsScored = 0;
  let outsAdded = 0;

  normalized.forEach((movement) => {
    const destination = movement.to === "stay" ? movement.from : movement.to;
    if (destination === "out") {
      outsAdded += 1;
      return;
    }
    if (destination === "home") {
      if (movement.isBatter) {
        runsScored += scoreCurrentAtBatRun(game, side);
        atBat.run += 1;
      } else {
        runsScored += scoreRun(game, movement.runnerId, side);
      }
      return;
    }
    const baseKey = movementBaseKey(destination);
    if (baseKey) game.bases[baseKey] = movement.runnerId;
  });

  if (outsAdded) {
    atBat.outsAdded = outsAdded;
    addOuts(game, outsAdded);
  }
  atBat.rbi = clampRbiValue(rbi);
  return { runsScored, outsAdded };
}

function scoreCurrentAtBatRun(game, side) {
  ensureInningScore(game, game.currentInning);
  const inning = game.inningScores[game.currentInning - 1];
  if (side === "opponent") {
    game.scoreOpponent += 1;
    inning.opponent += 1;
  } else {
    game.scoreTeam += 1;
    inning.team += 1;
  }
  return 1;
}

function movementBaseKey(destination) {
  return { "1B": "first", "2B": "second", "3B": "third" }[destination] || "";
}

function buildConfirmedMovementAnimation(actionInfo, movements) {
  const ballPaths = {
    Simple: ["home", "outfield-right"],
    Double: ["home", "outfield-center"],
    Triple: ["home", "outfield-left"],
    Circuit: ["home", "outfield-deep"],
    BB: [],
    Erreur: ["home", "6"],
    Sacrifice: ["home", "outfield-center"]
  };
  const animationMovements = movements
    .filter((movement) => movement.to !== "out" && movement.to !== "stay")
    .map((movement) => ({
      runner: movement.runnerLabel,
      from: movement.from,
      to: movement.to,
      via: movement.isBatter && movement.to === "home" ? ["1B", "2B", "3B"] : []
    }));
  return playAnimation(
    String(actionInfo.result || "").toLowerCase().replaceAll(" ", ""),
    actionInfo,
    ballPaths[actionInfo.result] || ["home", "outfield-center"],
    animationMovements,
    actionInfo.description || `${actionInfo.result} de ${actionInfo.batter}`,
    actionInfo.result === "Circuit" ? 4200 : 3200
  );
}

function openRunnerMovementModal(actionType, defaultMovements, context = {}) {
  pendingRunnerMovementAction = {
    actionType,
    defensePlay: context.defensePlay || null,
    side: context.side || getBattingSide(getCurrentGame()),
    batterId: context.batterId || null,
    movements: defaultMovements.map(normalizeRunnerMovement)
  };
  $("#runnerMovementError").textContent = "";
  $("#runnerMovementTitle").textContent = "Confirmer les déplacements";
  renderRunnerMovementModal();
  $("#runnerMovementModal").classList.remove("hidden");
}

function closeRunnerMovementModal() {
  pendingRunnerMovementAction = null;
  $("#runnerMovementModal").classList.add("hidden");
  $("#runnerMovementError").textContent = "";
}

function renderRunnerMovementModal() {
  const pending = pendingRunnerMovementAction;
  if (!pending) return;
  const game = getCurrentGame();
  const runs = calculateRunsFromMovements(pending.movements);
  const outs = calculateOutsFromMovements(pending.movements);
  $("#runnerMovementSummary").innerHTML = `
    <span class="pill">${escapeHtml(liveResultLabel(pending.actionType))}</span>
    <strong data-runner-summary-runs>${escapeHtml(runs ? `${runs} point${runs > 1 ? "s" : ""} proposé${runs > 1 ? "s" : ""}` : "Aucun point proposé")}</strong>
    <span class="runner-outs-summary" data-runner-summary-outs>Retraits ajoutés : ${outs}</span>
  `;
  $("#runnerMovementRows").innerHTML = pending.movements.map((movement, index) => renderRunnerMovementRow(movement, index)).join("");
  $("#runnerMovementRbi").innerHTML = [0, 1, 2, 3, 4].map((value) => (
    `<option value="${value}" ${value === calculateDefaultRbi(pending.actionType, pending.movements) ? "selected" : ""}>${value}</option>`
  )).join("");
  $("#runnerDefenseCodeField").classList.toggle("hidden", pending.actionType !== "doubleplay");
  $("#runnerMovementDefenseCode").value = pending.defensePlay?.code && pending.defensePlay.code !== "DP" ? pending.defensePlay.code : "";
  $("#runnerMovementRows").dataset.battingSide = pending.side || (game ? getBattingSide(game) : "team");
}

function renderRunnerMovementRow(movement, index) {
  const options = runnerDestinationOptions(movement);
  const fromLabel = movement.isBatter ? "Départ marbre" : `Départ ${movement.from}`;
  return `
    <section class="runner-movement-row">
      <div class="runner-movement-player">
        <span>${movement.isBatter ? "Frappeur" : "Coureur"}</span>
        <strong>${escapeHtml(movement.runnerLabel)}</strong>
        <span>${escapeHtml(fromLabel)}</span>
      </div>
      <div class="runner-destination-group">
        <span class="runner-destination-label">Destination finale</span>
        <div class="runner-destination-options" role="radiogroup" aria-label="Destination ${escapeHtml(movement.runnerLabel)}">
          ${options.map((option) => `
            <label>
              <input type="radio" name="runnerDestination${index}" value="${option.value}" data-runner-movement-index="${index}" ${movement.to === option.value ? "checked" : ""}>
              ${escapeHtml(option.label)}
            </label>
          `).join("")}
        </div>
        ${movement.to === "out" ? renderRunnerOutAtControl(movement, index) : ""}
      </div>
    </section>
  `;
}

function renderRunnerOutAtControl(movement, index) {
  return `
    <label class="runner-out-at">Retiré à
      <select data-runner-out-at-index="${index}">
        ${[
          ["1B", "1B"],
          ["2B", "2B"],
          ["3B", "3B"],
          ["home", "Marbre"]
        ].map(([value, label]) => `<option value="${value}" ${movement.outAt === value ? "selected" : ""}>${label}</option>`).join("")}
      </select>
    </label>
  `;
}

function runnerDestinationOptions(movement) {
  if (movement.isBatter) {
    return [
      { value: "out", label: "Retiré" },
      { value: "1B", label: "1B" },
      { value: "2B", label: "2B" },
      { value: "3B", label: "3B" },
      { value: "home", label: "Marbre" }
    ];
  }

  const currentOrder = { "1B": 1, "2B": 2, "3B": 3 }[movement.from] || 1;
  const baseOptions = [
    { value: "1B", label: "1B", order: 1 },
    { value: "2B", label: "2B", order: 2 },
    { value: "3B", label: "3B", order: 3 }
  ].filter((option) => option.order > currentOrder);
  return [
    { value: "stay", label: `Reste ${movement.from}` },
    ...baseOptions,
    { value: "home", label: "Marbre" },
    { value: "out", label: "Retiré" }
  ];
}

function updateRunnerMovementModalState(event) {
  if (!pendingRunnerMovementAction) return;
  if (event.target.matches("[data-runner-out-at-index]")) {
    const outAtIndex = Number(event.target.dataset.runnerOutAtIndex);
    pendingRunnerMovementAction.movements[outAtIndex] = normalizeRunnerMovement({
      ...pendingRunnerMovementAction.movements[outAtIndex],
      outAt: event.target.value
    });
    $("#runnerMovementError").textContent = "";
    return;
  }
  if (!event.target.matches("[data-runner-movement-index]")) return;
  const index = Number(event.target.dataset.runnerMovementIndex);
  pendingRunnerMovementAction.movements[index] = normalizeRunnerMovement({
    ...pendingRunnerMovementAction.movements[index],
    to: event.target.value
  });
  const runs = calculateRunsFromMovements(pendingRunnerMovementAction.movements);
  const outs = calculateOutsFromMovements(pendingRunnerMovementAction.movements);
  $("#runnerMovementSummary [data-runner-summary-runs]").textContent = runs ? `${runs} point${runs > 1 ? "s" : ""} proposé${runs > 1 ? "s" : ""}` : "Aucun point proposé";
  $("#runnerMovementSummary [data-runner-summary-outs]").textContent = `Retraits ajoutés : ${outs}`;
  $("#runnerMovementRbi").value = String(calculateDefaultRbi(pendingRunnerMovementAction.actionType, pendingRunnerMovementAction.movements));
  $("#runnerMovementError").textContent = "";
  $("#runnerMovementRows").innerHTML = pendingRunnerMovementAction.movements.map((movement, movementIndex) => renderRunnerMovementRow(movement, movementIndex)).join("");
}

function confirmRunnerMovementModal() {
  const pending = pendingRunnerMovementAction;
  if (!pending) return;
  const movements = pending.movements.map(normalizeRunnerMovement);
  const error = validateRunnerMovements(movements);
  if (error) {
    $("#runnerMovementError").textContent = error;
    return;
  }
  const actionType = pending.actionType;
  const defenseCode = $("#runnerMovementDefenseCode").value.trim();
  const defensePlay = actionType === "doubleplay" ? buildDoublePlayDefensePlay(defenseCode) : pending.defensePlay;
  const rbi = clampRbiValue($("#runnerMovementRbi").value);
  closeRunnerMovementModal();
  recordAtBat(actionType, defensePlay, true, movements, rbi);
}

function openEditRunnersModal() {
  const game = getCurrentGame();
  if (!game || normalizeGameStatus(game.status) === "completed") return showToast("Aucune partie active.", "warning");
  if (!canCurrentDeviceScore(game)) return showToast("Mode lecture seule : prenez le relais pour modifier les coureurs.", "warning");
  $("#editRunnersError").textContent = "";
  $("#editRunnersRows").innerHTML = ["1B", "2B", "3B"].map((base) => renderManualRunnerRow(base, game)).join("");
  renderManualRunnerNumberInputs();
  $("#editRunnersModal").classList.remove("hidden");
}

function closeEditRunnersModal() {
  $("#editRunnersModal").classList.add("hidden");
  $("#editRunnersError").textContent = "";
}

function renderManualRunnerRow(base, game) {
  const baseKey = movementBaseKey(base);
  const runnerId = game.bases[baseKey];
  const side = getBattingSide(game);
  const options = manualRunnerOptions(game, side, runnerId);
  return `
    <section class="edit-runner-row">
      <strong>${base}</strong>
      <div class="edit-runner-controls">
        <label>Coureur
          <select data-manual-base="${base}">
            ${options.map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === (runnerId || "") ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
          </select>
        </label>
        <label class="manual-runner-number ${side === "opponent" ? "" : "hidden"}">Nouveau numéro adverse
          <input data-manual-number="${base}" type="number" min="0" max="999">
        </label>
      </div>
    </section>
  `;
}

function manualRunnerOptions(game, side, runnerId) {
  const empty = [{ value: "", label: "Vider le but" }];
  if (side === "team") {
    const ids = [...new Set([...(game.lineup || []), ...(runnerId ? [runnerId] : [])])];
    return empty.concat(ids.map((id) => ({ value: id, label: movementRunnerLabel(id, game) })));
  }
  return empty
    .concat(game.opponentLineup.map((batter) => ({ value: batter.id, label: opponentBatterName(batter, game) })))
    .concat([{ value: "__new__", label: "Entrer un nouveau numéro" }]);
}

function renderManualRunnerNumberInputs() {
  $$("#editRunnersRows [data-manual-base]").forEach((select) => {
    const label = select.closest(".edit-runner-controls")?.querySelector(".manual-runner-number");
    if (!label) return;
    label.classList.toggle("hidden", select.value !== "__new__");
  });
}

function applyManualBaseEdit() {
  const game = getCurrentGame();
  if (!game) return;
  if (!canCurrentDeviceScore(game)) return showToast("Mode lecture seule : prenez le relais pour modifier les coureurs.", "warning");
  const selectedIds = [];
  const nextBases = { first: null, second: null, third: null };
  for (const select of $$("#editRunnersRows [data-manual-base]")) {
    let runnerId = select.value;
    if (runnerId === "__new__") {
      const number = select.closest(".edit-runner-row")?.querySelector("[data-manual-number]")?.value.trim();
      if (!number) {
        $("#editRunnersError").textContent = "Entrez le numéro du nouveau coureur adverse.";
        return;
      }
      const existing = findOpponentBatterByNumber(number);
      const batter = existing || createOpponentPlayer(number, game);
      if (!existing) game.opponentLineup.push(batter);
      runnerId = batter.id;
    }
    if (runnerId && selectedIds.includes(runnerId)) {
      $("#editRunnersError").textContent = "Le même joueur ne peut pas occuper deux buts.";
      return;
    }
    if (runnerId) selectedIds.push(runnerId);
    nextBases[movementBaseKey(select.dataset.manualBase)] = runnerId || null;
  }
  snapshotGame(game);
  game.bases = nextBases;
  updateCurrentGame(game, { syncLive: true });
  closeEditRunnersModal();
  renderAll();
  showToast("Coureurs mis à jour.", "success");
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
    strikeout: "Retrait sur 3 prises enregistré",
    error: "Erreur enregistrée",
    fielderschoice: "Choix défensif enregistré",
    doubleplay: "Double jeu enregistré",
    runnerout: "Retrait de coureur enregistré",
    sacrifice: "Sacrifice enregistré"
  };
  return `${labels[action] || "Action enregistrée"}${runText}`;
}

function makeAtBat(game, playerId, result, side) {
  return {
    id: createId("ab"),
    playerId,
    batterId: playerId,
    batterSnapshot: createBatterSnapshot(playerId, side, game),
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
    strikeout: 0,
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
  if (!canCurrentDeviceScore(game)) return showToast("Mode lecture seule : prenez le relais pour changer de demi-manche.", "warning");
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
  updateCurrentGame(game, { syncLive: true, playEvent });
  renderAll();
  playGameAnimation(playEvent.animation);
  showToast("Demi-manche changée.", "info");
}

function adjustOpponentScore(delta) {
  const game = getCurrentGame();
  if (!game) return;
  if (!canCurrentDeviceScore(game)) return showToast("Mode lecture seule : prenez le relais pour modifier le score.", "warning");
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
  updateCurrentGame(game, { syncLive: true, playEvent });
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
  if (!canCurrentDeviceScore(game)) return showToast("Mode lecture seule : prenez le relais pour terminer la partie.", "warning");
  if (!confirm("Terminer la partie?")) return;
  snapshotGame(game);
  game.status = "terminée";
  if (game.scorerLock?.deviceId === getDeviceId()) {
    game.scorerLock = null;
    game.activeScorerDevice = null;
    stopScorerHeartbeat();
  }
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
  updateCurrentGame(game, { syncLive: true, playEvent });
  renderAll();
  showToast("Partie terminée.", "success");
}

function undoLastAction() {
  const game = getCurrentGame();
  if (game && !canCurrentDeviceScore(game)) return showToast("Mode lecture seule : prenez le relais pour annuler une action.", "warning");
  if (!game || !game.history.length) return showToast("Aucune action à annuler.", "warning");
  const previous = game.history.pop();
  previous.history = game.history;
  updateCurrentGame(previous);
  renderAll();
  showToast("Dernière action annulée.", "warning");
}

function editLastAction() {
  const game = getCurrentGame();
  if (!game) return;
  if (!canCurrentDeviceScore(game)) return showToast("Mode lecture seule : prenez le relais pour modifier une action.", "warning");
  const last = [...game.atBats, ...game.opponentAtBats]
    .filter((atBat) => Array.isArray(atBat.runnerMovements) && atBat.runnerMovements.length)
    .sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")))[0];
  if (!last) return showToast("Cette action se corrige avec Annuler ou Modifier les coureurs.", "info");
  const movements = last.runnerMovements.map(normalizeRunnerMovement);
  const actionType = last.actionType || actionTypeFromResult(last.result);
  const defensePlay = last.defensePlay || null;
  const rbi = last.rbi || 0;
  undoLastAction();
  openRunnerMovementModal(actionType, movements, { defensePlay, side: last.side, batterId: last.playerId });
  $("#runnerMovementRbi").value = String(clampRbiValue(rbi));
}

function actionTypeFromResult(result) {
  return {
    Simple: "single",
    Double: "double",
    Triple: "triple",
    Circuit: "hr",
    BB: "bb",
    Erreur: "error",
    Sacrifice: "sacrifice",
    FC: "fielderschoice",
    DP: "doubleplay"
  }[String(result || "")] || "runnerout";
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
  appLog("Rendu écran Match", "info");
  const game = getCurrentGame();
  if (!game || !canOpenLiveMatch(game)) {
    renderMatchScreen(game);
    $("#outsDots").innerHTML = renderOutDots(0);
    renderBases(null);
    renderPlayByPlay(game);
    renderMobileQuickActionBar(null);
    renderCompactInteractiveBases(null);
    renderMobileSituationDetails(null);
    renderLastActionCard(null);
    return;
  }

  game.bases = normalizeGameBases(game.bases);
  game.atBats = Array.isArray(game.atBats) ? game.atBats : [];
  game.opponentAtBats = Array.isArray(game.opponentAtBats) ? game.opponentAtBats : [];
  game.playByPlay = Array.isArray(game.playByPlay) ? game.playByPlay : [];
  appData.team = appData.team || { name: "Mon equipe", players: [] };
  appData.team.players = Array.isArray(appData.team.players) ? appData.team.players : [];

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
  const teamLineupStatus = lineupStatusLabel(game, "team");
  const opponentLineupStatus = game.opponentTrackingMode === "complete" ? lineupStatusLabel(game, "opponent") : "Suivi simplifiÃ©";
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
  renderMobileGameScoreboard(game);

  $("#liveInfo").innerHTML = gameCards([
    ["Équipe au bâton", battingLabel],
    ["Mode adverse", modeLabel],
    ["Alignement", lineupStatus],
    ["Notre alignement", teamLineupStatus],
    ["Alignement adverse", opponentLineupStatus],
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
  const canLockTeam = game.lineupMode === "dynamic" && !game.teamLineupLocked && game.lineup.length >= MIN_LINEUP_SIZE;
  const canLockOpponent = game.opponentTrackingMode === "complete" && game.opponentLineupMode === "dynamic" && !game.opponentLineupLocked && game.opponentLineup.length >= MIN_LINEUP_SIZE;
  $("#lockTeamLineupBtn").disabled = !canLockTeam;
  $("#lockTeamLineupBtn").textContent = game.teamLineupLocked ? "Alignement verrouillÃ©" : "Verrouiller notre alignement";
  $("#unlockTeamLineupBtn").classList.toggle("hidden", !(game.lineupMode === "dynamic" && game.teamLineupLocked));
  $("#lockOpponentLineupBtn").disabled = !canLockOpponent;
  $("#lockOpponentLineupBtn").textContent = game.opponentLineupLocked ? "Alignement adverse verrouillÃ©" : "Verrouiller alignement adverse";
  $("#unlockOpponentLineupBtn").classList.toggle("hidden", !(game.opponentTrackingMode === "complete" && game.opponentLineupMode === "dynamic" && game.opponentLineupLocked));
  $$(".hit-actions button").forEach((button) => {
    button.disabled = battingSide === "opponent" && game.opponentTrackingMode === "simple";
  });

  $("#outsDots").innerHTML = renderOutDots(game.outs);
  renderAnimatedField(game);
  renderBases(game);
  renderPlayByPlay(game);
  renderMobileScorerTabs();
  renderMobileQuickActionBar(game);
  renderCompactInteractiveBases(game);
  renderMobileSituationDetails(game);
  renderLastActionCard(game);
  updateScoringControlState(game);
}

function renderMobileGameScoreboard(game) {
  const scoreboard = $("#liveScoreboard");
  if (!scoreboard || !game) return;
  const batterSummary = renderCurrentBatterSummary(game);
  scoreboard.innerHTML += `
    <div class="mobile-game-scoreboard">
      <div class="mobile-score-line"><span>${escapeHtml(appData.team.name)}</span><strong>${game.scoreTeam}</strong></div>
      <div class="mobile-score-line"><span>${escapeHtml(game.opponent || "Adversaire")}</span><strong>${game.scoreOpponent}</strong></div>
      <div class="mobile-score-meta-grid">
        <span>Manche <strong>${escapeHtml(formatHalfInningSummary(game))}</strong></span>
        <span>Retraits <strong>${game.outs} / 3</strong></span>
      </div>
      <p>Frappeur <strong>${escapeHtml(batterSummary.label)}</strong></p>
      <div class="mobile-batter-summary">
        <span>Moyenne <strong>${escapeHtml(batterSummary.average)}</strong></span>
        <span>Match <strong>${escapeHtml(batterSummary.gameAtBats)}</strong></span>
      </div>
    </div>
  `;
}

function getNextBatterLabel(game) {
  const side = getBattingSide(game);
  const next = getNextBatter(game);
  return next ? displayBatterName(next, side, game) : "À confirmer";
}

function getCurrentBatterLabel(game) {
  const side = getBattingSide(game);
  const batter = getCurrentBatter(game);
  return batter ? displayBatterName(batter, side, game) : "À confirmer";
}

function renderCurrentBatterSummary(game) {
  const side = getBattingSide(game);
  const batter = getCurrentBatter(game);
  const batterId = side === "opponent" ? batter?.id : batter?.id;
  return {
    label: batter ? displayBatterName(batter, side, game) : "À confirmer",
    average: batter && side === "team" ? getPlayerCumulativeAverage(batterId) : "—",
    gameAtBats: batter ? formatCurrentBatterGameAtBats(game, batterId, side) : "Aucune apparition"
  };
}

function getPlayerCumulativeAverage(playerId) {
  const stat = calculatePlayerSeasonStats(playerId);
  return formatBattingAverage(stat.ab ? stat.hit / stat.ab : 0, stat.ab);
}

function getCurrentBatterGameAtBats(game, batterId, side = getBattingSide(game)) {
  if (!game || !batterId) return [];
  return getAtBatList(game, side).filter((atBat) => atBat.playerId === batterId);
}

function formatCurrentBatterGameAtBats(game, batterId, side) {
  const appearances = getCurrentBatterGameAtBats(game, batterId, side);
  if (!appearances.length) return "Aucune apparition";
  return appearances.slice(-4).map((atBat) => atBat.result || "-").join(", ");
}

function getBattingSideLabel(game) {
  return getBattingSide(game) === "team" ? "Notre équipe" : "Adversaire";
}

function renderLineupStatusSummary(game) {
  const side = getBattingSide(game);
  const count = side === "team" ? game.lineup.length : game.opponentLineup.length;
  const expected = side === "team" ? game.expectedTeamBattersCount : game.expectedOpponentBattersCount;
  const locked = side === "team" ? game.teamLineupLocked : game.opponentLineupLocked;
  return locked ? `Alignement verrouillé — ${count} frappeur${count > 1 ? "s" : ""}` : `En construction — ${count} / ${expected}`;
}

function renderRunLimitSummary(game) {
  if (!game.runLimitEnabled || !game.runLimitPerInning) return "Aucune limite";
  return `${getCurrentHalfInningRuns(game)} / ${game.runLimitPerInning} points`;
}

function renderLastActionSummary(game) {
  return game.playByPlay?.[0]?.description || "Aucune action";
}

function formatHalfInningSummary(game) {
  return `${game.half === "haut" ? "Haut" : "Bas"} ${game.currentInning}e`;
}

function renderMobileSituationDetails(game) {
  const details = $("#mobileSituationDetails");
  if (!details) return;
  if (!game) {
    details.innerHTML = "";
    return;
  }
  const side = getBattingSide(game);
  const addedBatters = side === "team" ? (game.lineup || []).length : (game.opponentLineup || []).length;
  details.innerHTML = `
    <section class="mobile-situation-detail-card">
      <h3>Détails de la situation</h3>
      <dl>
        <div><dt>Équipe au bâton</dt><dd>${escapeHtml(getBattingSideLabel(game))}</dd></div>
        <div><dt>Frappeur actuel</dt><dd>${escapeHtml(getCurrentBatterLabel(game))}</dd></div>
        <div><dt>Prochain frappeur</dt><dd>${escapeHtml(getNextBatterLabel(game))}</dd></div>
        <div><dt>Alignement</dt><dd>${escapeHtml(renderLineupStatusSummary(game))}</dd></div>
        <div><dt>Frappeurs ajoutes</dt><dd>${addedBatters}</dd></div>
        <div><dt>Limite de points</dt><dd>${escapeHtml(renderRunLimitSummary(game))}</dd></div>
        <div><dt>Points demi-manche</dt><dd>${getCurrentHalfInningRuns(game)}</dd></div>
        <div><dt>Statut cloud</dt><dd>${escapeHtml(cloudSaveStatusLabel(game))}</dd></div>
      </dl>
    </section>
  `;
}

function renderMobileScorerTabs() {
  const tabs = $("#mobileScorerTabs");
  const liveLayout = $("#liveLayout");
  if (!tabs || !liveLayout) return;
  liveLayout.dataset.mobileTab = activeMobileScorerTab;
  tabs.innerHTML = [
    ["situation", "Situation"],
    ["scoring", "Marquer"],
    ["history", "Historique"]
  ].map(([tab, label]) => `<button type="button" class="${tab === activeMobileScorerTab ? "active" : ""}" onclick="setActiveScorerTab('${tab}')">${label}</button>`).join("");
}

function setActiveScorerTab(tabName) {
  activeMobileScorerTab = ["situation", "scoring", "history"].includes(tabName) ? tabName : "situation";
  renderMobileScorerTabs();
}

function renderMobileQuickActionBar(game) {
  const bar = $("#mobileQuickActionBar");
  if (!bar) return;
  if (!game || !canOpenLiveMatch(game)) {
    bar.innerHTML = "";
    bar.classList.add("hidden");
    return;
  }
  bar.classList.remove("hidden");
  bar.innerHTML = `
    <button type="button" onclick="triggerScorerAction('single')">Simple</button>
    <button type="button" onclick="triggerScorerAction('double')">Double</button>
    <button type="button" onclick="triggerScorerAction('bb')">BB</button>
    <button type="button" onclick="triggerScorerAction('strikeout')">K</button>
    <button type="button" onclick="openOutOptionsModal()">Retrait</button>
    <button type="button" class="primary-btn" onclick="openMoreActionsPanel()">Plus</button>
  `;
}

function triggerScorerAction(action) {
  appLog(`Clic action marqueur : ${action}`, "info");
  if (!ensureAdminBeforeScoring()) return;
  closeMoreActionsPanel();
  if (action === "out") return openOutOptionsModal();
  confirmBatterBeforeAction(action);
}

function openMoreActionsPanel() {
  const panel = $("#mobileMoreActionsPanel");
  if (!panel) return;
  panel.innerHTML = `
    <div class="mobile-more-title"><strong>Plus d’actions</strong><button type="button" onclick="closeMoreActionsPanel()">Fermer</button></div>
    <div class="mobile-more-grid">
      <button type="button" onclick="triggerScorerAction('triple')">Triple</button>
      <button type="button" onclick="triggerScorerAction('hr')">Circuit</button>
      <button type="button" onclick="triggerScorerAction('error')">Erreur</button>
      <button type="button" onclick="triggerScorerAction('sacrifice')">Sacrifice</button>
      <button type="button" onclick="triggerScorerAction('fielderschoice')">Choix defensif</button>
      <button type="button" onclick="triggerScorerAction('doubleplay')">Double jeu</button>
      <button type="button" onclick="closeMoreActionsPanel();openEditRunnersModal()">Modifier coureurs</button>
      <button type="button" onclick="closeMoreActionsPanel();endHalfInning(true)">Fin demi-manche</button>
    </div>
  `;
  panel.classList.remove("hidden");
}

function closeMoreActionsPanel() {
  $("#mobileMoreActionsPanel")?.classList.add("hidden");
}

function renderCompactInteractiveBases(game) {
  const field = $("#mobileSituationField");
  if (!field) return;
  if (!game) {
    field.innerHTML = "";
    return;
  }
  game.bases = normalizeGameBases(game.bases);
  field.innerHTML = `
    <div class="compact-interactive-field">
      ${["2B", "3B", "1B"].map((base) => {
        const runnerId = game.bases[movementBaseKey(base)];
        return `<button type="button" class="compact-base compact-${base.toLowerCase()}" onclick="openBaseActionMenu('${base}')"><strong>${base}</strong><span>${escapeHtml(runnerId ? runnerName(runnerId, game) : "Vide")}</span></button>`;
      }).join("")}
      <button type="button" class="compact-base compact-home" onclick="openEditRunnersModal()"><strong>Marbre</strong><span>${escapeHtml(getCurrentBatterLabel(game))}</span></button>
    </div>
  `;
}

function openBaseActionMenu(base) {
  const game = getCurrentGame();
  const menu = $("#baseActionMenu");
  if (!game || !menu) return;
  game.bases = normalizeGameBases(game.bases);
  const runnerId = game.bases[movementBaseKey(base)];
  menu.innerHTML = `
    <div class="base-action-card">
      <div class="mobile-more-title"><strong>${base} : ${escapeHtml(runnerId ? runnerName(runnerId, game) : "Vide")}</strong></div>
      <div class="mobile-more-grid">
        <button type="button" onclick="openBaseMoveMenu('${base}')">Deplacer</button>
        <button type="button" onclick="removeRunnerFromBase('${base}')">Retirer</button>
        <button type="button" onclick="scoreRunnerFromBase('${base}')">Marquer</button>
        <button type="button" onclick="clearBase('${base}')">Vider la base</button>
        <button type="button" onclick="closeBaseActionMenu()">Annuler</button>
      </div>
    </div>
  `;
  menu.classList.remove("hidden");
}

function openBaseMoveMenu(base) {
  const game = getCurrentGame();
  const menu = $("#baseActionMenu");
  if (!game || !menu) return;
  game.bases = normalizeGameBases(game.bases);
  const runnerId = game.bases[movementBaseKey(base)];
  if (!runnerId) return showToast("Cette base est vide.", "info");
  const destinations = base === "1B" ? ["2B", "3B"] : base === "2B" ? ["3B"] : [];
  if (!destinations.length) return showToast("Utilisez Marquer pour envoyer ce coureur au marbre.", "info");
  menu.innerHTML = `
    <div class="base-action-card">
      <div class="mobile-more-title"><strong>Deplacer ${escapeHtml(runnerName(runnerId, game))}</strong></div>
      <div class="mobile-more-grid">
        ${destinations.map((destination) => `<button type="button" onclick="moveRunnerFromBase('${base}','${destination}')">Vers ${destination}</button>`).join("")}
        <button type="button" onclick="openBaseActionMenu('${base}')">Retour</button>
        <button type="button" onclick="closeBaseActionMenu()">Annuler</button>
      </div>
    </div>
  `;
  menu.classList.remove("hidden");
}

function closeBaseActionMenu() {
  $("#baseActionMenu")?.classList.add("hidden");
}

function moveRunnerFromBase(base, destination) {
  const game = getCurrentGame();
  if (game && !canCurrentDeviceScore(game)) return showToast("Mode lecture seule : prenez le relais pour modifier les coureurs.", "warning");
  if (!game) return showToast("Aucune partie active.", "warning");
  game.bases = normalizeGameBases(game.bases);
  const fromKey = movementBaseKey(base);
  const runnerId = game?.bases[fromKey];
  if (!runnerId) return showToast("Cette base est vide.", "info");
  const toKey = movementBaseKey(destination);
  if (toKey && game.bases[toKey]) return showToast("Cette base est déjà occupée.", "warning");
  snapshotGame(game);
  game.bases[fromKey] = null;
  if (destination === "home") scoreRun(game, runnerId, getBattingSide(game));
  else game.bases[toKey] = runnerId;
  updateCurrentGame(game, { syncLive: true });
  closeBaseActionMenu();
  renderAll();
}

function scoreRunnerFromBase(base) {
  return moveRunnerFromBase(base, "home");
}

function clearBase(base) {
  const game = getCurrentGame();
  if (!game) return;
  if (!canCurrentDeviceScore(game)) return showToast("Mode lecture seule : prenez le relais pour modifier les coureurs.", "warning");
  game.bases = normalizeGameBases(game.bases);
  snapshotGame(game);
  game.bases[movementBaseKey(base)] = null;
  updateCurrentGame(game, { syncLive: true });
  closeBaseActionMenu();
  renderAll();
}

function removeRunnerFromBase(base) {
  const game = getCurrentGame();
  if (game && !canCurrentDeviceScore(game)) return showToast("Mode lecture seule : prenez le relais pour modifier les coureurs.", "warning");
  if (!game) return showToast("Aucune partie active.", "warning");
  game.bases = normalizeGameBases(game.bases);
  if (!game?.bases[movementBaseKey(base)]) return showToast("Cette base est vide.", "info");
  snapshotGame(game);
  game.bases[movementBaseKey(base)] = null;
  addOuts(game, 1);
  updateCurrentGame(game, { syncLive: true });
  closeBaseActionMenu();
  renderAll();
  if (game.outs >= 3 && confirm("Trois retraits. Changer de demi-manche?")) endHalfInning(false);
}

function renderLastActionCard(game) {
  const card = $("#lastActionCard");
  if (!card) return;
  const last = game?.playByPlay?.[0];
  const parts = last ? [
    last.batter ? `Frappeur : ${last.batter}` : "",
    last.result ? `Resultat : ${last.result}` : "",
    last.runsScored ? `Points : ${last.runsScored}` : "",
    last.defensePlay ? `Jeu defensif : ${last.defensePlay}` : ""
  ].filter(Boolean) : [];
  card.innerHTML = `
    <p class="eyebrow">Dernière action</p>
    <strong>${escapeHtml(last?.description || "Aucune action enregistrée")}</strong>
    ${parts.length ? `<span>${escapeHtml(parts.join(" - "))}</span>` : ""}
    ${last ? `<span>${escapeHtml([last.result, last.defensePlay, last.runsScored ? `${last.runsScored} point${last.runsScored > 1 ? "s" : ""}` : ""].filter(Boolean).join(" · "))}</span>` : ""}
    <div class="last-action-buttons">
      <button type="button" class="warning-btn" onclick="undoLastAction()">Annuler</button>
      <button type="button" onclick="editLastAction()">Modifier</button>
    </div>
  `;
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
  const games = Array.isArray(appData?.games) ? appData.games : [];
  return `
    <div class="match-state-card">
      <h2>Aucune partie active</h2>
      <p>Aucune partie active. Creez ou ouvrez une partie depuis le calendrier.</p>
      <div class="form-actions">
        <button class="primary-btn" onclick="openCalendar()">Ouvrir le calendrier</button>
        ${games.some((game) => normalizeGameStatus(game.status) === "preparation") ? `<button onclick="openFirstPreparationGame()">Voir les parties en préparation</button>` : ""}
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

function lineupStatusLabel(game, side) {
  const dynamic = side === "opponent" ? game.opponentLineupMode === "dynamic" : game.lineupMode === "dynamic";
  const locked = side === "opponent" ? game.opponentLineupLocked : game.teamLineupLocked;
  const count = side === "opponent" ? game.opponentLineup.length : game.lineup.length;
  const expected = side === "opponent" ? game.expectedOpponentBattersCount : game.expectedTeamBattersCount;
  if (!dynamic) return "Alignement prÃ©parÃ©";
  if (locked) return `Alignement verrouillÃ© (${count} frappeur${count > 1 ? "s" : ""})`;
  return `Alignement en construction (${count} / ${expected} frappeurs)`;
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
    runnerMovements: Array.isArray(actionInfo.runnerMovements) ? actionInfo.runnerMovements : [],
    rbi: Number(actionInfo.rbi || 0),
    description: actionInfo.description || buildPlayByPlayDescription(actionInfo),
    createdAt: actionInfo.createdAt || new Date().toISOString()
  };
  event.animation = actionInfo.animation || buildPlayAnimation(event, game);
  return event;
}

function buildPlayAnimation(actionInfo, game = null) {
  const result = String(actionInfo.result || "").toLowerCase();
  const code = actionInfo.defensePlay || "";
  if (code === "K" || result.includes("3 prises")) {
    return playAnimation("strikeout", actionInfo, [], [], actionInfo.description || "Retrait sur 3 prises", 2400);
  }
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

function buildPlayByPlayDescription(actionInfo, runnerMovements = actionInfo.runnerMovements || [], rbi = actionInfo.rbi || 0) {
  runnerMovements = Array.isArray(runnerMovements) ? runnerMovements : [];
  if (actionInfo.result === "Retrait sur 3 prises") {
    return `${actionInfo.batter} : Retrait sur 3 prises.`;
  }
  if (runnerMovements.length) {
    const movements = runnerMovements.map(normalizeRunnerMovement);
    const scored = movements.filter((movement) => movement.to === "home");
    const outs = movements.filter((movement) => movement.to === "out");
    const runnersOut = outs.filter((movement) => !movement.isBatter);
    const advanced = movements.filter((movement) => (
      !movement.isBatter && !["home", "out", "stay"].includes(movement.to)
    ));
    const notes = [];
    if ((actionInfo.result === "Choix défensif" || actionInfo.result === "Double jeu") && outs.length > 1) {
      return `${actionInfo.batter} : Double jeu${actionInfo.defensePlay && !["FC", "DP"].includes(actionInfo.defensePlay) ? ` ${actionInfo.defensePlay}` : ""}.`;
    }
    if (scored.length > 1) notes.push(`${scored.length} points marqués`);
    scored.slice(0, scored.length > 1 ? 0 : scored.length).forEach((movement) => notes.push(`${movement.runnerLabel} marque`));
    if (!notes.length && advanced.length === 1) notes.push(`${actionInfo.result === "BB" ? "Coureur forcé" : "Coureur"} au ${advanced[0].to}`);
    if (!notes.length && advanced.length > 1) notes.push(`${advanced.length} coureurs avancent`);
    runnersOut.forEach((movement) => notes.push(buildRunnerOutDescription(movement)));
    const batterOut = outs.find((movement) => movement.isBatter);
    if (batterOut && actionInfo.result !== "Sacrifice") notes.push(buildRunnerOutDescription(batterOut));
    if (rbi) notes.push(`${rbi} PP`);
    return `${actionInfo.batter} : ${actionInfo.result}.${notes.length ? ` ${notes.join(". ")}.` : ""}`;
  }
  const runs = actionInfo.runsScored > 0 ? `, ${actionInfo.runsScored} point${actionInfo.runsScored > 1 ? "s" : ""} marqué${actionInfo.runsScored > 1 ? "s" : ""}` : "";
  return `${actionInfo.batter} : ${actionInfo.result}${actionInfo.defensePlay ? ` ${actionInfo.defensePlay}` : ""}${runs}`;
}

function buildRunnerOutDescription(movement) {
  const label = movement.isBatter ? "Frappeur" : movement.runnerLabel;
  return `${label} retiré${movement.outAt ? ` au ${movement.outAt === "home" ? "marbre" : movement.outAt}` : ""}`;
}

function liveResultLabel(action) {
  return {
    single: "Simple",
    double: "Double",
    triple: "Triple",
    hr: "Circuit",
    bb: "BB",
    out: "Retrait",
    strikeout: "Retrait sur 3 prises",
    error: "Erreur",
    fielderschoice: "Choix défensif",
    doubleplay: "Double jeu",
    runnerout: "Balle en jeu",
    sacrifice: "Sacrifice"
  }[action] || action;
}

function renderLiveBroadcastPanel(game) {
  const panel = $("#liveBroadcastPanel");
  if (!panel) return;
  if (!game.publicGameId) {
    ensurePublicGameId(game);
    saveData();
  }
  if (game.liveEnabled && (!game.publicGameId || !game.liveShareUrl)) {
    ensureLiveShareFields(game);
    updateCurrentGame(game);
  }
  const liveState = game.liveEnabled ? (navigator.onLine ? "Live actif" : "Live en attente de connexion") : "Live inactif";
  const shareUrl = game.liveShareUrl || "";
  const resumeCode = ensurePublicGameId(game);
  const resumeUrl = getResumeShareUrl(game);
  const cloudStatus = cloudSaveStatusLabel(game);
  const scorerLockStatus = renderScorerLockBadge(game);
  const scorerLockWarning = renderScorerLockWarning(game);
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
    <div class="live-broadcast-card cloud-save-card ${game.pendingCloudSave ? "pending" : "active"}">
      <div>
        <span class="mini-badge">${escapeHtml(cloudStatus)}</span>
        <h3>Reprise multi-appareils</h3>
        <p>Utilisez ce code ou ce lien pour continuer la partie sur un autre appareil.</p>
      </div>
      ${scorerLockStatus}
      ${scorerLockWarning}
      <div class="resume-code-block">
        <span>Code de reprise</span>
        <strong>${escapeHtml(resumeCode)}</strong>
      </div>
      <label class="share-link-label">Lien de reprise
        <input class="share-link-input" value="${escapeHtml(resumeUrl)}" readonly onclick="this.select()">
      </label>
      <div class="home-card-actions">
        <button onclick="copyResumeCode()">Copier le code</button>
        <button onclick="copyResumeShareLink()">Copier le lien de reprise</button>
        <button onclick="refreshCurrentGameFromCloud()">Rafraîchir depuis le cloud</button>
        <button onclick="subscribeToCurrentCloudGame()">Sync temps réel marqueur</button>
        <button class="primary-btn" onclick="syncFullGameToCloud(getCurrentGame())">Synchroniser cloud</button>
      </div>
    </div>
  `;
}

function ensureLiveShareFields(game) {
  ensurePublicGameId(game);
  syncPlayersToCloud();
  game.liveShareUrl = `${window.location.origin}${window.location.pathname}?watch=${game.publicGameId}`;
  return game.liveShareUrl;
}

function ensurePublicGameId(game) {
  if (!game.publicGameId) game.publicGameId = generatePublicGameId();
  return game.publicGameId;
}

function getResumeShareUrl(game) {
  ensurePublicGameId(game);
  return `${window.location.origin}${window.location.pathname}?resume=${game.publicGameId}`;
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
  updateCurrentGame(game, { syncLive: true });
  renderAll();
  syncPendingLiveEvents(game);
  syncFullGameToCloud(game);
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

function copyTextToClipboard(text, message = "Copié.") {
  if (!text) return;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text);
    showToast(message, "success");
    return;
  }
  const input = document.createElement("input");
  input.value = text;
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  input.remove();
  showToast(message, "success");
}

function copyResumeCode() {
  const game = getCurrentGame();
  if (!game) return;
  copyTextToClipboard(ensurePublicGameId(game), "Code de reprise copié.");
}

function copyResumeShareLink() {
  const game = getCurrentGame();
  if (!game) return;
  copyTextToClipboard(getResumeShareUrl(game), "Lien de reprise copié.");
}

function getDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (!id) {
    id = `device_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
  }
  return id;
}

function getDeviceName() {
  const ua = navigator.userAgent || "";
  if (/iphone/i.test(ua)) return "iPhone";
  if (/ipad/i.test(ua)) return "iPad";
  if (/android/i.test(ua)) return /mobile/i.test(ua) ? "Telephone Android" : "Tablette Android";
  if (/macintosh|windows|linux/i.test(ua)) return "Ordinateur";
  return "Appareil marqueur";
}

function formatLockTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "inconnue";
  return date.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" });
}

function isScorerLockExpired(lock) {
  if (!lock?.lastSeenAt) return true;
  const lastSeen = new Date(lock.lastSeenAt).getTime();
  if (Number.isNaN(lastSeen)) return true;
  return Date.now() - lastSeen > SCORER_LOCK_TIMEOUT_MS;
}

function isCurrentDeviceActiveScorer(game = getCurrentGame()) {
  if (!game?.scorerLock) return false;
  return game.scorerLock.deviceId === getDeviceId() && !isScorerLockExpired(game.scorerLock) && !scorerReadOnlyMode;
}

function checkScorerLock(game = getCurrentGame()) {
  if (!game?.scorerLock || isScorerLockExpired(game.scorerLock)) return "available";
  if (game.scorerLock.deviceId === getDeviceId()) return "mine";
  return "other";
}

function setScorerReadOnlyMode(enabled) {
  scorerReadOnlyMode = Boolean(enabled);
  document.body.classList.toggle("scorer-read-only", scorerReadOnlyMode);
  if (scorerReadOnlyMode) stopScorerHeartbeat();
  updateScoringControlState(getCurrentGame());
}

function canCurrentDeviceScore(game = getCurrentGame()) {
  if (!game || normalizeGameStatus(game.status) !== "in_progress") return true;
  return isCurrentDeviceActiveScorer(game);
}

function prepareScoringSession(game = getCurrentGame()) {
  if (!game || normalizeGameStatus(game.status) !== "in_progress") return true;
  const state = checkScorerLock(game);
  if (state === "other") {
    setScorerReadOnlyMode(true);
    updateSyncStatusUI(game);
    return false;
  }
  if (state === "available") {
    const now = new Date().toISOString();
    game.scorerLock = {
      deviceId: getDeviceId(),
      deviceName: getDeviceName(),
      lockedAt: now,
      lastSeenAt: now
    };
    game.activeScorerDevice = game.scorerLock.deviceId;
    scorerReadOnlyMode = false;
    document.body.classList.remove("scorer-read-only");
    saveGameEverywhere(game, { syncLive: false, cloud: true });
    startScorerHeartbeat(game);
  }
  if (state === "mine") startScorerHeartbeat(game);
  return true;
}

async function acquireScorerLock(game = getCurrentGame()) {
  if (!game) return false;
  const state = checkScorerLock(game);
  if (state === "other") {
    setScorerReadOnlyMode(true);
    updateSyncStatusUI(game);
    showToast("Cette partie est deja marquee sur un autre appareil.", "warning");
    return false;
  }

  const now = new Date().toISOString();
  game.scorerLock = {
    deviceId: getDeviceId(),
    deviceName: getDeviceName(),
    lockedAt: state === "mine" ? (game.scorerLock.lockedAt || now) : now,
    lastSeenAt: now
  };
  game.activeScorerDevice = game.scorerLock.deviceId;
  setScorerReadOnlyMode(false);
  saveLocalData();
  await syncFullGameToCloud(game);
  subscribeToCloudGame(ensurePublicGameId(game), { silent: true });
  startScorerHeartbeat(game);
  renderAll();
  return true;
}

async function takeOverScorerLock(game = getCurrentGame()) {
  if (!game) return;
  const owner = game.scorerLock?.deviceName || "un autre appareil";
  const ok = confirm(`Prendre le relais de ${owner} ? L'autre appareil passera en lecture seule au prochain rafraichissement.`);
  if (!ok) return;
  game.scorerLock = null;
  setScorerReadOnlyMode(false);
  await acquireScorerLock(game);
  showToast("Vous etes maintenant le marqueur actif.", "success");
}

async function releaseScorerLock(game = getCurrentGame()) {
  if (!game?.scorerLock || game.scorerLock.deviceId !== getDeviceId()) return;
  game.scorerLock = null;
  game.activeScorerDevice = null;
  stopScorerHeartbeat();
  saveLocalData();
  await syncFullGameToCloud(game);
  updateSyncStatusUI(game);
}

function startScorerHeartbeat(game = getCurrentGame()) {
  stopScorerHeartbeat();
  if (!game || !isCurrentDeviceActiveScorer(game)) return;
  scorerHeartbeatTimer = setInterval(() => {
    const latest = getCurrentGame();
    if (!latest || !isCurrentDeviceActiveScorer(latest)) return stopScorerHeartbeat();
    latest.scorerLock.lastSeenAt = new Date().toISOString();
    latest.activeScorerDevice = latest.scorerLock.deviceId;
    saveLocalData();
    syncFullGameToCloud(latest);
  }, SCORER_HEARTBEAT_MS);
}

function stopScorerHeartbeat() {
  if (scorerHeartbeatTimer) clearInterval(scorerHeartbeatTimer);
  scorerHeartbeatTimer = null;
}

function renderScorerLockBadge(game = getCurrentGame()) {
  if (!game || normalizeGameStatus(game.status) !== "in_progress") return "";
  const state = checkScorerLock(game);
  if (state === "mine") return `<div class="scorer-lock-badge active">Marqueur actif : cet appareil</div>`;
  if (state === "other") {
    const lock = game.scorerLock;
    return `<div class="scorer-lock-badge warning">Marqueur actif : ${escapeHtml(lock.deviceName || "autre appareil")} · derniere activite ${escapeHtml(formatLockTime(lock.lastSeenAt))}</div>`;
  }
  return `<div class="scorer-lock-badge neutral">Aucun marqueur actif</div>`;
}

function renderScorerLockWarning(game = getCurrentGame()) {
  if (!game || checkScorerLock(game) !== "other") return "";
  const lock = game.scorerLock;
  return `
    <div class="scorer-lock-warning">
      <strong>Cette partie est actuellement marquee par : ${escapeHtml(lock.deviceName || "autre appareil")}.</strong>
      <p>Derniere activite : ${escapeHtml(formatLockTime(lock.lastSeenAt))}. Vous pouvez consulter en lecture seule ou prendre le relais.</p>
      <div class="home-card-actions">
        <button onclick="setScorerReadOnlyMode(true);renderAll()">Voir en lecture seule</button>
        <button class="primary-btn" onclick="takeOverScorerLock(getCurrentGame())">Prendre le relais</button>
      </div>
    </div>
  `;
}

function updateScoringControlState(game = getCurrentGame()) {
  const readonly = Boolean(game && normalizeGameStatus(game.status) === "in_progress" && !isCurrentDeviceActiveScorer(game));
  const selectors = [
    ".hit-actions button",
    "#endHalfBtn",
    "#editRunnersBtn",
    "#oppPlusBtn",
    "#oppMinusBtn",
    "#undoBtn",
    "#finishGameBtn",
    "#mobileQuickActionBar button",
    "#mobileMoreActionsPanel button",
    "#baseActionMenu button",
    "#lastActionCard button"
  ];
  selectors.forEach((selector) => {
    $$(selector).forEach((button) => {
      button.disabled = readonly;
      button.classList.toggle("read-only-disabled", readonly);
    });
  });
}

function compareCloudAndLocalVersions(game, cloudRecord) {
  const localUpdated = game?.cloudUpdatedAt ? new Date(game.cloudUpdatedAt).getTime() : 0;
  const cloudUpdated = cloudRecord?.updatedAt ? new Date(cloudRecord.updatedAt).getTime() : 0;
  if (cloudUpdated && (!localUpdated || cloudUpdated > localUpdated)) return "cloud_newer";
  if (localUpdated && cloudUpdated && localUpdated > cloudUpdated) return "local_newer";
  return "same";
}

function handleCloudGameUpdate(payload) {
  if (!payload?.new?.game_data) return;
  const code = payload.new.public_game_id || payload.new.game_data.publicGameId;
  const cloudGame = normalizeGame({
    ...payload.new.game_data,
    publicGameId: code,
    cloudSaveStatus: "synced",
    pendingCloudSave: false,
    cloudUpdatedAt: payload.new.updated_at || payload.new.game_data.cloudUpdatedAt || null
  });
  const current = getCurrentGame();
  const incomingDeviceId = cloudGame.scorerLock?.deviceId || cloudGame.activeScorerDevice;
  if (current?.publicGameId === code && isCurrentDeviceActiveScorer(current)) {
    if (incomingDeviceId === getDeviceId()) return;
    mergeOrReplaceLocalGameWithCloud(cloudGame);
    setScorerReadOnlyMode(true);
    showToast("Un autre appareil a pris le relais. Mode lecture seule active.", "warning");
    return;
  }
  mergeOrReplaceLocalGameWithCloud(cloudGame);
  const merged = getCurrentGame();
  setScorerReadOnlyMode(checkScorerLock(merged) === "other");
  showScreen("live");
  showToast(scorerReadOnlyMode ? "Version cloud chargee en lecture seule." : "Nouvelle version cloud chargee.", "success");
}

function handleResumeParamOnLoad(publicGameId) {
  if (!publicGameId) return;
  if (!isAdminAuthenticated()) {
    showScreen("admin");
    showToast("Connectez-vous à Admin pour reprendre cette partie.", "info");
    return;
  }
  loadGameFromCloud(publicGameId);
}

function cloudSaveStatusLabel(game) {
  if (!navigator.onLine) return "Hors ligne — sauvegarde locale active";
  if (game.cloudSaveStatus === "remote_available") return "Nouvelle version cloud disponible";
  if (game.cloudSaveStatus === "error" || game.cloudSaveStatus === "offline") return "Erreur cloud — sauvegarde locale active";
  if (game.pendingCloudSave || game.cloudSaveStatus === "pending") return "Sauvegarde cloud en cours...";
  if (game.cloudSaveStatus === "synced") return `Cloud à jour${game.cloudUpdatedAt ? ` · ${formatCloudSaveTime(game.cloudUpdatedAt)}` : ""}`;
  if (game.cloudSaveStatus === "offline") return "Erreur cloud — sauvegarde locale active";
  if (game.cloudSaveStatus === "synced") return "Sauvegarde cloud à jour";
  if (!supabaseClient) return "Cloud non disponible";
  return "Sauvegarde cloud locale";
}

function formatCloudSaveTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" });
}

function setCloudSaveState(gameId, status, pending = false, updatedAt = null) {
  const index = appData.games.findIndex((game) => game.id === gameId);
  if (index < 0) return;
  appData.games[index].cloudSaveStatus = status;
  appData.games[index].pendingCloudSave = pending;
  if (updatedAt) appData.games[index].cloudUpdatedAt = updatedAt;
  saveData();
  const current = getCurrentGame();
  if (current?.id === gameId) renderLiveBroadcastPanel(current);
}

function scheduleCloudSave(game) {
  if (!game) return;
  if (!canUploadAfterResetCheck()) return;
  ensurePublicGameId(game);
  if (!supabaseClient || !navigator.onLine) {
    setCloudSaveState(game.id, navigator.onLine ? "pending" : "offline", true);
    return;
  }
  setCloudSaveState(game.id, "pending", true);
  clearTimeout(cloudSyncTimers[game.id]);
  cloudSyncTimers[game.id] = setTimeout(() => {
    const latest = appData.games.find((item) => item.id === game.id);
    syncFullGameToCloud(latest);
  }, 350);
}

// Pour un usage public à grande échelle, sécuriser la reprise avec un code marqueur ou authentification.
async function syncFullGameToCloud(game) {
  if (!canUploadAfterResetCheck()) return { success: false, error: "reset_check_pending" };
  if (!game) return { success: false, error: "missing_game" };
  appLog(`Sauvegarde cloud demandée : ${game.publicGameId || game.id}`, "info");
  ensurePublicGameId(game);
  syncPlayersToCloud();
  if (!supabaseClient || !navigator.onLine) {
    setCloudSaveState(game.id, navigator.onLine ? "pending" : "offline", true);
    return { success: false, error: "cloud_unavailable" };
  }

  const updatedAt = new Date().toISOString();
  const battingSide = getBattingSide(game);
  const currentBatter = getCurrentBatter(game);
  const nextBatter = getNextBatter(game);
  const cloudGame = {
    ...structuredCloneSafe(game),
    teamName: appData.team.name,
    currentBatterLabel: currentBatter ? displayBatterName(currentBatter, battingSide, game) : "",
    nextBatterLabel: nextBatter ? displayBatterName(nextBatter, battingSide, game) : "",
    lastAction: game.liveLastAction || game.playByPlay?.[0]?.description || "",
    teamSnapshot: {
      players: structuredCloneSafe(appData.team.players),
      updatedAt
    },
    cloudSaveStatus: "synced",
    pendingCloudSave: false,
    cloudUpdatedAt: updatedAt
  };
  const payload = {
    public_game_id: game.publicGameId,
    game_data: cloudGame,
    updated_at: updatedAt
  };

  try {
    const { error } = await supabaseClient
      .from("saved_games_cloud")
      .upsert(payload, { onConflict: "public_game_id" });
    if (error) throw error;
    setCloudSaveState(game.id, "synced", false, updatedAt);
    appLog(`Sauvegarde cloud OK : ${game.publicGameId}`, "success");
    return { success: true, updatedAt };
  } catch (error) {
    console.warn("Cloud game sync failed", error);
    appLog(`Erreur cloud : ${error.message || error}`, "error");
    setCloudSaveState(game.id, "error", true);
    return { success: false, error };
  }
}

function syncPendingCloudSaves() {
  if (!supabaseClient || !navigator.onLine) return;
  appData.games
    .filter((game) => game.pendingCloudSave || ["pending", "offline", "error"].includes(game.cloudSaveStatus))
    .forEach((game) => syncFullGameToCloud(game));
}

async function syncPlayersToCloud() {
  if (!canUploadAfterResetCheck()) return { success: false, error: "reset_check_pending" };
  if (!supabaseClient || !navigator.onLine) return { success: false, error: "cloud_unavailable" };
  const now = new Date().toISOString();
  const rows = appData.team.players
    .map(normalizeCloudPlayer)
    .filter(Boolean)
    .map((player) => ({
      player_id: player.id,
      player_data: {
        ...player,
        playerId: player.id,
        updatedAt: player.updatedAt || now
      },
      updated_at: now
    }));
  if (!rows.length) return { success: true, count: 0 };
  try {
    const { error } = await supabaseClient
      .from("team_players_cloud")
      .upsert(rows, { onConflict: "player_id" });
    if (error) throw error;
    appLog(`Joueurs synchronises : ${rows.length}`, "success");
    return { success: true, count: rows.length };
  } catch (error) {
    console.warn("Cloud players sync failed", error);
    appLog(`Erreur sync joueurs : ${error.message || error}`, "error");
    return { success: false, error };
  }
}

async function loadPlayersFromCloud() {
  if (!supabaseClient || !navigator.onLine) return { success: false, error: "cloud_unavailable" };
  try {
    const { data, error } = await supabaseClient
      .from("team_players_cloud")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    const cloudPlayers = (data || []).map((row) => ({
      ...row.player_data,
      id: row.player_id || row.player_data?.id,
      playerId: row.player_id || row.player_data?.playerId,
      updatedAt: row.updated_at || row.player_data?.updatedAt
    }));
    mergeCloudPlayersIntoLocal(cloudPlayers);
    rebuildMissingPlayersFromGameSnapshots();
    return { success: true, count: cloudPlayers.length };
  } catch (error) {
    console.warn("Cloud players load failed", error);
    appLog(`Erreur chargement joueurs cloud : ${error.message || error}`, "error");
    return { success: false, error };
  }
}

function rebuildMissingPlayersFromGameSnapshots() {
  const snapshotPlayers = [];
  appData.games.forEach((game) => {
    if (Array.isArray(game.teamSnapshot?.players)) snapshotPlayers.push(...game.teamSnapshot.players);
    (game.atBats || []).forEach((atBat) => {
      if (!atBat.batterSnapshot) return;
      snapshotPlayers.push({
        id: atBat.batterSnapshot.playerId || atBat.playerId,
        playerId: atBat.batterSnapshot.playerId || atBat.playerId,
        number: atBat.batterSnapshot.number || "",
        firstName: atBat.batterSnapshot.firstName || "",
        lastName: atBat.batterSnapshot.lastName || "",
        name: atBat.batterSnapshot.name || atBat.batterSnapshot.displayName || "",
        active: true,
        updatedAt: atBat.timestamp || new Date().toISOString()
      });
    });
  });
  return mergeCloudPlayersIntoLocal(snapshotPlayers);
}

async function syncAllCloudData() {
  try {
    await syncPlayersToCloud();
    await loadPlayersFromCloud();
    await loadGamesFromCloud({ silent: true });
    const markerPasswordResult = await loadMarkerPasswordFromCloud({ silent: true });
    rebuildMissingPlayersFromGameSnapshots();
    calculateSeasonStats();
    renderAll();
    showToast(
      markerPasswordResult.success
        ? "Joueurs, matchs, mot de passe et statistiques synchronises."
        : "Joueurs, matchs et statistiques synchronises. Mot de passe cloud indisponible.",
      markerPasswordResult.success ? "success" : "warning"
    );
  } catch (error) {
    console.warn("Full cloud data sync failed", error);
    showToast("Erreur de synchronisation. Certaines donnees locales peuvent etre incompletes.", "error");
  }
}

async function fetchCloudGameByPublicId(publicGameId) {
  const code = String(publicGameId || "").trim().toUpperCase();
  if (!code) throw new Error("missing_public_game_id");
  const { data, error } = await supabaseClient
    .from("saved_games_cloud")
    .select("*")
    .eq("public_game_id", code)
    .maybeSingle();
  if (error) throw error;
  if (!data?.game_data) return null;
  return {
    cloudGame: normalizeGame({
      ...data.game_data,
      publicGameId: code,
      cloudSaveStatus: "synced",
      pendingCloudSave: false,
      cloudUpdatedAt: data.updated_at || data.game_data.cloudUpdatedAt || null
    }),
    updatedAt: data.updated_at || data.game_data.cloudUpdatedAt || null
  };
}

function mergeOrReplaceLocalGameWithCloud(cloudGame) {
  if (!cloudGame) return null;
  const normalized = normalizeGame(cloudGame);
  const existingIndex = appData.games.findIndex((game) => game.publicGameId === normalized.publicGameId || game.id === normalized.id);
  if (existingIndex >= 0) appData.games[existingIndex] = normalized;
  else appData.games.push(normalized);
  appData.currentGameId = normalized.id;
  rebuildMissingPlayersFromGameSnapshots();
  saveData();
  renderAll();
  return normalized;
}

async function loadGamesFromCloud(options = {}) {
  if (!supabaseClient) return showToast("Supabase n'est pas disponible sur cet appareil.", "error");
  if (!navigator.onLine) return showToast("Connexion requise pour charger les matchs cloud.", "warning");

  try {
    const { data, error } = await supabaseClient
      .from("saved_games_cloud")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) throw error;

    let mergedCount = 0;
    (data || []).forEach((row) => {
      if (!row?.game_data) return;
      const cloudGame = normalizeGame({
        ...row.game_data,
        publicGameId: row.public_game_id || row.game_data.publicGameId,
        cloudSaveStatus: "synced",
        pendingCloudSave: false,
        cloudUpdatedAt: row.updated_at || row.game_data.cloudUpdatedAt || null
      });
      if (row.game_data.teamName && !cloudGame.teamName) cloudGame.teamName = row.game_data.teamName;
      const existingIndex = appData.games.findIndex((game) => game.publicGameId === cloudGame.publicGameId || game.id === cloudGame.id);
      if (existingIndex >= 0) {
        const localUpdated = appData.games[existingIndex].cloudUpdatedAt ? new Date(appData.games[existingIndex].cloudUpdatedAt).getTime() : 0;
        const cloudUpdated = cloudGame.cloudUpdatedAt ? new Date(cloudGame.cloudUpdatedAt).getTime() : 0;
        if (!localUpdated || cloudUpdated >= localUpdated) {
          appData.games[existingIndex] = cloudGame;
          mergedCount += 1;
        }
      } else {
        appData.games.push(cloudGame);
        mergedCount += 1;
      }
    });

    rebuildMissingPlayersFromGameSnapshots();

    saveData();
    renderAll();
    if (!options.silent) showToast(mergedCount ? "Matchs cloud charges avec succes." : "Aucun nouveau match cloud a charger.", "success");
  } catch (error) {
    console.warn("Cloud games load failed", error);
    showToast("Impossible de charger les matchs cloud. Vérifiez votre connexion.", "error");
  }
}

function initializePublicData() {
  loadPlayersFromCloud();
  loadPublicGamesFromCloud();
}

async function loadPublicGamesFromCloud() {
  if (!supabaseClient || !navigator.onLine) return;
  try {
    const { data, error } = await supabaseClient
      .from("saved_games_cloud")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    (data || []).forEach((row) => {
      if (!row?.game_data) return;
      const cloudGame = normalizeGame({
        ...row.game_data,
        publicGameId: row.public_game_id || row.game_data.publicGameId,
        cloudSaveStatus: "synced",
        pendingCloudSave: false,
        cloudUpdatedAt: row.updated_at || row.game_data.cloudUpdatedAt || null
      });
      const existingIndex = appData.games.findIndex((game) => game.publicGameId === cloudGame.publicGameId || game.id === cloudGame.id);
      if (existingIndex >= 0) appData.games[existingIndex] = cloudGame;
      else appData.games.push(cloudGame);
    });
    rebuildMissingPlayersFromGameSnapshots();
    saveData();
    renderAll();
  } catch (error) {
    appLog(`Données cloud publiques indisponibles : ${error.message || error}`, "warning");
  }
}

async function refreshCurrentGameFromCloud() {
  const game = getCurrentGame();
  if (!game) return showToast("Aucune partie active.", "warning");
  const code = ensurePublicGameId(game);
  if (!supabaseClient) return showToast("Supabase n'est pas disponible sur cet appareil.", "error");
  if (!navigator.onLine) return showToast("Connexion requise pour rafraîchir depuis le cloud.", "warning");

  try {
    const cloudRecord = await fetchCloudGameByPublicId(code);
    if (!cloudRecord) return showToast("Aucune version cloud trouvée pour cette partie.", "warning");
    const comparison = compareCloudAndLocalVersions(game, cloudRecord);
    if (comparison !== "cloud_newer") {
      return showToast("Votre version locale est déjà à jour ou plus récente.", "info");
    }
    const shouldReplace = confirm("Remplacer la version locale par la version cloud la plus récente ?");
    if (!shouldReplace) return showToast("Version locale conservée.", "info");
    const merged = mergeOrReplaceLocalGameWithCloud(cloudRecord.cloudGame);
    if (merged && isAdminAuthenticated()) {
      if (checkScorerLock(merged) === "other") setScorerReadOnlyMode(true);
      else acquireScorerLock(merged);
    }
    showScreen("live");
    showToast("Partie rafraîchie depuis le cloud.", "success");
  } catch (error) {
    console.warn("Cloud refresh failed", error);
    showToast("Impossible de rafraîchir depuis le cloud.", "error");
  }
}

function subscribeToCloudGame(publicGameId, options = {}) {
  const code = String(publicGameId || "").trim().toUpperCase();
  if (!code) return showToast("Aucune partie active à synchroniser.", "warning");
  if (!supabaseClient) return showToast("Supabase n'est pas disponible sur cet appareil.", "error");
  if (cloudGameSubscription) supabaseClient.removeChannel(cloudGameSubscription);
  cloudGameSubscription = supabaseClient
    .channel(`saved-game-${code}`)
    .on("postgres_changes", {
      event: "UPDATE",
      schema: "public",
      table: "saved_games_cloud",
      filter: `public_game_id=eq.${code}`
    }, handleCloudGameUpdate)
    .subscribe();
  if (!options.silent) showToast("Synchronisation temps reel marqueur activee.", "success");
}

function subscribeToCurrentCloudGame() {
  const game = getCurrentGame();
  if (!game) return showToast("Aucune partie active à synchroniser.", "warning");
  subscribeToCloudGame(ensurePublicGameId(game));
}

function openResumeGameModal(prefill = "") {
  const modal = $("#resumeGameModal");
  if (!modal) return;
  $("#resumeGameCode").value = String(prefill || "").trim().toUpperCase();
  $("#resumeGameStatus").textContent = "Le localStorage restera actif sur cet appareil après le chargement.";
  modal.classList.remove("hidden");
  $("#resumeGameCode").focus();
}

function closeResumeGameModal() {
  $("#resumeGameModal")?.classList.add("hidden");
}

async function loadGameFromCloud(publicGameId) {
  const code = String(publicGameId || "").trim().toUpperCase();
  if (!code) return showToast("Entrez un code de reprise.", "warning");
  if (!supabaseClient) return showToast("Supabase n'est pas disponible sur cet appareil.", "error");
  if (!navigator.onLine) return showToast("Connexion requise pour charger une partie cloud.", "warning");

  if ($("#resumeGameStatus")) $("#resumeGameStatus").textContent = "Chargement de la partie...";
  try {
    const { data, error } = await supabaseClient
      .from("saved_games_cloud")
      .select("*")
      .eq("public_game_id", code)
      .maybeSingle();
    if (error) throw error;
    if (!data?.game_data) {
      if ($("#resumeGameStatus")) $("#resumeGameStatus").textContent = "Aucune partie trouvée pour ce code.";
      return showToast("Aucune partie trouvée pour ce code.", "warning");
    }

    const cloudGame = normalizeGame({
      ...data.game_data,
      publicGameId: code,
      cloudSaveStatus: "synced",
      pendingCloudSave: false,
      cloudUpdatedAt: data.updated_at || data.game_data.cloudUpdatedAt || null
    });
    const existingIndex = appData.games.findIndex((game) => game.publicGameId === code || game.id === cloudGame.id);
    if (existingIndex >= 0) {
      const localGame = appData.games[existingIndex];
      const localUpdated = localGame.cloudUpdatedAt ? new Date(localGame.cloudUpdatedAt).getTime() : 0;
      const cloudUpdated = data.updated_at ? new Date(data.updated_at).getTime() : 0;
      if (localUpdated && cloudUpdated && localUpdated >= cloudUpdated) {
        const replace = confirm("Une version locale existe déjà. Voulez-vous remplacer par la version cloud ?");
        if (!replace) {
          appData.currentGameId = localGame.id;
          saveData();
          closeResumeGameModal();
          showScreen("live");
          if (isAdminAuthenticated()) acquireScorerLock(localGame);
          return showToast("Version locale conservée.", "info");
        }
      }
      appData.games[existingIndex] = cloudGame;
    } else {
      appData.games.push(cloudGame);
    }

    appData.currentGameId = cloudGame.id;
    rebuildMissingPlayersFromGameSnapshots();
    saveData();
    closeResumeGameModal();
    renderAll();
    showScreen("live");
    if (isAdminAuthenticated()) acquireScorerLock(getCurrentGame());
    showToast("Partie chargée avec succès.", "success");
  } catch (error) {
    console.warn("Cloud game load failed", error);
    if ($("#resumeGameStatus")) $("#resumeGameStatus").textContent = "Impossible de charger la partie cloud.";
    showToast("Impossible de charger la partie cloud.", "error");
  }
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
    if (atBat.batterSnapshot && !stat.batterSnapshot) stat.batterSnapshot = atBat.batterSnapshot;
    accumulateAtBatIntoStat(stat, atBat, game.id || game.publicGameId);
  });

  return Array.from(statsMap.values()).map(finalizeStat);
}

function emptyStat(playerId) {
  return {
    playerId,
    batterSnapshot: null,
    gamesPlayed: 0,
    gameIds: new Set(),
    ab: 0,
    hit: 0,
    single: 0,
    double: 0,
    triple: 0,
    hr: 0,
    bb: 0,
    strikeout: 0,
    sacrifice: 0,
    fieldersChoice: 0,
    totalBases: 0,
    rbi: 0,
    run: 0,
    plateAppearances: 0,
    avg: ".000",
    obp: ".000",
    slg: ".000",
    ops: ".000"
  };
}

function calculateSeasonStats() {
  const statsMap = new Map(appData.team.players.map((player) => [player.id, emptyStat(player.id)]));
  appData.games
    .filter(shouldIncludeGameInSeasonStats)
    .forEach((game) => {
      (game.atBats || []).forEach((atBat) => {
        if (!statsMap.has(atBat.playerId)) statsMap.set(atBat.playerId, emptyStat(atBat.playerId));
        const stat = statsMap.get(atBat.playerId);
        if (atBat.batterSnapshot && !stat.batterSnapshot) stat.batterSnapshot = atBat.batterSnapshot;
        accumulateAtBatIntoStat(stat, atBat, game.id || game.publicGameId);
      });
    });
  return Array.from(statsMap.values())
    .filter((stat) => stat.plateAppearances || appData.team.players.some((player) => player.id === stat.playerId))
    .sort((a, b) => statPlayerName(a.playerId, "team", a.batterSnapshot).localeCompare(statPlayerName(b.playerId, "team", b.batterSnapshot)))
    .map(finalizeStat);
}

function calculatePlayerSeasonStats(playerId) {
  return calculateSeasonStats().find((stat) => stat.playerId === playerId) || finalizeStat(emptyStat(playerId));
}

function shouldIncludeGameInSeasonStats(game) {
  const status = normalizeGameStatus(game?.status);
  const hasActions = Boolean((game?.atBats || []).length || (game?.opponentAtBats || []).length);
  return hasActions && ["in_progress", "completed"].includes(status);
}

function accumulateAtBatIntoStat(stat, atBat, gameId = null) {
  if (gameId && stat.gameIds?.add) stat.gameIds.add(gameId);
  stat.ab += atBat.ab || 0;
  stat.hit += atBat.hit || 0;
  stat.single += atBat.single || 0;
  stat.double += atBat.double || 0;
  stat.triple += atBat.triple || 0;
  stat.hr += atBat.hr || 0;
  stat.bb += atBat.bb || 0;
  stat.strikeout += atBat.strikeout || 0;
  stat.totalBases = (stat.totalBases || 0) + (atBat.single || 0) + (2 * (atBat.double || 0)) + (3 * (atBat.triple || 0)) + (4 * (atBat.hr || 0));
  stat.rbi += atBat.rbi || 0;
  stat.run += atBat.run || 0;
  stat.sacrifice = (stat.sacrifice || 0) + (atBat.result === "Sacrifice" ? 1 : 0);
  stat.fieldersChoice = (stat.fieldersChoice || 0) + (atBat.result === "FC" ? 1 : 0);
  stat.plateAppearances = (stat.plateAppearances || 0) + 1;
}

function finalizeStat(stat) {
  const obpDenominator = stat.ab + stat.bb + stat.sacrifice;
  const obpValue = obpDenominator ? (stat.hit + stat.bb) / obpDenominator : 0;
  const slgValue = stat.ab ? (stat.totalBases || 0) / stat.ab : 0;
  return {
    ...stat,
    gamesPlayed: stat.gameIds?.size || stat.gamesPlayed || 0,
    sacrifice: stat.sacrifice || 0,
    fieldersChoice: stat.fieldersChoice || 0,
    totalBases: stat.totalBases || 0,
    plateAppearances: stat.plateAppearances || 0,
    avg: formatAverage(stat.hit, stat.ab),
    obp: formatBattingAverage(obpValue, obpDenominator),
    slg: formatBattingAverage(slgValue, stat.ab),
    ops: formatBattingAverage(obpValue + slgValue, obpDenominator || stat.ab)
  };
}

function renderStats() {
  if (!statsCloudPlayersRequested && supabaseClient && navigator.onLine) {
    statsCloudPlayersRequested = true;
    loadPlayersFromCloud().then(() => renderStats());
  }
  const game = getGameForDisplay();
  if (activeStatsView === "game") {
    renderGameStatsScreen(selectedStatsGameId);
    return;
  }
  if (activeStatsView === "player") {
    renderPlayerStatsDetail(selectedStatsPlayerId);
    return;
  }
  if (activeStatsView === "recent") {
    $$(".stats-view-btn").forEach((button) => {
      button.classList.toggle("active", button.dataset.statsView === activeStatsView);
    });
    $("#statsSummary").innerHTML = `<div class="stat-card wide-stat"><span>Derniers matchs</span><strong>${getRecentGames(10).length}</strong></div>`;
    $("#statsBody").innerHTML = `<tr><td colspan="19">Utilisez la vue Derniers matchs ci-dessous.</td></tr>`;
    $("#opponentStatsSection").classList.add("hidden");
    $("#recentStatsView").classList.remove("hidden");
    $("#recentStatsView").innerHTML = renderRecentGamesStatsView();
    return;
  }
  const stats = activeStatsView === "season" ? calculateSeasonStats() : calculateStats(game);
  const opponentStats = calculateOpponentStats(game);
  const totals = getStatsTotals(stats);
  $$(".stats-view-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.statsView === activeStatsView);
  });
  const statsLabel = document.querySelector("#screen-stats .team-badge");
  if (statsLabel) {
    statsLabel.textContent = activeStatsView === "season" ? "Stats cumulées - Notre équipe" : "Match actuel - Notre équipe";
  }
  $("#statsSummary").innerHTML = stats.length ? `
    <div class="stat-card"><span>Total AB</span><strong>${totals.ab}</strong></div>
    <div class="stat-card"><span>Coups sûrs</span><strong>${totals.hit}</strong></div>
    <div class="stat-card"><span>BB</span><strong>${totals.bb}</strong></div>
    <div class="stat-card"><span>PP</span><strong>${totals.rbi}</strong></div>
    <div class="stat-card"><span>Moyenne équipe</span><strong>${formatAverage(totals.hit, totals.ab)}</strong></div>
  ` : `<div class="empty-state">Aucune statistique disponible. Marquez une partie pour remplir ce tableau.</div>`;

  $("#statsBody").innerHTML = renderStatsRows(stats, "team");
  $("#recentStatsView").classList.add("hidden");
  $("#recentStatsView").innerHTML = "";
  $("#opponentStatsSection").classList.toggle("hidden", activeStatsView === "season" || !game || game.opponentTrackingMode !== "complete");
  $("#opponentStatsBody").innerHTML = opponentStats.length ? renderStatsRows(opponentStats, "opponent") : `<tr><td colspan="19">Aucune statistique adverse.</td></tr>`;
}

function renderStatsRows(stats, side) {
  const totals = getStatsTotals(stats);
  const rows = stats.map((stat) => `
    <tr>
      <td>${side === "team" ? `<button class="link-button" onclick="openPlayerStats('${stat.playerId}')">${escapeHtml(statPlayerName(stat.playerId, side, stat.batterSnapshot))}</button>` : escapeHtml(statPlayerName(stat.playerId, side, stat.batterSnapshot))}</td>
      <td>${stat.gamesPlayed}</td><td>${stat.ab}</td><td>${stat.hit}</td><td>${stat.single}</td><td>${stat.double}</td>
      <td>${stat.triple}</td><td>${stat.hr}</td><td>${stat.bb}</td><td>${stat.strikeout}</td><td>${stat.sacrifice}</td>
      <td>${stat.fieldersChoice}</td><td>${stat.rbi}</td><td>${stat.run}</td><td>${stat.plateAppearances}</td><td class="avg-cell">${stat.avg}</td><td>${stat.obp}</td><td>${stat.slg}</td><td>${stat.ops}</td>
    </tr>
  `).join("");

  const totalLabel = side === "opponent" ? "Total adversaire" : "Total équipe";
  const totalRow = stats.length ? `
    <tr class="total-row">
      <td>${totalLabel}</td>
      <td>${totals.gamesPlayed}</td><td>${totals.ab}</td><td>${totals.hit}</td><td>${totals.single}</td><td>${totals.double}</td>
      <td>${totals.triple}</td><td>${totals.hr}</td><td>${totals.bb}</td><td>${totals.strikeout}</td><td>${totals.sacrifice}</td>
      <td>${totals.fieldersChoice}</td><td>${totals.rbi}</td><td>${totals.run}</td><td>${totals.plateAppearances}</td><td class="avg-cell">${formatAverage(totals.hit, totals.ab)}</td><td>${formatBattingAverage((totals.hit + totals.bb) / Math.max(1, totals.ab + totals.bb + totals.sacrifice), totals.ab + totals.bb + totals.sacrifice)}</td><td>${formatBattingAverage((totals.totalBases || 0) / Math.max(1, totals.ab), totals.ab)}</td><td>${formatBattingAverage(((totals.hit + totals.bb) / Math.max(1, totals.ab + totals.bb + totals.sacrifice)) + ((totals.totalBases || 0) / Math.max(1, totals.ab)), totals.ab + totals.bb + totals.sacrifice || totals.ab)}</td>
    </tr>
  ` : "";

  return stats.length ? `${rows}${totalRow}` : `<tr><td colspan="19">Aucune statistique disponible.</td></tr>`;
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
    totals.strikeout += stat.strikeout;
    totals.sacrifice += stat.sacrifice || 0;
    totals.fieldersChoice += stat.fieldersChoice || 0;
    totals.gamesPlayed += stat.gamesPlayed || 0;
    totals.totalBases += stat.totalBases || 0;
    totals.rbi += stat.rbi;
    totals.run += stat.run;
    totals.plateAppearances += stat.plateAppearances || 0;
    return totals;
  }, { gamesPlayed: 0, ab: 0, hit: 0, single: 0, double: 0, triple: 0, hr: 0, bb: 0, strikeout: 0, sacrifice: 0, fieldersChoice: 0, totalBases: 0, rbi: 0, run: 0, plateAppearances: 0 });
}

function calculateCurrentGameStats(game) {
  return calculateStats(game);
}

function calculateGameSummaryStats(game) {
  const stats = calculateCurrentGameStats(game);
  const totals = getStatsTotals(stats);
  return {
    hits: totals.hit,
    rbi: totals.rbi,
    runs: totals.run,
    atBats: totals.ab
  };
}

function getTopBatterForGame(game) {
  const stats = calculateCurrentGameStats(game);
  const top = [...stats]
    .filter((stat) => stat.plateAppearances)
    .sort((a, b) => (b.hit - a.hit) || (b.rbi - a.rbi) || (b.totalBases - a.totalBases))[0];
  if (!top) return "—";
  return `${statPlayerName(top.playerId, "team")} (${top.hit} H, ${top.rbi} PP)`;
}

function renderRecentGamesStatsView() {
  const games = getRecentGames(10);
  if (!games.length) return `<div class="empty-state">Aucun match à afficher.</div>`;
  return `
    <div class="recent-games-list stats-recent-list">
      ${games.map((game) => {
        const summary = calculateGameSummaryStats(game);
        return `
          <article class="recent-stats-card">
            <div>
              <h3>${escapeHtml(formatDate(game.date))} · ${escapeHtml(game.opponent || "Adversaire")}</h3>
              <p>${escapeHtml(appData.team.name)} ${game.scoreTeam} - ${game.scoreOpponent} ${escapeHtml(game.opponent || "Adversaire")} · ${escapeHtml(normalizeGameStatus(game.status))}</p>
            </div>
            <div class="summary-list">
              ${summaryRows([
                ["Coups sûrs", summary.hits],
                ["PP", summary.rbi],
                ["Points", summary.runs],
                ["Meilleur frappeur", getTopBatterForGame(game)]
              ])}
            </div>
            <div class="home-card-actions">
              <button class="secondary-btn" onclick="openLinkedGameMatch('${game.id}')">Voir stats du match</button>
              <button class="primary-btn" onclick="openReportForGame('${game.id}')">Rapport</button>
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function openPlayerStats(playerId) {
  selectedStatsPlayerId = playerId;
  activeStatsView = "player";
  showScreen("stats");
}

function renderPlayerStatsDetail(playerId) {
  const stat = calculatePlayerSeasonStats(playerId);
  const games = getPlayerAtBatsByGame(playerId);
  $$(".stats-view-btn").forEach((button) => button.classList.remove("active"));
  $("#statsSummary").innerHTML = `
    <div class="stat-card wide-stat"><span>Fiche joueur</span><strong>${escapeHtml(statPlayerName(playerId, "team"))}</strong></div>
    <div class="stat-card"><span>AVG</span><strong>${stat.avg}</strong></div>
    <div class="stat-card"><span>OPS</span><strong>${stat.ops}</strong></div>
  `;
  $("#statsBody").innerHTML = `<tr><td colspan="19">Fiche joueur affichée ci-dessous.</td></tr>`;
  $("#opponentStatsSection").classList.add("hidden");
  $("#recentStatsView").classList.remove("hidden");
  $("#recentStatsView").innerHTML = `
    <button class="secondary-btn" onclick="activeStatsView='season';renderStats()">Retour aux stats</button>
    <section class="recent-stats-card">
      <h3>${escapeHtml(statPlayerName(playerId, "team"))}</h3>
      <div class="score-summary compact-summary">
        ${summaryRows([
          ["AB", stat.ab], ["H", stat.hit], ["BB", stat.bb], ["K", stat.strikeout],
          ["PP", stat.rbi], ["Points", stat.run], ["OBP", stat.obp], ["SLG", stat.slg]
        ])}
      </div>
    </section>
    <section class="recent-stats-card table-wrap">
      <h3>Stats par partie</h3>
      <table>
        <thead><tr><th>Date</th><th>Adversaire</th><th>Score</th><th>AB</th><th>H</th><th>BB</th><th>K</th><th>PP</th><th>P</th><th>Apparitions</th></tr></thead>
        <tbody>${games.map(formatPlayerGameLine).join("") || `<tr><td colspan="10">Aucune apparition.</td></tr>`}</tbody>
      </table>
    </section>
  `;
}

function getPlayerAtBatsByGame(playerId) {
  return appData.games
    .map((game) => ({
      game,
      atBats: (game.atBats || []).filter((atBat) => atBat.playerId === playerId)
    }))
    .filter((item) => item.atBats.length)
    .map((item) => {
      const stat = finalizeStat(item.atBats.reduce((acc, atBat) => {
        accumulateAtBatIntoStat(acc, atBat, item.game.id || item.game.publicGameId);
        return acc;
      }, emptyStat(playerId)));
      return { ...item, stat };
    });
}

function formatPlayerGameLine(item) {
  return `
    <tr>
      <td>${escapeHtml(formatDate(item.game.date))}</td>
      <td>${escapeHtml(item.game.opponent || "Adversaire")}</td>
      <td>${item.game.scoreTeam} - ${item.game.scoreOpponent}</td>
      <td>${item.stat.ab}</td><td>${item.stat.hit}</td><td>${item.stat.bb}</td><td>${item.stat.strikeout}</td><td>${item.stat.rbi}</td><td>${item.stat.run}</td>
      <td>${escapeHtml(item.atBats.map((atBat) => atBat.result).join(", "))}</td>
    </tr>
  `;
}

function renderGameStatsScreen(gameId) {
  const game = appData.games.find((item) => item.id === gameId || item.publicGameId === gameId);
  if (!game) return;
  const stats = calculateGameStats(game);
  $$(".stats-view-btn").forEach((button) => button.classList.remove("active"));
  $("#statsSummary").innerHTML = `
    <div class="stat-card wide-stat"><span>Stats du match</span><strong>${escapeHtml(game.opponent || "Adversaire")}</strong></div>
    <div class="stat-card"><span>Score</span><strong>${game.scoreTeam}-${game.scoreOpponent}</strong></div>
  `;
  $("#statsBody").innerHTML = renderStatsRows(stats, "team");
  $("#opponentStatsSection").classList.add("hidden");
  $("#recentStatsView").classList.remove("hidden");
  $("#recentStatsView").innerHTML = `
    <button class="secondary-btn" onclick="activeStatsView='season';renderStats();showScreen('home')">Retour à l'accueil</button>
    ${renderGameSummary(game)}
    <section class="recent-stats-card">
      <h3>Play-by-play</h3>
      <div class="play-list">${(game.playByPlay || []).map((play) => `<div class="play-item"><strong>${escapeHtml(play.result || "")}</strong><span>${escapeHtml(play.description || "")}</span></div>`).join("") || `<div class="empty-state">Aucune action.</div>`}</div>
    </section>
  `;
}

function calculateGameStats(game) {
  return calculateStats(game);
}

function renderGameSummary(game) {
  const summary = calculateGameSummaryStats(game);
  return `
    <section class="recent-stats-card">
      <h3>Résumé du match</h3>
      <div class="score-summary compact-summary">
        ${summaryRows([
          ["Date", formatDate(game.date)],
          ["Adversaire", game.opponent || "Adversaire"],
          ["Statut", normalizeGameStatus(game.status)],
          ["Coups sûrs", summary.hits],
          ["PP", summary.rbi],
          ["Meilleur frappeur", getTopBatterForGame(game)]
        ])}
      </div>
    </section>
  `;
}

function formatAverage(hit, ab) {
  if (!ab) return ".000";
  const average = hit / ab;
  if (average >= 1) return "1.000";
  return average.toFixed(3).replace(/^0/, "");
}

function formatBattingAverage(value, ab = 1) {
  if (!ab || !Number.isFinite(value)) return ".000";
  return value.toFixed(3).replace(/^0/, "");
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
      <thead><tr><th>Joueur</th><th>MJ</th><th>AB</th><th>H</th><th>1B</th><th>2B</th><th>3B</th><th>HR</th><th>BB</th><th>K</th><th>SAC</th><th>FC</th><th>PP</th><th>P</th><th>PA</th><th>MOY</th><th>OBP</th><th>SLG</th><th>OPS</th></tr></thead>
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
    settings: {
      markerPassword: DEFAULT_ADMIN_PASSWORD,
      markerPasswordCloudSyncedAt: null
    },
    currentGameId: null
  };
  localStorage.setItem(ADMIN_PASSWORD_STORAGE_KEY, DEFAULT_ADMIN_PASSWORD);
  saveData();
  renderAll();
  showScreen("home");
  showToast("Données réinitialisées.", "warning");
}

async function checkCloudResetGeneration() {
  if (!supabaseClient || !navigator.onLine) {
    cloudResetChecked = false;
    return { success: false, error: "cloud_unavailable" };
  }
  try {
    const { data, error } = await supabaseClient
      .from("app_settings_cloud")
      .select("setting_value")
      .eq("setting_key", "data_reset")
      .maybeSingle();
    if (error) throw error;
    const cloudGeneration = data?.setting_value?.generation;
    const localGeneration = localStorage.getItem(RESET_GENERATION_STORAGE_KEY);
    if (cloudGeneration && cloudGeneration !== localGeneration) {
      resetLocalDataAfterCloudReset({ generation: cloudGeneration }, {
        detected: true,
        message: "Une rÃ©initialisation globale a Ã©tÃ© dÃ©tectÃ©e. Les anciennes donnÃ©es locales de cet appareil ont Ã©tÃ© vidÃ©es."
      });
    }
    cloudResetChecked = true;
    return { success: true, generation: cloudGeneration || localGeneration || null };
  } catch (error) {
    cloudResetChecked = false;
    console.warn("Cloud reset generation check failed", error);
    appLog(`Erreur vÃ©rification gÃ©nÃ©ration reset : ${error.message || error}`, "warning");
    return { success: false, error };
  }
}

function openResetConfirmationModal() {
  const modal = $("#resetDataModal");
  if (!modal) return;
  $("#resetConfirmText").value = "";
  $("#resetCodeInput").value = "";
  $("#resetDataStatus").textContent = "";
  $("#resetStep1").classList.remove("hidden");
  $("#resetStep2").classList.add("hidden");
  modal.classList.remove("hidden");
}

function closeResetConfirmationModal() {
  $("#resetDataModal")?.classList.add("hidden");
}

function showResetConfirmationStep2() {
  $("#resetStep1")?.classList.add("hidden");
  $("#resetStep2")?.classList.remove("hidden");
  $("#resetConfirmText")?.focus();
}

async function handleCompleteResetConfirm() {
  const confirmText = String($("#resetConfirmText")?.value || "").trim();
  const resetCode = String($("#resetCodeInput")?.value || "").trim();
  const status = $("#resetDataStatus");
  if (confirmText !== "RESET") {
    if (status) status.textContent = "Tapez RESET pour confirmer.";
    return;
  }
  if (!resetCode) {
    if (status) status.textContent = "Entrez le code de rÃ©initialisation.";
    return;
  }
  if (status) status.textContent = "RÃ©initialisation cloud en cours...";
  const resetResult = await resetAllSupabaseData(resetCode);
  if (!resetResult.success) {
    if (status) status.textContent = resetResult.message || "Code invalide ou rÃ©initialisation impossible.";
    showToast(status?.textContent || "RÃ©initialisation refusÃ©e.", "error");
    return;
  }
  closeResetConfirmationModal();
  resetLocalDataAfterCloudReset(resetResult);
}

async function resetAllSupabaseData(resetCode) {
  if (!supabaseClient || !navigator.onLine) {
    return { success: false, message: "Supabase n'est pas disponible. Les donnÃ©es locales sont conservÃ©es." };
  }
  try {
    const { data, error } = await supabaseClient.rpc("reset_baseball_scorepad_data", {
      reset_code: resetCode
    });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.success) {
      return {
        success: false,
        message: result?.message || result?.error || "Code de rÃ©initialisation invalide."
      };
    }
    return {
      ...result,
      success: true,
      generation: result.generation || result.reset_generation || new Date().toISOString()
    };
  } catch (error) {
    console.warn("Supabase reset failed", error);
    appLog(`Erreur reset Supabase : ${error.message || error}`, "error");
    return { success: false, message: error.message || "RÃ©initialisation Supabase impossible." };
  }
}

function clearBaseballScorepadLocalStorage() {
  Object.keys(localStorage).forEach((key) => {
    if (key === RESET_GENERATION_STORAGE_KEY) return;
    if (key.startsWith("baseballScorepad") || key.startsWith("baseballScorePad")) {
      localStorage.removeItem(key);
    }
  });
}

function resetLocalDataAfterCloudReset(resetResult = {}, options = {}) {
  const generation = String(resetResult.generation || new Date().toISOString());
  cloudResetChecked = true;
  Object.values(cloudSyncTimers).forEach((timer) => clearTimeout(timer));
  cloudSyncTimers = {};
  clearBaseballScorepadLocalStorage();
  localStorage.setItem(RESET_GENERATION_STORAGE_KEY, generation);
  appData = getDefaultAppData();
  localStorage.setItem(ADMIN_PASSWORD_STORAGE_KEY, DEFAULT_ADMIN_PASSWORD);
  saveData();
  activeStatsView = "season";
  selectedStatsGameId = null;
  selectedStatsPlayerId = null;
  statsCloudPlayersRequested = false;
  lastResetCompletion = options.detected ? null : { generation };
  renderAll();
  showScreen("home");
  if (!options.detected) renderResetCompletionCard();
  showToast(
    options.message || "DonnÃ©es rÃ©initialisÃ©es. Vous pouvez recommencer Ã  zÃ©ro.",
    options.detected ? "warning" : "success"
  );
}

function renderResetCompletionCard() {
  const card = $("#resetCompletionCard");
  if (!card || !lastResetCompletion) return;
  card.classList.remove("hidden");
}

function resetAllData() {
  openResetConfirmationModal();
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
        settings: {
          markerPassword: imported.settings?.markerPassword || localStorage.getItem(ADMIN_PASSWORD_STORAGE_KEY) || DEFAULT_ADMIN_PASSWORD,
          markerPasswordCloudSyncedAt: imported.settings?.markerPasswordCloudSyncedAt || null
        },
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

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportCurrentGame() {
  const game = getCurrentGame();
  if (!game) return showToast("Aucune partie à exporter.", "warning");
  ensurePublicGameId(game);
  updateCurrentGame(game);
  downloadJson(`baseball-scorepad-partie-${game.publicGameId || game.id}.json`, {
    type: "baseball-scorepad-game",
    exportedAt: new Date().toISOString(),
    game
  });
  showToast("Partie exportée.", "success");
}

function importGameFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      const rawGame = imported.game || imported;
      if (!rawGame || !rawGame.id) throw new Error("Format invalide");
      const game = normalizeGame(rawGame);
      ensurePublicGameId(game);
      const existingIndex = appData.games.findIndex((item) => item.publicGameId === game.publicGameId || item.id === game.id);
      if (existingIndex >= 0 && !confirm("Une partie avec ce code existe déjà. Voulez-vous la remplacer ?")) return;
      if (existingIndex >= 0) appData.games[existingIndex] = game;
      else appData.games.push(game);
      appData.currentGameId = game.id;
      saveData();
      renderAll();
      showScreen("live");
      scheduleCloudSave(game);
      showToast("Partie importée.", "success");
    } catch (error) {
      showToast("Le fichier de partie n'est pas valide.", "error");
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
  renderMarkerPasswordCloudStatus();
  renderAppVersion({ version: appVersion || APP_VERSION_FALLBACK, updatedAt: "" });
}

function renderMarkerPasswordCloudStatus() {
  const status = $("#markerPasswordCloudStatus");
  if (!status) return;
  const syncedAt = appData.settings?.markerPasswordCloudSyncedAt;
  const syncTime = syncedAt
    ? new Date(syncedAt).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })
    : "--:--";
  const labels = {
    local: "Mot de passe local",
    synced: "Mot de passe cloud synchronisé",
    error: "Erreur de synchronisation"
  };
  status.innerHTML = `
    <div><span>Statut</span><strong>${labels[markerPasswordCloudStatus] || labels.local}</strong></div>
    <div><span>Dernière synchronisation</span><strong>${syncTime}</strong></div>
  `;
  status.classList.toggle("sync-error", markerPasswordCloudStatus === "error");
  status.classList.toggle("sync-ok", markerPasswordCloudStatus === "synced");
}

// Sécurité MVP : ce mot de passe protège l'interface dans un site statique GitHub Pages,
// mais ce n'est pas une authentification forte. Pour une vraie sécurité, migrer vers Supabase Auth ou une Edge Function.
function getAdminPassword() {
  return appData.settings?.markerPassword || localStorage.getItem(ADMIN_PASSWORD_STORAGE_KEY) || DEFAULT_ADMIN_PASSWORD;
}

function checkAdminPassword(password) {
  return String(password || "") === getAdminPassword();
}

function setAdminSession() {
  sessionStorage.setItem(ADMIN_SESSION_KEY, "true");
}

function isAdminAuthenticated() {
  return sessionStorage.getItem(ADMIN_SESSION_KEY) === "true";
}

function logoutAdmin() {
  releaseScorerLock(getCurrentGame());
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  setScorerReadOnlyMode(false);
  showScreen("admin");
  showToast("Déconnexion Admin effectuée.", "info");
}

function handleAdminLogin(event) {
  event.preventDefault();
  if (!checkAdminPassword($("#adminPasswordInput")?.value || "")) {
    $("#adminLoginError").textContent = "Mot de passe incorrect.";
    return;
  }
  setAdminSession();
  const resumeId = new URLSearchParams(window.location.search).get("resume");
  if (resumeId) loadGameFromCloud(resumeId);
  renderAll();
  showToast("Admin déverrouillé.", "success");
}

async function saveMarkerPassword(newPassword) {
  const password = String(newPassword || "").trim();
  if (!password) {
    showToast("Le mot de passe ne peut pas etre vide.", "warning");
    return { success: false, error: "empty_password" };
  }
  if (!appData.settings || typeof appData.settings !== "object") appData.settings = {};
  appData.settings.markerPassword = password;
  localStorage.setItem(ADMIN_PASSWORD_STORAGE_KEY, password);
  saveData();
  markerPasswordCloudStatus = "local";
  const cloudResult = await syncMarkerPasswordToCloud(password);
  if (cloudResult.success) {
    appData.settings.markerPasswordCloudSyncedAt = cloudResult.syncedAt;
    markerPasswordCloudStatus = "synced";
    saveData();
    renderMarkerPasswordCloudStatus();
    showToast("Mot de passe synchronisé dans le cloud.", "success");
  } else {
    markerPasswordCloudStatus = "error";
    renderMarkerPasswordCloudStatus();
    showToast("Mot de passe sauvegardé localement. Synchronisation cloud impossible.", "warning");
  }
  return cloudResult;
}

async function syncMarkerPasswordToCloud(password) {
  if (!canUploadAfterResetCheck()) return { success: false, error: "reset_check_pending" };
  if (!supabaseClient || !navigator.onLine) return { success: false, error: "cloud_unavailable" };
  const updatedAt = new Date().toISOString();
  try {
    // TODO : remplacer le stockage en clair par un hash sécurisé.
    const { error } = await supabaseClient
      .from("app_settings_cloud")
      .upsert({
        setting_key: "marker_password",
        setting_value: {
          password,
          updatedAt
        },
        updated_at: updatedAt
      }, {
        onConflict: "setting_key"
      });
    if (error) throw error;
    return { success: true, syncedAt: updatedAt };
  } catch (error) {
    console.warn("Marker password cloud sync failed", error);
    appLog(`Erreur synchronisation mot de passe cloud : ${error.message || error}`, "error");
    return { success: false, error };
  }
}

async function loadMarkerPasswordFromCloud(options = {}) {
  if (!supabaseClient || !navigator.onLine) {
    markerPasswordCloudStatus = options.startup ? markerPasswordCloudStatus : "error";
    if (!options.silent) showToast("Supabase n'est pas disponible. Mot de passe local conservé.", "warning");
    renderMarkerPasswordCloudStatus();
    return { success: false, error: "cloud_unavailable" };
  }
  try {
    const { data, error } = await supabaseClient
      .from("app_settings_cloud")
      .select("setting_value, updated_at")
      .eq("setting_key", "marker_password")
      .maybeSingle();
    if (error) throw error;
    const password = data?.setting_value?.password;
    if (!password) {
      markerPasswordCloudStatus = "local";
      renderMarkerPasswordCloudStatus();
      if (!options.silent) showToast("Aucun mot de passe cloud trouvé.", "info");
      return { success: false, error: "missing_password" };
    }
    if (!appData.settings || typeof appData.settings !== "object") appData.settings = {};
    appData.settings.markerPassword = String(password);
    appData.settings.markerPasswordCloudSyncedAt = data.updated_at || data.setting_value.updatedAt || new Date().toISOString();
    localStorage.setItem(ADMIN_PASSWORD_STORAGE_KEY, appData.settings.markerPassword);
    saveData();
    markerPasswordCloudStatus = "synced";
    renderSettings();
    if (!options.silent) showToast("Mot de passe chargé depuis le cloud.", "success");
    return { success: true, syncedAt: appData.settings.markerPasswordCloudSyncedAt };
  } catch (error) {
    console.warn("Marker password cloud load failed", error);
    appLog(`Erreur chargement mot de passe cloud : ${error.message || error}`, "error");
    markerPasswordCloudStatus = options.startup ? markerPasswordCloudStatus : "error";
    renderMarkerPasswordCloudStatus();
    if (!options.silent) showToast("Erreur de synchronisation. Mot de passe local conservé.", "error");
    return { success: false, error };
  }
}

function hashPassword(password) {
  // TODO : remplacer le stockage en clair par un hash sécurisé.
  return String(password || "");
}

async function updateAdminPassword(event) {
  event?.preventDefault();
  const input = $("#newAdminPasswordInput");
  const value = input?.value.trim();
  if (!value || value.length < 4) return showToast("Entrez un mot de passe d'au moins 4 caractères.", "warning");
  await saveMarkerPassword(value);
  input.value = "";
}

async function updateSettingsMarkerPassword(event) {
  event?.preventDefault();
  const input = $("#settingsMarkerPasswordInput");
  const value = input?.value.trim();
  if (!value || value.length < 4) return showToast("Entrez un mot de passe d'au moins 4 caractères.", "warning");
  await saveMarkerPassword(value);
  input.value = "";
}

function renderAdminScreen() {
  const container = $("#adminContent");
  if (!container) return;
  container.innerHTML = isAdminAuthenticated() ? renderAdminDashboard() : renderAdminLoginScreen();
}

function renderAdminLoginScreen() {
  return `
    <section class="section-title">
      <div>
        <p class="eyebrow">Zone privée</p>
        <h2>Admin / Marqueur</h2>
        <p>Connectez-vous pour scorer les matchs, gérer le calendrier et modifier les données.</p>
      </div>
    </section>
    <form class="card form-card admin-login-card" onsubmit="handleAdminLogin(event)">
      <h3>Connexion Admin</h3>
      <label>Mot de passe
        <input id="adminPasswordInput" type="password" autocomplete="current-password" required>
      </label>
      <p id="adminLoginError" class="form-error"></p>
      <button type="submit" class="primary-btn">Entrer dans Admin</button>
      <p class="helper-text">Sécurité MVP : le mot de passe protège l'interface, mais ce n'est pas une authentification forte.</p>
    </form>
  `;
}

function renderAdminDashboard() {
  const game = getCurrentGame();
  return `
    <section class="section-title admin-title">
      <div>
        <p class="eyebrow">Zone privée</p>
        <h2>Admin / Marqueur</h2>
        <p>Actions de gestion, scoring, cloud, maintenance et paramètres.</p>
      </div>
      <button class="secondary-btn" onclick="logoutAdmin()">Se déconnecter</button>
    </section>
    <div class="admin-dashboard-grid">
      <article class="home-card dashboard-card">
        <h3>Actions principales</h3>
        <div class="home-card-actions">
          <button class="primary-btn" onclick="openScorerMode()">Ouvrir mode marqueur</button>
          <button onclick="openManageGames()">Créer / gérer les matchs</button>
          <button onclick="openManagePlayers()">Gérer joueurs</button>
          <button onclick="openCalendarAdmin()">Calendrier</button>
          <button onclick="showScreen('report')">Feuille de match / Rapports</button>
        </div>
      </article>
      <article class="home-card dashboard-card">
        <h3>Cloud</h3>
        <p>${escapeHtml(game ? cloudSaveStatusLabel(game) : "Aucune partie active")}</p>
        <div class="home-card-actions">
          <button class="primary-btn" onclick="syncAllCloudData()">Synchroniser données cloud</button>
          <button class="primary-btn" onclick="loadGamesFromCloud()">Charger matchs cloud</button>
          <button onclick="refreshCurrentGameFromCloud()">Rafraîchir partie active</button>
        </div>
      </article>
      <article class="home-card dashboard-card">
        <h3>Maintenance</h3>
        <div class="home-card-actions">
          <button onclick="openTeamSettings()">Paramètres équipe</button>
          <button onclick="openDiagnostics()">Diagnostic</button>
          <button class="warning-btn" onclick="forceAppUpdate()">Forcer mise à jour PWA</button>
        </div>
      </article>
      <article class="home-card dashboard-card">
        <h3>Mot de passe marqueur</h3>
        <form onsubmit="updateAdminPassword(event)" class="inline-admin-form">
          <label>Nouveau mot de passe
            <input id="newAdminPasswordInput" type="password" autocomplete="new-password">
          </label>
          <button type="submit">Mettre à jour</button>
        </form>
        <p class="helper-text">Mot de passe par défaut : changer-moi. Ne jamais mettre de clé service_role Supabase dans le client.</p>
      </article>
    </div>
  `;
}

function openScorerMode() {
  if (!isAdminAuthenticated()) return showScreen("admin");
  const game = getCurrentGame();
  if (game && normalizeGameStatus(game.status) === "in_progress") acquireScorerLock(game);
  showScreen("live");
}

function openManageGames() {
  if (!isAdminAuthenticated()) return showScreen("admin");
  showScreen("calendar");
}

function openManagePlayers() {
  if (!isAdminAuthenticated()) return showScreen("admin");
  showScreen("players");
}

function openCalendarAdmin() {
  openManageGames();
}

function openTeamSettings() {
  if (!isAdminAuthenticated()) return showScreen("admin");
  showScreen("settings");
}

function openDiagnostics() {
  if (!isAdminAuthenticated()) return showScreen("admin");
  const url = new URL(window.location.href);
  url.searchParams.set("debug", "1");
  window.location.href = url.toString();
}

function ensureAdminBeforeScoring() {
  if (isAdminAuthenticated()) {
    const game = getCurrentGame();
    if (game && !prepareScoringSession(game)) {
      showToast("Mode lecture seule : prenez le relais pour scorer cette partie.", "warning");
      return false;
    }
    return true;
  }
  showScreen("admin");
  return false;
}

function renderPublicLiveScreen() {
  const container = $("#publicLiveContent");
  if (!container) return;
  const liveGames = appData.games.filter((game) => normalizeGameStatus(game.status) === "in_progress");
  const game = getCurrentLiveGame() || liveGames[0] || getRecentGames(1)[0];
  if (!game) {
    container.innerHTML = `<div class="empty-state">Aucun match disponible. <button onclick="loadGamesFromCloud()">Charger les matchs</button></div>`;
    return;
  }
  container.innerHTML = renderSpectatorGame(game, liveGames);
}

function getCurrentLiveGame() {
  return appData.games.find((game) => normalizeGameStatus(game.status) === "in_progress") || null;
}

function renderSpectatorGame(game, liveGames = []) {
  return `
    <div class="spectator-public-grid">
      <section class="spectator-card spectator-score-card">
        <div class="card-title-row">
          <h2>${escapeHtml(appData.team.name)} vs ${escapeHtml(game.opponent || "Adversaire")}</h2>
          <span class="mini-badge">${normalizeGameStatus(game.status) === "in_progress" ? "En direct" : "Terminé"}</span>
        </div>
        ${renderPublicSpectatorScoreboard(game)}
        ${renderPublicSpectatorBases(game)}
        <div class="home-card-actions">
          ${game.publicGameId ? `<button class="primary-btn" onclick="openLiveGame('${game.publicGameId}')">Ouvrir le lien live</button>` : ""}
          <button onclick="openGameStats('${game.id}')">Voir stats du match</button>
        </div>
      </section>
      <section class="spectator-card">
        <h3>Play-by-play</h3>
        <div class="play-list">${(game.playByPlay || []).slice(0, 12).map((play) => `<div class="play-item"><strong>${escapeHtml(play.result || "")}</strong><span>${escapeHtml(play.description || "")}</span></div>`).join("") || `<div class="empty-state">Aucune action.</div>`}</div>
      </section>
      ${liveGames.length > 1 ? `<section class="spectator-card wide-dashboard-card"><h3>Matchs live disponibles</h3>${liveGames.map((item) => renderGameCard(item)).join("")}</section>` : ""}
    </div>
  `;
}

function renderPublicSpectatorScoreboard(game) {
  return `
    <div class="public-scoreboard">
      <div><span>${escapeHtml(appData.team.name)}</span><strong>${game.scoreTeam}</strong></div>
      <div><span>${escapeHtml(game.opponent || "Adversaire")}</span><strong>${game.scoreOpponent}</strong></div>
      <p>Manche ${escapeHtml(formatHalfInningSummary(game))} · Retraits ${game.outs}/3</p>
      <p>Frappeur : ${escapeHtml(getCurrentBatterLabel(game))}</p>
      <p>Dernière action : ${escapeHtml(renderLastActionSummary(game))}</p>
    </div>
  `;
}

function renderPublicSpectatorBases(game) {
  return `
    <div class="public-bases">
      <div><span>1B</span><strong>${escapeHtml(runnerName(game.bases.first, game))}</strong></div>
      <div><span>2B</span><strong>${escapeHtml(runnerName(game.bases.second, game))}</strong></div>
      <div><span>3B</span><strong>${escapeHtml(runnerName(game.bases.third, game))}</strong></div>
    </div>
  `;
}

function openLiveGame(publicGameId) {
  if (!publicGameId) return showScreen("public-live");
  window.location.href = `${window.location.origin}${window.location.pathname}?watch=${publicGameId}`;
}

function renderGameCard(game) {
  return renderRecentGameCard(game);
}

function openGameStats(gameId) {
  selectedStatsGameId = gameId;
  activeStatsView = "game";
  showScreen("stats");
}

function renderAll() {
  document.body.classList.toggle("admin-authenticated", isAdminAuthenticated());
  renderHeader();
  renderHome();
  renderPublicLiveScreen();
  renderAdminScreen();
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

function summaryRows(rows) {
  return rows.map(([label, value]) => `
    <div class="summary-row">
      <span>${escapeHtml(String(label))}</span>
      <strong>${escapeHtml(String(value))}</strong>
    </div>
  `).join("");
}

function renderPublicCurrentGameCard() {
  const liveGame = getCurrentLiveGame() || appData.games.find((game) => normalizeGameStatus(game.status) === "in_progress");
  if (!liveGame) {
    return `
      <article class="home-card dashboard-card">
        <h3>Match en cours</h3>
        <p>Aucune partie en cours.</p>
        <div class="home-card-actions">
          <button class="primary-btn" onclick="loadGamesFromCloud()">Charger les matchs</button>
        </div>
      </article>
    `;
  }

  return `
    <article class="home-card dashboard-card">
      <h3>Match en cours</h3>
      <p>${escapeHtml(appData.team.name)} vs ${escapeHtml(liveGame.opponent || "Adversaire")}</p>
      <p class="home-detail">${escapeHtml(appData.team.name)} ${liveGame.scoreTeam} - ${liveGame.scoreOpponent} ${escapeHtml(liveGame.opponent || "Adversaire")} - ${escapeHtml(formatHalfInningSummary(liveGame))} - ${liveGame.outs || 0} retrait${Number(liveGame.outs || 0) > 1 ? "s" : ""}</p>
      <div class="home-card-actions">
        <button class="primary-btn" onclick="openLiveGame('${liveGame.publicGameId || ""}')">Suivre le match live</button>
      </div>
    </article>
  `;
}

function renderHomeScreen() {
  const record = calculateTeamRecord();
  const upcoming = getUpcomingCalendarEvents(5);
  const activePlayers = appData.team.players.filter((player) => player.active !== false).length;

  $("#homeTopGrid").innerHTML = `
    ${renderPublicCurrentGameCard()}
    <article class="home-card dashboard-card">
      <h3>Resume rapide</h3>
      <div class="record-grid">
        ${recordStat("Victoires", record.wins)}
        ${recordStat("Defaites", record.losses)}
        ${recordStat("Nuls", record.ties)}
        ${recordStat("Parties sauvegardees", appData.games.length)}
        ${recordStat("Joueurs actifs", activePlayers)}
      </div>
    </article>
  `;

  $("#homeUpcoming").innerHTML = `
    <article class="home-card dashboard-card wide-dashboard-card">
      <div class="card-title-row">
        <h3>Prochains matchs</h3>
      </div>
      <div class="upcoming-list">
        ${upcoming.length ? upcoming.map(renderUpcomingEvent).join("") : `<div class="empty-state">Aucun match a venir pour le moment.</div>`}
      </div>
    </article>
  `;

  renderRecentGames();

  $("#homeQuickActions").innerHTML = `
    <button class="primary-btn" onclick="loadGamesFromCloud()">Charger les matchs cloud</button>
  `;
}

function renderHome() {
  appLog("Rendu écran Accueil", "info");
  renderHomeScreen();
}

function getRecentGames(limit = 5) {
  return [...appData.games]
    .filter((game) => (game.atBats?.length || game.opponentAtBats?.length || normalizeGameStatus(game.status) !== "preparation"))
    .sort((a, b) => {
      const bTime = new Date(b.cloudUpdatedAt || b.updatedAt || b.date || 0).getTime();
      const aTime = new Date(a.cloudUpdatedAt || a.updatedAt || a.date || 0).getTime();
      return bTime - aTime;
    })
    .slice(0, limit);
}

function renderRecentGames() {
  const container = $("#homeRecentGames");
  if (!container) return;
  const games = getRecentGames(5);
  container.innerHTML = `
    <article class="home-card dashboard-card wide-dashboard-card">
      <div class="card-title-row">
        <h3>Derniers matchs</h3>
        <button class="small-btn primary-btn" onclick="loadGamesFromCloud()">Charger les matchs cloud</button>
      </div>
      <div class="recent-games-list">
        ${games.length ? games.map(renderRecentGameCard).join("") : `<div class="empty-state">Aucun match joue pour le moment.</div>`}
      </div>
    </article>
  `;
}

function renderRecentGameCard(game) {
  const status = normalizeGameStatus(game.status);
  const completed = status === "completed";
  const result = completed ? gameResultLabel(game) : "En cours";
  const primaryAction = status === "in_progress"
    ? `<button class="small-btn primary-btn" onclick="openLiveGame('${game.publicGameId || ""}')">Suivre live</button>`
    : `<button class="small-btn primary-btn" onclick="openGameStats('${game.id}')">Voir stats</button>`;
  return `
    <div class="upcoming-item recent-game-item">
      <div>
        <strong>${escapeHtml(formatDate(game.date))} - ${escapeHtml(game.opponent || "Adversaire")}</strong>
        <div class="player-meta">
          <span class="mini-badge">${escapeHtml(status === "completed" ? "Termine" : game.status || "Match")}</span>
          <span>${escapeHtml(appData.team.name)} ${game.scoreTeam} - ${game.scoreOpponent} ${escapeHtml(game.opponent || "Adversaire")}</span>
          <span>${escapeHtml(result)}</span>
        </div>
      </div>
      <div class="row-actions">
        <button class="small-btn secondary-btn" onclick="openGameStats('${game.id}')">Stats du match</button>
        ${primaryAction}
      </div>
    </div>
  `;
}

function gameResultLabel(game) {
  const team = Number(game.scoreTeam || 0);
  const opponent = Number(game.scoreOpponent || 0);
  if (team > opponent) return "Victoire";
  if (team < opponent) return "Defaite";
  return "Nul";
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

function renderUpcomingEvent(event) {
  const linkedGame = event.linkedGameId ? appData.games.find((game) => game.id === event.linkedGameId) : null;
  const status = linkedGame ? normalizeGameStatus(linkedGame.status) : normalizeGameStatus(event.status);
  const action = linkedGame && status === "in_progress"
    ? `<button class="small-btn primary-btn" onclick="openLiveGame('${linkedGame.publicGameId || ""}')">Suivre live</button>`
    : linkedGame && status === "completed"
      ? `<button class="small-btn secondary-btn" onclick="openGameStats('${linkedGame.id}')">Voir stats</button>`
      : "";
  return `
    <div class="upcoming-item">
      <div>
        <strong>${escapeHtml(formatDate(event.date))}${event.time ? ` - ${escapeHtml(event.time)}` : ""} - ${escapeHtml(event.opponent || "Adversaire")}</strong>
        <div class="player-meta">
          <span class="mini-badge">${escapeHtml(event.homeAway || "local")}</span>
          <span class="mini-badge">${escapeHtml(event.gameType || "Saison")}</span>
          <span>${escapeHtml(event.field || "Terrain a confirmer")}</span>
        </div>
      </div>
      ${action ? `<div class="row-actions">${action}</div>` : ""}
    </div>
  `;
}

function renderSpectatorMode(publicGameId) {
  applyTeamBranding();
  document.querySelector(".app-header")?.classList.add("hidden");
  document.querySelector("main")?.classList.add("hidden");
  const root = $("#spectatorRoot");
  root.classList.remove("hidden");
  root.innerHTML = `
    <div class="spectator-shell">
      ${renderSpectatorMobileHeader()}
      <div id="spectatorContent" class="spectator-grid"></div>
    </div>
  `;
  loadSpectatorGame(publicGameId);
  subscribeSpectatorGame(publicGameId);
}

function applyTeamBranding() {
  const root = document.documentElement;
  const colors = TEAM_BRANDING.colors || {};
  root.style.setProperty("--titans-green", colors.primary || "#2F7D46");
  root.style.setProperty("--titans-green-dark", colors.primaryDark || "#1E5B33");
  root.style.setProperty("--titans-white", colors.white || "#FFFFFF");
  root.style.setProperty("--titans-silver", colors.silver || "#D9DEE5");
  root.style.setProperty("--titans-charcoal", colors.charcoal || "#22303C");
}

function renderSpectatorMobileHeader() {
  return `
    <header class="spectator-brand-header">
      <div class="spectator-brand-logo">
        <img src="${escapeHtml(TEAM_BRANDING.logoPath)}" alt="Logo ${escapeHtml(TEAM_BRANDING.teamName)}" onerror="this.classList.add('hidden')">
        <span>${escapeHtml(TEAM_BRANDING.shortName.charAt(0))}</span>
      </div>
      <div class="spectator-brand-copy">
        <p class="eyebrow">${escapeHtml(TEAM_BRANDING.shortName)}</p>
        <h1>${escapeHtml(TEAM_BRANDING.teamName)} - Match en direct</h1>
        <p id="spectatorConnection">Connexion au live...</p>
      </div>
    </header>
  `;
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
    ${renderMobileSpectatorScoreCard(spectatorGameState)}
    ${renderSpectatorAnimatedField(spectatorGameState)}
    ${renderSpectatorPlayByPlay(spectatorPlayByPlay)}
    ${renderMobileInningScoreboard(spectatorGameState)}
  `;
}

function renderMobileSpectatorScoreCard(liveGame) {
  const team = TEAM_BRANDING.shortName || liveGame.team_name || "Notre Ã©quipe";
  const opponent = liveGame.opponent_name || "Adversaire";
  return `
    <section class="spectator-score-card" aria-label="Score principal">
      <div class="mobile-score-teams">
        <div>
          <span>${escapeHtml(getTeamShortName(team))}</span>
          <strong>${liveGame.score_team ?? 0}</strong>
        </div>
        <div>
          <span>${escapeHtml(getTeamShortName(opponent))}</span>
          <strong>${liveGame.score_opponent ?? 0}</strong>
        </div>
      </div>
      <div class="mobile-score-meta">
        <span>${escapeHtml(liveGame.half || "—")} ${escapeHtml(String(liveGame.current_inning || "—"))}e manche</span>
        <span>${escapeHtml(String(liveGame.outs ?? 0))} retrait${Number(liveGame.outs || 0) > 1 ? "s" : ""}</span>
      </div>
      <div class="mobile-score-detail">Batteur : ${escapeHtml(liveGame.current_batter || "—")}</div>
      <div class="mobile-score-last">DerniÃ¨re : ${escapeHtml(shortenText(liveGame.last_action || "Aucune action rÃ©cente", 58))}</div>
    </section>
  `;
}

function renderMobileInningScoreboard(liveGame) {
  return renderInningScoreboard(liveGame).replace("spectator-card table-wrap", "spectator-card table-wrap spectator-inning-card");
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
        ${renderEmbeddedMiniScoreboard(liveGame, { mobile: true })}
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
        ${renderEmbeddedMiniScoreboard(liveGame, { mobile: true })}
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

function renderEmbeddedMiniScoreboard(liveGame, options = {}) {
  const team = liveGame.team_name || "Notre équipe";
  const opponent = liveGame.opponent_name || "Adversaire";
  const batter = liveGame.current_batter || "—";
  const lastAction = liveGame.last_action || "Aucune action";
  const compactClass = options.mobile ? " mobile-mini-scoreboard" : "";
  return `
    <aside class="mini-broadcast-scoreboard${compactClass}" aria-label="Tableau de pointage compact">
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
  const name = `${player.firstName || ""} ${player.lastName || ""}`.trim() || player.name || "";
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

function getPlayerDisplayName(playerId, fallbackSnapshot = null) {
  const player = findPlayer(playerId);
  if (player) return formatPlayer(player);
  const snapshot = fallbackSnapshot || findBatterSnapshotForPlayer(playerId);
  if (snapshot) {
    if (snapshot.displayName) return snapshot.displayName;
    const cleanNumber = String(snapshot.number || "").replace(/^#/, "").trim();
    const number = cleanNumber ? `#${cleanNumber} ` : "";
    const name = snapshot.name || `${snapshot.firstName || ""} ${snapshot.lastName || ""}`.trim();
    if (name) return `${number}${name}`.trim();
    if (cleanNumber) return `Joueur #${cleanNumber}`;
  }
  return "Joueur inconnu";
}

function findBatterSnapshotForPlayer(playerId) {
  for (const game of appData.games) {
    const snapshotPlayer = game.teamSnapshot?.players?.find((player) => player.id === playerId || player.playerId === playerId);
    if (snapshotPlayer) {
      return {
        playerId,
        number: snapshotPlayer.number || "",
        firstName: snapshotPlayer.firstName || "",
        lastName: snapshotPlayer.lastName || "",
        name: snapshotPlayer.name || "",
        displayName: formatPlayer(snapshotPlayer)
      };
    }
    const atBat = (game.atBats || []).find((item) => item.playerId === playerId && item.batterSnapshot);
    if (atBat?.batterSnapshot) return atBat.batterSnapshot;
  }
  return null;
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

function statPlayerName(playerId, side, fallbackSnapshot = null) {
  const game = getGameForDisplay();
  if (side === "opponent") {
    return opponentBatterName(findOpponentBatter(game, playerId), game);
  }
  return getPlayerDisplayName(playerId, fallbackSnapshot);
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
    strikeout: "K",
    error: "Erreur",
    fielderschoice: "FC",
    doubleplay: "DP",
    runnerout: "Balle en jeu",
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
