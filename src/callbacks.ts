const HTTP = require('http')
const URL = require('url')

export class Callbacks {
  server: any

  constructor (listenAddr, listenPort, onConductorRegistered) {
    this.server = HTTP.createServer((request, response) => {
      const {name, url} = URL.parse(request.url, true).query
      onConductorRegistered({name, url})
      response.writeHead(200, {'Content-Type': 'text/html'})
      response.end('Conductor registered')
    })
    this.server.listen(listenPort, listenAddr)
    console.log('Listening at http://'+listenAddr+':'+listenPort)
  }

  stop = () => {
    this.server.close(()=> console.log('server closed'))
  }
}
