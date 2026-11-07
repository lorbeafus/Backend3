import { expect } from "chai";
import request from "supertest";
import app from "../../src/app.js";
import { userModel } from "../../src/models/user.model.js";
import { orderModel } from "../../src/models/order.model.js";
import { deliveryModel } from "../../src/models/delivery.model.js";
import {
    seedBaseFixtures,
    clearOrdersAndDeliveries,
    getAdminAgent,
    getClient1Agent,
    getGuestAgent,
} from "./fixtures.js";
import { ERROR_DICTIONARY, USER_ROLES } from "../../src/constants/index.js";

describe("Módulo 6 - Mocks en Memoria y Carga Controlada (Seed)", () => {
    beforeEach(async () => {
        await seedBaseFixtures();
        await clearOrdersAndDeliveries();
    });

    describe("GET /api/mocks/* - Generación en memoria sin persistencia", () => {
        it("GET /api/mocks/users debe generar usuarios simulados en memoria sin persistir en la base de datos", async () => {
            const countBefore = await userModel.countDocuments();

            const res = await request(app)
                .get("/api/mocks/users?qty=5")
                .expect(200);

            expect(res.body).to.have.property("status", "success");
            expect(res.body).to.have.property("count", 5);
            expect(res.body).to.have.property("payload").that.is.an("array").with.lengthOf(5);

            for (const user of res.body.payload) {
                expect(user).to.have.property("_id").that.is.a("string");
                expect(user).to.have.property("first_name").that.is.a("string");
                expect(user).to.have.property("last_name").that.is.a("string");
                expect(user).to.have.property("email").that.is.a("string");
                expect(user).to.have.property("role", USER_ROLES.USER);
                expect(user).to.not.have.property("password");
                expect(user).to.not.have.property("hash");
            }

            // Comprobación de no persistencia en MongoDB
            const countAfter = await userModel.countDocuments();
            expect(countAfter).to.equal(countBefore);
        });

        it("GET /api/mocks/drivers debe generar repartidores con rol DRIVER en memoria", async () => {
            const countBefore = await userModel.countDocuments();

            const res = await request(app)
                .get("/api/mocks/drivers?qty=4")
                .expect(200);

            expect(res.body).to.have.property("status", "success");
            expect(res.body).to.have.property("count", 4);

            for (const driver of res.body.payload) {
                expect(driver).to.have.property("role", USER_ROLES.DRIVER);
                expect(driver).to.not.have.property("password");
            }

            const countAfter = await userModel.countDocuments();
            expect(countAfter).to.equal(countBefore);
        });

        it("GET /api/mocks/orders debe generar pedidos simulados con ítems sin campo 'product' y usuarios relacionados coherentes", async () => {
            const ordersBefore = await orderModel.countDocuments();

            const res = await request(app)
                .get("/api/mocks/orders?qty=3")
                .expect(200);

            expect(res.body).to.have.property("status", "success");
            expect(res.body).to.have.property("count", 3);
            expect(res.body.payload).to.have.property("orders").that.is.an("array").with.lengthOf(3);
            expect(res.body.payload).to.have.property("related_users").that.is.an("array").with.lengthOf(3);

            const userIds = new Set(res.body.payload.related_users.map((u) => u._id));

            for (const order of res.body.payload.orders) {
                expect(order).to.have.property("order_number").that.is.a("string");
                expect(order).to.have.property("total_amount").that.is.a("number");
                expect(userIds.has(order.user)).to.be.true;

                // En los mocks en memoria los ítems omiten el campo product
                for (const item of order.items) {
                    expect(item).to.have.property("product_name");
                    expect(item).to.have.property("quantity");
                    expect(item).to.have.property("price");
                    expect(item).to.not.have.property("product");
                }
            }

            const ordersAfter = await orderModel.countDocuments();
            expect(ordersAfter).to.equal(ordersBefore);
        });

        it("GET /api/mocks/deliveries debe generar entregas coherentes con pedidos, repartidores y usuarios relacionados", async () => {
            const deliveriesBefore = await deliveryModel.countDocuments();

            const res = await request(app)
                .get("/api/mocks/deliveries?qty=2")
                .expect(200);

            expect(res.body).to.have.property("status", "success");
            expect(res.body).to.have.property("count", 2);

            const { deliveries, related_orders, related_drivers, related_users } = res.body.payload;
            expect(deliveries).to.have.lengthOf(2);
            expect(related_orders).to.have.lengthOf(2);
            expect(related_drivers).to.have.lengthOf(2);
            expect(related_users).to.have.lengthOf(2);

            const orderIds = new Set(related_orders.map((o) => o._id));
            const driverIds = new Set(related_drivers.map((d) => d._id));

            for (const d of deliveries) {
                expect(d).to.have.property("tracking_code");
                expect(orderIds.has(d.order)).to.be.true;
                expect(driverIds.has(d.driver)).to.be.true;
            }

            const deliveriesAfter = await deliveryModel.countDocuments();
            expect(deliveriesAfter).to.equal(deliveriesBefore);
        });

        it("debe rechazar con 400 INVALID_MOCK_QUANTITY ante cantidades inválidas (cero, negativas, decimales, texto o > 100)", async () => {
            const invalidQtyValues = ["0", "-3", "1.5", "texto", "101"];

            for (const qty of invalidQtyValues) {
                const res = await request(app)
                    .get(`/api/mocks/users?qty=${qty}`)
                    .expect(400);

                expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.INVALID_MOCK_QUANTITY.code);
            }
        });

        it("debe rechazar con 400 INVALID_MOCK_QUANTITY ante parámetros qty repetidos", async () => {
            const res = await request(app)
                .get("/api/mocks/users?qty=5&qty=10")
                .expect(400);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.INVALID_MOCK_QUANTITY.code);
            expect(res.body.error.message).to.include("no puede repetirse");
        });
    });

    describe("POST /api/mocks/seed - Persistencia controlada", () => {
        it("debe permitir al ADMIN sembrar datos controlados persistiendo en la base de datos temporal", async () => {
            const adminAgent = await getAdminAgent();

            const initialUsers = await userModel.countDocuments();
            const initialOrders = await orderModel.countDocuments();
            const initialDeliveries = await deliveryModel.countDocuments();

            const res = await adminAgent
                .post("/api/mocks/seed?qty=2")
                .expect(201);

            expect(res.body).to.have.property("status", "success");
            expect(res.body).to.have.property("payload").that.is.an("object");

            const { inserted } = res.body.payload;
            expect(inserted).to.deep.include({
                users: 2,
                drivers: 2,
                orders: 2,
                deliveries: 2,
                total: 8,
            });

            // Comprobar persistencia real en MongoDB
            const finalUsers = await userModel.countDocuments();
            const finalOrders = await orderModel.countDocuments();
            const finalDeliveries = await deliveryModel.countDocuments();

            expect(finalUsers).to.equal(initialUsers + 4); // 2 users + 2 drivers
            expect(finalOrders).to.equal(initialOrders + 2);
            expect(finalDeliveries).to.equal(initialDeliveries + 2);

            // Verificar que los pedidos sembrados tengan product: null en sus items
            const seededOrders = await orderModel.find({}).sort({ createdAt: -1 }).limit(2);
            for (const ord of seededOrders) {
                for (const it of ord.items) {
                    expect(it.product).to.be.null;
                }
            }
        });

        it("debe permitir enviar qty tanto por query como por body, dando prioridad a query", async () => {
            const adminAgent = await getAdminAgent();

            // body tiene qty=1, pero query tiene qty=2 -> debe prevalecer query (2)
            const res = await adminAgent
                .post("/api/mocks/seed?qty=2")
                .send({ qty: 1 })
                .expect(201);

            expect(res.body.payload.inserted.orders).to.equal(2);
        });

        it("debe rechazar con 400 INVALID_MOCK_QUANTITY si qty es 0 (vía query) y no alterar datos", async () => {
            const adminAgent = await getAdminAgent();
            const usersBefore = await userModel.countDocuments();
            const ordersBefore = await orderModel.countDocuments();
            const deliveriesBefore = await deliveryModel.countDocuments();

            const res = await adminAgent
                .post("/api/mocks/seed?qty=0")
                .expect(400);

            expect(res.body).to.deep.include({
                status: "error",
                statusCode: 400,
            });
            expect(res.body.error).to.deep.include({
                code: ERROR_DICTIONARY.INVALID_MOCK_QUANTITY.code,
                message: "El parámetro 'qty' debe ser un número entero positivo mayor a 0",
            });
            expect(res.body.error.details).to.deep.include({ field: "qty", min: 1 });

            expect(await userModel.countDocuments()).to.equal(usersBefore);
            expect(await orderModel.countDocuments()).to.equal(ordersBefore);
            expect(await deliveryModel.countDocuments()).to.equal(deliveriesBefore);
        });

        it("debe rechazar con 400 INVALID_MOCK_QUANTITY si qty es negativa (vía body) y no alterar datos", async () => {
            const adminAgent = await getAdminAgent();
            const usersBefore = await userModel.countDocuments();
            const ordersBefore = await orderModel.countDocuments();
            const deliveriesBefore = await deliveryModel.countDocuments();

            const res = await adminAgent
                .post("/api/mocks/seed")
                .send({ qty: -5 })
                .expect(400);

            expect(res.body).to.deep.include({
                status: "error",
                statusCode: 400,
            });
            expect(res.body.error).to.deep.include({
                code: ERROR_DICTIONARY.INVALID_MOCK_QUANTITY.code,
                message: "El parámetro 'qty' debe ser un número entero positivo mayor a 0",
            });
            expect(res.body.error.details).to.deep.include({ field: "qty", min: 1 });

            expect(await userModel.countDocuments()).to.equal(usersBefore);
            expect(await orderModel.countDocuments()).to.equal(ordersBefore);
            expect(await deliveryModel.countDocuments()).to.equal(deliveriesBefore);
        });

        it("debe rechazar con 400 INVALID_MOCK_QUANTITY si qty es decimal (vía query) y no alterar datos", async () => {
            const adminAgent = await getAdminAgent();
            const usersBefore = await userModel.countDocuments();
            const ordersBefore = await orderModel.countDocuments();
            const deliveriesBefore = await deliveryModel.countDocuments();

            const res = await adminAgent
                .post("/api/mocks/seed?qty=2.5")
                .expect(400);

            expect(res.body).to.deep.include({
                status: "error",
                statusCode: 400,
            });
            expect(res.body.error).to.deep.include({
                code: ERROR_DICTIONARY.INVALID_MOCK_QUANTITY.code,
                message: "El parámetro 'qty' debe ser un número entero positivo mayor a 0",
            });
            expect(res.body.error.details).to.deep.include({ field: "qty", min: 1 });

            expect(await userModel.countDocuments()).to.equal(usersBefore);
            expect(await orderModel.countDocuments()).to.equal(ordersBefore);
            expect(await deliveryModel.countDocuments()).to.equal(deliveriesBefore);
        });

        it("debe rechazar con 400 INVALID_MOCK_QUANTITY si qty no es numérica (vía body) y no alterar datos", async () => {
            const adminAgent = await getAdminAgent();
            const usersBefore = await userModel.countDocuments();
            const ordersBefore = await orderModel.countDocuments();
            const deliveriesBefore = await deliveryModel.countDocuments();

            const res = await adminAgent
                .post("/api/mocks/seed")
                .send({ qty: "invalido" })
                .expect(400);

            expect(res.body).to.deep.include({
                status: "error",
                statusCode: 400,
            });
            expect(res.body.error).to.deep.include({
                code: ERROR_DICTIONARY.INVALID_MOCK_QUANTITY.code,
                message: "El parámetro 'qty' debe ser un número entero positivo mayor a 0",
            });
            expect(res.body.error.details).to.deep.include({ field: "qty", min: 1 });

            expect(await userModel.countDocuments()).to.equal(usersBefore);
            expect(await orderModel.countDocuments()).to.equal(ordersBefore);
            expect(await deliveryModel.countDocuments()).to.equal(deliveriesBefore);
        });

        it("debe rechazar con 400 INVALID_MOCK_QUANTITY si qty es 51 por superar el límite de 50 de seed (priorizando query sobre body)", async () => {
            const adminAgent = await getAdminAgent();
            const usersBefore = await userModel.countDocuments();
            const ordersBefore = await orderModel.countDocuments();
            const deliveriesBefore = await deliveryModel.countDocuments();

            // query tiene 51 (inválido por > 50) y body tiene 5 (válido) -> debe prevalecer query y rechazar
            const res = await adminAgent
                .post("/api/mocks/seed?qty=51")
                .send({ qty: 5 })
                .expect(400);

            expect(res.body).to.deep.include({
                status: "error",
                statusCode: 400,
            });
            expect(res.body.error).to.deep.include({
                code: ERROR_DICTIONARY.INVALID_MOCK_QUANTITY.code,
                message: "El parámetro 'qty' no puede superar el límite máximo de 50",
            });
            expect(res.body.error.details).to.deep.include({ field: "qty", limit: 50 });

            expect(await userModel.countDocuments()).to.equal(usersBefore);
            expect(await orderModel.countDocuments()).to.equal(ordersBefore);
            expect(await deliveryModel.countDocuments()).to.equal(deliveriesBefore);
        });

        it("debe rechazar con 403 INSUFFICIENT_PERMISSIONS si un CLIENTE intenta ejecutar seed", async () => {
            const client1Agent = await getClient1Agent();

            const res = await client1Agent
                .post("/api/mocks/seed?qty=2")
                .expect(403);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.INSUFFICIENT_PERMISSIONS.code);
        });

        it("debe rechazar con 401 AUTHENTICATION_REQUIRED si se intenta ejecutar seed sin sesión", async () => {
            const res = await getGuestAgent()
                .post("/api/mocks/seed?qty=2")
                .expect(401);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.AUTHENTICATION_REQUIRED.code);
        });
    });
});
