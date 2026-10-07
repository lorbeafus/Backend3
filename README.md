# ShipNow API - Pre-entrega Módulo 1: Base Profesional con Capas y Entorno

Bienvenido a la documentación de **ShipNow API**, adaptada y estructurada para cumplir con los requerimientos de la **Pre-entrega del Módulo 1** de la especialización **Backend III: Testing y escalabilidad backend** (Coderhouse).

Este proyecto parte de la base funcional de Backend II y la refactoriza hacia los estándares de arquitectura profesional por capas, configuración centralizada estricta con validación temprana, uso de constantes de dominio inmutables y separación clara de responsabilidades para las entidades de **Usuarios (`Users`)** y **Productos (`Products`)**.

---

## 🚀 Tecnologías Utilizadas

- **Runtime & Lenguaje:** Node.js (v20+) con sintaxis nativa de **ES Modules** (`"type": "module"`).
- **Framework Web:** Express.js 5.x.
- **Base de Datos & ODM:** MongoDB con Mongoose 9.x.
- **Gestión de Entorno:** Dotenv con validación estricta al inicio de la aplicación.
- **Seguridad & Autenticación:** Passport.js (Estrategias Local y JWT), JSON Web Tokens (JWT), Bcrypt y cookies seguras (`cookie-parser`).
- **Arquitectura de Software:** Arquitectura de 3 Capas (`Controller` → `Service` → `Repository`), patrón DTO (`Data Transfer Object`) y constantes congeladas (`Object.freeze`).

---

## 🏛️ Arquitectura por Capas y Flujo de una Petición

Siguiendo las directrices del Módulo 1 de Backend III, la API garantiza un desacoplamiento estricto donde cada capa cumple una única responsabilidad:

```text
HTTP Request
    │
    ▼
[ Router ]         (src/routes/)
    │              -> Define el path y asocia middlewares de autenticación / roles.
    ▼
[ Controller ]     (src/controllers/)
    │              -> Única puerta de entrada HTTP: gestiona req, res, status codes y next(err).
    │              -> NUNCA importa Mongoose ni modelos directamente.
    ▼
[ Service ]        (src/services/)
    │              -> Cerebro del sistema: valida datos y ejecuta reglas del negocio.
    │              -> No conoce req ni res (independiente de Express).
    ▼
[ Repository ]     (src/repositories/)
    │              -> Único componente que interactúa con Mongoose/MongoDB.
    │              -> Encapsula consultas, ordenamiento, filtros y proyecciones.
    ▼
[ Model / DB ]     (src/models/)
                   -> Define esquemas y restricciones de persistencia en MongoDB.
```

### ⚖️ Justificación Técnica: Separación entre Service y Repository

- **Service (Lógica de Negocio):**
  - Contiene las validaciones de negocio (precios positivos, stock no negativo, transiciones de estado coherentes, normalización de emails).
  - No depende del protocolo HTTP (no recibe `req` ni `res`), lo que permitiría invocarlo desde tareas programadas (cron jobs), scripts CLI o pruebas automatizadas sin levantar un servidor web.
  - No conoce si la base de datos es MongoDB, PostgreSQL o memoria; delega enteramente la persistencia al Repository.

- **Repository (Abstracción de Datos):**
  - Encapsula todas las operaciones de acceso a Mongoose (`find`, `findById`, `create`, `findByIdAndUpdate`, `findByIdAndDelete`).
  - No es un simple "pasamanos": aplica proyecciones por defecto (como ocultar contraseñas en consultas habituales), ordenamiento cronológico y conversiones a objetos planos (`.lean()`).
  - No contiene lógica de negocio (no valida si el usuario tiene permisos ni calcula costos); su única labor es persistir y recuperar información de la base de datos de manera confiable.

---

## 📁 Estructura del Proyecto

