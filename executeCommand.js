import fs from 'fs';
import { spawn } from 'child_process';
import { MongoClient, ServerApiVersion } from 'mongodb';
import { config } from "dotenv";
config();
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

async function executeCheckCommandReturnsLicenses (link) {

    return new Promise(async (resolve, reject) => {
    const process = spawn('docker',  ["run", "--rm", "--name", `controller-container-${link.substring(link.lastIndexOf('/')+1)}`,
    '--entrypoint=./controller/build/searchseco', '-e', `github_token=${GITHUB_TOKEN}`, '--cpus=2',
    '-e', `worker_name=license-checker-${link.substring(link.lastIndexOf('/')+1)}`, 'searchseco/controller:master', 'check', link]);
    // const process = spawn('python3',  ["test.py"])
    let output = '';
    let timeout;
    let matchedProjects = [];
    let CVEs = [];

    const handleTimeout = async () => {
      process.kill();
      console.log(`Timeout exceeded for link: ${link}`);
      // await addFailedJob(link);
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
        console.log(`Timeout for ${link} set to ${Math.min(20 * numFiles * 1000, 2 * 60 * 60 * 1000)}`);
        timeout = setTimeout(handleTimeout, Math.min(20 * numFiles * 1000, 2 * 60 * 60 * 1000)); // 20 seconds per file or 2 hours
      }
    });
    
    process.stderr.on("data", (data) => {
      output += data;
      // console.log(data.toString());
      // Check if the output contains the number of files being parsed
      const regex = /Parsing (\d+) files/;
      const match = data.toString().match(regex);
      if (match) {
        // Set the timeout based on the number of files being parsed
        const numFiles = parseInt(match[1]);
        if (timeout) {
          clearTimeout(timeout);
        }
        console.log(`Timeout for ${link} set to ${Math.min(20 * numFiles * 1000, 2 * 60 * 60 * 1000)}`);
        timeout = setTimeout(handleTimeout, Math.min(20 * numFiles * 1000, 2 * 60 * 60 * 1000)); // 20 seconds per file or 2 hours
      }
    });

    process.on("close", (code) => {
      
      if (timeout) {
        clearTimeout(timeout);
      }

      let numberOfLicenseConflicts,report_result;
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
        const projectRegex = /(https?:\/\/[^\s]+)/g;
        let projectMatch;
        while ((projectMatch = projectRegex.exec(output))) 
        {
          const project = projectMatch[1];
          // push into matchedProjects array only of it is not already present
          if (!matchedProjects.includes(project)) 
          {
            // if project contains #, then push
            if (project.includes("#"))
            {
              matchedProjects.push(project);
            }
          }
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
        // report_result
      };

      resolve(result);
    });
  });
}

// let res = await executeCheckCommandReturnsLicenses("https://github.com/ra5put1n/vulnerable-openssl");
// console.log(res);

export default executeCheckCommandReturnsLicenses;