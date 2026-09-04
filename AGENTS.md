# Instruções do Agente de Desenvolvimento (Propostas de Rateio Imobiliário)

Este arquivo descreve as regras de negócio, o conceito visual e as diretrizes do sistema para o processamento de propostas de rateio imobiliário. Estas instruções devem ser observadas rigorosamente em qualquer alteração futura do sistema.

---

## 📐 Proposta e Conceito Visual
O aplicativo foi estruturado sob o conceito de **Equilíbrio Geométrico (Geometric Balance)**, proporcionando uma experiência de uso limpa, precisa e focada nos dados. A interface adota uma paleta de alta legibilidade, tipografia display para cabeçalhos e fontes monoespaçadas para métricas financeiras. Toda a navegação e visualização operam em uma única tela fluida e responsiva, otimizada para o fluxo de caixa do usuário.

---

## ⚙️ Engenharia de Cálculos e Regras de Negócio
O motor matemático do sistema foi refinado para garantir conformidade contábil estrita através de duas camadas complementares:

### Camada do VGV (Dimensão de Limites)
- Define o teto máximo de distribuição de comissão para a proposta geral e individualmente por participante.
- Conta com funcionalidade de sincronização automática, permitindo equiparar o VGV total ao somatório bruto de todas as parcelas do fluxo cronológico com um único clique.

### Camada de Parcelas (Rateio Cronológico Real)
- **Ordenação Cronológica**: Todas as parcelas individuais (calculadas e expandidas de seus respectivos grupos) são reordenadas em uma linha do tempo única e realística de caixa, misturando termos como Ato, Sinal, Mensais e Financiamentos com base estrita no vencimento.
- **Processamento de Teto e Escassez**: O sistema debita de cada parcela o menor valor entre o desejado bruto pelos cargos, o teto máximo de dedução daquela linha do fluxo, e o saldo global restante. Havendo esgotamento de saldo ou choque com o teto, aplica-se o fator de redução proporcional preservando o equilíbrio relativo entre os profissionais.
- **Distribuição de Saldo para Cargos Zero (0%)**: Caso um cargo seja cadastrado com percentual de parcela igual a 0%, o sistema redistribui o saldo restante permitido daquela parcela de forma igualitária e proporcional entre os cargos zerados candidatos, limitando-se ao teto individual do VGV de cada participante.
- **Sinalização de Cobertura**: Ao identificar que o fluxo de parcelas cronológicas se encerrou antes da quitação integral da comissão acordada, um painel emite alertas claros com o valor remanescente que ficou sem cobertura.

---

## 📊 Relatórios, Exportação e Impressão
- **Tabela de Rateio Geral**: Exibe de forma contínua o fluxo de parcelas até a quitação total da comissão acordada (ocultando linhas excedentes). O cabeçalho apresenta tons suaves de cinza contrastando com dados financeiros e nomes dos cargos com participantes associados.
- **Exportação Precisa**: O botão de exportação em formato `.csv` gera uma planilha onde os valores financeiros são gravados como números puros (preservando pontos e decimais) facilitando a aplicação imediata de filtros, somas e fórmulas no Excel ou Google Sheets.
- **Layout de Impressão (Print-Ready)**: Através de folhas de estilo específicas de mídia, ao acionar a impressão do navegador, o sistema formata a tabela com bordas completas em preto e branco e tipografia monoespaçada compacta, assegurando uma leitura física perfeita e formal de auditoria.
