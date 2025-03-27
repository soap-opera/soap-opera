import { v7 } from 'css-authn'
import * as dotenv from 'dotenv'
import enquirer from 'enquirer'

/**
 * This is a simple CLI that allows you to send Solid-identity-authenticated request on Community Solid Server.
 * Provide identity provider, email, and password in .env.local
 * CSS_IDENTITY_PROVIDER
 * CSS_IDENTITY_EMAIL
 * CSS_IDENTITY_PASSWORD
 */

dotenv.config({ path: '.env' })

const { prompt } = enquirer

const provider = process.env.CSS_IDENTITY_PROVIDER ?? ''
const email = process.env.CSS_IDENTITY_EMAIL ?? ''
const password = process.env.CSS_IDENTITY_PASSWORD ?? ''

;(async () => {
  // if (!providerEnv)

  // const { provider, email, password } = await prompt<{
  //   provider: string
  //   email: string
  //   password: string
  // }>([
  //   { type: 'input', name: 'provider', message: 'Provider' },
  //   { type: 'input', name: 'email', message: 'Email' },
  //   { type: 'password', name: 'password', message: 'Password' },
  // ])

  const mimeTypes = [
    'text/turtle',
    'application/ld+json',
    'application/json',
    'application/activity+json',
  ]

  const { method, url, contentType, accept, body } = await prompt<{
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    url: string
    contentType: string
    accept: string
    body: string
  }>([
    {
      type: 'select',
      name: 'method',
      message: 'Method',
      choices: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      required: true,
    },
    { type: 'input', name: 'url', message: 'URL', required: true },
    {
      type: 'select',
      name: 'contentType',
      choices: mimeTypes,
      message: 'Content-Type Header',
      required: false,
    },
    {
      type: 'select',
      name: 'accept',
      choices: mimeTypes,
      message: 'Accept Header',
      required: false,
    },
    {
      type: 'text',
      name: 'body',
      message: 'Body',
      required: false,
    },
  ])

  // let addHeader = true

  const headers: Record<string, string> = {}

  if (contentType) headers['content-type'] = contentType
  if (accept) headers['accept'] = accept

  // while (addHeader) {}

  const authFetch = await v7.getAuthenticatedFetch({
    provider,
    email,
    password,
  })

  const response = await authFetch(url, {
    method,
    headers,
    body: method === 'GET' ? undefined : body,
  })

  // eslint-disable-next-line no-console
  console.log(response)

  // eslint-disable-next-line no-console
  console.log(await response.text())
})()
