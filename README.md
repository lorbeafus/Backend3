# ShipNow API

API REST de ShipNow para la pre-entrega del Módulo 1 de **Backend III** (Coderhouse). Gestiona **Users**, **Sessions** y **Products** con arquitectura por capas, configuración centralizada y constantes de dominio inmutables.

## Tecnologías

- Node.js con ES Modules (`"type": "module"`).
- Express 5, MongoDB con Mongoose 9.
- Passport (estrategias `local` y `jwt`), JWT en cookie `httpOnly`, bcrypt.
- dotenv, cargado en un único módulo (`src/config/env.config.js`).

## Arquitectura

```text
Router → Controller → Service → Repository → Model / MongoDB
```

| Capa | Carpeta | Responsabilidad |
| :--- | :--- | :--- |
| Router | `src/routes/` | Define paths y middlewares de autenticación/roles. |
| Controller | `src/controllers/` | Capa HTTP: lee `req`, arma `res`, delega al Service y envía errores con `next(err)`. No importa modelos ni Mongoose. |
| Service | `src/services/` | Validaciones de tipos y datos, reglas de negocio, existencia de recursos. No conoce `req`/`res` ni modelos. |
| Repository | `src/repositories/` | Único acceso a Mongoose: consultas, filtros, ordenamiento, proyecciones (`-password` por defecto en usuarios) y `runValidators` en actualizaciones. No contiene reglas de negocio. |
| Model | `src/models/` | Esquemas y restricciones de datos. |

### Service vs. Repository

- **Service**: decide *qué* es válido y *qué* hacer. Ejemplos: el precio debe ser mayor a 0, el stock un entero ≥ 0, el estado del producto se deriva del stock, el registro público siempre asigna rol `user`, el login compara la contraseña con bcrypt.
- **Repository**: decide *cómo* se guarda y se lee. Ejemplo: `usersRepository.getById` oculta `password` por defecto, mientras que `getByEmail` devuelve el documento completo para que el login pueda recuperar el hash y compararlo.
- **Passport** (`src/config/passport.config.js`) es solo integración: extrae credenciales y delega en `sessionsService`.

## Estructura del proyecto

```text
SHIPNOW/
├── src/
│   ├── app.js                      # Express, middlewares y routers
│   ├── server.js                   # Conecta a MongoDB y luego escucha
│   ├── config/
│   │   ├── env.config.js           # Carga dotenv y valida variables críticas
│   │   ├── index.js                # Re-exporta config
│   │   ├── database.js             # Conexión a MongoDB
│   │   └── passport.config.js      # Estrategias register, login y current (JWT en cookie)
│   ├── constants/index.js          # USER_ROLES y PRODUCT_STATUS (Object.freeze)
│   ├── controllers/                # products, users, sessions
│   ├── dto/                        # UserDTO, CurrentUserDTO (nunca exponen password)
│   ├── middlewares/                # auth (JWT + roles), passport, errores
│   ├── models/                     # user.model.js, product.model.js
│   ├── repositories/               # users, products
│   ├── routes/                     # products, users, sessions
│   ├── services/                   # products, users, sessions
│   └── utils/                      # hash, jwt, errors, validation
├── .env.example
├── postman_collection.json
└── package.json
```

## Variables de entorno

La app valida las variables al arrancar, **antes** de conectar a MongoDB o escuchar. Si falta alguna o es inválida, el proceso termina con un mensaje `[FATAL]` que indica cuál.

| Variable | Obligatoria | Descripción | Ejemplo |
| :--- | :--- | :--- | :--- |
| `PORT` | Sí | Puerto HTTP (entero 1-65535). | `3000` |
| `NODE_ENV` | Sí | `development`, `production` o `test`. | `development` |
| `MONGODB_URI` | Sí | Cadena de conexión a MongoDB. | `mongodb://localhost:27017/shipnow_dev` |
| `JWT_SECRET` | Sí | Secreto para firmar los JWT. | *(definir un valor propio)* |
| `JWT_EXPIRES_IN` | No | Vigencia del token (default `1h`). | `1h` |

`.env.example` contiene la plantilla sin secretos. `.env` y `node_modules/` están en `.gitignore`.

