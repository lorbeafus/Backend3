import { expect } from "chai";
import request from "supertest";
import app from "../../src/app.js";
import {
    seedBaseFixtures,
    getAdminAgent,
    getClient1Agent,
    getGuestAgent,
} from "./fixtures.js";
import { ERROR_DICTIONARY } from "../../src/constants/index.js";
import { AppError, MockSeedError } from "../../src/utils/errors.js";
import { ordersRepository } from "../../src/repositories/orders.repository.js";
import { mocksService } from "../../src/services/mocks.service.js";

describe("Módulo 6 - Logger, Swagger y Contratos Centralizados de Error", () => {
    beforeEach(async () => {
        await seedBaseFixtures();
    });

    describe("GET /api/loggerTest - Endpoint de diagnóstico del Logger", () => {
        it("debe responder exitosamente con la lista de niveles al ADMIN en entorno de test", async () => {
            const adminAgent = await getAdminAgent();

            const res = await adminAgent.get("/api/loggerTest").expect(200);

            expect(res.body).to.have.property("status", "success");
            expect(res.body).to.have.property("payload").that.is.an("object");

            const { payload } = res.body;
            expect(payload).to.have.property("simulated", true);
            expect(payload).to.have.property("message").that.includes("fatal simulado no detiene el proceso");
            expect(payload).to.have.property("levels").that.is.an("array");
            expect(payload.levels).to.include.members(["fatal", "error", "warning", "info", "http", "debug"]);
        });

        it("debe rechazar con 403 INSUFFICIENT_PERMISSIONS a un usuario no administrador (CLIENTE)", async () => {
            const client1Agent = await getClient1Agent();

            const res = await client1Agent.get("/api/loggerTest").expect(403);

            expect(res.body).to.have.property("status", "error");
            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.INSUFFICIENT_PERMISSIONS.code);
        });

        it("debe rechazar con 401 AUTHENTICATION_REQUIRED si se invoca sin sesión activa", async () => {
            const res = await getGuestAgent().get("/api/loggerTest").expect(401);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.AUTHENTICATION_REQUIRED.code);
        });
    });

    describe("GET /api/docs y GET /api/docs/openapi.json - Documentación Swagger y OpenAPI", () => {
        it("GET /api/docs/ debe servir la interfaz HTML de Swagger UI", async () => {
            const res = await request(app)
                .get("/api/docs/")
                .expect(200);

            expect(res.headers["content-type"]).to.include("text/html");
            expect(res.text).to.include("ShipNow API - Documentación Swagger");
            expect(res.text).to.include("swagger-ui");
        });

        it("GET /api/docs/openapi.json debe servir la especificación OpenAPI 3.0.3 válida con las rutas principales", async () => {
            const res = await request(app)
                .get("/api/docs/openapi.json")
                .expect(200);

            expect(res.headers["content-type"]).to.include("application/json");

            const spec = res.body;
            expect(spec).to.have.property("openapi", "3.0.3");
            expect(spec).to.have.property("info").that.is.an("object");
            expect(spec.info).to.have.property("title", "ShipNow API");
            expect(spec).to.have.property("paths").that.is.an("object");

            // Comprobar presencia de las rutas principales
            const paths = Object.keys(spec.paths);
            expect(paths).to.include("/api/sessions/login");
            expect(paths).to.include("/api/sessions/register");
            expect(paths).to.include("/api/sessions/current");
            expect(paths).to.include("/api/users");
            expect(paths).to.include("/api/orders");
            expect(paths).to.include("/api/deliveries");
            expect(paths).to.include("/api/mocks/users");
            expect(paths).to.include("/api/mocks/seed");
            expect(paths).to.include("/api/loggerTest");
        });
    });

    describe("Manejo de rutas no encontradas (404) y contrato estándar de errores", () => {
        it("debe responder con 404 ROUTE_NOT_FOUND con formato estándar ante rutas no existentes", async () => {
            const res = await request(app)
                .get("/api/ruta-totalmente-inexistente-123")
                .expect(404);

            expect(res.body).to.deep.include({
                status: "error",
                statusCode: 404,
            });

            expect(res.body).to.have.property("message").that.is.a("string");
            expect(res.body).to.have.property("error").that.is.an("object");

            const { error } = res.body;
            expect(error).to.have.property("code", ERROR_DICTIONARY.ROUTE_NOT_FOUND.code);
            expect(error).to.have.property("message").that.is.a("string");
            expect(error).to.have.property("details").that.is.an("object");
            expect(error.details).to.have.property("method", "GET");
            expect(error.details).to.have.property("path", "/api/ruta-totalmente-inexistente-123");
        });

        it("debe responder con 404 ROUTE_NOT_FOUND ante métodos no coincidentes en rutas existentes", async () => {
            const res = await request(app)
                .delete("/api/health") // Solo está definido GET /api/health
                .expect(404);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.ROUTE_NOT_FOUND.code);
        });

        it("todas las respuestas de error deben cumplir estrictamente el contrato { status, statusCode, message, error: { code, message, details } }", async () => {
            // Ejemplo 400: parámetros de paginación duplicados
            const client1Agent = await getClient1Agent();
            const res400 = await client1Agent.get("/api/orders?page=1&page=2").expect(400);

            expect(res400.body).to.have.all.keys("status", "statusCode", "message", "error");
            expect(res400.body.error).to.have.all.keys("code", "message", "details");
            expect(res400.body.error.code).to.equal(ERROR_DICTIONARY.INVALID_INPUT_DATA.code);
            expect(res400.body.error.details).to.be.an("object");

            // Ejemplo 401: falta de sesión
            const res401 = await getGuestAgent().get("/api/orders").expect(401);
            expect(res401.body).to.have.all.keys("status", "statusCode", "message", "error");
            expect(res401.body.error.code).to.equal(ERROR_DICTIONARY.AUTHENTICATION_REQUIRED.code);

            // Ejemplo 403: permisos insuficientes
            const res403 = await client1Agent.get("/api/users").expect(403);
            expect(res403.body).to.have.all.keys("status", "statusCode", "message", "error");
            expect(res403.body.error.code).to.equal(ERROR_DICTIONARY.INSUFFICIENT_PERMISSIONS.code);
        });
    });

    describe("Seguridad y aislamiento de errores 500 (sin filtración de datos sensibles)", () => {
        it("AppError con código UPLOAD_ERROR y mensaje interno con marcador sensible: devuelve UPLOAD_ERROR y mensaje del diccionario sin exponer el marcador", async () => {
            const adminAgent = await getAdminAgent();
            const originalGetById = ordersRepository.getById;
            ordersRepository.getById = async () => {
                throw new AppError(
                    ERROR_DICTIONARY.UPLOAD_ERROR,
                    "Fallo interno en filesystem con marcador FAKE_SENSITIVE_FS_MARKER_987654"
                );
            };

            try {
                const res = await adminAgent
                    .get("/api/orders/507f1f77bcf86cd799439011")
                    .expect(500);

                expect(res.body).to.deep.include({
                    status: "error",
                    statusCode: 500,
                    message: ERROR_DICTIONARY.UPLOAD_ERROR.message,
                });
                expect(res.body.error).to.deep.include({
                    code: ERROR_DICTIONARY.UPLOAD_ERROR.code,
                    message: ERROR_DICTIONARY.UPLOAD_ERROR.message,
                });

                const serialized = JSON.stringify(res.body);
                expect(serialized).to.not.include("FAKE_SENSITIVE_FS_MARKER_987654");
                expect(serialized).to.not.include("Fallo interno en filesystem");
            } finally {
                ordersRepository.getById = originalGetById;
            }
        });

        it("MockSeedError con mensaje interno sensible ficticio: devuelve MOCK_PERSISTENCE_FAILED y mensaje público conservando phase e insertedCounts", async () => {
            const adminAgent = await getAdminAgent();
            const originalSeed = mocksService.seedDatabase;
            mocksService.seedDatabase = async () => {
                const fakeErr = new Error("MongoNetworkError to mongodb://fakeuser:FAKE_PASSWORD_MARKER_999@10.0.0.1:27017/secret");
                throw new MockSeedError(
                    ERROR_DICTIONARY.MOCK_PERSISTENCE_FAILED,
                    `Error en la carga de datos de prueba en la fase 'users': ${fakeErr.message}`,
                    {
                        statusCode: 500,
                        phase: "users",
                        insertedCounts: { users: 0, drivers: 0, orders: 0, deliveries: 0 },
                        cause: fakeErr,
                        details: {
                            phase: "users",
                            insertedCounts: { users: 0, drivers: 0, orders: 0, deliveries: 0 },
                            sensitiveConnectionString: "mongodb://fakeuser:FAKE_PASSWORD_MARKER_999@10.0.0.1:27017/secret",
                        },
                    }
                );
            };

            try {
                const res = await adminAgent
                    .post("/api/mocks/seed?qty=1")
                    .expect(500);

                expect(res.body).to.deep.include({
                    status: "error",
                    statusCode: 500,
                    message: ERROR_DICTIONARY.MOCK_PERSISTENCE_FAILED.message,
                    phase: "users",
                });
                expect(res.body.insertedCounts).to.deep.equal({
                    users: 0,
                    drivers: 0,
                    orders: 0,
                    deliveries: 0,
                });
                expect(res.body.error).to.deep.include({
                    code: ERROR_DICTIONARY.MOCK_PERSISTENCE_FAILED.code,
                    message: ERROR_DICTIONARY.MOCK_PERSISTENCE_FAILED.message,
                });
                expect(res.body.error.details).to.deep.include({
                    phase: "users",
                    insertedCounts: { users: 0, drivers: 0, orders: 0, deliveries: 0 },
                });

                const serialized = JSON.stringify(res.body);
                expect(serialized).to.not.include("FAKE_PASSWORD_MARKER_999");
                expect(serialized).to.not.include("mongodb://");
                expect(serialized).to.not.include("MongoNetworkError");
                expect(serialized).to.not.include("sensitiveConnectionString");
            } finally {
                mocksService.seedDatabase = originalSeed;
            }
        });

        it("excepción inesperada: devuelve INTERNAL_SERVER_ERROR sin detalles internos ni filtración", async () => {
            const adminAgent = await getAdminAgent();
            const originalGetById = ordersRepository.getById;
            ordersRepository.getById = async () => {
                throw new Error("Crash no controlado con marcador FAKE_CRASH_SECRET_MARKER_123");
            };

            try {
                const res = await adminAgent
                    .get("/api/orders/507f1f77bcf86cd799439011")
                    .expect(500);

                expect(res.body).to.deep.include({
                    status: "error",
                    statusCode: 500,
                    message: ERROR_DICTIONARY.INTERNAL_SERVER_ERROR.message,
                });
                expect(res.body.error).to.deep.include({
                    code: ERROR_DICTIONARY.INTERNAL_SERVER_ERROR.code,
                    message: ERROR_DICTIONARY.INTERNAL_SERVER_ERROR.message,
                    details: {},
                });

                const serialized = JSON.stringify(res.body);
                expect(serialized).to.not.include("FAKE_CRASH_SECRET_MARKER_123");
                expect(serialized).to.not.include("Crash no controlado");
            } finally {
                ordersRepository.getById = originalGetById;
            }
        });

        it("AppError con código desconocido y status 500: se convierte en INTERNAL_SERVER_ERROR", async () => {
            const adminAgent = await getAdminAgent();
            const originalGetById = ordersRepository.getById;
            ordersRepository.getById = async () => {
                throw new AppError(
                    {
                        code: "UNKNOWN_CUSTOM_ERROR_CODE_ABC",
                        statusCode: 500,
                        message: "Mensaje interno desconocido con marcador FAKE_UNKNOWN_CODE_SECRET_456",
                    },
                    "Mensaje override con FAKE_UNKNOWN_CODE_SECRET_456"
                );
            };

            try {
                const res = await adminAgent
                    .get("/api/orders/507f1f77bcf86cd799439011")
                    .expect(500);

                expect(res.body).to.deep.include({
                    status: "error",
                    statusCode: 500,
                    message: ERROR_DICTIONARY.INTERNAL_SERVER_ERROR.message,
                });
                expect(res.body.error).to.deep.include({
                    code: ERROR_DICTIONARY.INTERNAL_SERVER_ERROR.code,
                    message: ERROR_DICTIONARY.INTERNAL_SERVER_ERROR.message,
                    details: {},
                });

                const serialized = JSON.stringify(res.body);
                expect(serialized).to.not.include("UNKNOWN_CUSTOM_ERROR_CODE_ABC");
                expect(serialized).to.not.include("FAKE_UNKNOWN_CODE_SECRET_456");
            } finally {
                ordersRepository.getById = originalGetById;
            }
        });

        it("detalles adicionales con stack, cause, rutas, consultas o secretos ficticios: no aparecen en el JSON público", async () => {
            const adminAgent = await getAdminAgent();
            const originalGetById = ordersRepository.getById;
            ordersRepository.getById = async () => {
                const err = new AppError(
                    ERROR_DICTIONARY.UPLOAD_ERROR,
                    "Mensaje con marcador FAKE_LEAK_MSG_XYZ"
                );
                err.details = {
                    stack: "Error at C:\\fake\\secret\\path\\server.js:42:10",
                    cause: "SELECT * FROM users WHERE pass='FAKE_SECRET_PASS_777'",
                    connectionUri: "mongodb://fake:fake@cluster.internal:27017/db",
                    secret_token: "FAKE_BEARER_TOKEN_888",
                    query: "db.orders.find({ secret: 'FAKE_DB_SECRET' })",
                };
                throw err;
            };

            try {
                const res = await adminAgent
                    .get("/api/orders/507f1f77bcf86cd799439011")
                    .expect(500);

                expect(res.body).to.deep.include({
                    status: "error",
                    statusCode: 500,
                    message: ERROR_DICTIONARY.UPLOAD_ERROR.message,
                });
                expect(res.body.error).to.deep.include({
                    code: ERROR_DICTIONARY.UPLOAD_ERROR.code,
                    message: ERROR_DICTIONARY.UPLOAD_ERROR.message,
                    details: {},
                });

                const serialized = JSON.stringify(res.body);
                expect(serialized).to.not.include("FAKE_LEAK_MSG_XYZ");
                expect(serialized).to.not.include("fake\\secret\\path");
                expect(serialized).to.not.include("FAKE_SECRET_PASS_777");
                expect(serialized).to.not.include("cluster.internal");
                expect(serialized).to.not.include("FAKE_BEARER_TOKEN_888");
                expect(serialized).to.not.include("FAKE_DB_SECRET");
            } finally {
                ordersRepository.getById = originalGetById;
            }
        });
    });
});
