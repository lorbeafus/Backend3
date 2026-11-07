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
});
