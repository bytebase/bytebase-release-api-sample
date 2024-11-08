//ts-worksheet-with-variables
import * as hc from '@actions/http-client'
import { ctx } from './main'

export interface MigrationFile {
  name: string
  version: string
  content: string
}

interface File {
  path: string
  sheet: string
  type: 'VERSIONED'
  version: string
}

interface SheetCreate {
  title: string
  content: string
}

async function batchCreateSheet(files: MigrationFile[]): Promise<string[]> {
  let url = `${ctx().bbUrl}/v1/projects/${ctx().bbProject}/sheets:batchCreate`

  const c = new hc.HttpClient()

  const requests = files.map(f => {
    return {
      sheet: {
        title: `sheet for file ${f.name}`,
        content: Buffer.from(f.content, 'utf8').toString('base64')
      }
    }
  })

  let response = await c.postJson(
    url,
    {
      requests: requests
    },
    {
      authorization: `Bearer ${ctx().bbToken}`
    }
  )

  const result = response.result as {
    sheets: { name: string }[]
  }

  return result.sheets.map(v => v.name)
}

let migrationFiles = [
  {
    name: '1.sql',
    version: '1',
    content: 'select 1'
  },
  {
    name: '2.sql',
    version: '2',
    content: 'select 2'
  }
]

export async function createRelease(migrationFiles: MigrationFile[]) {
  const c = new hc.HttpClient()

  let url = `${ctx().bbUrl}/v1/projects/${ctx().bbProject}/releases`

  let files: Array<File> = []

  const sheets = await batchCreateSheet(migrationFiles)

  for (let i = 0; i < migrationFiles.length; i++) {
    const f = migrationFiles[i]
    const sheet = sheets[i]
    files.push({
      path: f.name,
      version: f.version,
      sheet: sheet,
      type: 'VERSIONED'
    })
  }

  const response = await c.postJson(
    url,
    {
      title: `release for commit ${ctx().commit}`,
      files: files,
      vcsSource: {
        vcsType: 'GITHUB',
        pullRequestUrl: ''
      }
    },
    {
      authorization: `Bearer ${ctx().bbToken}`
    }
  )

  return (
    response.result as {
      name: string
    }
  ).name
}
