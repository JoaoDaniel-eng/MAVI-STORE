# Açaí da Roça — pedidos online e painel administrativo

Aplicação full-stack para uma loja de açaí, com frontend em HTML/CSS/JavaScript puro, backend Node.js + Express 5 e banco PostgreSQL. O cliente monta o açaí, informa a entrega, registra o pedido no banco e recebe um resumo pré-preenchido no WhatsApp para enviar manualmente. Não há pagamento online com provedor; para Pix, a loja pode cadastrar a chave no painel (Funcionamento) e o cliente recebe o valor e o código “Pix copia e cola” depois do pedido. Pedidos têm limite anti-spam (20 por IP e 6 por telefone a cada hora).

## Requisitos
- Node.js 20 ou superior
- PostgreSQL (local ou hospedado, por exemplo Neon)
- Conta de hospedagem Node.js (por exemplo Render)

## Executar localmente
1. Instale Node.js 20+ e tenha um banco PostgreSQL criado.
2. Crie um arquivo local chamado `.env` na pasta principal e preencha `NODE_ENV`, `PORT`, `DATABASE_URL`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `DEV_EMAIL`, `DEV_PASSWORD` e `WHATSAPP_NUMBER`. Copie o `.env.example` (só nomes de variáveis, sem valores) para `.env` e preencha; mantenha o `.env` fora do ZIP e do repositório.
3. Na pasta do projeto, execute `npm install`.
4. Execute `npm start` (ou `npm run dev` durante o desenvolvimento).
5. Abra `http://localhost:3000`. O painel da loja fica em `http://localhost:3000/admin` e o painel do desenvolvedor em `http://localhost:3000/dev`.
6. Rode os testes com `npm test`.

O schema e os dados iniciais são criados de forma idempotente quando o servidor inicia e `DATABASE_URL` está configurada. O usuário administrativo inicial é criado se `ADMIN_EMAIL` e `ADMIN_PASSWORD` estiverem definidos antes da primeira inicialização. Se já existir um administrador com o mesmo e-mail, a senha não é sobrescrita automaticamente.

## Deploy no Render + Neon
1. Crie um banco PostgreSQL no Neon e copie a connection string (use SSL).
2. Publique esta pasta em um repositório Git, ou use o método de deploy aceito pelo seu serviço de hospedagem.
3. No Render, crie um Web Service com ambiente Node. Build command: `npm install`. Start command: `npm start`.
4. Cadastre as variáveis `NODE_ENV=production`, `DATABASE_URL`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `DEV_EMAIL`, `DEV_PASSWORD` e `WHATSAPP_NUMBER` no painel do Render. Não envie `.env` ao repositório.
5. Faça o deploy e confira `/api/health`. Para monitorar também o banco (ex.: UptimeRobot), use `/api/health/db`; não o configure como health check do Render, porque o Neon suspende o banco quando ocioso e a primeira consulta pode demorar.
6. Configure o domínio personalizado nas configurações do serviço e siga as instruções de DNS fornecidas pelo Render. Para domínio `.com.br`, o registro e a renovação são feitos pelo registrador escolhido.

## Funcionalidades
- Cardápio e preços carregados do PostgreSQL.
- Personalização de açaí com até cinco acompanhamentos grátis por item e no máximo uma calda grátis por item.
- Adicionais pagos, mousses e quantidade de 1 a 20 por item.
- Cálculo de preço no servidor, inclusive taxa de entrega por bairro.
- Pedido imediato quando a loja está aberta ou agendamento com antecedência mínima dentro do horário de funcionamento. No agendamento o cliente escolhe **Dia** e **Horário** entre as opções que o servidor oferece (`GET /api/schedule-slots`: só os dias marcados e o horário da aba Funcionamento, de 15 em 15 min, até 14 dias à frente). O servidor valida de novo com a mesma regra ao criar e ao editar o pedido, então dia ou horário fechado é recusado mesmo que alguém altere a requisição.
- Registro do pedido no banco com código único `AR-XXXXXX` e abertura do WhatsApp com texto pré-preenchido.
- Avaliações públicas somente após moderação.
- Painel administrativo com autenticação JWT que expira (7 dias por padrão; ajuste com `ADMIN_TOKEN_TTL`, ex.: `12h`) e bloqueio temporário após 5 senhas erradas por IP (ou 20 por e-mail) em 15 minutos, atualização automática de pedidos, preços e disponibilidade de produtos/tamanhos/opções, bairros/taxas, avaliações, cupons, configurações, auditoria e backup/restauração.
- Relatórios de vendas com resumo de hoje, semana atual e mês atual, além de períodos de 7, 30 e 90 dias, ticket médio, quantidade de pedidos e tamanhos mais vendidos.
- Cupons públicos com desconto percentual ou fixo, subtotal mínimo e validação de preço no servidor.
- Cliente pode repetir um pedido anterior pelo acompanhamento, adicionando novamente ao carrinho apenas itens ainda disponíveis.
- Promoção automática de combo: desconto configurável quando o carrinho atinge a quantidade mínima de açaís.
- Previsão de preparo/entrega configurável no painel e exibida no checkout, acompanhamento e resumo do WhatsApp (é uma estimativa, não rastreamento GPS).
- Programa de fidelidade: 1 ponto por real em produtos, creditado uma única vez quando o pedido é marcado como entregue; o cliente consulta o saldo com código do pedido e telefone.
- Opção de salvar nome, telefone, endereço e bairro apenas no armazenamento local do próprio aparelho, mediante consentimento.
- PWA instalável, com ícone próprio e cache da estrutura visual para abertura básica offline; pedidos e APIs ainda exigem internet.
- Atalho de carrinho fixo em telas pequenas, destaque promocional e identidade visual refinada.
- Página de privacidade, validação no servidor e headers básicos de segurança.

