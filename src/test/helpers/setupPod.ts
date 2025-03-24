import { foaf, solid } from 'rdf-namespaces'
import { expect } from 'vitest'
import { getAcl, getContainer, getResource } from './index.js'

interface ACLConfig {
  permissions: ('Read' | 'Write' | 'Append' | 'Control')[]
  agents?: string[]
  agentGroups?: string[]
  agentClasses?: string[]
  isDefault?: boolean
}

export const createContainer = async ({
  url,
  acls,
  authenticatedFetch,
}: {
  url: string
  acls?: ACLConfig[]
  authenticatedFetch: typeof fetch
}) => {
  const response = await authenticatedFetch(getContainer(url), {
    method: 'PUT',
    headers: {
      'content-type': 'text/turtle',
      Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
    },
  })

  expect(response.ok).toBe(true)

  if (acls) {
    for (const aclConfig of acls) {
      await addAcl({
        ...aclConfig,
        resource: url,
        authenticatedFetch,
      })
    }
  }
}

export const createResource = async ({
  url,
  body,
  acls,
  authenticatedFetch,
}: {
  url: string
  body: string
  acls?: ACLConfig[]
  authenticatedFetch: typeof fetch
}) => {
  const response = await authenticatedFetch(getResource(url), {
    method: 'PUT',
    headers: { 'content-type': 'text/turtle' },
    body,
  })

  expect(response.ok).toBe(true)

  if (acls) {
    for (const aclConfig of acls) {
      await addAcl({
        ...aclConfig,
        resource: getResource(url),
        authenticatedFetch,
      })
    }
  }
}

export const patchFile = async ({
  url,
  inserts = '',
  deletes = '',
  authenticatedFetch,
}: {
  url: string
  inserts?: string
  deletes?: string
  authenticatedFetch: typeof fetch
}) => {
  if (!inserts && !deletes) return
  const patch = `@prefix solid: <http://www.w3.org/ns/solid/terms#>.

  _:patch a solid:InsertDeletePatch;
    ${inserts ? `solid:inserts { ${inserts} }` : ''}
    ${inserts && deletes ? ';' : ''}
    ${deletes ? `solid:deletes { ${deletes} }` : ''}
    .`
  const response = await authenticatedFetch(url, {
    method: 'PATCH',
    body: patch,
    headers: { 'content-type': 'text/n3' },
  })
  expect(response.ok).toBe(true)
}

const addAcl = async ({
  permissions,
  agents,
  agentGroups,
  agentClasses,
  isPublic = false,
  resource,
  isDefault = false,
  authenticatedFetch,
}: {
  permissions: ('Read' | 'Write' | 'Append' | 'Control')[]
  agents?: string[]
  agentGroups?: string[]
  agentClasses?: string[]
  isPublic?: boolean
  resource: string
  isDefault?: boolean
  authenticatedFetch: typeof globalThis.fetch
}) => {
  if (permissions.length === 0)
    throw new Error('You need to specify at least one permission')

  const acl = await getAcl(resource, authenticatedFetch)

  const response = await authenticatedFetch(acl, {
    method: 'PATCH',
    headers: { 'content-type': 'text/n3' },
    body: `
        @prefix acl: <http://www.w3.org/ns/auth/acl#>.

      _:mutate a <${solid.InsertDeletePatch}>; <${solid.inserts}> {
        <#${permissions.join('')}>
          a acl:Authorization;
          ${
            agents && agents.length > 0
              ? `acl:agent ${agents.map(a => `<${a}>`).join(', ')};`
              : ''
          }
          ${
            agentGroups && agentGroups.length > 0
              ? `acl:agentGroup ${agentGroups.map(a => `<${a}>`).join(', ')};`
              : ''
          }
          ${
            agentClasses && agentClasses.length > 0
              ? `acl:agentClass ${agentClasses.map(a => `<${a}>`).join(', ')};`
              : ''
          }
          ${isPublic ? `acl:agentClass <${foaf.Agent}>;` : ''}
          acl:accessTo <${resource}>;
          ${isDefault ? `acl:default <${resource}>;` : ''}
          acl:mode ${permissions.map(p => `acl:${p}`).join(', ')}.
      }.`,
  })

  expect(response.ok).toBe(true)

  return response
}
