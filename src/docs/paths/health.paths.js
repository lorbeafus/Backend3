export const healthPaths = {
    "/api/health": {
        get: {
            tags: ["Health"],
            summary: "Verificar disponibilidad del servicio",
            description: "Comprueba que la API esté activa y respondiendo adecuadamente.",
            operationId: "getHealth",
            responses: {
                200: {
                    description: "Servicio en funcionamiento",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/HealthResponse" },
                        },
                    },
                },
                500: { $ref: "#/components/responses/InternalServerError" },
            },
        },
    },
};
