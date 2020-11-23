// ======================================
// This file shows how Cloudina can be used to implement Chitin
// ======================================

import assert from 'assert'
import { inspect } from 'util'
import { addProperty, renameProperty, convertValue, LensSource } from 'cambria'
import { ChitinDoc, Chitin } from '../src/data-conversion'

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

function deepInspect(object: any) {
  return inspect(object, false, null, true)
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

describe('Chitin', () => {
  const chitin = new Chitin()
  chitin.createSchema('Project')
  const projectV1Schema = chitin.registerLens(projectV1Lens, 'Project')
  const projectV2Schema = chitin.registerLens(v1Tov2LensSource, 'Project')
  const projectV3Schema = chitin.registerLens(v2ToV3LensSource, 'Project')

  const chitinDoc = chitin.initDoc({ title: 'hello', summary: 'this works' }, projectV1Schema)

  // todo: should we even test this? seems like a private API now
  chitin.addLensInDoc(chitinDoc, {
    from: projectV1Schema,
    to: projectV2Schema,
    lens: v1Tov2LensSource,
  })

  chitin.addLensInDoc(chitinDoc, {
    from: projectV2Schema,
    to: projectV3Schema,
    lens: v2ToV3LensSource,
  })

  chitin.changeTypedDoc(chitinDoc, projectV2Schema, (v2doc) => {
    v2doc.description = 'a great project'
  })

  function newDoc(): ChitinDoc {
    return JSON.parse(JSON.stringify(chitinDoc))
  }

  describe('readAs', () => {
    it('reads from the appropriate soupDoc section', () => {
      assert.deepStrictEqual(chitin.readAs(chitinDoc, projectV1Schema), {
        title: 'hello',
        summary: 'a great project',
      })
    })
  })

  // describe('basic write', () => {
  //   const soupDoc = newDoc()
  //   chitin.changeTypedDoc(soupDoc, projectV1Schema, (v1doc) => {
  //     v1doc.summary = "it's working"
  //   })

  //   it('writes to the the writer schema itself', () => {
  //     assert.equal(chitin.readAs(soupDoc, projectV1Schema).summary, "it's working")
  //   })

  //   it('writes to other schemas one conversion away', () => {
  //     assert.equal(chitin.readAs(soupDoc, projectV2Schema).description, "it's working")
  //   })

  //   it('writes to other schemas multiple conversions away', () => {
  //     assert.equal(chitin.readAs(soupDoc, projectV3Schema).description, "it's working")
  //   })
  // })

  // describe('boolean to enum conversion', () => {
  //   const soupDoc = newDoc()
  //   chitin.changeTypedDoc(soupDoc, projectV2Schema, (v2doc) => {
  //     v2doc.complete = true
  //   })

  //   it('writes to the the writer schema itself', () => {
  //     assert.equal(chitin.readAs(soupDoc, projectV2Schema).complete, true)
  //   })

  //   it('writes to other schemas one conversion away', () => {
  //     assert.equal(chitin.readAs(soupDoc, projectV3Schema).status, 'done')
  //   })
  // })

  // describe('divergent branches', () => {
  //   it('can merge together data from divergent branches with an extra connecting lens', () => {
  //     const chitinDoc = newDoc()

  //     const branch1 = new Chitin()
  //     const branch2 = new Chitin()

  //     // Each branch adds a new property and writes to the new property
  //     branch1.createSchema('Project')
  //     branch1.registerLens(projectV1Lens, 'Project')
  //     const branch1Schema = branch1.registerLens(
  //       [addProperty({ name: 'branch1', type: 'string' })],
  //       'Project'
  //     )
  //     branch1.changeTypedDoc(chitinDoc, branch1Schema, (typedDoc) => {
  //       typedDoc.branch1 = 'branch1'
  //     })

  //     branch2.createSchema('Project')
  //     branch2.registerLens(projectV1Lens, 'Project')
  //     const branch2Schema = branch2.registerLens(
  //       [addProperty({ name: 'branch2', type: 'string' })],
  //       'Project'
  //     )
  //     branch2.changeTypedDoc(chitinDoc, branch2Schema, (typedDoc) => {
  //       typedDoc.branch2 = 'branch2'
  //     })

  //     // Branch 1 "rebases", creating a single schema with both properties on it.
  //     const combinedSchema = branch1.registerLens(
  //       [addProperty({ name: 'branch2', type: 'string' })],
  //       'Project'
  //     )

  //     // At this point, we can read the branch1 value, but the value from branch2 has been lost...
  //     assert.equal(branch1.readAs(chitinDoc, combinedSchema).branch1, 'branch1')
  //     assert.equal(branch1.readAs(chitinDoc, combinedSchema).branch2, '')

  //     // This makes sense since the shortest lens path from the original branch2 write to our
  //     // new combined schema goes through the shared parent v1, which doesn't have the new fields.

  //     //     ┌─────────────┐
  //     //     │Branch 1 + 2 │
  //     //     └─────────────┘
  //     //           ▲
  //     //   add     │
  //     // branch2   │
  //     //           ▼
  //     //       ┌─────────┐     ┌─────────┐
  //     //       │Branch 1 │     │Branch 2 │
  //     //       └─────────┘     └─────────┘
  //     //           ▲               ▲
  //     //     add    │               │    add
  //     //   branch1  └───────┬───────┘  branch2
  //     //                   │
  //     //                   │
  //     //                   ▼
  //     //                 ┌────┐
  //     //                 │ V1 │
  //     //                 └────┘

  //     // But, we can fix this! All we need to do is add a new lens, which bridges directly
  //     // from the original branch2 schema to the new combined one.
  //     // The branch 2 patch will be able to cross this bridge and appear in our new schema.
  //     // Let's give it a shot.

  //     //     ┌─────────────┐
  //     //     │Branch 1 + 2 │
  //     //     └─────────────┘
  //     //           ▲            no-op lens
  //     //   add     ├───────────────┐
  //     // branch2   │               │
  //     //           ▼               ▼
  //     //       ┌─────────┐     ┌─────────┐
  //     //       │Branch 1 │     │Branch 2 │
  //     //       └─────────┘     └─────────┘
  //     //           ▲               ▲
  //     //     add    │               │    add
  //     //   branch1  └───────┬───────┘  branch2
  //     //                   │
  //     //                   │
  //     //                   ▼
  //     //                 ┌────┐
  //     //                 │ V1 │
  //     //                 └────┘

  //     // We call a relatively low level method "addLensToGraph" here;
  //     // This bypasses all the schemaName + linear schema management logic, and simply
  //     // adds a lens between two existing schemas that can be used for conversions.
  //     // Todo: formalize this API more, clarify the external API surface of Chitin
  //     branch1.addLensToGraph({ from: branch2Schema, to: combinedSchema, lens: [] })

  //     // Now let's try another read:
  //     assert.equal(branch1.readAs(chitinDoc, combinedSchema).branch1, 'branch1')
  //     assert.equal(branch1.readAs(chitinDoc, combinedSchema).branch2, 'branch2')

  //     // 🎉🎉 Tada! The branch2 data has been restored.
  //   })
  // })
  // describe('reading/writing arrays', () => {
  //   it('reads from an array that it wrote to', () => {
  //     const addTagsLens: LensSource = [addProperty({ name: 'tags', type: 'array' })]

  //     const chitin = new Chitin()
  //     chitin.createSchema('Project')
  //     chitin.registerLens(projectV1Lens, 'Project')
  //     const finalSchemaId = chitin.registerLens(addTagsLens, 'Project')

  //     const initialDoc = {
  //       title: 'hello',
  //       summary: 'world',
  //       tags: [],
  //     }

  //     const doc = chitin.initDoc(initialDoc, finalSchemaId)

  //     chitin.changeTypedDoc(doc, finalSchemaId, (typedDoc) => {
  //       typedDoc.tags.push('a tag')
  //       typedDoc.tags.push('another tag')
  //     })

  //     assert.deepEqual(chitin.readAs(doc, finalSchemaId), {
  //       ...initialDoc,
  //       tags: ['a tag', 'another tag'],
  //     })
  //   })
  // })

  // function lens3to4(): LensSource {
  //   return [
  //     renameProperty('name', 'title'),
  //     addProperty({ name: 'age', type: 'number', default: 2 }),
  //   ]
  // }

  // describe('registering a new schema', () => {
  //   const doc = newDoc()
  //   const lens = lens3to4()

  //   const projectV4Schema = chitin.registerLens(lens3to4(), 'Project')

  //   const lensWithMeta = {
  //     from: projectV3Schema,
  //     to: projectV4Schema,
  //     lens,
  //   }

  //   chitin.addLensInDoc(doc, lensWithMeta)

  //   it('init and register work', () => {
  //     assert.deepEqual(chitinDoc, chitinDoc)
  //   })

  //   it('adds the schema and lenses to the chitin doc', () => {
  //     assert.equal(doc.schemas.includes(projectV4Schema), true)
  //     assert.equal(doc.lenses.includes(lensWithMeta), true)
  //   })

  //   describe('validates the schema', () => {
  //     it('validates on initdoc', () => {
  //       chitin.initDoc({ title: 'hello', summary: 'this works' }, projectV1Schema)
  //       assert.throws(() => chitin.initDoc({ foo: 'bar' }, projectV1Schema))
  //       assert.throws(() =>
  //         chitin.initDoc({ title: 'hello', summary: 'this works', extra: 'field' }, projectV1Schema)
  //       )
  //       assert.throws(() => chitin.initDoc({ title: 'missing field' }, projectV1Schema))
  //     })

  //     it('validates on readAs', () => {
  //       const soupDoc = chitin.initDoc({ title: 'hello', summary: 'this works' }, projectV1Schema)
  //       chitin.readAs(soupDoc, projectV1Schema)
  //       // corrupt the soupdoc
  //       soupDoc.patches[0].patch[0].path = '/wrong'
  //       assert.throws(() => chitin.readAs(soupDoc, projectV1Schema))
  //     })

  //     it('validates on changeTypedDoc', () => {
  //       const soupDoc = chitin.initDoc({ title: 'hello', summary: 'this works' }, projectV1Schema)
  //       chitin.changeTypedDoc(soupDoc, projectV1Schema, (typedDoc) => {
  //         typedDoc.title = 'goodbye'
  //       })
  //       assert.throws(() =>
  //         chitin.changeTypedDoc(soupDoc, projectV1Schema, (typedDoc) => {
  //           typedDoc.foo = 'bar'
  //         })
  //       )
  //       assert.throws(() =>
  //         chitin.changeTypedDoc(soupDoc, projectV1Schema, (typedDoc) => {
  //           delete typedDoc.title
  //         })
  //       )
  //     })
  //   })

  //   describe('reading through lenses present locally, but not in doc', () => {
  //     it('uses a lens to go from v1 to v2', () => {
  //       // create fresh chitin instance to shadow in this test context
  //       const chitin = new Chitin()

  //       chitin.createSchema('Project')
  //       const projectV1Schema = chitin.registerLens(projectV1Lens, 'Project')

  //       // Create a doc before we've registered more lenses on the Project schema
  //       const doc = chitin.initDoc({ title: 'hello', summary: 'this works' }, projectV1Schema)

  //       const projectV2Schema = chitin.registerLens(v1Tov2LensSource, 'Project')

  //       const v2TypedDoc = chitin.readAs(doc, projectV2Schema)

  //       assert.deepEqual(v2TypedDoc, {
  //         title: 'hello',
  //         description: 'this works',
  //         complete: false,
  //       })
  //     })

  //     describe('reading through lenses present in doc, but not locally', () => {
  //       it('uses a lens in the doc to go from v2 to v1', () => {
  //         const writer = new Chitin()
  //         writer.createSchema('Project')
  //         const writerV1Schema = writer.registerLens(projectV1Lens, 'Project')
  //         const doc = writer.initDoc({ title: 'hello', summary: 'this works' }, writerV1Schema)
  //         const writerV2Schema = writer.registerLens(v1Tov2LensSource, 'Project')
  //         writer.changeTypedDoc(doc, writerV2Schema, (typedDoc) => {
  //           typedDoc.description = 'new description'
  //         })

  //         const reader = new Chitin()
  //         reader.createSchema('Project')
  //         const readerV1Schema = reader.registerLens(projectV1Lens, 'Project')
  //         assert.deepEqual(reader.readAs(doc, readerV1Schema), {
  //           title: 'hello',
  //           summary: 'new description',
  //         })
  //       })

  //       // todo:
  //       // would be good to test here that json schemas get correctly registered when we
  //       // load lenses from the doc, and validation works
  //     })

  //     // // todo: consider whether this test makes sense
  //     // it('uses 2 lenses to go from v1 to v3', () => {
  //     //   // create fresh chitin instance to shadow in this test context
  //     //   const chitin = new Chitin()

  //     //   chitin.createSchema('Project')
  //     //   const projectV1Schema = chitin.registerLens(projectV1Lens, 'Project')

  //     //   // Create a doc before we've registered more lenses on the Project schema
  //     //   const doc = chitin.initDoc({ title: 'hello', summary: 'this works' }, projectV1Schema)

  //     //   chitin.registerLens(v1Tov2LensSource, 'Project')
  //     //   const projectV3Schema = chitin.registerLens(v2ToV3LensSource, 'Project')

  //     //   // the head pointer of project schema is now at the v3 version
  //     //   const headSchemaId = chitin.getSchemaIdForName('Project')
  //     //   assert.equal(headSchemaId, projectV3Schema)

  //     //   const v3TypedDoc = chitin.readAs(doc, headSchemaId)

  //     //   assert.deepEqual(v3TypedDoc, {
  //     //     title: 'hello',
  //     //     description: 'this works',
  //     //     status: 'todo',
  //     //   })
  //     // })

  //     it('a doc initialized as v3 should be readable as v1', () => {
  //       const chitin = new Chitin()
  //       chitin.createSchema('Project')
  //       const projectV1Schema = chitin.registerLens(projectV1Lens, 'Project')
  //       chitin.registerLens(v1Tov2LensSource, 'Project')
  //       chitin.registerLens(v2ToV3LensSource, 'Project')

  //       const chitinDoc = chitin.initDoc(
  //         { title: 'hello', description: 'test description', status: 'done' },
  //         chitin.getSchemaIdForName('Project')
  //       )

  //       assert.deepEqual(chitin.readAs(chitinDoc, projectV1Schema), {
  //         title: 'hello',
  //         summary: 'test description',
  //       })
  //     })
  //   })
  // })

  // describe('serializing schema graph state', () => {
  //   it('can serialize schema graph to an object and rehydrate a new chitin instance', () => {
  //     const chitin = new Chitin()
  //     chitin.createSchema('Project')
  //     chitin.registerLens(projectV1Lens, 'Project')
  //     chitin.registerLens(v1Tov2LensSource, 'Project')

  //     const config = chitin.serializedSchemaGraph()

  //     const chitin2 = new Chitin(config)
  //     assert.deepEqual(chitin.getLensesForSchema('Project'), chitin2.getLensesForSchema('Project'))
  //   })
  // })
})