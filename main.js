import { MongoClient, ServerApiVersion } from 'mongodb';
import { config } from "dotenv";
config();

const uri  = process.env.MONGODB_URI;
import executeCheckCommandReturnsLicenses from './executeCommand.js';
import getTopStarredRepos from './getRepos.js';

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
            currentJobs = await getTopStarredRepos();
        }
        await writeCurrentJobs(currentJobs);
        client.close();
        resolve(currentJobs);
    });
}

async function addFailedJob(link) 
{
	const client = await MongoClient.connect(uri);
	const db = client.db('jobs');
	const settingsCollection = db.collection('failedJobs');
	await settingsCollection.insertOne({ link: link }, { upsert: true });
	// console.log("Added project to failedJobs\n")
	client.close();
}

async function writeResultAndCleanup(completedJobs) 
{
    const client = await MongoClient.connect(uri);
    const db = client.db('jobs');
    const settingsCollection = db.collection('currentJobs');
    await settingsCollection.updateOne({ key: 'urls' }, { $set: { value: [] } });
    console.log(`Removed current jobs\n`);
    const settingsCollection2 = db.collection('completedJobs');
    for(const completedJob of completedJobs)
    {
        await settingsCollection2.insertOne({ link: completedJob }, { upsert: true });
    }
    console.log(`Added ${completedJobs.length} jobs to completedJobs\n`);
    client.close();
}

async function writeToDb(job, result) 
{
    const client = await MongoClient.connect(uri);
    const db = client.db('jobs');
    const collection = db.collection('results');
    await collection.insertOne({ link: job, licenseConflicts: result.licenseConflicts, CVEs: result.CVEs, matchedProjects: result.matchedProjects});
    console.log(`Result written to DB for ${job}: ${result}\n`);
    client.close();
}

  
async function processJobs() 
{
    const currentJobs = await getCurrentJobs();
    let completedJobs = [];
    console.log(`Processing ${currentJobs.length} jobs.\n`);
  
    for (const job of currentJobs) 
    {
      try 
      {
        console.log(`Processing job ${job}.`)
        const result = await executeCheckCommandReturnsLicenses(job);
        console.log(`Result for ${job}: ${result}\n`);
        await writeToDb(job, result);
        completedJobs.push(job);
      } 
      catch (error) 
      {
        console.error(`Error processing job ${job}: ${error}\n`);
        await addFailedJob(job);
      }
    }
    await writeResultAndCleanup(completedJobs);
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
