import { PaymentInstallment } from "../types";
import { isExcludedFromCommissionBase } from "./commissionCalculator";

export interface WaterfallParticipant {
  role: string;
  name: string;
  percentage: number; // Taxa de Comissão do Cargo sobre o VGV (p_j)
  percentageOnInstallment?: number; // Percentual sobre a parcela / Coeficiente no fluxo (w_j)
  deduction?: number; // Compatibilidade com campo anterior
  cap: number; // Teto financeiro nominal individual (T_j = VGV * p_j / quantidade)
  received: number; // Recebido acumulado
  balance: number; // Saldo devedor restante (T_j - received)
  hideAndSum?: boolean; // Se deve ocultar o cargo e somar na Imobiliária
  priorityRule?: 'ATO_FULL' | 'ANTECIPADO' | 'ORDINARIO'; // Regra de exceção/prioridade
  tier?: 1 | 2 | 3; // 1: Apoio/Diretorias, 2: Liderança Operacional, 3: Operacional de Vendas
}

export interface WaterfallInstallmentResult {
  vencimento: string;
  tipo: string;
  valorParcela: number;
  valorRetido: number;
  distribuicao: { [label: string]: number };
}

export interface WaterfallResult {
  vendaTotal: number;
  comissaoTotal: number;
  participantes: WaterfallParticipant[];
  detalhesParcelas: WaterfallInstallmentResult[];
  saldoRestanteComissao: number;
}

export function isImobiliariaRole(role: string): boolean {
  if (!role) return false;
  const normalized = role.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  return normalized.includes('imobiliaria');
}

export function getParticipantTier(role: string): 1 | 2 | 3 {
  if (!role) return 3;
  const norm = role.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (norm.includes('juridico') || norm.includes('imobiliaria') || norm.includes('diretor')) {
    return 1; // Tier 1: Apoio e Estrutura / Diretorias
  }
  if (norm.includes('gerente') || norm.includes('coordenador') || norm.includes('supervisor')) {
    return 2; // Tier 2: Liderança Operacional
  }
  return 3; // Tier 3: Operacional de Vendas / Rateio Residual
}

export function isAtoIntegralException(role: string, priorityRule?: string): boolean {
  if (priorityRule === 'ATO_FULL' || priorityRule === 'ANTECIPADO') return true;
  if (!role) return false;
  const norm = role.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  return norm.includes('juridico');
}

