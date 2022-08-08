const { exec } = require('child_process')

function setOutput(key, value) {
    console.log(`Set ${key}=${value}`)
    console.log(`::set-output name=${key}::${value}`)
}

function error(message) {
    console.log(`::error::${message}`)
}

function debug(message) {
    console.log(`::debug::${message}`)
}

const TAGS_REF_PREFIX = "refs/tags/"
const BRANCH_REF_PREFIX = "refs/heads/"
const RELEASE_BRANCH_PREFIX = "release/"

function make_safe(value) {
    // Remove all non-alphanumeric characters and replace with -
    // and remove leading, trailing, and consecutive dashes.
    return value.replace(/[^a-zA-Z0-9.-]+/g, "-").replace(/-+/g, "-").replace(/^-/g, "").replace(/-$/g, "")
}

try {
    console.log(`Calculating version for ${process.env.GITHUB_REF} (${process.env.GITHUB_SHA})`)
    debug(`git commit ${process.env.GITHUB_SHA}`)
    debug(`git ref ${process.env.GITHUB_REF}`)

    const git_commit = process.env.GITHUB_SHA
    let git_branch = ""
    if ( process.env.GITHUB_REF.startsWith(BRANCH_REF_PREFIX) ) {
        git_branch = process.env.GITHUB_REF.slice(BRANCH_REF_PREFIX.length)
    }

    const git_branch_safe = make_safe(git_branch)
    const is_release_branch =   ["master", "main", "release"].indexOf(git_branch) !== -1 ||
                                process.env.GITHUB_REF.startsWith(TAGS_REF_PREFIX)
    const is_development_branch = ["develop", "development"].indexOf(git_branch) !== -1
    const is_feature_branch_or_pr = !is_release_branch && !is_development_branch

    let release_label = ""
    if ( is_release_branch ) {
        if ( git_branch.startsWith(RELEASE_BRANCH_PREFIX) ) {
            release_label = make_safe(git_branch.slice(RELEASE_BRANCH_PREFIX.length))
        }
        else {
            release_label = "release"
        }
    }

    setOutput("release_label", release_label)
    setOutput("is_release_branch", is_release_branch.toString())
    setOutput("is_development_branch", is_development_branch.toString())
    setOutput("is_feature_branch_or_pr", is_feature_branch_or_pr.toString())

    setOutput("git_branch", git_branch)
    setOutput("git_branch_safe", git_branch_safe)

    // test if it is a shallow repository
    let shallow = true
    debug(`Executing: 'git rev-parse --is-shallow-repository'`)
    exec("git rev-parse --is-shallow-repository", (err, output, stderr) => {
        if (err) {
            error(`Failed to execute 'git rev-parse --is-shallow-repository'.\n${stderr}`)
            return process.exit(2)
        }

        const git_is_shallow = output.trim().toLowerCase()
        debug(`Is shallow: ${git_is_shallow}`)
        if (git_is_shallow === "false") {
            shallow = false
            debug(`shallow = false`)
        }

        debug(`shallow = ${shallow}`)
        let cmd = "git fetch --prune"
        if (shallow) {
            cmd += " --unshallow"
        }
        cmd += " && git fetch -q --all --tags -f && git describe --tags --abbrev=1 --long"

        debug(`Executing: ${cmd}`)

        exec(cmd, (err, output, stderr) => {
            if (err) {
                error(`Unable to find an earlier tag.\n${stderr}`)
                return process.exit(1)
            }
            const git_describe = output.trim()
            debug(`git describe output: ${git_describe}`)

            const parts = git_describe.split("-")
            // Remove "v" prefix if it exits
            const git_tag = parts[0].replace(/^v/, '')
            const git_commits_since_tag = parts[1]
            // Remove "g" prefix
            const git_describe_object_id = parts[2].slice(1)

            let long_version = `${git_tag}`
            if ( git_commits_since_tag !== "0" ) {
                long_version += `-${git_commits_since_tag}`

                if ( is_feature_branch_or_pr ) {
                    long_version += `-${git_describe_object_id}`
                }
                if ( !is_release_branch && git_branch_safe !== "" ) {
                    long_version += `-${git_branch_safe}`
                }
            }

            setOutput("git_tag", git_tag)
            setOutput("version", git_tag)
            setOutput("git_commit", git_commit)
            setOutput("git_describe_object_id", git_describe_object_id)
            setOutput("git_commits_since_tag", git_commits_since_tag)
            setOutput("git_describe", git_describe)
            setOutput("long_version", long_version)

            console.log(`Version is "${long_version}"`)
        })
    })
} catch (error) {
    process.exitCode = 1
    error(error.message);
}