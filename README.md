# MAVI

Monorepo: `apps/web` (React + TS + Vite), `apps/api` (Node + Express + TS), `packages/shared` (tipos e schemas Zod).

## Rodar localmente
```bash
npm install                      # gera o package-lock.json (commite-o)
cp apps/api/.env.example apps/api/.env   # preencha DATABASE_URL (Neon)
npm run migrate -- up
npm run dev                      # web :5173, api :3001; /design mostra o design system
```

## Primeira proprietária (Fase 2)
```bash
OWNER_PASSWORD='senha-com-10+-caracteres' npm run create-owner -w apps/api -- email@loja.com "Nome Completo"
```
Em produção (shell do Render): `OWNER_PASSWORD=... node dist/create-owner.js email "Nome"`.

## API de autenticação
`POST /api/auth/register | login | refresh | logout`, `GET /api/auth/me`.
Painel: `GET/POST /api/admin/users`, `PATCH /api/admin/users/:id`, `GET /api/admin/audit-log`.
Catálogo (Fase 3), sob `/api/admin/catalog`: `categories`, `colors`, `sizes`, `size-guides`, `products`, `products/:id/skus/generate`, `skus/:id`, `uploads/presign`, `products/:id/images`, `images/:id`.
Estoque (Fase 4), sob `/api/admin/stock`: `GET /` (saldos), `/alerts`, `/movements`, `/reservations`, `POST /movements` (entrada/saída/ajuste), `POST /transfers`, `PUT /thresholds`. Configurações: `/api/admin/settings`.
Loja pública (Fase 5): `GET /api/store/home | categories | locations | products | products/:slug | products/by-ids | sitemap.xml`, favoritos da conta em `/api/store/favorites`. Home administrável: `/api/admin/content/home-sections`.
Checkout (Fase 6), sob `/api/store`: `POST cart/quote | shipping/quote | pickup/options | checkout/orders` (com `Idempotency-Key`), `GET checkout/options`, `GET orders/:id` (cabeçalho `x-order-token`). Painel: `/api/admin/coupons`, `/api/admin/locations` (CEP de origem, WhatsApp, horários).
Pagamentos (Fase 7): `POST/GET /api/store/orders/:id/payment` (Pix ou cartão hospedado), webhooks em `POST /api/webhooks/mercadopago|asaas`, painel em `/api/admin/payments` (`/events`, `/gateway` mostra a URL do webhook).
Operação e conta (Fase 8): painel `/api/admin/orders` (`GET`, `GET /:id`, `POST /:id/actions` com process|ship|ready|deliver|cancel|refund_done) e `/api/admin/reviews`; cliente em `/api/account` (perfil, senha, pedidos), `/api/auth/forgot-password|reset-password|verify-email`, avaliações em `/api/store/products/:slug/reviews`.
Toda escrita exige o cabeçalho `X-Requested-With: mavi` (proteção CSRF). Cookies httpOnly; em produção use web e api no mesmo domínio raiz.

## Migrations
`npm run migrate -- up | down [n|all] | status` (SQL em `apps/api/migrations`, runner próprio em `src/db/migrate.ts`).

## Deploy (Render)
`render.yaml` cria `mavi-api` (aplica migrations ao iniciar) e `mavi-web` (estático). Defina `DATABASE_URL` e `CORS_ORIGIN` no painel.

## Painel (Fase 9A)
Acesse `/admin` com uma conta da equipe (Proprietária, Gerente ou Funcionário). Telas: pedidos e retiradas, produtos (variações e imagens), categorias e atributos, estoque, cupons, página inicial e avaliações. O menu mostra só o que o perfil pode usar. Upload de imagens exige o storage configurado e CORS liberando PUT para o domínio do painel.

## Painel (Fase 9B)
Também em `/admin`: Resumo (dashboard com dados reais), Clientes, Páginas institucionais (públicas em `/p/:slug`), Relatórios CSV (vendas, itens, estoque, cupons, clientes; cada exportação é auditada) e Configurações (unidades, regras de estoque/frete/pagamento e estado das integrações). API: `/api/admin/dashboard`, `/api/admin/customers`, `/api/admin/reports/:tipo`, `/api/admin/content/pages`, `/api/store/pages`.

