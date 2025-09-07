// Sistema de Temas y Plantillas
class ThemeManager {
    constructor() {
        this.themes = {};
        this.currentTheme = null;
        this.customThemes = JSON.parse(localStorage.getItem('customThemes') || '{}');
    }

    // Cargar temas desde archivo JSON
    async loadThemes() {
        try {
            const response = await fetch('/themes.json');
            const data = await response.json();
            this.themes = { ...data.themes, ...this.customThemes };
            this.currentTheme = data.defaultTheme;
            console.log('✅ Temas cargados:', Object.keys(this.themes).length);
        } catch (error) {
            console.error('❌ Error cargando temas:', error);
            // Fallback a tema básico
            this.themes = this.getDefaultThemes();
        }
    }

    // Aplicar tema a un elemento
    applyTheme(element, themeName) {
        const theme = this.themes[themeName];
        if (!theme) {
            console.error(`Tema "${themeName}" no encontrado`);
            return;
        }

        // Aplicar colores CSS personalizados
        const root = element || document.documentElement;
        root.style.setProperty('--primary-color', theme.colors.primary);
        root.style.setProperty('--secondary-color', theme.colors.secondary);
        root.style.setProperty('--accent-color', theme.colors.accent);
        root.style.setProperty('--background-gradient', theme.colors.background);
        root.style.setProperty('--text-color', theme.colors.text);
        root.style.setProperty('--text-secondary', theme.colors.textSecondary);
        root.style.setProperty('--primary-font', theme.fonts.primary);
        root.style.setProperty('--secondary-font', theme.fonts.secondary);

        // Aplicar clases CSS dinámicas
        root.className = `theme-${themeName}`;

        // Actualizar elementos específicos
        this.updateThemeElements(theme);

        console.log(`🎨 Tema aplicado: ${theme.name}`);
    }

    // Actualizar elementos específicos del tema
    updateThemeElements(theme) {
        // Actualizar título principal
        const mainTitle = document.querySelector('h1');
        if (mainTitle) {
            mainTitle.style.fontFamily = theme.fonts.primary;
        }

        // Actualizar iconos
        this.updateIcons(theme.icons);

        // Actualizar animaciones
        this.updateAnimations(theme.animations);
    }

    // Actualizar iconos según el tema
    updateIcons(icons) {
        // Buscar elementos con data-icon y actualizarlos
        document.querySelectorAll('[data-icon]').forEach(el => {
            const iconKey = el.dataset.icon;
            if (icons[iconKey]) {
                el.textContent = icons[iconKey];
            }
        });
    }

    // Actualizar animaciones
    updateAnimations(animations) {
        const style = document.getElementById('dynamic-animations') || document.createElement('style');
        style.id = 'dynamic-animations';
        style.textContent = `
            @keyframes gradientShift {
                0% { background-position: 0% 50%; }
                50% { background-position: 100% 50%; }
                100% { background-position: 0% 50%; }
            }

            body {
                animation: gradientShift ${animations.gradientShift} ease infinite;
            }

            h1 {
                animation: bounce ${animations.bounce} ease-in-out infinite;
            }
        `;
        document.head.appendChild(style);
    }

    // Guardar tema personalizado
    saveCustomTheme(themeName, themeConfig) {
        this.customThemes[themeName] = themeConfig;
        localStorage.setItem('customThemes', JSON.stringify(this.customThemes));
        this.themes[themeName] = themeConfig;
        console.log(`💾 Tema personalizado guardado: ${themeName}`);
    }

    // Obtener lista de temas disponibles
    getAvailableThemes() {
        return Object.keys(this.themes).map(key => ({
            id: key,
            name: this.themes[key].name,
            type: this.customThemes[key] ? 'custom' : 'preset'
        }));
    }

    // Obtener configuración de tema
    getThemeConfig(themeName) {
        return this.themes[themeName] || null;
    }

    // Temas por defecto como fallback
    getDefaultThemes() {
        return {
            default: {
                name: "Tema Predeterminado",
                colors: {
                    primary: "#3498db",
                    secondary: "#2c3e50",
                    accent: "#e74c3c",
                    background: "linear-gradient(135deg, #3498db, #2c3e50)",
                    text: "#ffffff",
                    textSecondary: "#bdc3c7"
                },
                fonts: {
                    primary: "'Poppins', sans-serif",
                    secondary: "'Poppins', sans-serif"
                },
                icons: {
                    camera: "📸",
                    heart: "❤️",
                    photo: "📷"
                },
                animations: {
                    gradientShift: "8s",
                    bounce: "2s"
                }
            }
        };
    }

    // Aplicar tema desde URL o evento
    applyThemeFromEvent(eventId) {
        const event = this.getEventTheme(eventId);
        if (event && event.theme) {
            this.applyTheme(document.body, event.theme);
        }
    }

    // Obtener tema de evento (guardado en localStorage)
    getEventTheme(eventId) {
        const events = JSON.parse(localStorage.getItem('events') || '[]');
        return events.find(e => e.id === eventId);
    }
}

// Instancia global del ThemeManager
const themeManager = new ThemeManager();

// Inicializar temas al cargar la página
document.addEventListener('DOMContentLoaded', () => {
    themeManager.loadThemes().then(() => {
        // Aplicar tema por defecto o desde URL
        const urlParams = new URLSearchParams(window.location.search);
        const eventId = urlParams.get('event');
        if (eventId) {
            themeManager.applyThemeFromEvent(eventId);
        } else {
            themeManager.applyTheme(document.body, themeManager.currentTheme || 'cumpleanos');
        }
    });
});
