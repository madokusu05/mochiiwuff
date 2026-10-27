const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  shell,
  Tray,
} = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");

const APP_DIR = __dirname;
const CHAT_DIR = path.resolve(APP_DIR, "..");
const CHAT_URL = "http://127.0.0.1:8000";
const WINDOW_SIZE = { width: 300, height: 390 };

let avatarWindow;
let tray;
let chatServerProcess;
let moveTimer;
let activityTimer;
let currentTarget;
let nextMoveAt = 0;
let roaming = true;
let dragging = false;
let facing = 1;
let quitting = false;
let lastSpeakingState = false;
let lastActivityError;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function chatServerIsReady() {
  try {
    const response = await fetch(CHAT_URL, {
      signal: AbortSignal.timeout(1200),
    });
    const page = await response.text();
    return response.ok && page.includes("Mika — ton coin tranquille");
  } catch {
    return false;
  }
}

async function ensureChatServer() {
  if (await chatServerIsReady()) return;

  chatServerProcess = spawn("python", ["server.py"], {
    cwd: CHAT_DIR,
    stdio: "ignore",
    windowsHide: true,
  });
  chatServerProcess.once("error", (error) => {
    console.error("Impossible de démarrer le serveur de chat Python.", error);
  });

  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await chatServerIsReady()) return;
    if (chatServerProcess.exitCode !== null) break;
    await delay(250);
  }

  throw new Error(
    "Le serveur de chat local n'a pas démarré. Vérifie que Python 3 est installé.",
  );
}

async function pollChatActivity() {
  try {
    const response = await fetch(`${CHAT_URL}/api/activity`, {
      signal: AbortSignal.timeout(1200),
    });
    if (!response.ok) {
      throw new Error(`Le serveur de chat a répondu ${response.status}.`);
    }

    const activity = await response.json();
    if (typeof activity.speaking !== "boolean") {
      throw new Error("L'état de conversation de Mika est invalide.");
    }

    lastActivityError = undefined;
    if (activity.speaking !== lastSpeakingState) {
      lastSpeakingState = activity.speaking;
      avatarWindow?.webContents.send("mika:conversation", lastSpeakingState);
    }
  } catch (error) {
    if (lastActivityError !== error.message) {
      console.error("Impossible de lire l'état de conversation de Mika.", error);
    }
    lastActivityError = error.message;
    if (lastSpeakingState) {
      lastSpeakingState = false;
      avatarWindow?.webContents.send("mika:conversation", false);
    }
  } finally {
    if (!quitting) activityTimer = setTimeout(pollChatActivity, 400);
  }
}

function setRoaming(enabled) {
  roaming = enabled;
  currentTarget = undefined;
  nextMoveAt = Date.now() + (enabled ? 1500 : 0);
  avatarWindow?.webContents.send("mika:movement", false, facing);
}

function showAvatar() {
  if (!avatarWindow || avatarWindow.isDestroyed()) return;
  avatarWindow.showInactive();
}

function getTargetPosition() {
  const bounds = avatarWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const area = display.workArea;
  const margin = 12;

  return {
    x:
      area.x +
      margin +
      Math.round(Math.random() * Math.max(0, area.width - bounds.width - margin * 2)),
    y:
      area.y +
      margin +
      Math.round(Math.random() * Math.max(0, area.height - bounds.height - margin * 2)),
  };
}

function startRoaming() {
  moveTimer = setInterval(() => {
    if (
      !avatarWindow ||
      avatarWindow.isDestroyed() ||
      !avatarWindow.isVisible() ||
      !roaming ||
      dragging
    ) {
      return;
    }

    const now = Date.now();
    const bounds = avatarWindow.getBounds();

    if (!currentTarget) {
      if (now < nextMoveAt) return;
      currentTarget = getTargetPosition();
    }

    const dx = currentTarget.x - bounds.x;
    const dy = currentTarget.y - bounds.y;
    const distance = Math.hypot(dx, dy);

    if (distance < 3) {
      currentTarget = undefined;
      nextMoveAt = now + 2500 + Math.random() * 4500;
      avatarWindow.webContents.send("mika:movement", false, facing);
      return;
    }

    const step = Math.min(distance, 1.15);
    const direction = dx < 0 ? -1 : 1;
    if (direction !== facing) {
      facing = direction;
      avatarWindow.webContents.send("mika:facing", facing);
    }

    avatarWindow.setPosition(
      Math.round(bounds.x + (dx / distance) * step),
      Math.round(bounds.y + (dy / distance) * step),
    );
    avatarWindow.webContents.send("mika:movement", true, facing);
  }, 50);
}

