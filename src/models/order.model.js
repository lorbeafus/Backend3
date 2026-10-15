import { Schema, model } from "mongoose";
import { ORDER_STATUS, ORDER_PRIORITY } from "../constants/index.js";

const orderItemSchema = new Schema(
    {
        product_name: {
            type: String,
            required: [true, "El nombre del producto es obligatorio"],
            trim: true,
        },
        quantity: {
            type: Number,
            required: [true, "La cantidad es obligatoria"],
            min: [1, "La cantidad debe ser al menos 1"],
        },
        price: {
            type: Number,
            required: [true, "El precio es obligatorio"],
            min: [0, "El precio no puede ser negativo"],
        },
    },
    { _id: false }
);

const orderSchema = new Schema(
    {
        order_number: {
            type: String,
            required: [true, "El número de pedido es obligatorio"],
            unique: true,
            trim: true,
        },
        user: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: [true, "El usuario asociado al pedido es obligatorio"],
        },
        items: {
            type: [orderItemSchema],
            default: [],
            validate: {
                validator: (items) => Array.isArray(items) && items.length > 0,
                message: "El pedido debe contener al menos un producto",
            },
        },
        total_amount: {
            type: Number,
            required: [true, "El monto total es obligatorio"],
            min: [0, "El monto total no puede ser negativo"],
        },
        status: {
            type: String,
            enum: {
                values: Object.values(ORDER_STATUS),
                message: "Estado de pedido no válido",
            },
            default: ORDER_STATUS.PENDING,
        },
        priority: {
            type: String,
            enum: {
                values: Object.values(ORDER_PRIORITY),
                message: "Prioridad de pedido no válida",
            },
            default: ORDER_PRIORITY.MEDIUM,
        },
        shipping_address: {
            street: { type: String, required: true },
            city: { type: String, required: true },
            zip_code: { type: String, required: true },
        },
    },
    {
        timestamps: true,
    }
);

export const orderModel = model("Order", orderSchema);
