# ShipNow API — Backend III

API de logística construida progresivamente: arquitectura por capas (módulo 1),
mocks (2), errores centralizados (3), logging con Winston (4), documentación interactiva
con Swagger UI y OpenAPI 3.0 (5). Incluye usuarios, autenticación por cookies JWT, productos,
pedidos y entregas integrados mediante rutas reales.

## Requisitos y ejecución

- Node.js **24 LTS recomendado**; comprobar compatibilidad con las dependencias del lockfile.
- MongoDB local o Atlas. La API funciona en MongoDB standalone: no presupone transacciones.

```sh
git clone https://github.com/lorbeafus/Backend3.git
cd Backend3
npm ci
```

Copiar `.env.example` a `.env` (`Copy-Item .env.example .env` en PowerShell)
y completar la conexión y un secreto JWT propio. Ejecutar:

```sh
npm run seed:admin
npm start
# Alternativa para desarrollo:
npm run dev
```

Para `seed:admin`, completar además `ADMIN_EMAIL` y `ADMIN_PASSWORD` con credenciales
propias. Crea el primer ADMIN en **tu base**, sin imprimir la contraseña. Repetir no
modifica su contraseña; si el email pertenece a un usuario común, falla sin promoverlo.
Solo funciona en `development`/`test`. Las variables ADMIN no son necesarias para la API.
Nunca publicar `.env` ni compartir credenciales en README/Postman.

| Variable | Uso |
| --- | --- |
| `PORT` | Obligatoria, entero 1–65535 |
| `NODE_ENV` | Obligatoria: development, test o production |
| `MONGODB_URI` | Obligatoria, base de datos a utilizar |
| `JWT_SECRET` | Obligatoria, secreto de firma propio |
| `JWT_EXPIRES_IN` | Opcional, por defecto 1h |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Solo para el comando manual seed:admin |
| `LOG_DIR` | Opcional; por defecto carpeta logs en la raíz del proyecto |
| `LOG_MAX_SIZE` | Tamaño de rotación en bytes, 5242880 por defecto; 1024–104857600 |
| `LOG_MAX_FILES` | Archivos por destino incluyendo activo, 5 por defecto; 2–30 |

Contraseñas: al menos 6 caracteres al registrar; máximo 72 **bytes UTF-8** en registro
y login usando bcrypt. No se aceptan solo espacios ni se recortan contraseñas válidas.
El registro público siempre asigna USER, aunque se envíe ADMIN o DRIVER.

### Primer arranque paso a paso (PowerShell)

1. Instalá Node.js y MongoDB Community Server, o prepará una conexión a Atlas. MongoDB debe estar funcionando antes de arrancar la API.
2. Cloná el repositorio e instalá las dependencias con los comandos anteriores (`npm ci`).
3. En la raíz del proyecto, ejecutá `Copy-Item .env.example .env`. Editá `.env`: `PORT=3000`, `NODE_ENV=development`, `MONGODB_URI=mongodb://127.0.0.1:27017/shipnow_dev`, `JWT_EXPIRES_IN=1h` y un `JWT_SECRET` propio, largo y aleatorio. El secreto de ejemplo debe reemplazarse. Si usás Atlas, poné su URI y habilitá la conexión desde tu equipo.
4. Para evaluar rutas de administrador, completá también `ADMIN_EMAIL` y `ADMIN_PASSWORD` con valores propios y ejecutá `npm run seed:admin`. Este paso es opcional para arrancar la API y necesario para disponer de un ADMIN nuevo.
5. Ejecutá `npm start` y dejá esa terminal abierta. Esperá la confirmación de conexión y de inicio del servidor. `npm run dev` es una alternativa; no ejecutes ambos a la vez en el mismo puerto.
6. Abrí `http://localhost:3000/api/health`: debe responder 200. Después abrí `http://localhost:3000/api/docs/`. Si cambiaste PORT, usá ese puerto en ambas direcciones.
7. Seguí el flujo de login y las pruebas de Swagger indicadas abajo. Detené el servidor con Ctrl+C al terminar.

Si MongoDB local está instalado como servicio de Windows, podés comprobar su estado con `Get-Service MongoDB` e iniciarlo con `Start-Service MongoDB` desde PowerShell con permisos de administrador. Si no existe ese servicio, iniciá tu instalación de MongoDB por su mecanismo habitual. MongoDB Compass es un cliente: abrirlo no inicia por sí solo el servidor.

