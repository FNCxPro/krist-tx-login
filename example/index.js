const { Client } = require('../')
const ktx = new Client({
  key: process.env.KRIST_KEY,
  address: process.env.KRIST_ADDRESS,
  domain: process.env.KRIST_DOMAIN,
  amount: 1,
  port: 64641
})

ktx.on('connection', (ws, req) => {
  console.log('New connection from', req.connection.remoteAddress)
})
ktx.on('message', (ws, msg) => {
  console.log('New message from', ws._socket.remoteAddress, '!', msg)
})
ktx.on('pending', (id, address, ws) => {
  console.log('Login pending on address', address, 'on IP', ws._socket.remoteAddress)
})
ktx.on('authorized', (id, address, ws, tx) => {
  console.log('Login authorized for address', address, 'on IP', ws._socket.remoteAddress,'with transaction id', tx)
  ws.send({
    t: 'WELCOME',
    p: {
      whatever: 'custom',
      variables: 'you want',
      balance: 0
    }
  }) // this is required for normal lua client
})
ktx.on('refunded', (id, from, retAddr, value) => {
  console.log('Refunded a payment from', from, 'with id', id, ' refund was sent to', retAddr, 'value:', value)
})
ktx.on('error', (err) => console.error(err))