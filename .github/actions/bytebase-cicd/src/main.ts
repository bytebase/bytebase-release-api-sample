import {
  MigrationFile,
  createPlan,
  createRelease,
  createRollout,
  getRollout,
  previewPlan,
  runStageTasks
} from './bb'
import * as hc from '@actions/http-client'
import * as core from '@actions/core'
import * as glob from '@actions/glob'
import * as github from '@actions/github'
import * as fs from 'fs/promises'
import * as path from 'path'
import { PushEvent, PullRequestEvent } from '@octokit/webhooks-types'

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const ghContext = github.context

    if (ghContext.eventName !== 'push') {
      throw new Error(`expect push event, but get ${ghContext.eventName}`)
    }
    const pushPayload = ghContext.payload as PushEvent

    const commit = pushPayload.after ?? 'unknown'
    const commitUrl = pushPayload.head_commit?.url ?? ''

    const bbToken = core.getInput('bb-token', { required: true })
    const bbUrl = core.getInput('bb-url', { required: true })
    const bbProject = core.getInput('bb-project', { required: true })
    const bbDatabase = core.getInput('bb-database', { required: true })
    const ghToken = core.getInput('gh-token', { required: true })

    const configContent = await fs.readFile('./.bb.json', { encoding: 'utf8' })
    const config = JSON.parse(configContent) as {
      config: {
        branch: string
        project: string
        database: string
        dir: string
      }[]
    }

    core.info(JSON.stringify(pushPayload))
    core.info(configContent)

    ctx = () => {
      return {
        bbUrl: bbUrl,
        bbToken: bbToken,
        bbProject: bbProject,
        bbDatabase: bbDatabase,
        commit: commit,
        commitUrl: commitUrl,
        c: new hc.HttpClient('bytebase-cicd-action', [], {
          headers: {
            authorization: `Bearer ${bbToken}`
          }
        })
      }
    }

    const dir = core.getInput('dir', { required: true })
    const globPattern = path.join('./', dir, '*.sql')

    const versionReg = /^\d+/

    let files: MigrationFile[] = []
    const globber = await glob.create(globPattern)
    for await (const file of globber.globGenerator()) {
      const content = await fs.readFile(file, { encoding: 'utf8' })
      const filename = path.basename(file)

      const versionM = filename.match(versionReg)
      if (!versionM) {
        core.info(`failed to get version, ignore ${file}`)
        continue
      }
      const version = versionM[0]

      files.push({
        name: filename,
        version: version,
        content: content
      })
    }

    const release = await createRelease(files)
    const releaseUrl = `${ctx().bbUrl}/${release}`

    core.info(`Successfully created release at ${releaseUrl}`)
    core.setOutput('release-url', releaseUrl)

    const pPlan = await previewPlan(release)
    const s = pPlan?.steps.reduce((acc, step) => {
      return acc + step.specs.length
    }, 0)
    if (s === 0) {
      throw new Error('plan has no specs')
    }

    const plan = await createPlan(pPlan)
    const rollout = await createRollout({ plan: plan.name })
    const rolloutName = rollout.name

    const rolloutUrl = `${ctx().bbUrl}/${rolloutName}`
    core.info(`Successfully created rollout at ${rolloutUrl}`)
    core.setOutput('rollout-url', rolloutUrl)

    await runRolloutWait(rollout)
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}

function getStageStatus(stage: any) {
  return {
    done: stage.tasks.every((e: { status: string }) => e.status === 'DONE'),
    failedTasks: stage.tasks.filter(
      (e: { status: string }) => e.status === 'FAILED'
    )
  }
}

async function runRolloutWait(rollout: any) {
  const stageCount = rollout.stages.length
  if (stageCount === 0) {
    return
  }

  core.info(`The rollout has ${stageCount} stages:`)
  core.info(rollout.stages.map((e: { title: any }) => e.title))

  let i = 0
  while (true) {
    if (i >= stageCount) {
      break
    }

    const r = await getRollout(rollout.name)
    const stage = r.stages[i]
    const { done, failedTasks } = getStageStatus(stage)
    if (done) {
      console.log(`${stage.title} done`)
      i++
      continue
    }
    if (failedTasks.length > 0) {
      throw new Error(
        `task ${failedTasks.map((e: { name: any }) => e.name)} failed`
      )
    }

    await runStageTasks(stage)
    await sleep(5000)
  }
}

export let ctx = () => {
  const bbToken =
    'eyJhbGciOiJIUzI1NiIsImtpZCI6InYxIiwidHlwIjoiSldUIn0.eyJuYW1lIjoiTWUiLCJpc3MiOiJieXRlYmFzZSIsInN1YiI6IjEwMSIsImF1ZCI6WyJiYi51c2VyLmFjY2Vzcy5kZXYiXSwiZXhwIjoxNzMxODMyMzM3LCJpYXQiOjE3MzEwNTQ3Mzd9.qQOcIpmYOC-yHxjG_4M2vUNgHqFKl8ZjBwBi8nojqXk'

  return {
    bbUrl: 'http://localhost:8080',
    bbToken: bbToken,
    bbProject: 'db333',
    bbDatabase: 'instances/dbdbdb/databases/db_1',
    commit: '',
    commitUrl: '',
    c: new hc.HttpClient('bytebase-cicd-action', [], {
      headers: {
        authorization: `Bearer ${bbToken}`
      }
    })
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
