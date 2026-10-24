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

test("Logística: pedidos, entregas, permisos y transiciones en base aislada", async t => {
    const temp = await mkdtemp(join(tmpdir(), "shipnow-module4-"));
    const dbName = `shipnow_test4_${randomUUID().replaceAll("-", "")}`;
    const uri = `mongodb://127.0.0.1:27017/${dbName}`;
    Object.assign(process.env, { NODE_ENV: "test", PORT: "3098", MONGODB_URI: uri,
        JWT_SECRET: "test-only-secret", LOG_DIR: temp, LOG_MAX_SIZE: "16384", LOG_MAX_FILES: "3" });
    const { default: app } = await import("../src/app.js");
    const { userModel } = await import("../src/models/user.model.js");
    const { orderModel } = await import("../src/models/order.model.js");
    const { deliveryModel } = await import("../src/models/delivery.model.js");
    const { productModel } = await import("../src/models/product.model.js");
    const { ordersRepository } = await import("../src/repositories/orders.repository.js");
    const { finishLogger } = await import("../src/config/logger.js");
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
    } finally {
        if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
        if (mongoose.connection.readyState === 1) { assert.equal(mongoose.connection.name, dbName); await mongoose.connection.dropDatabase(); }
        await mongoose.disconnect();
        await finishLogger();
        await rm(temp, { recursive: true, force: true });
    }
    process.stdout.write(`Verificaciones de logística: ${results.length}. Base temporal eliminada.\n`);
});
