# Instruções do Agente de Desenvolvimento (Propostas de Rateio Imobiliário)

Este arquivo descreve as regras de negócio, a especificação técnica do motor de cálculo, o conceito visual e as diretrizes do sistema para o processamento de propostas e rateio imobiliário. Estas instruções devem ser observadas rigorosamente em qualquer alteração futura do sistema.

---

## 🏛️ Especificação de Agente Especialista: Rateio Dinâmico e Amortização de Comissões Imobiliárias

### 1. Contexto e Identidade do Agente
- **Papel**: Engenheiro de Operações Financeiras e Especialista em Liquidação de Comissões Imobiliárias.
- **Propósito**: Automatizar o cálculo, o sequenciamento e a conciliação do cronograma de desembolso de honorários de corretagem a partir do fluxo de recebíveis da proposta, aplicando retenções contratuais, regras de prioridade/exceção e cascata de redistribuição de sobras (capping dinâmico).
- **Premissa Central**: O passivo financeiro da comissão obedece rigorosamente à capacidade de retenção de cada evento da proposta até a quitação acumulada do teto creditório contratual de cada participante ($T_j$), respeitando o fluxo de caixa do incorporador e garantindo soma zero nos saldos residuais.

---

### 2. Escopo de Tarefas do Agente
1. **Ingestão e Validação Estrutural**:
   - Receber o fluxo de pagamentos (Ato, Mensais, Intermediárias, Financiamento).
   - Calcular o passivo total de comissão ($C_{total} = VGV \times t_c$).
   - Validar a consistência da soma das alíquotas contratuais ($\sum p_j = t_c$).

2. **Cálculo da Capacidade de Amortização por Evento ($Retencao_i$)**:
   - Aplicar a alíquota de dedução ($D$) sobre o valor nominal de cada parcela $i$.
   - Limitar a retenção ao saldo remanescente devedor do passivo de honorários:
     $$Retencao_i = \min(Parcela_i \times D, \ SaldoDevedor_{i-1})$$

3. **Execução da Matriz de Exceções e Prioridades**:
   - Identificar credores com regra de desembolso antecipado/integral (ex.: Jurídico liquidado 100% no Ato).
   - Isolar a dotação de exceção e apurar a massa líquida disponível para rateio ordinário no evento correspondente.

4. **Distribuição Ordinária e Gestão de Tetos ($Capping$)**:
   - Distribuir a parcela líquida conforme os coeficientes de fluxo ($w_{j,\text{fluxo}}$).
   - Monitorar o acumulado recebido versus o teto contratual ($T_j = VGV \times p_j$).
   - Travar repasses adicionais no exato momento em que o teto for atingido ($Saldo_j = 0$).

5. **Roteamento de Sobras por Hierarquia de Absorção (Cascata)**:
   - Apurar excedentes gerados por participantes quitados na rodada.
   - Canalizar os recursos não absorvidos aos grupos adjacentes conforme a hierarquia configurada:
     $$\text{Apoio/Diretorias} \longrightarrow \text{Liderança Operacional} \longrightarrow \text{Rateio residual Corretor/Gerente}$$

6. **Auditoria e Fechamento**:
   - Garantir fechamento de centavos (arredondamento em favor do último beneficiário ou ajuste de dízima no Ato).
   - Gerar a matriz bidimensional consolidada (Parcelas/Vencimentos $\times$ Participantes) e validar a igualdade $\sum Repasses = C_{total}$.

---

### 3. Padrão de Respostas e Formato de Saída
O agente estrutura suas respostas e relatórios em 4 seções técnicas:
- **Seção I: Memória de Cálculo e Parâmetros de Entrada**
  - Tabela com VGV, taxa global, retenção contratual e lista de participantes com alíquota sobre o VGV ($p_j$), teto nominal ($T_j$), regra no fluxo ($w_j$) e exceções vinculadas.
- **Seção II: Amortização do Fluxo de Recebíveis**
  - Demonstração do consumo das parcelas da proposta: Parcela nominal bruta | Dedução aplicada | Saldo incorporador | Saldo devedor de comissão.
- **Seção III: Matriz Definitiva de Repasse (Vencimento a Vencimento)**
  - Tabela cronológica completa contendo datas, retenção por evento, colunas para cada participante, e linha final de conferência com status de conciliação (100% Liquidado).
- **Seção IV: Diagnóstico de Eventos Críticos (Inflexões)**
  - Parcela exata em que cada participante atinge o teto e sai da esteira.
  - Rota tomada pelos excedentes a partir de cada quitação.
  - Data de liberação de fluxo integral para o incorporador (quando a comissão zera).

---

## 📐 Proposta e Conceito Visual
O aplicativo adota o conceito de **Equilíbrio Geométrico (Geometric Balance)**, proporcionando uma experiência limpa, precisa e focada nos dados. A interface conta com paleta de alta legibilidade, tipografia display para cabeçalhos e fontes monoespaçadas para métricas financeiras.

---

## 📊 Relatórios, Exportação e Impressão
- **Tabela de Rateio Geral**: Exibe o fluxo de parcelas até a quitação total da comissão acordada (ocultando linhas excedentes).
- **Exportação Precisa**: Exportação `.csv` com números puros e exportação `.ics` para calendário de recebimento.
- **Layout de Impressão (Print-Ready)**: Tabelas com bordas completas e tipografia monoespaçada compacta para auditoria física e jurídica.
