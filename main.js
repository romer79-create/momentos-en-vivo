const { app, BrowserWindow, screen } = require('electron');

// 1. Inicia nuestro servidor Express en segundo plano
require('./server.js');

const createWindow = () => {
  // --- Ventana Principal (Ahora será la del invitado) ---
  const mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    title: "Momentos en Vivo", // Título actualizado
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  // Carga la página web del invitado (index.html)
  mainWindow.loadURL('http://localhost:3000/index.html');

  // --- Lógica para la Segunda Pantalla (Proyección) ---
  const displays = screen.getAllDisplays();
  const externalDisplay = displays.find((display) => {
    return display.bounds.x !== 0 || display.bounds.y !== 0;
  });

  if (externalDisplay) {
    const projectionWindow = new BrowserWindow({
      x: externalDisplay.bounds.x,
      y: externalDisplay.bounds.y,
      fullscreen: true,
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      }
    });
    projectionWindow.loadURL('http://localhost:3000/proyeccion.html');
  }
};

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});