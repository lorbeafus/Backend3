import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { openapiSpecification } from "../src/docs/openapi.js";

/**
 * Validador de esquemas OpenAPI 3.0.3 recursivo para pruebas de contrato.
 * Resuelve punteros $ref y comprueba tipos, propiedades requeridas,
 * arrays, objetos, enums, rangos y la regla nullable: true.
 */
function resolveSchema(schema) {
    if (!schema || typeof schema !== "object") return schema;
    if (schema["$ref"]) {
        const parts = schema["$ref"].replace("#/", "").split("/");
        let resolved = openapiSpecification;
        for (const p of parts) {
            resolved = resolved?.[p];
        }
        if (!resolved) throw new Error(`Referencia OpenAPI no resuelta: ${schema["$ref"]}`);
        return resolveSchema(resolved);
    }
    return schema;
}

function validateAgainstSchema(data, rawSchema, path = "root") {
    const schema = resolveSchema(rawSchema);
    if (!schema) return;

    if (schema.oneOf) {
        let matchCount = 0;
        for (const sub of schema.oneOf) {
            try {
                validateAgainstSchema(data, sub, path);
                matchCount++;
                break;
            } catch {
                // Siguiente alternativa
            }
        }
        if (matchCount === 0) {
            throw new Error(`Fallo oneOf en '${path}': el valor no coincide con ninguna de las opciones permitidas`);
        }
        return;
    }

    if (data === null) {
        if (schema.nullable === true) return;
        throw new Error(`Valor null no permitido en '${path}' (nullable: false o ausente)`);
    }

    if (data === undefined) {
        throw new Error(`Valor undefined en '${path}'`);
    }

    const expectedType = schema.type;
    if (!expectedType) return;

    if (expectedType === "object") {
        if (typeof data !== "object" || Array.isArray(data)) {
            throw new Error(`Se esperaba objeto en '${path}', pero se recibió '${typeof data}'`);
        }
        if (schema.required && Array.isArray(schema.required)) {
            for (const reqKey of schema.required) {
                if (data[reqKey] === undefined) {
                    throw new Error(`Propiedad requerida '${reqKey}' ausente en '${path}'`);
                }
            }
        }
        if (schema.properties) {
            for (const [key, propSchema] of Object.entries(schema.properties)) {
                if (data[key] !== undefined) {
                    validateAgainstSchema(data[key], propSchema, `${path}.${key}`);
                }
            }
        }
        if (schema.additionalProperties === false) {
            const allowed = new Set(Object.keys(schema.properties || {}));
            for (const key of Object.keys(data)) {
                if (!allowed.has(key)) {
                    throw new Error(`Propiedad no permitida '${key}' en '${path}'`);
                }
            }
        }
    } else if (expectedType === "array") {
        if (!Array.isArray(data)) {
            throw new Error(`Se esperaba array en '${path}', pero se recibió '${typeof data}'`);
        }
        if (schema.minItems !== undefined && data.length < schema.minItems) {
            throw new Error(`Array en '${path}' contiene ${data.length} ítems, requiere al menos ${schema.minItems}`);
        }
        if (schema.items) {
            data.forEach((elem, idx) => {
                validateAgainstSchema(elem, schema.items, `${path}[${idx}]`);
            });
        }
    } else if (expectedType === "string") {
        if (typeof data !== "string") {
            throw new Error(`Se esperaba string en '${path}', pero se recibió '${typeof data}'`);
        }
        if (schema.enum && !schema.enum.includes(data)) {
            throw new Error(`Valor '${data}' en '${path}' no pertenece al enum: ${schema.enum.join(", ")}`);
        }
        if (schema.pattern && !new RegExp(schema.pattern).test(data)) {
            throw new Error(`Valor '${data}' en '${path}' no cumple con el patrón '${schema.pattern}'`);
        }
    } else if (expectedType === "integer") {
        if (!Number.isInteger(data)) {
            throw new Error(`Se esperaba entero en '${path}', pero se recibió '${data}'`);
        }
        if (schema.minimum !== undefined && data < schema.minimum) {
            throw new Error(`Valor entero ${data} en '${path}' menor al mínimo permitido ${schema.minimum}`);
        }
        if (schema.maximum !== undefined && data > schema.maximum) {
            throw new Error(`Valor entero ${data} en '${path}' mayor al máximo permitido ${schema.maximum}`);
        }
    } else if (expectedType === "number") {
        if (typeof data !== "number" || !Number.isFinite(data)) {
            throw new Error(`Se esperaba número en '${path}', pero se recibió '${data}'`);
        }
        if (schema.minimum !== undefined && data < schema.minimum) {
            throw new Error(`Valor numérico ${data} en '${path}' menor al mínimo permitido ${schema.minimum}`);
        }
    } else if (expectedType === "boolean") {
        if (typeof data !== "boolean") {
            throw new Error(`Se esperaba booleano en '${path}', pero se recibió '${typeof data}'`);
        }
    }
}

