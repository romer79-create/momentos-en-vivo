# 🎯 Guía de Uso: Sistema Multi-Tenant "Momentos en Vivo"

## 📋 Resumen
Tu sistema ahora soporta **múltiples eventos simultáneos** usando un solo sitio web. Cada evento se identifica con un código único (`eventId`) que se pasa por URL.

## 🔧 Configuración Inicial

### 1. Desplegar el Sistema
- Sube todos los archivos modificados a tu repositorio
- Redespliega en Netlify
- Asegúrate de que las variables de entorno de Cloudinary estén configuradas

### 2. Crear un Evento
Para cada evento nuevo, necesitas generar:
- **Código único del evento** (ej: `BODA2024`, `CONF2024`, `CUMPLE123`)
- **3 URLs específicas** para ese evento

## 🌐 URLs por Evento

Para un evento con código `BODA2024`:

### 📱 Captura de Fotos (Para Invitados)
```
https://tudominio.netlify.app/index.html?event=BODA2024
```

### 🛡️ Panel de Moderación (Para Moderador)
```
https://tudominio.netlify.app/moderador.html?event=BODA2024
```

### 📺 Pantalla de Proyección (Para Evento)
```
https://tudominio.netlify.app/proyeccion.html?event=BODA2024
```

## 🎪 Flujo de Trabajo por Evento

### **Antes del Evento:**
1. **Generas código único** para el evento
2. **Creas QR codes** que apunten a la URL de captura
3. **Compartes URLs** con el cliente:
   - QR para invitados
   - URL de moderación
   - URL de proyección

### **Durante el Evento:**
1. **Invitados escanean QR** → Toman fotos → Se suben con tag `pending_BODA2024`
2. **Moderador abre su URL** → Ve solo fotos de `BODA2024` → Aprueba/rechaza
3. **Fotos aprobadas** → Se marcan como `approved_BODA2024`
4. **Pantalla de proyección** → Muestra solo fotos aprobadas de `BODA2024`

### **Después del Evento:**
- Todas las fotos quedan organizadas por evento en Cloudinary
- Puedes descargar fotos específicas por evento usando los tags

## 🏷️ Sistema de Tags en Cloudinary

Cada foto se etiqueta automáticamente:
- `event_BODA2024` - Identifica el evento
- `pending_BODA2024` - Foto pendiente de moderación
- `approved_BODA2024` - Foto aprobada para proyección
- `msg:Mensaje` - Mensaje del usuario (si existe)

## 💼 Ventajas del Sistema Multi-Tenant

### ✅ **Para Ti (Proveedor):**
- **Un solo sitio** para mantener
- **Escalable** a cientos de eventos
- **Profesional** con tu dominio
- **Fácil soporte** técnico
- **Analytics centralizados**

### ✅ **Para Clientes:**
- **URLs personalizadas** por evento
- **Aislamiento total** entre eventos
- **Experiencia profesional**
- **Sin interferencias** entre eventos

## 🚀 Ejemplos de Códigos de Evento

```
BODA_MARIA_2024
CONF_TECH_NOV
CUMPLE_JUAN_50
GRADUACION_2024
EMPRESA_NAVIDAD
QUINCES_ANA
```

## 💰 Modelo de Negocio Sugerido

### **Paquetes por Evento:**
- **Básico:** $75 (hasta 500 fotos, 4 horas moderación)
- **Premium:** $150 (hasta 1500 fotos, 8 horas moderación)
- **Enterprise:** $300+ (eventos grandes, personalización)

### **Qué Incluye:**
- Setup del evento con código único
- 3 URLs personalizadas
- QR codes para invitados
- Moderación durante el evento
- Descarga de todas las fotos post-evento
- Soporte técnico

## 🎯 Panel de Administración

### **Acceso al Panel:**
```
https://tudominio.netlify.app/admin.html
```

### **Funcionalidades Disponibles:**

#### **📅 Crear Eventos:**
1. **Completa el formulario** con nombre, código y tipo de evento
2. **Genera automáticamente** las 3 URLs necesarias
3. **Crea QR code** instantáneamente para captura
4. **Descarga QR** en formato PNG
5. **Copia URLs** al portapapeles con un clic

#### **📋 Gestionar Eventos:**
- **Lista todos los eventos** creados
- **Ver detalles** y regenerar QR codes
- **Copiar URLs** de cualquier evento
- **Eliminar eventos** que ya no necesites

#### **🔧 Generación Automática:**
- **IDs únicos** basados en el nombre del evento
- **QR codes** de alta calidad para impresión
- **URLs completas** listas para usar
- **Almacenamiento local** de eventos

## 🚀 Flujo de Trabajo Optimizado

### **1. Crear Evento (2 minutos):**
1. Abre `admin.html`
2. Completa nombre del evento
3. Ajusta código si es necesario
4. Haz clic en "Crear Evento"
5. Descarga el QR generado

### **2. Entregar al Cliente:**
- **QR code** para imprimir/compartir
- **3 URLs** copiadas automáticamente
- **Instrucciones** de uso

### **3. Durante el Evento:**
- Cliente usa las URLs proporcionadas
- Sistema funciona automáticamente
- Sin intervención necesaria

## 💼 Ventajas del Sistema Completo

✅ **Automatización total** de creación de eventos  
✅ **QR codes profesionales** generados al instante  
✅ **Gestión centralizada** de todos los eventos  
✅ **URLs listas para usar** sin configuración manual  
✅ **Interfaz intuitiva** para administración  
✅ **Escalable** a cientos de eventos simultáneos

## 📞 Soporte Técnico

Si tienes problemas:
1. Verifica que el `eventId` esté en la URL
2. Revisa la consola del navegador para errores
3. Confirma que las fotos tengan los tags correctos en Cloudinary
4. Asegúrate de que todas las funciones Netlify estén desplegadas

---

¡Tu sistema está listo para manejar múltiples eventos simultáneamente! 🎉
