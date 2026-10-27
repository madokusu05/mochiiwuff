const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mikaDesktop", {
  openChat: () => ipcRenderer.invoke("mika:open-chat"),
  toggleRoaming: () => ipcRenderer.invoke("mika:toggle-roaming"),
  quit: () => ipcRenderer.send("mika:quit"),
  startDrag: () => ipcRenderer.send("mika:drag-start"),
  moveBy: (deltaX, deltaY) =>
    ipcRenderer.send("mika:drag-move", deltaX, deltaY),
  endDrag: () => ipcRenderer.send("mika:drag-end"),
  onMovement: (callback) => {
    ipcRenderer.on("mika:movement", (_event, moving, facing) =>
      callback(moving, facing),
    );
  },
  onFacing: (callback) => {
    ipcRenderer.on("mika:facing", (_event, facing) => callback(facing));
  },
  onConversationState: (callback) => {
    ipcRenderer.on("mika:conversation", (_event, speaking) =>
      callback(speaking),
    );
  },
});
