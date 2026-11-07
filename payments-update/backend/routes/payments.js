import express, { Router } from "express";
import { razorpayWebhook } from "../controllers/paymentController.js";

const router = Router();
router.post("/webhook", express.raw({ type: "application/json" }), razorpayWebhook);
export default router;