export function calcularRateioCascata(
  vendaTotal: number,
  percentualComissaoTotal: number,
  fluxoPagamentos: PaymentInstallment[],
  formaPagamento?: string,
  configParticipantes?: { role: string; name: string; percentage: number; deduction?: number; hideAndSum?: boolean; priorityRule?: 'ATO_FULL' | 'ANTECIPADO' | 'ORDINARIO'; tier?: 1 | 2 | 3 }[],
  regrasComissao?: any[]
): WaterfallResult {
  // 1. Inicializar e Expandir Participantes (Cargos e nomes individuais)
  const participantesBase = configParticipantes || [
    { role: 'Corretor', name: '', percentage: 2.50, deduction: 0 },
    { role: 'Gerente', name: '', percentage: 0.50, deduction: 0 },
    { role: 'Diretor de Vendas', name: '', percentage: 0.20, deduction: 0 },
    { role: 'Diretor Comercial 1', name: '', percentage: 0.40, deduction: 0 },
    { role: 'Diretor Comercial 3', name: '', percentage: 0.40, deduction: 0 },
    { role: 'Jurídico', name: '', percentage: 0.10, deduction: 0, priorityRule: 'ATO_FULL' as const },
    { role: 'Imobiliária', name: '', percentage: 0.90, deduction: 0 },
  ];

  const sumCargosPerc = Number(participantesBase.reduce((acc, p) => acc + (Number(p.percentage) || 0), 0).toFixed(4));
  const effectivePercentualComissao = percentualComissaoTotal > 0 ? percentualComissaoTotal : sumCargosPerc;
  const comissaoTotal = Number((vendaTotal * (effectivePercentualComissao / 100)).toFixed(2));

  // Se houver diferença entre a alíquota configurada nos cargos e o percentual efetivo,
  // ajustamos a escala para que a soma dos tetos contratuais corresponda exatamente ao resultado da comissão calculada
  const scaleRatio = (sumCargosPerc > 0 && effectivePercentualComissao > 0 && Math.abs(sumCargosPerc - effectivePercentualComissao) > 0.0001)
    ? (effectivePercentualComissao / sumCargosPerc)
    : 1;

  const participantes: WaterfallParticipant[] = [];

  participantesBase.forEach(p => {
    const names = p.name ? p.name.split(',').map(n => n.trim()).filter(Boolean) : [];
    const qty = names.length > 0 ? names.length : 1;
    
    const percentageIndividual = Number(((p.percentage * scaleRatio) / qty).toFixed(4));
    const percentageOnInstallmentIndividual = Number(((p.deduction ?? 0) / qty).toFixed(4));
    const capIndividual = Number((vendaTotal * (percentageIndividual / 100)).toFixed(2));
    const tier = p.tier || getParticipantTier(p.role);
    const priorityRule = p.priorityRule || (isAtoIntegralException(p.role, p.priorityRule) ? 'ATO_FULL' : 'ORDINARIO');

    if (names.length > 0) {
      names.forEach(name => {
        participantes.push({
          role: p.role,
          name: name,
          percentage: percentageIndividual,
          percentageOnInstallment: percentageOnInstallmentIndividual,
          deduction: percentageOnInstallmentIndividual,
          cap: capIndividual,
          received: 0,
          balance: capIndividual,
          hideAndSum: p.hideAndSum || false,
          priorityRule,
          tier
        });
      });
    } else {
      participantes.push({
        role: p.role,
        name: '',
        percentage: Number((p.percentage * scaleRatio).toFixed(4)),
        percentageOnInstallment: p.deduction ?? 0,
        deduction: p.deduction ?? 0,
        cap: capIndividual,
        received: 0,
        balance: capIndividual,
        hideAndSum: p.hideAndSum || false,
        priorityRule,
        tier
      });
    }
  });

  // Ajustar eventual resíduo de centavos no somatório dos tetos individuais para bater 100% com a comissão total
  const sumCaps = Number(participantes.reduce((acc, p) => acc + p.cap, 0).toFixed(2));
  const diffCaps = Number((comissaoTotal - sumCaps).toFixed(2));
  if (Math.abs(diffCaps) > 0 && participantes.length > 0) {
    const pToAdjust = participantes.find(p => isImobiliariaRole(p.role)) || participantes[participantes.length - 1];
    pToAdjust.cap = Number((pToAdjust.cap + diffCaps).toFixed(2));
    pToAdjust.balance = pToAdjust.cap;
  }

  let saldoDevedorGlobal = comissaoTotal;
  const detalhesParcelas: WaterfallInstallmentResult[] = [];

  // Caso Especial: NF/REPASSE (Mantém o comportamento de quitação única)
  if (formaPagamento === 'NF/Repasse' || formaPagamento === 'NF/REPASSE') {
    const protegidasBase = ["financiamento", "fgts", "subsídio", "bancário", "instituição"];
    const parcelaFinan = fluxoPagamentos.find(p => 
      protegidasBase.some(ref => (p.tipo || "").toLowerCase().includes(ref))
    );
    
    const vencimentoFinal = parcelaFinan?.vencimento || 
      (fluxoPagamentos.length > 0 ? fluxoPagamentos[fluxoPagamentos.length - 1].vencimento : "A DEFINIR");
    
    const distribuicao: { [label: string]: number } = {};
    
    participantes.forEach(p => {
      const label = p.name ? `${p.role} - ${p.name}` : p.role;
      const valorEfetivo = Number(Math.min(p.cap, saldoDevedorGlobal).toFixed(2));
      p.received = valorEfetivo;
      p.balance = Number((p.cap - valorEfetivo).toFixed(2));
      saldoDevedorGlobal = Number((saldoDevedorGlobal - valorEfetivo).toFixed(2));
      distribuicao[label] = valorEfetivo;
    });

    detalhesParcelas.push({
      vencimento: vencimentoFinal,
      tipo: "NF/REPASSE (QUITAÇÃO ÚNICA)",
      valorParcela: comissaoTotal,
      valorRetido: comissaoTotal,
      distribuicao
    });

    const resultadoNF: WaterfallResult = {
      vendaTotal,
      comissaoTotal,
      participantes,
      detalhesParcelas,
      saldoRestanteComissao: saldoDevedorGlobal
    };
    return obterRateioConsolidado(resultadoNF) || resultadoNF;
  }

  // Processar Parcelas em Ordem Cronológica (Dedução realística e amortização dinâmica)
  const protegidasBase = ["financiamento", "fgts", "subsídio", "bancário", "instituição", "inadimplemento", "bonus repasse", "adimplimento"];
  let jaExecutouExcecaoAto = false;

  fluxoPagamentos.forEach((parcela) => {
    const tipo = (parcela.tipo || "").toLowerCase();
    
    // Ignorar parcelas que não integram a base de comissão
    if (isExcludedFromCommissionBase(tipo)) {
      detalhesParcelas.push({
        vencimento: parcela.vencimento,
        tipo: parcela.tipo,
        valorParcela: parcela.valorTotal || 0,
        valorRetido: 0,
        distribuicao: {}
      });
      return;
    }

    if (saldoDevedorGlobal <= 0) {
      detalhesParcelas.push({
        vencimento: parcela.vencimento,
        tipo: parcela.tipo,
        valorParcela: parcela.valorTotal || 0,
        valorRetido: 0,
        distribuicao: {}
      });
      return;
    }

    const valorParcela = parcela.valorTotal || 0;

    // Calcular o teto de dedução da parcela (T)
    let tetoParcela = valorParcela; // Default: 100% de capacidade nominal
    if (protegidasBase.some(ref => tipo.includes(ref)) || isExcludedFromCommissionBase(tipo)) {
      tetoParcela = 0; // Protegida: 0%
    } else if (regrasComissao) {
      const regraMatch = regrasComissao.find(r => r.parcela && tipo.includes(r.parcela.toLowerCase()));
      if (regraMatch) {
        if (regraMatch.tipo_deducao === 'PERCENTUAL') {
          tetoParcela = (valorParcela * regraMatch.valor_deducao) / 100;
        } else {
          tetoParcela = regraMatch.valor_deducao;
        }
      }
    }
    tetoParcela = Number(Math.max(0, tetoParcela).toFixed(2));

    // Capacidade de retenção do evento: Retencao_i = min(Parcela_i * D, SaldoDevedor_{i-1})
    let capacidadeRetencaoEvento = Number(Math.min(tetoParcela, saldoDevedorGlobal).toFixed(2));
    const distribuicao: { [label: string]: number } = {};

    if (capacidadeRetencaoEvento <= 0) {
      detalhesParcelas.push({
        vencimento: parcela.vencimento,
        tipo: parcela.tipo,
        valorParcela,
        valorRetido: 0,
        distribuicao: {}
      });
      return;
    }

    // 2. Execução da Matriz de Exceções e Prioridades (ex.: Jurídico liquidado 100% no Ato)
    const credoresExcecao = participantes.filter(p => 
      isAtoIntegralException(p.role, p.priorityRule) && p.balance > 0.005
    );

    if (credoresExcecao.length > 0 && capacidadeRetencaoEvento > 0.005) {
      credoresExcecao.forEach(p => {
        if (capacidadeRetencaoEvento <= 0.005) return;
        const label = p.name ? `${p.role} - ${p.name}` : p.role;
        const quotaExcecao = Number(Math.min(p.balance, capacidadeRetencaoEvento).toFixed(2));
        if (quotaExcecao > 0) {
          p.received = Number((p.received + quotaExcecao).toFixed(2));
          p.balance = Number((p.cap - p.received).toFixed(2));
          distribuicao[label] = Number(((distribuicao[label] || 0) + quotaExcecao).toFixed(2));
          capacidadeRetencaoEvento = Number((capacidadeRetencaoEvento - quotaExcecao).toFixed(2));
          saldoDevedorGlobal = Number((saldoDevedorGlobal - quotaExcecao).toFixed(2));
        }
      });
      if (participantes.filter(p => isAtoIntegralException(p.role, p.priorityRule) && p.balance > 0.005).length === 0) {
        jaExecutouExcecaoAto = true;
      }
    }

    // 3. Fase A: Dedução obedecendo o Percentual da Parcela (percentageOnInstallment / deduction)
    const participantesComPercentual = participantes.filter(p => {
      const pOnInstallment = p.percentageOnInstallment ?? (p.deduction ?? 0);
      return pOnInstallment > 0 && p.balance > 0.005;
    });

    if (participantesComPercentual.length > 0 && capacidadeRetencaoEvento > 0.005) {
      let desejadoComPercentualTotal = 0;
      const desejadoPorParticipante: { [label: string]: number } = {};

      participantesComPercentual.forEach(p => {
        const label = p.name ? `${p.role} - ${p.name}` : p.role;
        const pOnInstallment = p.percentageOnInstallment ?? (p.deduction ?? 0);
        const desejado = Number(Math.min(valorParcela * (pOnInstallment / 100), p.balance).toFixed(2));
        desejadoPorParticipante[label] = desejado;
        desejadoComPercentualTotal = Number((desejadoComPercentualTotal + desejado).toFixed(2));
      });

      const valorComPercentualRetido = Number(Math.min(desejadoComPercentualTotal, capacidadeRetencaoEvento).toFixed(2));

      if (desejadoComPercentualTotal > 0 && valorComPercentualRetido > 0) {
        const fator = valorComPercentualRetido / desejadoComPercentualTotal;
        let somaDistribuida = 0;

        participantesComPercentual.forEach(p => {
          const label = p.name ? `${p.role} - ${p.name}` : p.role;
          const desejado = desejadoPorParticipante[label] || 0;
          const repasse = Number(Math.min(Number((desejado * fator).toFixed(2)), p.balance).toFixed(2));
          if (repasse > 0) {
            distribuicao[label] = Number(((distribuicao[label] || 0) + repasse).toFixed(2));
            p.received = Number((p.received + repasse).toFixed(2));
            p.balance = Number((p.cap - p.received).toFixed(2));
            somaDistribuida = Number((somaDistribuida + repasse).toFixed(2));
          }
        });

        const diffCentavos = Number((valorComPercentualRetido - somaDistribuida).toFixed(2));
        if (Math.abs(diffCentavos) > 0 && Math.abs(diffCentavos) <= 0.05) {
          const pAjuste = participantesComPercentual.find(p => p.balance >= diffCentavos && (distribuicao[p.name ? `${p.role} - ${p.name}` : p.role] || 0) > 0) || participantesComPercentual[0];
          if (pAjuste && pAjuste.balance >= diffCentavos) {
            const label = pAjuste.name ? `${pAjuste.role} - ${pAjuste.name}` : pAjuste.role;
            distribuicao[label] = Number(((distribuicao[label] || 0) + diffCentavos).toFixed(2));
            pAjuste.received = Number((pAjuste.received + diffCentavos).toFixed(2));
            pAjuste.balance = Number((pAjuste.cap - pAjuste.received).toFixed(2));
            somaDistribuida = Number((somaDistribuida + diffCentavos).toFixed(2));
          }
        }

        saldoDevedorGlobal = Number((saldoDevedorGlobal - somaDistribuida).toFixed(2));
        capacidadeRetencaoEvento = Number((capacidadeRetencaoEvento - somaDistribuida).toFixed(2));
      }
    }

    // 4. Fase B: Distribuição Ordinária Proporcional aos Coeficientes Contratuais (w_{j, fluxo} = p_j / sum(p_k))
    // Conforme AGENTS.md: O passivo da comissão é distribuído ordinariamente proporcional às alíquotas contratuais dos cargos
    let saldoRestanteParcela = Number(Math.min(capacidadeRetencaoEvento, saldoDevedorGlobal).toFixed(2));

    if (saldoRestanteParcela > 0.005) {
      let participantesOrdinarios = participantes.filter(p => {
        const pOnInstallment = p.percentageOnInstallment ?? (p.deduction ?? 0);
        return (pOnInstallment <= 0) && p.balance > 0.005;
      });

      while (saldoRestanteParcela > 0.005 && participantesOrdinarios.length > 0) {
        const somaPesos = Number(participantesOrdinarios.reduce((acc, p) => acc + (p.percentage || 0), 0).toFixed(4));
        if (somaPesos <= 0.0001) {
          // Se todos os pesos forem 0, dividir igualmente
          const n = participantesOrdinarios.length;
          const quota = Number((saldoRestanteParcela / n).toFixed(2));
          for (const p of participantesOrdinarios) {
            if (saldoRestanteParcela <= 0.005) break;
            const repasse = Number(Math.min(quota || 0.01, p.balance, saldoRestanteParcela).toFixed(2));
            if (repasse > 0) {
              const label = p.name ? `${p.role} - ${p.name}` : p.role;
              p.received = Number((p.received + repasse).toFixed(2));
              p.balance = Number((p.cap - p.received).toFixed(2));
              distribuicao[label] = Number(((distribuicao[label] || 0) + repasse).toFixed(2));
              saldoRestanteParcela = Number((saldoRestanteParcela - repasse).toFixed(2));
              saldoDevedorGlobal = Number((saldoDevedorGlobal - repasse).toFixed(2));
              capacidadeRetencaoEvento = Number((capacidadeRetencaoEvento - repasse).toFixed(2));
            }
          }
          break;
        }

        let totalDistribuidoRodada = 0;
        let algumAtingiuTeto = false;

        for (const p of participantesOrdinarios) {
          if (saldoRestanteParcela <= 0.005) break;
          const proporcao = (p.percentage || 0) / somaPesos;
          const repasseProporcional = Number((saldoRestanteParcela * proporcao).toFixed(2));
          const repasse = Number(Math.min(repasseProporcional, p.balance, saldoRestanteParcela).toFixed(2));

          if (repasse > 0) {
            const label = p.name ? `${p.role} - ${p.name}` : p.role;
            p.received = Number((p.received + repasse).toFixed(2));
            p.balance = Number((p.cap - p.received).toFixed(2));
            distribuicao[label] = Number(((distribuicao[label] || 0) + repasse).toFixed(2));
            totalDistribuidoRodada = Number((totalDistribuidoRodada + repasse).toFixed(2));
            if (p.balance <= 0.005) {
              algumAtingiuTeto = true;
            }
          }
        }

        saldoRestanteParcela = Number((saldoRestanteParcela - totalDistribuidoRodada).toFixed(2));
        saldoDevedorGlobal = Number((saldoDevedorGlobal - totalDistribuidoRodada).toFixed(2));
        capacidadeRetencaoEvento = Number((capacidadeRetencaoEvento - totalDistribuidoRodada).toFixed(2));

        if (totalDistribuidoRodada <= 0.005 || !algumAtingiuTeto) {
          // Ajuste fino de centavos residuais entre os participantes ordinários
          if (saldoRestanteParcela > 0.005 && saldoRestanteParcela <= Number((participantesOrdinarios.length * 0.05).toFixed(2))) {
            for (const p of participantesOrdinarios) {
              if (saldoRestanteParcela <= 0.005) break;
              const centavo = Number(Math.min(0.01, p.balance, saldoRestanteParcela).toFixed(2));
              if (centavo > 0) {
                const label = p.name ? `${p.role} - ${p.name}` : p.role;
                p.received = Number((p.received + centavo).toFixed(2));
                p.balance = Number((p.cap - p.received).toFixed(2));
                distribuicao[label] = Number(((distribuicao[label] || 0) + centavo).toFixed(2));
                saldoRestanteParcela = Number((saldoRestanteParcela - centavo).toFixed(2));
                saldoDevedorGlobal = Number((saldoDevedorGlobal - centavo).toFixed(2));
                capacidadeRetencaoEvento = Number((capacidadeRetencaoEvento - centavo).toFixed(2));
              }
            }
          }
          break;
        }

        participantesOrdinarios = participantesOrdinarios.filter(p => p.balance > 0.005);
      }
    }

    // 5. Fase C: Roteamento de Sobras por Hierarquia de Absorção (Cascata de Grupos Adjacentes)
    // Conforme AGENTS.md: Apoio/Diretorias (Tier 1) -> Liderança Operacional (Tier 2) -> Rateio residual Corretor/Gerente (Tier 3)
    let saldoDisponivelSobra = Number(Math.min(capacidadeRetencaoEvento, saldoDevedorGlobal).toFixed(2));

    if (saldoDisponivelSobra > 0.005) {
      const tiers = [1, 2, 3] as const;

      for (const tierNum of tiers) {
        if (saldoDisponivelSobra <= 0.005) break;

        let membrosDoTier = participantes.filter(p => (p.tier || getParticipantTier(p.role)) === tierNum && p.balance > 0.005);
        if (membrosDoTier.length === 0) continue;

        while (saldoDisponivelSobra > 0.005 && membrosDoTier.length > 0) {
          const somaPesosTier = Number(membrosDoTier.reduce((acc, p) => acc + (p.percentage || 0), 0).toFixed(4));
          let absorvidoTier = 0;
          let algumAtingiuTetoTier = false;

          for (const p of membrosDoTier) {
            if (saldoDisponivelSobra <= 0.005) break;
            const proporcao = somaPesosTier > 0 ? (p.percentage || 0) / somaPesosTier : 1 / membrosDoTier.length;
            const repasseCalc = Number((saldoDisponivelSobra * proporcao).toFixed(2));
            const repasse = Number(Math.min(repasseCalc || 0.01, p.balance, saldoDisponivelSobra).toFixed(2));

            if (repasse > 0) {
              const label = p.name ? `${p.role} - ${p.name}` : p.role;
              p.received = Number((p.received + repasse).toFixed(2));
              p.balance = Number((p.cap - p.received).toFixed(2));
              distribuicao[label] = Number(((distribuicao[label] || 0) + repasse).toFixed(2));
              absorvidoTier = Number((absorvidoTier + repasse).toFixed(2));
              if (p.balance <= 0.005) algumAtingiuTetoTier = true;
            }
          }

          saldoDisponivelSobra = Number((saldoDisponivelSobra - absorvidoTier).toFixed(2));
          saldoDevedorGlobal = Number((saldoDevedorGlobal - absorvidoTier).toFixed(2));
          capacidadeRetencaoEvento = Number((capacidadeRetencaoEvento - absorvidoTier).toFixed(2));

          if (absorvidoTier <= 0.005 || !algumAtingiuTetoTier) {
            break;
          }

          membrosDoTier = membrosDoTier.filter(p => p.balance > 0.005);
        }
      }

      // Se ainda houver resíduo e qualquer participante tiver saldo em aberto, distribuir centavo a centavo
      if (saldoDisponivelSobra > 0.005) {
        const todosRestantes = participantes.filter(p => p.balance > 0.005);
        for (const p of todosRestantes) {
          if (saldoDisponivelSobra <= 0.005) break;
          const quota = Number(Math.min(p.balance, saldoDisponivelSobra).toFixed(2));
          if (quota > 0) {
            const label = p.name ? `${p.role} - ${p.name}` : p.role;
            p.received = Number((p.received + quota).toFixed(2));
            p.balance = Number((p.cap - p.received).toFixed(2));
            distribuicao[label] = Number(((distribuicao[label] || 0) + quota).toFixed(2));
            saldoDisponivelSobra = Number((saldoDisponivelSobra - quota).toFixed(2));
            saldoDevedorGlobal = Number((saldoDevedorGlobal - quota).toFixed(2));
            capacidadeRetencaoEvento = Number((capacidadeRetencaoEvento - quota).toFixed(2));
          }
        }
      }
    }

    // Calcular a retenção real final desta parcela
    const totalRetidoFinal = Number(Object.values(distribuicao).reduce((acc, v) => acc + (Number(v) || 0), 0).toFixed(2));

    detalhesParcelas.push({
      vencimento: parcela.vencimento,
      tipo: parcela.tipo,
      valorParcela,
      valorRetido: totalRetidoFinal,
      distribuicao
    });
  });

  const resultadoBruto: WaterfallResult = {
    vendaTotal,
    comissaoTotal,
    participantes,
    detalhesParcelas,
    saldoRestanteComissao: Number(saldoDevedorGlobal.toFixed(2))
  };

  return obterRateioConsolidado(resultadoBruto) || resultadoBruto;
}

