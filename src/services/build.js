// Identificador da versão publicada. No Render, RENDER_GIT_COMMIT muda a cada deploy com código novo;
// sem ela (computador local), vale o momento em que o servidor iniciou.
export const BUILD_ID = String(process.env.RENDER_GIT_COMMIT || Date.now().toString(36)).replace(/[^\w.-]/g, '').slice(0, 12) || 'dev';
// Troca todos os "?v=..." dos arquivos pelo BUILD_ID: cada deploy invalida o cache do navegador sozinho.
export const stampVersions = (text, id = BUILD_ID) => text.replace(/\?v=[\w.-]+/g, `?v=${id}`);
export const stampServiceWorker = (text, id = BUILD_ID) => stampVersions(text, id).replace(/acai-da-roca-v[\w.-]+/, `acai-da-roca-v${id}`);
