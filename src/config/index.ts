import { stringToBoolean } from './helpers.js'

if (!process.env.PORT) throw new Error('Please specify PORT')

const isBehindProxy = stringToBoolean(process.env.PROXY)
const port = +process.env.PORT
const baseUrl = process.env.BASE_URL ?? `http://localhost:${port}`

export { baseUrl, isBehindProxy, port }
