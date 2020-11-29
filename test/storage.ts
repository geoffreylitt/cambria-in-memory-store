// ======================================
// This file shows how Cloudina can be used to implement CambriaStore
// ======================================

import assert from 'assert'
import { addProperty, renameProperty, convertValue, LensSource } from 'cambria'
import { CambriaStore, RawDoc } from '../src/storage'

export interface ProjectV1 {
  title: string
  summary: boolean
}

export interface ProjectV2 {
  name: string
  description: string
  complete: boolean
}

export interface ProjectV3 {
  name: string
  description: string
  status: string
}

export interface ProjectV4 {
  title: string
  description: string
  status: string
  age: number
}

const projectV1Lens: LensSource = [
  addProperty({ name: 'title', type: 'string' }),
  addProperty({ name: 'summary', type: 'string' }),
]

const v1Tov2LensSource: LensSource = [
  renameProperty('summary', 'description'),
  addProperty({ name: 'complete', type: 'boolean' }),
]

const v2ToV3LensSource: LensSource = [
  renameProperty('complete', 'status'),
  convertValue(
    'status',
    [
      { false: 'todo', true: 'done' },
      { todo: false, inProgress: false, done: true, default: true },
    ],
    'boolean',
    'string'
  ),
]

describe('CambriaStore', () => {
  const store = new CambriaStore()
  const projectV0Schema = store.initializeSchema('Project')
  const projectV1Schema = store.upgradeSchemaByName(projectV1Lens, 'Project')
  const projectV2Schema = store.upgradeSchemaByName(v1Tov2LensSource, 'Project')
  const projectV3Schema = store.upgradeSchemaByName(v2ToV3LensSource, 'Project')

  // initialize a v1 doc
  const rawDoc: RawDoc = store.initDoc({ title: 'hello', summary: 'this works' }, projectV1Schema)

  // Our writers all mutate the underlying doc,
  // so we need to create new copies per test to keep them isolated
  const newDoc = () => JSON.parse(JSON.stringify(rawDoc))

  describe('basic reads', () => {
    const rawDoc = newDoc()

    it('can read the v1 doc as a v2 doc', () => {
      assert.deepStrictEqual(store.readAs(rawDoc, projectV2Schema), {
        title: 'hello',
        description: 'this works',
        complete: false
      })
    })
  
    it('can read the v1 doc as a v1 doc', () => {
      assert.deepStrictEqual(store.readAs(rawDoc, projectV1Schema), {
        title: 'hello',
        summary: 'this works',
      })
    })
  })

  describe('readAs', () => {
    const rawDoc = newDoc()
    // write a change in the v2 schema
    store.changeTypedDoc(rawDoc, projectV2Schema, (v2doc) => {
      v2doc.description = 'a great project'
    })

    it('reads the v2 change from v1', () => {
      assert.deepStrictEqual(store.readAs(rawDoc, projectV1Schema), {
        title: 'hello',
        summary: 'a great project',
      })
    })
  })

  describe('basic write', () => {
    const rawDoc = newDoc()
    store.changeTypedDoc(rawDoc, projectV1Schema, (v1doc) => {
      v1doc.summary = "it's working"
    })

    it('writes to the the writer schema itself', () => {
      assert.strictEqual(store.readAs(rawDoc, projectV1Schema).summary, "it's working")
    })

    it('writes to other schemas one conversion away', () => {
      assert.strictEqual(store.readAs(rawDoc, projectV2Schema).description, "it's working")
    })

    it('writes to other schemas multiple conversions away', () => {
      assert.strictEqual(store.readAs(rawDoc, projectV3Schema).description, "it's working")
    })
  })

  describe('boolean to enum conversion', () => {
    const rawDoc = newDoc()
    store.changeTypedDoc(rawDoc, projectV2Schema, (v2doc) => {
      v2doc.complete = true
    })

    it('writes to the the writer schema itself', () => {
      assert.strictEqual(store.readAs(rawDoc, projectV2Schema).complete, true)
    })

    it('writes to other schemas one conversion away', () => {
      assert.strictEqual(store.readAs(rawDoc, projectV3Schema).status, 'done')
    })
  })

  describe('divergent branches', () => {
    it('can merge together data from divergent branches with an extra connecting lens', () => {
      const rawDoc = newDoc()

      const store = new CambriaStore()

      // Each branch adds a new property and writes to the new property
      store.initializeSchema('Project')
      store.upgradeSchemaByName(projectV1Lens, 'Project')
      const branch1Schema = store.upgradeSchemaByName(
        [addProperty({ name: 'branch1', type: 'string' })],
        'Project'
      )
      store.changeTypedDoc(rawDoc, branch1Schema, (typedDoc) => {
        typedDoc.branch1 = 'branch1'
      })

      store.initializeSchema('Project')
      store.upgradeSchemaByName(projectV1Lens, 'Project')
      const branch2Schema = store.upgradeSchemaByName(
        [addProperty({ name: 'branch2', type: 'string' })],
        'Project'
      )
      store.changeTypedDoc(rawDoc, branch2Schema, (typedDoc) => {
        typedDoc.branch2 = 'branch2'
      })

      // Branch 1 "rebases", creating a single schema with both properties on it.
      const combinedSchema = store.upgradeSchemaById(
        [addProperty({ name: 'branch2', type: 'string' })],
        branch1Schema
      )

      // At this point, we can read the branch1 value, but the value from branch2 has been lost...
      assert.strictEqual(store.readAs(rawDoc, combinedSchema).branch1, 'branch1')
      assert.strictEqual(store.readAs(rawDoc, combinedSchema).branch2, '')

      // This makes sense since the shortest lens path from the original branch2 write to our
      // new combined schema goes through the shared parent v1, which doesn't have the new fields.

      //     ┌─────────────┐
      //     │Branch 1 + 2 │
      //     └─────────────┘
      //           ▲
      //   add     │
      // branch2   │
      //           ▼
      //       ┌─────────┐     ┌─────────┐
      //       │Branch 1 │     │Branch 2 │
      //       └─────────┘     └─────────┘
      //           ▲               ▲
      //     add    │               │    add
      //   branch1  └───────┬───────┘  branch2
      //                   │
      //                   │
      //                   ▼
      //                 ┌────┐
      //                 │ V1 │
      //                 └────┘

      // But, we can fix this! All we need to do is add a new lens, which bridges directly
      // from the original branch2 schema to the new combined one.
      // The branch 2 patch will be able to cross this bridge and appear in our new schema.
      // Let's give it a shot.

      //     ┌─────────────┐
      //     │Branch 1 + 2 │
      //     └─────────────┘
      //           ▲            no-op lens
      //   add     ├───────────────┐
      // branch2   │               │
      //           ▼               ▼
      //       ┌─────────┐     ┌─────────┐
      //       │Branch 1 │     │Branch 2 │
      //       └─────────┘     └─────────┘
      //           ▲               ▲
      //     add    │               │    add
      //   branch1  └───────┬───────┘  branch2
      //                   │
      //                   │
      //                   ▼
      //                 ┌────┐
      //                 │ V1 │
      //                 └────┘

      // We call a relatively low level method "addLensToGraph" here;
      // This bypasses all the schemaName + linear schema management logic, and simply
      // adds a lens between two existing schemas that can be used for conversions.
      // Todo: formalize this API more, clarify the external API surface of CambriaStore
      store.connectExistingSchemas([], branch2Schema, combinedSchema)

      // Now let's try another read:
      assert.strictEqual(store.readAs(rawDoc, combinedSchema).branch1, 'branch1')
      assert.strictEqual(store.readAs(rawDoc, combinedSchema).branch2, 'branch2')

      // 🎉🎉 Tada! The branch2 data has been restored.
    })
  })
  describe('reading/writing arrays', () => {
    it('reads from an array that it wrote to', () => {
      const addTagsLens: LensSource = [addProperty({ name: 'tags', type: 'array' })]

      const store = new CambriaStore()
      store.initializeSchema('Project')
      store.upgradeSchemaByName(projectV1Lens, 'Project')
      const finalSchemaId = store.upgradeSchemaByName(addTagsLens, 'Project')

      const initialDoc = {
        title: 'hello',
        summary: 'world',
        tags: [],
      }

      const doc = store.initDoc(initialDoc, finalSchemaId)

      store.changeTypedDoc(doc, finalSchemaId, (typedDoc) => {
        typedDoc.tags.push('a tag')
        typedDoc.tags.push('another tag')
      })

      assert.deepStrictEqual(store.readAs(doc, finalSchemaId), {
        ...initialDoc,
        tags: ['a tag', 'another tag'],
      })
    })
  })
})