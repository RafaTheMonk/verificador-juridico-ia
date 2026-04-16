/**
 * Health check - GET /
 */
export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    service: "verificador-juridico-ia",
    version: "0.1.0",
    endpoints: {
      "POST /verificar": "Verifica uma referência jurídica + contexto",
    },
    exemplo: {
      method: "POST",
      path: "/verificar",
      body: {
        referencia: "REsp 1.810.170/RS",
        contexto: "... (trecho da petição) ...",
      },
    },
  });
}
