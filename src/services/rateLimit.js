// Limite de tentativas por chave (IP, e-mail, telefone...), em memória.
// Diferente do limitador das avaliações, aqui quem decide o que conta é o chamador:
//   isBlocked() consulta sem contar, record() registra uma ocorrência e reset() zera a chave.
// Assim o login só conta tentativas erradas e o pedido só conta pedidos criados.
// Fica na memória do servidor: reiniciar o serviço zera os contadores.
export function createAttemptLimiter({ max = 5, windowMs = 15 * 60 * 1000 } = {}) {
  const hits = new Map();
  const recent = (key, now) => (hits.get(key) || []).filter(t => now - t < windowMs);
  return {
    isBlocked(key, now = Date.now()) {
      return recent(key, now).length >= max;
    },
    // Segundos até a chave voltar a ser aceita (0 se não está bloqueada).
    retryAfterSeconds(key, now = Date.now()) {
      const list = recent(key, now);
      if (list.length < max)
        return 0;
      return Math.max(1, Math.ceil((list[list.length - max] + windowMs - now) / 1000));
    },
    record(key, now = Date.now()) {
      if (hits.size > 5000)
        for (const [k, list] of hits)
          if (!list.some(t => now - t < windowMs))
            hits.delete(k);
      const list = recent(key, now);
      list.push(now);
      hits.set(key, list);
    },
    reset(key) { hits.delete(key); }
  };
}
