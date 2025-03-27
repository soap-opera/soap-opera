import { createApp } from './app.js'
import { baseUrl, isBehindProxy, port } from './config/index.js'

createApp({ port, isBehindProxy, baseUrl }).then(app =>
  app.listen(port, async () => {
    // eslint-disable-next-line no-console
    console.log(`SoAP opera agent is listening on port ${port}`)
  }),
)