test("Documentación OpenAPI y Swagger UI (Módulo 5)", async (t) => {
    await t.test("Validación estructural y referencias $ref de la especificación OpenAPI", () => {
        assert.equal(openapiSpecification.openapi, "3.0.3");
        assert.equal(openapiSpecification.info.title, "ShipNow API");
        assert.equal(openapiSpecification.info.version, "1.0.0");
        assert.ok(openapiSpecification.servers?.length > 0);
        assert.equal(openapiSpecification.servers[0].url, "/");

        const tags = openapiSpecification.tags.map((t) => t.name);
        const requiredTags = ["Users", "Orders", "Deliveries", "Mocks", "Logger", "Sessions", "Products", "Health"];
        for (const tag of requiredTags) {
            assert.ok(tags.includes(tag), `Tag '${tag}' debe estar presente`);
        }

        const schemas = openapiSpecification.components.schemas;
        const requiredSchemas = [
            "User",
            "Order",
            "MockOrder",
            "Delivery",
            "OrderItem",
            "OrderItemBase",
            "MockOrderItem",
            "OrderItemInput",
            "Product",
            "ErrorResponse",
        ];
        for (const schemaName of requiredSchemas) {
            assert.ok(schemas[schemaName], `Schema '${schemaName}' debe estar en components.schemas`);
        }

        // Validar que OrderItem tenga product nullable: true
        assert.equal(
            schemas.OrderItem.properties.product.nullable,
            true,
            "OrderItem.properties.product debe ser nullable: true para pedidos sembrados"
        );

        // Validar que OrderItemInput tenga product obligatorio no nullable
        assert.ok(
            schemas.OrderItemInput.required.includes("product"),
            "OrderItemInput debe exigir 'product' como obligatorio"
        );
        assert.equal(
            schemas.OrderItemInput.properties.product.nullable,
            undefined,
            "OrderItemInput no debe permitir product null al crear un pedido real"
        );

        // Validar que MockOrderItem no exija 'product'
        assert.ok(
            !schemas.MockOrderItem.required.includes("product"),
            "MockOrderItem no debe exigir 'product' en memoria"
        );

        // Validar que todas las operaciones de negocio tengan documentada respuesta 500
        for (const [pathUrl, methods] of Object.entries(openapiSpecification.paths)) {
            for (const [method, op] of Object.entries(methods)) {
                if (typeof op === "object" && op.responses) {
                    assert.ok(
                        op.responses["500"],
                        `Operación '${method.toUpperCase()} ${pathUrl}' debe documentar respuesta 500`
                    );
                }
            }
        }

        // Validar que todos los $ref resuelvan
        const refs = [];
        function findRefs(obj, path = "") {
            if (!obj || typeof obj !== "object") return;
            if (obj["$ref"]) refs.push({ ref: obj["$ref"], from: path });
            for (const [k, v] of Object.entries(obj)) {
                findRefs(v, path ? path + "." + k : k);
            }
        }
        findRefs(openapiSpecification);
        assert.ok(refs.length >= 100, "Debe haber múltiples $ref reutilizados");

        for (const { ref, from } of refs) {
            assert.ok(ref.startsWith("#/"), `Referencia no local: ${ref} en ${from}`);
            const parts = ref.replace("#/", "").split("/");
            let cur = openapiSpecification;
            for (const part of parts) {
                cur = cur?.[part];
            }
            assert.notEqual(cur, undefined, `Referencia rota: ${ref} en ${from}`);
        }
    });

    await t.test("Servicio HTTP: Swagger UI, openapi.json, autenticación y contrastes reales", async (t) => {
        const temp = await mkdtemp(join(tmpdir(), "shipnow-docs-"));
        const dbName = `shipnow_test_docs_${randomUUID().replaceAll("-", "")}`;
        const uri = `mongodb://127.0.0.1:27017/${dbName}`;

        Object.assign(process.env, {
            NODE_ENV: "test",
            PORT: "3099",
            MONGODB_URI: uri,
            JWT_SECRET: "docs-test-secret-12345",
            LOG_DIR: temp,
            LOG_MAX_SIZE: "16384",
            LOG_MAX_FILES: "3",
        });

        const { default: app } = await import("../src/app.js");
        const { userModel } = await import("../src/models/user.model.js");
        const { productModel } = await import("../src/models/product.model.js");
        const { orderModel } = await import("../src/models/order.model.js");
        const { deliveryModel } = await import("../src/models/delivery.model.js");
        const { finishLogger } = await import("../src/config/logger.js");

        let server;
        try {
            await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
            await Promise.all([userModel.init(), productModel.init(), orderModel.init(), deliveryModel.init()]);

            const passwordHash = await bcrypt.hash("Password123", 10);
            const admin = await userModel.create({
                first_name: "Admin",
                last_name: "Test",
                email: "admin@docs.test",
                password: passwordHash,
                role: "admin",
            });
            const client = await userModel.create({
                first_name: "Client",
                last_name: "Test",
                email: "client@docs.test",
                password: passwordHash,
                role: "user",
            });
            const driver = await userModel.create({
                first_name: "Driver",
                last_name: "Test",
                email: "driver@docs.test",
                password: passwordHash,
                role: "driver",
            });
            const product = await productModel.create({
                name: "Caja Cartón",
                description: "Caja resistente",
                price: 10.5,
                stock: 20,
                status: "available",
            });

            server = app.listen(0, "127.0.0.1");
            await new Promise((resolve) => server.once("listening", resolve));
            const base = `http://127.0.0.1:${server.address().port}`;

            await t.test("GET /api/docs/openapi.json sirve el documento exacto", async () => {
                const res = await fetch(`${base}/api/docs/openapi.json`);
                assert.equal(res.status, 200);
                assert.ok(res.headers.get("content-type").includes("application/json"));
                const data = await res.json();
                assert.equal(data.openapi, "3.0.3");
                assert.equal(data.info.title, "ShipNow API");
            });

            await t.test("GET /api/docs/ sirve Swagger UI en HTML", async () => {
                const res = await fetch(`${base}/api/docs/`);
                assert.equal(res.status, 200);
                const html = await res.text();
                assert.ok(html.includes("swagger-ui"), "Debe contener elementos de Swagger UI");
            });

            let adminCookie;
            await t.test("Flujo de login con cookie y contraste con esquema CurrentUser", async () => {
                const loginRes = await fetch(`${base}/api/sessions/login`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: "admin@docs.test", password: "Password123" }),
                });
                assert.equal(loginRes.status, 200);
                const setCookie = loginRes.headers.get("set-cookie");
                assert.ok(setCookie?.includes("currentUser="));
                adminCookie = setCookie.split(";")[0];

                const currentRes = await fetch(`${base}/api/sessions/current`, {
                    headers: { Cookie: adminCookie },
                });
                assert.equal(currentRes.status, 200);
                const currentData = await currentRes.json();
                validateAgainstSchema(currentData, openapiSpecification.components.schemas.SessionCurrentResponse);
                assert.equal(currentData.status, "success");
                assert.equal(currentData.payload.email, "admin@docs.test");
                assert.equal(currentData.payload.role, "admin");
                assert.equal(currentData.payload.password, undefined);
            });

            await t.test("Contraste de ruta pública: GET /api/products contra ProductsListResponse", async () => {
                const res = await fetch(`${base}/api/products`);
                assert.equal(res.status, 200);
                const data = await res.json();
                validateAgainstSchema(data, openapiSpecification.components.schemas.ProductsListResponse);
                assert.equal(data.status, "success");
                assert.ok(Array.isArray(data.payload));
                assert.equal(data.payload[0].name, "Caja Cartón");
                assert.equal(data.payload[0].status, "available");
            });

            // -------------------------------------------------------------
            // PRUEBAS DE CONTRATO ESPECÍFICAS (Revisión Módulo 5)
            // -------------------------------------------------------------
            await t.test(
                "Contrato de Mocks en memoria: GET /api/mocks/orders valida ítems sin campo 'product'",
                async () => {
                    const res = await fetch(`${base}/api/mocks/orders?qty=2`);
                    assert.equal(res.status, 200);
                    const data = await res.json();

                    // Validación estricta del contrato contra MockOrdersResponse
                    validateAgainstSchema(data, openapiSpecification.components.schemas.MockOrdersResponse);

                    assert.equal(data.status, "success");
                    assert.equal(data.count, 2);
                    assert.equal(data.payload.orders.length, 2);

                    for (const mockOrder of data.payload.orders) {
                        assert.ok(mockOrder.items.length > 0);
                        for (const item of mockOrder.items) {
                            assert.ok(item.product_name, "El ítem debe tener product_name");
                            assert.ok(item.quantity >= 1, "La cantidad debe ser >= 1");
                            assert.ok(item.price >= 0, "El precio debe ser >= 0");
                            // En memoria, el mock NUNCA incluye la propiedad product
                            assert.equal(
                                item.product,
                                undefined,
                                "El ítem en memoria debe omitir el campo 'product'"
                            );
                        }
                    }
                }
            );

            await t.test(
                "Contrato de Mocks en memoria: GET /api/mocks/deliveries valida related_orders con ítems sin 'product'",
                async () => {
                    const res = await fetch(`${base}/api/mocks/deliveries?qty=2`);
                    assert.equal(res.status, 200);
                    const data = await res.json();

                    // Validación del contrato contra MockDeliveriesResponse
                    validateAgainstSchema(data, openapiSpecification.components.schemas.MockDeliveriesResponse);

                    assert.equal(data.status, "success");
                    assert.equal(data.count, 2);
                    assert.equal(data.payload.related_orders.length, 2);

                    for (const relOrder of data.payload.related_orders) {
                        assert.ok(relOrder.items.length > 0);
                        for (const item of relOrder.items) {
                            assert.equal(
                                item.product,
                                undefined,
                                "Los pedidos relacionados en entregas simuladas deben omitir 'product'"
                            );
                        }
                    }
                }
            );

            await t.test(
                "Contrato de Seed y persistencia: Pedido sembrado en MongoDB tiene 'product: null' y valida OrderItem",
                async () => {
                    // Ejecutar carga controlada seed con 1 entidad
                    const seedRes = await fetch(`${base}/api/mocks/seed?qty=1`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Cookie: adminCookie },
                    });
                    assert.equal(seedRes.status, 201);
                    const seedData = await seedRes.json();
                    validateAgainstSchema(seedData, openapiSpecification.components.schemas.MockSeedResponse);

                    // Consultar los pedidos reales de MongoDB mediante GET /api/orders
                    const ordersRes = await fetch(`${base}/api/orders?page=1&limit=20`, {
                        headers: { Cookie: adminCookie },
                    });
                    assert.equal(ordersRes.status, 200);
                    const ordersData = await ordersRes.json();

                    // Validar contra OrdersPaginatedResponse
                    validateAgainstSchema(ordersData, openapiSpecification.components.schemas.OrdersPaginatedResponse);

                    // Encontrar el pedido sembrado
                    const seededOrder = ordersData.payload.items.find((o) =>
                        o.items.some((it) => it.product === null)
                    );
                    assert.ok(seededOrder, "Debe existir al menos un pedido sembrado con 'product: null'");
                    assert.equal(
                        seededOrder.items[0].product,
                        null,
                        "El pedido sembrado en MongoDB debe devolver 'product: null'"
                    );
                    // Verificación explícita de Order.user como objeto poblado en listado
                    assert.equal(typeof seededOrder.user, "object", "El listado debe devolver Order.user como objeto poblado");
                    assert.ok(seededOrder.user._id, "Order.user poblado debe tener '_id'");
                    assert.ok(seededOrder.user.first_name, "Order.user poblado debe tener 'first_name'");
                    assert.ok(seededOrder.user.last_name, "Order.user poblado debe tener 'last_name'");
                    assert.ok(seededOrder.user.role, "Order.user poblado debe tener 'role'");
                }
            );

            await t.test(
                "Contrato de Pedido Real: Creado desde catálogo contiene 'product' como string ObjectId",
                async () => {
                    const clientCookie = `currentUser=${jwt.sign({ id: client.id }, process.env.JWT_SECRET)}`;
                    const createRes = await fetch(`${base}/api/orders`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Cookie: clientCookie },
                        body: JSON.stringify({
                            items: [{ product: product.id, quantity: 2 }],
                            shipping_address: { street: "Calle Falsa 123", city: "Buenos Aires", zip_code: "1000" },
                        }),
                    });
                    assert.equal(createRes.status, 201);
                    const createData = await createRes.json();

                    // Validar contra OrderSingleResponse
                    validateAgainstSchema(createData, openapiSpecification.components.schemas.OrderSingleResponse);

                    const realOrder = createData.payload;
                    assert.equal(typeof realOrder.items[0].product, "string");
                    assert.equal(realOrder.items[0].product, product.id);
                    assert.equal(realOrder.total_amount, 21); // 10.5 * 2

                    // Verificación explícita de Order.user como ID sin expandir en creación
                    assert.equal(typeof realOrder.user, "string", "La creación debe devolver Order.user como string ID");
                    assert.equal(realOrder.user, client.id);

                    // Verificación de consulta individual GET /api/orders/:id sin expandir
                    const getRes = await fetch(`${base}/api/orders/${realOrder._id}`, {
                        headers: { Cookie: clientCookie },
                    });
                    assert.equal(getRes.status, 200);
                    const getData = await getRes.json();
                    validateAgainstSchema(getData, openapiSpecification.components.schemas.OrderSingleResponse);
                    assert.equal(typeof getData.payload.user, "string", "GET /api/orders/:id debe devolver Order.user como string ID");
                    assert.equal(getData.payload.user, client.id);
                }
            );

            await t.test("Contraste de error en mocks: cantidad inválida contra ErrorResponse", async () => {
                const res = await fetch(`${base}/api/mocks/users?qty=-5`);
                assert.equal(res.status, 400);
                const data = await res.json();
                validateAgainstSchema(data, openapiSpecification.components.schemas.ErrorResponse);
                assert.equal(data.status, "error");
                assert.equal(data.statusCode, 400);
                assert.equal(data.error.code, "INVALID_MOCK_QUANTITY");
                assert.equal(data.error.details.field, "qty");
            });

            await t.test("Contraste de error de logística: permisos y transición no permitida", async () => {
                const clientCookie = `currentUser=${jwt.sign({ id: client.id }, process.env.JWT_SECRET)}`;
                const driverCookie = `currentUser=${jwt.sign({ id: driver.id }, process.env.JWT_SECRET)}`;

                // Crear pedido con cliente
                const orderRes = await fetch(`${base}/api/orders`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Cookie: clientCookie },
                    body: JSON.stringify({
                        items: [{ product: product.id, quantity: 2 }],
                        shipping_address: { street: "Calle 1", city: "Ciudad", zip_code: "1000" },
                    }),
                });
                assert.equal(orderRes.status, 201);
                const order = (await orderRes.json()).payload;

                // Cliente intenta crear entrega -> 403 Forbidden
                const forbiddenRes = await fetch(`${base}/api/deliveries`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Cookie: clientCookie },
                    body: JSON.stringify({
                        order: order._id,
                        driver: driver.id,
                        estimated_delivery_date: new Date(Date.now() + 86400000).toISOString(),
                    }),
                });
                assert.equal(forbiddenRes.status, 403);
                const forbiddenData = await forbiddenRes.json();
                validateAgainstSchema(forbiddenData, openapiSpecification.components.schemas.ErrorResponse);
                assert.equal(forbiddenData.error.code, "INSUFFICIENT_PERMISSIONS");

                // Admin crea entrega
                const adminDelivRes = await fetch(`${base}/api/deliveries`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Cookie: adminCookie },
                    body: JSON.stringify({
                        order: order._id,
                        driver: driver.id,
                        estimated_delivery_date: new Date(Date.now() + 86400000).toISOString(),
                    }),
                });
                assert.equal(adminDelivRes.status, 201);
                const delivery = (await adminDelivRes.json()).payload;
                assert.equal(delivery.status, "assigned");

                // Conductor intenta saltar de assigned a completed -> 409 DOMAIN_CONFLICT
                const conflictRes = await fetch(`${base}/api/deliveries/${delivery._id}/status`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json", Cookie: driverCookie },
                    body: JSON.stringify({ status: "completed" }),
                });
                assert.equal(conflictRes.status, 409);
                const conflictData = await conflictRes.json();
                validateAgainstSchema(conflictData, openapiSpecification.components.schemas.ErrorResponse);
                assert.equal(conflictData.error.code, "DOMAIN_CONFLICT");
                assert.equal(conflictData.error.message, "Transición de entrega no permitida");
            });

            await t.test("Endpoint de validación de Logger: GET /api/loggerTest", async () => {
                const res = await fetch(`${base}/api/loggerTest`, {
                    headers: { Cookie: adminCookie },
                });
                assert.equal(res.status, 200);
                const data = await res.json();
                validateAgainstSchema(data, openapiSpecification.components.schemas.LoggerTestResponse);
                assert.equal(data.status, "success");
                assert.equal(data.payload.simulated, true);
                assert.ok(data.payload.levels.includes("fatal"));
                assert.ok(data.payload.message.includes("fatal simulado no detiene"));
            });
        } finally {
            if (server) {
                server.closeAllConnections();
                await new Promise((resolve) => server.close(resolve));
            }
            if (mongoose.connection.readyState === 1) {
                await mongoose.connection.dropDatabase();
            }
            await mongoose.disconnect();
            await finishLogger();
            await rm(temp, { recursive: true, force: true });
        }
    });
});
