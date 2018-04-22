const EventEmitter = require('eventemitter3'),
      snekfetch = require('snekfetch'),
      WebSocket = require('ws'),
      uuid = require('uuid/v4')

function parseCommonData(metadata) {
  const split = metadata.split(';')
  const ret = {
    email: split[0]
  }
  split.splice(1).forEach((metadata) => {
    let sep = metadata.split('=')
    ret[(sep[0] || 'undefined?')] = sep[1] || 'undefined?'
  })
  return ret
}

module.exports = class Client extends EventEmitter {
  /**
   * Create a new Client
   * @param {Object} options - Client options
   * @param {string} options.key - Krist private key
   * @param {string} options.address - Krist address that corresponds to the key
   * @param {string} options.domain - Domain name to use when providing addresses
   * @param {Number} options.amount - Amount to request to pay
   * @param {Number} [options.port=64641] - Port to run the websocket on
   */
  constructor(options) {
    super()
    this.options = options
    this.options.port = this.options.port || 64641

    this.waitingLogin = {}

    this.wss = new WebSocket.Server({
      port: this.options.port
    })
    this.wss.on('connection', (ws, req) => {
      ws._send = ws.send
      ws.send = (...args) => {
        if (typeof args[0] === 'object') return ws._send(JSON.stringify(args[0]))
        return ws._send(...args)
      }
      this.emit('connection', ws, req)
      ws.send({
        t: 'HELLO',
        p: {}
      })
      ws.on('message', (msg) => {
        this.emit('message', ws, msg)
        try {
          const data = JSON.parse(msg)
          switch (data.t.toLowerCase()) {
            case 'auth':
              const id = uuid()
              this.waitingLogin[data.p.address] = {
                id,
                ws
              }
              this.emit('pending', id, data.p.address, ws)
              ws.send({
                t: 'AUTH',
                p: {
                  address: `${data.p.address}@${this.options.domain}`,
                  amount: this.options.amount
                }
              })
              break
          }
        } catch(err) {
          this.emit('error', err)
        }
      })
    })
    this.init()
  }

  async init() {
    const resp = await snekfetch.post('https://krist.ceriat.net/ws/start')
      .send({
        privatekey: this.options.key
      })
    this.kst = new WebSocket(resp.body.url)
    this.kst.on('open', async() => {
      const resp = await this.kstWsMsg({
        type: 'subscribe',
        event: 'transactions'
      })
      if (resp.subscription_level.indexOf('transactions') === -1) {
        this.emit('error', new Error('Failed to subscribe to transactions event on the KST websocket?'))
      }
    })
    this.kst.on('message', async (msg) => {
      try {
        const data = JSON.parse(msg)
        if (data.type === 'event' && data.event == 'transaction') {
          if (data.transaction.to !== this.options.address) return
          const metadata = parseCommonData(data.transaction.metadata || '')
          // Make sure the email is the persons address they are paying from @ the domain from the optiohns
          if (metadata.email !== `${data.transaction.from}@${this.options.domain}`) {
            await this.pay(metadata.return || data.transaction.from, data.transaction.value, undefined)
            this.emit('refunded', data.transaction.id, data.transaction.from, metadata.return || data.transaction.from, data.transaction.value)
            return
          }
          const address = data.transaction.from //TODO: enhance for metaname addresses?

          // Make sure that waitingLogin isn't undefined -- and it isn't false
          if (typeof this.waitingLogin[address] !== 'undefined' && !!this.waitingLogin[address]) {
            if (data.transaction.value === this.options.amount) {
              // SEND WELCOME EVENT AFTER RECEIVING AUTHORIZED
              this.emit('authorized', this.waitingLogin[address].id, address, this.waitingLogin[address].ws, data.transaction.id)
              delete this.waitingLogin[address]
            }
          }
          await this.pay(metadata.return || data.transaction.from, data.transaction.value, undefined)
          this.emit('refunded', data.transaction.id, data.transaction.from, metadata.return || data.transaction.from, data.transaction.value)
          return
        }
      } catch(err) {
        this.emit('error', err)
      }
    })
    
  }
  kstWsMsg(p) {
    return new Promise((resolve, reject) => {
      const id = uuid()
      p.id = id
      const toSend = JSON.stringify(p)
      function messageHandler(data) {
        try {
          const msg = JSON.parse(data)
          if (msg.id === id) resolve(msg)
        } catch(err) { 
          console.error('bad data from ws', err)
        }
      }
      this.kst.on('message', messageHandler)
      this.kst.send(toSend)
    })
  }
  async pay(address, amount, metadata) {
    const resp = await this.kstWsMsg({
      type: 'make_transaction',
      privatekey: this.options.key,
      to: address,
      amount,
      metadata
    })
    return resp
  }
}