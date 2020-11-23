# Cambria In-Memory Store

A tiny library that integrates with [cambria](https://github.com/inkandswitch/cambria) to help you store documents in memory which can be read/written using multiple schemas.

Cambria does all the heavy lifting, providing stateless utilities for manipulating documents, patches, schemas, and lenses. This code just shows you how to stitch those parts together in a useful way:

## Usage

```typescript
// Create an initial project schema using Cambria's lens language
const store = new CambriaStore()
store.initializeSchema('Project')
const projectV1Schema = store.upgradeSchema([
  addProperty({ name: 'title', type: 'string' }),
  addProperty({ name: 'summary', type: 'string' }),
], 'Project')

// Write a document using the schema
const rawDoc = store.initDoc(
  { title: 'hello', summary: 'this works' },
  projectV1Schema
)

// Upgrade the schema, renaming "summary" to "description".
// In normal systems this would be a breaking change...but not here!
const projectV2Schema = store.upgradeSchema([
  renameProperty('summary', 'description'),
], 'Project')

// We can immediately read the old document in our new schema...
store.readAs(rawDoc, projectV2Schema)
// => { title: 'hello', description: 'this works' }

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