import { expect } from "chai";
import { seedBaseFixtures, testUsers, testProducts, getAdminAgent, getClient1Agent } from "./fixtures.js";
import { orderModel } from "../../src/models/order.model.js";
import { deliveryModel } from "../../src/models/delivery.model.js";
import { ORDER_STATUS as O, DELIVERY_STATUS as D, ERROR_DICTIONARY as E } from "../../src/constants/index.js";

const orderState = { [D.ASSIGNED]: O.PENDING, [D.IN_PROGRESS]: O.IN_TRANSIT,
    [D.COMPLETED]: O.DELIVERED, [D.FAILED]: O.CANCELLED };

function expectError(response, status, definition) {
    expect(response.status).to.equal(status);
    expect(response.body).to.include({ status: "error", statusCode: status });
    expect(response.body.message).to.be.a("string").and.not.be.empty;
    expect(response.body.error).to.have.all.keys("code", "message", "details");
    expect(response.body.error.code).to.equal(definition.code);
    expect(response.body.error.message).to.equal(response.body.message);
}

describe("Módulo 6 - Matriz de estados e idempotencia", () => {
    let order, delivery, admin;
    beforeEach(async () => {
        await seedBaseFixtures();
        admin = await getAdminAgent();
        order = await orderModel.create({
            order_number: "ORD-STATE-EDGE", user: testUsers.client1._id,
            items: [{ product: testProducts.box._id, product_name: testProducts.box.name,
                price: 12.5, quantity: 1 }], total_amount: 12.5, status: O.PENDING,
            shipping_address: { street: "Calle 123", city: "CABA", zip_code: "1000" },
        });
        const response = await admin.post("/api/deliveries").send({
            order: String(order._id), driver: String(testUsers.driver1._id),
            estimated_delivery_date: new Date(Date.now() + 86400000).toISOString(),
        }).expect(201);
        delivery = response.body.payload;
    });

    async function setStartingState(state) {
        // Fixture de partida: el pedido es la autoridad; no se modifica el snapshot de Delivery.
        await orderModel.updateOne({ _id: order._id }, { $set: { status: orderState[state] } });
    }

    const invalid = [
        [D.ASSIGNED, D.COMPLETED], [D.ASSIGNED, D.FAILED],
        [D.IN_PROGRESS, D.ASSIGNED],
        [D.COMPLETED, D.ASSIGNED], [D.COMPLETED, D.IN_PROGRESS], [D.COMPLETED, D.FAILED],
        [D.FAILED, D.ASSIGNED], [D.FAILED, D.IN_PROGRESS], [D.FAILED, D.COMPLETED],
    ];
    for (const [from, to] of invalid) {
        it(`rechaza entrega ${from} -> ${to} con 409 sin alterar la persistencia`, async () => {
            await setStartingState(from);
            const before = await orderModel.findById(order._id).lean();
            const snapshot = await deliveryModel.findById(delivery._id).lean();
            const response = await admin.patch(`/api/deliveries/${delivery._id}/status`).send({ status: to });
            expectError(response, 409, E.DOMAIN_CONFLICT);
            expect(await orderModel.findById(order._id).lean()).to.deep.equal(before);
            expect(await deliveryModel.findById(delivery._id).lean()).to.deep.equal(snapshot);
            const read = await admin.get(`/api/deliveries/${delivery._id}`).expect(200);
            expect(read.body.payload.status).to.equal(from);
        });
    }

    for (const state of Object.values(D)) {
        it(`repetir el estado de entrega ${state} responde 200 sin escrituras`, async () => {
            await setStartingState(state);
            const before = await orderModel.findById(order._id).lean();
            const snapshot = await deliveryModel.findById(delivery._id).lean();
            for (let i = 0; i < 2; i++) {
                const response = await admin.patch(`/api/deliveries/${delivery._id}/status`)
                    .send({ status: state }).expect(200);
                expect(response.body.status).to.equal("success");
                expect(response.body.payload.status).to.equal(state);
            }
            expect(await orderModel.findById(order._id).lean()).to.deep.equal(before);
            expect(await deliveryModel.findById(delivery._id).lean()).to.deep.equal(snapshot);
        });
    }

    it("permite in_progress -> failed y mantiene la cancelación al repetir", async () => {
        await setStartingState(D.IN_PROGRESS);
        for (let i = 0; i < 2; i++) {
            const response = await admin.patch(`/api/deliveries/${delivery._id}/status`)
                .send({ status: D.FAILED }).expect(200);
            expect(response.body.payload.status).to.equal(D.FAILED);
            expect((await orderModel.findById(order._id)).status).to.equal(O.CANCELLED);
        }
    });

    for (const [label, body] of [["ausente", {}], ["nulo", { status: null }],
        ["numérico", { status: 1 }], ["desconocido", { status: "superheroe" }]]) {
        it(`rechaza estado de entrega ${label} con 400 sin cambiar el pedido`, async () => {
            const before = await orderModel.findById(order._id).lean();
            const response = await admin.patch(`/api/deliveries/${delivery._id}/status`).send(body);
            expectError(response, 400, E.INVALID_DOMAIN_STATE);
            expect(await orderModel.findById(order._id).lean()).to.deep.equal(before);
        });
    }

    for (const [role, status] of [["cliente", O.IN_TRANSIT], ["cliente", O.DELIVERED], ["admin", O.DELIVERED]]) {
        it(`rechaza cancelar un pedido ${status} como ${role} con 409`, async () => {
            await orderModel.updateOne({ _id: order._id }, { $set: { status } });
            const before = await orderModel.findById(order._id).lean();
            const agent = role === "admin" ? admin : await getClient1Agent();
            const response = await agent.patch(`/api/orders/${order._id}/status`).send({ status: O.CANCELLED });
            expectError(response, 409, E.DOMAIN_CONFLICT);
            expect(await orderModel.findById(order._id).lean()).to.deep.equal(before);
        });
    }

    for (const [label, body] of [["pending", { status: O.PENDING }],
        ["in_transit", { status: O.IN_TRANSIT }], ["delivered", { status: O.DELIVERED }],
        ["desconocido", { status: "superheroe" }], ["ausente", {}],
        ["nulo", { status: null }], ["numérico", { status: 1 }]]) {
        it(`rechaza estado de pedido ${label} con 400 sin persistir cambios`, async () => {
            const before = await orderModel.findById(order._id).lean();
            const response = await admin.patch(`/api/orders/${order._id}/status`).send(body);
            expectError(response, 400, E.INVALID_DOMAIN_STATE);
            expect(await orderModel.findById(order._id).lean()).to.deep.equal(before);
        });
    }

    it("ADMIN puede cancelar en tránsito y repetir sin escrituras adicionales", async () => {
        await setStartingState(D.IN_PROGRESS);
        await admin.patch(`/api/orders/${order._id}/status`).send({ status: O.CANCELLED }).expect(200);
        const before = await orderModel.findById(order._id).lean();
        const repeat = await admin.patch(`/api/orders/${order._id}/status`).send({ status: O.CANCELLED }).expect(200);
        expect(repeat.body.payload.status).to.equal(O.CANCELLED);
        expect(await orderModel.findById(order._id).lean()).to.deep.equal(before);
        const read = await admin.get(`/api/deliveries/${delivery._id}`).expect(200);
        expect(read.body.payload.status).to.equal(D.FAILED);
    });
});