```text
TICKETS/
├── src/
│   ├── config/
│   │   ├── env.config.js       # Validación estricta y carga centralizada de variables (.env)
│   │   ├── index.js            # Barrel de configuración (re-exporta config/env)
│   │   ├── database.js         # Conexión asíncrona a MongoDB
│   │   └── passport.config.js  # Estrategias de autenticación (Local y JWT) con constantes
│   ├── constants/
│   │   └── index.js            # Constantes inmutables congeladas (USER_ROLES, PRODUCT_STATUS)
│   ├── controllers/
│   │   ├── products.controller.js # Controlador HTTP de Productos
│   │   ├── users.controllers.js   # Controlador HTTP de Usuarios
│   │   └── sessions.controllers.js# Controlador HTTP de Sesiones (Login/Register/Current)
│   ├── dto/
│   │   ├── user.dto.js         # DTO de Usuarios (protege contraseñas)
│   │   └── index.js
│   ├── middlewares/
│   │   ├── auth.middleware.js     # Middleware de protección por JWT y control de roles (RBAC)
│   │   ├── error.middleware.js    # Manejador centralizado de excepciones
│   │   └── passport.middleware.js # Invocador de estrategias Passport
│   ├── models/
│   │   ├── product.model.js    # Esquema Mongoose de Producto
│   │   └── user.model.js       # Esquema Mongoose de Usuario
│   ├── repositories/
│   │   ├── products.repository.js # Persistencia de Productos sin pasamanos
│   │   └── users.repository.js    # Persistencia de Usuarios directa a Mongoose
│   ├── routes/
│   │   ├── products.routes.js  # Rutas de Productos
│   │   ├── users.routes.js     # Rutas de Usuarios
│   │   └── sessions.routes.js  # Rutas de Sesiones y Autenticación
│   ├── services/
│   │   ├── products.service.js # Reglas de negocio y validación de Productos
│   │   └── users.services.js   # Reglas de negocio y validación de Usuarios
│   ├── utils/
│   │   ├── hash.js             # Bcrypt hashing y validación
│   │   └── jwt.js              # Firma y verificación de tokens JWT
│   ├── app.js                  # Configuración de Express, middlewares y rutas activas
│   └── server.js               # Arranque controlado del servidor HTTP
├── .env.example                # Plantilla de variables de entorno documentadas
├── .gitignore                  # Exclusión de .env, node_modules y logs
├── database.js                 # Re-export de infraestructura a src/config/database.js
└── package.json                # Metadatos del proyecto y scripts de ejecución
```

---

## 🔒 Variables de Entorno y Robustez del Arranque

La aplicación implementa validación al inicio dentro de `src/config/env.config.js`. Si alguna variable crítica no está configurada o posee un valor inválido, el proceso se interrumpe inmediatamente lanzando un error descriptivo (sin filtrar credenciales sensibles):

```text
[FATAL] Error de configuración de variables de entorno al iniciar:
 - MONGODB_URI es obligatoria y no puede estar vacía.
Verificá tu archivo .env contra .env.example.
```

### Variables Requeridas

| Variable | Tipo | Descripción | Ejemplo |
| :--- | :--- | :--- | :--- |
| `PORT` | Número (1-65535) | Puerto de escucha del servidor Express | `3000` |
| `NODE_ENV` | String | Entorno (`development`, `production`, `test`) | `development` |
| `MONGODB_URI` | String | Cadena de conexión a MongoDB para ShipNow | `mongodb://127.0.0.1:27017/shipnow_dev` |
| `JWT_SECRET` | String | Clave secreta para firmar tokens de autenticación | `clave_secreta_super_segura` |
| `JWT_EXPIRES_IN` | String (Opcional) | Tiempo de validez del JWT (default: `1h`) | `1h` |

> [!IMPORTANT]
> **Base de Datos Separada:**
> Para preservar la base de datos de eventos original de Backend II, la variable `MONGODB_URI` apunta a la base de datos exclusiva `shipnow_dev`.

---

## ❄️ Constantes del Dominio (`src/constants/index.js`)

Se definieron objetos congelados mediante `Object.freeze` para erradicar strings mágicos:

```javascript
export const USER_ROLES = Object.freeze({
    ADMIN: "admin",
    USER: "user",
});

export const PRODUCT_STATUS = Object.freeze({
    AVAILABLE: "available",
    OUT_OF_STOCK: "out_of_stock",
});
```

- **Seguridad en Registro:** El registro público asigna automáticamente `USER_ROLES.USER`. No es posible que un usuario se autoasigne `ADMIN` desde el payload de registro.
- **Retiro de Roles Antiguos:** El rol transitorio `organizer` de la API de eventos fue retirado del modelo de usuario y de las autorizaciones activas.

---

## 🛠️ Instalación y Puesta en Marcha

### 1. Clonar el repositorio y acceder a la rama de trabajo

