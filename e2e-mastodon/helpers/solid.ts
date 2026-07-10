import { type Page, expect } from '@playwright/test'
import { v7 } from 'css-authn'
import { randomUUID } from 'node:crypto'
import { generate } from 'random-words'

export interface SolidAccount extends Awaited<
  ReturnType<typeof v7.createAccount>
> {
  fetch: typeof globalThis.fetch
}

export const createRandomSolidAccount = async (): Promise<SolidAccount> => {
  const username = generate({ exactly: 3, join: '' })
  return await createSolidAccount({ username })
}

export const createSolidAccount = async ({
  username,
}: {
  username: string
}): Promise<SolidAccount> => {
  const user = await v7.createAccount({
    username,
    email: `${username}@example`,
    password: randomUUID(),
    oidcIssuer: 'https://solid.test/', // TODO parametrize port
  })
  return { ...user, fetch: await v7.getAuthenticatedFetch(user) }
}

export const signin = async ({
  page,
  user,
  url = '/',
  clientId,
}: {
  page: Page
  user: SolidAccount
  url?: string
  clientId?: string
}) => {
  await page.goto(url)
  await page.getByRole('button', { name: 'sign in' }).click()
  await page.getByRole('textbox').fill(user.oidcIssuer)
  await page.getByRole('button', { name: 'continue' }).click()
  // TODO wrong port, parametrize, or get rid of the method
  await expect(page).toHaveURL('http://localhost:4000/.account/login/password/')
  await page.getByRole('textbox', { name: 'Email' }).fill(user.email)
  await page.getByRole('textbox', { name: 'Password' }).fill(user.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  if (clientId) await expect(page.locator('#client')).toContainText(clientId)
  await page.getByRole('button', { name: 'Authorize' }).click()
  await expect(page).toHaveURL(url)
}
