import bcrypt from "bcrypt";
import request from "supertest";
import app from "../../src/app.js";
import { userModel } from "../../src/models/user.model.js";
import { productModel } from "../../src/models/product.model.js";
import { orderModel } from "../../src/models/order.model.js";
import { deliveryModel } from "../../src/models/delivery.model.js";
import { USER_ROLES, PRODUCT_STATUS, ORDER_STATUS, ORDER_PRIORITY, DELIVERY_STATUS } from "../../src/constants/index.js";

export const FIXTURE_PASSWORD = "Password123";

export const FIXTURE_EMAILS = Object.freeze({
    ADMIN: "admin.mod7@shipnow.test",
    CLIENT1: "client1.mod7@shipnow.test",
    CLIENT2: "client2.mod7@shipnow.test",
    DRIVER1: "driver1.mod7@shipnow.test",
    DRIVER2: "driver2.mod7@shipnow.test",
});

export const sampleFiles = Object.freeze({
    validPdf: Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"),
    validJpeg: Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
        0x00, 0x01, 0x00, 0x00,
    ]),
    validPng: Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
    ]),
    invalidContentForPdf: Buffer.from("Este es un archivo de texto plano sin cabecera binaria PDF"),
    invalidContentForJpeg: Buffer.from("Texto simulado que no contiene la cabecera FF D8 FF"),
    oversizedPdf: Buffer.concat([
        Buffer.from("%PDF-1.4\n"),
        Buffer.alloc(5.2 * 1024 * 1024, "A"),
        Buffer.from("\n%%EOF"),
    ]),
});

export let testUsers = {};
export let testDeliveries = {};
export let testOrders = {};

export async function seedBaseFixtures() {
    await userModel.deleteMany({});
    await productModel.deleteMany({});
    await orderModel.deleteMany({});
    await deliveryModel.deleteMany({});

    const hashedPassword = await bcrypt.hash(FIXTURE_PASSWORD, 10);

    const [admin, client1, client2, driver1, driver2] = await Promise.all([
        userModel.create({
            first_name: "Admin",
            last_name: "Mod7",
            email: FIXTURE_EMAILS.ADMIN,
            password: hashedPassword,
            role: USER_ROLES.ADMIN,
        }),
        userModel.create({
            first_name: "Client1",
            last_name: "Mod7",
            email: FIXTURE_EMAILS.CLIENT1,
            password: hashedPassword,
            role: USER_ROLES.USER,
        }),
        userModel.create({
            first_name: "Client2",
            last_name: "Mod7",
            email: FIXTURE_EMAILS.CLIENT2,
            password: hashedPassword,
            role: USER_ROLES.USER,
        }),
        userModel.create({
            first_name: "Driver1",
            last_name: "Mod7",
            email: FIXTURE_EMAILS.DRIVER1,
            password: hashedPassword,
            role: USER_ROLES.DRIVER,
        }),
        userModel.create({
            first_name: "Driver2",
            last_name: "Mod7",
            email: FIXTURE_EMAILS.DRIVER2,
            password: hashedPassword,
            role: USER_ROLES.DRIVER,
        }),
    ]);

    testUsers = { admin, client1, client2, driver1, driver2 };

    const product = await productModel.create({
        name: "Caja Cartón Mod7",
        description: "Caja reforzada",
        price: 25.5,
        stock: 50,
        status: PRODUCT_STATUS.AVAILABLE,
    });

    const order1 = await orderModel.create({
        user: client1._id,
        order_number: "ORD-MOD7-001",
        items: [{ product: product._id, product_name: product.name, price: 25.5, quantity: 2 }],
        total_amount: 51.0,
        priority: ORDER_PRIORITY.MEDIUM,
        status: ORDER_STATUS.PENDING,
        shipping_address: { street: "Av. Corrientes 1000", city: "CABA", zip_code: "1043" },
    });

    const order2 = await orderModel.create({
        user: client2._id,
        order_number: "ORD-MOD7-002",
        items: [{ product: product._id, product_name: product.name, price: 25.5, quantity: 1 }],
        total_amount: 25.5,
        priority: ORDER_PRIORITY.HIGH,
        status: ORDER_STATUS.PENDING,
        shipping_address: { street: "Av. Belgrano 2000", city: "CABA", zip_code: "1094" },
    });

    testOrders = { order1, order2 };

    const deliveryForDriver1 = await deliveryModel.create({
        assignment_key: String(order1._id),
        tracking_code: "TRK-MOD7-001",
        order: order1._id,
        driver: driver1._id,
        status: DELIVERY_STATUS.ASSIGNED,
        estimated_delivery_date: new Date(Date.now() + 86400000),
        delivery_notes: "Entregar en portería",
    });

    const deliveryForDriver2 = await deliveryModel.create({
        assignment_key: String(order2._id),
        tracking_code: "TRK-MOD7-002",
        order: order2._id,
        driver: driver2._id,
        status: DELIVERY_STATUS.ASSIGNED,
        estimated_delivery_date: new Date(Date.now() + 86400000),
        delivery_notes: "Tocar timbre 3B",
    });

    testDeliveries = { deliveryForDriver1, deliveryForDriver2 };
}

export async function createAuthAgent(email, password = FIXTURE_PASSWORD) {
    const agent = request.agent(app);
    const res = await agent
        .post("/api/sessions/login")
        .send({ email, password })
        .expect(200);

    return agent;
}

export const getAdminAgent = () => createAuthAgent(FIXTURE_EMAILS.ADMIN);
export const getClient1Agent = () => createAuthAgent(FIXTURE_EMAILS.CLIENT1);
export const getClient2Agent = () => createAuthAgent(FIXTURE_EMAILS.CLIENT2);
export const getDriver1Agent = () => createAuthAgent(FIXTURE_EMAILS.DRIVER1);
export const getDriver2Agent = () => createAuthAgent(FIXTURE_EMAILS.DRIVER2);
export const getGuestAgent = () => request(app);