export function obterRateioConsolidado(waterfall: WaterfallResult | null): WaterfallResult | null {
  if (!waterfall) return null;

  // Check if there are any participants marked as hideAndSum
  const hasHidden = waterfall.participantes.some(p => p.hideAndSum);
  if (!hasHidden) return waterfall;

  // Find the Imobiliária participant
  const imobiliariaIndex = waterfall.participantes.findIndex(p => isImobiliariaRole(p.role));

  const originalImobiliaria: WaterfallParticipant = imobiliariaIndex !== -1 
    ? waterfall.participantes[imobiliariaIndex]
    : {
        role: 'Imobiliária',
        name: '',
        percentage: 0,
        percentageOnInstallment: 0,
        deduction: 0,
        cap: 0,
        received: 0,
        balance: 0,
        hideAndSum: false
      };

  const imobiliariaLabel = originalImobiliaria.name 
    ? `${originalImobiliaria.role} - ${originalImobiliaria.name}` 
    : originalImobiliaria.role;

  // Create new list of participants
  const novosParticipantes: WaterfallParticipant[] = [];
  
  // We will accumulate values for Imobiliária
  let extraCap = 0;
  let extraReceived = 0;
  let extraBalance = 0;
  let extraPercentage = 0;

  waterfall.participantes.forEach((p, idx) => {
    if (imobiliariaIndex !== -1 && idx === imobiliariaIndex) {
      // We will add the accumulated values later
      return;
    }
    if (p.hideAndSum) {
      extraCap = Number((extraCap + p.cap).toFixed(2));
      extraReceived = Number((extraReceived + p.received).toFixed(2));
      extraBalance = Number((extraBalance + p.balance).toFixed(2));
      extraPercentage = Number((extraPercentage + p.percentage).toFixed(2));
    } else {
      novosParticipantes.push({ ...p });
    }
  });

  // Create consolidated Imobiliária participant
  const novaImobiliaria: WaterfallParticipant = {
    ...originalImobiliaria,
    cap: Number((originalImobiliaria.cap + extraCap).toFixed(2)),
    received: Number((originalImobiliaria.received + extraReceived).toFixed(2)),
    balance: Number((originalImobiliaria.balance + extraBalance).toFixed(2)),
    percentage: Number((originalImobiliaria.percentage + extraPercentage).toFixed(2)),
    hideAndSum: false
  };

  // Insert Imobiliária back at its relative index
  if (imobiliariaIndex !== -1) {
    let newImobiliariaIndex = imobiliariaIndex;
    for (let i = 0; i < imobiliariaIndex; i++) {
      if (waterfall.participantes[i].hideAndSum) {
        newImobiliariaIndex--;
      }
    }
    novosParticipantes.splice(Math.max(0, newImobiliariaIndex), 0, novaImobiliaria);
  } else {
    // If there was no Imobiliária participant, add at the beginning
    novosParticipantes.unshift(novaImobiliaria);
  }

  // Map detalhesParcelas to remove hidden roles and group their amounts into Imobiliária
  const novosDetalhesParcelas = waterfall.detalhesParcelas.map(det => {
    const novaDistribuicao: { [label: string]: number } = {};
    let extraDistValue = 0;

    Object.entries(det.distribuicao || {}).forEach(([label, value]) => {
      const valNum = Number(value) || 0;
      const part = waterfall.participantes.find(p => {
        const pLabel = p.name ? `${p.role} - ${p.name}` : p.role;
        return pLabel === label;
      });

      if (part) {
        if (part.hideAndSum) {
          extraDistValue = Number((extraDistValue + valNum).toFixed(2));
        } else if (!isImobiliariaRole(part.role)) {
          novaDistribuicao[label] = valNum;
        }
      } else {
        if (label !== imobiliariaLabel) {
          novaDistribuicao[label] = valNum;
        }
      }
    });

    const originalImobiliariaValueReal = Number(det.distribuicao?.[imobiliariaLabel]) || 0;
    const finalImobiliariaValue = Number((originalImobiliariaValueReal + extraDistValue).toFixed(2));
    
    novaDistribuicao[imobiliariaLabel] = finalImobiliariaValue;

    return {
      ...det,
      distribuicao: novaDistribuicao
    };
  });

  return {
    ...waterfall,
    participantes: novosParticipantes,
    detalhesParcelas: novosDetalhesParcelas
  };
}