Para probar la documentación, mantené MongoDB local disponible en `127.0.0.1:27017` y ejecutá `npm run test:docs` desde otra terminal en la raíz del proyecto. Esta prueba inicia su propio servidor temporal: no necesita `npm start` ni las credenciales del ADMIN personal. Una conexión Atlas en `.env` no reemplaza el MongoDB local requerido por esta suite.

### Comprobación manual desde Swagger

Con la UI abierta y el login ADMIN realizado mediante Try it out → Execute, ejecutá un endpoint de cada tag y verificá el código y cuerpo mostrados en Server response:

| Tag | Operación | Resultado esperado |
| --- | --- | --- |
| Health | GET /api/health | 200 |
| Sessions | GET /api/sessions/current | 200, usuario autenticado sin contraseña |
| Users | GET /api/users | 200, usuarios sanitizados |
| Products | GET /api/products | 200, listado (puede estar vacío) |
| Orders | GET /api/orders | 200, listado paginado |
| Deliveries | GET /api/deliveries | 200, listado paginado |
| Mocks | GET /api/mocks/users con qty=1 | 200, un usuario ficticio en memoria |
| Logger | GET /api/loggerTest | 200 en development/test; emite logs simulados |

Comprobá además GET /api/mocks/users con qty=-1: debe devolver 400 con INVALID_MOCK_QUANTITY. El test automatizado comprueba respuestas HTTP y contratos seleccionados, pero no reemplaza la inspección visual ni los clics en el navegador. La prueba de Logger escribe archivos locales; los GET de mocks no persisten datos.

## Arquitectura

```text
src/
  app.js, server.js
  config/         # entorno validado, conexión, Passport, logger Winston
  constants/      # roles, estados, prioridades y diccionario de errores
  docs/           # especificación OpenAPI 3.0 modular y componentes reutilizables
  routes/         # users, sessions, products, mocks, orders, deliveries, logger, docs
  controllers/    # coordinación HTTP; errores mediante next(error)
  services/       # reglas, propiedad, validación y transiciones
  repositories/   # consultas, persistencia y cambios condicionales atómicos
  models/         # User, Product, Order, Delivery
  middlewares/    # autenticación, permisos, request logger, 404, errores
  dto/            # respuestas seguras de usuario
  utils/          # validaciones, hashes, JWT y generadores
scripts/seed-admin.js
tests/
  module4.test.js
  logistics.test.js
  docs.test.js
  module6/
    setup.js
    fixtures.js
    auth_users.test.js
    orders.test.js
    deliveries.test.js
    mocks.test.js
    system_errors.test.js
  logistics.test.js
  docs.test.js
postman_collection.json
```

Flujo: Router → Controller → Service → Repository → Model. Los services no reciben
req/res ni importan Mongoose. Repository encapsula proyecciones, paginación y operaciones
atómicas; Service decide permisos y reglas. Configuración y conexión quedan en módulos propios.
Products se conserva por compatibilidad con la primera consigna, y sirve de catálogo
para construir pedidos. No se implementa Multer todavía: las entregas tienen identidad
propia para asociar comprobantes en su módulo correspondiente.

## Documentación interactiva Swagger UI y OpenAPI (módulo 5)

La API cuenta con documentación OpenAPI 3.0.3 interactiva e integrable:

- **Interfaz gráfica Swagger UI:** `GET /api/docs`
- **Documento OpenAPI en JSON crudo:** `GET /api/docs/openapi.json`

El servidor utiliza una URL relativa (`/`) para evitar puertos hardcodeados y permitir
pruebas fluidas independientemente de la configuración de red o entorno local.

### Módulos documentados y tags

1. **`Health`:** Comprobación rápida de estado y disponibilidad (`GET /api/health`).
2. **`Sessions`:** Autenticación por cookie `currentUser`, registro (`POST /api/sessions/register`), sesión activa (`GET /api/sessions/current`) y logout (`POST /api/sessions/logout`).
3. **`Users`:** Administración y consulta de usuarios sanitizados (exclusivo ADMIN).
4. **`Products`:** Catálogo de productos con filtros de búsqueda y derivación de estado `available` / `out_of_stock` según stock.
5. **`Orders`:** Creación estricta de pedidos logísticos, cálculo de totales en centavos por el servidor, consulta paginada con aislamiento por rol y cancelación segura.
6. **`Deliveries`:** Asignación única por pedido a un DRIVER, fechas estimadas UTC obligatorias y transiciones de estado sincronizadas con el pedido.
7. **`Mocks`:** Generación de datos en memoria (GET públicos) y seed persistente en MongoDB (POST protegido para ADMIN, bloqueado en producción).
8. **`Logger`:** Endpoint de diagnóstico de niveles de logging Winston (`GET /api/loggerTest`).

