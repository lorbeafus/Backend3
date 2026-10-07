import app from "./app.js";
import { connectDB } from "./config/database.js";
import { config } from "./config/index.js";

const startServer = async () => {
    try {
        // Conexión previa a la base de datos
        await connectDB();

        app.listen(config.PORT, () => {
            console.log(`🚀 [ShipNow API] Servidor escuchando en http://localhost:${config.PORT} [Entorno: ${config.NODE_ENV}]`);
        });
    } catch (error) {
        console.error("❌ [FATAL] Error crítico al inicializar el servidor:", error.message);
        process.exit(1);
    }
};

startServer();
