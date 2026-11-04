export const loggerPaths = {
    "/api/loggerTest": {
        get: {
            tags: ["Logger"],
            summary: "Probar y validar los niveles de log de Winston (ADMIN)",
            description:
                "Herramienta de diagnóstico para verificar la configuración, formato y rotación de Winston.\n\n" +
                "**Comportamiento:**\n" +
                "- Emite un registro de prueba para cada uno de los 6 niveles configurados (`fatal`, `error`, `warning`, `info`, `http`, `debug`) con metadata `{ event: 'logger_test', simulated: true }`.\n" +
                "- **Simulación de nivel Fatal:** Aclara que el nivel `fatal` emitido en esta prueba es meramente simulado y **no detiene ni aborta el servidor**.\n" +
                "- Permite comprobar que `error.log` solo registre `error` y `fatal`, mientras que `application.log` y la consola respetan el umbral del entorno (`debug` en desarrollo/test).\n" +
                "- **Seguridad:** Exclusivo para administradores (**ADMIN**). En entorno de **producción** (`NODE_ENV=production`) la prueba queda completamente bloqueada respondiendo **403 Forbidden**.",
            operationId: "testLogger",
            security: [{ cookieAuth: [] }],
            responses: {
                200: {
                    description: "Registros de prueba emitidos correctamente en consola y archivos de log",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/LoggerTestResponse" },
                        },
                    },
                },
                401: { $ref: "#/components/responses/UnauthorizedError" },
                403: {
                    description: "No autorizado (rol distinto de ADMIN) o deshabilitado en producción",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ErrorResponse" },
                            example: {
                                status: "error",
                                statusCode: 403,
                                message: "La prueba del logger está deshabilitada en producción",
                                error: {
                                    code: "INSUFFICIENT_PERMISSIONS",
                                    message: "La prueba del logger está deshabilitada en producción",
                                    details: {},
                                },
                            },
                        },
                    },
                },
                500: { $ref: "#/components/responses/InternalServerError" },
            },
        },
    },
};
