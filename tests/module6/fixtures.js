import request from "supertest";
import bcrypt from "bcrypt";
import app from "../../src/app.js";
import { userModel } from "../../src/models/user.model.js";
import { productModel } from "../../src/models/product.model.js";
import { orderModel } from "../../src/models/order.model.js";
import { deliveryModel } from "../../src/models/delivery.model.js";
import { USER_ROLES, PRODUCT_STATUS } from "../../src/constants/index.js";

export const DEFAULT_PASSWORD = "Password123";

let cachedHash = null;
async function getPasswordHash() {
    if (!cachedHash) {
        cachedHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
    }
    return cachedHash;
}

export const FIXTURE_EMAILS = Object.freeze({
    ADMIN: "admin@module6.test",
    CLIENT1: "client1@module6.test",
    CLIENT2: "client2@module6.test",
    DRIVER1: "driver1@module6.test",
    DRIVER2: "driver2@module6.test",
});

export let testUsers = {};
export let testProducts = {};

/**
 * Inicializa o reinserta los fixtures controlados requeridos por la consigna:
 * ADMIN, dos clientes (CLIENT1, CLIENT2), dos DRIVERs y productos disponibles/sin stock.
 */
export async function seedBaseFixtures() {
    const hash = await getPasswordHash();

    // Limpiar colecciones de prueba
    await Promise.all([
        userModel.deleteMany({}),
        productModel.deleteMany({}),
        orderModel.deleteMany({}),
        deliveryModel.deleteMany({}),
    ]);

    // Crear usuarios controlados
    const [admin, client1, client2, driver1, driver2] = await Promise.all([
        userModel.create({
            first_name: "Admin",
            last_name: "Principal",
            email: FIXTURE_EMAILS.ADMIN,
            password: hash,
            role: USER_ROLES.ADMIN,
        }),
        userModel.create({
            first_name: "Cliente",
            last_name: "Uno",
            email: FIXTURE_EMAILS.CLIENT1,
            password: hash,
            role: USER_ROLES.USER,
        }),
        userModel.create({
            first_name: "Cliente",
            last_name: "Dos",
            email: FIXTURE_EMAILS.CLIENT2,
            password: hash,
            role: USER_ROLES.USER,
        }),
        userModel.create({
            first_name: "Chofer",
            last_name: "Uno",
            email: FIXTURE_EMAILS.DRIVER1,
            password: hash,
            role: USER_ROLES.DRIVER,
        }),
        userModel.create({
            first_name: "Chofer",
            last_name: "Dos",
            email: FIXTURE_EMAILS.DRIVER2,
            password: hash,
            role: USER_ROLES.DRIVER,
        }),
    ]);

    testUsers = {
        admin,
        client1,
        client2,
        driver1,
        driver2,
    };

    // Crear productos de catálogo controlados
    const [p1, p2, pOut] = await Promise.all([
        productModel.create({
            name: "Caja de cartón reforzada 40x30",
            description: "Caja para envíos pesados",
            price: 12.5,
            stock: 100,
            status: PRODUCT_STATUS.AVAILABLE,
        }),
        productModel.create({
            name: "Cinta de embalar transparente",
            description: "Cinta adhesiva de 50m",
            price: 3.2,
            stock: 50,
            status: PRODUCT_STATUS.AVAILABLE,
        }),
        productModel.create({
            name: "Sobre acolchado burbuja",
            description: "Sin stock para pruebas",
            price: 5.0,
            stock: 0,
            status: PRODUCT_STATUS.AVAILABLE,
        }),
    ]);

    testProducts = {
        box: p1,
        tape: p2,
        outOfStock: pOut,
    };

    return { testUsers, testProducts };
}

/**
 * Crea un agente de Supertest autenticado mediante POST /api/sessions/login real,
 * conservando la cookie HttpOnly currentUser.
 */
export async function createAuthAgent(email, password = DEFAULT_PASSWORD) {
    const agent = request.agent(app);
    const res = await agent.post("/api/sessions/login").send({ email, password });
    if (res.status !== 200) {
        throw new Error(`No se pudo autenticar el fixture ${email}: status ${res.status}`);
    }
    return agent;
}

export async function getAdminAgent() {
    return createAuthAgent(FIXTURE_EMAILS.ADMIN);
}

export async function getClient1Agent() {
    return createAuthAgent(FIXTURE_EMAILS.CLIENT1);
}

export async function getClient2Agent() {
    return createAuthAgent(FIXTURE_EMAILS.CLIENT2);
}

export async function getDriver1Agent() {
    return createAuthAgent(FIXTURE_EMAILS.DRIVER1);
}

export function getGuestAgent() {
    return request(app);
}

export async function clearOrdersAndDeliveries() {
    await Promise.all([
        orderModel.deleteMany({}),
        deliveryModel.deleteMany({}),
    ]);
}
