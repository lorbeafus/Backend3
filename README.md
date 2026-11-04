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
Usa `node:test` nativo. Postman conserva los endpoints anteriores y añade Orders,
Deliveries, Logger y validaciones negativas; ajustar baseUrl e IDs antes de ejecutarla.