export interface DiagnosticoEspecialista {
  secaoI: {
    vgv: number;
    taxaGlobal: number;
    passivoTotalComissao: number;
    somaAliquotas: number;
    consistenciaAliquotas: boolean;
    participantes: {
      role: string;
      name: string;
      label: string;
      aliquotaVGV: number; // p_j (%)
      tetoNominal: number; // T_j (R$)
      regraFluxo: number; // w_j (%)
      excecao: string;
      tier: number;
      tierLabel: string;
    }[];
  };
  secaoII: {
    linha: number;
    vencimento: string;
    tipo: string;
    parcelaBruta: number;
    deducaoAplicada: number;
    saldoIncorporador: number;
    saldoDevedorComissao: number;
  }[];
  secaoIII: {
    headers: string[];
    rows: {
      vencimento: string;
      tipo: string;
      valorRetido: number;
      distribuicao: { [col: string]: number };
    }[];
    totalRetido: number;
    totaisPorParticipante: { [col: string]: number };
    tetosPorParticipante: { [col: string]: number };
    statusConciliacao: '100% LIQUIDADO' | 'COBERTURA PARCIAL';
    saldoResidualGlobal: number;
  };
  secaoIV: {
    inflexoes: {
      participante: string;
      parcelaQuitacao: string;
      vencimento: string;
      eventoIndex: number;
      tetoAtingido: number;
    }[];
    rotasSobras: string[];
    liberacaoFluxoIntegral: {
      eventoIndex: number;
      parcela: string;
      vencimento: string;
      observacao: string;
    } | null;
  };
}

