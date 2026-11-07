# Progresso do projeto — Açaí da Roça

## Estado atual
**Funcionalidades principais implementadas no código; pendente testar integração em ambiente com PostgreSQL configurado e publicar.**

## Implementado
- Frontend público responsivo: cardápio, personalização, carrinho, checkout de delivery, agendamento, avaliações e página de privacidade.
- Backend Express 5 com APIs de loja, cardápio, avaliações, pedidos e painel administrativo.
- Schema PostgreSQL com produtos, tamanhos, opções, bairros, configurações, pedidos, avaliações e administradores.
- Seed idempotente com catálogo inicial e configurações de horário.
- Preços e adicionais recalculados no servidor; validação de quantidades, acompanhamentos, caldas, bairro e horário.
- Pedido registrado no banco antes de abrir WhatsApp com resumo preenchido.
- Login com bcrypt e JWT, limite básico de tentativas de login, gestão de pedidos, status, cardápio/preços, disponibilidade de produtos/tamanhos/opções, bairros, avaliações e funcionamento.
- Atualização automática da lista de pedidos no painel a cada 12 segundos e atalho para pausar/reabrir pedidos imediatos.
- Relatórios de vendas com faturamento, quantidade, ticket médio, evolução diária e tamanhos mais vendidos.
- Cupons com desconto percentual/fixo e subtotal mínimo, validados e calculados no servidor.
- Repetição de pedido pelo acompanhamento público, mantendo apenas os itens que ainda estão disponíveis.
- Promoção automática de combo configurável (quantidade mínima e percentual), com desconto calculado novamente no servidor e aplicado também na edição do pedido.
- Previsão estimada configurável no painel e exibida no checkout, acompanhamento e WhatsApp.
- Programa de fidelidade: 1 ponto por real completo em produtos, creditado uma única vez quando o pedido é marcado como entregue; saldo consultado no acompanhamento autenticado por código + telefone.
- Salvamento opcional dos dados básicos apenas no armazenamento local do aparelho, mediante consentimento.
- PWA com manifest, ícones, botão de instalação e cache da estrutura visual; APIs e pedidos continuam exigindo internet.
- Página inicial refinada, destaque de combo/clube, total com descontos, barra fixa do carrinho no celular e botão de instalação.
- Headers básicos de segurança, README e testes unitários para regras de horário/moeda. O `.env` é local e não é incluído no ZIP; o `.env.example` (só nomes) foi criado na rodada 3.

## Validação feita / pendente
- Verificação sintática com `node --check` concluída para os arquivos JavaScript principais.
- `npm test`: 10 testes unitários passaram (regras de horário, timezone e moeda).
- Teste de integração com PostgreSQL real, validação visual em navegadores/dispositivos e conferência do fluxo WhatsApp dependem de ambiente configurado. O PWA precisa ser servido por HTTPS (ou localhost) para instalação.
- Deploy real e domínio personalizado não podem ser concluídos sem acesso às contas Render, Neon e registrador de domínio.

## Pendências comerciais antes de produção
1. Confirmar os bairros atendidos e as taxas reais. As taxas sem confirmação são valores iniciais de exemplo e podem ser editadas no painel.
2. Confirmar o que significa “1 copo” por R$ 35; foi mantido como “1 copo especial”.
3. Confirmar o WhatsApp `5521969081157`.
4. Completar os dados do responsável na política de privacidade.
5. Criar banco Neon, definir variáveis seguras e fazer deploy.


## Etapa de segurança, relatórios e recuperação (01/11/2026)

- [x] ~~Login sem bloqueio / sessão sem expiração~~ (substituído na rodada 1): o login bloqueia após 5 erros por IP (ou 20 por e-mail) em 15 minutos, e a sessão do painel expira em 7 dias (`ADMIN_TOKEN_TTL` muda). O token continua no navegador até expirar ou até clicar em Sair.
- [x] Auditoria de logins e mutações administrativas, com rota, IP, administrador, horário e status HTTP.
- [x] Confirmação de exclusão permanente de pedidos e produtos no painel.
- [x] Exclusões registradas na auditoria.
- [x] Relatório com indicadores de hoje, semana atual e mês atual; mantém períodos customizáveis de 7, 30 e 90 dias.
- [x] Exportação JSON de pedidos, clientes derivados, cardápio, opções, bairros, configurações, cupons, avaliações e fidelidade.
- [x] Verificação estrutural e restauração transacional do backup JSON. Administradores e auditoria são preservados na restauração.
- [x] Service worker atualizado para nunca armazenar APIs, pedidos, backups ou painel administrativo; cache antigo é invalidado.
- [x] Validação de valores de pedidos no servidor mantida como fonte de verdade.
- [ ] Teste de integração com PostgreSQL real e teste de restauração em banco separado: reservado ao usuário/ambiente de produção.
- [ ] Testes manuais de compra, edição, cancelamento, login, exportação/restauração e PWA: reservados ao usuário.
- [ ] Confirmar backup automático e retenção no provedor PostgreSQL.

**Limitações importantes:** backup JSON manual não substitui snapshot/backup nativo do PostgreSQL. A restauração substitui dados operacionais atuais e deve ser feita somente após baixar um backup recente. Exclusão de pedidos é permanente. A sessão administrativa expira em 7 dias (ver acima); mesmo assim, use senha forte, dispositivo protegido e saia do painel em dispositivos compartilhados.


