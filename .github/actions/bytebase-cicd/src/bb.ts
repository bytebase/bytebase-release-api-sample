//ts-worksheet-with-variables
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

async function batchCreateSheet(files: MigrationFile[]): Promise<string[]> {
  const url = `${ctx().bbUrl}/v1/projects/${ctx().bbProject}/sheets:batchCreate`

  const c = ctx().c

  const requests = files.map(f => {
    return {
      sheet: {
        title: `sheet for file ${f.name}`,
        content: Buffer.from(f.content, 'utf8').toString('base64')
      }
    }
  })

  const response = await c.postJson<any>(url, {
    requests: requests
  })

  if (response.statusCode !== 200) {
    throw new Error(
      `failed to create sheet, ${response.statusCode}, ${response.result.message}`
    )
  }

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
  const c = ctx().c

  const url = `${ctx().bbUrl}/v1/projects/${ctx().bbProject}/releases`

  let files: File[] = []

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

  const response = await c.postJson<any>(url, {
    title: `release for commit ${ctx().commit}`,
    files: files,
    vcsSource: {
      vcsType: 'GITHUB',
      pullRequestUrl: ctx().commitUrl
    }
  })

  if (response.statusCode !== 200) {
    throw new Error(
      `failed to create release, ${response.statusCode}, ${response.result.message}`
    )
  }

  return response.result.name
}

export async function previewPlan(release: string) {
  const c = ctx().c

  const url = `${ctx().bbUrl}/v1/projects/${ctx().bbProject}:previewPlan`

  const request = {
    release: release,
    targets: [ctx().bbDatabase]
  }

  const response = await c.postJson<{
    plan: {
      steps: {
        specs: {}[]
      }[]
    }
  }>(url, request)

  if (response.statusCode !== 200) {
    throw new Error(
      `failed to preview plan, ${response.statusCode}, ${(response.result as any).message}`
    )
  }

  return response.result?.plan
}

export async function createPlan(plan: any) {
  const c = ctx().c

  const url = `${ctx().bbUrl}/v1/projects/${ctx().bbProject}/plans`

  const response = await c.postJson<any>(url, plan)

  if (response.statusCode !== 200) {
    throw new Error(
      `failed to create plan, ${response.statusCode}, ${response.result.message}`
    )
  }

  return response.result
}

export async function createRollout(rollout: any) {
  const c = ctx().c

  const url = `${ctx().bbUrl}/v1/projects/${ctx().bbProject}/rollouts`

  const response = await c.postJson<any>(url, rollout)

  if (response.statusCode !== 200) {
    throw new Error(
      `failed to create rollout, ${response.statusCode}, ${response.result.message}`
    )
  }

  return response.result
}

export async function getRollout(rolloutName: string) {
  const c = ctx().c
  const url = `${ctx().bbUrl}/v1/${rolloutName}`
  const response = await c.getJson<any>(url)

  if (response.statusCode !== 200) {
    throw new Error(
      `failed to get rollout, ${response.statusCode}, ${response.result.message}`
    )
  }

  if (!response.result) {
    throw new Error(`rollout not found`)
  }

  return response.result
}

export async function runStageTasks(stage: any) {
  const stageName = stage.name
  const taskNames = stage.tasks
    .filter((e: { status: string }) => e.status === 'NOT_STARTED')
    .map((e: { name: string }) => e.name)
  if (taskNames.length === 0) {
    return
  }
  const c = ctx().c
  const url = `${ctx().bbUrl}/v1/${stageName}/tasks:batchRun`
  const request = {
    tasks: taskNames,
    reason: `run ${stage.title}`
  }
  const response = await c.postJson<any>(url, request)

  if (response.statusCode !== 200) {
    throw new Error(
      `failed to run tasks, ${response.statusCode}, ${response.result.message}`
    )
  }
}
