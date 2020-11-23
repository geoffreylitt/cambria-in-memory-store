// ======================================
// This file shows how Cloudina can be used to implement CambriaLocalStorage
// ======================================

import assert from 'assert'
import { addProperty, renameProperty, convertValue, LensSource } from 'cambria'
import { CambriaLocalStorage, RawDoc } from '../src/data-conversion'

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



describe('CambriaLocalStorage', () => {
  const chitin = new CambriaLocalStorage()
  chitin.initializeSchema('Project')
  const projectV1Schema = chitin.upgradeSchema(projectV1Lens, 'Project')
  const projectV2Schema = chitin.upgradeSchema(v1Tov2LensSource, 'Project')
  const projectV3Schema = chitin.upgradeSchema(v2ToV3LensSource, 'Project')

  // initialize a v1 doc
  const rawDoc: RawDoc = chitin.initDoc({ title: 'hello', summary: 'this works' }, projectV1Schema)

  // write a change in v2 schema
  chitin.changeTypedDoc(rawDoc, projectV2Schema, (v2doc) => {
    v2doc.description = 'a great project'
  })

  const newDoc = () => JSON.parse(JSON.stringify(rawDoc))

  describe('readAs', () => {
    it('reads the v2 change from v1', () => {
      assert.deepStrictEqual(chitin.readAs(rawDoc, projectV1Schema), {
        title: 'hello',
        summary: 'a great project',
      })
    })
  })

  describe('basic write', () => {
    const rawDoc = newDoc()
    chitin.changeTypedDoc(rawDoc, projectV1Schema, (v1doc) => {
      v1doc.summary = "it's working"
    })

    it('writes to the the writer schema itself', () => {
      assert.strictEqual(chitin.readAs(rawDoc, projectV1Schema).summary, "it's working")
    })

    it('writes to other schemas one conversion away', () => {
      assert.strictEqual(chitin.readAs(rawDoc, projectV2Schema).description, "it's working")
    })

    it('writes to other schemas multiple conversions away', () => {
      assert.strictEqual(chitin.readAs(rawDoc, projectV3Schema).description, "it's working")
    })
  })

  describe('boolean to enum conversion', () => {
    const rawDoc = newDoc()
    chitin.changeTypedDoc(rawDoc, projectV2Schema, (v2doc) => {
      v2doc.complete = true
    })

    it('writes to the the writer schema itself', () => {
      assert.strictEqual(chitin.readAs(rawDoc, projectV2Schema).complete, true)
    })

    it('writes to other schemas one conversion away', () => {
      assert.strictEqual(chitin.readAs(rawDoc, projectV3Schema).status, 'done')
    })
  })

  describe('divergent branches', () => {
    it('can merge together data from divergent branches with an extra connecting lens', () => {
      const rawDoc = newDoc()

      const branch1 = new CambriaLocalStorage()
      const branch2 = new CambriaLocalStorage()

      // Each branch adds a new property and writes to the new property
      branch1.initializeSchema('Project')
      branch1.upgradeSchema(projectV1Lens, 'Project')
      const branch1Schema = branch1.upgradeSchema(
        [addProperty({ name: 'branch1', type: 'string' })],
        'Project'
      )
      branch1.changeTypedDoc(rawDoc, branch1Schema, (typedDoc) => {
        typedDoc.branch1 = 'branch1'
      })

      branch2.initializeSchema('Project')
      branch2.upgradeSchema(projectV1Lens, 'Project')
      const branch2Schema = branch2.upgradeSchema(
        [addProperty({ name: 'branch2', type: 'string' })],
        'Project'
      )
      branch2.changeTypedDoc(rawDoc, branch2Schema, (typedDoc) => {
        typedDoc.branch2 = 'branch2'
      })

      // Branch 1 "rebases", creating a single schema with both properties on it.
      const combinedSchema = branch1.upgradeSchema(
        [addProperty({ name: 'branch2', type: 'string' })],
        'Project'
      )

      // At this point, we can read the branch1 value, but the value from branch2 has been lost...
      assert.strictEqual(branch1.readAs(rawDoc, combinedSchema).branch1, 'branch1')
      assert.strictEqual(branch1.readAs(rawDoc, combinedSchema).branch2, '')

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
      // Todo: formalize this API more, clarify the external API surface of CambriaLocalStorage
      branch1.connectExistingSchemas([], branch2Schema, combinedSchema)

      // Now let's try another read:
      assert.strictEqual(branch1.readAs(rawDoc, combinedSchema).branch1, 'branch1')
      assert.strictEqual(branch1.readAs(rawDoc, combinedSchema).branch2, 'branch2')

      // 🎉🎉 Tada! The branch2 data has been restored.
    })
  })
  describe('reading/writing arrays', () => {
    it('reads from an array that it wrote to', () => {
      const addTagsLens: LensSource = [addProperty({ name: 'tags', type: 'array' })]

      const chitin = new CambriaLocalStorage()
      chitin.initializeSchema('Project')
      chitin.upgradeSchema(projectV1Lens, 'Project')
      const finalSchemaId = chitin.upgradeSchema(addTagsLens, 'Project')

      const initialDoc = {
        title: 'hello',
        summary: 'world',
        tags: [],
      }

      const doc = chitin.initDoc(initialDoc, finalSchemaId)

      chitin.changeTypedDoc(doc, finalSchemaId, (typedDoc) => {
        typedDoc.tags.push('a tag')
        typedDoc.tags.push('another tag')
      })

      assert.deepStrictEqual(chitin.readAs(doc, finalSchemaId), {
        ...initialDoc,
        tags: ['a tag', 'another tag'],
      })
    })
  })
})