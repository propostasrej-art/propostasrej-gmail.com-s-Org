export enum Type {
  TYPE_UNSPECIFIED = "TYPE_UNSPECIFIED",
  STRING = "STRING",
  NUMBER = "NUMBER",
  INTEGER = "INTEGER",
  BOOLEAN = "BOOLEAN",
  ARRAY = "ARRAY",
  OBJECT = "OBJECT",
  NULL = "NULL",
}

export interface DocumentState {
  id: string;
  name: string;
  file: File | null;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  required: boolean;
}

export interface PropertyData {
  empreendimento: string;
  unidade: string;
  torre: string;
  cidade?: string;
  estado?: string;
  localizacao?: string;
  endereco?: string;
}

export interface SalesTeam {
  corretor1: string;
  corretor2: string;
  gerente: string;
  diretor?: string;
  coordenador?: string;
}

export interface CustomerData {
  nome: string;
  cpf: string;
  telefone: string;
  email: string;
  dataNascimento: string;
  rgNumero: string;
  rgOrgao: string;
  rgDataExpedicao: string;
  estadoCivil: string;
  profissao: string;
  naturalidade: string;
  nacionalidade: string;
  address?: AddressData;
}

export interface AddressData {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
}

export interface PaymentInstallment {
  quantidade: number;
  tipo: string;
  valorUnitario: number;
  vencimento: string;
  valorTotal: number;
}

export interface ExtractionResult {
  id?: string;
  property: PropertyData;
  salesTeam: SalesTeam;
  customers: CustomerData[];
  address: AddressData;
  payments: PaymentInstallment[];
  validations: {
    cpfMatch: boolean;
    totalValueMatch: boolean;
    message?: string;
  };
  valorTotalProposta?: number;
  valorEntrada?: number;
  spreadsheet_id?: string;
  drive_link?: string;
  proposta_status?: PropostaStatus;
  cvc_status?: CVCStatus;
  corretagem_status?: CorretagemStatus;
  forma_pagamento_comissao?: FormaPagamentoComissao;
  informacoes_adicionais?: string;
  documents?: {
    type: string;
    found: boolean;
    description?: string;
  }[];
  commissionedParties?: any[];
  manual_waterfall?: any;
}

export type ExtractionStatus = 'na fila' | 'devolvida com pendencia' | 'contrato enviado';

export type PropostaStatus = 'AGUARDANDO APROVAÇÃO' | 'APROVADA' | 'DEVOLVIDA' | 'CANCELADA';
export type CVCStatus = 'PENDENTE' | 'NA FILA' | 'ENVIADO' | 'ASSINADO' | 'CANCELADO';
export type CorretagemStatus = 'PENDENTE' | 'NA FILA' | 'ENVIADO' | 'ASSINADO' | 'CANCELADO' | 'DEVOLVIDO';
export type FormaPagamentoComissao = 'PAGADORIA' | 'NF/REPASSE' | 'PAGADORIA INCORPORADOR';

export interface SavedExtraction {
  id: string;
  property: PropertyData;
  sales_team: SalesTeam;
  customers: CustomerData[];
  address: AddressData;
  payments: PaymentInstallment[];
  validations: any;
  status: ExtractionStatus;
  proposta_status?: PropostaStatus;
  cvc_status?: CVCStatus;
  corretagem_status?: CorretagemStatus;
  forma_pagamento_comissao?: FormaPagamentoComissao;
  informacoes_adicionais?: string;
  documents?: {
    type: string;
    found: boolean;
    description?: string;
  }[];
  created_at: string;
  updated_at?: string;
  valorTotalProposta?: number;
  valorEntrada?: number;
  spreadsheet_id?: string;
  drive_link?: string;
  uid: string;
  commissioned_parties?: any[];
  manual_waterfall?: any;
}

export interface CargoCadastro {
  id: string;
  nome: string;
  apelido: string;
  creci: string;
  cpf_cnpj: string;
  cargo: string;
  gerente: string;
  diretor: string;
  telefone: string;
  email: string;
  pix: string;
  asaasWalletId?: string;
  created_at: string;
  uid: string;
}

