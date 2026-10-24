import { logger, LOG_LEVELS } from "../config/logger.js";
import { config } from "../config/index.js";
import { AppError } from "../utils/errors.js";
import { ERROR_DICTIONARY } from "../constants/index.js";
export const loggerService = {
    test() {
        if (config.NODE_ENV === "production") throw new AppError(ERROR_DICTIONARY.INSUFFICIENT_PERMISSIONS,
            "La prueba del logger está deshabilitada en producción");
        for (const level of Object.keys(LOG_LEVELS)) logger.log(level, `Prueba del logger: ${level}`, { event: "logger_test", simulated: true });
        return { levels: Object.keys(LOG_LEVELS), simulated: true, message: "Registros de prueba emitidos; fatal simulado no detiene el proceso" };
    },
};
