export const USER_ROLES = Object.freeze({
    ADMIN: "admin",
    USER: "user",
    DRIVER: "driver",
});

export const PRODUCT_STATUS = Object.freeze({
    AVAILABLE: "available",
    OUT_OF_STOCK: "out_of_stock",
});

export const ORDER_STATUS = Object.freeze({
    PENDING: "pending",
    IN_TRANSIT: "in_transit",
    DELIVERED: "delivered",
    CANCELLED: "cancelled",
});

export const ORDER_PRIORITY = Object.freeze({
    LOW: "low",
    MEDIUM: "medium",
    HIGH: "high",
    URGENT: "urgent",
});

export const DELIVERY_STATUS = Object.freeze({
    ASSIGNED: "assigned",
    IN_PROGRESS: "in_progress",
    COMPLETED: "completed",
    FAILED: "failed",
});

export { ERROR_DICTIONARY } from "./errors.constants.js";
