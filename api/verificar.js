/**
 * Vercel serverless entry point — POST /verificar
 * Delega para o controller; não contém lógica de negócio.
 */
import verificarController from "../src/controllers/verificar.js";

export default verificarController;