### Esquemas reutilizables y separación de contratos

En `components.schemas` se modelan de forma independiente los cuerpos de entrada y las representaciones de salida:
- **Entrada estricta:** `OrderCreateInput` solo acepta `items` (con `product` y `quantity`), `shipping_address`, `priority` y opcionalmente `user` (solo para ADMIN). El cliente **no** debe enviar `price`, `product_name` ni `total_amount` (su presencia genera rechazo 400 por campos no permitidos).
- **Salida sanitizada:** `User` y `CurrentUser` nunca exponen contraseñas ni hashes de bcrypt.
- **Formato uniforme de error:** Toda respuesta de error respeta el contrato `{ status: "error", statusCode, message, error: { code, message, details } }`, incorporando `phase` e `insertedCounts` en caso de fallos parciales de seed.

### Flujo de prueba de rutas protegidas desde Swagger UI

La API utiliza un token JWT almacenado en una **cookie `currentUser` marcada como `HttpOnly`**. Debido a las restricciones de seguridad estándar de los navegadores web, el botón modal «Authorize» de Swagger UI no puede ni debe manipular cookies `HttpOnly` mediante JavaScript.

Para probar rutas protegidas directamente en Swagger UI:
1. Asegurate de haber creado un usuario administrador ejecutando `npm run seed:admin` en tu terminal local.
2. Abrí tu navegador en `http://localhost:3000/api/docs` (o el puerto configurado en tu `.env`).
3. En el grupo **Sessions**, desplegá `POST /api/sessions/login` y hacé clic en **Try it out**.
4. Ingresá el `email` y `password` del administrador creado y presioná **Execute**.
5. Al recibir la respuesta `200 OK`, el navegador web almacena automáticamente la cookie `currentUser` para el mismo origen.
6. A partir de ese momento, cualquier ejecución posterior con **Try it out** en endpoints protegidos (por ejemplo `GET /api/sessions/current`, `GET /api/orders`, `POST /api/deliveries` o `GET /api/loggerTest`) enviará la cookie automáticamente en la cabecera HTTP sin requerir ninguna acción adicional.
7. Para limpiar la sesión y probar los comportamientos no autenticados (401), ejecutá `POST /api/sessions/logout`.

## Autenticación y endpoints

Login: `POST /api/sessions/login`, JSON con `email` y `password`. Postman y Swagger conservan
la cookie `currentUser` (httpOnly, sameSite=lax, secure en producción).
`GET /api/sessions/current` verifica sesión. Logout público limpia la cookie;
no revoca un JWT copiado antes de su expiración.

- `POST /api/sessions/register`: first_name, last_name, email, password; registro USER.
- `GET /api/health`: comprobación básica.
- `GET /api/users` y `GET /api/users/:id`: ADMIN, sin hashes.
- `GET /api/products`, `GET /api/products/:id`: público.
- `POST /api/products`, `PUT /api/products/:id`, `DELETE /api/products/:id`: ADMIN.
  Campos: name, description, price, stock. Estado derivado de stock. Listado con
  status, minPrice, maxPrice, search. No se aceptan expresiones regulares sin escapar.

### Pedidos reales (`/api/orders`)

| Método | Ruta | Acceso y comportamiento |
| --- | --- | --- |
| GET | /api/orders?page=1&limit=20 | ADMIN todos; USER propios; DRIVER asignados |
| GET | /api/orders/:id | Mismos permisos por recurso |
| POST | /api/orders | USER propio; ADMIN para un cliente mediante user |
| PATCH | /api/orders/:id/status | Cancelar con status=cancelled; cliente dueño solo pendiente; ADMIN pendiente/en tránsito |

Listados paginados (máximo 100 por página) devuelven payload con items, page, limit.
Solo se admiten page y limit. IDs inválidos → 400, inexistentes → 404, acceso ajeno → 403.
Ejemplo de creación, con el ID real de un producto disponible:

```json
{
  "items": [{ "product": "<productId>", "quantity": 2 }],
  "priority": "medium",
  "shipping_address": { "street": "Calle 123", "city": "Ciudad", "zip_code": "1000" }
}
```

El servidor toma el usuario autenticado, el nombre y el precio del catálogo, calcula
el total en centavos y genera el número de pedido. Rechaza ítems repetidos, cantidades
no enteras, campos extra, precios/totales proporcionados por el cliente y falta de disponibilidad.
Son **pedidos logísticos**, no una compra/pago: se captura el precio y disponibilidad
al crear; no se reserva ni descuenta stock. El cliente no puede fijar el estado inicial.

### Entregas reales (`/api/deliveries`)

| Método | Ruta | Acceso y comportamiento |
| --- | --- | --- |
| GET | /api/deliveries?page=1&limit=20 | ADMIN todas; USER de sus pedidos; DRIVER asignadas |
| GET | /api/deliveries/:id | Permisos por recurso |
| POST | /api/deliveries | ADMIN asigna pedido pendiente a un DRIVER |
| PATCH | /api/deliveries/:id/status | ADMIN o DRIVER asignado avanza el estado |

```json
{
  "order": "<orderId>",
  "driver": "<driverId>",
  "estimated_delivery_date": "2030-12-01T12:00:00.000Z",
  "delivery_notes": "Entregar en recepción"
}
```

La fecha debe ser futura, ISO UTC con sufijo Z (con o sin milisegundos).
Notas opcionales, máximo 1000 caracteres. Asignación de repartidor inmutable en esta etapa.
No se crea una segunda entrega para el mismo pedido; una clave única sparse protege
asignaciones concurrentes nuevas, sin exigir migrar los documentos mock históricos.

**Fuente de estado única:** el estado del pedido es la autoridad. La API deriva el estado
de entrega al leer, evitando dos escrituras que puedan quedar desincronizadas:

| Pedido | Estado de entrega expuesto |
| --- | --- |
| pending | assigned |
| in_transit | in_progress |
| delivered | completed |
| cancelled | failed |

Se admite assigned → in_progress → completed, o in_progress → failed (pedido cancelado).
No hay saltos ni retrocesos; repetir el estado actual es idempotente. Se usa actualización
condicional por estado esperado: un conflicto concurrente devuelve 409. Cancelar el pedido
se refleja automáticamente en la entrega. El campo status almacenado en Delivery conserva
la instantánea de creación para compatibilidad con mocks; no se debe usar como estado actual.
No borrar pedidos: se conserva historial. No se modifican datos históricos automáticamente.

### Flujo completo para evaluar

1. Crear ADMIN con seed:admin y hacer login desde Swagger (`/api/docs`) o Postman.
2. Crear un producto disponible (o consultar el catálogo existente).
3. Crear cliente por register y hacer login como cliente.
4. Crear pedido y guardar su ID; verificar que otro cliente no puede verlo.
5. Volver a login ADMIN. Ejecutar seed?qty=1 para tener un DRIVER de prueba.
   Consultar GET /api/users y tomar el ID del usuario con role=driver.
6. Asignar entrega con el pedido y ese DRIVER. Guardar su ID.
7. Como ADMIN, avanzar a in_progress y luego completed; verificar GET del pedido.
   También puede ingresar el DRIVER generado (email de GET /api/users,
   contraseña local de mocks `mockPassword123`) y avanzar su propia entrega.

## Mocks (`/api/mocks`)

- GET /users?qty=N: clientes en memoria.
- GET /drivers?qty=N: usuarios DRIVER en memoria.
- GET /orders?qty=N: pedidos con related_users.
- GET /deliveries?qty=N: entregas con related_orders, related_drivers, related_users.
- POST /seed?qty=N: ADMIN, solo development/test; inserta N clientes, N repartidores,
  N pedidos y N entregas (4*N). No borra datos previos.

Los cuatro GET son públicos y no consultan ni escriben MongoDB. Cantidad por defecto 10;
GET acepta 1–100 y seed 1–50; negativos, fracciones, tipos inválidos y parámetros repetidos → 400.
Ejemplo de invocación inválida en Swagger o cliente HTTP:

```http
GET /api/mocks/users?qty=-1
```

Respuesta esperada (400 Bad Request):

