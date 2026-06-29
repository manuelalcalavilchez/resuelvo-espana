const http = require('http');
const server = http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type': 'text/html'});
  res.end('<h1>Queen VIP Royal</h1><p>Server is working!</p>');
});
server.listen(3300, '0.0.0.0', () => {
  console.log('Server running on http://0.0.0.0:3300');
});
