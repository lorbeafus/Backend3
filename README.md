# ShipNow API

API REST de ShipNow para las pre-entregas del curso **Backend III** (Coderhouse).
- **Módulo 1:** Arquitectura profesional por capas, configuración centralizada estricta y entidades **Users**, **Sessions** y **Products**.
- **Módulo 2:** Módulo de mocking logístico (**Users**, **Drivers**, **Orders**, **Deliveries**) con generación en memoria y carga controlada (`seed`) secuencial en MongoDB.
- **Módulo 3 (Tercera Preentrega):** Sistema centralizado de manejo de errores HTTP mediante errores personalizados (`AppError`), diccionario de errores semánticos (`ERROR_DICTIONARY`), middleware global normalizador y formato de respuesta uniforme en todos los módulos.

## Tecnologías y Requisitos

- **Node.js:** Versión requerida por `@faker-js/faker@10.6.0` instalada en el proyecto: **Node.js `^20.19.0 || ^22.13.0 || ^23.5.0 || >=24.0.0`** (con soporte nativo para ES Modules `"type": "module"`).
- Express 5, MongoDB con Mongoose 9.
- Passport (estrategias `local` y `jwt`), JWT en cookie `httpOnly`, bcrypt.
- `@faker-js/faker` para la generación de datos simulados realistas.
- dotenv, cargado en un único módulo (`src/config/env.config.js`).

## Arquitectura por capas

```text
HTTP Request → Router → Middleware(s) → Controller → Service → Repository → Model / MongoDB
      │                                                   │
      └────────────────── errorHandler ← AppError ────────┘
```

| Capa | Carpeta | Responsabilidad |
| :--- | :--- | :--- |
| Router | `src/routes/` | Define paths y asocia middlewares de autenticación/roles (`authMiddleware`, `authorizeRoles`). |
| Middleware | `src/middlewares/` | Autenticación Passport, autorización de roles, captura de 404 (`notFoundHandler`) y manejo centralizado de errores (`errorHandler`). |
| Controller | `src/controllers/` | Capa HTTP: lee `req`, envía `res`, status codes y deriva excepciones mediante `next(err)`. No importa Mongoose ni modelos ni construye respuestas de error manuales. |
| Service | `src/services/` | Validaciones de tipos y negocio, lógica de dominio, coordinación de entidades y generación de mocks. Lanza `AppError` con definiciones del diccionario. No conoce `req`/`res`. |
| Repository | `src/repositories/` | Único punto de acceso a Mongoose: consultas, proyecciones (`-password` por defecto en usuarios), filtros y persistencia secuencial ordenada en base de datos. |
| Model | `src/models/` | Esquemas Mongoose, tipos y restricciones de integridad. |

## Estructura del proyecto

```text
SHIPNOW/
├── src/
│   ├── app.js                          # Express, middlewares globales, rutas y middlewares de error
│   ├── server.js                       # Conexión asíncrona a MongoDB y arranque del servidor
│   ├── config/
│   │   ├── env.config.js               # Carga dotenv y validación estricta al inicio
│   │   ├── index.js                    # Re-exporta config
│   │   ├── database.js                 # Conexión a MongoDB
│   │   └── passport.config.js          # Estrategias register, login y current (JWT en cookie)
│   ├── constants/
│   │   ├── index.js                    # Re-exporta roles, estados y diccionario de errores
│   │   └── errors.constants.js         # ERROR_DICTIONARY centralizado
│   ├── controllers/                    # products, users, sessions, mocks
│   ├── dto/                            # UserDTO, CurrentUserDTO (protección de passwords)
│   ├── middlewares/
│   │   ├── auth.middleware.js          # authMiddleware y authorizeRoles delegando en errorHandler
│   │   ├── passport.middleware.js      # passportCall con traducción a AppError
│   │   ├── notFound.middleware.js      # Middleware 404 para rutas inexistentes
│   │   └── error.middleware.js         # errorHandler centralizado y normalizador único
│   ├── models/                         # user.model.js, product.model.js, order.model.js, delivery.model.js
│   ├── repositories/                   # users, products, orders, deliveries, mocks
│   ├── routes/                         # products, users, sessions, mocks
│   ├── services/                       # products, users, sessions, mocks
│   └── utils/                          # hash, jwt, errors (AppError, MockSeedError), validation, mockGenerators
├── .env.example
├── postman_collection.json             # Colección actualizada con tests de éxito y casos de error
└── package.json
```