> ShipNow usa su propia base (`shipnow_dev` en el ejemplo), separada de las de proyectos anteriores.

## Instalación y ejecución

```bash
npm install
cp .env.example .env      # en PowerShell: Copy-Item .env.example .env
# editar .env y definir JWT_SECRET
npm run dev               # node --watch src/server.js
npm start                 # node src/server.js
```

Scripts disponibles en `package.json`: `start` y `dev`. No hay script de tests en este módulo.

## Constantes (`src/constants/index.js`)

```javascript
export const USER_ROLES = Object.freeze({ ADMIN: "admin", USER: "user" });
export const PRODUCT_STATUS = Object.freeze({ AVAILABLE: "available", OUT_OF_STOCK: "out_of_stock" });
```

Se usan en modelos, servicios, rutas y estrategias de Passport.

## Endpoints

Las respuestas exitosas tienen la forma `{ "status": "success", "payload": ... }`. Los errores, `{ "status": "error", "statusCode": <n>, "message": "..." }`.

### Health

| Método | Ruta | Acceso |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Público |

### Sesiones (`/api/sessions`)

| Método | Ruta | Acceso | Descripción |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/sessions/register` | Público | Registra un usuario. El rol siempre es `user`; un `role` enviado en el body se ignora. |
| `POST` | `/api/sessions/login` | Público | Valida credenciales y guarda el JWT en la cookie `currentUser` (`httpOnly`). |
| `GET` | `/api/sessions/current` | Autenticado | Datos del usuario en sesión (`CurrentUserDTO`). |
| `POST` | `/api/sessions/logout` | Público (idempotente) | Elimina la cookie `currentUser`. No requiere sesión; el JWT es stateless y no se revoca en el servidor, solo expira por tiempo. |

Registro:

```json
{ "first_name": "Laura", "last_name": "Gómez", "email": "laura@shipnow.com", "password": "password123" }
```

Contraseña: texto de al menos 6 caracteres.

### Usuarios (`/api/users`) — solo `admin`

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| `GET` | `/api/users` | Lista usuarios (`UserDTO`, sin password). |
| `GET` | `/api/users/:id` | Usuario por ID. |

### Productos (`/api/products`)

| Método | Ruta | Acceso | Descripción |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/products` | Público | Lista. Filtros: `status`, `minPrice`, `maxPrice`, `search`. |
| `GET` | `/api/products/:id` | Público | Detalle. |
| `POST` | `/api/products` | `admin` | Crea (`name`, `description`, `price`, `stock`). |
| `PUT` | `/api/products/:id` | `admin` | Actualiza `name`, `description`, `price` y/o `stock`. Requiere al menos uno. |
| `DELETE` | `/api/products/:id` | `admin` | Elimina. |

Códigos de acceso: `401` sin sesión o token inválido; `403` con sesión de un usuario sin rol `admin`.

Ejemplo (`POST /api/products`):

```json
{ "name": "Caja Cartón Mediana 40x30x30", "description": "Caja reforzada para envíos", "price": 1450, "stock": 100 }
```

## Reglas de Products

- `price`: número (o string numérico) mayor a 0.
- `stock`: entero ≥ 0. Se rechazan `null`, booleanos, arrays, negativos y fraccionarios.
- **`status` lo calcula el servidor** a partir del stock final: `stock = 0` → `out_of_stock`; `stock > 0` → `available`. Si el cliente envía `status` en el body, se ignora. Se recalcula en cada actualización.
- Campos no listados (por ejemplo `_id`, `createdAt`) se ignoran al crear y actualizar.
- `search` busca texto literal en el nombre (sin distinguir mayúsculas); los caracteres especiales se escapan. Máximo 100 caracteres.
- IDs inválidos → `400`; producto inexistente → `404`.
- Cuerpo ausente, no objeto o JSON malformado → `400`.

## Postman

`postman_collection.json` incluye las rutas anteriores. Usa la variable `baseUrl` (default `http://localhost:3000`). Postman conserva la cookie `currentUser` tras el login. Para las rutas de administrador hace falta un usuario con rol `admin`: el registro público no lo permite, por lo que debe asignarse directamente en la base de datos (por ejemplo, desde `mongosh` sobre la base de desarrollo).
