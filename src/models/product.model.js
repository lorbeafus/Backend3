import { Schema, model } from "mongoose";
import { PRODUCT_STATUS } from "../constants/index.js";

const productSchema = new Schema(
    {
        name: {
            type: String,
            required: [true, "El nombre del producto es obligatorio"],
            trim: true,
        },
        description: {
            type: String,
            required: [true, "La descripción del producto es obligatoria"],
            trim: true,
        },
        price: {
            type: Number,
            required: [true, "El precio del producto es obligatorio"],
            min: [0, "El precio no puede ser negativo"],
        },
        stock: {
            type: Number,
            required: [true, "El stock es obligatorio"],
            min: [0, "El stock no puede ser negativo"],
            default: 0,
        },
        status: {
            type: String,
            enum: {
                values: Object.values(PRODUCT_STATUS),
                message: "Estado de producto no válido",
            },
            default: PRODUCT_STATUS.AVAILABLE,
        },
    },
    {
        timestamps: true,
    }
);

export const productModel = model("Product", productSchema);
