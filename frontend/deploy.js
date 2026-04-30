import * as ftp from "basic-ftp"
import * as dotenv from "dotenv"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Try to load .env from current dir or parent dir
dotenv.config()
dotenv.config({ path: path.resolve(__dirname, '../.env') })

async function deployTool() {
    const client = new ftp.Client()
    client.ftp.verbose = true
    try {
        await client.access({
            host: process.env.FTP_HOST,
            user: process.env.FTP_USER,
            password: process.env.FTP_PASS,
            secure: false
        })
        
        console.log("Deploying Tool to /www/tools/occlusal-hole-tool/...")
        // Ensure the directory exists
        await client.ensureDir("/www/tools/occlusal-hole-tool")
        // Clear the directory before upload to ensure a clean state
        await client.clearWorkingDir()
        // Upload the built files from the local dist folder
        await client.uploadFromDir("dist")
        
        console.log("Tool deployment completed successfully.")
    }
    catch(err) {
        console.error("Tool deployment failed:", err)
        console.log("Tip: Make sure you have a .env file with FTP credentials in the tool directory.")
    }
    client.close()
}

deployTool()
