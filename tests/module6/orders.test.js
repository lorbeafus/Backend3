import { expect } from "chai";
import {
    seedBaseFixtures,
    clearOrdersAndDeliveries,
    testUsers,
    testProducts,
    getClient1Agent,
    getClient2Agent,
    getAdminAgent,
    getDriver1Agent,
    getGuestAgent,
} from "./fixtures.js";
import { orderModel } from "../../src/models/order.model.js";
import { ERROR_DICTIONARY, ORDER_STATUS, ORDER_PRIORITY } from "../../src/constants/index.js";

describe("Módulo 6 - Pedidos (Orders)", () => {
    beforeEach(async () => {
        await seedBaseFixtures();
        await clearOrdersAndDeliveries();
    });

    describe("POST /api/orders - Creación de pedidos", () => {
        it("debe crear un pedido válido como CLIENTE con total y precios calculados exclusivamente por el servidor", async () => {
            const client1Agent = await getClient1Agent();

            const orderPayload = {
                items: [
                    {
                        product: String(testProducts.box._id),
                        quantity: 3,
                    },
                    {
                        product: String(testProducts.tape._id),
                        quantity: 2,
                    },
                ],
                shipping_address: {
                    street: "Av. Corrientes 1234",
                    city: "CABA",
                    zip_code: "C1043",
                },
                priority: ORDER_PRIORITY.HIGH,
            };

            const res = await client1Agent
                .post("/api/orders")
                .send(orderPayload)
                .expect(201);

            expect(res.body).to.have.property("status", "success");
            expect(res.body).to.have.property("payload").that.is.an("object");

            const order = res.body.payload;
            expect(order).to.have.property("_id").that.is.a("string");
            expect(order).to.have.property("order_number").that.match(/^ORD-[0-9a-fA-F-]+$/);
            expect(order).to.have.property("user", String(testUsers.client1._id));
            expect(order).to.have.property("status", ORDER_STATUS.PENDING);
            expect(order).to.have.property("priority", ORDER_PRIORITY.HIGH);

            // Precios calculados desde el catálogo:
            // box: 12.50 * 3 = 37.50
            // tape: 3.20 * 2 = 6.40
            // total: 43.90
            const expectedTotal = 12.5 * 3 + 3.2 * 2;
            expect(order).to.have.property("total_amount", expectedTotal);

            // Validación de ítems
            expect(order.items).to.be.an("array").with.lengthOf(2);
            expect(order.items[0]).to.deep.include({
                product: String(testProducts.box._id),
                product_name: testProducts.box.name,
                price: 12.5,
                quantity: 3,
            });
            expect(order.items[1]).to.deep.include({
                product: String(testProducts.tape._id),
                product_name: testProducts.tape.name,
                price: 3.2,
                quantity: 2,
            });
        });

        it("debe rechazar si el cliente intenta inyectar campos no permitidos como precio o total (strictBody)", async () => {
            const client1Agent = await getClient1Agent();

            const forbiddenBody = {
                items: [
                    {
                        product: String(testProducts.box._id),
                        quantity: 1,
                        price: 1.0, // Campo no permitido en el ítem de entrada
                    },
                ],
                shipping_address: {
                    street: "Calle 1",
                    city: "La Plata",
                    zip_code: "1900",
                },
                total_amount: 1.0, // Campo no permitido en el body principal
            };

            const res = await client1Agent
                .post("/api/orders")
                .send(forbiddenBody)
                .expect(400);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.INVALID_INPUT_DATA.code);
        });

        it("debe rechazar con 400 INVALID_INPUT_DATA si se omite el campo 'items' y no persistir el pedido", async () => {
            const client1Agent = await getClient1Agent();
            const countBefore = await orderModel.countDocuments();

            const res = await client1Agent
                .post("/api/orders")
                .send({
                    shipping_address: {
                        street: "Av. Corrientes 1234",
                        city: "CABA",
                        zip_code: "C1043",
                    },
                })
                .expect(400);

            expect(res.body).to.deep.include({
                status: "error",
                statusCode: 400,
                message: "El pedido requiere entre 1 y 50 ítems",
            });
            expect(res.body).to.have.property("error").that.is.an("object");
            expect(res.body.error).to.deep.include({
                code: ERROR_DICTIONARY.INVALID_INPUT_DATA.code,
                message: "El pedido requiere entre 1 y 50 ítems",
            });
            expect(res.body.error).to.have.property("details");

            const countAfter = await orderModel.countDocuments();
            expect(countAfter).to.equal(countBefore);
            expect(countAfter).to.equal(0);
        });

        it("debe rechazar con 400 INVALID_INPUT_DATA si el array 'items' está vacío y no persistir el pedido", async () => {
            const client1Agent = await getClient1Agent();
            const countBefore = await orderModel.countDocuments();

            const res = await client1Agent
                .post("/api/orders")
                .send({
                    items: [],
                    shipping_address: {
                        street: "Av. Corrientes 1234",
                        city: "CABA",
                        zip_code: "C1043",
                    },
                })
                .expect(400);

            expect(res.body).to.deep.include({
                status: "error",
                statusCode: 400,
                message: "El pedido requiere entre 1 y 50 ítems",
            });
            expect(res.body).to.have.property("error").that.is.an("object");
            expect(res.body.error).to.deep.include({
                code: ERROR_DICTIONARY.INVALID_INPUT_DATA.code,
                message: "El pedido requiere entre 1 y 50 ítems",
            });
            expect(res.body.error).to.have.property("details");

            const countAfter = await orderModel.countDocuments();
            expect(countAfter).to.equal(countBefore);
            expect(countAfter).to.equal(0);
        });

        it("debe rechazar con 400 INVALID_JSON_BODY si se omite el campo 'shipping_address' y no persistir el pedido", async () => {
            const client1Agent = await getClient1Agent();
            const countBefore = await orderModel.countDocuments();

            const res = await client1Agent
                .post("/api/orders")
                .send({
                    items: [
                        {
                            product: String(testProducts.box._id),
                            quantity: 2,
                        },
                    ],
                })
                .expect(400);

            expect(res.body).to.deep.include({
                status: "error",
                statusCode: 400,
                message: "El cuerpo de la petición debe ser un objeto JSON",
            });
            expect(res.body).to.have.property("error").that.is.an("object");
            expect(res.body.error).to.deep.include({
                code: ERROR_DICTIONARY.INVALID_JSON_BODY.code,
                message: "El cuerpo de la petición debe ser un objeto JSON",
            });
            expect(res.body.error).to.have.property("details");

            const countAfter = await orderModel.countDocuments();
            expect(countAfter).to.equal(countBefore);
            expect(countAfter).to.equal(0);
        });

        it("debe rechazar si las cantidades son menores a 1, decimales o superan 1000", async () => {
            const client1Agent = await getClient1Agent();

            const invalidQuantities = [-1, 0, 1.5, 1001];

            for (const qty of invalidQuantities) {
                const res = await client1Agent
                    .post("/api/orders")
                    .send({
                        items: [{ product: String(testProducts.box._id), quantity: qty }],
                        shipping_address: { street: "Calle 1", city: "CABA", zip_code: "1000" },
                    })
                    .expect(400);

                expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.INVALID_INPUT_DATA.code);
            }
        });

        it("debe rechazar con 404 PRODUCT_NOT_FOUND si un producto no existe en el catálogo", async () => {
            const client1Agent = await getClient1Agent();
            const nonExistentProductId = "507f1f77bcf86cd799439011";

            const res = await client1Agent
                .post("/api/orders")
                .send({
                    items: [{ product: nonExistentProductId, quantity: 1 }],
                    shipping_address: { street: "Calle 1", city: "CABA", zip_code: "1000" },
                })
                .expect(404);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.PRODUCT_NOT_FOUND.code);
        });

        it("debe rechazar con 409 DOMAIN_CONFLICT si un producto no tiene stock suficiente", async () => {
            const client1Agent = await getClient1Agent();

            // testProducts.outOfStock tiene stock: 0
            const res = await client1Agent
                .post("/api/orders")
                .send({
                    items: [{ product: String(testProducts.outOfStock._id), quantity: 1 }],
                    shipping_address: { street: "Calle 1", city: "CABA", zip_code: "1000" },
                })
                .expect(409);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.DOMAIN_CONFLICT.code);
            expect(res.body.error.message).to.include("disponibilidad");
        });

        it("debe rechazar con 403 INSUFFICIENT_PERMISSIONS si un DRIVER intenta crear un pedido", async () => {
            const driverAgent = await getDriver1Agent();

            const res = await driverAgent
                .post("/api/orders")
                .send({
                    items: [{ product: String(testProducts.box._id), quantity: 1 }],
                    shipping_address: { street: "Calle 1", city: "CABA", zip_code: "1000" },
                })
                .expect(403);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.INSUFFICIENT_PERMISSIONS.code);
        });

        it("debe rechazar con 403 INSUFFICIENT_PERMISSIONS si un CLIENTE intenta enviar el campo 'user'", async () => {
            const client1Agent = await getClient1Agent();

            const res = await client1Agent
                .post("/api/orders")
                .send({
                    user: String(testUsers.client2._id),
                    items: [{ product: String(testProducts.box._id), quantity: 1 }],
                    shipping_address: { street: "Calle 1", city: "CABA", zip_code: "1000" },
                })
                .expect(403);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.INSUFFICIENT_PERMISSIONS.code);
        });

        it("debe permitir al ADMIN crear un pedido asignando explícitamente el usuario cliente", async () => {
            const adminAgent = await getAdminAgent();

            const res = await adminAgent
                .post("/api/orders")
                .send({
                    user: String(testUsers.client2._id),
                    items: [{ product: String(testProducts.box._id), quantity: 1 }],
                    shipping_address: { street: "Av. Siempre Viva 742", city: "Springfield", zip_code: "9999" },
                })
                .expect(201);

            expect(res.body.payload).to.have.property("user", String(testUsers.client2._id));
        });
    });

    describe("GET /api/orders y GET /api/orders/:id - Consulta y privacidad", () => {
        let orderClient1;
        let orderClient2;

        beforeEach(async () => {
            // Crear pedidos directamente en MongoDB para pruebas de consulta
            orderClient1 = await orderModel.create({
                user: testUsers.client1._id,
                order_number: "ORD-TEST-1111",
                items: [
                    {
                        product: testProducts.box._id,
                        product_name: testProducts.box.name,
                        price: 12.5,
                        quantity: 2,
                    },
                ],
                total_amount: 25.0,
                status: ORDER_STATUS.PENDING,
                priority: ORDER_PRIORITY.MEDIUM,
                shipping_address: { street: "Calle 1", city: "CABA", zip_code: "1000" },
            });

            orderClient2 = await orderModel.create({
                user: testUsers.client2._id,
                order_number: "ORD-TEST-2222",
                items: [
                    {
                        product: testProducts.tape._id,
                        product_name: testProducts.tape.name,
                        price: 3.2,
                        quantity: 1,
                    },
                ],
                total_amount: 3.2,
                status: ORDER_STATUS.PENDING,
                priority: ORDER_PRIORITY.LOW,
                shipping_address: { street: "Calle 2", city: "Rosario", zip_code: "2000" },
            });
        });

        it("GET /api/orders debe responder con estructura paginada { items, page, limit } y filtrar pedidos propios para un CLIENTE", async () => {
            const client1Agent = await getClient1Agent();

            const res = await client1Agent.get("/api/orders?page=1&limit=10").expect(200);

            expect(res.body).to.have.property("status", "success");
            expect(res.body).to.have.property("payload").that.is.an("object");

            const { items, page, limit } = res.body.payload;
            expect(page).to.equal(1);
            expect(limit).to.equal(10);
            expect(items).to.be.an("array").with.lengthOf(1);
            expect(items[0]).to.have.property("_id", String(orderClient1._id));
        });

        it("GET /api/orders como ADMIN debe listar todos los pedidos con datos del usuario poblados como objeto", async () => {
            const adminAgent = await getAdminAgent();

            const res = await adminAgent.get("/api/orders?page=1&limit=10").expect(200);

            const { items } = res.body.payload;
            expect(items.length).to.be.at.least(2);

            for (const item of items) {
                expect(item).to.have.property("user").that.is.an("object");
                expect(item.user).to.have.property("_id").that.is.a("string");
                expect(item.user).to.have.property("first_name").that.is.a("string");
                expect(item.user).to.have.property("last_name").that.is.a("string");
                expect(item.user).to.have.property("role").that.is.a("string");
            }
        });

        it("GET /api/orders sin sesión debe responder 401 AUTHENTICATION_REQUIRED", async () => {
            const res = await getGuestAgent().get("/api/orders").expect(401);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.AUTHENTICATION_REQUIRED.code);
        });

        it("GET /api/orders/:id debe permitir consultar el pedido a su propietario", async () => {
            const client1Agent = await getClient1Agent();

            const res = await client1Agent.get(`/api/orders/${orderClient1._id}`).expect(200);

            expect(res.body.payload).to.have.property("_id", String(orderClient1._id));
            expect(res.body.payload).to.have.property("total_amount", 25.0);
        });

        it("GET /api/orders/:id debe rechazar con 403 INSUFFICIENT_PERMISSIONS si un CLIENTE intenta consultar un pedido ajeno", async () => {
            const client1Agent = await getClient1Agent();

            // Intenta consultar pedido de client2
            const res = await client1Agent.get(`/api/orders/${orderClient2._id}`).expect(403);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.INSUFFICIENT_PERMISSIONS.code);
        });

        it("GET /api/orders/:id debe rechazar con 400 INVALID_ID ante un ID malformado", async () => {
            const client1Agent = await getClient1Agent();

            const res = await client1Agent.get("/api/orders/no-es-un-id-valido").expect(400);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.INVALID_ID.code);
        });

        it("GET /api/orders/:id debe rechazar con 404 ORDER_NOT_FOUND ante un ID de 24 hex inexistente", async () => {
            const adminAgent = await getAdminAgent();
            const nonExistentOrderId = "507f1f77bcf86cd799439011";

            const res = await adminAgent.get(`/api/orders/${nonExistentOrderId}`).expect(404);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.ORDER_NOT_FOUND.code);
        });
    });

    describe("PATCH /api/orders/:id/status - Cancelación de pedidos", () => {
        let orderToCancel;

        beforeEach(async () => {
            orderToCancel = await orderModel.create({
                user: testUsers.client1._id,
                order_number: "ORD-CANCEL-1",
                items: [
                    {
                        product: testProducts.box._id,
                        product_name: testProducts.box.name,
                        price: 12.5,
                        quantity: 1,
                    },
                ],
                total_amount: 12.5,
                status: ORDER_STATUS.PENDING,
                priority: ORDER_PRIORITY.MEDIUM,
                shipping_address: { street: "Calle 1", city: "CABA", zip_code: "1000" },
            });
        });

        it("debe permitir al propietario CLIENTE cancelar su pedido en estado pending", async () => {
            const client1Agent = await getClient1Agent();

            const res = await client1Agent
                .patch(`/api/orders/${orderToCancel._id}/status`)
                .send({ status: ORDER_STATUS.CANCELLED })
                .expect(200);

            expect(res.body.payload).to.have.property("status", ORDER_STATUS.CANCELLED);

            // Verificar en base de datos
            const updated = await orderModel.findById(orderToCancel._id);
            expect(updated.status).to.equal(ORDER_STATUS.CANCELLED);
        });

        it("debe rechazar con 400 INVALID_DOMAIN_STATE si se intenta enviar un estado distinto de cancelled", async () => {
            const client1Agent = await getClient1Agent();

            const res = await client1Agent
                .patch(`/api/orders/${orderToCancel._id}/status`)
                .send({ status: ORDER_STATUS.DELIVERED })
                .expect(400);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.INVALID_DOMAIN_STATE.code);
            expect(res.body.error.message).to.include("Esta ruta solo permite cancelar");
        });

        it("debe rechazar con 403 INSUFFICIENT_PERMISSIONS si otro cliente intenta cancelar un pedido ajeno", async () => {
            const client2Agent = await getClient2Agent();

            const res = await client2Agent
                .patch(`/api/orders/${orderToCancel._id}/status`)
                .send({ status: ORDER_STATUS.CANCELLED })
                .expect(403);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.INSUFFICIENT_PERMISSIONS.code);
        });

        it("debe rechazar con 403 INSUFFICIENT_PERMISSIONS si un DRIVER intenta cancelar un pedido", async () => {
            const driverAgent = await getDriver1Agent();

            const res = await driverAgent
                .patch(`/api/orders/${orderToCancel._id}/status`)
                .send({ status: ORDER_STATUS.CANCELLED })
                .expect(403);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.INSUFFICIENT_PERMISSIONS.code);
        });
    });
});
