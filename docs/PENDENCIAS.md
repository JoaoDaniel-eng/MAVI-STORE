# Pendências e decisões abertas

## Credenciais e contas (nada funciona de verdade sem elas)
- Storage de imagens (R2/S3), Melhor Envio, gateway (Mercado Pago ou Asaas), e-mail (Resend). Ver `DEPLOY.md`.

## Dados da loja
- CEP, endereço, telefone, WhatsApp e horários das duas unidades.
- Medidas reais do guia de medidas, fotos e descrições dos produtos.
- Textos de termos, privacidade e trocas (modelos em `docs/`, exigem revisão jurídica). Dados da empresa (razão social, CNPJ, encarregado de dados).

## Valores iniciais para confirmar
Unidade padrão de envio (Alto), limite de baixo estoque (3), prazo de reserva (15 min; alinhar ao prazo do Pix), prazo de retenção de pedidos (5 anos) e regra de origem do frete.

## Validar em ambiente de teste (escritos de memória, nunca executados)
Formato das APIs do Melhor Envio, Mercado Pago, Asaas e Resend; assinatura do webhook do Mercado Pago; configuração S3 para R2; todas as migrations; todas as telas.

## Limitações conhecidas
- Pedidos de entrega saem de uma unidade só (sem envio dividido).
- Reembolsos são feitos manualmente no gateway e registrados no painel.
- Favoritos sincronizam com a conta só depois do login.
- Pré-visualização de links (WhatsApp/Facebook) não mostra foto e título: o site é uma aplicação de página única. Exigiria pré-renderização.
- O limite de requisições conta em memória (uma instância). Com várias instâncias, trocar por armazenamento compartilhado.
- CPF fica guardado em texto no banco (necessário para pagamento e nota). Considere criptografia em repouso do banco e acesso restrito.
- Cadastro revela se um e-mail já existe (409); aceitável para loja, mas ciente.
- Sem análise de visitas nem anúncios. Se adicionar, será preciso pedir consentimento (LGPD).
- Cancelar pedido já enviado (devolução) não é tratado; só até "pronto para retirada".
- Pedido pago depois de cancelado manualmente vai para "reembolso pendente".
