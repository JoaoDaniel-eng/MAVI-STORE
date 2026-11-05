# Roteiro de testes

Nenhuma parte do sistema foi executada pelo autor, exceto os testes automatizados de funções puras (`npm test`: CPF, permissões, CSV, período de relatório, slug). Marque cada item ao testar.

## Preparação
1. `npm install` (commite o `package-lock.json`), `cp apps/api/.env.example apps/api/.env`, preencha `DATABASE_URL` e `JWT_ACCESS_SECRET`.
2. `npm test` · `npm run typecheck` · `npm run build` (devem passar; corrija o que falhar).
3. `npm run migrate -- up`, depois `down all` e `up` de novo.
4. `OWNER_PASSWORD=... npm run create-owner -w apps/api -- email "Nome"` · `npm run seed:demo -w apps/api -- --yes` · `npm run dev`.

## Segurança (use curl)
- [ ] `POST /api/auth/login` sem o cabeçalho `X-Requested-With: mavi` → 403.
- [ ] 6 logins errados seguidos bloqueiam a conta por 15 min.
- [ ] `/api/admin/orders` sem login → 401; com cliente logada → 403.
- [ ] Funcionário não acessa `/api/admin/settings/...` nem relatórios (403).
- [ ] `GET /api/status/integrations` sem login → 401.
- [ ] Webhook com assinatura/token errado → 401.

## Loja
- [ ] Home, categoria, filtros (cor+tamanho+em estoque juntos), ordenação, busca, paginação.
- [ ] Produto: troca de cor muda fotos; tamanho esgotado desabilitado; guia de medidas.
- [ ] Favoritos (visitante e logada, sincronização ao entrar).
- [ ] Sacola: quantidade acima do estoque é bloqueada; cupom válido/inválido/expirado/limite.

## Estoque (concorrência)
- [ ] Dois navegadores finalizando a **última unidade** ao mesmo tempo: só um pedido é criado, o outro recebe "estoque insuficiente".
- [ ] Reserva expira (prazo curto de teste) e libera o estoque; pedido sem pagamento vira cancelado.
- [ ] Saída maior que o disponível, ajuste abaixo do reservado e transferência sem saldo são recusados.

## Pedido e retirada
- [ ] Ative só "Pagar na retirada": pedido de retirada nasce confirmado e baixa o estoque.
- [ ] Separar → pronto para retirada (e-mail na fila) → entregar com o código certo (e com o errado, recusa) → pagamento recebido registrado.
- [ ] Cancelar pedido confirmado devolve estoque e cupom.

## Frete (sandbox do Melhor Envio)
- [ ] Sem token: "Cotação indisponível". Com token e CEP da unidade: opções e preços conferem com o site da transportadora.
- [ ] Frete escolhido é recotado no servidor ao concluir.

## Pagamentos (sandbox)
- [ ] Pix: gera código/QR; ao pagar, a página do pedido atualiza e o pedido confirma.
- [ ] Reenviar o mesmo webhook 2× não duplica nada (tabela `payment_events`).
- [ ] Webhook com valor diferente não confirma (auditoria registra).
- [ ] Cartão abre a página do provedor e volta para o pedido.

## Conta, e-mails, avaliações
- [ ] Cadastro envia link de confirmação; recuperar senha funciona e encerra sessões.
- [ ] Com `EMAIL_API_KEY`/`EMAIL_FROM`, a fila é enviada (veja `email_outbox`).
- [ ] Avaliação só após pedido entregue; aparece só depois de aprovada.

## Painel
- [ ] Criar produto → variações → fotos → ativar (erro lista o que falta) → aparece na loja.
- [ ] Resumo bate com o relatório de vendas do mesmo período.
- [ ] Relatórios CSV abrem corretos no Excel (acentos, vírgula decimal).
- [ ] Perfis: Funcionário, Gerente e Proprietária veem só o que devem.

## Privacidade
- [ ] Cliente baixa seus dados; exclui a conta (some login, favoritos, avaliações; pedidos ficam sem vínculo).
- [ ] Exportação/anonimização pelo painel (só Proprietária) e registro na auditoria.
- [ ] `npm run maintenance -w apps/api` roda sem erro.

## Encerramento
- [ ] `npm run clean:demo -w apps/api` remove os dados de demonstração (o que tiver pedido é arquivado e listado).
