// A simple integration of Cambria with an in-memory datastore

import jsonpatch, { applyPatch } from 'fast-json-patch'
import { createHash } from 'crypto'
import { Patch, LensSource, initLensGraph, LensGraph, registerLens, lensFromTo, applyLensToPatch, lensGraphSchema } from 'cambria'

type SchemaId = string

export type LensWithMeta = { from: string | null; to: string; lens: LensSource }

interface TypedPatch {
  schemaId: SchemaId
  patch: Patch
}

export interface RawDoc {
  patches: TypedPatch[]
}

export class CambriaLocalStorage {
  headSchemas: { [key:string]: string }
  graph: LensGraph

  constructor() {
    this.graph = initLensGraph()
    this.headSchemas = {}
  }

  initDoc<D>(pojo: D, schemaId: SchemaId): RawDoc {
    return { patches: [
      { schemaId, patch: jsonpatch.compare({}, pojo) }
    ] }
  }

  // read a doc as a given schema ID
  readAs(doc: RawDoc, readerSchemaId: string): any {
    if (doc.patches === undefined) throw new Error('malformed Chitin doc')

    // Simply reduce over the list of patches to recover final state,
    // converting each patch from writer->reader schema as we go
    const typedDoc = doc.patches.reduce((typedDoc, patch) => {
      const lens = lensFromTo(this.graph, patch.schemaId, readerSchemaId)
      const patchSchema = lensGraphSchema(this.graph, patch.schemaId)
      const convertedPatch = applyLensToPatch(lens, patch.patch, patchSchema)

    // Note: it's important that we pass in mutateDocument: false to applyPatch!
    // If we patch the doc in place, we end up with weird behavior from mutating shared data.
      return applyPatch(typedDoc, convertedPatch, true, false).newDocument
    }, {})

    return typedDoc
  }

  // Caller mutates a typed doc in a callback; changes get written out to all schemas in the doc.
  changeTypedDoc(doc: RawDoc, writerSchemaId: SchemaId, callback: (any) => void) {
    const typedDoc: Record<string, any> = this.readAs(doc, writerSchemaId)

    // set up a change watcher on the document
    const observer = jsonpatch.observe(typedDoc)
    // Let the writer mutate the watched document
    callback(typedDoc)
    // write a patch of the observed changes on the doc
    doc.patches.push({ schemaId: writerSchemaId, patch: jsonpatch.generate(observer) })
  }

  // creates a new schema with a name.
  // returns the ID for the schema
  initializeSchema(name: string): SchemaId {
    const schemaId = createHash('md5')
      .update(name)
      .digest('hex') as string
    this.graph = registerLens(this.graph, 'mu', schemaId, [])
    this.headSchemas[name] = schemaId

    return schemaId
  }

  // register a new lens and schema version within a schema
  // returns the generated schema ID
  upgradeSchema(lens: LensSource, schemaName: string): SchemaId {
    const headSchemaId = this.headSchemas[schemaName]

    if (!headSchemaId) {
      throw new Error(`Couldn't find schema ${schemaName}, did you create it with createSchema?`)
    }

    // new schema ID is a hash of the previous ID + this lens.
    // it's crucial to incorporate the previous schema ID here!
    // this means that the final schema ID depends on the full path of migrations
    const newSchemaId = createHash('md5')
      .update(headSchemaId)
      // todo: make this more deterministic; don't rely on key ordering
      .update(JSON.stringify(lens))
      .digest('hex')

    this.graph = registerLens(this.graph, headSchemaId, newSchemaId, lens)
    this.headSchemas[schemaName] = newSchemaId
    return newSchemaId
  }

  connectExistingSchemas(lens: LensSource, from: SchemaId, to: SchemaId) {
    this.graph = registerLens(this.graph, from, to, lens)
  }
}
