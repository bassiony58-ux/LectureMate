import { exec } from "child_process";
import { promisify } from "util";
const execAsync = promisify(exec);

async function testPython() {
    try {
        const { stdout, stderr } = await execAsync('python --version');
        console.log("Python version:", stdout.trim() || stderr.trim());
        console.log("SUCCESS: Node can call Python");
    } catch (error) {
        console.error("FAILURE: Node failed to call Python");
        console.error(error);
    }
}

testPython();