## Variables de entorno

La app valida las variables al arrancar, **antes** de conectar a MongoDB o escuchar. Si falta alguna o contiene un valor inválido, el proceso se interrumpe de forma controlada (`[FATAL]`).

| Variable | Obligatoria | Descripción | Ejemplo |
| :--- | :--- | :--- | :--- |
| `PORT` | Sí | Puerto HTTP (entero 1-65535). | `3000` |
| `NODE_ENV` | Sí | `development`, `production` o `test`. | `development` |
| `MONGODB_URI` | Sí | Cadena de conexión a MongoDB. | `mongodb://localhost:27017/shipnow_dev` |
| `JWT_SECRET` | Sí | Secreto para firmar los tokens JWT. | *(clave segura)* |
| `JWT_EXPIRES_IN` | No | Vigencia del token (default `1h`). | `1h` |

`.env.example` contiene la plantilla sin secretos. `.env` y `node_modules/` están excluidos en `.gitignore`.

## Instalación y ejecución

```bash
npm install
cp .env.example .env      # en PowerShell: Copy-Item .env.example .env
# editar .env con valores locales
npm run dev               # node --watch src/server.js
npm start                 # node src/server.js
```

---

## Módulo 3: Sistema Centralizado de Errores

En cumplimiento con los requerimientos de la **Tercera Preentrega**, todos los errores HTTP de la API se gestionan de forma unificada sin respuestas manuales dispersas:

### 1. Diccionario Centralizado (`src/constants/errors.constants.js`)

Define códigos semánticos estables, estados HTTP y mensajes estándar:

| Código de Error (`code`) | HTTP Status | Situación de Dominio |
| :--- | :---: | :--- |
| `INVALID_INPUT_DATA` | `400` | Campos obligatorios vacíos, formatos erróneos o filtros inválidos. |
| `INVALID_ID` | `400` | Formato de ObjectId inválido o cast fallido de Mongoose. |
| `INVALID_JSON_BODY` | `400` | Cuerpo de petición malformado o no correspondiente a un objeto JSON. |
| `INVALID_MOCK_QUANTITY` | `400` | Parámetro `qty` repetido, negativo, no entero o superior al límite. |
| `INVALID_DOMAIN_STATE` | `400` | Estado o transición no permitida en entidades de dominio (ej. entrega sin repartidor). |
| `AUTHENTICATION_REQUIRED` | `401` | Petición sin credenciales o cookie de sesión ausente en rutas protegidas. |
| `TOKEN_INVALID_OR_EXPIRED` | `401` | Token JWT manipulado, expirado o con firma incorrecta. |
| `INVALID_CREDENTIALS` | `401` | Combinación incorrecta de email o contraseña en `/api/sessions/login`. |
| `INSUFFICIENT_PERMISSIONS` | `403` | Usuario autenticado intentando acceder a recursos restringidos a otro rol. |
| `SEED_FORBIDDEN_IN_PRODUCTION` | `403` | Intento de ejecución de carga masiva (`seed`) con `NODE_ENV=production`. |
| `USER_NOT_FOUND` | `404` | Identificador de usuario inexistente en MongoDB. |
| `PRODUCT_NOT_FOUND` | `404` | Identificador de producto inexistente en MongoDB. |
| `ORDER_NOT_FOUND` | `404` | Identificador de pedido inexistente en MongoDB. |
| `ROUTE_NOT_FOUND` | `404` | Endpoint o método HTTP no registrado en Express. |
| `DUPLICATE_RESOURCE` | `409` | Colisión de clave única (ej. email duplicado o colisión en seed). |
| `MOCK_GENERATION_FAILED` | `500` | Error inesperado durante la generación en memoria. |
| `MOCK_PERSISTENCE_FAILED` | `500` | Error de escritura en MongoDB durante el proceso de seed. |
| `INTERNAL_SERVER_ERROR` | `500` | Excepciones no controladas o fallos imprevistos de infraestructura. |