```bash
git clone <URL_DEL_REPOSITORIO>
cd TICKETS
git checkout feature/shipnow-preentrega-1
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar variables de entorno

Crear el archivo `.env` en la raíz copiando la plantilla `.env.example`:

```bash
cp .env.example .env
```

Contenido recomendado para desarrollo local:

```env
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb://127.0.0.1:27017/shipnow_dev
JWT_SECRET=clave_secreta_jwt_para_desarrollo_local
JWT_EXPIRES_IN=1h
```

### 4. Iniciar el servidor

Modo desarrollo (con reinicio automático al guardar cambios):

```bash
npm run dev
```

Modo estándar:

```bash
npm start
```

Salida esperada en terminal:

```text
[Database] Connected successfully to MongoDB (development)
🚀 [ShipNow API] Servidor escuchando en http://localhost:3000 [Entorno: development]
```

---

## 📋 Endpoints de la API

### Health Check

- `GET /api/health`: Verifica el estado operativo de la API.

---

### Autenticación & Sesiones (`/api/sessions`)

| Método | Endpoint | Acceso | Descripción |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/sessions/register` | Público | Registra un usuario con rol `user`. |
| `POST` | `/api/sessions/login` | Público | Inicia sesión y genera cookie `currentUser` (JWT). |
| `GET` | `/api/sessions/current` | Autenticado | Devuelve los datos del usuario en sesión vía `CurrentUserDTO`. |
| `POST` | `/api/sessions/logout` | Autenticado | Limpia la cookie de autenticación. |

#### Ejemplo de Registro (`POST /api/sessions/register`):
```json
{
  "first_name": "Laura",
  "last_name": "Gómez",
  "email": "laura@shipnow.com",
  "password": "password123"
}
```

---

### Usuarios (`/api/users`)

| Método | Endpoint | Acceso | Descripción |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/users` | Admin (`authMiddleware` + `ADMIN`) | Lista todos los usuarios sanitizados con `UserDTO`. |
| `GET` | `/api/users/:id` | Admin (`authMiddleware` + `ADMIN`) | Consulta usuario por ID sanitizado con `UserDTO`. |

---

### Productos (`/api/products`)

| Método | Endpoint | Acceso | Descripción |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/products` | Público | Lista productos con filtros opcionales (`status`, `minPrice`, `maxPrice`, `search`). |
| `GET` | `/api/products/:id` | Público | Obtiene el detalle de un producto por ID. |
| `POST` | `/api/products` | Admin (`authMiddleware` + `ADMIN`) | Crea un producto nuevo con validación de negocio. |
| `PUT` | `/api/products/:id` | Admin (`authMiddleware` + `ADMIN`) | Actualiza atributos de un producto existente. |
| `DELETE`| `/api/products/:id` | Admin (`authMiddleware` + `ADMIN`) | Elimina un producto por ID. |

#### Ejemplo de Creación de Producto (`POST /api/products`):
```json
{
  "name": "Caja Cartón Mediana 40x30x30",
  "description": "Caja reforzada de cartón corrugado para paquetería y envíos",
  "price": 1450,
  "stock": 100
}
```

Respuesta esperada (`201 Created`):
```json
{
  "status": "success",
  "message": "Producto creado exitosamente",
  "payload": {
    "_id": "673cf10b23f81e35a1234567",
    "name": "Caja Cartón Mediana 40x30x30",
    "description": "Caja reforzada de cartón corrugado para paquetería y envíos",
    "price": 1450,
    "stock": 100,
    "status": "available",
    "createdAt": "2026-10-07T20:30:00.000Z",
    "updatedAt": "2026-10-07T20:30:00.000Z"
  }
}
```

---

## 📌 Decisiones de Implementación

Dado que la consigna del Módulo 1 establece los objetivos arquitectónicos y de configuración pero no impone un esquema rígido para la entidad Producto, se tomaron las siguientes decisiones de ingeniería de software:

1. **Esquema de Producto:** Se implementaron los campos `name`, `description`, `price`, `stock` y `status`. El estado se sincroniza de forma inteligente en el servicio de negocio: si el stock es `0`, el estado se asigna automáticamente como `out_of_stock`.
2. **Consultas de Productos sin exclusión arbitraria:** No se filtran los productos con stock 0 a menos que el cliente use el query parameter `?status=available`. Esto permite que los clientes consulten el catálogo completo y vean qué productos están momentáneamente agotados.
3. **Persistencia Directa en Repository:** Se integró la interacción con Mongoose dentro de `UsersRepository` y `ProductsRepository`, eliminando la capa redundante de DAOs para estas entidades y erradicando el antipatrón de repositorios "pasamanos".
4. **Protección de Salida:** Los controladores de usuarios utilizan `UserDTO` para garantizar que contraseñas y datos sensibles jamás sean enviados en la respuesta JSON.
5. **Aislamiento de Módulos Previos:** Las rutas de eventos y tickets fueron desvinculadas de `src/app.js` para que la API exponga exclusivamente el alcance de ShipNow (Users, Products y Sessions). Sus archivos se conservan en el proyecto para fines de auditoría pero no forman parte del ciclo de ejecución.
