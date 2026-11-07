import { expect } from "chai";
import request from "supertest";
import app from "../../src/app.js";
import { userModel } from "../../src/models/user.model.js";
import {
    seedBaseFixtures,
    DEFAULT_PASSWORD,
    FIXTURE_EMAILS,
    testUsers,
    getAdminAgent,
    getClient1Agent,
    getGuestAgent,
} from "./fixtures.js";
import { ERROR_DICTIONARY, USER_ROLES } from "../../src/constants/index.js";

describe("Módulo 6 - Autenticación, Sesiones y Usuarios", () => {
    beforeEach(async () => {
        await seedBaseFixtures();
    });

    describe("UsersService - Validación de roles (integración con MongoDB)", () => {
        it("debe rechazar el rol superheroe con AppError 400 sin persistir el usuario", async () => {
            const { usersService } = await import("../../src/services/users.services.js");
            const { AppError } = await import("../../src/utils/errors.js");
            const email = "rol.invalido@module6.test";
            const countBefore = await userModel.countDocuments();
            let capturedError;

            try {
                await usersService.createUser({
                    first_name: "Rol",
                    last_name: "Invalido",
                    email,
                    password: DEFAULT_PASSWORD,
                    role: "superheroe",
                });
            } catch (error) {
                capturedError = error;
            }

            expect(capturedError).to.be.instanceOf(AppError);
            expect(capturedError.statusCode).to.equal(400);
            expect(capturedError.code).to.equal(ERROR_DICTIONARY.INVALID_INPUT_DATA.code);
            expect(capturedError.message).to.include("Rol no válido");
            expect(capturedError.details).to.deep.equal({
                field: "role",
                allowed: Object.values(USER_ROLES),
            });
            expect(await userModel.findOne({ email })).to.be.null;
            expect(await userModel.countDocuments()).to.equal(countBefore);
        });
    });
    describe("POST /api/sessions/register - Registro de usuarios", () => {
        it("debe registrar un usuario correctamente y devolver datos sanitizados sin passwords ni hashes", async () => {
            const newUser = {
                first_name: "Nuevo",
                last_name: "Usuario",
                email: "nuevo.registro@module6.test",
                password: "PasswordSegura123",
            };

            const res = await request(app)
                .post("/api/sessions/register")
                .send(newUser)
                .expect(201);

            expect(res.body).to.have.property("status", "success");
            expect(res.body).to.have.property("message", "Usuario registrado correctamente");
            expect(res.body).to.have.property("payload").that.is.an("object");

            const { payload } = res.body;
            expect(payload).to.have.property("id").that.is.a("string");
            expect(payload).to.have.property("first_name", newUser.first_name);
            expect(payload).to.have.property("last_name", newUser.last_name);
            expect(payload).to.have.property("email", newUser.email.toLowerCase());
            expect(payload).to.have.property("role", USER_ROLES.USER);

            // Verificación estricta de sanitización
            expect(payload).to.not.have.property("password");
            expect(payload).to.not.have.property("hash");
            expect(JSON.stringify(res.body)).to.not.include(newUser.password);

            // Comprobar que en MongoDB se almacenó con hash bcrypt
            const persisted = await userModel.findOne({ email: newUser.email.toLowerCase() });
            expect(persisted).to.not.be.null;
            expect(persisted.password).to.not.equal(newUser.password);
            expect(persisted.password).to.match(/^\$2[aby]\$\d+\$/);
        });

        it("debe forzar rol USER en el registro público aunque el cuerpo intente enviar ADMIN", async () => {
            const maliciousData = {
                first_name: "Intento",
                last_name: "Admin",
                email: "intento.admin@module6.test",
                password: "Password123",
                role: USER_ROLES.ADMIN,
            };

            const res = await request(app)
                .post("/api/sessions/register")
                .send(maliciousData)
                .expect(201);

            expect(res.body.payload).to.have.property("role", USER_ROLES.USER);

            const persisted = await userModel.findOne({ email: maliciousData.email });
            expect(persisted.role).to.equal(USER_ROLES.USER);
        });

        it("debe rechazar con 409 DUPLICATE_RESOURCE si el email ya se encuentra registrado", async () => {
            const duplicateData = {
                first_name: "Clon",
                last_name: "Duplicado",
                email: FIXTURE_EMAILS.CLIENT1, // Ya existe en fixtures
                password: "Password123",
            };

            const res = await request(app)
                .post("/api/sessions/register")
                .send(duplicateData)
                .expect(409);

            expect(res.body).to.have.property("status", "error");
            expect(res.body).to.have.property("statusCode", 409);
            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.DUPLICATE_RESOURCE.code);
        });

        it("debe rechazar con 400 INVALID_INPUT_DATA si faltan campos obligatorios", async () => {
            const incomplete = {
                first_name: "Incompleto",
                email: "incompleto@module6.test",
            };

            const res = await request(app)
                .post("/api/sessions/register")
                .send(incomplete)
                .expect(400);

            expect(res.body).to.have.property("status", "error");
            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.INVALID_INPUT_DATA.code);
        });

        it("debe rechazar con 400 INVALID_INPUT_DATA si la contraseña tiene menos de 6 caracteres", async () => {
            const shortPassword = {
                first_name: "Corto",
                last_name: "Pass",
                email: "corto@module6.test",
                password: "12345",
            };

            const res = await request(app)
                .post("/api/sessions/register")
                .send(shortPassword)
                .expect(400);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.INVALID_INPUT_DATA.code);
            expect(res.body.error.details).to.deep.include({ field: "password", min: 6 });
        });

        it("debe rechazar con 400 INVALID_INPUT_DATA si la contraseña supera los 72 bytes UTF-8 (límite bcrypt)", async () => {
            const longPassword = "A".repeat(73);

            const res = await request(app)
                .post("/api/sessions/register")
                .send({
                    first_name: "Exceso",
                    last_name: "Bcrypt",
                    email: "exceso@module6.test",
                    password: longPassword,
                })
                .expect(400);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.INVALID_INPUT_DATA.code);
            expect(res.body.error.details).to.deep.include({ field: "password", max: 72 });
        });
    });

    describe("POST /api/sessions/login y ciclo de sesión", () => {
        it("debe iniciar sesión con credenciales válidas y responder con la cookie HttpOnly currentUser", async () => {
            const res = await request(app)
                .post("/api/sessions/login")
                .send({
                    email: FIXTURE_EMAILS.CLIENT1,
                    password: DEFAULT_PASSWORD,
                })
                .expect(200);

            expect(res.body).to.have.property("status", "success");
            expect(res.body).to.have.property("message", "Login exitoso");

            const cookies = res.headers["set-cookie"];
            expect(cookies).to.be.an("array").that.is.not.empty;
            const authCookie = cookies.find((c) => c.startsWith("currentUser="));
            expect(authCookie).to.exist;
            expect(authCookie).to.include("HttpOnly");
        });

        it("debe rechazar con 401 INVALID_CREDENTIALS cuando la contraseña es incorrecta", async () => {
            const res = await request(app)
                .post("/api/sessions/login")
                .send({
                    email: FIXTURE_EMAILS.CLIENT1,
                    password: "ContraseñaErronea123",
                })
                .expect(401);

            expect(res.body).to.have.property("status", "error");
            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.INVALID_CREDENTIALS.code);
        });

        it("debe rechazar con 401 INVALID_CREDENTIALS cuando el email no existe", async () => {
            const res = await request(app)
                .post("/api/sessions/login")
                .send({
                    email: "inexistente@module6.test",
                    password: DEFAULT_PASSWORD,
                })
                .expect(401);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.INVALID_CREDENTIALS.code);
        });

        it("debe rechazar con 400 INVALID_INPUT_DATA cuando no se envían email o contraseña", async () => {
            const res = await request(app)
                .post("/api/sessions/login")
                .send({ email: "" })
                .expect(400);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.INVALID_INPUT_DATA.code);
        });

        it("GET /api/sessions/current debe responder con los datos del usuario autenticado mediante cookie", async () => {
            const agent = await getClient1Agent();

            const res = await agent.get("/api/sessions/current").expect(200);

            expect(res.body).to.have.property("status", "success");
            expect(res.body).to.have.property("payload").that.is.an("object");

            const { payload } = res.body;
            expect(payload).to.have.property("id", String(testUsers.client1._id));
            expect(payload).to.have.property("email", FIXTURE_EMAILS.CLIENT1);
            expect(payload).to.have.property("role", USER_ROLES.USER);
            expect(payload).to.have.property("first_name", "Cliente");
            expect(payload).to.have.property("last_name", "Uno");
            expect(payload).to.not.have.property("password");
        });

        it("GET /api/sessions/current debe rechazar con 401 AUTHENTICATION_REQUIRED si no hay cookie de sesión", async () => {
            const res = await getGuestAgent().get("/api/sessions/current").expect(401);

            expect(res.body).to.have.property("status", "error");
            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.AUTHENTICATION_REQUIRED.code);
        });

        it("POST /api/sessions/logout debe eliminar la cookie y revocar el acceso a /api/sessions/current", async () => {
            const agent = await getClient1Agent();

            // Verificar que la sesión está activa
            await agent.get("/api/sessions/current").expect(200);

            // Ejecutar logout
            const logoutRes = await agent.post("/api/sessions/logout").expect(200);
            expect(logoutRes.body).to.have.property("status", "success");
            expect(logoutRes.body).to.have.property("message", "Logout correcto");

            // La llamada posterior debe fallar con 401
            const nextRes = await agent.get("/api/sessions/current").expect(401);
            expect(nextRes.body.error).to.have.property("code", ERROR_DICTIONARY.AUTHENTICATION_REQUIRED.code);
        });
    });

    describe("GET /api/users - Listado y control de roles", () => {
        it("debe permitir al ADMIN listar todos los usuarios sanitizados sin passwords ni hashes", async () => {
            const adminAgent = await getAdminAgent();

            const res = await adminAgent.get("/api/users").expect(200);

            expect(res.body).to.have.property("status", "success");
            expect(res.body).to.have.property("payload").that.is.an("array");

            const users = res.body.payload;
            expect(users.length).to.be.at.least(5); // admin, client1, client2, driver1, driver2

            for (const u of users) {
                expect(u).to.have.property("id").that.is.a("string");
                expect(u).to.have.property("first_name").that.is.a("string");
                expect(u).to.have.property("last_name").that.is.a("string");
                expect(u).to.have.property("email").that.is.a("string");
                expect(u).to.have.property("role").that.is.oneOf([USER_ROLES.ADMIN, USER_ROLES.USER, USER_ROLES.DRIVER]);
                expect(u).to.not.have.property("password");
                expect(u).to.not.have.property("hash");
            }
        });

        it("debe rechazar con 403 INSUFFICIENT_PERMISSIONS si un CLIENTE intenta listar usuarios", async () => {
            const clientAgent = await getClient1Agent();

            const res = await clientAgent.get("/api/users").expect(403);

            expect(res.body).to.have.property("status", "error");
            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.INSUFFICIENT_PERMISSIONS.code);
        });

        it("debe rechazar con 401 AUTHENTICATION_REQUIRED si se intenta listar usuarios sin sesión", async () => {
            const res = await getGuestAgent().get("/api/users").expect(401);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.AUTHENTICATION_REQUIRED.code);
        });

        it("GET /api/users/:id debe devolver un usuario específico al ADMIN", async () => {
            const adminAgent = await getAdminAgent();

            const res = await adminAgent.get(`/api/users/${testUsers.client1._id}`).expect(200);

            expect(res.body).to.have.property("status", "success");
            expect(res.body.payload).to.have.property("id", String(testUsers.client1._id));
            expect(res.body.payload).to.have.property("email", FIXTURE_EMAILS.CLIENT1);
            expect(res.body.payload).to.not.have.property("password");
        });

        it("GET /api/users/:id debe rechazar con 400 INVALID_ID ante un ID malformado", async () => {
            const adminAgent = await getAdminAgent();

            const res = await adminAgent.get("/api/users/id-invalido-123").expect(400);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.INVALID_ID.code);
        });

        it("GET /api/users/:id debe rechazar con 404 USER_NOT_FOUND ante un ID válido pero inexistente", async () => {
            const adminAgent = await getAdminAgent();
            const nonExistentId = "507f1f77bcf86cd799439011";

            const res = await adminAgent.get(`/api/users/${nonExistentId}`).expect(404);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.USER_NOT_FOUND.code);
        });

        it("GET /api/users/:id debe rechazar con 403 INSUFFICIENT_PERMISSIONS si un CLIENTE intenta consultar a otro usuario", async () => {
            const clientAgent = await getClient1Agent();

            const res = await clientAgent.get(`/api/users/${testUsers.client2._id}`).expect(403);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.INSUFFICIENT_PERMISSIONS.code);
        });
    });
});
