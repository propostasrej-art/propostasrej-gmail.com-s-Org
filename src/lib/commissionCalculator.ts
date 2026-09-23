import { PaymentInstallment, RegraComissao, InstallmentTypeConfig } from "../types";

export interface CondicaoPagamentoItem {
  quantidade: number;
  tipo: string;
  valorUnitario: number;
  vencimento: string;
  vencimentoFinal: string;
  valorTotal: number;
}

export interface CommissionResult {
  comissaoTotal: number;
  fluxo: Array<PaymentInstallment & { tipo_fluxo: 'PROTEGIDA' | 'ELEGÍVEL', valorLiquido: number }>;
  fluxoConsolidado: Array<PaymentInstallment & { tipo_fluxo: 'PROTEGIDA' | 'ELEGÍVEL', valorLiquido: number }>;
  saldoComissaoRestante: number;
  isViavel: boolean;
  condicaoPreco: CondicaoPagamentoItem[];
  condicaoComissao: CondicaoPagamentoItem[];
}

/**
 * Verifica se uma parcela deve ser excluída da base de cálculo das comissões.
 * Conforme regra de negócio: parcelas dos tipos "Bonus Repasse", "Bônus Adimplimento"
 * e "Inadimplemento" não integram a base de cálculo de comissões.
 */
export function isExcludedFromCommissionBase(tipo?: string): boolean {
  if (!tipo || typeof tipo !== 'string') return false;
  const norm = tipo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  // Bônus Repasse ("bonus repasse", "repasse de bonus", etc.)
  if (norm.includes('bonus') && norm.includes('repasse')) return true;
  if (norm.includes('bonus repasse') || norm.includes('repasse bonus')) return true;

  // Bônus Adimplimento / Adimplimento / Inadimplemento ("bonus adimplimento", "adimplimento", "inadimplemento", etc.)
  if (norm.includes('adimpl') || norm.includes('inadimpl')) return true;

  return false;
}