### Ajustes de conta do cliente (01/11/2026)
- Adicionados os botões “Fazer login” e “Cadastrar” no topo da loja, também acessíveis em telas pequenas.
- O checkout informa claramente que a conta é opcional e o pedido pode ser feito como visitante.
- Cadastro com número de WhatsApp já usado mostra mensagem de erro explícita e orienta o cliente a entrar na conta existente.


### Simplificação do estoque e reorganização do rastreamento (01/11/2026)
- Painel de estoque reorganizado para priorizar saldo atual e atualização rápida (entrada/retirada).
- Custo e fornecedor passaram para campos opcionais recolhidos; fichas técnicas, calibração e relatórios continuam disponíveis em áreas avançadas recolhidas.
- Textos e rótulos simplificados para orientar compras/reposições e retiradas sem alterar a lógica do backend.
- Área “Onde está meu açaí?” movida para imediatamente depois da seção Cardápio; removido o atalho do menu superior para não incentivar o rastreamento antes da compra.
- Validação: `node --check` no painel e rotas administrativas; `npm test` (10/10). Teste visual e integração real com Neon/Render continuam pendentes.

### Consumo automático simplificado por pedido (01/11/2026)
- Adicionado formulário simples para definir quanto de um ingrediente é consumido quando um acompanhamento é escolhido em cada açaí.
- Conversão automática de consumo em gramas para estoque em kg e de ml para estoque em litros (ex.: 20 g = 0,020 kg).
- A baixa continua acontecendo ao mover o pedido para **Preparando**, com transação, bloqueio de linha e chave idempotente por pedido/ingrediente.
- Cancelamento pelo cliente agora também devolve o consumo registrado, dentro de transação e com proteção contra devolução duplicada.
- Corrigido parâmetro SQL na atualização de disponibilidade após movimentação manual.
- Testes unitários de conversão de unidade adicionados; `npm test` passou com 14/14 testes.
- Integração real com Neon/Render não foi executada neste ambiente.

## Correção adicional — seletores do desconto automático
- A carga dos ingredientes e acompanhamentos agora é independente das consultas de relatórios e calibrações; falhas nessas consultas não deixam mais os campos vazios.
- Removido filtro rígido de categoria `topping`, que excluía opções cadastradas com rótulos diferentes no banco.
- Normalização das respostas para arrays e cache-busting do JavaScript administrativo.
- Validação: `node --check public/js/admin.js` e `npm test` (14/14 aprovados).


## Correção adicional — seletores de ingredientes (01/11/2026)
- Criado GET `/api/admin/inventory/items`, endpoint dedicado que retorna somente ingredientes ativos para os campos de seleção.
- O painel agora popula os seletores com essa consulta independente do payload agregado de estoque, receitas e movimentações.
- Campos são reconstruídos com `document.createElement`, preservando IDs e evitando falhas de interpretação de HTML.
- Atualizada a versão do JavaScript administrativo para invalidar cache.
- `node --check` no backend e frontend: aprovado. `npm test`: 14/14 aprovados.
- Não foi possível validar a consulta no banco Neon de produção nesta sessão.

### Refeito: controle de estoque simples (01/11/2026)
- Painel de estoque simplificado para cadastro direto de produto, saldo, unidade (kg/g/un/l/ml), consumo por açaí e valor gasto na compra.
- Tabela mostra produto, saldo atual, medidor visual de estoque, status (bom/acabando/esgotado), valor gasto e consumo configurado.
- Botão “Alterar saldo” atualiza a quantidade real por conferência e registra a diferença no histórico, sem apagar movimentações anteriores.
- Botão “Consumo” permite ajustar ou desativar o consumo automático de cada produto.
- Baixa automática no início da produção: se o nome do produto corresponder exatamente a um acompanhamento existente, desconta somente quando esse acompanhamento estiver no pedido; sem correspondência, desconta por cada açaí do pedido.
- Cancelamento de pedido com baixa registrada devolve a quantidade consumida, com movimentação de devolução; pedido cancelado antes da produção não altera o estoque.
- Migração aditiva: colunas de capacidade do medidor, valor total de compras e consumo por açaí; nenhum registro de estoque existente é apagado.
- Validação local: `node --check` nos arquivos JavaScript e `npm test` (14/14). Teste real com Neon/Render ainda depende de publicar em homologação.


## Correção do registro de compras de estoque
- A rota de movimentações agora recebe o valor total pago na compra separadamente do custo unitário, evitando arredondamentos e inconsistências no total gasto.
- A entrada é aplicada com bloqueio da linha (`FOR UPDATE`) dentro de transação e registra a movimentação no histórico.
- Foram reforçadas migrações idempotentes para colunas de movimentações em bancos existentes.
- Em caso de erro SQL, o backend registra código e contexto técnico no log do servidor sem expor credenciais ao navegador.
- Validação: `node --check` no backend e painel; `npm test` (14/14). Teste conectado ao Neon não executado neste ambiente.

