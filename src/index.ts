import { getLogger } from '@logtape/logtape'
import { createApp } from './app.js'
import { baseUrl, isBehindProxy, port } from './config/index.js'

const logger = getLogger(['soap-opera', 'index'])

createApp({ port, isBehindProxy, baseUrl }).then(app =>
  app.listen(port, async () => {
    logger.info(`SoAP opera agent is listening on port ${port}`)
  }),
)