function createAvatarWindow() {
  const workArea = screen.getPrimaryDisplay().workArea;
  avatarWindow = new BrowserWindow({
    ...WINDOW_SIZE,
    x: workArea.x + workArea.width - WINDOW_SIZE.width - 24,
    y: workArea.y + workArea.height - WINDOW_SIZE.height - 24,
    title: "Mika",
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(APP_DIR, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  avatarWindow.setAlwaysOnTop(true, "floating");
  avatarWindow.on("closed", () => {
    avatarWindow = undefined;
  });
  avatarWindow.on("blur", () => {
    if (!quitting) avatarWindow?.hide();
  });

  const devUrl = process.env.MIKA_DEV_SERVER_URL;
  if (devUrl) {
    void avatarWindow.loadURL(devUrl);
  } else {
    void avatarWindow.loadFile(path.join(APP_DIR, "dist", "index.html"));
  }

  avatarWindow.showInactive();
}

function createTray() {
  const icon =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAfUlEQVR42mNgGAUEwLtpO/5jE8OGidVPtMXUxgNqOUmOGFAH0NLyQeGIAQ+Bwe0AesQ/XkeMbAfQy3KcjiCkwcfAB45hYnO98+EYn7pRB1DFAdgwNgfQLA0Mq5wwWhCN1oYD5ogBbRUPaNOc4o7JgFlOiUNo3l2ju6XDFgAAjtflVTLmh/QAAAAASUVORK5CYII=";
  tray = new Tray(nativeImage.createFromDataURL(icon));
  tray.setToolTip("Mika");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Afficher Mika", click: showAvatar },
      {
        label: "Masquer Mika",
        click: () => avatarWindow?.hide(),
      },
      { type: "separator" },
      { label: "Quitter Mika", click: () => app.quit() },
    ]),
  );
  tray.on("click", () => {
    if (avatarWindow?.isVisible()) {
      avatarWindow.hide();
    } else {
      showAvatar();
    }
  });
}

ipcMain.on("mika:drag-start", () => {
  dragging = true;
  currentTarget = undefined;
  avatarWindow?.webContents.send("mika:movement", false, facing);
});

ipcMain.on("mika:drag-move", (_event, deltaX, deltaY) => {
  if (!dragging || !avatarWindow || avatarWindow.isDestroyed()) return;

  const bounds = avatarWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const area = display.workArea;
  const x = Math.max(
    area.x,
    Math.min(area.x + area.width - bounds.width, bounds.x + deltaX),
  );
  const y = Math.max(
    area.y,
    Math.min(area.y + area.height - bounds.height, bounds.y + deltaY),
  );
  avatarWindow.setPosition(Math.round(x), Math.round(y));
});

ipcMain.on("mika:drag-end", () => {
  dragging = false;
  nextMoveAt = Date.now() + 4000;
});

ipcMain.handle("mika:toggle-roaming", () => {
  setRoaming(!roaming);
  return roaming;
});

ipcMain.handle("mika:open-chat", async () => {
  if (!(await chatServerIsReady())) {
    await dialog.showMessageBox(avatarWindow, {
      type: "warning",
      title: "Chat Mika indisponible",
      message: "Le chat local de Mika ne répond pas.",
      detail:
        "Ferme les anciens serveurs de chat puis relance l'application Mika.",
    });
    return false;
  }

  await shell.openExternal(CHAT_URL);
  return true;
});

ipcMain.on("mika:quit", () => app.quit());

app.whenReady().then(async () => {
  try {
    await ensureChatServer();
    createAvatarWindow();
    createTray();
    startRoaming();
    void pollChatActivity();
  } catch (error) {
    await dialog.showMessageBox({
      type: "error",
      title: "Impossible de démarrer Mika",
      message: error.message,
      detail:
        "Vérifie aussi qu'aucun autre programme n'utilise le port 8000, puis relance Mika.",
    });
    app.quit();
  }
});

app.on("before-quit", () => {
  quitting = true;
  clearInterval(moveTimer);
  clearTimeout(activityTimer);
  if (chatServerProcess && chatServerProcess.exitCode === null) {
    chatServerProcess.kill();
  }
});

app.on("window-all-closed", () => {
  if (!quitting) app.quit();
});