## Painel do desenvolvedor (`/dev`)
- Acesso pelo link “Desenvolvedor” no rodapé da loja ou direto em `/dev`. Conta própria, criada por `DEV_EMAIL` e `DEV_PASSWORD` (10+ caracteres); trocar a senha na variável de ambiente e reiniciar atualiza a conta. Sem as duas variáveis, o `/dev` não aceita login.
- Sessão de 12 h por padrão (`DEV_TOKEN_TTL`, ex.: `2h`) e bloqueio temporário após 5 senhas erradas por IP (ou 10 por e-mail) em 15 minutos. O token do desenvolvedor não abre a API da loja e o da loja não abre a do desenvolvedor.
- **Visão geral:** saúde do banco (latência, tamanho, conexões), versão publicada, tempo no ar, memória, contagens e quais variáveis de ambiente estão configuradas (nunca os valores secretos).
- **Erros:** erros da tela dos clientes e do servidor, com filtro, busca, ranking dos mais frequentes, detalhes com rastro (stack) e exclusão individual ou da lista inteira.
- **Auditoria:** logins e alterações do painel da loja e do próprio `/dev`, com filtro por painel e busca.
- **Backup:** download, validação e restauração (com confirmação digitada).
- **Contas da loja:** lista, cria e redefine a senha de quem entra em `/admin`.

## Segurança extra (rodada 4)
- **Troca de senha encerra as sessões:** ao redefinir a senha de uma conta da loja no `/dev` (ou ao mudar `DEV_PASSWORD`), todos os tokens antigos dessa conta deixam de valer na hora, em qualquer aparelho. Conta excluída também perde o acesso. O servidor confere isso no banco a cada requisição dos painéis.
- **Content-Security-Policy:** o navegador só executa scripts do próprio site (mais os scripts inline de tema, liberados por hash calculado sozinho a partir dos `.html`). Isso barra scripts injetados e protege os tokens do painel. Fontes do Google Fonts continuam liberadas. Se algo legítimo aparecer bloqueado no console do navegador, use `CSP_REPORT_ONLY=true` para o CSP só avisar enquanto você investiga; se criar um `<script>` inline novo num `.html`, nada a fazer (o hash é recalculado ao iniciar), mas scripts devem ficar em `public/js/`.

## Atenção: revise antes de operar
- **Taxas e bairros iniciais são exemplos editáveis**, não uma confirmação das taxas comerciais reais. Revise em `/admin` antes de receber pedidos.
- O item “1 copo especial” de R$ 35 foi mantido porque o tamanho/capacidade não foi especificado. Renomeie ou desative em “Cardápio e preços” se necessário.
- Horário inicial: terça a domingo, 13h30–22h; segunda-feira fechada.
- O número inicial do WhatsApp é `5521969081157`; confirme se pertence à loja.
- A política de privacidade contém campos que precisam ser completados com o responsável legal e o contato real.
- O fechamento manual bloqueia pedidos imediatos, mas permite agendamento em horário de funcionamento.
- O cliente só pode editar ou cancelar pelo site enquanto o pedido está **Recebido**. Depois que a loja marca **Preparando**, o site mostra um botão para combinar a mudança pelo WhatsApp. O WhatsApp abre uma mensagem e o cliente precisa apertar “Enviar”. Não há integração de pagamento online.