### Ajustes de estoque: reposição, correção de saldo e exclusão (01/11/2026)
- Reforçada a rota de movimentações com transação, bloqueio da linha do produto (`FOR UPDATE`), validação da quantidade e cálculo do novo saldo a partir do valor bloqueado.
- Compra soma apenas a quantidade recebida, registra o valor pago no total de compras e cria movimento de entrada; erros esperados retornam mensagens claras.
- Criada ação “Corrigir saldo” com modal próprio: informa a quantidade física total e registra somente a diferença como conferência, sem contabilizar compra.
- Criada exclusão lógica de produto: remove da lista ativa, preserva movimentações/histórico e não apaga a opção correspondente do cardápio (reativa a opção caso estivesse bloqueada pelo estoque).
- Lista principal mostra apenas produtos ativos; histórico continua exibindo movimentos de produtos posteriormente excluídos.
- Validação local: `node --check` em `public/js/admin.js` e `src/routes/admin.js`; `npm test` (14/14). Integração com Neon/Render ainda precisa ser validada em homologação.


### Revisão do estoque no admin (01/11/2026)
**Causas encontradas**
- Texto escuro sobre fundo escuro: o CSS do estoque usava `--text`, `--border` e `--input-bg`, que nunca foram definidas. No tema escuro os diálogos ficavam com texto e campos ilegíveis. As variáveis agora existem nos dois temas, e uma auditoria automática de contraste (WCAG AA) passou no painel e em todos os diálogos.
- Compras falhando com valor quebrado: no SQL da movimentação, `$3>0` fazia o PostgreSQL tratar o custo unitário como inteiro (ex.: R$ 22,50/kg dava erro 22P02). Corrigido com `::numeric` explícito em todos os parâmetros numéricos.
- Botões fora de vista: a lista era uma tabela de 720 px, então no celular "Excluir" ficava escondido à direita. Trocada por cartões sem rolagem horizontal.
- Feedback invisível: as mensagens apareciam no topo da página, fora da tela ao rolar a lista. Agora há aviso fixo na tela e erros aparecem dentro do próprio diálogo, sem perder o que foi digitado.
- `confirm()` nativo podia ser bloqueado pelo navegador. Substituído por diálogo próprio.
- Itens excluídos eram revinculados ao cardápio a cada reinício do servidor (`init.js`). Agora só itens ativos são vinculados.
- Restauração de backup perdia consumo, valor de compras, medidor e todo o histórico de movimentações. Agora são restaurados (e as sequências de ID de estoque são reajustadas). Backups antigos continuam compatíveis.

**Novidades**
- Retirar / perda (saída e desperdício), Editar produto (nome, unidade com conversão, alerta mínimo, quantidade cheia), fornecedor opcional na compra, busca e filtro, resumo com total gasto, movimentações com unidade e tipo legível.
- Alerta mínimo agora é respeitado pelo status; antes só valia a regra de 20%.
- Código do estoque movido para `public/js/admin-inventory.js` (legível, um único componente de diálogo). Código antigo removido do `admin.js`.

**Validação**: `node --check` em todos os arquivos, `npm test` 21/21, interface testada em Chromium (tema claro/escuro, desktop e 390 px) com API simulada. **Não testado contra PostgreSQL real**: valide compra, correção, edição com troca de unidade, exclusão e restauração de backup em homologação antes de publicar.


## 01/11/2026 — Foto nas avaliações, contraste de cores e ajustes de celular
- Avaliações aceitam uma foto opcional: o navegador reduz (máx. 1000 px) e converte para JPEG; o servidor valida tipo, tamanho (até 700 KB) e assinatura do arquivo. Coluna nova `reviews.photo` (criada sozinha no próximo start).
- A foto só aparece no site depois que a loja aprova a avaliação; no painel (aba Avaliações) a loja vê a foto antes de aprovar. Backup e restauração incluem as fotos.
- Limite de 5 avaliações por IP por hora (em memória).
- Corrigidos textos invisíveis: botões do topo no celular (claro e escuro) e a seção "Nossos Açaís" no modo escuro. Mensagens de sucesso agora aparecem em verde.
- "Vantagem da casa" centralizada, com o mesmo espaço acima e abaixo; hero em uma coluna no celular; fotos da galeria com proporção fixa.


## 01/11/2026 — Consumo por tamanho no estoque
- Nova ação **Consumo por tamanho** no cartão do produto: um campo por tamanho ativo do cardápio (ex.: açaí em L com 300 ml, 400 ml, 500 ml, 700 ml e 1 L). A baixa automática (ao ir para Preparando) já usava `inventory_recipes.size_id`; faltava a tela e a gravação.
- Nova rota `PUT /api/admin/inventory/items/:id/size-recipes` (transação, converte g/ml para a unidade do estoque, em branco/0 remove).
- Corrigido `ON CONFLICT DO UPDATE` sem alvo (inválido no PostgreSQL) em `POST /inventory/recipes` e na aprovação de calibração, via `saveRecipe`. `POST /inventory/recipes` aceita `measure` para converter a unidade.
- Trocar a unidade do estoque agora converte também as quantidades por tamanho; salvar consumo fixo (>0) remove o consumo por tamanho (`clearSizeRecipes`).
- Botão "Consumo" renomeado para "Consumo fixo". Cartão mostra "varia por tamanho" com o detalhe de cada tamanho.
- Validação: `node --check`, `npm test` e interface testada em Chromium com API simulada. **Não testado contra PostgreSQL real**: validar em homologação (salvar por tamanho, pedido em 300 ml e 1 L indo para Preparando, cancelamento com devolução e troca L↔ml).


