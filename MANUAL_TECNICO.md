# Documentación Técnica y Manual de Operaciones
## Queens

**Autor:** Manuel Alcala  
**Año:** 2026  

---

### 1. Introducción y Descripción General
El presente documento define la estructura, tecnología y metodologías de operación detrás de la plataforma "Queens". Este sistema funciona como un mercado de anuncios clasificados estrictamente gestionado, con arquitectura optimizada para minimizar la carga de infraestructuras y facilitar portabilidad completa entre entornos de virtualización.

### 2. Pila Tecnológica Utilizada (Tech Stack)
El desarrollo hace uso de un entorno altamente portable para evitar requerimientos de compilación nativa en servidores de destino.

*   **Motor Principal:** Node.js (Entorno de ejecución asíncrono para JavaScript)
*   **Marco de Trabajo (Framework):** Express.js (Gestión de rutas y peticiones HTTP)
*   **Motor de Plantillas:** EJS (Generación dinámica de vistas HTML desde el servidor)
*   **Base de Datos:** Estructura persistente basada en archivos JSON estructurados (Storage File-System). Esta decisión técnica elimina la dependencia de librerías nativas que puedan corromperse durante procesos de contenerización, asegurando un despliegue tolerante a fallos.
*   **Autenticación:** Sesiones basadas en memoria y cifrado simple perimetral.
*   **Tareas Automatizadas:** Node-Cron (Revisión de estados y expiración de perfiles).
*   **Infraestructura:** Docker (Imagen base node:20-slim reducida y orientada a microservicios).

### 3. Manual de Manejo para la Administración
El panel de control se ubica en el directorio protegido `/admin`. La gestión operativa del modelo de negocio radica exclusivamente en este sector.

*   **Acceso Seguro:** Sujeto a la validación contra la variable de entorno de alta prioridad.
*   **Estado de la Aplicación:** El flujo natural de datos inicia cuando un usuario completa el formulario público. El nuevo registro entra en estado "Solicitud Recibida" y la aplicación desencadena un evento de contacto por mensajería.
*   **Gestión de Perfiles:** El administrador ingresa para modificar el perfil mediante una interfaz centralizada. Se alteran propiedades como fotografías de alta definición, textos, idiomas, parámetros estructurales (Agencia vs Independiente), e incremento de visibilidad (planes Premium, Destacados).
*   **Mantenimiento Operativo Automatizado:** El servidor evalúa en tiempo real cada ciclo horario las fechas de caducidad. Todo registro cuyo contrato expire será delegado al estado obsoleto, ocultándose de la grilla principal inmediatamente.

### 4. Metodología para Realizar Cambios en el Sistema
La arquitectura del código agiliza las modificaciones puntuales a los diversos sectores de la plataforma.

*   **Cambios Estéticos Globales:** Todo parámetro visual (colores, distribución, fuentes tipográficas y diseño premium) puede alterarse modificando las plantillas de hojas de estilos en cascada ubicadas en `public/css/style.css` y `public/css/splash.css`. 
*   **Cambios en Contenidos e Idiomas:** Todo vocablo o término multilingüe implementado en el front-end requiere ser definido explícitamente en el archivo raíz `translations.js`. Es altamente recomendable observar la sintaxis del objeto literal para no afectar la carga secuencial.
*   **Lógica Funcional del Servidor:** Integraciones profundas o algoritmos a nivel servidor se trabajan primordialmente sobre `server.js`.
*   **Gestión de Plantillas (Estructura de la Vista):** Elementos visuales del cuerpo del sistema web se localizan en el subdirectorio `views/` de extensión EJS.
*   **Archivador Persistente:** Bajo ningún concepto deben modificarse los registros `data/perfiles.json` o `data/agencias.json` de manera manual por parte de un usuario externo, siempre es imperativo gestionarlos a través de la interfaz gráfica del Panel de Administración para evitar corrupciones lógicas estructurales.

### 5. Guía de Migración hacia otra Plataforma DOCKER
Dado el uso de tecnologías independientes gracias a la contenerización nativa, la migración es sumamente pragmática. Independientemente del orquestador o la instancia, deberán ejecutarse los pasos delimitados a continuación.

**Requisitos Previos de la Nueva Instancia:**
1. Motor Docker instalado y funcional.
2. Transferencia física previa o conexión remota del directorio de datos original (Backup).

**Paso a Paso de la Migración:**
1.  **Transporte de Datos Críticos:** Transfiera la carpeta matriz u opcionalmente actúe mediante un `git clone` del repositorio oficial.
2.  **Volúmenes Persistentes (Vital para la integridad de datos):** Tras inicializar el contenedor, asegúrese ineludiblemente de mapear los dos volúmenes persistentes que guardan progreso. En la declaración de contenedores debe enlazar de la siguiente manera:
    *   `/app/data` (Debe ser transferido fielmente. Aquí reside la información persistente de la base de datos).
    *   `/app/public/uploads` (Debe ser transferido fielmente para no fragmentar las fotografías subidas).
3.  **Variables de Entorno Definidas en el Destino:** Defina explícitamente en la configuración del host antes de efectuar el arranque:
    *   `PORT` (Puerto de escucha primario. A menudo delegado a `3000`).
    *   `ADMIN_PASSWORD` (Clave directa para acceder al directorio `/admin`).
    *   `WHATSAPP_NUMBER` (Referencia telefónica comercial sin espacios).
    *   `SESSION_SECRET` (Llave criptográfica generadora de firmas temporales).
4.  **Generación de la Imagen y Despliegue:** Construya la imagen nativamente operando en la raíz del entorno: `docker build -t queenviproyal .` seguido de la inicialización de ejecución adjuntando los volúmenes anteriormente descriptos y finalizando por el puerto expuesto especificado. Esto reanudará toda la carga persistente original de forma íntegra.
