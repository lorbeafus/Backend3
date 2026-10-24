// Importación dinámica: permite capturar fallos de validación de configuración.
import { logger, finishLogger } from "./config/logger.js";
try {
    const { config } = await import("./config/index.js");
    const { default: app } = await import("./app.js");
    const { connectDB } = await import("./config/database.js");
    await connectDB();
    const server = app.listen(config.PORT, () => logger.info("Servidor ShipNow iniciado", {
        event: "server_started", port: config.PORT, environment: config.NODE_ENV,
    }));
    server.on("error", async () => {
        logger.fatal("No se pudo abrir el servidor HTTP", { event: "http_start_failed" });
        await finishLogger();
        const mongoose = (await import("mongoose")).default;
        await mongoose.disconnect();
        process.exitCode = 1;
    });
} catch {
    logger.fatal("No se pudo iniciar ShipNow: revisar configuración o conexión MongoDB", { event: "startup_failed" });
    await finishLogger();
    const mongoose = (await import("mongoose")).default;
    await mongoose.disconnect();
    process.exitCode = 1;
}
