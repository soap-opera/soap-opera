import { createApp } from './app.js'
import { baseUrl, isBehindProxy, port } from './config/index.js'

createApp({ port, isBehindProxy, baseUrl }).then(app =>
  app.listen(port, async () => {
    // eslint-disable-next-line no-console
    console.log(`geoindex service is listening on port ${port}`)
  }),
)