### 2. Clases de Error Personalizadas (`src/utils/errors.js`)

- **`AppError`**: Clase base que extiende `Error`, recibiendo una entrada de `ERROR_DICTIONARY` y opciones como `details`, `cause`, `phase` e `insertedCounts`.
- **`MockSeedError`**: Especialización para fallos parciales de persistencia en seed que conserva las escrituras confirmadas.
- **`httpError`**: Adaptador retrocompatible que mapea códigos de estado al diccionario centralizado devolviendo instancias de `AppError`.

### 3. Formato Uniforme de Respuesta

Todas las respuestas de error emitidas por la API siguen estrictamente el mismo esquema JSON:

```json
{
  "status": "error",
  "statusCode": 400,
  "message": "La cantidad de mocks debe ser un número entero positivo dentro de los límites permitidos",
  "error": {
    "code": "INVALID_MOCK_QUANTITY",
    "message": "La cantidad de mocks debe ser un número entero positivo dentro de los límites permitidos",
    "details": {
      "field": "qty",
      "limit": 50
    }
  }
}
```

#### Lista blanca de `details` (Protección contra filtraciones)
El middleware aplica una lista blanca estricta (`ALLOWED_DETAIL_KEYS`) para construir `error.details`:
- Claves permitidas: `field`, `fields`, `expected`, `received`, `allowed`, `limit`, `min`, `max`, `method`, `path`, `phase`, `insertedCounts`, `errors`.
- **Seguridad**: Se bloquea cualquier objeto de conexión de MongoDB, consultas internas, stack traces, variables de entorno, contraseñas y hashes bcrypt.

#### Errores inesperados (500)
Ante excepciones no controladas:
- Se registra el diagnóstico completo con stack y `cause` en la consola del servidor (`console.error`).
- El cliente recibe un código `500 Internal Server Error`, con mensaje genérico `"Error interno del servidor"`. En fallos parciales de seed, `details` conserva exclusivamente `phase` e `insertedCounts`; el resto de los errores internos devuelve `details: {}`. Nunca se envían mensajes internos de MongoDB ni valores rechazados en errores de validación.

---

## Ejemplos Reales de Respuestas de Error

### 1. Validación de Datos (400 Bad Request)
**Petición:** `POST /api/mocks/seed?qty=abc`
```json
{
  "status": "error",
  "statusCode": 400,
  "message": "El parámetro 'qty' debe ser un número entero positivo mayor a 0",
  "error": {
    "code": "INVALID_MOCK_QUANTITY",
    "message": "El parámetro 'qty' debe ser un número entero positivo mayor a 0",
    "details": {
      "field": "qty",
      "min": 1
    }
  }
}
```

### 2. Autenticación Requerida (401 Unauthorized)
**Petición:** `POST /api/mocks/seed?qty=3` (sin cookie de sesión)
```json
{
  "status": "error",
  "statusCode": 401,
  "message": "No autenticado",
  "error": {
    "code": "AUTHENTICATION_REQUIRED",
    "message": "No autenticado",
    "details": {}
  }
}
```

### 3. Permisos Insuficientes (403 Forbidden)
**Petición:** `POST /api/products` (autenticado con rol `user`)
```json
{
  "status": "error",
  "statusCode": 403,
  "message": "No tenés permisos para realizar esta acción",
  "error": {
    "code": "INSUFFICIENT_PERMISSIONS",
    "message": "No tenés permisos para realizar esta acción",
    "details": {
      "received": "user",
      "allowed": ["admin"]
    }
  }
}
```

### 4. Recurso Inexistente (404 Not Found)
**Petición:** `GET /api/products/64f1a2b3c4d5e6f7a8b9c0d1`
```json
{
  "status": "error",
  "statusCode": 404,
  "message": "Producto no encontrado",
  "error": {
    "code": "PRODUCT_NOT_FOUND",
    "message": "Producto no encontrado",
    "details": {
      "field": "id"
    }
  }
}
```

