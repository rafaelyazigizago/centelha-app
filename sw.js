// Centelha · service worker: sempre tenta a versão nova da rede; sem internet, abre a última guardada.
// Os dados (Supabase) nunca passam por aqui: só os arquivos da página.
const VERSAO = 'centelha-2026-10-21-3';
const ARQUIVOS = [
  './', 'index.html', 'estilo.css', 'manifest.webmanifest',
  'app.js', 'datas.js', 'calculos.js', 'dados.js', 'estado.js', 'preferencias.js', 'ui.js', 'telas.js', 'tela-tarefa.js', 'tela-diario.js', 'tela-grupos.js',
  'fontes/atkinson-hyperlegible-latin-400-normal.woff2', 'fontes/atkinson-hyperlegible-latin-700-normal.woff2',
  'fontes/bricolage-grotesque-latin-700-normal.woff2', 'fontes/bricolage-grotesque-latin-800-normal.woff2',
  'fontes/lexend-latin-400-normal.woff2', 'fontes/lexend-latin-600-normal.woff2',
  'vendor/supabase-2.117.2.js', 'icones/icone-192.png', 'icones/icone-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== VERSAO).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const pedido = e.request;
  if (pedido.method !== 'GET' || new URL(pedido.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(pedido)
      .then((resposta) => {
        if (resposta.ok) {
          const copia = resposta.clone();
          caches.open(VERSAO).then((c) => c.put(pedido, copia));
        }
        return resposta;
      })
      .catch(() => caches.match(pedido, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
  );
});