## 01/11/2026 — Segurança, parte 1 (login e pedidos)
- **Falha corrigida:** o painel aceitava qualquer token assinado com o `JWT_SECRET`, inclusive o token de uma conta de cliente. Agora só vale token com `type:'admin'` (`middleware/auth.js`), verificado com HS256.
- Token do painel passa a **expirar** (7 dias por padrão, `ADMIN_TOKEN_TTL` para mudar). Tokens antigos, que nunca expiravam, deixam de valer: o administrador entra de novo uma vez.
- **Limite de tentativas no login do painel:** 5 erros por IP / 20 por e-mail em 15 min, resposta 429 com `Retry-After`. Acerto zera o contador. E-mail inexistente e senha errada gastam o mesmo tempo.
- **Limite de pedidos:** 20 por IP e 6 por telefone por hora (só pedidos criados contam; erro de digitação não gasta o limite).
- Mesmo limite no login de cliente (10 erros por IP e por celular em 15 min).
- Novo `services/rateLimit.js` com testes. Contadores ficam em memória: reiniciar o serviço zera.
- Validação: `node --check` e `npm test` (33/33); regra de tokens testada com um módulo `jsonwebtoken` simulado. Não testado contra o Render/Neon.


## 01/11/2026 — Parte 2 (limite de corpo e pedido sem WhatsApp)
- **Item 3:** o limite de 10 MB deixou de valer para tudo. Agora: 10 MB só em `/api/admin/backup/*`, 1,2 MB em `/api/reviews` (foto) e 100 KB no resto. Corpo grande demais responde 413 e JSON quebrado responde 400, com mensagem clara (antes dava erro 500).
- **Item 5 (site):** depois de registrar o pedido, aparece uma caixa fixa "Falta só um passo: envie o pedido AR-XXXXXX no WhatsApp" com um botão que é um link normal. O `window.open` depois de uma espera costuma ser bloqueado no celular, e antes o cliente ficava sem como reenviar.
- **Item 5 (painel):** pedido "Novo" há 10 min ou mais ganha a linha destacada, o selo "Novo há X min" com link "Chamar no WhatsApp" para o cliente, e um aviso no topo da lista. Pedidos agendados para o futuro não contam. A lista já atualiza sozinha, então os minutos se atualizam.
- Versão dos arquivos (`?v=`) e do cache do PWA trocada para `20261101-parte2-8`, para os celulares receberem o JS novo.
- Validação: `node --check` em tudo; caixa do WhatsApp e selo testados em Chromium (claro e escuro). **Não testado com o servidor rodando** (sem Express/PostgreSQL neste ambiente): confira o 413 no backup grande, o envio de avaliação com foto e um pedido de ponta a ponta.


## 01/11/2026 — Parte 3 (Pix e estoque bloqueando a venda)
- **Item 6 (Pix):** novo `services/pix.js` gera o Pix "copia e cola" estático (BR Code com CRC16) a partir da chave da loja. Sem conta em provedor: o valor cai direto na conta da chave e a loja confere no app do banco. Configuração em Painel → Funcionamento (chave, nome e cidade do recebedor; chave em branco desliga). Aceita CPF/CNPJ (só números), celular com +55, e-mail e chave aleatória. Quando o cliente escolhe Pix, a resposta do pedido traz o código e a caixa final mostra valor, código e botão "Copiar código Pix". A mensagem do WhatsApp avisa que o comprovante vai na conversa. Sem QR Code por enquanto: o cliente paga pelo celular com o copia e cola.
- **Item 7 (estoque):** `/api/menu` marca `soldOut` nos tamanhos cujo ingrediente (receita por tamanho) não cobre um copo; o site mostra "Esgotado" e desabilita. `POST /api/orders` soma os copos e responde 409 se o saldo não cobre o pedido. Funções puras `soldOutSizeIds` e `findStockShortage` com testes. Limites e exceções em `IMPLEMENTACAO-ESTOQUE.md`.
- Versão dos arquivos e do cache do PWA: `20261101-parte3-9`.
- Validação: `node --check` em tudo; `npm test` 42/42 (inclui CRC16 com vetor padrão e leitura campo a campo do BR Code); site testado em Chromium (claro e escuro). **Não testado**: servidor rodando/PostgreSQL e leitura do código Pix em um app de banco real. Antes de divulgar, faça um pedido de R$ 1 pagando o código gerado.