export interface ModeloRateioCargo {
  cargo: string;
  taxa_comissao: number;
  nome?: string;
}

export interface Empreendimento {
  id: string;
  nome: string;
  construtora?: string;
  localizacao?: string;
  endereco?: string;
  tabela_base_id?: string; // ID da planilha no Sheets se houver
  status: 'ATIVO' | 'INATIVO';
  regras_comissao?: RegraComissao[];
  modelo_rateio?: ModeloRateioCargo[];
  created_at: string;
  uid: string;
}

export interface RegraComissao {
  parcela: string;
  tipo_deducao: 'VALOR' | 'PERCENTUAL';
  valor_deducao: number;
}

export interface InstallmentTypeConfig {
  id: string;
  descricao: string;
  periodicidade: number; // em meses
  created_at: string;
  uid: string;
}

export const EXTRACTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    property: {
      type: Type.OBJECT,
      properties: {
        empreendimento: { type: Type.STRING },
        unidade: { type: Type.STRING },
        torre: { type: Type.STRING },
        cidade: { type: Type.STRING },
        estado: { type: Type.STRING },
        endereco: { type: Type.STRING },
      },
      required: ["empreendimento", "unidade"],
    },
    salesTeam: {
      type: Type.OBJECT,
      properties: {
        corretor1: { type: Type.STRING },
        corretor2: { type: Type.STRING },
        gerente: { type: Type.STRING },
      },
    },
    customers: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          nome: { type: Type.STRING },
          cpf: { type: Type.STRING },
          telefone: { type: Type.STRING },
          email: { type: Type.STRING },
          dataNascimento: { type: Type.STRING },
          rgNumero: { type: Type.STRING },
          rgOrgao: { type: Type.STRING },
          rgDataExpedicao: { type: Type.STRING },
          estadoCivil: { type: Type.STRING },
          profissao: { type: Type.STRING },
          naturalidade: { type: Type.STRING },
          nacionalidade: { type: Type.STRING },
          address: {
            type: Type.OBJECT,
            properties: {
              cep: { type: Type.STRING },
              logradouro: { type: Type.STRING },
              numero: { type: Type.STRING },
              complemento: { type: Type.STRING },
              bairro: { type: Type.STRING },
              cidade: { type: Type.STRING },
              estado: { type: Type.STRING },
            },
          },
        },
        required: ["nome", "cpf"],
      },
    },
    address: {
      type: Type.OBJECT,
      properties: {
        cep: { type: Type.STRING },
        logradouro: { type: Type.STRING },
        numero: { type: Type.STRING },
        complemento: { type: Type.STRING },
        bairro: { type: Type.STRING },
        cidade: { type: Type.STRING },
        estado: { type: Type.STRING },
      },
    },
    payments: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          quantidade: { type: Type.INTEGER },
          tipo: { type: Type.STRING },
          valorUnitario: { type: Type.NUMBER },
          vencimento: { type: Type.STRING },
          valorTotal: { type: Type.NUMBER },
        },
        required: ["quantidade", "tipo", "valorUnitario", "valorTotal"],
      },
    },
    validations: {
      type: Type.OBJECT,
      properties: {
        cpfMatch: { type: Type.BOOLEAN },
        totalValueMatch: { type: Type.BOOLEAN },
        message: { type: Type.STRING },
      },
    },
    valorTotalProposta: { 
      type: Type.NUMBER,
      description: "O valor total da proposta/venda conforme indicado no documento."
    },
    valorEntrada: {
      type: Type.NUMBER,
      description: "O valor total das ENTRADAS (sinal, ato, princípio de pagamento) indicado no documento."
    },
    documents: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING, description: "Tipo do documento (ex: RG, CPF, Proposta, Comprovante de Residência)" },
          found: { type: Type.BOOLEAN, description: "Se o documento foi identificado nos arquivos enviados" },
          description: { type: Type.STRING, description: "Breve descrição do que foi encontrado no documento" },
        },
        required: ["type", "found"],
      },
    },
  },
  required: ["property", "payments", "customers", "address", "valorTotalProposta"],
};
