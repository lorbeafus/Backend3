# ShipNow API

API REST de ShipNow adaptada para las pre-entregas del curso **Backend III** (Coderhouse).
- **Módulo 1:** Arquitectura profesional por capas, configuración centralizada estricta y entidades **Users**, **Sessions** y **Products**.
- **Módulo 2:** Módulo de mocking logístico (**Users**, **Drivers**, **Orders**, **Deliveries**) con generación en memoria y carga controlada (`seed`) en MongoDB.

## Tecnologías y Requisitos

- **Node.js:** Versión requerida por `@faker-js/faker@10.6.0` instalada en el proyecto: **Node.js `^20.19.0 || ^22.13.0 || ^23.5.0 || >=24.0.0`** (con soporte nativo para ES Modules `"type": "module"`).
- Express 5, MongoDB con Mongoose 9.
- Passport (estrategias `local` y `jwt`), JWT en cookie `httpOnly`, bcrypt.
- `@faker-js/faker` para la generación de datos simulados realistas.
- dotenv, cargado en un único módulo (`src/config/env.config.js`).

## Arquitectura por capas

```text
Router → Controller → Service → Repository → Model / MongoDB
```

| Capa | Carpeta | Responsabilidad |
| :--- | :--- | :--- |
| Router | `src/routes/` | Define paths y asocia middlewares de autenticación/roles (`authMiddleware`, `authorizeRoles`). |
| Controller | `src/controllers/` | Capa HTTP: lee `req`, envía `res`, status codes y deriva excepciones con `next(err)`. No importa Mongoose ni modelos. |
| Service | `src/services/` | Validaciones de tipos y negocio, lógica de dominio, coordinación de entidades y generación de mocks. No conoce `req`/`res` ni importa Mongoose. |
| Repository | `src/repositories/` | Único punto de acceso a Mongoose: consultas, proyecciones (`-password` por defecto en usuarios), filtros y persistencia secuencial ordenada en base de datos. |
| Model | `src/models/` | Esquemas Mongoose, tipos y restricciones de integridad. |

## Estructura del proyecto

```text
SHIPNOW/
├── src/
│   ├── app.js                      # Express, middlewares globales y routers montados
│   ├── server.js                   # Conexión asíncrona a MongoDB y arranque del servidor
│   ├── config/
│   │   ├── env.config.js           # Carga dotenv y validación estricta al inicio
│   │   ├── index.js                # Re-exporta config
│   │   ├── database.js             # Conexión a MongoDB
│   │   └── passport.config.js      # Estrategias register, login y current (JWT en cookie)
│   ├── constants/index.js          # USER_ROLES, PRODUCT_STATUS, ORDER_STATUS, ORDER_PRIORITY, DELIVERY_STATUS
│   ├── controllers/                # products, users, sessions, mocks
│   ├── dto/                        # UserDTO, CurrentUserDTO (protección de passwords)
│   ├── middlewares/                # auth (JWT + roles), passport, error.middleware
│   ├── models/                     # user.model.js, product.model.js, order.model.js, delivery.model.js
│   ├── repositories/               # users, products, orders, deliveries, mocks
│   ├── routes/                     # products, users, sessions, mocks
│   ├── services/                   # products, users, sessions, mocks
│   └── utils/                      # hash, jwt, errors, validation, mockGenerators
├── .env.example
├── postman_collection.json
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

## Constantes del Dominio (`src/constants/index.js`)

Todos los objetos están inmutabilizados mediante `Object.freeze`:

```javascript
export const USER_ROLES = Object.freeze({
    ADMIN: "admin",
    USER: "user",
    DRIVER: "driver",
});

export const PRODUCT_STATUS = Object.freeze({
    AVAILABLE: "available",
    OUT_OF_STOCK: "out_of_stock",
});

export const ORDER_STATUS = Object.freeze({
    PENDING: "pending",
    IN_TRANSIT: "in_transit",
    DELIVERED: "delivered",
    CANCELLED: "cancelled",
});

export const ORDER_PRIORITY = Object.freeze({
    LOW: "low",
    MEDIUM: "medium",
    HIGH: "high",
    URGENT: "urgent",
});

