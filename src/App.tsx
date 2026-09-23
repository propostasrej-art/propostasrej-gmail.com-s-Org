import React, { useState, useCallback, useMemo, useEffect, useRef, Component, ErrorInfo, ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { DocumentScanner } from 'capacitor-document-scanner';
import { 
  FileText, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle,
  Loader2, 
  Download, 
  Trash2, 
  ChevronRight,
  Building2,
  Users,
  Briefcase,
  UserCheck,
  CreditCard,
  ShieldCheck,
  Plus,
  Database,
  CloudUpload,
  Edit2,
  Save,
  LayoutDashboard,
  History,
  Clock,
  ClipboardList,
  Search,
  Filter,
  FileSearch,
  Eye,
  EyeOff,
  Share2,
  Copy,
  X,
  Table,
  Hash,
  Printer,
  Calendar,
  Smartphone,
  ExternalLink,
  FolderOpen,
  Calculator,
  Settings,
  Camera,
  Scan,
  LogOut,
  Workflow,
  RefreshCw,
  Mail,
  Send,
  Maximize2,
  Lock,
  UserPlus,
  LogIn,
  KeyRound,
  FileSpreadsheet
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { PDFDocument } from 'pdf-lib';
import { jsonrepair } from 'jsonrepair';
import { db, auth } from './firebase';
import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  orderBy, 
  updateDoc, 
  doc,
  deleteDoc,
  onSnapshot,
  getDocFromServer,
  getDoc,
  setDoc,
  where
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  GoogleAuthProvider, 
  onAuthStateChanged,
  User,
  signOut
} from 'firebase/auth';
import { 
  calcularRateioCascata, 
  WaterfallResult, 
  obterRateioConsolidado,
  gerarDiagnosticoEspecialista,
  DiagnosticoEspecialista 
} from './lib/waterfallCalculator';
import { 
  DocumentState, 
  ExtractionResult, 
  EXTRACTION_SCHEMA,
  SavedExtraction,
  ExtractionStatus,
  PropostaStatus,
  CVCStatus,
  CorretagemStatus,
  FormaPagamentoComissao,
  PropertyData,
  AddressData,
  SalesTeam,
  Empreendimento,
  RegraComissao,
  InstallmentTypeConfig,
  CargoCadastro,
  ModeloRateioCargo
} from './types';
import { 
  processarProposta, 
  CommissionResult, 
  isExcludedFromCommissionBase,
  extrairCondicaoPagamentoDoFluxo,
  CondicaoPagamentoItem
} from './lib/commissionCalculator';
import { generateWebropayExcel } from './lib/webropayExporter';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const getApiUrl = (endpoint: string): string => {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  if (Capacitor.isNativePlatform()) {
    const remoteUrl = "https://ais-dev-mnko3fredg5cl6fz5xbf3b-366038558643.us-east1.run.app";
    return `${remoteUrl}${cleanEndpoint}`;
  }
  return cleanEndpoint;
};

const safeFetchJson = async (url: string, options?: RequestInit) => {
  const response = await fetch(getApiUrl(url), options);
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    if (text.trim().startsWith('<')) {
      const error: any = new Error(`Servidor retornou resposta HTML inesperada (${response.status}). Verifique se a API está online ou se a sessão expirou.`);
      error.status = response.status;
      throw error;
    }
    if (!response.ok) {
      const error: any = new Error(`Erro do servidor (${response.status}): ${text || 'Sem resposta'}`);
      error.status = response.status;
      throw error;
    }
    const error: any = new Error("Resposta inválida do servidor. Por favor, tente novamente.");
    error.status = response.status;
    throw error;
  }

  if (!response.ok) {
    let errorMessage = data.error || data.message || `Erro do servidor: ${response.status}`;
    if (data.details) errorMessage += `\n\nDetalhes: ${data.details}`;
    if (data.link) errorMessage += `\n\nLink para habilitar: ${data.link}`;
    
    const error: any = new Error(errorMessage);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
};

const REQUIRED_DOCS = [
  { id: 'proposta', name: 'Proposta R&J', required: false },
  { id: 'ficha', name: 'Ficha Cadastral', required: false },
  { id: 'rg', name: 'RG', required: false },
  { id: 'cpf', name: 'CPF', required: false },
  { id: 'residencia', name: 'Comprovante de Residência', required: false },
  { id: 'civil', name: 'Comprovante de Estado Civil', required: false },
];

// Error Boundary Component
export class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 mb-2">Ops! Algo deu errado</h1>
            <p className="text-slate-600 mb-6">
              Ocorreu um erro inesperado. Por favor, recarregue a página ou tente novamente mais tarde.
            </p>
            <div className="text-left bg-slate-50 rounded-lg p-4 mb-6 overflow-auto max-h-32">
              <code className="text-xs text-red-600 font-mono">
                {this.state.error?.message || "Erro desconhecido"}
              </code>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
            >
              Recarregar Página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  const [docs, setDocs] = useState<DocumentState[]>(
    REQUIRED_DOCS.map(doc => ({ ...doc, file: null, status: 'pending' }))
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [simulationResult, setSimulationResult] = useState<CommissionResult | null>(null);
  const [waterfallResult, setWaterfallResult] = useState<WaterfallResult | null>(null);
  const [isManualRateio, setIsManualRateio] = useState(false);
  const [isEditingRateio, setIsEditingRateio] = useState(false);
  const [commissionedParties, setCommissionedParties] = useState([
    { role: 'Corretor', name: '', percentage: 2.50, deduction: 0 },
    { role: 'Gerente', name: '', percentage: 0.50, deduction: 0 },
    { role: 'Diretor de Vendas', name: '', percentage: 0.20, deduction: 0 },
    { role: 'Diretor Comercial 1', name: '', percentage: 0.40, deduction: 0 },
    { role: 'Diretor Comercial 3', name: '', percentage: 0.40, deduction: 0 },
    { role: 'Jurídico', name: '', percentage: 0.10, deduction: 0 },
    { role: 'Imobiliária', name: '', percentage: 0.90, deduction: 0 },
  ]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isExportingDashboard, setIsExportingDashboard] = useState(false);
  const [isExportingToSheets, setIsExportingToSheets] = useState(false);
  const [isExportingWebropay, setIsExportingWebropay] = useState(false);
  const [isUploadingToDrive, setIsUploadingToDrive] = useState(false);
  const [view, setView] = useState<'extract' | 'dashboard' | 'inbox' | 'empreendimentos' | 'usuarios' | 'rateio' | 'cargos'>('extract');
  const [cargos, setCargos] = useState<CargoCadastro[]>([]);
  const [isLoadingCargos, setIsLoadingCargos] = useState(false);
  const [installmentConfigs, setInstallmentConfigs] = useState<InstallmentTypeConfig[]>([]);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [savedExtractions, setSavedExtractions] = useState<SavedExtraction[]>([]);
  const [empreendimentos, setEmpreendimentos] = useState<Empreendimento[]>([]);
  const [isLoadingEmpreendimentos, setIsLoadingEmpreendimentos] = useState(false);
  const [inboxFiles, setInboxFiles] = useState<any[]>([]);
  const [isLoadingInbox, setIsLoadingInbox] = useState(false);
  const [showCargoModal, setShowCargoModal] = useState(false);
  const [showCargosFillableModal, setShowCargosFillableModal] = useState(false);
  const [rateioTab, setRateioTab] = useState<'geral' | 'cargos' | 'especialista'>('geral');
  const [cargosTab, setCargosTab] = useState<'lista_cargos' | 'participantes'>('lista_cargos');
  const [editingCargo, setEditingCargo] = useState<CargoCadastro | null>(null);
  const [cargoForm, setCargoForm] = useState({
    nome: '',
    apelido: '',
    creci: '',
    cpf_cnpj: '',
    cargo: '',
    gerente: '',
    diretor: '',
    telefone: '',
    email: '',
    pix: '',
    asaasWalletId: '',
  });
  const [isSavingCargo, setIsSavingCargo] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedRelatorio, setCopiedRelatorio] = useState(false);
  const [activePartySearchIdx, setActivePartySearchIdx] = useState<number | null>(null);
  const [partySearchQuery, setPartySearchQuery] = useState<string>('');
  const [user, setUser] = useState<User | null>(null);
  const cargoFileInputRef = useRef<HTMLInputElement>(null);
  const [userRole, setUserRole] = useState<'admin' | 'user' | 'EV' | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'error' | 'info' }[]>([]);
  const [emailModalData, setEmailModalData] = useState<{ to: string; subject: string; body: string; extraction?: any } | null>(null);
  const [viewPrecoDetalhado, setViewPrecoDetalhado] = useState(false);
  const [viewComissaoDetalhada, setViewComissaoDetalhada] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [gmailApiError, setGmailApiError] = useState<{ message: string; link?: string } | null>(null);
  const [authMode, setAuthMode] = useState<'google' | 'email'>(() => {
    try {
      return (localStorage.getItem('preferred_auth_mode') as 'google' | 'email') || 'email';
    } catch {
      return 'email';
    }
  });
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const switchAuthMode = (mode: 'google' | 'email') => {
    setAuthMode(mode);
    setAuthError(null);
    setAuthSuccessMessage(null);
    try {
      localStorage.setItem('preferred_auth_mode', mode);
    } catch {
      // ignore
    }
  };
  const [isRegistering, setIsRegistering] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authDisplayName, setAuthDisplayName] = useState('');
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccessMessage, setAuthSuccessMessage] = useState<string | null>(null);

  const getParticipantApelido = (name?: string, localCorretores?: Array<{ nome_completo: string; apelido: string }>): string => {
    if (!name || !name.trim() || name.includes('___')) return '';
    const parts = name.split(',').map(n => n.trim()).filter(Boolean);
    const nicknames = parts.map(part => {
      if (localCorretores && localCorretores.length > 0) {
        const foundLocal = localCorretores.find(c =>
          (c.nome_completo && c.nome_completo.trim().toLowerCase() === part.toLowerCase()) ||
          (c.apelido && c.apelido.trim().toLowerCase() === part.toLowerCase()) ||
          (c.nome_completo && c.nome_completo.trim().toLowerCase().startsWith(part.toLowerCase()))
        );
        if (foundLocal?.apelido && foundLocal.apelido.trim()) {
          return foundLocal.apelido.trim();
        }
      }
      const matched = cargos.find(c =>
        (c.nome && c.nome.trim().toLowerCase() === part.toLowerCase()) ||
        (c.apelido && c.apelido.trim().toLowerCase() === part.toLowerCase()) ||
        (c.nome && c.nome.trim().toLowerCase().startsWith(part.toLowerCase()))
      );
      if (matched?.apelido && matched.apelido.trim()) {
        return matched.apelido.trim();
      }
      return part.split(' ')[0].trim();
    });
    return nicknames.join(', ');
  };

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [idToDelete, setIdToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingConfig, setEditingConfig] = useState<Partial<InstallmentTypeConfig> | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false);
  const [needsGoogleAuth, setNeedsGoogleAuth] = useState(false);
  const [percentualComissao, setPercentualComissao] = useState(5);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeCaptureId, setActiveCaptureId] = useState<string | null>(null);

  // Assinafy Electronic Signature States
  const [assinafyToken, setAssinafyToken] = useState(() => localStorage.getItem('rj_assinafy_token') || '');
  const [isSandboxAssinafy, setIsSandboxAssinafy] = useState(() => localStorage.getItem('rj_assinafy_sandbox') !== 'false');
  const [assinafyEnvelopes, setAssinafyEnvelopes] = useState<any[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('rj_assinafy_envelopes') || '[]');
    } catch {
      return [];
    }
  });
  const [isCreatingAssinafyEnvelope, setIsCreatingAssinafyEnvelope] = useState(false);
  const [editingSigners, setEditingSigners] = useState<any[]>([]);
  const [newSignerForm, setNewSignerForm] = useState({ name: '', email: '', cpf: '', role: 'Testemunha' });
  const [showAddSignerRow, setShowAddSignerRow] = useState(false);
  const [assinafyDocType, setAssinafyDocType] = useState<'proposal' | 'contract'>('contract');
  const [showConfigPanel, setShowConfigPanel] = useState(false);

  // Asaas Payment Integration States
  const [asaasToken, setAsaasToken] = useState(() => localStorage.getItem('rj_asaas_token') || '');
  const [asaasEnv, setAsaasEnv] = useState<'sandbox' | 'production'>(() => (localStorage.getItem('rj_asaas_env') as any) || 'sandbox');
  const [asaasBalance, setAsaasBalance] = useState<number>(45320.80);
  const [asaasPayments, setAsaasPayments] = useState<any[]>([]);
  const [asaasTransfers, setAsaasTransfers] = useState<any[]>([]);
  const [asaasCustomers, setAsaasCustomers] = useState<any[]>([]);
  const [asaasSubTab, setAsaasSubTab] = useState<'payments' | 'transfers' | 'customers'>('payments');
  const [isLoadingAsaas, setIsLoadingAsaas] = useState(false);
  const [showNewAsaasPaymentModal, setShowNewAsaasPaymentModal] = useState(false);
  const [showNewAsaasTransferModal, setShowNewAsaasTransferModal] = useState(false);
  const [showNewAsaasCustomerModal, setShowNewAsaasCustomerModal] = useState(false);
  const [selectedAsaasBoleto, setSelectedAsaasBoleto] = useState<any | null>(null);
  const [emissionMode, setEmissionMode] = useState<'single' | 'installments'>('single');
  const [installmentsToEmit, setInstallmentsToEmit] = useState<any[]>([]);

  // New Payment Form State
  const [paymentForm, setPaymentForm] = useState({
    proposalId: '',
    customerId: '',
    customerName: '',
    customerCpfCnpj: '',
    customerEmail: '',
    customerPhone: '',
    value: '',
    dueDate: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0], // 7 days from now
    billingType: 'PIX',
    description: '',
    enableSplit: false,
    splitRules: [] as any[]
  });

  // New Transfer Form State
  const [transferForm, setTransferForm] = useState({
    cargoId: '',
    name: '',
    cpfCnpj: '',
    pixKey: '',
    pixKeyType: 'CPF',
    value: '',
    description: ''
  });

  // New Customer Form State
  const [customerForm, setCustomerForm] = useState({
    name: '',
    cpfCnpj: '',
    email: '',
    phone: ''
  });

  // Synchronize with Asaas Back-end
  const syncAsaas = useCallback(async (tokenVal?: string, envVal?: string) => {
    const activeToken = tokenVal !== undefined ? tokenVal : asaasToken;
    const activeEnv = envVal !== undefined ? envVal : asaasEnv;
    const isSandbox = activeEnv === 'sandbox';

    setIsLoadingAsaas(true);
    try {
      // 1. Fetch balance
      const balanceRes = await fetch('/api/asaas/balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiToken: activeToken, isSandbox })
      });
      if (balanceRes.ok) {
        const data = await balanceRes.json();
        if (data.success) {
          setAsaasBalance(data.balance);
        }
      }

      // 2. Fetch customers
      const custRes = await fetch('/api/asaas/customers/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiToken: activeToken, isSandbox })
      });
      if (custRes.ok) {
        const data = await custRes.json();
        if (data.success) {
          setAsaasCustomers(data.data || []);
        }
      }

      // 3. Fetch payments
      const payRes = await fetch('/api/asaas/payments/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiToken: activeToken, isSandbox })
      });
      if (payRes.ok) {
        const data = await payRes.json();
        if (data.success) {
          setAsaasPayments(data.data || []);
        }
      }

      // 4. Fetch transfers
      const transRes = await fetch('/api/asaas/transfers/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiToken: activeToken, isSandbox })
      });
      if (transRes.ok) {
        const data = await transRes.json();
        if (data.success) {
          setAsaasTransfers(data.data || []);
        }
      }
    } catch (err) {
      console.error("Error syncing Asaas data:", err);
    } finally {
      setIsLoadingAsaas(false);
    }
  }, [asaasToken, asaasEnv]);

  // Sync on view changes
  useEffect(() => {
    if (view as any === 'asaas') {
      syncAsaas();
    }
  }, [view, syncAsaas]);

  const parseVencimentoToDateStr = (vencimento: string, index: number): string => {
    if (!vencimento) {
      const d = new Date();
      d.setDate(d.getDate() + (index * 30));
      return d.toISOString().split('T')[0];
    }
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (dateRegex.test(vencimento)) {
      return vencimento;
    }
    const brDateRegex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    const match = brDateRegex.exec(vencimento);
    if (match) {
      return `${match[3]}-${match[2]}-${match[1]}`;
    }
    const clean = vencimento.toLowerCase().trim();
    if (clean === 'ato' || clean === 'sinal' || clean === 'imediato' || clean === 'à vista') {
      return new Date().toISOString().split('T')[0];
    }
    const daysMatch = /(\d+)\s*dia/i.exec(clean);
    if (daysMatch) {
      const days = parseInt(daysMatch[1]);
      const d = new Date();
      d.setDate(d.getDate() + days);
      return d.toISOString().split('T')[0];
    }
    const monthsMatch = /(\d+)\s*mes/i.exec(clean) || /(\d+)\s*mês/i.exec(clean);
    if (monthsMatch) {
      const months = parseInt(monthsMatch[1]);
      const d = new Date();
      d.setMonth(d.getMonth() + months);
      return d.toISOString().split('T')[0];
    }
    const d = new Date();
    d.setDate(d.getDate() + (index * 30));
    return d.toISOString().split('T')[0];
  };

  const handleProposalChange = (proposalId: string) => {
    const proposal = savedExtractions.find(ext => ext.id === proposalId);
    if (!proposal) return;

    const customer = proposal.customers?.[0] || {} as any;
    
    // Find associated empreendimento configuration
    const currentEmp = empreendimentos.find(e => e.nome === proposal.property?.empreendimento);

    // Compute simulationResult.fluxo dynamically
    const sim = processarProposta(
      proposal.payments || [],
      percentualComissao,
      currentEmp?.regras_comissao,
      installmentConfigs,
      proposal.forma_pagamento_comissao || 'PAGADORIA'
    );

    const sumExcluded = (proposal.payments || [])
      .filter((p: any) => isExcludedFromCommissionBase(p.tipo))
      .reduce((acc: number, p: any) => acc + (p.valorTotal || 0), 0);
    const sumAllParcelas = (proposal.payments || []).reduce((acc: number, p: any) => acc + (p.valorTotal || 0), 0);
    const baseVendaTotal = Math.max(0, (sumAllParcelas > 0 ? sumAllParcelas : (proposal.valorTotalProposta || 0)) - sumExcluded);

    // Compute or retrieve waterfallResult
    let waterfall = proposal.manual_waterfall ? obterRateioConsolidado(proposal.manual_waterfall) : null;
    if (!waterfall) {
      const activeParties = proposal.commissioned_parties || (proposal as any).commissionedParties || [];

      waterfall = calcularRateioCascata(
        baseVendaTotal,
        percentualComissao,
        sim.fluxo,
        proposal.forma_pagamento_comissao || 'PAGADORIA',
        activeParties,
        currentEmp?.regras_comissao
      );
    }

    const totalComission = waterfall?.comissaoTotal || (baseVendaTotal ? baseVendaTotal * (percentualComissao / 100) : 0);
    const amount = totalComission ? totalComission.toFixed(2) : '';

    // Helper to find walletId from cargos
    const findWalletIdForName = (name: string, role: string) => {
      if (!name) return '';
      // Find case-insensitive match on name or nickname
      const matched = cargos.find(c => 
        (c.nome && c.nome.trim().toLowerCase() === name.trim().toLowerCase()) ||
        (c.apelido && c.apelido.trim().toLowerCase() === name.trim().toLowerCase()) ||
        (c.nome && c.nome.trim().toLowerCase().includes(name.trim().toLowerCase()))
      );
      return matched?.asaasWalletId || '';
    };

    let rules: any[] = [];
    if (waterfall && Array.isArray(waterfall.participantes)) {
      // If we have waterfall participants, we calculate their relative percentage of the actual commission being paid
      rules = waterfall.participantes.map((p: any) => {
        const relativePercent = totalComission > 0 ? (p.cap / totalComission) * 100 : 0;
        return {
          recipientName: p.name ? `${p.role} - ${p.name}` : p.role,
          walletId: findWalletIdForName(p.name, p.role),
          fixedValue: p.cap,
          percentualValue: Number(relativePercent.toFixed(2))
        };
      });
    } else {
      // Fallback: use commissioned_parties directly
      const activeParties = proposal.commissioned_parties || (proposal as any).commissionedParties || [];
      rules = activeParties.map((p: any) => {
        const relativePercent = percentualComissao > 0 ? (p.percentage / percentualComissao) * 100 : 0;
        return {
          recipientName: p.name ? `${p.role} - ${p.name}` : p.role,
          walletId: findWalletIdForName(p.name, p.role),
          fixedValue: baseVendaTotal ? baseVendaTotal * (p.percentage / 100) : 0,
          percentualValue: Number(relativePercent.toFixed(2))
        };
      });
    }

    // Filter rules that have value > 0 and a name
    rules = rules.filter(r => r.percentualValue > 0);

    // Parse installments for the "Desmembrar por Parcelas" option
    // Synchronize directly with General Waterfall Table (Tabela de Rateio Geral)
    const parsedInstallments: any[] = [];
    if (waterfall && Array.isArray(waterfall.detalhesParcelas)) {
      let runningSum = 0;
      for (let idx = 0; idx < waterfall.detalhesParcelas.length; idx++) {
        const p = waterfall.detalhesParcelas[idx];
        const correspondingSimFluxo = (sim && idx < sim.fluxo.length && waterfall.detalhesParcelas.length > 1)
          ? sim.fluxo[idx]
          : null;

        const vencimentoToShow = correspondingSimFluxo ? correspondingSimFluxo.vencimento : p.vencimento;
        const valorComissaoToShow = p.valorRetido;

        if (valorComissaoToShow > 0) {
          const instCommission = valorComissaoToShow;
          const instRules = Object.entries(p.distribuicao || {}).map(([label, value]) => {
            const valNum = Number(value);
            const relativePercent = instCommission > 0 ? (valNum / instCommission) * 100 : 0;
            
            let role = '';
            let name = '';
            if (label.includes(' - ')) {
              const parts = label.split(' - ');
              role = parts[0];
              name = parts[1];
            } else {
              role = label;
            }

            return {
              recipientName: label,
              walletId: findWalletIdForName(name, role),
              fixedValue: valNum,
              percentualValue: Number(relativePercent.toFixed(2))
            };
          }).filter(r => r.percentualValue > 0);

          parsedInstallments.push({
            id: `inst_${idx}_${Date.now()}`,
            tipo: p.tipo || `Parcela ${idx + 1}`,
            valorRetido: valorComissaoToShow,
            dueDate: parseVencimentoToDateStr(vencimentoToShow, idx),
            enabled: true,
            splitRules: instRules
          });
        }

        runningSum = Number((runningSum + valorComissaoToShow).toFixed(2));
        if (runningSum >= waterfall.comissaoTotal - 0.01 && waterfall.comissaoTotal > 0) {
          break;
        }
      }
    }

    setInstallmentsToEmit(parsedInstallments);
    if (parsedInstallments.length > 0) {
      setEmissionMode('installments');
    } else {
      setEmissionMode('single');
    }

    setPaymentForm(prev => ({
      ...prev,
      proposalId,
      customerName: customer.nome || '',
      customerCpfCnpj: customer.cpf || '',
      customerEmail: customer.email || '',
      customerPhone: customer.telefone || customer.phone || '',
      value: amount,
      description: `Comissão - Empreendimento: ${proposal.property?.empreendimento || 'Imóvel'}`,
      enableSplit: rules.length > 0,
      splitRules: rules
    }));
  };


  // Helper to extract all official signers from the Brokerage Contract (Contrato de Corretagem)
  const getContractSignersList = useCallback((
    currentResult: ExtractionResult | null,
    cargosList: CargoCadastro[] = [],
    partiesList: any[] = []
  ) => {
    if (!currentResult) return [];
    const list: Array<{
      name: string;
      email: string;
      cpf: string;
      role: string;
      phone?: string;
    }> = [];

    // 1. Contratantes / Compradores (todos os proponentes compradores qualificados no contrato)
    const rawCustomers = (currentResult.customers && currentResult.customers.length > 0)
      ? currentResult.customers
      : [(currentResult as any).customer].filter(Boolean);
    const customers = rawCustomers.length > 0 ? rawCustomers : [];

    customers.forEach((cust: any, idx: number) => {
      if (cust && (cust.nome || cust.cpf)) {
        list.push({
          name: cust.nome || `Contratante ${idx + 1}`,
          email: cust.email || '',
          cpf: cust.cpf || '',
          phone: cust.telefone || '',
          role: customers.length > 1 ? `Contratante ${idx + 1}` : 'Contratante'
        });
      }
    });

    if (list.length === 0) {
      list.push({
        name: 'Cliente Contratante',
        email: '',
        cpf: '',
        role: 'Contratante'
      });
    }

    // 2. Imobiliária Contratada (Intermediadora oficial no Contrato de Corretagem)
    list.push({
      name: 'RODOLFO JERRY IMÓVEIS LTDA',
      email: 'propostasrej@gmail.com',
      cpf: '29.881.101/0001-09',
      role: 'Imobiliária'
    });

    // 3. Corretores Associados e Equipe de Vendas (Item III e Cláusula de Partilha do Contrato)
    const activeParties = (currentResult as any).manual_waterfall?.participantes || (currentResult as any).commissionedParties || (currentResult as any).commissioned_parties || partiesList || [];
    const seenNames = new Set<string>();

    activeParties.forEach((p: any) => {
      if (p.hideAndSum) return;
      if (!p.name || p.name.includes('___')) return;
      const names = p.name.split(',').map((n: string) => n.trim()).filter(Boolean);
      names.forEach((nameTrimmed: string) => {
        const lower = nameTrimmed.toLowerCase();
        if (seenNames.has(lower)) return;
        seenNames.add(lower);

        // Buscar dados completos no cadastro de Cargos/Membros
        const match = cargosList.find(c => 
          (c.nome && c.nome.toLowerCase().trim() === lower) ||
          (c.apelido && c.apelido.toLowerCase().trim() === lower)
        ) || cargosList.find(c => 
          c.nome && c.nome.toLowerCase().trim().startsWith(lower)
        );

        list.push({
          name: match?.nome || nameTrimmed,
          email: match?.email || '',
          cpf: match?.cpf_cnpj || '',
          phone: match?.telefone || '',
          role: p.role || match?.cargo || 'Corretor'
        });
      });
    });

    // Incluir membros da equipe de vendas (salesTeam) não mapeados ainda
    if (currentResult.salesTeam) {
      const st = currentResult.salesTeam;
      const teamEntries = [
        { name: st.corretor1, role: 'Corretor' },
        { name: st.corretor2, role: 'Corretor' },
        { name: st.gerente, role: 'Gerente' },
        { name: st.diretor, role: 'Diretor' },
        { name: st.coordenador, role: 'Coordenador' }
      ];

      teamEntries.forEach(entry => {
        if (entry.name && entry.name.trim() && !entry.name.includes('___')) {
          const lower = entry.name.trim().toLowerCase();
          if (!seenNames.has(lower)) {
            seenNames.add(lower);
            const match = cargosList.find(c => 
              (c.nome && c.nome.toLowerCase().trim() === lower) ||
              (c.apelido && c.apelido.toLowerCase().trim() === lower)
            );
            list.push({
              name: match?.nome || entry.name.trim(),
              email: match?.email || '',
              cpf: match?.cpf_cnpj || '',
              phone: match?.telefone || '',
              role: entry.role || match?.cargo || 'Corretor'
            });
          }
        }
      });
    }

    // 4. Testemunhas Instrumentárias (Exigência legal do Contrato de Corretagem: 2 testemunhas)
    list.push({
      name: 'Testemunha 1',
      email: '',
      cpf: '',
      role: 'Testemunha'
    });
    list.push({
      name: 'Testemunha 2',
      email: '',
      cpf: '',
      role: 'Testemunha'
    });

    return list;
  }, []);

  // Synchronize default signers from the Brokerage Contract when proposal result changes
  useEffect(() => {
    if (!result) return;
    const list = getContractSignersList(result, cargos, commissionedParties);
    setEditingSigners(list);
  }, [result, cargos, getContractSignersList]);

  // Função manual para sincronizar signatários da proposta com o Contrato de Corretagem
  const handleSyncContractSigners = () => {
    if (!result) {
      showToast("Nenhuma proposta carregada para sincronizar.", "error");
      return;
    }
    const list = getContractSignersList(result, cargos, commissionedParties);
    setEditingSigners(list);
    showToast("Tabela 'Quem Assina' sincronizada com as assinaturas do Contrato de Corretagem!", "success");
  };

  const handleCameraCapture = async (id: string) => {
    setActiveCaptureId(id);
    
    if (Capacitor.isNativePlatform()) {
      try {
        // Explicitly check/request permissions for native
        const permissions = await CapCamera.checkPermissions();
        if (permissions.camera !== 'granted') {
          const request = await CapCamera.requestPermissions();
          if (request.camera !== 'granted') {
            showToast('Permissão de câmera negada', 'error');
            return;
          }
        }

        const image = await CapCamera.getPhoto({
          quality: 90,
          allowEditing: false,
          resultType: CameraResultType.Uri,
          source: CameraSource.Camera
        });

        if (image.webPath) {
          const response = await fetch(image.webPath);
          const blob = await response.blob();
          const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
          handleFileChange(id, file);
        }
      } catch (err) {
        console.error('Error capturing image with Capacitor:', err);
      }
    } else {
      if (cameraInputRef.current) {
        cameraInputRef.current.value = '';
        cameraInputRef.current.click();
      }
    }
  };

  const handleDocumentScan = async (id: string) => {
    setActiveCaptureId(id);
    
    if (Capacitor.isNativePlatform()) {
      try {
        const { scannedImages } = await DocumentScanner.scanDocument();
        if (scannedImages && scannedImages.length > 0) {
          const response = await fetch(Capacitor.convertFileSrc(scannedImages[0]));
          const blob = await response.blob();
          const file = new File([blob], `scan_${Date.now()}.jpg`, { type: 'image/jpeg' });
          handleFileChange(id, file);
        }
      } catch (err) {
        console.error('Error scanning document with Capacitor:', err);
        // Fallback to camera capture if scanner fails
        handleCameraCapture(id);
      }
    } else {
      // Fallback for web: just use camera
      handleCameraCapture(id);
    }
  };

  const handleFileUpload = (id: string) => {
    setActiveCaptureId(id);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const isAdmin = userRole === 'admin' || user?.email?.toLowerCase() === 'propostasrej@gmail.com';

  // Empreendimentos and Properties Management State
  const [showEmpreendimentoModal, setShowEmpreendimentoModal] = useState(false);
  const [editingEmpreendimento, setEditingEmpreendimento] = useState<Empreendimento | null>(null);
  const [empreendimentoForm, setEmpreendimentoForm] = useState({
    nome: '',
    construtora: '',
    localizacao: '',
    endereco: '',
    tabela_base_id: '',
    status: 'ATIVO' as 'ATIVO' | 'INATIVO',
    regras_comissao: [] as RegraComissao[],
    modelo_rateio: [] as ModeloRateioCargo[]
  });

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GOOGLE_AUTH_SUCCESS') {
        setNeedsGoogleAuth(false);
        if (isExportingDashboard) {
          exportDashboardToGoogleSheets();
        } else if (isUploadingToDrive) {
          uploadToDrive();
        } else if (isExportingToSheets) {
          exportToGoogleSheets();
        } else if (savedExtractions.length > 0) {
          autoSyncToSheets(savedExtractions);
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [result, view, savedExtractions, isUploadingToDrive, isExportingToSheets, isExportingDashboard]);

  const exportDashboardToGoogleSheets = async () => {
    if (savedExtractions.length === 0) return;
    
    setIsExportingDashboard(true);
    try {
      const { isAuthenticated } = await safeFetchJson('/api/auth/google/status', { credentials: 'include' });

      if (!isAuthenticated) {
        const { url } = await safeFetchJson('/api/auth/google/url', { credentials: 'include' });
        window.open(url, 'google_auth', 'width=600,height=700');
        return;
      }

      const exportData = savedExtractions.map(ext => {
        // Handle potential missing fields or legacy data
        const customers = (ext.customers || [(ext as any).customer]).filter(Boolean);
        const payments = ext.payments || [];
        const totalValue = ext.valorTotalProposta || payments.reduce((acc, p) => acc + (p.valorTotal || 0), 0);
        
        return {
          'Data': ext.created_at ? new Date(ext.created_at).toLocaleDateString() : '-',
          'Empreendimento': ext.property?.empreendimento || '-',
          'Torre': ext.property?.torre || '-',
          'Unidade': ext.property?.unidade || '-',
          'Corretor 1': ext.sales_team?.corretor1 || '-',
          'Corretor 2': ext.sales_team?.corretor2 || '-',
          'Comprador': customers[0]?.nome || '-',
          'CPF': customers[0]?.cpf || '-',
          'Telefone': customers[0]?.telefone || '-',
          'Email': customers[0]?.email || '-',
          'Cidade': ext.address?.cidade || '-',
          'Estado': ext.address?.estado || '-',
          'Valor Total Proposta': totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
          'PROPOSTA': ext.proposta_status || 'AGUARDANDO APROVAÇÃO',
          'CVC': ext.cvc_status || 'PENDENTE',
          'CORRETAGEM': ext.corretagem_status || 'PENDENTE',
          'FORMA DE PAGAMENTO': ext.forma_pagamento_comissao || 'PAGADORIA',
          'Status': ext.status || '-',
          'Informações Adicionais': ext.informacoes_adicionais || '-'
        };
      });

      // Get existing spreadsheet ID from Firestore
      let existingId = null;
      const settingsRef = doc(db, 'user_settings', user.uid);
      try {
        const settingsSnap = await getDoc(settingsRef);
        if (settingsSnap.exists()) {
          existingId = settingsSnap.data().dashboard_spreadsheet_id;
        }
      } catch (err) {
        console.warn("Could not fetch user settings, falling back to localStorage", err);
        existingId = localStorage.getItem('dashboard_spreadsheet_id');
      }
      
      const { spreadsheetUrl, spreadsheetId } = await safeFetchJson('/api/export/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          data: exportData,
          title: `Dashboard de Extrações - ${new Date().toLocaleDateString()}`,
          spreadsheetId: existingId
        })
      });

      if (spreadsheetId) {
        // Save back to Firestore
        try {
          await setDoc(settingsRef, { dashboard_spreadsheet_id: spreadsheetId }, { merge: true });
        } catch (err) {
          console.error("Error saving dashboard spreadsheet ID to Firestore:", err);
        }
        localStorage.setItem('dashboard_spreadsheet_id', spreadsheetId);
      }
      window.open(spreadsheetUrl, '_blank');
    } catch (error: any) {
      console.error('Erro ao exportar dashboard:', error);
      if (error.status === 401 || (error.data && error.data.reauth)) {
        setNeedsGoogleAuth(true);
        alert('Sua sessão do Google expirou ou precisa de reautorização. Por favor, utilize o botão "Reconectar agora" no topo para reautenticar.');
      } else {
        alert('Erro ao exportar dashboard para o Google Sheets: ' + (error.message || error));
      }
    } finally {
      setIsExportingDashboard(false);
    }
  };

  const exportToGoogleSheets = async () => {
    if (!result) return;
    
    setIsExportingToSheets(true);
    try {
      // Check auth status
      const statusRes = await fetch('/api/auth/google/status', { credentials: 'include' });
      const { isAuthenticated } = await statusRes.json();

      if (!isAuthenticated) {
        const urlRes = await fetch('/api/auth/google/url', { credentials: 'include' });
        const { url } = await urlRes.json();
        window.open(url, 'google_auth', 'width=600,height=700');
        // Keep setIsExportingToSheets(true)
        return;
      }

      // Prepare data
      const exportData = result.payments.map(p => ({
        Empreendimento: result.property.empreendimento,
        Unidade: result.property.unidade,
        Torre: result.property.torre || '-',
        'Corretor 1': result.salesTeam?.corretor1 || '-',
        'Corretor 2': result.salesTeam?.corretor2 || '-',
        Comprador: result.customers[0]?.nome || '-',
        'Valor Total Proposta': result.valorTotalProposta || '-',
        Quantidade: p.quantidade,
        Tipo: p.tipo,
        'Valor Unitário': p.valorUnitario,
        Vencimento: p.vencimento,
        Total: p.valorTotal
      }));

      const storageKey = `spreadsheet_id_${result.id || 'temp'}`;
      const existingId = result.spreadsheet_id || localStorage.getItem(storageKey);

      const { spreadsheetUrl, spreadsheetId } = await safeFetchJson('/api/export/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          data: exportData,
          title: `Extração - ${result.property.empreendimento} - ${new Date().toLocaleDateString()}`,
          spreadsheetId: existingId
        })
      });

      if (spreadsheetId) {
        // Update local state and Firestore if we have an ID
        setResult(prev => prev ? { ...prev, spreadsheet_id: spreadsheetId } : null);
        
        if (result.id) {
          try {
            await updateDoc(doc(db, 'entrada', result.id), { spreadsheet_id: spreadsheetId });
          } catch (err) {
            console.error("Error updating extraction spreadsheet ID in Firestore:", err);
          }
        }
        localStorage.setItem(storageKey, spreadsheetId);
      }
      window.open(spreadsheetUrl, '_blank');
      alert('Tabela exportada com sucesso para o Google Sheets!');
    } catch (error: any) {
      console.error('Erro ao exportar:', error);
      if (error.status === 401 || (error.data && error.data.reauth)) {
        setNeedsGoogleAuth(true);
        const { url } = await safeFetchJson('/api/auth/google/url', { credentials: 'include' });
        window.open(url, 'google_auth', 'width=600,height=700');
        return;
      }
      alert(error.message || 'Erro ao exportar para o Google Sheets. Tente novamente.');
    } finally {
      setIsExportingToSheets(false);
    }
  };

  const uploadToDrive = async () => {
    const filesToUpload = docs.filter(d => d.file !== null);
    if (filesToUpload.length === 0) {
      alert('Nenhum documento anexado para salvar. Se você está editando uma extração antiga, anexe os arquivos novamente para enviá-los ao Drive.');
      return;
    }

    setIsUploadingToDrive(true);
    try {
      const { isAuthenticated } = await safeFetchJson('/api/auth/google/status', { credentials: 'include' });

      if (!isAuthenticated) {
        const { url } = await safeFetchJson('/api/auth/google/url', { credentials: 'include' });
        window.open(url, 'google_auth', 'width=600,height=700');
        return;
      }
      
      // Check if we have drive access already, or if we need a fresh token for the new scopes
      // We handle this via the 401 response from the server which triggers reauth
      
      let successCount = 0;
      
      // Construct folder name: EMPREENDIMENTO - UNIDADE - TORRE - CLIENTE
      let folderName = "";
      if (result) {
        const emp = (result.property?.empreendimento || "SEM_EMPREENDIMENTO").trim();
        const uni = (result.property?.unidade || "SEM_UNIDADE").trim();
        const tor = (result.property?.torre || "").trim();
        const customerName = (result.customers?.[0]?.nome || "SEM_NOME").trim();
        
        folderName = `${emp}${tor ? ' - ' + tor : ''} - UN ${uni} - ${customerName}`.toUpperCase();
      }

      let folderUrl = "";
      let lastError = null;
      for (const doc of filesToUpload) {
        if (!doc.file) continue;

        const formData = new FormData();
        formData.append('file', doc.file);
        if (folderName) {
          formData.append('folderName', folderName);
        }
        formData.append('customFileName', doc.name); // Pass the document type (RG, CPF, etc)

        try {
          const data = await safeFetchJson('/api/drive/upload', {
            method: 'POST',
            body: formData,
            credentials: 'include'
          });

          if (data.folderUrl) {
            folderUrl = data.folderUrl;
          }
          successCount++;
        } catch (err: any) {
          if (err.status === 401 || (err.data && err.data.reauth)) {
            setNeedsGoogleAuth(true);
            const { url } = await safeFetchJson('/api/auth/google/url', { credentials: 'include' });
            window.open(url, 'google_auth', 'width=600,height=700');
            return; // Stop and wait for auth
          }
          console.error(`[Drive] Falha no upload de ${doc.file.name}:`, err);
          lastError = err.message || 'Erro desconhecido';
        }
      }

      if (successCount > 0) {
        // Update Firestore if we have a result ID and a folder URL
        if (result?.id && folderUrl) {
          try {
            const docRef = doc(db, 'entrada', result.id);
            await updateDoc(docRef, {
              drive_link: folderUrl,
              updated_at: new Date().toISOString()
            });
            
            // Update local state
            setResult(prev => prev ? { ...prev, drive_link: folderUrl } : null);
            setSavedExtractions(prev => prev.map(ext => 
              ext.id === result.id ? { ...ext, drive_link: folderUrl } : ext
            ));
          } catch (err) {
            console.error('Erro ao atualizar link do Drive no Firestore:', err);
          }
        }
        alert(`${successCount} documento(s) salvo(s) com sucesso no Google Drive!`);
      } else {
        throw new Error(lastError || 'Nenhum arquivo pôde ser enviado.');
      }
    } catch (error: any) {
      console.error('Erro ao salvar no Drive:', error);
      alert(error.message || 'Erro ao salvar documentos no Google Drive. Tente novamente.');
    } finally {
      setIsUploadingToDrive(false);
    }
  };
  const logoutGoogle = async () => {
    if (!confirm('Deseja desconectar sua conta Google? Suas permissões serão solicitadas novamente na próxima exportação.')) return;
    try {
      await fetch('/api/auth/google/logout', { method: 'POST', credentials: 'include' });
      alert('Conta Google desconectada com sucesso.');
    } catch (err) {
      console.error('Erro ao desconectar Google:', err);
    }
  };

  const filteredExtractions = useMemo(() => {
    if (!searchQuery.trim()) return savedExtractions;
    const query = searchQuery.toLowerCase();
    return savedExtractions.filter(ext => {
      const property = ext.property?.empreendimento?.toLowerCase() || '';
      const unit = ext.property?.unidade?.toLowerCase() || '';
      const tower = ext.property?.torre?.toLowerCase() || '';
      const customerNames = (ext.customers || []).map(c => c.nome?.toLowerCase() || '').join(' ');
      const status = ext.status?.toLowerCase() || '';
      const id = ext.id.toLowerCase();
      
      return property.includes(query) || 
             unit.includes(query) || 
             tower.includes(query) || 
             customerNames.includes(query) || 
             status.includes(query) ||
             id.includes(query);
    });
  }, [savedExtractions, searchQuery]);
  const [showShareModal, setShowShareModal] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'readonly') {
      setIsReadOnly(true);
      setView('dashboard');
    }
  }, []);

  const syncUserProfile = async (authenticatedUser: User, customName?: string) => {
    try {
      const userRef = doc(db, 'users', authenticatedUser.uid);
      const userDoc = await getDoc(userRef);
      const isDefaultAdmin = authenticatedUser.email?.toLowerCase() === 'propostasrej@gmail.com';
      if (userDoc.exists()) {
        const role = userDoc.data().role || (isDefaultAdmin ? 'admin' : 'user');
        setUserRole(role);
      } else {
        const initialRole = isDefaultAdmin ? 'admin' : 'user';
        await setDoc(userRef, {
          email: authenticatedUser.email || '',
          displayName: authenticatedUser.displayName || customName || authenticatedUser.email?.split('@')[0] || 'Usuário',
          photoURL: authenticatedUser.photoURL || '',
          role: initialRole,
          created_at: new Date().toISOString()
        });
        setUserRole(initialRole);
      }
    } catch (err) {
      console.error("Erro ao sincronizar perfil do usuário:", err);
      if (authenticatedUser.email?.toLowerCase() === 'propostasrej@gmail.com') {
        setUserRole('admin');
      } else {
        setUserRole('user');
      }
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authenticatedUser) => {
      setUser(authenticatedUser);
      if (authenticatedUser) {
        await syncUserProfile(authenticatedUser);
      } else {
        setUserRole(null);
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.warn("Verificação de conectividade Firebase (modo offline detectado).");
        }
      }
    }
    if (isAuthReady) {
      testConnection();
    }
  }, [isAuthReady]);

  const signInWithGoogle = async () => {
    setAuthError(null);
    setAuthSuccessMessage(null);
    setIsAuthSubmitting(true);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      const result = await signInWithPopup(auth, provider);
      await syncUserProfile(result.user);
      showToast(`Bem-vindo, ${result.user.displayName || result.user.email || 'usuário'}!`, 'success');
    } catch (err: any) {
      const isPopupClosed = 
        err?.code === 'auth/popup-closed-by-user' || 
        err?.code === 'auth/cancelled-popup-request' ||
        err?.code === 'auth/user-cancelled' ||
        (typeof err?.message === 'string' && (
          err.message.includes('popup-closed-by-user') || 
          err.message.includes('cancelled-popup-request') ||
          err.message.includes('user-cancelled')
        ));

      if (isPopupClosed) {
        // User closed or cancelled the popup dialog - normal flow, not an error
        console.info("Login com Google cancelado pelo usuário.");
        return;
      }

      let msg = "Erro ao fazer login com Google.";
      if (err.code === 'auth/popup-blocked') {
        console.warn("Pop-up bloqueado pelo navegador:", err);
        msg = "O navegador bloqueou a janela pop-up do Google. Permita pop-ups neste navegador ou utilize a aba 'E-mail e Senha' logo abaixo.";
      } else if (err.code === 'auth/unauthorized-domain') {
        console.warn("Domínio de acesso não autorizado no Firebase Console:", err);
        msg = "Domínio de acesso não autorizado no Firebase Console. Utilize a aba 'E-mail e Senha' para acessar normalmente.";
      } else if (err.code === 'auth/network-request-failed') {
        console.warn("Falha na conexão de rede:", err);
        msg = "Falha na conexão de rede. Verifique sua conexão com a internet.";
      } else {
        console.error("Erro ao fazer login com Google:", err);
        if (err.message) {
          msg = `Erro na autenticação: ${err.message}`;
        }
      }
      setAuthError(msg);
      showToast(msg, 'error');
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleEmailAuth = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAuthError(null);
    setAuthSuccessMessage(null);

    const emailTrimmed = authEmail.trim();
    if (!emailTrimmed || !authPassword) {
      setAuthError("Por favor, preencha o e-mail e a senha.");
      return;
    }

    if (isRegistering && authPassword.length < 6) {
      setAuthError("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    setIsAuthSubmitting(true);
    try {
      if (isRegistering) {
        const cred = await createUserWithEmailAndPassword(auth, emailTrimmed, authPassword);
        const nameToUse = authDisplayName.trim() || emailTrimmed.split('@')[0];
        try {
          await updateProfile(cred.user, { displayName: nameToUse });
        } catch (nameErr) {
          console.warn("Could not set displayName on auth profile:", nameErr);
        }
        await syncUserProfile(cred.user, nameToUse);
        showToast(`Conta criada com sucesso! Bem-vindo, ${nameToUse}!`, 'success');
      } else {
        const cred = await signInWithEmailAndPassword(auth, emailTrimmed, authPassword);
        await syncUserProfile(cred.user);
        showToast(`Bem-vindo, ${cred.user.displayName || cred.user.email}!`, 'success');
      }
    } catch (err: any) {
      let msg = "Não foi possível autenticar.";
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        console.warn("Credenciais inválidas na autenticação por email:", err.code);
        msg = "E-mail ou senha incorretos. Verifique os dados ou crie uma nova conta.";
      } else if (err.code === 'auth/email-already-in-use') {
        console.warn("Email já cadastrado:", err.code);
        msg = "Este e-mail já está cadastrado. Alterne para a aba de 'Entrar' ou redefina sua senha.";
      } else if (err.code === 'auth/weak-password') {
        console.warn("Senha fraca:", err.code);
        msg = "A senha deve conter no mínimo 6 caracteres.";
      } else if (err.code === 'auth/invalid-email') {
        console.warn("Formato de email inválido:", err.code);
        msg = "Formato de e-mail inválido. Verifique o endereço digitado.";
      } else if (err.code === 'auth/network-request-failed') {
        console.warn("Falha de rede na autenticação por email:", err);
        msg = "Falha de rede. Verifique sua conexão com a internet.";
      } else {
        console.error("Erro na autenticação por email:", err);
        if (err.message) {
          msg = err.message;
        }
      }
      setAuthError(msg);
      showToast(msg, 'error');
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    const emailTrimmed = authEmail.trim();
    if (!emailTrimmed) {
      setAuthError("Digite seu e-mail no campo acima para receber o link de redefinição de senha.");
      return;
    }
    setAuthError(null);
    setAuthSuccessMessage(null);
    setIsAuthSubmitting(true);
    try {
      await sendPasswordResetEmail(auth, emailTrimmed);
      setAuthSuccessMessage("E-mail de redefinição de senha enviado! Verifique sua caixa de entrada e spam.");
      showToast("E-mail de recuperação enviado com sucesso!", 'success');
    } catch (err: any) {
      let msg = "Erro ao enviar e-mail de recuperação.";
      if (err.code === 'auth/user-not-found') {
        console.warn("Usuário não encontrado:", err.code);
        msg = "Nenhum usuário cadastrado com este e-mail.";
      } else if (err.code === 'auth/invalid-email') {
        console.warn("Email inválido:", err.code);
        msg = "Formato de e-mail inválido.";
      } else {
        console.error("Erro ao enviar reset:", err);
        if (err.message) {
          msg = err.message;
        }
      }
      setAuthError(msg);
      showToast(msg, 'error');
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const signIn = signInWithGoogle;

  useEffect(() => {
    if (view === 'usuarios' && isAdmin) {
      setIsLoadingUsers(true);
      const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
        setAllUsers(snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) })));
        setIsLoadingUsers(false);
      });
      return () => unsubscribe();
    }
  }, [view, isAdmin]);

  const updateUserRole = async (userId: string, newRole: 'admin' | 'user' | 'EV') => {
    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole });
      alert('Perfil atualizado com sucesso!');
    } catch (err) {
      console.error("Erro ao atualizar perfil:", err);
      alert('Erro ao atualizar perfil.');
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      showToast('Sessão encerrada.', 'info');
      setView('extract');
    } catch (err: any) {
      console.error(err);
    }
  };

  useEffect(() => {
    if ((!user && !isReadOnly) || view !== 'dashboard' || !isAuthReady) return;

    const path = 'entrada';
    const isActuallyAdmin = userRole === 'admin' || user?.email?.toLowerCase() === 'propostasrej@gmail.com';
    
    let q;
    if (isActuallyAdmin || isReadOnly) {
      q = query(collection(db, path), orderBy('created_at', 'desc'));
    } else if (user) {
      // Avoid requiring composite index on (uid, created_at)
      q = query(collection(db, path), where('uid', '==', user.uid));
    } else {
      return;
    }
    
    setIsLoadingDashboard(true);
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const data = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as Record<string, any>)
      })) as SavedExtraction[];
      // Client-side sort so regular users never suffer from missing composite indexes
      data.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
      setSavedExtractions(data);
      setIsLoadingDashboard(false);
      setLastSync(new Date());
    }, (err) => {
      if (!isReadOnly) {
        handleFirestoreError(err, OperationType.LIST, path);
      }
      setIsLoadingDashboard(false);
    });

    return () => unsubscribe();
  }, [view, user, isReadOnly, userRole]);

  const fetchExtractions = async () => {
    if (!user && !isReadOnly) return null;
    setIsLoadingDashboard(true);
    const path = 'entrada';
    try {
      const isActuallyAdmin = userRole === 'admin' || user?.email?.toLowerCase() === 'propostasrej@gmail.com';
      let q;
      if (isActuallyAdmin || isReadOnly) {
        q = query(collection(db, path), orderBy('created_at', 'desc'));
      } else {
        q = query(collection(db, path), where('uid', '==', user.uid));
      }
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as Record<string, any>)
      })) as SavedExtraction[];
      data.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
      setSavedExtractions(data);
      setLastSync(new Date());
      return data;
    } catch (err: any) {
      if (!isReadOnly) {
        handleFirestoreError(err, OperationType.LIST, path);
      }
      return null;
    } finally {
      setIsLoadingDashboard(false);
    }
  };

  const startNewExtraction = () => {
    setResult(null);
    setWaterfallResult(null);
    setIsManualRateio(false);
    setIsEditingRateio(false);
    setDocs(REQUIRED_DOCS.map(doc => ({ ...doc, file: null, status: 'pending' })));
    setIsEditing(false);
    setSaveStatus('idle');
    setError(null);
    setView('extract');
  };

  const startManualProposal = () => {
    const emptyResult: ExtractionResult = {
      property: { empreendimento: '', unidade: '', torre: '' },
      salesTeam: { corretor1: '', corretor2: '', gerente: '' },
      customers: [{
        nome: '',
        cpf: '',
        telefone: '',
        email: '',
        dataNascimento: '',
        rgNumero: '',
        rgOrgao: '',
        rgDataExpedicao: '',
        estadoCivil: '',
        profissao: '',
        naturalidade: '',
        nacionalidade: '',
        address: { cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '' }
      }],
      address: { cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '' },
      payments: [{ quantidade: 1, tipo: '', valorUnitario: 0, vencimento: '', valorTotal: 0 }],
      validations: { cpfMatch: true, totalValueMatch: true },
      valorTotalProposta: 0,
      proposta_status: 'AGUARDANDO APROVAÇÃO',
      cvc_status: 'PENDENTE',
      corretagem_status: 'PENDENTE',
      forma_pagamento_comissao: 'PAGADORIA',
      informacoes_adicionais: ''
    };
    setResult(emptyResult);
    setWaterfallResult(null);
    setIsManualRateio(false);
    setIsEditingRateio(false);
    setIsEditing(true);
    setView('extract');
  };

  const updateExtractionStatus = async (id: string, newStatus: ExtractionStatus) => {
    if (!user) return;
    const path = `entrada/${id}`;
    try {
      const docRef = doc(db, 'entrada', id);
      await updateDoc(docRef, { 
        status: newStatus,
        updated_at: new Date().toISOString()
      });
      
      setSavedExtractions(prev => prev.map(ext => 
        ext.id === id ? { ...ext, status: newStatus, updated_at: new Date().toISOString() } : ext
      ));
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const updateExtractionField = async (id: string, field: string, value: any) => {
    if (!user) return;
    const path = `entrada/${id}`;
    try {
      const docRef = doc(db, 'entrada', id);
      await updateDoc(docRef, { 
        [field]: value,
        updated_at: new Date().toISOString()
      });
      
      setSavedExtractions(prev => prev.map(ext => 
        ext.id === id ? { ...ext, [field]: value, updated_at: new Date().toISOString() } : ext
      ));
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const deleteExtraction = async (id: string) => {
    setIdToDelete(id);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!idToDelete || !user) return;
    
    setIsDeleting(true);
    const path = `entrada/${idToDelete}`;
    try {
      await deleteDoc(doc(db, 'entrada', idToDelete));
      setSavedExtractions(prev => prev.filter(ext => ext.id !== idToDelete));
      setShowDeleteModal(false);
      setIdToDelete(null);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, path);
    } finally {
      setIsDeleting(false);
    }
  };

  const runSimulation = useCallback(async (forceRecalculate = false) => {
    if (!result) return;
    setIsSimulating(true);
    setSimulationResult(null);
    
    // Pequeno delay para efeito visual de "apagar e recalcular"
    await new Promise(resolve => setTimeout(resolve, 600));

    const currentEmp = empreendimentos.find(e => e.nome === result.property.empreendimento);
    const effectivePercentual = percentualComissao;

    const sim = processarProposta(
      result.payments, 
      effectivePercentual, 
      currentEmp?.regras_comissao, 
      installmentConfigs,
      result.forma_pagamento_comissao,
      result.valorTotalProposta
    );
    
    setSimulationResult(sim);

    if (forceRecalculate || !isManualRateio) {
      // Calcular Rateio em Cascata (Waterfall)
      const sumExcluded = result.payments
        .filter(p => isExcludedFromCommissionBase(p.tipo))
        .reduce((acc, p) => acc + (p.valorTotal || 0), 0);
      const sumAllParcelas = result.payments.reduce((acc, p) => acc + (p.valorTotal || 0), 0);
      const baseVendaTotal = Math.max(0, (sumAllParcelas > 0 ? sumAllParcelas : (result.valorTotalProposta || 0)) - sumExcluded);

      const waterfall = calcularRateioCascata(
        baseVendaTotal,
        effectivePercentual,
        sim.fluxo,
        result.forma_pagamento_comissao,
        commissionedParties,
        currentEmp?.regras_comissao
      );

      setWaterfallResult(waterfall);
      setIsManualRateio(false);
    }
    
    setIsSimulating(false);
  }, [result, percentualComissao, empreendimentos, installmentConfigs, isManualRateio, commissionedParties]);

  const recalibrarTotalsRateio = (updatedDetalhes: any[]): WaterfallResult | null => {
    if (!waterfallResult) return null;

    // Inicializar recebidos de cada participante com 0
    const updatedParticipantes = waterfallResult.participantes.map(p => ({
      ...p,
      received: 0,
      balance: p.cap
    }));

    // Atualizar valorRetido de cada parcela somando os valores de sua distribuição
    const finalDetalhes = updatedDetalhes.map(det => {
      const rowSum: number = Object.values(det.distribuicao || {}).reduce<number>((sum, v) => sum + (Number(v) || 0), 0);
      return {
        ...det,
        valorRetido: Number(rowSum.toFixed(2))
      };
    });

    // Somar todas as distribuições em cada detalhe de parcela
    finalDetalhes.forEach(det => {
      Object.entries(det.distribuicao || {}).forEach(([label, value]) => {
        const valNum = Number(value) || 0;
        const pIdx = updatedParticipantes.findIndex(p => {
          const pLabel = p.name ? `${p.role} - ${p.name}` : p.role;
          return pLabel === label;
        });
        if (pIdx !== -1) {
          updatedParticipantes[pIdx].received = Number((updatedParticipantes[pIdx].received + valNum).toFixed(2));
          updatedParticipantes[pIdx].balance = Number((updatedParticipantes[pIdx].cap - updatedParticipantes[pIdx].received).toFixed(2));
        }
      });
    });

    // Calcular saldo restante global de comissão
    const totalDistributed = updatedParticipantes.reduce((sum, p) => sum + p.received, 0);
    const saldoRestanteComissao = Math.max(0, Number((waterfallResult.comissaoTotal - totalDistributed).toFixed(2)));

    return {
      ...waterfallResult,
      participantes: updatedParticipantes,
      detalhesParcelas: finalDetalhes,
      saldoRestanteComissao
    };
  };

  const handleCellEdit = (installmentIndex: number, participantLabel: string, newValueRaw: string) => {
    if (!waterfallResult) return;
    
    // Permitir string vazia ou número, se vazio tratar como 0 para os totais mas preservar o valor em edição
    const newValue = newValueRaw === '' ? 0 : parseFloat(newValueRaw) || 0;

    const updatedDetails = waterfallResult.detalhesParcelas.map((det, idx) => {
      if (idx === installmentIndex) {
        return {
          ...det,
          distribuicao: {
            ...det.distribuicao,
            [participantLabel]: newValue
          }
        };
      }
      return det;
    });

    const updatedResult = recalibrarTotalsRateio(updatedDetails);
    if (updatedResult) {
      setWaterfallResult(updatedResult);
      setIsManualRateio(true);
    }
  };

  useEffect(() => {
    if (result && !simulationResult) {
      runSimulation();
    }
  }, [result, simulationResult, runSimulation]);

  // Synchronize commissionedParties with selected Empreendimento's model rateio template
  useEffect(() => {
    if (!result?.property?.empreendimento) return;
    const currentEmp = empreendimentos.find(
      e => e.nome?.toLowerCase().trim() === result.property.empreendimento?.toLowerCase().trim()
    );
    if (currentEmp && currentEmp.modelo_rateio && currentEmp.modelo_rateio.length > 0) {
      const mappedParties = currentEmp.modelo_rateio.map(item => ({
        role: item.cargo,
        name: item.nome || '',
        percentage: item.taxa_comissao,
        deduction: 0
      }));
      
      const isDifferent = JSON.stringify(mappedParties) !== JSON.stringify(
        commissionedParties.map(p => ({
          role: p.role,
          name: p.name || '',
          percentage: p.percentage,
          deduction: 0
        }))
      );
      if (isDifferent) {
        setCommissionedParties(mappedParties);
        const sumRates = mappedParties.reduce((acc, p) => acc + p.percentage, 0);
        setPercentualComissao(sumRates);
      }
    }
  }, [result?.property?.empreendimento, empreendimentos]);

  // Automatically recalculate waterfall and simulation when commissionedParties, percentualComissao, or proposal data changes
  useEffect(() => {
    if (result && !isManualRateio) {
      const currentEmp = empreendimentos.find(e => e.nome === result.property.empreendimento);
      const effectivePercentual = percentualComissao;

      const sim = processarProposta(
        result.payments, 
        effectivePercentual, 
        currentEmp?.regras_comissao, 
        installmentConfigs,
        result.forma_pagamento_comissao,
        result.valorTotalProposta
      );
      setSimulationResult(sim);

      const sumExcluded = result.payments
        .filter(p => isExcludedFromCommissionBase(p.tipo))
        .reduce((acc, p) => acc + (p.valorTotal || 0), 0);
      const sumAllParcelas = result.payments.reduce((acc, p) => acc + (p.valorTotal || 0), 0);
      const baseVendaTotal = Math.max(0, (sumAllParcelas > 0 ? sumAllParcelas : (result.valorTotalProposta || 0)) - sumExcluded);

      const waterfall = calcularRateioCascata(
        baseVendaTotal,
        effectivePercentual,
        sim.fluxo,
        result.forma_pagamento_comissao,
        commissionedParties,
        currentEmp?.regras_comissao
      );
      setWaterfallResult(waterfall);
    }
  }, [commissionedParties, percentualComissao, result, installmentConfigs, empreendimentos, isManualRateio]);

  const updateResult = (section: keyof ExtractionResult, field: string, value: any) => {
    setResult(prev => {
      if (!prev) return null;
      return {
        ...prev,
        [section]: {
          ...(prev[section] as any),
          [field]: value
        }
      };
    });
  };

  const updateCustomer = (index: number, field: string, value: any) => {
    setResult(prev => {
      if (!prev) return null;
      const newCustomers = [...(prev.customers || [])];
      newCustomers[index] = { ...newCustomers[index], [field]: value };
      return { ...prev, customers: newCustomers };
    });
  };

  const updateCustomerAddress = (index: number, field: string, value: any) => {
    setResult(prev => {
      if (!prev) return null;
      const newCustomers = [...(prev.customers || [])];
      const customer = { ...newCustomers[index] };
      customer.address = { 
        ...(customer.address || { cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '' }), 
        [field]: value 
      };
      newCustomers[index] = customer;
      return { ...prev, customers: newCustomers };
    });
  };

  const addCustomer = () => {
    setResult(prev => {
      if (!prev) return null;
      const newCustomer = {
        nome: '', cpf: '', telefone: '', email: '', dataNascimento: '',
        rgNumero: '', rgOrgao: '', rgDataExpedicao: '', estadoCivil: '',
        profissao: '', naturalidade: '', nacionalidade: '',
        address: { cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '' }
      };
      return { ...prev, customers: [...(prev.customers || []), newCustomer] };
    });
  };

  const removeCustomer = (index: number) => {
    setResult(prev => {
      if (!prev) return null;
      const newCustomers = (prev.customers || []).filter((_, i) => i !== index);
      return { ...prev, customers: newCustomers };
    });
  };

  const updatePayment = (index: number, field: string, value: any) => {
    setResult(prev => {
      if (!prev) return null;
      const newPayments = [...prev.payments];
      newPayments[index] = { ...newPayments[index], [field]: value };
      
      // Recalculate total if unit or quantity changes
      if (field === 'quantidade' || field === 'valorUnitario') {
        const qty = Number(newPayments[index].quantidade) || 0;
        const val = Number(newPayments[index].valorUnitario) || 0;
        newPayments[index].valorTotal = Number((qty * val).toFixed(2));
      }
      
      const newTotal = Number(newPayments.reduce((acc, p) => acc + (p.valorTotal || 0), 0).toFixed(2));
      return { ...prev, payments: newPayments, valorTotalProposta: newTotal };
    });
  };

  const addPayment = () => {
    setResult(prev => {
      if (!prev) return null;
      const newPayment = {
        quantidade: 1,
        tipo: '',
        valorUnitario: 0,
        vencimento: '',
        valorTotal: 0
      };
      const newPayments = [...prev.payments, newPayment];
      const newTotal = Number(newPayments.reduce((acc, p) => acc + (p.valorTotal || 0), 0).toFixed(2));
      return { ...prev, payments: newPayments, valorTotalProposta: newTotal };
    });
  };

  const removePayment = (index: number) => {
    setResult(prev => {
      if (!prev) return null;
      const newPayments = prev.payments.filter((_, i) => i !== index);
      const newTotal = Number(newPayments.reduce((acc, p) => acc + (p.valorTotal || 0), 0).toFixed(2));
      return { ...prev, payments: newPayments, valorTotalProposta: newTotal };
    });
  };

  const handleFileChange = (id: string, file: File | null) => {
    setDocs(prev => prev.map(doc => 
      doc.id === id ? { ...doc, file, status: file ? 'completed' : 'pending' } : doc
    ));
    if (file) {
      showToast(`${file.name} carregado com sucesso!`, 'success');
    }
    // Don't clear result if we are editing, to keep the ID
    if (!isEditing) {
      setResult(null);
    }
    setError(null);
  };

  const removeFile = (id: string) => {
    const doc = docs.find(d => d.id === id);
    const isInitialDoc = REQUIRED_DOCS.some(rd => rd.id === id);
    
    if (isInitialDoc) {
      handleFileChange(id, null);
    } else {
      setDocs(prev => prev.filter(d => d.id !== id));
    }
  };

  const addAdditionalDoc = () => {
    const newId = `additional-${Date.now()}`;
    setDocs(prev => [
      ...prev,
      { id: newId, name: 'Documento Adicional', file: null, status: 'pending', required: false }
    ]);
  };

  const canProcess = useMemo(() => {
    return docs.some(d => d.file !== null);
  }, [docs]);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = error => reject(error);
    });
  };

  const optimizeImageForOcr = async (file: File): Promise<Uint8Array> => {
    return new Promise((resolve) => {
      const isImg = file.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(file.name);
      if (!isImg) {
        file.arrayBuffer().then(b => resolve(new Uint8Array(b))).catch(() => resolve(new Uint8Array()));
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          try {
            const maxDim = 1600;
            let { width, height } = img;
            if (width > maxDim || height > maxDim) {
              if (width > height) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
              } else {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
              }
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              file.arrayBuffer().then(b => resolve(new Uint8Array(b))).catch(() => resolve(new Uint8Array()));
              return;
            }
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob(
              (blob) => {
                if (blob) {
                  blob.arrayBuffer().then(b => resolve(new Uint8Array(b))).catch(() => resolve(new Uint8Array()));
                } else {
                  file.arrayBuffer().then(b => resolve(new Uint8Array(b))).catch(() => resolve(new Uint8Array()));
                }
              },
              'image/jpeg',
              0.82
            );
          } catch (err) {
            file.arrayBuffer().then(b => resolve(new Uint8Array(b))).catch(() => resolve(new Uint8Array()));
          }
        };
        img.onerror = () => {
          file.arrayBuffer().then(b => resolve(new Uint8Array(b))).catch(() => resolve(new Uint8Array()));
        };
        img.src = e.target?.result as string;
      };
      reader.onerror = () => {
        file.arrayBuffer().then(b => resolve(new Uint8Array(b))).catch(() => resolve(new Uint8Array()));
      };
      reader.readAsDataURL(file);
    });
  };

  useEffect(() => {
    if (view === 'inbox' && user) {
      fetchInboxFiles();
    }
  }, [view, user]);

  const fetchInboxFiles = async () => {
    setIsLoadingInbox(true);
    try {
      const data = await safeFetchJson('/api/drive/list?folderName=AppSheet_Propostas', { credentials: 'include' });
      setInboxFiles(data.files || []);
    } catch (error: any) {
      console.error('Erro ao buscar arquivos da fila:', error);
      if (error.status === 401) {
        setInboxFiles([]);
      }
    } finally {
      setIsLoadingInbox(false);
    }
  };

  const processInboxFile = async (file: any) => {
    setIsProcessing(true);
    setView('extract');
    try {
      const response = await fetch(`/api/drive/file/${file.id}`);
      if (!response.ok) {
        if (response.status === 401) {
          const { url } = await safeFetchJson('/api/auth/google/url', { credentials: 'include' });
          window.open(url, 'google_auth', 'width=600,height=700');
          return;
        }
        throw new Error('Falha ao baixar arquivo do Drive');
      }
      
      const blob = await response.blob();
      const fileObj = new File([blob], file.name, { type: blob.type });
      
      setDocs(prev => prev.map((d, i) => i === 0 ? { ...d, file: fileObj, status: 'completed' } : d));
      
      await extractDataFromFiles([fileObj]);
    } catch (error: any) {
      console.error('Erro ao processar arquivo da fila:', error);
      alert(error.message || 'Erro ao baixar o arquivo para processamento.');
    } finally {
      setIsProcessing(false);
    }
  };

  const extractDataFromFiles = async (filesToProcess: File[]) => {
    if (filesToProcess.length === 0) return;
    
    setIsProcessing(true);
    setError(null);
    
    try {
      // Validar tamanho dos arquivos para evitar enviar arquivos vazios
      const emptyFiles = filesToProcess.filter(f => f.size === 0);
      if (emptyFiles.length > 0) {
        throw new Error(`O arquivo "${emptyFiles[0].name}" está vazio (0 bytes) e não pode ser processado.`);
      }

      // Validar formatos suportados para evitar erros desnecessários no servidor Gemini
      const supportedExtensions = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'txt'];
      for (const file of filesToProcess) {
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        // Admite arquivos sem extensão, mas se tiver, valida
        if (ext && !supportedExtensions.includes(ext)) {
          throw new Error(`O formato do arquivo "${file.name}" (.${ext.toUpperCase()}) não é suportado pelo analisador de IA. Por favor, envie arquivos em formato PDF ou Imagem (PNG, JPG, WEBP).`);
        }
      }

      const pdfDocsToMerge: File[] = [];
      const alternateParts: any[] = [];

      for (const file of filesToProcess) {
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        if (
          file.type === 'application/pdf' || 
          ext === 'pdf' ||
          file.type === 'image/jpeg' || 
          file.type === 'image/jpg' || 
          ext === 'jpg' || 
          ext === 'jpeg' ||
          file.type === 'image/png' || 
          ext === 'png'
        ) {
          pdfDocsToMerge.push(file);
        } else {
          // Send exotic/non-mergeable or unsupported formats as separate parts directly
          const base64 = await fileToBase64(file);
          let mimeType = file.type;
          if (ext === 'webp') mimeType = 'image/webp';
          else if (ext === 'gif') mimeType = 'image/gif';
          else if (ext === 'txt') mimeType = 'text/plain';
          
          alternateParts.push({
            inlineData: {
              data: base64,
              mimeType: mimeType || 'image/jpeg'
            }
          });
        }
      }

      let mergedBase64 = "";
      if (pdfDocsToMerge.length > 0) {
        console.log(`[Extraction] Iniciando mesclagem de ${pdfDocsToMerge.length} arquivos compatíveis...`);
        const mergedPdf = await PDFDocument.create();
        let hasPages = false;

        for (const file of pdfDocsToMerge) {
          try {
            const fileBytes = await file.arrayBuffer();
            const ext = file.name.split('.').pop()?.toLowerCase() || '';

            if (file.type === 'application/pdf' || ext === 'pdf') {
              console.log(`[Extraction] Lendo arquivo PDF para mesclar: ${file.name}`);
              const externalPdf = await PDFDocument.load(fileBytes);
              const copiedPages = await mergedPdf.copyPages(externalPdf, externalPdf.getPageIndices());
              copiedPages.forEach((page) => {
                mergedPdf.addPage(page);
                hasPages = true;
              });
            } else {
              console.log(`[Extraction] Otimizando e embutindo imagem no PDF master: ${file.name}`);
              const optimizedBytes = await optimizeImageForOcr(file);
              let image;
              try {
                image = await mergedPdf.embedJpg(optimizedBytes);
              } catch (embedErr) {
                console.warn("[Extraction] embedJpg falhou, tentando embedPng:", embedErr);
                image = await mergedPdf.embedPng(optimizedBytes).catch(() => null);
              }
              if (image) {
                const page = mergedPdf.addPage();
                const { width, height } = image.scale(1);
                page.setSize(width, height);
                page.drawImage(image, { x: 0, y: 0, width, height });
                hasPages = true;
              }
            }
          } catch (fileErr) {
            console.error(`[Extraction] Erro ao carregar arquivo de entrada "${file.name}":`, fileErr);
            throw new Error(`O arquivo "${file.name}" parece estar corrompido ou é inválido. Por favor, remova ou reinsira este arquivo.`);
          }
        }

        if (hasPages) {
          const finalPdfBytes = await mergedPdf.save();
          mergedBase64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const resultStr = reader.result as string;
              resolve(resultStr.split(',')[1]);
            };
            reader.readAsDataURL(new Blob([finalPdfBytes], { type: 'application/pdf' }));
          });
        }
      }

      const parts: any[] = [];
      if (mergedBase64) {
        parts.push({
          inlineData: {
            data: mergedBase64,
            mimeType: 'application/pdf'
          }
        });
      }
      parts.push(...alternateParts);

      const prompt = `Você é o Analista de Cadastro R&J. Extraia os dados destes documentos imobiliários.
      
      Instruções:
      1. Identifique o Empreendimento, Unidade, Torre e a Cidade/Estado (Município e UF) onde o imóvel está localizado.
      2. Identifique os Corretores.
      3. Extraia os DADOS DOS CLIENTES (Pode haver mais de um comprador): Nome, CPF, Telefone, Email, Data de Nascimento, RG (N.º, Órgão Expedidor, Data de Expedição), Estado Civil, Profissão, Naturalidade, Nacionalidade.
      4. Extraia o ENDEREÇO DE RESIDÊNCIA DO COMPRADOR: CEP, Logradouro, N.º, Complemento, Bairro, Cidade, Estado.
      5. Extraia a tabela de pagamentos completa (Quantidade, Tipo, Valor Unitário, Vencimento, Valor Total).
         - IMPORTANTE: No campo 'tipo' da parcela, certifique-se de incluir termos de periodicidade caso existam (ex: "INTERMEDIÁRIA ANUAL", "REFORÇO SEMESTRAL", "TRIMESTRAL").
      6. Identifique o VALOR TOTAL DA PROPOSTA/VENDA indicado no documento.
      7. Identifique especificamente o valor total das ENTRADAS (sinal, ato, princípio de pagamento).
      8. Valide se o CPF no documento de identidade coincide com a ficha cadastral.
      9. Verifique se a soma das parcelas coincide com o valor total informado.
      10. Relacione todos os documentos identificados nos arquivos enviados (ex: RG, CPF, Proposta, Comprovante de Residência, etc).
      
      ATENÇÃO PARA EVITAR SINTAXE DE JSON TRUNCADO: Os campos textuais de descrição, mensagens de validação e nomes devem ser EXTREMAMENTE curtos, diretos e objetivos (ex: descrição de documento de no máximo 10 palavras). Evite longas justificativas ou explicações verbosas.`;

      let responseData: any = null;
      let lastErrorMessage: string = "";
      const extractUrl = getApiUrl("/api/gemini/extract");
      const candidateModels = ["gemini-2.5-flash", "gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-3.8-flash"];

      // Loop de execução robusto com retentativa automática e failover progressivo
      for (let attempt = 1; attempt <= candidateModels.length; attempt++) {
        const targetModel = candidateModels[attempt - 1];
        try {
          const fetchRes = await fetch(extractUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              parts: [...parts, { text: prompt }],
              model: targetModel,
              responseSchema: EXTRACTION_SCHEMA
            }),
          });

          const rawText = await fetchRes.text();
          const isHtml = rawText.trim().startsWith("<");

          // Se a resposta for HTML (ex: proxy de contêiner ou reinício temporário), tenta novamente
          if (isHtml) {
            console.warn(`[Extraction] Servidor retornou HTML (HTTP ${fetchRes.status}) na tentativa ${attempt}.`);
            if (attempt < candidateModels.length) {
              showToast("Sincronizando com o servidor de IA...", "info");
              await new Promise(r => setTimeout(r, 1800));
              continue;
            } else {
              lastErrorMessage = "O servidor de IA está temporariamente indisponível ou reiniciando. Por favor, tente novamente em alguns instantes.";
              break;
            }
          }

          let json: any = {};
          try {
            json = JSON.parse(rawText);
          } catch {
            console.warn(`[Extraction] Resposta não-JSON recebida na tentativa ${attempt}:`, rawText.substring(0, 150));
            if (attempt < candidateModels.length) {
              await new Promise(r => setTimeout(r, 1500));
              continue;
            } else {
              lastErrorMessage = `Resposta inválida recebida do servidor (${fetchRes.status}). Tente novamente.`;
              break;
            }
          }

          // Se status não for OK (ex: 503 alta demanda ou 429 rate limit), faz failover para o próximo modelo
          if (!fetchRes.ok) {
            const errDetail = json.error || json.details || `Erro ${fetchRes.status}`;
            console.warn(`[Extraction] Erro do servidor na tentativa ${attempt} (${targetModel}):`, errDetail);
            lastErrorMessage = json.error || json.details || `Erro no processamento (${fetchRes.status})`;

            if ((fetchRes.status === 503 || fetchRes.status === 429 || fetchRes.status === 500 || fetchRes.status === 504) && attempt < candidateModels.length) {
              showToast("Otimizando requisição de IA com modelo de alta disponibilidade...", "info");
              await new Promise(r => setTimeout(r, 1500));
              continue;
            } else {
              break;
            }
          }

          // Sucesso
          responseData = json;
          break;
        } catch (fetchErr: any) {
          console.warn(`[Extraction] Falha na requisição de rede (tentativa ${attempt}):`, fetchErr);
          lastErrorMessage = fetchErr?.message || "Falha na conexão de rede com o servidor de IA.";
          if (attempt < candidateModels.length) {
            showToast("Conexão instável. Reconectando ao serviço de IA...", "info");
            await new Promise(r => setTimeout(r, 1800));
          }
        }
      }

      if (!responseData) {
        throw new Error(
          lastErrorMessage || 
          "Não foi possível processar a extração com a IA no momento. Por favor, tente novamente."
        );
      }

      const text = responseData.text;
      if (!text) throw new Error("A IA não retornou dados.");
      
      let parsed: ExtractionResult;
      try {
        parsed = JSON.parse(text) as ExtractionResult;
      } catch (err) {
        console.warn("[App] Falha ao analisar o JSON retornado do Gemini, tentando reparar JSON truncado...", err);
        try {
          const repairedText = jsonrepair(text);
          parsed = JSON.parse(repairedText) as ExtractionResult;
          console.log("[App] JSON reparado com sucesso da resposta do Gemini!");
        } catch (repairErr) {
          console.error("[App] Falha ao reparar JSON:", repairErr);
          throw new Error("Não foi possível processar a resposta do Gemini devido a uma formatação inválida/truncada no JSON.");
        }
      }
      setResult(parsed);
      showToast('Dados extraídos com sucesso!', 'success');
      
      setDocs(prev => prev.map(d => ({ ...d, status: 'completed' })));
    } catch (err: any) {
      console.error("Erro na extração:", err);
      let userFriendlyMessage = err.message || "Erro ao processar os documentos. Verifique se os arquivos são legíveis.";
      if (String(err).includes("Failed to fetch") || userFriendlyMessage.includes("Failed to fetch")) {
        userFriendlyMessage = "Falha de conexão com o servidor de IA (tempo limite excedido ou rede interrompida). Por favor, tente novamente.";
      }
      setError(userFriendlyMessage);
      showToast(userFriendlyMessage, 'error');
      setDocs(prev => prev.map(d => ({ ...d, status: 'error' })));
    } finally {
      setIsProcessing(false);
    }
  };

  const processDocuments = async () => {
    const filesToProcess = docs.filter(d => d.file).map(d => d.file as File);
    await extractDataFromFiles(filesToProcess);
  };

  const getLocalImovel = (
    prop?: PropertyData, 
    addr?: AddressData, 
    empList: Empreendimento[] = empreendimentos
  ): string => {
    // 1. Prioridade: Cidade e Estado definidos diretamente nos dados do imóvel
    if (prop?.cidade && prop.cidade.trim()) {
      const cid = prop.cidade.trim();
      const uf = (prop.estado || '').trim().toUpperCase();
      return uf ? `${cid} - ${uf}` : cid;
    }
    if (prop?.localizacao && prop.localizacao.trim()) {
      let loc = prop.localizacao.trim();
      if (loc.includes('/') && !loc.includes(' - ')) {
        loc = loc.replace('/', ' - ');
      }
      return loc;
    }

    // 2. Prioridade: Localização cadastrada no Empreendimento correspondente
    if (prop?.empreendimento && empList && empList.length > 0) {
      const empNome = prop.empreendimento.trim().toLowerCase();
      const emp = empList.find(e => e.nome && e.nome.trim().toLowerCase() === empNome);
      if (emp?.localizacao && emp.localizacao.trim()) {
        let loc = emp.localizacao.trim();
        if (loc.includes('/') && !loc.includes(' - ')) {
          loc = loc.replace('/', ' - ');
        }
        return loc;
      }
    }

    // 3. Fallback: Se o cadastro do comprador possuir cidade/estado
    if (addr?.cidade && addr.cidade.trim()) {
      const cid = addr.cidade.trim();
      const uf = (addr.estado || '').trim().toUpperCase();
      return uf ? `${cid} - ${uf}` : cid;
    }

    // 4. Default de segurança do sistema
    return 'São Paulo - SP';
  };

  const getEnderecoEmpreendimento = (
    prop?: PropertyData, 
    empList: Empreendimento[] = empreendimentos
  ): string => {
    // 1. Endereço explícito do imóvel na proposta
    if (prop?.endereco && prop.endereco.trim()) {
      return prop.endereco.trim();
    }
    // 2. Busca no cadastro do empreendimento vinculado
    if (prop?.empreendimento && empList && empList.length > 0) {
      const empNome = prop.empreendimento.trim().toLowerCase();
      const emp = empList.find(e => e.nome && e.nome.trim().toLowerCase() === empNome);
      if (emp) {
        if (emp.endereco && emp.endereco.trim()) {
          return emp.endereco.trim();
        }
        if (emp.localizacao && emp.localizacao.trim()) {
          return emp.localizacao.trim();
        }
      }
    }
    // 3. Localização direta da property
    if (prop?.localizacao && prop.localizacao.trim()) {
      return prop.localizacao.trim();
    }
    // 4. Cidade / Estado do imóvel
    if (prop?.cidade && prop.cidade.trim()) {
      const cid = prop.cidade.trim();
      const uf = (prop.estado || '').trim().toUpperCase();
      return uf ? `${cid} - ${uf}` : cid;
    }
    // 5. Fallback padrão
    return 'Endereço conforme memorial de incorporação e projeto aprovado';
  };

  const generateFichaCadastral = (data: any) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Header
    doc.setFillColor(79, 70, 229); // Indigo 600
    doc.rect(0, 0, 210, 25, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("FICHA CADASTRAL", pageWidth / 2, 17, { align: "center" });

    doc.setTextColor(20, 20, 20);
    doc.setFontSize(12);
    
    let y = 40;
    const lineSpacing = 7;

    // Customers Data
    const customers = (data.customers || [(data as any).customer]).filter(Boolean);
    
    customers.forEach((customer: any, index: number) => {
      if (y > 250) {
        doc.addPage();
        y = 20;
      }
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(`DADOS DO COMPRADOR ${index + 1}`, 14, y); y += 2;
      doc.setDrawColor(200, 200, 200);
      doc.line(14, y, 196, y); y += 8;
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Nome: ${customer.nome || "-"}`, 14, y); y += lineSpacing;
      doc.text(`CPF: ${customer.cpf || "-"}`, 14, y); y += lineSpacing;
      doc.text(`RG: ${customer.rgNumero || "-"} (${customer.rgOrgao || "-"}) - Exp: ${customer.rgDataExpedicao || "-"}`, 14, y); y += lineSpacing;
      doc.text(`Data de Nascimento: ${customer.dataNascimento || "-"}`, 14, y); y += lineSpacing;
      doc.text(`Estado Civil: ${customer.estadoCivil || "-"}`, 14, y); y += lineSpacing;
      doc.text(`Profissão: ${customer.profissao || "-"}`, 14, y); y += lineSpacing;
      doc.text(`Naturalidade: ${customer.naturalidade || "-"} / Nacionalidade: ${customer.nacionalidade || "-"}`, 14, y); y += lineSpacing;
      doc.text(`Email: ${customer.email || "-"}`, 14, y); y += lineSpacing;
      doc.text(`Telefone: ${customer.telefone || "-"}`, 14, y); y += lineSpacing * 2;
    });

    // Address
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("ENDEREÇO", 14, y); y += 2;
    doc.line(14, y, 196, y); y += 8;
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`CEP: ${data.address?.cep || "-"}`, 14, y); y += lineSpacing;
    doc.text(`Logradouro: ${data.address?.logradouro || "-"}, ${data.address?.numero || "-"} ${data.address?.complemento ? "- " + data.address.complemento : ""}`, 14, y); y += lineSpacing;
    doc.text(`Bairro: ${data.address?.bairro || "-"}`, 14, y); y += lineSpacing;
    doc.text(`Cidade/Estado: ${data.address?.cidade || "-"} / ${data.address?.estado || "-"}`, 14, y); y += lineSpacing * 2;

    // Property
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("DADOS DO IMÓVEL", 14, y); y += 2;
    doc.line(14, y, 196, y); y += 8;
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Empreendimento: ${data.property?.empreendimento || "-"}`, 14, y); y += lineSpacing;
    doc.text(`Unidade: ${data.property?.unidade || "-"}`, 14, y); y += lineSpacing;
    doc.text(`Torre/Bloco: ${data.property?.torre || "-"}`, 14, y); y += lineSpacing;

    const fileName = customers[0]?.nome 
      ? `ficha_cadastral_${customers[0].nome.replace(/\s+/g, '_').toLowerCase()}.pdf`
      : `ficha_cadastral_${data.property?.unidade || 'sem_unidade'}.pdf`;
      
    doc.save(fileName);
  };

  const compileUnifiedFichaBlob = async (data: any) => {
    if (!data) throw new Error("Sem dados para compilar ficha.");
    
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // --- PAGE 1: PROPOSTA COMERCIAL ---
    doc.setFontSize(16);
    doc.setTextColor(20, 20, 20);
    doc.text("PROPOSTA COMERCIAL DE COMPRA E VENDA DE IMÓVEL", pageWidth / 2, 20, { align: "center" });

    // Property Data
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("DADOS DO IMÓVEL", 14, 35);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Empreendimento: ${data.property?.empreendimento || "-"}`, 14, 42);
    doc.text(`Unidade: ${data.property?.unidade || "-"}`, 14, 47);
    doc.text(`Torre/Bloco: ${data.property?.torre || "-"}`, 14, 52);

    // Sales Team
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("EQUIPE DE VENDAS", 14, 65);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Corretor 1: ${data.salesTeam?.corretor1 || "-"}`, 14, 72);
    doc.text(`Corretor 2: ${data.salesTeam?.corretor2 || "-"}`, 14, 77);

    // Customers Data (Brief)
    const customers = (data.customers || [(data as any).customer]).filter(Boolean);
    let yPos = 90;
    customers.forEach((customer: any, index: number) => {
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(`DADOS DO COMPRADOR ${index + 1}`, 14, yPos); yPos += 7;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Nome: ${customer.nome || "-"}`, 14, yPos); yPos += 5;
      doc.text(`CPF: ${customer.cpf || "-"}`, 14, yPos); yPos += 5;
      doc.text(`Telefone: ${customer.telefone || "-"}`, 14, yPos); yPos += 5;
      doc.text(`Email: ${customer.email || "-"}`, 14, yPos); yPos += 10;
    });

    // Payments Table
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("PROPOSTA COMERCIAL", 14, yPos); yPos += 5;
    
    const tableData = data.payments.map((p: any) => [
      p.quantidade,
      p.tipo,
      p.valorUnitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      p.vencimento,
      p.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [['Qtd', 'Tipo de Parcela', 'Valor Unitário', 'Vencimento', 'Valor Total']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229] }, // Indigo 600
      styles: { fontSize: 9 }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    const totalValue = data.valorTotalProposta || data.payments.reduce((acc: number, p: any) => acc + (p.valorTotal || 0), 0);
    doc.text(`VALOR TOTAL DA PROPOSTA: ${totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, 14, finalY);

    // --- PAGE 2: FICHA CADASTRAL ---
    doc.addPage();
    
    // Header
    doc.setFillColor(79, 70, 229); // Indigo 600
    doc.rect(0, 0, 210, 25, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("FICHA CADASTRAL", pageWidth / 2, 17, { align: "center" });

    doc.setTextColor(20, 20, 20);
    doc.setFontSize(12);
    
    let y = 40;
    const lineSpacing = 7;

    // Customers Data (Detailed)
    customers.forEach((customer: any, index: number) => {
      if (y > 250) {
        doc.addPage();
        y = 20;
      }
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(`DADOS DO COMPRADOR ${index + 1}`, 14, y); y += 2;
      doc.setDrawColor(200, 200, 200);
      doc.line(14, y, 196, y); y += 8;
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Nome: ${customer.nome || "-"}`, 14, y); y += lineSpacing;
      doc.text(`CPF: ${customer.cpf || "-"}`, 14, y); y += lineSpacing;
      doc.text(`RG: ${customer.rgNumero || "-"} (${customer.rgOrgao || "-"}) - Exp: ${customer.rgDataExpedicao || "-"}`, 14, y); y += lineSpacing;
      doc.text(`Data de Nascimento: ${customer.dataNascimento || "-"}`, 14, y); y += lineSpacing;
      doc.text(`Estado Civil: ${customer.estadoCivil || "-"}`, 14, y); y += lineSpacing;
      doc.text(`Profissão: ${customer.profissao || "-"}`, 14, y); y += lineSpacing;
      doc.text(`Naturalidade: ${customer.naturalidade || "-"} / Nacionalidade: ${customer.nacionalidade || "-"}`, 14, y); y += lineSpacing;
      doc.text(`Email: ${customer.email || "-"}`, 14, y); y += lineSpacing;
      doc.text(`Telefone: ${customer.telefone || "-"}`, 14, y); y += lineSpacing * 2;
    });

    // Address
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("ENDEREÇO", 14, y); y += 2;
    doc.line(14, y, 196, y); y += 8;
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`CEP: ${data.address?.cep || "-"}`, 14, y); y += lineSpacing;
    doc.text(`Logradouro: ${data.address?.logradouro || "-"}, ${data.address?.numero || "-"} ${data.address?.complemento ? "- " + data.address.complemento : ""}`, 14, y); y += lineSpacing;
    doc.text(`Bairro: ${data.address?.bairro || "-"}`, 14, y); y += lineSpacing;
    doc.text(`Cidade/Estado: ${data.address?.cidade || "-"} / ${data.address?.estado || "-"}`, 14, y); y += lineSpacing * 2;

    // Property
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("DADOS DO IMÓVEL", 14, y); y += 2;
    doc.line(14, y, 196, y); y += 8;
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Empreendimento: ${data.property?.empreendimento || "-"}`, 14, y); y += lineSpacing;
    doc.text(`Unidade: ${data.property?.unidade || "-"}`, 14, y); y += lineSpacing;
    doc.text(`Torre/Bloco: ${data.property?.torre || "-"}`, 14, y); y += lineSpacing;

    // Convert jsPDF to ArrayBuffer
    const pdfBytes = doc.output('arraybuffer');
    
    // Load into pdf-lib
    const mergedPdf = await PDFDocument.load(pdfBytes);
    
    // Add documents
    const filesToMerge = docs.filter(d => d.file).map(d => d.file as File);
    
    for (const file of filesToMerge) {
      try {
        const fileBytes = await file.arrayBuffer();
        
        if (file.type === 'application/pdf') {
          const externalPdf = await PDFDocument.load(fileBytes);
          const copiedPages = await mergedPdf.copyPages(externalPdf, externalPdf.getPageIndices());
          copiedPages.forEach((page) => mergedPdf.addPage(page));
        } else if (file.type.startsWith('image/')) {
          let image;
          if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
            image = await mergedPdf.embedJpg(fileBytes);
          } else if (file.type === 'image/png') {
            image = await mergedPdf.embedPng(fileBytes);
          }
          
          if (image) {
            const page = mergedPdf.addPage();
            const { width, height } = image.scale(1);
            
            // Fit image to page
            const pageWidth = page.getWidth();
            const pageHeight = page.getHeight();
            const scale = Math.min(pageWidth / width, pageHeight / height);
            
            page.drawImage(image, {
              x: (pageWidth - width * scale) / 2,
              y: (pageHeight - height * scale) / 2,
              width: width * scale,
              height: height * scale,
            });
          }
        }
      } catch (fileErr) {
        console.warn(`Could not read file ${file.name}:`, fileErr);
      }
    }
    
    return await mergedPdf.save();
  };

  const generateUnifiedFicha = async (data = result) => {
    if (!data) return;
    
    setIsProcessing(true);
    try {
      const finalPdfBytes = await compileUnifiedFichaBlob(data);
      const blob = new Blob([finalPdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      const customers = (data.customers || [(data as any).customer]).filter(Boolean);
      const fileName = customers[0]?.nome 
        ? `ficha_completa_${customers[0].nome.replace(/\s+/g, '_').toLowerCase()}.pdf`
        : `ficha_completa_${data.property?.unidade || 'sem_unidade'}.pdf`;
        
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
      
    } catch (err) {
      console.error("Error generating unified PDF:", err);
      setError("Erro ao gerar PDF unificado.");
    } finally {
      setIsProcessing(false);
    }
  };

  const editExtraction = (ext: SavedExtraction) => {
    const loadedParties = ext.commissioned_parties || [];
    setResult({
      id: ext.id,
      property: ext.property,
      customers: (ext.customers || [(ext as any).customer]).filter(Boolean), // Handle migration
      address: ext.address,
      payments: ext.payments,
      validations: ext.validations,
      salesTeam: ext.sales_team,
      valorTotalProposta: ext.valorTotalProposta,
      valorEntrada: ext.valorEntrada,
      spreadsheet_id: ext.spreadsheet_id,
      proposta_status: ext.proposta_status,
      cvc_status: ext.cvc_status,
      corretagem_status: ext.corretagem_status,
      forma_pagamento_comissao: ext.forma_pagamento_comissao,
      informacoes_adicionais: ext.informacoes_adicionais,
      documents: ext.documents || [],
      commissionedParties: loadedParties,
      manual_waterfall: ext.manual_waterfall
    });
    setCommissionedParties(loadedParties);
    if ((ext as any).percentualComissao) {
      setPercentualComissao((ext as any).percentualComissao);
    }
    if (ext.manual_waterfall) {
      setWaterfallResult(obterRateioConsolidado(ext.manual_waterfall));
      setIsManualRateio(true);
    } else {
      setWaterfallResult(null);
      setIsManualRateio(false);
    }
    setIsEditingRateio(false);
    setDocs(REQUIRED_DOCS.map(doc => ({ ...doc, file: null, status: 'pending' })));
    setView('extract');
    setIsEditing(true);
    setSaveStatus('idle');
  };

  useEffect(() => {
    if (!user) {
      setEmpreendimentos([]);
      return;
    }

    const path = 'empreendimentos';
    const q = query(collection(db, path), orderBy('created_at', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as Record<string, any>)
      })) as Empreendimento[];
      setEmpreendimentos(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) {
      setInstallmentConfigs([]);
      return;
    }

    const path = 'configuracoes_parcelas';
    const q = query(collection(db, path), orderBy('created_at', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as Record<string, any>)
      })) as InstallmentTypeConfig[];
      setInstallmentConfigs(data);
    }, (error) => {
      console.error("Erro ao carregar configurações:", error);
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) {
      setCargos([]);
      return;
    }

    const path = 'cargos';
    const q = query(collection(db, path), orderBy('nome', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as Record<string, any>)
      })) as CargoCadastro[];
      setCargos(data);
    }, (error) => {
      console.error("Erro ao carregar cargos:", error);
    });

    return () => unsubscribe();
  }, [user]);

  const addRegraComissao = () => {
    setEmpreendimentoForm(prev => ({
      ...prev,
      regras_comissao: [
        ...prev.regras_comissao,
        { parcela: '', tipo_deducao: 'PERCENTUAL', valor_deducao: 0 }
      ]
    }));
  };

  const removeRegraComissao = (index: number) => {
    setEmpreendimentoForm(prev => ({
      ...prev,
      regras_comissao: prev.regras_comissao.filter((_, i) => i !== index)
    }));
  };

  const updateRegraComissao = (index: number, field: keyof RegraComissao, value: any) => {
    setEmpreendimentoForm(prev => ({
      ...prev,
      regras_comissao: prev.regras_comissao.map((regra, i) => 
        i === index ? { ...regra, [field]: value } : regra
      )
    }));
  };

  const addModeloRateio = () => {
    setEmpreendimentoForm(prev => ({
      ...prev,
      modelo_rateio: [
        ...(prev.modelo_rateio || []),
        { cargo: '', taxa_comissao: 0, nome: '' }
      ]
    }));
  };

  const removeModeloRateio = (index: number) => {
    setEmpreendimentoForm(prev => ({
      ...prev,
      modelo_rateio: (prev.modelo_rateio || []).filter((_, i) => i !== index)
    }));
  };

  const updateModeloRateio = (index: number, field: keyof ModeloRateioCargo, value: any) => {
    setEmpreendimentoForm(prev => ({
      ...prev,
      modelo_rateio: (prev.modelo_rateio || []).map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      )
    }));
  };

  const saveEmpreendimento = async () => {
    if (!user) return;
    if (!empreendimentoForm.nome) {
      setError('O nome do empreendimento é obrigatório.');
      return;
    }

    setIsLoadingEmpreendimentos(true);
    const path = 'empreendimentos';
    try {
      const data = {
        ...empreendimentoForm,
        uid: user.uid,
        updated_at: new Date().toISOString()
      };

      if (editingEmpreendimento) {
        await updateDoc(doc(db, path, editingEmpreendimento.id), data);
      } else {
        await addDoc(collection(db, path), {
          ...data,
          created_at: new Date().toISOString()
        });
      }

      setShowEmpreendimentoModal(false);
      setEditingEmpreendimento(null);
      setEmpreendimentoForm({
        nome: '',
        construtora: '',
        localizacao: '',
        endereco: '',
        tabela_base_id: '',
        status: 'ATIVO',
        regras_comissao: [],
        modelo_rateio: []
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    } finally {
      setIsLoadingEmpreendimentos(false);
    }
  };

  const deleteEmpreendimento = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este empreendimento?')) return;
    
    setIsLoadingEmpreendimentos(true);
    const path = 'empreendimentos';
    try {
      await deleteDoc(doc(db, path, id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    } finally {
      setIsLoadingEmpreendimentos(false);
    }
  };

  const openEmpreendimentoModal = (emp?: Empreendimento) => {
    if (emp) {
      setEditingEmpreendimento(emp);
      setEmpreendimentoForm({
        nome: emp.nome,
        construtora: emp.construtora || '',
        localizacao: emp.localizacao || '',
        endereco: emp.endereco || '',
        tabela_base_id: emp.tabela_base_id || '',
        status: emp.status,
        regras_comissao: emp.regras_comissao || [],
        modelo_rateio: emp.modelo_rateio || []
      });
    } else {
      setEditingEmpreendimento(null);
      setEmpreendimentoForm({
        nome: '',
        construtora: '',
        localizacao: '',
        endereco: '',
        tabela_base_id: '',
        status: 'ATIVO',
        regras_comissao: [],
        modelo_rateio: []
      });
    }
    setShowEmpreendimentoModal(true);
  };

  const saveConfig = async () => {
    if (!user || !editingConfig?.descricao) return;
    setIsSavingSettings(true);
    const path = 'configuracoes_parcelas';
    try {
      const data = {
        descricao: editingConfig.descricao,
        periodicidade: editingConfig.periodicidade || 1,
        updated_at: new Date().toISOString()
      };

      if (editingConfig.id) {
        await updateDoc(doc(db, path, editingConfig.id), data);
      } else {
        await addDoc(collection(db, path), {
          ...data,
          uid: user.uid,
          created_at: new Date().toISOString()
        });
      }
      setEditingConfig(null);
    } catch (error) {
      console.error(error);
      handleFirestoreError(error, OperationType.WRITE, path);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const deleteConfig = async (id: string) => {
    if (!confirm('Confirmar exclusão desta configuração de parcela?')) return;
    const path = 'configuracoes_parcelas';
    try {
      await deleteDoc(doc(db, path, id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const openCargoModal = (cargo?: CargoCadastro, cargoNome?: string) => {
    if (cargo) {
      setEditingCargo(cargo);
      setCargoForm({
        nome: cargo.nome || '',
        apelido: cargo.apelido || '',
        creci: cargo.creci || '',
        cpf_cnpj: cargo.cpf_cnpj || '',
        cargo: cargo.cargo || '',
        gerente: cargo.gerente || '',
        diretor: cargo.diretor || '',
        telefone: cargo.telefone || '',
        email: cargo.email || '',
        pix: cargo.pix || '',
        asaasWalletId: cargo.asaasWalletId || '',
      });
    } else {
      setEditingCargo(null);
      setCargoForm({
        nome: '',
        apelido: '',
        creci: '',
        cpf_cnpj: '',
        cargo: cargoNome || '',
        gerente: '',
        diretor: '',
        telefone: '',
        email: '',
        pix: '',
        asaasWalletId: '',
      });
    }
    setShowCargoModal(true);
  };

  const saveCargo = async () => {
    if (!user || !cargoForm.nome) return;
    setIsSavingCargo(true);
    const path = 'cargos';
    try {
      const data = {
        nome: cargoForm.nome,
        apelido: cargoForm.apelido,
        creci: cargoForm.creci,
        cpf_cnpj: cargoForm.cpf_cnpj,
        cargo: cargoForm.cargo,
        gerente: cargoForm.gerente,
        diretor: cargoForm.diretor,
        telefone: cargoForm.telefone,
        email: cargoForm.email,
        pix: cargoForm.pix,
        asaasWalletId: cargoForm.asaasWalletId,
        updated_at: new Date().toISOString()
      };

      if (editingCargo?.id) {
        await updateDoc(doc(db, path, editingCargo.id), data);
        showToast('Cargo/Participante atualizado com sucesso!', 'success');
      } else {
        await addDoc(collection(db, path), {
          ...data,
          uid: user.uid,
          created_at: new Date().toISOString()
        });
        showToast('Cargo/Participante criado com sucesso!', 'success');
      }
      setShowCargoModal(false);
      setEditingCargo(null);
    } catch (error) {
      console.error(error);
      handleFirestoreError(error, OperationType.WRITE, path);
    } finally {
      setIsSavingCargo(false);
    }
  };

  const deleteCargo = async (id: string) => {
    if (!confirm('Deseja realmente excluir este Cargo/Participante?')) return;
    const path = 'cargos';
    try {
      await deleteDoc(doc(db, path, id));
      showToast('Cargo/Participante excluído com sucesso!', 'success');
    } catch (error) {
      console.error(error);
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const getFilteredPartySuggestions = (inputValue: string) => {
    const query = (inputValue || '').toLowerCase().trim();
    
    if (query.includes('@')) {
      const cleanQuery = query.split('@').pop()?.trim() || '';
      if (!cleanQuery) return cargos;
      return cargos.filter(c => 
        (c.apelido && c.apelido.toLowerCase().includes(cleanQuery)) ||
        (c.nome && c.nome.toLowerCase().includes(cleanQuery))
      );
    }
    
    if (!query) {
      return cargos;
    }
    
    return cargos.filter(c => 
      (c.cargo && c.cargo.toLowerCase().includes(query)) ||
      (c.nome && c.nome.toLowerCase().includes(query)) ||
      (c.apelido && c.apelido.toLowerCase().includes(query))
    );
  };

  const selectPartyParticipant = (idx: number, selected: CargoCadastro) => {
    const newParties = [...commissionedParties];
    const currentVal = newParties[idx].name || '';
    
    let newVal = '';
    if (currentVal.includes(',')) {
      const parts = currentVal.split(',');
      parts.pop();
      parts.push(selected.nome);
      newVal = parts.map(p => p.trim()).filter(Boolean).join(', ');
    } else {
      newVal = selected.nome;
    }
    
    newParties[idx].name = newVal;
    
    const isCorretorRow = newParties[idx].role.toLowerCase().includes('corretor');
    if (isCorretorRow) {
      if (selected.gerente) {
        const managerIdx = newParties.findIndex(p => 
          p.role.toLowerCase() === 'gerente' ||
          p.role.toLowerCase().includes('gerente de venda') ||
          p.role.toLowerCase().includes('gerente de vendas')
        );
        if (managerIdx !== -1) {
          const currentManagers = newParties[managerIdx].name 
            ? newParties[managerIdx].name.split(',').map(n => n.trim()).filter(Boolean) 
            : [];
          if (!currentManagers.includes(selected.gerente)) {
            currentManagers.push(selected.gerente);
          }
          newParties[managerIdx].name = currentManagers.join(', ');
        }
      }
      
      if (selected.diretor) {
        const directorIdx = newParties.findIndex(p => 
          p.role.toLowerCase() === 'diretor de vendas' ||
          p.role.toLowerCase().includes('diretor de venda') ||
          p.role.toLowerCase().includes('diretor comercial') ||
          p.role.toLowerCase() === 'diretor'
        );
        if (directorIdx !== -1) {
          const currentDirectors = newParties[directorIdx].name 
            ? newParties[directorIdx].name.split(',').map(n => n.trim()).filter(Boolean) 
            : [];
          if (!currentDirectors.includes(selected.diretor)) {
            currentDirectors.push(selected.diretor);
          }
          newParties[directorIdx].name = currentDirectors.join(', ');
        }
      }
    }

    const isGerenteRow = newParties[idx].role.toLowerCase() === 'gerente' ||
                         newParties[idx].role.toLowerCase().includes('gerente de venda') ||
                         newParties[idx].role.toLowerCase().includes('gerente de vendas');
    if (isGerenteRow) {
      if (selected.diretor) {
        const directorIdx = newParties.findIndex(p => 
          p.role.toLowerCase() === 'diretor de vendas' ||
          p.role.toLowerCase().includes('diretor de venda') ||
          p.role.toLowerCase().includes('diretor comercial') ||
          p.role.toLowerCase() === 'diretor'
        );
        if (directorIdx !== -1) {
          const currentDirectors = newParties[directorIdx].name 
            ? newParties[directorIdx].name.split(',').map(n => n.trim()).filter(Boolean) 
            : [];
          if (!currentDirectors.includes(selected.diretor)) {
            currentDirectors.push(selected.diretor);
          }
          newParties[directorIdx].name = currentDirectors.join(', ');
        }
      }
    }
    
    setCommissionedParties(newParties);
    setActivePartySearchIdx(null);
    setPartySearchQuery('');
  };

  const downloadTemplateCSV = () => {
    const headers = ['Nome', 'Apelido', 'CRECI', 'CPF_CNPJ', 'Cargo', 'Gerente', 'Diretor', 'Telefone', 'Email', 'PIX'];
    const examples = [
      ['Carlos Eduardo de Souza', 'Cadu', '123456-F', '123.456.789-00', 'Corretor', 'Gerente Ricardo', 'Diretor Roberto', '(11) 99999-9999', 'carlos@empresa.com.br', 'carlos@pix.com'],
      ['Ana Paula Lima', 'Ana', '654321-F', '987.654.321-11', 'Gerente', '', 'Diretor Roberto', '(11) 88888-8888', 'ana@empresa.com.br', '11988888888']
    ];
    
    // Using semicolon because Brazilian Excel opens it perfectly by default
    const csvContent = "\uFEFF" + [
      headers.join(';'),
      ...examples.map(row => row.join(';'))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'modelo_importacao_cargos.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Planilha modelo baixada com sucesso!', 'success');
  };

  const handleBulkImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      try {
        const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
        if (lines.length < 2) {
          showToast('A planilha enviada está vazia ou sem dados de participante.', 'error');
          return;
        }

        const headerLine = lines[0];
        const semicolons = (headerLine.match(/;/g) || []).length;
        const commas = (headerLine.match(/,/g) || []).length;
        const delimiter = semicolons >= commas ? ';' : ',';

        const headers = headerLine.split(delimiter).map(h => h.trim().toLowerCase().replace(/['"“”]/g, ''));
        
        const expectedFields = [
          { key: 'nome', aliases: ['nome', 'nome completo', 'name'] },
          { key: 'apelido', aliases: ['apelido', 'nickname', 'nome de guerra'] },
          { key: 'creci', aliases: ['creci', 'creci/f', 'registro'] },
          { key: 'cpf_cnpj', aliases: ['cpf_cnpj', 'cpf/cnpj', 'cpf', 'cnpj', 'documento'] },
          { key: 'cargo', aliases: ['cargo', 'função', 'funcao', 'role'] },
          { key: 'gerente', aliases: ['gerente', 'gerente responsável', 'gerente responsavel', 'manager'] },
          { key: 'diretor', aliases: ['diretor', 'diretor responsável', 'diretor responsavel', 'director'] },
          { key: 'telefone', aliases: ['telefone', 'tel', 'phone', 'celular'] },
          { key: 'email', aliases: ['email', 'e-mail', 'mail'] },
          { key: 'pix', aliases: ['pix', 'chave pix', 'chave_pix'] },
        ];

        const fieldIndexes: Record<string, number> = {};
        expectedFields.forEach(field => {
          const idx = headers.findIndex(h => field.aliases.includes(h));
          if (idx !== -1) {
            fieldIndexes[field.key] = idx;
          }
        });

        if (fieldIndexes['nome'] === undefined) {
          showToast('Coluna "Nome" não encontrada na planilha. Use o modelo para referência.', 'error');
          return;
        }

        setIsLoadingCargos(true);
        let successCount = 0;
        let errorCount = 0;

        const path = 'cargos';
        
        for (let i = 1; i < lines.length; i++) {
          const rowText = lines[i];
          const rowValues: string[] = [];
          let currentVal = '';
          let inQuotes = false;
          for (let charIdx = 0; charIdx < rowText.length; charIdx++) {
            const char = rowText[charIdx];
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === delimiter && !inQuotes) {
              rowValues.push(currentVal.trim().replace(/^['"]|['"]$/g, ''));
              currentVal = '';
            } else {
              currentVal += char;
            }
          }
          rowValues.push(currentVal.trim().replace(/^['"]|['"]$/g, ''));

          const nomeVal = rowValues[fieldIndexes['nome']] || '';
          if (!nomeVal) {
            continue;
          }

          const cargoData: Record<string, any> = {
            nome: nomeVal,
            uid: user.uid,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };

          expectedFields.forEach(field => {
            if (field.key !== 'nome' && fieldIndexes[field.key] !== undefined) {
              cargoData[field.key] = rowValues[fieldIndexes[field.key]] || '';
            }
          });

          try {
            await addDoc(collection(db, path), cargoData);
            successCount++;
          } catch (err) {
            console.error('Error importing row:', err);
            errorCount++;
          }
        }

        if (successCount > 0) {
          showToast(`${successCount} participantes importados com sucesso!${errorCount > 0 ? ` (${errorCount} falhas)` : ''}`, 'success');
        } else if (errorCount > 0) {
          showToast(`Falha ao importar participantes (${errorCount} erros).`, 'error');
        } else {
          showToast('Nenhum participante válido encontrado para importação.', 'info');
        }

      } catch (err) {
        console.error('Error parsing CSV:', err);
        showToast('Erro ao ler ou processar o arquivo CSV.', 'error');
      } finally {
        setIsLoadingCargos(false);
        if (e.target) e.target.value = '';
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  const [isSyncingAppSheet, setIsSyncingAppSheet] = useState(false);

  const sendToAppSheet = async (extraction: any) => {
    setIsSyncingAppSheet(true);
    try {
      const customers = (extraction.customers || []).filter(Boolean);
      const row = {
        "ID": extraction.id || "Novo",
        "Data": new Date().toISOString(),
        "Empreendimento": extraction.property?.empreendimento || "",
        "Torre": extraction.property?.torre || "",
        "Unidade": extraction.property?.unidade || "",
        "Corretor 1": extraction.salesTeam?.corretor1 || extraction.sales_team?.corretor1 || "",
        "Corretor 2": extraction.salesTeam?.corretor2 || extraction.sales_team?.corretor2 || "",
        "Cliente": customers[0]?.nome || "",
        "CPF": customers[0]?.cpf || "",
        "Telefone": customers[0]?.telefone || "",
        "Email": customers[0]?.email || "",
        "Status": extraction.status || "na fila",
        "Valor Total": extraction.valorTotalProposta || 0,
        "Entradas": extraction.valorEntrada || 0
      };

      const response = await fetch('/api/appsheet/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: [row] })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Erro ao enviar para AppSheet');
      }
      
      alert('Sincronizado com AppSheet com sucesso!');
      return true;
    } catch (error: any) {
      console.error("AppSheet Sync Error:", error);
      alert(`Erro ao sincronizar com AppSheet: ${error.message}`);
      return false;
    } finally {
      setIsSyncingAppSheet(false);
    }
  };

  const sendProposalByEmail = (extraction: any) => {
    if (!extraction) return;

    // No automatic download here as requested - sent dynamically from inside the modal instead
    const property = extraction.property;
    const customers = (extraction.customers || []).filter(Boolean);
    const payments = extraction.payments || [];
    const valorTotalProposta = extraction.valorTotalProposta;

    const clientNames = customers.length > 0
      ? customers.map((c: any) => (c.nome || 'N/A').trim()).join(', ')
      : 'CLIENTE';

    const unidade = (property?.unidade || 'UNIDADE').trim();
    const torre = (property?.torre || 'TORRE').trim();
    
    // Subject Formatting Pattern: ENTRADA DE PROPOSTA - UNIDADE - TORRE - CLIENTE (dynamic based on the parsed buyers' names, towers, and unit IDs)
    const subject = `ENTRADA DE PROPOSTA - ${unidade.toUpperCase()} - ${torre.toUpperCase()} - ${clientNames.toUpperCase()}`;
    
    // Core introduction as explicitly requested:
    let body = `Segue proposta para confecção do contrato, contendo nome do cliente ou dos clientes, telefones e email.\n`;
    body += `[Favor anexar o arquivo PDF compilado "Ficha + DOCS" gerado pelo sistema]\n\n`;
    
    // Comprehensive Buyer details (names, CPFs, phones, emails, and dates of birth)
    if (customers.length > 0) {
      body += `--- DADOS COMPLETOS DOS COMPRADORES ---\n`;
      customers.forEach((c: any, idx: number) => {
        body += `Comprador ${idx + 1}:\n`;
        body += `- Nome: ${c.nome || 'Não informado'}\n`;
        body += `- CPF: ${c.cpf || 'Não informado'}\n`;
        body += `- Telefone: ${c.telefone || 'Não informado'}\n`;
        body += `- E-mail: ${c.email || 'Não informado'}\n`;
        body += `- Data de Nascimento: ${c.dataNascimento || 'Não informada'}\n`;
        if (c.rgNumero) body += `- RG: ${c.rgNumero} ${c.rgOrgao ? `(${c.rgOrgao})` : ''} ${c.rgDataExpedicao ? `Expedido em ${c.rgDataExpedicao}` : ''}\n`;
        if (c.estadoCivil) body += `- Estado Civil: ${c.estadoCivil}\n`;
        if (c.profissao) body += `- Profissão: ${c.profissao}\n`;
        if (c.nacionalidade) body += `- Nacionalidade: ${c.nacionalidade}\n`;
        if (c.naturalidade) body += `- Naturalidade: ${c.naturalidade}\n`;
        if (c.address) {
          const a = c.address;
          body += `- Endereço: ${a.logradouro || ''}, ${a.numero || ''} ${a.complemento ? `(${a.complemento})` : ''} - ${a.bairro || ''}, ${a.cidade || ''}/${a.estado || ''} - CEP: ${a.cep || ''}\n`;
        }
        body += `\n`;
      });
    }

    // Selected Property characteristics
    if (property) {
      body += `--- CARACTERÍSTICAS DO IMÓVEL SELECIONADO ---\n`;
      if (property.empreendimento) body += `- Empreendimento: ${property.empreendimento}\n`;
      body += `- Torre: ${torre}\n`;
      body += `- Unidade: ${unidade}\n\n`;
    }

    const totalCalculated = payments.reduce((acc: number, p: any) => acc + (p.valorTotal || 0), 0);
    const totalProposal = valorTotalProposta || totalCalculated;

    // Pricing metrics
    body += `--- MÉTRICAS FINANCEIRAS ---\n`;
    body += `- Valor Total da Proposta: ${totalProposal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\n`;
    if (extraction.valorEntrada) {
      body += `- Valor Total de Entrada: ${extraction.valorEntrada.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\n`;
    }
    if (extraction.forma_pagamento_comissao) {
      body += `- Forma de Pagamento da Comissão: ${extraction.forma_pagamento_comissao}\n`;
    }
    body += `\n`;
    
    // Entire payment workflows
    if (payments.length > 0) {
      body += `--- WORKFLOWS E FLUXO DE PAGAMENTO ---\n`;
      payments.forEach((p: any, idx: number) => {
        body += `${idx + 1}. Tipo: ${p.tipo || 'Parcela'}\n`;
        body += `   Quantidade: ${p.quantidade}x\n`;
        body += `   Valor de cada parcela: ${(p.valorUnitario || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\n`;
        body += `   Subtotal desse fluxo: ${(p.valorTotal || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\n`;
        if (p.vencimento) body += `   Vencimento Inicial: ${p.vencimento}\n`;
        body += `\n`;
      });
    }
    
    if (extraction.drive_link) {
      body += `\nLink da Pasta dos Documentos no Google Drive:\n${extraction.drive_link}\n`;
    }

    if (extraction.informacoes_adicionais) {
      body += `\nInformações Adicionais / Observações:\n${extraction.informacoes_adicionais}\n`;
    }

    setEmailModalData({
      to: 'secvendas.rej@gmail.com',
      subject: subject,
      body: body,
      extraction: extraction
    });

    const mailtoUrl = `mailto:secvendas.rej@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      const a = document.createElement('a');
      a.href = mailtoUrl;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      console.warn("Could not auto-trigger mailto client launch:", e);
    }
  };

  const autoSyncToSheets = async (extractions: SavedExtraction[]) => {
    if (!user || extractions.length === 0) return;
    
    try {
      const { isAuthenticated } = await safeFetchJson('/api/auth/google/status', { credentials: 'include' }).catch(() => ({ isAuthenticated: false }));
      if (!isAuthenticated) return;

      const exportData = extractions.map(ext => {
        const customers = (ext.customers || []).filter(Boolean);
        const payments = ext.payments || [];
        const totalValue = ext.valorTotalProposta || payments.reduce((acc, p) => acc + (p.valorTotal || 0), 0);
        
        return {
          'ID': ext.id,
          'Data': ext.created_at ? new Date(ext.created_at).toLocaleDateString() : '-',
          'Empreendimento': ext.property?.empreendimento || '-',
          'Torre': ext.property?.torre || '-',
          'Unidade': ext.property?.unidade || '-',
          'Corretor 1': ext.sales_team?.corretor1 || '-',
          'Corretor 2': ext.sales_team?.corretor2 || '-',
          'Comprador': customers[0]?.nome || '-',
          'CPF': customers[0]?.cpf || '-',
          'Telefone': customers[0]?.telefone || '-',
          'Email': customers[0]?.email || '-',
          'Valor Total Proposta': totalValue,
          'PROPOSTA': ext.proposta_status || 'AGUARDANDO APROVAÇÃO',
          'CVC': ext.cvc_status || 'PENDENTE',
          'CORRETAGEM': ext.corretagem_status || 'PENDENTE',
          'FORMA DE PAGAMENTO': ext.forma_pagamento_comissao || 'PAGADORIA',
          'Status': ext.status || '-',
          'Informações Adicionais': ext.informacoes_adicionais || '-'
        };
      });

      let existingId = localStorage.getItem('dashboard_spreadsheet_id');
      const settingsRef = doc(db, 'user_settings', user.uid);
      const settingsSnap = await getDoc(settingsRef);
      if (settingsSnap.exists()) {
        existingId = settingsSnap.data().dashboard_spreadsheet_id;
      }

      const { spreadsheetId } = await safeFetchJson('/api/export/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          data: exportData,
          title: `Base AppSheet - ${user.email}`,
          spreadsheetId: existingId
        })
      });

      if (spreadsheetId && spreadsheetId !== existingId) {
        await setDoc(settingsRef, { dashboard_spreadsheet_id: spreadsheetId }, { merge: true });
        localStorage.setItem('dashboard_spreadsheet_id', spreadsheetId);
      }
      setNeedsGoogleAuth(false);
    } catch (error: any) {
      console.error('Erro na sincronização automática:', error);
      if (error.status === 401) {
        setNeedsGoogleAuth(true);
      }
    }
  };

  const saveToFirestore = async () => {
    if (!result || !user) {
      setError('Você precisa estar logado para salvar.');
      return;
    }
    
    setIsSaving(true);
    setSaveStatus('idle');
    const path = 'entrada';

    const sanitizeFirestoreData = (val: any): any => {
      if (val === undefined) return null;
      if (val === null) return null;
      if (Array.isArray(val)) {
        return val.map(v => sanitizeFirestoreData(v));
      }
      if (typeof val === 'object') {
        const cleaned: any = {};
        Object.keys(val).forEach(key => {
          cleaned[key] = sanitizeFirestoreData(val[key]);
        });
        return cleaned;
      }
      return val;
    };
    
    try {
      const rawData = {
        property: result.property,
        sales_team: result.salesTeam,
        customers: result.customers,
        address: result.address,
        payments: result.payments,
        validations: result.validations,
        valorTotalProposta: result.valorTotalProposta || null,
        valorEntrada: result.valorEntrada || null,
        spreadsheet_id: result.spreadsheet_id || null,
        proposta_status: result.proposta_status || 'AGUARDANDO APROVAÇÃO',
        cvc_status: result.cvc_status || 'PENDENTE',
        corretagem_status: result.corretagem_status || 'PENDENTE',
        forma_pagamento_comissao: result.forma_pagamento_comissao || 'PAGADORIA',
        informacoes_adicionais: result.informacoes_adicionais || '',
        documents: result.documents || [],
        commissioned_parties: commissionedParties,
        percentualComissao: percentualComissao,
        manual_waterfall: waterfallResult || null,
        uid: user.uid,
        updated_at: new Date().toISOString()
      };

      const data = sanitizeFirestoreData(rawData);

      if (result.id) {
        await updateDoc(doc(db, path, result.id), data);
        setResult(prev => prev ? { ...prev, manual_waterfall: waterfallResult || null } : null);
      } else {
        const docRef = await addDoc(collection(db, path), {
          ...data,
          status: 'na fila',
          created_at: new Date().toISOString()
        });
        // Update local state with new ID
        setResult(prev => prev ? { ...prev, id: docRef.id, manual_waterfall: waterfallResult || null } : null);
      }

      setSaveStatus('success');
      showToast(result.id ? 'Extração atualizada com sucesso!' : 'Extração salva com sucesso!', 'success');
      setTimeout(() => setSaveStatus('idle'), 3000);
      
      // Refresh dashboard data if we're in that view
      const updatedExtractions = await fetchExtractions();
      if (updatedExtractions) {
        autoSyncToSheets(updatedExtractions);
      }
    } catch (err: any) {
      handleFirestoreError(err, result.id ? OperationType.UPDATE : OperationType.CREATE, path);
    } finally {
      setIsSaving(false);
    }
  };

  const downloadCSV = () => {
    if (!result) return;

    const headers = [
      "Empreendimento", "Unidade", "Torre", "Corretor1", "Corretor2",
      "Cliente_Nome", "Cliente_CPF", "Cliente_Telefone", "Cliente_Email", "Cliente_Nascimento",
      "Cliente_RG", "Cliente_RG_Orgao", "Cliente_RG_Expedicao", "Cliente_EstadoCivil", "Cliente_Profissao",
      "Cliente_Naturalidade", "Cliente_Nacionalidade",
      "End_CEP", "End_Logradouro", "End_Numero", "End_Complemento", "End_Bairro", "End_Cidade", "End_Estado",
      "Qtd_Parcelas", "Tipo_Parcela", "Valor_Unitario", "Vencimento", "Valor_Total"
    ].join(';');

    const customers = (result.customers || [(result as any).customer]).filter(Boolean);
    const firstCustomer = customers[0] || {};
    const allCustomerNames = customers.map(c => c?.nome || '-').join(', ');

    const rows = result.payments.map(p => [
      result.property.empreendimento,
      result.property.unidade,
      result.property.torre || '',
      result.salesTeam?.corretor1 || '',
      result.salesTeam?.corretor2 || '',
      allCustomerNames,
      firstCustomer.cpf || '',
      firstCustomer.telefone || '',
      firstCustomer.email || '',
      firstCustomer.dataNascimento || '',
      firstCustomer.rgNumero || '',
      firstCustomer.rgOrgao || '',
      firstCustomer.rgDataExpedicao || '',
      firstCustomer.estadoCivil || '',
      firstCustomer.profissao || '',
      firstCustomer.naturalidade || '',
      firstCustomer.nacionalidade || '',
      result.address.cep,
      result.address.logradouro,
      result.address.numero,
      result.address.complemento || '',
      result.address.bairro,
      result.address.cidade,
      result.address.estado,
      p.quantidade,
      p.tipo,
      p.valorUnitario.toFixed(2).replace('.', ','),
      p.vencimento,
      p.valorTotal.toFixed(2).replace('.', ',')
    ].join(';'));

    const csvContent = [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `relatorio_cadastro_${result.property.unidade}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const printDetailedFlow = (simResult: CommissionResult | null) => {
    if (!simResult || !result) return;

    const formatCurrency = (val: number) => {
      return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    const flowRows = simResult.fluxo.map(p => `
      <tr>
        <td class="col-venc">${p.vencimento}</td>
        <td class="col-desc">${p.tipo}</td>
        <td class="col-unit">${formatCurrency(p.valorTotal)}</td>
        <td class="col-unit" style="color: #4f46e5;">${formatCurrency(p.valorLiquido)}</td>
        <td class="col-total" style="color: #d97706;">${formatCurrency(p.valorTotal - p.valorLiquido)}</td>
      </tr>
    `).join('');

    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>Fluxo Detalhado de Recebimento Líquido</title>
    <style>
        @page { size: A4; margin: 1cm; }
        body { font-family: 'Segoe UI', sans-serif; font-size: 10px; margin: 0; padding: 20px; color: #334155; }
        .header { display: flex; justify-content: space-between; align-items: start; margin-bottom: 20px; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px; }
        .title { font-size: 18px; font-weight: bold; color: #1e293b; }
        .info-grid { display: grid; grid-template-cols: 1fr 1fr; gap: 10px; margin-bottom: 20px; background: #f8fafc; padding: 15px; border-radius: 8px; }
        .info-item { display: flex; flex-direction: column; }
        .info-label { font-size: 9px; font-weight: bold; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
        .info-value { font-size: 12px; font-weight: bold; color: #0f172a; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th { background: #f1f5f9; padding: 10px 8px; text-align: left; font-size: 9px; font-weight: bold; color: #475569; border-bottom: 2px solid #cbd5e1; text-transform: uppercase; }
        td { padding: 8px; border-bottom: 1px solid #e2e8f0; }
        .col-venc { width: 15%; font-family: monospace; }
        .col-desc { width: 35%; font-weight: 500; }
        .col-unit { width: 15%; text-align: right; }
        .col-total { width: 15%; text-align: right; font-weight: bold; }
        .summary-box { display: flex; gap: 20px; margin-top: 25px; border-top: 2px solid #e2e8f0; padding-top: 15px; justify-content: flex-end; }
        .summary-item { text-align: right; }
        .summary-label { font-size: 10px; font-weight: bold; color: #64748b; }
        .summary-value { font-size: 16px; font-weight: bold; color: #1e293b; }
        .btn-print { background: #4f46e5; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; cursor: pointer; margin-bottom: 20px; }
        @media print { .btn-print { display: none; } }
    </style>
</head>
<body>
    <button class="btn-print" onclick="window.print()">IMPRIMIR RELATÓRIO</button>
    <div class="header">
        <div>
            <div class="title">Fluxo Detalhado de Recebimento Líquido</div>
            <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Engenharia de Fluxo - Simulação de Comissão</div>
        </div>
        <div style="text-align: right; font-size: 10px; color: #94a3b8;">
            Gerado em: ${new Date().toLocaleString('pt-BR')}
        </div>
    </div>

    <div class="info-grid">
        <div class="info-item">
            <span class="info-label">Empreendimento</span>
            <span class="info-value">${result.property.empreendimento || "-"}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Unidade / Torre</span>
            <span class="info-value text-indigo-600">${result.property.unidade || "-"} / ${result.property.torre || "-"}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Cliente(s)</span>
            <span class="info-value">${result.customers.map(c => c.nome).join(', ') || "-"}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Percentual de Comissão</span>
            <span class="info-value">${percentualComissao}%</span>
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th class="col-venc">VENCIMENTO</th>
                <th class="col-desc">TIPO DE PARCELA</th>
                <th style="text-align: right;">BRUTO</th>
                <th style="text-align: right; color: #4f46e5;">LÍQUIDO (CAIXA)</th>
                <th style="text-align: right; color: #d97706;">COMISSÃO</th>
            </tr>
        </thead>
        <tbody>
            ${flowRows}
        </tbody>
    </table>

    <div class="summary-box">
        <div class="summary-item">
            <div class="summary-label">VALOR TOTAL BRUTO</div>
            <div class="summary-value">${formatCurrency(result.payments.reduce((acc, p) => acc + p.valorTotal, 0))}</div>
        </div>
        <div class="summary-item">
            <div class="summary-label">COMISSÃO TOTAL (${percentualComissao}%)</div>
            <div class="summary-value" style="color: #d97706;">${formatCurrency(simResult.comissaoTotal)}</div>
        </div>
        <div class="summary-item">
            <div class="summary-label">VALOR LÍQUIDO FINAL</div>
            <div class="summary-value" style="color: #4f46e5;">${formatCurrency(simResult.fluxo.reduce((acc, f) => acc + f.valorLiquido, 0))}</div>
        </div>
    </div>

    <div style="margin-top: 40px; border-top: 1px dotted #cbd5e1; padding-top: 10px; font-size: 8px; color: #94a3b8; text-align: center;">
        * Este documento é uma simulação de fluxo financeiro baseada nas regras de comissão configuradas para o empreendimento.
    </div>
</body>
</html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
    }
  };

  const printProposalRJ = (data: ExtractionResult | SavedExtraction) => {
    if (!data) return;

    const customers = (data.customers || [(data as any).customer]).filter(Boolean);
    const firstCustomer = customers[0] || {};
    const secondCustomer = customers[1] || {};
    const address = (data.address || {}) as AddressData;
    const property = (data.property || {}) as PropertyData;
    const salesTeam = ((data as any).salesTeam || (data as any).sales_team || {}) as SalesTeam;

    const formatCurrency = (val: number) => {
      return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    const paymentRows = data.payments.map(p => `
      <tr>
        <td class="col-qtd">${p.quantidade}</td>
        <td class="col-desc">${p.tipo}</td>
        <td class="col-unit">${formatCurrency(p.valorUnitario)}</td>
        <td class="col-venc">${p.vencimento}</td>
        <td class="col-total">${formatCurrency(p.valorTotal)}</td>
      </tr>
    `).join('');

    // Fill empty rows to reach 12
    const emptyRowsCount = Math.max(0, 12 - data.payments.length);
    const emptyRows = Array(emptyRowsCount).fill(`
      <tr>
        <td class="col-qtd"></td>
        <td class="col-desc"></td>
        <td class="col-unit"></td>
        <td class="col-venc"></td>
        <td class="col-total">R$ 0,00</td>
      </tr>
    `).join('');

    const totalValue = data.payments.reduce((acc, p) => acc + p.valorTotal, 0);

    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>Ficha R&J - Engenharia de Fluxo v4</title>
    <style>
        @page { size: A4; margin: 0.5cm; }
        * { box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            margin: 0; padding: 10px; color: #000; 
            line-height: 1; font-size: 8.5px; 
            background-color: #f0f2f5; 
        }
        .toolbar { 
            position: fixed; top: 0; left: 0; right: 0; 
            background: #002d57; padding: 12px; 
            display: flex; justify-content: center; gap: 15px; 
            z-index: 1000; box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        }
        .btn { 
            padding: 8px 22px; border: none; border-radius: 5px; 
            cursor: pointer; font-weight: bold; text-transform: uppercase; 
            font-size: 10px; color: white; transition: all 0.2s ease;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        .btn-print { background: #27ae60; }
        .btn-print:hover { background: #2ecc71; transform: translateY(-1px); }
        .content-wrapper { 
            margin: 60px auto 10px; 
            background: white; 
            padding: 25px; 
            max-width: 820px; 
            min-height: 29.7cm;
            box-shadow: 0 0 20px rgba(0,0,0,0.1);
        }
        .header { 
            display: flex; align-items: center; justify-content: space-between;
            margin-bottom: 10px; border-bottom: 2.5px solid #002d57; padding-bottom: 8px; 
        }
        .logo-img { max-height: 45px; width: auto; }
        .header-text { text-align: right; }
        .doc-title { font-size: 13px; font-weight: 900; color: #002d57; text-transform: uppercase; }
        .section-title { 
            background-color: #002d57; color: white; 
            padding: 5px 12px; font-weight: bold; 
            margin-top: 10px; font-size: 9px; 
            border-radius: 3px 3px 0 0; text-transform: uppercase; 
            letter-spacing: 0.5px;
        }
        table { 
            width: 100%; border-collapse: collapse; 
            margin-bottom: 2px; table-layout: fixed; 
            border: 1.5px solid #000; 
        }
        th, td { 
            border: 1px solid #333; padding: 0 8px; 
            height: 25px; vertical-align: middle; 
            overflow: hidden; text-overflow: ellipsis;
        }
        th { 
            background-color: #f1f4f7; color: #002d57; 
            font-size: 8px; font-weight: bold; 
            text-align: center; border-bottom: 2px solid #000;
        }
        .label { font-weight: 700; color: #002d57; font-size: 8px; text-transform: uppercase; display: inline-block; width: 85px; }
        .data-input { display: inline-block; width: calc(100% - 90px); vertical-align: middle; }
        .col-qtd { width: 7%; text-align: center; }
        .col-desc { width: 33%; }
        .col-unit { width: 20%; text-align: right; font-weight: 600; }
        .col-venc { width: 20%; text-align: center; }
        .col-total { 
            width: 20%; text-align: right; font-weight: 700; 
            background-color: #f8f9fa; border-left: 2px solid #000 !important;
            color: #002d57;
        }
        .total-row { 
            background-color: #002d57 !important; color: white !important; 
            font-weight: bold; font-size: 10px; height: 26px; 
        }
        .obs-box { 
            border: 1.5px solid #000; border-top: none;
            padding: 10px; min-height: 60px; font-size: 8.5px;
        }
        .footer-sig { 
            margin-top: 30px; display: flex; justify-content: space-around; 
        }
        .sig-line { 
            border-top: 1.5px solid #000; width: 42%; 
            text-align: center; padding-top: 5px; 
            font-size: 8.5px; font-weight: bold; color: #002d57;
        }
        @media print {
            .toolbar { display: none !important; }
            body { background: white; padding: 0; }
            .content-wrapper { margin: 0; padding: 0; box-shadow: none; border: none; }
            table { border: 1.2pt solid #000 !important; }
            th, td { border: 0.5pt solid #000 !important; }
            .section-title, .total-row { background-color: #002d57 !important; color: white !important; -webkit-print-color-adjust: exact; }
            .col-total { background-color: #f2f2f2 !important; -webkit-print-color-adjust: exact; }
        }
    </style>
</head>
<body>
    <div class="toolbar">
        <button class="btn btn-print" onclick="window.print()">🖨️ Finalizar e Imprimir</button>
    </div>
    <div class="content-wrapper">
        <div class="header">
            <div class="header-text" style="width: 100%; text-align: center;">
                <div class="doc-title">Ficha Cadastral e Fluxo de Venda</div>
            </div>
        </div>

        <div class="section-title">1. DADOS DO IMÓVEL E VENDAS</div>
        <table>
            <tr>
                <td colspan="2"><span class="label">Empreendimento:</span> <span class="data-input">${property.empreendimento || ""}</span></td>
                <td><span class="label">Unidade:</span> <span class="data-input">${property.unidade || ""}</span></td>
                <td><span class="label">Torre:</span> <span class="data-input">${property.torre || ""}</span></td>
            </tr>
            <tr>
                <td colspan="2"><span class="label">Corretor(a):</span> <span class="data-input">${salesTeam.corretor1 || ""}</span></td>
                <td colspan="2"><span class="label">Gerente:</span> <span class="data-input">${salesTeam.gerente || ""}</span></td>
            </tr>
            <tr>
                <td colspan="2"><span class="label">Corretor(a):</span> <span class="data-input">${salesTeam.corretor2 || ""}</span></td>
                <td colspan="2"><span class="label">Gerente:</span> <span class="data-input"></span></td>
            </tr>
        </table>

        <div class="section-title">2. Dados dos Proponentes</div>
        <table>
            <thead>
                <tr>
                    <th width="50%" style="text-align:left">TITULAR 01</th>
                    <th width="50%" style="text-align:left">TITULAR 02 / CÔNJUGE</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td><span class="label">Nome Completo:</span> <span class="data-input">${firstCustomer.nome || ""}</span></td>
                    <td><span class="label">Nome Completo:</span> <span class="data-input">${secondCustomer.nome || ""}</span></td>
                </tr>
                <tr>
                    <td><span class="label">CPF:</span> <span class="data-input">${firstCustomer.cpf || ""}</span></td>
                    <td><span class="label">CPF:</span> <span class="data-input">${secondCustomer.cpf || ""}</span></td>
                </tr>
                <tr>
                    <td><span class="label">Telefone:</span> <span class="data-input">${firstCustomer.telefone || ""}</span></td>
                    <td><span class="label">Telefone:</span> <span class="data-input">${secondCustomer.telefone || ""}</span></td>
                </tr>
                <tr>
                    <td><span class="label">E-mail:</span> <span class="data-input">${firstCustomer.email || ""}</span></td>
                    <td><span class="label">E-mail:</span> <span class="data-input">${secondCustomer.email || ""}</span></td>
                </tr>
                <tr>
                    <td><span class="label">RG/Órgão:</span> <span class="data-input">${firstCustomer.rgNumero || ""} ${firstCustomer.rgOrgao || ""}</span></td>
                    <td><span class="label">RG/Órgão:</span> <span class="data-input">${secondCustomer.rgNumero || ""} ${secondCustomer.rgOrgao || ""}</span></td>
                </tr>
                <tr>
                    <td><span class="label">Data de Nascimento:</span> <span class="data-input">${firstCustomer.dataNascimento || ""}</span></td>
                    <td><span class="label">Data de Nascimento:</span> <span class="data-input">${secondCustomer.dataNascimento || ""}</span></td>
                </tr>
                <tr>
                    <td><span class="label">Estado Civil:</span> <span class="data-input">${firstCustomer.estadoCivil || ""}</span></td>
                    <td><span class="label">Estado Civil:</span> <span class="data-input">${secondCustomer.estadoCivil || ""}</span></td>
                </tr>
                <tr>
                    <td><span class="label">Profissão:</span> <span class="data-input">${firstCustomer.profissao || ""}</span></td>
                    <td><span class="label">Profissão:</span> <span class="data-input">${secondCustomer.profissao || ""}</span></td>
                </tr>
                <tr>
                    <td><span class="label">Endereço:</span> <span class="data-input">${address.logradouro || ""}</span></td>
                    <td><span class="label">Endereço:</span> <span class="data-input"></span></td>
                </tr>
                <tr>
                    <td><span class="label">n.º/ Complemento:</span> <span class="data-input">${address.numero || ""} ${address.complemento || ""}</span></td>
                    <td><span class="label">n.º/ Complemento:</span> <span class="data-input"></span></td>
                </tr>
                <tr>
                    <td><span class="label">Bairro:</span> <span class="data-input">${address.bairro || ""}</span></td>
                    <td><span class="label">Bairro:</span> <span class="data-input"></span></td>
                </tr>
                <tr>
                    <td><span class="label">Cidade/Estado:</span> <span class="data-input">${address.cidade || ""} / ${address.estado || ""}</span></td>
                    <td><span class="label">Cidade/Estado:</span> <span class="data-input"></span></td>
                </tr>
                <tr>
                    <td><span class="label">CEP:</span> <span class="data-input">${address.cep || ""}</span></td>
                    <td><span class="label">CEP:</span> <span class="data-input"></span></td>
                </tr>
            </tbody>
        </table>

        <div class="section-title">3. Fluxo de Pagamento Detalhado</div>
        <table>
            <thead>
                <tr>
                    <th class="col-qtd">QTD</th>
                    <th class="col-desc" style="text-align: left;">DESCRIÇÃO DA PARCELA</th>
                    <th class="col-unit">VALOR UNITÁRIO</th>
                    <th class="col-venc">VENCIMENTO</th>
                    <th class="col-total">SUBTOTAL</th>
                </tr>
            </thead>
            <tbody>
                ${paymentRows}
                ${emptyRows}
            </tbody>
            <tfoot>
                <tr class="total-row">
                    <td colspan="4" style="text-align: right; padding-right: 15px; border: none;">VALOR TOTAL DA PROPOSTA:</td>
                    <td style="text-align: right; padding-right: 8px;">${formatCurrency(totalValue)}</td>
                </tr>
            </tfoot>
        </table>

        <div class="section-title">4. Observações e Condições Especiais</div>
        <div class="obs-box"></div>

        <div class="footer-sig">
            <div class="sig-line">Assinatura do Proponente 01</div>
            <div class="sig-line">Assinatura do Proponente 02</div>
        </div>
    </div>
</body>
</html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
    }
  };

  const generateContractPDFContent = (data = result, sim = simulationResult) => {
    if (!data) return null;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - 2 * margin;
    let y = 20;

    const checkPageBreak = (neededHeight: number) => {
      if (y + neededHeight > pageHeight - 20) {
        doc.addPage();
        y = 20;
        return true;
      }
      return false;
    };

    const formaPagamento = ((data as any)?.forma_pagamento_comissao || (result as any)?.forma_pagamento_comissao || 'PAGADORIA').toString().toUpperCase().trim();
    const isNFRepasse = formaPagamento.includes('NF') || formaPagamento.includes('REPASSE');

    // Elegant Header Style
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59); // Slate-800
    if (isNFRepasse) {
      doc.text("CONTRATO DE CORRETAGEM IMOBILIÁRIA", pageWidth / 2, y, { align: "center" });
      y += 10;
    } else {
      doc.text("CONTRATO DE PRESTAÇÃO DE SERVIÇOS", pageWidth / 2, y, { align: "center" });
      y += 6;
      doc.text("DE CORRETAGEM IMOBILIÁRIA", pageWidth / 2, y, { align: "center" });
      y += 12;
    }

    // Section I - Parties
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("I - PARTES", margin, y);
    y += 6;

    // Contratante(s)
    const rawCustomers = (data.customers && data.customers.length > 0) 
      ? data.customers 
      : [(data as any).customer].filter(Boolean);
    const customers = rawCustomers.length > 0 ? rawCustomers : [{}];
    const address = (data.address || {}) as AddressData;
    const property = (data.property || {}) as PropertyData;
    const salesTeam = ((data as any).salesTeam || (data as any).sales_team || {}) as SalesTeam;

    doc.setFont("helvetica", "normal");
    customers.forEach((cust, idx) => {
      const cNome = cust.nome || "_________________________________";
      const cCpf = cust.cpf || "___.___.___-__";
      const cRg = cust.rgNumero ? (cust.rgOrgao ? `${cust.rgNumero}/${cust.rgOrgao}` : cust.rgNumero) : "________";
      const cEmail = cust.email || "________________";
      const cTel = cust.telefone || "(__) _____-____";
      const prefix = customers.length > 1 ? `CONTRATANTE ${idx + 1}:` : `CONTRATANTE:`;
      const contratanteText = `${prefix} ${cNome}, inscrito(a) no CPF/MF sob nº ${cCpf}, RG nº ${cRg}, residente e domiciliado(a) no endereço registrado na ficha cadastral anexa, telefone ${cTel}, e-mail ${cEmail}.`;
      const splitContratante = doc.splitTextToSize(contratanteText, contentWidth);
      doc.text(splitContratante, margin, y);
      y += splitContratante.length * 5 + 3;
    });
    y += 2;

    // Contratada
    const contratadaText = `CONTRATADA: RODOLFO JERRY IMOVEIS SOCIEDADE UNIPESSOAL LTDA, pessoa jurídica de direito privado, inscrita no CNPJ/MF sob o nº 29.881.101/0001-09, detentora do CRECI nº 039321-J, com sede na Rua Arnóbio, 45, Jardim São Jorge, São Paulo/SP, CEP: 05568-040, e-mail: contato@rodolfojerryimoveis.com.br.`;
    const splitContratada = doc.splitTextToSize(contratadaText, contentWidth);
    doc.text(splitContratada, margin, y);
    y += splitContratada.length * 5 + 6;

    // Section II - Imóvel
    checkPageBreak(30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("II - IMÓVEL", margin, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    const identificacaoParts = [
      property.empreendimento ? `Empreendimento: ${property.empreendimento}` : '',
      property.unidade ? `Unidade: ${property.unidade}` : '',
      property.torre ? `Torre/Bloco: ${property.torre}` : ''
    ].filter(Boolean);
    const identificacaoObjeto = identificacaoParts.length > 0 
      ? identificacaoParts.join(' | ') 
      : "Identificação do imóvel conforme proposta e memorial descritivo.";
    
    const imovelText = `OBJETO DA INTERMEDIAÇÃO: ${identificacaoObjeto}`;
    const splitImovel = doc.splitTextToSize(imovelText, contentWidth);
    doc.text(splitImovel, margin, y);
    y += splitImovel.length * 4.5 + 2;

    const enderecoEmp = getEnderecoEmpreendimento(property, empreendimentos);
    const enderecoText = `ENDEREÇO DO EMPREENDIMENTO: ${enderecoEmp}`;
    const splitEndereco = doc.splitTextToSize(enderecoText, contentWidth);
    doc.text(splitEndereco, margin, y);
    y += splitEndereco.length * 4.5 + 6;

    // Section III - Equipe de Vendas
    checkPageBreak(35);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("III - EQUIPE DE VENDAS", margin, y);
    y += 6;

    // Extract active corretores / participants for PDF (Item III - Equipe de Vendas)
    const activeParties = (data as any).manual_waterfall?.participantes || (data as any).commissionedParties || (data as any).commissioned_parties || commissionedParties || [];
    const validParties = activeParties.filter((p: any) => {
      if (p.hideAndSum) return false;
      const stateMatch = (commissionedParties || []).find((cp: any) => cp.role?.toLowerCase().trim() === p.role?.toLowerCase().trim());
      if (stateMatch && (stateMatch as any).hideAndSum) return false;
      return p.name && p.name.trim() !== '' && !p.name.includes('___');
    });

    const corretoresPDF: Array<{ cargo: string; nome_completo: string; cpf_cnpj: string; apelido: string; creci: string }> = [];
    validParties.forEach((p: any) => {
      const names = p.name.split(',');
      names.forEach((n: string) => {
        const nameTrimmed = n.trim();
        if (!nameTrimmed) return;

        const existing = corretoresPDF.find(c => c.nome_completo.toLowerCase().trim() === nameTrimmed.toLowerCase());
        if (existing) {
          const currentRoles = existing.cargo.split(',').map((r: string) => r.trim().toLowerCase());
          if (p.role && !currentRoles.includes(p.role.trim().toLowerCase())) {
            existing.cargo = `${existing.cargo}, ${p.role.trim()}`;
          }
          return;
        }

        const match = cargos.find(c => 
          (c.nome && c.nome.toLowerCase().trim() === nameTrimmed.toLowerCase()) ||
          (c.apelido && c.apelido.toLowerCase().trim() === nameTrimmed.toLowerCase())
        ) || cargos.find(c => 
          c.nome && c.nome.toLowerCase().trim().startsWith(nameTrimmed.toLowerCase())
        );

        if (match) {
          corretoresPDF.push({
            apelido: match.apelido || match.nome.split(' ')[0] || nameTrimmed.split(' ')[0],
            nome_completo: match.nome,
            cpf_cnpj: match.cpf_cnpj || "___.___.___-__",
            creci: match.creci || "_____-F",
            cargo: p.role || match.cargo || "Participante de Vendas"
          });
        } else {
          corretoresPDF.push({
            apelido: nameTrimmed.split(' ')[0],
            nome_completo: nameTrimmed,
            cpf_cnpj: p.cpf_cnpj || "___.___.___-__",
            creci: p.creci || "_____-F",
            cargo: p.role || "Participante de Vendas"
          });
        }
      });
    });

    // Fallback caso não haja participantes configurados na tabela de rateio
    const hasConfiguredBroker = activeParties.some((p: any) => p.name && p.name.trim() !== '' && !p.name.includes('___'));
    if (corretoresPDF.length === 0 && !hasConfiguredBroker && salesTeam) {
      const isCorretorHidden = activeParties.some((p: any) => p.role?.toLowerCase().trim() === 'corretor' && p.hideAndSum);
      if (!isCorretorHidden && salesTeam.corretor1 && !salesTeam.corretor1.includes('___')) {
        const match = cargos.find(c => c.nome?.toLowerCase().trim() === salesTeam.corretor1.toLowerCase().trim());
        corretoresPDF.push({
          apelido: match?.apelido || salesTeam.corretor1.split(' ')[0],
          nome_completo: match?.nome || salesTeam.corretor1,
          cpf_cnpj: match?.cpf_cnpj || "___.___.___-__",
          creci: match?.creci || "_____-F",
          cargo: "Corretor Associado"
        });
      }
      const isGerenteHidden = activeParties.some((p: any) => (p.role?.toLowerCase().includes('gerente') || p.role?.toLowerCase().includes('coordenador')) && p.hideAndSum);
      if (!isGerenteHidden && salesTeam.corretor2 && !salesTeam.corretor2.includes('___')) {
        const match = cargos.find(c => c.nome?.toLowerCase().trim() === salesTeam.corretor2.toLowerCase().trim());
        corretoresPDF.push({
          apelido: match?.apelido || salesTeam.corretor2.split(' ')[0],
          nome_completo: match?.nome || salesTeam.corretor2,
          cpf_cnpj: match?.cpf_cnpj || "___.___.___-__",
          creci: match?.creci || "_____-F",
          cargo: "Gerente/Coordenador de Vendas"
        });
      }
    }

    if (corretoresPDF.length === 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text("Participação concentrada integralmente na Imobiliária Contratada.", margin, y);
      doc.setTextColor(30, 41, 59);
      y += 8;
    } else {
      const headersEquipe = ["Apelido", "Nome Completo ou Razão Social", "CPF / CNPJ", "CRECI", "Função / Cargo"];
      const rowsEquipe = corretoresPDF.map(c => [
        c.apelido,
        c.nome_completo,
        c.cpf_cnpj,
        c.creci,
        c.cargo
      ]);

      autoTable(doc, {
        head: [headersEquipe],
        body: rowsEquipe,
        startY: y,
        margin: { left: margin, right: margin },
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontStyle: "bold" },
        columnStyles: {
          0: { cellWidth: 28 },
          1: { cellWidth: 'auto' },
          2: { cellWidth: 35 },
          3: { cellWidth: 26 },
          4: { cellWidth: 32 }
        }
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // Section IV - Cláusulas Contratuais
    checkPageBreak(30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("IV - CLÁUSULAS CONTRATUAIS", margin, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);

    const pdfClausulas = isNFRepasse ? [
      {
        num: "1.",
        texto: "O(s) CONTRATANTE(S) deseja(m) comprar a unidade imobiliária indicada no preâmbulo (“Imóvel”);"
      },
      {
        num: "2.",
        texto: "O(s) CORRETOR (ES) ASSOCIADO (S) qualificados no preâmbulo são corretores de imóveis independentes (“CORRETORES”), que podem associar-se a uma imobiliária para intermediar a negociação de compra do Imóvel, atendendo aos interesses dos compradores interessados em comprá-lo, hipótese em que será realizada a partilha da corretagem, de acordo com o art. 728 do Código Civil e art. 6º, parágrafos 2º e 3º da Lei 6.530/78 (modificada pela Lei 13.097/15);"
      },
      {
        num: "3.",
        texto: "O(s) CONTRATANTE(S) foram informados do custo total de aquisição do bem, sendo que a quantia descrita acima como \"Valor Total das Comissões\" será destinada ao pagamento dos CORRETORES ASSOCIADOS pela intermediação realizada, valores devidos com a celebração do compromisso de compra e venda."
      },
      {
        num: "4.",
        texto: "As partes nomeadas e qualificadas no preâmbulo, têm entre si justo e contratado firmar o presente CONTRATO DE CORRETAGEM IMOBILIÁRIA, entre o(s) CONTRATANTE(S) e os CORRETORES, nos seguintes termos:",
        subitens: [
          "a). O(s) CONTRATANTE(S) reconhece(m) o serviço e a respectiva remuneração da intermediação imobiliária pela quantia acima descrita, na forma e prazos combinados e descritos na planilha anexa, que integra o presente instrumento para todos os fins de direito.",
          "b). O valor da intermediação imobiliária será pago pela CONSTRUTORA/INCORPORADORA diretamente para a Imobiliária que será responsável em repassar para os respectivos CORRETORES, os valores que lhes são devidos.",
          "c). Os CORRETORES estão cientes que a Imobiliária descontará os valores referentes aos tributos que incidam para a emissão da respectiva Nota Fiscal."
        ]
      },
      {
        num: "5.",
        texto: "Os CORRETORES participantes deste negócio de compra e venda outorgam-se autorização recíproca para assinatura dos respectivos instrumentos jurídicos e fiscais decorrentes do presente negócio imobiliário. Este Contrato, acompanhado da planilha anexa, é título executivo extrajudicial, sendo os valores de honorários de corretagem considerados dívida líquida, certa e exigível."
      },
      {
        num: "6.",
        texto: "Nos termos da lei, o(s) CONTRATANTE(S) se declara(m) ciente(s) de que o compromisso ou contrato de compra e venda do Imóvel somente obrigará a incorporadora ou proprietário depois de aceito e assinado pela incorporadora ou proprietário. Portanto, eventuais valores pagos pelo(s) CONTRATANTE(S) não caracterizam sinal ou princípio de pagamento até o aceite da incorporadora ou proprietário no compromisso ou contrato, portanto serão integralmente devolvidos ao(s) CONTRATANTE(S) se o compromisso ou contrato não se concluir."
      },
      {
        num: "7.",
        texto: "O(s) CONTRATANTE(S) se comprometem a ler detidamente todas as condições dos contratos de memoriais para aquisição do Imóvel antes de assiná-los, principalmente: o compromisso ou contrato de compra e venda do Imóvel, sobretudo no que diz respeito à descrição do Imóvel, condições de pagamento e eventual necessidade de tomada de financiamento para quitação da parcela de chaves, atualização monetária das parcelas e juros aplicáveis, prazo de entrega, cláusulas de rescisão, multas, bem como as plantas e memorial descritivo."
      },
      {
        num: "8.",
        texto: "O(s) CONTRATANTE(S) desde já autoriza(m) a(s) Instituição(ões) Financeira(s) cessionária(s) dos créditos a efetuar consultas e realizar comunicações junto aos Órgãos de Proteção do Crédito."
      },
      {
        num: "9.",
        texto: "O(s) CONTRATANTE(S) desde já autoriza(m) a(s) Instituição(ões) Financeira(s) cessionária(s) dos créditos a efetuar consultas e realizar comunicações junto aos Órgãos de Proteção do Crédito."
      },
      {
        num: "10.",
        texto: "DA ASSINATURA ELETRÔNICA: As partes reconhecem a validade, eficácia e fidedignidade deste instrumento assinado por meio de certificado digital ou plataforma de assinatura eletrônica (tal como Zapsign, DocuSign ou similar), dispensando-se a assinatura física e o reconhecimento de firma em cartório, nos termos da legislação vigente."
      },
      {
        num: "11.",
        texto: "As Partes elegem o Foro da Comarca da Capital do Estado de São Paulo para conhecer e dirimir quaisquer questões a ele relacionadas, assinando-o eletronicamente na presença de 2 (duas) testemunhas."
      }
    ] : [
      {
        num: "1.",
        texto: "O(s) CONTRATANTE(S) deseja(m) comprar a unidade imobiliária indicada no item II (“Imóvel”);"
      },
      {
        num: "2.",
        texto: "O(s) CORRETOR(ES) ASSOCIADO(S) qualificados no item III são corretores de imóveis independentes (“CORRETORES”), que podem associar-se a uma imobiliária para intermediar a negociação de compra do Imóvel, atendendo aos interesses dos compradores interessados em adquiri-lo, hipótese em que será realizada a partilha da corretagem, de acordo com o art. 728 do Código Civil e art. 6º, §§ 2º e 3º da Lei Federal nº 6.530/1978 (com redação dada pela Lei nº 13.097/2015);"
      },
      {
        num: "3.",
        texto: "O(s) CONTRATANTE(S) declaram ter sido previamente informados do custo total de aquisição do bem, sendo que a quantia descrita na planilha anexa como \"Valor Total das Comissões\" será destinada ao pagamento dos CORRETORES ASSOCIADOS pela intermediação imobiliária realizada, valores devidos com a celebração do compromisso de compra e venda;"
      },
      {
        num: "4.",
        texto: "As partes nomeadas e qualificadas no item I têm entre si justo e contratado firmar o presente CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE CORRETAGEM IMOBILIÁRIA, nos seguintes termos:",
        subitens: [
          "a) O(s) CONTRATANTE(S) obriga(m)-se ao pagamento da remuneração pela intermediação imobiliária na quantia, prazos e condições estipulados na planilha anexa, a qual passa a integrar o presente instrumento para todos os fins de direito;",
          "b) Os pagamentos deverão ser realizados pelo(s) CONTRATANTE(S) exclusivamente por meio de boletos bancários, cuja quitação plena ocorrerá após a regular compensação bancária do respectivo título."
        ]
      },
      {
        num: "5.",
        texto: "O(s) CONTRATANTE(S) declara(m)-se ciente(s) e de acordo que os créditos decorrentes dos honorários de corretagem imobiliária poderão ser cedidos a instituições integrantes do Sistema Financeiro Nacional, aceitando, para os fins específicos da referida cessão de crédito, ser notificado(s) por meio do(s) e-mail(s) informado(s) no item I deste contrato;"
      },
      {
        num: "6.",
        texto: "O inadimplemento no pagamento de qualquer uma das parcelas dos honorários de corretagem acarretará o vencimento antecipado da totalidade do saldo devedor remanescente previsto na planilha anexa, incidindo sobre o montante inadimplido: correção monetária pela variação positiva do IGP-M/FGV (ou índice oficial substituto), calculada da data do vencimento até a data do efetivo pagamento, juros moratórios de 1% (um por cento) ao mês e multa penal de 2% (dois por cento);"
      },
      {
        num: "7.",
        texto: "Os honorários de corretagem efetivamente quitados pelo(s) CONTRATANTE(S) integram o custo de aquisição do bem imóvel para fins de comprovação perante a Receita Federal do Brasil na Declaração de Ajuste Anual do Imposto de Renda;"
      },
      {
        num: "8.",
        texto: "Para comprovação fiscal e tributária, os CORRETORES obrigam-se a fornecer ao(s) CONTRATANTE(S) os respectivos Recibos de Pagamento a Autônomo (RPA) ou Notas Fiscais de Serviços, no endereço físico ou eletrônico constante do item I, cabendo ao(s) CONTRATANTE(S) comunicar de imediato qualquer alteração em seus dados cadastrais;"
      },
      {
        num: "9.",
        texto: "Os CORRETORES outorgam reciprocamente poderes para formalização dos instrumentos jurídicos e fiscais decorrentes deste negócio imobiliário, inclusive para eventuais medidas judiciais e extrajudiciais de cobrança. O presente contrato, integrado pela planilha anexa, constitui título executivo extrajudicial (art. 784, III, do Código de Processo Civil), consubstanciando obrigação líquida, certa e exigível;"
      },
      {
        num: "10.",
        texto: "O(s) CONTRATANTE(S) declara(m)-se ciente(s) de que a proposta ou compromisso de compra e venda do Imóvel somente vinculará e obrigará a incorporadora/proprietária vendedora após expressa aceitação e assinatura do respectivo instrumento."
      },
      {
        num: "11.",
        texto: "O(s) Contratante(s) estão ciente(s) do caráter irrevogável e irretratável desta venda e que a devolução das comissões será cabível apenas no caso do exercício do prazo de 7 (sete) dias de reflexão contados à partir da assinatura do presente contrato."
      },
      {
        num: "12.",
        texto: "O(s) CONTRATANTE(S) compromete(m)-se a examinar previamente todas as condições estipuladas nos memoriais e no compromisso de compra e venda da unidade, especialmente quanto à metragem e descrição do Imóvel, fluxo financeiro, eventual necessidade de contratação de financiamento bancário para a parcela de chaves, sistemática de atualização monetária e juros, prazos contratuais de entrega, cláusulas de tolerância, multas rescisórias e especificações do memorial descritivo;"
      },
      {
        num: "13.",
        texto: "O(s) CONTRATANTE(S) autoriza(m) expressamente a(s) instituição(ões) financeira(s) cessionária(s) dos créditos a realizar consultas cadastrais e inclusões pertinentes junto aos órgãos de proteção ao crédito (como SERASA, SPC e congêneres) em caso de inadimplemento;"
      },
      {
        num: "14.",
        texto: "As Partes elegem o Foro da comarca de situação do Imóvel para dirimir quaisquer litígios ou controvérsias oriundas do presente instrumento, com renúncia expressa a qualquer outro, por mais privilegiado que seja."
      }
    ];

    pdfClausulas.forEach((c) => {
      const fullText = `${c.num} ${c.texto.replace(/<\/?strong>/g, '')}`;
      const splitText = doc.splitTextToSize(fullText, contentWidth);
      checkPageBreak(splitText.length * 4.2 + (c.subitens ? 16 : 4));
      doc.text(splitText, margin, y);
      y += splitText.length * 4.2 + 2;

      if (c.subitens) {
        c.subitens.forEach(sub => {
          const cleanSub = sub.replace(/<\/?strong>/g, '');
          const splitSub = doc.splitTextToSize(cleanSub, contentWidth - 6);
          checkPageBreak(splitSub.length * 4.2 + 3);
          doc.text(splitSub, margin + 6, y);
          y += splitSub.length * 4.2 + 2;
        });
      }
      y += 1.5;
    });

    // Section V - Payment Conditions and Apportionment
    checkPageBreak(40);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("V - DOS VALORES, RATEIO E COMISSÕES (PLANILHA ANEXA)", margin, y);
    y += 6;

    const condicoesText = `As condições de remuneração pela intermediação imobiliária, bem como a discriminação dos valores destinados à amortização do preço do imóvel e à quitação das comissões pactuadas (conforme previsto na Cláusula 4ª), estão detalhadas nas tabelas de fluxo abaixo:`;
    const splitCondicoes = doc.splitTextToSize(condicoesText, contentWidth);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(splitCondicoes, margin, y);
    y += splitCondicoes.length * 4.2 + 6;

    // Tables using autotable!
    // 1. Obter o Rateio Consolidado (Waterfall) para garantir que a comissão no contrato seja rigorosamente a do rateio
    let contractWaterfall: WaterfallResult | null = null;
    if ((data as any).manual_waterfall) {
      contractWaterfall = obterRateioConsolidado((data as any).manual_waterfall);
    } else if (data === result && waterfallResult) {
      contractWaterfall = waterfallResult;
    } else {
      const sumExcluded = (data.payments || [])
        .filter(p => isExcludedFromCommissionBase(p.tipo))
        .reduce((acc, p) => acc + (p.valorTotal || 0), 0);
      const sumAllParcelas = (data.payments || []).reduce((acc, p) => acc + (p.valorTotal || 0), 0);
      const baseVendaTotal = Math.max(0, (sumAllParcelas > 0 ? sumAllParcelas : ((data as any).valorTotalProposta || 0)) - sumExcluded);
      const currentEmp = empreendimentos.find(e => e.nome === property.empreendimento);
      
      const pParties = (data as any).commissioned_parties || (data as any).commissionedParties || commissionedParties;
      const sumCargosPerc = Number((pParties || []).reduce((acc: number, p: any) => acc + (Number(p.percentage) || 0), 0).toFixed(4));
      const pCommission = sumCargosPerc > 0 
        ? sumCargosPerc 
        : ((data as any).percentualComissao !== undefined ? (data as any).percentualComissao : percentualComissao);

      const simParaFluxo = sim || processarProposta(
        data.payments || [],
        pCommission,
        currentEmp?.regras_comissao,
        installmentConfigs,
        (data as any).forma_pagamento_comissao || 'PAGADORIA'
      );

      contractWaterfall = calcularRateioCascata(
        baseVendaTotal,
        pCommission,
        simParaFluxo ? simParaFluxo.fluxo : [],
        (data as any).forma_pagamento_comissao || 'PAGADORIA',
        pParties,
        currentEmp?.regras_comissao
      );
    }

    if (!contractWaterfall) {
      contractWaterfall = {
        vendaTotal: 0,
        comissaoTotal: 0,
        saldoRestanteComissao: 0,
        participantes: [],
        detalhesParcelas: []
      };
    }

    const comissaoRateioTotal = contractWaterfall.comissaoTotal;

    if (sim) {
      const totalProposta = data.payments.reduce((acc, p) => acc + p.valorTotal, 0);

      // Table 1: Proposal
      checkPageBreak(45);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(30, 41, 59);
      doc.text("Tabela 1. Condição de Pagamento da Proposta (Fluxo Bruto)", margin, y);
      y += 4;

      const headers1 = ["Qtd", "Tipo de Parcela", "Valor da Parcela", "Vencimento", "Vencimento Final", "Valor Total"];
      const rows1 = data.payments.map((p) => {
        const matchingInstallments = sim.fluxo.filter(
          f => f.tipo === p.tipo && f.valorUnitario === p.valorUnitario
        );
        const vencimentoFinal = p.quantidade > 1 && matchingInstallments.length > 0
          ? matchingInstallments[matchingInstallments.length - 1].vencimento
          : p.vencimento || '-';

        return [
          `${p.quantidade}x`,
          p.tipo,
          p.valorUnitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
          p.vencimento || '-',
          vencimentoFinal,
          p.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        ];
      });

      rows1.push([
        "TOTAL",
        "",
        "",
        "",
        "",
        totalProposta.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      ]);

      autoTable(doc, {
        head: [headers1],
        body: rows1,
        startY: y,
        margin: { left: margin, right: margin },
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontStyle: "bold" },
        didParseCell: (cellData) => {
          if (cellData.row.index === rows1.length - 1) {
            cellData.cell.styles.fontStyle = "bold";
            cellData.cell.styles.fillColor = [243, 244, 246];
          }
        }
      });
      y = (doc as any).lastAutoTable.finalY + 10;

      // Extrair fluxo líquido e de comissões do Rateio em Cascata (Waterfall)
      const rateioFluxo = (contractWaterfall && contractWaterfall.detalhesParcelas && contractWaterfall.detalhesParcelas.length > 0)
        ? contractWaterfall.detalhesParcelas.map(det => ({
            tipo: det.tipo,
            vencimento: det.vencimento,
            valorTotal: det.valorParcela,
            valorLiquido: Number(Math.max(0, det.valorParcela - det.valorRetido).toFixed(2))
          }))
        : (sim ? sim.fluxo : []);

      const condicaoPreco = extrairCondicaoPagamentoDoFluxo(rateioFluxo, 'preco');
      let condicaoComissao = extrairCondicaoPagamentoDoFluxo(rateioFluxo, 'comissao');

      const totalComissaoExtracted = Number(condicaoComissao.reduce((acc, p) => acc + p.valorTotal, 0).toFixed(2));
      const diffComissao = Number((comissaoRateioTotal - totalComissaoExtracted).toFixed(2));
      if (diffComissao > 0.01) {
        condicaoComissao.push({
          quantidade: 1,
          tipo: "Saldo Residual de Comissão",
          valorUnitario: diffComissao,
          vencimento: rateioFluxo.length > 0 ? rateioFluxo[rateioFluxo.length - 1].vencimento : "-",
          vencimentoFinal: rateioFluxo.length > 0 ? rateioFluxo[rateioFluxo.length - 1].vencimento : "-",
          valorTotal: diffComissao
        });
      }

      // Table 2: Price
      checkPageBreak(45);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(79, 70, 229);
      doc.text("Tabela 2. Condição de Pagamento do Preço (Fluxo Líquido)", margin, y);
      y += 4;

      const headers2 = ["Qtd", "Tipo de Parcela", "Valor da Parcela", "Vencimento", "Vencimento Final", "Valor Total"];
      const rows2 = condicaoPreco.map((p) => [
        `${p.quantidade}x`,
        p.tipo,
        p.valorUnitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        p.vencimento || '-',
        p.vencimentoFinal || p.vencimento || '-',
        p.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      ]);

      const totalPrecoCalculado = condicaoPreco.reduce((acc, p) => acc + p.valorTotal, 0);

      rows2.push([
        "TOTAL",
        "",
        "",
        "",
        "",
        totalPrecoCalculado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      ]);

      autoTable(doc, {
        head: [headers2],
        body: rows2,
        startY: y,
        margin: { left: margin, right: margin },
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: "bold" },
        didParseCell: (cellData) => {
          if (cellData.row.index === rows2.length - 1) {
            cellData.cell.styles.fontStyle = "bold";
            cellData.cell.styles.fillColor = [243, 244, 246];
          }
        }
      });
      y = (doc as any).lastAutoTable.finalY + 10;

      // Table 3: Commission
      checkPageBreak(45);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(217, 119, 6); // amber-600
      doc.text("Tabela 3. Condição de Pagamento das Comissões", margin, y);
      y += 4;

      const headers4 = ["Qtd", "Tipo de Parcela", "Valor da Parcela", "Vencimento", "Vencimento Final", "Valor Total"];
      const rows4 = condicaoComissao.map((p) => [
        `${p.quantidade}x`,
        p.tipo,
        p.valorUnitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        p.vencimento || '-',
        p.vencimentoFinal || p.vencimento || '-',
        p.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      ]);

      const totalComissaoCalculada = condicaoComissao.reduce((acc, p) => acc + p.valorTotal, 0);

      rows4.push([
        "TOTAL",
        "",
        "",
        "",
        "",
        totalComissaoCalculada.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      ]);

      autoTable(doc, {
        head: [headers4],
        body: rows4,
        startY: y,
        margin: { left: margin, right: margin },
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [217, 119, 6], textColor: [255, 255, 255], fontStyle: "bold" },
        didParseCell: (cellData) => {
          if (cellData.row.index === rows4.length - 1) {
            cellData.cell.styles.fontStyle = "bold";
            cellData.cell.styles.fillColor = [243, 244, 246];
          }
        }
      });
      y = (doc as any).lastAutoTable.finalY + 10;
    }

    // Closing Foro and Assinaturas Section
    checkPageBreak(65);
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("VI - DAS ASSINATURAS", margin, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    const splitForo = doc.splitTextToSize(
      isNFRepasse
        ? "E, por estarem as partes justas e contratadas, assinam o presente CONTRATO DE CORRETAGEM IMOBILIÁRIA eletronicamente na presença de 2 (duas) testemunhas."
        : "E por estarem assim justas e contratadas, as partes firmam o presente contrato de prestação de serviços de corretagem imobiliária, o qual assinam eletronicamente.",
      contentWidth
    );
    doc.text(splitForo, margin, y);
    y += splitForo.length * 4.5 + 8;

    // Local e Data (Município/Estado onde o imóvel está localizado)
    const currentDate = new Date();
    const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const localImovel = getLocalImovel(property, address, empreendimentos);
    const dataLocal = `${localImovel}, ${currentDate.getDate()} de ${meses[currentDate.getMonth()]} de ${currentDate.getFullYear()}`;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text("LOCAL E DATA:", margin, y);
    y += 4.5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(dataLocal, margin, y);
    y += 12;

    // Visual Signature fields (Contratantes e Equipe de Vendas / Corretores Associados)
    checkPageBreak(40 + (customers.length + corretoresPDF.length) * 15);

    // Linha de assinatura para Contratantes e Imobiliária Contratada
    customers.forEach((cust, idx) => {
      checkPageBreak(25);
      doc.setFont("helvetica", "bold");
      doc.text("______________________________________", margin, y);
      if (idx === 0) {
        doc.text("______________________________________", margin + 95, y);
      }
      y += 5;
      doc.setFontSize(8);
      const cNome = (cust.nome || (customers.length > 1 ? `CONTRATANTE / COMPRADOR ${idx + 1}` : "CONTRATANTE")).toUpperCase();
      doc.text(cNome, margin, y);
      if (idx === 0) {
        doc.text("RODOLFO JERRY IMÓVEIS", margin + 95, y);
      }
      y += 4;
      doc.setFont("helvetica", "normal");
      doc.text(`CPF: ${cust.cpf || '___.___.___-__'}`, margin, y);
      if (idx === 0) {
        doc.text(`CNPJ: 29.881.101/0001-09`, margin + 95, y);
      }
      y += 10;
    });

    // Assinaturas dos Participantes da Venda descritos no Item III
    if (corretoresPDF.length > 0) {
      checkPageBreak(25);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(51, 65, 85);
      doc.text("PARTICIPANTES DA VENDA / EQUIPE DE VENDAS (ITEM III):", margin, y);
      y += 6;
      doc.setTextColor(15, 23, 42);

      for (let i = 0; i < corretoresPDF.length; i += 2) {
        checkPageBreak(28);
        const c1 = corretoresPDF[i];
        const c2 = i + 1 < corretoresPDF.length ? corretoresPDF[i + 1] : null;

        doc.setFont("helvetica", "bold");
        doc.text("______________________________________", margin, y);
        if (c2) {
          doc.text("______________________________________", margin + 95, y);
        }
        y += 5;
        doc.setFontSize(8);
        doc.text((c1.nome_completo || "").toUpperCase(), margin, y);
        if (c2) {
          doc.text((c2.nome_completo || "").toUpperCase(), margin + 95, y);
        }
        y += 4;
        doc.setFont("helvetica", "normal");
        const cargo1 = (c1.cargo || "Participante de Vendas").toUpperCase();
        doc.text(cargo1, margin, y);
        if (c2) {
          const cargo2 = (c2.cargo || "Participante de Vendas").toUpperCase();
          doc.text(cargo2, margin + 95, y);
        }
        y += 4;
        const cred1 = `CPF/CNPJ: ${c1.cpf_cnpj || '___.___.___-__'}${c1.creci && !c1.creci.includes('____') ? ` - CRECI: ${c1.creci}` : ''}`;
        doc.text(cred1, margin, y);
        if (c2) {
          const cred2 = `CPF/CNPJ: ${c2.cpf_cnpj || '___.___.___-__'}${c2.creci && !c2.creci.includes('____') ? ` - CRECI: ${c2.creci}` : ''}`;
          doc.text(cred2, margin + 95, y);
        }
        y += 11;
      }
    }

    // Assinaturas das Testemunhas Instrumentárias (Exigência Contratual)
    checkPageBreak(30);
    doc.setFont("helvetica", "bold");
    doc.text("______________________________________", margin, y);
    doc.text("______________________________________", margin + 95, y);
    y += 5;
    doc.setFontSize(8);
    doc.text("TESTEMUNHA 1", margin, y);
    doc.text("TESTEMUNHA 2", margin + 95, y);
    y += 4;
    doc.setFont("helvetica", "normal");
    doc.text("CPF: ___.___.___-__", margin, y);
    doc.text("CPF: ___.___.___-__", margin + 95, y);
    y += 10;

    // --- ANEXO II - TABELA DE RATEIO ---
    doc.addPage();
    y = 20;

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59); // Slate-800
    doc.text("ANEXO II - TABELA DE RATEIO DE COMISSÃO", pageWidth / 2, y, { align: "center" });
    y += 10;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const introAnexoII = "Este Anexo II formaliza a distribuição interna das comissões de corretagem imobiliária pactuadas, operando como auditoria de limites de teto de recebimento para cada participante associado.";
    const splitIntroAnexoII = doc.splitTextToSize(introAnexoII, contentWidth);
    doc.text(splitIntroAnexoII, margin, y);
    y += splitIntroAnexoII.length * 5 + 6;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(79, 70, 229); // indigo-600
    doc.text("Resumo de Comissão por Profissional / Cargo", margin, y);
    y += 4;

    const headersSummary = ["Profissional / Cargo", "Comissão Recebida"];
    const rowsSummary = contractWaterfall.participantes.map(p => {
      const label = p.name ? `${p.role} - ${p.name}` : p.role;
      return [
        label,
        p.received.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      ];
    });

    autoTable(doc, {
      head: [headersSummary],
      body: rowsSummary,
      startY: y,
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: "bold" },
    });

    // Add a new landscape page for Table 2 (Anexo II)
    doc.addPage("a4", "l");
    y = 20;

    const landscapePageWidth = doc.internal.pageSize.getWidth();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.text("ANEXO II - DETALHAMENTO DE RATEIO CRONOLÓGICO REAL", landscapePageWidth / 2, y, { align: "center" });
    y += 12;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text("Detalhamento de Rateio Cronológico Real", margin, y);
    y += 6;

    let runningSum = 0;
    const visibleParcelas = [];
    for (let idx = 0; idx < contractWaterfall.detalhesParcelas.length; idx++) {
      const det = contractWaterfall.detalhesParcelas[idx];
      const correspondingSimFluxo = (sim && idx < sim.fluxo.length && contractWaterfall.detalhesParcelas.length > 1)
        ? sim.fluxo[idx]
        : null;

      const vencimentoToShow = det.vencimento || (correspondingSimFluxo ? correspondingSimFluxo.vencimento : '');
      const valorComissaoToShow = (det.valorRetido > 0 || (data as any).manual_waterfall)
        ? det.valorRetido
        : (correspondingSimFluxo ? Number((correspondingSimFluxo.valorTotal - correspondingSimFluxo.valorLiquido).toFixed(2)) : det.valorRetido);

      if (valorComissaoToShow > 0) {
        visibleParcelas.push({
          ...det,
          vencimentoToShow,
          valorComissaoToShow
        });
      }
      runningSum = Number((runningSum + valorComissaoToShow).toFixed(2));
      if (runningSum >= contractWaterfall.comissaoTotal - 0.01 && contractWaterfall.comissaoTotal > 0) {
        break;
      }
    }

    const headRow1 = [
      "",
      "",
      ...contractWaterfall.participantes.map(p => {
        const apelido = getParticipantApelido(p.name, corretoresPDF) || (p.role?.toLowerCase().includes('imobili') ? 'R&J' : (p.name ? p.name.split(' ')[0] : ''));
        return (apelido || p.role).toUpperCase();
      })
    ];

    const headRow2 = [
      "VALOR",
      "VENCIMENTO",
      ...contractWaterfall.participantes.map(p => p.role)
    ];

    const rowsDetail = visibleParcelas.map(det => {
      return [
        det.valorComissaoToShow.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        det.vencimentoToShow,
        ...contractWaterfall.participantes.map(p => {
          const label = p.name ? `${p.role} - ${p.name}` : p.role;
          const val = det.distribuicao[label] || 0;
          return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        })
      ];
    });

    const totalComissaoLinhas = visibleParcelas.reduce((acc, d) => acc + d.valorComissaoToShow, 0);
    const footDetail = [
      totalComissaoLinhas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      "TOTAL",
      ...contractWaterfall.participantes.map(p => {
        const label = p.name ? `${p.role} - ${p.name}` : p.role;
        const totalCol = visibleParcelas.reduce((sum, det) => sum + (det.distribuicao[label] || 0), 0);
        return totalCol.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      })
    ];

    const totalCols = headRow2.length;
    const dynamicFontSize = totalCols > 8 ? 4.2 : totalCols > 6 ? 4.8 : 5.5;
    const dynamicCellPadding = totalCols > 8 ? 0.5 : totalCols > 6 ? 0.7 : 1;

    const colStyles: any = {
      0: { halign: 'right' },
      1: { halign: 'center' }
    };
    contractWaterfall.participantes.forEach((_, idx) => {
      colStyles[idx + 2] = { halign: 'right' };
    });

    autoTable(doc, {
      head: [headRow1, headRow2],
      body: rowsDetail,
      foot: [footDetail],
      startY: y,
      margin: { left: margin, right: margin },
      styles: { fontSize: dynamicFontSize, cellPadding: dynamicCellPadding, overflow: 'linebreak' },
      columnStyles: colStyles,
      headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontStyle: "bold", fontSize: dynamicFontSize },
      footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: "bold", fontSize: dynamicFontSize },
      didParseCell: (hookData) => {
        if (hookData.section === 'head') {
          if (hookData.row.index === 0) {
            if (hookData.column.index === 0 || hookData.column.index === 1) {
              hookData.cell.styles.fillColor = [248, 250, 252];
              hookData.cell.styles.textColor = [248, 250, 252];
            } else {
              hookData.cell.styles.fillColor = [241, 245, 249];
              hookData.cell.styles.textColor = [15, 23, 42];
              hookData.cell.styles.fontStyle = 'bold';
              hookData.cell.styles.halign = 'right';
            }
          } else if (hookData.row.index === 1) {
            hookData.cell.styles.fillColor = [71, 85, 105];
            hookData.cell.styles.textColor = [255, 255, 255];
            hookData.cell.styles.fontStyle = 'bold';
            if (hookData.column.index === 1) {
              hookData.cell.styles.halign = 'center';
            } else {
              hookData.cell.styles.halign = 'right';
            }
          }
        }
        if (hookData.section === 'foot') {
          if (hookData.column.index === 1) {
            hookData.cell.styles.halign = 'center';
          } else {
            hookData.cell.styles.halign = 'right';
          }
        }
      }
    });

    let currentY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 8 : y + 60;
    
    // Credenciais dos Participantes na Venda (Rateio)
    if (currentY > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage("a4", "l");
      currentY = 20;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    doc.text("Credenciais dos Participantes na Venda (Rateio)", margin, currentY);
    currentY += 4;

    const credHeaders = ["Nome", "Apelido", "CPF / CNPJ", "CRECI", "Cargo na Operação"];
    const credRows = corretoresPDF.map(c => [c.nome_completo, c.apelido, c.cpf_cnpj, c.creci, c.cargo]);

    autoTable(doc, {
      head: [credHeaders],
      body: credRows.length > 0 ? credRows : [["Nenhum participante associado a esta venda", "-", "-", "-", "-"]],
      startY: currentY,
      margin: { left: margin, right: margin },
      styles: { fontSize: 6.5, cellPadding: 1 },
      headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85], fontStyle: "bold", fontSize: 6.5 }
    });

    currentY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 8 : currentY + 30;

    // Resumo de Cobertura
    if (currentY > doc.internal.pageSize.getHeight() - 25) {
      doc.addPage("a4", "l");
      currentY = 20;
    }

    const totalDistribuida = contractWaterfall.comissaoTotal - contractWaterfall.saldoRestanteComissao;
    const saldoRemanescente = contractWaterfall.saldoRestanteComissao;

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Total Comissão Distribuída: ${totalDistribuida.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}   |   Saldo Remanescente Sem Cobertura: ${saldoRemanescente > 0.05 ? saldoRemanescente.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ 0,00 (100% Coberta)'}`,
      margin,
      currentY
    );

    return doc;
  };

  const getContractFileName = (property: any) => {
    const sanitize = (val: any) => (val || '')
      .toString()
      .trim()
      .replace(/[/\\?%*:|"<>]/g, '-')
      .replace(/\s+/g, ' ');

    const unidade = sanitize(property?.unidade);
    const torreBloco = sanitize(property?.torre);
    const empreendimento = sanitize(property?.empreendimento);

    const parts = [unidade, torreBloco, empreendimento].filter(Boolean);
    const prefix = parts.length > 0 ? parts.join('_') : 'IMOVEL';
    return `${prefix}-CONTRATO DE CORRETAGEM.pdf`;
  };

  const downloadContractPDF = (data: any = result) => {
    if (!data) {
      showToast("Nenhuma proposta selecionada para baixar o contrato.", "info");
      return;
    }
    try {
      const doc = generateContractPDFContent(data, simulationResult);
      if (!doc) {
        showToast("Não foi possível gerar o PDF do contrato.", "error");
        return;
      }
      const fileName = getContractFileName(data.property);
      doc.save(fileName);
      showToast("Contrato baixado em PDF com sucesso!", "success");
    } catch (err) {
      console.error("Erro ao baixar contrato em PDF:", err);
      showToast("Erro ao baixar o contrato em PDF.", "error");
    }
  };

  const saveAssinafySettings = (token: string, sandbox: boolean) => {
    setAssinafyToken(token);
    setIsSandboxAssinafy(sandbox);
    localStorage.setItem('rj_assinafy_token', token);
    localStorage.setItem('rj_assinafy_sandbox', sandbox ? 'true' : 'false');
    showToast("Configurações da Assinafy salvas com sucesso!", "success");
  };

  const refreshEnvelopeStatus = async (envelopeId: string) => {
    const env = assinafyEnvelopes.find(e => e.id === envelopeId);
    if (!env) return;
    
    try {
      const url = `/api/assinafy/status/${envelopeId}?isSandbox=${env.isSandbox ? 'true' : 'false'}&apiToken=${assinafyToken}`;
      const response = await fetch(url);
      const data = await response.json();
      
      if (response.ok && data.success) {
        const updatedEnvelopes = assinafyEnvelopes.map(e => {
          if (e.id === envelopeId) {
            return {
              ...e,
              status: data.status,
              signers: env.isSandbox ? e.signers : data.signers
            };
          }
          return e;
        });
        setAssinafyEnvelopes(updatedEnvelopes);
        localStorage.setItem('rj_assinafy_envelopes', JSON.stringify(updatedEnvelopes));
        showToast("Status do envelope atualizado!", "success");
      } else {
        showToast("Não foi possível atualizar o status.", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Erro ao conectar à API para atualizar status.", "error");
    }
  };

  const removeEnvelopeFromTracking = (id: string) => {
    const updated = assinafyEnvelopes.filter(e => e.id !== id);
    setAssinafyEnvelopes(updated);
    localStorage.setItem('rj_assinafy_envelopes', JSON.stringify(updated));
    showToast("Histórico de envelope removido.", "info");
  };

  const sendToAssinafy = async (docType: 'proposal' | 'contract', signersList: any[]) => {
    if (!result) return;
    setIsCreatingAssinafyEnvelope(true);
    
    try {
      let pdfDoc;
      let fileName = "";
      
      if (docType === 'proposal') {
        pdfDoc = new jsPDF();
        const pageWidth = pdfDoc.internal.pageSize.getWidth();
        
        pdfDoc.setFontSize(16);
        pdfDoc.setTextColor(30, 41, 59);
        pdfDoc.text("PROPOSTA COMERCIAL DE COMPRA E VENDA DE IMÓVEL", pageWidth / 2, 20, { align: "center" });
        
        pdfDoc.setFontSize(12);
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.text("DADOS DO IMÓVEL", 14, 35);
        pdfDoc.setFont("helvetica", "normal");
        pdfDoc.setFontSize(10);
        pdfDoc.text(`Empreendimento: ${result.property?.empreendimento || "-"}`, 14, 42);
        pdfDoc.text(`Unidade: ${result.property?.unidade || "-"}`, 14, 47);
        pdfDoc.text(`Torre/Bloco: ${result.property?.torre || "-"}`, 14, 52);

        pdfDoc.setFontSize(12);
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.text("EQUIPE DE VENDAS", 14, 65);
        pdfDoc.setFont("helvetica", "normal");
        pdfDoc.setFontSize(10);
        pdfDoc.text(`Corretor 1: ${result.salesTeam?.corretor1 || "-"}`, 14, 72);
        pdfDoc.text(`Corretor 2: ${result.salesTeam?.corretor2 || "-"}`, 14, 77);

        const customers = (result.customers || [(result as any).customer]).filter(Boolean);
        let yCoord = 90;
        
        customers.forEach((customer: any, idx: number) => {
          pdfDoc.setFontSize(12);
          pdfDoc.setFont("helvetica", "bold");
          pdfDoc.text(`DADOS DO COMPRADOR ${idx + 1}`, 14, yCoord); yCoord += 7;
          pdfDoc.setFont("helvetica", "normal");
          pdfDoc.setFontSize(10);
          pdfDoc.text(`Nome: ${customer.nome || "-"}`, 14, yCoord); yCoord += 5;
          pdfDoc.text(`CPF: ${customer.cpf || "-"}`, 14, yCoord); yCoord += 5;
          pdfDoc.text(`Telefone: ${customer.telefone || "-"}`, 14, yCoord); yCoord += 5;
          pdfDoc.text(`Email: ${customer.email || "-"}`, 14, yCoord); yCoord += 5;
          yCoord += 5;
        });

        pdfDoc.setFontSize(12);
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.text("CONDIÇÃO DE PAGAMENTO", 14, yCoord);
        yCoord += 5;

        const tableHeaders = ["Qtd", "Tipo de Parcela", "Valor Unit.", "Vencimento", "Total"];
        const tableRows = result.payments.map(p => [
          `${p.quantidade}x`,
          p.tipo,
          p.valorUnitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
          p.vencimento || '-',
          p.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        ]);

        autoTable(pdfDoc, {
          head: [tableHeaders],
          body: tableRows,
          startY: yCoord,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [79, 70, 229] }
        });

        fileName = `Ficha_Proposta_${result.property?.unidade || 'Unidade'}_${result.customers?.[0]?.nome?.split(' ')[0] || 'Cliente'}.pdf`;
      } else {
        pdfDoc = generateContractPDFContent(result, simulationResult);
        fileName = getContractFileName(result.property);
      }
      
      if (!pdfDoc) {
        showToast("Erro ao gerar o documento PDF", "error");
        setIsCreatingAssinafyEnvelope(false);
        return;
      }
      
      let base64PDF = "";
      try {
        const dataUriString = pdfDoc.output('datauristring');
        if (dataUriString && dataUriString.indexOf('base64,') !== -1) {
          base64PDF = dataUriString.split('base64,')[1];
        } else {
          base64PDF = pdfDoc.output('base64');
        }
      } catch (pdfErr) {
        console.error("Erro ao gerar base64 via datauristring, usando fallback:", pdfErr);
        base64PDF = pdfDoc.output('base64');
      }

      const finalSigners = signersList && signersList.length > 0 ? signersList : (editingSigners || []);

      console.log("[Assinafy Client] Enviando envelope:", {
        documentName: fileName,
        base64Length: base64PDF ? base64PDF.length : 0,
        signersCount: finalSigners.length,
        signers: finalSigners,
        isSandbox: isSandboxAssinafy
      });

      const response = await fetch("/api/assinafy/create-envelope", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          apiToken: assinafyToken,
          documentBase64: base64PDF,
          documentName: fileName,
          signers: finalSigners,
          isSandbox: isSandboxAssinafy
        })
      });
      
      const apiResult = await response.json();
      
      if (!response.ok || !apiResult.success) {
        const errorMsg = apiResult.error && apiResult.details
          ? `${apiResult.error} (${apiResult.details})`
          : (apiResult.error || apiResult.details || "Erro no envio do envelope.");
        throw new Error(errorMsg);
      }
      
      const newEnvelope = {
        id: apiResult.envelopeId,
        proposalId: result.id || 'temp_' + Date.now(),
        documentName: fileName,
        docType,
        status: apiResult.status || 'Pendente',
        signers: apiResult.signers,
        viewUrl: apiResult.viewUrl,
        isSandbox: apiResult.isSandbox,
        createdAt: apiResult.created_at || new Date().toISOString()
      };
      
      const updatedEnvelopes = [newEnvelope, ...assinafyEnvelopes];
      setAssinafyEnvelopes(updatedEnvelopes);
      localStorage.setItem('rj_assinafy_envelopes', JSON.stringify(updatedEnvelopes));
      
      showToast("Envelope de assinatura eletrônica criado com sucesso!", "success");
    } catch (err: any) {
      console.error("Assinafy creation error:", err);
      showToast(`Erro na assinatura: ${err.message}`, "error");
    } finally {
      setIsCreatingAssinafyEnvelope(false);
    }
  };

  const printContract = (data: ExtractionResult | SavedExtraction) => {
    if (!data) return;

    const rawCustomers = (data.customers && data.customers.length > 0)
      ? data.customers
      : [(data as any).customer].filter(Boolean);
    const customers = rawCustomers.length > 0 ? rawCustomers : [{}];
    const firstCustomer = customers[0] || {};
    const address = (data.address || {}) as AddressData;
    const property = (data.property || {}) as PropertyData;
    const salesTeam = ((data as any).salesTeam || (data as any).sales_team || {}) as SalesTeam;

    const formatCurrency = (val: number) => {
      return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    const defaultAddressParts = [
      address.logradouro,
      address.numero ? `nº ${address.numero}` : '',
      address.complemento,
      address.bairro,
      address.cidade ? `${address.cidade}/${address.estado || ''}` : ''
    ].filter(Boolean);
    const defaultEnderecoContratante = defaultAddressParts.length > 0 
      ? defaultAddressParts.join(', ') 
      : "__________________________________________________";

    // Dados de todos os compradores/contratantes
    const contratantes = customers.map((c: any) => {
      const cAddress = c.address || address || {};
      const cAddressParts = [
        cAddress.logradouro,
        cAddress.numero ? `nº ${cAddress.numero}` : '',
        cAddress.complemento,
        cAddress.bairro,
        cAddress.cidade ? `${cAddress.cidade}/${cAddress.estado || ''}` : ''
      ].filter(Boolean);
      const enderecoCompleto = cAddressParts.length > 0 
        ? cAddressParts.join(', ') 
        : defaultEnderecoContratante;

      const rgNum = c.rgNumero || "________________";
      const rgOrg = c.rgOrgao ? c.rgOrgao : "";
      const rgFull = rgOrg ? `${rgNum}/${rgOrg}` : rgNum;

      return {
        nome_completo: c.nome || "__________________________________________________",
        nacionalidade: c.nacionalidade || "brasileiro(a)",
        estado_civil: c.estadoCivil || "________________",
        profissao: c.profissao || "________________",
        rg: rgFull,
        cpf: c.cpf || "___.___.___-__",
        endereco_completo: enderecoCompleto,
        cep: cAddress.cep || address.cep || "_____-___",
        telefone: c.telefone || "(__) _____-____",
        email: c.email || "________________"
      };
    });

    const firstContratante = contratantes[0];
    const nomeContratante = contratantes.map(c => c.nome_completo).join(" e ");
    const cpfContratante = contratantes.map(c => c.cpf).join(" / ");
    const nacionalidade = firstContratante.nacionalidade;
    const estadoCivil = firstContratante.estado_civil;
    const profissao = firstContratante.profissao;
    const rgFull = firstContratante.rg;
    const cepContratante = firstContratante.cep;
    const enderecoContratante = firstContratante.endereco_completo;
    const telefoneContratante = firstContratante.telefone;
    const emailContratante = firstContratante.email;

    // Dados da contratada (Imobiliária)
    const razaoSocialContratada = "RODOLFO JERRY IMOVEIS SOCIEDADE UNIPESSOAL LTDA";
    const nomeFantasiaContratada = "Rodolfo Jerry Imóveis";
    const cnpjContratada = "29.881.101/0001-09";
    const creciContratada = "039321-J";
    const enderecoContratada = "Rua Arnóbio, 45, Jardim São Jorge, São Paulo/SP";
    const cepContratada = "05568-040";

    // Dados do objeto
    const identificacaoObjeto = [
      property.empreendimento ? `Empreendimento ${property.empreendimento}` : '',
      property.unidade ? `Unidade nº ${property.unidade}` : '',
      property.torre ? `Torre/Bloco ${property.torre}` : ''
    ].filter(Boolean).join(' - ') || "__________________________________________________";

    const enderecoEmpreendimento = getEnderecoEmpreendimento(property, empreendimentos);

    // Corretores associados e participantes da venda vindos do rateio (Item III - Equipe de Vendas)
    let corretores: Array<{ cargo: string; nome_completo: string; cpf_cnpj: string; apelido: string; creci: string }> = [];

    const activeParties = (data as any).manual_waterfall?.participantes || (data as any).commissionedParties || (data as any).commissioned_parties || commissionedParties || [];
    const validParties = activeParties.filter((p: any) => {
      if (p.hideAndSum) return false;
      const stateMatch = (commissionedParties || []).find((cp: any) => cp.role?.toLowerCase().trim() === p.role?.toLowerCase().trim());
      if (stateMatch && (stateMatch as any).hideAndSum) return false;
      return p.name && p.name.trim() !== '' && !p.name.includes('___');
    });

    if (validParties.length > 0) {
      validParties.forEach((p: any) => {
        const names = p.name.split(',');
        names.forEach((n: string) => {
          const nameTrimmed = n.trim();
          if (!nameTrimmed) return;
          
          // Se o participante já existir na lista, compor os cargos
          const existing = corretores.find(c => c.nome_completo.toLowerCase().trim() === nameTrimmed.toLowerCase());
          if (existing) {
            const currentRoles = existing.cargo.split(',').map((r: string) => r.trim().toLowerCase());
            if (p.role && !currentRoles.includes(p.role.trim().toLowerCase())) {
              existing.cargo = `${existing.cargo}, ${p.role.trim()}`;
            }
            return;
          }

          const match = cargos.find(c => 
            (c.nome && c.nome.toLowerCase().trim() === nameTrimmed.toLowerCase()) ||
            (c.apelido && c.apelido.toLowerCase().trim() === nameTrimmed.toLowerCase())
          ) || cargos.find(c => 
            c.nome && c.nome.toLowerCase().trim().startsWith(nameTrimmed.toLowerCase())
          );

          if (match) {
            corretores.push({
              apelido: match.apelido || match.nome.split(' ')[0] || nameTrimmed.split(' ')[0],
              nome_completo: match.nome,
              cpf_cnpj: match.cpf_cnpj || "___.___.___-__",
              creci: match.creci || "_____-F",
              cargo: p.role || match.cargo || "Participante de Vendas"
            });
          } else {
            corretores.push({
              apelido: nameTrimmed.split(' ')[0],
              nome_completo: nameTrimmed,
              cpf_cnpj: p.cpf_cnpj || "___.___.___-__",
              creci: p.creci || "_____-F",
              cargo: p.role || "Participante de Vendas"
            });
          }
        });
      });
    }

    // Fallback para os campos de preenchimento padrão da proposta caso não haja nenhum participante configurado no rateio
    const hasConfiguredBroker = activeParties.some((p: any) => p.name && p.name.trim() !== '' && !p.name.includes('___'));
    if (corretores.length === 0 && !hasConfiguredBroker && salesTeam) {
      const isCorretorHidden = activeParties.some((p: any) => p.role?.toLowerCase().trim() === 'corretor' && p.hideAndSum);
      if (!isCorretorHidden && salesTeam.corretor1 && !salesTeam.corretor1.includes('___')) {
        const match1 = cargos.find(c => c.nome?.toLowerCase().trim() === salesTeam.corretor1.toLowerCase().trim());
        corretores.push({
          apelido: match1?.apelido || salesTeam.corretor1.split(' ')[0],
          nome_completo: match1?.nome || salesTeam.corretor1,
          cpf_cnpj: match1?.cpf_cnpj || "___.___.___-__",
          creci: match1?.creci || "_____-F",
          cargo: "Corretor Associado"
        });
      }
      const isGerenteHidden = activeParties.some((p: any) => (p.role?.toLowerCase().includes('gerente') || p.role?.toLowerCase().includes('coordenador')) && p.hideAndSum);
      if (!isGerenteHidden && salesTeam.corretor2 && !salesTeam.corretor2.includes('___')) {
        const match2 = cargos.find(c => c.nome?.toLowerCase().trim() === salesTeam.corretor2.toLowerCase().trim());
        corretores.push({
          apelido: match2?.apelido || salesTeam.corretor2.split(' ')[0],
          nome_completo: match2?.nome || salesTeam.corretor2,
          cpf_cnpj: match2?.cpf_cnpj || "___.___.___-__",
          creci: match2?.creci || "_____-F",
          cargo: "Gerente/Coordenador de Vendas"
        });
      }
    }

    const totalValue = data.payments ? data.payments.reduce((acc, p) => acc + (p.valorTotal || 0), 0) : 0;

    const currentDate = new Date();
    const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const localImovel = getLocalImovel(property, address, empreendimentos);
    const dataLocal = `${localImovel}, ${currentDate.getDate()} de ${meses[currentDate.getMonth()]} de ${currentDate.getFullYear()}`;

    // Executar simulação de comissão e fluxo consolidado para o Anexo I
    const currentEmp = empreendimentos.find(e => e.nome === property.empreendimento);
    const pParties = (data as any).commissioned_parties || (data as any).commissionedParties || commissionedParties;
    const sumCargosPerc = Number((pParties || []).reduce((acc: number, p: any) => acc + (Number(p.percentage) || 0), 0).toFixed(4));
    const pCommission = sumCargosPerc > 0 
      ? sumCargosPerc 
      : ((data as any).percentualComissao !== undefined ? (data as any).percentualComissao : percentualComissao);

    const sim = processarProposta(
      data.payments || [], 
      pCommission, 
      currentEmp?.regras_comissao, 
      installmentConfigs,
      (data as any).forma_pagamento_comissao || 'PAGADORIA'
    );

    // Executar rateio de cascata (waterfall) para o Anexo II e Anexo III
    let contractWaterfall: WaterfallResult | null = null;
    if ((data as any).manual_waterfall) {
      contractWaterfall = obterRateioConsolidado((data as any).manual_waterfall);
    } else if (data === result && waterfallResult) {
      contractWaterfall = waterfallResult;
    } else {
      const sumExcluded = (data.payments || [])
        .filter(p => isExcludedFromCommissionBase(p.tipo))
        .reduce((acc, p) => acc + (p.valorTotal || 0), 0);
      const sumAllParcelas = (data.payments || []).reduce((acc, p) => acc + (p.valorTotal || 0), 0);
      const baseVendaTotal = Math.max(0, (sumAllParcelas > 0 ? sumAllParcelas : ((data as any).valorTotalProposta || 0)) - sumExcluded);

      contractWaterfall = calcularRateioCascata(
        baseVendaTotal,
        pCommission,
        sim.fluxo,
        (data as any).forma_pagamento_comissao || 'PAGADORIA',
        pParties,
        currentEmp?.regras_comissao
      );
    }

    if (!contractWaterfall) {
      contractWaterfall = {
        vendaTotal: 0,
        comissaoTotal: 0,
        saldoRestanteComissao: 0,
        participantes: [],
        detalhesParcelas: []
      };
    }

    const comissaoRateioTotal = contractWaterfall.comissaoTotal;
    const formattedTotalProposta = formatCurrency(totalValue);
    const formattedTotalComissoes = formatCurrency(comissaoRateioTotal);
    const formattedTotalImovel = formatCurrency(Math.max(0, totalValue - comissaoRateioTotal));

    const payments = data.payments || [];

    const condicaoPagamentoPropostaRows = payments.map((p, idx) => {
      const matchingInstallments = sim.fluxo.filter(
        f => f.tipo === p.tipo && f.valorUnitario === p.valorUnitario
      );
      const vencimentoFinal = p.quantidade > 1 && matchingInstallments.length > 0
        ? matchingInstallments[matchingInstallments.length - 1].vencimento
        : p.vencimento || '-';

      return `
        <tr>
          <td style="text-align: center; font-size: 12px; font-family: Arial, Helvetica, sans-serif;">${p.quantidade}x</td>
          <td style="font-size: 12px; font-family: Arial, Helvetica, sans-serif;"><strong>${p.tipo}</strong></td>
          <td style="text-align: right; color: #475569; font-size: 12px; font-family: Arial, Helvetica, sans-serif;">${formatCurrency(p.valorUnitario || 0)}</td>
          <td style="text-align: center; color: #475569; font-size: 12px; font-family: Arial, Helvetica, sans-serif;">${p.vencimento || '-'}</td>
          <td style="text-align: center; color: #475569; font-size: 12px; font-family: Arial, Helvetica, sans-serif;">${vencimentoFinal}</td>
          <td style="text-align: right; font-weight: bold; color: #0f172a; font-size: 12px; font-family: Arial, Helvetica, sans-serif;">${formatCurrency(p.valorTotal || 0)}</td>
        </tr>
      `;
    }).join('');

    // Extrair fluxo líquido e de comissões do Rateio (Waterfall)
    const rateioFluxo = (contractWaterfall && contractWaterfall.detalhesParcelas && contractWaterfall.detalhesParcelas.length > 0)
      ? contractWaterfall.detalhesParcelas.map(det => ({
          tipo: det.tipo,
          vencimento: det.vencimento,
          valorTotal: det.valorParcela,
          valorLiquido: Number(Math.max(0, det.valorParcela - det.valorRetido).toFixed(2))
        }))
      : (sim ? sim.fluxo : []);

    const condicaoPreco = extrairCondicaoPagamentoDoFluxo(rateioFluxo, 'preco');
    let condicaoComissao = extrairCondicaoPagamentoDoFluxo(rateioFluxo, 'comissao');

    const totalComissaoExtracted = Number(condicaoComissao.reduce((acc, p) => acc + p.valorTotal, 0).toFixed(2));
    const diffComissao = Number((comissaoRateioTotal - totalComissaoExtracted).toFixed(2));
    if (diffComissao > 0.01) {
      condicaoComissao.push({
        quantidade: 1,
        tipo: "Saldo Residual de Comissão",
        valorUnitario: diffComissao,
        vencimento: rateioFluxo.length > 0 ? rateioFluxo[rateioFluxo.length - 1].vencimento : "-",
        vencimentoFinal: rateioFluxo.length > 0 ? rateioFluxo[rateioFluxo.length - 1].vencimento : "-",
        valorTotal: diffComissao
      });
    }

    const totalPrecoGeral = Number(condicaoPreco.reduce((acc, p) => acc + p.valorTotal, 0).toFixed(2));
    const totalComissaoGeral = Number(condicaoComissao.reduce((acc, p) => acc + p.valorTotal, 0).toFixed(2));
    const totalPropostaGeral = payments.reduce((acc, p) => acc + (p.valorTotal || 0), 0);

    const condicaoPagamentoPrecoRows = condicaoPreco.map(p => `
      <tr>
        <td style="text-align: center; font-size: 12px; font-family: Arial, Helvetica, sans-serif;">${p.quantidade}x</td>
        <td style="font-size: 12px; font-family: Arial, Helvetica, sans-serif;"><strong>${p.tipo}</strong></td>
        <td style="text-align: right; color: #475569; font-size: 12px; font-family: Arial, Helvetica, sans-serif;">${formatCurrency(p.valorUnitario)}</td>
        <td style="text-align: center; color: #475569; font-size: 12px; font-family: Arial, Helvetica, sans-serif;">${p.vencimento || '-'}</td>
        <td style="text-align: center; color: #475569; font-size: 12px; font-family: Arial, Helvetica, sans-serif;">${p.vencimentoFinal || p.vencimento || '-'}</td>
        <td style="text-align: right; font-weight: bold; color: #1e1b4b; font-size: 12px; font-family: Arial, Helvetica, sans-serif;">${formatCurrency(p.valorTotal)}</td>
      </tr>
    `).join('');

    const condicaoPagamentoComissaoRows = condicaoComissao.map(p => `
      <tr>
        <td style="text-align: center; font-size: 12px; font-family: Arial, Helvetica, sans-serif;">${p.quantidade}x</td>
        <td style="font-size: 12px; font-family: Arial, Helvetica, sans-serif;"><strong>${p.tipo}</strong></td>
        <td style="text-align: right; color: #475569; font-size: 12px; font-family: Arial, Helvetica, sans-serif;">${formatCurrency(p.valorUnitario)}</td>
        <td style="text-align: center; color: #475569; font-size: 12px; font-family: Arial, Helvetica, sans-serif;">${p.vencimento || '-'}</td>
        <td style="text-align: center; color: #475569; font-size: 12px; font-family: Arial, Helvetica, sans-serif;">${p.vencimentoFinal || p.vencimento || '-'}</td>
        <td style="text-align: right; font-weight: bold; color: #b45309; font-size: 12px; font-family: Arial, Helvetica, sans-serif;">${formatCurrency(p.valorTotal)}</td>
      </tr>
    `).join('');

    const formaPagamento = ((data as any)?.forma_pagamento_comissao || (result as any)?.forma_pagamento_comissao || 'PAGADORIA').toString().toUpperCase().trim();
    const isNFRepasse = formaPagamento.includes('NF') || formaPagamento.includes('REPASSE');

    // CONTRATO MODELO JSON solicitado pelo usuário
    const contractModel = {
      titulo: isNFRepasse ? "CONTRATO DE CORRETAGEM IMOBILIÁRIA" : "CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE CORRETAGEM IMOBILIÁRIA",
      preambulo: {
        contratante: firstContratante,
        contratantes: contratantes,
        objeto: {
          identificacao: identificacaoObjeto,
          endereco: enderecoEmpreendimento
        },
        contratada: {
          razao_social: razaoSocialContratada,
          nome_fantasia: nomeFantasiaContratada,
          cnpj: cnpjContratada,
          creci: creciContratada,
          endereco_completo: enderecoContratada,
          cep: cepContratada
        },
        corretores_associados: corretores
      },
      clausulas: isNFRepasse ? [
        {
          numero: 1,
          texto: "O(s) CONTRATANTE(S) deseja(m) comprar a unidade imobiliária indicada no preâmbulo (“Imóvel”);"
        },
        {
          numero: 2,
          texto: "O(s) CORRETOR (ES) ASSOCIADO (S) qualificados no preâmbulo são corretores de imóveis independentes (“CORRETORES”), que podem associar-se a uma imobiliária para intermediar a negociação de compra do Imóvel, atendendo aos interesses dos compradores interessados em comprá-lo, hipótese em que será realizada a partilha da corretagem, de acordo com o art. 728 do Código Civil e art. 6º, parágrafos 2º e 3º da Lei 6.530/78 (modificada pela Lei 13.097/15);"
        },
        {
          numero: 3,
          texto: "O(s) CONTRATANTE(S) foram informados do custo total de aquisição do bem, sendo que a quantia descrita acima como \"Valor Total das Comissões\" será destinada ao pagamento dos CORRETORES ASSOCIADOS pela intermediação realizada, valores devidos com a celebração do compromisso de compra e venda."
        },
        {
          numero: 4,
          texto: "As partes nomeadas e qualificadas no preâmbulo, têm entre si justo e contratado firmar o presente CONTRATO DE CORRETAGEM IMOBILIÁRIA, entre o(s) CONTRATANTE(S) e os CORRETORES, nos seguintes termos:",
          subitens: [
            "<strong>a).</strong> O(s) CONTRATANTE(S) reconhece(m) o serviço e a respectiva remuneração da intermediação imobiliária pela quantia acima descrita, na forma e prazos combinados e descritos na planilha anexa, que integra o presente instrumento para todos os fins de direito.",
            "<strong>b).</strong> O valor da intermediação imobiliária será pago pela CONSTRUTORA/INCORPORADORA diretamente para a Imobiliária que será responsável em repassar para os respectivos CORRETORES, os valores que lhes são devidos.",
            "<strong>c).</strong> Os CORRETORES estão cientes que a Imobiliária descontará os valores referentes aos tributos que incidam para a emissão da respectiva Nota Fiscal."
          ]
        },
        {
          numero: 5,
          texto: "Os CORRETORES participantes deste negócio de compra e venda outorgam-se autorização recíproca para assinatura dos respectivos instrumentos jurídicos e fiscais decorrentes do presente negócio imobiliário. Este Contrato, acompanhado da planilha anexa, é título executivo extrajudicial, sendo os valores de honorários de corretagem considerados dívida líquida, certa e exigível."
        },
        {
          numero: 6,
          texto: "Nos termos da lei, o(s) CONTRATANTE(S) se declara(m) ciente(s) de que o compromisso ou contrato de compra e venda do Imóvel somente obrigará a incorporadora ou proprietário depois de aceito e assinado pela incorporadora ou proprietário. Portanto, eventuais valores pagos pelo(s) CONTRATANTE(S) não caracterizam sinal ou princípio de pagamento até o aceite da incorporadora ou proprietário no compromisso ou contrato, portanto serão integralmente devolvidos ao(s) CONTRATANTE(S) se o compromisso ou contrato não se concluir."
        },
        {
          numero: 7,
          texto: "O(s) CONTRATANTE(S) se comprometem a ler detidamente todas as condições dos contratos de memoriais para aquisição do Imóvel antes de assiná-los, principalmente: o compromisso ou contrato de compra e venda do Imóvel, sobretudo no que diz respeito à descrição do Imóvel, condições de pagamento e eventual necessidade de tomada de financiamento para quitação da parcela de chaves, atualização monetária das parcelas e juros aplicáveis, prazo de entrega, cláusulas de rescisão, multas, bem como as plantas e memorial descritivo."
        },
        {
          numero: 8,
          texto: "O(s) CONTRATANTE(S) desde já autoriza(m) a(s) Instituição(ões) Financeira(s) cessionária(s) dos créditos a efetuar consultas e realizar comunicações junto aos Órgãos de Proteção do Crédito."
        },
        {
          numero: 9,
          texto: "O(s) CONTRATANTE(S) desde já autoriza(m) a(s) Instituição(ões) Financeira(s) cessionária(s) dos créditos a efetuar consultas e realizar comunicações junto aos Órgãos de Proteção do Crédito."
        },
        {
          numero: 10,
          texto: "<strong>DA ASSINATURA ELETRÔNICA:</strong> As partes reconhecem a validade, eficácia e fidedignidade deste instrumento assinado por meio de certificado digital ou plataforma de assinatura eletrônica (tal como Zapsign, DocuSign ou similar), dispensando-se a assinatura física e o reconhecimento de firma em cartório, nos termos da legislação vigente."
        },
        {
          numero: 11,
          texto: "As Partes elegem o Foro da Comarca da Capital do Estado de São Paulo para conhecer e dirimir quaisquer questões a ele relacionadas, assinando-o eletronicamente na presença de 2 (duas) testemunhas."
        }
      ] : [
        {
          numero: 1,
          texto: "O(s) CONTRATANTE(S) deseja(m) comprar a unidade imobiliária indicada no item II (“Imóvel”);"
        },
        {
          numero: 2,
          texto: "O(s) CORRETOR(ES) ASSOCIADO(S) qualificados no item III são corretores de imóveis independentes (“CORRETORES”), que podem associar-se a uma imobiliária para intermediar a negociação de compra do Imóvel, atendendo aos interesses dos compradores interessados em adquiri-lo, hipótese em que será realizada a partilha da corretagem, de acordo com o art. 728 do Código Civil e art. 6º, §§ 2º e 3º da Lei Federal nº 6.530/1978 (com redação dada pela Lei nº 13.097/2015);"
        },
        {
          numero: 3,
          texto: "O(s) CONTRATANTE(S) declaram ter sido previamente informados do custo total de aquisição do bem, sendo que a quantia descrita na planilha anexa como \"Valor Total das Comissões\" será destinada ao pagamento dos CORRETORES ASSOCIADOS pela intermediação imobiliária realizada, valores devidos com a celebração do compromisso de compra e venda;"
        },
        {
          numero: 4,
          texto: "As partes nomeadas e qualificadas no item I têm entre si justo e contratado firmar o presente CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE CORRETAGEM IMOBILIÁRIA, nos seguintes termos:",
          subitens: [
            "a) O(s) CONTRATANTE(S) obriga(m)-se ao pagamento da remuneração pela intermediação imobiliária na quantia, prazos e condições estipulados na planilha anexa, a qual passa a integrar o presente instrumento para todos os fins de direito;",
            "b) Os pagamentos deverão ser realizados pelo(s) CONTRATANTE(S) exclusivamente por meio de boletos bancários, cuja quitação plena ocorrerá após a regular compensação bancária do respectivo título."
          ]
        },
        {
          numero: 5,
          texto: "O(s) CONTRATANTE(S) declara(m)-se ciente(s) e de acordo que os créditos decorrentes dos honorários de corretagem imobiliária poderão ser cedidos a instituições integrantes do Sistema Financeiro Nacional, aceitando, para os fins específicos da referida cessão de crédito, ser notificado(s) por meio do(s) e-mail(s) informado(s) no item I deste contrato;"
        },
        {
          numero: 6,
          texto: "O inadimplemento no pagamento de qualquer uma das parcelas dos honorários de corretagem acarretará o vencimento antecipado da totalidade do saldo devedor remanescente previsto na planilha anexa, incidindo sobre o montante inadimplido: correção monetária pela variação positiva do IGP-M/FGV (ou índice oficial substituto), calculada da data do vencimento até a data do efetivo pagamento, juros moratórios de 1% (um por cento) ao mês e multa penal de 2% (dois por cento);"
        },
        {
          numero: 7,
          texto: "Os honorários de corretagem efetivamente quitados pelo(s) CONTRATANTE(S) integram o custo de aquisição do bem imóvel para fins de comprovação perante a Receita Federal do Brasil na Declaração de Ajuste Anual do Imposto de Renda;"
        },
        {
          numero: 8,
          texto: "Para comprovação fiscal e tributária, os CORRETORES obrigam-se a fornecer ao(s) CONTRATANTE(S) os respectivos Recibos de Pagamento a Autônomo (RPA) ou Notas Fiscais de Serviços, no endereço físico ou eletrônico constante do item I, cabendo ao(s) CONTRATANTE(S) comunicar de imediato qualquer alteração em seus dados cadastrais;"
        },
        {
          numero: 9,
          texto: "Os CORRETORES outorgam reciprocamente poderes para formalização dos instrumentos jurídicos e fiscais decorrentes deste negócio imobiliário, inclusive para eventuais medidas judiciais e extrajudiciais de cobrança. O presente contrato, integrado pela planilha anexa, constitui título executivo extrajudicial (art. 784, III, do Código de Processo Civil), consubstanciando obrigação líquida, certa e exigível;"
        },
        {
          numero: 10,
          texto: "O(s) CONTRATANTE(S) declara(m)-se ciente(s) de que a proposta ou compromisso de compra e venda do Imóvel somente vinculará e obrigará a incorporadora/proprietária vendedora após expressa aceitação e assinatura do respectivo instrumento."
        },
        {
          numero: 11,
          texto: "O(s) Contratante(s) estão ciente(s) do caráter irrevogável e irretratável desta venda e que a devolução das comissões será cabível apenas no caso do exercício do prazo de 7 (sete) dias de reflexão contados à partir da assinatura do presente contrato."
        },
        {
          numero: 12,
          texto: "O(s) CONTRATANTE(S) compromete(m)-se a examinar previamente todas as condições estipuladas nos memoriais e no compromisso de compra e venda da unidade, especialmente quanto à metragem e descrição do Imóvel, fluxo financeiro, eventual necessidade de contratação de financiamento bancário para a parcela de chaves, sistemática de atualização monetária e juros, prazos contratuais de entrega, cláusulas de tolerância, multas rescisórias e especificações do memorial descritivo;"
        },
        {
          numero: 13,
          texto: "O(s) CONTRATANTE(S) autoriza(m) expressamente a(s) instituição(ões) financeira(s) cessionária(s) dos créditos a realizar consultas cadastrais e inclusões pertinentes junto aos órgãos de proteção ao crédito (como SERASA, SPC e congêneres) em caso de inadimplemento;"
        },
        {
          numero: 14,
          texto: "As Partes elegem o Foro da comarca de situação do Imóvel para dirimir quaisquer litígios ou controvérsias oriundas do presente instrumento, com renúncia expressa a qualquer outro, por mais privilegiado que seja."
        }
      ],
      assinaturas: {
        data_local: dataLocal,
        contratante: nomeContratante,
        contratantes: contratantes.map(c => ({
          nome_completo: c.nome_completo,
          cpf: c.cpf
        })),
        corretores_associados: corretores.map(c => c.nome_completo),
        contratada: razaoSocialContratada,
        testemunhas: [
          { numero: 1, nome: "______________________", cpf: "______________________" },
          { numero: 2, nome: "______________________", cpf: "______________________" }
        ]
      },
      anexo_i: {
        titulo: "DEMONSTRATIVO FINANCEIRO",
        dados_do_cliente: {
          nome: contratantes.map(c => c.nome_completo).join(" e "),
          cpf: contratantes.map(c => c.cpf).join(" / ")
        },
        dados_do_objeto: {
          identificacao: identificacaoObjeto
        },
        proposta_comercial: {
          parcelas: data.payments ? data.payments.map(p => ({
            tipo_de_parcela: p.tipo,
            quantidade: p.quantidade.toString(),
            valor: formatCurrency(p.valorUnitario),
            vencimento: p.vencimento,
            total: formatCurrency(p.valorTotal)
          })) : [],
          valor_total: formatCurrency(totalValue)
        },
        condicao_de_pagamento_do_imovel: {
          parcelas: condicaoPreco.map(p => ({
            tipo_de_parcela: p.tipo,
            quantidade: p.quantidade.toString(),
            valor: formatCurrency(p.valorUnitario),
            vencimento: p.vencimento,
            vencimento_final: p.vencimentoFinal,
            total: formatCurrency(p.valorTotal)
          })),
          valor_total: formatCurrency(totalPrecoGeral)
        },
        condicao_de_pagamento_das_comissoes: {
          parcelas: condicaoComissao.map(p => ({
            tipo_de_parcela: p.tipo,
            quantidade: p.quantidade.toString(),
            valor: formatCurrency(p.valorUnitario),
            vencimento: p.vencimento,
            vencimento_final: p.vencimentoFinal,
            total: formatCurrency(p.valorTotal)
          })),
          valor_total: formatCurrency(totalComissaoGeral)
        },
        observacao: "Os valores e datas constantes neste Anexo estão em estrita conformidade com a intermediação imobiliária e proposta acordada para a unidade imobiliária referida."
      }
    };

    const paymentRows = contractModel.anexo_i.proposta_comercial.parcelas.map(p => `
      <tr>
        <td class="col-tipo">${p.tipo_de_parcela}</td>
        <td class="col-qtd" style="text-align: center;">${p.quantidade}</td>
        <td class="col-valor">${p.valor}</td>
        <td class="col-venc">${p.vencimento}</td>
        <td class="col-total">${p.total}</td>
      </tr>
    `).join('');

    const contractDocTitle = getContractFileName(property).replace(/\.pdf$/i, '');

    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>${contractDocTitle}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800;900&family=Inter:wght@400;500;600;700&display=swap');

        @page { 
            size: A4; 
            margin: 15mm; 
        }
        * { box-sizing: border-box; }
        body { 
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
            margin: 0; padding: 20px; color: #0f172a; 
            line-height: 1.5; font-size: 12pt; 
            background-color: #f1f5f9; 
        }
        .toolbar { 
            position: fixed; top: 0; left: 0; right: 0; 
            background: #0f172a; padding: 12px; 
            display: flex; justify-content: center; gap: 15px; 
            z-index: 1000; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
        }
        .btn { 
            padding: 8px 24px; border: none; border-radius: 6px; 
            cursor: pointer; font-weight: bold; text-transform: uppercase; 
            font-size: 11pt; color: white; transition: all 0.2s ease;
            font-family: 'Inter', sans-serif;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .btn-print { background: #0d9488; }
        .btn-print:hover { background: #0f766e; transform: translateY(-1px); }
        .btn-close { background: #64748b; }
        .btn-close:hover { background: #475569; transform: translateY(-1px); }
        
        .page-sheet { 
            margin: 40px auto 20px; 
            background: white; 
            padding: 15mm 20mm; 
            max-width: 210mm; 
            min-height: 297mm;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); 
            border-radius: 4px; 
            border: 1px solid #e2e8f0; 
            box-sizing: border-box; 
            font-family: 'Inter', sans-serif; 
            font-size: 12pt; 
            line-height: 1.5; 
            color: #0f172a;
            position: relative;
        }
        .page-break {
            page-break-before: always;
            break-before: page;
        }
        .avoid-break {
            page-break-inside: avoid;
            break-inside: avoid;
        }
        .contract-logo {
            display: block;
            margin: 0 auto 10px auto;
            max-height: 70px;
            width: auto;
            object-fit: contain;
        }
        .title { 
            font-family: 'Cinzel', Georgia, serif;
            font-size: 16.5pt; 
            font-weight: 700; 
            color: #0f172a; 
            text-align: center; 
            margin-bottom: 4px; 
            text-transform: uppercase;
            line-height: 1.3;
            letter-spacing: 0.8px;
        }
        .subtitle {
            font-family: 'Inter', sans-serif;
            font-size: 9.5pt;
            font-weight: 600;
            color: #64748b;
            text-align: center;
            margin-bottom: 14px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .section-header {
            font-family: 'Cinzel', Georgia, serif;
            font-size: 12.5pt;
            font-weight: 700; 
            color: #0f172a; 
            text-transform: uppercase;
            margin-top: 14px;
            margin-bottom: 8px;
            border-left: 4px solid #0f172a;
            padding-left: 8px;
            letter-spacing: 0.5px;
            line-height: 1.2;
        }
        .grid-preambulo {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            margin-bottom: 8px;
            background: #f8fafc;
            padding: 8px 12px;
            border-radius: 6px;
            border: 1px solid #e2e8f0;
            font-family: 'Inter', sans-serif;
            font-size: 9.5pt;
            line-height: 1.35;
        }
        .grid-col {
            margin-bottom: 3px;
            font-size: 9.5pt;
            font-family: 'Inter', sans-serif;
        }
        .label {
            font-weight: 700; 
            color: #334155;
            font-size: 9.5pt;
            text-transform: uppercase;
            margin-right: 5px;
            font-family: 'Inter', sans-serif;
        }
        .value {
            color: #0f172a;
            font-size: 9.5pt;
            font-family: 'Inter', sans-serif;
        }
        .text-justify, p, .clausula-content {
            text-align: justify;
            font-size: 12pt;
            font-weight: 400;
            color: #0f172a;
            font-family: 'Inter', sans-serif;
            line-height: 1.5;
            margin-bottom: 12px;
        }
        .clausula-item {
            margin-bottom: 12px;
            font-family: 'Inter', sans-serif;
            font-size: 12pt;
            font-weight: 400;
            line-height: 1.5;
        }
        .alinea-item {
            margin-left: 20px;
            margin-top: 5px;
            text-align: justify;
            line-height: 1.5;
            font-size: 12pt;
            font-family: 'Inter', sans-serif;
        }
        .signatures-section {
            margin-top: 20px;
            page-break-inside: avoid;
            break-inside: avoid;
            font-family: 'Inter', sans-serif;
        }
        .signatures-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-top: 15px;
            page-break-inside: avoid;
            break-inside: avoid;
        }
        .signature-box {
            text-align: center;
            border-top: 1px solid #0f172a;
            padding-top: 6px;
            margin-top: 15px;
            font-size: 9.5pt;
            font-family: 'Inter', sans-serif;
            page-break-inside: avoid;
            break-inside: avoid;
        }
        .signature-title {
            font-weight: 700; 
            color: #64748b;
            text-transform: uppercase;
            font-size: 8.5pt;
            letter-spacing: 0.5px;
            font-family: 'Inter', sans-serif;
        }
        .anexo-title {
            font-family: 'Cinzel', Georgia, serif;
            font-size: 12.5pt;
            font-weight: 700; 
            color: #0f172a; 
            text-align: left;
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border-left: 4px solid #0f172a;
            padding-left: 8px;
        }
        table.table-dados {
            width: 100%;
            border-collapse: collapse;
            margin-top: 4px;
            margin-bottom: 8px;
            font-family: 'Inter', sans-serif;
            font-size: 9.5pt;
        }
        table.table-dados th {
            background: #0f172a;
            color: #ffffff;
            font-weight: 700;
            font-size: 8.5pt;
            text-transform: uppercase;
            padding: 5px 8px;
            border: 1px solid #cbd5e1;
            text-align: left;
        }
        table.table-dados td {
            padding: 4px 8px;
            border: 1px solid #cbd5e1;
            font-size: 9.5pt;
            color: #0f172a;
            text-align: left;
        }
        table.rateio-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 6px;
            font-family: 'Inter', sans-serif;
            font-size: 7.5pt;
        }
        table.rateio-table th.th-apelido {
            text-align: right;
            border: 1px solid #334155;
            background: #0f172a;
            color: #38bdf8; /* Azul Céu */
            font-weight: 800;
            text-transform: uppercase;
            font-size: 8.5pt;
            padding: 4px 6px;
            white-space: nowrap;
        }
        table.rateio-table th.th-cargo {
            text-align: right;
            border: 1px solid #475569;
            background: #1e293b;
            color: #e2e8f0;
            font-weight: 600;
            font-size: 7.5pt;
            padding: 4px 6px;
            white-space: nowrap;
        }
        table.rateio-table th.th-main {
            border: 1px solid #334155;
            background: #0f172a;
            color: #ffffff;
            font-weight: 700;
            font-size: 8pt;
            padding: 4px 6px;
            white-space: nowrap;
        }
        table.rateio-table td.td-num {
            text-align: right;
            font-family: 'Inter', sans-serif;
            font-size: 7.5pt;
            white-space: nowrap;
            border: 1px solid #cbd5e1;
            padding: 3px 6px;
            color: #0f172a;
        }
        table.rateio-table td.td-date {
            text-align: center;
            font-family: 'Inter', sans-serif;
            font-size: 7.5pt;
            white-space: nowrap;
            border: 1px solid #cbd5e1;
            padding: 3px 6px;
            color: #0f172a;
        }
        table.rateio-table tfoot tr {
            background: #f1f5f9;
            font-weight: bold;
            border-top: 2px solid #0f172a;
            font-size: 7.5pt;
        }
        @media print {
            body { background: white; padding: 0; }
            .toolbar { display: none !important; }
            .page-sheet { 
                margin: 0 !important; 
                padding: 0 !important; 
                box-shadow: none !important; 
                border: none !important; 
                max-width: 100% !important; 
                width: 100% !important; 
                min-height: auto !important; 
            }
            .page-break {
                page-break-before: always !important;
                break-before: page !important;
            }
        }
    </style>
</head>
<body>
    <div class="toolbar">
        <button class="btn btn-print" onclick="window.print()">Imprimir / Salvar em PDF</button>
        <button class="btn btn-close" onclick="window.close()">Fechar</button>
    </div>

    <!-- PÁGINA 1: IDENTIFICAÇÃO, OBJETO E EQUIPE -->
    <div class="page-sheet page-1">
        <div style="text-align: center; margin-bottom: 8px;" class="avoid-break">
            <img src="LOGORJ.png" alt="R&J Imóveis" class="contract-logo" onerror="this.onerror=null; this.src='/LOGORJ.png';">
        </div>
        <div class="title">${contractModel.titulo}</div>
        <div class="subtitle">CONTRATO DE INTERMEDIAÇÃO E RATEIO DE HONORÁRIOS DE CORRETAGEM IMOBILIÁRIA</div>

        <div class="section-header">I - QUALIFICAÇÃO DAS PARTES</div>
        
        <div style="font-size: 10pt; font-weight: 700; margin-top: 6px; margin-bottom: 4px; color: #0f172a; text-transform: uppercase;">
            1. ${contractModel.preambulo.contratantes.length > 1 ? 'CONTRATANTES (PROPONENTES COMPRADORES)' : 'CONTRATANTE (PROPONENTE COMPRADOR)'}
        </div>
        ${contractModel.preambulo.contratantes.map((c, idx) => `
            ${contractModel.preambulo.contratantes.length > 1 ? `
                <div style="font-size: 9.5pt; font-weight: 700; color: #0f172a; margin-top: ${idx > 0 ? '6px' : '2px'}; margin-bottom: 4px; padding: 2px 6px; background: #f1f5f9; border-left: 3px solid #0f172a; border-radius: 2px;">
                    COMPRADOR ${idx + 1}: ${c.nome_completo}
                </div>
            ` : ''}
            <div class="grid-preambulo" style="${contractModel.preambulo.contratantes.length > 1 && idx > 0 ? 'margin-top: 2px;' : ''}">
                <div>
                    <div class="grid-col"><span class="label">Nome Completo:</span><span class="value">${c.nome_completo}</span></div>
                    <div class="grid-col"><span class="label">Nacionalidade:</span><span class="value">${c.nacionalidade}</span></div>
                    <div class="grid-col"><span class="label">Estado Civil:</span><span class="value">${c.estado_civil}</span></div>
                    <div class="grid-col"><span class="label">Profissão:</span><span class="value">${c.profissao}</span></div>
                    <div class="grid-col"><span class="label">RG:</span><span class="value">${c.rg}</span></div>
                </div>
                <div>
                    <div class="grid-col"><span class="label">CPF:</span><span class="value">${c.cpf}</span></div>
                    <div class="grid-col"><span class="label">CEP:</span><span class="value">${c.cep}</span></div>
                    <div class="grid-col"><span class="label">Endereço:</span><span class="value">${c.endereco_completo}</span></div>
                    <div class="grid-col"><span class="label">Telefone:</span><span class="value">${c.telefone}</span></div>
                    <div class="grid-col"><span class="label">E-mail:</span><span class="value">${c.email}</span></div>
                </div>
            </div>
        `).join('')}

        <div style="font-size: 10pt; font-weight: 700; margin-top: 6px; margin-bottom: 4px; color: #0f172a; text-transform: uppercase;">2. CONTRATADA (INTERMEDIADORA)</div>
        <div class="grid-preambulo">
            <div>
                <div class="grid-col"><span class="label">Razão Social:</span><span class="value">${contractModel.preambulo.contratada.razao_social}</span></div>
                <div class="grid-col"><span class="label">Nome Fantasia:</span><span class="value">${contractModel.preambulo.contratada.nome_fantasia}</span></div>
                <div class="grid-col"><span class="label">CNPJ:</span><span class="value">${contractModel.preambulo.contratada.cnpj}</span></div>
            </div>
            <div>
                <div class="grid-col"><span class="label">CRECI:</span><span class="value">${contractModel.preambulo.contratada.creci}</span></div>
                <div class="grid-col"><span class="label">Endereço:</span><span class="value">${contractModel.preambulo.contratada.endereco_completo}</span></div>
                <div class="grid-col"><span class="label">CEP:</span><span class="value">${contractModel.preambulo.contratada.cep}</span></div>
            </div>
        </div>

        <div class="section-header">II - OBJETO DO IMÓVEL</div>
        <div class="grid-preambulo" style="grid-template-columns: 1fr;">
            <div>
                <div class="grid-col" style="margin: 0 0 3px 0;"><span class="label">Objeto da Intermediação:</span><span class="value">${contractModel.preambulo.objeto.identificacao}</span></div>
                <div class="grid-col" style="margin: 0;"><span class="label">Endereço do Empreendimento:</span><span class="value">${contractModel.preambulo.objeto.endereco}</span></div>
            </div>
        </div>

        <div class="section-header">III - EQUIPE DE VENDAS</div>
        <div style="font-size: 9.5pt; font-weight: 700; color: #0f172a; margin-top: 6px; margin-bottom: 4px; text-transform: uppercase;">
            Credenciais dos Participantes na Venda (Rateio)
        </div>
        <table class="table-dados">
            <thead>
                <tr>
                    <th style="width: 16%;">Apelido</th>
                    <th style="width: 34%;">Nome Completo ou Razão Social</th>
                    <th style="width: 20%;">CPF / CNPJ</th>
                    <th style="width: 14%;">CRECI</th>
                    <th style="width: 16%;">Função / Cargo</th>
                </tr>
            </thead>
            <tbody>
                ${contractModel.preambulo.corretores_associados.length === 0 ? `
                    <tr><td colspan="5" style="text-align: center; font-style: italic; color: #64748b;">Participação concentrada integralmente na Imobiliária Contratada.</td></tr>
                ` : contractModel.preambulo.corretores_associados.map(c => `
                    <tr>
                        <td><b>${c.apelido}</b></td>
                        <td>${c.nome_completo}</td>
                        <td style="font-family: monospace;">${c.cpf_cnpj}</td>
                        <td style="font-family: monospace;">${c.creci}</td>
                        <td>${c.cargo}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>

    <!-- PÁGINA 2: CLÁUSULAS CONTRATUAIS (CLÁUSULAS 1 A 8) -->
    <div class="page-sheet page-break page-2">
        <div class="section-header" style="margin-top: 0; margin-bottom: 14px;">IV - CLÁUSULAS CONTRATUAIS</div>
        ${contractModel.clausulas.slice(0, 8).map(c => `
            <div class="clausula-item">
                <div class="text-justify" style="margin-bottom: ${c.subitens ? '6px' : '0'};">
                    <strong style="color: #0f172a;">${c.numero}.</strong> ${c.texto}
                </div>
                ${c.subitens ? `
                    <div style="padding-left: 20px; margin-top: 5px;">
                        ${c.subitens.map(sub => `
                            <div class="alinea-item">${sub}</div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `).join('')}
    </div>

    <!-- PÁGINA 3: CONTINUAÇÃO DE CLÁUSULAS E ASSINATURAS -->
    <div class="page-sheet page-break page-3">
        <div class="section-header" style="margin-top: 0; margin-bottom: 14px;">IV - CLÁUSULAS CONTRATUAIS (CONTINUAÇÃO)</div>
        ${contractModel.clausulas.slice(8).map(c => `
            <div class="clausula-item">
                <div class="text-justify" style="margin-bottom: ${c.subitens ? '6px' : '0'};">
                    <strong style="color: #0f172a;">${c.numero}.</strong> ${c.texto}
                </div>
                ${c.subitens ? `
                    <div style="padding-left: 20px; margin-top: 5px;">
                        ${c.subitens.map(sub => `
                            <div class="alinea-item">${sub}</div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `).join('')}

        <div class="section-header">V - DOS VALORES, RATEIO E COMISSÕES (PLANILHA ANEXA)</div>
        <div style="margin-bottom: 15px; font-size: 12pt; line-height: 1.5; text-align: justify; color: #334155;">
            Os valores da intermediação imobiliária, retenções contratuais, cronograma de desembolso e amortização da comissão devida aos participantes da venda qualificados no Item III encontram-se integralmente descritos e discriminados nos <strong>Anexos I e II</strong>, que integram o presente contrato para todos os efeitos de direito.
        </div>

        <div class="section-header">VI - DAS ASSINATURAS</div>
        <div class="signatures-section avoid-break">
            <div style="text-align: justify; font-size: 11pt; color: #0f172a; margin-bottom: 8px;">
                ${isNFRepasse ? 'E, por estarem as partes justas e contratadas, assinam o presente Contrato de Corretagem Imobiliária eletronicamente na presença de 2 (duas) testemunhas.' : 'E, por estarem as partes justas e contratadas, assinam o presente contrato.'}
            </div>
            
            <div style="text-align: center; margin: 10px 0 14px 0; font-weight: 700; font-size: 10.5pt; color: #0f172a; text-transform: uppercase;">
                ${contractModel.assinaturas.data_local}
            </div>

            <div style="font-size: 9.5pt; font-weight: 700; text-transform: uppercase; color: #334155; margin-bottom: 4px;">Contratantes e Imobiliária Contratada:</div>
            <div class="signatures-grid">
                ${contractModel.preambulo.contratantes.map((c, idx) => `
                    <div class="signature-box">
                        <div style="font-weight: 700; margin-bottom: 2px; color: #0f172a; font-size: 10pt;">${c.nome_completo}</div>
                        <div class="signature-title">${contractModel.preambulo.contratantes.length > 1 ? `CONTRATANTE / COMPRADOR ${idx + 1}` : 'CONTRATANTE / PROPONENTE COMPRADOR'}</div>
                        <div style="font-size: 9pt; color: #475569; margin-top: 2px;">CPF: ${c.cpf}</div>
                    </div>
                `).join('')}
                <div class="signature-box">
                    <div style="font-weight: 700; margin-bottom: 2px; color: #0f172a; font-size: 10pt;">${contractModel.assinaturas.contratada}</div>
                    <div class="signature-title">CONTRATADA / IMOBILIÁRIA</div>
                    <div style="font-size: 9pt; color: #475569; margin-top: 2px;">CNPJ: ${contractModel.preambulo.contratada.cnpj} - CRECI: ${contractModel.preambulo.contratada.creci}</div>
                </div>
                ${(contractModel.preambulo.contratantes.length + 1) % 2 !== 0 ? `
                    <div class="signature-box" style="border: none; margin-top: 15px;"></div>
                ` : ''}
            </div>

            ${contractModel.preambulo.corretores_associados.length > 0 ? `
            <div style="font-size: 9.5pt; font-weight: 700; text-transform: uppercase; color: #334155; margin-top: 16px; margin-bottom: 4px;">Participantes da Venda / Equipe de Vendas (Item III):</div>
            <div class="signatures-grid">
                ${contractModel.preambulo.corretores_associados.map(c => `
                    <div class="signature-box">
                        <div style="font-weight: 700; margin-bottom: 2px; color: #0f172a; font-size: 10pt;">${c.nome_completo}</div>
                        <div class="signature-title">${c.cargo}</div>
                        <div style="font-size: 9pt; color: #475569; margin-top: 2px;">CPF/CNPJ: ${c.cpf_cnpj}${c.creci && !c.creci.includes('____') ? ` - CRECI: ${c.creci}` : ''}</div>
                    </div>
                `).join('')}
                ${contractModel.preambulo.corretores_associados.length % 2 !== 0 ? `
                    <div class="signature-box" style="border: none; margin-top: 15px;"></div>
                ` : ''}
            </div>
            ` : ''}

            <div style="font-size: 9.5pt; font-weight: 700; text-transform: uppercase; color: #334155; margin-top: 16px; margin-bottom: 4px;">Testemunhas Instrumentárias:</div>
            <div class="signatures-grid" style="margin-top: 6px;">
                ${contractModel.assinaturas.testemunhas.map(t => `
                    <div class="signature-box" style="border-top: 1px solid #0f172a; margin-top: 0;">
                        <div style="font-weight: 700; margin-bottom: 2px; color: #0f172a; font-size: 10pt;">Testemunha ${t.numero}</div>
                        <div class="signature-title">TESTEMUNHA INSTRUMENTÁRIA</div>
                        <div style="font-size: 9pt; color: #475569;">CPF: ${t.cpf}</div>
                    </div>
                `).join('')}
            </div>
        </div>
    </div>

    <!-- PÁGINA 4: ANEXOS I E II -->
    <div class="page-sheet page-break page-4">
        <div class="anexo-title" style="margin-top: 0;">ANEXO I - RESUMO DA PROPOSTA E COMISSÕES</div>
        
        <div style="margin-bottom: 10px; background: #f8fafc; padding: 10px 14px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 9.5pt; line-height: 1.4;">
            <div style="margin-bottom: 4px;"><strong style="text-transform: uppercase; font-size: 9pt; font-weight: 700; color: #334155; letter-spacing: 0.3px;">Dados do Cliente:</strong> <span style="color: #0f172a;">${contractModel.anexo_i.dados_do_cliente.nome} — CPF: ${contractModel.anexo_i.dados_do_cliente.cpf}</span></div>
            <div style="margin-bottom: 4px;"><strong style="text-transform: uppercase; font-size: 9pt; font-weight: 700; color: #334155; letter-spacing: 0.3px;">Dados do Objeto:</strong> <span style="color: #0f172a;">${contractModel.anexo_i.dados_do_objeto.identificacao}</span></div>
            <div><strong style="text-transform: uppercase; font-size: 9pt; font-weight: 700; color: #334155; letter-spacing: 0.3px;">Endereço do Empreendimento:</strong> <span style="color: #0f172a;">${contractModel.preambulo.objeto.endereco}</span></div>
        </div>

        <!-- Resumo de Valores -->
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 14px;">
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 12px; border-radius: 6px;">
                <div style="font-size: 9pt; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Valor Total da Proposta</div>
                <div style="font-size: 12pt; font-weight: 700; color: #0f172a;">${formattedTotalProposta}</div>
            </div>
            <div style="background: #fffbeb; border: 1px solid #fde68a; padding: 10px 12px; border-radius: 6px;">
                <div style="font-size: 9pt; font-weight: 700; color: #b45309; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Valor Total das Comissões</div>
                <div style="font-size: 12pt; font-weight: 700; color: #b45309;">${formattedTotalComissoes}</div>
            </div>
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 10px 12px; border-radius: 6px;">
                <div style="font-size: 9pt; font-weight: 700; color: #166534; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Valor Total do Imóvel</div>
                <div style="font-size: 12pt; font-weight: 700; color: #166534;">${formattedTotalImovel}</div>
                <div style="font-size: 8pt; color: #15803d; margin-top: 2px;">(Proposta - Comissões)</div>
            </div>
        </div>

        <!-- ANEXO II -->
        <div class="anexo-title" style="margin-top: 14px; margin-bottom: 8px;">ANEXO II - DETALHAMENTO DE RATEIO CRONOLÓGICO REAL</div>
        
        <div style="margin-bottom: 10px; background: #f8fafc; padding: 8px 12px; border-radius: 6px; border: 1px solid #cbd5e1; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; font-size: 9.5pt;">
            <div><strong style="text-transform: uppercase; font-size: 8pt; font-weight: 700; color: #475569; letter-spacing: 0.3px; display: block;">Empreendimento</strong> <span style="font-weight: 700; color: #0f172a;">${property.empreendimento || "-"}</span></div>
            <div><strong style="text-transform: uppercase; font-size: 8pt; font-weight: 700; color: #475569; letter-spacing: 0.3px; display: block;">Unidade / Torre</strong> <span style="font-weight: 700; color: #0f172a;">${property.unidade || "-"} / ${property.torre || "-"}</span></div>
            <div><strong style="text-transform: uppercase; font-size: 8pt; font-weight: 700; color: #475569; letter-spacing: 0.3px; display: block;">Comissão Global</strong> <span style="font-weight: 700; color: #0f172a;">${(data as any).percentualComissao !== undefined ? (data as any).percentualComissao : percentualComissao}% (${formatCurrency(contractWaterfall.comissaoTotal)})</span></div>
        </div>

        ${(() => {
          let runningSum = 0;
          const visibleParcelas = [];
          for (let idx = 0; idx < contractWaterfall!.detalhesParcelas.length; idx++) {
            const det = contractWaterfall!.detalhesParcelas[idx];
            const correspondingSimFluxo = (sim && idx < sim.fluxo.length && contractWaterfall!.detalhesParcelas.length > 1)
              ? sim.fluxo[idx]
              : null;

            const vencimentoToShow = det.vencimento || (correspondingSimFluxo ? correspondingSimFluxo.vencimento : '');
            const valorComissaoToShow = (det.valorRetido > 0 || (data as any).manual_waterfall)
              ? det.valorRetido
              : (correspondingSimFluxo ? Number((correspondingSimFluxo.valorTotal - correspondingSimFluxo.valorLiquido).toFixed(2)) : det.valorRetido);

            if (valorComissaoToShow > 0) {
              visibleParcelas.push({
                ...det,
                vencimentoToShow,
                valorComissaoToShow
              });
            }
            runningSum = Number((runningSum + valorComissaoToShow).toFixed(2));
            if (runningSum >= contractWaterfall!.comissaoTotal - 0.01 && contractWaterfall!.comissaoTotal > 0) {
              break;
            }
          }

          const totalComissaoLinhas = visibleParcelas.reduce((acc, d) => acc + d.valorComissaoToShow, 0);

          return `
            <table class="rateio-table">
                <thead>
                    <tr>
                        <th style="border: 1px solid #334155; background: #0f172a;" colspan="2"></th>
                        ${contractWaterfall!.participantes.map(p => {
                          const apelido = getParticipantApelido(p.name, corretores) || (p.role?.toLowerCase().includes('imobili') ? 'R&J' : (p.name ? p.name.split(' ')[0] : ''));
                          return `
                            <th class="th-apelido">
                              ${apelido || p.role}
                            </th>
                          `;
                        }).join('')}
                    </tr>
                    <tr>
                        <th class="th-main" style="text-align: right;">
                            VALOR
                        </th>
                        <th class="th-main" style="text-align: center;">
                            VENCIMENTO
                        </th>
                        ${contractWaterfall!.participantes.map(p => `
                          <th class="th-cargo">
                            ${p.role}
                          </th>
                        `).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${visibleParcelas.map((det) => `
                      <tr>
                        <td class="td-num" style="font-weight: 700;">
                          ${formatCurrency(det.valorComissaoToShow)}
                        </td>
                        <td class="td-date">
                          ${det.vencimentoToShow}
                        </td>
                        ${contractWaterfall!.participantes.map(p => {
                          const label = p.name ? `${p.role} - ${p.name}` : p.role;
                          const val = det.distribuicao[label] || 0;
                          return `
                            <td class="td-num">
                              ${formatCurrency(val)}
                            </td>
                          `;
                        }).join('')}
                      </tr>
                    `).join('')}
                </tbody>
                <tfoot>
                    <tr>
                        <td class="td-num" style="font-weight: 700; color: #0f172a;">
                          ${formatCurrency(totalComissaoLinhas)}
                        </td>
                        <td class="td-date" style="font-weight: 700; color: #0f172a;">
                          TOTAL
                        </td>
                        ${contractWaterfall!.participantes.map(p => {
                          const label = p.name ? `${p.role} - ${p.name}` : p.role;
                          const totalCol = visibleParcelas.reduce((sum, det) => sum + (det.distribuicao[label] || 0), 0);
                          return `
                            <td class="td-num" style="color: #166534; font-weight: 700;">
                              ${formatCurrency(totalCol)}
                            </td>
                          `;
                        }).join('')}
                    </tr>
                </tfoot>
            </table>
          `;
        })()}

        <!-- Credenciais dos Participantes na Venda (Rateio) -->
        <div class="avoid-break" style="margin-top: 12px;">
            <div style="font-size: 9pt; font-weight: 700; text-transform: uppercase; color: #334155; margin-bottom: 4px; letter-spacing: 0.3px; font-family: 'Inter', sans-serif;">
                Credenciais dos Participantes na Venda (Rateio)
            </div>
            <table class="table-dados" style="font-size: 8.5pt;">
                <thead>
                    <tr>
                        <th style="text-align: left; width: 16%;">Apelido</th>
                        <th style="text-align: left; width: 34%;">Nome Completo ou Razão Social</th>
                        <th style="text-align: left; width: 20%;">CPF / CNPJ</th>
                        <th style="text-align: left; width: 14%;">CRECI</th>
                        <th style="text-align: left; width: 16%;">Cargo na Operação</th>
                    </tr>
                </thead>
                <tbody>
                    ${corretores.length === 0 
                      ? `<tr><td colspan="5" style="text-align: center; color: #94a3b8; font-style: italic; font-size: 8.5pt;">Nenhum participante associado a esta venda.</td></tr>`
                      : corretores.map(part => `
                        <tr>
                            <td style="font-size: 8.5pt;"><strong>${part.apelido}</strong></td>
                            <td style="font-size: 8.5pt;">${part.nome_completo}</td>
                            <td style="font-family: monospace; font-size: 8.5pt;">${part.cpf_cnpj}</td>
                            <td style="font-family: monospace; font-size: 8.5pt;">${part.creci}</td>
                            <td style="font-size: 8.5pt;"><span style="background: #eef2ff; color: #4338ca; padding: 1px 5px; border-radius: 3px; font-weight: 600; font-size: 8pt;">${part.cargo}</span></td>
                        </tr>
                      `).join('')}
                </tbody>
            </table>
        </div>
    </div>
</body>
</html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
    }
  };

  const generatePDF = (data = result) => {
    if (!data) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Title
    doc.setFontSize(16);
    doc.setTextColor(20, 20, 20);
    doc.text("PROPOSTA COMERCIAL DE COMPRA E VENDA DE IMÓVEL", pageWidth / 2, 20, { align: "center" });

    // Property Data
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("DADOS DO IMÓVEL", 14, 35);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Empreendimento: ${data.property?.empreendimento || "-"}`, 14, 42);
    doc.text(`Unidade: ${data.property?.unidade || "-"}`, 14, 47);
    doc.text(`Torre/Bloco: ${data.property?.torre || "-"}`, 14, 52);

    // Sales Team
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("EQUIPE DE VENDAS", 14, 65);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Corretor 1: ${data.salesTeam?.corretor1 || "-"}`, 14, 72);
    doc.text(`Corretor 2: ${data.salesTeam?.corretor2 || "-"}`, 14, 77);

    // Customers Data
    const customers = (data.customers || [(data as any).customer]).filter(Boolean);
    let y = 90;
    
    customers.forEach((customer: any, index: number) => {
      if (y > 250) {
        doc.addPage();
        y = 20;
      }
      
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(`DADOS DO COMPRADOR ${index + 1}`, 14, y); y += 7;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Nome: ${customer.nome || "-"}`, 14, y); y += 5;
      doc.text(`CPF: ${customer.cpf || "-"}`, 14, y); y += 5;
      doc.text(`Telefone: ${customer.telefone || "-"}`, 14, y); y += 5;
      doc.text(`Email: ${customer.email || "-"}`, 14, y); y += 5;
      doc.text(`Data de Nascimento: ${customer.dataNascimento || "-"}`, 14, y); y += 5;
      doc.text(`RG: ${customer.rgNumero || "-"} (${customer.rgOrgao || "-"}) - Exp: ${customer.rgDataExpedicao || "-"}`, 14, y); y += 5;
      doc.text(`Estado Civil: ${customer.estadoCivil || "-"}`, 14, y); y += 5;
      doc.text(`Profissão: ${customer.profissao || "-"}`, 14, y); y += 5;
      doc.text(`Naturalidade: ${customer.naturalidade || "-"} / Nacionalidade: ${customer.nacionalidade || "-"}`, 14, y); y += 10;
    });

    // Address
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("ENDEREÇO", 14, y); y += 7;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`CEP: ${data.address?.cep || "-"}`, 14, y); y += 5;
    doc.text(`Logradouro: ${data.address?.logradouro || "-"}, ${data.address?.numero || "-"} ${data.address?.complemento ? "- " + data.address.complemento : ""}`, 14, y); y += 5;
    doc.text(`Bairro: ${data.address?.bairro || "-"}`, 14, y); y += 5;
    doc.text(`Cidade/Estado: ${data.address?.cidade || "-"} / ${data.address?.estado || "-"}`, 14, y); y += 10;

    // Payments Table
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("PROPOSTA COMERCIAL", 14, y); y += 5;
    
    const tableData = data.payments.map((p: any) => [
      p.quantidade,
      p.tipo,
      p.valorUnitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      p.vencimento,
      p.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Qtd', 'Tipo de Parcela', 'Valor Unitário', 'Vencimento', 'Valor Total']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229] }, // Indigo 600
      styles: { fontSize: 9 }
    });

    // Add Total Value summary
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    const totalValue = data.valorTotalProposta || data.payments.reduce((acc: number, p: any) => acc + (p.valorTotal || 0), 0);
    doc.text(`VALOR TOTAL DA PROPOSTA: ${totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, 14, finalY);

    doc.save(`proposta_comercial_${data.property.unidade}.pdf`);
  };

  const exportRateioToCSV = (waterfall: WaterfallResult | null) => {
    if (!waterfall || !result) return;

    const activeParticipants = waterfall.participantes;
    const participantLabels = activeParticipants.map(p => p.name ? `${p.role} - ${p.name}` : p.role);

    const headers = [
      "Data de Vencimento",
      "Valor de Comissão da Parcela",
      ...participantLabels
    ].join(';');

    let runningSum = 0;
    const visibleParcelas = [];
    for (let idx = 0; idx < waterfall.detalhesParcelas.length; idx++) {
      const det = waterfall.detalhesParcelas[idx];
      const correspondingSimFluxo = (simulationResult && idx < simulationResult.fluxo.length && waterfall.detalhesParcelas.length > 1)
        ? simulationResult.fluxo[idx]
        : null;

      const vencimentoToShow = correspondingSimFluxo ? correspondingSimFluxo.vencimento : det.vencimento;
      const valorComissaoToShow = correspondingSimFluxo 
        ? Number((correspondingSimFluxo.valorTotal - correspondingSimFluxo.valorLiquido).toFixed(2)) 
        : det.valorRetido;

      if (valorComissaoToShow > 0) {
        visibleParcelas.push({
          ...det,
          vencimentoToShow,
          valorComissaoToShow
        });
      }
      runningSum = Number((runningSum + valorComissaoToShow).toFixed(2));
      if (runningSum >= waterfall.comissaoTotal - 0.01 && waterfall.comissaoTotal > 0) {
        break;
      }
    }

    const rows = visibleParcelas.map(det => {
      const line = [
        det.vencimentoToShow,
        det.valorComissaoToShow.toFixed(2),
        ...activeParticipants.map(p => {
          const label = p.name ? `${p.role} - ${p.name}` : p.role;
          const val = det.distribuicao[label] || 0;
          return val.toFixed(2);
        })
      ];
      return line.join(';');
    });

    const csvContent = "\uFEFF" + [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `relatorio_rateio_${result.property.unidade || "unidade"}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportRateioToICS = (waterfall: WaterfallResult | null) => {
    if (!waterfall || !result) return;

    let runningSum = 0;
    const visibleParcelas = [];
    for (let idx = 0; idx < waterfall.detalhesParcelas.length; idx++) {
      const det = waterfall.detalhesParcelas[idx];
      const correspondingSimFluxo = (simulationResult && idx < simulationResult.fluxo.length && waterfall.detalhesParcelas.length > 1)
        ? simulationResult.fluxo[idx]
        : null;

      const vencimentoToShow = correspondingSimFluxo ? correspondingSimFluxo.vencimento : det.vencimento;
      const valorComissaoToShow = correspondingSimFluxo 
        ? Number((correspondingSimFluxo.valorTotal - correspondingSimFluxo.valorLiquido).toFixed(2)) 
        : det.valorRetido;

      if (valorComissaoToShow > 0) {
        visibleParcelas.push({
          ...det,
          vencimentoToShow,
          valorComissaoToShow
        });
      }
      runningSum = Number((runningSum + valorComissaoToShow).toFixed(2));
      if (runningSum >= waterfall.comissaoTotal - 0.01 && waterfall.comissaoTotal > 0) {
        break;
      }
    }

    if (visibleParcelas.length === 0) {
      alert("Nenhuma parcela de comissão com valor maior que zero foi encontrada.");
      return;
    }

    const formatCurrency = (val: number) => {
      return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    const empreendimento = result.property.empreendimento || "Imóvel";
    const unidade = result.property.unidade || "";
    const torre = result.property.torre || "";
    const locInfo = unidade ? `Unidade ${unidade}${torre ? ` - Torre ${torre}` : ''}` : '';

    let icsLines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//SISTEMA REJ//PROPOSTAS REJ//PT",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH"
    ];

    visibleParcelas.forEach((det, idx) => {
      let d: Date;
      const cleanDate = det.vencimentoToShow.trim();
      if (cleanDate.includes('/')) {
        const parts = cleanDate.split('/');
        if (parts.length === 3) {
          const day = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10);
          const year = parseInt(parts[2], 10);
          d = new Date(year, month - 1, day);
        } else {
          d = new Date(cleanDate);
        }
      } else if (cleanDate.includes('-')) {
        const parts = cleanDate.split('-');
        if (parts.length === 3) {
          const year = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10);
          const day = parseInt(parts[2], 10);
          d = new Date(year, month - 1, day);
        } else {
          d = new Date(cleanDate);
        }
      } else {
        d = new Date(cleanDate);
      }

      if (isNaN(d.getTime())) {
        return;
      }

      const startYear = d.getFullYear();
      const startMonth = String(d.getMonth() + 1).padStart(2, '0');
      const startDay = String(d.getDate()).padStart(2, '0');
      const dtstart = `${startYear}${startMonth}${startDay}`;

      d.setDate(d.getDate() + 1);
      const endYear = d.getFullYear();
      const endMonth = String(d.getMonth() + 1).padStart(2, '0');
      const endDay = String(d.getDate()).padStart(2, '0');
      const dtend = `${endYear}${endMonth}${endDay}`;

      const parcelNum = idx + 1;
      const summary = `Comissão - Parc. ${parcelNum} - ${empreendimento}`;
      
      let descLines = [];
      descLines.push(`Vencimento: ${det.vencimentoToShow}`);
      descLines.push(`Valor de Comissão da Parcela: ${formatCurrency(det.valorComissaoToShow)}`);
      descLines.push(`Empreendimento: ${empreendimento}`);
      if (locInfo) descLines.push(locInfo);
      
      descLines.push(`\\nDistribuição dos Cargos:`);
      Object.entries(det.distribuicao).forEach(([role, val]) => {
        const valueNum = Number(val) || 0;
        if (valueNum > 0) {
          descLines.push(`- ${role}: ${formatCurrency(valueNum)}`);
        }
      });

      const description = descLines.join("\\n");
      const uid = `comissao-parc-${parcelNum}-${dtstart}-${Math.random().toString(36).substr(2, 9)}@sistemarej.com`;

      icsLines.push("BEGIN:VEVENT");
      icsLines.push(`UID:${uid}`);
      icsLines.push(`DTSTAMP:${dtstart}T000000Z`);
      icsLines.push(`DTSTART;VALUE=DATE:${dtstart}`);
      icsLines.push(`DTEND;VALUE=DATE:${dtend}`);
      icsLines.push(`SUMMARY:${summary}`);
      icsLines.push(`DESCRIPTION:${description}`);
      if (locInfo) {
        icsLines.push(`LOCATION:${empreendimento}, ${locInfo}`);
      } else {
        icsLines.push(`LOCATION:${empreendimento}`);
      }
      icsLines.push("END:VEVENT");
    });

    icsLines.push("END:VCALENDAR");

    const icsContent = icsLines.join("\r\n");
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `calendario_comissoes_${result.property.unidade || "unidade"}.ics`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportRateioToWebropay = async (waterfall: WaterfallResult | null) => {
    if (!result) {
      alert("Nenhuma proposta carregada para exportação.");
      return;
    }

    let targetWaterfall = waterfall;
    if (!targetWaterfall) {
      const sumExcluded = (result.payments || [])
        .filter(p => isExcludedFromCommissionBase(p.tipo))
        .reduce((acc, p) => acc + (p.valorTotal || 0), 0);
      const sumAllParcelas = (result.payments || []).reduce((acc, p) => acc + (p.valorTotal || 0), 0);
      const baseVendaTotal = Math.max(0, (sumAllParcelas > 0 ? sumAllParcelas : (result.valorTotalProposta || 0)) - sumExcluded);
      const currentEmp = empreendimentos.find(e => e.nome === result.property.empreendimento);

      targetWaterfall = calcularRateioCascata(
        baseVendaTotal,
        percentualComissao,
        (simulationResult?.fluxo || result.payments),
        result.forma_pagamento_comissao,
        commissionedParties,
        currentEmp?.regras_comissao
      );
    }

    try {
      setIsExportingWebropay(true);
      await generateWebropayExcel({
        proposal: result,
        waterfall: targetWaterfall,
        cargos,
        simulacaoFluxo: simulationResult?.fluxo,
      });
      showToast("Planilha Webropay (.xlsx) gerada com sucesso!", "success");
    } catch (err: any) {
      console.error("Erro ao gerar planilha Webropay:", err);
      alert("Erro ao gerar planilha Webropay: " + (err.message || err));
    } finally {
      setIsExportingWebropay(false);
    }
  };

  const printRateio = (waterfall: WaterfallResult | null) => {
    if (!waterfall || !result) return;

    const formatCurrency = (val: number) => {
      return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    const activeParticipants = waterfall.participantes;
    
    // Compilar dados de credenciais para a impressão
    const activeParticipantsList: Array<{
      nome: string;
      apelido: string;
      cpf: string;
      creci: string;
      cargo: string;
    }> = [];

    const activeParties = (commissionedParties || []).filter((p: any) => {
      if (p.hideAndSum) return false;
      const rLower = (p.role || '').toLowerCase().trim();
      if (rLower === 'imobiliária' || rLower === 'imobiliaria') return false;
      return p.name && p.name.trim() !== '' && !p.name.includes('___');
    });

    activeParties.forEach((p: any) => {
      const names = p.name.split(',');
      names.forEach((n: string) => {
        const nameTrimmed = n.trim();
        if (!nameTrimmed) return;

        const existing = activeParticipantsList.find(ap => ap.nome.toLowerCase().trim() === nameTrimmed.toLowerCase());
        if (existing) {
          const currentRoles = existing.cargo.split(',').map((r: string) => r.trim().toLowerCase());
          if (p.role && !currentRoles.includes(p.role.trim().toLowerCase())) {
            existing.cargo = `${existing.cargo}, ${p.role.trim()}`;
          }
          return;
        }

        const match = cargos.find(c => 
          (c.nome && c.nome.toLowerCase().trim() === nameTrimmed.toLowerCase()) ||
          (c.apelido && c.apelido.toLowerCase().trim() === nameTrimmed.toLowerCase())
        ) || cargos.find(c => 
          c.nome && c.nome.toLowerCase().trim().startsWith(nameTrimmed.toLowerCase())
        );

        if (match) {
          activeParticipantsList.push({
            nome: match.nome,
            apelido: match.apelido || nameTrimmed.split(' ')[0],
            cpf: match.cpf_cnpj || '-',
            creci: match.creci || '-',
            cargo: p.role || match.cargo
          });
        } else {
          activeParticipantsList.push({
            nome: nameTrimmed,
            apelido: nameTrimmed.split(' ')[0],
            cpf: '-',
            creci: '-',
            cargo: p.role
          });
        }
      });
    });

    const printParticipantsHtml = activeParticipantsList.length === 0 
      ? `<tr><td colspan="5" style="text-align: center; font-style: italic;">Nenhum participante associado a esta venda.</td></tr>`
      : activeParticipantsList.map(part => `
        <tr>
          <td><b>${part.nome}</b></td>
          <td>${part.apelido}</td>
          <td>${part.cpf}</td>
          <td>${part.creci}</td>
          <td>${part.cargo}</td>
        </tr>
      `).join('');

    let runningSum = 0;
    const visibleParcelas = [];
    for (let idx = 0; idx < waterfall.detalhesParcelas.length; idx++) {
      const det = waterfall.detalhesParcelas[idx];
      const correspondingSimFluxo = (simulationResult && idx < simulationResult.fluxo.length && waterfall.detalhesParcelas.length > 1)
        ? simulationResult.fluxo[idx]
        : null;

      const vencimentoToShow = correspondingSimFluxo ? correspondingSimFluxo.vencimento : det.vencimento;
      const valorComissaoToShow = correspondingSimFluxo 
        ? Number((correspondingSimFluxo.valorTotal - correspondingSimFluxo.valorLiquido).toFixed(2)) 
        : det.valorRetido;

      if (valorComissaoToShow > 0) {
        visibleParcelas.push({
          ...det,
          vencimentoToShow,
          valorComissaoToShow
        });
      }
      runningSum = Number((runningSum + valorComissaoToShow).toFixed(2));
      if (runningSum >= waterfall.comissaoTotal - 0.01 && waterfall.comissaoTotal > 0) {
        break;
      }
    }

    const totalPrintCols = activeParticipants.length + 2;
    const printThTdFontSize = totalPrintCols > 7 ? '6.5px' : totalPrintCols > 5 ? '7px' : '8px';
    const printThTdPadding = totalPrintCols > 7 ? '2.5px 3px' : totalPrintCols > 5 ? '3px 4px' : '4px 6px';

    const totalComissaoLinhas = visibleParcelas.reduce((acc, d) => acc + d.valorComissaoToShow, 0);

    const headers = `
      <tr>
        <th style="border: 1px solid black; background: #f8fafc;" colspan="2"></th>
        ${activeParticipants.map(p => `
          <th class="text-right" style="border: 1px solid black; background: #f0f0f0; font-weight: bold; text-transform: uppercase;">
            ${p.role}
          </th>
        `).join('')}
      </tr>
      <tr>
        <th class="text-right" style="border: 1px solid black; background: #e2e8f0; font-weight: bold; white-space: nowrap;">VALOR</th>
        <th style="text-align: center; border: 1px solid black; background: #e2e8f0; font-weight: bold; white-space: nowrap;">VENCIMENTO</th>
        ${activeParticipants.map(p => {
          const apelido = getParticipantApelido(p.name) || (p.role?.toLowerCase().includes('imobili') ? 'R&J' : (p.name ? p.name.split(' ')[0] : ''));
          return `
            <th class="text-right" style="border: 1px solid black; background: #e2e8f0; font-weight: bold; white-space: nowrap;">
              ${apelido || p.role}
            </th>
          `;
        }).join('')}
      </tr>
    `;

    const rows = visibleParcelas.map((det, idx) => `
      <tr>
        <td class="text-right font-bold" style="color: #0f172a; white-space: nowrap;">${formatCurrency(det.valorComissaoToShow)}</td>
        <td style="text-align: center; white-space: nowrap;">${det.vencimentoToShow}</td>
        ${activeParticipants.map(p => {
          const label = p.name ? `${p.role} - ${p.name}` : p.role;
          const val = det.distribuicao[label] || 0;
          return `<td class="text-right" style="white-space: nowrap;">${formatCurrency(val)}</td>`;
        }).join('')}
      </tr>
    `).join('');

    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>Relatório de Rateio Geral de Comissão - ${result.property.empreendimento || "Imóvel"}</title>
    <style>
        @page { size: A4 landscape; margin: 1cm; }
        body { font-family: monospace; font-size: 8px; margin: 0; padding: 20px; color: black; background: white; }
        .header { display: flex; justify-content: space-between; align-items: start; margin-bottom: 15px; border-bottom: 2px solid black; padding-bottom: 10px; }
        .title { font-size: 14px; font-weight: bold; text-transform: uppercase; }
        .info-grid { display: grid; grid-template-cols: 1fr 1fr 1fr; gap: 8px; margin-bottom: 15px; border: 1px solid black; padding: 10px; }
        .info-item { display: flex; flex-direction: column; }
        .info-label { font-size: 7px; font-weight: bold; text-transform: uppercase; }
        .info-value { font-size: 9px; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; border: 1px solid black; }
        th, td { border: 1px solid black; padding: ${printThTdPadding}; text-align: left; font-size: ${printThTdFontSize}; }
        th { background: #f0f0f0; font-weight: bold; text-transform: uppercase; font-size: ${printThTdFontSize}; }
        .text-right { text-align: right; }
        .font-bold { font-weight: bold; }
        .summary-box { display: flex; gap: 15px; margin-top: 20px; border-top: 2px solid black; padding-top: 10px; justify-content: flex-end; }
        .summary-item { text-align: right; }
        .summary-label { font-size: 8px; font-weight: bold; text-transform: uppercase; }
        .summary-value { font-size: 11px; font-weight: bold; }
        .btn-print { background: black; color: white; border: none; padding: 6px 12px; font-size: 10px; font-weight: bold; cursor: pointer; margin-bottom: 15px; text-transform: uppercase; }
        @media print { .btn-print { display: none; } }
    </style>
</head>
<body>
    <button class="btn-print" onclick="window.print()">Imprimir Tabela</button>
    <div class="header">
        <div>
            <div class="title">Tabela de Rateio Geral de Comissão</div>
            <div style="font-size: 9px; margin-top: 2px;">Demonstrativo Cronológico de Distribuição (Auditoria de Fluxo)</div>
        </div>
        <div style="text-align: right; font-size: 8px;">
            Gerado em: ${new Date().toLocaleString('pt-BR')}
        </div>
    </div>

    <div class="info-grid">
        <div class="info-item">
            <span class="info-label">Empreendimento</span>
            <span class="info-value">${result.property.empreendimento || "-"}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Unidade / Torre</span>
            <span class="info-value">${result.property.unidade || "-"} / ${result.property.torre || "-"}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Cliente(s)</span>
            <span class="info-value">${result.customers.map(c => c.nome).join(', ') || "-"}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Valor Venda (VGV)</span>
            <span class="info-value">${formatCurrency(waterfall.vendaTotal)}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Comissão Global</span>
            <span class="info-value">${percentualComissao}% (${formatCurrency(waterfall.comissaoTotal)})</span>
        </div>
        <div class="info-item">
            <span class="info-label">Forma Pagto Comissão</span>
            <span class="info-value">${result.forma_pagamento_comissao || "FLUXO (PADRÃO)"}</span>
        </div>
    </div>

    <table>
        <thead>
            ${headers}
        </thead>
        <tbody>
            ${rows}
        </tbody>
        <tfoot>
            <tr style="background: #f0f0f0; font-weight: bold; border-top: 2px solid black;">
                <td class="text-right font-bold" style="white-space: nowrap;">${formatCurrency(totalComissaoLinhas)}</td>
                <td style="text-align: center; font-bold; white-space: nowrap;">TOTAL</td>
                ${activeParticipants.map(p => {
                  const label = p.name ? `${p.role} - ${p.name}` : p.role;
                  const totalCol = visibleParcelas.reduce((sum, det) => sum + (det.distribuicao[label] || 0), 0);
                  return `<td class="text-right font-bold" style="white-space: nowrap;">${formatCurrency(totalCol)}</td>`;
                }).join('')}
            </tr>
        </tfoot>
    </table>

    <div style="margin-top: 25px; border-top: 1px solid black; padding-top: 10px;">
        <div style="font-size: 10px; font-weight: bold; text-transform: uppercase; margin-bottom: 8px;">Credenciais dos Participantes na Venda (Rateio)</div>
        <table>
            <thead>
                <tr>
                    <th style="text-align: left; font-size: 8px;">Nome</th>
                    <th style="text-align: left; font-size: 8px;">Apelido</th>
                    <th style="text-align: left; font-size: 8px;">CPF / CNPJ</th>
                    <th style="text-align: left; font-size: 8px;">CRECI</th>
                    <th style="text-align: left; font-size: 8px;">Cargo na Operação</th>
                </tr>
            </thead>
            <tbody>
                ${printParticipantsHtml}
            </tbody>
        </table>
    </div>

    <div class="summary-box">
        <div class="summary-item">
            <div class="summary-label">Total Comissão Distribuída</div>
            <div class="summary-value">${formatCurrency(waterfall.comissaoTotal - waterfall.saldoRestanteComissao)}</div>
        </div>
        <div class="summary-item">
            <div class="summary-label">Saldo Remanescente Sem Cobertura</div>
            <div class="summary-value" style="${waterfall.saldoRestanteComissao > 0.01 ? 'color: red;' : ''}">${formatCurrency(waterfall.saldoRestanteComissao)}</div>
        </div>
    </div>
</body>
</html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
    }
  };

  const printRelatorioEspecialista = () => {
    if (!result || !waterfallResult) return;
    const diag = gerarDiagnosticoEspecialista(waterfallResult);
    const formatCurrency = (val: number) => Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>Laudo Técnico de Auditoria e Rateio de Comissões - ${result.property.empreendimento || "Imóvel"}</title>
    <style>
        @page { size: A4 landscape; margin: 10mm; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; font-size: 8px; margin: 0; padding: 15px; color: #0f172a; background: white; line-height: 1.3; }
        .header { display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px; border-bottom: 2px solid black; padding-bottom: 8px; }
        .title { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; }
        .subtitle { font-size: 9px; color: #475569; margin-top: 2px; }
        .meta-box { text-align: right; font-size: 8px; font-family: monospace; }
        .badge-status { display: inline-block; padding: 3px 6px; font-weight: bold; font-size: 8.5px; border-radius: 3px; }
        .badge-success { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
        .badge-warning { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
        .section-title { font-size: 9.5px; font-weight: 800; text-transform: uppercase; margin-top: 14px; margin-bottom: 5px; padding-bottom: 3px; border-bottom: 1px solid black; letter-spacing: 0.4px; }
        .params-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 10px; border: 1px solid #cbd5e1; padding: 6px; background: #f8fafc; }
        .param-item { display: flex; flex-direction: column; }
        .param-label { font-size: 7px; font-weight: 700; text-transform: uppercase; color: #64748b; }
        .param-value { font-size: 10px; font-weight: 800; font-family: monospace; color: #0f172a; }
        table { width: 100%; border-collapse: collapse; margin-top: 4px; border: 1px solid black; }
        th, td { border: 1px solid #94a3b8; padding: 3.5px 5px; text-align: left; font-size: 7.5px; }
        th { background: #f1f5f9; font-weight: 800; text-transform: uppercase; font-size: 7.5px; color: #1e293b; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .font-mono { font-family: monospace; }
        .font-bold { font-weight: bold; }
        .btn-print { background: black; color: white; border: none; padding: 6px 14px; font-size: 10px; font-weight: bold; cursor: pointer; margin-bottom: 12px; text-transform: uppercase; border-radius: 4px; }
        .inflex-box { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
        .signatures { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-top: 25px; page-break-inside: avoid; }
        .sig-line { border-top: 1px solid black; text-align: center; font-size: 7.5px; padding-top: 4px; font-weight: bold; text-transform: uppercase; }
        @media print { .btn-print { display: none; } }
    </style>
</head>
<body>
    <button class="btn-print" onclick="window.print()">Imprimir Laudo Técnico</button>
    <div class="header">
        <div>
            <div class="title">Laudo Técnico de Auditoria e Liquidação de Comissões</div>
            <div class="subtitle">Engenharia de Operações Financeiras • Rateio Dinâmico e Amortização de Fluxo</div>
        </div>
        <div class="meta-box">
            <div><strong>Empreendimento:</strong> ${result.property.empreendimento || "-"} | <strong>Unid:</strong> ${result.property.unidade || "-"} / ${result.property.torre || "-"}</div>
            <div><strong>Clientes:</strong> ${result.customers.map(c => c.nome).join(', ') || "-"}</div>
            <div><strong>Emissão:</strong> ${new Date().toLocaleString('pt-BR')}</div>
            <div style="margin-top: 3px;">
                <span class="badge-status ${diag.secaoIII.statusConciliacao === '100% LIQUIDADO' ? 'badge-success' : 'badge-warning'}">
                    STATUS: ${diag.secaoIII.statusConciliacao}
                </span>
            </div>
        </div>
    </div>

    <!-- SEÇÃO I -->
    <div class="section-title">Seção I: Memória de Cálculo e Parâmetros de Entrada</div>
    <div class="params-grid">
        <div class="param-item">
            <span class="param-label">VGV Total da Proposta</span>
            <span class="param-value">${formatCurrency(diag.secaoI.vgv)}</span>
        </div>
        <div class="param-item">
            <span class="param-label">Taxa Global de Comissão (tc)</span>
            <span class="param-value">${diag.secaoI.taxaGlobal.toFixed(2)}%</span>
        </div>
        <div class="param-item">
            <span class="param-label">Passivo Total de Honorários (C_total)</span>
            <span class="param-value">${formatCurrency(diag.secaoI.passivoTotalComissao)}</span>
        </div>
        <div class="param-item">
            <span class="param-label">Consistência da Soma (∑ pj = tc)</span>
            <span class="param-value">${diag.secaoI.somaAliquotas.toFixed(2)}% (${diag.secaoI.consistenciaAliquotas ? 'CONFORME' : 'DIVERGENTE'})</span>
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th style="width: 25%;">Cargo / Participante</th>
                <th class="text-right" style="width: 12%;">Alíquota VGV (pj)</th>
                <th class="text-right" style="width: 16%;">Teto Nominal (Tj)</th>
                <th class="text-right" style="width: 14%;">Coef. Fluxo (wj)</th>
                <th style="width: 18%;">Regra / Exceção</th>
                <th style="width: 15%;">Hierarquia de Absorção</th>
            </tr>
        </thead>
        <tbody>
            ${diag.secaoI.participantes.map(p => `
                <tr>
                    <td class="font-bold">${p.label}</td>
                    <td class="text-right font-mono">${p.aliquotaVGV.toFixed(2)}%</td>
                    <td class="text-right font-mono font-bold">${formatCurrency(p.tetoNominal)}</td>
                    <td class="text-right font-mono">${p.regraFluxo > 0 ? p.regraFluxo.toFixed(2) + '%' : 'Partes Iguais (Em branco)'}</td>
                    <td>${p.excecao}</td>
                    <td>${p.tierLabel}</td>
                </tr>
            `).join('')}
        </tbody>
    </table>

    <!-- SEÇÃO II -->
    <div class="section-title">Seção II: Amortização do Fluxo de Recebíveis</div>
    <table>
        <thead>
            <tr>
                <th class="text-center" style="width: 5%;">#</th>
                <th style="width: 12%;">Vencimento</th>
                <th style="width: 25%;">Tipo de Parcela</th>
                <th class="text-right" style="width: 15%;">Parcela Nominal Bruta</th>
                <th class="text-right" style="width: 15%;">Dedução Aplicada (Retencao_i)</th>
                <th class="text-right" style="width: 14%;">Saldo Incorporador</th>
                <th class="text-right" style="width: 14%;">Saldo Devedor Comissão</th>
            </tr>
        </thead>
        <tbody>
            ${diag.secaoII.map(row => `
                <tr>
                    <td class="text-center font-mono">${row.linha}</td>
                    <td class="font-mono">${row.vencimento}</td>
                    <td class="font-bold">${row.tipo}</td>
                    <td class="text-right font-mono">${formatCurrency(row.parcelaBruta)}</td>
                    <td class="text-right font-mono font-bold" style="color: #4338ca;">${formatCurrency(row.deducaoAplicada)}</td>
                    <td class="text-right font-mono">${formatCurrency(row.saldoIncorporador)}</td>
                    <td class="text-right font-mono font-bold" style="color: ${row.saldoDevedorComissao > 0.01 ? '#b45309' : '#15803d'};">${formatCurrency(row.saldoDevedorComissao)}</td>
                </tr>
            `).join('')}
        </tbody>
    </table>

    <!-- SEÇÃO III -->
    <div class="section-title">Seção III: Matriz Definitiva de Repasse (Vencimento a Vencimento)</div>
    <table>
        <thead>
            <tr>
                <th style="width: 10%;">Vencimento</th>
                <th style="width: 15%;">Tipo Parcela</th>
                <th class="text-right" style="width: 12%;">Total Retido</th>
                ${diag.secaoIII.headers.map(h => `<th class="text-right" style="max-width: 90px; word-break: break-word;">${h}</th>`).join('')}
            </tr>
        </thead>
        <tbody>
            ${diag.secaoIII.rows.map(row => `
                <tr>
                    <td class="font-mono">${row.vencimento}</td>
                    <td>${row.tipo}</td>
                    <td class="text-right font-mono font-bold" style="color: #4338ca;">${formatCurrency(row.valorRetido)}</td>
                    ${diag.secaoIII.headers.map(h => {
                        const val = row.distribuicao[h] || 0;
                        return `<td class="text-right font-mono">${val > 0 ? formatCurrency(val) : '-'}</td>`;
                    }).join('')}
                </tr>
            `).join('')}
            <tr style="background: #f8fafc; font-weight: bold; border-top: 2px solid black;">
                <td colspan="2" class="font-bold">TOTAL ACUMULADO REPASSADO</td>
                <td class="text-right font-mono font-bold" style="color: #4338ca;">${formatCurrency(diag.secaoIII.totalRetido)}</td>
                ${diag.secaoIII.headers.map(h => `
                    <td class="text-right font-mono font-bold">${formatCurrency(diag.secaoIII.totaisPorParticipante[h] || 0)}</td>
                `).join('')}
            </tr>
            <tr style="background: #f1f5f9; font-weight: bold;">
                <td colspan="2" class="font-bold">TETO CONTRATUAL NOMINAL (Tj)</td>
                <td class="text-right font-mono font-bold">${formatCurrency(diag.secaoI.passivoTotalComissao)}</td>
                ${diag.secaoIII.headers.map(h => `
                    <td class="text-right font-mono">${formatCurrency(diag.secaoIII.tetosPorParticipante[h] || 0)}</td>
                `).join('')}
            </tr>
        </tbody>
    </table>

    <!-- SEÇÃO IV -->
    <div class="section-title">Seção IV: Diagnóstico de Eventos Críticos (Inflexões)</div>
    <div class="inflex-box">
        <div style="border: 1px solid #cbd5e1; padding: 8px; background: #f8fafc;">
            <div style="font-size: 8px; font-weight: bold; text-transform: uppercase; margin-bottom: 6px; color: #1e293b;">Inflexões de Quitação (Saída da Esteira)</div>
            ${diag.secaoIV.inflexoes.length > 0 ? `
                <table style="margin-top: 0;">
                    <thead>
                        <tr>
                            <th>Participante</th>
                            <th>Evento de Quitação</th>
                            <th>Vencimento</th>
                            <th class="text-right">Teto Quitado</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${diag.secaoIV.inflexoes.map(inf => `
                            <tr>
                                <td class="font-bold">${inf.participante}</td>
                                <td>${inf.parcelaQuitacao}</td>
                                <td class="font-mono">${inf.vencimento}</td>
                                <td class="text-right font-mono font-bold" style="color: #166534;">${formatCurrency(inf.tetoAtingido)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            ` : '<div style="font-size: 8px; color: #64748b;">Nenhum participante atingiu quitação antecipada.</div>'}
        </div>
        <div style="border: 1px solid #cbd5e1; padding: 8px; background: #f8fafc;">
            <div style="font-size: 8px; font-weight: bold; text-transform: uppercase; margin-bottom: 6px; color: #1e293b;">Hierarquia de Absorção e Liberação de Caixa</div>
            <ul style="margin: 0; padding-left: 14px; font-size: 7.5px; color: #334155; line-height: 1.4;">
                ${diag.secaoIV.rotasSobras.map(r => `<li>${r}</li>`).join('')}
            </ul>
            ${diag.secaoIV.liberacaoFluxoIntegral ? `
                <div style="margin-top: 8px; padding: 6px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 4px;">
                    <div style="font-weight: bold; color: #065f46; font-size: 8px; text-transform: uppercase;">
                        ✓ Liberação Integral do Fluxo ao Incorporador: ${diag.secaoIV.liberacaoFluxoIntegral.parcela} (${diag.secaoIV.liberacaoFluxoIntegral.vencimento})
                    </div>
                    <div style="color: #047857; font-size: 7.5px; margin-top: 2px;">
                        ${diag.secaoIV.liberacaoFluxoIntegral.observacao}
                    </div>
                </div>
            ` : ''}
        </div>
    </div>

    <!-- ASSINATURAS -->
    <div class="signatures">
        <div class="sig-line">Incorporador / Vendedor</div>
        <div class="sig-line">Imobiliária / Diretoria</div>
        <div class="sig-line">Liderança / Gerente</div>
        <div class="sig-line">Auditoria Financeira</div>
    </div>
</body>
</html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
    }
  };

  const renderEspecialistaTabContent = () => {
    if (!waterfallResult) return null;
    const diag = gerarDiagnosticoEspecialista(waterfallResult);
    const isLiquidado100 = diag.secaoIII.statusConciliacao === '100% LIQUIDADO';

    const copiarRelatorioTexto = () => {
      const text = `=== LAUDO TÉCNICO DE AUDITORIA E LIQUIDAÇÃO DE COMISSÕES ===
Engenharia de Operações Financeiras • Rateio Dinâmico e Amortização de Fluxo
Empreendimento: ${result?.property?.empreendimento || '-'} | Unidade: ${result?.property?.unidade || '-'} / ${result?.property?.torre || '-'}
Clientes: ${result?.customers.map(c => c.nome).join(', ') || '-'}
Status de Conciliação: ${diag.secaoIII.statusConciliacao}

--- SEÇÃO I: MEMÓRIA DE CÁLCULO E PARÂMETROS DE ENTRADA ---
- VGV Total (V_total): ${diag.secaoI.vgv.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
- Taxa Global de Comissão (t_c): ${diag.secaoI.taxaGlobal.toFixed(2)}%
- Passivo Total de Honorários (C_total): ${diag.secaoI.passivoTotalComissao.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
- Consistência das Alíquotas: ${diag.secaoI.somaAliquotas.toFixed(2)}% (${diag.secaoI.consistenciaAliquotas ? 'CONFORME (∑ p_j = t_c)' : 'DIVERGENTE'})

Participantes e Tetos Contratuais:
${diag.secaoI.participantes.map(p => `• ${p.label} | Alíquota VGV: ${p.aliquotaVGV.toFixed(2)}% | Teto Nominal: ${p.tetoNominal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} | Perc. Parcela: ${p.regraFluxo > 0 ? p.regraFluxo.toFixed(2) + '%' : 'Partes Iguais (Em branco)'} | Regra: ${p.excecao} | ${p.tierLabel}`).join('\n')}

--- SEÇÃO II: AMORTIZAÇÃO DO FLUXO DE RECEBÍVEIS ---
${diag.secaoII.map(r => `#${r.linha} | ${r.vencimento} | ${r.tipo} | Bruto: ${r.parcelaBruta.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} | Retenção: ${r.deducaoAplicada.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} | Líq. Incorporador: ${r.saldoIncorporador.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} | Devedor: ${r.saldoDevedorComissao.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`).join('\n')}

--- SEÇÃO III: MATRIZ DEFINITIVA DE REPASSE (TOTAIS ACUMULADOS) ---
Total Retido no Fluxo: ${diag.secaoIII.totalRetido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
${diag.secaoIII.headers.map(h => `• ${h}: Repassado ${(diag.secaoIII.totaisPorParticipante[h] || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} de ${(diag.secaoIII.tetosPorParticipante[h] || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`).join('\n')}

--- SEÇÃO IV: DIAGNÓSTICO DE EVENTOS CRÍTICOS (INFLEXÕES) ---
${diag.secaoIV.inflexoes.map(inf => `• Quitação: ${inf.participante} em ${inf.parcelaQuitacao} (${inf.vencimento}) | Teto Quitado: ${inf.tetoAtingido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`).join('\n')}
${diag.secaoIV.rotasSobras.map(r => `• ${r}`).join('\n')}
${diag.secaoIV.liberacaoFluxoIntegral ? `• Liberação de Fluxo Integral ao Incorporador: a partir de ${diag.secaoIV.liberacaoFluxoIntegral.parcela} (${diag.secaoIV.liberacaoFluxoIntegral.vencimento})` : ''}
`;
      navigator.clipboard.writeText(text);
      setCopiedRelatorio(true);
      setTimeout(() => setCopiedRelatorio(false), 2500);
    };

    return (
      <div className="space-y-6">
        {/* Banner de Identidade do Especialista */}
        <div className="bg-slate-900 text-white p-6 rounded-3xl border border-slate-800 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Engenharia de Operações Financeiras
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                isLiquidado100 
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}>
                {diag.secaoIII.statusConciliacao}
              </span>
            </div>
            <h3 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-400" />
              Laudo Técnico de Auditoria e Rateio de Comissões
            </h3>
            <p className="text-xs text-slate-400 max-w-2xl font-sans leading-relaxed">
              Amortização cronológica subordinada à capacidade de retenção de cada evento (<span className="font-mono text-slate-300">Retencao_i</span>), com quitação individual de tetos (<span className="font-mono text-slate-300">T_j</span>), proteção de caixa e fechamento de centavos (soma zero).
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={copiarRelatorioTexto}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-all border border-slate-700 active:scale-[0.98]"
            >
              {copiedRelatorio ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              {copiedRelatorio ? 'Copiado!' : 'Copiar Laudo'}
            </button>
            <button
              onClick={printRelatorioEspecialista}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-indigo-600/30 active:scale-[0.98]"
            >
              <Printer className="w-4 h-4" />
              Imprimir Laudo Técnico
            </button>
          </div>
        </div>

        {/* SEÇÃO I: MEMÓRIA DE CÁLCULO E PARÂMETROS DE ENTRADA */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-600 uppercase tracking-widest flex items-center gap-2">
              <FileSearch className="w-4 h-4 text-indigo-600" /> Seção I: Memória de Cálculo e Parâmetros de Entrada
            </h4>
            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-lg font-mono ${
              diag.secaoI.consistenciaAliquotas 
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                : 'bg-rose-50 text-rose-700 border border-rose-200'
            }`}>
              ∑ p_j = {diag.secaoI.somaAliquotas.toFixed(2)}% ({diag.secaoI.consistenciaAliquotas ? 'CONFORME t_c' : 'DIVERGENTE'})
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">VGV Total (V_total)</span>
              <div className="text-lg font-black font-mono text-slate-800 mt-1">
                {diag.secaoI.vgv.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Taxa Global de Comissão (t_c)</span>
              <div className="text-lg font-black font-mono text-indigo-600 mt-1">
                {diag.secaoI.taxaGlobal.toFixed(2)}%
              </div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Passivo Total Honorários (C_total)</span>
              <div className="text-lg font-black font-mono text-slate-800 mt-1">
                {diag.secaoI.passivoTotalComissao.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Participantes na Esteira</span>
              <div className="text-lg font-black font-mono text-slate-800 mt-1">
                {diag.secaoI.participantes.length} <span className="text-xs font-normal text-slate-500">credores</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                  <th className="p-3">Cargo / Participante</th>
                  <th className="p-3 text-right">Alíquota s/ VGV (p_j)</th>
                  <th className="p-3 text-right">Teto Nominal (T_j)</th>
                  <th className="p-3 text-right">Coef. Fluxo (w_j)</th>
                  <th className="p-3">Regra / Exceção Vinculada</th>
                  <th className="p-3">Hierarquia de Absorção</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {diag.secaoI.participantes.map((p, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                    <td className="p-3 font-bold text-slate-800">{p.label}</td>
                    <td className="p-3 text-right font-mono text-slate-700">{p.aliquotaVGV.toFixed(2)}%</td>
                    <td className="p-3 text-right font-mono font-bold text-slate-900">
                      {p.tetoNominal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className="p-3 text-right font-mono text-slate-600">
                      {p.regraFluxo > 0 ? (
                        `${p.regraFluxo.toFixed(2)}%`
                      ) : (
                        <span className="text-[10px] font-sans font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                          Partes Iguais (Em branco)
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                        p.excecao.includes('100%') 
                          ? 'bg-purple-50 text-purple-700 border border-purple-200' 
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        {p.excecao}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                        {p.tierLabel}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* SEÇÃO II: AMORTIZAÇÃO DO FLUXO DE RECEBÍVEIS */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-600 uppercase tracking-widest flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-600" /> Seção II: Amortização do Fluxo de Recebíveis
            </h4>
            <span className="text-[10px] text-slate-500 font-mono">
              {diag.secaoII.length} eventos processados cronologicamente
            </span>
          </div>

          <div className="bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-sans">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                  <th className="p-3 text-center w-12">#</th>
                  <th className="p-3">Vencimento</th>
                  <th className="p-3">Tipo de Parcela</th>
                  <th className="p-3 text-right">Parcela Bruta</th>
                  <th className="p-3 text-right text-indigo-600">Dedução Aplicada (Retencao_i)</th>
                  <th className="p-3 text-right">Líquido Incorporador</th>
                  <th className="p-3 text-right">Saldo Devedor Comissão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {diag.secaoII.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                    <td className="p-3 text-center font-mono text-slate-400 text-[11px]">{row.linha}</td>
                    <td className="p-3 font-mono font-medium text-slate-700">{row.vencimento}</td>
                    <td className="p-3 font-bold text-slate-800">{row.tipo}</td>
                    <td className="p-3 text-right font-mono text-slate-700">
                      {row.parcelaBruta.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-indigo-600">
                      {row.deducaoAplicada.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className="p-3 text-right font-mono text-slate-600">
                      {row.saldoIncorporador.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className={`p-3 text-right font-mono font-bold ${
                      row.saldoDevedorComissao > 0.01 ? 'text-amber-600' : 'text-emerald-600'
                    }`}>
                      {row.saldoDevedorComissao.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* SEÇÃO III: MATRIZ DEFINITIVA DE REPASSE */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-600 uppercase tracking-widest flex items-center gap-2">
              <Table className="w-4 h-4 text-indigo-600" /> Seção III: Matriz Definitiva de Repasse (Vencimento a Vencimento)
            </h4>
            <span className="text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-lg font-mono font-bold">
              Total Repassado: {diag.secaoIII.totalRetido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
          </div>

          <div className="bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-sans">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                  <th className="p-3 whitespace-nowrap">Vencimento</th>
                  <th className="p-3 whitespace-nowrap">Tipo</th>
                  <th className="p-3 text-right font-mono text-indigo-600 whitespace-nowrap">Total Retido</th>
                  {diag.secaoIII.headers.map((h, hIdx) => (
                    <th key={hIdx} className="p-3 text-right whitespace-nowrap max-w-[130px] truncate" title={h}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {diag.secaoIII.rows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-slate-50/70 transition-colors">
                    <td className="p-3 font-mono text-slate-700 whitespace-nowrap">{row.vencimento}</td>
                    <td className="p-3 font-bold text-slate-800 whitespace-nowrap">{row.tipo}</td>
                    <td className="p-3 text-right font-mono font-bold text-indigo-600 whitespace-nowrap">
                      {row.valorRetido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    {diag.secaoIII.headers.map((h, hIdx) => {
                      const val = row.distribuicao[h] || 0;
                      return (
                        <td key={hIdx} className="p-3 text-right font-mono whitespace-nowrap text-slate-800">
                          {val > 0 ? val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '-'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {/* Linhas de Conferência Contábil */}
                <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                  <td colSpan={2} className="p-3 font-bold text-slate-800 uppercase text-[11px]">
                    Total Acumulado Repassado
                  </td>
                  <td className="p-3 text-right font-mono font-bold text-indigo-700 whitespace-nowrap">
                    {diag.secaoIII.totalRetido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                  {diag.secaoIII.headers.map((h, hIdx) => (
                    <td key={hIdx} className="p-3 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                      {(diag.secaoIII.totaisPorParticipante[h] || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                  ))}
                </tr>
                <tr className="bg-slate-50 font-bold text-slate-500">
                  <td colSpan={2} className="p-3 font-bold uppercase text-[10px]">
                    Teto Contratual Nominal (T_j)
                  </td>
                  <td className="p-3 text-right font-mono whitespace-nowrap">
                    {diag.secaoI.passivoTotalComissao.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                  {diag.secaoIII.headers.map((h, hIdx) => (
                    <td key={hIdx} className="p-3 text-right font-mono whitespace-nowrap">
                      {(diag.secaoIII.tetosPorParticipante[h] || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                  ))}
                </tr>
                <tr className="bg-white font-bold text-[10px]">
                  <td colSpan={2} className="p-3 uppercase text-slate-400">
                    Diferença Residual (Fechamento de Centavos)
                  </td>
                  <td className="p-3 text-right font-mono text-slate-400">
                    R$ 0,00
                  </td>
                  {diag.secaoIII.headers.map((h, hIdx) => {
                    const diff = Number(((diag.secaoIII.tetosPorParticipante[h] || 0) - (diag.secaoIII.totaisPorParticipante[h] || 0)).toFixed(2));
                    return (
                      <td key={hIdx} className={`p-3 text-right font-mono whitespace-nowrap ${
                        Math.abs(diff) < 0.01 ? 'text-slate-400' : 'text-amber-600'
                      }`}>
                        {diff.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* SEÇÃO IV: DIAGNÓSTICO DE EVENTOS CRÍTICOS (INFLEXÕES) */}
        <div className="space-y-4">
          <h4 className="text-xs font-bold text-slate-600 uppercase tracking-widest flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-indigo-600" /> Seção IV: Diagnóstico de Eventos Críticos (Inflexões)
          </h4>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Inflexões de Quitação */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                Inflexões de Quitação de Credores (Saída da Esteira)
              </h5>
              <p className="text-xs text-slate-500 leading-relaxed">
                Identificação do evento exato em que cada participante atinge 100% de seu teto financeiro nominal (<span className="font-mono">T_j</span>) e cessa de reter valores do fluxo de recebíveis.
              </p>
              {diag.secaoIV.inflexoes.length > 0 ? (
                <div className="space-y-2 mt-3">
                  {diag.secaoIV.inflexoes.map((inf, idx) => (
                    <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold text-slate-800">{inf.participante}</div>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                          {inf.parcelaQuitacao} • {inf.vencimento}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold font-mono text-emerald-600">
                          {inf.tetoAtingido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </div>
                        <span className="text-[9px] font-bold uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                          Teto Quitado
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 bg-slate-50 rounded-xl text-center text-xs text-slate-500">
                  Nenhum participante encerrou quitação antecipada.
                </div>
              )}
            </div>

            {/* Rotas de Absorção e Liberação de Fluxo */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3 flex flex-col justify-between">
              <div>
                <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <Workflow className="w-4 h-4 text-indigo-500" />
                  Hierarquia de Absorção de Sobras (Cascata)
                </h5>
                <ul className="mt-3 space-y-2 text-xs text-slate-600">
                  {diag.secaoIV.rotasSobras.map((rota, idx) => (
                    <li key={idx} className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                      <span>{rota}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {diag.secaoIV.liberacaoFluxoIntegral && (
                <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
                  <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Liberação Integral de Fluxo ao Incorporador: {diag.secaoIV.liberacaoFluxoIntegral.parcela}
                  </div>
                  <p className="text-xs text-emerald-700 mt-1">
                    Vencimento: <strong>{diag.secaoIV.liberacaoFluxoIntegral.vencimento}</strong>. {diag.secaoIV.liberacaoFluxoIntegral.observacao}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderRateio = () => {
    if (!waterfallResult) {
      return (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-slate-100 shadow-sm text-center px-6">
          <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6">
            <Workflow className="w-10 h-10 text-slate-300" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-2">Simule ou Selecione uma Venda</h3>
          <p className="text-slate-500 max-w-sm mb-6">
            O detalhamento do rateio em cascata (waterfall) é gerado após a simulação de comissão de uma proposta.
          </p>
          <button 
            onClick={() => setView('extract')}
            className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
          >
            Iniciar Extração
          </button>
        </div>
      );
    }

    const currentEmp = empreendimentos.find(e => e.nome === result?.property.empreendimento);
    const sumCargosPercentage = commissionedParties.reduce((acc, p) => acc + p.percentage, 0);
    const hasCommissionMismatch = Math.abs(sumCargosPercentage - percentualComissao) > 0.01;
    const hasCoverageShortage = waterfallResult.saldoRestanteComissao > 0.01;

    const handleRecalculateAll = () => {
      if (result) {
        setIsRecalculating(true);
        setIsManualRateio(false);
        setIsEditingRateio(false);
        setTimeout(() => {
          const currentEmp = empreendimentos.find(e => e.nome === result.property.empreendimento);
          const effectivePercentual = percentualComissao;

          const sim = processarProposta(
            result.payments, 
            effectivePercentual, 
            currentEmp?.regras_comissao, 
            installmentConfigs,
            result.forma_pagamento_comissao,
            result.valorTotalProposta
          );
          
          const sumExcluded = result.payments
            .filter(p => isExcludedFromCommissionBase(p.tipo))
            .reduce((acc, p) => acc + (p.valorTotal || 0), 0);
          const sumAllParcelas = result.payments.reduce((acc, p) => acc + (p.valorTotal || 0), 0);
          const baseVendaTotal = Math.max(0, (sumAllParcelas > 0 ? sumAllParcelas : (result.valorTotalProposta || 0)) - sumExcluded);

          const waterfall = calcularRateioCascata(
            baseVendaTotal,
            effectivePercentual,
            sim.fluxo,
            result.forma_pagamento_comissao,
            commissionedParties,
            currentEmp?.regras_comissao
          );
          setSimulationResult(sim);
          setWaterfallResult(waterfall);
          setIsRecalculating(false);
        }, 600);
      }
    };

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Engenharia de Rateio (Waterfall)</h2>
            <p className="text-slate-500 mt-1 uppercase text-[10px] font-bold tracking-widest font-mono">
              Auditoria de Dedução em Cascata - Sistema R&J
            </p>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={saveToFirestore}
              disabled={isSaving}
              className={`flex items-center gap-2 px-4 py-2 text-white rounded-xl text-xs font-bold transition-all shadow-sm ${
                isSaving ? 'bg-emerald-400 cursor-not-allowed shadow-none' : 'bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98]'
              }`}
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {isSaving ? 'SALVANDO...' : 'SALVAR RATEIO'}
            </button>
            <button 
              onClick={() => setIsEditingRateio(prev => !prev)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm border ${
                isEditingRateio 
                  ? 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.98]' 
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 active:scale-[0.98]'
              }`}
            >
              <Edit2 className="w-4 h-4" />
              {isEditingRateio ? 'CONCLUIR EDIÇÃO' : 'EDITAR RATEIO'}
            </button>
            <button 
              onClick={handleRecalculateAll}
              disabled={isRecalculating}
              className={`flex items-center gap-2 px-4 py-2 text-white rounded-xl text-xs font-bold transition-all shadow-sm ${
                isRecalculating ? 'bg-indigo-400 cursor-not-allowed shadow-none' : 'bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98]'
              }`}
            >
              {isRecalculating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              {isRecalculating ? 'RECALCULANDO...' : 'RECALCULAR TUDO'}
            </button>
            <button 
              onClick={() => printRateio(waterfallResult)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all shadow-sm"
            >
              <Printer className="w-4 h-4" />
              IMPRIMIR RATEIO
            </button>
            <button 
              onClick={() => exportRateioToCSV(waterfallResult)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all shadow-sm"
            >
              <Download className="w-4 h-4" />
              EXPORTAR CSV
            </button>
            <button 
              onClick={() => exportRateioToICS(waterfallResult)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all shadow-sm"
              title="Exportar parcelas de comissão como arquivo de calendário (.ics)"
            >
              <Calendar className="w-4 h-4" />
              EXPORTAR CALENDÁRIO (.ICS)
            </button>
            <button 
              onClick={() => exportRateioToWebropay(waterfallResult)}
              disabled={isExportingWebropay}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm active:scale-[0.98] disabled:bg-emerald-400"
              title="Gerar Planilha Webropay modelo contrato (.xlsx) com abas Beneficiários e Pagador"
            >
              {isExportingWebropay ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-4 h-4" />
              )}
              {isExportingWebropay ? 'GERANDO PLANILHA...' : 'GERAR PLANILHA WEBROPAY'}
            </button>
          </div>
        </header>

        {/* Resumos Globais e Alertas */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Valor da Venda (VGV)</span>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-sm font-bold text-slate-400">R$</span>
                  <input
                    type="number"
                    value={result?.valorTotalProposta || 0}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setResult(prev => prev ? { ...prev, valorTotalProposta: val } : null);
                    }}
                    onBlur={handleRecalculateAll}
                    className="w-full text-lg font-bold text-slate-900 bg-slate-50 border border-slate-100 rounded-lg px-2 py-1 focus:border-indigo-300 focus:bg-white outline-none"
                  />
                </div>
              </div>
              <button
                onClick={() => {
                  const sumAll = result?.payments.reduce((acc, p) => acc + p.valorTotal, 0) || 0;
                  setResult(prev => prev ? { ...prev, valorTotalProposta: sumAll } : null);
                  setTimeout(handleRecalculateAll, 100);
                }}
                className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl text-[10px] font-bold transition-all"
                title="Equiparar o VGV ao somatório das parcelas"
              >
                <RefreshCw className="w-3 h-3" />
                Sincronizar VGV (Parcelas)
              </button>
            </div>
            
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Comissão Global ({percentualComissao}%)</span>
              <p className="text-xl font-bold text-indigo-600 mt-1 font-mono">
                {waterfallResult.comissaoTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
              {waterfallResult.vendaTotal > 0 && result?.valorTotalProposta && Math.abs(waterfallResult.vendaTotal - result.valorTotalProposta) > 0.01 && (
                <span className="text-[10px] text-amber-600 font-semibold mt-1">
                  Base: {waterfallResult.vendaTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (exclui bônus)
                </span>
              )}
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Saldo sem Cobertura</span>
              <p className={`text-xl font-bold mt-1 font-mono ${waterfallResult.saldoRestanteComissao > 0.01 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {waterfallResult.saldoRestanteComissao.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status da Operação</span>
              <div className="flex items-center gap-2 mt-2">
                {waterfallResult.saldoRestanteComissao <= 0.01 ? (
                  <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold">QUITADO</span>
                ) : (
                  <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-[10px] font-bold">EM ABERTO</span>
                )}
              </div>
            </div>
          </div>

          {/* Painel de Alertas Dinâmicos */}
          {(hasCommissionMismatch || hasCoverageShortage || isManualRateio) && (
            <div className="space-y-3">
              {isManualRateio && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                  <div className="flex-1 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div>
                      <h5 className="text-xs font-bold text-indigo-800 uppercase tracking-wider">Edição Manual Ativa</h5>
                      <p className="text-xs text-indigo-600 mt-1">
                        Os valores de distribuição de comissão foram personalizados manualmente nesta proposta. Se preferir restaurar a distribuição automática baseada no cálculo em cascata, utilize a opção ao lado.
                      </p>
                    </div>
                    <button
                      onClick={handleRecalculateAll}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-bold transition-all shadow-sm shrink-0 uppercase whitespace-nowrap"
                    >
                      Restaurar Automático
                    </button>
                  </div>
                </div>
              )}
              {hasCommissionMismatch && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <h5 className="text-xs font-bold text-red-800 uppercase tracking-wider">Divergência de Percentuais</h5>
                      <p className="text-xs text-red-700 mt-1">
                        A soma dos percentuais dos cargos (<strong>{sumCargosPercentage.toFixed(2)}%</strong>) diverge do percentual total de comissão contratado (<strong>{percentualComissao.toFixed(2)}%</strong>).
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setPercentualComissao(Number(sumCargosPercentage.toFixed(2)));
                      setTimeout(handleRecalculateAll, 50);
                    }}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[10px] font-bold transition-all shadow-sm shrink-0 uppercase whitespace-nowrap"
                  >
                    Sincronizar ({sumCargosPercentage.toFixed(2)}%)
                  </button>
                </div>
              )}
              {hasCoverageShortage && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="text-xs font-bold text-amber-800 uppercase tracking-wider">Alerta de Cobertura</h5>
                    <p className="text-xs text-amber-700 mt-1">
                      O fluxo de parcelas cronológicas se encerrou antes da quitação integral da comissão acordada. 
                      Há um saldo de <strong>{waterfallResult.saldoRestanteComissao.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong> que ficou sem cobertura.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navegação entre abas de Rateio */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-0 shrink-0">
          <div className="flex gap-6">
            <button
              onClick={() => setRateioTab('geral')}
              className={`pb-4 px-1 border-b-2 font-bold text-sm transition-all flex items-center gap-2 ${
                rateioTab === 'geral'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <Table className="w-4 h-4" />
              Tabela de Rateio Geral
            </button>
            <button
              onClick={() => setRateioTab('cargos')}
              className={`pb-4 px-1 border-b-2 font-bold text-sm transition-all flex items-center gap-2 ${
                rateioTab === 'cargos'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <Users className="w-4 h-4" />
              Lista de Cargos
            </button>
            <button
              onClick={() => setRateioTab('especialista')}
              className={`pb-4 px-1 border-b-2 font-bold text-sm transition-all flex items-center gap-2 ${
                rateioTab === 'especialista'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              Laudo Técnico Especialista (4 Seções)
            </button>
          </div>
          {rateioTab === 'cargos' && (
            <button
              onClick={() => setShowCargosFillableModal(true)}
              className="mb-3 flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-[0.98]"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              Preencher em Janela
            </button>
          )}
          {rateioTab === 'especialista' && (
            <button
              onClick={printRelatorioEspecialista}
              className="mb-3 flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm active:scale-[0.98]"
            >
              <Printer className="w-3.5 h-3.5" />
              Imprimir Laudo Técnico
            </button>
          )}
        </div>

        {rateioTab === 'cargos' ? (
          /* Tabela de Comissionados (Preenchível) */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Users className="w-4 h-4" /> Configuração de Cargos e Participantes
              </h4>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-lg font-medium">
                  Perc. Parcela em branco distribui o saldo da parcela proporcionalmente à alíquota de cada cargo
                </span>
                <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg font-medium">
                  Cargos marcados como &quot;Ocultar&quot; são agrupados na Imobiliária
                </span>
              </div>
            </div>
            <div className="bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="p-4 text-[10px] font-bold text-slate-400 uppercase">Cargo</th>
                    <th className="p-4 text-[10px] font-bold text-slate-400 uppercase w-32 text-center">Perc. VGV (%)</th>
                    <th className="p-4 text-[10px] font-bold text-slate-400 uppercase w-32 text-center">Perc. Parcela (%)</th>
                    <th className="p-4 text-[10px] font-bold text-slate-400 uppercase">Nomes (separados por vírgula)</th>
                    <th className="p-4 text-[10px] font-bold text-slate-400 uppercase w-24 text-center">Qtd. Part.</th>
                    <th className="p-4 text-[10px] font-bold text-slate-400 uppercase w-20 text-center">Ocultar</th>
                    <th className="p-4 text-[10px] font-bold text-slate-400 uppercase w-16 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {commissionedParties.map((p, idx) => {
                    const names = p.name ? p.name.split(',').map(n => n.trim()).filter(Boolean) : [];
                    const count = names.length > 0 ? names.length : 1;
                    const isHidden = !!(p as any).hideAndSum;
                    const isImob = p.role.toLowerCase().trim() === 'imobiliária' || p.role.toLowerCase().trim() === 'imobiliaria';
                    return (
                      <tr key={idx} className={`transition-colors ${isHidden ? 'bg-amber-50/20 hover:bg-amber-50/40 text-slate-500' : 'hover:bg-slate-50'}`}>
                        <td className="p-4">
                          <div className="flex flex-col gap-1">
                            <input 
                              type="text"
                              value={p.role}
                              onChange={(e) => {
                                const newParties = [...commissionedParties];
                                newParties[idx].role = e.target.value;
                                setCommissionedParties(newParties);
                              }}
                              className={`w-full text-xs font-bold bg-transparent border-none focus:ring-0 outline-none ${isHidden ? 'text-slate-500' : 'text-slate-700'}`}
                              placeholder="Cargo"
                            />
                            {isHidden && (
                              <span className="inline-flex items-center gap-1 text-[8px] font-bold bg-amber-100/80 text-amber-800 px-1.5 py-0.5 rounded border border-amber-200 uppercase tracking-wide w-fit">
                                Oculto &rarr; Somado na Imobiliária
                              </span>
                            )}
                            {isImob && (
                              <span className="inline-flex items-center gap-1 text-[8px] font-bold bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200 uppercase tracking-wide w-fit">
                                Recebe comissões ocultas
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-4">
                          <input 
                            type="number"
                            step="0.01"
                            value={p.percentage}
                            onChange={(e) => {
                              const newParties = [...commissionedParties];
                              newParties[idx].percentage = parseFloat(e.target.value) || 0;
                              setCommissionedParties(newParties);
                              const sumRates = newParties.reduce((acc, cp) => acc + (cp.percentage || 0), 0);
                              setPercentualComissao(Number(sumRates.toFixed(2)));
                            }}
                            className="w-full text-xs font-mono text-center text-indigo-600 bg-slate-50 rounded-lg border border-slate-100 py-1 focus:border-indigo-300 focus:bg-white outline-none"
                          />
                        </td>
                        <td className="p-4">
                          <input 
                            type="number"
                            step="0.01"
                            value={p.deduction === 0 || p.deduction === undefined ? '' : p.deduction}
                            placeholder="Proporcional"
                            title="Deixe em branco para distribuir o saldo da parcela proporcionalmente à alíquota contratual do cargo"
                            onChange={(e) => {
                              const newParties = [...commissionedParties];
                              const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                              newParties[idx].deduction = isNaN(val) ? 0 : val;
                              setCommissionedParties(newParties);
                            }}
                            className="w-full text-xs font-mono text-center placeholder:text-slate-400 placeholder:italic text-slate-700 bg-slate-50 rounded-lg border border-slate-200 py-1 focus:border-indigo-300 focus:bg-white outline-none"
                          />
                        </td>
                        <td className="p-4 relative">
                          <input 
                            type="text"
                            value={p.name}
                            onFocus={() => {
                              setActivePartySearchIdx(idx);
                              setPartySearchQuery(p.name || '');
                            }}
                            onBlur={() => {
                              setTimeout(() => {
                                setActivePartySearchIdx(null);
                              }, 250);
                            }}
                            onChange={(e) => {
                              const val = e.target.value;
                              const newParties = [...commissionedParties];
                              newParties[idx].name = val;
                              setCommissionedParties(newParties);
                              setPartySearchQuery(val);
                            }}
                            className="w-full text-xs text-slate-600 bg-transparent border-none focus:ring-0 outline-none"
                            placeholder="Ex: Pedro, Paulo, José (digite @ para apelidos)"
                          />
                          {activePartySearchIdx === idx && (
                            <div className="absolute left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl z-50 divide-y divide-slate-100">
                              {getFilteredPartySuggestions(p.name).length === 0 ? (
                                <div className="p-3 text-xs text-slate-400 text-center">
                                  Nenhum participante encontrado
                                </div>
                              ) : (
                                getFilteredPartySuggestions(p.name).map((c) => (
                                  <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => selectPartyParticipant(idx, c)}
                                    className="w-full text-left p-2.5 hover:bg-indigo-50/50 transition-colors flex flex-col gap-0.5"
                                  >
                                    <div className="flex items-center justify-between w-full">
                                      <span className="font-bold text-xs text-slate-900">
                                        {c.nome} {c.apelido ? `(${c.apelido})` : ''}
                                      </span>
                                      {c.cargo && (
                                        <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-full font-medium">
                                          {c.cargo}
                                        </span>
                                      )}
                                    </div>
                                    {(c.gerente || c.diretor) && (
                                      <div className="text-[10px] text-slate-400 truncate">
                                        {c.gerente && `Gerente: ${c.gerente}`}
                                        {c.gerente && c.diretor && ' | '}
                                        {c.diretor && `Diretor: ${c.diretor}`}
                                      </div>
                                    )}
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </td>
                        <td className="p-4 text-center text-xs font-bold font-mono text-slate-400">
                          {count}
                        </td>
                        <td className="p-4 text-center">
                          {!isImob ? (
                            <div className="flex flex-col items-center justify-center gap-1">
                              <input
                                type="checkbox"
                                checked={isHidden}
                                onChange={(e) => {
                                  const newParties = [...commissionedParties];
                                  (newParties[idx] as any).hideAndSum = e.target.checked;
                                  setCommissionedParties(newParties);
                                }}
                                className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                                title="Ocultar cargo e somar na comissão da Imobiliária"
                              />
                              {isHidden && (
                                <span className="text-[8px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 uppercase whitespace-nowrap">
                                  Oculto
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[10px] font-medium" title="A Imobiliária absorve os valores dos cargos ocultados">-</span>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          <button 
                            onClick={() => {
                              const newParties = commissionedParties.filter((_, i) => i !== idx);
                              setCommissionedParties(newParties);
                              const sumRates = newParties.reduce((acc, cp) => acc + (cp.percentage || 0), 0);
                              setPercentualComissao(Number(sumRates.toFixed(2)));
                            }}
                            className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-center">
                <button 
                  onClick={() => setCommissionedParties([...commissionedParties, { role: 'Novo Cargo', name: '', percentage: 0, deduction: 0 }])}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-bold hover:bg-indigo-100 transition-all"
                >
                  <Plus className="w-3 h-3" />
                  ADICIONAR CARGO
                </button>
              </div>
            </div>
          </div>
        ) : rateioTab === 'especialista' ? (
          renderEspecialistaTabContent()
        ) : (
          <>
            {/* Participantes e Tetos */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Users className="w-4 h-4" /> Distribuição por Cargo & Tetos Financeiros
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {waterfallResult.participantes.map((p, idx) => {
                  const label = p.name ? `${p.role} - ${p.name}` : p.role;
                  return (
                    <div key={idx} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between relative overflow-hidden group">
                      <div className="absolute top-0 right-0 w-16 h-16 bg-slate-50 rotate-45 translate-x-8 -translate-y-8 group-hover:bg-indigo-50 transition-colors" />
                      <div className="z-10">
                        <header className="flex items-center justify-between mb-3">
                          <span className="text-[10px] font-bold text-slate-400 uppercase truncate max-w-[150px]" title={label}>{label}</span>
                          <span className="text-[10px] font-bold text-indigo-600 font-mono bg-indigo-50 px-2 py-0.5 rounded">{p.percentage.toFixed(2)}%</span>
                        </header>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-500">Recebido</span>
                            <span className="text-sm font-bold text-emerald-600 font-mono">{p.received.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-500">Teto Máx.</span>
                            <span className="text-sm font-medium text-slate-400 font-mono">{p.cap.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-4">
                        {(() => {
                          const progressPercent = p.cap > 0 ? Math.min(100, Math.round((p.received / p.cap) * 100)) : 0;
                          return (
                            <>
                              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${progressPercent}%` }}
                                  className={`h-full ${p.balance <= 0.01 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                                />
                              </div>
                              <div className="flex justify-between mt-2">
                                <span className="text-[8px] font-bold text-slate-400 uppercase">Progresso</span>
                                <span className="text-[8px] font-bold text-slate-400 font-mono">{progressPercent}%</span>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Detalhamento por Parcela */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Table className="w-4 h-4" /> Tabela de Rateio Geral (Auditoria de Fluxo)
              </h4>
              <div className="bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm overflow-x-auto">
                {(() => {
                  const partCount = waterfallResult.participantes.length;
                  const totalCols = partCount + 2;
                  const thPad = totalCols > 6 ? 'p-2 sm:px-2.5 sm:py-2' : totalCols > 4 ? 'p-2.5 sm:px-3 sm:py-2.5' : 'p-3.5 sm:px-4 sm:py-3';
                  const thFont = totalCols > 6 ? 'text-[8.5px]' : totalCols > 4 ? 'text-[9.5px]' : 'text-[10px]';
                  const tdPad = totalCols > 6 ? 'px-2 py-2' : totalCols > 4 ? 'px-2.5 py-2.5' : 'px-3.5 py-3';
                  const tdFont = totalCols > 6 ? 'text-[10px]' : totalCols > 4 ? 'text-[11px]' : 'text-xs';
                  const inputWidth = totalCols > 6 ? 'w-20 text-[10px]' : totalCols > 4 ? 'w-22 text-[10.5px]' : 'w-24 text-xs';

                  return (
                    <table className="w-full text-left border-collapse table-print font-sans">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 header-print">
                          <th className={`${thPad} ${thFont} font-bold text-slate-400 uppercase text-left align-top whitespace-nowrap min-w-[85px]`}>Vencimento</th>
                          <th className={`${thPad} ${thFont} font-bold text-indigo-600 uppercase text-right align-top whitespace-nowrap min-w-[95px]`}>Comissão Parcela</th>
                          {waterfallResult.participantes.map((p, pIdx) => {
                            const label = p.name ? `${p.role} - ${p.name}` : p.role;
                            const apelido = getParticipantApelido(p.name);
                            return (
                              <th key={pIdx} className={`${thPad} ${thFont} font-bold text-slate-400 uppercase text-right align-top min-w-[85px]`}>
                                <div className="leading-tight text-right ml-auto" title={label}>
                                  <div className="font-bold text-slate-700 dark:text-slate-200 uppercase">{p.role}</div>
                                  {apelido && (
                                    <div className="font-medium text-slate-500 normal-case mt-0.5">{apelido}</div>
                                  )}
                                </div>
                                {isEditingRateio && (
                                  <div className="mt-1.5 pt-1.5 border-t border-slate-200 text-[8.5px] font-mono normal-case text-right font-normal space-y-0.5">
                                    <div className="text-slate-500 whitespace-nowrap">
                                      Teto: <span className="font-bold text-slate-700">{p.cap.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                                    </div>
                                    <div className="text-emerald-600 whitespace-nowrap">
                                      Soma: <span className="font-bold">{p.received.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                                    </div>
                                    <div className={`whitespace-nowrap ${p.balance === 0 ? 'text-slate-400' : p.balance > 0 ? 'text-amber-600 font-bold' : 'text-rose-600 font-bold'}`}>
                                      Dif: <span>{p.balance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                                    </div>
                                  </div>
                                )}
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(() => {
                          let runningSum = 0;
                          const visibleParcelas = [];
                          for (let idx = 0; idx < waterfallResult.detalhesParcelas.length; idx++) {
                            const det = waterfallResult.detalhesParcelas[idx];
                            const correspondingSimFluxo = (simulationResult && idx < simulationResult.fluxo.length && waterfallResult.detalhesParcelas.length > 1)
                              ? simulationResult.fluxo[idx]
                              : null;

                            const vencimentoToShow = correspondingSimFluxo ? correspondingSimFluxo.vencimento : det.vencimento;
                            const valorComissaoToShow = det.valorRetido;

                            if (valorComissaoToShow > 0) {
                              visibleParcelas.push({
                                ...det,
                                originalIndex: idx,
                                vencimentoToShow,
                                valorComissaoToShow
                              });
                            }
                            runningSum = Number((runningSum + valorComissaoToShow).toFixed(2));
                            if (runningSum >= waterfallResult.comissaoTotal - 0.01 && waterfallResult.comissaoTotal > 0) {
                              break;
                            }
                          }

                          return visibleParcelas.map((det, idx) => {
                            const rowDistributedTotal: number = Object.values(det.distribuicao || {}).reduce((sum: number, v: any) => sum + (Number(v) || 0), 0) as number;
                            const isBalanced = Math.abs(rowDistributedTotal - det.valorComissaoToShow) < 0.01;

                            return (
                              <tr key={idx} className="hover:bg-indigo-50/10 transition-colors">
                                <td className={`${tdPad} ${tdFont} font-medium text-slate-700 whitespace-nowrap font-mono`}>{det.vencimentoToShow}</td>
                                <td className={`${tdPad} ${tdFont} font-bold font-mono text-right text-indigo-600 whitespace-nowrap`}>
                                  <div>{det.valorComissaoToShow.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                                  {isEditingRateio && (
                                    <div className={`text-[8.5px] font-medium mt-0.5 whitespace-nowrap ${
                                      isBalanced 
                                        ? 'text-emerald-600' 
                                        : rowDistributedTotal > det.valorComissaoToShow 
                                          ? 'text-rose-600' 
                                          : 'text-slate-400'
                                    }`}>
                                      Dist: {rowDistributedTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </div>
                                  )}
                                </td>
                                {waterfallResult.participantes.map((p, pIdx) => {
                                  const label = p.name ? `${p.role} - ${p.name}` : p.role;
                                  const val = det.distribuicao[label] || 0;
                                  return (
                                    <td key={pIdx} className={`${tdPad} ${tdFont} font-mono text-right text-slate-800 whitespace-nowrap`}>
                                      {isEditingRateio ? (
                                        <input
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          value={val === 0 ? '' : val}
                                          onChange={(e) => handleCellEdit(det.originalIndex, label, e.target.value)}
                                          className={`${inputWidth} px-1.5 py-0.5 text-right font-mono border border-slate-200 rounded focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none bg-slate-50/50`}
                                          placeholder="0,00"
                                        />
                                      ) : (
                                        val > 0 ? (
                                          <span className="tabular-nums tracking-tight font-medium">
                                            {val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                          </span>
                                        ) : (
                                          <span className="text-slate-300">-</span>
                                        )
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
            </div>

            {/* Tabela de Credenciais dos Participantes na Venda */}
            {(() => {
              const activeParticipantsList: Array<{
                nome: string;
                apelido: string;
                cpf: string;
                creci: string;
                cargo: string;
              }> = [];

              const activeParties = (commissionedParties || []).filter((p: any) => {
                if (p.hideAndSum) return false;
                const rLower = (p.role || '').toLowerCase().trim();
                if (rLower === 'imobiliária' || rLower === 'imobiliaria') return false;
                return p.name && p.name.trim() !== '' && !p.name.includes('___');
              });

              activeParties.forEach((p: any) => {
                const names = p.name.split(',');
                names.forEach((n: string) => {
                  const nameTrimmed = n.trim();
                  if (!nameTrimmed) return;

                  const existing = activeParticipantsList.find(ap => ap.nome.toLowerCase().trim() === nameTrimmed.toLowerCase());
                  if (existing) {
                    const currentRoles = existing.cargo.split(',').map((r: string) => r.trim().toLowerCase());
                    if (p.role && !currentRoles.includes(p.role.trim().toLowerCase())) {
                      existing.cargo = `${existing.cargo}, ${p.role.trim()}`;
                    }
                    return;
                  }

                  const match = cargos.find(c => 
                    (c.nome && c.nome.toLowerCase().trim() === nameTrimmed.toLowerCase()) ||
                    (c.apelido && c.apelido.toLowerCase().trim() === nameTrimmed.toLowerCase())
                  ) || cargos.find(c => 
                    c.nome && c.nome.toLowerCase().trim().startsWith(nameTrimmed.toLowerCase())
                  );

                  if (match) {
                    activeParticipantsList.push({
                      nome: match.nome,
                      apelido: match.apelido || nameTrimmed.split(' ')[0],
                      cpf: match.cpf_cnpj || '-',
                      creci: match.creci || '-',
                      cargo: p.role || match.cargo
                    });
                  } else {
                    activeParticipantsList.push({
                      nome: nameTrimmed,
                      apelido: nameTrimmed.split(' ')[0],
                      cpf: '-',
                      creci: '-',
                      cargo: p.role
                    });
                  }
                });
              });

              return (
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Users className="w-4 h-4" /> Credenciais dos Participantes na Venda (Rateio)
                  </h4>
                  <div className="bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm overflow-x-auto">
                    <table className="w-full text-left border-collapse font-sans">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="p-4 text-[10px] font-bold text-slate-400 uppercase">Nome</th>
                          <th className="p-4 text-[10px] font-bold text-slate-400 uppercase">Apelido</th>
                          <th className="p-4 text-[10px] font-bold text-slate-400 uppercase">CPF / CNPJ</th>
                          <th className="p-4 text-[10px] font-bold text-slate-400 uppercase">CRECI</th>
                          <th className="p-4 text-[10px] font-bold text-slate-400 uppercase">Cargo na Operação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {activeParticipantsList.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="p-8 text-center text-xs text-slate-400 italic">
                              Nenhum participante associado a esta venda com dados de cadastro.
                            </td>
                          </tr>
                        ) : (
                          activeParticipantsList.map((part, pIdx) => (
                            <tr key={pIdx} className="hover:bg-slate-50 transition-colors">
                              <td className="p-4 text-xs font-bold text-slate-800">{part.nome}</td>
                              <td className="p-4 text-xs text-slate-600">{part.apelido}</td>
                              <td className="p-4 text-xs font-mono text-slate-600">{part.cpf}</td>
                              <td className="p-4 text-xs font-mono text-slate-600">{part.creci}</td>
                              <td className="p-4 text-xs">
                                <div className="flex flex-wrap gap-1">
                                  {part.cargo.split(',').map((c, cIdx) => (
                                    <span key={cIdx} className="bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                                      {c.trim()}
                                    </span>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </motion.div>
    );
  };

  const renderEmpreendimentos = () => {
    return (
      <motion.div
        key="empreendimentos"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        className="space-y-8"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Gestão de Empreendimentos</h2>
            <p className="text-sm text-slate-500 mt-1">
              Cadastre e gerencie os empreendimentos disponíveis para extração.
            </p>
          </div>
          <button
            onClick={() => openEmpreendimentoModal()}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus className="w-5 h-5" />
            Novo Empreendimento
          </button>
        </div>

        <div className="glass-panel rounded-2xl overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Nome / Construtora</th>
                <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Localização</th>
                <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Status</th>
                <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {empreendimentos.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-12 text-center">
                    <div className="flex flex-col items-center">
                      <Building2 className="w-12 h-12 text-slate-200 mb-4" />
                      <p className="text-slate-400">Nenhum empreendimento cadastrado.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                empreendimentos.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-900">{emp.nome}</span>
                        <span className="text-xs text-slate-400">{emp.construtora || 'Construtora não informada'}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <span>{emp.localizacao || '-'}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider ${
                        emp.status === 'ATIVO' 
                          ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' 
                          : 'bg-slate-100 text-slate-500 border border-slate-200'
                      }`}>
                        {emp.status}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEmpreendimentoModal(emp)}
                          className="flex items-center gap-1.5 px-2 py-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all text-[10px] font-bold"
                          title="Configurar Regras de Dedução"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          REGRAS
                        </button>
                        <div className="w-[1px] h-4 bg-slate-100 mx-1"></div>
                        <button
                          onClick={() => openEmpreendimentoModal(emp)}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                          title="Editar Dados Gerais"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteEmpreendimento(emp.id)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Modal Empreendimento */}
        {showEmpreendimentoModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-100"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900">
                      {editingEmpreendimento ? 'Editar Empreendimento' : 'Novo Empreendimento'}
                    </h3>
                    <p className="text-xs text-slate-400">Preencha os dados básicos do imóvel</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowEmpreendimentoModal(false)}
                  className="p-2 hover:bg-slate-50 rounded-xl transition-all text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nome do Empreendimento</label>
                  <input
                    type="text"
                    value={empreendimentoForm.nome}
                    onChange={(e) => setEmpreendimentoForm(prev => ({ ...prev, nome: e.target.value }))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-400 text-sm font-medium"
                    placeholder="Ex: Reserva Mata Atântica"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Construtora</label>
                  <input
                    type="text"
                    value={empreendimentoForm.construtora}
                    onChange={(e) => setEmpreendimentoForm(prev => ({ ...prev, construtora: e.target.value }))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-400 text-sm font-medium"
                    placeholder="Ex: R&J Construtora"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Localização / Cidade</label>
                  <input
                    type="text"
                    value={empreendimentoForm.localizacao}
                    onChange={(e) => setEmpreendimentoForm(prev => ({ ...prev, localizacao: e.target.value }))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-400 text-sm font-medium"
                    placeholder="Ex: Guarulhos - SP"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Endereço do Empreendimento</label>
                  <input
                    type="text"
                    value={empreendimentoForm.endereco || ''}
                    onChange={(e) => setEmpreendimentoForm(prev => ({ ...prev, endereco: e.target.value }))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-400 text-sm font-medium"
                    placeholder="Ex: Av. Tiradentes, 1500, Jardim Bom Clima, Guarulhos - SP"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</label>
                    <select
                      value={empreendimentoForm.status}
                      onChange={(e) => setEmpreendimentoForm(prev => ({ ...prev, status: e.target.value as any }))}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all text-sm font-medium"
                    >
                      <option value="ATIVO">ATIVO</option>
                      <option value="INATIVO">INATIVO</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Regras de Comissão (Dedução)</label>
                    <button 
                      onClick={addRegraComissao}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-all"
                      type="button"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Regra
                    </button>
                  </div>
                  
                  <div className="space-y-3 max-h-48 overflow-y-auto px-1">
                    {empreendimentoForm.regras_comissao.length === 0 ? (
                      <p className="text-center py-4 text-xs text-slate-400 italic bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                        Nenhuma regra personalizada. O sistema usará o padrão (abatimento 100% de parcelas elegíveis).
                      </p>
                    ) : (
                      empreendimentoForm.regras_comissao.map((regra, idx) => (
                        <div key={idx} className="flex gap-2 items-end bg-slate-50 p-3 rounded-xl border border-slate-100 relative group">
                          <div className="flex-1 space-y-1">
                            <label className="text-[9px] font-bold text-slate-400 uppercase">Parcela</label>
                            <input 
                              type="text"
                              value={regra.parcela}
                              onChange={(e) => updateRegraComissao(idx, 'parcela', e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-500"
                              placeholder="Ex: Ato"
                            />
                          </div>
                          <div className="w-20 space-y-1">
                            <label className="text-[9px] font-bold text-slate-400 uppercase">Tipo</label>
                            <select 
                              value={regra.tipo_deducao}
                              onChange={(e) => updateRegraComissao(idx, 'tipo_deducao', e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-500"
                            >
                              <option value="PERCENTUAL">%</option>
                              <option value="VALOR">R$</option>
                            </select>
                          </div>
                          <div className="w-24 space-y-1">
                            <label className="text-[9px] font-bold text-slate-400 uppercase">Valor</label>
                            <input 
                              type="number"
                              value={regra.valor_deducao}
                              onChange={(e) => updateRegraComissao(idx, 'valor_deducao', parseFloat(e.target.value) || 0)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-500"
                            />
                          </div>
                          <button 
                            onClick={() => removeRegraComissao(idx)}
                            className="p-2 text-slate-400 hover:text-red-500 transition-all mb-0.5"
                            type="button"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Modelo de Rateio de Comissão */}
                <div className="space-y-4 pt-4 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-bold">Modelo de Rateio de Comissão</label>
                      <span className="text-[10px] text-slate-400 font-medium">Configure os cargos, comissões e nomes padrão para este empreendimento.</span>
                    </div>
                    <button 
                      onClick={addModeloRateio}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-all"
                      type="button"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Cargo
                    </button>
                  </div>
                  
                  <div className="space-y-3 max-h-60 overflow-y-auto px-1">
                    {(!empreendimentoForm.modelo_rateio || empreendimentoForm.modelo_rateio.length === 0) ? (
                      <p className="text-center py-4 text-xs text-slate-400 italic bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                        Nenhum modelo de rateio customizado. Os campos da proposta serão mantidos ou o preenchimento será manual.
                      </p>
                    ) : (
                      <div className="border border-slate-100 rounded-xl overflow-hidden bg-slate-50/30">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider text-[9px] border-b border-slate-100">
                              <th className="p-2.5 pl-3">Cargo</th>
                              <th className="p-2.5 w-28 text-center">Taxa Comissão (%)</th>
                              <th className="p-2.5">Nome (Opcional)</th>
                              <th className="p-2.5 w-10 text-center"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {empreendimentoForm.modelo_rateio.map((item, idx) => (
                              <tr key={idx} className="hover:bg-white transition-colors">
                                <td className="p-2">
                                  <input 
                                    type="text"
                                    value={item.cargo}
                                    onChange={(e) => updateModeloRateio(idx, 'cargo', e.target.value)}
                                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 outline-none focus:border-indigo-500"
                                    placeholder="Ex: Corretor"
                                    required
                                  />
                                </td>
                                <td className="p-2">
                                  <input 
                                    type="number"
                                    step="0.01"
                                    value={item.taxa_comissao}
                                    onChange={(e) => updateModeloRateio(idx, 'taxa_comissao', parseFloat(e.target.value) || 0)}
                                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono text-center text-indigo-600 outline-none focus:border-indigo-500"
                                    placeholder="0.00"
                                  />
                                </td>
                                <td className="p-2">
                                  <input 
                                    type="text"
                                    value={item.nome || ''}
                                    onChange={(e) => updateModeloRateio(idx, 'nome', e.target.value)}
                                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-600 outline-none focus:border-indigo-500"
                                    placeholder="Nome do colaborador..."
                                  />
                                </td>
                                <td className="p-2 text-center">
                                  <button 
                                    onClick={() => removeModeloRateio(idx)}
                                    className="p-1.5 text-slate-400 hover:text-red-500 transition-all rounded-lg hover:bg-slate-50"
                                    type="button"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-6 bg-slate-50 flex items-center justify-end gap-3">
                <button
                  onClick={() => setShowEmpreendimentoModal(false)}
                  className="px-6 py-2.5 text-slate-500 font-semibold hover:text-slate-700 transition-all text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={saveEmpreendimento}
                  disabled={isLoadingEmpreendimentos}
                  className="flex items-center gap-2 px-8 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50"
                >
                  {isLoadingEmpreendimentos && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingEmpreendimento ? 'Salvar Alterações' : 'Cadastrar Empreendimento'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </motion.div>
    );
  };

  const handleCopyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text).then(() => {
      showToast(`${fieldName} copiado para a área de transferência!`, 'success');
    }).catch(err => {
      console.error('Erro ao copiar:', err);
      showToast('Falha ao copiar.', 'error');
    });
  };

  const handleAutoSendEmail = async () => {
    if (!emailModalData) return;
    setIsSendingEmail(true);
    setGmailApiError(null);
    try {
      const { isAuthenticated } = await safeFetchJson('/api/auth/google/status', { credentials: 'include' }).catch(() => ({ isAuthenticated: false }));

      if (!isAuthenticated) {
        showToast('Por favor, faça login com a conta Google para autorizar o envio de e-mails.', 'info');
        const { url } = await safeFetchJson('/api/auth/google/url', { credentials: 'include' });
        window.open(url, 'google_auth', 'width=600,height=700');
        setIsSendingEmail(false);
        return;
      }

      showToast('Compilando PDF "Ficha + DOCS" em segundo plano...', 'info');
      const pdfBytes = await compileUnifiedFichaBlob(emailModalData.extraction);
      
      // Convert ArrayBuffer to Base64
      let binary = "";
      const len = pdfBytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(pdfBytes[i]);
      }
      const base64Pdf = window.btoa(binary);

      const customers = (emailModalData.extraction?.customers || []).filter(Boolean);
      const fileName = customers[0]?.nome 
        ? `ficha_completa_${customers[0].nome.replace(/\s+/g, '_').toLowerCase()}.pdf`
        : `ficha_completa_${emailModalData.extraction?.property?.unidade || 'sem_unidade'}.pdf`;

      // Convert other extracted/uploaded files to base64
      showToast('Processando documentos para anexo...', 'info');
      const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => {
            const resultStr = reader.result as string;
            const commaIndex = resultStr.indexOf(',');
            if (commaIndex !== -1) {
              resolve(resultStr.substring(commaIndex + 1));
            } else {
              resolve(resultStr);
            }
          };
          reader.onerror = error => reject(error);
        });
      };

      const otherAttachments = [];
      const filesToAttach = docs.filter(d => d.file).map(d => d.file as File);
      for (const file of filesToAttach) {
        try {
          const content = await fileToBase64(file);
          otherAttachments.push({
            filename: file.name,
            content: content,
            contentType: file.type || "application/octet-stream"
          });
        } catch (err) {
          console.error(`Erro ao converter arquivo ${file.name} para Base64:`, err);
        }
      }

      showToast('Enviando e-mail automaticamente via Gmail...', 'info');
      const response = await fetch("/api/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          to: emailModalData.to,
          subject: emailModalData.subject,
          body: emailModalData.body,
          attachmentBase64: base64Pdf,
          attachmentName: fileName,
          attachments: otherAttachments,
          driveFolderUrl: emailModalData.extraction?.drive_link
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 401) {
          const { url } = await safeFetchJson('/api/auth/google/url', { credentials: 'include' });
          window.open(url, 'google_auth', 'width=600,height=700');
          throw new Error("Sua sessão do Google expirou ou precisa de autorização. Por favor, faça login na janela aberta e tente novamente.");
        }
        if (response.status === 403) {
          const apiLink = errorData.link || "https://console.cloud.google.com/apis/library/gmail.googleapis.com";
          const errMsg = errorData.error || "A API do Gmail não está habilitada no seu projeto do Google Cloud.";
          setGmailApiError({
            message: errMsg,
            link: apiLink
          });
          throw new Error(errMsg);
        }
        throw new Error(errorData.error || `Erro HTTP ${response.status}`);
      }

      showToast('E-mail enviado com sucesso diretamente!', 'success');
      alert('Seu e-mail contendo a "Ficha + DOCS" foi enviado automaticamente para secvendas.rej@gmail.com (sem a necessidade de realizar o download)!');
      setEmailModalData(null);
    } catch (err: any) {
      console.error('Erro ao enviar e-mail:', err);
      showToast(err.message || 'Falha ao enviar e-mail.', 'error');
    } finally {
      setIsSendingEmail(false);
    }
  };

  const renderEmailModal = () => {
    if (!emailModalData) return null;

    const { to, subject, body } = emailModalData;
    
    const mailtoUrl = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    const handleLaunchMailClient = () => {
      try {
        const a = document.createElement('a');
        a.href = mailtoUrl;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch (err) {
        window.open(mailtoUrl, '_blank');
      }
      showToast('Abrindo aplicativo de e-mail local...');
    };

    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-100"
        >
          {/* Modal Header */}
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center animate-pulse">
                <Mail className="w-5 h-5 text-violet-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 leading-tight">Enviar Ficha + DOC por E-mail</h3>
                <p className="text-xs text-slate-400">Envie os dados e o PDF compilado "Ficha + DOCS" automaticamente para formalização direta</p>
              </div>
            </div>
            <button 
              onClick={() => setEmailModalData(null)}
              className="p-2 hover:bg-slate-100 rounded-xl transition-all text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Modal Content */}
          <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm text-slate-600">
            {gmailApiError && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="font-bold text-red-800 text-sm">A API do Gmail está desabilitada</h4>
                    <p className="text-xs text-red-700 leading-relaxed">
                      Para esta conta enviar e-mails automaticamente, você precisa habilitar a API do Gmail no Console de Desenvolvedores do Google.
                    </p>
                  </div>
                </div>
                {gmailApiError.link && (
                  <div className="pt-1">
                    <a
                      href={gmailApiError.link}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      CLIQUE AQUI PARA HABILITAR A API DO GMAIL
                    </a>
                  </div>
                )}
              </div>
            )}

            {emailModalData.extraction && (
              <div className="bg-gradient-to-br from-indigo-50/50 to-violet-50/50 border border-violet-100/60 rounded-2xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h4 className="font-bold text-slate-900 flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-600"></span>
                      </span>
                      Envio de E-mail Automático (Gmail)
                    </h4>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      O arquivo compilado <span className="font-semibold text-slate-700">Ficha + DOCS</span> será gerado e enviado de forma 100% automatizada por e-mail para <span className="font-semibold text-violet-600">secvendas.rej@gmail.com</span>, sem a necessidade de fazer o download do arquivo.
                    </p>

                    {/* Visual confirmation of attachments */}
                    <div className="mt-4 border-t border-dashed border-slate-200/80 pt-3">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                        <FileText className="w-3.5 h-3.5 text-indigo-500" />
                        Anexos adicionais que serão integrados no e-mail:
                      </span>
                      {docs.some(d => d.file) ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                          {docs.filter(d => d.file).map((doc) => (
                            <div key={doc.id} className="flex items-center gap-2 bg-white/70 border border-slate-100 rounded-xl p-2 md:p-2.5">
                              <div className="p-1 px-1.5 bg-indigo-50 text-indigo-600 rounded-lg shrink-0">
                                <FileText className="w-3.5 h-3.5" />
                              </div>
                              <div className="min-w-0 flex-grow">
                                <p className="text-[11px] font-bold text-slate-700 truncate">{doc.file?.name}</p>
                                <p className="text-[9px] text-slate-400">
                                  {doc.file?.size ? (doc.file.size / 1024).toFixed(0) + ' KB' : ''} • {doc.name}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : emailModalData.extraction?.drive_link ? (
                        <div className="bg-emerald-50/50 border border-emerald-100/60 rounded-xl p-3 flex items-start gap-2.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-[11px] font-bold text-emerald-800 leading-none">Pasta vinculada ao Drive ativada</p>
                            <p className="text-[10px] text-emerald-600/90 mt-1 leading-relaxed">
                              Como esta é uma consulta histórica, resgataremos e anexaremos automaticamente os documentos salvos nesta pasta vinculada do Drive.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-400 italic">Nenhum documento carregado para anexo individual.</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={handleAutoSendEmail}
                    disabled={isSendingEmail}
                    className="w-full sm:w-auto shrink-0 flex items-center justify-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold text-xs rounded-xl shadow-lg transition-all active:scale-95 text-center min-w-[170px]"
                  >
                    {isSendingEmail ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ENVIANDO...
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        ENVIAR POR E-MAIL
                      </>
                    )}
                  </button>
                </div>

                <div className="border-t border-violet-100/60 pt-3 space-y-2.5">
                  <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Ações alternativas:</h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="bg-white/80 border border-slate-100 p-3 rounded-xl space-y-1">
                      <span className="font-mono font-bold text-xs text-violet-600 bg-violet-50 px-2 py-0.5 rounded-lg">A</span>
                      <p className="text-slate-600 font-medium">Assegure que compradores e preços estejam corretos antes de disparar.</p>
                    </div>
                    <div className="bg-white/80 border border-slate-100 p-3 rounded-xl space-y-1 flex items-center justify-between gap-2">
                      <div>
                        <span className="font-mono font-bold text-xs text-violet-600 bg-violet-50 px-2 py-0.5 rounded-lg mr-2">B</span>
                        <span className="text-slate-600 font-medium">Se deseja consultar o arquivo localmente:</span>
                      </div>
                      <button
                        onClick={() => generateUnifiedFicha(emailModalData.extraction)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 text-violet-700 border border-violet-100 font-bold hover:bg-violet-100 text-[10px] rounded-lg transition-all shrink-0"
                      >
                        <Download className="w-3 h-3" />
                        BAIXAR PDF
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4">
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                Opção Alternativa (Envio manual): se preferir, você também pode abrir seu e-mail local ou Gmail para colar e enviar os dados manualmente.
              </p>
            </div>

            {/* Direct Send Methods */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={handleLaunchMailClient}
                className="flex items-center justify-center gap-3 p-4 bg-violet-50 text-violet-700 hover:bg-violet-100 rounded-2xl font-bold transition-all border border-violet-100 active:scale-95 shadow-sm"
              >
                <Mail className="w-5 h-5 shrink-0" />
                <div className="text-left">
                  <div className="text-sm">Aplicativo de E-mail</div>
                  <div className="text-[10px] font-normal text-violet-500">Abre Outlook, Mail, etc.</div>
                </div>
              </button>
              
              <a
                href={gmailUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-3 p-4 bg-red-50 text-red-700 hover:bg-red-100 rounded-2xl font-bold transition-all border border-red-100 active:scale-95 shadow-sm text-center"
              >
                <ExternalLink className="w-5 h-5 shrink-0" />
                <div className="text-left">
                  <div className="text-sm">Abrir no Gmail</div>
                  <div className="text-[10px] font-normal text-red-500">Prefere pelo seu navegador? Use o Gmail</div>
                </div>
              </a>
            </div>

            {/* Manual fields to copy */}
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-2">
                <span className="h-px bg-slate-200 flex-grow" />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">Ou copie os dados para seu e-mail</span>
                <span className="h-px bg-slate-200 flex-grow" />
              </div>
              
              {/* Para */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">DESTINATÁRIO (PARA):</label>
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="font-mono text-xs text-slate-700 flex-grow select-all">{to}</span>
                  <button
                    onClick={() => handleCopyToClipboard(to, 'Destinatário')}
                    className="p-1.5 hover:bg-slate-200 rounded-lg transition-all text-slate-500 flex items-center justify-center shrink-0"
                    title="Copiar Destinatário"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Assunto */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">ASSUNTO DO E-MAIL:</label>
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="text-xs font-bold text-slate-800 flex-grow select-all">{subject}</span>
                  <button
                    onClick={() => handleCopyToClipboard(subject, 'Assunto')}
                    className="p-1.5 hover:bg-slate-200 rounded-lg transition-all text-slate-500 shrink-0"
                    title="Copiar Assunto"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Corpo */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">CONTEÚDO DO CORPO:</label>
                  <button
                    onClick={() => handleCopyToClipboard(body, 'Corpo do e-mail')}
                    className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-bold transition-all shadow-sm"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    COPIAR CORPUS INTEIRO
                  </button>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 font-mono text-xs text-slate-700 whitespace-pre-wrap max-h-48 overflow-y-auto select-all leading-relaxed">
                  {body}
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3 shrink-0">
            <button
              onClick={() => setEmailModalData(null)}
              className="px-6 py-2.5 bg-slate-200 hover:bg-slate-300 transition-all font-bold text-slate-700 text-xs rounded-xl"
            >
              FECHAR JANELA
            </button>
          </div>
        </motion.div>
      </div>
    );
  };

  const renderSettingsModal = () => {
    if (!showSettingsModal) return null;

    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] border border-slate-100"
        >
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
             <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                <Settings className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 leading-tight">Configurações do Sistema</h3>
                <p className="text-xs text-slate-400">Gerenciar periodicidade e descrições de parcelas</p>
              </div>
            </div>
            <button 
              onClick={() => setShowSettingsModal(false)}
              className="p-2 hover:bg-slate-100 rounded-xl transition-all text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 overflow-y-auto space-y-8 flex-1">
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-slate-800">Periodicidade de Parcelas</h4>
                  <p className="text-xs text-slate-500">Configure como o sistema reconhece e calcula os intervalos das parcelas na simulação detalhada.</p>
                </div>
                <button
                  onClick={() => setEditingConfig({ descricao: '', periodicidade: 1 })}
                  className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  ADICIONAR
                </button>
              </div>

              {editingConfig && (
                <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 space-y-4 animate-in slide-in-from-top duration-300">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Descrição (Termo identificador)</label>
                      <input
                        type="text"
                        value={editingConfig.descricao}
                        onChange={(e) => setEditingConfig({ ...editingConfig, descricao: e.target.value })}
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all text-sm font-medium"
                        placeholder="Ex: Anual, Semestral, Reforço..."
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Periodicidade (Meses)</label>
                      <input
                        type="number"
                        min="1"
                        max="60"
                        value={editingConfig.periodicidade}
                        onChange={(e) => setEditingConfig({ ...editingConfig, periodicidade: parseInt(e.target.value) || 1 })}
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all text-sm font-medium"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      onClick={() => setEditingConfig(null)}
                      className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700"
                    >
                      CANCELAR
                    </button>
                    <button
                      onClick={saveConfig}
                      disabled={isSavingSettings || !editingConfig.descricao}
                      className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 shadow-md shadow-indigo-100 disabled:opacity-50"
                    >
                      {isSavingSettings && <Loader2 className="w-3 h-3 animate-spin" />}
                      SALVAR CONFIGURAÇÃO
                    </button>
                  </div>
                </div>
              )}

              <div className="overflow-hidden glass-panel border-slate-100 rounded-2xl">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100">
                      <th className="py-3 px-4 font-bold text-slate-500 uppercase tracking-widest text-[9px]">Termo na Parcela</th>
                      <th className="py-3 px-4 font-bold text-slate-500 uppercase tracking-widest text-[9px]">Periodicidade</th>
                      <th className="py-3 px-4 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {installmentConfigs.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="py-8 text-center text-slate-400 italic">Nenhuma configuração personalizada definida.</td>
                      </tr>
                    ) : (
                      installmentConfigs.map((cfg) => (
                        <tr key={cfg.id} className="group hover:bg-slate-50/50 transition-colors">
                          <td className="py-3.5 px-4 font-semibold text-slate-700">{cfg.descricao}</td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1.5 font-mono text-indigo-600 font-bold bg-indigo-50 px-2.5 py-0.5 rounded-full w-fit">
                              <Clock className="w-3 h-3" />
                              {cfg.periodicidade} {cfg.periodicidade === 1 ? 'mês' : 'meses'}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => setEditingConfig(cfg)}
                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-lg transition-all"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => deleteConfig(cfg.id)}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-white rounded-lg transition-all"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="space-y-4 pt-6 border-t border-slate-100">
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-indigo-600" />
                  Integração Asaas
                </h4>
                <p className="text-xs text-slate-500">Configure suas credenciais da API do Asaas para automatizar a cobrança e o split/repasse de comissões.</p>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Token de API (access_token)</label>
                    <input
                      type="password"
                      value={asaasToken}
                      onChange={(e) => {
                        const val = e.target.value;
                        setAsaasToken(val);
                        localStorage.setItem('rj_asaas_token', val);
                      }}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all text-sm font-medium font-mono"
                      placeholder="Insira o token de API do Asaas..."
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Ambiente da API</label>
                    <select
                      value={asaasEnv}
                      onChange={(e) => {
                        const val = e.target.value as 'sandbox' | 'production';
                        setAsaasEnv(val);
                        localStorage.setItem('rj_asaas_env', val);
                      }}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all text-sm font-medium"
                    >
                      <option value="sandbox">Homologação / Sandbox</option>
                      <option value="production">Produção / Real</option>
                    </select>
                  </div>
                </div>
                {!asaasToken && (
                  <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 flex items-start gap-2.5">
                    <div className="p-1 bg-amber-100 rounded-lg text-amber-700 shrink-0">
                      <Clock className="w-3.5 h-3.5 animate-pulse" />
                    </div>
                    <p className="text-[11px] text-amber-700 font-medium leading-relaxed">
                      <strong>Modo de Simulação Ativo:</strong> Como você não forneceu uma chave Asaas real, o sistema operará no modo simulador local. Você poderá criar cobranças, simular recebimentos por PIX/Boleto e realizar pagamentos fictícios aos corretores para homologar as regras de rateio.
                    </p>
                  </div>
                )}
              </div>
            </section>
          </div>

          <div className="p-6 bg-slate-50 flex items-center justify-between shrink-0">
            <p className="text-[10px] text-slate-400 font-medium">As alterações afetam apenas novas simulações geradas.</p>
            <button
              onClick={() => setShowSettingsModal(false)}
              className="px-8 py-2.5 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all text-sm shadow-lg shadow-slate-200"
            >
              Concluído
            </button>
          </div>
        </motion.div>
      </div>
    );
  };

  const renderUsers = () => (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-6 border-bottom border-slate-100 flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Gerenciamento de Usuários</h2>
          <p className="text-slate-500 text-sm">Altere os níveis de permissão dos colaboradores.</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
            <tr>
              <th className="px-6 py-4">Usuário</th>
              <th className="px-6 py-4">Email</th>
              <th className="px-6 py-4">Perfil Atual</th>
              <th className="px-6 py-4 text-right">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {allUsers.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    {u.photoURL ? (
                      <img src={u.photoURL} alt="" className="w-8 h-8 rounded-full border border-slate-200" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                        <Users className="w-4 h-4" />
                      </div>
                    )}
                    <span className="font-medium text-slate-700">{u.displayName || 'Sem nome'}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-slate-600">{u.email}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${
                    u.role === 'admin' ? 'bg-indigo-50 text-indigo-600' :
                    u.role === 'EV' ? 'bg-amber-50 text-amber-600' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {u.role?.toUpperCase()}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <select 
                    value={u.role} 
                    onChange={(e) => updateUserRole(u.id, e.target.value as any)}
                    className="text-xs border border-slate-200 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="user">User</option>
                    <option value="EV">EV (Somente eu)</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Authentication methods and settings guidance */}
      <div className="p-6 bg-slate-50/80 border-t border-slate-100">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 mt-0.5">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="space-y-2 text-xs text-slate-600">
            <h4 className="text-sm font-bold text-slate-800">Métodos de Autenticação Disponíveis</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <div className="p-3 bg-white rounded-xl border border-slate-200/80 shadow-xs">
                <div className="flex items-center gap-2 font-semibold text-slate-800 mb-1">
                  <Mail className="w-4 h-4 text-emerald-600" />
                  <span>E-mail e Senha (Sem Authenticator)</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Permite aos usuários acessarem e criarem conta diretamente com senha cadastrada. <strong>Não exige código de 2FA nem aplicativo Google Authenticator.</strong>
                </p>
              </div>

              <div className="p-3 bg-white rounded-xl border border-slate-200/80 shadow-xs">
                <div className="flex items-center gap-2 font-semibold text-slate-800 mb-1">
                  <Users className="w-4 h-4 text-indigo-600" />
                  <span>Conta Google (SSO)</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Acesso rápido via popup do Google. Caso o usuário tenha Verificação em Duas Etapas configurada na sua conta Google, ela será solicitada pelo Google.
                </p>
              </div>
            </div>

            <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-100/80 text-[11px] text-indigo-900 mt-2">
              <strong>Onde gerenciar os métodos no Firebase:</strong> No Firebase Console do projeto (<code className="font-mono bg-indigo-100/80 px-1 py-0.5 rounded">gen-lang-client-0830787405</code>), acesse <strong>Authentication &gt; Sign-in method</strong> para ativar, desativar ou configurar novos provedores de acesso.
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderCargos = () => {
    const CARGOS_ESTRUTURAIS = [
      { nome: 'corretor', desc: 'Profissional de vendas responsável pelo atendimento direto ao cliente, intermediação e negociação imobiliária.' },
      { nome: 'gerente', desc: 'Líder imediato de equipe de corretores, responsável pelo suporte em fechamentos de propostas e acompanhamento de metas.' },
      { nome: 'diretor de vendas', desc: 'Diretor estratégico responsável por coordenar as equipes de vendas, campanhas comerciais e aprovações especiais.' },
      { nome: 'coordenador', desc: 'Profissional de suporte operacional e coordenação logística de plantões de atendimento e escalas de equipes.' },
      { nome: 'gerente de produto', desc: 'Especialista responsável pelas características técnicas do empreendimento e interface com a incorporadora.' },
      { nome: 'diretor de produto', desc: 'Diretoria focada no planejamento, viabilidade técnica, design arquitetônico e inteligência de mercado do produto.' },
      { nome: 'diretor comercial', desc: 'Diretor encarregado das parcerias comerciais estratégicas, canais de vendas, regras de comissão e política comercial global.' },
      { nome: 'Imobiliária', desc: 'Entidade imobiliária (PJ) responsável pela coordenação de toda a operação de vendas e repasses legais.' },
    ];

    const filteredCargos = cargos.filter(c => {
      const q = searchQuery.toLowerCase();
      return (
        c.nome?.toLowerCase().includes(q) ||
        c.apelido?.toLowerCase().includes(q) ||
        c.cargo?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.cpf_cnpj?.toLowerCase().includes(q)
      );
    });

    return (
      <motion.div
        key="cargos"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        className="space-y-8"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Gestão de Cargos e Participantes</h2>
            <p className="text-sm text-slate-500 mt-1 font-sans">
              Cadastre e gerencie a base de cargos, corretores, gerentes, diretores e participantes das comissões.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              ref={cargoFileInputRef}
              onChange={handleBulkImport}
              accept=".csv"
              className="hidden"
            />
            {cargosTab === 'participantes' && (
              <>
                <button
                  onClick={downloadTemplateCSV}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-750 hover:text-slate-900 rounded-xl font-semibold hover:bg-slate-50 transition-all shadow-sm active:scale-[0.98] text-xs font-sans"
                  title="Baixar planilha CSV de modelo para preenchimento"
                >
                  <Download className="w-4 h-4 text-slate-500" />
                  Planilha Modelo
                </button>
                <button
                  onClick={() => cargoFileInputRef.current?.click()}
                  disabled={isLoadingCargos}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-750 hover:text-slate-900 rounded-xl font-semibold hover:bg-slate-50 transition-all shadow-sm active:scale-[0.98] disabled:opacity-50 text-xs font-sans"
                  title="Carregar arquivo CSV com múltiplos participantes"
                >
                  {isLoadingCargos ? (
                    <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4 text-slate-500" />
                  )}
                  Carregar em Massa
                </button>
              </>
            )}
            <button
              onClick={() => openCargoModal()}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 hover:scale-[1.02] active:scale-[0.98] text-xs font-sans"
            >
              <Plus className="w-4 h-4" />
              Novo Cargo / Participante
            </button>
          </div>
        </div>

        {/* Sub-navegação interna de abas de cargos */}
        <div className="flex border-b border-slate-200 gap-6 shrink-0">
          <button
            onClick={() => setCargosTab('lista_cargos')}
            className={`pb-4 px-1 border-b-2 font-bold text-sm transition-all flex items-center gap-2 ${
              cargosTab === 'lista_cargos'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <Briefcase className="w-4 h-4" />
            Lista de Cargos
          </button>
          <button
            onClick={() => setCargosTab('participantes')}
            className={`pb-4 px-1 border-b-2 font-bold text-sm transition-all flex items-center gap-2 ${
              cargosTab === 'participantes'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <Users className="w-4 h-4" />
            Participantes Cadastrados
          </button>
        </div>

        {cargosTab === 'lista_cargos' ? (
          <div className="space-y-6">
            <div className="p-4 bg-slate-50/50 border border-slate-100 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <p className="text-xs text-slate-500 leading-relaxed max-w-2xl font-sans">
                Abaixo estão listados os cargos estruturais fundamentais para a distribuição de comissões. Visualize a quantidade de profissionais ativos cadastrados em cada função, filtre os cadastrados na tabela ou adicione novos participantes.
              </p>
              <div className="shrink-0 text-xs font-semibold text-slate-400 font-sans">
                Total: <strong className="text-indigo-600">{CARGOS_ESTRUTURAIS.length}</strong> cargos fundamentais
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 font-sans">
              {CARGOS_ESTRUTURAIS.map((cargo, idx) => {
                const count = cargos.filter(c => c.cargo?.toLowerCase().trim() === cargo.nome.toLowerCase().trim()).length;
                return (
                  <div key={idx} className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between hover:border-indigo-100 group">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50/70 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-all">
                          <Briefcase className="w-5 h-5 text-indigo-600 group-hover:text-white transition-colors" />
                        </div>
                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                          count > 0 ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'bg-slate-50 text-slate-400 border border-slate-100'
                        }`}>
                          {count} {count === 1 ? 'cadastrado' : 'cadastrados'}
                        </span>
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 capitalize tracking-tight">{cargo.nome}</h4>
                        <p className="text-xs text-slate-400 mt-2 leading-relaxed min-h-[48px]">{cargo.desc}</p>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-6 pt-4 border-t border-slate-50">
                      <button
                        onClick={() => {
                          setSearchQuery(cargo.nome);
                          setCargosTab('participantes');
                        }}
                        className="flex-1 text-center py-2 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5"
                      >
                        <Search className="w-3.5 h-3.5" />
                        Ver cadastrados
                      </button>
                      <button
                        onClick={() => openCargoModal(undefined, cargo.nome)}
                        className="p-2 bg-indigo-50 hover:bg-indigo-600 text-indigo-600 hover:text-white rounded-xl transition-all"
                        title="Adicionar Novo Participante com este cargo"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Search Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="relative max-w-md flex-1">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                  <Search className="w-5 h-5" />
                </span>
                <input
                  type="text"
                  placeholder="Buscar por nome, apelido, cargo..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-sans text-slate-800"
                />
              </div>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 self-start sm:self-center font-sans"
                >
                  Limpar busca
                </button>
              )}
            </div>

            <div className="glass-panel rounded-2xl overflow-hidden border border-slate-200 shadow-sm overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Nome / Apelido</th>
                    <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Cargo / Equipe</th>
                    <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Documentos</th>
                    <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Contato</th>
                    <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest">PIX</th>
                    <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCargos.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-12 text-center">
                        <div className="flex flex-col items-center">
                          <Users className="w-12 h-12 text-slate-200 mb-4" />
                          <p className="text-slate-400 font-sans">Nenhum cargo/participante encontrado.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredCargos.map((cargo) => (
                      <tr key={cargo.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-4 font-sans">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-900">{cargo.nome}</span>
                            {cargo.apelido && (
                              <span className="text-xs text-slate-500">Apelido: {cargo.apelido}</span>
                            )}
                          </div>
                        </td>
                        <td className="p-4 font-sans">
                          <div className="flex flex-col">
                            <span className="font-semibold text-indigo-600 text-xs bg-indigo-50 px-2 py-0.5 rounded-full w-fit">
                              {cargo.cargo || 'Não definido'}
                            </span>
                            {(cargo.gerente || cargo.diretor) && (
                              <span className="text-[10px] text-slate-400 mt-1">
                                {cargo.gerente && `Gerente: ${cargo.gerente}`}
                                {cargo.gerente && cargo.diretor && ' | '}
                                {cargo.diretor && `Diretor: ${cargo.diretor}`}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex flex-col text-xs font-mono text-slate-600 gap-0.5">
                            {cargo.creci && (
                              <span>CRECI: <span className="font-semibold">{cargo.creci}</span></span>
                            )}
                            {cargo.cpf_cnpj && (
                              <span>CPF/CNPJ: <span className="font-semibold">{cargo.cpf_cnpj}</span></span>
                            )}
                            {!cargo.creci && !cargo.cpf_cnpj && <span className="text-slate-400">-</span>}
                          </div>
                        </td>
                        <td className="p-4 text-xs font-sans">
                          <div className="flex flex-col gap-0.5 text-slate-600">
                            {cargo.telefone && (
                              <span className="flex items-center gap-1">
                                <span className="font-medium text-slate-800">{cargo.telefone}</span>
                              </span>
                            )}
                            {cargo.email && (
                              <span className="text-slate-400">{cargo.email}</span>
                            )}
                            {!cargo.telefone && !cargo.email && <span className="text-slate-400">-</span>}
                          </div>
                        </td>
                        <td className="p-4 font-sans">
                          {cargo.pix ? (
                            <span className="font-mono text-xs text-indigo-600 bg-indigo-50/50 px-2 py-1 rounded border border-indigo-100/30">
                              {cargo.pix}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400 italic">Não informado</span>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-2 font-sans">
                            <button
                              onClick={() => openCargoModal(cargo)}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                              title="Editar"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => deleteCargo(cargo.id)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                              title="Excluir"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </motion.div>
    );
  };

  const renderAsaas = () => {
    const isSandbox = asaasEnv === 'sandbox';
    const isMock = !asaasToken;

    const handleCreateCustomerSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsLoadingAsaas(true);
      try {
        const res = await fetch('/api/asaas/customers/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiToken: asaasToken,
            isSandbox,
            name: customerForm.name,
            cpfCnpj: customerForm.cpfCnpj,
            email: customerForm.email,
            phone: customerForm.phone
          })
        });
        const data = await res.json();
        if (data.success) {
          showToast('Cliente cadastrado com sucesso!', 'success');
          setShowNewAsaasCustomerModal(false);
          setCustomerForm({ name: '', cpfCnpj: '', email: '', phone: '' });
          syncAsaas();
        } else {
          showToast(data.error || 'Erro ao cadastrar cliente no Asaas', 'error');
        }
      } catch (err) {
        showToast('Erro ao cadastrar cliente', 'error');
      } finally {
        setIsLoadingAsaas(false);
      }
    };

    const handleCreatePaymentSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!paymentForm.customerId && !paymentForm.customerName) {
        showToast('Selecione ou informe um cliente para cobrança', 'error');
        return;
      }
      setIsLoadingAsaas(true);
      try {
        if (emissionMode === 'installments') {
          const activeInsts = installmentsToEmit.filter(inst => inst.enabled && inst.valorRetido > 0);
          if (activeInsts.length === 0) {
            showToast('Nenhuma parcela selecionada ou com valor válido para emitir', 'error');
            setIsLoadingAsaas(false);
            return;
          }

          let successCount = 0;
          let lastBoletoData: any = null;

          for (let i = 0; i < activeInsts.length; i++) {
            const inst = activeInsts[i];
            const payload = {
              apiToken: asaasToken,
              isSandbox,
              customerId: paymentForm.customerId,
              customerName: paymentForm.customerName,
              customerCpfCnpj: paymentForm.customerCpfCnpj,
              customerEmail: paymentForm.customerEmail,
              customerPhone: paymentForm.customerPhone,
              value: inst.valorRetido,
              dueDate: inst.dueDate,
              billingType: paymentForm.billingType,
              description: `${paymentForm.description} - Parcela: ${inst.tipo}`,
              splitRules: paymentForm.enableSplit ? inst.splitRules : []
            };

            const res = await fetch('/api/asaas/payments/create', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
              successCount++;
              if (payload.billingType === 'BOLETO' && data.data) {
                lastBoletoData = data.data;
              }
            } else {
              console.error(`Erro ao emitir parcela ${inst.tipo}:`, data.error);
            }
          }

          if (successCount > 0) {
            showToast(`${successCount} cobrança(s) de comissão emitida(s) com sucesso baseada(s) no rateio cronológico!`, 'success');
            setShowNewAsaasPaymentModal(false);
            if (lastBoletoData) {
              setSelectedAsaasBoleto(lastBoletoData);
            }
            
            // reset form
            setPaymentForm({
              proposalId: '',
              customerId: '',
              customerName: '',
              customerCpfCnpj: '',
              customerEmail: '',
              customerPhone: '',
              value: '',
              dueDate: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
              billingType: 'PIX',
              description: '',
              enableSplit: false,
              splitRules: []
            });
            setInstallmentsToEmit([]);
            syncAsaas();
          } else {
            showToast('Falha ao emitir as cobranças de comissão das parcelas.', 'error');
          }
        } else {
          // Single / Default mode
          const payload = {
            apiToken: asaasToken,
            isSandbox,
            customerId: paymentForm.customerId,
            customerName: paymentForm.customerName,
            customerCpfCnpj: paymentForm.customerCpfCnpj,
            customerEmail: paymentForm.customerEmail,
            customerPhone: paymentForm.customerPhone,
            value: parseFloat(paymentForm.value),
            dueDate: paymentForm.dueDate,
            billingType: paymentForm.billingType,
            description: paymentForm.description,
            splitRules: paymentForm.enableSplit ? paymentForm.splitRules : []
          };

          const res = await fetch('/api/asaas/payments/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const data = await res.json();
          if (data.success) {
            showToast('Cobrança de comissão emitida com sucesso!', 'success');
            setShowNewAsaasPaymentModal(false);
            
            // If it was a Boleto, show the newly generated boleto details immediately
            if (payload.billingType === 'BOLETO' && data.data) {
              setSelectedAsaasBoleto(data.data);
            }

            setPaymentForm({
              proposalId: '',
              customerId: '',
              customerName: '',
              customerCpfCnpj: '',
              customerEmail: '',
              customerPhone: '',
              value: '',
              dueDate: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
              billingType: 'PIX',
              description: '',
              enableSplit: false,
              splitRules: []
            });
            setInstallmentsToEmit([]);
            syncAsaas();
          } else {
            showToast(data.error || 'Erro ao emitir cobrança de comissão', 'error');
          }
        }
      } catch (err) {
        showToast('Erro de conexão ao emitir cobrança', 'error');
      } finally {
        setIsLoadingAsaas(false);
      }
    };

    const handleCreateTransferSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsLoadingAsaas(true);
      try {
        const res = await fetch('/api/asaas/transfers/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiToken: asaasToken,
            isSandbox,
            name: transferForm.name,
            cpfCnpj: transferForm.cpfCnpj,
            pixKey: transferForm.pixKey,
            pixKeyType: transferForm.pixKeyType,
            value: parseFloat(transferForm.value),
            description: transferForm.description
          })
        });
        const data = await res.json();
        if (data.success) {
          showToast('Transferência Pix solicitada com sucesso!', 'success');
          setShowNewAsaasTransferModal(false);
          setTransferForm({
            cargoId: '',
            name: '',
            cpfCnpj: '',
            pixKey: '',
            pixKeyType: 'CPF',
            value: '',
            description: ''
          });
          syncAsaas();
        } else {
          showToast(data.error || 'Erro ao efetuar repasse Pix', 'error');
        }
      } catch (err) {
        showToast('Erro de rede ao efetuar Pix', 'error');
      } finally {
        setIsLoadingAsaas(false);
      }
    };

    const handleSimulatePayment = async (paymentId: string) => {
      setIsLoadingAsaas(true);
      try {
        const res = await fetch('/api/asaas/payments/simulate-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentId })
        });
        const data = await res.json();
        if (data.success) {
          showToast('Pagamento recebido! Comissões divididas conforme regras de split.', 'success');
          syncAsaas();
        } else {
          showToast(data.error || 'Erro ao simular recebimento', 'error');
        }
      } catch (err) {
        showToast('Erro ao simular recebimento', 'error');
      } finally {
        setIsLoadingAsaas(false);
      }
    };

    const handleCargoChange = (cargoId: string) => {
      const cargo = cargos.find(c => c.id === cargoId);
      if (!cargo) return;

      setTransferForm(prev => ({
        ...prev,
        cargoId,
        name: cargo.nome || '',
        cpfCnpj: cargo.cpf_cnpj || '',
        pixKey: cargo.pix || '',
        pixKeyType: 'CPF'
      }));
    };

    const copyToClipboard = (text: string, label: string) => {
      navigator.clipboard.writeText(text);
      showToast(`${label} copiado!`, 'success');
    };

    const formatBRL = (val: number) => {
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    };

    return (
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 font-sans text-slate-800"
      >
        {/* Environment and Status Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm animate-in fade-in duration-500">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-slate-950 flex items-center gap-2.5">
              <CreditCard className="w-5 h-5 text-indigo-600" />
              Gestão Contábil & Pagamentos Asaas
            </h2>
            <p className="text-slate-400 text-xs">Acompanhamento e automação de repasse de comissões imobiliárias em tempo de caixa.</p>
          </div>
          <div className="flex items-center gap-2.5">
            {isMock ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-full text-xs font-bold border border-amber-200 shadow-sm">
                <Clock className="w-3.5 h-3.5 animate-pulse" />
                Modo Simulação Local
              </span>
            ) : isSandbox ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full text-xs font-bold border border-blue-200 shadow-sm">
                <Workflow className="w-3.5 h-3.5" />
                Asaas Homologação (Sandbox)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold border border-emerald-200 shadow-sm">
                <ShieldCheck className="w-3.5 h-3.5" />
                Asaas Produção (Real)
              </span>
            )}
            <button
              onClick={() => syncAsaas()}
              disabled={isLoadingAsaas}
              className="p-2.5 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-indigo-600 rounded-xl transition-all border border-slate-200 hover:scale-105 active:scale-95 flex items-center justify-center gap-2 font-semibold text-xs shrink-0"
              title="Sincronizar dados do Asaas"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingAsaas ? 'animate-spin' : ''}`} />
              <span>Sincronizar</span>
            </button>
          </div>
        </div>

        {/* Financial Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between h-40 relative overflow-hidden">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Saldo Disponível no Asaas</span>
              <h3 className="text-3xl font-extrabold text-slate-900 font-mono tracking-tight leading-none mt-1">
                {formatBRL(asaasBalance)}
              </h3>
            </div>
            <div className="flex items-center justify-between text-xs font-medium text-indigo-600 mt-2">
              <span>Moeda Corrente BRL</span>
              <span className="text-[10px] px-2 py-0.5 bg-indigo-50 rounded-full font-bold">Líquido</span>
            </div>
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-indigo-50/25 to-indigo-100/10 rounded-bl-full pointer-events-none" />
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between h-40">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Cobranças Emitidas</span>
              <h3 className="text-3xl font-extrabold text-slate-900 font-mono tracking-tight leading-none mt-1">
                {asaasPayments.length}
              </h3>
            </div>
            <div className="text-xs text-slate-400 flex items-center justify-between">
              <span>Totalizando {formatBRL(asaasPayments.reduce((acc, p) => acc + (p.value || 0), 0))}</span>
              <span className="text-amber-605 font-bold bg-amber-50 px-2 py-0.5 rounded-full text-[9px]">
                {asaasPayments.filter(p => p.status === 'PENDING').length} Pendentes
              </span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between h-40">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Transferências / Repasses Pix</span>
              <h3 className="text-3xl font-extrabold text-slate-900 font-mono tracking-tight leading-none mt-1">
                {asaasTransfers.length}
              </h3>
            </div>
            <div className="text-xs text-slate-400 flex items-center justify-between">
              <span>Total Pago {formatBRL(asaasTransfers.reduce((acc, t) => acc + (t.value || 0), 0))}</span>
              <span className="text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full text-[9px]">
                {asaasTransfers.filter(t => t.status === 'DONE' || t.status === 'CONFIRMED').length} Sucessos
              </span>
            </div>
          </div>
        </div>

        {/* Quick Operations Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => {
              setPaymentForm(prev => ({ ...prev, billingType: 'PIX' }));
              setShowNewAsaasPaymentModal(true);
            }}
            className="flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold transition-all shadow-md shadow-indigo-100 hover:scale-[1.02] active:scale-95"
          >
            <Plus className="w-4 h-4" />
            EMITIR COBRANÇA (PIX)
          </button>
          <button
            onClick={() => {
              setPaymentForm(prev => ({ ...prev, billingType: 'BOLETO' }));
              setShowNewAsaasPaymentModal(true);
            }}
            className="flex items-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-bold transition-all shadow-md shadow-emerald-100 hover:scale-[1.02] active:scale-95"
          >
            <FileText className="w-4 h-4" />
            EMITIR BOLETO (ASAAS)
          </button>
          <button
            onClick={() => setShowNewAsaasTransferModal(true)}
            className="flex items-center gap-2 px-5 py-3 bg-white hover:bg-slate-50 text-slate-700 rounded-2xl text-xs font-bold transition-all shadow-sm border border-slate-200 hover:scale-[1.02] active:scale-95"
          >
            <Send className="w-4 h-4 text-indigo-600" />
            NOVO REPASSE PIX (PROFISSIONAIS)
          </button>
          <button
            onClick={() => setShowNewAsaasCustomerModal(true)}
            className="flex items-center gap-2 px-5 py-3 bg-white hover:bg-slate-50 text-slate-700 rounded-2xl text-xs font-bold transition-all shadow-sm border border-slate-200 hover:scale-[1.02] active:scale-95"
          >
            <Users className="w-4 h-4 text-slate-500" />
            CADASTRAR CLIENTE (ASAAS)
          </button>
        </div>

        {/* List Tabs / Navigation */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 p-4 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl w-fit">
              <button
                onClick={() => setAsaasSubTab('payments')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  asaasSubTab === 'payments'
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Cobranças (Entradas)
              </button>
              <button
                onClick={() => setAsaasSubTab('transfers')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  asaasSubTab === 'transfers'
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Repasses & Pix (Saídas)
              </button>
              <button
                onClick={() => setAsaasSubTab('customers')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  asaasSubTab === 'customers'
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Clientes Cadastrados
              </button>
            </div>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider pl-1 font-mono">
              Visualizando {asaasSubTab === 'payments' ? `${asaasPayments.length} Cobranças` : asaasSubTab === 'transfers' ? `${asaasTransfers.length} Repasses` : `${asaasCustomers.length} Clientes`}
            </span>
          </div>

          <div className="overflow-x-auto">
            {asaasSubTab === 'payments' && (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase font-bold tracking-wider border-b border-slate-100">
                    <th className="px-6 py-4">Fatura / ID</th>
                    <th className="px-6 py-4">Cliente Pagador</th>
                    <th className="px-6 py-4 font-mono">Valor Fatura</th>
                    <th className="px-6 py-4">Forma</th>
                    <th className="px-6 py-4">Vencimento</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Ações / Simulador</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-xs">
                  {asaasPayments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-slate-400 italic font-medium">
                        Nenhuma cobrança emitida no Asaas até o momento.
                      </td>
                    </tr>
                  ) : (
                    asaasPayments.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/40 transition-colors group">
                        <td className="px-6 py-4 font-semibold text-slate-800 font-mono">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate max-w-[100px]">{p.id}</span>
                            <button
                              onClick={() => copyToClipboard(p.id, 'ID da Cobrança')}
                              className="text-slate-300 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-900 leading-tight">
                            {p.customerName || 'Cliente Indefinido'}
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">{p.customerEmail || ''}</span>
                        </td>
                        <td className="px-6 py-4 font-mono font-bold text-slate-950">
                          {formatBRL(p.value)}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full font-sans uppercase">
                            {p.billingType || 'PIX'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-500 font-mono">
                          {p.dueDate ? new Date(p.dueDate).toLocaleDateString('pt-BR') : '-'}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                            p.status === 'RECEIVED' || p.status === 'CONFIRMED'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                              : p.status === 'OVERDUE'
                              ? 'bg-red-50 text-red-700 border-red-100'
                              : 'bg-amber-50 text-amber-700 border-amber-100'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              p.status === 'RECEIVED' || p.status === 'CONFIRMED'
                                ? 'bg-emerald-500'
                                : p.status === 'OVERDUE'
                                ? 'bg-red-500'
                                : 'bg-amber-500 animate-pulse'
                            }`} />
                            {p.status === 'RECEIVED' ? 'PAGO / RECEBIDO' : p.status === 'CONFIRMED' ? 'PAGO / CONFIRMADO' : p.status === 'PENDING' ? 'AGUARDANDO PAGTO.' : p.status || 'PENDENTE'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {p.billingType === 'BOLETO' && (
                              <button
                                onClick={() => setSelectedAsaasBoleto(p)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-bold transition-all border border-emerald-100 shadow-sm"
                              >
                                <Eye className="w-3 h-3 text-emerald-600" />
                                Visualizar Boleto
                              </button>
                            )}
                            {p.invoiceUrl && (
                              <a
                                href={p.invoiceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-bold transition-all border border-slate-200"
                              >
                                <ExternalLink className="w-3 h-3" />
                                Ver Fatura
                              </a>
                            )}
                            {p.status === 'PENDING' && (
                              <button
                                onClick={() => handleSimulatePayment(p.id)}
                                className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-150 rounded-lg text-[10px] font-bold transition-all shadow-sm flex items-center gap-1"
                                title="Simula a confirmação de recebimento no Asaas e executa splits/repasses correspondentes"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                                Simular Recebimento
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {asaasSubTab === 'transfers' && (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase font-bold tracking-wider border-b border-slate-100">
                    <th className="px-6 py-4">Transferência / ID</th>
                    <th className="px-6 py-4">Favorecido (Corretor/Parceiro)</th>
                    <th className="px-6 py-4">Chave Pix</th>
                    <th className="px-6 py-4 font-mono">Valor Repassado</th>
                    <th className="px-6 py-4">Data / Hora</th>
                    <th className="px-6 py-4">Descrição</th>
                    <th className="px-6 py-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-xs">
                  {asaasTransfers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-slate-400 italic font-medium">
                        Nenhum repasse de comissão Pix efetuado ainda.
                      </td>
                    </tr>
                  ) : (
                    asaasTransfers.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50/40 transition-colors group">
                        <td className="px-6 py-4 font-mono font-semibold text-slate-500 text-[10px]">
                          {t.id}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-900">{t.recipientName || 'Favorecido'}</div>
                          <span className="text-[9px] text-slate-400 font-mono block mt-0.5">{t.cpfCnpj || ''}</span>
                        </td>
                        <td className="px-6 py-4 font-mono text-slate-700">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] bg-slate-100 text-slate-605 px-1.5 py-0.5 rounded font-sans uppercase text-[8px] font-bold">
                              {t.pixKeyType || 'PIX'}
                            </span>
                            <span>{t.pixKey}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-mono font-bold text-slate-900">
                          {formatBRL(t.value)}
                        </td>
                        <td className="px-6 py-4 text-slate-400 font-mono">
                          {t.created_at ? new Date(t.created_at).toLocaleString('pt-BR') : '-'}
                        </td>
                        <td className="px-6 py-4 text-slate-600 italic">
                          {t.description || '-'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold ${
                            t.status === 'DONE' || t.status === 'CONFIRMED'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                              : t.status === 'FAILED'
                              ? 'bg-red-50 text-red-750 border border-red-100'
                              : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                          }`}>
                            {t.status === 'DONE' || t.status === 'CONFIRMED' ? 'EFETUADA (SUCESSO)' : t.status || 'PENDENTE'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {asaasSubTab === 'customers' && (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase font-bold tracking-wider border-b border-slate-100">
                    <th className="px-6 py-4">Cliente / ID Asaas</th>
                    <th className="px-6 py-4">Nome Completo</th>
                    <th className="px-6 py-4">CPF / CNPJ</th>
                    <th className="px-6 py-4">E-mail</th>
                    <th className="px-6 py-4 text-right">Telefone / Contato</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-xs">
                  {asaasCustomers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic font-medium">
                        Nenhum cliente registrado no Asaas ainda.
                      </td>
                    </tr>
                  ) : (
                    asaasCustomers.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/40 transition-colors">
                        <td className="px-6 py-4 font-mono text-slate-500 font-semibold">
                          {c.id}
                        </td>
                        <td className="px-6 py-4 font-bold text-slate-900">
                          {c.name}
                        </td>
                        <td className="px-6 py-4 font-mono text-slate-700">
                          {c.cpfCnpj || '-'}
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {c.email || '-'}
                        </td>
                        <td className="px-6 py-4 text-right text-slate-500 font-mono">
                          {c.phone || '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Modal: New Customer */}
        {showNewAsaasCustomerModal && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-slate-900 flex items-center gap-2 text-md">
                  <Users className="w-5 h-5 text-indigo-600" />
                  Cadastrar Novo Cliente no Asaas
                </h3>
                <button
                  onClick={() => setShowNewAsaasCustomerModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-xl transition-all text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateCustomerSubmit} className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Nome Completo</label>
                  <input
                    type="text"
                    required
                    value={customerForm.name}
                    onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white outline-none transition-all text-sm font-medium"
                    placeholder="Ex: Carlos Eduardo de Souza"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">CPF ou CNPJ</label>
                    <input
                      type="text"
                      required
                      value={customerForm.cpfCnpj}
                      onChange={(e) => setCustomerForm({ ...customerForm, cpfCnpj: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white outline-none transition-all text-sm font-medium font-mono"
                      placeholder="Somente números"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Telefone / Whatsapp</label>
                    <input
                      type="text"
                      value={customerForm.phone}
                      onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white outline-none transition-all text-sm font-medium font-mono"
                      placeholder="Ex: (81) 98888-7777"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">E-mail</label>
                  <input
                    type="email"
                    required
                    value={customerForm.email}
                    onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white outline-none transition-all text-sm font-medium"
                    placeholder="carlos@provedor.com"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowNewAsaasCustomerModal(false)}
                    className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-605 rounded-xl text-xs font-bold transition-all"
                  >
                    CANCELAR
                  </button>
                  <button
                    type="submit"
                    disabled={isLoadingAsaas}
                    className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 shadow-md shadow-indigo-100 disabled:opacity-50"
                  >
                    {isLoadingAsaas && <Loader2 className="w-3 h-3 animate-spin" />}
                    CADASTRAR CLIENTE
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* Modal: New Payment with optional Split Rules */}
        {showNewAsaasPaymentModal && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-100 max-h-[90vh] flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
                <h3 className="font-bold text-slate-900 flex items-center gap-2.5 text-md">
                  <CreditCard className="w-5 h-5 text-indigo-600" />
                  Emitir Cobrança de Comissão com Split Automático
                </h3>
                <button
                  onClick={() => setShowNewAsaasPaymentModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-xl transition-all text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreatePaymentSubmit} className="p-6 space-y-6 overflow-y-auto flex-1">
                {/* Auto-fill from proposal selection */}
                <div className="p-4 bg-slate-50 border border-slate-150 rounded-2xl space-y-3">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block pl-0.5">Vincular a uma Proposta Comercial Extraída</label>
                  <select
                    value={paymentForm.proposalId}
                    onChange={(e) => handleProposalChange(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all text-sm font-medium"
                  >
                    <option value="">-- Selecionar Proposta Comercial para Importar Dados --</option>
                    {savedExtractions.map(ext => (
                      <option key={ext.id} value={ext.id}>
                        {ext.property?.empreendimento || 'Imóvel'} - Comprador: {ext.customers?.[0]?.nome || 'Desconhecido'} ({formatBRL(ext.valorTotalProposta || 0)})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Customer Data */}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1 border-b border-slate-100 pb-1.5">Dados do Cliente devedor (Comprador/Pagador)</h4>
                  
                  {/* Select Customer existing or type */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Selecionar Cliente Registrado (Asaas)</label>
                      <select
                        value={paymentForm.customerId}
                        onChange={(e) => {
                          const cId = e.target.value;
                          const found = asaasCustomers.find(c => c.id === cId);
                          if (found) {
                            setPaymentForm(prev => ({
                              ...prev,
                              customerId: cId,
                              customerName: found.name || '',
                              customerCpfCnpj: found.cpfCnpj || '',
                              customerEmail: found.email || '',
                              customerPhone: found.phone || ''
                            }));
                          } else {
                            setPaymentForm(prev => ({ ...prev, customerId: '' }));
                          }
                        }}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white outline-none transition-all text-sm font-medium"
                      >
                        <option value="">-- Ou preencher manualmente abaixo --</option>
                        {asaasCustomers.map(c => (
                          <option key={c.id} value={c.id}>{c.name} ({c.cpfCnpj})</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Nome Completo do Comprador</label>
                      <input
                        type="text"
                        required
                        value={paymentForm.customerName}
                        onChange={(e) => setPaymentForm({ ...paymentForm, customerName: e.target.value })}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white outline-none transition-all text-sm font-medium"
                        placeholder="Ex: Carlos de Souza"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">CPF ou CNPJ</label>
                      <input
                        type="text"
                        required
                        value={paymentForm.customerCpfCnpj}
                        onChange={(e) => setPaymentForm({ ...paymentForm, customerCpfCnpj: e.target.value })}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white outline-none transition-all text-sm font-medium font-mono"
                        placeholder="Somente números"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">E-mail</label>
                      <input
                        type="email"
                        required
                        value={paymentForm.customerEmail}
                        onChange={(e) => setPaymentForm({ ...paymentForm, customerEmail: e.target.value })}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white outline-none transition-all text-sm font-medium"
                        placeholder="comprador@provedor.com"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Telefone Celular</label>
                      <input
                        type="text"
                        value={paymentForm.customerPhone}
                        onChange={(e) => setPaymentForm({ ...paymentForm, customerPhone: e.target.value })}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white outline-none transition-all text-sm font-medium font-mono"
                        placeholder="Ex: (81) 98888-7777"
                      />
                    </div>
                  </div>
                </div>

                {/* Mode Select (Single vs Installments) if we have parsed installments */}
                {installmentsToEmit.length > 0 && (
                  <div className="p-4 bg-indigo-50/40 border border-indigo-100 rounded-2xl space-y-3">
                    <label className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest block pl-0.5">Modo de Emissão da Comissão</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setEmissionMode('single')}
                        className={`px-4 py-3 rounded-xl border text-xs font-bold transition-all text-center ${
                          emissionMode === 'single'
                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-100'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        Cobrança Única (Total)
                      </button>
                      <button
                        type="button"
                        onClick={() => setEmissionMode('installments')}
                        className={`px-4 py-3 rounded-xl border text-xs font-bold transition-all text-center ${
                          emissionMode === 'installments'
                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-100'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        Sincronizar Parcelas do Rateio ({installmentsToEmit.length})
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400 italic">
                      {emissionMode === 'single' 
                        ? 'Gera uma única cobrança no valor total da comissão.'
                        : 'Gera múltiplos boletos de comissão baseados estritamente na linha cronológica de parcelas do rateio.'}
                    </p>
                  </div>
                )}

                {/* Invoice Settings */}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1 border-b border-slate-100 pb-1.5">Configuração da Fatura de Comissão</h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Forma de Pagamento</label>
                      <select
                        value={paymentForm.billingType}
                        onChange={(e) => setPaymentForm({ ...paymentForm, billingType: e.target.value })}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white outline-none transition-all text-sm font-medium"
                      >
                        <option value="PIX">Pix (Imediato e Seguro)</option>
                        <option value="BOLETO">Boleto Bancário</option>
                        <option value="CREDIT_CARD">Cartão de Crédito</option>
                      </select>
                    </div>

                    {emissionMode === 'single' && (
                      <>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1 font-semibold text-indigo-600">Valor da Comissão (BRL)</label>
                          <input
                            type="number"
                            step="0.01"
                            required
                            value={paymentForm.value}
                            onChange={(e) => setPaymentForm({ ...paymentForm, value: e.target.value })}
                            className="w-full px-4 py-2.5 bg-indigo-50/50 border border-indigo-200 focus:bg-white focus:border-indigo-500 rounded-xl focus:ring-2 focus:ring-indigo-500/10 outline-none transition-all text-sm font-bold font-mono text-indigo-700"
                            placeholder="0.00"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Data de Vencimento</label>
                          <input
                            type="date"
                            required
                            value={paymentForm.dueDate}
                            onChange={(e) => setPaymentForm({ ...paymentForm, dueDate: e.target.value })}
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white outline-none transition-all text-sm font-medium font-mono"
                          />
                        </div>
                      </>
                    )}

                    {emissionMode === 'installments' && (
                      <div className="space-y-1.5 sm:col-span-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Comissão Consolidada das Parcelas</label>
                        <div className="px-4 py-2.5 bg-indigo-50 text-indigo-700 font-bold font-mono rounded-xl border border-indigo-150 text-sm">
                          {formatBRL(installmentsToEmit.reduce((acc, i) => acc + (i.enabled ? i.valorRetido : 0), 0))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Descrição / Referência</label>
                    <input
                      type="text"
                      value={paymentForm.description}
                      onChange={(e) => setPaymentForm({ ...paymentForm, description: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white outline-none transition-all text-sm font-medium"
                      placeholder="Ex: Comissão Harmony - Sala 102 (Comprador Carlos)"
                    />
                  </div>
                </div>

                {/* Render chronological installments selector */}
                {emissionMode === 'installments' && installmentsToEmit.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Cronograma de Parcelas do Rateio</h4>
                      <button
                        type="button"
                        onClick={() => {
                          const allEnabled = installmentsToEmit.every(i => i.enabled);
                          setInstallmentsToEmit(prev => prev.map(i => ({ ...i, enabled: !allEnabled })));
                        }}
                        className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 uppercase tracking-wide"
                      >
                        {installmentsToEmit.every(i => i.enabled) ? 'Desmarcar Todos' : 'Selecionar Todos'}
                      </button>
                    </div>

                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                      {installmentsToEmit.map((inst, idx) => (
                        <div key={inst.id} className={`p-4 rounded-2xl border transition-all ${inst.enabled ? 'bg-white border-indigo-100 shadow-sm' : 'bg-slate-50/50 border-slate-150 opacity-60'}`}>
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={inst.enabled}
                              onChange={(e) => {
                                const copy = [...installmentsToEmit];
                                copy[idx].enabled = e.target.checked;
                                setInstallmentsToEmit(copy);
                              }}
                              className="w-4 h-4 mt-1 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500"
                            />
                            
                            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                              <div>
                                <div className="text-xs font-bold text-slate-800">{inst.tipo}</div>
                                <div className="text-[10px] text-slate-400">Parcela do Rateio</div>
                              </div>

                              <div className="space-y-1">
                                <label className="text-[8px] font-bold text-slate-400 uppercase">Vencimento</label>
                                <input
                                  type="date"
                                  required={inst.enabled}
                                  value={inst.dueDate}
                                  onChange={(e) => {
                                    const copy = [...installmentsToEmit];
                                    copy[idx].dueDate = e.target.value;
                                    setInstallmentsToEmit(copy);
                                  }}
                                  className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-[8px] font-bold text-slate-400 uppercase">Valor Comissão (BRL)</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  required={inst.enabled}
                                  value={inst.valorRetido}
                                  onChange={(e) => {
                                    const copy = [...installmentsToEmit];
                                    copy[idx].valorRetido = parseFloat(e.target.value) || 0;
                                    setInstallmentsToEmit(copy);
                                  }}
                                  className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-indigo-600 text-right"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Splits breakdown for this installment */}
                          {inst.enabled && inst.splitRules.length > 0 && paymentForm.enableSplit && (
                            <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap gap-1.5 items-center">
                              <span className="text-[8px] font-bold text-slate-400 uppercase mr-1">Splits:</span>
                              {inst.splitRules.map((r: any, rIdx: number) => (
                                <span key={rIdx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 text-[10px] font-mono text-indigo-700 font-semibold">
                                  {r.recipientName.includes(' - ') ? r.recipientName.split(' - ')[1] : r.recipientName}: {formatBRL(r.fixedValue)} ({r.percentualValue}%)
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="p-3 bg-indigo-50/40 rounded-xl flex items-center justify-between text-xs font-bold text-indigo-700 font-mono">
                      <span>Total Selecionado:</span>
                      <span>
                        {formatBRL(installmentsToEmit.reduce((acc, i) => acc + (i.enabled ? i.valorRetido : 0), 0))}
                      </span>
                    </div>
                  </div>
                )}

                {/* Auto Split Rules */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Regras de Divisão Automática de Comissão (Splits)</h4>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={paymentForm.enableSplit}
                        onChange={(e) => setPaymentForm({ ...paymentForm, enableSplit: e.target.checked })}
                        className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500"
                      />
                      <span className="text-xs font-bold text-slate-700">Ativar Split</span>
                    </label>
                  </div>

                  {paymentForm.enableSplit && emissionMode === 'single' && (
                    <div className="space-y-4 bg-slate-50/50 p-4 rounded-2xl border border-slate-150">
                      {paymentForm.splitRules.length === 0 ? (
                        <p className="text-xs text-slate-400 italic text-center py-4">Nenhuma regra de split carregada. Adicione participantes ou selecione uma proposta válida.</p>
                      ) : (
                        <div className="space-y-3">
                          <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wide">Distribuição Relativa entre Corretores e Equipe</p>
                          {paymentForm.splitRules.map((rule, sIdx) => (
                            <div key={sIdx} className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center bg-white p-3 rounded-xl border border-slate-150">
                              <div className="text-xs font-bold text-slate-800">
                                {rule.recipientName}
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="space-y-1.5 flex-1">
                                  <label className="text-[8px] font-bold text-slate-400 uppercase block pl-0.5">Participação (%)</label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    required
                                    value={rule.percentualValue}
                                    onChange={(e) => {
                                      const newRules = [...paymentForm.splitRules];
                                      newRules[sIdx].percentualValue = parseFloat(e.target.value) || 0;
                                      setPaymentForm(prev => ({ ...prev, splitRules: newRules }));
                                    }}
                                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-indigo-600 text-center focus:bg-white focus:ring-2 focus:ring-indigo-500/10 outline-none"
                                    placeholder="%"
                                  />
                                </div>
                                <div className="space-y-1.5 flex-1">
                                  <label className="text-[8px] font-bold text-slate-400 uppercase block pl-0.5">ID Carteira Asaas (Se real)</label>
                                  <input
                                    type="text"
                                    value={rule.walletId}
                                    onChange={(e) => {
                                      const newRules = [...paymentForm.splitRules];
                                      newRules[sIdx].walletId = e.target.value;
                                      setPaymentForm(prev => ({ ...prev, splitRules: newRules }));
                                    }}
                                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-center focus:bg-white focus:ring-2 focus:ring-indigo-500/10 outline-none"
                                    placeholder="Ex: wallet_xxx"
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                          <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold uppercase tracking-wider px-1">
                            <span>Soma dos splits:</span>
                            <span className={`font-mono text-xs ${paymentForm.splitRules.reduce((acc, r) => acc + r.percentualValue, 0) > 100 ? 'text-red-600' : 'text-emerald-600'}`}>
                              {paymentForm.splitRules.reduce((acc, r) => acc + r.percentualValue, 0).toFixed(2)}%
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {paymentForm.enableSplit && emissionMode === 'installments' && (
                    <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl text-xs text-indigo-800 font-medium">
                      ✨ Os splits automáticos e as participações relativas foram calculados individualmente para cada parcela, conforme a tabela do rateio cronológico.
                    </div>
                  )}
                </div>

                {/* Form Footer */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowNewAsaasPaymentModal(false)}
                    className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all"
                  >
                    CANCELAR
                  </button>
                  <button
                    type="submit"
                    disabled={isLoadingAsaas}
                    className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 shadow-md shadow-indigo-100 disabled:opacity-50"
                  >
                    {isLoadingAsaas && <Loader2 className="w-3 h-3 animate-spin" />}
                    EMITIR COBRANÇA DE COMISSÃO
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* Modal: New Transfer */}
        {showNewAsaasTransferModal && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-slate-900 flex items-center gap-2 text-md">
                  <Send className="w-5 h-5 text-indigo-600" />
                  Efetuar Repasse de Comissão (Pix Imediato)
                </h3>
                <button
                  onClick={() => setShowNewAsaasTransferModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-xl transition-all text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateTransferSubmit} className="p-6 space-y-4">
                {/* Auto populate from professionals list */}
                <div className="p-4 bg-slate-50 border border-slate-150 rounded-2xl space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-0.5">Carregar Profissional Registrado (Cargos)</label>
                  <select
                    value={transferForm.cargoId}
                    onChange={(e) => handleCargoChange(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all text-sm font-medium"
                  >
                    <option value="">-- Selecionar da Lista de Corretores/Gestores --</option>
                    {cargos.filter(c => c.nome).map(c => (
                      <option key={c.id} value={c.id}>{c.nome} ({c.cargo})</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Nome Completo do Favorecido</label>
                  <input
                    type="text"
                    required
                    value={transferForm.name}
                    onChange={(e) => setTransferForm({ ...transferForm, name: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white outline-none transition-all text-sm font-medium"
                    placeholder="Ex: Lucas Corretor da Silva"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">CPF ou CNPJ</label>
                    <input
                      type="text"
                      required
                      value={transferForm.cpfCnpj}
                      onChange={(e) => setTransferForm({ ...transferForm, cpfCnpj: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white outline-none transition-all text-sm font-medium font-mono"
                      placeholder="Somente números"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Valor do Pix (BRL)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={transferForm.value}
                      onChange={(e) => setTransferForm({ ...transferForm, value: e.target.value })}
                      className="w-full px-4 py-2.5 bg-indigo-50 text-indigo-700 font-bold border border-indigo-150 rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white outline-none transition-all text-sm font-mono"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-sans">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Tipo de Chave Pix</label>
                    <select
                      value={transferForm.pixKeyType}
                      onChange={(e) => setTransferForm({ ...transferForm, pixKeyType: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white outline-none transition-all text-sm font-medium"
                    >
                      <option value="CPF">CPF</option>
                      <option value="CNPJ">CNPJ</option>
                      <option value="EMAIL">E-mail</option>
                      <option value="PHONE">Telefone</option>
                      <option value="EVP">Chave Aleatória</option>
                    </select>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Chave Pix</label>
                    <input
                      type="text"
                      required
                      value={transferForm.pixKey}
                      onChange={(e) => setTransferForm({ ...transferForm, pixKey: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white outline-none transition-all text-sm font-medium font-mono"
                      placeholder="Chave Pix de destino"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Descrição / Finalidade</label>
                  <input
                    type="text"
                    value={transferForm.description}
                    onChange={(e) => setTransferForm({ ...transferForm, description: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white outline-none transition-all text-sm font-medium"
                    placeholder="Ex: Repasse comissão Harmony - Lucas"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowNewAsaasTransferModal(false)}
                    className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all"
                  >
                    CANCELAR
                  </button>
                  <button
                    type="submit"
                    disabled={isLoadingAsaas}
                    className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 shadow-md shadow-indigo-100 disabled:opacity-50"
                  >
                    {isLoadingAsaas && <Loader2 className="w-3 h-3 animate-spin" />}
                    EFETUAR TRANSFERÊNCIA PIX
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* Modal: View Generated Boleto */}
        {selectedAsaasBoleto && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-100 flex flex-col my-8 text-left"
            >
              {/* Header */}
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">
                      Boleto de Comissão Gerado
                    </h3>
                    <p className="text-xs text-slate-400">
                      ID da Fatura: {selectedAsaasBoleto.id}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedAsaasBoleto(null)}
                  className="p-2 hover:bg-slate-200 rounded-xl transition-all text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh] font-sans">
                {/* Alert/Status Banner */}
                <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5 animate-pulse" />
                  <div>
                    <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Boleto Pronto para Pagamento</h4>
                    <p className="text-xs text-emerald-700 mt-1">
                      A cobrança foi registrada com sucesso no Asaas e já está disponível para recebimento. Abaixo você confere os dados do documento.
                    </p>
                  </div>
                </div>

                {/* Simulated Boleto Form Layout (Geometric Balance Concept) */}
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                  {/* Top Bank Strip */}
                  <div className="bg-slate-100 px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 font-mono text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-slate-800 text-sm tracking-tight">ASAAS IP S.A.</span>
                      <span className="bg-slate-300 w-[1px] h-4 inline-block" />
                      <span className="font-bold text-slate-600">033-7</span>
                    </div>
                    <div className="font-bold text-slate-700 tracking-wide break-all text-right text-[10px] md:text-xs">
                      {selectedAsaasBoleto.barCode || "03399.01234 56789.012345 67890.123456 1 234500000000"}
                    </div>
                  </div>

                  {/* Fields Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-4 text-xs font-sans divide-y md:divide-y-0 divide-slate-200 divide-x-0 md:divide-x border-b border-slate-200">
                    <div className="md:col-span-3 p-3 space-y-1">
                      <span className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Beneficiário</span>
                      <span className="block font-bold text-slate-800">PROPOSTAS REJ IMOBILIÁRIA S/A</span>
                    </div>
                    <div className="p-3 space-y-1 bg-slate-50">
                      <span className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Data de Vencimento</span>
                      <span className="block font-mono font-bold text-slate-800">
                        {selectedAsaasBoleto.dueDate ? new Date(selectedAsaasBoleto.dueDate).toLocaleDateString('pt-BR') : "Imediato"}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 text-xs font-sans divide-y md:divide-y-0 divide-slate-200 divide-x-0 md:divide-x border-b border-slate-200">
                    <div className="md:col-span-3 p-3 space-y-1">
                      <span className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Pagador (Cliente)</span>
                      <span className="block font-semibold text-slate-800">{selectedAsaasBoleto.customerName || "Cliente Beneficiário"}</span>
                    </div>
                    <div className="p-3 space-y-1 bg-slate-50">
                      <span className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Valor do Documento</span>
                      <span className="block font-mono font-extrabold text-indigo-700 text-sm">
                        {formatBRL(selectedAsaasBoleto.value)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 text-xs font-sans divide-y md:divide-y-0 divide-slate-200 divide-x-0 md:divide-x border-b border-slate-200">
                    <div className="p-3 space-y-1">
                      <span className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Agência/Código Beneficiário</span>
                      <span className="block font-mono font-medium text-slate-700">0001 / 1234567-8</span>
                    </div>
                    <div className="p-3 space-y-1">
                      <span className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Nosso Número</span>
                      <span className="block font-mono font-medium text-slate-700">{selectedAsaasBoleto.id}</span>
                    </div>
                    <div className="p-3 space-y-1">
                      <span className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Espécie Doc. / Aceite</span>
                      <span className="block font-medium text-slate-700">DS / Não</span>
                    </div>
                    <div className="p-3 space-y-1">
                      <span className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Status da Cobrança</span>
                      <span className="block font-bold text-amber-600 uppercase">
                        {selectedAsaasBoleto.status === 'RECEIVED' ? 'PAGO / RECEBIDO' : selectedAsaasBoleto.status === 'CONFIRMED' ? 'PAGO / CONFIRMADO' : 'PENDENTE'}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 space-y-1">
                    <span className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Demonstrativo / Descrição</span>
                    <p className="text-slate-600 font-medium">{selectedAsaasBoleto.description || "Cobrança de comissão imobiliária."}</p>
                  </div>
                </div>

                {/* Digitable Line copyable area */}
                <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Linha Digitável de Pagamento</span>
                    <span className="text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md">BOLETO BANCÁRIO</span>
                  </div>
                  <div className="p-4 bg-white border border-slate-200 rounded-xl font-mono text-xs md:text-sm text-slate-800 break-all select-all shadow-inner relative">
                    {selectedAsaasBoleto.barCode || "34191.79001 01043.513184 91020.150008 7 9781" + String(Math.floor(selectedAsaasBoleto.value * 100)).padStart(10, '0')}
                  </div>
                  
                  <div className="flex flex-col sm:flex-row gap-3 pt-1">
                    <button
                      onClick={() => {
                        const code = selectedAsaasBoleto.barCode || "34191.79001 01043.513184 91020.150008 7 9781" + String(Math.floor(selectedAsaasBoleto.value * 100)).padStart(10, '0');
                        navigator.clipboard.writeText(code);
                        showToast("Linha digitável copiada com sucesso!", "success");
                      }}
                      className="flex-1 flex items-center justify-center gap-2.5 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-100 hover:scale-[1.01] active:scale-[0.99]"
                    >
                      <Copy className="w-4 h-4" />
                      COPIAR LINHA DIGITÁVEL
                    </button>

                    {(selectedAsaasBoleto.bankSlipUrl || selectedAsaasBoleto.invoiceUrl) ? (
                      <a
                        href={selectedAsaasBoleto.bankSlipUrl || selectedAsaasBoleto.invoiceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 flex items-center justify-center gap-2.5 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-100 hover:scale-[1.01] active:scale-[0.99] text-center text-decoration-none"
                      >
                        <Download className="w-4 h-4" />
                        BAIXAR PDF DO BOLETO
                      </a>
                    ) : null}
                  </div>
                </div>

                {/* Split Info if present */}
                {selectedAsaasBoleto.split && selectedAsaasBoleto.split.length > 0 && (
                  <div className="p-4 bg-slate-50 border border-slate-150 rounded-2xl space-y-2.5">
                    <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Regras de Split Automatizadas</h5>
                    <div className="divide-y divide-slate-200 text-left">
                      {selectedAsaasBoleto.split.map((sp: any, i: number) => (
                        <div key={i} className="flex items-center justify-between py-2 text-xs">
                          <span className="font-semibold text-slate-700">{sp.name || `Favorecido: ${sp.walletId}`}</span>
                          <span className="font-mono font-bold text-slate-600">
                            {sp.percentualValue ? `${sp.percentualValue}%` : formatBRL(sp.value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-slate-100 flex items-center justify-between shrink-0 bg-slate-50">
                {selectedAsaasBoleto.invoiceUrl && (
                  <a
                    href={selectedAsaasBoleto.invoiceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-bold"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Ver Fatura Online no Asaas
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedAsaasBoleto(null)}
                  className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-all ml-auto"
                >
                  FECHAR
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </motion.div>
    );
  };

  const renderCargoModal = () => {
    if (!showCargoModal) return null;

    return (
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-100"
        >
          {/* Header */}
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                <Users className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 leading-tight">
                  {editingCargo ? 'Editar Cargo / Participante' : 'Novo Cargo / Participante'}
                </h3>
                <p className="text-xs text-slate-400">Insira as informações profissionais do participante</p>
              </div>
            </div>
            <button 
              onClick={() => {
                setShowCargoModal(false);
                setEditingCargo(null);
              }}
              className="p-2 hover:bg-slate-100 rounded-xl transition-all text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form Content */}
          <div className="p-6 overflow-y-auto space-y-6 flex-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-sans">
              {/* Nome */}
              <div className="flex flex-col gap-1 md:col-span-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nome Completo *</label>
                <input
                  type="text"
                  required
                  value={cargoForm.nome}
                  onChange={(e) => setCargoForm(prev => ({ ...prev, nome: e.target.value }))}
                  placeholder="Ex: Carlos Eduardo de Souza"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-sm transition-all text-slate-850"
                />
              </div>

              {/* Apelido */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Apelido / Nome de Guerra</label>
                <input
                  type="text"
                  value={cargoForm.apelido}
                  onChange={(e) => setCargoForm(prev => ({ ...prev, apelido: e.target.value }))}
                  placeholder="Ex: Cadu"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-sm transition-all text-slate-850"
                />
              </div>

              {/* Cargo */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cargo / Função</label>
                <input
                  type="text"
                  value={cargoForm.cargo}
                  onChange={(e) => setCargoForm(prev => ({ ...prev, cargo: e.target.value }))}
                  placeholder="Ex: Corretor, Gerente, Diretor, etc."
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-sm transition-all text-slate-850"
                />
              </div>

              {/* CRECI */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">CRECI</label>
                <input
                  type="text"
                  value={cargoForm.creci}
                  onChange={(e) => setCargoForm(prev => ({ ...prev, creci: e.target.value }))}
                  placeholder="Ex: 123456-F"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-sm transition-all font-mono text-slate-850"
                />
              </div>

              {/* CPF / CNPJ */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">CPF / CNPJ</label>
                <input
                  type="text"
                  value={cargoForm.cpf_cnpj}
                  onChange={(e) => setCargoForm(prev => ({ ...prev, cpf_cnpj: e.target.value }))}
                  placeholder="Ex: 000.000.000-00"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-sm transition-all font-mono text-slate-850"
                />
              </div>

              {/* Gerente */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Gerente Responsável</label>
                <input
                  type="text"
                  value={cargoForm.gerente}
                  onChange={(e) => setCargoForm(prev => ({ ...prev, gerente: e.target.value }))}
                  placeholder="Ex: Nome do Gerente"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-sm transition-all text-slate-850"
                />
              </div>

              {/* Diretor */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Diretor Responsável</label>
                <input
                  type="text"
                  value={cargoForm.diretor}
                  onChange={(e) => setCargoForm(prev => ({ ...prev, diretor: e.target.value }))}
                  placeholder="Ex: Nome do Diretor"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-sm transition-all text-slate-850"
                />
              </div>

              {/* Telefone */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Telefone</label>
                <input
                  type="text"
                  value={cargoForm.telefone}
                  onChange={(e) => setCargoForm(prev => ({ ...prev, telefone: e.target.value }))}
                  placeholder="Ex: (11) 99999-9999"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-sm transition-all text-slate-850"
                />
              </div>

              {/* Email */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">E-mail</label>
                <input
                  type="email"
                  value={cargoForm.email}
                  onChange={(e) => setCargoForm(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="Ex: carlos@empresa.com.br"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-sm transition-all text-slate-850"
                />
              </div>

              {/* PIX */}
              <div className="flex flex-col gap-1 md:col-span-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Chave PIX</label>
                <input
                  type="text"
                  value={cargoForm.pix}
                  onChange={(e) => setCargoForm(prev => ({ ...prev, pix: e.target.value }))}
                  placeholder="Celular, CPF, E-mail ou Chave Aleatória"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-sm transition-all font-mono text-slate-850"
                />
              </div>

              {/* Asaas Wallet ID */}
              <div className="flex flex-col gap-1 md:col-span-2">
                <label className="text-xs font-bold text-indigo-600 uppercase tracking-wider">ID da Carteira Asaas (Para Splits automáticos)</label>
                <input
                  type="text"
                  value={cargoForm.asaasWalletId}
                  onChange={(e) => setCargoForm(prev => ({ ...prev, asaasWalletId: e.target.value }))}
                  placeholder="Ex: wallet_90efb250-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="w-full px-4 py-2.5 bg-indigo-50/30 border border-indigo-100 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-sm transition-all font-mono text-indigo-700"
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-slate-100 flex justify-end items-center gap-3 bg-slate-50/50 shrink-0">
            <button
              onClick={() => {
                setShowCargoModal(false);
                setEditingCargo(null);
              }}
              className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 active:scale-[0.98] transition-all"
            >
              CANCELAR
            </button>
            <button
              onClick={saveCargo}
              disabled={isSavingCargo || !cargoForm.nome}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-100 disabled:opacity-50 active:scale-[0.98] transition-all"
            >
              {isSavingCargo && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {editingCargo ? 'SALVAR ALTERAÇÕES' : 'CADASTRAR PARTICIPANTE'}
            </button>
          </div>
        </motion.div>
      </div>
    );
  };

  const renderCargosFillableModal = () => {
    if (!showCargosFillableModal) return null;

    const sumCargosPercentage = commissionedParties.reduce((acc, p) => acc + p.percentage, 0);
    const hasCommissionMismatch = Math.abs(sumCargosPercentage - percentualComissao) > 0.01;

    return (
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-100"
        >
          {/* Header */}
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                <Users className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-950">Preenchimento de Cargos e Participantes</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure a lista de cargos, comissões de VGV e parcelas, e selecione os profissionais associados.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowCargosFillableModal(false)}
              className="p-2 hover:bg-slate-50 rounded-xl transition-all"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          {/* Alert panel in modal */}
          {hasCommissionMismatch && (
            <div className="mx-6 mt-4 bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start justify-between gap-3 shrink-0">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <h5 className="text-xs font-bold text-red-800 uppercase tracking-wider">Divergência de Percentuais</h5>
                  <p className="text-xs text-red-700 mt-1">
                    A soma dos percentuais dos cargos (<strong>{sumCargosPercentage.toFixed(2)}%</strong>) diverge do percentual total de comissão contratado (<strong>{percentualComissao.toFixed(2)}%</strong>).
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setPercentualComissao(Number(sumCargosPercentage.toFixed(2)));
                }}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[10px] font-bold transition-all shadow-sm shrink-0 uppercase whitespace-nowrap"
              >
                Sincronizar ({sumCargosPercentage.toFixed(2)}%)
              </button>
            </div>
          )}

          {/* Content / Fillable List */}
          <div className="p-6 overflow-y-auto space-y-4 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg font-medium">
                Perc. Parcela em branco distribui o saldo da parcela proporcionalmente à alíquota de cada cargo (respeitando os tetos)
              </span>
              <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg font-medium">
                Cargos marcados como &quot;Ocultar&quot; têm sua comissão somada na Imobiliária
              </span>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="p-4 text-[10px] font-bold text-slate-400 uppercase">Cargo</th>
                    <th className="p-4 text-[10px] font-bold text-slate-400 uppercase w-32 text-center">Perc. VGV (%)</th>
                    <th className="p-4 text-[10px] font-bold text-slate-400 uppercase w-32 text-center">Perc. Parcela (%)</th>
                    <th className="p-4 text-[10px] font-bold text-slate-400 uppercase">Nomes (separados por vírgula)</th>
                    <th className="p-4 text-[10px] font-bold text-slate-400 uppercase w-24 text-center">Qtd. Part.</th>
                    <th className="p-4 text-[10px] font-bold text-slate-400 uppercase w-20 text-center">Ocultar</th>
                    <th className="p-4 text-[10px] font-bold text-slate-400 uppercase w-16 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {commissionedParties.map((p, idx) => {
                    const names = p.name ? p.name.split(',').map(n => n.trim()).filter(Boolean) : [];
                    const count = names.length > 0 ? names.length : 1;
                    const isHidden = !!(p as any).hideAndSum;
                    const isImob = p.role.toLowerCase().trim() === 'imobiliária' || p.role.toLowerCase().trim() === 'imobiliaria';
                    return (
                      <tr key={idx} className={`transition-colors ${isHidden ? 'bg-amber-50/20 hover:bg-amber-50/40 text-slate-500' : 'hover:bg-slate-50/50'}`}>
                        <td className="p-4">
                          <div className="flex flex-col gap-1">
                            <input
                              type="text"
                              value={p.role}
                              onChange={(e) => {
                                const newParties = [...commissionedParties];
                                newParties[idx].role = e.target.value;
                                setCommissionedParties(newParties);
                              }}
                              className="w-full text-xs font-bold text-slate-800 bg-slate-50/50 border border-slate-200 rounded-lg px-2 py-1.5 focus:border-indigo-300 focus:bg-white outline-none"
                              placeholder="Cargo"
                            />
                            {isHidden && (
                              <span className="inline-flex items-center gap-1 text-[8px] font-bold bg-amber-100/80 text-amber-800 px-1.5 py-0.5 rounded border border-amber-200 uppercase tracking-wide w-fit">
                                Oculto &rarr; Somado na Imobiliária
                              </span>
                            )}
                            {isImob && (
                              <span className="inline-flex items-center gap-1 text-[8px] font-bold bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200 uppercase tracking-wide w-fit">
                                Recebe comissões ocultas
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-4">
                          <input 
                            type="number"
                            step="0.01"
                            value={p.percentage}
                            onChange={(e) => {
                              const newParties = [...commissionedParties];
                              newParties[idx].percentage = parseFloat(e.target.value) || 0;
                              setCommissionedParties(newParties);
                              const sumRates = newParties.reduce((acc, cp) => acc + (cp.percentage || 0), 0);
                              setPercentualComissao(Number(sumRates.toFixed(2)));
                            }}
                            className="w-full text-xs font-mono text-center text-indigo-600 bg-slate-50/50 rounded-lg border border-slate-200 py-1.5 focus:border-indigo-300 focus:bg-white outline-none"
                          />
                        </td>
                        <td className="p-4">
                          <input 
                            type="number"
                            step="0.01"
                            value={p.deduction === 0 || p.deduction === undefined ? '' : p.deduction}
                            placeholder="Proporcional"
                            title="Deixe em branco para distribuir o saldo da parcela proporcionalmente à alíquota contratual do cargo"
                            onChange={(e) => {
                              const newParties = [...commissionedParties];
                              const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                              newParties[idx].deduction = isNaN(val) ? 0 : val;
                              setCommissionedParties(newParties);
                            }}
                            className="w-full text-xs font-mono text-center placeholder:text-slate-400 placeholder:italic text-slate-700 bg-slate-50/50 rounded-lg border border-slate-200 py-1.5 focus:border-indigo-300 focus:bg-white outline-none"
                          />
                        </td>
                        <td className="p-4 relative">
                          <input 
                            type="text"
                            value={p.name}
                            onFocus={() => {
                              setActivePartySearchIdx(idx);
                              setPartySearchQuery(p.name || '');
                            }}
                            onBlur={() => {
                              setTimeout(() => {
                                setActivePartySearchIdx(null);
                              }, 250);
                            }}
                            onChange={(e) => {
                              const val = e.target.value;
                              const newParties = [...commissionedParties];
                              newParties[idx].name = val;
                              setCommissionedParties(newParties);
                              setPartySearchQuery(val);
                            }}
                            className="w-full text-xs text-slate-700 bg-slate-50/50 border border-slate-200 rounded-lg px-2 py-1.5 focus:border-indigo-300 focus:bg-white outline-none"
                            placeholder="Ex: Pedro, Paulo, José (digite @ para apelidos)"
                          />
                          {activePartySearchIdx === idx && (
                            <div className="absolute left-4 right-4 mt-1 max-h-60 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl z-50 divide-y divide-slate-100">
                              {getFilteredPartySuggestions(p.name).length === 0 ? (
                                <div className="p-3 text-xs text-slate-400 text-center">
                                  Nenhum participante encontrado
                                </div>
                              ) : (
                                getFilteredPartySuggestions(p.name).map((c) => (
                                  <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => selectPartyParticipant(idx, c)}
                                    className="w-full text-left p-2.5 hover:bg-indigo-50/50 transition-colors flex flex-col gap-0.5"
                                  >
                                    <div className="flex items-center justify-between w-full">
                                      <span className="font-bold text-xs text-slate-900">
                                        {c.nome} {c.apelido ? `(${c.apelido})` : ''}
                                      </span>
                                      {c.cargo && (
                                        <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-full font-medium">
                                          {c.cargo}
                                        </span>
                                      )}
                                    </div>
                                    {(c.gerente || c.diretor) && (
                                      <div className="text-[10px] text-slate-400 truncate">
                                        {c.gerente && `Gerente: ${c.gerente}`}
                                        {c.gerente && c.diretor && ' | '}
                                        {c.diretor && `Diretor: ${c.diretor}`}
                                      </div>
                                    )}
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </td>
                        <td className="p-4 text-center text-xs font-bold font-mono text-slate-400">
                          {count}
                        </td>
                        <td className="p-4 text-center">
                          {!isImob ? (
                            <div className="flex flex-col items-center justify-center gap-1">
                              <input
                                type="checkbox"
                                checked={isHidden}
                                onChange={(e) => {
                                  const newParties = [...commissionedParties];
                                  (newParties[idx] as any).hideAndSum = e.target.checked;
                                  setCommissionedParties(newParties);
                                }}
                                className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                                title="Ocultar cargo e somar na comissão da Imobiliária"
                              />
                              {isHidden && (
                                <span className="text-[8px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 uppercase whitespace-nowrap">
                                  Oculto
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[10px] font-medium" title="A Imobiliária absorve os valores dos cargos ocultados">-</span>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => {
                              const newParties = commissionedParties.filter((_, i) => i !== idx);
                              setCommissionedParties(newParties);
                              const sumRates = newParties.reduce((acc, cp) => acc + (cp.percentage || 0), 0);
                              setPercentualComissao(Number(sumRates.toFixed(2)));
                            }}
                            className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-center">
                <button
                  onClick={() => setCommissionedParties([...commissionedParties, { role: 'Novo Cargo', name: '', percentage: 0, deduction: 0 }])}
                  className="flex items-center gap-2 px-5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-[0.98]"
                >
                  <Plus className="w-4 h-4" />
                  ADICIONAR NOVO CARGO
                </button>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
            <div className="text-xs text-slate-500 font-medium">
              Soma total VGV dos cargos: <span className={`font-bold ${hasCommissionMismatch ? 'text-red-650' : 'text-emerald-600'}`}>{sumCargosPercentage.toFixed(2)}%</span> (Esperado: {percentualComissao.toFixed(2)}%)
            </div>
            <button
              onClick={() => setShowCargosFillableModal(false)}
              className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-100 active:scale-[0.98] transition-all"
            >
              CONCLUIR PREENCHIMENTO
            </button>
          </div>
        </motion.div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
        {needsGoogleAuth && (
          <div className="bg-amber-50 border-b border-amber-200 py-2 px-4 flex items-center justify-center gap-3 animate-in fade-in slide-in-from-top duration-500">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <p className="text-xs font-medium text-amber-800">
              Sua sessão do Google expirou. A sincronização automática está pausada.
            </p>
            <button
              onClick={async () => {
                const { url } = await safeFetchJson('/api/auth/google/url', { credentials: 'include' });
                window.open(url, 'google_auth', 'width=600,height=700');
              }}
              className="text-xs font-bold text-amber-900 underline underline-offset-2 hover:text-amber-700 transition-colors"
            >
              Reconectar agora
            </button>
          </div>
        )}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight text-slate-900">R&J Extrator</h1>
                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">Inteligência Documental</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              {user && (
                <button
                  onClick={() => setShowSettingsModal(true)}
                  className="p-2 text-slate-400 hover:text-indigo-600 transition-all hover:bg-indigo-50 rounded-xl"
                  title="Configurações de Parcelas"
                >
                  <Settings className="w-5 h-5" />
                </button>
              )}
              {user ? (
                <div className="flex items-center gap-3">
                  <div className="text-right hidden sm:block">
                    <p className="text-xs font-semibold text-slate-900">{user.displayName}</p>
                    <button onClick={logout} className="text-[10px] text-slate-400 hover:text-red-500 transition-colors">Sair</button>
                  </div>
                  {user.photoURL && (
                    <img src={user.photoURL} alt={user.displayName || ''} className="w-8 h-8 rounded-full border border-slate-200" referrerPolicy="no-referrer" />
                  )}
                </div>
              ) : (
                <button 
                  onClick={signIn}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-all shadow-sm"
                >
                  <Users className="w-4 h-4" />
                  Entrar
                </button>
              )}
              
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => setView('extract')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  view === 'extract' 
                    ? 'bg-white text-indigo-600 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Plus className="w-4 h-4" />
                Extração
              </button>
              <button
                onClick={() => setView('dashboard')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  view === 'dashboard' 
                    ? 'bg-white text-indigo-600 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                Dashboard
              </button>
              <button
                onClick={() => setView('rateio')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  view === 'rateio' 
                    ? 'bg-white text-indigo-600 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Workflow className="w-4 h-4" />
                Rateio
              </button>
              <button
                onClick={() => setView('cargos')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  view === 'cargos' 
                    ? 'bg-white text-indigo-600 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Users className="w-4 h-4" />
                Cargos
              </button>
              <button
                onClick={() => setView('asaas' as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  (view as any) === 'asaas' 
                    ? 'bg-white text-indigo-600 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <CreditCard className="w-4 h-4" />
                Asaas
              </button>
              {isAdmin && (
                <>
                  <button
                    onClick={() => setView('empreendimentos')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      view === 'empreendimentos' 
                        ? 'bg-white text-indigo-600 shadow-sm' 
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <Building2 className="w-4 h-4" />
                    Empreendimentos
                  </button>
                  <button
                    onClick={() => setView('inbox')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      view === 'inbox' 
                        ? 'bg-white text-indigo-600 shadow-sm' 
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <History className="w-4 h-4" />
                    Fila
                  </button>
                  <button
                    onClick={() => setView('usuarios')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      view === 'usuarios' 
                        ? 'bg-white text-indigo-600 shadow-sm' 
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <Users className="w-4 h-4" />
                    Usuários
                  </button>
                </>
              )}
            </div>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!isAuthReady ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          </div>
        ) : !user ? (
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <div className="w-full max-w-md bg-white rounded-3xl p-8 border border-slate-200 shadow-xl shadow-slate-100">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-indigo-100">
                  <ShieldCheck className="w-8 h-8 text-indigo-600" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 mb-1">Acesso ao Sistema</h2>
                <p className="text-slate-500 text-sm">
                  Propostas de Rateio Imobiliário R&J
                </p>
              </div>

              {/* Method Selector Tabs */}
              <div className="grid grid-cols-2 p-1.5 bg-slate-100/90 rounded-2xl mb-6 gap-1 border border-slate-200/60">
                <button
                  type="button"
                  onClick={() => switchAuthMode('email')}
                  className={`flex flex-col items-center justify-center py-2.5 px-3 rounded-xl text-xs font-semibold transition-all ${
                    authMode === 'email'
                      ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/70'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-sm font-bold">
                    <Mail className="w-4 h-4" />
                    <span>E-mail e Senha</span>
                  </div>
                  <span className="text-[10px] font-normal text-emerald-600 font-mono mt-0.5">
                    Sem Authenticator / 2FA
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => switchAuthMode('google')}
                  className={`flex flex-col items-center justify-center py-2.5 px-3 rounded-xl text-xs font-semibold transition-all ${
                    authMode === 'google'
                      ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/70'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-sm font-bold">
                    <Users className="w-4 h-4" />
                    <span>Conta Google</span>
                  </div>
                  <span className="text-[10px] font-normal text-slate-500 font-mono mt-0.5">
                    Google SSO
                  </span>
                </button>
              </div>

              {/* Error Notice */}
              {authError && (
                <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 text-amber-800 text-sm">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold mb-1">Atenção</p>
                    <p className="leading-relaxed text-xs">{authError}</p>
                    {authMode === 'google' && (
                      <button
                        type="button"
                        onClick={() => switchAuthMode('email')}
                        className="mt-2 text-indigo-600 font-semibold hover:underline text-xs block"
                      >
                        Alternar para login com E-mail e Senha (Sem Authenticator) →
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Success Notice */}
              {authSuccessMessage && (
                <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3 text-emerald-800 text-sm">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <p className="leading-relaxed text-xs">{authSuccessMessage}</p>
                </div>
              )}

              {authMode === 'email' ? (
                <form onSubmit={handleEmailAuth} className="space-y-4">
                  {/* Informational banner about No Authenticator needed */}
                  <div className="p-3 bg-emerald-50/70 border border-emerald-200/80 rounded-xl flex items-start gap-2.5 text-emerald-900 text-xs">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <p className="leading-snug">
                      <strong>Acesso Direto por Senha:</strong> Não solicita aplicativo Authenticator nem verificação em duas etapas. Basta preencher seu e-mail e senha.
                    </p>
                  </div>

                  {/* Register vs Login toggle */}
                  <div className="flex items-center justify-between text-xs text-slate-500 border-b border-slate-100 pb-2">
                    <span className="font-medium text-slate-700">
                      {isRegistering ? 'Criar nova conta de acesso' : 'Fazer login com e-mail'}
                    </span>
                    <button
                      type="button"
                      onClick={() => { setIsRegistering(!isRegistering); setAuthError(null); setAuthSuccessMessage(null); }}
                      className="text-indigo-600 font-semibold hover:underline"
                    >
                      {isRegistering ? 'Já tenho conta' : 'Criar conta nova'}
                    </button>
                  </div>

                  {isRegistering && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Nome Completo</label>
                      <div className="relative">
                        <Users className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                        <input
                          type="text"
                          value={authDisplayName}
                          onChange={(e) => setAuthDisplayName(e.target.value)}
                          placeholder="Seu nome ou cargo"
                          className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-700">E-mail</label>
                      {authEmail !== 'propostasrej@gmail.com' && (
                        <button
                          type="button"
                          onClick={() => setAuthEmail('propostasrej@gmail.com')}
                          className="text-[11px] text-indigo-600 hover:underline font-mono"
                        >
                          Usar propostasrej@gmail.com
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <input
                        type="email"
                        required
                        value={authEmail}
                        onChange={(e) => setAuthEmail(e.target.value)}
                        placeholder="seu.email@exemplo.com"
                        className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-700">Senha</label>
                      {!isRegistering && (
                        <button
                          type="button"
                          onClick={handleForgotPassword}
                          disabled={isAuthSubmitting}
                          className="text-[11px] text-indigo-600 hover:underline"
                        >
                          Esqueci a senha
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <input
                        type={showAuthPassword ? "text" : "password"}
                        required
                        value={authPassword}
                        onChange={(e) => setAuthPassword(e.target.value)}
                        placeholder={isRegistering ? "Mínimo 6 caracteres" : "Sua senha"}
                        className="w-full pl-9 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAuthPassword(!showAuthPassword)}
                        className="absolute right-3 top-2.5 p-0.5 text-slate-400 hover:text-slate-600"
                        title={showAuthPassword ? "Ocultar senha" : "Exibir senha"}
                      >
                        {showAuthPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isAuthSubmitting}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 disabled:opacity-60 text-sm mt-2"
                  >
                    {isAuthSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Processando...
                      </>
                    ) : isRegistering ? (
                      <>
                        <UserPlus className="w-4 h-4" />
                        Criar Minha Conta
                      </>
                    ) : (
                      <>
                        <LogIn className="w-4 h-4" />
                        Entrar no Sistema
                      </>
                    )}
                  </button>
                </form>
              ) : (
                <div className="space-y-4 text-center">
                  <p className="text-slate-500 text-sm leading-relaxed mb-4">
                    Conecte-se com sua conta Google para carregar suas propostas, configurações e permissões.
                  </p>
                  <button 
                    type="button"
                    onClick={signInWithGoogle}
                    disabled={isAuthSubmitting}
                    className="w-full flex items-center justify-center gap-3 px-6 py-3.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-60 active:scale-98"
                  >
                    {isAuthSubmitting ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Conectando...
                      </>
                    ) : (
                      <>
                        <Users className="w-5 h-5" />
                        Entrar com Google
                      </>
                    )}
                  </button>
                  
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-left text-xs text-slate-600 space-y-2 mt-4">
                    <p className="font-semibold text-slate-800 flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5 text-indigo-600" />
                      Sua conta Google solicita o Authenticator?
                    </p>
                    <p className="text-[11px] leading-relaxed text-slate-500">
                      Se o seu e-mail Google possui Verificação em Duas Etapas (2FA) ativa, o Google pedirá o código do app Authenticator.
                    </p>
                    <button
                      type="button"
                      onClick={() => switchAuthMode('email')}
                      className="w-full py-2 px-3 bg-white border border-indigo-200 text-indigo-600 hover:bg-indigo-50 font-semibold rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      Entrar por E-mail e Senha (Sem Authenticator)
                    </button>
                  </div>
                </div>
              )}

              {/* Where to adjust guide */}
              <div className="mt-6 pt-4 border-t border-slate-100 text-left">
                <details className="group text-xs text-slate-500">
                  <summary className="cursor-pointer font-semibold text-slate-700 hover:text-indigo-600 flex items-center justify-between">
                    <span>Onde ajustar e configurar métodos de login?</span>
                    <span className="text-slate-400 group-open:rotate-180 transition-transform">▾</span>
                  </summary>
                  <div className="mt-2.5 p-3 bg-slate-50 rounded-xl space-y-2 border border-slate-100 text-[11px] text-slate-600">
                    <p>
                      <strong>1. No Aplicativo:</strong> Alterne entre as abas <strong>E-mail e Senha</strong> e <strong>Conta Google</strong> no topo desta janela.
                    </p>
                    <p>
                      <strong>2. No Firebase Console:</strong> Acesse o painel do projeto (<code className="bg-slate-200 px-1 py-0.5 rounded text-[10px]">console.firebase.google.com</code>) &gt; <strong>Authentication</strong> &gt; aba <strong>Sign-in method</strong> para ativar ou desativar provedores (E-mail/Senha, Google, etc.).
                    </p>
                    <p>
                      <strong>3. Acesso de Administrador:</strong> O e-mail <strong className="text-slate-800">propostasrej@gmail.com</strong> tem privilégio total de administrador independente do método escolhido.
                    </p>
                  </div>
                </details>
              </div>
            </div>
          </div>
        ) : (
          <AnimatePresence mode="wait">
          {view === 'extract' ? (
            <motion.div
              key="extract"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8"
            >
              <div className="lg:col-span-5 space-y-8">
                <header className="mb-8">
                  <h2 className="text-2xl font-bold text-slate-900">Analista de Cadastro R&J</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Sistema inteligente de conferência e extração de dados para propostas imobiliárias.
                  </p>
                </header>
          <section className="glass-panel rounded-2xl p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-6 flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Documentos Necessários
            </h2>
            
            <div className="space-y-4">
              {docs.map((doc, index) => (
                <div key={doc.id} className="relative">
                  <div className={`
                    flex items-center justify-between p-4 rounded-xl border transition-all
                    ${doc.file ? 'bg-indigo-50/50 border-indigo-200' : 'bg-slate-50 border-slate-200'}
                  `}>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono text-slate-400 w-4">{index + 1}.</span>
                      <div>
                        <p className="text-sm font-medium text-slate-700">
                          {doc.name}
                          {doc.required && <span className="text-red-500 ml-1">*</span>}
                        </p>
                        {doc.file && (
                          <p className="text-xs text-indigo-600 font-medium truncate max-w-[150px]">
                            {doc.file.name}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {doc.file ? (
                        <button 
                          onClick={() => removeFile(doc.id)}
                          className="p-2 hover:bg-red-100 text-red-500 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleCameraCapture(doc.id)}
                            className="p-2 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors flex items-center justify-center shrink-0" 
                            title="Tirar foto"
                          >
                            <Camera className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDocumentScan(doc.id)}
                            className="p-2 hover:bg-emerald-100 text-emerald-600 rounded-lg transition-colors flex items-center justify-center shrink-0" 
                            title="Escanear documento"
                          >
                            <Scan className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleFileUpload(doc.id)}
                            className="p-2 hover:bg-indigo-100 text-indigo-600 rounded-lg transition-colors flex items-center justify-center shrink-0" 
                            title="Selecionar arquivo"
                          >
                            <Upload className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                      {doc.file && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={addAdditionalDoc}
              className="w-full mt-4 py-3 px-4 rounded-xl border-2 border-dashed border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition-all flex items-center justify-center gap-2 text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Adicionar Documento
            </button>

            <button
              onClick={processDocuments}
              disabled={!canProcess || isProcessing}
              className={`
                w-full mt-8 py-4 px-6 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all
                ${canProcess && !isProcessing 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-[0.98]' 
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'}
              `}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Processando Documentos...
                </>
              ) : (
                <>
                  <ChevronRight className="w-5 h-5" />
                  Iniciar Extração
                </>
              )}
            </button>

            <button
              onClick={startManualProposal}
              className="w-full mt-4 py-3 px-4 rounded-xl border border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition-all flex items-center justify-center gap-2 text-sm font-medium"
            >
              <ClipboardList className="w-4 h-4" />
              Nova Proposta Manual
            </button>

            {!canProcess && !isProcessing && (
              <p className="text-center text-xs text-slate-400 mt-4 italic">
                Faça o upload de pelo menos um documento para habilitar a extração.
              </p>
            )}
          </section>

          {error && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-red-50 border border-red-100 rounded-xl flex gap-3 text-red-600"
            >
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p className="text-sm">{error}</p>
            </motion.div>
          )}
        </div>

        {/* Right Column: Results */}
        <div className="lg:col-span-7">
          <AnimatePresence mode="wait">
            {result ? (
              <motion.div
                key="result"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                {/* Summary Cards */}
                <div className="flex justify-between items-center gap-3 mb-4">
                  {result.id && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-xs font-mono">
                      <Hash className="w-3 h-3" />
                      ID: {result.id.substring(0, 8).toUpperCase()}
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={startNewExtraction}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Nova Extração
                    </button>
                    <button
                      onClick={() => setIsEditing(!isEditing)}
                      className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
                    >
                      {isEditing ? (
                        <>
                          <Save className="w-4 h-4 text-emerald-500" />
                          Finalizar Edição
                        </>
                      ) : (
                        <>
                          <Edit2 className="w-4 h-4 text-indigo-500" />
                          Editar Dados
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="glass-panel p-5 rounded-2xl">
                    <div className="flex items-center gap-3 mb-4">
                      <Building2 className="w-5 h-5 text-indigo-500" />
                      <h3 className="text-sm font-semibold text-slate-900">Dados do Imóvel</h3>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-400">Empreendimento</span>
                        {isEditing ? (
                          empreendimentos.length > 0 ? (
                            <select 
                              value={result.property?.empreendimento || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                updateResult('property', 'empreendimento', val);
                                const matched = empreendimentos.find(emp => emp.nome === val);
                                if (matched?.localizacao) {
                                  const parts = matched.localizacao.includes(' - ') 
                                    ? matched.localizacao.split(' - ') 
                                    : matched.localizacao.includes('/') 
                                      ? matched.localizacao.split('/') 
                                      : [matched.localizacao, ''];
                                  setResult(prev => {
                                    if (!prev) return null;
                                    return {
                                      ...prev,
                                      property: {
                                        ...prev.property,
                                        empreendimento: val,
                                        cidade: parts[0]?.trim() || prev.property?.cidade || '',
                                        estado: parts[1]?.trim() || prev.property?.estado || '',
                                        endereco: matched?.endereco || matched?.localizacao || prev.property?.endereco || ''
                                      }
                                    };
                                  });
                                }
                              }}
                              className="text-right font-medium border-b border-indigo-200 focus:border-indigo-500 outline-none bg-transparent"
                            >
                              <option value="">Selecione...</option>
                              {empreendimentos.filter(emp => emp.status === 'ATIVO').map(emp => (
                                <option key={emp.id} value={emp.nome}>{emp.nome}</option>
                              ))}
                              <option value="OUTRO">OUTRO...</option>
                            </select>
                          ) : (
                            <input 
                              type="text" 
                              value={result.property?.empreendimento || ''}
                              onChange={(e) => updateResult('property', 'empreendimento', e.target.value)}
                              className="text-right font-medium border-b border-indigo-200 focus:border-indigo-500 outline-none bg-transparent"
                            />
                          )
                        ) : (
                          <span className="font-medium">{result.property?.empreendimento || '-'}</span>
                        )}
                      </div>
                      {isEditing && (result.property?.empreendimento === 'OUTRO' || empreendimentos.length === 0) && (
                        <div className="flex justify-between items-center text-sm pt-2">
                          <span className="text-slate-400">Nome do Empreendimento</span>
                          <input 
                            type="text" 
                            value={result.property?.empreendimento === 'OUTRO' ? '' : (result.property?.empreendimento || '')}
                            onChange={(e) => updateResult('property', 'empreendimento', e.target.value)}
                            className="text-right font-medium border-b border-indigo-200 focus:border-indigo-500 outline-none bg-transparent"
                            placeholder="Digite o nome..."
                          />
                        </div>
                      )}
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-400">Unidade</span>
                        {isEditing ? (
                          <input 
                            type="text" 
                            value={result.property?.unidade || ''}
                            onChange={(e) => updateResult('property', 'unidade', e.target.value)}
                            className="text-right font-medium border-b border-indigo-200 focus:border-indigo-500 outline-none bg-transparent"
                          />
                        ) : (
                          <span className="font-medium">{result.property?.unidade || '-'}</span>
                        )}
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-400">Torre/Bloco</span>
                        {isEditing ? (
                          <input 
                            type="text" 
                            value={result.property?.torre || ''}
                            onChange={(e) => updateResult('property', 'torre', e.target.value)}
                            className="text-right font-medium border-b border-indigo-200 focus:border-indigo-500 outline-none bg-transparent"
                          />
                        ) : (
                          <span className="font-medium">{result.property?.torre || '-'}</span>
                        )}
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-400">Município/UF (Imóvel)</span>
                        {isEditing ? (
                          <div className="flex gap-2 justify-end">
                            <input 
                              type="text" 
                              value={result.property?.cidade || ''}
                              onChange={(e) => updateResult('property', 'cidade', e.target.value)}
                              placeholder="Município do Imóvel"
                              className="text-right font-medium border-b border-indigo-200 focus:border-indigo-500 outline-none bg-transparent w-36"
                            />
                            <input 
                              type="text" 
                              value={result.property?.estado || ''}
                              onChange={(e) => updateResult('property', 'estado', e.target.value.toUpperCase())}
                              placeholder="UF"
                              maxLength={2}
                              className="text-right font-medium border-b border-indigo-200 focus:border-indigo-500 outline-none bg-transparent w-10 uppercase"
                            />
                          </div>
                        ) : (
                          <span className="font-medium text-slate-800">
                            {getLocalImovel(result.property, result.address, empreendimentos)}
                          </span>
                        )}
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-400">Endereço (Empreendimento)</span>
                        {isEditing ? (
                          <input 
                            type="text" 
                            value={result.property?.endereco || ''}
                            onChange={(e) => updateResult('property', 'endereco', e.target.value)}
                            placeholder={getEnderecoEmpreendimento(result.property, empreendimentos)}
                            className="text-right font-medium border-b border-indigo-200 focus:border-indigo-500 outline-none bg-transparent w-64 placeholder:text-slate-300"
                          />
                        ) : (
                          <span className="font-medium text-slate-800 text-right max-w-[280px] truncate" title={getEnderecoEmpreendimento(result.property, empreendimentos)}>
                            {getEnderecoEmpreendimento(result.property, empreendimentos)}
                          </span>
                        )}
                      </div>
                      <div className="flex justify-between items-center text-sm pt-2 border-t border-slate-100 mt-2">
                        <span className="text-indigo-600 font-semibold">Valor Total Proposta</span>
                        {isEditing ? (
                          <input 
                            type="number" 
                            value={result.valorTotalProposta || 0}
                            onChange={(e) => setResult(prev => prev ? {...prev, valorTotalProposta: parseFloat(e.target.value)} : null)}
                            className="text-right font-bold text-indigo-600 border-b border-indigo-200 focus:border-indigo-500 outline-none bg-transparent"
                          />
                        ) : (
                          <span className="font-bold text-indigo-600">
                            {result.valorTotalProposta?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) || '-'}
                          </span>
                        )}
                      </div>
                      <div className="flex justify-between items-center text-sm pt-2 border-t border-slate-100 mt-2">
                        <span className="text-orange-600 font-semibold">Total de Entradas</span>
                        {isEditing ? (
                          <input 
                            type="number" 
                            value={result.valorEntrada || 0}
                            onChange={(e) => setResult(prev => prev ? {...prev, valorEntrada: parseFloat(e.target.value)} : null)}
                            className="text-right font-bold text-orange-600 border-b border-orange-200 focus:border-orange-500 outline-none bg-transparent"
                          />
                        ) : (
                          <span className="font-bold text-orange-600">
                            {result.valorEntrada?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) || '-'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="glass-panel p-5 rounded-2xl">
                    <div className="flex items-center gap-3 mb-4">
                      <Users className="w-5 h-5 text-indigo-500" />
                      <h3 className="text-sm font-semibold text-slate-900">Equipe de Vendas</h3>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-400">Corretor 1</span>
                        {isEditing ? (
                          <input 
                            type="text" 
                            value={result.salesTeam?.corretor1 || ''}
                            onChange={(e) => updateResult('salesTeam', 'corretor1', e.target.value)}
                            className="text-right font-medium border-b border-indigo-200 focus:border-indigo-500 outline-none bg-transparent"
                          />
                        ) : (
                          <span className="font-medium">{result.salesTeam?.corretor1 || '-'}</span>
                        )}
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-400">Corretor 2</span>
                        {isEditing ? (
                          <input 
                            type="text" 
                            value={result.salesTeam?.corretor2 || ''}
                            onChange={(e) => updateResult('salesTeam', 'corretor2', e.target.value)}
                            className="text-right font-medium border-b border-indigo-200 focus:border-indigo-500 outline-none bg-transparent"
                          />
                        ) : (
                          <span className="font-medium">{result.salesTeam?.corretor2 || '-'}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Status and Additional Info */}
                  <div className="glass-panel p-5 rounded-2xl md:col-span-2">
                    <div className="flex items-center gap-3 mb-4">
                      <ClipboardList className="w-5 h-5 text-indigo-500" />
                      <h3 className="text-sm font-semibold text-slate-900">Status e Informações Adicionais</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-400 font-medium">PROPOSTA</span>
                        {isEditing ? (
                          <select 
                            value={result.proposta_status || 'AGUARDANDO APROVAÇÃO'}
                            onChange={(e) => setResult(prev => prev ? {...prev, proposta_status: e.target.value as PropostaStatus} : null)}
                            className="text-right font-medium border-b border-indigo-200 focus:border-indigo-500 outline-none bg-transparent"
                          >
                            <option value="AGUARDANDO APROVAÇÃO">AGUARDANDO APROVAÇÃO</option>
                            <option value="APROVADA">APROVADA</option>
                            <option value="DEVOLVIDA">DEVOLVIDA</option>
                            <option value="CANCELADA">CANCELADA</option>
                          </select>
                        ) : (
                          <span className="font-medium">{result.proposta_status || '-'}</span>
                        )}
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-400 font-medium">CVC</span>
                        {isEditing ? (
                          <select 
                            value={result.cvc_status || 'PENDENTE'}
                            onChange={(e) => setResult(prev => prev ? {...prev, cvc_status: e.target.value as CVCStatus} : null)}
                            className="text-right font-medium border-b border-indigo-200 focus:border-indigo-500 outline-none bg-transparent"
                          >
                            <option value="PENDENTE">PENDENTE</option>
                            <option value="NA FILA">NA FILA</option>
                            <option value="ENVIADO">ENVIADO</option>
                            <option value="ASSINADO">ASSINADO</option>
                            <option value="CANCELADO">CANCELADO</option>
                          </select>
                        ) : (
                          <span className="font-medium">{result.cvc_status || '-'}</span>
                        )}
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-400 font-medium">CORRETAGEM</span>
                        {isEditing ? (
                          <select 
                            value={result.corretagem_status || 'PENDENTE'}
                            onChange={(e) => setResult(prev => prev ? {...prev, corretagem_status: e.target.value as CorretagemStatus} : null)}
                            className="text-right font-medium border-b border-indigo-200 focus:border-indigo-500 outline-none bg-transparent"
                          >
                            <option value="PENDENTE">PENDENTE</option>
                            <option value="NA FILA">NA FILA</option>
                            <option value="ENVIADO">ENVIADO</option>
                            <option value="ASSINADO">ASSINADO</option>
                            <option value="CANCELADO">CANCELADO</option>
                            <option value="DEVOLVIDO">DEVOLVIDO</option>
                          </select>
                        ) : (
                          <span className="font-medium">{result.corretagem_status || '-'}</span>
                        )}
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-400 font-medium">FORMA DE PAGTO</span>
                        {isEditing ? (
                          <select 
                            value={result.forma_pagamento_comissao || 'PAGADORIA'}
                            onChange={(e) => setResult(prev => prev ? {...prev, forma_pagamento_comissao: e.target.value as FormaPagamentoComissao} : null)}
                            className="text-right font-medium border-b border-indigo-200 focus:border-indigo-500 outline-none bg-transparent"
                          >
                            <option value="PAGADORIA">PAGADORIA</option>
                            <option value="NF/REPASSE">NF/REPASSE</option>
                            <option value="PAGADORIA INCORPORADOR">PAGADORIA INCORPORADOR</option>
                          </select>
                        ) : (
                          <span className="font-medium">{result.forma_pagamento_comissao || '-'}</span>
                        )}
                      </div>
                      <div className="col-span-full mt-2">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Informações Adicionais</label>
                        {isEditing ? (
                          <textarea 
                            value={result.informacoes_adicionais || ''}
                            onChange={(e) => setResult(prev => prev ? {...prev, informacoes_adicionais: e.target.value} : null)}
                            className="w-full p-3 rounded-xl border border-indigo-100 focus:border-indigo-500 outline-none bg-slate-50/50 text-sm min-h-[100px]"
                            placeholder="Insira observações ou informações extras aqui..."
                          />
                        ) : (
                          <div className="p-3 rounded-xl bg-slate-50 text-sm text-slate-600 min-h-[60px] whitespace-pre-wrap border border-slate-100 italic">
                            {result.informacoes_adicionais || 'Nenhuma informação adicional.'}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Customers Data */}
                <div className="space-y-4">
                  {(result.customers || []).map((customer, index) => (
                    <div key={index} className="glass-panel p-5 rounded-2xl relative">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <Users className="w-5 h-5 text-indigo-500" />
                          <h3 className="text-sm font-semibold text-slate-900">
                            Dados do Comprador {index + 1}
                          </h3>
                        </div>
                        {isEditing && (result.customers || []).length > 1 && (
                          <button 
                            onClick={() => removeCustomer(index)}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Remover Comprador"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-400">Nome</span>
                          {isEditing ? (
                            <input 
                              type="text" 
                              value={customer.nome || ''}
                              onChange={(e) => updateCustomer(index, 'nome', e.target.value)}
                              className="text-right font-medium border-b border-indigo-200 focus:border-indigo-500 outline-none bg-transparent w-full ml-4"
                            />
                          ) : (
                            <span className="font-medium">{customer.nome || '-'}</span>
                          )}
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-400">CPF</span>
                          {isEditing ? (
                            <input 
                              type="text" 
                              value={customer.cpf || ''}
                              onChange={(e) => updateCustomer(index, 'cpf', e.target.value)}
                              className="text-right font-medium border-b border-indigo-200 focus:border-indigo-500 outline-none bg-transparent"
                            />
                          ) : (
                            <span className="font-medium">{customer.cpf || '-'}</span>
                          )}
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-400">Telefone</span>
                          {isEditing ? (
                            <input 
                              type="text" 
                              value={customer.telefone || ''}
                              onChange={(e) => updateCustomer(index, 'telefone', e.target.value)}
                              className="text-right font-medium border-b border-indigo-200 focus:border-indigo-500 outline-none bg-transparent"
                            />
                          ) : (
                            <span className="font-medium">{customer.telefone || '-'}</span>
                          )}
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-400">Email</span>
                          {isEditing ? (
                            <input 
                              type="email" 
                              value={customer.email || ''}
                              onChange={(e) => updateCustomer(index, 'email', e.target.value)}
                              className="text-right font-medium border-b border-indigo-200 focus:border-indigo-500 outline-none bg-transparent"
                            />
                          ) : (
                            <span className="font-medium">{customer.email || '-'}</span>
                          )}
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-400">Nascimento</span>
                          {isEditing ? (
                            <input 
                              type="text" 
                              value={customer.dataNascimento || ''}
                              onChange={(e) => updateCustomer(index, 'dataNascimento', e.target.value)}
                              className="text-right font-medium border-b border-indigo-200 focus:border-indigo-500 outline-none bg-transparent"
                            />
                          ) : (
                            <span className="font-medium">{customer.dataNascimento || '-'}</span>
                          )}
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-400">RG</span>
                          {isEditing ? (
                            <div className="flex gap-2 justify-end">
                              <input 
                                type="text" 
                                value={customer.rgNumero || ''}
                                onChange={(e) => updateCustomer(index, 'rgNumero', e.target.value)}
                                className="text-right font-medium border-b border-indigo-200 focus:border-indigo-500 outline-none bg-transparent w-24"
                              />
                              <input 
                                type="text" 
                                value={customer.rgOrgao || ''}
                                onChange={(e) => updateCustomer(index, 'rgOrgao', e.target.value)}
                                className="text-right font-medium border-b border-indigo-200 focus:border-indigo-500 outline-none bg-transparent w-12"
                              />
                            </div>
                          ) : (
                            <span className="font-medium">{customer.rgNumero || '-'} ({customer.rgOrgao || '-'})</span>
                          )}
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-400">Estado Civil</span>
                          {isEditing ? (
                            <input 
                              type="text" 
                              value={customer.estadoCivil || ''}
                              onChange={(e) => updateCustomer(index, 'estadoCivil', e.target.value)}
                              className="text-right font-medium border-b border-indigo-200 focus:border-indigo-500 outline-none bg-transparent"
                            />
                          ) : (
                            <span className="font-medium">{customer.estadoCivil || '-'}</span>
                          )}
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-400">Profissão</span>
                          {isEditing ? (
                            <input 
                              type="text" 
                              value={customer.profissao || ''}
                              onChange={(e) => updateCustomer(index, 'profissao', e.target.value)}
                              className="text-right font-medium border-b border-indigo-200 focus:border-indigo-500 outline-none bg-transparent"
                            />
                          ) : (
                            <span className="font-medium">{customer.profissao || '-'}</span>
                          )}
                        </div>

                        {/* Customer Address Fields */}
                        <div className="col-span-full mt-4 pt-4 border-t border-slate-100">
                          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Endereço do Comprador</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-slate-400">CEP</span>
                              {isEditing ? (
                                <input 
                                  type="text" 
                                  value={customer.address?.cep || ''}
                                  onChange={(e) => updateCustomerAddress(index, 'cep', e.target.value)}
                                  className="text-right font-medium border-b border-indigo-200 focus:border-indigo-500 outline-none bg-transparent"
                                />
                              ) : (
                                <span className="font-medium">{customer.address?.cep || '-'}</span>
                              )}
                            </div>
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-slate-400">Logradouro</span>
                              {isEditing ? (
                                <input 
                                  type="text" 
                                  value={customer.address?.logradouro || ''}
                                  onChange={(e) => updateCustomerAddress(index, 'logradouro', e.target.value)}
                                  className="text-right font-medium border-b border-indigo-200 focus:border-indigo-500 outline-none bg-transparent"
                                />
                              ) : (
                                <span className="font-medium">{customer.address?.logradouro || '-'}</span>
                              )}
                            </div>
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-slate-400">Número</span>
                              {isEditing ? (
                                <input 
                                  type="text" 
                                  value={customer.address?.numero || ''}
                                  onChange={(e) => updateCustomerAddress(index, 'numero', e.target.value)}
                                  className="text-right font-medium border-b border-indigo-200 focus:border-indigo-500 outline-none bg-transparent w-16"
                                />
                              ) : (
                                <span className="font-medium">{customer.address?.numero || '-'}</span>
                              )}
                            </div>
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-slate-400">Bairro</span>
                              {isEditing ? (
                                <input 
                                  type="text" 
                                  value={customer.address?.bairro || ''}
                                  onChange={(e) => updateCustomerAddress(index, 'bairro', e.target.value)}
                                  className="text-right font-medium border-b border-indigo-200 focus:border-indigo-500 outline-none bg-transparent"
                                />
                              ) : (
                                <span className="font-medium">{customer.address?.bairro || '-'}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {isEditing && (
                    <button
                      onClick={addCustomer}
                      className="w-full py-3 border-2 border-dashed border-indigo-200 rounded-2xl text-indigo-600 hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
                    >
                      <Plus className="w-4 h-4" />
                      Adicionar Comprador
                    </button>
                  )}
                </div>

                {/* Address Data */}
                <div className="glass-panel p-5 rounded-2xl">
                  <div className="flex items-center gap-3 mb-4">
                    <FileText className="w-5 h-5 text-indigo-500" />
                    <h3 className="text-sm font-semibold text-slate-900">Endereço</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">CEP</span>
                      {isEditing ? (
                        <input 
                          type="text" 
                          value={result.address?.cep || ''}
                          onChange={(e) => updateResult('address', 'cep', e.target.value)}
                          className="text-right font-medium border-b border-indigo-200 focus:border-indigo-500 outline-none bg-transparent"
                        />
                      ) : (
                        <span className="font-medium">{result.address?.cep || '-'}</span>
                      )}
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Logradouro</span>
                      {isEditing ? (
                        <div className="flex gap-2 justify-end w-full ml-4">
                          <input 
                            type="text" 
                            value={result.address?.logradouro || ''}
                            onChange={(e) => updateResult('address', 'logradouro', e.target.value)}
                            className="text-right font-medium border-b border-indigo-200 focus:border-indigo-500 outline-none bg-transparent flex-1"
                          />
                          <input 
                            type="text" 
                            value={result.address?.numero || ''}
                            onChange={(e) => updateResult('address', 'numero', e.target.value)}
                            className="text-right font-medium border-b border-indigo-200 focus:border-indigo-500 outline-none bg-transparent w-16"
                          />
                        </div>
                      ) : (
                        <span className="font-medium">{result.address?.logradouro || '-'}, {result.address?.numero || '-'}</span>
                      )}
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Bairro</span>
                      {isEditing ? (
                        <input 
                          type="text" 
                          value={result.address?.bairro || ''}
                          onChange={(e) => updateResult('address', 'bairro', e.target.value)}
                          className="text-right font-medium border-b border-indigo-200 focus:border-indigo-500 outline-none bg-transparent"
                        />
                      ) : (
                        <span className="font-medium">{result.address?.bairro || '-'}</span>
                      )}
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Cidade/UF</span>
                      {isEditing ? (
                        <div className="flex gap-2 justify-end">
                          <input 
                            type="text" 
                            value={result.address?.cidade || ''}
                            onChange={(e) => updateResult('address', 'cidade', e.target.value)}
                            className="text-right font-medium border-b border-indigo-200 focus:border-indigo-500 outline-none bg-transparent"
                          />
                          <input 
                            type="text" 
                            value={result.address?.estado || ''}
                            onChange={(e) => updateResult('address', 'estado', e.target.value)}
                            className="text-right font-medium border-b border-indigo-200 focus:border-indigo-500 outline-none bg-transparent w-10"
                          />
                        </div>
                      ) : (
                        <span className="font-medium">{result.address?.cidade || '-'}/{result.address?.estado || '-'}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Validations */}
                <div className="glass-panel p-5 rounded-2xl">
                  <div className="flex items-center gap-3 mb-4">
                    <ShieldCheck className="w-5 h-5 text-indigo-500" />
                    <h3 className="text-sm font-semibold text-slate-900">Validações de Cadastro</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className={`flex items-center gap-2 p-3 rounded-lg border ${result.validations?.cpfMatch ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-700'}`}>
                      {result.validations?.cpfMatch ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                      <span className="text-xs font-medium">Conferência de CPF</span>
                    </div>
                    <div className={`flex items-center gap-2 p-3 rounded-lg border ${result.validations?.totalValueMatch ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-700'}`}>
                      {result.validations?.totalValueMatch ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                      <span className="text-xs font-medium">Soma das Parcelas</span>
                    </div>
                  </div>
                  {result.validations?.message && (
                    <p className="mt-3 text-xs text-slate-500 italic">Nota: {result.validations.message}</p>
                  )}
                </div>

                {/* Identified Documents */}
                {result.documents && result.documents.length > 0 && (
                  <div className="glass-panel p-5 rounded-2xl">
                    <div className="flex items-center gap-3 mb-4">
                      <FileSearch className="w-5 h-5 text-indigo-500" />
                      <h3 className="text-sm font-semibold text-slate-900">Documentos Identificados</h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {result.documents.map((doc, idx) => (
                        <div key={idx} className={`flex flex-col p-3 rounded-xl border ${doc.found ? 'bg-indigo-50/50 border-indigo-100' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                          <div className="flex items-center gap-2 mb-1">
                            {doc.found ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                            ) : (
                              <X className="w-3.5 h-3.5 text-slate-400" />
                            )}
                            <span className={`text-xs font-bold ${doc.found ? 'text-indigo-900' : 'text-slate-500'}`}>
                              {doc.type}
                            </span>
                          </div>
                          {doc.description && (
                            <p className="text-[10px] text-slate-600 leading-relaxed">
                              {doc.description}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Payment Table with Lateral Buttons */}
                <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
                  {/* Actions Sidebar */}
                  <div className="xl:col-span-1 space-y-4 bg-slate-50/70 p-5 rounded-2xl border border-slate-100 flex flex-col h-full min-h-[400px]">
                    <div>
                      <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-200">
                        <CreditCard className="w-4 h-4 text-indigo-500" />
                        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest">
                          Ações da Proposta
                        </h3>
                      </div>
                      
                      <div className="flex flex-col gap-2">
                        {/* 1. Save button */}
                        <button 
                          onClick={saveToFirestore}
                          disabled={isSaving}
                          className={`w-full flex items-center gap-2.5 justify-start text-xs font-bold py-2.5 px-3 rounded-xl transition-all shadow-sm border ${
                            saveStatus === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100/70' : 
                            saveStatus === 'error' ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100/70' : 
                            'bg-indigo-50 text-indigo-700 border-indigo-100 hover:bg-indigo-100/70'
                          }`}
                        >
                          {isSaving ? (
                            <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                          ) : saveStatus === 'success' ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <CloudUpload className="w-4 h-4 text-indigo-500" />
                          )}
                          {saveStatus === 'success' ? 'SALVO NO BANCO!' : 'SALVAR NO BANCO'}
                        </button>

                        {/* 2. Ver no Dashboard (conditional) */}
                        {saveStatus === 'success' && (
                          <button 
                            onClick={() => setView('dashboard')}
                            className="w-full flex items-center gap-2.5 justify-start text-xs font-bold py-2.5 px-3 bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl transition-all shadow-sm animate-pulse border border-emerald-600"
                          >
                            <LayoutDashboard className="w-4 h-4" />
                            VER NO DASHBOARD
                          </button>
                        )}

                        {/* Divider for exports */}
                        <div className="my-1.5 border-t border-slate-200/50"></div>

                        {/* 3. Baixar PDF */}
                        <button 
                          onClick={() => generatePDF()}
                          className="w-full flex items-center gap-2.5 justify-start text-xs font-bold py-2.5 px-3 bg-indigo-50 text-indigo-700 hover:bg-indigo-100/70 border border-indigo-100 rounded-xl transition-all shadow-sm"
                        >
                          <FileText className="w-4 h-4 text-indigo-500" />
                          BAIXAR PDF
                        </button>

                        {/* 4. Ficha + Docs */}
                        <button 
                          onClick={() => generateUnifiedFicha()}
                          className="w-full flex items-center gap-2.5 justify-start text-xs font-bold py-2.5 px-3 bg-indigo-50 text-indigo-700 hover:bg-indigo-100/70 border border-indigo-100 rounded-xl transition-all shadow-sm"
                        >
                          <FileText className="w-4 h-4 text-indigo-500" />
                          FICHA + DOCS
                        </button>

                        {/* 5. Baixar CSV */}
                        <button 
                          onClick={downloadCSV}
                          className="w-full flex items-center gap-2.5 justify-start text-xs font-bold py-2.5 px-3 bg-slate-100 text-slate-700 hover:bg-slate-200/70 border border-slate-200/50 rounded-xl transition-all shadow-sm"
                        >
                          <Download className="w-4 h-4 text-slate-500" />
                          BAIXAR CSV
                        </button>

                        {/* Divider for print */}
                        <div className="my-1.5 border-t border-slate-200/50"></div>

                        {/* 6. Imprimir Proposta */}
                        <button 
                          onClick={() => printProposalRJ(result)}
                          className="w-full flex items-center gap-2.5 justify-start text-xs font-bold py-2.5 px-3 bg-blue-50 text-blue-700 hover:bg-blue-100/70 border border-blue-100 rounded-xl transition-all shadow-sm"
                        >
                          <Printer className="w-4 h-4 text-blue-500" />
                          IMPRIMIR PROPOSTA
                        </button>

                        {/* 7. Baixar Contrato em PDF */}
                        <button 
                          onClick={() => downloadContractPDF(result)}
                          className="w-full flex items-center gap-2.5 justify-start text-xs font-bold py-2.5 px-3 bg-teal-50 text-teal-700 hover:bg-teal-100/70 border border-teal-100 rounded-xl transition-all shadow-sm"
                        >
                          <Download className="w-4 h-4 text-teal-500" />
                          BAIXAR CONTRATO EM PDF
                        </button>

                        {/* Divider for integrations */}
                        <div className="my-1.5 border-t border-slate-200/50"></div>

                        {/* 8. Google Sheets */}
                        <button 
                          onClick={exportToGoogleSheets}
                          disabled={isExportingToSheets}
                          className="w-full flex items-center gap-2.5 justify-start text-xs font-bold py-2.5 px-3 bg-emerald-50 text-emerald-700 hover:bg-emerald-100/70 border border-emerald-200 disabled:opacity-50 rounded-xl transition-all shadow-sm"
                        >
                          {isExportingToSheets ? (
                            <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                          ) : (
                            <Table className="w-4 h-4 text-emerald-500" />
                          )}
                          GOOGLE SHEETS
                        </button>

                        {/* 9. Salvar no Drive */}
                        <button 
                          onClick={uploadToDrive}
                          disabled={isUploadingToDrive}
                          className="w-full flex items-center gap-2.5 justify-start text-xs font-bold py-2.5 px-3 bg-blue-50 text-blue-700 hover:bg-blue-100/70 border border-blue-100 disabled:opacity-50 rounded-xl transition-all shadow-sm"
                        >
                          {isUploadingToDrive ? (
                            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                          ) : (
                            <CloudUpload className="w-4 h-4 text-blue-500" />
                          )}
                          SALVAR NO DRIVE
                        </button>

                        {/* 10. AppSheet */}
                        <button 
                          onClick={() => sendToAppSheet(result)}
                          disabled={isSyncingAppSheet}
                          className="w-full flex items-center gap-2.5 justify-start text-xs font-bold py-2.5 px-3 bg-orange-50 text-orange-700 hover:bg-orange-100/70 border border-orange-200 disabled:opacity-50 rounded-xl transition-all shadow-sm"
                        >
                          {isSyncingAppSheet ? (
                            <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
                          ) : (
                            <Smartphone className="w-4 h-4 text-orange-500" />
                          )}
                          APPSHEET
                        </button>

                        {/* 11. Enviar por Email */}
                        <button 
                          onClick={() => sendProposalByEmail(result)}
                          className="w-full flex items-center gap-2.5 justify-start text-xs font-bold py-2.5 px-3 bg-violet-50 text-violet-700 hover:bg-violet-100/70 border border-violet-200 rounded-xl transition-all shadow-sm"
                          title="Enviar Ficha + DOC por E-mail"
                        >
                          <Mail className="w-4 h-4 text-violet-500" />
                          ENVIAR POR E-MAIL
                        </button>
                      </div>
                    </div>

                    {/* 12. Google Logout Button at bottom */}
                    <div className="mt-auto pt-4 border-t border-slate-200/50">
                      <button 
                        onClick={logoutGoogle}
                        title="Desconectar conta Google (corrigir permissões)"
                        className="w-full flex items-center gap-2.5 justify-start text-xs font-medium py-2 px-3 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded-xl transition-all border border-transparent hover:border-red-100"
                      >
                        <LogOut className="w-4 h-4 text-slate-400" />
                        Desconectar Google
                      </button>
                    </div>
                  </div>

                  {/* Table Component */}
                  <div className="xl:col-span-3 glass-panel rounded-2xl overflow-hidden self-start">
                    <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <CreditCard className="w-5 h-5 text-indigo-500" />
                        <h3 className="text-sm font-semibold text-slate-900">Proposta Comercial</h3>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50/50">
                            <th className="p-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Qtd</th>
                            <th className="p-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Tipo</th>
                            <th className="p-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Valor Unit.</th>
                            <th className="p-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Vencimento</th>
                            <th className="p-4 text-[10px] font-bold uppercase tracking-wider text-slate-400 text-right">Total</th>
                            {isEditing && <th className="p-4 text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center w-10">Ações</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {result.payments.map((p, i) => (
                            <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                              <td className="p-4 text-sm font-mono text-slate-500">
                                {isEditing ? (
                                  <input 
                                    type="number" 
                                    value={p.quantidade}
                                    onChange={(e) => updatePayment(i, 'quantidade', parseInt(e.target.value) || 0)}
                                    className="w-12 border-b border-indigo-200 focus:border-indigo-500 outline-none bg-transparent"
                                  />
                                ) : p.quantidade}
                              </td>
                              <td className="p-4 text-sm font-medium text-slate-700">
                                {isEditing ? (
                                  <input 
                                    type="text" 
                                    value={p.tipo}
                                    onChange={(e) => updatePayment(i, 'tipo', e.target.value)}
                                    className="border-b border-indigo-200 focus:border-indigo-500 outline-none bg-transparent"
                                  />
                                ) : p.tipo}
                              </td>
                              <td className="p-4 text-sm text-slate-600">
                                {isEditing ? (
                                  <input 
                                    type="number" 
                                    value={p.valorUnitario}
                                    onChange={(e) => updatePayment(i, 'valorUnitario', parseFloat(e.target.value) || 0)}
                                    className="w-24 border-b border-indigo-200 focus:border-indigo-500 outline-none bg-transparent"
                                  />
                                ) : (
                                  p.valorUnitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                                )}
                              </td>
                              <td className="p-4 text-sm text-slate-500">
                                {isEditing ? (
                                  <input 
                                    type="text" 
                                    value={p.vencimento}
                                    onChange={(e) => updatePayment(i, 'vencimento', e.target.value)}
                                    className="border-b border-indigo-200 focus:border-indigo-500 outline-none bg-transparent"
                                  />
                                ) : p.vencimento}
                              </td>
                              <td className="p-4 text-sm font-semibold text-slate-900 text-right">
                                {p.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </td>
                              {isEditing && (
                                <td className="p-4 text-center">
                                  <button 
                                    onClick={() => removePayment(i)}
                                    className="p-1 hover:bg-red-100 text-red-500 rounded transition-colors"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-indigo-50/30 font-bold">
                            <td colSpan={4} className="p-4 text-sm text-slate-700 text-right">Soma das Parcelas:</td>
                            <td className="p-4 text-sm text-indigo-700 text-right">
                              {result.payments.reduce((acc, p) => acc + p.valorTotal, 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </td>
                            {isEditing && <td></td>}
                          </tr>
                          {result.valorTotalProposta && (
                            <tr className="border-t border-slate-100">
                              <td colSpan={4} className="p-4 text-xs text-slate-500 text-right italic">Valor Total da Proposta (Documento):</td>
                              <td className="p-4 text-xs text-slate-500 text-right font-medium">
                                {result.valorTotalProposta.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </td>
                              {isEditing && <td></td>}
                            </tr>
                          )}
                          {isEditing && (
                            <tr>
                              <td colSpan={6} className="p-4">
                                <button 
                                  onClick={addPayment}
                                  className="w-full py-2 border-2 border-dashed border-indigo-200 rounded-lg text-indigo-600 hover:bg-indigo-50 transition-all flex items-center justify-center gap-2 text-xs font-bold"
                                >
                                  <Plus className="w-3 h-3" />
                                  ADICIONAR PARCELA
                                </button>
                              </td>
                            </tr>
                          )}
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Commission Calculation Simulation */}
                <div className="glass-panel p-5 rounded-2xl">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <Calculator className="w-5 h-5 text-indigo-500" />
                      <h3 className="text-sm font-semibold text-slate-900">Simulação de Fluxo Líquido (Comissão)</h3>
                    </div>
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => exportRateioToWebropay(waterfallResult)}
                        disabled={!simulationResult || isExportingWebropay}
                        className="flex items-center gap-2 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold transition-all active:scale-[0.98] disabled:opacity-50"
                        title="Gerar Planilha Webropay (.xlsx) com abas Beneficiários e Pagador"
                      >
                        {isExportingWebropay ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                        )}
                        {isExportingWebropay ? 'GERANDO...' : 'PLANILHA WEBROPAY'}
                      </button>
                      <button 
                        onClick={() => printDetailedFlow(simulationResult)}
                        disabled={!simulationResult || isSimulating}
                        className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all active:scale-[0.98] disabled:opacity-50"
                      >
                        <Printer className="w-4 h-4" />
                        IMPRIMIR FLUXO
                      </button>
                      <button 
                        onClick={() => runSimulation()}
                        disabled={isSimulating}
                        className={`flex items-center gap-2 px-3 py-2 text-white rounded-xl text-xs font-bold transition-all shadow-lg hover:scale-[1.02] active:scale-[0.98] ${
                          isSimulating ? 'bg-slate-400 cursor-not-allowed shadow-none' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100'
                        }`}
                      >
                        {isSimulating ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Calculator className="w-4 h-4" />
                        )}
                        {isSimulating ? 'PROCESSANDO...' : 'CALCULAR'}
                      </button>
                      <div className="flex items-center gap-2">
                         <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Comissão:</span>
                         <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
                            <input 
                              type="number" 
                              step="0.1"
                              value={percentualComissao}
                              onChange={(e) => setPercentualComissao(parseFloat(e.target.value) || 0)}
                              className="w-12 bg-transparent text-sm font-bold text-indigo-600 outline-none"
                            />
                            <span className="text-sm font-bold text-slate-400">%</span>
                         </div>
                      </div>
                    </div>
                  </div>
                  
                  {isSimulating ? (
                    <div className="py-12 flex flex-col items-center justify-center gap-3">
                       <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                       <p className="text-xs font-bold text-slate-400 uppercase tracking-widest animate-pulse">Sincronizando com a Proposta Comercial...</p>
                    </div>
                  ) : simulationResult ? (() => {
                    const currentEmp = empreendimentos.find(e => e.nome === result.property.empreendimento);
                    const sim = simulationResult;
                    return (
                      <div className="space-y-4">
                        {currentEmp && (
                          <div className="flex items-center justify-between p-2 bg-indigo-50/50 border border-indigo-100 rounded-lg">
                            <div className="flex items-center gap-2">
                              <ShieldCheck className="w-4 h-4 text-indigo-500" />
                              <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">
                                {currentEmp.regras_comissao?.length ? 'Regras de dedução personalizadas aplicadas' : 'Usando regras de dedução padrão'}
                              </span>
                            </div>
                            <button 
                              onClick={() => openEmpreendimentoModal(currentEmp)}
                              className="px-2 py-1 bg-white border border-indigo-200 text-indigo-600 rounded text-[9px] font-bold hover:bg-indigo-50 transition-all flex items-center gap-1"
                            >
                              <Settings className="w-3 h-3" />
                              ATUALIZAR REGRAS
                            </button>
                          </div>
                        )}
                        {!currentEmp && result.property.empreendimento && (
                          <div className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-lg">
                             <div className="flex items-center gap-2">
                              <AlertCircle className="w-4 h-4 text-slate-400" />
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                Empreendimento não cadastrado: "{result.property.empreendimento}"
                              </span>
                            </div>
                            <button 
                              onClick={() => {
                                setEditingEmpreendimento(null);
                                setEmpreendimentoForm({
                                  nome: result.property.empreendimento || '',
                                  construtora: (result.property as any).construtora || '',
                                  localizacao: result.address?.cidade ? `${result.address.cidade} - ${result.address.estado || ''}` : '',
                                  endereco: result.property.endereco || '',
                                  tabela_base_id: '',
                                  status: 'ATIVO',
                                  regras_comissao: [],
                                  modelo_rateio: []
                                });
                                setShowEmpreendimentoModal(true);
                              }}
                              className="px-2 py-1 bg-white border border-slate-200 text-slate-600 rounded text-[9px] font-bold hover:bg-slate-50 transition-all flex items-center gap-1"
                            >
                              <Plus className="w-3 h-3" />
                              CADASTRAR EMPREENDIMENTO
                            </button>
                          </div>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                           <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl">
                              <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1">Comissão Total</p>
                              <div className="flex items-center justify-between">
                                <p className="text-xl font-bold text-indigo-900">
                                  {sim.comissaoTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </p>
                                <button 
                                  onClick={() => setView('rateio')}
                                  className="px-2 py-1 bg-indigo-600 text-white rounded-lg text-[10px] font-bold hover:bg-indigo-700 transition-all flex items-center gap-1 shadow-sm"
                                >
                                  <Workflow className="w-3 h-3" />
                                  DETALHAR RATEIO
                                </button>
                              </div>
                           </div>
                           <div className={`p-4 border rounded-xl ${sim.isViavel ? 'bg-emerald-50/50 border-emerald-100' : 'bg-red-50/50 border-red-100'}`}>
                              <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${sim.isViavel ? 'text-emerald-400' : 'text-red-400'}`}>
                                Viabilidade do Fluxo
                              </p>
                              <p className={`text-sm font-bold ${sim.isViavel ? 'text-emerald-900' : 'text-red-900'}`}>
                                {sim.isViavel ? 'Fluxo Viável - Comissão Coberta' : `Inviável - Saldo faltante: ${sim.saldoComissaoRestante.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`}
                              </p>
                           </div>
                        </div>

                        <div className="space-y-6">
                          <div className="space-y-2">
                            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">1. Condição de Pagamento da Proposta</h4>
                            <div className="overflow-x-auto glass-panel border-indigo-50">
                              <table className="w-full text-left text-[11px]">
                                <thead>
                                  <tr className="border-b border-slate-100 bg-slate-50/50">
                                    <th className="py-2 px-3 text-slate-400 font-bold uppercase tracking-wider w-20">QTD</th>
                                    <th className="py-2 px-3 text-slate-400 font-bold uppercase tracking-wider">TIPO</th>
                                    <th className="py-2 px-3 text-slate-400 font-bold uppercase tracking-wider text-right">VALOR DA PARCELA</th>
                                    <th className="py-2 px-3 text-slate-400 font-bold uppercase tracking-wider text-center w-28">VENCIMENTO</th>
                                    <th className="py-2 px-3 text-slate-400 font-bold uppercase tracking-wider text-center w-28">VENCIMENTO FINAL</th>
                                    <th className="py-2 px-3 text-slate-400 font-bold uppercase tracking-wider text-right">VALOR TOTAL DA PARCELA</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                  {result.payments.map((p, i) => {
                                    const matchingInstallments = sim.fluxo.filter(
                                      f => f.tipo === p.tipo && f.valorUnitario === p.valorUnitario
                                    );
                                    const vencimentoFinal = p.quantidade > 1 && matchingInstallments.length > 0
                                      ? matchingInstallments[matchingInstallments.length - 1].vencimento
                                      : p.vencimento || '-';

                                    return (
                                      <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="py-2.5 px-3 font-mono text-slate-500">{p.quantidade}x</td>
                                        <td className="py-2.5 px-3 font-medium text-slate-700">{p.tipo}</td>
                                        <td className="py-2.5 px-3 text-right text-slate-600">
                                          {p.valorUnitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                        </td>
                                        <td className="py-2.5 px-3 text-center font-mono text-slate-500">{p.vencimento || '-'}</td>
                                        <td className="py-2.5 px-3 text-center font-mono text-slate-500">{vencimentoFinal}</td>
                                        <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                                          {p.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                                <tfoot>
                                  <tr className="bg-indigo-50/30 font-bold text-indigo-900 border-t border-slate-100">
                                    <td colSpan={5} className="py-2.5 px-3 text-right text-slate-700">TOTAL GERAL:</td>
                                    <td className="py-2.5 px-3 text-right font-bold">
                                      {result.payments.reduce((acc, p) => acc + p.valorTotal, 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          </div>

                          {(() => {
                            const condicaoPreco = (sim.condicaoPreco && sim.condicaoPreco.length > 0)
                              ? sim.condicaoPreco
                              : extrairCondicaoPagamentoDoFluxo(sim.fluxo, 'preco');
                            const totalPrecoCalculado = condicaoPreco.reduce((acc, p) => acc + p.valorTotal, 0);
                            const parcelasPrecoDetalhadas = sim.fluxo.filter(f => f.valorLiquido > 0.005);

                            const condicaoComissao = (sim.condicaoComissao && sim.condicaoComissao.length > 0)
                              ? sim.condicaoComissao
                              : extrairCondicaoPagamentoDoFluxo(sim.fluxo, 'comissao');
                            const totalComissaoCalculada = condicaoComissao.reduce((acc, p) => acc + p.valorTotal, 0);
                            const parcelasComissaoDetalhadas = sim.fluxo.filter(f => (f.valorTotal - f.valorLiquido) > 0.005);

                            return (
                              <>
                                <div className="space-y-2">
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pl-1">
                                    <div>
                                      <h4 className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest flex items-center gap-2">
                                        2. Condição de Pagamento do Preço
                                        <span className="text-[9px] bg-indigo-50 border border-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-medium lowercase tracking-normal">
                                          apurado do fluxo detalhado
                                        </span>
                                      </h4>
                                      <p className="text-[10px] text-slate-400">
                                        Valores reais líquidos devidos à Vendedora após deduções de comissões pactuadas
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[10px] font-medium self-start sm:self-auto">
                                      <button
                                        type="button"
                                        onClick={() => setViewPrecoDetalhado(false)}
                                        className={`px-2 py-0.5 rounded-md transition-all ${!viewPrecoDetalhado ? 'bg-white shadow-xs text-indigo-900 font-bold' : 'text-slate-500 hover:text-slate-800'}`}
                                      >
                                        Resumido por Vencimento
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setViewPrecoDetalhado(true)}
                                        className={`px-2 py-0.5 rounded-md transition-all ${viewPrecoDetalhado ? 'bg-white shadow-xs text-indigo-900 font-bold' : 'text-slate-500 hover:text-slate-800'}`}
                                      >
                                        Parcela a Parcela ({parcelasPrecoDetalhadas.length})
                                      </button>
                                    </div>
                                  </div>

                                  <div className="overflow-x-auto glass-panel border-indigo-50 mt-1 mb-4 max-h-[420px] overflow-y-auto">
                                    <table className="w-full text-left text-[11px]">
                                      <thead className="sticky top-0 bg-white z-10">
                                        <tr className="border-b border-slate-100 bg-slate-50/50">
                                          <th className="py-2 px-3 text-slate-400 font-bold uppercase tracking-wider w-20">QTD</th>
                                          <th className="py-2 px-3 text-slate-400 font-bold uppercase tracking-wider">TIPO</th>
                                          <th className="py-2 px-3 text-slate-400 font-bold uppercase tracking-wider text-right">VALOR DA PARCELA</th>
                                          <th className="py-2 px-3 text-slate-400 font-bold uppercase tracking-wider text-center w-28">VENCIMENTO</th>
                                          <th className="py-2 px-3 text-slate-400 font-bold uppercase tracking-wider text-center w-28">VENCIMENTO FINAL</th>
                                          <th className="py-2 px-3 text-slate-400 font-bold uppercase tracking-wider text-right">VALOR TOTAL DA PARCELA</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-50">
                                        {!viewPrecoDetalhado ? (
                                          condicaoPreco.map((p, i) => (
                                            <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                                              <td className="py-2.5 px-3 font-mono text-slate-500">{p.quantidade}x</td>
                                              <td className="py-2.5 px-3 font-medium text-slate-700">{p.tipo}</td>
                                              <td className="py-2.5 px-3 text-right text-slate-600">
                                                {p.valorUnitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                              </td>
                                              <td className="py-2.5 px-3 text-center font-mono text-slate-500">{p.vencimento || '-'}</td>
                                              <td className="py-2.5 px-3 text-center font-mono text-slate-500">{p.vencimentoFinal || p.vencimento || '-'}</td>
                                              <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                                                {p.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                              </td>
                                            </tr>
                                          ))
                                        ) : (
                                          parcelasPrecoDetalhadas.map((p, i) => (
                                            <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                                              <td className="py-2.5 px-3 font-mono text-slate-500">1x</td>
                                              <td className="py-2.5 px-3 font-medium text-slate-700">{p.tipo}</td>
                                              <td className="py-2.5 px-3 text-right text-slate-600">
                                                {p.valorLiquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                              </td>
                                              <td className="py-2.5 px-3 text-center font-mono text-slate-500">{p.vencimento || '-'}</td>
                                              <td className="py-2.5 px-3 text-center font-mono text-slate-400">-</td>
                                              <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                                                {p.valorLiquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                              </td>
                                            </tr>
                                          ))
                                        )}
                                      </tbody>
                                      <tfoot>
                                        <tr className="bg-indigo-50/30 font-bold text-indigo-900 border-t border-slate-100">
                                          <td colSpan={5} className="py-2.5 px-3 text-right text-slate-700">TOTAL GERAL:</td>
                                          <td className="py-2.5 px-3 text-right font-bold">
                                            {totalPrecoCalculado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                          </td>
                                        </tr>
                                      </tfoot>
                                    </table>
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pl-1">
                                    <div>
                                      <h4 className="text-[10px] font-bold text-amber-600 uppercase tracking-widest flex items-center gap-2">
                                        3. Condição de Pagamento das Comissões
                                        <span className="text-[9px] bg-amber-50 border border-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium lowercase tracking-normal">
                                          apurado do fluxo detalhado
                                        </span>
                                      </h4>
                                      <p className="text-[10px] text-slate-400">
                                        Valores reais de retenção e quitação de corretagem nos respectivos vencimentos de caixa
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[10px] font-medium self-start sm:self-auto">
                                      <button
                                        type="button"
                                        onClick={() => setViewComissaoDetalhada(false)}
                                        className={`px-2 py-0.5 rounded-md transition-all ${!viewComissaoDetalhada ? 'bg-white shadow-xs text-amber-900 font-bold' : 'text-slate-500 hover:text-slate-800'}`}
                                      >
                                        Resumido por Vencimento
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setViewComissaoDetalhada(true)}
                                        className={`px-2 py-0.5 rounded-md transition-all ${viewComissaoDetalhada ? 'bg-white shadow-xs text-amber-900 font-bold' : 'text-slate-500 hover:text-slate-800'}`}
                                      >
                                        Parcela a Parcela ({parcelasComissaoDetalhadas.length})
                                      </button>
                                    </div>
                                  </div>

                                  <div className="overflow-x-auto glass-panel border-amber-50 mt-1 mb-4 max-h-[420px] overflow-y-auto">
                                    <table className="w-full text-left text-[11px]">
                                      <thead className="sticky top-0 bg-white z-10">
                                        <tr className="border-b border-slate-100 bg-slate-50/50">
                                          <th className="py-2 px-3 text-slate-400 font-bold uppercase tracking-wider w-20">QTD</th>
                                          <th className="py-2 px-3 text-slate-400 font-bold uppercase tracking-wider">TIPO</th>
                                          <th className="py-2 px-3 text-slate-400 font-bold uppercase tracking-wider text-right">VALOR DA PARCELA</th>
                                          <th className="py-2 px-3 text-slate-400 font-bold uppercase tracking-wider text-center w-28">VENCIMENTO</th>
                                          <th className="py-2 px-3 text-slate-400 font-bold uppercase tracking-wider text-center w-28">VENCIMENTO FINAL</th>
                                          <th className="py-2 px-3 text-slate-400 font-bold uppercase tracking-wider text-right">VALOR TOTAL DA PARCELA</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-50">
                                        {!viewComissaoDetalhada ? (
                                          condicaoComissao.map((p, i) => (
                                            <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                                              <td className="py-2.5 px-3 font-mono text-slate-500">{p.quantidade}x</td>
                                              <td className="py-2.5 px-3 font-medium text-slate-700">{p.tipo}</td>
                                              <td className="py-2.5 px-3 text-right text-slate-600">
                                                {p.valorUnitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                              </td>
                                              <td className="py-2.5 px-3 text-center font-mono text-slate-500">{p.vencimento || '-'}</td>
                                              <td className="py-2.5 px-3 text-center font-mono text-slate-500">{p.vencimentoFinal || p.vencimento || '-'}</td>
                                              <td className="py-2.5 px-3 text-right font-bold text-amber-700">
                                                {p.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                              </td>
                                            </tr>
                                          ))
                                        ) : (
                                          parcelasComissaoDetalhadas.map((p, i) => {
                                            const commValue = Number((p.valorTotal - p.valorLiquido).toFixed(2));
                                            return (
                                              <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                                                <td className="py-2.5 px-3 font-mono text-slate-500">1x</td>
                                                <td className="py-2.5 px-3 font-medium text-slate-700">{p.tipo}</td>
                                                <td className="py-2.5 px-3 text-right text-slate-600">
                                                  {commValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                </td>
                                                <td className="py-2.5 px-3 text-center font-mono text-slate-500">{p.vencimento || '-'}</td>
                                                <td className="py-2.5 px-3 text-center font-mono text-slate-400">-</td>
                                                <td className="py-2.5 px-3 text-right font-bold text-amber-700">
                                                  {commValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                </td>
                                              </tr>
                                            );
                                          })
                                        )}
                                      </tbody>
                                      <tfoot>
                                        <tr className="bg-amber-50/30 font-bold text-amber-900 border-t border-slate-100">
                                          <td colSpan={5} className="py-2.5 px-3 text-right text-slate-700">TOTAL GERAL:</td>
                                          <td className="py-2.5 px-3 text-right font-bold">
                                            {totalComissaoCalculada.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                          </td>
                                        </tr>
                                      </tfoot>
                                    </table>
                                  </div>
                                </div>
                              </>
                            );
                          })()}

                          <div className="space-y-2">
                             <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">4. Fluxo Detalhado (Vencimento por Vencimento)</h4>
                             <div className="overflow-x-auto glass-panel border-amber-50 max-h-[400px] overflow-y-auto">
                              <table className="w-full text-left text-[11px]">
                                <thead className="sticky top-0 bg-white z-10">
                                  <tr className="border-b border-slate-100 bg-slate-50/50">
                                    <th className="py-2 px-3 text-slate-400 font-bold uppercase tracking-wider">VENCIMENTO</th>
                                    <th className="py-2 px-3 text-slate-400 font-bold uppercase tracking-wider">TIPO</th>
                                    <th className="py-2 px-3 text-slate-400 font-bold uppercase tracking-wider text-right">PROPOSTA (BRUTO)</th>
                                    <th className="py-2 px-3 text-indigo-600 font-bold uppercase tracking-wider text-right">PREÇO (LÍQUIDO)</th>
                                    <th className="py-2 px-3 text-amber-600 font-bold uppercase tracking-wider text-right">COMISSÃO</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                  {sim.fluxo.map((p, i) => (
                                    <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                                      <td className="py-2.5 px-3 font-mono text-slate-500">{p.vencimento}</td>
                                      <td className="py-2.5 px-3 font-medium text-slate-700">{p.tipo}</td>
                                      <td className="py-2.5 px-3 text-right text-slate-400">
                                        {p.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                      </td>
                                      <td className="py-2.5 px-3 text-right font-bold text-indigo-900">
                                        {p.valorLiquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                      </td>
                                      <td className="py-2.5 px-3 text-right font-medium text-amber-600">
                                        {(p.valorTotal - p.valorLiquido).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr className="bg-slate-50 font-bold border-t border-slate-200">
                                    <td colSpan={2} className="py-2.5 px-3 text-right text-slate-700">TOTAL GERAL:</td>
                                    <td className="py-2.5 px-3 text-right text-slate-800">
                                      {sim.fluxo.reduce((acc, p) => acc + p.valorTotal, 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-bold text-indigo-700">
                                      {sim.fluxo.reduce((acc, p) => acc + p.valorLiquido, 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-bold text-amber-700">
                                      {sim.fluxo.reduce((acc, p) => acc + (p.valorTotal - p.valorLiquido), 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })() : null}
                </div>

                {/* 13. Assinatura Eletrônica (Plataforma Assinafy) */}
                <div className="glass-panel p-6 rounded-2xl border border-slate-100 bg-white shadow-sm mt-6 space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                        <UserCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                          Assinatura Eletrônica
                          <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full uppercase tracking-wider">
                            Assinafy
                          </span>
                        </h3>
                        <p className="text-xs text-slate-400">Pactue contratos e fichas de propostas com validade jurídica digital</p>
                      </div>
                    </div>

                    <button
                      onClick={() => setShowConfigPanel(!showConfigPanel)}
                      className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 rounded-xl transition-all"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      Configurações API
                    </button>
                  </div>

                  {/* Config Panel */}
                  <AnimatePresence>
                    {showConfigPanel && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden border border-slate-100 bg-slate-50/50 p-4 rounded-xl space-y-4 text-xs"
                      >
                        <h4 className="font-bold text-slate-700 flex items-center gap-1.5">
                          <Settings className="w-3.5 h-3.5 text-slate-500" />
                          Integração com Assinafy
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                              Token de API Assinafy (Bearer)
                            </label>
                            <input
                              type="password"
                              value={assinafyToken}
                              onChange={(e) => {
                                setAssinafyToken(e.target.value);
                                localStorage.setItem('rj_assinafy_token', e.target.value);
                              }}
                              placeholder="Insira seu token de API da Assinafy"
                              className="w-full text-xs font-mono p-2.5 border border-slate-200 rounded-lg focus:border-indigo-500 bg-white outline-none"
                            />
                            <p className="text-[10px] text-slate-400 mt-1">Sua chave é mantida localmente no seu navegador por segurança.</p>
                          </div>

                          <div className="flex flex-col justify-center">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                              Ambiente de Execução
                            </label>
                            <div className="flex items-center gap-3 p-2 border border-slate-200 rounded-lg bg-white h-[42px]">
                              <input
                                type="checkbox"
                                id="sandbox_assinafy"
                                checked={isSandboxAssinafy}
                                onChange={(e) => {
                                  setIsSandboxAssinafy(e.target.checked);
                                  localStorage.setItem('rj_assinafy_sandbox', e.target.checked ? 'true' : 'false');
                                }}
                                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer"
                              />
                              <label htmlFor="sandbox_assinafy" className="text-xs text-slate-600 font-medium cursor-pointer flex-1">
                                Modo de Simulação / Sandbox
                              </label>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1">Recomendado ativo para testes iniciais.</p>
                          </div>
                        </div>

                        <div className="flex justify-end pt-2">
                          <button
                            onClick={() => saveAssinafySettings(assinafyToken, isSandboxAssinafy)}
                            className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-lg text-[11px] hover:bg-indigo-700 transition-all shadow-md"
                          >
                            Salvar Configurações
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* New Envelope / Form */}
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                          1. Escolha o Documento para Assinatura
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => setAssinafyDocType('contract')}
                            className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                              assinafyDocType === 'contract'
                                ? 'bg-indigo-50/50 border-indigo-200 text-indigo-700 shadow-sm'
                                : 'bg-slate-50/50 border-slate-100 text-slate-500 hover:bg-slate-50'
                            }`}
                          >
                            <FileText className="w-5 h-5 mb-1.5 text-indigo-600" />
                            <span className="text-xs font-bold">Contrato RJ</span>
                            <span className="text-[9px] text-slate-400 font-normal mt-0.5">Com as 4 tabelas de rateio</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setAssinafyDocType('proposal')}
                            className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                              assinafyDocType === 'proposal'
                                ? 'bg-indigo-50/50 border-indigo-200 text-indigo-700 shadow-sm'
                                : 'bg-slate-50/50 border-slate-100 text-slate-500 hover:bg-slate-50'
                            }`}
                          >
                            <FileText className="w-5 h-5 mb-1.5 text-slate-500" />
                            <span className="text-xs font-bold">Ficha Comercial</span>
                            <span className="text-[9px] text-slate-400 font-normal mt-0.5">Resumo de Proposta</span>
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-col justify-end bg-slate-50/50 border border-slate-100 p-4 rounded-xl">
                        <div className="flex items-start gap-3 text-slate-500">
                          <ShieldCheck className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                          <div>
                            <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">Como funciona?</h4>
                            <p className="text-[11px] text-slate-500 leading-relaxed">
                              O sistema gerará a versão oficial em PDF do documento selecionado, fará o upload dele de forma segura na Assinafy e retornará os links de assinatura exclusivos para cada signatário realizar o preenchimento digital via e-mail ou WhatsApp.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Signers list editor - Contrato de Corretagem */}
                    <div className="space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pl-1">
                        <div>
                          <div className="flex items-center gap-2">
                            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                              2. Tabela de Signatários (Quem Assina)
                            </label>
                            <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-200">
                              {editingSigners.length} {editingSigners.length === 1 ? 'signatário' : 'signatários'}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            Assinaturas do Contrato de Corretagem: Contratantes, Imobiliária Contratada, Corretores Associados e Testemunhas.
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={handleSyncContractSigners}
                            title="Sincronizar automaticamente com as partes e testemunhas do Contrato de Corretagem"
                            className="text-[11px] font-semibold text-slate-600 hover:text-indigo-600 bg-white hover:bg-indigo-50/50 border border-slate-200 hover:border-indigo-200 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-all shadow-2xs"
                          >
                            <RefreshCw className="w-3.5 h-3.5 text-indigo-500" />
                            <span>Sincronizar com Contrato</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setShowAddSignerRow(!showAddSignerRow)}
                            className="text-[11px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-all shadow-sm"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Adicionar</span>
                          </button>
                        </div>
                      </div>

                      {/* Add Signer Row Form */}
                      {showAddSignerRow && (
                        <div className="p-3.5 border border-indigo-200 bg-indigo-50/20 rounded-xl grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs shadow-2xs">
                          <div>
                            <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Nome Completo</label>
                            <input
                              type="text"
                              placeholder="Nome do signatário"
                              value={newSignerForm.name}
                              onChange={(e) => setNewSignerForm({ ...newSignerForm, name: e.target.value })}
                              className="w-full p-2 border border-slate-200 rounded-lg bg-white outline-none focus:border-indigo-500 text-xs text-slate-800"
                            />
                          </div>

                          <div>
                            <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">E-mail (Assinatura Eletrônica)</label>
                            <input
                              type="email"
                              placeholder="email@exemplo.com"
                              value={newSignerForm.email}
                              onChange={(e) => setNewSignerForm({ ...newSignerForm, email: e.target.value })}
                              className="w-full p-2 border border-slate-200 rounded-lg bg-white outline-none focus:border-indigo-500 text-xs text-slate-800"
                            />
                          </div>

                          <div>
                            <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">CPF / CNPJ</label>
                            <input
                              type="text"
                              placeholder="000.000.000-00"
                              value={newSignerForm.cpf}
                              onChange={(e) => setNewSignerForm({ ...newSignerForm, cpf: e.target.value })}
                              className="w-full p-2 border border-slate-200 rounded-lg bg-white outline-none focus:border-indigo-500 text-xs font-mono text-slate-800"
                            />
                          </div>

                          <div>
                            <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Papel no Contrato</label>
                            <div className="flex gap-2">
                              <select
                                value={newSignerForm.role}
                                onChange={(e) => setNewSignerForm({ ...newSignerForm, role: e.target.value })}
                                className="w-full p-2 border border-slate-200 rounded-lg bg-white outline-none focus:border-indigo-500 text-xs text-slate-800"
                              >
                                <option value="Contratante">Contratante / Comprador</option>
                                <option value="Imobiliária">Imobiliária Contratada</option>
                                <option value="Corretor">Corretor Associado</option>
                                <option value="Gerente">Gerente de Vendas</option>
                                <option value="Diretor">Diretor Comercial</option>
                                <option value="Coordenador">Coordenador</option>
                                <option value="Testemunha">Testemunha Instrumentária</option>
                                <option value="Outro">Outro Representante</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => {
                                  if (!newSignerForm.name.trim()) {
                                    showToast("Informe o Nome Completo do signatário", "error");
                                    return;
                                  }
                                  setEditingSigners([...editingSigners, { ...newSignerForm, name: newSignerForm.name.trim() }]);
                                  setNewSignerForm({ name: '', email: '', cpf: '', role: 'Testemunha' });
                                  setShowAddSignerRow(false);
                                  showToast("Signatário adicionado à lista!", "success");
                                }}
                                className="bg-indigo-600 text-white font-bold px-3 py-2 rounded-lg hover:bg-indigo-700 transition-all shrink-0"
                              >
                                OK
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Display structured table */}
                      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                        {/* Table Header */}
                        <div className="hidden sm:grid grid-cols-12 gap-2 px-3.5 py-2 bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          <div className="col-span-1 text-center">#</div>
                          <div className="col-span-3">Papel no Contrato</div>
                          <div className="col-span-3">Nome Completo</div>
                          <div className="col-span-3">E-mail (Assinafy)</div>
                          <div className="col-span-2 text-right pr-6">CPF / CNPJ</div>
                        </div>

                        {editingSigners.length === 0 ? (
                          <div className="p-6 text-center">
                            <p className="text-slate-400 text-xs mb-2">Nenhum signatário adicionado.</p>
                            <button
                              type="button"
                              onClick={handleSyncContractSigners}
                              className="text-xs text-indigo-600 font-bold hover:underline"
                            >
                              Clique aqui para carregar as assinaturas do Contrato de Corretagem
                            </button>
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-100">
                            {editingSigners.map((sig, idx) => {
                              const role = (sig.role || '').toLowerCase();
                              const isContratante = role.includes('contratante') || role.includes('cliente') || role.includes('comprador');
                              const isImobiliaria = role.includes('imobili') || role.includes('contratada');
                              const isCorretor = role.includes('corretor');
                              const isGestao = role.includes('gerente') || role.includes('diretor') || role.includes('coordenador');
                              const isTestemunha = role.includes('testemunha');

                              const badgeStyle = isContratante
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : isImobiliaria
                                ? 'bg-purple-50 text-purple-700 border-purple-200'
                                : isCorretor
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : isGestao
                                ? 'bg-teal-50 text-teal-700 border-teal-200'
                                : isTestemunha
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-slate-100 text-slate-700 border-slate-200';

                              const isEmailMissing = !sig.email || !sig.email.trim();

                              return (
                                <div
                                  key={idx}
                                  className="grid grid-cols-1 sm:grid-cols-12 gap-2 px-3.5 py-2.5 items-center hover:bg-slate-50/70 transition-colors"
                                >
                                  {/* Col 1: Order */}
                                  <div className="sm:col-span-1 flex items-center justify-between sm:justify-center">
                                    <span className="text-[10px] font-mono font-bold text-slate-400">
                                      #{idx + 1}
                                    </span>
                                    <span className="sm:hidden text-[10px] font-semibold text-slate-500">
                                      {sig.role}
                                    </span>
                                  </div>

                                  {/* Col 2: Role selector / badge */}
                                  <div className="sm:col-span-3 flex items-center gap-1.5">
                                    <select
                                      value={sig.role}
                                      onChange={(e) => {
                                        const updated = [...editingSigners];
                                        updated[idx].role = e.target.value;
                                        setEditingSigners(updated);
                                      }}
                                      className={`text-[10px] font-bold px-2 py-1 rounded-md border tracking-wider outline-none cursor-pointer ${badgeStyle}`}
                                    >
                                      <option value="Contratante">Contratante / Comprador</option>
                                      <option value="Imobiliária">Imobiliária Contratada</option>
                                      <option value="Corretor">Corretor Associado</option>
                                      <option value="Gerente">Gerente de Vendas</option>
                                      <option value="Diretor">Diretor Comercial</option>
                                      <option value="Coordenador">Coordenador</option>
                                      <option value="Testemunha">Testemunha</option>
                                      <option value="Outro">Outro Representante</option>
                                    </select>
                                  </div>

                                  {/* Col 3: Full Name */}
                                  <div className="sm:col-span-3">
                                    <input
                                      type="text"
                                      value={sig.name}
                                      placeholder="Nome do signatário"
                                      onChange={(e) => {
                                        const updated = [...editingSigners];
                                        updated[idx].name = e.target.value;
                                        setEditingSigners(updated);
                                      }}
                                      className="w-full text-xs font-semibold text-slate-800 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-indigo-500 focus:bg-white outline-none px-1.5 py-1 rounded transition-all"
                                    />
                                  </div>

                                  {/* Col 4: Email */}
                                  <div className="sm:col-span-3">
                                    <div className="relative">
                                      <input
                                        type="email"
                                        placeholder="email@exemplo.com (obrigatório)"
                                        value={sig.email}
                                        onChange={(e) => {
                                          const updated = [...editingSigners];
                                          updated[idx].email = e.target.value;
                                          setEditingSigners(updated);
                                        }}
                                        className={`w-full text-xs text-slate-700 bg-transparent border-b rounded px-1.5 py-1 outline-none transition-all ${
                                          isEmailMissing
                                            ? 'border-amber-300 bg-amber-50/30 text-amber-900 placeholder:text-amber-400'
                                            : 'border-transparent hover:border-slate-200 focus:border-indigo-500 focus:bg-white'
                                        }`}
                                      />
                                      {isEmailMissing && (
                                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-amber-600 font-bold pointer-events-none">
                                          Pendente
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Col 5: CPF + Action */}
                                  <div className="sm:col-span-2 flex items-center justify-between gap-1">
                                    <input
                                      type="text"
                                      placeholder="CPF / CNPJ"
                                      value={sig.cpf}
                                      onChange={(e) => {
                                        const updated = [...editingSigners];
                                        updated[idx].cpf = e.target.value;
                                        setEditingSigners(updated);
                                      }}
                                      className="w-full text-xs font-mono text-slate-600 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-indigo-500 focus:bg-white outline-none px-1.5 py-1 rounded transition-all"
                                    />

                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = editingSigners.filter((_, i) => i !== idx);
                                        setEditingSigners(updated);
                                        showToast("Signatário removido.", "info");
                                      }}
                                      title="Remover signatário"
                                      className="text-slate-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-all shrink-0"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Table Footer with Summary Breakdown */}
                        {editingSigners.length > 0 && (
                          <div className="px-3.5 py-2.5 bg-slate-50/70 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
                            <div className="flex flex-wrap items-center gap-1.5 font-medium">
                              <span className="font-bold text-slate-600">Composição:</span>
                              <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200">
                                {editingSigners.filter(s => (s.role || '').toLowerCase().includes('contratante') || (s.role || '').toLowerCase().includes('cliente')).length} Contratante(s)
                              </span>
                              <span className="bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded border border-purple-200">
                                {editingSigners.filter(s => (s.role || '').toLowerCase().includes('imobili')).length} Imobiliária
                              </span>
                              <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200">
                                {editingSigners.filter(s => (s.role || '').toLowerCase().includes('corretor') || (s.role || '').toLowerCase().includes('gerente') || (s.role || '').toLowerCase().includes('diretor') || (s.role || '').toLowerCase().includes('coordenador')).length} Equipe/Corretores
                              </span>
                              <span className="bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200">
                                {editingSigners.filter(s => (s.role || '').toLowerCase().includes('testemunha')).length} Testemunhas
                              </span>
                            </div>

                            {editingSigners.some(s => !s.email || !s.email.trim()) && (
                              <div className="flex items-center gap-1 text-amber-600 font-medium">
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                <span>Preencha os e-mails pendentes para viabilizar o disparo eletrônico.</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Send Button */}
                    <div className="flex justify-center pt-3">
                      <button
                        type="button"
                        onClick={() => sendToAssinafy(assinafyDocType, editingSigners)}
                        disabled={isCreatingAssinafyEnvelope || editingSigners.length === 0}
                        className={`w-full max-w-md flex items-center justify-center gap-3 py-3 px-6 text-sm font-bold text-white rounded-xl transition-all shadow-lg hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 ${
                          isCreatingAssinafyEnvelope ? 'bg-slate-400 cursor-not-allowed shadow-none' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100'
                        }`}
                      >
                        {isCreatingAssinafyEnvelope ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>GERANDO E ENVIANDO PARA ASSINAFY...</span>
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4" />
                            <span>ENVIAR PARA ASSINATURA NA ASSINAFY</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Envelope history dictionary */}
                  {assinafyEnvelopes.length > 0 && (
                    <div className="border-t border-slate-100 pt-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                          <History className="w-4 h-4 text-indigo-500" />
                          Histórico de Envelopes Registrados
                        </h4>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {assinafyEnvelopes.filter(e => e.proposalId === result.id).length} envelope(s) para esta proposta
                        </span>
                      </div>

                      <div className="grid grid-cols-1 gap-4">
                        {assinafyEnvelopes
                          .filter(e => e.proposalId === result.id || e.proposalId.startsWith('temp_'))
                          .map((env) => (
                            <div key={env.id} className="p-4 border border-slate-150 rounded-xl bg-slate-50/50 space-y-4 shadow-sm relative overflow-hidden">
                              {/* Sandbox Badge Overlay */}
                              {env.isSandbox && (
                                <div className="absolute top-0 right-0 bg-amber-500 text-white text-[8px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-bl shadow-sm">
                                  SIMULADO
                                </div>
                              )}

                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/50 pb-2">
                                <div>
                                  <h5 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                    <FileText className="w-3.5 h-3.5 text-indigo-500" />
                                    {env.documentName}
                                  </h5>
                                  <p className="text-[10px] text-slate-400 mt-0.5 font-mono">ID: {env.id} • Criado em: {new Date(env.createdAt).toLocaleString()}</p>
                                </div>

                                <div className="flex items-center gap-2">
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                    env.status === 'Assinado' ? 'bg-emerald-100 text-emerald-800' :
                                    env.status === 'Rejeitado' ? 'bg-red-100 text-red-800' :
                                    'bg-amber-100 text-amber-800'
                                  }`}>
                                    {env.status}
                                  </span>

                                  <button
                                    onClick={() => refreshEnvelopeStatus(env.id)}
                                    className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-white rounded border border-slate-200 transition-all"
                                    title="Atualizar Status"
                                  >
                                    <RefreshCw className="w-3 h-3" />
                                  </button>

                                  <button
                                    onClick={() => removeEnvelopeFromTracking(env.id)}
                                    className="p-1 text-slate-400 hover:text-red-600 hover:bg-white rounded border border-transparent hover:border-slate-200 transition-all"
                                    title="Excluir do histórico local"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>

                              {/* Signers in this envelope */}
                              <div className="space-y-2">
                                <h6 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">Signatários & Links de Assinatura</h6>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {env.signers?.map((signer: any, sIdx: number) => {
                                    return (
                                      <div key={sIdx} className="p-2.5 bg-white border border-slate-100 rounded-lg flex flex-col justify-between gap-1.5 shadow-sm text-xs relative">
                                        <div>
                                          <div className="flex items-center justify-between">
                                            <span className="font-semibold text-slate-800 text-[11px] truncate max-w-[140px]">{signer.name}</span>
                                            <span className={`text-[9px] font-bold uppercase ${
                                              signer.status === 'Assinado' ? 'text-emerald-600' : 'text-amber-600'
                                            }`}>
                                              {signer.status || 'Pendente'}
                                            </span>
                                          </div>
                                          <div className="text-[9px] text-slate-400 font-mono truncate">{signer.email}</div>
                                        </div>

                                        <div className="flex gap-1.5 pt-1 border-t border-slate-100/50 mt-1">
                                          <button
                                            onClick={() => {
                                              navigator.clipboard.writeText(signer.signUrl || '');
                                              showToast(`Link de assinatura de ${signer.name} copiado!`, "success");
                                            }}
                                            className="flex-1 flex items-center justify-center gap-1.5 py-1 text-[10px] font-bold text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100/70 border border-indigo-100/50 rounded-md transition-all active:scale-[0.98]"
                                          >
                                            <Copy className="w-3 h-3" />
                                            Copiar Link
                                          </button>

                                          <a
                                            href={signer.signUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="flex items-center justify-center p-1 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-700 border border-slate-200 rounded-md transition-all"
                                            title="Ir para Assinatura"
                                          >
                                            <ExternalLink className="w-3.5 h-3.5" />
                                          </a>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="flex justify-end pt-1">
                                <a
                                  href={env.viewUrl || `https://app.assinafy.com.br/envelopes/${env.id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-indigo-600 hover:underline transition-all"
                                >
                                  Ver painel completo na Assinafy
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>

              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-full flex flex-col items-center justify-center text-center p-12 glass-panel rounded-2xl border-dashed border-2 border-slate-200"
              >
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                  <FileText className="w-8 h-8 text-slate-300" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Aguardando Documentos</h3>
                <p className="text-sm text-slate-400 max-w-xs">
                  Faça o upload da proposta e documentos para visualizar o relatório técnico aqui.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
            </motion.div>
          ) : view === 'inbox' ? (
            <motion.div
              key="inbox"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Fila de Entrada (Drive)</h2>
                  <p className="text-slate-500 mt-1">
                    Arquivos detectados na pasta <span className="font-semibold text-indigo-600">AppSheet_Propostas</span> do seu Google Drive.
                  </p>
                </div>
                <button 
                  onClick={fetchInboxFiles}
                  disabled={isLoadingInbox}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
                >
                  <History className={`w-4 h-4 ${isLoadingInbox ? 'animate-spin' : ''}`} />
                  Atualizar Fila
                </button>
              </header>

              {isLoadingInbox ? (
                <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-slate-100 shadow-sm">
                  <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mb-4" />
                  <p className="text-slate-500 font-medium">Buscando novos arquivos no Drive...</p>
                </div>
              ) : inboxFiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-slate-100 shadow-sm text-center px-6">
                  <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6">
                    <CloudUpload className="w-10 h-10 text-slate-300" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">Nenhum arquivo pendente</h3>
                  <p className="text-slate-500 max-w-sm">
                    Qualquer PDF ou imagem que o AppSheet salvar na pasta configurada aparecerá aqui para extração.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {inboxFiles.map((file) => (
                    <motion.div
                      key={file.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-lg transition-all group"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
                          <FileText className="w-6 h-6" />
                        </div>
                        <a 
                          href={file.webViewLink} 
                          target="_blank" 
                          rel="noreferrer"
                          className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"
                        >
                          <Eye className="w-5 h-5" />
                        </a>
                      </div>
                      <h4 className="font-bold text-slate-900 mb-1 truncate" title={file.name}>
                        {file.name}
                      </h4>
                      <p className="text-xs text-slate-400 mb-6">
                        Recebido em: {new Date(file.createdTime).toLocaleString()}
                      </p>
                      <button
                        onClick={() => processInboxFile(file)}
                        className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-100"
                      >
                        <FileSearch className="w-4 h-4" />
                        Extrair Dados
                      </button>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          ) : view === 'dashboard' ? (
      <motion.div
        key="dashboard"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Dashboard de Extrações</h2>
          <p className="text-sm text-slate-500 mt-1">
            {isReadOnly 
              ? 'Visualização pública das propostas processadas.' 
              : 'Gerencie e acompanhe o status de todas as propostas processadas.'}
          </p>
        </div>
        
        <div className="flex flex-col md:flex-row items-center gap-4 w-full lg:w-auto">
          <div className="relative w-full md:w-80">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
            <input
              type="text"
              placeholder="Buscar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-xl leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-all shadow-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
              >
                <X className="h-4 w-4 text-slate-400 hover:text-slate-600" />
              </button>
            )}
          </div>
          
          <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
            {!isReadOnly && (
              <button
                onClick={startNewExtraction}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm shrink-0"
              >
                <Plus className="w-4 h-4" />
                Nova
              </button>
            )}
            <button
              onClick={exportDashboardToGoogleSheets}
              disabled={isExportingDashboard || savedExtractions.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50 shrink-0"
            >
              {isExportingDashboard ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Table className="w-4 h-4" />
              )}
              Sheets
            </button>
            {!isReadOnly && (
              <button
                onClick={() => setShowShareModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm shrink-0"
              >
                <Share2 className="w-4 h-4" />
                Compartilhar
              </button>
            )}
            <button 
              onClick={fetchExtractions}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm shrink-0"
            >
              <History className={`w-4 h-4 ${isLoadingDashboard ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showShareModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-lg font-bold text-slate-900">Compartilhar Dashboard</h3>
                <button 
                  onClick={() => setShowShareModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>
              
              <div className="p-6 space-y-6">
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                  <p className="text-xs text-amber-800 leading-relaxed">
                    <strong>Importante:</strong> Para que a incorporação funcione em sites externos, certifique-se de usar o <strong>Shared App URL</strong> fornecido pela plataforma. Links de desenvolvimento podem ser bloqueados por segurança.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Link de Visualização</label>
                  <div className="flex gap-2">
                    <input 
                      readOnly
                      value={`${import.meta.env.VITE_SHARED_APP_URL || window.location.origin}${window.location.pathname}?mode=readonly`}
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600 outline-none"
                    />
                    <button 
                      onClick={() => {
                        const url = `${import.meta.env.VITE_SHARED_APP_URL || window.location.origin}${window.location.pathname}?mode=readonly`;
                        navigator.clipboard.writeText(url);
                        alert('Link copiado!');
                      }}
                      className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                      title="Copiar Link"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Código para Incorporar (iFrame)</label>
                  <div className="relative">
                    <textarea 
                      readOnly
                      rows={3}
                      value={`<iframe src="${import.meta.env.VITE_SHARED_APP_URL || window.location.origin}${window.location.pathname}?mode=readonly" width="100%" height="600px" frameborder="0" allow="clipboard-read; clipboard-write"></iframe>`}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600 outline-none font-mono"
                    />
                    <button 
                      onClick={() => {
                        const code = `<iframe src="${import.meta.env.VITE_SHARED_APP_URL || window.location.origin}${window.location.pathname}?mode=readonly" width="100%" height="600px" frameborder="0" allow="clipboard-read; clipboard-write"></iframe>`;
                        navigator.clipboard.writeText(code);
                        alert('Código iFrame copiado!');
                      }}
                      className="absolute top-2 right-2 p-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
                      title="Copiar Código"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    O atributo <code>allow</code> é necessário para permitir que funcionalidades de cópia funcionem dentro do iFrame.
                  </p>
                </div>
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
                <button 
                  onClick={() => setShowShareModal(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}



        {showDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden"
            >
              <div className="p-6 text-center">
                <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Trash2 className="w-8 h-8 text-red-500" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">Excluir Proposta</h3>
                <p className="text-sm text-slate-500">
                  Tem certeza que deseja excluir esta proposta? Esta ação não pode ser desfeita.
                </p>
              </div>
              <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="flex-1 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Excluir'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="glass-panel rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="p-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">ID</th>
                <th className="p-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Data de Entrada</th>
                <th className="p-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Empreendimento</th>
                <th className="p-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Unidade</th>
                <th className="p-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Torre</th>
                <th className="p-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Corretor 1</th>
                <th className="p-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Corretor 2</th>
                <th className="p-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Cliente</th>
                <th className="p-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Proposta</th>
                <th className="p-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">CVC</th>
                <th className="p-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Corretagem</th>
                <th className="p-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Pagamento</th>
                <th className="p-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</th>
                <th className="p-4 text-[10px] font-bold uppercase tracking-wider text-slate-400 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoadingDashboard ? (
                <tr>
                  <td colSpan={10} className="p-12 text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">Carregando extrações...</p>
                  </td>
                </tr>
              ) : filteredExtractions.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-12 text-center">
                    <ClipboardList className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">
                      {searchQuery ? 'Nenhum resultado para sua busca.' : 'Nenhuma extração encontrada.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredExtractions.map((ext) => (
                  <tr key={ext.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 text-xs font-mono text-slate-400">
                      #{ext.id.substring(0, 6).toUpperCase()}
                    </td>
                    <td className="p-4 text-sm text-slate-500">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3" />
                        {new Date(ext.created_at).toLocaleDateString('pt-BR')}
                      </div>
                    </td>
                    <td className="p-4 text-sm font-medium text-slate-700">
                      {ext.property?.empreendimento || '-'}
                    </td>
                    <td className="p-4 text-sm text-slate-600">
                      {ext.property?.unidade || '-'}
                    </td>
                    <td className="p-4 text-sm text-slate-600">
                      {ext.property?.torre || '-'}
                    </td>
                    <td className="p-4 text-sm text-slate-500">
                      {ext.sales_team?.corretor1 || '-'}
                    </td>
                    <td className="p-4 text-sm text-slate-500">
                      {ext.sales_team?.corretor2 || '-'}
                    </td>
                    <td className="p-4 text-sm font-medium text-slate-900">
                      {ext.customers && ext.customers.length > 0 
                        ? ext.customers.filter(Boolean).map(c => c.nome || '-').join(', ') 
                        : (ext as any).customer?.nome || '-'}
                    </td>
                    <td className="p-4">
                      <select
                        value={ext.proposta_status || 'AGUARDANDO APROVAÇÃO'}
                        disabled={isReadOnly}
                        onChange={(e) => updateExtractionField(ext.id, 'proposta_status', e.target.value)}
                        className={`text-[10px] font-semibold px-2 py-1 rounded-lg border-0 focus:ring-2 focus:ring-indigo-500 outline-none transition-all ${
                          isReadOnly ? 'cursor-default' : 'cursor-pointer'
                        } ${
                          ext.proposta_status === 'APROVADA' ? 'bg-emerald-50 text-emerald-700' :
                          ext.proposta_status === 'CANCELADA' ? 'bg-red-50 text-red-700' :
                          ext.proposta_status === 'DEVOLVIDA' ? 'bg-amber-50 text-amber-700' :
                          'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <option value="AGUARDANDO APROVAÇÃO">AGUARDANDO APROVAÇÃO</option>
                        <option value="APROVADA">APROVADA</option>
                        <option value="DEVOLVIDA">DEVOLVIDA</option>
                        <option value="CANCELADA">CANCELADA</option>
                      </select>
                    </td>
                    <td className="p-4">
                      <select
                        value={ext.cvc_status || 'PENDENTE'}
                        disabled={isReadOnly}
                        onChange={(e) => updateExtractionField(ext.id, 'cvc_status', e.target.value)}
                        className={`text-[10px] font-semibold px-2 py-1 rounded-lg border-0 focus:ring-2 focus:ring-indigo-500 outline-none transition-all ${
                          isReadOnly ? 'cursor-default' : 'cursor-pointer'
                        } ${
                          ext.cvc_status === 'ASSINADO' ? 'bg-emerald-50 text-emerald-700' :
                          ext.cvc_status === 'CANCELADO' ? 'bg-red-50 text-red-700' :
                          'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <option value="PENDENTE">PENDENTE</option>
                        <option value="NA FILA">NA FILA</option>
                        <option value="ENVIADO">ENVIADO</option>
                        <option value="ASSINADO">ASSINADO</option>
                        <option value="CANCELADO">CANCELADO</option>
                      </select>
                    </td>
                    <td className="p-4">
                      <select
                        value={ext.corretagem_status || 'PENDENTE'}
                        disabled={isReadOnly}
                        onChange={(e) => updateExtractionField(ext.id, 'corretagem_status', e.target.value)}
                        className={`text-[10px] font-semibold px-2 py-1 rounded-lg border-0 focus:ring-2 focus:ring-indigo-500 outline-none transition-all ${
                          isReadOnly ? 'cursor-default' : 'cursor-pointer'
                        } ${
                          ext.corretagem_status === 'ASSINADO' ? 'bg-emerald-50 text-emerald-700' :
                          ext.corretagem_status === 'CANCELADO' || ext.corretagem_status === 'DEVOLVIDO' ? 'bg-red-50 text-red-700' :
                          'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <option value="PENDENTE">PENDENTE</option>
                        <option value="NA FILA">NA FILA</option>
                        <option value="ENVIADO">ENVIADO</option>
                        <option value="ASSINADO">ASSINADO</option>
                        <option value="CANCELADO">CANCELADO</option>
                        <option value="DEVOLVIDO">DEVOLVIDO</option>
                      </select>
                    </td>
                    <td className="p-4">
                      <select
                        value={ext.forma_pagamento_comissao || 'PAGADORIA'}
                        disabled={isReadOnly}
                        onChange={(e) => updateExtractionField(ext.id, 'forma_pagamento_comissao', e.target.value)}
                        className={`text-[10px] font-semibold px-2 py-1 rounded-lg border-0 focus:ring-2 focus:ring-indigo-500 outline-none transition-all ${
                          isReadOnly ? 'cursor-default' : 'cursor-pointer'
                        } bg-indigo-50 text-indigo-700`}
                      >
                        <option value="PAGADORIA">PAGADORIA</option>
                        <option value="NF/REPASSE">NF/REPASSE</option>
                        <option value="PAGADORIA INCORPORADOR">PAGADORIA INCORPORADOR</option>
                      </select>
                    </td>
                    <td className="p-4">
                      <select
                        value={ext.status}
                        disabled={isReadOnly}
                        onChange={(e) => updateExtractionStatus(ext.id, e.target.value as ExtractionStatus)}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-full border-0 focus:ring-2 focus:ring-indigo-500 outline-none transition-all ${
                          isReadOnly ? 'cursor-default opacity-80' : 'cursor-pointer'
                        } ${
                          ext.status === 'na fila' ? 'bg-amber-100 text-amber-700' :
                          ext.status === 'devolvida com pendencia' ? 'bg-red-100 text-red-700' :
                          'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        <option value="na fila">Na Fila</option>
                        <option value="devolvida com pendencia">Devolvida com Pendência</option>
                        <option value="contrato enviado">Contrato Enviado</option>
                      </select>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {!isReadOnly && (
                          <>
                            <button
                              onClick={() => editExtraction(ext)}
                              title="Editar"
                              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => deleteExtraction(ext.id)}
                              title="Excluir"
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => sendToAppSheet(ext)}
                              title="Sincronizar com AppSheet"
                              className="p-2 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-all"
                            >
                              <Smartphone className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => sendProposalByEmail(ext)}
                              title="Enviar Ficha + DOC por E-mail"
                              className="p-2 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-all"
                            >
                              <Mail className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                handleProposalChange(ext.id);
                                setPaymentForm(prev => ({ ...prev, billingType: 'BOLETO' }));
                                setView('asaas' as any);
                                setShowNewAsaasPaymentModal(true);
                              }}
                              title="Emitir Boleto (Asaas)"
                              className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all animate-pulse"
                            >
                              <CreditCard className="w-4 h-4 text-emerald-600" />
                            </button>
                          </>
                        )}
                        {ext.drive_link && (
                          <a
                            href={ext.drive_link}
                            target="_blank"
                            rel="noreferrer"
                            title="Ver Pasta no Google Drive"
                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                          >
                            <FolderOpen className="w-4 h-4" />
                          </a>
                        )}
                        <button
                          onClick={() => {
                            // Temporary result to use printProposalRJ
                            const tempResult = {
                              property: ext.property,
                              customers: ext.customers || [(ext as any).customer],
                              address: ext.address,
                              payments: ext.payments,
                              validations: ext.validations,
                              salesTeam: ext.sales_team,
                              commissionedParties: ext.commissioned_parties || []
                            };
                            // @ts-ignore
                            printProposalRJ(tempResult);
                          }}
                          title="Imprimir Proposta R&J"
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            const tempResult = {
                              id: ext.id,
                              property: ext.property,
                              customers: ext.customers || [(ext as any).customer],
                              address: ext.address,
                              payments: ext.payments,
                              validations: ext.validations,
                              salesTeam: ext.sales_team,
                              commissionedParties: ext.commissioned_parties || [],
                              commissioned_parties: ext.commissioned_parties || [],
                              forma_pagamento_comissao: ext.forma_pagamento_comissao,
                              valorTotalProposta: ext.valorTotalProposta,
                              percentualComissao: (ext as any).percentualComissao,
                              manual_waterfall: ext.manual_waterfall
                            };
                            // @ts-ignore
                            downloadContractPDF(tempResult);
                          }}
                          title="Baixar Contrato em PDF"
                          className="p-2 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-all"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => generateFichaCadastral(ext)}
                          title="Baixar Ficha Cadastral"
                          className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            // Temporary result to use generatePDF
                            const tempResult = {
                              property: ext.property,
                              customers: ext.customers || [(ext as any).customer],
                              address: ext.address,
                              payments: ext.payments,
                              validations: ext.validations,
                              salesTeam: ext.sales_team,
                              commissionedParties: ext.commissioned_parties || []
                            };
                            // @ts-ignore
                            generatePDF(tempResult);
                          }}
                          title="Baixar Proposta"
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  ) : view === 'rateio' ? (
    renderRateio()
  ) : view === 'empreendimentos' ? (
    renderEmpreendimentos()
  ) : view === 'usuarios' ? (
    renderUsers()
  ) : view === 'cargos' ? (
    renderCargos()
  ) : (view as any) === 'asaas' ? (
    renderAsaas()
  ) : null}
          </AnimatePresence>
        )}
      </main>
      {renderSettingsModal()}
      {renderEmailModal()}
      {renderCargoModal()}
      {renderCargosFillableModal()}

      {/* Toast Notifications */}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              className={`
                flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border pointer-events-auto min-w-[280px] max-w-[400px]
                ${toast.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 
                  toast.type === 'error' ? 'bg-red-50 border-red-100 text-red-800' : 
                  'bg-indigo-50 border-indigo-100 text-indigo-800'}
              `}
            >
              {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />}
              {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />}
              {toast.type === 'info' && <Loader2 className="w-5 h-5 text-indigo-500 animate-spin shrink-0" />}
              <span className="text-sm font-medium">{toast.message}</span>
              <button 
                onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                className="ml-auto p-1 hover:bg-black/5 rounded-lg transition-colors"
              >
                <X className="w-4 h-4 opacity-50" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      
      {/* Hidden inputs to bypass mobile browser issues with nested interaction */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="fixed opacity-0 -z-50 pointer-events-none"
        style={{ width: '1px', height: '1px', top: '-10px', left: '-10px' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (activeCaptureId && file) {
            handleFileChange(activeCaptureId, file);
          }
          e.target.value = '';
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf"
        className="fixed opacity-0 -z-50 pointer-events-none"
        style={{ width: '1px', height: '1px', top: '-20px', left: '-10px' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (activeCaptureId && file) {
            handleFileChange(activeCaptureId, file);
          }
          e.target.value = '';
        }}
      />
    </div>
  );
}
