import mongoose from "mongoose";
import { config } from "../src/config/index.js";
import { USER_ROLES } from "../src/constants/index.js";
import { usersService } from "../src/services/users.services.js";
import { usersRepository } from "../src/repositories/users.repository.js";
import { userModel } from "../src/models/user.model.js";
import { assertPassword } from "../src/utils/validation.js";

// Comando manual: nunca se ejecuta al iniciar la API ni crea un endpoint público.
async function seedAdmin() {
    if (!["development", "test"].includes(config.NODE_ENV)) {
        throw new Error("seed:admin solo está permitido en development o test");
    }
    if (!config.ADMIN_EMAIL || typeof config.ADMIN_PASSWORD !== "string" || !config.ADMIN_PASSWORD) {
        throw new Error("Configurá ADMIN_EMAIL y ADMIN_PASSWORD en tu .env local");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.ADMIN_EMAIL)) {
        throw new Error("ADMIN_EMAIL debe tener formato de email válido");
    }
    assertPassword(config.ADMIN_PASSWORD, { registration: true });
    await mongoose.connect(config.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    await userModel.init(); // Asegurar el índice único antes de crear la cuenta.
    const existing = await usersRepository.getByEmail(config.ADMIN_EMAIL, "-password");
    if (existing) {
        if (existing.role !== USER_ROLES.ADMIN) {
            throw new Error("El email pertenece a un usuario sin rol ADMIN; no se modificó su cuenta");
        }
        console.log("El administrador ya existe. No se cambió su contraseña ni sus datos.");
        return;
    }
    try {
        await usersService.createUser({
            first_name: "Administrador",
            last_name: "Evaluacion",
            email: config.ADMIN_EMAIL,
            password: config.ADMIN_PASSWORD,
            role: USER_ROLES.ADMIN,
        });
    } catch (error) {
        // Dos ejecuciones simultáneas nunca deben reemplazar ni promover una cuenta.
        if (error.code === 11000 || error.code === "DUPLICATE_RESOURCE") {
            const concurrent = await usersRepository.getByEmail(config.ADMIN_EMAIL, "-password");
            if (concurrent?.role === USER_ROLES.ADMIN) {
                console.log("El administrador ya existe. No se cambió su contraseña ni sus datos.");
                return;
            }
        }
        throw error;
    }
    console.log("Administrador creado. Iniciá sesión con ADMIN_EMAIL y ADMIN_PASSWORD configurados localmente.");
}

try {
    await seedAdmin();
} catch (error) {
    // No imprimir errores crudos de MongoDB: podrían incluir URI o valores sensibles.
    const safe = error.name === "AppError" ||
        ["seed:admin solo", "Configurá ADMIN_EMAIL", "ADMIN_EMAIL debe", "El email pertenece"].some(prefix => error.message?.startsWith(prefix));
    console.error(safe ? error.message : "No se pudo crear el administrador. Revisá la conexión y la configuración local.");
    process.exitCode = 1;
} finally {
    await mongoose.disconnect();
}
