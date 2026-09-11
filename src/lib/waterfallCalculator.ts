import { PaymentInstallment } from "../types";
import { isExcludedFromCommissionBase } from "./commissionCalculator";

export interface WaterfallParticipant {
  role: string;
  name: string;
  percentage: number; // Taxa de Comissão do Cargo sobre o VGV
  percentageOnInstallment?: number; // Percentual sobre a parcela (cargo)
  deduction?: number; // Compatibilidade com campo anterior
  cap: number; // Teto financeiro individual (VGV * percentage / 100 / quantidade)
  received: number; // Recebido acumulado
  balance: number; // Saldo restante (cap - received)
  hideAndSum?: boolean; // Se deve ocultar o cargo e somar na Imobiliária
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

export function calcularRateioCascata(
  vendaTotal: number,
  percentualComissaoTotal: number,
  fluxoPagamentos: PaymentInstallment[],
  formaPagamento?: string,
  configParticipantes?: { role: string; name: string; percentage: number; deduction?: number; hideAndSum?: boolean }[],
  regrasComissao?: any[]
): WaterfallResult {
  const comissaoTotal = Number((vendaTotal * (percentualComissaoTotal / 100)).toFixed(2));
  
  // 1. Inicializar e Expandir Participantes (Cargos e nomes individuais)
  const participantesBase = configParticipantes || [
    { role: 'Corretor', name: '', percentage: 2.50, deduction: 0 },
    { role: 'Gerente', name: '', percentage: 0.50, deduction: 0 },
    { role: 'Diretor de Vendas', name: '', percentage: 0.20, deduction: 0 },
    { role: 'Diretor Comercial 1', name: '', percentage: 0.40, deduction: 0 },
    { role: 'Diretor Comercial 3', name: '', percentage: 0.40, deduction: 0 },
    { role: 'Jurídico', name: '', percentage: 0.10, deduction: 0 },
    { role: 'Imobiliária', name: '', percentage: 0.90, deduction: 0 },
  ];

  const participantes: WaterfallParticipant[] = [];

  participantesBase.forEach(p => {
    const names = p.name ? p.name.split(',').map(n => n.trim()).filter(Boolean) : [];
    const qty = names.length > 0 ? names.length : 1;
    
    const percentageIndividual = p.percentage / qty;
    const percentageOnInstallmentIndividual = (p.deduction ?? 0) / qty;
    const capIndividual = Number((vendaTotal * (percentageIndividual / 100)).toFixed(2));

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
          hideAndSum: p.hideAndSum || false
        });
      });
    } else {
      participantes.push({
        role: p.role,
        name: '',
        percentage: p.percentage,
        percentageOnInstallment: p.deduction ?? 0,
        deduction: p.deduction ?? 0,
        cap: capIndividual,
        received: 0,
        balance: capIndividual,
        hideAndSum: p.hideAndSum || false
      });
    }
  });

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

    return {
      vendaTotal,
      comissaoTotal,
      participantes,
      detalhesParcelas,
      saldoRestanteComissao: saldoDevedorGlobal
    };
  }

  // Processar Parcelas em Ordem Cronológica (Dedução realística baseada no teto e percentual sobre parcelas)
  const protegidasBase = ["financiamento", "fgts", "subsídio", "bancário", "instituição", "inadimplemento", "bonus repasse", "adimplimento"];

  fluxoPagamentos.forEach(parcela => {
    const tipo = (parcela.tipo || "").toLowerCase();
    
    // Ignorar parcelas que não integram a base de comissão (Bônus Repasse, Bônus Adimplimento, Inadimplemento)
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
      // Registrar parcela com retenção zero
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
    let tetoParcela = valorParcela; // Default: 100%
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

    const distribuicao: { [label: string]: number } = {};

    // 1. Identificar participantes com percentual sobre parcela > 0%
    const nonZeroParts = participantes.filter(p => {
      const names = p.name ? p.name.split(',').map(n => n.trim()).filter(Boolean) : [];
      const qty = names.length > 0 ? names.length : 1;
      const pOnInstallmentIndividual = (p.deduction ?? 0) / qty;
      return pOnInstallmentIndividual > 0 && p.balance > 0;
    });

    // Calcular o valor desejado total pelos cargos com percentual > 0%
    let desejadoTotal = 0;
    const desejadoPorParticipante: { [label: string]: number } = {};

    nonZeroParts.forEach(p => {
      const label = p.name ? `${p.role} - ${p.name}` : p.role;
      const names = p.name ? p.name.split(',').map(n => n.trim()).filter(Boolean) : [];
      const qty = names.length > 0 ? names.length : 1;
      const pOnInstallmentIndividual = (p.deduction ?? 0) / qty;
      
      const desejado = Number(Math.min(valorParcela * (pOnInstallmentIndividual / 100), p.balance).toFixed(2));
      desejadoPorParticipante[label] = desejado;
      desejadoTotal = Number((desejadoTotal + desejado).toFixed(2));
    });

    // O valor efetivamente retido para comissão nesta parcela é o menor entre: desejado total, teto da parcela e saldo devedor global
    const valorRetido = Number(Math.min(desejadoTotal, tetoParcela, saldoDevedorGlobal).toFixed(2));

    let sumPaidNonZero = 0;
    if (desejadoTotal > 0 && valorRetido > 0) {
      const fatorReducao = valorRetido / desejadoTotal;
      nonZeroParts.forEach(p => {
        const label = p.name ? `${p.role} - ${p.name}` : p.role;
        const desejado = desejadoPorParticipante[label] || 0;
        const pago = Number((desejado * fatorReducao).toFixed(2));
        distribuicao[label] = pago;
        sumPaidNonZero = Number((sumPaidNonZero + pago).toFixed(2));
      });

      // Ajustar pequenas discrepâncias de arredondamento
      let diff = Number((valorRetido - sumPaidNonZero).toFixed(2));
      if (diff !== 0 && nonZeroParts.length > 0) {
        const pToAdjust = nonZeroParts.find(p => {
          const label = p.name ? `${p.role} - ${p.name}` : p.role;
          return (distribuicao[label] || 0) > 0;
        }) || nonZeroParts[0];
        const label = pToAdjust.name ? `${pToAdjust.role} - ${pToAdjust.name}` : pToAdjust.role;
        distribuicao[label] = Number(((distribuicao[label] || 0) + diff).toFixed(2));
      }

      // Aplicar pagamentos e atualizar saldos
      nonZeroParts.forEach(p => {
        const label = p.name ? `${p.role} - ${p.name}` : p.role;
        const pago = distribuicao[label] || 0;
        p.received = Number((p.received + pago).toFixed(2));
        p.balance = Number((p.cap - p.received).toFixed(2));
        saldoDevedorGlobal = Number((saldoDevedorGlobal - pago).toFixed(2));
      });
    }

    // 2. Distribuição de Saldo para Cargos Zero (0%)
    const saldoRestantePermitido = Number(Math.max(0, tetoParcela - valorRetido).toFixed(2));
    const saldoRestantePossivel = Number(Math.min(saldoRestantePermitido, saldoDevedorGlobal).toFixed(2));

    if (saldoRestantePossivel > 0.005) {
      // Localizar os cargos com percentual sobre parcela igual a 0% cujos participantes têm saldo devedor restante
      const zeroParts = participantes.filter(p => {
        const names = p.name ? p.name.split(',').map(n => n.trim()).filter(Boolean) : [];
        const qty = names.length > 0 ? names.length : 1;
        const pOnInstallmentIndividual = (p.deduction ?? 0) / qty;
        return pOnInstallmentIndividual === 0 && p.balance > 0;
      });

      if (zeroParts.length > 0) {
        let restoParaDistribuir = saldoRestantePossivel;
        let ativosZero = [...zeroParts];
        
        while (restoParaDistribuir > 0.005 && ativosZero.length > 0) {
          const fatia = Number((restoParaDistribuir / ativosZero.length).toFixed(2));
          
          if (fatia < 0.01) {
            // Distribuir de 1 em 1 centavo para quem tem saldo até zerar o resto
            for (const p of ativosZero) {
              if (restoParaDistribuir <= 0) break;
              const oQuePodeReceber = Math.min(0.01, p.balance, restoParaDistribuir);
              if (oQuePodeReceber > 0) {
                const label = p.name ? `${p.role} - ${p.name}` : p.role;
                p.received = Number((p.received + oQuePodeReceber).toFixed(2));
                p.balance = Number((p.cap - p.received).toFixed(2));
                distribuicao[label] = Number(((distribuicao[label] || 0) + oQuePodeReceber).toFixed(2));
                restoParaDistribuir = Number((restoParaDistribuir - oQuePodeReceber).toFixed(2));
                saldoDevedorGlobal = Number((saldoDevedorGlobal - oQuePodeReceber).toFixed(2));
              }
            }
            break;
          }

          let valorUsadoNestaRodada = 0;
          for (const p of ativosZero) {
            const oQuePodeReceber = Math.min(fatia, p.balance, restoParaDistribuir);
            if (oQuePodeReceber > 0) {
              const label = p.name ? `${p.role} - ${p.name}` : p.role;
              p.received = Number((p.received + oQuePodeReceber).toFixed(2));
              p.balance = Number((p.cap - p.received).toFixed(2));
              distribuicao[label] = Number(((distribuicao[label] || 0) + oQuePodeReceber).toFixed(2));
              valorUsadoNestaRodada = Number((valorUsadoNestaRodada + oQuePodeReceber).toFixed(2));
              restoParaDistribuir = Number((restoParaDistribuir - oQuePodeReceber).toFixed(2));
              saldoDevedorGlobal = Number((saldoDevedorGlobal - oQuePodeReceber).toFixed(2));
            }
          }

          if (valorUsadoNestaRodada < 0.005) break;
          ativosZero = ativosZero.filter(p => p.balance > 0);
        }
      }
    }

    // Calcular a retenção real final desta parcela
    const totalRetidoFinal = Object.values(distribuicao).reduce((acc, v) => acc + v, 0);

    detalhesParcelas.push({
      vencimento: parcela.vencimento,
      tipo: parcela.tipo,
      valorParcela,
      valorRetido: Number(totalRetidoFinal.toFixed(2)),
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
