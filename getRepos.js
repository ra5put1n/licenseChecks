// Description: Fetches the top 1000 starred repositories matching a given query
// Example usage: 
// const query = "stars:>0 license:gpl-2.0-or-later OR license:agpl-3.0 OR gpl-3.0 OR gpl-2.0 OR MPL-2.0";
// getTopStarredRepos(query).then((links) => {
//   console.log(links);
// });

import { Octokit, App } from "octokit";
import { config } from "dotenv";
import { MongoClient, ServerApiVersion } from 'mongodb';

config();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const octokit = new Octokit({ auth: GITHUB_TOKEN });
const uri = process.env.MONGODB_URI;

async function getCurrentPage(key = "currentPage") 
{
	const client = await MongoClient.connect(uri);
	const db = client.db('jobs');
	const settingsCollection = db.collection('settings');
	const settings = await settingsCollection.findOne({ key: key });
	const currentPage = settings.value;
	client.close();
	return currentPage;
}

async function updateCurrentPage(newPage) 
{
	const client = await MongoClient.connect(uri);
	const db = client.db('jobs');
	const settingsCollection = db.collection('settings');
	await settingsCollection.updateOne({ key: 'currentPage' }, { $set: { value: newPage } }, { upsert: true });
	console.log("Updated current page to " + newPage + "\n")
	client.close();
}

async function updateCurrentPage2(newPage) 
{
	const client = await MongoClient.connect(uri);
	const db = client.db('jobs');
	const settingsCollection = db.collection('settings');
	await settingsCollection.updateOne({ key: 'currentPage2' }, { $set: { value: newPage } }, { upsert: true });
	console.log("Updated current page2 to " + newPage + "\n")
	client.close();
}

export async function getRepoLicense(link)
{
	const org_repo = link.split("/").slice(-2).join("/");
	const response = await octokit.request(`GET /repos/${org_repo}`);
	if (response.data.license == null)
	{
		return null;
	}
	return response.data.license.name;
}

export async function getRepos() 
{
	const orgs = ["google","facebook","microsoft"];
	const orgs2 = ["alibaba","apache"];
	const sort = "stars";
	const order = "desc";
	const perPage = 5;
	let page1 = await getCurrentPage();
	let page2 = await getCurrentPage("currentPage2");
	let repos = [];

	for(const org of orgs)
	{
		// Fetch up to maxPages pages of results
		const response = await octokit.request(`GET /orgs/${org}/repos`, {
			page: page1,
			per_page: perPage
		});
		for(let i = 0; i < response.data.length; i++)
		{
			repos.push(response.data[i]);
		}
	}

	for(const org of orgs2)
	{
		// Fetch up to maxPages pages of results
		const response = await octokit.request(`GET /orgs/${org}/repos`, {
			page: page2,
			per_page: perPage
		});
		for(let i = 0; i < response.data.length; i++)
		{
			repos.push(response.data[i]);
		}
	}
	// Update the result count and page counter
	page1 += 1;
	page2 += 1;
	await updateCurrentPage(page1);
	await updateCurrentPage2(page2);
	// console.log("Current page: " + page1);
	// console.log("Current page2: " + page2);

	// Return the links of the top 10 starred repositories
	return repos.slice(0, 25).map((repo) => repo.html_url);
}
// For cleanup and testing
// await updateCurrentPage(1);
// let page2 = await getCurrentPage("currentPage");
// console.log(page2);
// let res = await getRepos();
// console.log(res);

// let res = await getRepoLicense("https://github.com/google/googletest");
// console.log(res);