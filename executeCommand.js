import fs from 'fs';
import { spawn } from 'child_process';
import { MongoClient, ServerApiVersion } from 'mongodb';
import { config } from "dotenv";
// Function to execute a command and write its result to the output file
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
async function addFailedJob(link) 
{
	const client = await MongoClient.connect(uri);
	const db = client.db('jobs');
	const settingsCollection = db.collection('failedJobs');
	await settingsCollection.insertOne({ link: link }, { upsert: true });
	console.log("Added project to failedJobs\n")
	client.close();
}

const executeCheckCommandReturnsLicenses = (link) => {

  return new Promise((resolve, reject) => {
    // const cmd  = `python3 test.py`
    const process = spawn('docker',  ["run", "--rm", "--name", `controller-container-${link.substring(link.lastIndexOf('/')+1)}`,
    '--entrypoint=./controller/build/searchseco', '-e', `github_token=${GITHUB_TOKEN}`, '--cpus=2',
    '-e', `worker_name=portal-check-${link.substring(link.lastIndexOf('/')+1)}`, 'searchseco/controller:master', 'check', url]);
    let output = '';
    let timeout;
    let matchedProjects = [];
    let CVEs = [];

    const handleTimeout = async () => {
      process.kill();
      console.log(`Timeout for link: ${link}`);
      await addFailedJob(link);
      //Add this to failed jobs queue 
    };

    process.stdout.on("data", (data) => {
      output += data;

      // Check if the output contains the number of files being parsed
      const regex = /Parsing (\d+) files/;
      const match = data.toString().match(regex);
      if (match) {
        // Set the timeout based on the number of files being parsed
        const numFiles = parseInt(match[1]);
        if (timeout) {
          clearTimeout(timeout);
        }
        timeout = setTimeout(handleTimeout, 20 * numFiles * 1000); // 20 seconds per file
      }
      else {
        console.log(`Error in number of files`);
      }
    });
    
    process.on("close", (code) => {
      
      if (timeout) {
        clearTimeout(timeout);
      }

      let numberOfLicenseConflicts;
      if (code === 0) {
        // Extract the number of license conflicts from the output
        const lines = output.split("\n");
        for (const line of lines) {
          if (line.startsWith("Number of license conflicts found: ")) {
            numberOfLicenseConflicts = line.match(/\d+/)[0];
            break;
          }
        }

        if (numberOfLicenseConflicts === undefined) {
          numberOfLicenseConflicts = 0;
        }

        // Check if the output contains a project listing
        const projectRegex = /^(\S+)\s+(\d+)\s+\((https?:\/\/\S+)\)$/gm;
        let projectMatch;
        while ((projectMatch = projectRegex.exec(output))) {
          const name = projectMatch[1];
          const count = parseInt(projectMatch[2]);
          const url = projectMatch[3];
          matchedProjects.push({ name, count, url });
        }
        
        const cveRegex = /CVE-\d{4}-\d{4,7}/g;
        let cveMatch;
        while ((cveMatch = cveRegex.exec(output))) {
          const cve = cveMatch[0];
          // push into CVEs array only of it is not already present
          if (!CVEs.includes(cve)) {
            CVEs.push(cve);
          }
        }
      } 
      else 
      {
        resolve(null);
      }

      const result = {
        link,
        numberOfLicenseConflicts,
        matchedProjects,
        CVEs,
      };

      resolve(result);
    });
  });
}

// export { executeCheckCommandReturnsLicenses };
export default executeCheckCommandReturnsLicenses;