```json
{
  "status": "error",
  "statusCode": 400,
  "message": "El parámetro 'qty' debe ser un número entero positivo mayor a 0",
  "error": {
    "code": "INVALID_MOCK_QUANTITY",
    "message": "El parámetro 'qty' debe ser un número entero positivo mayor a 0",
    "details": { "field": "qty", "min": 1 }
  }
}
```

Seed guarda hashes bcrypt; no devuelve contraseñas ni hashes. Contraseña de mocks:
`mockPassword123` (solo usuarios ficticios de desarrollo, nunca credencial ADMIN).
Roles, estados y prioridades se toman de constantes congeladas.
En `POST /api/mocks/seed`, el parámetro `qty` puede enviarse por query string o en el cuerpo JSON;
si ambos están presentes, **query string tiene prioridad sobre el cuerpo**.

La persistencia es secuencial por documento: clientes → drivers → pedidos → entregas.
Si falla, responde error con phase e insertedCounts, incluyendo escrituras confirmadas
de la fase interrumpida. No reintenta ni hace rollback. Una pérdida de conexión puede dejar
incierta la última escritura: revisar la base antes de repetir. Las referencias se crean
solo después de confirmar sus dependencias.

## Errores centralizados (módulo 3)

AppError y MockSeedError usan ERROR_DICTIONARY. El middleware global construye la respuesta:

```json
{
  "status": "error",
  "statusCode": 400,
  "message": "El parámetro 'qty' debe ser un número entero positivo mayor a 0",
  "error": {
    "code": "INVALID_MOCK_QUANTITY",
    "message": "El parámetro 'qty' debe ser un número entero positivo mayor a 0",
    "details": { "field": "qty", "min": 1 }
  }
}
```

400 entrada inválida; 401 sesión inválida/ausente; 403 permisos; 404 recurso/ruta inexistente;
409 duplicado/conflicto; 413 cuerpo demasiado grande; 500 inesperado. En 500 no se expone
la causa: solo metadatos seguros de seed si existen. No se copian mensajes crudos de Mongoose.
Ejemplos: GET /api/mocks/users?qty=-1 → 400; GET /api/orders/id-invalido → 400;
GET /ruta-inexistente → 404; GET /api/users sin cookie → 401; con USER → 403.

## Logging y monitoreo básico (módulo 4)

Winston **3.19.0**, configuración única en src/config/logger.js. Registros JSON con
`timestamp` UTC, `level`, `message` y metadatos del evento. No se registran bodies,
credenciales, cookies, JWT, URIs de MongoDB ni causas crudas que puedan contener secretos.
Cada respuesta incluye X-Request-Id para correlación. La capa de logs complementa los errores;
no cambia el formato público.

| Nivel | Uso |
| --- | --- |
| debug | generación de mocks y diagnóstico de desarrollo |
| http | método, ruta parametrizada, estado y duración |
| info | arranque, conexión, seed, pedido creado y entrega asignada/actualizada |
| warning | errores esperados: cantidad inválida, permisos, pedido/ruta inexistentes |
| error | fallos inesperados de la API |
| fatal | configuración/conexión inicial o puerto HTTP que impiden arrancar |

Development/test: consola y application.log desde debug (los seis niveles).
Production: desde info (info, warning, error, fatal; excluye debug/http).
**error.log solo contiene error y fatal**, independientemente del entorno.
Winston File transport aplica rotación por tamaño: por defecto 5 MiB, hasta 5 archivos
por destino (activo más 4 rotados). Archivos: logs/error.log, error1.log, etc. y
logs/application.log, application1.log, etc. La rotación conserva un conjunto acotado,
no un número de días. El último registro puede superar ligeramente el umbral del archivo.

### Prueba del logger

Tras login ADMIN en development/test:

```http
GET /api/loggerTest
```

Emite un registro de cada nivel con event=logger_test y simulated=true. Responde 200
con la lista de niveles:

```json
{
  "status": "success",
  "payload": {
    "levels": ["fatal", "error", "warning", "info", "http", "debug"],
    "simulated": true,
    "message": "Registros de prueba emitidos; fatal simulado no detiene el proceso"
  }
}
```

