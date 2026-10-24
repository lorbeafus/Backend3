import { deliveryModel } from "../models/delivery.model.js";
import { userModel } from "../models/user.model.js";
import { orderModel } from "../models/order.model.js";
import mongoose from "mongoose";
import { config } from "./env.config.js";
import { logger } from "./logger.js";
export async function connectDB() {
    await mongoose.connect(config.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    await Promise.all([userModel.init(), orderModel.init(), deliveryModel.init()]);
    logger.info("Conexión a MongoDB establecida", { event: "database_connected", environment: config.NODE_ENV });
}