export function gerarDiagnosticoEspecialista(
  waterfall: WaterfallResult
): DiagnosticoEspecialista {
  const vgv = waterfall.vendaTotal;
  const passivoTotalComissao = waterfall.comissaoTotal;

  // Seção I: Memória de Cálculo e Parâmetros de Entrada
  const somaAliquotas = Number(
    waterfall.participantes.reduce((acc, p) => acc + p.percentage, 0).toFixed(4)
  );
  const taxaGlobal = Number(((passivoTotalComissao / (vgv || 1)) * 100).toFixed(4));
  const consistenciaAliquotas = Math.abs(somaAliquotas - taxaGlobal) < 0.05;

  const participantesSecaoI = waterfall.participantes.map(p => {
    const label = p.name ? `${p.role} - ${p.name}` : p.role;
    const tier = p.tier || getParticipantTier(p.role);
    const tierLabel = tier === 1 ? 'Tier 1 (Apoio e Diretorias)' : tier === 2 ? 'Tier 2 (Liderança Operacional)' : 'Tier 3 (Operacional de Vendas)';
    const ehExcecao = isAtoIntegralException(p.role, p.priorityRule);
    const pOnInst = p.percentageOnInstallment ?? (p.deduction ?? 0);
    const excecao = ehExcecao 
      ? '100% no Ato (Isolamento de Exceção)' 
      : (pOnInst > 0 ? `Dedução de ${pOnInst.toFixed(2)}% da Parcela` : 'Rateio Proporcional ao VGV (Ordinário)');

    return {
      role: p.role,
      name: p.name,
      label,
      aliquotaVGV: p.percentage,
      tetoNominal: p.cap,
      regraFluxo: pOnInst,
      excecao,
      tier,
      tierLabel
    };
  });

  // Seção II: Amortização do Fluxo de Recebíveis
  let saldoDevedorAcumulado = passivoTotalComissao;
  const secaoII = waterfall.detalhesParcelas.map((det, idx) => {
    const parcelaBruta = det.valorParcela;
    const deducaoAplicada = det.valorRetido;
    const saldoIncorporador = Number((parcelaBruta - deducaoAplicada).toFixed(2));
    saldoDevedorAcumulado = Number(Math.max(0, saldoDevedorAcumulado - deducaoAplicada).toFixed(2));

    return {
      linha: idx + 1,
      vencimento: det.vencimento,
      tipo: det.tipo,
      parcelaBruta,
      deducaoAplicada,
      saldoIncorporador,
      saldoDevedorComissao: saldoDevedorAcumulado
    };
  });

  // Seção III: Matriz Definitiva de Repasse (Vencimento a Vencimento)
  const headers = waterfall.participantes.map(p => p.name ? `${p.role} - ${p.name}` : p.role);
  const rows = waterfall.detalhesParcelas
    .filter(det => det.valorRetido > 0)
    .map(det => ({
      vencimento: det.vencimento,
      tipo: det.tipo,
      valorRetido: det.valorRetido,
      distribuicao: { ...det.distribuicao }
    }));

  const totalRetido = Number(rows.reduce((acc, r) => acc + r.valorRetido, 0).toFixed(2));
  const totaisPorParticipante: { [col: string]: number } = {};
  const tetosPorParticipante: { [col: string]: number } = {};

  waterfall.participantes.forEach(p => {
    const label = p.name ? `${p.role} - ${p.name}` : p.role;
    totaisPorParticipante[label] = p.received;
    tetosPorParticipante[label] = p.cap;
  });

  const saldoResidualGlobal = waterfall.saldoRestanteComissao;
  const statusConciliacao: '100% LIQUIDADO' | 'COBERTURA PARCIAL' =
    saldoResidualGlobal <= 0.05 ? '100% LIQUIDADO' : 'COBERTURA PARCIAL';

  // Seção IV: Diagnóstico de Eventos Críticos (Inflexões)
  const inflexoes: DiagnosticoEspecialista['secaoIV']['inflexoes'] = [];
  const acumuladoPorPart: { [label: string]: number } = {};
  headers.forEach(h => { acumuladoPorPart[h] = 0; });

  let eventoLiberacaoIntegral: DiagnosticoEspecialista['secaoIV']['liberacaoFluxoIntegral'] = null;
  let saldoComissaoMonitor = passivoTotalComissao;

  waterfall.detalhesParcelas.forEach((det, idx) => {
    const valorRetido = det.valorRetido;
    saldoComissaoMonitor = Number((saldoComissaoMonitor - valorRetido).toFixed(2));

    Object.entries(det.distribuicao || {}).forEach(([label, valor]) => {
      const v = Number(valor) || 0;
      if (v > 0) {
        const anterior = acumuladoPorPart[label] || 0;
        const novo = Number((anterior + v).toFixed(2));
        acumuladoPorPart[label] = novo;
        const cap = tetosPorParticipante[label] || 0;

        if (novo >= cap - 0.01 && anterior < cap - 0.01) {
          inflexoes.push({
            participante: label,
            parcelaQuitacao: `${det.tipo} (#${idx + 1})`,
            vencimento: det.vencimento,
            eventoIndex: idx + 1,
            tetoAtingido: cap
          });
        }
      }
    });

    if (saldoComissaoMonitor <= 0.01 && !eventoLiberacaoIntegral) {
      eventoLiberacaoIntegral = {
        eventoIndex: idx + 1,
        parcela: `${det.tipo} (#${idx + 1})`,
        vencimento: det.vencimento,
        observacao: 'Passivo de comissão 100% amortizado. As parcelas subsequentes ficam integralmente liberadas ao Incorporador sem retenção.'
      };
    }
  });

  const rotasSobras: string[] = [
    'Dedução Ordinária por Parcela: aplicada preferencialmente aos cargos com Percentual da Parcela preenchido, limitada aos respectivos tetos contratuais (T_j).',
    'Distribuição Proporcional ao VGV: o saldo residual de retenção da parcela é distribuído proporcionalmente às alíquotas contratuais dos cargos ativos (w_{j, fluxo} = p_j / sum(p_k)).',
    'Hierarquia de Absorção em Cascata: ao atingir o teto de quitação (Saldo = 0), as sobras são canalizadas por hierarquia de absorção: Apoio/Diretorias (Tier 1) -> Liderança Operacional (Tier 2) -> Rateio Residual Corretor/Gerente (Tier 3).',
    'Auditoria de centavos e fechamento estrito: soma dos repasses concilia com precisão milimétrica o passivo total de comissões contratadas.'
  ];

  return {
    secaoI: {
      vgv,
      taxaGlobal,
      passivoTotalComissao,
      somaAliquotas,
      consistenciaAliquotas,
      participantes: participantesSecaoI
    },
    secaoII,
    secaoIII: {
      headers,
      rows,
      totalRetido,
      totaisPorParticipante,
      tetosPorParticipante,
      statusConciliacao,
      saldoResidualGlobal
    },
    secaoIV: {
      inflexoes,
      rotasSobras,
      liberacaoFluxoIntegral: eventoLiberacaoIntegral
    }
  };
}
