// Geliştirme sunucusu (doğru MIME türleriyle: .wasm, .glb, .mjs). Kullanım: npm run serve [port]
import { serve } from './lib/cdp.mjs';
const port = Number(process.argv[2] ?? 8000);
const server = await serve();
server.close();
const { createServer } = await import('node:http');
// serve() rastgele port kullanır; sabit port için aynı işleyiciyi yeniden bağla
const handler = server.listeners('request')[0];
createServer(handler).listen(port, '0.0.0.0', () => console.log(`İçGör: http://localhost:${port}/  (aynı ağdaki telefon için bilgisayarın IP adresini kullanın; kamera için HTTPS gerekir)`));
