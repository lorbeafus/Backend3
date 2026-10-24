# ShipNow API — Backend III

API de logística construida progresivamente: arquitectura por capas (módulo 1),
mocks (2), errores centralizados (3), logging con Winston (4). Incluye usuarios,
autenticación, productos, pedidos y entregas integrados mediante rutas reales.

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
  routes/         # users, sessions, products, mocks, orders, deliveries, logger
  controllers/    # coordinación HTTP; errores mediante next(error)
  services/       # reglas, propiedad, validación y transiciones
  repositories/   # consultas, persistencia y cambios condicionales atómicos
  models/         # User, Product, Order, Delivery
  middlewares/    # autenticación, permisos, request logger, 404, errores
  dto/            # respuestas seguras de usuario
  utils/          # validaciones, hashes, JWT y generadores
scripts/seed-admin.js
tests/module4.test.js
postman_collection.json
```

Flujo: Router → Controller → Service → Repository → Model. Los services no reciben
req/res ni importan Mongoose. Repository encapsula proyecciones, paginación y operaciones
atómicas; Service decide permisos y reglas. Configuración y conexión quedan en módulos propios.
Products se conserva por compatibilidad con la primera consigna, y sirve de catálogo
para construir pedidos. No se implementa Multer todavía: las entregas tienen identidad
propia para asociar comprobantes en su módulo correspondiente.

## Autenticación y endpoints

Login: `POST /api/sessions/login`, JSON con `email` y `password`. Postman conserva
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

1. Crear ADMIN con seed:admin y hacer login.
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
Seed guarda hashes bcrypt; no devuelve contraseñas ni hashes. Contraseña de mocks:
`mockPassword123` (solo usuarios ficticios de desarrollo, nunca credencial ADMIN).
Roles, estados y prioridades se toman de constantes congeladas.

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
con la lista de niveles. El fatal de prueba **no detiene** la API. Sin sesión → 401,
USER → 403, production → 403 aun con ADMIN. Revisar consola, application.log y error.log.
Por ejemplo, un error.log de prueba contiene dos líneas (error/fatal), no info/debug.
Para forzar rotación en una base de pruebas, usar LOG_MAX_SIZE=1024 y repetir el endpoint.
No exponer archivos de logs mediante rutas HTTP. `.gitignore` excluye logs/, *.log,
.env y node_modules/. No se versionan registros generados ni datos de evaluación.

## Pruebas reproducibles

```sh
npm run test:module4
# Solo pedidos, entregas y permisos:
npm run test:logistics
```

Requiere MongoDB local en 127.0.0.1:27017. La suite crea una base con prefijo
shipnow_test4_ y logs en el directorio temporal del sistema; configura variables en el
proceso, sin leer credenciales reales ni modificar .env. Verifica rutas, propiedad,
asignación concurrente, transiciones, mocks, 500 seguro, niveles, filtrado y rotación real,
y limpia la base temporal y logs. Usa node:test nativo, sin incorporar Mocha/Swagger/Multer
de módulos posteriores. Postman conserva los endpoints anteriores y añade Orders,
Deliveries, Logger y validaciones negativas; ajustar baseUrl e IDs antes de ejecutarla.