### 5. Ruta Inexistente (404 Not Found)
**Petición:** `GET /api/no-existe`
```json
{
  "status": "error",
  "statusCode": 404,
  "message": "La ruta 'GET /api/no-existe' no existe en este servidor",
  "error": {
    "code": "ROUTE_NOT_FOUND",
    "message": "La ruta 'GET /api/no-existe' no existe en este servidor",
    "details": {
      "method": "GET",
      "path": "/api/no-existe"
    }
  }
}
```

### 6. Recurso Duplicado (409 Conflict)
**Petición:** `POST /api/sessions/register` (email ya existente)
```json
{
  "status": "error",
  "statusCode": 409,
  "message": "Ya existe un usuario registrado con ese email",
  "error": {
    "code": "DUPLICATE_RESOURCE",
    "message": "Ya existe un usuario registrado con ese email",
    "details": {
      "field": "email"
    }
  }
}
```

### 7. Fallo Parcial de Seed en MongoDB (409 Conflict / 500)
**Petición:** `POST /api/mocks/seed?qty=2` (con colisión única inducida en el 2º documento de la fase `users`)
```json
{
  "status": "error",
  "statusCode": 409,
  "message": "Error en la carga de datos de prueba en la fase 'users': Ya existe un registro con esos datos únicos",
  "error": {
    "code": "DUPLICATE_RESOURCE",
    "message": "Error en la carga de datos de prueba en la fase 'users': Ya existe un registro con esos datos únicos",
    "details": {
      "phase": "users",
      "insertedCounts": {
        "users": 1,
        "drivers": 0,
        "orders": 0,
        "deliveries": 0
      }
    }
  },
  "phase": "users",
  "insertedCounts": {
    "users": 1,
    "drivers": 0,
    "orders": 0,
    "deliveries": 0
  }
}
```

> [!WARNING]
> **Aviso de pérdida de conexión en Seed**: Cada documento se inserta y confirma individualmente en orden estricto de dependencias. Una interrupción de red o reinicio del motor de base de datos durante la escritura puede dejar incierto el estado de la última operación en tránsito. Los contadores reportados en `insertedCounts` corresponden exclusivamente a escrituras confirmadas en el motor antes de la falla.

---

## Módulo de Mocking y Logística (`/api/mocks`)

El módulo de mocking permite dos modos operativos:
1. **Generación en memoria (GET):** Genera entidades logísticas en tiempo real sin interactuar con MongoDB. Los datos relacionados se devuelven anidados/agrupados para verificar su integridad referencial en memoria.
2. **Carga controlada / Seed (POST):** Inserta datos reales en MongoDB con persistencia secuencial explícita y contraseñas hasheadas (`bcrypt`).

### Decisiones de modelado de dominio logístico
- **Repartidores (Drivers):** Se modelan como documentos de la colección `users` con el rol `USER_ROLES.DRIVER`. Esto permite centralizar la autenticación y asociarlos directamente a las entregas.
- **Pedidos (Orders):** Cada pedido referencia obligatoriamente al `User` que lo realizó (`user: ObjectId`), una lista de items (`product_name`, `quantity`, `price`), un `total_amount`, un `status` (`ORDER_STATUS`), una `priority` (`ORDER_PRIORITY`) y una `shipping_address`.
- **Entregas (Deliveries):** Referencian obligatoriamente a una orden (`order: ObjectId`), poseen un código de seguimiento único (`tracking_code`), un estado (`DELIVERY_STATUS`), una fecha estimada (`estimated_delivery_date`) y un repartidor (`driver: ObjectId`).
  - **Regla de integridad:** Si el estado de la entrega es `in_progress` o `completed`, el esquema valida que `driver` no sea nulo.
- **Protección de credenciales:** Ningún endpoint GET de mocks ni la respuesta de `seed` expone passwords ni hashes de contraseñas.
- **Seguridad en registro:** El registro público (`/api/sessions/register`) fuerza estrictamente el rol `USER_ROLES.USER`. No permite autoasignarse `ADMIN` ni `DRIVER`.

