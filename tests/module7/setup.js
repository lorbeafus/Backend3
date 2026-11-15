import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import mongoose from "mongoose";

export const tempLogDir = await mkdtemp(join(tmpdir(), "shipnow-test7-logs-"));
export const tempUploadDir = await mkdtemp(join(tmpdir(), "shipnow-test7-uploads-"));
export const dbName = `shipnow_test7_${randomUUID().replaceAll("-", "")}`;
export const uri = `mongodb://127.0.0.1:27017/${dbName}`;

Object.assign(process.env, {
    NODE_ENV: "test",
    PORT: "3098",
    MONGODB_URI: uri,
    JWT_SECRET: "shipnow-module7-test-secret-key-12345",
    JWT_EXPIRES_IN: "1h",
    LOG_DIR: tempLogDir,
    UPLOAD_DIR: tempUploadDir,
    LOG_MAX_SIZE: "16384",
    LOG_MAX_FILES: "3",
});

export const mochaHooks = {
    async beforeAll() {
        try {
            await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
        } catch (err) {
            throw new Error(
                `Requisito: No se pudo conectar a MongoDB en '${uri}'.\n` +
                `Para ejecutar las pruebas del Módulo 7, asegúrese de tener MongoDB en ejecución localmente en el puerto 27017.\n` +
                `Detalle del error: ${err.message}`
            );
        }

        if (mongoose.connection.name !== dbName) {
            throw new Error(
                `Seguridad: la conexión de MongoDB (${mongoose.connection.name}) no coincide con la base temporal asignada (${dbName})`
            );
        }

        // Inicializar modelos e índices únicos
        const { userModel } = await import("../../src/models/user.model.js");
        const { productModel } = await import("../../src/models/product.model.js");
        const { orderModel } = await import("../../src/models/order.model.js");
        const { deliveryModel } = await import("../../src/models/delivery.model.js");

        await Promise.all([
            userModel.init(),
            productModel.init(),
            orderModel.init(),
            deliveryModel.init(),
        ]);

        // Inicializar estructura de carpetas de almacenamiento
        const { initStorage } = await import("../../src/utils/storage.js");
        await initStorage();
    },

    async afterAll() {
        const cleanupErrors = [];

        // 1. Borrado de base de datos temporal con verificación estricta de prefijo y nombre
        try {
            if (mongoose.connection && mongoose.connection.readyState !== 0) {
                const currentName = mongoose.connection.name;
                const isExactMatch = currentName === dbName;
                const hasSafePrefix = typeof currentName === "string" && currentName.startsWith("shipnow_test7_");

                if (!isExactMatch || !hasSafePrefix) {
                    cleanupErrors.push(
                        new Error(
                            `Seguridad de limpieza: la base activa ('${currentName}') no coincide exactamente con la base temporal asignada ('${dbName}') o carece del prefijo 'shipnow_test7_'. Se omitió el borrado para proteger bases persistentes.`
                        )
                    );
                } else {
                    await mongoose.connection.dropDatabase();
                }
            }
        } catch (err) {
            cleanupErrors.push(new Error(`Fallo al eliminar la base de datos temporal '${dbName}': ${err.message}`));
        }

        // 2. Desconexión de Mongoose (se intenta siempre)
        try {
            if (mongoose.connection && mongoose.connection.readyState !== 0) {
                await mongoose.disconnect();
            }
        } catch (err) {
            cleanupErrors.push(new Error(`Fallo al desconectar Mongoose: ${err.message}`));
        }

        // 3. Finalización del logger Winston (cierre de transports)
        try {
            const { finishLogger } = await import("../../src/config/logger.js");
            await finishLogger();
        } catch (err) {
            cleanupErrors.push(new Error(`Fallo al finalizar logger Winston: ${err.message}`));
        }

        // 4. Eliminación del directorio temporal de logs
        try {
            if (tempLogDir && tempLogDir.includes("shipnow-test7-logs-")) {
                await rm(tempLogDir, { recursive: true, force: true });
            } else {
                cleanupErrors.push(
                    new Error(`Seguridad de limpieza: el directorio de logs '${tempLogDir}' no contiene el prefijo esperado 'shipnow-test7-logs-'.`)
                );
            }
        } catch (err) {
            cleanupErrors.push(new Error(`Fallo al eliminar directorio temporal de logs '${tempLogDir}': ${err.message}`));
        }

        // 5. Eliminación del directorio temporal de uploads
        try {
            if (tempUploadDir && tempUploadDir.includes("shipnow-test7-uploads-")) {
                await rm(tempUploadDir, { recursive: true, force: true });
            } else {
                cleanupErrors.push(
                    new Error(`Seguridad de limpieza: el directorio de uploads '${tempUploadDir}' no contiene el prefijo esperado 'shipnow-test7-uploads-'.`)
                );
            }
        } catch (err) {
            cleanupErrors.push(new Error(`Fallo al eliminar directorio temporal de uploads '${tempUploadDir}': ${err.message}`));
        }

        // 6. Reporte de errores agregados
        if (cleanupErrors.length > 0) {
            if (cleanupErrors.length === 1) {
                throw cleanupErrors[0];
            }
            throw new AggregateError(
                cleanupErrors,
                `Se detectaron ${cleanupErrors.length} errores durante la limpieza del entorno de pruebas del Módulo 7`
            );
        }
    },
};

