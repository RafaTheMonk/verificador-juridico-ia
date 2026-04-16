/**
 * Mapeamento de códigos TPU (Tabela Processual Unificada) do CNJ
 * para flags interpretáveis pelo verificador.
 *
 * Fonte: https://www.cnj.jus.br/sgt/consulta_publica_movimentos.php
 * Selecionamos inicialmente os códigos mais críticos para distinguir
 * entre "precedente utilizável" e "processo sem valor precedencial".
 */

export const TPU_FLAGS = {
  // Extinções sem mérito — tornam o precedente INÚTIL para sustentar tese
  22:  { flag: "EXTINTO_SEM_MERITO", label: "Homologação de desistência do pedido" },
  237: { flag: "EXTINTO_SEM_MERITO", label: "Extinção sem resolução de mérito" },
  26:  { flag: "EXTINTO_SEM_MERITO", label: "Arquivamento" },

  // Processamento e publicação
  848: { flag: "TEM_ACORDAO", label: "Acórdão publicado" },
  900: { flag: "SENTENCA_PUBLICADA", label: "Sentença" },
  904: { flag: "TRANSITADO", label: "Trânsito em julgado" },

  // Admissibilidade negativa — típicas do STJ
  196: { flag: "NAO_CONHECIDO", label: "Não-conhecimento" },
  242: { flag: "NAO_CONHECIDO", label: "Juízo de admissibilidade negativo" },

  // Provimentos
  219: { flag: "PROVIDO", label: "Provimento" },
  220: { flag: "IMPROVIDO", label: "Não-provimento" },
  221: { flag: "PARCIALMENTE_PROVIDO", label: "Provimento parcial" },
};

/**
 * Extrai flags das movimentações retornadas pelo Datajud.
 * O Datajud retorna `movimentos: [{ codigo, nome, dataHora, complementosTabelados? }]`.
 */
export function flagsFromMovimentos(movimentos = []) {
  if (!Array.isArray(movimentos)) return [];
  const flags = new Set();
  const detalhes = [];

  for (const m of movimentos) {
    const codigo = typeof m?.codigo === "number" ? m.codigo : parseInt(m?.codigo, 10);
    if (Number.isNaN(codigo)) continue;
    const entry = TPU_FLAGS[codigo];
    if (entry) {
      flags.add(entry.flag);
      detalhes.push({
        codigo,
        flag: entry.flag,
        nome: m.nome || entry.label,
        dataHora: m.dataHora || null,
      });
    }
  }

  return { flags: [...flags], detalhes };
}

/**
 * Infere o dispositivo da decisão a partir das flags TPU.
 * Retorna uma das strings: PROVIDO, IMPROVIDO, PARCIALMENTE_PROVIDO,
 * NAO_CONHECIDO, EXTINTO_SEM_MERITO ou null.
 */
export function inferirDispositivo(flagsList) {
  const s = new Set(flagsList);
  if (s.has("EXTINTO_SEM_MERITO")) return "EXTINTO_SEM_MERITO";
  if (s.has("NAO_CONHECIDO")) return "NAO_CONHECIDO";
  if (s.has("PROVIDO")) return "PROVIDO";
  if (s.has("IMPROVIDO")) return "IMPROVIDO";
  if (s.has("PARCIALMENTE_PROVIDO")) return "PARCIALMENTE_PROVIDO";
  return null;
}
