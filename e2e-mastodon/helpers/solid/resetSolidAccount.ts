import * as n3 from 'n3'
import assert from 'node:assert/strict'
import { ldp } from 'rdf-namespaces'
import type { SolidAccount } from '../solid.js'

/**
 * Reset changes to Solid Pod
 */
export const resetSolidAccount = async (account: SolidAccount) => {
  const w = new URL(account.webId)
  w.hash = ''

  const expected = {
    [w.toString()]: `
@prefix foaf: <http://xmlns.com/foaf/0.1/>.
@prefix solid: <http://www.w3.org/ns/solid/terms#>.

<>
    a foaf:PersonalProfileDocument;
    foaf:maker <${account.webId}>;
    foaf:primaryTopic <${account.webId}>.

<${account.webId}>
    
    solid:oidcIssuer <${account.oidcIssuer}>;
    a foaf:Person.
`,
    [`${account.podUrl}.acl`]: `# Root ACL resource for the agent account
@prefix acl: <http://www.w3.org/ns/auth/acl#>.
@prefix foaf: <http://xmlns.com/foaf/0.1/>.

# The homepage is readable by the public
<#public>
    a acl:Authorization;
    acl:agentClass foaf:Agent;
    acl:accessTo <./>;
    acl:mode acl:Read.

# The owner has full access to every resource in their pod.
# Other agents have no access rights,
# unless specifically authorized in other .acl resources.
<#owner>
    a acl:Authorization;
    acl:agent <${account.webId}>;
    # Optional owner email, to be used for account recovery:
    
    # Set the access to the root storage folder itself
    acl:accessTo <./>;
    # All resources will inherit this authorization, by default
    acl:default <./>;
    # The owner has all of the access modes allowed
    acl:mode
        acl:Read, acl:Write, acl:Control.
`,
    [w.toString() + '.acl']: `
# ACL resource for the WebID profile document
@prefix acl: <http://www.w3.org/ns/auth/acl#>.
@prefix foaf: <http://xmlns.com/foaf/0.1/>.

# The WebID profile is readable by the public.
# This is required for discovery and verification,
# e.g. when checking identity providers.
<#public>
    a acl:Authorization;
    acl:agentClass foaf:Agent;
    acl:accessTo <./card>;
    acl:mode acl:Read.

# The owner has full access to the profile
<#owner>
    a acl:Authorization;
    acl:agent <${account.webId}>;
    acl:accessTo <./card>;
    acl:mode acl:Read, acl:Write, acl:Control.
`,
  }

  /**
   * returns true if resource is kept, otherwise false
   */
  const resetResource = async (url: string, allowNotFound = false) => {
    // leaf resources will be updated to original or deleted
    // expected resources will be overwritten
    if (url in expected) {
      const result = await account.fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/turtle' },
        body: expected[url],
      })
      assert(result.ok)

      return true
    } else {
      const result = await account.fetch(url, { method: 'DELETE' })
      assert(result.ok || (allowNotFound && result.status === 404))
      return false
    }
  }

  const resetRecursive = async (url: string): Promise<boolean> => {
    const { namedNode } = n3.DataFactory
    await resetResource(url + '.acl', true)
    if (url.endsWith('/')) {
      // get what's inside container
      const response = await account.fetch(url, {
        headers: { Accept: 'text/turtle' },
      })
      assert(response.ok)
      const parser = new n3.Parser({ baseIRI: url, format: 'text/turtle' })

      const dataset = new n3.Store(parser.parse(await response.text()))

      const containment = dataset.getObjects(
        namedNode(url),
        namedNode(ldp.contains),
        null,
      )

      let keep = false
      for (const input of containment) {
        if (input.termType === 'NamedNode') {
          const toKeep = await resetRecursive(input.value)
          keep ||= toKeep
        }
      }

      if (!keep) await resetResource(url)

      return keep
    } else {
      return await resetResource(url)
    }
  }

  await resetRecursive(account.podUrl)
}
