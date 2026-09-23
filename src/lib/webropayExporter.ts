import ExcelJS from 'exceljs';
import { ExtractionResult, CargoCadastro, AddressData } from '../types';
import { WaterfallResult } from './waterfallCalculator';

export interface WebropayExportOptions {
  proposal: ExtractionResult;
  waterfall: WaterfallResult;
  cargos?: CargoCadastro[];
  simulacaoFluxo?: any[];
}

function formatAddress(addr?: AddressData): string {
  if (!addr) return '';
  const parts: string[] = [];
  if (addr.logradouro) {
    let str = addr.logradouro;
    if (addr.numero) str += `, ${addr.numero}`;
    if (addr.complemento) str += ` (${addr.complemento})`;
    parts.push(str);
  }
  if (addr.bairro) parts.push(addr.bairro);
  if (addr.cidade) {
    parts.push(addr.estado ? `${addr.cidade}/${addr.estado}` : addr.cidade);
  }
  return parts.join(' - ');
}

function getColumnLetter(colNumber: number): string {
  let temp = colNumber;
  let letter = '';
  while (temp > 0) {
    const mod = (temp - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    temp = Math.floor((temp - mod) / 26);
  }
  return letter;
}

export async function generateWebropayExcel({
  proposal,
  waterfall,
  cargos = [],
  simulacaoFluxo,
}: WebropayExportOptions): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Sistema de Propostas e Rateio Imobiliário';
  workbook.lastModifiedBy = 'Webropay Exporter';
  workbook.created = new Date();
  workbook.modified = new Date();

  // 1. Extração dos dados do Pagador (Cliente principal)
  const customer = proposal.customers && proposal.customers.length > 0 ? proposal.customers[0] : null;
  const address = proposal.address || customer?.address;
  const property = proposal.property;

  // 2. Extração das parcelas visíveis com comissão
  let runningSum = 0;
  const visibleParcelas: { vencimentoToShow: string; valorComissaoToShow: number; distribuicao: Record<string, number> }[] = [];
  
  for (let idx = 0; idx < waterfall.detalhesParcelas.length; idx++) {
    const det = waterfall.detalhesParcelas[idx];
    const correspondingSimFluxo = (simulacaoFluxo && idx < simulacaoFluxo.length && waterfall.detalhesParcelas.length > 1)
      ? simulacaoFluxo[idx]
      : null;

    const vencimentoToShow = correspondingSimFluxo ? correspondingSimFluxo.vencimento : det.vencimento;
    const valorComissaoToShow = correspondingSimFluxo 
      ? Number((correspondingSimFluxo.valorTotal - correspondingSimFluxo.valorLiquido).toFixed(2)) 
      : det.valorRetido;

    if (valorComissaoToShow > 0) {
      visibleParcelas.push({
        vencimentoToShow,
        valorComissaoToShow,
        distribuicao: det.distribuicao || {},
      });
    }
    runningSum = Number((runningSum + valorComissaoToShow).toFixed(2));
    if (runningSum >= waterfall.comissaoTotal - 0.01 && waterfall.comissaoTotal > 0) {
      break;
    }
  }

  // Colunas dinâmicas: apenas a quantidade exata necessária de parcelas com comissão
  // Fim das colunas "fantasmas": se houver apenas 2 parcelas, cria exatamente Parcela 1 e Parcela 2
  const numParcelaCols = Math.max(1, visibleParcelas.length);

  // Formatos numéricos oficiais do modelo Webropay
  const currencyNumFmt = '_-"R$ "* #,##0.00_-;"-R$ "* #,##0.00_-;_-"R$ "* \\-??_-;_-@_-';
  const numberDecFmt = '#,##0.00';

  // -------------------------------------------------------------
  // ABA 1: BENEFICIÁRIOS (Sem totais, sem colunas fantasmas)
  // -------------------------------------------------------------
  const wsBeneficiarios = workbook.addWorksheet('Beneficiários', {
    views: [{ showGridLines: true }],
  });

  const lastInstallmentColLetter = getColumnLetter(2 + numParcelaCols);

  // Linha 1: "Rateio das comissões" mesclado exatamente de A1 até a última parcela
  wsBeneficiarios.mergeCells(`A1:${lastInstallmentColLetter}1`);
  const cellA1 = wsBeneficiarios.getCell('A1');
  cellA1.value = 'Rateio das comissões';
  cellA1.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  cellA1.alignment = { horizontal: 'center', vertical: 'middle' };
  cellA1.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E293B' }, // Slate 800
  };
  wsBeneficiarios.getRow(1).height = 28;

  // Linha 2: Cabeçalhos superiores apenas das parcelas existentes (sem coluna Total)
  const row2 = wsBeneficiarios.getRow(2);
  row2.height = 20;
  for (let c = 1; c <= numParcelaCols; c++) {
    const colIndex = 2 + c;
    const cell = row2.getCell(colIndex);
    cell.value = `Parcela ${c}`;
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF334155' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF1F5F9' }, // Slate 100
    };
  }

  // Linha 3: "Nome do Comissionado", "CPF/CNPJ" e as datas de vencimento exatas de cada parcela
  const row3 = wsBeneficiarios.getRow(3);
  row3.height = 22;

  const cellA3 = row3.getCell(1);
  cellA3.value = 'Nome do Comissionado';
  cellA3.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1E293B' } };
  cellA3.alignment = { horizontal: 'left', vertical: 'middle' };
  cellA3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };

  const cellB3 = row3.getCell(2);
  cellB3.value = 'CPF/CNPJ';
  cellB3.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1E293B' } };
  cellB3.alignment = { horizontal: 'center', vertical: 'middle' };
  cellB3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };

  for (let c = 1; c <= numParcelaCols; c++) {
    const colIndex = 2 + c;
    const cell = row3.getCell(colIndex);
    const parcela = visibleParcelas[c - 1];
    cell.value = parcela ? parcela.vencimentoToShow : 'dd/mm/aaaa';
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF475569' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  }

  // Bordas finas nos cabeçalhos
  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  };

  for (let c = 1; c <= 2 + numParcelaCols; c++) {
    row2.getCell(c).border = thinBorder;
    row3.getCell(c).border = thinBorder;
  }

  // Linhas 4 em diante: Beneficiários (sem coluna de total e sem linhas de rodapé)
  const activeParticipants = waterfall.participantes;
  let currentRowIdx = 4;

  activeParticipants.forEach((p) => {
    const row = wsBeneficiarios.getRow(currentRowIdx);
    row.height = 20;

    // Buscar CPF/CNPJ nos cargos cadastrados
    const matchedCargo = cargos.find((c) => {
      const matchName = p.name && c.nome && c.nome.trim().toLowerCase() === p.name.trim().toLowerCase();
      const matchRole = c.cargo && c.cargo.trim().toLowerCase() === p.role.trim().toLowerCase();
      const matchNick = p.name && c.apelido && c.apelido.trim().toLowerCase() === p.name.trim().toLowerCase();
      return matchName || matchNick || (matchRole && !p.name);
    });

    const participantLabel = p.name ? `${p.role} - ${p.name}` : p.role;
    const cpfCnpj = matchedCargo?.cpf_cnpj || '';

    // Col A: Nome
    const cellA = row.getCell(1);
    cellA.value = p.name ? `${p.name} (${p.role})` : p.role;
    cellA.font = { name: 'Calibri', size: 10, color: { argb: 'FF1E293B' } };
    cellA.alignment = { horizontal: 'left', vertical: 'middle' };
    cellA.border = thinBorder;

    // Col B: CPF/CNPJ
    const cellB = row.getCell(2);
    cellB.value = cpfCnpj;
    cellB.font = { name: 'Calibri', size: 10, color: { argb: 'FF334155' } };
    cellB.alignment = { horizontal: 'center', vertical: 'middle' };
    cellB.border = thinBorder;

    // Col C em diante: Parcelas exatas
    for (let c = 1; c <= numParcelaCols; c++) {
      const colIndex = 2 + c;
      const cell = row.getCell(colIndex);
      const parcela = visibleParcelas[c - 1];
      const val = parcela ? (parcela.distribuicao[participantLabel] ?? parcela.distribuicao[p.role] ?? 0) : 0;
      
      cell.value = Number(val.toFixed(2));
      cell.numFmt = currencyNumFmt;
      cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF0F172A' } };
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
      cell.border = thinBorder;
    }

    currentRowIdx++;
  });

  // Zero Totais: nenhum rodapé, nenhuma fórmula de soma nem validação cruzada

  // Definir larguras de colunas da aba Beneficiários
  wsBeneficiarios.getColumn(1).width = 32; // Nome do Comissionado
  wsBeneficiarios.getColumn(2).width = 20; // CPF/CNPJ
  for (let c = 1; c <= numParcelaCols; c++) {
    wsBeneficiarios.getColumn(2 + c).width = 18; // Parcela 1..n
  }

  // -------------------------------------------------------------
  // ABA 2: PAGADOR
  // -------------------------------------------------------------
  const wsPagador = workbook.addWorksheet('Pagador', {
    views: [{ showGridLines: true }],
  });

  // Merged A1:B1 para "DADOS DO PAGADOR"
  wsPagador.mergeCells('A1:B1');
  const cellPagA1 = wsPagador.getCell('A1');
  cellPagA1.value = 'DADOS DO PAGADOR';
  cellPagA1.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
  cellPagA1.alignment = { horizontal: 'center', vertical: 'middle' };
  cellPagA1.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E293B' }, // Slate 800
  };
  wsPagador.getRow(1).height = 26;

  // Determinar data da venda (primeiro vencimento ou data atual)
  const dataVendaStr = proposal.payments && proposal.payments.length > 0 && proposal.payments[0].vencimento
    ? proposal.payments[0].vencimento
    : new Date().toLocaleDateString('pt-BR');

  // Identificação da Torre / Unidade
  const torreUnidade = [
    property?.torre ? `Torre ${property.torre}` : '',
    property?.unidade ? `Unidade ${property.unidade}` : '',
  ]
    .filter(Boolean)
    .join(' / ') || property?.unidade || '';

  // Definição das 13 linhas cadastrais do Pagador
  const pagadorFields: Array<{
    label: string;
    value: any;
    format?: string;
    isNumeric?: boolean;
    dataValidation?: ExcelJS.DataValidation;
  }> = [
    { label: 'Nome/razão social:', value: customer?.nome || '' },
    { label: 'Email:', value: customer?.email || '' },
    { label: 'CPF/CNPJ:', value: customer?.cpf || '' },
    { label: 'Telefone:', value: customer?.telefone || '' },
    { label: 'CEP:', value: address?.cep || customer?.address?.cep || '' },
    { label: 'Endereço:', value: formatAddress(address || customer?.address) || property?.endereco || '' },
    { label: 'Nome do Empreendimento:', value: property?.empreendimento || '' },
    { label: 'Torre/Unidade:', value: torreUnidade },
    {
      label: 'Tipo:',
      value: 'Apartamento',
      dataValidation: {
        type: 'list',
        allowBlank: true,
        formulae: [
          '"Prêmio,Sorteio,Apartamento,Lote,Renegociação,Acordo,Migração,Casa,Personalização,Vaga de Carro,Vaga Box,Sala Comercial,Vaga de moto,Secundário"',
        ],
      },
    },
    { label: 'Data da Venda:', value: dataVendaStr, format: 'd/m/yyyy' },
    {
      label: 'Valor da Venda:',
      value: Number((waterfall.vendaTotal || proposal.valorTotalProposta || 0).toFixed(2)),
      format: numberDecFmt,
      isNumeric: true,
    },
    {
      label: 'Valor da Comissão:',
      value: Number((waterfall.comissaoTotal || 0).toFixed(2)),
      format: numberDecFmt,
      isNumeric: true,
    },
    { label: 'Id externo:', value: proposal.id || '' },
  ];

  pagadorFields.forEach((f, idx) => {
    const rowNum = idx + 2; // Rows 2 to 14
    const row = wsPagador.getRow(rowNum);
    row.height = 21;

    // Col A: Rótulo
    const cellA = row.getCell(1);
    cellA.value = f.label;
    cellA.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF334155' } };
    cellA.alignment = { horizontal: 'left', vertical: 'middle' };
    cellA.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF8FAFC' },
    };
    cellA.border = thinBorder;

    // Col B: Valor
    const cellB = row.getCell(2);
    cellB.value = f.value;
    cellB.font = { name: 'Calibri', size: 10, color: { argb: 'FF0F172A' } };
    cellB.alignment = {
      horizontal: f.isNumeric ? 'right' : 'left',
      vertical: 'middle',
    };
    cellB.border = thinBorder;

    if (f.format) {
      cellB.numFmt = f.format;
    }

    if (f.dataValidation) {
      cellB.dataValidation = f.dataValidation;
    }
  });

  // Ajustar larguras das colunas da aba Pagador
  wsPagador.getColumn(1).width = 28;
  wsPagador.getColumn(2).width = 46;

  // -------------------------------------------------------------
  // Geração do buffer e disparo do Download no Navegador
  // -------------------------------------------------------------
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const unidadeSanitizada = (property?.unidade || 'unidade').replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `webropay_contrato_${unidadeSanitizada}.xlsx`;

  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(downloadUrl);
}