### Rodada 1 — segurança e correções (01/11/2026)
- Limite de tentativas no acompanhamento/edição/cancelamento de pedido; código de pedido com `crypto.randomInt`.
- `pool.on('error')` e SSL com verificação; `DATABASE_SSL_INSECURE` como saída de emergência.
- Pedido só pode ser editado/cancelado pelo cliente enquanto "Recebido"; depois, botão para falar com a loja no WhatsApp.
- Edição: transação real (`FOR UPDATE` dentro de `BEGIN`), checagem de estoque, validação de agendamento e novo Pix com o valor atualizado.
- `req.body` sempre definido (evita erro 500 em requisições sem corpo).
- Front: frete e total com entrega ao vivo; avisos de erro do montador junto dos botões.
- Validação: `npm test` 45/45 (inclui testes do código de pedido); teste de navegador (Chromium, API simulada) 18/18.
- **Pendente:** teste das rotas contra Postgres real (não foi possível instalar dependências no ambiente de desenvolvimento). Rodar `TESTES-MANUAIS.md` em staging antes de publicar.

### Rodada 2 — melhorias (01/11/2026)
- **Pix:** aviso “⚠️ Pedido só será preparado após o envio do comprovante do Pix.” na mensagem do pedido, na mensagem de edição e na tela de pedido registrado (texto único em `PIX_NOTICE`). Sem status de pagamento, por decisão da loja.
- **Fluxo site + WhatsApp:** botão “Fazer pedido”; depois de registrar: “Agora envie no WhatsApp para a loja confirmar”. Nada foi removido do fluxo.
- **SEO (loja só de entrega, sem endereço):** canonical, og/Twitter, JSON-LD `Restaurant` com `areaServed` e `sameAs` (Instagram), `robots.txt` e `sitemap.xml` gerados pelo servidor, `noindex` no admin e `X-Robots-Tag` em /admin e /api. `/` passa a ser servido pelo servidor para preencher `SITE_URL`.
- **Instagram:** link no cabeçalho e faixa “Siga a gente no Instagram” antes do rodapé (`instagram.com/darocacai`).
- **Imagens:** fotos do cardápio em WebP (≈410 KB → ≈28 KB cada), com width/height; PNGs removidos; service worker atualizado. Fontes continuam do Google Fonts com `display=swap`.
- **Backup:** exportação por tabela; inclui contas de clientes (com hash), favoritos e `customer_id` dos pedidos; restauração devolve tudo isso e reajusta sequências. Backups antigos seguem restauráveis.
- **Fotos de avaliação:** serviço `photoStorage.js` (Cloudinary, sem SDK). Novas fotos vão para lá quando `CLOUDINARY_URL` existe; fotos antigas migram pelo botão no painel (lotes de 5; só sai do banco após o envio dar certo). Servidor entrega a foto (o endereço do arquivo não aparece para o cliente). Excluir a avaliação apaga o arquivo.
- Versão dos arquivos e cache do PWA: `20261101-rodada2-11`.
- Validação: `node --check` em tudo; `npm test` 51/51 (6 novos do armazenamento); Chromium (claro, desktop e 390 px) para Instagram, botão e mensagem de edição com Pix. **Não testado:** servidor rodando com PostgreSQL (sem dependências aqui), envio real ao Cloudinary, restauração de backup em banco de teste.


### Rodada 3 — código (01/11/2026) — PARCIAL
- **Feito:** todos os .js reformatados (sem Prettier: compilador TypeScript; estrutura verificada idêntica); `public/js/app.js` dividido em `public/js/site/*.js`; `src/services/pricing.js` (`priceOrder`, `buildOrderItem`) com 16 testes, usado em criar pedido, editar pedido e validar cupom; `src/app.js` (`createApp`) separado do `server.js`. Versão do cache: `20261101-rodada3-12`.
- **Mensagens padronizadas:** limite de acompanhamentos ("por açaí"), calda única, limite de valor e mínimo do cupom têm agora um texto só.
- **Verificação:** `npm test` passa; site original x novo no Chromium (API simulada) sem diferenças; handlers de pedido original x novo com Express/pg simulados: status e totais iguais em 21 cenários.
- **Pendente:** dividir admin.js e admin-inventory.js; testes de rota (supertest + Postgres) e CI; ESLint/Prettier (rodar `npm run format` uma vez); .env.example; teste com PostgreSQL real.

### Rodada 3 — complemento (01/11/2026)
- **Painel dividido:** `public/js/admin.js` virou `public/js/admin/*.js` (14 arquivos por assunto, `main.js` por último, que só liga o painel depois de todas as funções existirem) e `admin-inventory.js` virou `public/js/admin-inventory/*.js` (5 arquivos; `events.js` por último, dentro de uma função própria). Código idêntico, só cortado em fronteiras de instrução; scripts clássicos, mesmo escopo global.
- **Verificação do painel:** original x novo no Chromium, com API simulada do painel (login errado e certo, as 11 abas, bairro, cupom, pausar loja, som, tema, filtros e 6 diálogos do estoque, cadastro de produto, redefinição de senha, migração de fotos, backup, sair) e abertura com sessão já salva: 0 erros no console, 0 diferenças no conteúdo das abas, mesma sequência de chamadas à API (39).
- **Ferramentas:** `.prettierrc.json`, `.prettierignore`, `eslint.config.js` (navegador: `no-undef`/`no-unused-vars` desligados porque os scripts compartilham escopo global), scripts `format`, `format:check`, `lint`, devDependencies, `.env.example`, workflow `ci.yml` com Postgres.
- **Testes de rota:** `tests/routes.test.js` (supertest + Postgres): preço (item, combo, cupom, mínimo, limites), estoque (recusa por falta, baixa só em Preparando, devolução), edição, cancelamento e limite de tentativas no acompanhamento. Pulados sem `TEST_DATABASE_URL`; recusam banco sem "test" no nome.
- **Não verificado (sem Postgres nem internet neste ambiente):** `npm install`, Prettier, ESLint e os testes de rota nunca foram executados. A primeira execução do CI pode apontar ajustes nos testes e vai reclamar de formatação até rodar `npm run format` uma vez.
- **Fora do escopo (continua):** `/api/health` sem checagem do banco, fuso fixo nos relatórios, migrações dentro de `initializeDatabase()`, combo recalculado no navegador só para exibir, cookie httpOnly + CSP, Web Push, resgate de pontos.