### Coherencia de estados
El estado de cada entrega se deriva del pedido asociado:

| Pedido | Entrega |
| :--- | :--- |
| `pending` | `assigned` |
| `in_transit` | `in_progress` (requiere `driver`) |
| `delivered` | `completed` (requiere `driver`) |
| `cancelled` | `failed` |

### Endpoints de Mocking

| Método | Ruta | Acceso | Descripción |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/mocks/users?qty=10` | Público | Genera usuarios cliente simulados en memoria (sin password). |
| `GET` | `/api/mocks/drivers?qty=10` | Público | Genera repartidores simulados con rol `driver` en memoria. |
| `GET` | `/api/mocks/orders?qty=10` | Público | Genera pedidos simulados y devuelve además los `related_users` referenciados. |
| `GET` | `/api/mocks/deliveries?qty=10` | Público | Genera entregas simuladas y devuelve `related_orders`, `related_drivers` y `related_users`. |
| `POST` | `/api/mocks/seed?qty=10` | Admin (`authMiddleware` + `ADMIN`) | Carga controlada persistente en MongoDB. Bloqueado en `production`. |

---

## Endpoints del Core (Módulo 1)

### Health
- `GET /api/health`: Verifica operatividad del servidor.

### Sesiones (`/api/sessions`)
- `POST /api/sessions/register`: Registro de usuario (rol forzado a `user`).
- `POST /api/sessions/login`: Inicia sesión y setea cookie `currentUser` con JWT.
- `GET /api/sessions/current`: Sesión activa (`CurrentUserDTO`).
- `POST /api/sessions/logout`: Limpia la cookie `currentUser`.

### Usuarios (`/api/users`) — Admin
- `GET /api/users`: Lista usuarios sanitizados con `UserDTO`.
- `GET /api/users/:id`: Detalle de usuario por ID.

### Productos (`/api/products`)
- `GET /api/products`: Lista productos con filtros opcionales (`status`, `minPrice`, `maxPrice`, `search`).
- `GET /api/products/:id`: Detalle por ID.
- `POST /api/products`: Crear producto (Admin). `status` se deriva automáticamente (`stock = 0` → `out_of_stock`, `stock > 0` → `available`).
- `PUT /api/products/:id`: Actualizar producto (Admin). Recalcula `status` según stock final.
- `DELETE /api/products/:id`: Eliminar producto (Admin).

---

## Postman

La colección actualizada se encuentra en `postman_collection.json` e incluye las carpetas:
1. **Health**
2. **Sessions**
3. **Users (admin)**
4. **Products**
5. **Mocks (Generación en memoria)**
6. **Mocks (Seed controlada - Admin)**
7. **Errores Preentrega 3 (Uniform Error Responses)**:
   - `400 Bad Request - Qty inválido`
   - `400 Bad Request - Qty repetido`
   - `400 Bad Request - Producto con datos inválidos`
   - `400 Bad Request - ID inválido`
   - `400 Bad Request - JSON malformado`
   - `401 Unauthorized - Seed sin sesión`
   - `401 Unauthorized - Login credenciales incorrectas`
   - `403 Forbidden - Seed con usuario común`
   - `403 Forbidden - Crear producto con usuario común`
   - `404 Not Found - Producto inexistente`
   - `404 Not Found - Ruta inexistente`
   - `409 Conflict - Registro email duplicado`

Usa la variable de entorno `baseUrl` (default: `http://localhost:3000`). La cookie de autenticación se gestiona de forma automática en Postman tras el Login.

### Contraseñas de usuarios
El registro requiere al menos 6 caracteres y un máximo de 72 bytes UTF-8 (límite de bcrypt).
El login también rechaza contraseñas que excedan los 72 bytes. Los caracteres multibyte
ocupan más de un byte. Se rechazan contraseñas formadas únicamente por espacios;
las demás se conservan exactamente como fueron enviadas, sin recortarlas.
Las contraseñas largas creadas en versiones anteriores requieren restablecimiento: el login
no acepta una entrada superior al límite ni la trunca silenciosamente.
