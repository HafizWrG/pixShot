
const { createServer } = require('http');
const server = createServer((req, res) => {
    res.end('alive');
});
server.listen(3001, () => {
    console.log('Test server on 3001');
});
