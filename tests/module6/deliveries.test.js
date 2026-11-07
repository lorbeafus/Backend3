import { expect } from "chai";
import {
    seedBaseFixtures,
    clearOrdersAndDeliveries,
    testUsers,
    testProducts,
    getAdminAgent,
    getClient1Agent,
    getClient2Agent,
    getDriver1Agent,
    getGuestAgent,
    createAuthAgent,
    FIXTURE_EMAILS,
} from "./fixtures.js";
import { orderModel } from "../../src/models/order.model.js";
import { deliveryModel } from "../../src/models/delivery.model.js";
import {
    ERROR_DICTIONARY,
    ORDER_STATUS,
    DELIVERY_STATUS,
    ORDER_PRIORITY,
} from "../../src/constants/index.js";

describe("Módulo 6 - Entregas (Deliveries)", () => {
    let pendingOrder;

    beforeEach(async () => {
        await seedBaseFixtures();
        await clearOrdersAndDeliveries();

        // Crear un pedido pendiente perteneciente al client1
        pendingOrder = await orderModel.create({
            user: testUsers.client1._id,
            order_number: "ORD-DELIVERY-TEST-1",
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
            priority: ORDER_PRIORITY.HIGH,
            shipping_address: { street: "Av. Santa Fe 2000", city: "CABA", zip_code: "1425" },
        });
    });

    describe("POST /api/deliveries - Asignación de entregas", () => {
        it("debe permitir al ADMIN asignar un pedido pendiente a un DRIVER con fecha estimada futura", async () => {
            const adminAgent = await getAdminAgent();
            const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

            const res = await adminAgent
                .post("/api/deliveries")
                .send({
                    order: String(pendingOrder._id),
                    driver: String(testUsers.driver1._id),
                    estimated_delivery_date: futureDate,
                    delivery_notes: "Dejar en recepción",
                })
                .expect(201);

            expect(res.body).to.have.property("status", "success");
            expect(res.body).to.have.property("payload").that.is.an("object");

            const delivery = res.body.payload;
            expect(delivery).to.have.property("_id").that.is.a("string");
            expect(delivery).to.have.property("tracking_code").that.match(/^TRK-[0-9a-fA-F-]+$/);
            expect(delivery).to.have.property("status", DELIVERY_STATUS.ASSIGNED);
            expect(delivery).to.have.property("delivery_notes", "Dejar en recepción");

            // Comprobar que en MongoDB existe la entrega
            const persisted = await deliveryModel.findById(delivery._id);
            expect(persisted).to.not.be.null;
            expect(String(persisted.driver)).to.equal(String(testUsers.driver1._id));
        });

        it("debe rechazar con 403 INSUFFICIENT_PERMISSIONS si un CLIENTE o DRIVER intenta crear la entrega", async () => {
            const client1Agent = await getClient1Agent();
            const driverAgent = await getDriver1Agent();
            const futureDate = new Date(Date.now() + 86400000).toISOString();

            const payload = {
                order: String(pendingOrder._id),
                driver: String(testUsers.driver1._id),
                estimated_delivery_date: futureDate,
            };

            await client1Agent.post("/api/deliveries").send(payload).expect(403);
            await driverAgent.post("/api/deliveries").send(payload).expect(403);
        });

        it("debe rechazar con 409 DOMAIN_CONFLICT si el pedido ya tiene una entrega asignada (conflicto duplicado)", async () => {
            const adminAgent = await getAdminAgent();
            const futureDate = new Date(Date.now() + 86400000).toISOString();

            // Primera asignación exitosa
            await adminAgent
                .post("/api/deliveries")
                .send({
                    order: String(pendingOrder._id),
                    driver: String(testUsers.driver1._id),
                    estimated_delivery_date: futureDate,
                })
                .expect(201);

            // Segunda asignación sobre el mismo pedido
            const res = await adminAgent
                .post("/api/deliveries")
                .send({
                    order: String(pendingOrder._id),
                    driver: String(testUsers.driver2._id),
                    estimated_delivery_date: futureDate,
                })
                .expect(409);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.DOMAIN_CONFLICT.code);
            expect(res.body.error.message).to.include("ya tiene una entrega");
        });

        it("debe rechazar con 400 INVALID_INPUT_DATA si se asigna a un usuario que no tiene rol DRIVER", async () => {
            const adminAgent = await getAdminAgent();
            const futureDate = new Date(Date.now() + 86400000).toISOString();

            const res = await adminAgent
                .post("/api/deliveries")
                .send({
                    order: String(pendingOrder._id),
                    driver: String(testUsers.client1._id), // Rol USER, no DRIVER
                    estimated_delivery_date: futureDate,
                })
                .expect(400);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.INVALID_INPUT_DATA.code);
            expect(res.body.error.message).to.include("rol DRIVER");
        });

        it("debe rechazar con 400 INVALID_INPUT_DATA si la fecha estimada está en el pasado o formato no ISO UTC", async () => {
            const adminAgent = await getAdminAgent();

            // Fecha en el pasado
            const pastDate = new Date(Date.now() - 86400000).toISOString();
            const resPast = await adminAgent
                .post("/api/deliveries")
                .send({
                    order: String(pendingOrder._id),
                    driver: String(testUsers.driver1._id),
                    estimated_delivery_date: pastDate,
                })
                .expect(400);

            expect(resPast.body.error).to.have.property("code", ERROR_DICTIONARY.INVALID_INPUT_DATA.code);
            expect(resPast.body.error.message).to.include("futura");

            // Formato sin sufijo Z
            const invalidFormat = "2026-12-01 15:00:00";
            const resFormat = await adminAgent
                .post("/api/deliveries")
                .send({
                    order: String(pendingOrder._id),
                    driver: String(testUsers.driver1._id),
                    estimated_delivery_date: invalidFormat,
                })
                .expect(400);

            expect(resFormat.body.error).to.have.property("code", ERROR_DICTIONARY.INVALID_INPUT_DATA.code);
        });
    });

    describe("GET /api/deliveries y GET /api/deliveries/:id - Consulta y visibilidad por rol", () => {
        let createdDelivery;

        beforeEach(async () => {
            const adminAgent = await getAdminAgent();
            const futureDate = new Date(Date.now() + 86400000).toISOString();

            const res = await adminAgent
                .post("/api/deliveries")
                .send({
                    order: String(pendingOrder._id),
                    driver: String(testUsers.driver1._id),
                    estimated_delivery_date: futureDate,
                });

            createdDelivery = res.body.payload;
        });

        it("GET /api/deliveries como ADMIN debe listar todas las entregas del sistema", async () => {
            const adminAgent = await getAdminAgent();

            const res = await adminAgent.get("/api/deliveries").expect(200);

            expect(res.body.payload).to.have.property("items").that.is.an("array");
            expect(res.body.payload.items.length).to.be.at.least(1);
        });

        it("GET /api/deliveries como DRIVER asignado debe listar sus entregas asignadas", async () => {
            const driver1Agent = await getDriver1Agent();

            const res = await driver1Agent.get("/api/deliveries").expect(200);

            const items = res.body.payload.items;
            expect(items).to.be.an("array").with.lengthOf(1);
            expect(items[0]).to.have.property("_id", createdDelivery._id);
        });

        it("GET /api/deliveries como otro DRIVER sin asignaciones debe devolver array vacío", async () => {
            const driver2Agent = await createAuthAgent(FIXTURE_EMAILS.DRIVER2);

            const res = await driver2Agent.get("/api/deliveries").expect(200);

            expect(res.body.payload.items).to.be.an("array").that.is.empty;
        });

        it("GET /api/deliveries como CLIENTE debe ver únicamente las entregas asociadas a sus pedidos", async () => {
            const client1Agent = await getClient1Agent();
            const client2Agent = await getClient2Agent();

            // Client 1 es el dueño del pedido: debe ver la entrega
            const res1 = await client1Agent.get("/api/deliveries").expect(200);
            expect(res1.body.payload.items).to.have.lengthOf(1);

            // Client 2 no tiene entregas: array vacío
            const res2 = await client2Agent.get("/api/deliveries").expect(200);
            expect(res2.body.payload.items).to.be.empty;
        });

        it("GET /api/deliveries/:id debe permitir la consulta al ADMIN, DRIVER asignado y CLIENTE dueño", async () => {
            const adminAgent = await getAdminAgent();
            const driver1Agent = await getDriver1Agent();
            const client1Agent = await getClient1Agent();

            await adminAgent.get(`/api/deliveries/${createdDelivery._id}`).expect(200);
            await driver1Agent.get(`/api/deliveries/${createdDelivery._id}`).expect(200);
            await client1Agent.get(`/api/deliveries/${createdDelivery._id}`).expect(200);
        });

        it("GET /api/deliveries/:id debe rechazar con 403 INSUFFICIENT_PERMISSIONS a un DRIVER no asignado o CLIENTE ajeno", async () => {
            const driver2Agent = await createAuthAgent(FIXTURE_EMAILS.DRIVER2);
            const client2Agent = await getClient2Agent();

            await driver2Agent.get(`/api/deliveries/${createdDelivery._id}`).expect(403);
            await client2Agent.get(`/api/deliveries/${createdDelivery._id}`).expect(403);
        });

        it("GET /api/deliveries/:id debe rechazar con 400 ante ID malformado y 404 ante ID inexistente", async () => {
            const adminAgent = await getAdminAgent();

            const resMalformed = await adminAgent.get("/api/deliveries/id-invalido").expect(400);
            expect(resMalformed.body.error).to.have.property("code", ERROR_DICTIONARY.INVALID_ID.code);

            const resNonExistent = await adminAgent.get("/api/deliveries/507f1f77bcf86cd799439011").expect(404);
            expect(resNonExistent.body.error).to.have.property("code", ERROR_DICTIONARY.DELIVERY_NOT_FOUND.code);
        });
    });

    describe("PATCH /api/deliveries/:id/status - Transiciones de estado y coherencia con el pedido", () => {
        let activeDelivery;

        beforeEach(async () => {
            const adminAgent = await getAdminAgent();
            const futureDate = new Date(Date.now() + 86400000).toISOString();

            const res = await adminAgent
                .post("/api/deliveries")
                .send({
                    order: String(pendingOrder._id),
                    driver: String(testUsers.driver1._id),
                    estimated_delivery_date: futureDate,
                });

            activeDelivery = res.body.payload;
        });

        it("debe avanzar assigned -> in_progress y reflejar in_transit en el pedido asociado", async () => {
            const driver1Agent = await getDriver1Agent();
            const adminAgent = await getAdminAgent();

            // Avanzar entrega a in_progress
            const res = await driver1Agent
                .patch(`/api/deliveries/${activeDelivery._id}/status`)
                .send({ status: DELIVERY_STATUS.IN_PROGRESS })
                .expect(200);

            expect(res.body.payload).to.have.property("status", DELIVERY_STATUS.IN_PROGRESS);

            // Comprobar que la fuente de autoridad (el pedido) se actualizó a in_transit
            const orderRes = await adminAgent.get(`/api/orders/${pendingOrder._id}`).expect(200);
            expect(orderRes.body.payload).to.have.property("status", ORDER_STATUS.IN_TRANSIT);
        });

        it("debe avanzar in_progress -> completed y reflejar delivered en el pedido asociado", async () => {
            const driver1Agent = await getDriver1Agent();
            const adminAgent = await getAdminAgent();

            // Paso 1: assigned -> in_progress
            await driver1Agent
                .patch(`/api/deliveries/${activeDelivery._id}/status`)
                .send({ status: DELIVERY_STATUS.IN_PROGRESS })
                .expect(200);

            // Paso 2: in_progress -> completed
            const resCompleted = await driver1Agent
                .patch(`/api/deliveries/${activeDelivery._id}/status`)
                .send({ status: DELIVERY_STATUS.COMPLETED })
                .expect(200);

            expect(resCompleted.body.payload).to.have.property("status", DELIVERY_STATUS.COMPLETED);

            // Comprobar que el pedido ahora tiene estado delivered
            const orderRes = await adminAgent.get(`/api/orders/${pendingOrder._id}`).expect(200);
            expect(orderRes.body.payload).to.have.property("status", ORDER_STATUS.DELIVERED);
        });

        it("debe rechazar con 409 DOMAIN_CONFLICT saltos inválidos (ej. assigned directo a completed)", async () => {
            const driver1Agent = await getDriver1Agent();

            // Intento de salto sin pasar por in_progress
            const res = await driver1Agent
                .patch(`/api/deliveries/${activeDelivery._id}/status`)
                .send({ status: DELIVERY_STATUS.COMPLETED })
                .expect(409);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.DOMAIN_CONFLICT.code);
            expect(res.body.error.message).to.include("Transición de entrega no permitida");
        });

        it("debe rechazar con 400 INVALID_DOMAIN_STATE un estado de entrega que no existe", async () => {
            const driver1Agent = await getDriver1Agent();

            const res = await driver1Agent
                .patch(`/api/deliveries/${activeDelivery._id}/status`)
                .send({ status: "ESTADO_INEXISTENTE" })
                .expect(400);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.INVALID_DOMAIN_STATE.code);
        });

        it("debe rechazar con 403 INSUFFICIENT_PERMISSIONS si un DRIVER no asignado o CLIENTE intenta cambiar el estado", async () => {
            const driver2Agent = await createAuthAgent(FIXTURE_EMAILS.DRIVER2);
            const client1Agent = await getClient1Agent();

            await driver2Agent
                .patch(`/api/deliveries/${activeDelivery._id}/status`)
                .send({ status: DELIVERY_STATUS.IN_PROGRESS })
                .expect(403);

            await client1Agent
                .patch(`/api/deliveries/${activeDelivery._id}/status`)
                .send({ status: DELIVERY_STATUS.IN_PROGRESS })
                .expect(403);
        });
    });
});
