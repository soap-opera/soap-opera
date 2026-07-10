import { expect, type Page } from '@playwright/test'
import crypto from 'node:crypto'
import { generate } from 'random-words'

export async function ensureMastodonSignup(page: Page) {
  await mastodonSignIn(page, mastodonAdminCredentials)
  await page.goto('http://localhost:3000/admin/settings/registrations')
  await page.getByLabel('Who can sign-up').selectOption('open')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await mastodonSignOut(page)
}

export interface MastodonAccount {
  username: string
  email: `${string}@${string}`
  password: string
}

const mastodonAdminCredentials: MastodonAccount = {
  username: 'admin',
  email: 'admin@localhost',
  password: 'mastodonadmin',
}

async function createMastodonAccount(page: Page, account: MastodonAccount) {
  await page.goto('http://localhost:3000/auth/sign_up')
  await page.getByRole('textbox', { name: 'Username' }).fill(account.username)
  await page.waitForTimeout(500)
  await page
    .getByRole('textbox', { name: 'E-mail address' })
    .fill(account.email)
  await page.waitForTimeout(500)
  await page
    .getByRole('textbox', { name: 'Password', exact: true })
    .fill(account.password)
  await page.waitForTimeout(500)
  await page
    .getByRole('textbox', { name: 'Confirm password' })
    .fill(account.password)
  await page.waitForTimeout(500)
  await page
    .getByRole('checkbox', { name: 'I have read and agree to the' })
    .check()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Sign up' }).click()

  await page.waitForURL('http://localhost:3000/auth/setup')

  await page.waitForTimeout(1000)

  await page.goto('http://localhost:3000/letter_opener')
  await page
    .locator('iframe[name="mail"]')
    .contentFrame()
    .locator('iframe')
    .contentFrame()
    .getByRole('link', { name: 'Verify email address ➜' })
    .click()

  await page.waitForURL('http://localhost:3000/start')

  await expect(page.locator('.display-name').first()).toContainText(
    `@${account.username}`,
  )
}

export async function createRandomMastodonAccount(page: Page) {
  const username = generate({ exactly: 3, join: '_', maxLength: 9 })
  const email = `${username}@example.com` as const
  const password = crypto.randomUUID()
  await createMastodonAccount(page, { username, email, password })
  return { username, email, password }
}

export async function mastodonSignIn(page: Page, account: MastodonAccount) {
  await page.goto('http://localhost:3000')
  await page.getByRole('link', { name: 'Login' }).click()
  await page
    .getByRole('textbox', { name: 'E-mail address' })
    .fill(account.email)
  await page.getByRole('textbox', { name: 'Password' }).fill(account.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.waitForURL(url =>
    ['http://localhost:3000/start', 'http://localhost:3000/home'].includes(
      url.toString(),
    ),
  )

  await expect(page.locator('.display-name').first()).toContainText(
    `@${account.username}`,
  )
}

export async function mastodonSignOut(page: Page) {
  await page.goto('http://localhost:3000')
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('button', { name: 'Logout' }).click()
  await page.getByRole('button', { name: 'Log out' }).click()
  await page.waitForURL('http://localhost:3000/auth/sign_in')
}