export const DELIVERY_STATUS = Object.freeze({
    ASSIGNED: "assigned",
    IN_PROGRESS: "in_progress",
    COMPLETED: "completed",
    FAILED: "failed",
});
```

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
| `in_transit` | `in_progress` |
| `delivered` | `completed` |
| `cancelled` | `failed` |

Las entregas en curso o completadas requieren un repartidor.

### Endpoints de Mocking

| Método | Ruta | Acceso | Descripción |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/mocks/users?qty=10` | Público | Genera usuarios cliente simulados en memoria (sin password). |
| `GET` | `/api/mocks/drivers?qty=10` | Público | Genera repartidores simulados con rol `driver` en memoria. |
| `GET` | `/api/mocks/orders?qty=10` | Público | Genera pedidos simulados y devuelve además los `related_users` referenciados. |
| `GET` | `/api/mocks/deliveries?qty=10` | Público | Genera entregas simuladas y devuelve `related_orders`, `related_drivers` y `related_users`. |
| `POST` | `/api/mocks/seed?qty=10` | Admin (`authMiddleware` + `ADMIN`) | Carga controlada persistente en MongoDB. Bloqueado en `production`. |

### Parámetro `qty` y Validaciones
- **Tipo:** Entero positivo (`1 <= qty <= 100` para GET; `1 <= qty <= 50` para POST `seed`).
- Si se omite, toma por defecto `qty=10`.
- Si se envía un valor no entero, menor a 1, un string no numérico, `null`, booleano, array o parámetro repetido (ej. `?qty=2&qty=3`), se rechaza con **`400 Bad Request`**.

### Significado de `qty` en `POST /api/mocks/seed`
El parámetro `qty` define el factor de escala de la simulación. Al enviar `qty = N`, se insertan:
- `N` usuarios cliente (`role: "user"`).
- `N` repartidores (`role: "driver"`).
- `N` pedidos asociados a los usuarios insertados.
- `N` entregas asociadas a los pedidos y repartidores insertados.
- **Total insertado:** `4 * N` documentos.
- **Contraseñas generadas:** Se crean con hash real de bcrypt (`mockPassword123`) para que los usuarios puedan autenticarse si se desea en pruebas.
- **Anti-colisión:** Los correos electrónicos y códigos de seguimiento incorporan timestamps y sufijos aleatorios únicos para garantizar que múltiples ejecuciones de seed consecutivas no colisionen en índices únicos.

### Comportamiento exacto ante fallos en Seed (MongoDB Standalone)
La carga controlada en MongoDB se implementa mediante **persistencia secuencial explícita en orden estricto de dependencias** encapsulada en `MocksRepository`:
1. `Fase 1: Users` (clientes)
2. `Fase 2: Drivers` (repartidores)
3. `Fase 3: Orders` (pedidos vinculados a usuarios existentes)
4. `Fase 4: Deliveries` (entregas vinculadas a pedidos y repartidores existentes)

**Comportamiento ante fallo parcial:**
- Si ocurre un fallo en una fase intermedia (por ejemplo, fallo en la fase de `Orders` o `Deliveries`), la petición **NO informa éxito**. Responde con un código de error HTTP (`500`, `400` o `409` según corresponda) y no se reintenta automáticamente la carga para evitar duplicar usuarios o pedidos.
- **Registros que pueden quedar insertados:** Quedan los documentos de fases anteriores y los documentos insertados antes del error dentro de la fase fallida. Cada documento se inserta y confirma individualmente; el primer fallo detiene la carga. Por ejemplo, si falla el segundo pedido, queda el primero además de los clientes y repartidores. La respuesta de error incluye `phase` e `insertedCounts`, con las escrituras confirmadas por colección. Ante una pérdida de conexión durante una escritura, el resultado de esa última operación puede ser incierto: los contadores solo incluyen escrituras confirmadas; se debe revisar la base antes de repetir la carga. No hay rollback ni reintento automático.
- **Garantía de integridad referencial:** Gracias al orden secuencial unidireccional de dependencias, **nunca quedarán referencias huérfanas** (nunca habrá un pedido apuntando a un usuario inexistente ni una entrega apuntando a un pedido o repartidor inexistente).

Ejemplo de respuesta exitosa (`POST /api/mocks/seed?qty=5`):
```json
{
  "status": "success",
  "payload": {
    "inserted": {
      "users": 5,
      "drivers": 5,
      "orders": 5,
      "deliveries": 5,
      "total": 20
    },
    "scale_qty": 5,
    "message": "Carga de prueba ejecutada exitosamente (20 documentos insertados respetando integridad referencial)"
  }
}
```

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

Usa la variable de entorno `baseUrl` (default: `http://localhost:3000`). La cookie de autenticación se gestiona de forma automática en Postman tras el Login.
