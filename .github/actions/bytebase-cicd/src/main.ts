import { MigrationFile, createRelease } from './bb'
import * as core from '@actions/core'
import * as glob from '@actions/glob'
import * as github from '@actions/github'
import * as fs from 'fs/promises'
import * as path from 'path'
import { PullRequestEvent } from '@octokit/webhooks-types'

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const ghContext = github.context

    if (ghContext.eventName !== 'pull_request') {
      throw new Error(
        `expect pull_request event, but get ${ghContext.eventName}`
      )
    }
    const prPayload = ghContext.payload as PullRequestEvent
    if (prPayload.action !== 'closed') {
      throw new Error('expect pull request was merged')
    }
    if (!prPayload.pull_request.merged) {
      throw new Error('expect pull request was merged')
    }

    const commit = prPayload.pull_request.merge_commit_sha ?? 'unknown'
    const prNumber = prPayload.pull_request.number

    const bbToken = core.getInput('bb-token', { required: true })
    const bbUrl = core.getInput('bb-url', { required: true })
    const bbProject = core.getInput('bb-project', { required: true })
    const ghToken = core.getInput('gh-token', { required: true })

    ctx = () => {
      return {
        bbUrl: bbUrl,
        bbToken: bbToken,
        bbProject: bbProject,
        commit: commit
      }
    }

    const dir = core.getInput('dir', { required: true })
    const globPattern = path.join('./', dir, '*.sql')

    const versionReg = /^\d+/

    let files: MigrationFile[] = []
    const globber = await glob.create(globPattern)
    for await (const file of globber.globGenerator()) {
      core.info(file)
      const content = await fs.readFile(file, { encoding: 'utf8' })
      core.info(content.toString())
      const filename = path.basename(file)

      const versionM = filename.match(versionReg)
      if (!versionM) {
        core.info(`failed to get version, ignore ${file}`)
        continue
      }
      const version = versionM[0]
      core.info(version)

      files.push({
        name: filename,
        version: version,
        content: content
      })
    }

    const release = await createRelease(files)

    core.setOutput('release-url', `${ctx().bbUrl}/${release}`)
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}

export let ctx = () => {
  return {
    bbUrl: 'http://localhost:8080',
    bbToken:
      'eyJhbGciOiJIUzI1NiIsImtpZCI6InYxIiwidHlwIjoiSldUIn0.eyJuYW1lIjoiTWUiLCJpc3MiOiJieXRlYmFzZSIsInN1YiI6IjEwMSIsImF1ZCI6WyJiYi51c2VyLmFjY2Vzcy5kZXYiXSwiZXhwIjoxNzMxODMyMzM3LCJpYXQiOjE3MzEwNTQ3Mzd9.qQOcIpmYOC-yHxjG_4M2vUNgHqFKl8ZjBwBi8nojqXk',
    bbProject: 'db333',
    commit: ''
  }
}