export function processarProposta(
  parcelas: PaymentInstallment[],
  percentualComissao: number,
  regras?: RegraComissao[],
  typeConfigs?: InstallmentTypeConfig[],
  formaPagamento?: string,
  valorTotalProposta?: number
): CommissionResult {
  const percentual = percentualComissao / 100;
  const protegidasBase = ["financiamento", "fgts", "subsídio", "bancário", "instituição", "inadimplemento", "bonus repasse", "adimplimento"];
  
  // 1. Cálculo da Comissão Total - Parcelas do tipo Bonus Repasse e Bônus Adimplimento/Inadimplemento não integram a base de cálculo
  const sumExcluded = parcelas
    .filter(p => isExcludedFromCommissionBase(p.tipo))
    .reduce((acc, p) => acc + (p.valorTotal || (p.quantidade ? p.quantidade * (p.valorUnitario || 0) : p.valorUnitario) || 0), 0);

  const sumAllParcelas = parcelas.reduce(
    (acc, p) => acc + (p.valorTotal || (p.quantidade ? p.quantidade * (p.valorUnitario || 0) : p.valorUnitario) || 0),
    0
  );

  // A base da comissão na Simulação de Fluxo Líquido deve corresponder exatamente ao resultado do valor calculado
  // das parcelas da proposta (ou valorTotalProposta se não houver parcelas cadastradas), subtraídas as exclusões.
  const baseCalculada = sumAllParcelas > 0 ? sumAllParcelas : (valorTotalProposta && valorTotalProposta > 0 ? valorTotalProposta : 0);
  const baseVendaTotal = Math.max(0, Number((baseCalculada - sumExcluded).toFixed(2)));

  const comissaoTotal = Number((baseVendaTotal * percentual).toFixed(2));
  
  // Se o pagamento for por NOTA (NF/REPASSE), não deduzimos as parcelas.
  // O valor líquido das parcelas será igual ao bruto.
  // Somente deduzimos se for "PAGADORIA" ou "PAGADORIA INCORPORADOR".
  const deveDeduzir = !formaPagamento || formaPagamento === 'PAGADORIA' || formaPagamento === 'PAGADORIA INCORPORADOR';
  
  let saldoComissao = deveDeduzir ? comissaoTotal : 0;

  // 2. Data Parsing Utility
  const parseDate = (dateStr: string) => {
    if (!dateStr) return new Date(8640000000000000);
    const parts = dateStr.split(/[-/]/);
    if (parts.length === 3) {
      const p0 = parseInt(parts[0], 10);
      const p1 = parseInt(parts[1], 10);
      const p2 = parseInt(parts[2], 10);
      if (parts[0].length === 4) {
        // Formato YYYY-MM-DD
        return new Date(p0, p1 - 1, p2, 12, 0, 0);
      }
      // Formato DD/MM/YYYY
      return new Date(p2, p1 - 1, p0, 12, 0, 0);
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      // Definir meio-dia para datas genéricas também para evitar flutuação de timezone
      d.setHours(12, 0, 0, 0);
      return d;
    }
    return new Date(8640000000000000);
  };

  // 3. Achatar parcelas (Expandir quantidade > 1)
  const flattened: PaymentInstallment[] = [];
  parcelas.forEach(p => {
    const qty = p.quantidade || 1;
    const tipoLower = (p.tipo || "").toLowerCase();
    
    // Detectar periodicidade
    let monthsIncrease = 1;
    
    // 1. Verificar configurações dinâmicas
    const configMatch = typeConfigs?.find(cfg => 
      tipoLower.includes(cfg.descricao.toLowerCase())
    );

    if (configMatch) {
      monthsIncrease = configMatch.periodicidade;
    } else {
      // 2. Fallback para nomes padrões
      if (tipoLower.includes('anual')) monthsIncrease = 12;
      else if (tipoLower.includes('semestral')) monthsIncrease = 6;
      else if (tipoLower.includes('trimestral') || tipoLower.includes('trimetral')) monthsIncrease = 3;
    }

      const valorTotalLinha = p.valorTotal || (p.quantidade ? p.quantidade * (p.valorUnitario || 0) : p.valorUnitario) || 0;
      const valorUnitarioCalculado = qty > 0 ? Number((valorTotalLinha / qty).toFixed(2)) : 0;
      let somaUnidadesLinha = 0;

      for (let i = 0; i < qty; i++) {
        let vencimento = p.vencimento;
        
        // Incrementar mês se qty > 1
        if (i > 0 && p.vencimento) {
          const originalDate = parseDate(p.vencimento);
          if (!isNaN(originalDate.getTime()) && originalDate.getTime() < 8640000000000000) {
            const originalDay = originalDate.getDate();
            const startMonth = originalDate.getMonth();
            const startYear = originalDate.getFullYear();
            
            const totalMonths = startMonth + (i * monthsIncrease);
            const targetYear = startYear + Math.floor(totalMonths / 12);
            const targetMonth = totalMonths % 12;
            
            // Obter número máximo de dias no mês/ano de destino
            const daysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
            
            const isLeapYear = (year: number) => (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
            
            let targetDay = originalDay;
            if (targetMonth === 1) { // Fevereiro
              if (isLeapYear(targetYear)) {
                // Em ano bissexto, limitamos ao dia 29
                targetDay = Math.min(originalDay, 29);
              } else {
                // Em ano comum, limitamos ao dia 28
                targetDay = Math.min(originalDay, 28);
              }
            } else {
              // Em outros meses, manter o dia da parcela inicial (limitado apenas se o mês tiver menos dias, ex: dia 31 em abril limita a 30)
              targetDay = Math.min(originalDay, daysInTargetMonth);
            }
            
            const targetDate = new Date(targetYear, targetMonth, targetDay);
            const day = String(targetDate.getDate()).padStart(2, '0');
            const month = String(targetDate.getMonth() + 1).padStart(2, '0');
            const year = targetDate.getFullYear();
            vencimento = `${day}/${month}/${year}`;
          }
        }

        let valorItem = valorUnitarioCalculado;
        if (i === qty - 1) {
          valorItem = Number((valorTotalLinha - somaUnidadesLinha).toFixed(2));
        } else {
          somaUnidadesLinha = Number((somaUnidadesLinha + valorItem).toFixed(2));
        }

        flattened.push({
          ...p,
          quantidade: 1,
          vencimento,
          valorUnitario: valorItem,
          valorTotal: valorItem
        });
      }
    });

  // 4. Ordenação Cronológica
  const parcelasOrdenadas = flattened.sort((a, b) => 
    parseDate(a.vencimento).getTime() - parseDate(b.vencimento).getTime()
  );

  // 5. Simulação de Fluxo
  const fluxo = parcelasOrdenadas.map(p => {
    const nomeClean = (p.tipo || "").toLowerCase();
    const valorOriginal = Number((p.valorTotal || 0).toFixed(2));
    let tipoFluxo: 'PROTEGIDA' | 'ELEGÍVEL' = 'ELEGÍVEL';
    let valorLiquido = valorOriginal;

    // Check for custom rules
    const regraMatch = regras?.find(r => 
      r.parcela && nomeClean.includes(r.parcela.toLowerCase())
    );

    if (regraMatch) {
      tipoFluxo = "ELEGÍVEL";
      let limiteDeducao = 0;
      if (regraMatch.tipo_deducao === 'PERCENTUAL') {
        limiteDeducao = Number(((valorOriginal * regraMatch.valor_deducao) / 100).toFixed(2));
      } else {
        limiteDeducao = Number((regraMatch.valor_deducao || 0).toFixed(2));
      }

      if (saldoComissao > 0) {
        const deducaoEfetiva = Number(Math.min(valorOriginal, limiteDeducao, saldoComissao).toFixed(2));
        valorLiquido = Number((valorOriginal - deducaoEfetiva).toFixed(2));
        saldoComissao = Number((saldoComissao - deducaoEfetiva).toFixed(2));
        if (saldoComissao < 0.005) saldoComissao = 0;
      }
    } else if (protegidasBase.some(ref => nomeClean.includes(ref)) || isExcludedFromCommissionBase(nomeClean)) {
      tipoFluxo = "PROTEGIDA";
      valorLiquido = valorOriginal;
    } else {
      // Logic for fallback: if no rule and not protected, it's 100% eligible
      tipoFluxo = "ELEGÍVEL";
      if (saldoComissao > 0) {
        const deducao = Number(Math.min(valorOriginal, saldoComissao).toFixed(2));
        valorLiquido = Number((valorOriginal - deducao).toFixed(2));
        saldoComissao = Number((saldoComissao - deducao).toFixed(2));
        if (saldoComissao < 0.005) saldoComissao = 0;
      }
    }

    return {
      ...p,
      tipo_fluxo: tipoFluxo,
      valorLiquido
    };
  });

  // 6. Fluxo Consolidado (Agrupado por tipo original)
  const fluxoConsolidado = parcelas.map(p => {
    const nomeClean = (p.tipo || "").toLowerCase();
    const matches = fluxo.filter(f => f.tipo === p.tipo && f.valorUnitario === p.valorUnitario);
    
    // Sum components
    const totalBruto = matches.reduce((acc, f) => acc + f.valorTotal, 0);
    const totalLiquido = matches.reduce((acc, f) => acc + f.valorLiquido, 0);
    const tipoFluxo = matches.length > 0 ? matches[0].tipo_fluxo : 'ELEGÍVEL';

    return {
      ...p,
      tipo_fluxo: tipoFluxo as 'PROTEGIDA' | 'ELEGÍVEL',
      valorLiquido: totalLiquido
    };
  });

  const condicaoPreco = extrairCondicaoPagamentoDoFluxo(fluxo, 'preco');
  const condicaoComissao = extrairCondicaoPagamentoDoFluxo(fluxo, 'comissao');

  return {
    comissaoTotal,
    fluxo,
    fluxoConsolidado,
    saldoComissaoRestante: saldoComissao,
    isViavel: saldoComissao <= 0.01,
    condicaoPreco,
    condicaoComissao
  };
}

/**
 * Agrupa as parcelas do fluxo cronológico detalhado gerando a Condição de Pagamento
 * (seja do Preço/Líquido ou das Comissões) com prazos, quantidades e valores reais.
 */
export function extrairCondicaoPagamentoDoFluxo(
  fluxo: Array<{
    tipo: string;
    vencimento: string;
    valorTotal: number;
    valorLiquido: number;
  }>,
  campo: 'preco' | 'comissao'
): CondicaoPagamentoItem[] {
  if (!fluxo || fluxo.length === 0) return [];

  const parcelasValidas = fluxo
    .map(p => {
      const valor = campo === 'preco'
        ? Number((p.valorLiquido || 0).toFixed(2))
        : Number(Math.max(0, (p.valorTotal || 0) - (p.valorLiquido || 0)).toFixed(2));
      return {
        tipo: p.tipo,
        vencimento: p.vencimento || '',
        valor
      };
    })
    .filter(p => p.valor > 0.005);

  if (parcelasValidas.length === 0) return [];

  const grupos: CondicaoPagamentoItem[] = [];
  let grupoAtual: CondicaoPagamentoItem | null = null;

  for (const item of parcelasValidas) {
    if (
      grupoAtual &&
      grupoAtual.tipo.trim().toLowerCase() === item.tipo.trim().toLowerCase() &&
      Math.abs(grupoAtual.valorUnitario - item.valor) < 0.02
    ) {
      grupoAtual.quantidade += 1;
      grupoAtual.vencimentoFinal = item.vencimento;
      grupoAtual.valorTotal = Number((grupoAtual.valorTotal + item.valor).toFixed(2));
    } else {
      if (grupoAtual) {
        grupos.push(grupoAtual);
      }
      grupoAtual = {
        quantidade: 1,
        tipo: item.tipo,
        valorUnitario: item.valor,
        vencimento: item.vencimento,
        vencimentoFinal: item.vencimento,
        valorTotal: item.valor
      };
    }
  }

  if (grupoAtual) {
    grupos.push(grupoAtual);
  }

  return grupos;
}
