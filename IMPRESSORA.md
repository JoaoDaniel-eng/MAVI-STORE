# Impressora térmica (POS-5890, 58 mm) no notebook da loja

O painel `/admin` imprime o cupom do pedido pelo navegador. Para sair sozinho, sem janela de confirmação, o Chrome precisa abrir com a opção `--kiosk-printing`.

## Montagem (Windows)
1. Ligue a impressora no notebook pelo cabo USB e ligue-a. Instale o **driver** dela (o anúncio não traz o driver: peça ao vendedor ou procure "driver POS-58 / POS-5890"). Ela precisa aparecer em *Configurações → Impressoras e scanners*. O driver "Genérico / Somente texto" não serve, porque o navegador imprime em modo gráfico.
2. Nas propriedades da impressora, escolha o papel de **58 mm** e deixe-a como **impressora padrão**.
3. Feche todas as janelas do Chrome. Crie um atalho do Chrome na área de trabalho, clique nele com o botão direito → Propriedades → no campo **Destino**, deixe assim (o caminho pode variar):
   `"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing "https://meu-acai.onrender.com/admin"`
4. Abra o Chrome **sempre por esse atalho**. Entre no `/admin`, vá em **Pedidos**, clique em **🖨️ Testar impressora** (deve sair um cupom de teste) e marque **"Imprimir pedido novo automaticamente"**.

## Uso no dia a dia
- Deixe o notebook na tomada, com o Chrome aberto e a janela **visível** (não minimizada). Em Configurações → Sistema → Energia, coloque para nunca suspender enquanto estiver na tomada.
- Clique uma vez na página depois de abrir, para o navegador liberar o som de novo pedido.
- Cada pedido novo imprime sozinho. Qualquer pedido pode ser impresso de novo com o botão **🖨️ Imprimir** na linha dele.
- A opção de imprimir sozinho fica guardada só nesse aparelho (cada computador liga a sua).

## Limites
- Só imprime pedidos que chegam **com o painel aberto**. Pedido que entrou com o notebook desligado ou suspenso não sai sozinho: use o botão "Imprimir".
- O painel confere pedidos novos a cada ~12 segundos, então pode haver um pequeno atraso.
- Pedido que o cliente edita depois não é impresso de novo automaticamente.
- Sem o `--kiosk-printing`, o Chrome abre a janela de impressão a cada pedido.