### Rodada 3 — monitoramento e atualização automática (01/11/2026)
- **Erros:** `public/js/diagnostics.js` (carregado primeiro na loja e no painel) envia erros de JavaScript e promessas rejeitadas para `POST /api/client-errors` (até 5 por página, 20 por IP a cada 10 min; ignora extensões e ruído de rede). Erros 500 do servidor também são gravados. Tabela nova `client_errors` (migração automática). Painel: aba **Erros**, botão "Limpar lista" e faixa de aviso no topo.
- **Pedidos parados:** `GET /api/admin/alerts` avisa quando a loja está aberta há mais de 3 h (`ALERT_NO_ORDERS_HOURS`) sem pedido não cancelado. Não avisa com a loja fechada ou pausada.
- **Nova versão:** `GET /api/version`; `services/build.js` troca os `?v=` e o nome do cache do service worker pelo identificador do deploy (`/`, `/admin` e `/service-worker.js` agora passam pelo servidor). Aviso "Nova versão disponível" com botão; atualização automática na loja quando a tela volta do segundo plano (uma vez por versão, sem looping).
- **Validação:** `npm test` de serviços 71/71; diagnóstico testado em Chromium (erro e promessa rejeitada enviados; aviso de versão aparece). **Não testado:** servidor com PostgreSQL (rotas novas, tabela, aba Erros, `/admin` e `/service-worker.js` estampados), e o UptimeRobot, que você configura na sua conta.

### Rodada 3 — histórico de pedidos (01/11/2026)
- Aba Pedidos: paginação ("Carregar mais", 50 por vez), busca (código, nome, telefone, bairro), filtro por status e datas, "Limpar filtros" e exportação CSV (`GET /api/admin/orders/export.csv`, mesmos filtros). `GET /api/admin/orders` aceita `q`, `from`, `to` e `limit` (até 501; padrão 200, compatível com o anterior). Lógica pura em `services/orderSearch.js` (parâmetros SQL, escape do LIKE, proteção contra fórmulas no CSV).
- Política de privacidade: responsável e e-mail preenchidos, avisos de "modelo a validar" removidos e frase de retenção por tempo indeterminado.
- Validação: `npm test` de serviços 76/76; tela testada em Chromium com API simulada (paginação, busca, datas, download, limpar). **Não testado:** as consultas SQL contra PostgreSQL real (busca por telefone, fuso nas datas, CSV com dados reais).


## Rodada 4 — Parte 1: painel do desenvolvedor (`/dev`) (01/11/2026)
- Novo painel `/dev` com login próprio (tabela `developers`, token `type: developer`, `DEV_EMAIL`/`DEV_PASSWORD`, sessão de 12 h, bloqueio por tentativas).
- Abas do `/dev`: Visão geral (saúde do sistema), Erros (filtro, ranking, detalhes com stack, exclusão), Auditoria (filtro por painel/busca), Backup (download, validação, restauração com confirmação digitada) e Contas da loja (listar, criar, redefinir senha).
- Erros, Auditoria e Backup foram **removidos do painel da loja** (`/admin`) e das rotas `/api/admin/*`; a lógica de backup virou `src/services/backup.js` (comportamento igual). O aviso de “erros nas últimas 24 h” saiu do topo do painel da loja; o aviso de “sem pedidos” continua.
- Auditoria compartilhada (`src/services/audit.js`) com coluna nova `actor` (`admin`/`dev`); linhas antigas viram `admin`.
- Link “Desenvolvedor” ao lado de “Acesso da loja” no rodapé; `/dev` fora do cache do service worker e com `noindex`.
- Testes: validações em `src/services/devAccounts.test.js` e rotas `/api/dev` em `tests/routes.test.js` (precisam de `TEST_DATABASE_URL`).
- Interface testada em navegador headless com API simulada (claro, escuro, celular). Integração com o PostgreSQL real **não** foi executada neste ambiente.

## Rodada 4 — Parte 2: erro na aba Relatórios (01/11/2026)
- Causa: a consulta de **faturamento por dia** (`GET /api/admin/reports`) formatava `created_at` com `TO_CHAR(...)` no SELECT, mas agrupava por `DATE(created_at ...)`. O PostgreSQL recusa isso com “column orders.created_at must appear in the GROUP BY clause”, e como as 6 consultas do relatório rodam juntas, a aba inteira falhava.
- Correção: agrupar primeiro pela data (dia em Brasília) numa subconsulta e formatar “DD/MM” só na consulta de fora, ordenando pela data real (e não pelo texto, que bagunçaria a virada de ano).
- As outras 5 consultas do relatório, o resumo por período e os relatórios de estoque foram revisados: usam `GROUP BY` correto, sem o mesmo problema.
- Teste de rota novo (`tests/routes.test.js`, “relatórios do painel”) abre o relatório de 7, 30 e 90 dias e o resumo por período; ele teria pegado o erro. Precisa de `TEST_DATABASE_URL`.
- A consulta corrigida **não pôde ser executada contra um PostgreSQL real** neste ambiente (sem banco/internet). Abra Relatórios em /admin depois do deploy para confirmar.


