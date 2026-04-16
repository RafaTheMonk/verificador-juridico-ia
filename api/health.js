/**
 * Vercel serverless entry point — GET /health
 * Delega para o controller.
 */
import healthController from "../src/controllers/health.js";

export default healthController;