El fatal de prueba **no detiene ni apaga** la API. Sin sesión → 401, USER → 403,
production → 403 aun con ADMIN. Revisar consola, application.log y error.log.
Por ejemplo, un error.log de prueba contiene dos líneas (error/fatal), no info/debug.
Para forzar rotación en una base de pruebas, usar LOG_MAX_SIZE=1024 y repetir el endpoint.
No exponer archivos de logs mediante rutas HTTP. `.gitignore` excluye logs/, *.log,
.env y node_modules/. No se versionan registros generados ni datos de evaluación.

## Pruebas reproducibles

### Suite funcional con Mocha, Chai y Supertest (Módulo 6)

El proyecto incorpora una suite de pruebas funcionales end-to-end organizada bajo `tests/module6/` que prueba endpoints reales de Express contra MongoDB sin requerir `server.js` ni `npm start`.

- **Mocha (12.x):** Framework de testing BDD que organiza suites y casos (`describe`, `it`, `beforeEach`), gestiona el ciclo de vida asíncrono y los hooks globales (`beforeAll`, `afterAll` en `setup.js`). Se ejecuta sin `--exit` para validar que todos los recursos, sockets y conexiones se cierran limpiamente.
- **Chai (6.x):** Librería de aserciones (`expect`) en formato ESM para comprobar códigos HTTP, contratos de payload, tipos, valores derivados, validaciones de dominio y ausencia estricta de contraseñas/hashes.
- **Supertest (7.x):** Cliente HTTP que interactúa directamente con la aplicación Express sobre servidores efímeros. Utiliza `request.agent(app)` para gestionar la cookie HttpOnly `currentUser` recibida en `POST /api/sessions/login` y reenviarla automáticamente en endpoints protegidos, emulando fielmente el flujo de un navegador.

```sh
# Ejecutar suite funcional completa del Módulo 6 (83 pruebas (82 funcionales HTTP y 1 de integración del servicio)):
npm run test:module6

# Comando estándar de testing (alias documentado de test:module6):
npm test
```

#### Aislamiento, base temporal y limpieza:
1. **Sin variables del .env personal:** `tests/module6/setup.js` se precarga mediante `--require` en `.mocharc.json`, configurando `NODE_ENV=test`, `PORT=3099`, `MONGODB_URI=mongodb://127.0.0.1:27017/shipnow_test6_<uuid>`, `JWT_SECRET`, `JWT_EXPIRES_IN=1h` y un directorio de logs temporal aislado (`mkdtemp`) antes de que cualquier módulo del sistema lea la configuración.
2. **Requisitos de MongoDB:** Requiere MongoDB local escuchando en `127.0.0.1:27017`. Si el servicio no está activo, la suite se detiene informando explícitamente el requerimiento sin enmascarar el error.
3. **Seguridad y robustez de limpieza destructiva:** Antes de ejecutar `dropDatabase()`, el hook `afterAll` verifica que la conexión activa apunte exactamente a la base creada para esa ejecución (`mongoose.connection.name === dbName`) y que comience con el prefijo seguro `shipnow_test6_`. Ante cualquier discrepancia, no realiza el borrado y reporta el problema de seguridad. El teardown ejecuta cada etapa de limpieza de forma independiente (borrado de base, desconexión de Mongoose, cierre de transports de Winston y eliminación del directorio temporal de logs), acumulando y reportando cualquier falla mediante `AggregateError` sin silenciar excepciones y sin recurrir a `--exit` ni `process.exit()`.
4. **Independencia entre casos:** `seedBaseFixtures()` en `fixtures.js` inicializa en cada grupo usuarios controlados con hash bcrypt (ADMIN, CLIENT1, CLIENT2, DRIVER1, DRIVER2) y productos disponibles/agotados, reseteando las colecciones para que ninguna prueba dependa del estado de pruebas previas.