## Rodada 4 — Parte 3: agendamento só quando a loja abre (01/11/2026)
- Nova regra única em `src/services/schedule.js`: a lista de horários do site e a validação do pedido usam as mesmas funções (dia aberto, dentro do horário, antecedência mínima). O fechamento é exclusivo (22:00 fechando = último horário 21:45).
- Nova rota pública `GET /api/schedule-slots`: dias e horários (de 15 em 15 min, até 14 dias à frente) calculados no fuso de São Paulo, então o fuso/relógio do aparelho do cliente não influencia mais.
- Checkout: o campo livre de data foi trocado por **Dia** e **Horário**; só aparece o que a loja aceita. Sem horários disponíveis, o site avisa e orienta falar pelo WhatsApp.
- Servidor: criação e edição de pedido passam por `validateScheduledAt` (também recusa formatos estranhos). A mensagem de erro agora diz os dias e o horário reais da loja.
- O fechamento manual continua não impedindo agendamentos em horário de funcionamento (como antes).
- Testes: `src/services/schedule.test.js` (10 testes, passam) e rotas em `tests/routes.test.js` (precisam de `TEST_DATABASE_URL`). Interface testada em navegador headless com o serviço real.
- O servidor já validava antes; não consegui reproduzir um furo sem o banco real. A causa provável era o campo livre (erro só no envio, e data interpretada no fuso do aparelho).


## Rodada 4 — Correção: bairros não voltam ao padrão (02/11/2026)
- Antes, a cada inicialização o servidor regravava a taxa dos 8 bairros iniciais e os reativava. Agora eles só são criados quando a tabela de bairros está **vazia** (banco novo). Taxas editadas, bairros desativados e bairros excluídos no painel permanecem após reinício/deploy.
- Teste de rota novo cobre os três casos (precisa de `TEST_DATABASE_URL`).
- Observação: a linha que desativa os bairros antigos de demonstração (Centro, Alto, Várzea, Agriões, Barra do Imbuí) continua rodando a cada início; só afeta quem usar esses nomes.


## Rodada 4 — Segurança: sessões e CSP (02/11/2026)
- **Sessões:** colunas `password_changed_at` em `admins` e `developers`; o login grava a "versão da sessão" no token (`pwv`) e `requireAdmin`/`requireDev` (agora assíncronos) comparam com o banco a cada requisição. Redefinir senha no `/dev` ou mudar `DEV_PASSWORD` derruba as sessões antigas; conta excluída perde o acesso. Tokens emitidos antes desta versão continuam valendo até a primeira troca de senha ou expirar.
- **Custo:** 1 consulta simples por requisição dos painéis (a lista de pedidos atualiza a cada 12 s).
- **CSP** (`src/services/csp.js`): scripts só do site + hashes dos scripts inline de tema; estilos do site e Google Fonts (atributos `style=""` liberados); imagens do site/data:/blob:; `connect-src 'self'`; sem object, frames ou `base` externo. `CSP_REPORT_ONLY=true` liga o modo só-aviso.
- Verificado em navegador headless: loja, privacidade, /admin (login), /dev (login e todas as abas) sem nenhuma violação, e um script/`onerror` injetado de propósito foi bloqueado. **Não** exercitado: painel da loja logado com dados reais (pedidos, estoque, foto de avaliação), PWA instalado e fontes do Google (sem internet aqui).
- Testes: `src/services/csp.test.js` (4) e rotas de sessão em `tests/routes.test.js` (precisam de `TEST_DATABASE_URL`); o token de teste do admin agora usa uma conta real.

## Cupom de primeira compra — Parte 2: uso único (02/11/2026)
- Regras em `src/services/welcomeCoupon.js` (`couponProblem`, `claimPersonalCoupon`, `releasePersonalCoupon`, `findCouponForEdit`), ligadas a `GET /api/coupons/validate`, `POST /api/orders` e à edição do pedido.
- Devolução do cupom: cancelamento pelo cliente (`orders.js`), mudança de status para cancelado e exclusão de pedido não entregue (`admin.js`), e edição que remove o cupom do pedido.
- Testes: `npm test` de serviços 113/113; 11 testes de rota novos em `tests/routes.test.js` (cadastro, "Meus cupons", validação, desconto, uso único, corrida entre dois pedidos, cancelamentos, exclusão, edição). **Não executados**: sem PostgreSQL neste ambiente. Rodar com `TEST_DATABASE_URL` ou pelo CI antes de publicar.
- Falta (Parte 3): tela "Meus cupons" e visão no painel.

