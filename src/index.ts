#!/usr/bin/env node

import * as fs from "fs"
import * as json from "@ts-common/json"
import * as jsonParser from "@ts-common/json-parser"
import * as path from "path"
import * as it from "@ts-common/iterator"
import * as sm from "@ts-common/string-map"
import * as semver from "semver"
import * as cp from "child_process"
import * as process from "process"

const nodeModules = "node_modules"

interface Dependencies {
  readonly [name: string]: string|undefined
}

interface PackageJson {
  readonly name: string
  readonly version: string
  readonly dependencies?: Dependencies
  readonly devDependencies?: Dependencies
}

const readPackageJson = (file: string): PackageJson =>
  jsonParser.parse(file, fs.readFileSync(file).toString()) as PackageJson

interface VersionLocation {
  readonly version: string
  readonly location: string
}

const packages = (p: string): Iterable<sm.Entry<VersionLocation>> =>
  it.flatMap(
    fs.readdirSync(p, { withFileTypes: true }),
    d => {
      if (!d.isDirectory()) {
        return []
      }
      const dir = path.join(p, d.name)
      const pj = path.join(dir, "package.json")
      if (fs.existsSync(pj)) {
        const j = readPackageJson(pj)
        return [sm.entry(j.name, { version: j.version, location: dir })]
      }
      return packages(dir)
    }
  )

const main = () => {
  const current = path.resolve(".")

  const packageJson = readPackageJson(path.join(current, "package.json"))

  const dependencies: Dependencies = {
    ...packageJson["dependencies"],
    ...packageJson["devDependencies"]
  }

  if (dependencies === undefined || !json.isObject(dependencies)) {
    return
  }

  const localPackages = sm.stringMap(packages(path.join(current, "..", "..")))

  const errors: string[] = []

  const reportError = (error: string) => {
    errors.push(error)
    console.error(`error : ${error}`)
  }

  let changes = false

  const p = sm.stringMap(packages(path.join(current, nodeModules)))
  for (const [name, version] of sm.entries(dependencies)) {
    const versionLocation = p[name]
    if (versionLocation === undefined || !semver.satisfies(versionLocation.version, version)) {
      console.log(`searching for ${name}@${version}`)
      const versions = JSON.parse(cp.execSync(`npm view ${name} versions --json`).toString()) as
        ReadonlyArray<string>
      if (versions.find(v => semver.satisfies(v, version)) !== undefined) {
        const x = cp.execSync(`npm install ${name}@${version} --no-save --package-lock-only`).toString()
        console.log(x)
        changes = true
      } else {
        const local = localPackages[name]
        if (local === undefined || !semver.satisfies(local.version, version)) {
          reportError(`${name}@${version} is not found`)
        } else {
          const tgz = `${name.replace("@", "").replace("/", "-")}-${local.version}.tgz`
          const pathTgz = path.join(local.location, tgz)
          if (!fs.existsSync(pathTgz)) {
            const o = cp.execSync(`npm pack`, { cwd: local.location }).toString()
            console.log(o)
          }
          const ox = cp.execSync(`npm install ${pathTgz} --no-save --package-lock-only`).toString()
          console.log(ox)
          changes = true
        }
      }
    }
  }

  if (errors.length === 0 && changes) {
    const f = cp.execSync("npm ci").toString()
    console.log(f)
  }

  if (errors.length !== 0) {
    process.exit(1)
  }
}

main()