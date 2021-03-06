# cambria-in-memory-store

A tiny library that integrates with [cambria](https://github.com/inkandswitch/cambria) to help you store documents in memory which can be read/written using multiple schemas.

`cambria` does all the heavy lifting, provides stateless utilities for manipulating documents, patches, schemas, and lenses. But `cambria` is intentionally unopinionated about where you store any of this information. `cambria-in-memory-store` simply saves the graph of lenses and schemas on an in-memory object. 

`cambria` is also unopinionated about the IDs associated with schemas. `cambria-in-memory-store` helps generate random schema IDs and maintain a mapping from readable names to specific schemas (just like git associates branch names with commits).

## Other related libraries

- For a much more sophisticated approach to persistence which accounts for multiple concurrent readers/writers in a decentralized system, see [cambria-automerge](https://github.com/inkandswitch/cambria-automerge)
- For a sketch of integrating cambria into a node express server for converting API request/response payloads, see [cambria-express](https://github.com/inkandswitch/cambria-express)

## Usage

```typescript
// Create an initial project schema, specifying its fields with a lens
const store = new CambriaStore()
store.initializeSchema('Project')
const projectV1Schema = store.upgradeSchemaByName([
  addProperty({ name: 'title', type: 'string' }),
  addProperty({ name: 'summary', type: 'string' }),
], 'Project')

// Write a document using the schema
const rawDoc = store.initDoc(
  { title: 'hello', summary: 'this works' },
  projectV1Schema
)

// Upgrade the schema, renaming "summary" to "description",
// and adding a new property called "complete"
const projectV2Schema = store.upgradeSchemaByName([
  renameProperty('summary', 'description'),
  addProperty({ name: 'complete', type: 'boolean' }),
], 'Project')

// We can immediately read the old document in our new schema:
store.readAs(rawDoc, projectV2Schema)
// => {
//   title: 'hello',
//   description: 'this works',  // old data, with new property name
//   complete: false             // default value for new boolean property
// }

// But we can also still read it in the old schema! We never "migrated" the data.
store.readAs(rawDoc, projectV1Schema)
// => { title: 'hello', summary: 'this works' }

// Now we can write an update to our document using the v2 schema:
store.changeTypedDoc(rawDoc, projectV2Schema, (v2doc) => {
  v2doc.description = 'a great project'
})

// We can read the document, including the v2 change, in the v1 schema:
store.readAs(rawDoc, projectV2Schema)
// => { title: 'hello', summary: 'a great project' }
```

## Tests

`yarn run test`