#### Módulos y escenarios cubiertos:
- **`auth_users.test.js` (21 pruebas):** Registro con sanitización DTO, forzado de rol USER en registro público, rechazo de emails duplicados (409), validaciones de contraseña mínima y límite de 72 bytes UTF-8 de bcrypt; Login exitoso con emisión de cookie HttpOnly `currentUser`, login fallido con contraseña incorrecta o email inexistente (401), consulta de sesión `/api/sessions/current` y cierre de sesión con `/api/sessions/logout` (el cual elimina la cookie `currentUser` en el cliente; un JWT previamente copiado permanece válido hasta su expiración natural ya que no existe un mecanismo o lista de revocación centralizada); listado `/api/users` como ADMIN (200 sanitizado), rechazo a clientes (403) y anónimos (401), consulta individual por ID distinguiendo 400 (`INVALID_ID`) de 404 (`USER_NOT_FOUND`).
- **`orders.test.js` (22 pruebas):** Creación válida de pedidos calculando precios y totales desde el catálogo (`total_amount`), estado inicial `pending`; rechazo de campos no permitidos (`strictBody`); validación de pedidos incompletos (rechazo con 400 y formato uniforme ante omisión de `items`, `items` vacío y omisión de `shipping_address`, garantizando que ningún pedido se persista en la base); validación de cantidades (enteros entre 1 y 1000, rechazo de 0, negativos y decimales); rechazo de productos inexistentes (404) y sin stock (409); permisos de creación (DRIVER rechazado con 403, cliente forzando usuario ajeno con 403); listado paginado privado para clientes y completo con usuario poblado para ADMIN; consulta por ID distinguiendo 400 (`INVALID_ID`), 403 (pedido ajeno) y 404 (`ORDER_NOT_FOUND`); cancelación permitida solo al dueño en estado `pending`, rechazo a estados inválidos y usuarios no autorizados.
- **`deliveries.test.js` (17 pruebas):** Asignación de pedido `pending` a DRIVER por ADMIN con fecha estimada futura y tracking code; rechazo de asignación por roles no permitidos (403), conflicto por asignación duplicada (409) y usuario no driver (400); consulta y listado filtrado por rol (ADMIN ve todo, DRIVER solo sus asignadas, CLIENTE solo las de sus pedidos); transiciones de estado ordenadas `assigned` → `in_progress` → `completed` con verificación del pedido derivado (`in_transit`, `delivered`), y rechazo de saltos inválidos (409).
- **`mocks.test.js` (15 pruebas):** Generadores en memoria `/api/mocks/users`, `/drivers`, `/orders` y `/deliveries` verificando que no persisten documentos en MongoDB; validación de rangos y parámetros de `qty` en endpoints GET (rechazo de <=0, decimales, texto, >100 y repetidos); `POST /api/mocks/seed` exclusivo para ADMIN con persistencia en base temporal de colecciones relacionadas, soporte de query y body dando prioridad a query, y rechazo a usuarios sin permisos (403) o sin sesión (401); validación exhaustiva de cantidades inválidas en seed persistente (0, negativa, decimal, no numérica y 51 por límite de 50, cubriendo query y body, y verificando HTTP 400, formato uniforme y que no se modifiquen documentos en MongoDB).
- **`system_errors.test.js` (8 pruebas):** Diagnóstico `/api/loggerTest` en entorno test como ADMIN emitiendo todos los niveles; servicio de documentación Swagger UI `/api/docs/` (HTML) y especificación OpenAPI `/api/docs/openapi.json` (JSON 3.0.3); captura de rutas inexistentes (404) y métodos no coincidentes; contrato estándar de respuestas de error `{ status: "error", statusCode, message, error: { code, message, details } }` validando códigos concretos del diccionario y whitelist de claves públicas.

---

### Suites anteriores (node:test)

```sh
# Verificación de documentación OpenAPI, Swagger UI y contratos reales:
npm run test:docs

# Logística completa, permisos y transiciones atómicas:
npm run test:logistics

# Suite integral de regresión (módulo 4):
npm run test:module4
```

Requiere MongoDB local en 127.0.0.1:27017. La suite crea bases con prefijos aislados
(`shipnow_test4_` y `shipnow_test_docs_`) y logs en el directorio temporal del sistema;
configura variables en el proceso, sin leer credenciales reales ni modificar .env.
Verifica rutas, propiedad, asignación concurrente, transiciones, mocks, 500 seguro,
niveles de log, rotación y esquemas de Swagger, y limpia las bases temporales y logs.
Usa `node:test` nativo. Mocha está configurado mediante `.mocharc.json` con patrón `tests/module6/**/*.test.js`, evitando colisiones con los archivos de `node:test`.


La suite incluye además una prueba de integración directa de UsersService: rechaza el rol inexistente `superheroe` con AppError 400 e INVALID_INPUT_DATA, informa los roles permitidos y verifica que no persista al usuario. No es una prueba HTTP: el registro público ignora el rol recibido y asigna USER, y no existe una ruta de actualización de roles.