## Cupom de primeira compra — Parte 3, etapa 1: mensagem após o cadastro (02/11/2026)
- Aviso no site logo após o cadastro com o código do cupom, botões "Copiar código" e "Usar na minha primeira compra", tema claro/escuro e celular. Só aparece quando o cadastro devolve `welcomeCoupon`.
- Não alterou API nem banco. Testado só com `node --check` e simulação de DOM; teste visual real no navegador continua pendente.
- Falta (Parte 3): etapa 2 "Meus cupons" e etapa 3 visão no painel.

## Cupom de primeira compra — Parte 3, etapa 2: "Meus cupons" (02/11/2026)
- Cartão "Meus cupons" na conta do cliente e atalho no menu lateral. Lista o cupom pessoal com status (Disponível / Já usado / Indisponível), copiar código e usar no pedido (preenche o campo de cupom e aplica se houver itens no carrinho).
- Atualização automática: `loadCustomerCoupons()` roda ao entrar, após pedido, após cancelar no site, no ciclo de 30 s da conta e ao voltar para a aba. Só redesenha se a lista mudou. Nomes de cupom passam por `esc()`.
- Não alterou API nem banco. Testado com `node --check` e simulação de DOM (vazio, disponível, usado, indisponível, erro de rede, escape de HTML); teste visual real no navegador continua pendente.
- Falta (Parte 3): etapa 3, visão no painel admin.

## Cupom de primeira compra — Parte 3, etapa 3.3a: servidor da visão do painel (02/11/2026)
- Rota `GET /api/admin/coupons/welcome` (dono, status, pedido, resumo, filtros `status`/`q`/`limit`) e funções puras `buildWelcomeAdminFilter` e `presentAdminWelcomeCoupon` em `src/services/welcomeCoupon.js`.
- Cupom de boas-vindas ficou travado no painel: `PATCH`/`DELETE /api/admin/coupons/:id` só valem para cupom manual (403 nos automáticos) e o código `BEMVINDO-…` é reservado na criação de cupom manual. Antes dessa trava, quem soubesse o `id` podia apagar ou desativar o cupom de um cliente pela API.
- Testes: `npm test` de serviços 118/118 (5 novos: filtro, busca segura, limite, apresentação). 10 testes de rota novos em `tests/routes.test.js` (bloco "cupons de boas-vindas no painel"): **não executados**, sem PostgreSQL neste ambiente. Rodar com `TEST_DATABASE_URL` ou pelo CI.
- Falta (3.3b): tela do painel, `?v=`/cache do PWA e conferência no navegador.


## Cupom de primeira compra — Parte 3, etapa 3.3b: visão no painel (02/11/2026)
- Aba **Cupons** agora inclui uma área de leitura dos cupons automáticos de primeira compra, separada dos cupons promocionais manuais.
- Resumo geral (total, disponíveis, usados e indisponíveis), busca por nome/celular/código/pedido, filtro por status, atualização manual e lista com cliente, código, percentual, data e pedido vinculado.
- A tela não oferece ações de edição/exclusão dos cupons pessoais; a API também já bloqueia essas operações.
- Atualizados os identificadores estáticos de cache; o servidor continua estampando `?v=` e o cache do service worker com o identificador do deploy.
- Validação: `node --check` dos JS alterados e 118 testes de serviço passaram. `npm test` completo teve 1 falha ambiental em `tests/health.test.js` porque as dependências (`express`) não estão instaladas; testes de rota PostgreSQL seguem condicionados a `TEST_DATABASE_URL`. Falta conferir a tela no navegador com admin logado e banco real.

## Correção do cardápio e cores dos trufados (02/11/2026)
- **Erro no cardápio:** a consulta de tamanhos em `GET /api/menu` (`src/routes/public.js`) usava `ORDER BY sort_order,id` com duas tabelas que têm `sort_order` (`product_sizes` e `products`), o que o PostgreSQL recusa por ambiguidade. Agora é `ORDER BY s.sort_order,s.id`. Não pude executar contra um PostgreSQL real aqui: confirme abrindo o site após o deploy.
- **Trufados:** os cards usavam variáveis de cor inexistentes (`--card-bg`, `--border-color`), então o fundo ficava branco mesmo no tema escuro, com texto claro. Agora usam `--card`/`--line`/`--ink`, com fundos escuros próprios no tema escuro e destaque no sabor escolhido.
- Cache atualizado para `menu-fix-4` (index.html e service-worker.js).
- Falta: conferir visualmente no navegador (claro/escuro, celular) e abrir o cardápio com o banco real.

## Seta para abrir/fechar em "Meus favoritos" (02/11/2026)
- A área "Meus favoritos" da conta agora é um painel recolhível, igual a "Meus cupons" e "Meus pedidos": título com seta, começa fechado, abre e fecha com animação (usa o mesmo código `.accordion-trigger` já existente, sem JS novo).
- Os elementos internos (`#favorites-list`, `#favorites-message`) mantêm os mesmos IDs; carregar, adicionar ao pedido e remover favoritos continuam iguais.
- Cache atualizado para `menu-fix-5`.
- Falta: conferir no navegador (abrir/fechar, tema escuro, celular). O atalho "Meus favoritos" do menu lateral só rola até a seção; com o painel fechado ele não abre sozinho (mesmo comportamento de "Meus cupons").
