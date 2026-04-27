# Gestão de anúncios

Status: em construção
Escopo: plano interno para evolução do setor

## Visão

Criar um setor dedicado para operação de anúncios da NGP com abordagem IA-first. O objetivo é permitir que a equipe suba criativos, campanhas, conjuntos e anúncios com o menor número possível de passos manuais, preservando revisão humana em pontos críticos.

## Objetivo de negócio

- Reduzir tempo operacional na criação e publicação de campanhas.
- Padronizar naming, estrutura, copy e montagem de ativos.
- Transformar briefing e objetivos em campanhas executáveis com apoio de IA.
- Aumentar velocidade de teste, iteração e otimização contínua.
- Criar um diferencial de prestação de serviço baseado em operação proprietária.

## Princípios do produto

- IA assiste a operação desde o início, não só na análise posterior.
- Humano aprova o que tem impacto estratégico, financeiro ou de marca.
- Toda geração precisa deixar rastros: prompt, versão, ativo usado, revisão e publicação.
- O fluxo deve começar assistido e só depois ganhar automações mais autônomas.
- O sistema precisa permitir atualização e otimização contínua do processo.

## Fluxo desejado

1. O operador escolhe cliente, conta e objetivo da campanha.
2. O sistema recebe briefing, oferta, público, orçamento, landing page e ativos disponíveis.
3. A IA sugere a estrutura da campanha:
   - objetivo
   - naming
   - divisão por campanhas e conjuntos
   - segmentação
   - orçamento
   - posicionamentos
   - estratégia de lance
4. A IA sugere variações de copy, headline, CTA e hipóteses criativas.
5. O operador ajusta ou aprova com poucas interações.
6. O sistema gera o payload de publicação.
7. O operador faz validação final.
8. A publicação acontece via integração.
9. O sistema salva contexto, prompt, estrutura, status e histórico da campanha.
10. Depois, a IA acompanha performance e propõe otimizações.

## Primeiras capacidades do setor

### Fase 1

- Criar setor "Gestão de anúncios" no Space.
- Criar tela de entrada com status "em construção".
- Centralizar briefings e checklists por campanha.
- Permitir cadastro de objetivo, oferta, público, verba e links.
- Permitir upload de ativos base:
  - imagens
  - vídeos
  - textos
  - referências

### Fase 2

- IA gerar estrutura recomendada da campanha.
- IA gerar naming padronizado.
- IA gerar sugestões de copy e CTA.
- IA gerar checklist de publicação.
- IA montar rascunho operacional antes da publicação.

### Fase 3

- Builder assistido de campanhas, conjuntos e anúncios.
- Geração de payload pronto para publicação.
- Histórico de versões por campanha.
- Comparação entre plano sugerido e plano aprovado.

### Fase 4

- Integração real com publicação.
- Regras de aprovação por nível:
  - operador
  - gestor
  - admin
- Sugestões automáticas de otimização pós-publicação.

## Módulos da solução

### 1. Briefing estruturado

Entradas mínimas:

- cliente
- conta
- objetivo
- evento de conversão
- público
- oferta
- orçamento
- prazo
- links
- restrições

### 2. Biblioteca de ativos

- imagens
- vídeos
- copies aprovadas
- headlines
- CTAs
- landing pages
- provas sociais
- referências anteriores

### 3. Motor de geração com IA

Saídas principais:

- estrutura da campanha
- nomes padronizados
- textos sugeridos
- hipóteses de testes
- recomendações de segmentação
- alertas de inconsistência

### 4. Camada de revisão humana

- aprovar
- editar
- rejeitar
- comentar
- salvar versão

### 5. Camada de publicação

- rascunho pronto
- validação final
- publicação
- log de envio
- status de execução

### 6. Camada de aprendizado

- guardar prompts usados
- guardar versões aprovadas
- guardar resultados por estrutura
- reaproveitar padrões vencedores

## Como a IA deve ser usada

### IA por prompt

Boa para:

- brainstorming
- geração de copy
- naming
- hipóteses criativas
- estrutura inicial

### IA com formulário estruturado

Boa para:

- transformar briefing em campanha
- manter consistência
- reduzir ambiguidade
- alimentar templates reutilizáveis

### IA com ativos

Boa para:

- interpretar criativos enviados
- cruzar ativo com objetivo
- sugerir encaixe por campanha ou público

## Modelo operacional recomendado

### Etapa 1

Operação assistida:

- IA sugere
- humano revisa
- humano publica

### Etapa 2

Operação semiassistida:

- IA já monta estrutura completa
- humano só ajusta pontos sensíveis
- sistema prepara publicação

### Etapa 3

Operação altamente automatizada:

- IA propõe, reestrutura e recomenda otimizações
- humano atua por exceção e aprovação

## Entidades que o setor deve suportar

- cliente
- conta de anúncios
- briefing
- ativo
- campanha
- conjunto
- anúncio
- prompt
- versão
- aprovação
- publicação
- histórico
- recomendação de otimização

## Regras importantes

- não publicar automaticamente no início
- toda campanha precisa de trilha de auditoria
- todo conteúdo gerado precisa ter origem rastreável
- guardar diferença entre sugestão da IA e versão aprovada
- bloquear publicação se faltar dado crítico

## Riscos a tratar

- IA gerar estrutura incoerente com objetivo real
- ativo inadequado para a campanha sugerida
- inconsistência entre briefing e publicação
- excesso de automação antes da maturidade operacional
- perda de contexto entre criação, publicação e análise

## MVP sugerido

O MVP ideal não é publicar anúncios ainda.

O MVP deve:

- receber briefing
- receber ativos
- gerar estrutura de campanha
- gerar naming
- gerar copy
- gerar checklist
- salvar tudo como rascunho operacional

Isso já cria valor imediato sem assumir risco de publicação automática.

## Dependências técnicas futuras

- biblioteca de ativos
- templates de campanha
- motor de prompts versionado
- camada de aprovação
- integração de publicação
- vínculo com dashboard e análise de performance

## Critério de sucesso

- tempo de criação de campanha reduzido
- menos retrabalho operacional
- mais consistência entre contas
- mais velocidade para testar hipóteses
- melhor capacidade de escalar prestação de serviço

## Próximo passo recomendado

Quando formos implementar, começar por:

1. tela do setor
2. briefing estruturado
3. biblioteca de ativos
4. geração assistida por IA
5. rascunho operacional salvo

Só depois disso avançar para publicação integrada.