## Segurança operacional
- Use uma senha administrativa forte e um `JWT_SECRET` aleatório com 32+ caracteres. A sessão do painel expira em 7 dias por padrão (ajuste com `ADMIN_TOKEN_TTL`, ex.: `12h`) e o login bloqueia temporariamente após 5 senhas erradas por IP (ou 20 por e-mail) em 15 minutos. O token fica no navegador até expirar ou até clicar em **Sair**; não use o painel em dispositivos compartilhados.
- Erros, auditoria e backup ficam só no **painel do desenvolvedor** (`/dev`), com login separado do painel da loja. O painel da loja registra logins e mutações, e o `/dev` mostra tudo na aba “Auditoria”, sem gravar o corpo das requisições.
- Exclusões de produtos e pedidos exigem confirmação no painel. Exclusão de pedido é permanente; faça backup antes.
- Preços, adicionais, descontos, cupons e frete são recalculados/validados no servidor; os valores enviados pelo navegador não são usados como fonte de verdade.
- A aba “Backup” do `/dev` exporta JSON com pedidos, contas de clientes (com hash de senha), favoritos, clientes derivados dos pedidos, cardápio, bairros, configurações, cupons, avaliações e pontos. Também valida e restaura um arquivo desse formato em transação. A restauração substitui os dados operacionais atuais, preserva administradores e auditoria e deve ser usada com cuidado.
- O backup JSON é manual e deve ser baixado e guardado fora do servidor. Ele não substitui o backup automático do provedor PostgreSQL; habilite/ confira a política de backup do Neon ou do provedor escolhido.
- Proteja os arquivos de backup: eles contêm dados pessoais de clientes. Não os envie a repositórios públicos nem os compartilhe sem necessidade.
- O histórico de auditoria é interno e não é incluído no backup operacional; mantenha também os backups nativos do banco para recuperação completa do ambiente.

## Estrutura
```text
public/
  index.html
  manifest.webmanifest
  service-worker.js
  admin.html
  dev.html
  privacidade.html
  css/styles.css
  js/site/*.js   (site do cliente, dividido por assunto; carregados em ordem, main.js por último)
  js/admin/*.js            (painel admin, dividido por assunto; main.js por último)
  js/dev/*.js              (painel do desenvolvedor; main.js por último)
  js/admin-inventory/*.js  (painel de estoque; events.js por último)
src/
  server.js      (liga o app ao banco e abre a porta)
  app.js         (createApp: monta o Express)
  services/pricing.js  (preço do pedido: item, combo, cupom, frete, total)
  db/pool.js
  db/init.js
  middleware/auth.js
  routes/public.js
  routes/orders.js
  routes/admin.js
  routes/dev.js
  services/store.js
  services/store.test.js
  services/promotions.js
  services/promotions.test.js
tests/routes.test.js   (testes de rota: Express + Postgres de teste)
.github/workflows/ci.yml
.env.example  .prettierrc.json  .prettierignore  eslint.config.js
PROGRESSO.md
```


## Desenvolvimento: formatação, lint e testes
- `npm install` instala também as ferramentas de desenvolvimento (Prettier, ESLint, supertest).
- `npm run format` formata o código (rode uma vez antes do primeiro commit; depois `npm run format:check` só confere). `npm run lint` roda o ESLint.
- `npm test` roda os testes unitários. Os testes de rota (`tests/routes.test.js`) usam Postgres de verdade e só rodam com `TEST_DATABASE_URL` definida, apontando para um banco **com "test" no nome** (eles recusam qualquer outro). Ex.: `createdb acai_test` e `TEST_DATABASE_URL=postgres://usuario:senha@localhost:5432/acai_test npm test`.
- O GitHub Actions (`.github/workflows/ci.yml`) roda formatação, lint e todos os testes, com um Postgres de teste, a cada push e pull request.

## Conta do cliente

- Clientes podem criar conta e entrar usando celular com DDD e senha (mínimo 8 caracteres). As senhas são armazenadas com hash bcrypt.
- Os pedidos feitos enquanto a pessoa está autenticada ficam associados à conta e aparecem em **Minha conta → Meus pedidos**. O telefone do checkout deve ser igual ao celular cadastrado.
- Pedidos antigos não são vinculados automaticamente, para não expor dados privados só com base no número de telefone.
- A sessão do cliente usa token JWT persistido no navegador por até 30 dias; sair remove o token local. Alterar senha não revoga automaticamente tokens existentes.
- Não há confirmação por SMS nem recuperação de senha nesta versão. Antes de divulgar publicamente, planeje uma forma segura de verificar a posse do celular e recuperar contas.


