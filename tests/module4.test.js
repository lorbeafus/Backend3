import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
const execute = promisify(execFile);

test("Módulo 4: logística, permisos, errores, logs y rotación en base aislada", async t => {
    const temp = await mkdtemp(join(tmpdir(), "shipnow-module4-"));
    const dbName = `shipnow_test4_${randomUUID().replaceAll("-", "")}`;
    const uri = `mongodb://127.0.0.1:27017/${dbName}`;
    Object.assign(process.env, { NODE_ENV: "test", PORT: "3098", MONGODB_URI: uri,
        JWT_SECRET: "test-only-secret", LOG_DIR: temp, LOG_MAX_SIZE: "16384", LOG_MAX_FILES: "3" });
    const { logger, finishLogger } = await import("../src/config/logger.js");
    const { default: app } = await import("../src/app.js");
    const { userModel } = await import("../src/models/user.model.js");
    const { orderModel } = await import("../src/models/order.model.js");
    const { deliveryModel } = await import("../src/models/delivery.model.js");
    const { productModel } = await import("../src/models/product.model.js");
    const { ordersRepository } = await import("../src/repositories/orders.repository.js");
    let server;
    const results = [];
    const check = (value, description) => { assert.ok(value, description); results.push(description); };
    try {
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
        assert.equal(mongoose.connection.name, dbName);
        await Promise.all([userModel.init(), orderModel.init(), deliveryModel.init(), productModel.init()]);
        const hash = await bcrypt.hash("Password123", 10);
        const makeUser = (role, email) => userModel.create({ first_name: "Test", last_name: "User", email, password: hash, role });
        const admin = await makeUser("admin", "admin@example.test");
        const client = await makeUser("user", "client@example.test");
        const other = await makeUser("user", "other@example.test");
        const driver = await makeUser("driver", "driver@example.test");
        const otherDriver = await makeUser("driver", "driver2@example.test");
        const product = await productModel.create({ name: "Caja", description: "Paquete", price: 12.34, stock: 20, status: "available" });
        const cookie = user => user ? `currentUser=${jwt.sign({ id: user.id }, process.env.JWT_SECRET)}` : "";
        server = app.listen(0, "127.0.0.1");
        await new Promise(resolve => server.once("listening", resolve));
        const base = `http://127.0.0.1:${server.address().port}`;
        const request = async (path, { actor = client, method = "GET", body } = {}) => {
            const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", Cookie: cookie(actor) },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
            return { status: response.status, data: await response.json() };
        };
        const orderBody = { items: [{ product: product.id, quantity: 2 }], shipping_address: { street: "Calle 1", city: "Test", zip_code: "1000" } };
        await t.test("Pedidos: creación, cálculo del servidor, validaciones y propiedad", async () => {
            let r = await request("/api/orders", { method: "POST", body: orderBody });
            check(r.status === 201 && r.data.payload.total_amount === 24.68, "pedido calculado desde productos");
            const id = r.data.payload._id; orderBody.id = id;
            check((await request(`/api/orders/${id}`, { actor: other })).status === 403, "cliente ajeno rechazado");
            check((await request(`/api/orders/${id}`, { actor: driver })).status === 403, "repartidor no asignado rechazado");
            check((await request("/api/orders", { actor: other })).data.payload.items.length === 0, "listado privado");
            const { id: _id, ...valid } = orderBody;
            for (const body of [{ ...valid, user: other.id }, { ...valid, total_amount: 1 }, { ...valid, items: [{ product: product.id, quantity: -1 }] },
                { ...valid, items: [{ product: product.id, quantity: 1.5 }] }, { ...valid, items: [valid.items[0], valid.items[0]] }, { ...valid, shipping_address: null }]) {
                check((await request("/api/orders", { method: "POST", body })).status >= 400, "entrada inválida rechazada");
            }
            check((await request("/api/orders?page=1&limit=2")).data.payload.limit === 2, "paginación");
            check((await request("/api/orders?limit=1&limit=2")).status === 400, "paginación repetida rechazada");
            check((await request("/api/orders", { actor: null })).status === 401, "autenticación requerida");
        });
        let deliveryId;
        await t.test("Entregas: asignación, avance, permisos y coherencia", async () => {
            const body = { order: orderBody.id, driver: driver.id, estimated_delivery_date: new Date(Date.now() + 86400000).toISOString() };
            check((await request("/api/deliveries", { method: "POST", body })).status === 403, "solo admin asigna");
            check((await request("/api/deliveries", { actor: admin, method: "POST", body: { ...body, driver: client.id } })).status === 400, "rol de repartidor válido");
            check((await request("/api/deliveries", { actor: admin, method: "POST", body: { ...body, estimated_delivery_date: "2030-02-31T12:00:00.000Z" } })).status === 400, "fecha de calendario inválida rechazada");
            const [a,b] = await Promise.all([request("/api/deliveries", { actor: admin, method: "POST", body }), request("/api/deliveries", { actor: admin, method: "POST", body: { ...body, order: body.order.toUpperCase() } })]);
            check([a.status,b.status].sort().join() === "201,409", "asignación concurrente única");
            deliveryId = (a.status === 201 ? a : b).data.payload._id;
            check((await request(`/api/deliveries/${deliveryId}`, { actor: other })).status === 403, "entrega privada");
            check((await request(`/api/deliveries/${deliveryId}/status`, { actor: otherDriver, method: "PATCH", body: { status: "in_progress" } })).status === 403, "repartidor ajeno rechazado");
            check((await request(`/api/deliveries/${deliveryId}/status`, { actor: driver, method: "PATCH", body: { status: "completed" } })).status === 409, "no saltar estados");
            check((await request(`/api/deliveries/${deliveryId}/status`, { actor: driver, method: "PATCH", body: { status: "in_progress" } })).status === 200, "inicio de reparto");
            check((await request(`/api/orders/${orderBody.id}`)).data.payload.status === "in_transit", "pedido sincronizado");
            check((await request(`/api/orders/${orderBody.id}/status`, { method: "PATCH", body: { status: "cancelled" } })).status === 409, "cliente no cancela en tránsito");
            check((await request(`/api/deliveries/${deliveryId}/status`, { actor: driver, method: "PATCH", body: { status: "completed" } })).data.payload.status === "completed", "entrega completada");
            check((await request(`/api/orders/${orderBody.id}`)).data.payload.status === "delivered", "pedido entregado");
            check((await request(`/api/deliveries/${deliveryId}/status`, { actor: driver, method: "PATCH", body: { status: "assigned" } })).status === 409, "sin retroceso");
            const {id: _id, ...fresh} = orderBody;
            const cancelled = await request("/api/orders", { method: "POST", body: fresh });
            check((await request(`/api/orders/${cancelled.data.payload._id}/status`, { method: "PATCH", body: { status: "cancelled" } })).status === 200, "cliente cancela pendiente");
            check((await request("/api/deliveries", { actor: admin, method: "POST", body: { ...body, order: cancelled.data.payload._id } })).status === 409, "no asignar cancelado");
            check(!JSON.stringify((await request("/api/deliveries", { actor: admin })).data).includes("password"), "sin hashes ni contraseñas");
        });
        await t.test("Logger y regresión: errores, mocks y seed", async () => {
            check((await request("/api/loggerTest", { actor: null })).status === 401, "logger sin sesión");
            check((await request("/api/loggerTest")).status === 403, "logger exclusivo admin");
            check((await request("/api/loggerTest", { actor: admin })).status === 200, "seis niveles emitidos");
            check((await request("/api/mocks/users?qty=-1")).data.error.code === "INVALID_MOCK_QUANTITY", "errores de mocks conservados");
            check((await request("/api/mocks/seed?qty=1", { actor: admin, method: "POST" })).status === 201, "seed funcional");
            check((await request("/api/products")).status === 200, "productos conservados");
            const original = ordersRepository.getById;
            ordersRepository.getById = async () => { throw Error("password=sensitive-marker mongodb://secret:pass@host/db"); };
            try {
                const r = await request(`/api/orders/${orderBody.id}`);
                check(r.status === 500 && !JSON.stringify(r).includes("sensitive-marker"), "500 genérico seguro");
            } finally { ordersRepository.getById = original; }
            check((await request("/api/orders/012345678901234567890123")).data.error.code === "ORDER_NOT_FOUND", "pedido inexistente controlado");
            check((await request("/ruta-inexistente")).status === 404, "404 uniforme");
            const productionDir = join(temp, "production");
            const program = `const {config}=await import('./src/config/index.js');const {logger,finishLogger}=await import('./src/config/logger.js');const {loggerService}=await import('./src/services/logger.service.js');logger.debug('hidden-debug');logger.http('hidden-http');logger.info('visible-info');try{loggerService.test();throw Error('not blocked')}catch(e){if(e.statusCode!==403)throw e;}await finishLogger();`;
            const child = await execute(process.execPath, ["--input-type=module", "-e", program], {
                cwd: process.cwd(), env: { ...process.env, NODE_ENV: "production", LOG_DIR: productionDir },
            });
            check(!child.stdout.includes("hidden-debug") && !child.stdout.includes("hidden-http") && child.stdout.includes("visible-info"), "umbrales de producción y endpoint bloqueado");
            for (const [name, overrides] of [["invalid-config", { PORT: "" }], ["invalid-database", { MONGODB_URI: "not-a-mongo-uri" }]]) {
                let failed;
                try {
                    await execute(process.execPath, ["src/server.js"], { cwd: process.cwd(),
                        env: { ...process.env, LOG_DIR: join(temp, name), ...overrides } });
                } catch (error) { failed = error; }
                check(failed?.code === 1 && failed.stdout.includes('"level":"fatal"'), "fallo de arranque fatal y salida no exitosa");
                const fatalFile = await readFile(join(temp, name, "error.log"), "utf8");
                check(fatalFile.includes('"level":"fatal"') && !fatalFile.includes("test-only-secret"), "fatal persistido sin secretos");
            }
            const rotationDir = join(temp, "rotation");
            const rotation = `await import('./src/config/index.js');const {logger,finishLogger}=await import('./src/config/logger.js');for(let i=0;i<100;i++){logger.error('rotate-'+i+' '+ 'x'.repeat(1000));await new Promise(r=>setTimeout(r,3));}await finishLogger();`;
            await execute(process.execPath, ["--input-type=module", "-e", rotation], { cwd: process.cwd(), maxBuffer: 1024 * 1024,
                env: { ...process.env, LOG_DIR: rotationDir, LOG_MAX_SIZE: "4096", LOG_MAX_FILES: "3" } });
            const rotated = (await readdir(rotationDir)).filter(f=>/^error.*\.log$/.test(f));
            check(rotated.length > 1 && rotated.length <= 3, "rotación real y retención acotada");
        });
    } finally {
        if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
        if (mongoose.connection.readyState === 1) { assert.equal(mongoose.connection.name, dbName); await mongoose.connection.dropDatabase(); }
        await mongoose.disconnect();
        await finishLogger();
    }
    try {
        const names = await readdir(temp);
        const readLogs = async prefix => (await Promise.all(names.filter(n => n.startsWith(prefix) && n.endsWith(".log")).map(n=>readFile(join(temp,n), "utf8")))).join("\n");
        const errors = await readLogs("error"), all = await readLogs("application");
        const records = errors.trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
        check(records.length > 0 && records.every(r=>["error","fatal"].includes(r.level)), "error.log solo error/fatal");
        check(records.every(r=>r.timestamp && r.message), "timestamp, nivel y mensaje");
        check(!all.includes("sensitive-marker") && !errors.includes("secret:pass"), "logs sin causa sensible");
        check(all.includes("order_created") && all.includes("delivery_status_changed") && all.includes("mock_seed_completed"), "eventos relevantes registrados");
        process.stdout.write(`Verificaciones funcionales: ${results.length}. Base temporal eliminada.\n`);
    } finally { await rm(temp, { recursive: true, force: true }); }
});
