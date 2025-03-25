import { stringToBoolean } from './helpers.js'

if (!process.env.PORT) throw new Error('Please specify PORT')

export const isBehindProxy = stringToBoolean(process.env.PROXY)
export const port = +process.env.PORT
export const baseUrl = process.env.BASE_URL ?? ''
