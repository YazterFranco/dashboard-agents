# Spec Delta

## Purpose

Ejecutar el asistente en la computadora de la casa, de forma sencilla y segura: un solo comando para arrancarlo, acceso solo desde el wifi de la casa, arranque automático con la computadora y respaldos de los datos.

## ADDED Requirements

### Requirement: Arranque con un comando
El asistente SHALL arrancar con un solo comando (`docker compose up -d` o el equivalente con Podman) desde la carpeta `lucca/`, y SHALL volver a arrancar solo cuando se encienda la computadora y arranque Docker.

#### Scenario: Primer arranque
- **WHEN** el padre ejecuta `docker compose up -d` con el archivo `.env` completo
- **THEN** en menos de 2 minutos el asistente responde en el puerto configurado y muestra la primera configuración

#### Scenario: Reinicio de la computadora
- **WHEN** la computadora se reinicia y Docker arranca
- **THEN** el asistente vuelve a estar disponible sin hacer nada

### Requirement: Solo red de la casa
El servidor SHALL aceptar peticiones solo desde direcciones de red privada (red local o la propia computadora) y SHALL rechazar las demás. Las rutas del padre requieren además su sesión con PIN.

#### Scenario: Petición desde fuera
- **WHEN** llega una petición desde una dirección pública
- **THEN** el servidor responde 403 y no muestra contenido

#### Scenario: Tablet en el wifi de casa
- **WHEN** la tablet abre la dirección local de la computadora en el wifi de casa
- **THEN** ve "Mi semana" de Lucca

### Requirement: Acceso directo en la tablet
La aplicación SHALL poder añadirse a la pantalla de inicio de la tablet con su icono y nombre, y SHALL abrirse a pantalla completa cuando el sistema de la tablet lo permita.

#### Scenario: Añadir a inicio
- **WHEN** el padre usa "Añadir a pantalla de inicio" en la tablet
- **THEN** aparece el icono del asistente y al tocarlo se abre "Mi semana"

### Requirement: Configuración por archivo local
Los secretos y ajustes de arranque (API key de IA, URL, usuario y contraseña de Mereb, puerto y zona horaria) SHALL leerse de un archivo `.env` local que no se sube a git. El repo SHALL incluir un `.env.example` sin valores reales.

#### Scenario: Archivo de ejemplo
- **WHEN** se revisa el repositorio
- **THEN** existe `lucca/.env.example` con los nombres de las variables y no existe ningún `.env` con valores

### Requirement: Estado de salud
El servidor SHALL exponer un estado de salud que indique si funciona, la hora de la última sincronización y si la IA está disponible, sin mostrar secretos.

#### Scenario: Comprobar salud
- **WHEN** se consulta el estado de salud
- **THEN** responde con el estado de cada parte y sin valores de secretos

### Requirement: Respaldos
El sistema SHALL hacer cada día un respaldo de la base de datos dentro del volumen de datos, conservar los últimos 7 y permitir al padre descargar un respaldo y restaurarlo desde su área.

#### Scenario: Respaldo diario
- **WHEN** pasan 24 horas desde el último respaldo con el servidor encendido
- **THEN** existe un nuevo archivo de respaldo y se borra el más antiguo si hay más de 7

#### Scenario: Restaurar
- **WHEN** el padre sube un respaldo válido en su área y confirma
- **THEN** las tareas, el progreso y las lecciones vuelven al estado del respaldo
