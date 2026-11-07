# Cupom de primeira compra (5%, uso único)

Feito em 3 partes. Cada parte vem com o projeto completo.

## Parte 1 — banco de dados e geração do cupom (esta entrega)
- `coupons` ganhou: `kind` ('manual' ou 'welcome'), `customer_id` (dono), `used_at`, `used_order_id`.
  Índice único: no máximo 1 cupom de boas-vindas por conta. A migração roda sozinha no próximo deploy (`init.js`).
- `src/services/welcomeCoupon.js`: gera o código (`BEMVINDO-XXXXXX`) e emite o cupom de 5%.
  Só ganha quem **nunca fez pedido** com aquele telefone (é cupom de *primeira* compra).
- `POST /api/customers/register` agora devolve `welcomeCoupon` (ou `null`). Se a criação do cupom falhar, o cadastro continua normal.
- `GET /api/customers/me/coupons` (logado): lista o cupom da conta com `status` = `available` | `used` | `inactive`.
- Painel → Cupons: continua mostrando só os cupons da loja (os pessoais dos clientes não aparecem na lista).
- Backup/restauração: inclui as colunas novas; cupom pessoal só volta se a conta do dono voltar.

## Parte 2 — regra de uso único (esta entrega)
- **Quem pode usar:** cupom pessoal só vale para a conta dona. Visitante recebe "Este cupom é pessoal. Entre na sua conta para usá-lo."; outra conta recebe "Cupom inválido ou indisponível." (igual a um código que não existe, para ninguém descobrir códigos alheios).
- **Uso único:** o pedido e a marcação do cupom como usado (`used_at`, `used_order_id`) acontecem na **mesma transação**, com `UPDATE ... WHERE used_at IS NULL`. Dois pedidos ao mesmo tempo com o mesmo cupom: só um passa; o outro recebe "Este cupom já foi usado." e nada é gravado.
- **Desconto:** 5% sobre o subtotal já sem o desconto de combo, nunca sobre a entrega. `GET /api/coupons/validate` e `POST /api/orders` usam o mesmo cálculo.
- **O cupom volta ao cliente quando** o pedido é cancelado pelo cliente (site), cancelado no painel, apagado no painel sem ter sido entregue, ou editado de modo que o cupom saia do pedido. Pedido **entregue** e depois apagado mantém o cupom como usado.
- **Editar pedido:** o cupom pessoal já preso ao pedido continua valendo e o 5% é recalculado sobre o novo subtotal (mesmo que a loja o tenha desativado depois).
- Testes: `welcomeCoupon.test.js` (regras puras) e `tests/routes.test.js`, bloco "cupom de primeira compra (uso único)" (precisa de `TEST_DATABASE_URL`).
## Parte 3 — mensagem no site, "Meus cupons" e painel (em andamento, feita em 3 etapas)
- **Etapa 3.1 — mensagem no site após o cadastro (esta entrega):** ao criar a conta e ganhar o cupom, a área "Minha conta" mostra um aviso com o código (`BEMVINDO-XXXXXX`), o botão "Copiar código" e o botão "Usar na minha primeira compra" (coloca o código no campo de cupom do pedido; se já houver itens no carrinho, aplica na hora). O aviso pode ser fechado e some ao sair da conta. Quem não tem direito ao cupom (já tinha pedido) não vê aviso nenhum. Arquivos: `public/index.html`, `public/js/site/account.js`, `public/css/styles.css`.
- **Etapa 3.2 — tela "Meus cupons" (esta entrega):** novo cartão "🎟️ Meus cupons" em "Minha conta" (e item no menu lateral) que lista os cupons da conta via `GET /api/customers/me/coupons`, com selo **Disponível**, **Já usado** (com a data) ou **Indisponível**. Cupom disponível tem "Copiar código" e "Usar no pedido" (mesmo comportamento do aviso da etapa 3.1). A lista se atualiza sozinha: ao entrar, depois de fazer um pedido, ao cancelar no site, a cada 30 s e ao voltar para a aba, então o cupom devolvido por cancelamento reaparece como Disponível. Sem cupons, mostra uma mensagem explicando quem ganha. Arquivos: `public/index.html`, `public/js/site/account.js`, `sidemenu.js`, `live.js`, `tracking.js`, `public/css/styles.css`.
- **Etapa 3.3 — visão no painel admin (em andamento, feita em 2 entregas):**
  - **3.3a — servidor (esta entrega):** nova rota `GET /api/admin/coupons/welcome` (só leitura, exige login do painel). Devolve `{ summary, coupons, truncated }`: `summary` = totais de todos os cupons de boas-vindas (`total`, `available`, `used`, `inactive`, sem filtro); cada cupom traz `code`, `percent`, `status` (`available` | `used` | `inactive`), `createdAt`, `usedAt`, o dono (`customer`: `id`, `name`, `phone`) e o pedido (`order`: `id`, `code`, `status`). Filtros: `status`, `q` (código do cupom, nome, telefone ou código do pedido) e `limit` (padrão 200, máx. 500; `truncated` avisa se havia mais). `orderDeleted: true` = o cupom consta como usado mas o pedido foi apagado (pedido entregue e depois apagado mantém o cupom usado, regra da Parte 2).
  - **Travas:** `PATCH` e `DELETE /api/admin/coupons/:id` agora só mexem em cupom manual da loja; em cupom de boas-vindas respondem 403 ("Cupons de boas-vindas são automáticos…"). `POST /api/admin/coupons` recusa código começando com `BEMVINDO-` (reservado), para a loja não criar um manual que imita o automático. `GET /api/admin/coupons` continua listando só os manuais.
  - Só mudaram `src/routes/admin.js`, `src/services/welcomeCoupon.js` e os testes. Sem mudança de banco. O painel (tela) ainda não usa a rota: vem na 3.3b.
  - **3.3b — tela do painel (próxima entrega):** seção "Cupons de boas-vindas" na aba Cupons (`admin.html`, `public/js/admin/coupons.js`, CSS), atualização do `?v=` e do cache do PWA.
