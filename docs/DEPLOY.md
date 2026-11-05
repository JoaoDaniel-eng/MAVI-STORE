# Checklist de implantação (Render + Neon)

Nada deste projeto foi executado em ambiente real até aqui. Siga na ordem e use o `ROTEIRO-DE-TESTES.md` antes de abrir a loja.

## 1. Contas
GitHub, Neon (banco), Render (hospedagem), um domínio, Cloudflare R2 ou S3 compatível (imagens), Resend (e-mail), Melhor Envio (frete) e Mercado Pago **ou** Asaas (pagamentos). Comece pelos ambientes de teste (sandbox) de cada serviço.

## 2. Banco (Neon)
Crie o projeto e copie a string de conexão (termina em `?sslmode=require`). Ela é o `DATABASE_URL`.

## 3. Domínio e cookies
Use o mesmo domínio raiz para loja e API, por exemplo `www.sualoja.com.br` (loja) e `api.sualoja.com.br` (API). Assim o login por cookie funciona. Em produção:
`CORS_ORIGIN=https://www.sualoja.com.br`, `COOKIE_DOMAIN=.sualoja.com.br`, `SITE_URL=https://www.sualoja.com.br`, `API_PUBLIC_URL=https://api.sualoja.com.br`, `VITE_API_URL=https://api.sualoja.com.br` (esta no serviço da loja).

## 4. Render
Suba o repositório no GitHub (com o `package-lock.json`: rode `npm install` uma vez e faça commit). No Render: New → Blueprint → aponte para o repositório. O `render.yaml` cria: API, loja (site estático), cron de reservas e e-mails (a cada minuto) e cron de manutenção (diário). Preencha as variáveis marcadas como "sync: false". A API aplica as migrations ao iniciar.

| Variável | Onde | Observação |
|---|---|---|
| `DATABASE_URL` | API e crons | Neon |
| `JWT_ACCESS_SECRET` | API (gerada) e crons | **mesmo valor** nos crons |
| `CORS_ORIGIN`, `COOKIE_DOMAIN`, `SITE_URL`, `API_PUBLIC_URL` | API | ver item 3 |
| `VITE_API_URL` | Loja | URL pública da API |
| `STORAGE_*` (5 variáveis) | API | item 6 |
| `MELHOR_ENVIO_TOKEN`, `MELHOR_ENVIO_CONTACT_EMAIL`, `MELHOR_ENVIO_ENV` | API | item 7 |
| `EMAIL_API_KEY`, `EMAIL_FROM` | API e cron de e-mails | item 8 |
| `PAYMENT_GATEWAY` + chaves do gateway | API | item 9 |
| `ORDER_RETENTION_YEARS` | cron de manutenção | confirme com a contabilidade |

## 5. Primeira proprietária
No shell do serviço da API: `OWNER_PASSWORD='uma-senha-com-10+-caracteres' node apps/api/dist/create-owner.js email@sualoja.com.br "Nome Completo"`. Depois entre em `/entrar` e acesse `/admin`.

## 6. Imagens (R2)
Crie o bucket, deixe-o com leitura pública (domínio próprio ou `r2.dev`) e gere chaves S3. Defina `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_ENDPOINT` e `STORAGE_PUBLIC_URL`. Configure o CORS do bucket:
```json
[{"AllowedOrigins":["https://www.sualoja.com.br"],"AllowedMethods":["PUT"],"AllowedHeaders":["Content-Type"],"MaxAgeSeconds":3600}]
```

## 7. Frete
Gere o token no Melhor Envio (comece no sandbox com `MELHOR_ENVIO_ENV=sandbox`), informe um e-mail de contato e preencha o **CEP de cada unidade** em Configurações → Unidades. Todo produto ativo precisa de peso e medidas.

## 8. E-mails
Verifique o domínio no Resend e use um remetente desse domínio em `EMAIL_FROM`. Até configurar, os e-mails ficam na fila e saem depois.

## 9. Pagamentos
Escolha `PAYMENT_GATEWAY`, informe as chaves, cadastre a URL de `Configurações → Integrações` (webhook) no painel do gateway e só então ative Pix e cartão em Configurações → Regras. Teste tudo no sandbox. Pagar na retirada não depende de gateway.

## 10. Conteúdo
Unidades (endereço, horários, WhatsApp) → categorias, cores, tamanhos, guia de medidas (medidas reais) → produtos, variações e fotos → estoque inicial → página inicial → páginas `termos`, `privacidade`, trocas (use os modelos em `docs/` e **revise com um advogado**).

## 11. Antes de abrir
- Rode o roteiro de testes completo no ambiente de teste.
- Se usou dados de demonstração: `npm run clean:demo -w apps/api`.
- Troque as senhas de teste, confira os CEPs, o prazo de reserva e o limite de baixo estoque.
- Faça um pedido real de baixo valor de ponta a ponta (pagamento, separação, retirada/envio).
