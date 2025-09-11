const { app, BrowserWindow, screen } = require('electron');

// 1. Inicia nuestro servidor Express en segundo plano
// Es importante que esté aquí para que las URLs locales funcionen
require('./server.js');

const createWindow = () => {
  // --- Ventana Principal (Panel de Moderación) ---
  const mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    title: "Momentos en Vivo - Panel de Control",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  // Carga la página web del panel de moderación
  mainWindow.loadURL('http://localhost:3000/moderador.html');

  // --- Lógica para la Segunda Pantalla (Proyección) ---

  // 1. Obtiene una lista de todas las pantallas conectadas
  const displays = screen.getAllDisplays();
  
  // 2. Busca una pantalla externa (que no sea la principal)
  const externalDisplay = displays.find((display) => {
    return display.bounds.x !== 0 || display.bounds.y !== 0;
  });

  // 3. Si encuentra una pantalla externa, crea una nueva ventana en ella
  if (externalDisplay) {
    const projectionWindow = new BrowserWindow({
      x: externalDisplay.bounds.x,
      y: externalDisplay.bounds.y,
      fullscreen: true, // La ponemos en pantalla completa
      autoHideMenuBar: true, // Oculta la barra de menú
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      }
    });

    // Carga la página de proyección en la nueva ventana
    projectionWindow.loadURL('http://localhost:3000/proyeccion.html');
  }
};

// Llama a la función para crear las ventanas cuando la app esté lista
app.whenReady().then(createWindow);

// Código estándar para cerrar la app correctamente
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});