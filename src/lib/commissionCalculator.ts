import { PaymentInstallment, RegraComissao, InstallmentTypeConfig } from "../types";

export interface CommissionResult {
  comissaoTotal: number;
  fluxo: Array<PaymentInstallment & { tipo_fluxo: 'PROTEGIDA' | 'ELEGÍVEL', valorLiquido: number }>;
  fluxoConsolidado: Array<PaymentInstallment & { tipo_fluxo: 'PROTEGIDA' | 'ELEGÍVEL', valorLiquido: number }>;
  saldoComissaoRestante: number;
  isViavel: boolean;
}

export function processarProposta(
  parcelas: PaymentInstallment[],
  percentualComissao: number,
  regras?: RegraComissao[],
  typeConfigs?: InstallmentTypeConfig[],
  formaPagamento?: string
): CommissionResult {
  const percentual = percentualComissao / 100;
  const protegidasBase = ["financiamento", "fgts", "subsídio", "bancário", "instituição", "inadimplemento"];
  
  // 1. Cálculo da Comissão Total - Excludes 'INADIMPLIMENTO' from the basis for commission calculation
  const valorVenda = parcelas
    .filter(p => !(p.tipo || '').toLowerCase().includes('inadimplemento'))
    .reduce((acc, p) => acc + (p.valorTotal || 0), 0);
  const comissaoTotal = valorVenda * percentual;
  
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

      flattened.push({
        ...p,
        quantidade: 1,
        vencimento,
        valorTotal: p.valorUnitario 
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
    const valorOriginal = p.valorTotal || 0;
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
        limiteDeducao = (valorOriginal * regraMatch.valor_deducao) / 100;
      } else {
        limiteDeducao = regraMatch.valor_deducao;
      }

      if (saldoComissao > 0) {
        const deducaoEfetiva = Math.min(valorOriginal, limiteDeducao, saldoComissao);
        valorLiquido = valorOriginal - deducaoEfetiva;
        saldoComissao -= deducaoEfetiva;
      }
    } else if (protegidasBase.some(ref => nomeClean.includes(ref))) {
      tipoFluxo = "PROTEGIDA";
      valorLiquido = valorOriginal;
    } else {
      // Logic for fallback: if no rule and not protected, it's 100% eligible
      tipoFluxo = "ELEGÍVEL";
      if (saldoComissao > 0) {
        const deducao = Math.min(valorOriginal, saldoComissao);
        valorLiquido = valorOriginal - deducao;
        saldoComissao -= deducao;
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

  return {
    comissaoTotal,
    fluxo,
    fluxoConsolidado,
    saldoComissaoRestante: saldoComissao,
    isViavel: saldoComissao <= 0.01
  };
}