## Fase 10: privacidade, segurança, demo e implantação
- **LGPD:** na conta, a cliente baixa seus dados e exclui a conta (anonimização; pedidos ficam sem vínculo pelo prazo legal); a Proprietária atende pedidos de titulares em Clientes. Rotina diária (`maintenance`) limpa tokens/e-mails antigos e anonimiza pedidos encerrados após `ORDER_RETENTION_YEARS`. Aviso de armazenamento essencial na loja.
- **Segurança:** cabeçalhos HTTP e CSP no site (render.yaml), proteção CSRF, limites de requisição, `npm audit` no CI, links de redirecionamento só internos, status de integrações só para o painel.
- **Dados de demonstração:** `npm run seed:demo -w apps/api -- --yes` cria itens rotulados "(demo)"; `npm run clean:demo -w apps/api` remove (o que já tiver pedido é arquivado; `--keep-attributes` mantém cores e tamanhos).
- **Testes:** `npm test` (funções puras). O restante está no `docs/ROTEIRO-DE-TESTES.md`.
- **Documentos:** `docs/DEPLOY.md`, `docs/PENDENCIAS.md`, `docs/ROTEIRO-DE-TESTES.md` e modelos jurídicos (`docs/modelo-*.md`, revisar com advogado).

## Front
Rotas: `/`, `/catalogo`, `/categoria/:slug`, `/produto/:slug`, `/favoritos`. Em dev, o Vite encaminha `/api` para `localhost:3001`; em produção defina `VITE_API_URL`.

## E-mails
Os e-mails ficam numa fila (`email_outbox`) gravada junto com cada operação. Sem `EMAIL_API_KEY` e `EMAIL_FROM` eles ficam pendentes e saem quando o provedor for configurado (job `expire-reservations`, a cada minuto). Provedor: Resend.

## Pendências
- Padrões iniciais em `settings` (origem de entrega, estoque baixo, TTL da reserva) e unidade `alto` como origem: **confirmar**.
- Endereço e horários das unidades: preencher (colunas vazias).
- Mercado Pago, Asaas, Melhor Envio, e-mail e storage: **pendente** (sem credenciais). Ver `GET /api/status/integrations`.
- Storage de imagens e provedor de e-mail: definir (sugestão: Cloudflare R2 e Resend).
- Compra online (carrinho/checkout) e login do cliente: Fases 6 e 8. Favoritos ficam no aparelho até o login existir.
- SEO: metadados definidos no navegador; pré-visualização de links em WhatsApp/Facebook não lê JavaScript (exigiria pré-renderização). Sitemap em `/api/store/sitemap.xml` precisa de `SITE_URL`.
- Frete: precisa de `MELHOR_ENVIO_TOKEN`, `MELHOR_ENVIO_CONTACT_EMAIL` e do CEP de cada unidade (`PATCH /api/admin/locations/:id`). Sem isso: "cotação indisponível".
- Pagamento: `payments.enabled_methods` fica vazio até a Fase 7; enquanto isso o checkout não conclui pedidos.
- Pagamentos: defina `PAYMENT_GATEWAY` (mercadopago ou asaas), as credenciais do gateway, `API_PUBLIC_URL` e `SITE_URL`; cadastre a URL de `/api/admin/payments/gateway` como webhook no painel do gateway e ative os métodos em `payments.enabled_methods`. Pix/cartão só aparecem no checkout com o gateway completo; "pagar na retirada" não depende de gateway.
- Defina `stock.reservation_ttl_minutes` compatível com o prazo do Pix do gateway (pagamentos que chegam depois da reserva são tratados, mas podem exigir reembolso).
- Páginas de termos e privacidade: crie com os endereços `termos` e `privacidade` (o checkout e o cadastro passam a linkar). O texto jurídico precisa de revisão profissional.
- Lojista: defina `EMAIL_API_KEY`, `EMAIL_FROM` (domínio verificado) e `SITE_URL` para os links dos e-mails.
