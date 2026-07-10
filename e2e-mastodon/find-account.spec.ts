import { expect, test } from '@playwright/test'
import { Agent, setGlobalDispatcher } from 'undici'
import {
  createRandomMastodonAccount,
  ensureMastodonSignup,
  mastodonSignIn,
  mastodonSignOut,
  type MastodonAccount,
} from './helpers/mastodon.js'
import { setupSoapOpera } from './helpers/soap-opera.js'
import { createSolidAccount, SolidAccount } from './helpers/solid.js'

setGlobalDispatcher(new Agent({ connect: { rejectUnauthorized: false } }))

test.describe('Soap Opera accounts on Mastodon', () => {
  let mastodonAccount: MastodonAccount
  let solidAccount: SolidAccount

  test.beforeEach(async ({ page }) => {
    solidAccount = await createSolidAccount({ username: 'anna' })
    await setupSoapOpera(solidAccount)

    await ensureMastodonSignup(page)
    console.log('ENSURED SIGNUP')
    mastodonAccount = await createRandomMastodonAccount(page)
    console.log('CREATED RANDOM ACCOUNT')
    await mastodonSignOut(page)
    console.log('SIGNED OUT')
  })

  test('should be able to find Soap Opera account via Mastodon search', async ({
    page,
  }) => {
    console.log('STARTING A TEST')
    await mastodonSignIn(page, mastodonAccount)
    await page
      .getByRole('textbox', { name: 'Search or paste URL' })
      .fill('@anna@anna.solid.test')
    await page
      .getByRole('textbox', { name: 'Search or paste URL' })
      .press('Enter')
    await expect(page.getByText('No results.')).toBeVisible()

    await page.getByRole('textbox', { name: 'Search or paste URL' }).click()
    await page
      .getByRole('button', { name: 'Go to profile @anna@anna.solid.test' })
      .click()
    await expect(
      page.getByRole('button', { name: '@anna@anna.solid.test' }),
    ).toBeVisible()
  })
})
