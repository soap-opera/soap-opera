import { v7 } from 'css-authn'

export interface SolidAccount extends Awaited<
  ReturnType<typeof v7.createAccount>
> {
  fetch: typeof globalThis.fetch
}

// export const createRandomSolidAccount = async (): Promise<SolidAccount> => {
//   const username = generate({ exactly: 3, join: '' })
//   return await createSolidAccount({ username })
// }

const password = 'correcthorsebatterystaples'

export const createSolidAccount = async ({
  username,
}: {
  username: string
}): Promise<SolidAccount> => {
  const user = await v7.createAccount({
    username,
    email: `${username}@example`,
    password,
    oidcIssuer: 'https://solid.test/', // TODO parametrize port
  })

  return { ...user, fetch: await v7.getAuthenticatedFetch(user) }
}

/**
 * This is NOT a generic function.
 * It simply gives educated guess of CSS account data
 * based on the format we use in these tests.
 */
export const getSolidAccount = async ({
  username,
}: {
  username: string
}): Promise<SolidAccount> => {
  const user: Omit<SolidAccount, 'fetch'> = {
    username,
    oidcIssuer: 'https://solid.test/',
    podUrl: `https://${username}.solid.test/`,
    idp: 'https://solid.test/',
    webId: `https://${username}.solid.test/profile/card#me`,
    password,
    email: `${username}@example`,
  }

  return { ...user, fetch: await v7.getAuthenticatedFetch(user) }
}

export { resetSolidAccount } from './solid/resetSolidAccount.js'

// export const signin = async ({
//   page,
//   user,
//   url = '/',
//   clientId,
// }: {
//   page: Page
//   user: SolidAccount
//   url?: string
//   clientId?: string
// }) => {
//   await page.goto(url)
//   await page.getByRole('button', { name: 'sign in' }).click()
//   await page.getByRole('textbox').fill(user.oidcIssuer)
//   await page.getByRole('button', { name: 'continue' }).click()
//   // TODO wrong port, parametrize, or get rid of the method
//   await expect(page).toHaveURL('http://localhost:4000/.account/login/password/')
//   await page.getByRole('textbox', { name: 'Email' }).fill(user.email)
//   await page.getByRole('textbox', { name: 'Password' }).fill(user.password)
//   await page.getByRole('button', { name: 'Log in' }).click()
//   if (clientId) await expect(page.locator('#client')).toContainText(clientId)
//   await page.getByRole('button', { name: 'Authorize' }).click()
//   await expect(page).toHaveURL(url)
// }
