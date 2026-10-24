# Verificación de la preentrega 4

Entorno de verificación: Node.js 24.16.0, MongoDB local standalone, Windows.

## Comando reproducible

`npm ci` y `npm run test:module4` desde la raíz del proyecto, con MongoDB local
escuchando en 127.0.0.1:27017. No requiere modificar .env ni escribir en la base de desarrollo.

Resultado: 48 verificaciones funcionales, 4 tests de node:test aprobados, 0 fallos.
Instalación limpia con npm ci (sin .env ni node_modules previos) y misma suite: aprobada.

La suite versionada comprueba:
- Crear pedidos desde productos, total calculado, validaciones y acceso por propietario.
- Listas paginadas, IDs y entradas inválidas.
- Asignación única de entrega ante solicitudes simultáneas (incluyendo variantes de mayúsculas del ID).
- Roles de repartidor, fechas, transiciones, cancelación y coherencia de estados.
- Logger exclusivo para ADMIN, bloqueo de la prueba en producción y filtrado por entorno.
- Seis niveles de Winston, timestamp y mensaje.
- error.log solo error/fatal y rotación real con límite de archivos.
- Fallos de configuración y conexión inicial con log fatal y salida no exitosa.
- Mocks y seed, rutas inexistentes y 500 sin filtraciones.

Se ejecutaron además las regresiones aisladas de módulos anteriores:
54 comprobaciones de contraseñas/autenticación/errores, 96 de errores y seed parcial,
y 28 de creación del administrador, idempotencia y protección de roles. Todas pasaron.
Estas regresiones auxiliares se ejecutaron desde el entorno de revisión, no se incluyen
como scripts del repositorio. La suite de módulo 4 sí está versionada y es reproducible.

No se usó Atlas ni datos de desarrollo para estas pruebas. Las bases temporales se
eliminaron al finalizar. No se importó la colección en la interfaz de Postman: se validó
su JSON y los flujos HTTP mediante las pruebas. No se instaló ni implementó Multer.
Los registros generados no forman parte del repositorio. npm audit --omit=dev informó
cero vulnerabilidades al revisar las dependencias en esta implementación.

El commit de integración logística también se comprobó por separado desde una copia limpia:
`npm ci` y `npm run test:logistics`, con 29 verificaciones aprobadas y cero fallos.
