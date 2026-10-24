import { randomUUID } from "node:crypto";
import { logger } from "../config/logger.js";
export function requestLogger(req, res, next) {
    req.requestId = randomUUID();
    res.setHeader("X-Request-Id", req.requestId);
    const started = performance.now();
    res.once("finish", () => logger.http("Petición HTTP", {
        event: "http_request", requestId: req.requestId, method: req.method,
        route: req.route ? `${["orders", "deliveries", "products", "users", "sessions", "mocks"].includes(req.originalUrl.split("/")[2]?.split("?")[0]) ? "/api/" + req.originalUrl.split("/")[2].split("?")[0] : "/api"}${req.route.path}` : "unmatched",
        statusCode: res.statusCode, durationMs: Math.round(performance.now() - started),
    }));
    next();
}
