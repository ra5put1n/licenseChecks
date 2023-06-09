import { MongoClient, ServerApiVersion } from 'mongodb';
import { Octokit, App } from "octokit";
import { config } from "dotenv";
config();

const uri  = process.env.MONGODB_URI;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const octokit = new Octokit({ auth: GITHUB_TOKEN });
import executeCheckCommandReturnsLicenses from './executeCommand.js';
import {getRepos,getRepoLicense} from './getRepos.js';


async function writeCurrentJobs(jobs)
{
    const client = await MongoClient.connect(uri);
    const db = client.db('jobs');
    const settingsCollection = db.collection('currentJobs');
    await settingsCollection.updateOne({ key: 'urls' }, { $set: { value: jobs } }, { upsert: true });
    console.log("Updated current jobs\n")
    client.close();
}

async function getCurrentJobs() 
{
    return new Promise(async (resolve, reject) => {
        const client = await MongoClient.connect(uri);
        const db = client.db('jobs');
        const settingsCollection = db.collection('currentJobs');
        const settings = await settingsCollection.findOne({ key: 'urls' });
        let currentJobs = settings.value;
        if (currentJobs.length == 0)
        {
            currentJobs = await getRepos();
        }
        await writeCurrentJobs(currentJobs);
        client.close();
        resolve(currentJobs);
    });
}

async function addFailedJob(link,jobs) 
{
	const client = await MongoClient.connect(uri);
	const db = client.db('jobs');
	const settingsCollection = db.collection('failedJobs');
	await settingsCollection.insertOne({ link: link }, { upsert: true });
	// console.log("Added project to failedJobs\n")
  jobs.splice(jobs.indexOf(link),1);
  // console.log(tempJobs);
  await writeCurrentJobs(jobs);
	client.close();
}

async function addCompletedJob(link) 
{
	const client = await MongoClient.connect(uri);
	const db = client.db('jobs');
	const settingsCollection = db.collection('completedJobs');
	await settingsCollection.insertOne({ link: link }, { upsert: true });
	console.log("Added project to completedJobs\n")
	client.close();
}

async function updateCurrentJobsIfSkipped(job)
{
    const client = await MongoClient.connect(uri);
    const db = client.db('jobs');
    const settingsCollection = db.collection('currentJobs');
    const settings = await settingsCollection.findOne({ key: 'urls' });
    let currentJobs = settings.value;
    if (currentJobs.includes(job))
    {
        currentJobs.splice(currentJobs.indexOf(job),1);
        await writeCurrentJobs(currentJobs);
    }
    client.close();
}
async function writeToDb(job,result,jobs,repoDetails) 
{
    const client = await MongoClient.connect(uri);
    const db = client.db('jobs');
    const collection = db.collection('newResults');
    // console.log(result);
    const license = await getRepoLicense(job);
    if (license == null)
    {
        license = "Unknown";
    }
    await collection.insertOne({ link: result.link, licenseConflicts: Number(result.numberOfLicenseConflicts), CVEs: result.CVEs, matchedProjects: result.matchedProjects, license: license,forked: repoDetails.forked, forks: repoDetails.forks, watchers: repoDetails.watchers, stars: repoDetails.stars, language: repoDetails.language});
    console.log(`Result written to DB for ${job}: ${result}\n`);
    jobs.splice(jobs.indexOf(job),1);
    // console.log(tempJobs);
    await writeCurrentJobs(jobs);
    client.close();
}

async function checkrepo(link)
{
    // get repo details from github using oktokit
    const org_repo = link.split("/").slice(-2).join("/");
    const response = await octokit.request(`GET /repos/${org_repo}`);
    // console.log(link);
    // console.log(response.data.archived,response.data.disabled,response.data.forked,response.data.forks,response.data.watchers,response.data.stargazers_count,response.data.language);

    return {archived: response.data.archived,disabled: response.data.disabled,forked: response.data.forked,forks: response.data.forks,watchers: response.data.watchers,stars: response.data.stargazers_count,language: response.data.language};
}

async function processJobs() 
{
    const currentJobs = await getCurrentJobs();
    console.log(`Processing ${currentJobs.length} jobs.\n`);
  
    for (const job of currentJobs) 
    {
      try 
      {
        console.log(`Processing job ${job}.`)
        const repoDetails = await checkrepo(job);
        if (repoDetails.archived || repoDetails.disabled)
        {
            console.log(`Job ${job} is archived or disabled. Skipping.\n`);
            await updateCurrentJobsIfSkipped(job);
            continue;
        }
        let result = await executeCheckCommandReturnsLicenses(job);
        console.log(`Number of conflicts for ${job}: ${result.numberOfLicenseConflicts}\n`);
        console.log(`Number of matches for ${job}: ${result.matchedProjects.length}\n`);
        await writeToDb(job, result,currentJobs,repoDetails);
        await addCompletedJob(job);
      } 
      catch (error) 
      {
        console.error(`Error processing job ${job}: ${error}\n`);
        await addFailedJob(job,currentJobs);
      }
    }
}

async function runForever() 
{
    while (true) {
      try 
      {
        await processJobs();
      } 
      catch (error) 
      {
        console.error(`Error in processJobs(): ${error}\n`);
      }
    }
}


// For cleanup and testing
// await writeCurrentJobs([]);

runForever();
