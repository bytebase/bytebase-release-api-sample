import * as core from '@actions/core'
import * as glob from '@actions/glob'
import * as github from '@actions/github'
import * as fs from 'fs/promises'
import { PullRequestEvent } from '@octokit/webhooks-types'

import { wait } from './wait'

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const ghContext = github.context

    // if (ghContext.eventName !== 'pull_request') {
    //   throw new Error(
    //     `expect pull_request event, but get ${ghContext.eventName}`
    //   )
    // }
    const prPayload = ghContext.payload as PullRequestEvent
    // if (prPayload.action !== 'closed') {
    //   throw new Error('expect pull request was merged')
    // }
    // if (!prPayload.pull_request.merged) {
    //   throw new Error('expect pull request was merged')
    // }

    core.info(process.env.GITHUB_WORKSPACE ?? 'not found')

    const globber = await glob.create('migrations/*.sql')
    for await (const file of globber.globGenerator()) {
      core.info(file)
      const content = await fs.readFile(file, {encoding: 'utf8'})
      core.info(content.toString())
    }

    const commit = prPayload.pull_request.merge_commit_sha
    const prNumber = prPayload.pull_request.number

    const bbToken = core.getInput('bb-token', { required: true })
    const bbUrl = core.getInput('bb-url', { required: true })
    const ghToken = core.getInput('gh-token', { required: true })
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}

async function getFiles(): Promise<any> {}

async function createRelease(): Promise<void> {
  return
}
