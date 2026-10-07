import mongoose from "mongoose";
import { config } from "./env.config.js";

export async function connectDB() {
    try {
        await mongoose.connect(config.MONGODB_URI);
        console.log(`[Database] Connected successfully to MongoDB (${config.NODE_ENV})`);
    } catch (error) {
        console.error("[Database] MongoDB connection error:", error.message);
        throw error;
    }
}