## Proteções adicionadas (01/11/2026, rodada 1)
- Consulta, edição e cancelamento de pedido: após 8 tentativas erradas no mesmo código (ou 30 por IP) em 15 minutos, o site responde 429 e pede para aguardar ou falar com a loja. Só falhas contam; uso normal nunca é bloqueado. Os contadores ficam na memória do servidor (reiniciar o serviço os zera).
- Códigos de pedido (`AR-XXXXXX`) são sorteados com gerador criptográfico e sem caracteres ambíguos (0/O, 1/I).
- Conexão com o banco usa SSL **com verificação do certificado**. Se o provedor usar certificado próprio, defina `DATABASE_SSL_INSECURE=true` (não recomendado). Conexões ociosas derrubadas pelo provedor não derrubam mais o servidor.
- Edição de pedido revalida estoque e horário de agendamento, roda em transação e, para Pix, gera um novo código com o valor atualizado.
- O carrinho mostra o frete e o total com entrega assim que o bairro é escolhido.

## Variáveis opcionais (Rodada 2)
- `SITE_URL`: endereço público do site, sem barra no final (ex.: `https://acai-da-roca.onrender.com` ou o domínio próprio). Usado em canonical, prévia de compartilhamento (og:), `sitemap.xml` e `robots.txt`. Se faltar, o servidor usa o endereço da própria requisição.
- `CLOUDINARY_URL`: `cloudinary://API_KEY:API_SECRET@CLOUD_NAME`. Com ela, as fotos das avaliações vão para o Cloudinary (plano gratuito) e o banco guarda só o endereço. Sem ela, as fotos continuam sendo guardadas no banco. Depois de definir, abra Painel → Avaliações e use “Mover fotos para o armazenamento” para levar as fotos antigas.

## SEO e loja só de entrega
- A loja não tem endereço público: o JSON-LD da página usa `areaServed` (Teresópolis) e `sameAs` (Instagram). O `/admin` e a `/api` saem do Google (`noindex` e `X-Robots-Tag`). Para aparecer em buscas locais, crie um Perfil da Empresa no Google marcando “só entrega” (sem exibir endereço).
- Prévia de link (WhatsApp/Instagram) usa `/images/icon-512.png`; troque por uma foto 1200×630 quando houver.

## Backup (o que mudou)
- A exportação é escrita tabela por tabela. A restauração ainda lê o arquivo inteiro (limite de 10 MB); com as fotos fora do banco, o arquivo fica pequeno.
- Backups antigos (sem `customer_accounts`) continuam restauráveis: as contas atuais são mantidas, mas os pedidos antigos ficam sem vínculo com elas.

## Monitoramento e atualizações (rodada 3)
- **Monitor externo (UptimeRobot, grátis):** crie um monitor "HTTP(s)" em `https://SEU-SITE/api/health/db`, intervalo de 5 minutos, com aviso por e-mail e/ou app. Se o banco ou o servidor cair, você é avisado. Atenção: checar o banco a cada 5 minutos mantém o Neon acordado e pode gastar horas do plano gratuito; se isso for problema, monitore `/api/health` (só o servidor).
- **Erros da tela e do servidor:** erros de JavaScript no aparelho do cliente (e erros 500 do servidor) são gravados na tabela `client_errors` (30 dias) e aparecem no painel, na aba **Erros**. O topo do painel mostra um aviso quando houve erro nas últimas 24 h.
- **Aviso de "sem pedidos":** com a loja aberta há mais de 3 h e nenhum pedido (não cancelado) nesse tempo, o painel mostra um aviso. Mude o prazo com `ALERT_NO_ORDERS_HOURS`.
- **Nova versão:** cada deploy gera um identificador (`RENDER_GIT_COMMIT`, definido pelo próprio Render). O servidor troca os `?v=` dos arquivos e o nome do cache do PWA por esse identificador, então **não é mais preciso mudar números de versão à mão**. Quem está com o site aberto recebe o aviso "Nova versão disponível" (botão **Atualizar agora**); na loja, se a tela estava em segundo plano, ela atualiza sozinha quando o cliente volta. Sem `RENDER_GIT_COMMIT` (computador local), o identificador muda a cada reinício do servidor.

## Histórico de pedidos
Pedidos nunca são apagados automaticamente: ficam no banco por tempo indeterminado (só somem se alguém usar "Excluir" no painel). Na aba **Pedidos** a lista mostra 50 por vez, com **Carregar mais**, busca por código, nome, telefone ou bairro, filtro por status e por período (datas no fuso de São Paulo) e o botão **Baixar planilha (CSV)**, que exporta tudo o que corresponde aos filtros atuais (até 20 mil linhas; separador `;`, abre direto no Excel).
