const { app, BrowserWindow } = require('electron');

// 1. Inicia nuestro servidor Express en segundo plano
require('./server.js');

const createWindow = () => {
  // 2. Crea la ventana principal de la aplicación
  const mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    title: "Momentos en Vivo - Panel de Control"
  });

  // 3. Carga la página web del panel de moderación
  mainWindow.loadURL('http://localhost:3000/moderador.html');
};

// 4. Llama a la función para crear la ventana cuando la app esté lista
app.whenReady().then(createWindow);

// 5. Código estándar para cerrar la app correctamente
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});