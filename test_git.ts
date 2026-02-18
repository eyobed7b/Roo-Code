import { getGitMetadata } from "./src/utils/git"

async function test() {
    const metadata = await getGitMetadata(process.cwd())
    console.log("Git Metadata:", metadata)
}

test()
